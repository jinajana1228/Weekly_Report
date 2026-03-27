#!/usr/bin/env node
/**
 * scripts/generate-draft-c3.mjs
 *
 * Phase C-3 draft 생성 스크립트.
 * C-2 스코어링 결과를 바탕으로 admin 검토용 draft edition을 생성합니다.
 *
 * 입력:
 *   data/analysis/{week_id}/hard_filter_results.json  (Phase C-1)
 *   data/analysis/{week_id}/scoring_results.json      (Phase C-2)
 *   data/analysis/{week_id}/scoring_summary.json      (Phase C-2)
 *   data/processed/{week_id}/normalized_entities.json (Phase B-3)
 *   data/processed/{week_id}/market_context.json      (Phase B-3)
 *
 * 출력:
 *   data/draft/{week_id}.json
 *
 * ── 금지 사항 ──────────────────────────────────────────────────────────────────
 *   - data/current/current.json 갱신 없음
 *   - data/archive/* 생성/수정 없음
 *   - approval.json 자동 변경 없음
 *   - manifest.json 자동 변경 없음
 *   - publish 수행 없음
 *   - picks 확정 없음 (draft 상태만 생성)
 *
 * 사용법:
 *   node scripts/generate-draft-c3.mjs --week-id 2026-W14
 *   node scripts/generate-draft-c3.mjs --week-id 2026-W14 --dry-run
 *   npm run draft:c3 -- --week-id 2026-W14
 */

import { parseWeekIdArg, isDryRun } from './lib/snapshot.mjs'
import { getCurrentWeekId, parseWeekId, dateToWeekId } from './lib/week-id.mjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname    = path.dirname(fileURLToPath(import.meta.url))
const ROOT              = path.resolve(__dirname, '..')
const PROCESSED_DIR     = path.join(ROOT, 'data/processed')
const ANALYSIS_DIR      = path.join(ROOT, 'data/analysis')
const DRAFT_DIR         = path.join(ROOT, 'data/draft')
const ARCHIVE_DIR       = path.join(ROOT, 'data/archive')
const OVERLAP_HISTORY_PATH = path.join(ROOT, 'admin/overlap_history.json')

// ── 후보군 크기 설정 ──────────────────────────────────────────────────────────
const PRIMARY_COUNT   = 5   // 개별주 picks 수
const SECONDARY_COUNT = 5   // 개별주 secondary 수
// rank 11+ → watchlist (개별주 기준)

// ── ETF 분리 + 역할 기반 선정 설정 ───────────────────────────────────────────
const MAX_SECTOR_PER_CODE = 2   // 동일 섹터 최대 허용 수

/**
 * 역할 슬롯 (합계 = PRIMARY_COUNT).
 * high_quality: 영업이익률 ≥10%(Q≥32) + 거래대금 ≥200억(L≥20)
 * momentum:     52주 포지션 ≥60%(M≥25) + 거래대금 ≥500억(L≥25) + 패널티 없음
 * defensive:    거래대금 ≥1,000억(L≥30) + quality 중립 이상(Q≥20) + 패널티 없음
 */
const ROLE_SLOTS = { high_quality: 2, momentum: 2, defensive: 1 }

// ── 쿨다운 설정 ───────────────────────────────────────────────────────────────
// 직전 1주 추천 종목은 이번 주 primary picks에서 제외.
// 2주 전 이상은 다시 허용.
const COOLDOWN_WEEKS = 1   // 제외 기간: 직전 N주

// ── 주차 계산 유틸 ────────────────────────────────────────────────────────────

/**
 * week_id의 N주 전/후 week_id를 반환합니다.
 * ISO 8601 주차 경계(연말/연초)를 올바르게 처리합니다.
 *
 * @param {string} weekId       예: "2026-W14"
 * @param {number} offsetWeeks  음수 = 과거, 양수 = 미래
 * @returns {string}            예: "2026-W13"
 */
function offsetWeekId(weekId, offsetWeeks) {
  const { year, week } = parseWeekId(weekId)
  // Jan 4 of year Y is always in ISO week 1 of year Y (ISO 8601 규정)
  const jan4     = new Date(Date.UTC(year, 0, 4))
  const dow      = jan4.getUTCDay() || 7               // 1(Mon)–7(Sun)
  const week1Mon = new Date(jan4.getTime() - (dow - 1) * 86400000)
  const targetMon = new Date(week1Mon.getTime() + (week - 1) * 7 * 86400000)
  const offsetDate = new Date(targetMon.getTime() + offsetWeeks * 7 * 86400000)
  return dateToWeekId(offsetDate)
}

// ── 쿨다운 유틸 ───────────────────────────────────────────────────────────────

/**
 * 직전 주 추천 ticker 집합(blocklist)을 로드합니다.
 *
 * 조회 우선순위:
 *   1. admin/overlap_history.json — recent_editions[].week_id 기준
 *      (publish.mjs Phase F가 발행 후 자동 갱신하는 공식 이력)
 *   2. data/archive/{prevWeekId}.json — picks[].ticker 기준
 *      (overlap_history 미갱신 상황의 fallback)
 *   3. 이력 없음 → 빈 집합 반환 (쿨다운 미적용, admin_notes에 명시)
 *
 * @param {string} targetWeekId  draft 생성 대상 week_id
 * @returns {{
 *   blocked:     Set<string>,
 *   prevWeekId:  string,
 *   source:      'overlap_history'|'archive'|'none',
 *   found:       boolean,
 *   blockedList: string[],
 * }}
 */
function loadCooldownBlocklist(targetWeekId) {
  const prevWeekId = offsetWeekId(targetWeekId, -COOLDOWN_WEEKS)

  // 1순위: overlap_history
  const history = readJson(OVERLAP_HISTORY_PATH)
  if (history?.recent_editions) {
    const prevEdition = history.recent_editions.find(e => e.week_id === prevWeekId)
    if (prevEdition?.main_picks?.length > 0) {
      return {
        blocked:     new Set(prevEdition.main_picks),
        prevWeekId,
        source:      'overlap_history',
        found:       true,
        blockedList: prevEdition.main_picks,
      }
    }
  }

  // 2순위: archive
  const archive = readJson(path.join(ARCHIVE_DIR, `${prevWeekId}.json`))
  if (archive?.picks?.length > 0) {
    const tickers = archive.picks.map(p => p.ticker)
    return {
      blocked:     new Set(tickers),
      prevWeekId,
      source:      'archive',
      found:       true,
      blockedList: tickers,
    }
  }

  // 이력 없음
  return {
    blocked:     new Set(),
    prevWeekId,
    source:      'none',
    found:       false,
    blockedList: [],
  }
}

/**
 * 쿨다운 필터 적용: blocked 집합에 포함된 ticker를 후보풀에서 제거합니다.
 * 제거된 종목은 watchlist에서 계속 확인할 수 있습니다.
 *
 * @param {Array}       stocks   rank 정렬된 eligible 개별주 목록
 * @param {Set<string>} blocked  제외할 ticker 집합
 * @returns {{ allowed: Array, removed: Array }}
 */
function applyCooldownFilter(stocks, blocked) {
  if (blocked.size === 0) return { allowed: stocks, removed: [] }
  const allowed = []
  const removed = []
  for (const s of stocks) {
    if (blocked.has(s.ticker)) {
      removed.push(s)
    } else {
      allowed.push(s)
    }
  }
  return { allowed, removed }
}

// ── ETF 분리 유틸 ─────────────────────────────────────────────────────────────

function isEtf(r) {
  return r.asset_type === 'etf'
}

/** eligible 목록을 개별주/ETF로 분리. */
function separateByAssetType(eligible) {
  return {
    stocks: eligible.filter(r => !isEtf(r)),
    etfs:   eligible.filter(r =>  isEtf(r)),
  }
}

/**
 * 섹터 중복 제어: rank 순으로 순회하며 동일 섹터가 maxPerSector 초과 시 제외.
 */
function applySectorConstraint(stocks, maxPerSector) {
  const count  = {}
  const result = []
  for (const s of stocks) {
    const sec = s.sector_code ?? '__unknown'
    const c   = count[sec] ?? 0
    if (c < maxPerSector) {
      count[sec] = c + 1
      result.push(s)
    }
  }
  return result
}

/**
 * 역할 적격성: 해당 종목이 충족하는 역할 목록(우선순위 순).
 */
function qualifyingRoles(scored) {
  const cs = scored.component_scores
  const q  = cs.quality_score
  const l  = cs.liquidity_score
  const m  = cs.market_position_score
  const p  = cs.penalty_score
  const roles = []
  if (q >= 32 && l >= 20)            roles.push('high_quality')
  if (m >= 25 && l >= 25 && p === 0) roles.push('momentum')
  if (l >= 30 && q >= 20 && p === 0) roles.push('defensive')
  return roles
}

/**
 * 역할 기반 5개 선정.
 * - rank 순으로 순회하며 ROLE_SLOTS 슬롯을 채움 (우선순위: high_quality → momentum → defensive)
 * - 명시 슬롯에 배정 불가한 종목도 슬롯 잔여분이 있으면 fallback으로 배정 (총 5개 보장)
 * @returns Array of { scored, role }
 */
function selectRoleBasedPicks(stockPool, totalCount) {
  const remaining = { ...ROLE_SLOTS }
  const picked    = []

  for (const s of stockPool) {
    if (picked.length >= totalCount) break

    const eligible = qualifyingRoles(s)

    // 우선순위 순으로 빈 슬롯에 배정
    let assignedRole = null
    for (const role of ['high_quality', 'momentum', 'defensive']) {
      if (eligible.includes(role) && remaining[role] > 0) {
        assignedRole = role
        remaining[role]--
        break
      }
    }

    // 명시 슬롯 미배정 → 남은 슬롯 아무 데나 fallback 배정 (rank 우선 보장)
    if (assignedRole == null) {
      for (const role of ['defensive', 'momentum', 'high_quality']) {
        if (remaining[role] > 0) {
          assignedRole = role + '_fallback'
          remaining[role]--
          break
        }
      }
    }

    if (assignedRole != null) {
      picked.push({ scored: s, role: assignedRole })
    }
  }

  return picked
}

/** 역할 코드 → 한국어 레이블 */
function roleLabel(role) {
  const map = {
    'high_quality':          '고품질형',
    'momentum':              '모멘텀형',
    'defensive':             '방어형',
    'high_quality_fallback': '고품질형(rank보완)',
    'momentum_fallback':     '모멘텀형(rank보완)',
    'defensive_fallback':    '방어형(rank보완)',
  }
  return map[role] ?? role
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function saveDraft(weekId, payload, dryRun) {
  if (dryRun) {
    console.log('\n[dry-run] 저장하지 않음 — draft 미리보기:')
    console.log(JSON.stringify(payload, null, 2).slice(0, 4000))
    console.log('\n  ... (dry-run: 전체 출력 생략)')
    return
  }
  fs.mkdirSync(DRAFT_DIR, { recursive: true })
  const filePath = path.join(DRAFT_DIR, `${weekId}.json`)
  const content  = JSON.stringify(payload, null, 2)
  fs.writeFileSync(filePath, content, 'utf-8')
  const sizeKb = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1)
  console.log(`  [저장] ${path.relative(ROOT, filePath)} (${sizeKb} KB)`)
}

// ── 시장 컨텍스트 요약 ─────────────────────────────────────────────────────────

function buildMarketContextSummary(mc) {
  if (!mc) return { _note: 'market_context.json 없음' }
  return {
    kospi:             mc.kr_indices?.kospi  ?? null,
    kosdaq:            mc.kr_indices?.kosdaq ?? null,
    usd_krw:           mc.kr_macro?.usd_krw?.value   ?? null,
    bok_rate:          mc.kr_macro?.bok_rate?.value   ?? null,
    us_10y_treasury:   mc.us_macro?.us_10y_treasury?.value ?? null,
    fed_funds_rate:    mc.us_macro?.fed_funds_rate?.value  ?? null,
    vix:               mc.global_equities?.vix?.price ?? null,
    sp500_change_pct:  mc.global_equities?.sp500?.change_pct ?? null,
    as_of:             mc.kr_indices?.kospi?.as_of ?? null,
    _note: '참고용 — Hard Filter 판단에 사용 불가. 운용 환경 맥락 이해 목적.',
  }
}

// ── 후보 항목 구성 ─────────────────────────────────────────────────────────────

/**
 * 점수 프로비넌스에서 price_snapshot을 추출합니다.
 * normalized_entities의 price 필드를 보조로 참조합니다.
 */
function buildPriceSnapshot(scored, entity) {
  const liq = scored.score_provenance?.liquidity_score
  const mp  = scored.score_provenance?.market_position_score

  return {
    close:               liq?.close   ?? entity?.price?.close ?? null,
    week52_high:         mp?.week52_high ?? entity?.price?.week52_high ?? null,
    week52_low:          mp?.week52_low  ?? entity?.price?.week52_low  ?? null,
    week52_position_pct: mp?.week52_position_pct ?? null,
    as_of:               entity?.price?.as_of ?? null,
    source:              'krx_price',
  }
}

/**
 * 영업이익률 요약 (주식 전용). ETF 또는 미수집 시 null.
 */
function buildQualityDetail(scored) {
  const q = scored.score_provenance?.quality_score
  if (!q || q.status !== 'scored') return null
  return {
    op_margin_pct: q.op_margin_pct ?? null,
    bsns_year:     q.bsns_year     ?? null,
    source:        'dart_financials',
  }
}

/**
 * buildCandidateEntry with optional role annotation.
 */
function buildCandidateEntryWithRole(scored, entityMap, role) {
  const entry = buildCandidateEntry(scored, entityMap)
  if (role != null) {
    entry.role      = role
    entry.role_label = roleLabel(role)
  }
  return entry
}

/**
 * inclusion_reason: 이 종목이 왜 이 등급에 포함됐는지 사람이 읽을 수 있는 요약.
 */
function buildInclusionReason(scored) {
  const rank  = scored.final_rank
  const score = scored.total_score
  const cs    = scored.component_scores
  const q     = scored.score_provenance?.quality_score
  const mp    = scored.score_provenance?.market_position_score

  const parts = [`C-2 ${rank}위(${score}점)`]

  // quality 맥락
  if (q?.status === 'scored' && q.op_margin_pct != null) {
    parts.push(`영업이익률 ${q.op_margin_pct}%(${q.bsns_year ?? '연간'})`)
  } else if (scored.asset_type === 'etf') {
    parts.push('ETF — 영업이익 미해당')
  } else if (cs.quality_score === 5) {
    parts.push('영업적자 — quality 최저(5점)')
  } else if (cs.quality_score === 20) {
    parts.push('quality 중립값 적용 (영업이익 미수집)')
  }

  // market_position 맥락
  if (mp?.status === 'scored' && mp.week52_position_pct != null) {
    const pos = mp.week52_position_pct
    if (pos >= 80)      parts.push(`52주 포지션 ${pos}% — 강한 상승 모멘텀`)
    else if (pos >= 60) parts.push(`52주 포지션 ${pos}% — 양호한 모멘텀`)
    else if (pos >= 40) parts.push(`52주 포지션 ${pos}% — 중간 포지션`)
    else                parts.push(`52주 포지션 ${pos}% — 52주 저점 근처`)
  }

  // soft_flag 주석
  if (scored.hard_filter_decision === 'soft_flag' && scored.triggered_rules?.length > 0) {
    const pen = Math.abs(cs.penalty_score)
    parts.push(`Soft Flag 감점 -${pen}점 (${scored.triggered_rules.join(', ')}) — review_required`)
  }

  return parts.join('. ') + '.'
}

/**
 * caution_flags: admin이 주의해야 할 항목 목록.
 */
function buildCautionFlags(scored) {
  const flags = []

  // HF_OVERHEATED 미평가 (전체 적용)
  if (scored.unavailable_inputs?.includes('HF_OVERHEATED')) {
    flags.push('HF_OVERHEATED 미평가 — 단기 급등 과열 여부 미반영. 가격 이력(5일/20일) 확보 후 재평가 필요.')
  }

  // Soft Flag별 상세
  for (const rule of (scored.triggered_rules ?? [])) {
    if (rule === 'HF_NEGATIVE_EARNINGS') {
      flags.push('HF_NEGATIVE_EARNINGS Soft Flag — 영업적자. 일시적 vs 구조적 원인 확인 필요.')
    } else if (rule === 'HF_LOW_LIQUIDITY') {
      flags.push('HF_LOW_LIQUIDITY Soft Flag — 저유동성 (1일 프록시 기준). 20거래일 평균 거래대금 수동 확인 권장.')
    } else if (rule === 'HF_LOW_PRICE') {
      flags.push('HF_LOW_PRICE Soft Flag — 동전주 해당. 소액 투자자 접근성 검토 필요.')
    } else if (rule === 'HF_AUDIT_ISSUE') {
      flags.push('HF_AUDIT_ISSUE Soft Flag — 감사의견 비확인. 원문 확인 필요.')
    }
  }

  // quality 중립값 (주식이면서 미수집)
  const cs = scored.component_scores
  if (scored.asset_type === 'stock' && cs.quality_score === 20 &&
      scored.score_provenance?.quality_score?.status !== 'scored') {
    flags.push('quality_score 중립값(20) 적용 — 영업이익 데이터 미수집. 수동 확인 권장.')
  }

  return flags
}

/**
 * 후보 항목 1건 구성.
 */
function buildCandidateEntry(scored, entityMap) {
  const entity = entityMap.get(scored.ticker) ?? null
  return {
    rank:                 scored.final_rank,
    ticker:               scored.ticker,
    name:                 scored.name,
    asset_type:           scored.asset_type,
    market:               scored.market,
    sector_code:          scored.sector_code,
    total_score:          scored.total_score,
    final_rank:           scored.final_rank,
    hard_filter_decision: scored.hard_filter_decision,
    component_scores:     scored.component_scores,
    triggered_rules:      scored.triggered_rules,
    unavailable_inputs:   scored.unavailable_inputs,
    score_notes:          scored.score_notes,
    price_snapshot:       buildPriceSnapshot(scored, entity),
    quality_detail:       buildQualityDetail(scored),
    inclusion_reason:     buildInclusionReason(scored),
    review_required:      scored.hard_filter_decision === 'soft_flag',
    caution_flags:        buildCautionFlags(scored),
  }
}

/**
 * 제외 항목 1건 구성 (hard_block 전용).
 */
function buildExcludedEntry(scored) {
  return {
    ticker:            scored.ticker,
    name:              scored.name,
    asset_type:        scored.asset_type,
    sector_code:       scored.sector_code,
    hard_filter_decision: scored.hard_filter_decision,
    exclusion_reason:  scored.exclusion_reason,
    triggered_rules:   scored.triggered_rules,
    total_score:       scored.total_score,  // null for hard_block
    final_rank:        scored.final_rank,   // null for hard_block
  }
}

// ── admin_notes 생성 ───────────────────────────────────────────────────────────

function buildAdminNotes(allScored, stockPickCandidates, etfCount, cooldownInfo) {
  const notes = []

  // ETF 분리 명시
  notes.push(
    `[구조] ETF ${etfCount}개는 stock_picks에서 제외되어 etf_reference로 분리됩니다. ` +
    `개별주 ${stockPickCandidates.length}개만 최종 picks 후보입니다.`
  )

  // 쿨다운 적용 결과
  if (cooldownInfo.found) {
    const blockedStr = cooldownInfo.blockedList.join(', ')
    const removedStr = cooldownInfo.removed.length > 0
      ? cooldownInfo.removed.map(s => `${s.ticker} ${s.name}`).join(', ')
      : '없음 (후보풀과 겹치는 종목 없음)'
    notes.push(
      `[쿨다운] 직전 주(${cooldownInfo.prevWeekId}) 추천 이력 적용 (출처: ${cooldownInfo.source}). ` +
      `이력: [${blockedStr}]. 이번 주 picks 후보에서 제외된 종목: ${removedStr}. ` +
      `제외 종목은 watchlist에서 확인 가능. 2주 후부터 재추천 허용.`
    )
  } else {
    notes.push(
      `[쿨다운] 직전 주(${cooldownInfo.prevWeekId}) 추천 이력 없음 — 쿨다운 미적용. ` +
      `admin/overlap_history.json 및 data/archive/${cooldownInfo.prevWeekId}.json 모두 조회 실패.`
    )
  }

  // Soft Flag 종목 검토 요청
  const sfEntries = allScored.filter(e => e.hard_filter_decision === 'soft_flag')
  if (sfEntries.length > 0) {
    const sfList = sfEntries.map(e => `${e.ticker} ${e.name}(${e.triggered_rules.join(',')})`).join(' / ')
    notes.push(`[필수] Soft Flag 종목 C-1 admin 검토 완료 여부 확인: ${sfList}. 미검토 시 picks 포함 보류 권장.`)
  }

  // HF_OVERHEATED 전체 미평가 경고
  const overheatedCount = allScored.filter(e => e.unavailable_inputs?.includes('HF_OVERHEATED')).length
  if (overheatedCount > 0) {
    notes.push(`[주의] 전체 ${overheatedCount}개 종목 HF_OVERHEATED 미평가. 단기 급등 과열 여부 미반영 상태. 가격 이력(5일/20일) 수집 후 재평가 권장.`)
  }

  // stock_picks 내 동일 섹터 집중 경고 (max 2 적용 후에도 2개인 경우 안내)
  const sectorCount = {}
  for (const c of stockPickCandidates) {
    if (c.sector_code) sectorCount[c.sector_code] = (sectorCount[c.sector_code] ?? 0) + 1
  }
  const concentrated = Object.entries(sectorCount).filter(([, cnt]) => cnt >= 2)
  if (concentrated.length > 0) {
    const detail = concentrated.map(([sec, cnt]) => `${sec}(${cnt}개)`).join(', ')
    notes.push(`[검토] stock_picks 내 동일 섹터 ${MAX_SECTOR_PER_CODE}개 포함: ${detail}. 섹터 분산 여부 admin 검토 권장.`)
  }

  // quality 중립값 적용 종목 (주식)
  const neutralQuality = allScored.filter(e =>
    e.asset_type === 'stock' &&
    e.component_scores?.quality_score === 20 &&
    e.eligible_for_next_phase &&
    e.score_provenance?.quality_score?.status !== 'scored'
  )
  if (neutralQuality.length > 0) {
    const list = neutralQuality.map(e => `${e.ticker} ${e.name}`).join(', ')
    notes.push(`[데이터] quality_score 중립값(20) 적용 주식: ${list}. 실제 수익성 수동 확인 권장.`)
  }

  // draft 상태 명시
  notes.push('[필수] 이 파일은 draft 상태입니다. data/current/current.json 갱신은 admin 승인 후 별도 수행. publish 전까지 공개 없음.')

  return notes
}

// ── data_quality_notes ────────────────────────────────────────────────────────

function buildDataQualityNotes(scoringSummary) {
  return [
    ...(scoringSummary?._data_quality_notes ?? []),
    'C-3 draft는 C-2 scoring_results.json을 그대로 상속합니다. 점수 이의는 C-2 재실행 후 C-3 재생성 필요.',
  ]
}

// ── 요약 ──────────────────────────────────────────────────────────────────────

function buildSummary(stockPickCandidates, stockSecondary, etfReference, watchlist, excluded, cooldownInfo) {
  const allEligible    = [...stockPickCandidates, ...stockSecondary, ...etfReference, ...watchlist]
  const sfInCandidates = allEligible.filter(c => c.hard_filter_decision === 'soft_flag')
  const reviewRequired = allEligible.filter(c => c.review_required)

  const roleBreakdown = {}
  for (const c of stockPickCandidates) {
    const r = c.role ?? 'unknown'
    roleBreakdown[r] = (roleBreakdown[r] ?? 0) + 1
  }

  return {
    stock_pick_count:        stockPickCandidates.length,
    stock_secondary_count:   stockSecondary.length,
    etf_reference_count:     etfReference.length,
    watchlist_count:         watchlist.length,
    excluded_hard_block:     excluded.length,
    soft_flag_in_candidates: sfInCandidates.length,
    review_required_count:   reviewRequired.length,
    role_breakdown:          roleBreakdown,
    top1_ticker:             stockPickCandidates[0]?.ticker ?? null,
    top1_name:               stockPickCandidates[0]?.name   ?? null,
    top1_score:              stockPickCandidates[0]?.total_score ?? null,
    // 쿨다운 적용 결과
    cooldown_prev_week_id:   cooldownInfo?.prevWeekId ?? null,
    cooldown_blocked_count:  cooldownInfo?.removed?.length ?? 0,
    cooldown_source:         cooldownInfo?.source ?? 'none',
    // backward-compat aliases (approve-commit.mjs, publish.mjs)
    primary_count:           stockPickCandidates.length,
    secondary_count:         stockSecondary.length,
  }
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

async function main() {
  const weekId = parseWeekIdArg() ?? getCurrentWeekId()
  const dryRun = isDryRun()

  console.log('\n📋 Phase C-3 Draft 생성 시작')
  console.log(`  week_id  : ${weekId}`)
  console.log(`  dry-run  : ${dryRun}`)
  console.log(`  입력[1]  : data/analysis/${weekId}/hard_filter_results.json`)
  console.log(`  입력[2]  : data/analysis/${weekId}/scoring_results.json`)
  console.log(`  입력[3]  : data/analysis/${weekId}/scoring_summary.json`)
  console.log(`  입력[4]  : data/processed/${weekId}/normalized_entities.json`)
  console.log(`  입력[5]  : data/processed/${weekId}/market_context.json`)
  console.log(`  출력     : data/draft/${weekId}.json\n`)

  // ── 입력 로드 ──────────────────────────────────────────────────────────────
  const hfData = readJson(path.join(ANALYSIS_DIR, weekId, 'hard_filter_results.json'))
  if (!hfData) {
    console.error(`❌ hard_filter_results.json 없음: data/analysis/${weekId}/`)
    console.error(`   먼저 Phase C-1을 실행하세요: npm run evaluate:hf -- --week-id ${weekId}`)
    process.exit(1)
  }

  const scoringData = readJson(path.join(ANALYSIS_DIR, weekId, 'scoring_results.json'))
  if (!scoringData) {
    console.error(`❌ scoring_results.json 없음: data/analysis/${weekId}/`)
    console.error(`   먼저 Phase C-2를 실행하세요: npm run score:c2 -- --week-id ${weekId}`)
    process.exit(1)
  }

  const scoringSummary = readJson(path.join(ANALYSIS_DIR, weekId, 'scoring_summary.json'))
  const entityData     = readJson(path.join(PROCESSED_DIR, weekId, 'normalized_entities.json'))
  const marketCtx      = readJson(path.join(PROCESSED_DIR, weekId, 'market_context.json'))

  if (!entityData) {
    console.error(`❌ normalized_entities.json 없음: data/processed/${weekId}/`)
    process.exit(1)
  }

  console.log(`  로드 완료: 스코어링 ${scoringData.total}건, 엔티티 ${entityData.record_count}건`)

  // ── 조회 맵 ────────────────────────────────────────────────────────────────
  const entityMap = new Map(entityData.records.map(e => [e.ticker, e]))

  // ── 종목 분류 ──────────────────────────────────────────────────────────────
  const allScored = scoringData.results

  // eligible 종목: final_rank 기준 정렬
  const eligible = allScored
    .filter(r => r.eligible_for_next_phase && r.final_rank !== null)
    .sort((a, b) => a.final_rank - b.final_rank)

  // hard_block 제외 목록
  const excluded = allScored.filter(r => !r.eligible_for_next_phase)

  // ── ETF / 개별주 분리 ───────────────────────────────────────────────────────
  const { stocks: eligibleStocks, etfs: eligibleEtfs } = separateByAssetType(eligible)

  // 섹터 중복 제어 (max MAX_SECTOR_PER_CODE / 섹터)
  const sectorConstrained = applySectorConstraint(eligibleStocks, MAX_SECTOR_PER_CODE)

  // ── 쿨다운 제외 (직전 주 추천 종목 이번 주 picks 후보에서 제외) ──────────────
  const cooldown = loadCooldownBlocklist(weekId)
  const { allowed: cooldownFiltered, removed: cooldownRemoved } =
    applyCooldownFilter(sectorConstrained, cooldown.blocked)

  // cooldownInfo: admin_notes / summary 전달용
  const cooldownInfo = { ...cooldown, removed: cooldownRemoved }

  if (cooldown.found) {
    const removedNames = cooldownRemoved.map(s => `${s.ticker} ${s.name}`).join(', ')
    console.log(`  [쿨다운] 직전 주(${cooldown.prevWeekId}) 이력 적용 (출처: ${cooldown.source})`)
    console.log(`    blocklist : [${cooldown.blockedList.join(', ')}]`)
    console.log(`    제외 종목 : ${removedNames || '없음 (후보풀과 겹치는 종목 없음)'}`)
  } else {
    console.log(`  [쿨다운] ${cooldown.prevWeekId} 이력 없음 — 쿨다운 미적용`)
  }

  // 역할 기반 5개 선정 (쿨다운 적용 풀 사용)
  const roleResults = selectRoleBasedPicks(cooldownFiltered, PRIMARY_COUNT)
  const selectedSet = new Set(roleResults.map(r => r.scored.ticker))

  // stock_picks: 역할 배정된 5종목
  const stockPicksScored = roleResults

  // stock_secondary: 쿨다운 허용 풀에서 picks 제외 후 SECONDARY_COUNT개
  const stockSecondaryScored = cooldownFiltered
    .filter(s => !selectedSet.has(s.ticker))
    .slice(0, SECONDARY_COUNT)

  // watchlist: picks/secondary 제외 나머지 개별주 (쿨다운 제외 종목 포함 — admin에서 확인 가능)
  const selectedOrSecondarySet = new Set([
    ...selectedSet,
    ...stockSecondaryScored.map(s => s.ticker),
  ])
  const watchlistScored = eligibleStocks.filter(s => !selectedOrSecondarySet.has(s.ticker))

  // ── 후보 항목 구성 ──────────────────────────────────────────────────────────
  const stockPickCandidates = stockPicksScored.map(({ scored, role }) =>
    buildCandidateEntryWithRole(scored, entityMap, role)
  )
  const stockSecondary = stockSecondaryScored.map(r => buildCandidateEntry(r, entityMap))
  const etfReference   = eligibleEtfs.map(r => buildCandidateEntry(r, entityMap))
  const watchlistEntries = watchlistScored.map(r => buildCandidateEntry(r, entityMap))
  const excludedEntries  = excluded.map(r => buildExcludedEntry(r))

  // backward-compat: approve-commit.mjs는 candidate_picks.primary를 읽음
  const primaryCandidates   = stockPickCandidates
  const secondaryCandidates = stockSecondary

  // ── 시장 컨텍스트 ──────────────────────────────────────────────────────────
  const marketContextSummary = buildMarketContextSummary(marketCtx)

  // ── admin_notes / data_quality_notes ──────────────────────────────────────
  const adminNotes       = buildAdminNotes(allScored, stockPickCandidates, eligibleEtfs.length, cooldownInfo)
  const dataQualityNotes = buildDataQualityNotes(scoringSummary)

  // ── summary ────────────────────────────────────────────────────────────────
  const summary = buildSummary(
    stockPickCandidates, stockSecondary, etfReference, watchlistEntries, excludedEntries, cooldownInfo
  )

  // top-level picks (publish.mjs / overlap_history 호환용: ticker + name 최소 필드)
  const topLevelPicks = stockPickCandidates.map(c => ({
    ticker:     c.ticker,
    name:       c.name,
    asset_type: c.asset_type,
    sector_code: c.sector_code,
    role:       c.role,
    role_label: c.role_label,
    total_score: c.total_score,
    final_rank: c.final_rank,
  }))

  // ── draft 구성 ─────────────────────────────────────────────────────────────
  const draft = {
    week_id:        weekId,
    status:         'draft',
    generated_at:   new Date().toISOString(),
    schema_version: '1.1',
    source_refs: {
      hard_filter_results: `data/analysis/${weekId}/hard_filter_results.json`,
      scoring_results:     `data/analysis/${weekId}/scoring_results.json`,
      scoring_summary:     `data/analysis/${weekId}/scoring_summary.json`,
      normalized_entities: `data/processed/${weekId}/normalized_entities.json`,
      market_context:      `data/processed/${weekId}/market_context.json`,
    },
    summary,
    // top-level picks: publish.mjs / approve-commit.mjs overlap history 추적용
    picks: topLevelPicks,
    market_context_summary: marketContextSummary,
    candidate_picks: {
      // primary = stock_picks (backward compat: approve-commit.mjs reads .primary)
      primary:        stockPickCandidates,
      stock_picks:    stockPickCandidates,
      secondary:      stockSecondary,
      etf_reference:  etfReference,
    },
    watchlist: watchlistEntries,
    excluded_or_caution: excludedEntries,
    admin_notes:       adminNotes,
    data_quality_notes: dataQualityNotes,
  }

  // ── 저장 ───────────────────────────────────────────────────────────────────
  saveDraft(weekId, draft, dryRun)

  // ── 콘솔 요약 ─────────────────────────────────────────────────────────────
  console.log(`\n✅ Phase C-3 Draft 생성 완료`)
  console.log(`   status           : ${draft.status}`)
  console.log(`   stock_picks      : ${summary.stock_pick_count}건 (개별주 역할 기반)`)
  console.log(`   stock_secondary  : ${summary.stock_secondary_count}건`)
  console.log(`   etf_reference    : ${summary.etf_reference_count}건 (분리)`)
  console.log(`   watchlist        : ${summary.watchlist_count}건`)
  console.log(`   Hard Block 제외  : ${summary.excluded_hard_block}건`)
  console.log(`   Soft Flag (감점) : ${summary.soft_flag_in_candidates}건 (review_required)`)
  console.log()

  console.log('   ── stock_picks (역할 기반 선정) ──────────────────────────')
  stockPickCandidates.forEach(c => {
    const sf   = c.hard_filter_decision === 'soft_flag' ? ' [SF]' : ''
    const role = (c.role_label ?? '').padEnd(12)
    console.log(
      `   #${String(c.final_rank).padStart(2)}  ${c.ticker}  ${c.name.slice(0, 10).padEnd(10)}` +
      `  ${String(c.total_score).padStart(3)}점  [${role}]${sf}`
    )
  })

  console.log()
  console.log('   ── stock_secondary ───────────────────────────────────────')
  stockSecondary.forEach(c => {
    const sf  = c.hard_filter_decision === 'soft_flag' ? ' [SF]' : ''
    console.log(
      `   #${String(c.final_rank).padStart(2)}  ${c.ticker}  ${c.name.slice(0, 10).padEnd(10)}` +
      `  ${String(c.total_score).padStart(3)}점${sf}`
    )
  })

  console.log()
  console.log('   ── etf_reference (분리) ──────────────────────────────────')
  etfReference.forEach(c => {
    console.log(
      `   #${String(c.final_rank).padStart(2)}  ${c.ticker}  ${c.name.slice(0, 14).padEnd(14)}` +
      `  ${String(c.total_score).padStart(3)}점  ETF`
    )
  })

  console.log()
  console.log('   ── admin_notes ───────────────────────────────────────────')
  adminNotes.forEach((n, i) => console.log(`   ${i + 1}. ${n.slice(0, 90)}${n.length > 90 ? '...' : ''}`))

  if (!dryRun) {
    console.log()
    console.log(`   산출물: data/draft/${weekId}.json`)
  }
  console.log()
  console.log('   ※ draft 상태 — admin 승인 후 별도 publish 수행 필요')
  console.log('   ※ data/current, data/archive 변경 없음')
}

main().catch(err => {
  console.error('\n💥 치명적 오류:', err.message)
  process.exit(1)
})

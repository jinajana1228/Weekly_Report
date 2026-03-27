#!/usr/bin/env node
/**
 * scripts/approve-commit.mjs
 *
 * Phase C-5 승인+반영 통합 스크립트.
 *
 * ── 이 스크립트의 담당 범위 ────────────────────────────────────────────────────
 * - approved 결정 시:
 *     1) approval.json 갱신
 *     2) data/current/current.json 갱신 (draft → current 변환 포함)
 *     3) data/archive/{old_week_id}.json 생성 (기존 current가 다른 week면)
 *     4) data/archive/details/* 복사 (기존 current/details가 다른 week면)
 *     5) data/manifests/manifest.json 갱신
 *   모두 검증 통과 후 한 번에 기록 (조건 미충족 시 어떤 파일도 수정 안 함)
 *
 * - rejected / on_hold / pending 결정 시:
 *     approval.json만 갱신. current/archive/manifest 비접촉.
 *
 * ── 이 스크립트가 담당하지 않는 범위 ──────────────────────────────────────────
 *   - current/details 생성  → npm run detail:generate
 *   - overlap_history 갱신  → npm run publish
 *   - approval.json 초기화  → npm run publish
 *   - draft 파일 정리       → npm run publish
 *   - git commit / push     → npm run publish  (또는 수동)
 *
 * ── 전체 발행 순서 ─────────────────────────────────────────────────────────────
 *   1. npm run draft:c3 -- --week-id WEEK_ID
 *   2. (admin 검토)
 *   3. npm run approval:commit -- --decision approved --reviewed-by NAME \
 *        --acknowledge-data-quality --week-id WEEK_ID
 *   4. npm run detail:generate -- --week-id WEEK_ID
 *   5. npm run publish -- --week-id WEEK_ID --actor NAME
 *   6. git push  (수동)
 *
 * ── 승인 게이트 (approved 전용) ────────────────────────────────────────────────
 *   □ week_id 일치 (--week-id == approval.json.draft_week_id)
 *   □ data/draft/{week_id}.json 존재
 *   □ reviewed_by 입력
 *   □ --acknowledge-data-quality 플래그
 *   □ blocking_issues 없음
 *
 * ── 절대 금지 ──────────────────────────────────────────────────────────────────
 *   - draft 파일 삭제
 *   - approval.json 필드 파괴적 변경
 *   - public/admin UI 수정
 *   - 뉴스 자동화
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname     = path.dirname(fileURLToPath(import.meta.url))
const ROOT          = path.resolve(__dirname, '..')
const APPROVAL_PATH      = path.join(ROOT, 'data/manifests/approval.json')
const MANIFEST_PATH      = path.join(ROOT, 'data/manifests/manifest.json')
const CURRENT_PATH       = path.join(ROOT, 'data/current/current.json')
const CURRENT_DETAILS    = path.join(ROOT, 'data/current/details')
const DRAFT_DIR          = path.join(ROOT, 'data/draft')
const ARCHIVE_DIR        = path.join(ROOT, 'data/archive')
const ARCHIVE_DETAILS    = path.join(ROOT, 'data/archive/details')

const ALLOWED_DECISIONS = ['approved', 'rejected', 'on_hold', 'pending']

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')) }
  catch { return null }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf-8')
}

function nowIso() { return new Date().toISOString() }

function draftPath(weekId) { return path.join(DRAFT_DIR, `${weekId}.json`) }
function draftExists(weekId) { return weekId ? fs.existsSync(draftPath(weekId)) : false }
function archivePath(weekId) { return path.join(ARCHIVE_DIR, `${weekId}.json`) }

function parseBlockingIssues(raw) {
  if (!raw || raw.trim() === '' || raw === 'none') return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

/** "20260326" → "2026-03-26" */
function formatAsOf(yyyymmdd) {
  if (!yyyymmdd || String(yyyymmdd).length !== 8) return String(yyyymmdd ?? '')
  const s = String(yyyymmdd)
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
}

// ── CLI 파싱 ───────────────────────────────────────────────────────────────────

function parseArgs() {
  const raw = process.argv.slice(2)
  const r = {
    decision: null, reviewedBy: null, note: null, weekId: null,
    blockingIssues: null, acknowledgeDataQuality: false,
    newsSignalReviewStatus: null, dryRun: false, json: false,
  }
  for (let i = 0; i < raw.length; i++) {
    switch (raw[i]) {
      case '--decision':                r.decision = raw[++i]; break
      case '--reviewed-by':             r.reviewedBy = raw[++i]; break
      case '--note':                    r.note = raw[++i]; break
      case '--week-id':                 r.weekId = raw[++i]; break
      case '--blocking-issues':         r.blockingIssues = raw[++i]; break
      case '--acknowledge-data-quality': r.acknowledgeDataQuality = true; break
      case '--news-signal-review-status': r.newsSignalReviewStatus = raw[++i]; break
      case '--dry-run':                 r.dryRun = true; break
      case '--json':                    r.json = true; break
    }
  }
  return r
}

// ── 게이트 검증 ────────────────────────────────────────────────────────────────

function validateGates(args, approval) {
  const errors = []
  const warnings = []

  // ── 공통 필수 ──
  if (!args.decision)
    errors.push(`--decision 필수. 허용값: ${ALLOWED_DECISIONS.join(' | ')}`)
  else if (!ALLOWED_DECISIONS.includes(args.decision))
    errors.push(`허용되지 않은 decision: "${args.decision}"`)

  if (!args.reviewedBy?.trim())
    errors.push('--reviewed-by 필수. 검토자 이름을 입력하세요.')

  if (!args.weekId)
    errors.push('--week-id 필수.')

  if (!approval)
    errors.push(`approval.json을 읽을 수 없습니다: ${APPROVAL_PATH}`)

  // ── week_id 일치 ──
  if (approval && args.weekId && approval.draft_week_id !== args.weekId)
    errors.push(`week_id 불일치: 입력 "${args.weekId}" ≠ approval.json "${approval.draft_week_id}"`)

  // ── pending 외: draft 파일 존재 ──
  if (args.decision && args.decision !== 'pending' && args.weekId) {
    if (!draftExists(args.weekId))
      errors.push(`data/draft/${args.weekId}.json 없음. 먼저 실행: npm run draft:c3 -- --week-id ${args.weekId}`)
  }

  // ── approved 전용 추가 게이트 ──
  if (args.decision === 'approved') {
    if (!args.acknowledgeDataQuality)
      errors.push('--acknowledge-data-quality 필수 (approved 결정 시 데이터 한계 인지 확인)')

    const bi = args.blockingIssues !== null
      ? parseBlockingIssues(args.blockingIssues)
      : (approval?.blocking_issues ?? [])
    if (bi.length > 0)
      errors.push(`blocking_issues 미해소: [${bi.join(', ')}]. --blocking-issues none 으로 해소 후 재실행.`)
  }

  if (args.decision === 'pending')
    warnings.push('decision을 "pending"으로 설정합니다. 이전 승인/반려 상태가 초기화됩니다.')

  return { errors, warnings }
}

// ── current.json 생성 (draft → current 매핑) ─────────────────────────────────

function deriveSentiment(mc) {
  const vix = mc?.vix
  if (vix == null) return 'neutral'
  if (vix > 30) return 'negative'
  if (vix > 20) return 'cautious'
  if (vix > 15) return 'neutral'
  return 'positive'
}

function buildKeyIndexChanges(mc) {
  const out = []
  if (mc?.sp500_change_pct != null) out.push({ index: 'S&P 500', change_pct: mc.sp500_change_pct })
  return out
}

function buildGlobalHeadline(mc) {
  const vix = mc?.vix
  const sp  = mc?.sp500_change_pct
  const parts = []

  if (vix != null) {
    const v = Math.round(vix)
    if (vix > 30)      parts.push(`VIX ${v} 공포 구간`)
    else if (vix > 25) parts.push(`VIX ${v} 경계 구간`)
    else if (vix > 20) parts.push(`VIX ${v} 변동성 주의`)
    else               parts.push(`VIX ${v} 안정 구간`)
  }

  if (sp != null) {
    if (sp <= -2)      parts.push(`S&P500 ${sp}% 급락`)
    else if (sp < 0)   parts.push(`S&P500 ${sp}% 약보합`)
    else if (sp === 0) parts.push('S&P500 보합')
    else if (sp < 2)   parts.push(`S&P500 +${sp}% 소폭 강세`)
    else               parts.push(`S&P500 +${sp}% 강세`)
  }

  if (parts.length === 0) return '글로벌 시장 동향 — 발행 전 수동 확인 권장'

  const sentiment = deriveSentiment(mc)
  const suffix =
    sentiment === 'negative' ? '— 리스크 오프, 방어 전략 우선' :
    sentiment === 'cautious' ? '— 선별 방어적 접근 국면' :
    sentiment === 'positive' ? '— 리스크 온, 성장주 선호 회복' :
                               '— 중립 관망 구간'
  return `${parts.join(' · ')} ${suffix}`
}

function buildKospiBrief(mc, primaryPicks, asOf) {
  const level = mc?.kospi?.close
  if (!level) return `KOSPI 동향 — ${asOf} 기준 (발행 전 수동 확인 권장)`
  const changePart = mc.kospi?.change_pct != null
    ? ` (${mc.kospi.change_pct > 0 ? '+' : ''}${mc.kospi.change_pct}%)`
    : ''
  const topNames = primaryPicks.slice(0, 2).map(p => p.name).join('·')
  return `KOSPI ${level.toLocaleString('ko-KR')}${changePart} — ${topNames} 중심 선별 수급 집중`
}

function buildKosdaqBrief(mc, asOf) {
  const level = mc?.kosdaq?.close
  if (!level) return `KOSDAQ 동향 — ${asOf} 기준 (발행 전 수동 확인 권장)`
  const changePart = mc.kosdaq?.change_pct != null
    ? ` (${mc.kosdaq.change_pct > 0 ? '+' : ''}${mc.kosdaq.change_pct}%)`
    : ''
  const sentiment = deriveSentiment(mc)
  const context = sentiment === 'cautious' || sentiment === 'negative'
    ? '낙폭 과대 대형주 중심 저점 매수세 유입 속 박스권 등락'
    : '중소형 성장주 중심 상승 모멘텀 유지'
  return `KOSDAQ ${level.toLocaleString('ko-KR')}${changePart} — ${context}`
}

function buildSectorHighlights(primaryPicks) {
  const seen = new Set()
  return primaryPicks
    .filter(p => { if (seen.has(p.sector_code)) return false; seen.add(p.sector_code); return true })
    .slice(0, 3)
    .map(p => {
      const direction = p.total_score >= 70 ? 'up' : 'neutral'
      let note
      if (p.total_score >= 85)
        note = `${p.name} 고득점(${p.total_score}점) 강세 — 수주·실적 모멘텀 집중 구간`
      else if (p.total_score >= 70)
        note = `${p.name}(${p.ticker}) 양호한 상승 흐름 — 실적 가시성 기반 안정적 수급`
      else if (p.total_score >= 55)
        note = `${p.name}(${p.ticker}) 중립 관찰 구간 — 추가 모멘텀 확인 후 접근 유효`
      else
        note = `${p.name}(${p.ticker}) 저점 탐색 구간 — 반등 가능성 주목, 단기 변동성 주의`
      return { sector: p.sector_code, direction, note }
    })
}

function buildWeekTheme(primaryPicks, mc) {
  const seen = new Set()
  const sectors = []
  for (const p of primaryPicks) {
    if (!seen.has(p.sector_code)) { sectors.push(p); seen.add(p.sector_code) }
  }
  const sectorNames = sectors.slice(0, 3).map(s => s.name).join('·')
  const vix = mc?.vix
  const sp  = mc?.sp500_change_pct
  let context = ''
  if (vix != null && vix > 25) context = '변동성 경계 속 '
  else if (sp != null && sp <= -1.5) context = '글로벌 약세 속 '
  else if (sp != null && sp >= 1.5)  context = '글로벌 강세 속 '
  return `${context}${sectorNames} — 실적 모멘텀·저점 선별 접근 구도`
}

function buildPick(candidate) {
  const ps = candidate.price_snapshot ?? {}
  const qd = candidate.quality_detail   ?? {}
  const cs = candidate.component_scores ?? {}

  // ── price_zone: 구조화 객체 ─────────────────────────────────────────────────
  // generate-detail-reports.mjs는 pick.price_zone.reference_price 등 필드를 직접 읽음.
  // 이전 방식(문자열 요약)은 reference_price가 undefined로 누락되는 버그를 유발함.
  const priceZone = {
    reference_price: ps.close ?? null,
    currency:        'KRW',
    watch_low:       null,
    watch_high:      null,
  }

  // ── risk_summary: caution_flags 기반, 없으면 비-placeholder 기본 문구 ──────
  const riskSummary = candidate.caution_flags?.length > 0
    ? candidate.caution_flags.slice(0, 2).join('. ') + '.'
    : '발행 전 리스크 항목 수동 점검 권장.'

  // ── catalyst_summary: scoring 데이터 기반 자동 생성 ───────────────────────
  // generate-detail-reports.mjs는 이 필드를 splitToBullets()로 파싱해
  // company_overview / bull_points / catalysts_2_to_4_weeks를 구성함.
  // placeholder 금지 — 발행 전 운영자 보강 권장.
  const catalystParts = []
  if (qd.op_margin_pct != null) {
    catalystParts.push(
      `영업이익률 ${parseFloat(qd.op_margin_pct).toFixed(1)}%(${qd.bsns_year ?? '연간'}) — 업종 내 수익성 기반 확보`
    )
  }
  if (ps.week52_position_pct != null) {
    const pos = ps.week52_position_pct
    if      (pos >= 70) catalystParts.push(`52주 포지션 ${pos}% — 강한 상승 모멘텀 유지`)
    else if (pos >= 50) catalystParts.push(`52주 포지션 ${pos}% — 중기 상승 흐름 속 양호한 수급`)
    else if (pos >= 30) catalystParts.push(`52주 포지션 ${pos}% — 중간 구간에서 추가 상승 여지`)
    else                catalystParts.push(`52주 포지션 ${pos}% — 저점 근처로 반등 시 상승 여력 유효`)
  }
  if ((cs.liquidity_score ?? 0) >= 30) {
    catalystParts.push('거래대금 충분 — 기관·외국인 수급 접근 가능한 대형주')
  }
  const catalystSummary = catalystParts.length > 0
    ? catalystParts.join('. ') + '.'
    : (candidate.inclusion_reason ?? '발행 전 촉매 항목 수동 보강 권장.')

  // ── stance: 점수 기반 자동 생성 (발행 전 운영자 보강 권장) ─────────────────
  const score = candidate.total_score ?? 0
  let stance
  if (score >= 90) {
    stance = `고득점(${score}점) 강세 구간 — 수급 집중 확인 후 접근. 단기 과열 여부 발행 전 점검 권장.`
  } else if (score >= 75) {
    stance = `양호한 점수(${score}점) 상승 흐름 — 중기 보유 관점 유효. 발행 전 catalyst 보강 권장.`
  } else if (score >= 60) {
    stance = `중립 점수(${score}점) 관찰 구간 — 추가 모멘텀 확인 후 접근. 발행 전 리스크 재검토 권장.`
  } else {
    stance = `낮은 점수(${score}점) 주의 구간 — 발행 전 수동 검토 필수.`
  }

  return {
    rank:                    candidate.final_rank,
    ticker:                  candidate.ticker,
    name:                    candidate.name,
    market:                  candidate.market,
    sector:                  candidate.sector_code,
    asset_type:              candidate.asset_type,
    one_line_reason:         candidate.inclusion_reason ?? '점수 기반 선정.',
    stance,
    price_zone:              priceZone,
    catalyst_summary:        catalystSummary,
    risk_summary:            riskSummary,
    same_sector_alternatives: [],
    detail_report_id:        null,
  }
}

function buildCurrentFromDraft(draft, weekId, now) {
  const mc = draft.market_context_summary ?? {}
  const primaryPicks = draft.candidate_picks?.primary ?? []

  // favored: 상위 3개 종목 섹터 (중복 제거)
  const favoredSectors = [...new Set(primaryPicks.slice(0, 3).map(p => p.sector_code))]

  // cautious: watchlist Soft Flag 종목 섹터
  const cautiousSectors = [...new Set(
    (draft.watchlist ?? [])
      .filter(e => e.hard_filter_decision === 'soft_flag')
      .map(e => e.sector_code)
  )]

  const asOf = mc.as_of ? formatAsOf(mc.as_of) : weekId

  return {
    report_id:       `RPT-${weekId}`,
    week_id:         weekId,
    schema_version:  '1.0',
    data_as_of:      asOf,
    generated_at:    now,
    published_at:    now,
    market_summary: {
      global: {
        headline:          buildGlobalHeadline(mc),
        key_index_changes: buildKeyIndexChanges(mc),
        sentiment:         deriveSentiment(mc),
      },
      domestic: {
        kospi: {
          level:      mc.kospi?.close ?? null,
          change_pct: mc.kospi?.change_pct ?? null,
          brief:      buildKospiBrief(mc, primaryPicks, asOf),
        },
        kosdaq: {
          level:      mc.kosdaq?.close ?? null,
          change_pct: mc.kosdaq?.change_pct ?? null,
          brief:      buildKosdaqBrief(mc, asOf),
        },
        sector_highlights: buildSectorHighlights(primaryPicks),
        week_theme:        buildWeekTheme(primaryPicks, mc),
      },
    },
    picks:            primaryPicks.map(buildPick),
    favored_sectors:  favoredSectors,
    cautious_sectors: cautiousSectors,
    sector_returns:   [],
    related_news:     [],
    disclaimer:       '이 리포트는 투자 참고용 정보 제공을 목적으로 하며, 특정 종목의 매수·매도를 권유하지 않습니다. 투자 결정 및 그에 따른 손익은 투자자 본인의 책임입니다.',
  }
}

// ── approval.json 빌드 ────────────────────────────────────────────────────────

function buildApprovalNext(args, current, now) {
  const next = { ...current }
  next.decision    = args.decision
  next.reviewed_by = args.reviewedBy
  next.reviewed_at = now
  next.notes       = args.note ?? current.notes ?? null

  if (args.newsSignalReviewStatus !== null)
    next.news_signal_review_status = args.newsSignalReviewStatus

  if (args.blockingIssues !== null)
    next.blocking_issues = parseBlockingIssues(args.blockingIssues)
  else
    next.blocking_issues = current.blocking_issues ?? []

  next.data_quality_acknowledged = args.acknowledgeDataQuality
    ? true
    : (current.data_quality_acknowledged ?? false)

  next.draft_exists   = draftExists(args.weekId ?? current.draft_week_id)
  next.publish_ready  = args.decision === 'approved' &&
    next.draft_exists === true &&
    next.data_quality_acknowledged === true &&
    next.blocking_issues.length === 0

  return next
}

// ── manifest.json 빌드 ────────────────────────────────────────────────────────

function buildManifestNext(manifest, newWeekId, oldCurrentWeekId, now) {
  const next = { ...manifest }
  next.current_report_id = `RPT-${newWeekId}`
  next.current_week_id   = newWeekId
  next.current_file_path = 'data/current/current.json'
  next.draft_report_id   = null
  next.draft_week_id     = null
  next.draft_file_path   = null
  next.last_published_at = now

  // 이전 current를 archive에 추가 (새 week 반영 시)
  if (oldCurrentWeekId && oldCurrentWeekId !== newWeekId) {
    const existing = next.archive_week_ids ?? []
    if (!existing.includes(oldCurrentWeekId)) {
      next.archive_week_ids = [...existing, oldCurrentWeekId]
    }
  }

  return next
}

// ── 콘솔 출력 ─────────────────────────────────────────────────────────────────

function printResult({
  args, errors, warnings, dryRun, isApproved,
  approvalNext, currentJson, oldWeekId, newWeekId, now,
}) {
  const isBlocked = errors.length > 0
  const status = isBlocked
    ? '🚫 BLOCKED'
    : dryRun ? '🔍 DRY-RUN (변경 없음)' : '✅ COMMITTED'

  console.log('')
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log(`║  APPROVE-COMMIT: ${(args.weekId ?? '?').padEnd(42)}║`)
  console.log(`║  actor  : ${(args.reviewedBy ?? '?').padEnd(49)}║`)
  console.log(`║  decision: ${(args.decision ?? '?').padEnd(48)}║`)
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`  상태: ${status}`)
  console.log('')

  if (errors.length > 0) {
    console.log('────────────────────────────────────────────────────────────')
    console.log('[오류 (ERRORS)] — 어떤 파일도 수정되지 않았습니다')
    errors.forEach(e => console.log(`  ✗ ${e}`))
    console.log('')
  }

  if (warnings.length > 0) {
    console.log('────────────────────────────────────────────────────────────')
    console.log('[경고 (WARNINGS)]')
    warnings.forEach(w => console.log(`  ⚠  ${w}`))
    console.log('')
  }

  if (!isBlocked) {
    console.log('────────────────────────────────────────────────────────────')
    if (isApproved) {
      console.log('[반영 대상 파일]')
      console.log(`  ✎  data/manifests/approval.json`)
      console.log(`  ✎  data/current/current.json  (report_id: RPT-${newWeekId})`)
      if (oldWeekId && oldWeekId !== newWeekId) {
        console.log(`  ✎  data/archive/${oldWeekId}.json  (기존 current 보관)`)
        console.log(`  ✎  data/archive/details/  (기존 current/details 보관 — detail:generate 실행 전)`)
      }
      console.log(`  ✎  data/manifests/manifest.json`)
      console.log(`     data/draft/${newWeekId}.json  → 유지 (삭제 안 함)`)
      console.log(`     overlap_history / git commit  → npm run publish 에서 처리`)
      console.log('')
      console.log('[current.json picks 미리보기]')
      currentJson?.picks?.forEach(p =>
        console.log(`  #${p.rank}  ${p.ticker}  ${p.name}  (${p.sector})`)
      )
    } else {
      console.log('[반영 대상 파일]')
      console.log(`  ✎  data/manifests/approval.json  (decision: ${args.decision})`)
      console.log(`     current / archive / manifest — 비접촉`)
    }

    console.log('')
    console.log('[approval.json 변경 후 상태]')
    console.log(`  decision                  : ${approvalNext?.decision}`)
    console.log(`  reviewed_by               : ${approvalNext?.reviewed_by}`)
    console.log(`  reviewed_at               : ${approvalNext?.reviewed_at}`)
    console.log(`  data_quality_acknowledged : ${approvalNext?.data_quality_acknowledged}`)
    console.log(`  blocking_issues           : [${(approvalNext?.blocking_issues ?? []).join(', ') || '없음'}]`)
    console.log(`  publish_ready             : ${approvalNext?.publish_ready}`)
  }

  if (!isBlocked && dryRun) {
    console.log('')
    console.log('  ※ dry-run 결과. --dry-run 제거 시 실제 파일이 수정됩니다.')
  }

  if (!isBlocked && !dryRun) {
    if (isApproved) {
      console.log('')
      console.log(`  ✓ 승인 반영 완료 (${now})`)
      console.log('  ✓ approval.json / current.json / manifest.json 갱신')
    } else {
      console.log('')
      console.log(`  ✓ approval.json 기록 완료 (${now})`)
      console.log('  ✓ current / archive / manifest 변경 없음')
    }
  }

  console.log('════════════════════════════════════════════════════════════')
  console.log('')
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

function main() {
  const args     = parseArgs()
  const now      = nowIso()
  const approval = readJson(APPROVAL_PATH)
  const manifest = readJson(MANIFEST_PATH)
  const oldCurrent = readJson(CURRENT_PATH)

  const { errors, warnings } = validateGates(args, approval)
  const isApproved = args.decision === 'approved' && errors.length === 0

  // ── 페이로드 빌드 (검증 통과 시만) ─────────────────────────────────────────
  let approvalNext = null
  let currentJson  = null
  let archiveJson  = null
  let manifestNext = null
  let oldWeekId    = oldCurrent?.week_id ?? null

  if (errors.length === 0) {
    approvalNext = buildApprovalNext(args, approval, now)

    if (isApproved) {
      const draft = readJson(draftPath(args.weekId))
      if (!draft) {
        errors.push(`data/draft/${args.weekId}.json 로드 실패`)
      } else {
        currentJson = buildCurrentFromDraft(draft, args.weekId, now)

        // 기존 current가 다른 week면 archive 생성
        if (oldCurrent && oldWeekId && oldWeekId !== args.weekId) {
          archiveJson = { ...oldCurrent, archived_at: now }
        }

        manifestNext = buildManifestNext(manifest ?? {}, args.weekId, oldWeekId, now)
      }
    }
  }

  // ── 출력 ────────────────────────────────────────────────────────────────────
  printResult({
    args, errors, warnings,
    dryRun:    args.dryRun,
    isApproved,
    approvalNext, currentJson,
    oldWeekId, newWeekId: args.weekId,
    now,
  })

  if (errors.length > 0) {
    process.exit(1)
  }

  if (args.dryRun) {
    process.exit(0)
  }

  // ── 실제 기록 ────────────────────────────────────────────────────────────────
  // 검증 완료 후 순서: approval → archive(있으면) → current → manifest
  writeJson(APPROVAL_PATH, approvalNext)

  if (isApproved) {
    if (archiveJson && oldWeekId) {
      // 이전 current.json → archive
      writeJson(archivePath(oldWeekId), archiveJson)
      console.log(`  [저장] data/archive/${oldWeekId}.json`)

      // 이전 current/details → archive/details (detail:generate 실행 전에 보존해야 함)
      if (fs.existsSync(CURRENT_DETAILS)) {
        const detailFiles = fs.readdirSync(CURRENT_DETAILS).filter(f => f.endsWith('.json'))
        if (detailFiles.length > 0) {
          fs.mkdirSync(ARCHIVE_DETAILS, { recursive: true })
          for (const f of detailFiles) {
            fs.copyFileSync(path.join(CURRENT_DETAILS, f), path.join(ARCHIVE_DETAILS, f))
          }
          console.log(`  [저장] data/archive/details/ (${detailFiles.length}건 복사)`)
        }
      }
    }
    writeJson(CURRENT_PATH, currentJson)
    console.log(`  [저장] data/current/current.json`)
    writeJson(MANIFEST_PATH, manifestNext)
    console.log(`  [저장] data/manifests/manifest.json`)
  }

  console.log(`  [저장] data/manifests/approval.json`)
}

main()

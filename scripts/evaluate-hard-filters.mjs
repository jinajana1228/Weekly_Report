#!/usr/bin/env node
/**
 * scripts/evaluate-hard-filters.mjs
 *
 * Phase C-1 Hard Filter 판단 스크립트.
 * data/processed/{week_id}/normalized_entities.json 을 입력으로 받아
 * data/analysis/{week_id}/hard_filter_results.json
 * data/analysis/{week_id}/hard_filter_summary.json 을 생성합니다.
 *
 * 구현된 Rule (docs/V1_HARD_FILTER_POLICY.md 기준):
 *   HF_EXCHANGE_STATUS    — 거래소 지정 (관리/정지/경고/위험/과열/주의)
 *   HF_NEWLY_LISTED       — 신규 상장 180일 미만
 *   HF_LOW_PRICE          — 동전주 (주가 기준)
 *   HF_LOW_LIQUIDITY      — 저유동성 (1일 거래대금 프록시)
 *   HF_OVERHEATED         — 단기 급등 과열 (5일/20일 가격 이력 필요)
 *   HF_NEGATIVE_EARNINGS  — 영업 적자 (DART 재무, stock 전용)
 *   HF_AUDIT_ISSUE        — 감사의견 비적정 (stock 전용)
 *
 * 금지 사항 (이 스크립트는 다음을 구현하지 않습니다):
 *   - 추천/점수 계산
 *   - picks 선정
 *   - current/draft/archive 접근
 *   - processed 덮어쓰기
 *   - same_sector_alternatives 생성
 *
 * 사용법:
 *   node scripts/evaluate-hard-filters.mjs --week-id 2026-W14
 *   node scripts/evaluate-hard-filters.mjs --week-id 2026-W14 --dry-run
 *   npm run evaluate:hf -- --week-id 2026-W14
 */

import { parseWeekIdArg, isDryRun } from './lib/snapshot.mjs'
import { getCurrentWeekId } from './lib/week-id.mjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PROCESSED_DIR = path.join(ROOT, 'data/processed')
const ANALYSIS_DIR  = path.join(ROOT, 'data/analysis')

// ── 저장 유틸 ────────────────────────────────────────────────────────────────

function saveAnalysis(weekId, filename, payload) {
  const dir = path.join(ANALYSIS_DIR, weekId)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, filename)
  const content = JSON.stringify(payload, null, 2)
  fs.writeFileSync(filePath, content, 'utf-8')
  const sizeKb = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1)
  console.log(`  [저장] ${path.relative(ROOT, filePath)} (${sizeKb} KB)`)
}

function readProcessed(weekId, filename) {
  const filePath = path.join(PROCESSED_DIR, weekId, filename)
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────

/**
 * "23,603,619,000,000" 또는 "-1,234,567" → 숫자
 * 빈 문자열·파싱 불가 → null
 */
function parseKrwAmount(str) {
  if (!str) return null
  const cleaned = String(str).replace(/,/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

/**
 * "YYYYMMDD" 또는 "YYYY-MM-DD" → Date 객체
 */
function parseDate(str) {
  if (!str) return null
  const s = String(str).replace(/-/g, '')
  if (s.length !== 8) return null
  const dt = new Date(
    parseInt(s.slice(0, 4)),
    parseInt(s.slice(4, 6)) - 1,
    parseInt(s.slice(6, 8)),
  )
  return isNaN(dt.getTime()) ? null : dt
}

function daysDiff(from, to) {
  return Math.floor((to.getTime() - from.getTime()) / 86400000)
}

/**
 * Rule 결과 객체 생성 헬퍼.
 * decision: 'pass' | 'soft_flag' | 'hard_block' | 'input_unavailable' | 'not_applicable'
 */
function ruleResult(rule, decision, opts = {}) {
  return {
    rule,
    decision,
    triggered:       decision === 'soft_flag' || decision === 'hard_block',
    input_available: decision !== 'input_unavailable' && decision !== 'not_applicable',
    applicable:      decision !== 'not_applicable',
    ...opts,
  }
}

// ── Hard Filter Rules ─────────────────────────────────────────────────────────

/**
 * HF_EXCHANGE_STATUS
 * 거래소 지정 여부 (관리종목/거래정지/투자경고/투자위험/단기과열 → Hard Block,
 *                   투자주의 → Soft Flag)
 *
 * 현재 데이터 한계: is_exchange_designated 단일 boolean만 제공됨.
 * 지정 유형을 구분할 수 없으므로 true이면 보수적으로 Hard Block 처리.
 */
function evalExchangeStatus(entity) {
  const ex = entity.exchange_status

  if (!ex || ex.status === 'unavailable') {
    return ruleResult('HF_EXCHANGE_STATUS', 'input_unavailable', {
      basis: 'exchange_status 수집 불가',
      source: 'krx_exchange_status',
      _note: 'krx_exchange_status 데이터 없음. KRX OAP 세션 문제.',
    })
  }

  const designated = ex.is_exchange_designated

  if (designated === null || designated === undefined) {
    return ruleResult('HF_EXCHANGE_STATUS', 'input_unavailable', {
      basis: 'is_exchange_designated 값 없음',
      source: 'krx_exchange_status',
    })
  }

  if (designated === true) {
    return ruleResult('HF_EXCHANGE_STATUS', 'hard_block', {
      basis: 'is_exchange_designated: true',
      reason: '거래소 지정 종목 (관리/거래정지/투자경고/투자위험/단기과열/투자주의 중 하나)',
      source: 'krx_exchange_status',
      _note: '지정 유형 세분화 불가 (현재 데이터 한계). 보수적 Hard Block 처리. 지정 유형 세분화 후 투자주의 → Soft Flag 전환 예정.',
    })
  }

  return ruleResult('HF_EXCHANGE_STATUS', 'pass', {
    basis: 'is_exchange_designated: false — 거래소 지정 없음',
    source: 'krx_exchange_status',
  })
}

/**
 * HF_NEWLY_LISTED
 * 상장 후 180일(6개월) 미만 → Hard Block (개별주/ETF 동일 적용)
 *
 * listing_date 우선순위:
 *   1순위: krx_listing (B-2 KRX OAP 수집, listing.source === 'krx_listing')
 *   2순위: universe_config fallback (listing.listing_date_source === 'universe_config')
 * KRX 수집 불가이고 universe config에도 없으면 input_unavailable 반환.
 */
function evalNewlyListed(entity, asOfDate) {
  const listing = entity.listing

  // listing_date 가용 여부 먼저 확인 (krx_listing 또는 universe_config fallback 모두 허용)
  const listingDateStr = listing?.listing_date ?? null
  const listingDate = parseDate(listingDateStr)

  if (!listingDate) {
    // listing 자체 없거나, listing_date 없음 → input_unavailable
    return ruleResult('HF_NEWLY_LISTED', 'input_unavailable', {
      basis: listing?.status === 'unavailable'
        ? 'krx_listing 수집 불가이고 universe_config fallback 없음'
        : 'listing_date 없음 또는 파싱 불가',
      source: 'krx_listing',
      _note: '상장일 기준 180일 제외 판단 불가. krx_listing 수집 후 재평가 필요.',
    })
  }

  const source = listing.listing_date_source ?? 'krx_listing'
  const sourceNote = listing.listing_date_note ?? null

  const days = daysDiff(listingDate, asOfDate)
  if (days < 180) {
    return ruleResult('HF_NEWLY_LISTED', 'hard_block', {
      basis: `상장 후 ${days}일 경과 — 180일 미만`,
      listing_date: listingDateStr,
      days_since_listing: days,
      threshold_days: 180,
      source,
      ...(sourceNote ? { _note: sourceNote } : {}),
    })
  }

  return ruleResult('HF_NEWLY_LISTED', 'pass', {
    basis: `상장 후 ${days}일 경과 (기준 충족)`,
    listing_date: listingDateStr,
    days_since_listing: days,
    source,
    ...(sourceNote ? { _note: sourceNote } : {}),
  })
}

/**
 * HF_LOW_PRICE
 * 동전주 — 개별주 close < 2,000원 → Hard Block
 *          ETF  close < 1,000원 → Soft Flag
 */
function evalLowPrice(entity) {
  const price = entity.price

  if (!price || price.status === 'unavailable') {
    return ruleResult('HF_LOW_PRICE', 'input_unavailable', {
      basis: '가격 데이터 없음',
      source: 'krx_price',
    })
  }

  const close = price.close
  if (close === null || close === undefined) {
    return ruleResult('HF_LOW_PRICE', 'input_unavailable', {
      basis: 'close 가격 없음',
      source: 'krx_price',
    })
  }

  if (entity.asset_type === 'etf') {
    if (close < 1000) {
      return ruleResult('HF_LOW_PRICE', 'soft_flag', {
        basis: `ETF 주가 ${close.toLocaleString()}원 < 1,000원 기준`,
        close, threshold: 1000,
        source: 'krx_price',
      })
    }
    return ruleResult('HF_LOW_PRICE', 'pass', {
      basis: `ETF 주가 ${close.toLocaleString()}원 ≥ 1,000원 (기준 충족)`,
      close,
      source: 'krx_price',
    })
  }

  // 개별주
  if (close < 2000) {
    return ruleResult('HF_LOW_PRICE', 'hard_block', {
      basis: `주가 ${close.toLocaleString()}원 < 2,000원 기준 (동전주)`,
      close, threshold: 2000,
      source: 'krx_price',
    })
  }

  return ruleResult('HF_LOW_PRICE', 'pass', {
    basis: `주가 ${close.toLocaleString()}원 ≥ 2,000원 (기준 충족)`,
    close,
    source: 'krx_price',
  })
}

/**
 * HF_LOW_LIQUIDITY
 * 저유동성 — 시장별 거래대금 기준 (Hard Block / Soft Flag)
 *
 * 기준 (정책 문서):
 *   KOSPI 개별주: Hard Block < 50억, Soft Flag 50~100억
 *   KOSDAQ 개별주: Hard Block < 20억, Soft Flag 20~30억
 *   ETF:          Hard Block < 10억, Soft Flag 10~20억
 *
 * 데이터 한계: 1일 거래대금 프록시 (volume × close) — 20거래일 평균 아님.
 * 결과는 provisional. 정확한 판단은 20거래일 데이터 확보 후 재평가 필요.
 */
const LIQ = {
  KOSPI:  { hard_block: 5_000_000_000, soft_flag: 10_000_000_000 },   // 50억, 100억
  KOSDAQ: { hard_block: 2_000_000_000, soft_flag: 3_000_000_000  },   // 20억, 30억
  ETF:    { hard_block: 1_000_000_000, soft_flag: 2_000_000_000  },   // 10억, 20억
}

function evalLowLiquidity(entity) {
  const price = entity.price

  if (!price || price.status === 'unavailable') {
    return ruleResult('HF_LOW_LIQUIDITY', 'input_unavailable', {
      basis: '가격/거래량 데이터 없음',
      source: 'krx_price',
    })
  }

  const { close, volume } = price
  if (close === null || close === undefined || volume === null || volume === undefined) {
    return ruleResult('HF_LOW_LIQUIDITY', 'input_unavailable', {
      basis: 'close 또는 volume 없음 — 1일 거래대금 산출 불가',
      source: 'krx_price',
    })
  }

  const dailyValue = close * volume
  const thresholds = entity.asset_type === 'etf'
    ? LIQ.ETF
    : (LIQ[entity.market] ?? LIQ.KOSPI)
  const PROXY_NOTE = '[주의] 1일 거래대금 프록시 — 정확한 판단은 최근 20거래일 평균 필요'

  if (dailyValue < thresholds.hard_block) {
    return ruleResult('HF_LOW_LIQUIDITY', 'hard_block', {
      basis: `1일 거래대금 ${(dailyValue / 1e8).toFixed(1)}억원 < Hard Block 기준 ${thresholds.hard_block / 1e8}억원`,
      daily_value_krw: dailyValue,
      threshold_hard_block: thresholds.hard_block,
      volume, close,
      source: 'krx_price',
      _note: PROXY_NOTE,
    })
  }

  if (dailyValue < thresholds.soft_flag) {
    return ruleResult('HF_LOW_LIQUIDITY', 'soft_flag', {
      basis: `1일 거래대금 ${(dailyValue / 1e8).toFixed(1)}억원 (Soft Flag 구간 ${thresholds.hard_block / 1e8}~${thresholds.soft_flag / 1e8}억원)`,
      daily_value_krw: dailyValue,
      threshold_hard_block: thresholds.hard_block,
      threshold_soft_flag: thresholds.soft_flag,
      volume, close,
      source: 'krx_price',
      _note: PROXY_NOTE,
    })
  }

  return ruleResult('HF_LOW_LIQUIDITY', 'pass', {
    basis: `1일 거래대금 ${(dailyValue / 1e8).toFixed(1)}억원 (기준 충족)`,
    daily_value_krw: dailyValue,
    source: 'krx_price',
    _note: PROXY_NOTE,
  })
}

/**
 * HF_OVERHEATED
 * 단기 급등 과열
 *   5거래일 등락률 +40% 초과    → Hard Block
 *   20거래일 등락률 +80% 초과   → Hard Block
 *   5거래일 등락률 +20~40%      → Soft Flag
 *   20거래일 등락률 +30~80%     → Soft Flag
 *
 * 현재 데이터 한계: processed 데이터에 5일/20일 가격 이력 없음.
 * 거래소 단기과열 지정은 HF_EXCHANGE_STATUS에서 이미 처리됨.
 * → 전체 input_unavailable 처리 (정책 기준 수치 판단 불가)
 */
function evalOverheated(entity) {
  const price = entity.price

  if (!price || price.status === 'unavailable') {
    return ruleResult('HF_OVERHEATED', 'input_unavailable', {
      basis: '가격 데이터 없음',
      source: 'krx_price',
      _note: '5일/20일 가격 이력 수집 후 재평가 필요. 거래소 단기과열 지정은 HF_EXCHANGE_STATUS에서 처리됨.',
    })
  }

  if (price.close === null) {
    return ruleResult('HF_OVERHEATED', 'input_unavailable', {
      basis: 'close 가격 없음',
      source: 'krx_price',
    })
  }

  // prev_close가 있으면 1일 등락률은 계산 가능하나, 정책 기준(5일/20일)에 부합하지 않음.
  // 5일/20일 이력이 없으므로 input_unavailable.
  return ruleResult('HF_OVERHEATED', 'input_unavailable', {
    basis: '5거래일/20거래일 가격 이력 없음 — 현재 processed 데이터는 단일 거래일 스냅샷',
    source: 'krx_price',
    _note: '거래소 단기과열 지정(HF_EXCHANGE_STATUS)으로 최악의 경우 처리됨. 가격 이력 수집 후 +40%/+80% 임계값 평가 필요.',
  })
}

/**
 * HF_NEGATIVE_EARNINGS
 * 영업 적자 (stock 전용, ETF 미적용)
 *
 * 정책 기준 (docs/V1_HARD_FILTER_POLICY.md):
 *   Hard Block : 최근 2분기 연속 영업이익 음수 + TTM 합산 음수
 *   Soft Flag  : TTM 영업이익 합산 음수만
 *   HEALTHCARE 예외: Hard Block → Soft Flag 완화
 *
 * 구현 주의:
 *   - DART 재무 데이터는 YTD 누적 기준 (11012=H1, 11014=9M) or 연간(11011)
 *   - TTM: 최신 연간보고서(11011) thstrm_amount 사용
 *   - 분기 개별값 역산: 11014 - 11012 = Q3 standalone, 11012 - 11013 = Q2 standalone 등
 *   - 연간+분기 데이터만 있으면 2분기 연속 판단이 제한적 → input_unavailable로 표기
 */
function evalNegativeEarnings(entity) {
  if (entity.asset_type === 'etf') {
    return ruleResult('HF_NEGATIVE_EARNINGS', 'not_applicable', {
      basis: 'ETF — 영업이익 개념 없음 (정책 문서 2-2절 ETF 미적용)',
      source: null,
    })
  }

  const fin = entity.dart_financials
  if (!fin || fin.period_count === 0) {
    return ruleResult('HF_NEGATIVE_EARNINGS', 'input_unavailable', {
      basis: '재무제표 데이터 없음',
      source: 'dart_financials',
    })
  }

  // 중복 제거 (같은 bsns_year + reprt_code)
  const seen = new Set()
  const periods = []
  for (const p of fin.periods) {
    const key = `${p.bsns_year}-${p.reprt_code}`
    if (!seen.has(key)) { seen.add(key); periods.push(p) }
  }

  const getOpIncome = (p) => parseKrwAmount(p?.financials?.['영업이익']?.thstrm_amount)

  // 연간(11011) 기준 TTM
  const annuals = periods.filter(p => p.reprt_code === '11011')
    .sort((a, b) => Number(b.bsns_year) - Number(a.bsns_year))
  const latestAnnual = annuals[0] ?? null
  const ttmOpIncome  = latestAnnual ? getOpIncome(latestAnnual) : null

  if (ttmOpIncome === null) {
    return ruleResult('HF_NEGATIVE_EARNINGS', 'input_unavailable', {
      basis: '연간 영업이익(11011) 없음 — TTM 산출 불가',
      period_count: periods.length,
      source: 'dart_financials',
    })
  }

  // 분기 데이터로 연속 적자 감지 (YTD 누적 → 개별 분기 역산)
  // reprt_code order: 11013(Q1=1), 11012(H1=2), 11014(9M=3), 11011(Annual=4)
  const REPRT_ORDER = { '11013': 1, '11012': 2, '11014': 3 }
  const year = latestAnnual.bsns_year

  const ytdPeriods = periods
    .filter(p => p.bsns_year === year && p.reprt_code !== '11011')
    .sort((a, b) => (REPRT_ORDER[b.reprt_code] ?? 0) - (REPRT_ORDER[a.reprt_code] ?? 0))

  // 개별 분기 값 역산 (가장 최근 분기부터)
  const standaloneQuarters = []
  for (let i = 0; i < ytdPeriods.length; i++) {
    const curr = getOpIncome(ytdPeriods[i])
    const prev = i + 1 < ytdPeriods.length ? (getOpIncome(ytdPeriods[i + 1]) ?? 0) : 0
    if (curr !== null) standaloneQuarters.push({ reprt_code: ytdPeriods[i].reprt_code, value: curr - prev })
  }

  // 연속 적자 카운트 (최근 분기부터)
  let consecutiveNeg = 0
  for (const q of standaloneQuarters) {
    if (q.value < 0) consecutiveNeg++
    else break
  }

  const isTtmNeg = ttmOpIncome < 0
  const isHealthcare = entity.sector_code === 'HEALTHCARE'

  // 판정
  const reasonParts = [
    `연간 영업이익: ${(ttmOpIncome / 1e8).toFixed(0)}억원 (${latestAnnual.bsns_year}년 ${latestAnnual.reprt_code})`,
    consecutiveNeg > 0 ? `최근 ${consecutiveNeg}개 분기 개별 적자 감지됨` : null,
  ].filter(Boolean)

  // 2분기 연속 + TTM 음수 → Hard Block
  if (isTtmNeg && consecutiveNeg >= 2) {
    const decision = isHealthcare ? 'soft_flag' : 'hard_block'
    return ruleResult('HF_NEGATIVE_EARNINGS', decision, {
      basis: `최근 ${consecutiveNeg}분기 연속 적자 + TTM 영업이익 음수`,
      ttm_operating_income_krw: ttmOpIncome,
      consecutive_negative_quarters: consecutiveNeg,
      reasons: reasonParts,
      source: 'dart_financials',
      _note: isHealthcare
        ? 'HEALTHCARE 섹터 예외: Hard Block → Soft Flag 완화 적용 (정책 문서 2-2절)'
        : null,
    })
  }

  // TTM 합산 음수만 → Soft Flag
  if (isTtmNeg) {
    return ruleResult('HF_NEGATIVE_EARNINGS', 'soft_flag', {
      basis: 'TTM 영업이익 합산 음수',
      ttm_operating_income_krw: ttmOpIncome,
      consecutive_negative_quarters: consecutiveNeg,
      reasons: reasonParts,
      source: 'dart_financials',
    })
  }

  return ruleResult('HF_NEGATIVE_EARNINGS', 'pass', {
    basis: `TTM 영업이익 양수 (${(ttmOpIncome / 1e8).toFixed(0)}억원, ${latestAnnual.bsns_year}년)`,
    ttm_operating_income_krw: ttmOpIncome,
    source: 'dart_financials',
  })
}

/**
 * HF_AUDIT_ISSUE
 * 감사의견 비적정 (한정/부적정/의견거절) → Hard Block (stock 전용)
 * ETF: DART 데이터 없음 → not_applicable
 */
const ADVERSE_OPINIONS = ['한정', '부적정', '의견거절']

function evalAuditIssue(entity) {
  if (entity.asset_type === 'etf') {
    return ruleResult('HF_AUDIT_ISSUE', 'not_applicable', {
      basis: 'ETF — DART 감사의견 없음',
      source: null,
    })
  }

  const aud = entity.dart_audit

  if (!aud || aud.status === 'unavailable') {
    return ruleResult('HF_AUDIT_ISSUE', 'input_unavailable', {
      basis: '감사의견 수집 불가',
      source: 'dart_audit',
      _note: aud?._note ?? null,
    })
  }

  if (aud.audit_opinion === null || aud.audit_opinion === undefined) {
    return ruleResult('HF_AUDIT_ISSUE', 'input_unavailable', {
      basis: 'audit_opinion 값 없음 — 미공시 또는 수집 실패',
      bsns_year: aud.bsns_year,
      _note: aud._note ?? null,
      source: 'dart_audit',
    })
  }

  const opinion = String(aud.audit_opinion).trim()

  // 비적정 의견 감지
  const isAdverse = ADVERSE_OPINIONS.some(a => opinion.includes(a)) &&
                    !opinion.startsWith('적정')  // '적정' 앞에 다른 단어 없으면 제외

  if (isAdverse) {
    return ruleResult('HF_AUDIT_ISSUE', 'hard_block', {
      basis: `감사의견 비적정: "${opinion}"`,
      audit_opinion: opinion,
      bsns_year: aud.bsns_year,
      audit_firm: aud.audit_firm ?? null,
      source: 'dart_audit',
    })
  }

  // 적정 의견
  if (opinion.includes('적정')) {
    return ruleResult('HF_AUDIT_ISSUE', 'pass', {
      basis: `감사의견 적정 (${aud.bsns_year}년)`,
      audit_opinion: opinion,
      bsns_year: aud.bsns_year,
      source: 'dart_audit',
    })
  }

  // 알 수 없는 의견 → Soft Flag (보수적 처리)
  return ruleResult('HF_AUDIT_ISSUE', 'soft_flag', {
    basis: `감사의견 미확인: "${opinion}" — 알 수 없는 형식 (보수적 Soft Flag)`,
    audit_opinion: opinion,
    bsns_year: aud.bsns_year,
    source: 'dart_audit',
  })
}

// ── 엔티티 평가 ──────────────────────────────────────────────────────────────

/**
 * 단일 엔티티에 모든 Hard Filter Rule을 적용합니다.
 * 추천/점수 판단 없음. 판정(pass/soft_flag/hard_block)만.
 */
function evaluateEntity(entity, asOfDate, weekId) {
  const ruleResults = [
    evalExchangeStatus(entity),
    evalNewlyListed(entity, asOfDate),
    evalLowPrice(entity),
    evalLowLiquidity(entity),
    evalOverheated(entity),
    evalNegativeEarnings(entity),
    evalAuditIssue(entity),
  ]

  const hasHardBlock = ruleResults.some(r => r.decision === 'hard_block')
  const hasSoftFlag  = ruleResults.some(r => r.decision === 'soft_flag')

  const overall_decision = hasHardBlock ? 'hard_block'
                         : hasSoftFlag  ? 'soft_flag'
                         : 'pass'

  const triggered_rules    = ruleResults.filter(r => r.triggered).map(r => r.rule)
  const unavailable_inputs = ruleResults.filter(r => r.decision === 'input_unavailable').map(r => r.rule)
  const not_applicable     = ruleResults.filter(r => r.decision === 'not_applicable').map(r => r.rule)

  // source_provenance: 어떤 소스에서 어떤 판단이 내려졌는지
  const source_provenance = {}
  for (const r of ruleResults) {
    if (r.source) source_provenance[r.rule] = r.source
  }

  return {
    ticker:           entity.ticker,
    name:             entity.name,
    asset_type:       entity.asset_type,
    market:           entity.market,
    sector_code:      entity.sector_code,
    overall_decision,
    triggered_rules,
    unavailable_inputs,
    not_applicable,
    rule_results:     ruleResults,
    source_provenance,
    _input_ref: `data/processed/${weekId}/normalized_entities.json`,
  }
}

// ── 요약 생성 ────────────────────────────────────────────────────────────────

function buildSummary(weekId, results) {
  const total      = results.length
  const hardBlocks = results.filter(r => r.overall_decision === 'hard_block')
  const softFlags  = results.filter(r => r.overall_decision === 'soft_flag')
  const passes     = results.filter(r => r.overall_decision === 'pass')

  const RULES = [
    'HF_EXCHANGE_STATUS', 'HF_NEWLY_LISTED', 'HF_LOW_PRICE',
    'HF_LOW_LIQUIDITY', 'HF_OVERHEATED', 'HF_NEGATIVE_EARNINGS', 'HF_AUDIT_ISSUE',
  ]

  const rule_trigger_counts    = {}
  const input_unavailable_counts = {}
  const not_applicable_counts  = {}

  for (const rule of RULES) {
    rule_trigger_counts[rule]      = results.filter(r => r.triggered_rules.includes(rule)).length
    input_unavailable_counts[rule] = results.filter(r => r.unavailable_inputs.includes(rule)).length
    not_applicable_counts[rule]    = results.filter(r => r.not_applicable.includes(rule)).length
  }

  return {
    week_id:        weekId,
    built_at:       new Date().toISOString(),
    schema_version: '1.0',
    source_ref:     `data/processed/${weekId}/normalized_entities.json`,
    total,
    by_decision: {
      hard_block: hardBlocks.length,
      soft_flag:  softFlags.length,
      pass:       passes.length,
    },
    rule_trigger_counts,
    input_unavailable_counts,
    not_applicable_counts,
    hard_block_tickers: hardBlocks.map(r => ({ ticker: r.ticker, name: r.name, triggered_rules: r.triggered_rules })),
    soft_flag_tickers:  softFlags.map(r => ({ ticker: r.ticker, name: r.name, triggered_rules: r.triggered_rules })),
    pass_tickers:       passes.map(r => r.ticker),
    _data_quality_notes: [
      'HF_NEWLY_LISTED: krx_listing KRX OAP 수집 불가. config/universe.json listing_date fallback 사용 중 — 공개 자료 기반 수동 입력값. KRX 정상화 후 재평가 권장.',
      'HF_OVERHEATED: 5일/20일 가격 이력 없음으로 전체 input_unavailable. 거래소 단기과열 지정은 HF_EXCHANGE_STATUS로 처리.',
      'HF_LOW_LIQUIDITY: 1일 거래대금 프록시 사용 — 20거래일 평균이 아님. 결과는 provisional.',
      'HF_NEGATIVE_EARNINGS: 한국가스공사(036460)·KB금융(105560) 별도재무제표 영업이익 미수집 — input_unavailable. 금융지주·공기업 계정과목 특성 기인.',
    ],
  }
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  const weekId = parseWeekIdArg() ?? getCurrentWeekId()
  const dryRun = isDryRun()

  console.log('\n🔍 Phase C-1 Hard Filter 판단 시작')
  console.log(`  week_id  : ${weekId}`)
  console.log(`  dry-run  : ${dryRun}`)
  console.log(`  입력     : data/processed/${weekId}/normalized_entities.json`)
  console.log(`  출력     : data/analysis/${weekId}/\n`)

  // processed 파일 존재 확인
  const entities = readProcessed(weekId, 'normalized_entities.json')
  if (!entities) {
    console.error(`❌ processed 데이터 없음: data/processed/${weekId}/normalized_entities.json`)
    console.error(`   먼저 Phase B-3 정규화를 실행하세요: npm run normalize:b3 -- --week-id ${weekId}`)
    process.exit(1)
  }

  console.log(`  로드된 엔티티: ${entities.record_count}건`)

  // 기준일 결정
  const priceAsOf = entities.records?.[0]?.price?.as_of
  const asOfDate  = parseDate(priceAsOf) ?? new Date()
  console.log(`  기준일: ${priceAsOf ?? '(오늘)'}`)
  console.log()

  // 각 엔티티 평가
  const results = entities.records.map(entity => evaluateEntity(entity, asOfDate, weekId))

  const hardBlockCount = results.filter(r => r.overall_decision === 'hard_block').length
  const softFlagCount  = results.filter(r => r.overall_decision === 'soft_flag').length
  const passCount      = results.filter(r => r.overall_decision === 'pass').length

  console.log(`  판정 결과: Hard Block ${hardBlockCount} / Soft Flag ${softFlagCount} / Pass ${passCount}`)
  console.log()

  const hardFilterResults = {
    week_id:        weekId,
    built_at:       new Date().toISOString(),
    schema_version: '1.0',
    source_ref:     `data/processed/${weekId}/normalized_entities.json`,
    total:          results.length,
    results,
  }

  const summary = buildSummary(weekId, results)

  if (!dryRun) {
    console.log('hard_filter_results.json 저장 중...')
    saveAnalysis(weekId, 'hard_filter_results.json', hardFilterResults)
    console.log('hard_filter_summary.json 저장 중...')
    saveAnalysis(weekId, 'hard_filter_summary.json', summary)
  } else {
    console.log('[dry-run] 저장하지 않음 — 결과 미리보기:')
    console.log('\n  === SUMMARY ===')
    console.log(JSON.stringify(summary, null, 2))
    console.log('\n  === 첫 번째 엔티티 판정 ===')
    console.log(JSON.stringify(results[0], null, 2))
  }

  console.log(`\n✅ Phase C-1 Hard Filter 완료`)
  console.log(`   Hard Block  : ${hardBlockCount}건`)
  console.log(`   Soft Flag   : ${softFlagCount}건`)
  console.log(`   Pass        : ${passCount}건`)
  if (hardBlockCount > 0) {
    const hb = results.filter(r => r.overall_decision === 'hard_block')
    hb.forEach(r => console.log(`   [BLOCK] ${r.ticker} ${r.name} — ${r.triggered_rules.join(', ')}`))
  }
  if (softFlagCount > 0) {
    const sf = results.filter(r => r.overall_decision === 'soft_flag')
    sf.forEach(r => console.log(`   [FLAG]  ${r.ticker} ${r.name} — ${r.triggered_rules.join(', ')}`))
  }
}

main().catch((err) => {
  console.error('\n💥 치명적 오류:', err.message)
  process.exit(1)
})

#!/usr/bin/env node
/**
 * scripts/generate-detail-reports.mjs
 *
 * current.json의 picks를 읽어 data/current/details/{type}_{ticker}.json 파일을 자동 생성한다.
 * 5종목 하드코딩 없음 — picks 배열을 순회해 동적으로 생성.
 * 재실행 시 덮어쓰기 허용.
 *
 * 입력 (우선순위 순):
 *   data/current/current.json                              ← 항상 필요
 *   data/analysis/{week_id}/scoring_results.json           ← 52주 위치, 재무 지표 (1차 소스)
 *   data/processed/{week_id}/normalized_entities.json      ← 52주 price fallback
 *
 * 출력:
 *   data/current/details/{asset_type}_{ticker}.json  (picks 수만큼)
 *
 * 사용법:
 *   node scripts/generate-detail-reports.mjs
 *   node scripts/generate-detail-reports.mjs --week-id 2026-W14
 *   npm run detail:generate -- --week-id 2026-W14
 *
 * ── 금지 사항 ─────────────────────────────────────────────────────────────────
 *   - data/current/current.json 수정 없음
 *   - data/archive/* 수정 없음
 *   - approval.json / manifest.json 수정 없음
 *   - 뉴스·수급·기술지표·peer 비교 미포함 (범위 외)
 *   - placeholder([예시], [편집 필요], TODO, 미구현, dummy) 금지
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const ROOT       = path.resolve(__dirname, '..')

// ─── 섹터 라벨 ───────────────────────────────────────────────────────────────
const SECTOR_LABELS = {
  TECH:         '테크',
  BATTERY:      '배터리',
  HEALTHCARE:   '헬스케어',
  FINANCE:      '금융',
  CONSUMER:     '소비재',
  INDUSTRIAL:   '산업재',
  MATERIAL:     '소재',
  ENERGY:       '에너지',
  TELECOM:      '통신',
  REALESTATE:   '부동산',
  ETF_DOMESTIC: 'ETF 국내',
  ETF_OVERSEAS: 'ETF 해외',
  ETF_BOND_DIV: 'ETF 채권·배당',
}

// ─── JSON 로더 (파일 없으면 null 반환) ───────────────────────────────────────
function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

// ─── 데이터 소스 로드 ─────────────────────────────────────────────────────────

/**
 * scoring_results.json에서 ticker → result 매핑 생성.
 * 52주 위치(market_position_score)와 재무(quality_score)가 이미 계산되어 있다.
 */
function loadScoringMap(weekId) {
  const p = path.join(ROOT, `data/analysis/${weekId}/scoring_results.json`)
  const raw = loadJson(p)
  if (!raw?.results) {
    console.warn(`  [warn] scoring_results.json 없음 (${weekId}) — 재무/52주 데이터는 fallback 처리됩니다.`)
    return {}
  }
  const map = {}
  for (const r of raw.results) map[r.ticker] = r
  console.log(`  [data] scoring_results.json 로드 완료 (${raw.results.length}건)`)
  return map
}

/**
 * normalized_entities.json에서 ticker → entity 매핑 생성 (52주 price fallback).
 */
function loadEntityMap(weekId) {
  const p = path.join(ROOT, `data/processed/${weekId}/normalized_entities.json`)
  const raw = loadJson(p)
  if (!raw?.records) return {}
  const map = {}
  for (const r of raw.records) map[r.ticker] = r
  return map
}

// ─── 포맷 헬퍼 ───────────────────────────────────────────────────────────────

/** KRW 원화 금액(숫자)을 조+억 단위 한국어 문자열로 변환. */
function fmtKrw(amountKrw) {
  if (amountKrw == null) return null
  const n = typeof amountKrw === 'number'
    ? Math.round(amountKrw)
    : parseInt(String(amountKrw).replace(/,/g, ''), 10)
  if (isNaN(n) || n === 0) return null

  const ukUnit = 100_000_000          // 1억
  const uk     = Math.round(n / ukUnit) // 억원 단위 (반올림)

  if (uk >= 10_000) {
    const jo   = Math.floor(uk / 10_000)
    const rest = uk % 10_000
    return rest === 0
      ? `${jo}조원`
      : `${jo}조 ${rest.toLocaleString('ko-KR')}억원`
  }
  return `${uk.toLocaleString('ko-KR')}억원`
}

// ─── 한국어 조사 헬퍼 ─────────────────────────────────────────────────────────
function getEunNeun(name) {
  const last = name[name.length - 1]
  const code = last.charCodeAt(0)
  if (code >= 0xAC00 && code <= 0xD7A3) {
    return (code - 0xAC00) % 28 !== 0 ? '은' : '는'
  }
  return /[AEIOUaeiou]/.test(last) ? '는' : '은'
}

// ─── 텍스트 분해 ─────────────────────────────────────────────────────────────
function splitToBullets(paragraph) {
  if (!paragraph?.trim()) return []
  return paragraph
    .split('. ')
    .map(s => s.replace(/[.。]+$/, '').trim())
    .filter(s => s.length > 3)
}

/** one_line_reason 텍스트에서 영업이익률 파싱 (scoring 데이터 없을 때 fallback). */
function extractMarginInfo(oneLineReason) {
  const m = oneLineReason.match(/영업이익률\s+([\d.]+%)\((\d{4})(?:,\s*([^)]+))?\)/)
  if (!m) return null
  return { pct: m[1], year: m[2], basis: m[3]?.trim() ?? '연결 기준' }
}

// ─── 필드 생성 함수 ───────────────────────────────────────────────────────────

/**
 * 가격 참고 구간 생성.
 * 소스: scoring_results.market_position_score > normalized_entities.price
 * week52_high/low/position_in_52w_pct: 구조화 데이터에서 직접 가져옴.
 * watch_low/high: current.json 값 사용 (null이면 null 유지 — 산출 근거 없음).
 */
function generatePriceReference(pick, scoringMap, entityMap) {
  let week52_high = null, week52_low = null, position_in_52w_pct = null

  // 1차: scoring_results (이미 계산된 값)
  const mps = scoringMap[pick.ticker]?.score_provenance?.market_position_score
  if (mps?.week52_high != null && mps?.week52_low != null) {
    week52_high          = Math.round(mps.week52_high)
    week52_low           = Math.round(mps.week52_low)
    position_in_52w_pct  = mps.week52_position_pct ?? null
  } else {
    // 2차 fallback: normalized_entities.price
    const price = entityMap[pick.ticker]?.price
    if (price?.week52_high != null && price?.week52_low != null && price?.close != null) {
      week52_high = Math.round(price.week52_high)
      week52_low  = Math.round(price.week52_low)
      const range = week52_high - week52_low
      position_in_52w_pct = range > 0
        ? Math.round((price.close - week52_low) / range * 100)
        : null
    }
  }

  return {
    reference_price:     pick.price_zone.reference_price,
    currency:            pick.price_zone.currency,
    watch_low:           pick.price_zone.watch_low  ?? null,
    watch_high:          pick.price_zone.watch_high ?? null,
    week52_high,
    week52_low,
    position_in_52w_pct,
  }
}

/**
 * ROE 계산.
 * 소스: normalized_entities.dart_financials.periods (reprt_code=11011 사업보고서만 사용)
 * 계산식: 당기순이익 / 평균자본총계 × 100
 *         평균자본총계 = (자본총계 당기 + 자본총계 전기) / 2
 *         전기 데이터 없을 때는 당기 자본총계만 사용 (기말 기준 단순 ROE)
 * 금융업 포함 가능 — 당기순이익·자본총계 모두 OFS(별도) 기준으로 수집됨.
 * 지주사는 별도 기준이므로 연결 기준 공시 수치와 차이가 있을 수 있음.
 * @returns {{ roe_pct: string, bsns_year: string, basis: string } | null}
 */
function computeROE(ticker, entityMap) {
  const periods = entityMap[ticker]?.dart_financials?.periods
  if (!Array.isArray(periods)) return null

  // 사업보고서(11011)만 사용, bsns_year 기준 중복 제거 (첫 번째 채택)
  const seen = new Set()
  const annuals = periods.filter(function(p) {
    if (p.reprt_code !== '11011') return false
    if (seen.has(p.bsns_year)) return false
    seen.add(p.bsns_year)
    return true
  })
  if (annuals.length === 0) return null

  const p   = annuals[0]  // 가장 최근 사업연도
  const fin = p.financials

  const parseKrw = function(s) {
    if (s == null) return null
    const n = parseInt(String(s).replace(/,/g, ''), 10)
    return isNaN(n) ? null : n
  }

  const netIncome  = parseKrw(fin['당기순이익']?.thstrm_amount)
  const equityCurr = parseKrw(fin['자본총계']?.thstrm_amount)
  const equityPrev = parseKrw(fin['자본총계']?.frmtrm_amount)

  if (netIncome == null || equityCurr == null || equityCurr === 0) return null

  const avgEquity = equityPrev != null ? (equityCurr + equityPrev) / 2 : equityCurr
  if (avgEquity === 0) return null

  return {
    roe_pct:   ((netIncome / avgEquity) * 100).toFixed(1) + '%',
    bsns_year: p.bsns_year,
    basis:     equityPrev != null ? '평균자본총계' : '기말자본총계',
  }
}

/**
 * 재무 요약 생성.
 * 소스:
 *   - 매출액·영업이익·영업이익률: scoring_results.quality_score (pre-computed)
 *   - ROE: normalized_entities.dart_financials.periods (당기순이익 / 평균자본총계)
 * 금융업(KB금융 등)은 영업이익/매출액이 없어 별도 안내하나, ROE는 계산 가능.
 * PER: market_cap_krw null(Yahoo Finance 미반환) → 산출 불가.
 * PBR: listed_shares 미확보(krx_listing KRX API 오류) + market_cap null → 산출 불가.
 */
function generateFinancialSummary(pick, scoringMap, entityMap) {
  const summary = {}
  const qs       = scoringMap[pick.ticker]?.score_provenance?.quality_score
  const roeResult = computeROE(pick.ticker, entityMap)

  if (roeResult) {
    summary.roe_pct = roeResult.roe_pct
  }

  const roeNote = roeResult
    ? `ROE: ${roeResult.bsns_year}년 사업보고서 별도 기준 (${roeResult.basis}).`
    : `ROE: 당기순이익 미수집으로 산출 불가.`
  const perPbrNote = `PER·PBR: 발행주식수·시가총액 미확보로 제공되지 않습니다.`

  if (qs?.status === 'scored' && qs.revenue_krw != null && qs.op_income_krw != null) {
    summary.revenue              = fmtKrw(qs.revenue_krw)
    summary.operating_income     = fmtKrw(qs.op_income_krw)
    summary.operating_margin_pct = `${parseFloat(qs.op_margin_pct).toFixed(1)}%`

    const year = qs.bsns_year ?? '2025'
    summary.schema_note = (
      `${year}년 DART 사업보고서(별도 재무제표) 기준. ` +
      `연결 기준 수치와 차이가 있을 수 있습니다. ` +
      `${roeNote} ${perPbrNote}`
    )
  } else if (qs?.status === 'unavailable') {
    // 금융업 등 영업이익/매출액 구조 상이 — ROE는 계산 가능
    const year = qs.bsns_year ?? '2025'
    summary.schema_note = (
      `금융업은 영업이익·매출액 구조가 일반 기업과 달라 직접 비교가 어렵습니다. ` +
      `${year}년 DART 사업보고서(별도) 기준. ` +
      `${roeNote} ${perPbrNote}`
    )
  } else {
    // scoring 데이터 없을 때 fallback: one_line_reason 텍스트 파싱
    const margin = extractMarginInfo(pick.one_line_reason)
    if (margin) {
      summary.operating_margin_pct = margin.pct
      summary.schema_note = (
        `영업이익률: ${margin.year}년 ${margin.basis}. ` +
        `매출액·영업이익은 이번 회차 데이터 미확보. ` +
        `${roeNote} ${perPbrNote}`
      )
    } else {
      summary.schema_note = `재무 지표를 불러올 수 없습니다. ${roeNote} ${perPbrNote}`
    }
  }

  return summary
}

/**
 * 기업 개요 (2~3문장).
 * 소스: name, sector, market, catalyst_summary, one_line_reason
 * DART 별도 기준 재무 데이터(scored)가 있으면 one_line_reason의 영업이익률 문장을 추가하지 않음.
 * 이유: scored 시 financial_summary 카드에 정확한 별도 기준 수치가 표시되므로
 *       one_line_reason 파싱값(연결 기준 등 다른 기준일 수 있음)과의 수치 혼재를 방지.
 */
function generateCompanyOverview(pick, scoringMap) {
  const sectorLabel = SECTOR_LABELS[pick.sector] ?? pick.sector
  const particle    = getEunNeun(pick.name)
  const sentences   = splitToBullets(pick.catalyst_summary)
  const first       = sentences[0] ?? ''
  const second      = sentences[1]?.length <= 50 ? sentences[1] : null

  // DART 별도 데이터 확보 시 one_line_reason 영업이익률 파싱 생략 (수치 모순 방지)
  const qs     = scoringMap[pick.ticker]?.score_provenance?.quality_score
  const scored = qs?.status === 'scored' && qs.revenue_krw != null
  const margin = scored ? null : extractMarginInfo(pick.one_line_reason)

  let overview = `${pick.name}${particle} ${sectorLabel} 분야 ${pick.market} 상장 기업으로, ${first}.`
  if (second) overview += ` ${second}.`
  if (margin) overview += ` 영업이익률 ${margin.pct}(${margin.year}년 ${margin.basis}) 수준의 수익 구조를 보이고 있다.`
  return overview
}

function generateBullPoints(pick, scoringMap) {
  const points = []

  // DART 별도 데이터 확보 시 one_line_reason 영업이익률 파싱 생략 (수치 모순 방지)
  // financial_summary 카드에 정확한 별도 기준 수치가 이미 표시되므로 중복·혼재 불필요.
  const qs     = scoringMap[pick.ticker]?.score_provenance?.quality_score
  const scored = qs?.status === 'scored' && qs.revenue_krw != null
  const margin = scored ? null : extractMarginInfo(pick.one_line_reason)

  if (margin) {
    points.push(`영업이익률 ${margin.pct}(${margin.year}년 ${margin.basis}) — 업종 내 수익성 강점`)
  }
  for (const b of splitToBullets(pick.catalyst_summary)) {
    // 영업이익률 언급 bullet은 제외 — scored 여부에 관계없이 financial_summary와 중복·충돌 방지
    if (b.includes('영업이익률')) continue
    points.push(b)
    if (points.length >= 4) break
  }
  return points
}

function generateBearPoints(pick) {
  return splitToBullets(pick.risk_summary).slice(0, 3)
}

// ─── 메인 detail 객체 생성 ────────────────────────────────────────────────────

function buildDetail(pick, report, scoringMap, entityMap) {
  return {
    detail_report_id:       `DET-${report.week_id}-${pick.ticker}`,
    report_id:              report.report_id,
    week_id:                report.week_id,
    ticker:                 pick.ticker,
    name:                   pick.name,
    sector:                 pick.sector,
    asset_type:             pick.asset_type,
    data_as_of:             report.data_as_of,
    linked_signal_ids:      [],

    company_overview:       generateCompanyOverview(pick, scoringMap),
    price_reference:        generatePriceReference(pick, scoringMap, entityMap),
    stance:                 pick.stance,

    bull_points:            generateBullPoints(pick, scoringMap),
    bear_points:            generateBearPoints(pick),
    catalysts_2_to_4_weeks: splitToBullets(pick.catalyst_summary),
    risks:                  splitToBullets(pick.risk_summary),

    financial_summary:      generateFinancialSummary(pick, scoringMap, entityMap),

    related_news:           [],
  }
}

// ─── placeholder 검증 ─────────────────────────────────────────────────────────
const FORBIDDEN = ['[예시]', '[편집 필요]', 'TODO', '미구현', 'dummy']

function checkPlaceholders(obj, ticker) {
  const str  = JSON.stringify(obj)
  const hits = FORBIDDEN.filter(kw => str.includes(kw))
  if (hits.length > 0) {
    console.error(`  [ERROR] ${ticker}: placeholder 발견 → ${hits.join(', ')}`)
    return false
  }
  return true
}

// ─── Entry point ──────────────────────────────────────────────────────────────

function main() {
  const args      = process.argv.slice(2)
  const widIdx    = args.indexOf('--week-id')
  const weekIdArg = widIdx !== -1 ? args[widIdx + 1] : null

  // current.json 로드
  const currentPath = path.join(ROOT, 'data/current/current.json')
  if (!fs.existsSync(currentPath)) {
    console.error('[ERROR] data/current/current.json not found. Aborting.')
    process.exit(1)
  }
  const report = loadJson(currentPath)

  if (weekIdArg && weekIdArg !== report.week_id) {
    console.warn(
      `[WARN] --week-id=${weekIdArg} 지정됐으나 current는 ${report.week_id}. ` +
      `${report.week_id} 기준으로 진행합니다.`
    )
  }

  console.log(`\n[generate-detail-reports] ${report.week_id} · picks: ${report.picks.length}\n`)

  // 구조화 데이터 소스 로드
  const scoringMap = loadScoringMap(report.week_id)
  const entityMap  = loadEntityMap(report.week_id)

  // 출력 디렉토리 보장
  const outDir = path.join(ROOT, 'data/current/details')
  fs.mkdirSync(outDir, { recursive: true })

  let successCount = 0
  let errorCount   = 0

  for (const pick of report.picks) {
    const detail   = buildDetail(pick, report, scoringMap, entityMap)
    const fileName = `${pick.asset_type}_${pick.ticker}.json`
    const outPath  = path.join(outDir, fileName)

    if (!checkPlaceholders(detail, pick.ticker)) {
      errorCount++
      continue
    }

    fs.writeFileSync(outPath, JSON.stringify(detail, null, 2), 'utf-8')
    console.log(`  ✓  ${fileName}  (${pick.name})`)
    successCount++
  }

  console.log(`\n[done] ${successCount} 파일 생성 완료 → data/current/details/`)
  if (errorCount > 0) {
    console.error(`[warn] ${errorCount} 파일 오류 — 위 ERROR 메시지 확인 필요`)
    process.exit(1)
  }
}

main()

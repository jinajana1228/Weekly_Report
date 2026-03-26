#!/usr/bin/env node
/**
 * scripts/collect-dart.mjs
 *
 * DART OpenAPI 데이터 수집 스크립트 (Phase B-2).
 * opendart.fss.or.kr API를 사용합니다.
 *
 * 수집 항목:
 *   1. 재무제표 (별도, 최근 2분기·연간)       → dart_financials.json
 *   2. 공시 목록 (최근 4주)                   → dart_disclosures.json
 *   3. 감사의견 (최근 사업연도)                → dart_audit.json
 *
 * 저장 경로: data/snapshots/{week_id}/dart_*.json
 *
 * 사용법:
 *   node scripts/collect-dart.mjs --week-id 2026-W14
 *   node scripts/collect-dart.mjs --week-id 2026-W14 --dry-run
 *   npm run collect:dart -- --week-id 2026-W14
 *
 * 환경 변수:
 *   DART_API_KEY  — DART OpenAPI 인증 키 (필수)
 *                   발급: https://opendart.fss.or.kr/intro/main.do
 *
 * 주의:
 *   - data/current, data/draft, data/archive를 수정하지 않습니다.
 *   - 일일 한도: 10,000건 (무료 기준). 종목당 약 3건 × 15종목 = 45건.
 *   - 각 항목은 독립적으로 실패 처리됩니다.
 *   - dart_corp_code가 null인 종목(ETF)은 자동 건너뜁니다.
 */

import { getActiveStocks, saveSnapshot, makeEnvelope, requireEnv, parseWeekIdArg, isDryRun, sleep } from './lib/snapshot.mjs'
import { getCurrentWeekId } from './lib/week-id.mjs'

// ── 설정 ──────────────────────────────────────────────────────────────────────

const DART_BASE = 'https://opendart.fss.or.kr/api'
const DART_DELAY_MS = 300  // 요청 간 0.3초 대기

// ── 유틸 ──────────────────────────────────────────────────────────────────────

/**
 * DART API GET 요청.
 * @param {string} endpoint  예: "/fnlttSinglAcnt.json"
 * @param {Record<string, string>} params
 * @param {string} apiKey
 * @returns {Promise<object>}
 */
async function dartGet(endpoint, params, apiKey) {
  const url = new URL(`${DART_BASE}${endpoint}`)
  url.searchParams.set('crtfc_key', apiKey)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`DART HTTP ${res.status}: ${endpoint}`)
  const json = await res.json()
  if (json.status !== '000' && json.status !== '013') {
    // 013 = 조회된 데이터 없음 (정상적인 빈 응답)
    throw new Error(`DART API 오류 [${json.status}]: ${json.message ?? endpoint}`)
  }
  return json
}

/**
 * 최근 N분기를 DART 분기 코드 배열로 반환합니다.
 * @param {number} count  몇 분기
 * @returns {Array<{ bsns_year: string, reprt_code: string }>}
 */
function getRecentQuarters(count = 2) {
  const quarters = []
  const now = new Date()
  let year = now.getFullYear()
  let q = Math.ceil((now.getMonth() + 1) / 3)

  // 한 분기 이전부터 시작 (현재 분기는 미확정 가능성)
  q--
  if (q <= 0) { q = 4; year-- }

  for (let i = 0; i < count; i++) {
    const reprt_code = { 1: '11013', 2: '11012', 3: '11014', 4: '11011' }[q]
    quarters.push({ bsns_year: String(year), reprt_code })
    q--
    if (q <= 0) { q = 4; year-- }
  }
  return quarters
}

/**
 * 공시 조회 시작일 (4주 전).
 * @returns {string} YYYYMMDD
 */
function getFourWeeksAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 28)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

// ── 수집 함수들 ────────────────────────────────────────────────────────────────

/**
 * 1. 재무제표 (별도 기준, 최근 2분기 + 최근 연간)
 */
async function collectFinancials(stocks, apiKey) {
  const records = []
  const errors = []

  const quarters = getRecentQuarters(2)
  // 연간 추가
  const annualYear = String(new Date().getFullYear() - 1)
  const periods = [
    ...quarters,
    { bsns_year: annualYear, reprt_code: '11011' },  // 사업보고서 (연간)
  ]

  for (const stock of stocks) {
    if (!stock.dart_corp_code) continue

    for (const period of periods) {
      try {
        const data = await dartGet('/fnlttSinglAcnt.json', {
          corp_code: stock.dart_corp_code,
          bsns_year: period.bsns_year,
          reprt_code: period.reprt_code,
          fs_div: 'OFS',  // 별도재무제표
        }, apiKey)

        const rows = data.list ?? []
        if (rows.length === 0) continue

        // 핵심 계정만 추출
        const keyAccounts = ['매출액', '영업이익', '당기순이익', '자산총계', '부채총계', '자본총계', '영업활동으로인한현금흐름']
        const financials = {}

        for (const row of rows) {
          if (keyAccounts.includes(row.account_nm)) {
            financials[row.account_nm] = {
              thstrm_amount: row.thstrm_amount,  // 당기
              frmtrm_amount: row.frmtrm_amount,  // 전기
            }
          }
        }

        records.push({
          ticker: stock.ticker,
          dart_corp_code: stock.dart_corp_code,
          bsns_year: period.bsns_year,
          reprt_code: period.reprt_code,
          fs_div: 'OFS',
          financials,
        })
        await sleep(DART_DELAY_MS)
      } catch (err) {
        errors.push({ ticker: stock.ticker, period: `${period.bsns_year}-${period.reprt_code}`, error: err.message })
      }
    }
  }

  return { records, errors }
}

/**
 * 2. 공시 목록 (최근 4주, 주요 공시 유형만)
 */
async function collectDisclosures(stocks, apiKey) {
  const records = []
  const errors = []

  const bgn_de = getFourWeeksAgo()
  // 주요 보고서 유형 코드 (DART 기준)
  const REPORT_TYPES = ['A', 'B', 'C', 'D', 'E', 'F']  // 정기공시, 주요사항, 발행공시, 지분공시, 기타, 외감법인

  for (const stock of stocks) {
    if (!stock.dart_corp_code) continue

    try {
      const data = await dartGet('/list.json', {
        corp_code: stock.dart_corp_code,
        bgn_de,
        end_de: new Date().toISOString().substring(0, 10).replace(/-/g, ''),
        pblntf_ty: 'A',  // 정기공시 (재무에 영향 있는 주요 공시)
        page_count: '20',
      }, apiKey)

      const list = data.list ?? []
      records.push({
        ticker: stock.ticker,
        dart_corp_code: stock.dart_corp_code,
        bgn_de,
        disclosures: list.map((d) => ({
          rcept_no: d.rcept_no,
          report_nm: d.report_nm,
          rcept_dt: d.rcept_dt,
          flr_nm: d.flr_nm,
          rm: d.rm ?? null,
        })),
      })
      await sleep(DART_DELAY_MS)
    } catch (err) {
      if (err.message.includes('[013]')) {
        // 공시 없음 — 정상
        records.push({ ticker: stock.ticker, dart_corp_code: stock.dart_corp_code, bgn_de, disclosures: [] })
      } else {
        errors.push({ ticker: stock.ticker, error: err.message })
      }
    }
  }

  return { records, errors }
}

/**
 * 3. 감사의견 (최근 사업연도 감사보고서)
 */
async function collectAudit(stocks, apiKey) {
  const records = []
  const errors = []

  const bsns_year = String(new Date().getFullYear() - 1)

  for (const stock of stocks) {
    if (!stock.dart_corp_code) continue

    try {
      const data = await dartGet('/fnlttAuditOpnn.json', {
        corp_code: stock.dart_corp_code,
        bsns_year,
        reprt_code: '11011',  // 사업보고서
      }, apiKey)

      const row = (data.list ?? [])[0] ?? null
      records.push({
        ticker: stock.ticker,
        dart_corp_code: stock.dart_corp_code,
        bsns_year,
        audit_opinion: row?.adtor ?? null,       // 감사의견 (적정/한정/부적정/의견거절)
        audit_firm: row?.adt_org ?? null,        // 감사법인명
        going_concern: row?.going_cncern ?? null, // 계속기업 관련 불확실성
      })
      await sleep(DART_DELAY_MS)
    } catch (err) {
      if (err.message.includes('[013]')) {
        records.push({ ticker: stock.ticker, dart_corp_code: stock.dart_corp_code, bsns_year, audit_opinion: null, error: '데이터 없음' })
      } else {
        errors.push({ ticker: stock.ticker, error: err.message })
      }
    }
  }

  return { records, errors }
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

async function main() {
  const weekId = parseWeekIdArg() ?? getCurrentWeekId()
  const dryRun = isDryRun()

  let apiKey
  try {
    apiKey = requireEnv('DART_API_KEY')
  } catch (err) {
    console.error(`\n❌ ${err.message}`)
    console.error('  .env.local에 DART_API_KEY를 추가하거나 환경 변수로 설정하세요.')
    console.error('  발급: https://opendart.fss.or.kr/intro/main.do')
    process.exit(1)
  }

  console.log(`\n📋 DART 데이터 수집 시작`)
  console.log(`  week_id : ${weekId}`)
  console.log(`  dry-run : ${dryRun}\n`)

  const stocks = getActiveStocks()
  const stocksWithDart = stocks.filter((s) => s.dart_corp_code)
  console.log(`  수집 대상: ${stocksWithDart.length}개 종목 (ETF 제외, dart_corp_code 있는 종목만)`)

  const asOf = new Date().toISOString().substring(0, 10)

  const summary = {
    week_id: weekId,
    as_of: asOf,
    started_at: new Date().toISOString(),
    results: {},
  }

  // 1. 재무제표
  console.log('1/3 재무제표 수집 중...')
  try {
    const { records, errors } = await collectFinancials(stocks, apiKey)
    const envelope = makeEnvelope({ weekId, source: 'DART_FINANCIALS', schemaVersion: '1.0', asOf, data: records })
    if (errors.length > 0) envelope._errors = errors
    if (!dryRun) saveSnapshot(weekId, 'dart_financials.json', envelope)
    else console.log(`  [dry-run] dart_financials.json — ${records.length}건, 오류 ${errors.length}건`)
    summary.results.financials = { count: records.length, errors: errors.length }
  } catch (err) {
    console.error(`  [실패] 재무제표 전체 오류: ${err.message}`)
    summary.results.financials = { count: 0, errors: 1, fatal: err.message }
  }

  // 2. 공시 목록
  console.log('2/3 공시 목록 수집 중...')
  try {
    const { records, errors } = await collectDisclosures(stocks, apiKey)
    const envelope = makeEnvelope({ weekId, source: 'DART_DISCLOSURES', schemaVersion: '1.0', asOf, data: records })
    if (errors.length > 0) envelope._errors = errors
    if (!dryRun) saveSnapshot(weekId, 'dart_disclosures.json', envelope)
    else console.log(`  [dry-run] dart_disclosures.json — ${records.length}건, 오류 ${errors.length}건`)
    summary.results.disclosures = { count: records.length, errors: errors.length }
  } catch (err) {
    console.error(`  [실패] 공시 목록 전체 오류: ${err.message}`)
    summary.results.disclosures = { count: 0, errors: 1, fatal: err.message }
  }

  // 3. 감사의견
  console.log('3/3 감사의견 수집 중...')
  try {
    const { records, errors } = await collectAudit(stocks, apiKey)
    const envelope = makeEnvelope({ weekId, source: 'DART_AUDIT', schemaVersion: '1.0', asOf, data: records })
    if (errors.length > 0) envelope._errors = errors
    if (!dryRun) saveSnapshot(weekId, 'dart_audit.json', envelope)
    else console.log(`  [dry-run] dart_audit.json — ${records.length}건, 오류 ${errors.length}건`)
    summary.results.audit = { count: records.length, errors: errors.length }
  } catch (err) {
    console.error(`  [실패] 감사의견 전체 오류: ${err.message}`)
    summary.results.audit = { count: 0, errors: 1, fatal: err.message }
  }

  summary.finished_at = new Date().toISOString()
  console.log('\n✅ DART 수집 완료')
  console.log(JSON.stringify(summary.results, null, 2))

  if (!dryRun) {
    saveSnapshot(weekId, 'dart_collection_summary.json', summary)
  }
}

main().catch((err) => {
  console.error('\n💥 치명적 오류:', err.message)
  process.exit(1)
})

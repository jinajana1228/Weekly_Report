#!/usr/bin/env node
/**
 * scripts/collect-krx.mjs
 *
 * KRX 데이터 수집 스크립트 (Phase B-2).
 * data.krx.co.kr OAP API를 사용합니다.
 *
 * 수집 항목:
 *   1. 시세 (OHLCV, 52주 고저)                → krx_price.json
 *   2. 수급 (외국인·기관 순매수)               → krx_flow.json
 *   3. 거래소 지정 종목 여부                    → krx_exchange_status.json
 *   4. 주요 지수 (KOSPI, KOSDAQ)               → krx_indices.json
 *   5. 상장 정보 (상장주식수, 시가총액)          → krx_listing.json
 *   6. ETF 기본 정보 (추적지수, 보수율)          → krx_etf_meta.json
 *
 * 저장 경로: data/snapshots/{week_id}/krx_*.json
 *
 * 사용법:
 *   node scripts/collect-krx.mjs --week-id 2026-W14
 *   node scripts/collect-krx.mjs --week-id 2026-W14 --dry-run
 *   npm run collect:krx -- --week-id 2026-W14
 *
 * 환경 변수 (불필요 — KRX OAP는 인증 불필요):
 *   없음
 *
 * 주의:
 *   - data/current, data/draft, data/archive를 수정하지 않습니다.
 *   - 각 항목은 독립적으로 실패 처리됩니다 (한 항목 실패 시 다음 항목 계속 진행).
 *   - KRX API의 basDd 파라미터는 YYYYMMDD 형식 (최근 영업일).
 */

import { getActiveTickers, getActiveETFs, saveSnapshot, makeEnvelope, parseWeekIdArg, isDryRun, sleep } from './lib/snapshot.mjs'
import { getCurrentWeekId } from './lib/week-id.mjs'

// ── 설정 ──────────────────────────────────────────────────────────────────────

const KRX_OAP_BASE = 'https://data.krx.co.kr/comm/bldAttendant/executeForResourceBundle.cmd'
const KRX_DELAY_MS = 500  // 요청 간 0.5초 대기 (rate limit 방지)

// KRX OAP bld 코드 (data.krx.co.kr 비공식 공개 엔드포인트)
const BLD = {
  OHLCV_STOCK:    'dbms/MDC/STAT/standard/MDCSTAT01501',  // 개별종목 시세 (KOSPI/KOSDAQ)
  FLOW_STOCK:     'dbms/MDC/STAT/standard/MDCSTAT02303',  // 투자자별 거래실적 (종목)
  EXCHANGE_LIST:  'dbms/MDC/STAT/standard/MDCSTAT30001',  // 투자경고·매매정지 종목
  INDEX_DAILY:    'dbms/MDC/STAT/standard/MDCSTAT00101',  // 주요 지수 시세
  LISTING_STOCK:  'dbms/MDC/STAT/standard/MDCSTAT03901',  // 전종목 상장정보
  ETF_META:       'dbms/MDC/STAT/standard/MDCSTAT04601',  // ETF 기본 정보
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────

/**
 * KRX OAP에 POST 요청을 보냅니다.
 * @param {string} bld
 * @param {Record<string, string>} params
 * @returns {Promise<object>}
 */
async function krxPost(bld, params) {
  const body = new URLSearchParams({ bld, ...params })
  const res = await fetch(KRX_OAP_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'WeeklyReport-DataCollector/1.0',
      'Referer': 'https://data.krx.co.kr/',
    },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`KRX HTTP ${res.status}: ${bld}`)
  const json = await res.json()
  // KRX OAP는 { OutBlock_1: [...] } 또는 { output: [...] } 구조
  return json
}

/**
 * 오늘 기준 최근 영업일을 YYYYMMDD 형식으로 반환합니다.
 * 토·일은 금요일로 이동합니다.
 * @returns {string}
 */
function getRecentBusinessDay() {
  const d = new Date()
  const day = d.getDay() // 0=일, 6=토
  if (day === 0) d.setDate(d.getDate() - 2)
  else if (day === 6) d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${dd}`
}

// ── 수집 함수들 ────────────────────────────────────────────────────────────────

/**
 * 1. 개별 종목 시세 (OHLCV, 52주 고저, 시가총액)
 */
async function collectPrice(tickers, basDd) {
  const records = []
  const errors = []

  for (const t of tickers) {
    try {
      const data = await krxPost(BLD.OHLCV_STOCK, {
        isuCd: t.ticker,
        strtDd: basDd,
        endDd: basDd,
        adjStkPrcYn: 'N',
      })
      const rows = data.OutBlock_1 ?? data.output ?? []
      if (rows.length === 0) {
        errors.push({ ticker: t.ticker, error: '데이터 없음' })
        continue
      }
      const row = rows[0]
      records.push({
        ticker: t.ticker,
        name: t.name,
        market: t.market,
        as_of: basDd,
        open: parseFloat(row.openPrc ?? row.TDD_OPNPRC ?? 0),
        high: parseFloat(row.highPrc ?? row.TDD_HGPRC ?? 0),
        low: parseFloat(row.lowPrc ?? row.TDD_LWPRC ?? 0),
        close: parseFloat(row.closPrc ?? row.TDD_CLSPRC ?? 0),
        volume: parseInt(row.trqu ?? row.ACC_TRDVOL ?? 0, 10),
        trade_value_krw: parseInt(row.trPrc ?? row.ACC_TRDVAL ?? 0, 10),
        market_cap_krw: parseInt(row.mktCap ?? row.MKTCAP ?? 0, 10),
        week52_high: parseFloat(row.hiPrc52W ?? 0),
        week52_low: parseFloat(row.lwPrc52W ?? 0),
      })
      await sleep(KRX_DELAY_MS)
    } catch (err) {
      errors.push({ ticker: t.ticker, error: err.message })
    }
  }

  return { records, errors }
}

/**
 * 2. 투자자별 수급 (외국인·기관 순매수)
 */
async function collectFlow(tickers, basDd) {
  const records = []
  const errors = []

  for (const t of tickers) {
    try {
      const data = await krxPost(BLD.FLOW_STOCK, {
        isuCd: t.ticker,
        strtDd: basDd,
        endDd: basDd,
        inqTpCd: '1',  // 순매수 기준
      })
      const rows = data.OutBlock_1 ?? data.output ?? []
      if (rows.length === 0) {
        errors.push({ ticker: t.ticker, error: '수급 데이터 없음' })
        continue
      }
      // 외국인·기관 행 찾기
      let foreign = null
      let institution = null
      for (const row of rows) {
        const name = row.invstNm ?? row.INVST_NM ?? ''
        if (name.includes('외국인')) foreign = row
        if (name.includes('기관') && !name.includes('소계')) institution = row
      }
      records.push({
        ticker: t.ticker,
        as_of: basDd,
        foreign_net_buy: parseInt(foreign?.netByShrQty ?? foreign?.NETBYSHR_QTY ?? 0, 10),
        foreign_net_buy_value_krw: parseInt(foreign?.netByAmt ?? foreign?.NETBYAMT ?? 0, 10),
        institution_net_buy: parseInt(institution?.netByShrQty ?? institution?.NETBYSHR_QTY ?? 0, 10),
        institution_net_buy_value_krw: parseInt(institution?.netByAmt ?? institution?.NETBYAMT ?? 0, 10),
      })
      await sleep(KRX_DELAY_MS)
    } catch (err) {
      errors.push({ ticker: t.ticker, error: err.message })
    }
  }

  return { records, errors }
}

/**
 * 3. 거래소 지정 종목 (투자경고·투자위험·매매정지 등)
 */
async function collectExchangeStatus(tickers, basDd) {
  const errors = []
  let designatedTickers = new Set()

  try {
    const data = await krxPost(BLD.EXCHANGE_LIST, { basDd })
    const rows = data.OutBlock_1 ?? data.output ?? []
    for (const row of rows) {
      const cd = row.isuCd ?? row.ISU_CD ?? ''
      if (cd) designatedTickers.add(cd.replace('KR7', '').substring(0, 6))
    }
  } catch (err) {
    errors.push({ source: 'exchange_list', error: err.message })
  }

  const records = tickers.map((t) => ({
    ticker: t.ticker,
    as_of: basDd,
    is_exchange_designated: designatedTickers.has(t.ticker),
  }))

  return { records, errors }
}

/**
 * 4. 주요 지수 (KOSPI, KOSDAQ)
 */
async function collectIndices(basDd) {
  const errors = []
  const records = []

  const targets = [
    { code: '1', name: 'KOSPI' },
    { code: '2', name: 'KOSDAQ' },
    { code: '3', name: 'KOSPI200' },
  ]

  for (const idx of targets) {
    try {
      const data = await krxPost(BLD.INDEX_DAILY, {
        idxIndCd: idx.code,
        strtDd: basDd,
        endDd: basDd,
      })
      const rows = data.OutBlock_1 ?? data.output ?? []
      if (rows.length === 0) {
        errors.push({ index: idx.name, error: '데이터 없음' })
        continue
      }
      const row = rows[0]
      records.push({
        index: idx.name,
        as_of: basDd,
        close: parseFloat(row.clspIdx ?? row.CLSPRC_IDX ?? 0),
        change: parseFloat(row.flucRt ?? row.FLUC_RT ?? 0),
        volume: parseInt(row.trqu ?? row.ACC_TRDVOL ?? 0, 10),
      })
      await sleep(KRX_DELAY_MS)
    } catch (err) {
      errors.push({ index: idx.name, error: err.message })
    }
  }

  return { records, errors }
}

/**
 * 5. 상장 정보 (상장주식수, 자본금)
 */
async function collectListing(tickers, basDd) {
  const errors = []
  let allListings = {}

  try {
    const data = await krxPost(BLD.LISTING_STOCK, { basDd })
    const rows = data.OutBlock_1 ?? data.output ?? []
    for (const row of rows) {
      const code = row.isuCd ?? row.ISU_SRT_CD ?? ''
      const srtCode = code.replace('KR7', '').substring(0, 6)
      allListings[srtCode] = row
    }
  } catch (err) {
    errors.push({ source: 'listing', error: err.message })
  }

  const records = tickers.map((t) => {
    const row = allListings[t.ticker]
    if (!row) return { ticker: t.ticker, as_of: basDd, error: '상장 정보 없음' }
    return {
      ticker: t.ticker,
      as_of: basDd,
      listed_shares: parseInt(row.listShrNum ?? row.LIST_SHRS ?? 0, 10),
      par_value_krw: parseInt(row.parVal ?? row.PAR_VAL ?? 0, 10),
      listing_date: row.listDd ?? row.LIST_DD ?? null,
    }
  })

  return { records, errors }
}

/**
 * 6. ETF 기본 정보 (추적지수, 보수율, 순자산)
 */
async function collectETFMeta(etfs, basDd) {
  const errors = []
  let allETF = {}

  try {
    const data = await krxPost(BLD.ETF_META, { basDd })
    const rows = data.OutBlock_1 ?? data.output ?? []
    for (const row of rows) {
      const code = row.isuCd ?? row.ISU_SRT_CD ?? ''
      const srtCode = code.replace('KR7', '').substring(0, 6)
      allETF[srtCode] = row
    }
  } catch (err) {
    errors.push({ source: 'etf_meta', error: err.message })
  }

  const records = etfs.map((t) => {
    const row = allETF[t.ticker]
    if (!row) return { ticker: t.ticker, as_of: basDd, error: 'ETF 메타 없음' }
    return {
      ticker: t.ticker,
      name: t.name,
      as_of: basDd,
      tracking_index: row.trcIdx ?? row.TRC_IDX ?? null,
      total_expense_ratio_pct: parseFloat(row.totFeeRate ?? row.TOT_FEE_RT ?? 0),
      nav: parseFloat(row.nav ?? row.NAV ?? 0),
      net_asset_krw: parseInt(row.netAstTotAmt ?? row.NETAST_TOTAMT ?? 0, 10),
    }
  })

  return { records, errors }
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

async function main() {
  const weekId = parseWeekIdArg() ?? getCurrentWeekId()
  const dryRun = isDryRun()
  const basDd = getRecentBusinessDay()

  console.log(`\n📊 KRX 데이터 수집 시작`)
  console.log(`  week_id : ${weekId}`)
  console.log(`  basDd   : ${basDd}`)
  console.log(`  dry-run : ${dryRun}\n`)

  const tickers = getActiveTickers()
  const etfs = getActiveETFs()
  const stocks = tickers.filter((t) => t.asset_type === 'stock')

  const summary = {
    week_id: weekId,
    bas_dd: basDd,
    started_at: new Date().toISOString(),
    results: {},
  }

  // 1. 시세
  console.log('1/6 시세 (OHLCV) 수집 중...')
  try {
    const { records, errors } = await collectPrice(tickers, basDd)
    const envelope = makeEnvelope({ weekId, source: 'KRX_OHLCV', schemaVersion: '1.0', asOf: basDd, data: records })
    if (errors.length > 0) envelope._errors = errors
    if (!dryRun) saveSnapshot(weekId, 'krx_price.json', envelope)
    else console.log(`  [dry-run] krx_price.json — ${records.length}건, 오류 ${errors.length}건`)
    summary.results.price = { count: records.length, errors: errors.length }
  } catch (err) {
    console.error(`  [실패] 시세 수집 전체 오류: ${err.message}`)
    summary.results.price = { count: 0, errors: 1, fatal: err.message }
  }

  // 2. 수급
  console.log('2/6 수급 (외국인·기관) 수집 중...')
  try {
    const { records, errors } = await collectFlow(tickers, basDd)
    const envelope = makeEnvelope({ weekId, source: 'KRX_FLOW', schemaVersion: '1.0', asOf: basDd, data: records })
    if (errors.length > 0) envelope._errors = errors
    if (!dryRun) saveSnapshot(weekId, 'krx_flow.json', envelope)
    else console.log(`  [dry-run] krx_flow.json — ${records.length}건, 오류 ${errors.length}건`)
    summary.results.flow = { count: records.length, errors: errors.length }
  } catch (err) {
    console.error(`  [실패] 수급 수집 전체 오류: ${err.message}`)
    summary.results.flow = { count: 0, errors: 1, fatal: err.message }
  }

  // 3. 거래소 지정
  console.log('3/6 거래소 지정 종목 확인 중...')
  try {
    const { records, errors } = await collectExchangeStatus(tickers, basDd)
    const envelope = makeEnvelope({ weekId, source: 'KRX_EXCHANGE_STATUS', schemaVersion: '1.0', asOf: basDd, data: records })
    if (errors.length > 0) envelope._errors = errors
    if (!dryRun) saveSnapshot(weekId, 'krx_exchange_status.json', envelope)
    else console.log(`  [dry-run] krx_exchange_status.json — ${records.length}건, 오류 ${errors.length}건`)
    summary.results.exchange_status = { count: records.length, errors: errors.length }
  } catch (err) {
    console.error(`  [실패] 거래소 지정 수집 전체 오류: ${err.message}`)
    summary.results.exchange_status = { count: 0, errors: 1, fatal: err.message }
  }

  // 4. 지수
  console.log('4/6 주요 지수 (KOSPI, KOSDAQ) 수집 중...')
  try {
    const { records, errors } = await collectIndices(basDd)
    const envelope = makeEnvelope({ weekId, source: 'KRX_INDICES', schemaVersion: '1.0', asOf: basDd, data: records })
    if (errors.length > 0) envelope._errors = errors
    if (!dryRun) saveSnapshot(weekId, 'krx_indices.json', envelope)
    else console.log(`  [dry-run] krx_indices.json — ${records.length}건, 오류 ${errors.length}건`)
    summary.results.indices = { count: records.length, errors: errors.length }
  } catch (err) {
    console.error(`  [실패] 지수 수집 전체 오류: ${err.message}`)
    summary.results.indices = { count: 0, errors: 1, fatal: err.message }
  }

  // 5. 상장 정보
  console.log('5/6 상장 정보 수집 중...')
  try {
    const { records, errors } = await collectListing(tickers, basDd)
    const envelope = makeEnvelope({ weekId, source: 'KRX_LISTING', schemaVersion: '1.0', asOf: basDd, data: records })
    if (errors.length > 0) envelope._errors = errors
    if (!dryRun) saveSnapshot(weekId, 'krx_listing.json', envelope)
    else console.log(`  [dry-run] krx_listing.json — ${records.length}건, 오류 ${errors.length}건`)
    summary.results.listing = { count: records.length, errors: errors.length }
  } catch (err) {
    console.error(`  [실패] 상장 정보 수집 전체 오류: ${err.message}`)
    summary.results.listing = { count: 0, errors: 1, fatal: err.message }
  }

  // 6. ETF 메타
  console.log('6/6 ETF 기본 정보 수집 중...')
  try {
    const { records, errors } = await collectETFMeta(etfs, basDd)
    const envelope = makeEnvelope({ weekId, source: 'KRX_ETF_META', schemaVersion: '1.0', asOf: basDd, data: records })
    if (errors.length > 0) envelope._errors = errors
    if (!dryRun) saveSnapshot(weekId, 'krx_etf_meta.json', envelope)
    else console.log(`  [dry-run] krx_etf_meta.json — ${records.length}건, 오류 ${errors.length}건`)
    summary.results.etf_meta = { count: records.length, errors: errors.length }
  } catch (err) {
    console.error(`  [실패] ETF 메타 수집 전체 오류: ${err.message}`)
    summary.results.etf_meta = { count: 0, errors: 1, fatal: err.message }
  }

  // 요약
  summary.finished_at = new Date().toISOString()
  console.log('\n✅ KRX 수집 완료')
  console.log(JSON.stringify(summary.results, null, 2))

  // 수집 요약도 저장
  if (!dryRun) {
    saveSnapshot(weekId, 'krx_collection_summary.json', summary)
  }
}

main().catch((err) => {
  console.error('\n💥 치명적 오류:', err.message)
  process.exit(1)
})

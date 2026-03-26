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

// KRX OAP — exchange_status / listing / ETF_meta 수집에 사용.
// 주의: data.krx.co.kr는 브라우저 세션(JSESSIONID)이 필요해 price/flow/indices는
//       Node.js fetch 환경에서 HTML 오류페이지를 반환합니다.
//       price/indices는 Yahoo Finance (.KS/.KQ)로 대체 수집합니다.
//       flow(수급)는 KRX 공식 API 신청 전까지 자동 수집 불가입니다.
const KRX_OAP_BASE = 'https://data.krx.co.kr/comm/bldAttendant/executeForResourceBundle.cmd'
const KRX_DELAY_MS = 500

// Yahoo Finance — KR 주식 시세·지수 수집 (이미 collect-market-indicators.mjs에서 사용 중인 소스)
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'
const YAHOO_DELAY_MS = 300

const BLD = {
  EXCHANGE_LIST: 'dbms/MDC/STAT/standard/MDCSTAT30001',  // 투자경고·매매정지 종목
  LISTING_STOCK: 'dbms/MDC/STAT/standard/MDCSTAT03901',  // 전종목 상장정보
  ETF_META:      'dbms/MDC/STAT/standard/MDCSTAT04601',  // ETF 기본 정보
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────

/**
 * KRX OAP에 POST 요청을 보냅니다.
 * exchange_status / listing / ETF_meta 수집에 사용됩니다.
 * price / flow / indices에는 사용하지 않습니다 (브라우저 세션 필요).
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
  return json
}

/**
 * Yahoo Finance에서 한국 주식/지수 시세를 가져옵니다.
 * 한국 주식: {ticker}.KS (KOSPI) / {ticker}.KQ (KOSDAQ)
 * 한국 지수: ^KS11 (KOSPI), ^KQ11 (KOSDAQ), ^KS200 (KOSPI200)
 */
async function yahooKrQuote(symbol) {
  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=5d`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}: ${symbol}`)
  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`Yahoo ${symbol}: chart result 없음`)
  return result
}

/**
 * 시장 코드에서 Yahoo Finance suffix를 반환합니다.
 */
function getYahooSuffix(market) {
  if (market === 'KOSDAQ') return '.KQ'
  return '.KS'  // KOSPI, ETF 모두 .KS
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
 * 1. 개별 종목 시세 — Yahoo Finance (.KS/.KQ) 경유
 * KRX OAP는 브라우저 세션이 필요해 Node.js CLI에서 접근 불가.
 * Yahoo Finance는 collect-market-indicators.mjs에서 이미 사용 중인 소스입니다.
 */
async function collectPrice(tickers, basDd) {
  const records = []
  const errors = []

  for (const t of tickers) {
    const sym = t.ticker + getYahooSuffix(t.market)
    try {
      const result = await yahooKrQuote(sym)
      const meta = result.meta
      records.push({
        ticker: t.ticker,
        name: t.name,
        market: t.market,
        yahoo_symbol: sym,
        as_of: basDd,
        close: meta.regularMarketPrice ?? null,
        open: meta.regularMarketOpen ?? null,
        high: meta.regularMarketDayHigh ?? null,
        low: meta.regularMarketDayLow ?? null,
        prev_close: meta.regularMarketPreviousClose ?? null,
        volume: meta.regularMarketVolume ?? null,
        market_cap_krw: meta.marketCap ?? null,
        week52_high: meta.fiftyTwoWeekHigh ?? null,
        week52_low: meta.fiftyTwoWeekLow ?? null,
      })
      await sleep(YAHOO_DELAY_MS)
    } catch (err) {
      errors.push({ ticker: t.ticker, symbol: sym, error: err.message })
    }
  }

  return { records, errors }
}

/**
 * 2. 투자자별 수급 (외국인·기관 순매수) — Phase B-2에서 수집 불가
 * KRX OAP 수급 엔드포인트는 브라우저 세션이 필요합니다.
 * Yahoo Finance 등 대체 소스에 수급 데이터가 없습니다.
 * KRX 공식 REST API 신청(openkrx.or.kr) 후 Phase B-3 또는 C에서 구현 예정.
 */
async function collectFlow(_tickers, _basDd) {
  return {
    records: [],
    errors: [{
      source: 'KRX_FLOW',
      error: 'KRX OAP 브라우저 세션 필요 — Node.js CLI 자동 수집 불가. KRX 공식 API 신청(openkrx.or.kr) 또는 수동 확인 필요.',
    }],
    _unavailable: true,
  }
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
 * 4. 주요 지수 (KOSPI, KOSDAQ, KOSPI200) — Yahoo Finance 경유
 * KRX OAP 지수 엔드포인트도 브라우저 세션이 필요합니다.
 * Yahoo Finance 심볼: ^KS11 (KOSPI), ^KQ11 (KOSDAQ), ^KS200 (KOSPI200)
 */
async function collectIndices(basDd) {
  const errors = []
  const records = []

  const targets = [
    { symbol: '^KS11',  name: 'KOSPI' },
    { symbol: '^KQ11',  name: 'KOSDAQ' },
    { symbol: '^KS200', name: 'KOSPI200' },
  ]

  for (const idx of targets) {
    try {
      const result = await yahooKrQuote(idx.symbol)
      const meta = result.meta
      const close = meta.regularMarketPrice ?? null
      const prevClose = meta.regularMarketPreviousClose ?? null
      records.push({
        index: idx.name,
        yahoo_symbol: idx.symbol,
        as_of: basDd,
        close,
        prev_close: prevClose,
        change_pct: (close && prevClose)
          ? parseFloat(((close - prevClose) / prevClose * 100).toFixed(2))
          : null,
        volume: meta.regularMarketVolume ?? null,
      })
      await sleep(YAHOO_DELAY_MS)
    } catch (err) {
      errors.push({ index: idx.name, symbol: idx.symbol, error: err.message })
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

  // 1. 시세 (Yahoo Finance .KS/.KQ 경유)
  console.log('1/6 시세 수집 중 (Yahoo Finance .KS/.KQ)...')
  try {
    const { records, errors } = await collectPrice(tickers, basDd)
    const envelope = makeEnvelope({ weekId, source: 'YAHOO_PRICE_KR', schemaVersion: '1.0', asOf: basDd, data: records })
    if (errors.length > 0) envelope._errors = errors
    if (!dryRun) saveSnapshot(weekId, 'krx_price.json', envelope)
    else console.log(`  [dry-run] krx_price.json — ${records.length}건, 오류 ${errors.length}건`)
    summary.results.price = { count: records.length, errors: errors.length }
  } catch (err) {
    console.error(`  [실패] 시세 수집 전체 오류: ${err.message}`)
    summary.results.price = { count: 0, errors: 1, fatal: err.message }
  }

  // 2. 수급 — KRX OAP 세션 필요로 Phase B-2에서 수집 불가
  console.log('2/6 수급 (KRX 직접 세션 필요 — 수집 불가, 빈 파일 저장)...')
  try {
    const { records, errors, _unavailable } = await collectFlow(tickers, basDd)
    const envelope = makeEnvelope({ weekId, source: 'KRX_FLOW_UNAVAILABLE', schemaVersion: '1.0', asOf: basDd, data: records })
    envelope._collection_note = 'KRX OAP 브라우저 세션 필요 — Phase B-2 자동 수집 불가. KRX 공식 API(openkrx.or.kr) 신청 후 구현 예정.'
    if (errors.length > 0) envelope._errors = errors
    if (!dryRun) saveSnapshot(weekId, 'krx_flow.json', envelope)
    else console.log(`  [dry-run] krx_flow.json — 수집 불가 명시, 빈 데이터`)
    summary.results.flow = { count: 0, unavailable: true, reason: 'KRX_OAP_SESSION_REQUIRED' }
  } catch (err) {
    console.error(`  [실패] 수급 처리 오류: ${err.message}`)
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

  // 4. 지수 (Yahoo Finance ^KS11/^KQ11/^KS200 경유)
  console.log('4/6 주요 지수 수집 중 (Yahoo Finance ^KS11/^KQ11/^KS200)...')
  try {
    const { records, errors } = await collectIndices(basDd)
    const envelope = makeEnvelope({ weekId, source: 'YAHOO_INDICES_KR', schemaVersion: '1.0', asOf: basDd, data: records })
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

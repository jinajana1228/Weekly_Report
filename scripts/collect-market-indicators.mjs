#!/usr/bin/env node
/**
 * scripts/collect-market-indicators.mjs
 *
 * 거시 지표 수집 스크립트 (Phase B-2).
 * ECOS (한국은행) + FRED (연준) + Yahoo Finance (보조) 세 소스를 통합합니다.
 *
 * 수집 항목:
 *   [ECOS]
 *     - USD/KRW 환율 (기준환율)                   → market_indicators.json > ecos
 *     - 한국은행 기준금리                           → market_indicators.json > ecos
 *   [FRED]
 *     - 미국 10년물 국채 금리 (DGS10)              → market_indicators.json > fred
 *     - 미국 연방기금금리 (FEDFUNDS)               → market_indicators.json > fred
 *   [Yahoo Finance — 보조]
 *     - S&P 500 지수 (^GSPC)                      → market_indicators.json > yahoo
 *     - NASDAQ 종합 (^IXIC)                        → market_indicators.json > yahoo
 *     - VIX 변동성 지수 (^VIX)                     → market_indicators.json > yahoo
 *
 * 저장 경로: data/snapshots/{week_id}/market_indicators.json
 *
 * 사용법:
 *   node scripts/collect-market-indicators.mjs --week-id 2026-W14
 *   node scripts/collect-market-indicators.mjs --week-id 2026-W14 --dry-run
 *   npm run collect:market -- --week-id 2026-W14
 *
 * 환경 변수:
 *   ECOS_API_KEY  — 한국은행 ECOS API 키 (필수)
 *                   발급: https://ecos.bok.or.kr/api/#/DevGuide/APIKeyApplication
 *   FRED_API_KEY  — FRED API 키 (필수)
 *                   발급: https://fred.stlouisfed.org/docs/api/api_key.html
 *
 * 주의:
 *   - Yahoo Finance는 비공식 엔드포인트. 차단 시 해당 항목만 실패 처리됩니다.
 *   - Yahoo Finance 데이터는 Hard Filter 판단에 사용하지 않습니다 (보조 참고용).
 *   - data/current, data/draft, data/archive를 수정하지 않습니다.
 */

import { saveSnapshot, makeEnvelope, requireEnv, parseWeekIdArg, isDryRun } from './lib/snapshot.mjs'
import { getCurrentWeekId } from './lib/week-id.mjs'

// ── 설정 ──────────────────────────────────────────────────────────────────────

const ECOS_BASE = 'https://ecos.bok.or.kr/api'
const FRED_BASE = 'https://api.stlouisfed.org/fred'

// ── ECOS ──────────────────────────────────────────────────────────────────────

/**
 * ECOS API에서 최근 N건 데이터를 가져옵니다.
 * @param {string} statCode   통계표 코드
 * @param {string} itemCode   항목 코드
 * @param {string} period     주기 ('D'=일, 'M'=월, 'Q'=분기)
 * @param {number} recentN    최근 N건
 * @param {string} apiKey
 * @returns {Promise<Array<{ time: string, value: string }>>}
 */
async function ecosGet(statCode, itemCode, period, recentN, apiKey) {
  // 기간 범위: 충분히 넓게 (최근 60일 또는 12개월)
  const now = new Date()
  const end = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const start = (() => {
    const d = new Date(now)
    if (period === 'D') d.setDate(d.getDate() - 60)
    else d.setMonth(d.getMonth() - 12)
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  })()

  const url = `${ECOS_BASE}/StatisticSearch/${apiKey}/json/kr/1/${recentN}/${statCode}/${period}/${start}/${end}/${itemCode}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ECOS HTTP ${res.status}: ${statCode}`)
  const json = await res.json()

  if (json.RESULT) {
    const code = json.RESULT.CODE
    if (code !== 'INFO-000') throw new Error(`ECOS 오류 [${code}]: ${json.RESULT.MESSAGE}`)
  }

  const rows = json.StatisticSearch?.row ?? []
  return rows.map((r) => ({ time: r.TIME, value: r.DATA_VALUE }))
}

async function collectEcos(apiKey) {
  const results = {}
  const errors = []
  const asOf = new Date().toISOString().substring(0, 10)

  // USD/KRW 환율 (통계표: 731Y001, 항목: 0000001)
  try {
    const rows = await ecosGet('731Y001', '0000001', 'D', 1, apiKey)
    const latest = rows[rows.length - 1] ?? null
    results.usd_krw = {
      label: 'USD/KRW 기준환율',
      stat_code: '731Y001',
      time: latest?.time ?? null,
      value: latest ? parseFloat(latest.value) : null,
    }
  } catch (err) {
    errors.push({ indicator: 'USD/KRW', error: err.message })
    results.usd_krw = { label: 'USD/KRW 기준환율', error: err.message }
  }

  // 한국은행 기준금리 (통계표: 722Y001, 항목: 0101000)
  try {
    const rows = await ecosGet('722Y001', '0101000', 'M', 1, apiKey)
    const latest = rows[rows.length - 1] ?? null
    results.bok_rate = {
      label: '한국은행 기준금리',
      stat_code: '722Y001',
      time: latest?.time ?? null,
      value: latest ? parseFloat(latest.value) : null,
      unit: '%',
    }
  } catch (err) {
    errors.push({ indicator: 'BOK_RATE', error: err.message })
    results.bok_rate = { label: '한국은행 기준금리', error: err.message }
  }

  return { data: results, errors, as_of: asOf }
}

// ── FRED ──────────────────────────────────────────────────────────────────────

/**
 * FRED API에서 최근 관측값을 가져옵니다.
 * @param {string} seriesId   예: "DGS10"
 * @param {string} apiKey
 * @returns {Promise<{ date: string, value: number|null }>}
 */
async function fredGetLatest(seriesId, apiKey) {
  const url = new URL(`${FRED_BASE}/series/observations`)
  url.searchParams.set('series_id', seriesId)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('file_type', 'json')
  url.searchParams.set('sort_order', 'desc')
  url.searchParams.set('limit', '5')  // 최근 5건 (결측값 스킵용)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}: ${seriesId}`)
  const json = await res.json()

  // FRED는 결측값을 "." 으로 표현
  const obs = (json.observations ?? []).find((o) => o.value !== '.')
  if (!obs) throw new Error(`FRED ${seriesId}: 유효한 관측값 없음`)
  return { date: obs.date, value: parseFloat(obs.value) }
}

async function collectFred(apiKey) {
  const results = {}
  const errors = []
  const asOf = new Date().toISOString().substring(0, 10)

  // 미국 10년물 국채 금리
  try {
    const obs = await fredGetLatest('DGS10', apiKey)
    results.us_10y_treasury = {
      label: '미국 10년물 국채 금리',
      series_id: 'DGS10',
      date: obs.date,
      value: obs.value,
      unit: '%',
    }
  } catch (err) {
    errors.push({ indicator: 'DGS10', error: err.message })
    results.us_10y_treasury = { label: '미국 10년물 국채 금리', error: err.message }
  }

  // 미국 연방기금금리 (실효)
  try {
    const obs = await fredGetLatest('FEDFUNDS', apiKey)
    results.fed_funds_rate = {
      label: '미국 연방기금금리 (실효)',
      series_id: 'FEDFUNDS',
      date: obs.date,
      value: obs.value,
      unit: '%',
    }
  } catch (err) {
    errors.push({ indicator: 'FEDFUNDS', error: err.message })
    results.fed_funds_rate = { label: '미국 연방기금금리 (실효)', error: err.message }
  }

  return { data: results, errors, as_of: asOf }
}

// ── Yahoo Finance (보조) ───────────────────────────────────────────────────────

/**
 * Yahoo Finance 비공식 API로 지수 현재가를 가져옵니다.
 * 비공식 엔드포인트이므로 실패 시 조용히 null 반환합니다.
 * @param {string} symbol   예: "^GSPC"
 * @returns {Promise<{ price: number, change_pct: number } | null>}
 */
async function yahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}: ${symbol}`)
  const json = await res.json()
  const meta = json?.chart?.result?.[0]?.meta
  if (!meta) throw new Error(`Yahoo ${symbol}: 메타 데이터 없음`)

  const price = meta.regularMarketPrice ?? null
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null
  const change_pct = (price && prevClose) ? ((price - prevClose) / prevClose * 100) : null

  return {
    price: price ? parseFloat(price.toFixed(2)) : null,
    change_pct: change_pct ? parseFloat(change_pct.toFixed(2)) : null,
  }
}

async function collectYahoo() {
  const results = {}
  const errors = []
  const asOf = new Date().toISOString().substring(0, 10)

  const targets = [
    { symbol: '^GSPC', label: 'S&P 500' },
    { symbol: '^IXIC', label: 'NASDAQ 종합' },
    { symbol: '^VIX',  label: 'VIX 변동성 지수' },
  ]

  for (const t of targets) {
    try {
      const quote = await yahooQuote(t.symbol)
      results[t.symbol] = { label: t.label, symbol: t.symbol, ...quote }
    } catch (err) {
      errors.push({ symbol: t.symbol, error: err.message })
      results[t.symbol] = { label: t.label, symbol: t.symbol, price: null, change_pct: null, error: err.message }
    }
  }

  return { data: results, errors, as_of: asOf }
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

async function main() {
  const weekId = parseWeekIdArg() ?? getCurrentWeekId()
  const dryRun = isDryRun()

  let ecosKey, fredKey
  try {
    ecosKey = requireEnv('ECOS_API_KEY')
  } catch {
    console.warn('  ⚠️  ECOS_API_KEY 없음 — ECOS 항목을 건너뜁니다.')
    ecosKey = null
  }
  try {
    fredKey = requireEnv('FRED_API_KEY')
  } catch {
    console.warn('  ⚠️  FRED_API_KEY 없음 — FRED 항목을 건너뜁니다.')
    fredKey = null
  }

  console.log(`\n🌐 거시 지표 수집 시작`)
  console.log(`  week_id : ${weekId}`)
  console.log(`  dry-run : ${dryRun}`)
  console.log(`  ECOS    : ${ecosKey ? '✓' : '건너뜀'}`)
  console.log(`  FRED    : ${fredKey ? '✓' : '건너뜀'}`)
  console.log(`  Yahoo   : ✓ (보조, 항상 시도)\n`)

  const asOf = new Date().toISOString().substring(0, 10)

  const payload = {
    week_id: weekId,
    collected_at: new Date().toISOString(),
    source: 'ECOS+FRED+YAHOO',
    schema_version: '1.0',
    as_of: asOf,
    ecos: null,
    fred: null,
    yahoo: null,
    _collection_errors: [],
  }

  // ECOS
  if (ecosKey) {
    console.log('1/3 ECOS (USD/KRW, 기준금리) 수집 중...')
    try {
      const result = await collectEcos(ecosKey)
      payload.ecos = result.data
      if (result.errors.length > 0) payload._collection_errors.push(...result.errors)
      console.log(`  완료 — 오류 ${result.errors.length}건`)
    } catch (err) {
      console.error(`  [실패] ECOS 전체 오류: ${err.message}`)
      payload._collection_errors.push({ source: 'ECOS', error: err.message })
    }
  } else {
    console.log('1/3 ECOS 건너뜀 (키 없음)')
  }

  // FRED
  if (fredKey) {
    console.log('2/3 FRED (미국 10년물, FFR) 수집 중...')
    try {
      const result = await collectFred(fredKey)
      payload.fred = result.data
      if (result.errors.length > 0) payload._collection_errors.push(...result.errors)
      console.log(`  완료 — 오류 ${result.errors.length}건`)
    } catch (err) {
      console.error(`  [실패] FRED 전체 오류: ${err.message}`)
      payload._collection_errors.push({ source: 'FRED', error: err.message })
    }
  } else {
    console.log('2/3 FRED 건너뜀 (키 없음)')
  }

  // Yahoo
  console.log('3/3 Yahoo Finance (S&P500, NASDAQ, VIX) 수집 중...')
  try {
    const result = await collectYahoo()
    payload.yahoo = result.data
    if (result.errors.length > 0) payload._collection_errors.push(...result.errors)
    console.log(`  완료 — 오류 ${result.errors.length}건`)
  } catch (err) {
    console.error(`  [실패] Yahoo 전체 오류: ${err.message}`)
    payload._collection_errors.push({ source: 'YAHOO', error: err.message })
  }

  // 저장
  if (!dryRun) {
    saveSnapshot(weekId, 'market_indicators.json', payload)
  } else {
    console.log('\n  [dry-run] market_indicators.json — 저장하지 않음')
    console.log(JSON.stringify(payload, null, 2))
  }

  const errCount = payload._collection_errors.length
  console.log(`\n✅ 거시 지표 수집 완료 — 오류 ${errCount}건`)
}

main().catch((err) => {
  console.error('\n💥 치명적 오류:', err.message)
  process.exit(1)
})

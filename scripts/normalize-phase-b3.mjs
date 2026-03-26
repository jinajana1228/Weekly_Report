#!/usr/bin/env node
/**
 * scripts/normalize-phase-b3.mjs
 *
 * Phase B-3 정규화/변환 스크립트.
 * data/snapshots/{week_id}/ 원천 데이터를
 * data/processed/{week_id}/ 정규화된 중간 데이터로 변환합니다.
 *
 * 생성 파일:
 *   data/processed/{week_id}/normalized_entities.json  — 종목/ETF 단위 통합 데이터
 *   data/processed/{week_id}/market_context.json       — 시장 지표 요약
 *   data/processed/{week_id}/source_health.json        — 수집 품질/가용성 정리
 *
 * 사용법:
 *   node scripts/normalize-phase-b3.mjs --week-id 2026-W14
 *   node scripts/normalize-phase-b3.mjs --week-id 2026-W14 --dry-run
 *   npm run normalize:b3 -- --week-id 2026-W14
 *
 * 금지 사항 (이 스크립트는 다음을 구현하지 않습니다):
 *   - 추천/Hard Filter 판단 로직
 *   - 종목 점수 계산
 *   - current/draft/archive 생성 또는 수정
 *   - snapshots 덮어쓰기
 */

import {
  getActiveTickers,
  readSnapshot,
  parseWeekIdArg,
  isDryRun,
} from './lib/snapshot.mjs'
import { getCurrentWeekId } from './lib/week-id.mjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PROCESSED_DIR = path.join(ROOT, 'data/processed')

// ── processed 저장 유틸 ──────────────────────────────────────────────────────

function saveProcessed(weekId, filename, payload) {
  const dir = path.join(PROCESSED_DIR, weekId)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, filename)
  const content = JSON.stringify(payload, null, 2)
  fs.writeFileSync(filePath, content, 'utf-8')
  const sizeKb = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1)
  console.log(`  [저장] ${path.relative(ROOT, filePath)} (${sizeKb} KB)`)
}

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────

/**
 * 배열을 ticker 키 Map(단일 레코드)으로 변환합니다.
 * @param {Array} arr
 * @returns {Map<string, object>}
 */
function indexByTicker(arr) {
  const map = new Map()
  if (!Array.isArray(arr)) return map
  for (const item of arr) {
    if (item.ticker) map.set(item.ticker, item)
  }
  return map
}

/**
 * 배열을 ticker 키 Map(복수 레코드 배열)으로 변환합니다.
 * @param {Array} arr
 * @returns {Map<string, Array>}
 */
function groupByTicker(arr) {
  const map = new Map()
  if (!Array.isArray(arr)) return map
  for (const item of arr) {
    if (!item.ticker) continue
    if (!map.has(item.ticker)) map.set(item.ticker, [])
    map.get(item.ticker).push(item)
  }
  return map
}

// ── 1. normalized_entities.json ──────────────────────────────────────────────
//
// 유니버스 기준으로 모든 종목/ETF의 원천 데이터를 ticker 단위로 결합합니다.
// 우선순위: config/universe.json (기준) → krx_price → dart → krx_listing 등
// unavailable 상태는 null로 사라지게 하지 않고 명시적으로 기록합니다.

function buildNormalizedEntities(weekId) {
  const tickers = getActiveTickers()

  // 원천 스냅샷 로드
  const priceSnap      = readSnapshot(weekId, 'krx_price.json')
  const listingSnap    = readSnapshot(weekId, 'krx_listing.json')
  const exStatusSnap   = readSnapshot(weekId, 'krx_exchange_status.json')
  const flowSnap       = readSnapshot(weekId, 'krx_flow.json')
  const financialsSnap = readSnapshot(weekId, 'dart_financials.json')
  const disclosureSnap = readSnapshot(weekId, 'dart_disclosures.json')
  const auditSnap      = readSnapshot(weekId, 'dart_audit.json')
  const etfMetaSnap    = readSnapshot(weekId, 'krx_etf_meta.json')

  // ticker 기준 색인
  const priceMap      = indexByTicker(priceSnap?.data)
  const listingMap    = indexByTicker(listingSnap?.data)
  const exStatusMap   = indexByTicker(exStatusSnap?.data)
  const financialsMap = groupByTicker(financialsSnap?.data)
  const disclosureMap = indexByTicker(disclosureSnap?.data)
  const auditMap      = indexByTicker(auditSnap?.data)
  const etfMetaMap    = indexByTicker(etfMetaSnap?.data)

  // flow는 전사 unavailable
  const flowNote = flowSnap?._collection_note ?? 'KRX OAP 브라우저 세션 필요 — 자동 수집 불가'

  const records = tickers.map((t) => {
    const entity = {
      ticker:      t.ticker,
      name:        t.name,
      asset_type:  t.asset_type,
      market:      t.market,
      sector_code: t.sector,
    }

    // ── 가격 (source: krx_price / Yahoo Finance .KS/.KQ) ──────────────────
    const pr = priceMap.get(t.ticker)
    if (!pr) {
      entity.price = { status: 'unavailable', reason: '스냅샷 없음', source: 'krx_price' }
    } else {
      entity.price = {
        close:          pr.close          ?? null,
        open:           pr.open           ?? null,
        high:           pr.high           ?? null,
        low:            pr.low            ?? null,
        prev_close:     pr.prev_close     ?? null,
        volume:         pr.volume         ?? null,
        market_cap_krw: pr.market_cap_krw ?? null,
        week52_high:    pr.week52_high    ?? null,
        week52_low:     pr.week52_low     ?? null,
        as_of:          pr.as_of          ?? null,
        source: 'krx_price',
        price_provider: 'yahoo_finance',  // provenance: Yahoo Finance .KS/.KQ
      }
    }

    // ── 상장 정보 (source: krx_listing / KRX OAP) ──────────────────────────
    const lr = listingMap.get(t.ticker)
    if (!lr || lr.error) {
      entity.listing = {
        status: 'unavailable',
        reason: lr?.error ?? '스냅샷 없음 — KRX OAP 브라우저 세션 필요',
        source: 'krx_listing',
      }
    } else {
      entity.listing = {
        listed_shares: lr.listed_shares ?? null,
        listing_date:  lr.listing_date  ?? null,
        as_of:         lr.as_of         ?? null,
        source: 'krx_listing',
      }
    }

    // ── 투자경고/매매정지 (source: krx_exchange_status / KRX OAP) ──────────
    const er = exStatusMap.get(t.ticker)
    if (!er) {
      entity.exchange_status = {
        status: 'unavailable',
        reason: '스냅샷 없음',
        source: 'krx_exchange_status',
      }
    } else {
      entity.exchange_status = {
        is_exchange_designated: er.is_exchange_designated ?? null,
        as_of: er.as_of ?? null,
        source: 'krx_exchange_status',
      }
    }

    // ── 수급 (flow) — 전사 unavailable ────────────────────────────────────
    entity.flow = {
      status: 'unavailable',
      reason: flowNote,
      source: 'krx_flow',
    }

    // ── DART (stock 전용, dart_corp_code 있는 경우) ───────────────────────
    if (t.asset_type === 'stock' && t.dart_corp_code) {
      // 재무제표 (source: dart_financials)
      const finRecs = financialsMap.get(t.ticker) ?? []
      entity.dart_financials = {
        period_count: finRecs.length,
        periods: finRecs.map((r) => ({
          bsns_year:   r.bsns_year   ?? null,
          reprt_code:  r.reprt_code  ?? null,
          fs_div:      r.fs_div      ?? null,
          financials:  r.financials  ?? null,
        })),
        source: 'dart_financials',
      }

      // 공시 목록 (source: dart_disclosures)
      const disc = disclosureMap.get(t.ticker)
      if (!disc) {
        entity.dart_disclosures = {
          status: 'unavailable',
          reason: '스냅샷 없음',
          source: 'dart_disclosures',
        }
      } else {
        entity.dart_disclosures = {
          bgn_de:  disc.bgn_de              ?? null,
          count:   disc.disclosures?.length ?? 0,
          recent:  (disc.disclosures ?? []).slice(0, 5),  // 최근 5건
          source: 'dart_disclosures',
        }
      }

      // 감사의견 (source: dart_audit)
      const aud = auditMap.get(t.ticker)
      if (!aud) {
        entity.dart_audit = {
          status: 'unavailable',
          reason: '스냅샷 없음',
          source: 'dart_audit',
        }
      } else {
        entity.dart_audit = {
          bsns_year:      aud.bsns_year      ?? null,
          audit_opinion:  aud.audit_opinion  ?? null,
          audit_firm:     aud.audit_firm     ?? null,
          going_concern:  aud.going_concern  ?? null,
          _note:          aud._note          ?? null,
          source: 'dart_audit',
        }
      }

      entity.etf_meta = null  // stock에는 해당 없음
    } else if (t.asset_type === 'etf') {
      // ETF는 DART 해당 없음
      entity.dart_financials = null
      entity.dart_disclosures = null
      entity.dart_audit = null

      // ETF 메타 (source: krx_etf_meta / KRX OAP)
      const em = etfMetaMap.get(t.ticker)
      if (!em || em.error) {
        entity.etf_meta = {
          status: 'unavailable',
          reason: em?.error ?? '스냅샷 없음 — KRX OAP 브라우저 세션 필요',
          source: 'krx_etf_meta',
        }
      } else {
        entity.etf_meta = {
          tracking_index:      em.tracking_index      ?? null,
          total_expense_ratio: em.total_expense_ratio ?? null,
          nav:                 em.nav                 ?? null,
          as_of:               em.as_of               ?? null,
          source: 'krx_etf_meta',
        }
      }
    }

    return entity
  })

  return {
    week_id:        weekId,
    built_at:       new Date().toISOString(),
    schema_version: '1.0',
    source_refs: {
      price:           `data/snapshots/${weekId}/krx_price.json`,
      listing:         `data/snapshots/${weekId}/krx_listing.json`,
      exchange_status: `data/snapshots/${weekId}/krx_exchange_status.json`,
      flow:            `data/snapshots/${weekId}/krx_flow.json`,
      dart_financials: `data/snapshots/${weekId}/dart_financials.json`,
      dart_disclosures:`data/snapshots/${weekId}/dart_disclosures.json`,
      dart_audit:      `data/snapshots/${weekId}/dart_audit.json`,
      etf_meta:        `data/snapshots/${weekId}/krx_etf_meta.json`,
    },
    record_count: records.length,
    records,
  }
}

// ── 2. market_context.json ───────────────────────────────────────────────────
//
// KR 지수, 거시지표(ECOS/FRED), 글로벌 보조 지수(Yahoo)를 한 파일로 정리합니다.
// Yahoo 데이터는 보조 참고용 — Hard Filter 판단에 사용 불가.

function buildMarketContext(weekId) {
  const indicesSnap = readSnapshot(weekId, 'krx_indices.json')
  const miSnap      = readSnapshot(weekId, 'market_indicators.json')

  // KR 지수 (source: krx_indices / Yahoo Finance ^KS11 등)
  const idxData = indicesSnap?.data ?? []
  const idxMap  = new Map(idxData.map((r) => [r.index, r]))

  const buildIndex = (name) => {
    const r = idxMap.get(name)
    if (!r) return { status: 'unavailable', reason: '스냅샷 없음', source: 'krx_indices' }
    return {
      close:      r.close      ?? null,
      prev_close: r.prev_close ?? null,
      change_pct: r.change_pct ?? null,
      volume:     r.volume     ?? null,
      as_of:      r.as_of      ?? null,
      source: 'krx_indices',
      price_provider: 'yahoo_finance',  // provenance
    }
  }

  // 한국 거시지표 (source: ecos / ECOS 한국은행 API)
  const ecos = miSnap?.ecos ?? null
  const kr_macro = {
    usd_krw: ecos?.usd_krw?.value != null
      ? {
          value:  ecos.usd_krw.value,
          time:   ecos.usd_krw.time ?? null,
          unit:   'KRW',
          source: 'ecos',
        }
      : { status: 'unavailable', reason: ecos?.usd_krw?.error ?? 'ECOS 수집 실패 또는 키 없음', source: 'ecos' },

    bok_rate: ecos?.bok_rate?.value != null
      ? {
          value:  ecos.bok_rate.value,
          time:   ecos.bok_rate.time ?? null,
          unit:   '%',
          source: 'ecos',
        }
      : { status: 'unavailable', reason: ecos?.bok_rate?.error ?? 'ECOS 수집 실패 또는 키 없음', source: 'ecos' },
  }

  // 미국 거시지표 (source: fred / FRED 연준 API)
  const fred = miSnap?.fred ?? null
  const us_macro = {
    us_10y_treasury: fred?.us_10y_treasury?.value != null
      ? {
          value:  fred.us_10y_treasury.value,
          date:   fred.us_10y_treasury.date ?? null,
          unit:   '%',
          source: 'fred',
        }
      : { status: 'unavailable', reason: fred?.us_10y_treasury?.error ?? 'FRED 수집 실패 또는 키 없음', source: 'fred' },

    fed_funds_rate: fred?.fed_funds_rate?.value != null
      ? {
          value:  fred.fed_funds_rate.value,
          date:   fred.fed_funds_rate.date ?? null,
          unit:   '%',
          source: 'fred',
        }
      : { status: 'unavailable', reason: fred?.fed_funds_rate?.error ?? 'FRED 수집 실패 또는 키 없음', source: 'fred' },
  }

  // 글로벌 보조 지수 (source: yahoo / Yahoo Finance — 보조 참고용)
  const yahoo = miSnap?.yahoo ?? null
  const buildYahooIndex = (symbol) => {
    const r = yahoo?.[symbol]
    if (!r || (r.price === null && r.error)) {
      return {
        status: 'unavailable',
        reason: r?.error ?? '보조 데이터 없음',
        source: 'yahoo',
        _note: '보조 참고용 — Hard Filter 판단에 사용 불가',
      }
    }
    return {
      price:      r.price      ?? null,
      change_pct: r.change_pct ?? null,
      source: 'yahoo',
      _note: '보조 참고용 — Hard Filter 판단에 사용 불가',
    }
  }

  return {
    week_id:        weekId,
    built_at:       new Date().toISOString(),
    schema_version: '1.0',
    source_refs: {
      kr_indices:         `data/snapshots/${weekId}/krx_indices.json`,
      market_indicators:  `data/snapshots/${weekId}/market_indicators.json`,
    },
    kr_indices: {
      kospi:    buildIndex('KOSPI'),
      kosdaq:   buildIndex('KOSDAQ'),
      kospi200: buildIndex('KOSPI200'),
    },
    kr_macro,
    us_macro,
    global_equities: {
      sp500:  buildYahooIndex('^GSPC'),
      nasdaq: buildYahooIndex('^IXIC'),
      vix:    buildYahooIndex('^VIX'),
    },
  }
}

// ── 3. source_health.json ────────────────────────────────────────────────────
//
// source별 수집 상태를 정리해 후속 로직이 어떤 데이터를 신뢰할 수 있는지 명시합니다.
// status: "ok" | "partial" | "unavailable"

function buildSourceHealth(weekId) {
  const sources = {}

  // ── 배열 data 기반 스냅샷 분석 ─────────────────────────────────────────
  const arraySnaps = [
    { key: 'krx_price',           file: 'krx_price.json' },
    { key: 'krx_exchange_status', file: 'krx_exchange_status.json' },
    { key: 'krx_indices',         file: 'krx_indices.json' },
    { key: 'krx_listing',         file: 'krx_listing.json' },
    { key: 'krx_etf_meta',        file: 'krx_etf_meta.json' },
    { key: 'dart_financials',     file: 'dart_financials.json' },
    { key: 'dart_disclosures',    file: 'dart_disclosures.json' },
    { key: 'dart_audit',          file: 'dart_audit.json' },
  ]

  for (const { key, file } of arraySnaps) {
    const snap = readSnapshot(weekId, file)
    if (!snap) {
      sources[key] = { status: 'unavailable', reason: '파일 없음' }
      continue
    }
    const data         = snap.data ?? []
    const envelopeErrs = snap._errors ?? []
    const dataErrCount = data.filter((r) => r.error).length
    const total        = data.length
    const totalErrors  = envelopeErrs.length + dataErrCount

    if (total === 0 && totalErrors === 0) {
      // 빈 data지만 오류도 없음 — 수집 자체는 됐으나 데이터 없음
      sources[key] = { status: 'ok', record_count: 0, error_count: 0 }
    } else if (total > 0 && dataErrCount === total) {
      // 전체 레코드가 error 필드를 가짐 → unavailable
      sources[key] = {
        status: 'unavailable',
        reason: data[0]?.error ?? '전체 레코드 오류',
        record_count: total,
        error_count: totalErrors,
      }
    } else if (totalErrors > 0) {
      sources[key] = { status: 'partial', record_count: total, error_count: totalErrors }
    } else {
      sources[key] = { status: 'ok', record_count: total, error_count: 0 }
    }
  }

  // ── KRX flow — 명시적 unavailable ─────────────────────────────────────
  const flowSnap = readSnapshot(weekId, 'krx_flow.json')
  sources.krx_flow = {
    status: 'unavailable',
    reason: flowSnap?._collection_note ?? 'KRX OAP 브라우저 세션 필요 — Phase B-2 자동 수집 불가',
    record_count: 0,
    _phase_note: 'KRX 공식 API(openkrx.or.kr) 신청 후 Phase B-3 또는 C에서 구현 예정',
  }

  // ── market_indicators — 소스별 분리 분석 ─────────────────────────────
  const miSnap = readSnapshot(weekId, 'market_indicators.json')
  if (!miSnap) {
    sources.ecos         = { status: 'unavailable', reason: 'market_indicators.json 없음' }
    sources.fred         = { status: 'unavailable', reason: 'market_indicators.json 없음' }
    sources.yahoo_market = { status: 'unavailable', reason: 'market_indicators.json 없음' }
  } else {
    // ECOS
    const ecos = miSnap.ecos
    if (!ecos) {
      sources.ecos = { status: 'unavailable', reason: 'ECOS API 키 없음 또는 수집 건너뜀' }
    } else {
      const hasErr = Object.values(ecos).some((v) => v?.error)
      sources.ecos = {
        status:     hasErr ? 'partial' : 'ok',
        indicators: Object.keys(ecos),
      }
    }

    // FRED
    const fred = miSnap.fred
    if (!fred) {
      sources.fred = { status: 'unavailable', reason: 'FRED API 키 없음 또는 수집 건너뜀' }
    } else {
      const hasErr = Object.values(fred).some((v) => v?.error)
      sources.fred = {
        status:     hasErr ? 'partial' : 'ok',
        indicators: Object.keys(fred),
      }
    }

    // Yahoo (보조)
    const yahoo = miSnap.yahoo
    if (!yahoo) {
      sources.yahoo_market = { status: 'unavailable', reason: 'Yahoo 수집 실패' }
    } else {
      const hasErr = Object.values(yahoo).some((v) => v?.error || v?.price === null)
      sources.yahoo_market = {
        status:     hasErr ? 'partial' : 'ok',
        indicators: Object.keys(yahoo),
        _note: '보조 참고용 — Hard Filter 판단에 사용 불가',
      }
    }
  }

  // ── 신뢰 가능 필드 요약 ─────────────────────────────────────────────────
  const trustable   = []
  const partial     = []
  const unavailable = []

  for (const [key, val] of Object.entries(sources)) {
    if (val.status === 'ok')          trustable.push(key)
    else if (val.status === 'partial') partial.push(key)
    else unavailable.push({ source: key, reason: val.reason ?? '이유 미상' })
  }

  return {
    week_id:        weekId,
    built_at:       new Date().toISOString(),
    schema_version: '1.0',
    sources,
    summary: {
      trustable,
      partial,
      unavailable,
      _notes: [
        'krx_flow: KRX OAP 브라우저 세션 문제. Phase B-3/C에서 대체 수단 구현 예정.',
        'krx_listing/krx_etf_meta: KRX OAP 동일 세션 문제로 현재 unavailable. 가격/지수는 Yahoo Finance로 대체 수집 중.',
        'yahoo_market: 비공식 엔드포인트 — 차단 가능성. Hard Filter 판단에 사용 불가.',
      ],
    },
  }
}

// ── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  const weekId = parseWeekIdArg() ?? getCurrentWeekId()
  const dryRun = isDryRun()

  console.log('\n🔄 Phase B-3 정규화/변환 시작')
  console.log(`  week_id  : ${weekId}`)
  console.log(`  dry-run  : ${dryRun}`)
  console.log(`  입력     : data/snapshots/${weekId}/`)
  console.log(`  출력     : data/processed/${weekId}/\n`)

  // 스냅샷 디렉토리 존재 여부 확인
  const snapDir = path.join(ROOT, 'data/snapshots', weekId)
  if (!fs.existsSync(snapDir)) {
    console.error(`❌ 스냅샷 없음: data/snapshots/${weekId}/`)
    console.error(`   먼저 Phase B-2 수집을 실행하세요: npm run collect:all -- --week-id ${weekId}`)
    process.exit(1)
  }

  let ok = 0
  let fail = 0

  // 1/3 normalized_entities.json
  console.log('1/3 종목/ETF 단위 정규화 데이터 생성 중...')
  try {
    const entities = buildNormalizedEntities(weekId)
    if (!dryRun) {
      saveProcessed(weekId, 'normalized_entities.json', entities)
    } else {
      console.log(`  [dry-run] normalized_entities.json — ${entities.record_count}건`)
      console.log('  첫 번째 레코드 샘플:')
      console.log(JSON.stringify(entities.records?.[0], null, 2))
    }
    console.log(`  완료 — ${entities.record_count}건`)
    ok++
  } catch (err) {
    console.error(`  [실패] normalized_entities: ${err.message}`)
    fail++
  }

  // 2/3 market_context.json
  console.log('2/3 시장 요약 정규화 데이터 생성 중...')
  try {
    const market = buildMarketContext(weekId)
    if (!dryRun) {
      saveProcessed(weekId, 'market_context.json', market)
    } else {
      console.log('  [dry-run] market_context.json')
      console.log(JSON.stringify(market, null, 2))
    }
    console.log('  완료')
    ok++
  } catch (err) {
    console.error(`  [실패] market_context: ${err.message}`)
    fail++
  }

  // 3/3 source_health.json
  console.log('3/3 수집 품질/가용성 정리 중...')
  try {
    const health = buildSourceHealth(weekId)
    if (!dryRun) {
      saveProcessed(weekId, 'source_health.json', health)
    } else {
      console.log('  [dry-run] source_health.json')
      console.log(JSON.stringify(health, null, 2))
    }
    console.log('  완료')
    ok++
  } catch (err) {
    console.error(`  [실패] source_health: ${err.message}`)
    fail++
  }

  console.log(`\n${fail === 0 ? '✅' : '⚠️'} Phase B-3 정규화 완료 — 성공 ${ok}/3, 실패 ${fail}/3`)
  if (!dryRun && ok > 0) {
    console.log(`  출력: data/processed/${weekId}/`)
  }
  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error('\n💥 치명적 오류:', err.message)
  process.exit(1)
})

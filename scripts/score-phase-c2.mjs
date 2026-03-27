#!/usr/bin/env node
/**
 * scripts/score-phase-c2.mjs
 *
 * Phase C-2 스코어링/우선순위화 스크립트.
 *
 * 입력:
 *   data/analysis/{week_id}/hard_filter_results.json   (Phase C-1 산출물)
 *   data/processed/{week_id}/normalized_entities.json  (Phase B-3 산출물)
 *
 * 출력:
 *   data/analysis/{week_id}/scoring_results.json   — 엔티티별 점수 상세
 *   data/analysis/{week_id}/scoring_summary.json   — 전체 요약 + 상위 순위
 *
 * ── 점수 구조 (0~100) ──────────────────────────────────────────────────────────
 *   total_score = quality_score(0~40)
 *               + liquidity_score(0~30)
 *               + market_position_score(0~30)
 *               + penalty_score(0 이하, max -20)
 *
 *   quality_score       — 영업이익률 기반 수익성 (DART 연간 사업보고서)
 *   liquidity_score     — 1일 거래대금 프록시 기반 시장 유동성 (Yahoo Finance)
 *   market_position_score — 52주 가격 포지션 기반 모멘텀 (Yahoo Finance)
 *   penalty_score       — Soft Flag 감점 (자동 제외 아님)
 *
 * ── 금지 사항 ──────────────────────────────────────────────────────────────────
 *   - picks 확정 없음
 *   - draft/current/archive 접근 없음
 *   - approval 연동 없음
 *   - 뉴스 연동 없음
 *
 * 사용법:
 *   node scripts/score-phase-c2.mjs --week-id 2026-W14
 *   node scripts/score-phase-c2.mjs --week-id 2026-W14 --dry-run
 *   npm run score:c2 -- --week-id 2026-W14
 */

import { parseWeekIdArg, isDryRun } from './lib/snapshot.mjs'
import { getCurrentWeekId } from './lib/week-id.mjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT         = path.resolve(__dirname, '..')
const PROCESSED_DIR = path.join(ROOT, 'data/processed')
const ANALYSIS_DIR  = path.join(ROOT, 'data/analysis')

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function saveAnalysis(weekId, filename, payload) {
  const dir      = path.join(ANALYSIS_DIR, weekId)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, filename)
  const content  = JSON.stringify(payload, null, 2)
  fs.writeFileSync(filePath, content, 'utf-8')
  const sizeKb = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1)
  console.log(`  [저장] ${path.relative(ROOT, filePath)} (${sizeKb} KB)`)
}

/**
 * "23,603,619,000,000" 또는 "-1,234,567" → 숫자. 파싱 불가 → null.
 */
function parseKrwAmount(str) {
  if (str === null || str === undefined || str === '') return null
  const n = parseFloat(String(str).replace(/,/g, '').trim())
  return isNaN(n) ? null : n
}

// ── 점수 계산 함수 ────────────────────────────────────────────────────────────

/**
 * quality_score (0~40)
 *
 * 기업 수익성을 영업이익률(영업이익 / 매출액)로 평가합니다.
 * 데이터 출처: DART 연간 사업보고서(reprt_code=11011)
 *
 * 기준:
 *   영업이익률 ≥ 20%  → 40  (우수: NAVER ~28%, 셀트리온 ~31% 등)
 *   영업이익률 10~20% → 32  (양호: 삼성전자 ~10%, HD현대중공업 ~12%)
 *   영업이익률  5~10% → 24  (보통: SK텔레콤 ~7%)
 *   영업이익률  0~ 5% → 16  (저마진: 삼성물산 ~3%, CJ제일제당 ~3%)
 *   영업이익률  < 0%  →  5  (적자: LG에너지솔루션 -17%)
 *   데이터 없음/ETF   → 20  (중립값)
 */
function computeQualityScore(entity) {
  if (entity.asset_type === 'etf') {
    return {
      score:  20,
      basis:  'ETF — 영업이익 개념 없음, 중립값(20) 적용',
      status: 'neutral_etf',
      source: null,
    }
  }

  const fin = entity.dart_financials
  if (!fin || fin.period_count === 0) {
    return {
      score:  20,
      basis:  '재무제표 없음 — 중립값(20) 적용',
      status: 'unavailable',
      source: 'dart_financials',
    }
  }

  const annuals = fin.periods
    .filter(p => p.reprt_code === '11011')
    .sort((a, b) => Number(b.bsns_year) - Number(a.bsns_year))

  const la = annuals[0] ?? null
  if (!la) {
    return {
      score:  20,
      basis:  '연간 사업보고서(11011) 없음 — 중립값(20) 적용',
      status: 'unavailable',
      source: 'dart_financials',
    }
  }

  const opInc  = parseKrwAmount(la.financials?.['영업이익']?.thstrm_amount)
  const revenue = parseKrwAmount(la.financials?.['매출액']?.thstrm_amount)

  if (opInc === null || revenue === null || revenue === 0) {
    return {
      score:     20,
      basis:     `${la.bsns_year}년 영업이익 또는 매출액 없음 — 중립값(20) 적용`,
      status:    'unavailable',
      source:    'dart_financials',
      bsns_year: la.bsns_year,
    }
  }

  const margin = opInc / revenue
  let score
  if (margin >= 0.20)      score = 40
  else if (margin >= 0.10) score = 32
  else if (margin >= 0.05) score = 24
  else if (margin >= 0.00) score = 16
  else                     score = 5  // 영업 적자

  return {
    score,
    basis:         `영업이익률 ${(margin * 100).toFixed(1)}% (${la.bsns_year}년 연간)`,
    status:        'scored',
    source:        'dart_financials',
    op_margin_pct: parseFloat((margin * 100).toFixed(2)),
    op_income_krw: Math.round(opInc),
    revenue_krw:   Math.round(revenue),
    bsns_year:     la.bsns_year,
  }
}

/**
 * liquidity_score (0~30)
 *
 * 1일 거래대금 프록시(close × volume)로 시장 유동성을 평가합니다.
 * 주의: 20거래일 평균이 아닌 단일 거래일 프록시. provisional.
 *
 * 기준:
 *   ≥ 1,000억원 → 30
 *   ≥   500억원 → 25
 *   ≥   200억원 → 20
 *   ≥   100억원 → 15
 *   ≥    50억원 →  8
 *      < 50억원 →  3
 *   미확인       → 15 (중립값)
 */
function computeLiquidityScore(entity) {
  const price = entity.price
  if (!price || price.status === 'unavailable' ||
      price.close === null || price.volume === null) {
    return {
      score:  15,
      basis:  '가격/거래량 없음 — 중립값(15) 적용',
      status: 'unavailable',
      source: 'krx_price',
    }
  }

  const dailyValue = price.close * price.volume
  let score
  if (dailyValue >= 100_000_000_000)      score = 30  // 1,000억+
  else if (dailyValue >= 50_000_000_000)  score = 25  //   500억+
  else if (dailyValue >= 20_000_000_000)  score = 20  //   200억+
  else if (dailyValue >= 10_000_000_000)  score = 15  //   100억+
  else if (dailyValue >= 5_000_000_000)   score = 8   //    50억+
  else                                    score = 3

  return {
    score,
    basis:           `1일 거래대금 ${Math.round(dailyValue / 1e8).toLocaleString()}억원`,
    status:          'scored',
    source:          'krx_price',
    daily_value_krw: Math.round(dailyValue),
    close:           price.close,
    volume:          price.volume,
    _note:           '1일 거래대금 프록시 — 20거래일 평균 아님, provisional',
  }
}

/**
 * market_position_score (0~30)
 *
 * 52주 가격 포지션(현재 주가의 52주 범위 내 위치)으로 가격 모멘텀을 평가합니다.
 * position = (close - week52_low) / (week52_high - week52_low)
 * 높을수록 52주 고점 근처 → 상승 모멘텀 강함.
 *
 * 기준:
 *   ≥ 80% → 30
 *   ≥ 60% → 25
 *   ≥ 40% → 20
 *   ≥ 20% → 15
 *    < 20% → 10
 *   미확인 → 15 (중립값)
 */
function computeMarketPositionScore(entity) {
  const price = entity.price
  if (!price || price.status === 'unavailable') {
    return {
      score:  15,
      basis:  '가격 데이터 없음 — 중립값(15) 적용',
      status: 'unavailable',
      source: 'krx_price',
    }
  }

  const { close, week52_high, week52_low } = price
  if (close === null || week52_high === null || week52_low === null ||
      week52_high <= week52_low) {
    return {
      score:  15,
      basis:  '52주 고/저 데이터 없음 또는 범위 0 — 중립값(15) 적용',
      status: 'unavailable',
      source: 'krx_price',
    }
  }

  const position    = (close - week52_low) / (week52_high - week52_low)
  const positionPct = Math.round(position * 100)

  let score
  if (position >= 0.80)      score = 30
  else if (position >= 0.60) score = 25
  else if (position >= 0.40) score = 20
  else if (position >= 0.20) score = 15
  else                       score = 10

  return {
    score,
    basis:                `52주 포지션 ${positionPct}% (${Math.round(close).toLocaleString()}원, 52주 ${Math.round(week52_low).toLocaleString()}~${Math.round(week52_high).toLocaleString()}원)`,
    status:               'scored',
    source:               'krx_price',
    week52_position_pct:  positionPct,
    close,
    week52_high,
    week52_low,
  }
}

/**
 * penalty_score (0 이하, max -20)
 *
 * Hard Filter Soft Flag 감점을 계산합니다.
 * Soft Flag는 자동 제외가 아닙니다. 감점 반영 후 다음 단계로 전달됩니다.
 *
 * 감점 기준:
 *   HF_NEGATIVE_EARNINGS  -10  (영업 적자)
 *   HF_LOW_LIQUIDITY       -8  (저유동성, 1일 프록시 기준)
 *   HF_LOW_PRICE           -5  (동전주)
 *   HF_AUDIT_ISSUE        -15  (감사의견 비확인)
 *
 * 복수 Soft Flag 합산 시 최대 -20 상한 적용.
 */
const PENALTY_MAP = {
  HF_NEGATIVE_EARNINGS: { amount: 10, reason: 'TTM 영업이익 음수 (Soft Flag)' },
  HF_LOW_LIQUIDITY:     { amount:  8, reason: '저유동성 Soft Flag (1일 프록시 기준)' },
  HF_LOW_PRICE:         { amount:  5, reason: '동전주 Soft Flag' },
  HF_AUDIT_ISSUE:       { amount: 15, reason: '감사의견 비확인 Soft Flag' },
}

function computePenaltyScore(hfResult) {
  const triggered  = hfResult.triggered_rules ?? []
  const deductions = []

  for (const rule of triggered) {
    const pen = PENALTY_MAP[rule]
    if (pen) {
      deductions.push({ rule, deduction: pen.amount, reason: pen.reason })
    }
  }

  const rawDeduction   = deductions.reduce((s, d) => s + d.deduction, 0)
  const totalDeduction = Math.min(rawDeduction, 20)

  return {
    score:   -totalDeduction,
    basis:   deductions.length > 0
      ? `Soft Flag 감점: ${deductions.map(d => `${d.rule}(-${d.deduction})`).join(', ')}${rawDeduction > 20 ? ' → 상한 -20 적용' : ''}`
      : '감점 없음',
    status:          deductions.length > 0 ? 'penalized' : 'clean',
    deductions,
    total_deduction: totalDeduction,
  }
}

// ── 엔티티 스코어링 ────────────────────────────────────────────────────────────

/**
 * 단일 엔티티에 대해 C-2 스코어를 계산합니다.
 * hard_block 종목은 total_score: null, eligible_for_next_phase: false 처리.
 * soft_flag 종목은 penalty 반영 후 정상 scoring.
 */
function scoreEntity(entity, hfResult) {
  const hfDecision = hfResult.overall_decision

  // hard_block — 스코어링 제외
  if (hfDecision === 'hard_block') {
    return {
      ticker:                  entity.ticker,
      name:                    entity.name,
      asset_type:              entity.asset_type,
      market:                  entity.market,
      sector_code:             entity.sector_code,
      hard_filter_decision:    'hard_block',
      eligible_for_next_phase: false,
      exclusion_reason:        `hard_block: ${hfResult.triggered_rules.join(', ')}`,
      total_score:             null,
      final_rank:              null,
      component_scores:        null,
      score_provenance:        null,
      triggered_rules:         hfResult.triggered_rules,
      unavailable_inputs:      hfResult.unavailable_inputs,
      score_notes:             [`Hard Block — 스코어링 제외. 원인: ${hfResult.triggered_rules.join(', ')}`],
    }
  }

  // pass / soft_flag — 정상 스코어링
  const qualityResult    = computeQualityScore(entity)
  const liquidityResult  = computeLiquidityScore(entity)
  const marketPosResult  = computeMarketPositionScore(entity)
  const penaltyResult    = computePenaltyScore(hfResult)

  const rawTotal   = qualityResult.score + liquidityResult.score +
                     marketPosResult.score + penaltyResult.score
  const totalScore = Math.max(0, Math.min(100, rawTotal))

  // score_notes: unavailable 항목 및 주요 감점/한계 설명
  const scoreNotes = []
  if (qualityResult.status === 'unavailable' || qualityResult.status === 'neutral_etf') {
    scoreNotes.push(`quality: ${qualityResult.basis}`)
  }
  if (liquidityResult.status === 'unavailable') {
    scoreNotes.push(`liquidity: ${liquidityResult.basis}`)
  }
  if (marketPosResult.status === 'unavailable') {
    scoreNotes.push(`market_position: ${marketPosResult.basis}`)
  }
  if (penaltyResult.total_deduction > 0) {
    scoreNotes.push(penaltyResult.basis)
  }
  if (hfResult.unavailable_inputs?.includes('HF_OVERHEATED')) {
    scoreNotes.push('HF_OVERHEATED 미평가 — 단기 급등 과열 여부 미반영. 가격 이력 확보 후 재평가 필요.')
  }

  return {
    ticker:                  entity.ticker,
    name:                    entity.name,
    asset_type:              entity.asset_type,
    market:                  entity.market,
    sector_code:             entity.sector_code,
    hard_filter_decision:    hfDecision,
    eligible_for_next_phase: true,
    exclusion_reason:        null,
    total_score:             totalScore,
    final_rank:              null,  // assignRanks()에서 채워짐
    component_scores: {
      quality_score:         qualityResult.score,
      liquidity_score:       liquidityResult.score,
      market_position_score: marketPosResult.score,
      penalty_score:         penaltyResult.score,
    },
    score_provenance: {
      quality_score:         qualityResult,
      liquidity_score:       liquidityResult,
      market_position_score: marketPosResult,
      penalty_score:         penaltyResult,
    },
    triggered_rules:    hfResult.triggered_rules,
    unavailable_inputs: hfResult.unavailable_inputs,
    score_notes:        scoreNotes,
  }
}

/**
 * eligible 종목에 final_rank를 부여합니다.
 * 정렬: total_score 내림차순. 동점 시 liquidity_score 내림차순.
 * hard_block(eligible_for_next_phase: false) 종목은 랭킹 제외.
 */
function assignRanks(results) {
  const eligible = results.filter(r => r.eligible_for_next_phase && r.total_score !== null)
  eligible.sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score
    return (b.component_scores?.liquidity_score ?? 0) -
           (a.component_scores?.liquidity_score ?? 0)
  })
  eligible.forEach((r, i) => { r.final_rank = i + 1 })
}

// ── 요약 생성 ─────────────────────────────────────────────────────────────────

function buildScoringSummary(weekId, results) {
  const eligible    = results.filter(r => r.eligible_for_next_phase && r.total_score !== null)
  const excluded    = results.filter(r => !r.eligible_for_next_phase)
  const softFlagged = results.filter(r => r.hard_filter_decision === 'soft_flag')

  const stockResults = results.filter(r => r.asset_type === 'stock')
  const etfResults   = results.filter(r => r.asset_type === 'etf')

  // 점수 분포
  const dist = { excellent: 0, good: 0, moderate: 0, low: 0, poor: 0 }
  for (const r of eligible) {
    if (r.total_score >= 80)      dist.excellent++
    else if (r.total_score >= 60) dist.good++
    else if (r.total_score >= 40) dist.moderate++
    else if (r.total_score >= 20) dist.low++
    else                          dist.poor++
  }

  // 상위 7위 (요약용)
  const topRanked = eligible
    .sort((a, b) => a.final_rank - b.final_rank)
    .slice(0, 7)
    .map(r => ({
      rank:                 r.final_rank,
      ticker:               r.ticker,
      name:                 r.name,
      asset_type:           r.asset_type,
      sector_code:          r.sector_code,
      total_score:          r.total_score,
      hard_filter_decision: r.hard_filter_decision,
      component_scores:     r.component_scores,
      ...(r.score_notes.length > 0 ? { score_notes: r.score_notes } : {}),
    }))

  return {
    week_id:                 weekId,
    built_at:                new Date().toISOString(),
    schema_version:          '1.0',
    total_entities:          results.length,
    scored_entities:         eligible.length,
    excluded_hard_block:     excluded.length,
    soft_flag_penalty_count: softFlagged.length,
    by_asset_type: {
      stock: {
        total:  stockResults.length,
        scored: stockResults.filter(r => r.eligible_for_next_phase).length,
      },
      etf: {
        total:  etfResults.length,
        scored: etfResults.filter(r => r.eligible_for_next_phase).length,
      },
    },
    score_distribution: dist,
    top_ranked:         topRanked,
    _data_quality_notes: [
      'HF_OVERHEATED: 전체 input_unavailable. 단기 급등 과열 여부가 score에 미반영됨. 과열 종목의 total_score가 실제보다 높을 수 있음.',
      'HF_LOW_LIQUIDITY: 1일 거래대금 프록시 기반 provisional. liquidity_score와 HF_LOW_LIQUIDITY 감점 모두 잠정치.',
      '한국가스공사(036460), KB금융(105560): 별도재무 영업이익 미수집 — quality_score 중립값(20) 적용.',
      '시가총액(market_cap) 미수집으로 규모 보정 없음. score는 수익성·유동성·모멘텀 기준.',
    ],
    _phase_note: 'C-2 산출물은 우선순위 참고용입니다. picks 확정, draft/current/archive 생성은 C-3 이후 단계입니다.',
  }
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

async function main() {
  const weekId = parseWeekIdArg() ?? getCurrentWeekId()
  const dryRun = isDryRun()

  console.log('\n📊 Phase C-2 스코어링/우선순위화 시작')
  console.log(`  week_id  : ${weekId}`)
  console.log(`  dry-run  : ${dryRun}`)
  console.log(`  입력[1]  : data/analysis/${weekId}/hard_filter_results.json`)
  console.log(`  입력[2]  : data/processed/${weekId}/normalized_entities.json`)
  console.log(`  출력     : data/analysis/${weekId}/\n`)

  // ── 입력 로드 ──────────────────────────────────────────────────────────────
  const hfData = readJson(path.join(ANALYSIS_DIR, weekId, 'hard_filter_results.json'))
  if (!hfData) {
    console.error(`❌ hard_filter_results.json 없음: data/analysis/${weekId}/`)
    console.error(`   먼저 Phase C-1을 실행하세요: npm run evaluate:hf -- --week-id ${weekId}`)
    process.exit(1)
  }

  const entityData = readJson(path.join(PROCESSED_DIR, weekId, 'normalized_entities.json'))
  if (!entityData) {
    console.error(`❌ normalized_entities.json 없음: data/processed/${weekId}/`)
    console.error(`   먼저 Phase B-3을 실행하세요: npm run normalize:b3 -- --week-id ${weekId}`)
    process.exit(1)
  }

  console.log(`  로드 완료: 엔티티 ${entityData.record_count}건, HF 결과 ${hfData.total}건`)

  // ── ticker 기반 조회 맵 ────────────────────────────────────────────────────
  const hfMap = new Map(hfData.results.map(r => [r.ticker, r]))

  // ── 스코어링 ───────────────────────────────────────────────────────────────
  const results = []
  for (const entity of entityData.records) {
    const hfResult = hfMap.get(entity.ticker)
    if (!hfResult) {
      console.warn(`  [경고] ${entity.ticker} ${entity.name}: hard_filter 결과 없음, 건너뜀`)
      continue
    }
    results.push(scoreEntity(entity, hfResult))
  }

  // ── 랭킹 부여 ──────────────────────────────────────────────────────────────
  assignRanks(results)

  // ── 요약 생성 ──────────────────────────────────────────────────────────────
  const summary = buildScoringSummary(weekId, results)

  const scoringResultsPayload = {
    week_id:        weekId,
    built_at:       new Date().toISOString(),
    schema_version: '1.0',
    source_refs: {
      hard_filter_results: `data/analysis/${weekId}/hard_filter_results.json`,
      normalized_entities: `data/processed/${weekId}/normalized_entities.json`,
    },
    total:   results.length,
    results,
  }

  // ── 저장 또는 dry-run 출력 ─────────────────────────────────────────────────
  if (dryRun) {
    console.log('\n[dry-run] 저장하지 않음 — 결과 미리보기:')
    console.log('\n=== SUMMARY ===')
    console.log(JSON.stringify(summary, null, 2))
    console.log('\n=== TOP 5 ===')
    results
      .filter(r => r.final_rank !== null && r.final_rank <= 5)
      .sort((a, b) => a.final_rank - b.final_rank)
      .forEach(r => {
        const cs = r.component_scores
        console.log(`\n  #${r.final_rank} ${r.ticker} ${r.name} (${r.asset_type}/${r.sector_code})`)
        console.log(`     총점: ${r.total_score}점 | HF: ${r.hard_filter_decision}`)
        console.log(`     quality:${cs.quality_score} / liquidity:${cs.liquidity_score} / market_pos:${cs.market_position_score} / penalty:${cs.penalty_score}`)
        if (r.score_notes.length > 0) {
          r.score_notes.forEach(n => console.log(`     note: ${n}`))
        }
      })
  } else {
    saveAnalysis(weekId, 'scoring_results.json', scoringResultsPayload)
    saveAnalysis(weekId, 'scoring_summary.json', summary)
  }

  // ── 콘솔 요약 ─────────────────────────────────────────────────────────────
  const eligible = results
    .filter(r => r.eligible_for_next_phase && r.final_rank !== null)
    .sort((a, b) => a.final_rank - b.final_rank)

  console.log(`\n✅ Phase C-2 스코어링 완료`)
  console.log(`   총 엔티티       : ${results.length}건`)
  console.log(`   스코어링 대상   : ${eligible.length}건`)
  console.log(`   Hard Block 제외 : ${results.filter(r => !r.eligible_for_next_phase).length}건`)
  console.log(`   Soft Flag 감점  : ${results.filter(r => r.hard_filter_decision === 'soft_flag').length}건`)
  console.log()
  console.log('   순위  티커    이름              총점  Q  / L  / M  / P    HF')
  eligible.forEach(r => {
    const cs   = r.component_scores
    const comp = `${String(cs.quality_score).padStart(2)}/${String(cs.liquidity_score).padStart(2)}/${String(cs.market_position_score).padStart(2)}/${String(cs.penalty_score).padStart(3)}`
    const flag = r.hard_filter_decision === 'soft_flag' ? '[SF]' : '    '
    console.log(
      `   #${String(r.final_rank).padStart(2)}  ${r.ticker}  ${r.name.slice(0, 10).padEnd(10)}  ` +
      `${String(r.total_score).padStart(3)}점  ${comp}  ${flag}`
    )
  })
  console.log()
  console.log('   ※ Q=quality / L=liquidity / M=market_position / P=penalty')
  console.log('   ※ [SF]=Soft Flag 감점 종목')
  console.log('   ※ C-2 완료 후에도 picks/draft 생성은 C-3 이후 단계입니다.')
}

main().catch(err => {
  console.error('\n💥 치명적 오류:', err.message)
  process.exit(1)
})

#!/usr/bin/env node
/**
 * scripts/run-phase-b2-collection.mjs
 *
 * Phase B-2 전체 수집 마스터 러너.
 * KRX → DART → MARKET-INDICATORS 순으로 실행하고 최종 요약을 출력합니다.
 *
 * 사용법:
 *   node scripts/run-phase-b2-collection.mjs --week-id 2026-W14
 *   node scripts/run-phase-b2-collection.mjs --week-id 2026-W14 --dry-run
 *   node scripts/run-phase-b2-collection.mjs --week-id 2026-W14 --skip-dart
 *   node scripts/run-phase-b2-collection.mjs --week-id 2026-W14 --only krx
 *   npm run collect:all -- --week-id 2026-W14
 *
 * 옵션:
 *   --week-id <id>    대상 주차 (기본: 현재 주)
 *   --dry-run         실제 저장 없이 시뮬레이션
 *   --skip-dart       DART 수집 건너뜀 (API 키 미설정 시 유용)
 *   --skip-market     거시 지표 수집 건너뜀
 *   --only <source>   특정 소스만 실행 (krx | dart | market)
 *
 * 주의:
 *   - 각 수집기는 독립적으로 실행됩니다 (한 수집기 실패 시 나머지 계속).
 *   - 수집 결과 요약은 data/snapshots/{week_id}/collection_run_summary.json에 저장됩니다.
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { saveSnapshot, parseWeekIdArg, isDryRun } from './lib/snapshot.mjs'
import { getCurrentWeekId } from './lib/week-id.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── CLI 인자 파싱 ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const weekId = parseWeekIdArg() ?? getCurrentWeekId()
const dryRun = isDryRun()

const skipDart = args.includes('--skip-dart')
const skipMarket = args.includes('--skip-market')
const onlyIdx = args.indexOf('--only')
const onlyTarget = onlyIdx !== -1 ? args[onlyIdx + 1] : null

function shouldRun(name) {
  if (onlyTarget) return onlyTarget.toLowerCase() === name
  if (name === 'dart' && skipDart) return false
  if (name === 'market' && skipMarket) return false
  return true
}

// ── 수집기 실행 ────────────────────────────────────────────────────────────────

/**
 * 수집 스크립트를 동기적으로 실행합니다.
 * @param {string} scriptName  예: "collect-krx.mjs"
 * @param {string} label       표시용 이름
 * @param {boolean} dryRun
 * @returns {{ success: boolean, duration_ms: number, error?: string }}
 */
function runCollector(scriptName, label, dryRun) {
  const scriptPath = path.join(__dirname, scriptName)
  const weekArg = `--week-id ${weekId}`
  const dryArg = dryRun ? '--dry-run' : ''
  const cmd = `node "${scriptPath}" ${weekArg} ${dryArg}`.trim()

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`▶ ${label}`)
  console.log(`  ${cmd}`)
  console.log('─'.repeat(60))

  const startAt = Date.now()
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT })
    return { success: true, duration_ms: Date.now() - startAt }
  } catch (err) {
    return { success: false, duration_ms: Date.now() - startAt, error: err.message }
  }
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  Phase B-2 전체 수집 시작`)
  console.log(`  week_id  : ${weekId}`)
  console.log(`  dry-run  : ${dryRun}`)
  if (onlyTarget) console.log(`  only     : ${onlyTarget}`)
  if (skipDart)   console.log(`  skip     : dart`)
  if (skipMarket) console.log(`  skip     : market`)
  console.log(`${'═'.repeat(60)}`)

  const runSummary = {
    week_id: weekId,
    started_at: new Date().toISOString(),
    dry_run: dryRun,
    collectors: {},
  }

  // 1. KRX
  if (shouldRun('krx')) {
    const result = runCollector('collect-krx.mjs', 'KRX 수집 (시세·수급·지정·지수·상장·ETF메타)', dryRun)
    runSummary.collectors.krx = result
    if (!result.success) {
      console.error(`\n  ⚠️  KRX 수집 실패: ${result.error}`)
    }
  } else {
    console.log('\n  — KRX 건너뜀')
  }

  // 2. DART
  if (shouldRun('dart')) {
    const result = runCollector('collect-dart.mjs', 'DART 수집 (재무·공시·감사의견)', dryRun)
    runSummary.collectors.dart = result
    if (!result.success) {
      console.error(`\n  ⚠️  DART 수집 실패: ${result.error}`)
    }
  } else {
    console.log('\n  — DART 건너뜀')
  }

  // 3. 거시 지표
  if (shouldRun('market')) {
    const result = runCollector('collect-market-indicators.mjs', '거시 지표 수집 (ECOS·FRED·Yahoo)', dryRun)
    runSummary.collectors.market = result
    if (!result.success) {
      console.error(`\n  ⚠️  거시 지표 수집 실패: ${result.error}`)
    }
  } else {
    console.log('\n  — 거시 지표 건너뜀')
  }

  // 최종 요약
  runSummary.finished_at = new Date().toISOString()
  const totalDuration = Object.values(runSummary.collectors)
    .reduce((sum, c) => sum + (c?.duration_ms ?? 0), 0)

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  Phase B-2 수집 완료`)
  console.log(`  소요 시간: ${(totalDuration / 1000).toFixed(1)}초`)
  console.log('')

  let allSuccess = true
  for (const [name, result] of Object.entries(runSummary.collectors)) {
    const icon = result.success ? '✅' : '❌'
    const dur = `${(result.duration_ms / 1000).toFixed(1)}s`
    console.log(`  ${icon} ${name.padEnd(10)} ${dur}`)
    if (!result.success) allSuccess = false
  }
  console.log(`${'═'.repeat(60)}\n`)

  if (!dryRun) {
    saveSnapshot(weekId, 'collection_run_summary.json', runSummary)
    console.log(`  요약 저장: data/snapshots/${weekId}/collection_run_summary.json`)
  }

  if (!allSuccess) {
    console.error('\n  일부 수집기가 실패했습니다. 위 오류를 확인하세요.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\n💥 마스터 러너 치명적 오류:', err.message)
  process.exit(1)
})

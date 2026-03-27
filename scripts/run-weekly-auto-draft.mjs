#!/usr/bin/env node
/**
 * scripts/run-weekly-auto-draft.mjs
 *
 * 주간 자동 초안 생성 단일 진입점 (Orchestrator).
 *
 * ── 실행 순서 ──────────────────────────────────────────────────────────────────
 *   1. week_id 계산 (한 번만, 이후 모든 단계에 동일 값 전달)
 *   2. collect:all   — Phase B-2 수집
 *   3. normalize:b3  — Phase B-3 정규화
 *   4. evaluate:hf   — Phase C-1 Hard Filter
 *   5. score:c2      — Phase C-2 스코어링
 *   6. draft:c3      — Phase C-3 Draft 생성
 *   7. approval.json draft_week_id 갱신 (새 주차 안내)
 *
 * ── 범위 제한 ──────────────────────────────────────────────────────────────────
 *   - approval 승인 자동화 없음
 *   - current.json 반영 없음
 *   - detail 생성 없음
 *   - publish 없음
 *   - git push 없음 (CI가 별도 처리)
 *
 * ── week_id 일관성 ─────────────────────────────────────────────────────────────
 *   - 실행 시점에 getCurrentWeekId()로 단 한 번 계산
 *   - 모든 하위 스크립트에 --week-id 인자로 명시 전달
 *   - 하위 스크립트가 자체 계산하지 않도록 보장
 *
 * ── dry-run 정책 ──────────────────────────────────────────────────────────────
 *   --dry-run은 Git-추적 대상 "운영 파일"만 보호합니다.
 *   보호 대상:
 *     - data/draft/{week_id}.json    → 저장하지 않음 (draft:c3에 --dry-run 전달)
 *     - data/manifests/approval.json → 갱신하지 않음
 *
 *   중간 산출물(snapshots·processed·analysis)은 .gitignore에 의해 Git 추적 대상이
 *   아니므로, dry-run에서도 정상적으로 저장합니다. 이렇게 해야 후속 단계(evaluate →
 *   score → draft)가 파일을 읽을 수 있어 end-to-end 파이프라인 검증이 가능합니다.
 *
 *   collect(B-2)에도 --dry-run을 전달하지만, 하위 수집 스크립트 구현에 따라 외부
 *   API 조회(DART·ECOS·FRED·Yahoo 등)는 실제로 수행될 수 있습니다. --dry-run은
 *   수집 결과의 로컬 저장을 생략할 뿐, 외부 호출 자체를 차단하지는 않습니다.
 *
 * 사용법:
 *   node scripts/run-weekly-auto-draft.mjs
 *   node scripts/run-weekly-auto-draft.mjs --week-id 2026-W15
 *   node scripts/run-weekly-auto-draft.mjs --dry-run
 *   npm run auto:draft
 *   npm run auto:draft -- --week-id 2026-W15
 *   npm run auto:draft -- --dry-run
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseWeekIdArg, isDryRun } from './lib/snapshot.mjs'
import { getCurrentWeekId } from './lib/week-id.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const APPROVAL_PATH = path.join(ROOT, 'data/manifests/approval.json')

// ── CLI 파싱 ──────────────────────────────────────────────────────────────────

const weekId = parseWeekIdArg() ?? getCurrentWeekId()
const dryRun = isDryRun()

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')) }
  catch { return null }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function nowIso() { return new Date().toISOString() }

/**
 * 하위 스크립트를 동기 실행합니다.
 * --week-id를 항상 명시 전달하여 week_id 일관성을 보장합니다.
 *
 * @param {string}  stepName           표시용 이름
 * @param {string}  scriptFile         실행할 스크립트 파일명
 * @param {object}  [opts]
 * @param {boolean} [opts.passDryRun]  true면 orchestrator --dry-run 시 하위에도 --dry-run 전달.
 *                                     false(기본)면 하위는 항상 정상 실행 (gitignore 중간 산출물용).
 * @param {string}  [opts.extraArgs]   추가 CLI 인자
 */
function runStep(stepName, scriptFile, { passDryRun = false, extraArgs = '' } = {}) {
  const scriptPath = path.join(__dirname, scriptFile)
  const dryArg = (dryRun && passDryRun) ? '--dry-run' : ''
  const cmd = `node "${scriptPath}" --week-id ${weekId} ${dryArg} ${extraArgs}`.trim()

  console.log('')
  console.log(`${'━'.repeat(60)}`)
  console.log(`  STEP: ${stepName}`)
  console.log(`  CMD : ${cmd}`)
  console.log(`${'━'.repeat(60)}`)

  const startAt = Date.now()
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT, timeout: 300_000 })
    const elapsed = ((Date.now() - startAt) / 1000).toFixed(1)
    console.log(`  ✓ ${stepName} 완료 (${elapsed}s)`)
    return { success: true, duration_ms: Date.now() - startAt }
  } catch (err) {
    const elapsed = ((Date.now() - startAt) / 1000).toFixed(1)
    console.error(`  ✗ ${stepName} 실패 (${elapsed}s): ${err.message}`)
    return { success: false, duration_ms: Date.now() - startAt, error: err.message }
  }
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

function main() {
  const startedAt = nowIso()

  console.log('')
  console.log(`${'═'.repeat(60)}`)
  console.log(`  Weekly Auto Draft — Orchestrator`)
  console.log(`  week_id   : ${weekId}`)
  console.log(`  dry-run   : ${dryRun}`)
  console.log(`  started_at: ${startedAt}`)
  console.log(`${'═'.repeat(60)}`)

  const results = {}

  // ── dry-run 안내 ─────────────────────────────────────────────────────────────
  if (dryRun) {
    console.log('')
    console.log('  [dry-run 정책] Git 추적 대상 운영 파일만 보호합니다.')
    console.log('    collect(B-2)  : --dry-run 전달 (snapshots 저장 생략, 외부 API 조회는 수행될 수 있음)')
    console.log('    normalize(B-3): 정상 실행 → processed/ 저장 (gitignore 대상)')
    console.log('    evaluate(C-1) : 정상 실행 → analysis/ 저장 (gitignore 대상)')
    console.log('    score(C-2)    : 정상 실행 → analysis/ 저장 (gitignore 대상)')
    console.log('    draft(C-3)    : --dry-run 전달 → data/draft/ 미저장 (Git 추적 대상 보호)')
    console.log('    approval.json : 미갱신 (Git 추적 대상 보호)')
  }

  // ── Step 1: collect:all ─────────────────────────────────────────────────────
  // passDryRun: true → dry-run 시 하위에 --dry-run 전달 (snapshots 저장 생략).
  // 단, 하위 수집 스크립트에 따라 외부 API 조회는 실제로 수행될 수 있음.
  results.collect = runStep('Phase B-2 수집', 'run-phase-b2-collection.mjs', { passDryRun: true })
  if (!results.collect.success) {
    printSummary(results, startedAt, 'collect')
    process.exit(1)
  }

  // ── Step 2: normalize:b3 ───────────────────────────────────────────────────
  // passDryRun: false (기본) → processed/는 gitignore 대상이므로 정상 저장.
  // 이래야 후속 evaluate/score/draft가 파일을 읽을 수 있음.
  results.normalize = runStep('Phase B-3 정규화', 'normalize-phase-b3.mjs')
  if (!results.normalize.success) {
    printSummary(results, startedAt, 'normalize')
    process.exit(1)
  }

  // ── Step 3: evaluate:hf ─────────────────────────────────────────────────────
  // passDryRun: false → analysis/는 gitignore 대상이므로 정상 저장.
  results.evaluate = runStep('Phase C-1 Hard Filter', 'evaluate-hard-filters.mjs')
  if (!results.evaluate.success) {
    printSummary(results, startedAt, 'evaluate')
    process.exit(1)
  }

  // ── Step 4: score:c2 ───────────────────────────────────────────────────────
  // passDryRun: false → analysis/는 gitignore 대상이므로 정상 저장.
  results.score = runStep('Phase C-2 스코어링', 'score-phase-c2.mjs')
  if (!results.score.success) {
    printSummary(results, startedAt, 'score')
    process.exit(1)
  }

  // ── Step 5: draft:c3 ───────────────────────────────────────────────────────
  // passDryRun: true → data/draft/는 Git 추적 대상이므로 dry-run 시 저장 안 함.
  results.draft = runStep('Phase C-3 Draft 생성', 'generate-draft-c3.mjs', { passDryRun: true })
  if (!results.draft.success) {
    printSummary(results, startedAt, 'draft')
    process.exit(1)
  }

  // ── Step 6: approval.json draft_week_id 갱신 ───────────────────────────────
  if (!dryRun) {
    updateApprovalDraftWeekId()
  } else {
    console.log('\n  [dry-run] approval.json 갱신 건너뜀')
  }

  // ── 완료 ────────────────────────────────────────────────────────────────────
  printSummary(results, startedAt, null)
}

/**
 * approval.json의 draft_week_id를 새 주차로 갱신합니다.
 * decision은 pending으로 초기화하여 운영자 검토 대기 상태로 둡니다.
 */
function updateApprovalDraftWeekId() {
  const approval = readJson(APPROVAL_PATH) ?? {}
  const updated = {
    draft_report_id: `RPT-${weekId}`,
    draft_week_id: weekId,
    decision: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    notes: `auto-draft generated at ${nowIso()}`,
    news_signal_review_status: null,
    blocking_issues: [],
    data_quality_acknowledged: false,
    draft_exists: true,
    publish_ready: false,
  }
  writeJson(APPROVAL_PATH, updated)
  console.log(`\n  ✓ approval.json 갱신: draft_week_id=${weekId}, decision=pending`)
}

function printSummary(results, startedAt, failedAt) {
  const finishedAt = nowIso()
  const allSuccess = failedAt === null

  console.log('')
  console.log(`${'═'.repeat(60)}`)
  console.log(allSuccess
    ? `  ✅ Weekly Auto Draft 완료`
    : `  ❌ Weekly Auto Draft 실패 (중단 지점: ${failedAt})`)
  console.log(`  week_id    : ${weekId}`)
  console.log(`  started_at : ${startedAt}`)
  console.log(`  finished_at: ${finishedAt}`)
  console.log('')

  const steps = ['collect', 'normalize', 'evaluate', 'score', 'draft']
  for (const step of steps) {
    const r = results[step]
    if (!r) {
      console.log(`  ⬜ ${step.padEnd(12)} (미실행)`)
    } else if (r.success) {
      console.log(`  ✅ ${step.padEnd(12)} ${(r.duration_ms / 1000).toFixed(1)}s`)
    } else {
      console.log(`  ❌ ${step.padEnd(12)} ${(r.duration_ms / 1000).toFixed(1)}s — FAILED`)
    }
  }

  console.log('')
  if (allSuccess && dryRun) {
    console.log('  [dry-run 결과] Git 추적 대상 운영 파일은 변경되지 않았습니다.')
    console.log(`    data/draft/${weekId}.json : 미저장 (Git 추적 대상 — 보호됨)`)
    console.log(`    approval.json             : 미갱신 (Git 추적 대상 — 보호됨)`)
    console.log(`    data/snapshots/${weekId}/ : 하위 스크립트 dry-run 정책에 따름`)
    console.log(`    data/processed/${weekId}/ : 저장됨 (gitignore 대상 — 후속 단계 입력용)`)
    console.log(`    data/analysis/${weekId}/  : 저장됨 (gitignore 대상 — 후속 단계 입력용)`)
    console.log('')
    console.log('  ※ 외부 API 조회는 수행되었을 수 있습니다 (하위 수집 스크립트 구현에 따름).')
    console.log('  ※ --dry-run 제거 시 실제 draft + approval.json이 갱신됩니다.')
  } else if (allSuccess) {
    console.log(`  산출물: data/draft/${weekId}.json`)
    console.log(`  approval.json: decision=pending (운영자 승인 대기)`)
    console.log('')
    console.log('  다음 단계 (수동):')
    console.log(`    1. admin에서 draft 검토`)
    console.log(`    2. npm run approval:commit -- --decision approved --reviewed-by <이름> --acknowledge-data-quality --week-id ${weekId}`)
    console.log(`    3. npm run detail:generate -- --week-id ${weekId}`)
    console.log(`    4. npm run publish -- --week-id ${weekId} --actor <이름>`)
    console.log(`    5. git push`)
  } else {
    console.log(`  실패 지점: ${failedAt}`)
    console.log('  위 로그를 확인하고, 해당 단계부터 수동 재실행하세요.')
    console.log('')
    console.log('  수동 재실행 예시:')
    if (failedAt === 'collect')   console.log(`    npm run collect:all -- --week-id ${weekId}`)
    if (failedAt === 'normalize') console.log(`    npm run normalize:b3 -- --week-id ${weekId}`)
    if (failedAt === 'evaluate')  console.log(`    npm run evaluate:hf -- --week-id ${weekId}`)
    if (failedAt === 'score')     console.log(`    npm run score:c2 -- --week-id ${weekId}`)
    if (failedAt === 'draft')     console.log(`    npm run draft:c3 -- --week-id ${weekId}`)
  }
  console.log(`${'═'.repeat(60)}`)
  console.log('')
}

main()

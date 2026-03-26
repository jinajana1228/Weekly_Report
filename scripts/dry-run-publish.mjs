#!/usr/bin/env node
/**
 * dry-run-publish.mjs
 *
 * 로컬 발행 dry-run 스크립트.
 * 실제 파일 변경 없이, 현재 발행 가능 상태를 점검하고
 * 예정 변경 내역만 출력합니다.
 *
 * 사용법:
 *   node scripts/dry-run-publish.mjs --week-id 2026-W14 --actor 홍길동
 *   node scripts/dry-run-publish.mjs --week-id 2026-W14 --actor 홍길동 --verbose
 *   node scripts/dry-run-publish.mjs --week-id 2026-W14 --actor 홍길동 --json
 *
 * 주의: 이 스크립트는 어떤 파일도 수정하지 않습니다.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── 경로 상수 ──────────────────────────────────────────────────────────────────
const PATHS = {
  manifest:       path.join(ROOT, 'data/manifests/manifest.json'),
  approval:       path.join(ROOT, 'data/manifests/approval.json'),
  overlapHistory: path.join(ROOT, 'admin/overlap_history.json'),
  currentMain:    path.join(ROOT, 'data/current/current.json'),
  currentDetails: path.join(ROOT, 'data/current/details'),
  draftBase:      path.join(ROOT, 'data/draft'),
  draftDetails:   path.join(ROOT, 'data/draft/details'),
  archiveBase:    path.join(ROOT, 'data/archive'),
  archiveDetails: path.join(ROOT, 'data/archive/details'),
  newsSignals:    path.join(ROOT, 'data/news_signals'),
}

// ── 유틸 ───────────────────────────────────────────────────────────────────────
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function fileExists(filePath) {
  return fs.existsSync(filePath)
}

function listJsonFiles(dir) {
  if (!fileExists(dir)) return []
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.json'))
  } catch {
    return []
  }
}

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = { weekId: null, actor: null, note: null, json: false, verbose: false }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--week-id':  opts.weekId  = args[++i]; break
      case '--actor':    opts.actor   = args[++i]; break
      case '--note':     opts.note    = args[++i]; break
      case '--json':     opts.json    = true;       break
      case '--verbose':  opts.verbose = true;        break
      default:
        console.error(`알 수 없는 인자: ${args[i]}`)
        process.exit(1)
    }
  }
  return opts
}

function validateRequiredArgs(opts) {
  const missing = []
  if (!opts.weekId) missing.push('--week-id')
  if (!opts.actor)  missing.push('--actor')
  if (missing.length > 0) {
    console.error(`[오류] 필수 인자 누락: ${missing.join(', ')}`)
    console.error('사용법: node scripts/dry-run-publish.mjs --week-id <WEEK_ID> --actor <이름>')
    process.exit(1)
  }
}

// ── 검증 로직 ──────────────────────────────────────────────────────────────────
function runChecks(weekId, verbose) {
  const blockers = []
  const warnings = []

  // ── [BLOCKER 1] approval.json 존재 여부
  const approval = readJson(PATHS.approval)
  if (!approval) {
    blockers.push('approval.json 파일이 없습니다.')
    // 이후 approval 관련 검증 불가 → 조기 반환
    return { blockers, warnings, approval: null, manifest: null, draft: null }
  }

  // ── [BLOCKER 2] approval.draft_week_id 일치 여부
  if (approval.draft_week_id !== weekId) {
    blockers.push(
      `approval.draft_week_id(${approval.draft_week_id})가 입력 week_id(${weekId})와 다릅니다.`
    )
  }

  // ── [BLOCKER 3] approval.decision === 'approved' 여부 (유일한 실질 발행 차단)
  if (approval.decision !== 'approved') {
    blockers.push(
      `approval.decision이 '${approval.decision}'입니다. 'approved' 상태여야 발행할 수 있습니다.`
    )
  }

  // ── [BLOCKER 4] draft 메인 파일 존재 여부
  const draftMainPath = path.join(PATHS.draftBase, `${weekId}.json`)
  const draft = readJson(draftMainPath)
  if (!draft) {
    blockers.push(`draft 메인 파일이 없습니다: data/draft/${weekId}.json`)
  }

  // ── manifest 로드
  const manifest = readJson(PATHS.manifest)
  if (!manifest) {
    blockers.push('manifest.json 파일이 없습니다.')
  } else {
    // ── [BLOCKER 5] manifest.draft_week_id 정합성
    if (manifest.draft_week_id !== weekId) {
      blockers.push(
        `manifest.draft_week_id(${manifest.draft_week_id})가 입력 week_id(${weekId})와 다릅니다.`
      )
    }

    // ── [BLOCKER 6] current 메인 파일 존재 여부
    if (!fileExists(PATHS.currentMain)) {
      blockers.push('current 메인 파일이 없습니다: data/current/current.json')
    }

    // ── [BLOCKER 7] manifest.current_file_path 파일 존재 여부
    const manifestCurrentPath = path.join(ROOT, manifest.current_file_path)
    if (!fileExists(manifestCurrentPath)) {
      blockers.push(
        `manifest.current_file_path가 가리키는 파일이 없습니다: ${manifest.current_file_path}`
      )
    }
  }

  // ── [BLOCKER 8] archive 동일 week_id 충돌 (메인 파일)
  const archiveMainPath = path.join(PATHS.archiveBase, `${weekId}.json`)
  if (fileExists(archiveMainPath)) {
    blockers.push(
      `archive에 이미 동일한 week_id 메인 파일이 있습니다: data/archive/${weekId}.json`
    )
  }

  // ── [WARNING 1] signal_review.json 존재 여부
  const signalReviewPath = path.join(PATHS.newsSignals, weekId, 'signal_review.json')
  const signalReview = readJson(signalReviewPath)
  if (!signalReview) {
    warnings.push(`signal_review.json이 없습니다 (data/news_signals/${weekId}/signal_review.json). 뉴스 신호 검수 없이 발행됩니다.`)
  } else {
    // ── [WARNING 2] signal_review.review_completed 여부
    if (signalReview.review_completed === false) {
      const pendingItems = signalReview.review_items?.filter(i => i.review_status === 'PENDING') ?? []
      warnings.push(
        `signal_review.review_completed=false. PENDING 항목 ${pendingItems.length}개 남아 있습니다. ` +
        `(${pendingItems.map(i => i.signal_id).join(', ')}) — 발행 차단 조건 아님.`
      )
    }
  }

  // ── [WARNING 3] draft detail 파일 커버리지
  if (draft) {
    const draftPicks = (draft.picks ?? []).map(p => p.ticker)
    const draftDetailFiles = listJsonFiles(PATHS.draftDetails)
    const detailTickers = draftDetailFiles.map(f => {
      // 파일명 형식: stock_{ticker}.json 또는 etf_{ticker}.json
      const m = f.match(/^(?:stock|etf)_(.+)\.json$/)
      return m ? m[1] : null
    }).filter(Boolean)

    const missingDetails = draftPicks.filter(t => !detailTickers.includes(t))
    if (missingDetails.length > 0) {
      warnings.push(
        `draft picks 중 detail 파일이 없는 ticker: ${missingDetails.join(', ')} ` +
        `(${missingDetails.length}/${draftPicks.length}). 상세 리포트 없이 발행됩니다.`
      )
    }

    // ── [WARNING 4] linked_signal_ids 매핑 검증
    if (signalReview) {
      const reviewedIds = new Set((signalReview.review_items ?? []).map(i => i.signal_id))
      let linkedMismatches = []

      const draftDetailFilePaths = draftDetailFiles.map(f => path.join(PATHS.draftDetails, f))
      for (const fp of draftDetailFilePaths) {
        const detail = readJson(fp)
        const linkedIds = detail?.linked_signal_ids ?? []
        for (const id of linkedIds) {
          if (!reviewedIds.has(id)) {
            linkedMismatches.push(`${path.basename(fp)}: ${id}`)
          }
        }
      }
      if (linkedMismatches.length > 0) {
        warnings.push(
          `linked_signal_ids 중 signal_review에 없는 항목: ${linkedMismatches.join(' / ')}`
        )
      }
    }

    // ── [WARNING 5] overlap_history — 중복 ticker 검출
    const overlapHistory = readJson(PATHS.overlapHistory)
    if (overlapHistory) {
      const recentEditions = overlapHistory.recent_editions ?? []
      const overlapsFound = []
      for (const edition of recentEditions) {
        const overlapTickers = draftPicks.filter(t => (edition.main_picks ?? []).includes(t))
        if (overlapTickers.length > 0) {
          overlapsFound.push(`${edition.week_id}: ${overlapTickers.join(', ')}`)
        }
      }
      if (overlapsFound.length > 0) {
        warnings.push(
          `overlap_history 기준 최근 에디션과 겹치는 ticker 발견: ${overlapsFound.join(' / ')}`
        )
      } else if (verbose) {
        warnings.push('[verbose] overlap_history 기준 최근 3개 에디션과 중복 ticker 없음.')
      }
    } else {
      warnings.push('admin/overlap_history.json이 없습니다. 중복 ticker 검증을 건너뜁니다.')
    }
  }

  // ── [WARNING 6] archive detail 동일 ticker 충돌
  if (draft) {
    const currentDetailFiles = listJsonFiles(PATHS.currentDetails)
    const archiveDetailFiles = listJsonFiles(PATHS.archiveDetails)
    const collisions = currentDetailFiles.filter(f => archiveDetailFiles.includes(f))
    if (collisions.length > 0) {
      warnings.push(
        `archive/details에 이미 동일 파일명이 있습니다 (덮어쓰기 예정): ${collisions.join(', ')}`
      )
    }
  }

  return { blockers, warnings, approval, manifest, draft }
}

// ── 예정 변경 계획 생성 ────────────────────────────────────────────────────────
function buildPlan(weekId, manifest, draft) {
  const currentWeekId = manifest?.current_week_id ?? '(알 수 없음)'
  const plannedFileChanges = []
  const plannedCommits = []
  const phasePlan = []

  // Phase A: archive current
  phasePlan.push({
    phase: 'A',
    label: `현재 에디션(${currentWeekId}) 아카이브`,
    description: `data/current/current.json → data/archive/${currentWeekId}.json 복사 후 archive_week_ids에 추가`,
  })
  plannedFileChanges.push(
    `[Phase A] COPY  data/current/current.json → data/archive/${currentWeekId}.json`
  )
  const currentDetailFiles = listJsonFiles(PATHS.currentDetails)
  for (const f of currentDetailFiles) {
    plannedFileChanges.push(
      `[Phase A] COPY  data/current/details/${f} → data/archive/details/${f}`
    )
  }
  plannedCommits.push(`archive: ${currentWeekId}`)

  // Phase B: draft → current
  phasePlan.push({
    phase: 'B',
    label: `신규 에디션(${weekId}) 발행`,
    description: `data/draft/${weekId}.json → data/current/current.json 이동`,
  })
  plannedFileChanges.push(
    `[Phase B] MOVE  data/draft/${weekId}.json → data/current/current.json`
  )
  const draftDetailFiles = listJsonFiles(PATHS.draftDetails)
  for (const f of draftDetailFiles) {
    plannedFileChanges.push(
      `[Phase B] MOVE  data/draft/details/${f} → data/current/details/${f}`
    )
  }
  plannedCommits.push(`publish: ${weekId}`)

  // Phase C: 상태 파일 갱신
  const draftPicks = (draft?.picks ?? []).map(p => p.ticker)
  phasePlan.push({
    phase: 'C',
    label: '상태 파일 갱신',
    description: 'manifest 업데이트 + overlap_history 갱신 + approval 초기화',
  })
  plannedFileChanges.push(
    `[Phase C] UPDATE data/manifests/manifest.json (current_week_id: ${currentWeekId} → ${weekId}, draft 필드 null화)`
  )
  plannedFileChanges.push(
    `[Phase C] UPDATE admin/overlap_history.json (신규 에디션 추가: ${weekId} picks=${draftPicks.join(',')})`
  )
  plannedFileChanges.push(
    `[Phase C] RESET  data/manifests/approval.json (decision: pending, reviewed_by/at: null)`
  )
  plannedCommits.push(`post-publish: manifest + overlap + approval reset (${weekId})`)

  // Phase D: cleanup (선택)
  phasePlan.push({
    phase: 'D',
    label: '초안 정리 (선택)',
    description: `data/draft/${weekId}.json 및 data/draft/details/ 삭제 (선택적 cleanup)`,
  })
  plannedFileChanges.push(
    `[Phase D] DELETE data/draft/${weekId}.json (선택적 cleanup)`
  )
  for (const f of draftDetailFiles) {
    plannedFileChanges.push(
      `[Phase D] DELETE data/draft/details/${f} (선택적 cleanup)`
    )
  }

  return { plannedFileChanges, plannedCommits, phasePlan }
}

// ── 출력 ───────────────────────────────────────────────────────────────────────
function printHuman(result) {
  const { weekId, actor, note, blockers, warnings, plannedFileChanges, plannedCommits, phasePlan, status } = result
  const hr = '─'.repeat(60)

  console.log('')
  console.log(`╔${'═'.repeat(58)}╗`)
  console.log(`║  DRY-RUN: ${weekId.padEnd(47)}║`)
  console.log(`║  actor  : ${actor.padEnd(47)}║`)
  if (note) {
  console.log(`║  note   : ${note.substring(0, 47).padEnd(47)}║`)
  }
  console.log(`╚${'═'.repeat(58)}╝`)
  console.log('')

  // Status
  const statusLabel = status === 'BLOCKED' ? '🚫 BLOCKED' : '✅ READY'
  console.log(`  상태: ${statusLabel}`)
  console.log('')

  // Blockers
  console.log(`${hr}`)
  console.log('[차단 조건 (BLOCKERS)]')
  if (blockers.length === 0) {
    console.log('  (없음)')
  } else {
    for (const b of blockers) {
      console.log(`  ✗ ${b}`)
    }
  }
  console.log('')

  // Warnings
  console.log(`${hr}`)
  console.log('[경고 (WARNINGS)]')
  if (warnings.length === 0) {
    console.log('  (없음)')
  } else {
    for (const w of warnings) {
      console.log(`  ⚠  ${w}`)
    }
  }
  console.log('')

  // Phase plan
  console.log(`${hr}`)
  console.log('[발행 시 진행 순서 (PHASE PLAN)]')
  for (const p of phasePlan) {
    console.log(`  Phase ${p.phase}: ${p.label}`)
    console.log(`         ${p.description}`)
  }
  console.log('')

  // Planned file changes
  console.log(`${hr}`)
  console.log('[예정 파일 변경 (PLANNED FILE CHANGES)]')
  for (const f of plannedFileChanges) {
    console.log(`  ${f}`)
  }
  console.log('')

  // Planned commits
  console.log(`${hr}`)
  console.log('[예정 git commit 메시지 (PLANNED COMMITS)]')
  for (let i = 0; i < plannedCommits.length; i++) {
    console.log(`  ${i + 1}. ${plannedCommits[i]}`)
  }
  console.log('')

  // Summary
  console.log(`${hr}`)
  console.log('[DRY-RUN SUMMARY]')
  console.log(`  week_id  : ${weekId}`)
  console.log(`  actor    : ${actor}`)
  console.log(`  blockers : ${blockers.length}`)
  console.log(`  warnings : ${warnings.length}`)
  console.log(`  result   : ${status}`)
  console.log(`  실행일시 : ${new Date().toLocaleString('ko-KR')}`)
  console.log('')
  console.log('  ※ 이 출력은 dry-run 결과입니다. 실제 파일 변경은 없습니다.')
  console.log(`${'═'.repeat(60)}`)
  console.log('')
}

function printJson(result) {
  // result에서 출력용 구조만 추출
  const { weekId, actor, note, status, blockers, warnings, plannedFileChanges, plannedCommits, phasePlan } = result
  console.log(JSON.stringify({
    dry_run: true,
    week_id: weekId,
    actor,
    note: note ?? null,
    status,
    blockers,
    warnings,
    planned_file_changes: plannedFileChanges,
    planned_commit_messages: plannedCommits,
    phase_plan: phasePlan,
    executed_at: new Date().toISOString(),
  }, null, 2))
}

// ── 엔트리포인트 ───────────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs()
  validateRequiredArgs(opts)

  const { weekId, actor, note, json, verbose } = opts

  // 검증 실행
  const { blockers, warnings, approval, manifest, draft } = runChecks(weekId, verbose)

  // 예정 계획 생성 (blockers가 있어도 플랜은 보여줌 — dry-run이므로)
  const { plannedFileChanges, plannedCommits, phasePlan } = buildPlan(weekId, manifest, draft)

  const status = blockers.length > 0 ? 'BLOCKED' : 'READY'

  const result = {
    weekId, actor, note,
    status, blockers, warnings,
    plannedFileChanges, plannedCommits, phasePlan,
  }

  if (json) {
    printJson(result)
  } else {
    printHuman(result)
  }

  // 차단 조건 있으면 exit code 1
  process.exit(blockers.length > 0 ? 1 : 0)
}

main()

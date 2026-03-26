#!/usr/bin/env node
/**
 * publish.mjs
 *
 * 로컬 publish 스크립트.
 * approval.json이 approved 상태인 draft를 current로 발행합니다.
 *
 * 이 스크립트가 수정하는 파일:
 *   - data/archive/{currentWeekId}.json    (기존 current 메인 → archive 복사)
 *   - data/archive/details/*               (기존 current details → archive 복사)
 *   - data/current/current.json            (draft 메인 → current 복사)
 *   - data/current/details/*               (draft details → current 복사)
 *   - data/manifests/manifest.json         (인덱스 갱신)
 *   - admin/overlap_history.json           (추천 이력 갱신)
 *   - data/manifests/approval.json         (발행 후 초기화)
 *   - data/draft/{week_id}.json            (--keep-draft 없으면 삭제)
 *   - data/draft/details/*                 (--keep-draft 없으면 삭제)
 *
 * 이 스크립트가 절대 수정하지 않는 파일:
 *   - data/news_signals/** (signal_review.json 포함)
 *   - admin/overlap_history.json 이외 admin/** 파일
 *
 * 사용법:
 *   node scripts/publish.mjs --week-id 2026-W14 --actor jina
 *   node scripts/publish.mjs --week-id 2026-W14 --actor jina --dry-run
 *   npm run publish -- --week-id 2026-W14 --actor jina
 *
 * 주의:
 *   --dry-run 없이 실행하면 실제 파일이 변경됩니다.
 *   반드시 --dry-run으로 먼저 확인하세요.
 *   실패 시 자동 롤백 없음. git status로 범위 확인 후 수동 복구하세요.
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── 경로 상수 (dry-run-publish.mjs와 동일) ────────────────────────────────────
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

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
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

function nowIso() {
  return new Date().toISOString()
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

// ── 인자 파싱 ──────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    weekId:    null,
    actor:     null,
    note:      null,
    dryRun:    false,
    verbose:   false,
    keepDraft: false,
    skipGit:   false,
    json:      false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg  = args[i]
    const next = args[i + 1]
    switch (arg) {
      case '--week-id':    opts.weekId    = next; i++; break
      case '--actor':      opts.actor     = next; i++; break
      case '--note':       opts.note      = next; i++; break
      case '--dry-run':    opts.dryRun    = true;      break
      case '--verbose':    opts.verbose   = true;      break
      case '--keep-draft': opts.keepDraft = true;      break
      case '--skip-git':   opts.skipGit   = true;      break
      case '--json':       opts.json      = true;      break
      default:
        console.error(`알 수 없는 인자: ${arg}`)
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
    console.error('사용법: node scripts/publish.mjs --week-id <WEEK_ID> --actor <이름>')
    process.exit(1)
  }
}

// ── 검증 (dry-run-publish.mjs의 runChecks와 동일한 규칙) ──────────────────────
// approval.decision !== 'approved' 만 차단.
// signal_review 부재/미완료는 경고만 (차단 아님).
// archive detail 충돌은 경고만 (덮어쓰기 허용).
function runChecks(weekId, verbose) {
  const blockers = []
  const warnings = []

  // ── [BLOCKER 1] approval.json 존재
  const approval = readJson(PATHS.approval)
  if (!approval) {
    blockers.push('approval.json 파일이 없습니다.')
    return { blockers, warnings, approval: null, manifest: null, draft: null }
  }

  // ── [BLOCKER 2] approval.draft_week_id 일치
  if (approval.draft_week_id !== weekId) {
    blockers.push(
      `approval.draft_week_id(${approval.draft_week_id})가 입력 week_id(${weekId})와 다릅니다.`
    )
  }

  // ── [BLOCKER 3] approval.decision === 'approved' (유일한 발행 게이트)
  if (approval.decision !== 'approved') {
    blockers.push(
      `approval.decision이 '${approval.decision}'입니다. 'approved'여야 발행할 수 있습니다.`
    )
  }

  // ── [BLOCKER 4] draft 메인 파일 존재
  const draftMainPath = path.join(PATHS.draftBase, `${weekId}.json`)
  const draft = readJson(draftMainPath)
  if (!draft) {
    blockers.push(`draft 메인 파일이 없습니다: data/draft/${weekId}.json`)
  }

  // ── [BLOCKER 5~7] manifest 로드 및 정합성
  const manifest = readJson(PATHS.manifest)
  if (!manifest) {
    blockers.push('manifest.json 파일이 없습니다.')
  } else {
    if (manifest.draft_week_id !== weekId) {
      blockers.push(
        `manifest.draft_week_id(${manifest.draft_week_id})가 입력 week_id(${weekId})와 다릅니다.`
      )
    }
    if (!fileExists(PATHS.currentMain)) {
      blockers.push('current 메인 파일이 없습니다: data/current/current.json')
    }
    const manifestCurrentPath = path.join(ROOT, manifest.current_file_path)
    if (!fileExists(manifestCurrentPath)) {
      blockers.push(
        `manifest.current_file_path가 가리키는 파일이 없습니다: ${manifest.current_file_path}`
      )
    }
  }

  // ── [BLOCKER 8] archive 동일 week_id 메인 파일 충돌
  const currentWeekId = manifest?.current_week_id
  if (currentWeekId) {
    const archiveMainPath = path.join(PATHS.archiveBase, `${currentWeekId}.json`)
    if (fileExists(archiveMainPath)) {
      blockers.push(
        `archive에 이미 동일한 week_id 메인 파일이 있습니다: data/archive/${currentWeekId}.json`
      )
    }
  }

  // ── [WARNING 1] signal_review.json 존재 여부 (차단 아님)
  const signalReviewPath = path.join(PATHS.newsSignals, weekId, 'signal_review.json')
  const signalReview = readJson(signalReviewPath)
  if (!signalReview) {
    warnings.push(
      `signal_review.json 없음 (data/news_signals/${weekId}/signal_review.json). ` +
      `뉴스 신호 검수 없이 발행됩니다. — 발행 차단 조건 아님.`
    )
  } else {
    // ── [WARNING 2] review_completed
    if (signalReview.review_completed === false) {
      const pendingItems = signalReview.review_items?.filter(i => i.review_status === 'PENDING') ?? []
      warnings.push(
        `signal_review.review_completed=false. PENDING 항목 ${pendingItems.length}개 ` +
        `(${pendingItems.map(i => i.signal_id).join(', ')}) — 발행 차단 조건 아님.`
      )
    }
  }

  // ── [WARNING 3] draft detail 커버리지
  if (draft) {
    const draftPicks = (draft.picks ?? []).map(p => p.ticker)
    const draftDetailFiles = listJsonFiles(PATHS.draftDetails)
    const detailTickers = draftDetailFiles.map(f => {
      const m = f.match(/^(?:stock|etf)_(.+)\.json$/)
      return m ? m[1] : null
    }).filter(Boolean)
    const missingDetails = draftPicks.filter(t => !detailTickers.includes(t))
    if (missingDetails.length > 0) {
      warnings.push(
        `draft picks 중 detail 파일 없는 ticker: ${missingDetails.join(', ')} — 상세 없이 발행됩니다.`
      )
    }

    // ── [WARNING 4] linked_signal_ids 매핑
    if (signalReview) {
      const reviewedIds = new Set((signalReview.review_items ?? []).map(i => i.signal_id))
      const mismatches = []
      for (const f of draftDetailFiles) {
        const detail = readJson(path.join(PATHS.draftDetails, f))
        for (const id of (detail?.linked_signal_ids ?? [])) {
          if (!reviewedIds.has(id)) mismatches.push(`${f}: ${id}`)
        }
      }
      if (mismatches.length > 0) {
        warnings.push(`linked_signal_ids 중 signal_review에 없는 항목: ${mismatches.join(' / ')}`)
      }
    }

    // ── [WARNING 5] overlap_history 중복 ticker
    const overlapHistory = readJson(PATHS.overlapHistory)
    if (overlapHistory) {
      const overlapsFound = []
      for (const edition of (overlapHistory.recent_editions ?? [])) {
        const overlapTickers = draftPicks.filter(t => (edition.main_picks ?? []).includes(t))
        if (overlapTickers.length > 0) {
          overlapsFound.push(`${edition.week_id}: ${overlapTickers.join(', ')}`)
        }
      }
      if (overlapsFound.length > 0) {
        warnings.push(`overlap_history 기준 최근 에디션과 겹치는 ticker: ${overlapsFound.join(' / ')}`)
      }
    } else {
      warnings.push('admin/overlap_history.json 없음. 중복 ticker 검증을 건너뜁니다.')
    }
  }

  // ── [WARNING 6] archive detail 파일명 충돌 (경고만, 덮어쓰기 허용)
  const currentDetailFiles  = listJsonFiles(PATHS.currentDetails)
  const archiveDetailFiles  = listJsonFiles(PATHS.archiveDetails)
  const detailCollisions    = currentDetailFiles.filter(f => archiveDetailFiles.includes(f))
  if (detailCollisions.length > 0) {
    warnings.push(
      `archive/details에 이미 동일 파일명 있음 (덮어쓰기 예정): ${detailCollisions.join(', ')}`
    )
  }

  return { blockers, warnings, approval, manifest, draft }
}

// ── Phase 함수 ─────────────────────────────────────────────────────────────────

function phaseA_archiveCurrentMain(currentWeekId, dryRun, log) {
  log('Phase A', `current/current.json → archive/${currentWeekId}.json`)
  const src = PATHS.currentMain
  const dst = path.join(PATHS.archiveBase, `${currentWeekId}.json`)
  if (dryRun) {
    log('Phase A', `  [DRY] COPY data/current/current.json → data/archive/${currentWeekId}.json`)
  } else {
    ensureDir(PATHS.archiveBase)
    fs.copyFileSync(src, dst)
    log('Phase A', `  ✓ 복사 완료: data/archive/${currentWeekId}.json`)
  }
}

function phaseB_archiveCurrentDetails(currentWeekId, dryRun, log) {
  log('Phase B', 'current/details/* → archive/details/*')
  const files = listJsonFiles(PATHS.currentDetails)
  if (files.length === 0) {
    log('Phase B', '  (current/details 파일 없음)')
    return
  }
  if (!dryRun) ensureDir(PATHS.archiveDetails)
  for (const f of files) {
    if (dryRun) {
      log('Phase B', `  [DRY] COPY data/current/details/${f} → data/archive/details/${f}`)
    } else {
      fs.copyFileSync(path.join(PATHS.currentDetails, f), path.join(PATHS.archiveDetails, f))
      log('Phase B', `  ✓ 복사: data/archive/details/${f}`)
    }
  }
}

function phaseC_draftToCurrentMain(weekId, dryRun, log) {
  log('Phase C', `draft/${weekId}.json → current/current.json`)
  const src = path.join(PATHS.draftBase, `${weekId}.json`)
  const dst = PATHS.currentMain
  if (dryRun) {
    log('Phase C', `  [DRY] COPY data/draft/${weekId}.json → data/current/current.json`)
  } else {
    ensureDir(path.dirname(dst))
    fs.copyFileSync(src, dst)
    log('Phase C', `  ✓ 복사 완료: data/current/current.json`)
  }
}

function phaseD_draftDetailsToCurrentDetails(dryRun, log) {
  log('Phase D', 'draft/details/* → current/details/*')
  const draftFiles = listJsonFiles(PATHS.draftDetails)

  if (!dryRun) {
    // 기존 current/details 전체 교체: 이전 파일 삭제 후 새 파일 복사
    ensureDir(PATHS.currentDetails)
    const existing = listJsonFiles(PATHS.currentDetails)
    for (const f of existing) {
      fs.unlinkSync(path.join(PATHS.currentDetails, f))
    }
  }

  if (draftFiles.length === 0) {
    log('Phase D', '  (draft/details 파일 없음)')
    return
  }

  for (const f of draftFiles) {
    if (dryRun) {
      log('Phase D', `  [DRY] COPY data/draft/details/${f} → data/current/details/${f}`)
    } else {
      fs.copyFileSync(path.join(PATHS.draftDetails, f), path.join(PATHS.currentDetails, f))
      log('Phase D', `  ✓ 복사: data/current/details/${f}`)
    }
  }
}

function phaseE_updateManifest(weekId, currentWeekId, draft, manifest, publishedAt, dryRun, log) {
  log('Phase E', 'manifest.json 갱신')

  const updated = {
    ...manifest,
    current_report_id: draft?.report_id ?? manifest.draft_report_id,
    current_week_id:   weekId,
    current_file_path: 'data/current/current.json',
    draft_report_id:   null,
    draft_week_id:     null,
    draft_file_path:   null,
    archive_week_ids:  [...(manifest.archive_week_ids ?? []), currentWeekId],
    last_published_at: publishedAt,
  }

  if (dryRun) {
    log('Phase E', `  [DRY] UPDATE manifest.json`)
    log('Phase E', `    current_week_id  : ${manifest.current_week_id} → ${weekId}`)
    log('Phase E', `    draft_week_id    : ${manifest.draft_week_id} → null`)
    log('Phase E', `    archive_week_ids : [..., "${currentWeekId}"]`)
    log('Phase E', `    last_published_at: ${publishedAt}`)
  } else {
    writeJson(PATHS.manifest, updated)
    log('Phase E', `  ✓ manifest.json 갱신 (current: ${currentWeekId} → ${weekId})`)
  }
  return updated
}

function phaseF_updateOverlapHistory(weekId, draft, publishedAt, dryRun, log) {
  log('Phase F', 'overlap_history.json 갱신')

  const history = readJson(PATHS.overlapHistory) ?? {
    schema_version:   '1.0',
    last_updated_at:  publishedAt,
    recent_editions:  [],
  }

  const draftPicks = (draft?.picks ?? []).map(p => p.ticker)
  const newEntry   = { week_id: weekId, published_at: publishedAt, main_picks: draftPicks }

  // 신규 에디션 맨 앞에 추가, 최근 3개만 유지
  const updated = {
    ...history,
    last_updated_at:  publishedAt,
    recent_editions:  [newEntry, ...(history.recent_editions ?? [])].slice(0, 3),
  }

  if (dryRun) {
    log('Phase F', `  [DRY] UPDATE overlap_history.json`)
    log('Phase F', `    신규 추가: ${weekId} picks=[${draftPicks.join(', ')}]`)
    log('Phase F', `    최근 3개 에디션 유지`)
  } else {
    writeJson(PATHS.overlapHistory, updated)
    log('Phase F', `  ✓ overlap_history.json 갱신 (${weekId}, picks: ${draftPicks.join(',')})`)
  }
}

function phaseG_resetApproval(approval, dryRun, log) {
  log('Phase G', 'approval.json 초기화')

  // 초기화 정책:
  //   - decision → "pending"
  //   - reviewed_by / reviewed_at / notes → null
  //   - news_signal_review_status → null  (per-draft 참고 정보. 새 사이클을 위해 초기화)
  //   - draft_report_id / draft_week_id → 그대로 유지
  //     (새 draft 준비 단계에서 별도 갱신됨)
  const reset = {
    draft_report_id:          approval.draft_report_id,
    draft_week_id:            approval.draft_week_id,
    decision:                 'pending',
    reviewed_by:              null,
    reviewed_at:              null,
    notes:                    null,
    news_signal_review_status: null,
  }

  if (dryRun) {
    log('Phase G', `  [DRY] RESET approval.json`)
    log('Phase G', `    decision                 : "${approval.decision}" → "pending"`)
    log('Phase G', `    reviewed_by              : ${JSON.stringify(approval.reviewed_by)} → null`)
    log('Phase G', `    reviewed_at              : ${JSON.stringify(approval.reviewed_at)} → null`)
    log('Phase G', `    notes                    : ${JSON.stringify(approval.notes)} → null`)
    log('Phase G', `    news_signal_review_status: ${JSON.stringify(approval.news_signal_review_status)} → null`)
    log('Phase G', `    draft_report_id          : 유지 (${approval.draft_report_id})`)
    log('Phase G', `    draft_week_id            : 유지 (${approval.draft_week_id})`)
  } else {
    writeJson(PATHS.approval, reset)
    log('Phase G', `  ✓ approval.json 초기화 완료 (decision: pending, reviewed 필드 null)`)
  }
}

function phaseH_cleanupDraft(weekId, dryRun, log) {
  log('Phase H', 'draft 파일 정리')
  const draftMain        = path.join(PATHS.draftBase, `${weekId}.json`)
  const draftDetailFiles = listJsonFiles(PATHS.draftDetails)

  const targets = [
    ...(fileExists(draftMain) ? [draftMain] : []),
    ...draftDetailFiles.map(f => path.join(PATHS.draftDetails, f)),
  ]

  if (targets.length === 0) {
    log('Phase H', '  (삭제할 draft 파일 없음)')
    return
  }

  for (const t of targets) {
    const rel = path.relative(ROOT, t).replace(/\\/g, '/')
    if (dryRun) {
      log('Phase H', `  [DRY] DELETE ${rel}`)
    } else {
      fs.unlinkSync(t)
      log('Phase H', `  ✓ 삭제: ${rel}`)
    }
  }
}

function phaseI_gitCommit(weekId, actor, note, dryRun, log) {
  log('Phase I', 'git commit')
  const noteStr   = note ? ` — ${note}` : ''
  const commitMsg = `publish: ${weekId}${noteStr} (actor: ${actor})`

  if (dryRun) {
    log('Phase I', `  [DRY] COMMIT "${commitMsg}"`)
  } else {
    try {
      execSync(`git -C "${ROOT}" add -A`, { stdio: 'pipe' })
      execSync(`git -C "${ROOT}" commit -m "${commitMsg}"`, { stdio: 'pipe' })
      log('Phase I', `  ✓ git commit 완료: "${commitMsg}"`)
    } catch (e) {
      // git commit 실패는 경고로만 처리 (파일은 이미 변경됨)
      log('Phase I', `  ⚠ git commit 실패 (파일 변경은 완료됨): ${e.message}`)
      log('Phase I', `    수동으로 커밋하세요: git add -A && git commit -m "${commitMsg}"`)
    }
  }
}

// ── 출력 헬퍼 ─────────────────────────────────────────────────────────────────
function makeLogger() {
  return function log(phase, msg) {
    console.log(`  [${phase}] ${msg}`)
  }
}

function printHeader(weekId, actor, dryRun) {
  const modeLabel = dryRun ? 'DRY-RUN' : 'PUBLISH'
  console.log('')
  console.log(`╔${'═'.repeat(58)}╗`)
  console.log(`║  ${modeLabel}: ${weekId.padEnd(50 - modeLabel.length)}║`)
  console.log(`║  actor  : ${actor.padEnd(47)}║`)
  console.log(`╚${'═'.repeat(58)}╝`)
  console.log('')
}

function printSection(title) {
  console.log('─'.repeat(60))
  console.log(title)
}

// ── 메인 ───────────────────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs()
  validateRequiredArgs(opts)

  const { weekId, actor, note, dryRun, keepDraft, skipGit, verbose } = opts
  const publishedAt = nowIso()

  printHeader(weekId, actor, dryRun)

  // ── Phase 0: pre-check ───────────────────────────────────────────────────────
  printSection('[Phase 0] pre-check')
  console.log('')
  const { blockers, warnings, approval, manifest, draft } = runChecks(weekId, verbose)

  // blockers 출력
  printSection('[차단 조건 (BLOCKERS)]')
  if (blockers.length === 0) {
    console.log('  (없음)')
  } else {
    for (const b of blockers) console.log(`  ✗ ${b}`)
  }
  console.log('')

  if (blockers.length > 0) {
    console.log('  🚫 BLOCKED — 차단 조건 해소 후 다시 실행하세요.')
    console.log(`${'═'.repeat(60)}`)
    process.exit(1)
  }

  // warnings 출력 (차단 아님)
  printSection('[경고 (WARNINGS)] — 발행 차단 아님')
  if (warnings.length === 0) {
    console.log('  (없음)')
  } else {
    for (const w of warnings) console.log(`  ⚠  ${w}`)
  }
  console.log('')

  const currentWeekId = manifest.current_week_id
  const log = makeLogger()

  // ── Phase별 실행 ─────────────────────────────────────────────────────────────
  printSection(dryRun ? '[DRY-RUN] 예정 파일 변경 (실제 수정 없음)' : '[PUBLISH] 파일 변경 시작')
  console.log('')

  let lastCompletedPhase = 'Phase 0'

  try {
    // Phase A: current 메인 → archive
    phaseA_archiveCurrentMain(currentWeekId, dryRun, log)
    lastCompletedPhase = 'Phase A'

    // Phase B: current details → archive details
    phaseB_archiveCurrentDetails(currentWeekId, dryRun, log)
    lastCompletedPhase = 'Phase B'

    // Phase C: draft 메인 → current 메인
    phaseC_draftToCurrentMain(weekId, dryRun, log)
    lastCompletedPhase = 'Phase C'

    // Phase D: draft details → current details (기존 current details 교체)
    phaseD_draftDetailsToCurrentDetails(dryRun, log)
    lastCompletedPhase = 'Phase D'

    // Phase E: manifest.json 갱신
    phaseE_updateManifest(weekId, currentWeekId, draft, manifest, publishedAt, dryRun, log)
    lastCompletedPhase = 'Phase E'

    // Phase F: overlap_history.json 갱신
    phaseF_updateOverlapHistory(weekId, draft, publishedAt, dryRun, log)
    lastCompletedPhase = 'Phase F'

    // Phase G: approval.json 초기화
    phaseG_resetApproval(approval, dryRun, log)
    lastCompletedPhase = 'Phase G'

    // Phase H: draft 파일 정리 (선택)
    if (!keepDraft) {
      phaseH_cleanupDraft(weekId, dryRun, log)
      lastCompletedPhase = 'Phase H'
    } else {
      log('Phase H', '(--keep-draft: draft 파일 정리 건너뜀)')
      lastCompletedPhase = 'Phase H (skipped)'
    }

    // Phase I: git commit (선택)
    if (!skipGit) {
      phaseI_gitCommit(weekId, actor, note, dryRun, log)
      lastCompletedPhase = 'Phase I'
    } else {
      log('Phase I', '(--skip-git: git commit 건너뜀)')
      lastCompletedPhase = 'Phase I (skipped)'
    }

  } catch (err) {
    console.log('')
    printSection('[오류 발생 — 중단]')
    console.log(`  마지막으로 완료된 단계: ${lastCompletedPhase}`)
    console.log(`  오류 내용: ${err.message}`)
    console.log('')
    console.log('  자동 롤백은 지원되지 않습니다.')
    console.log('  git status로 변경 범위를 확인하고 수동으로 복구하세요.')
    console.log('  git restore . 또는 git checkout HEAD -- <파일> 으로 되돌릴 수 있습니다.')
    console.log(`${'═'.repeat(60)}`)
    process.exit(2)
  }

  // ── 최종 요약 ─────────────────────────────────────────────────────────────────
  console.log('')
  printSection(dryRun ? '[DRY-RUN COMPLETE]' : '[PUBLISH COMPLETE]')

  if (dryRun) {
    console.log(`  week_id  : ${weekId}`)
    console.log(`  actor    : ${actor}`)
    console.log(`  blockers : ${blockers.length} (없음)`)
    console.log(`  warnings : ${warnings.length}`)
    console.log('')
    console.log('  ※ dry-run 결과입니다. 실제 파일 변경 없음.')
    console.log('  ※ --dry-run 플래그를 제거하면 실제 발행됩니다.')
  } else {
    console.log(`  week_id        : ${weekId}`)
    console.log(`  actor          : ${actor}`)
    console.log(`  published_at   : ${publishedAt}`)
    console.log(`  archived       : ${currentWeekId}`)
    console.log(`  keep-draft     : ${keepDraft}`)
    console.log(`  git-commit     : ${!skipGit}`)
    console.log('')
    console.log('  ✓ 발행 완료.')
  }

  console.log(`${'═'.repeat(60)}`)
  console.log('')
  process.exit(0)
}

main()

#!/usr/bin/env node
/**
 * publish.mjs
 *
 * 로컬 publish 스크립트 — approve-commit.mjs 실행 후 실행하는 후속 단계.
 *
 * ── 전제 조건 ──────────────────────────────────────────────────────────────────
 * 이 스크립트 실행 전에 아래 순서가 완료되어야 합니다:
 *   1. npm run approval:commit  → current.json / archive / manifest 반영 완료
 *   2. npm run detail:generate  → current/details/* 생성 완료
 *
 * ── 이 스크립트의 담당 범위 ───────────────────────────────────────────────────
 *   - admin/overlap_history.json  갱신  (Phase F)
 *   - data/manifests/approval.json 초기화 (Phase G — 다음 사이클 준비)
 *   - data/draft/{week_id}.json 정리     (Phase H — --keep-draft 없으면 삭제)
 *   - git commit                         (Phase I — --skip-git 없으면 실행)
 *
 * ── 이 스크립트가 담당하지 않는 범위 ─────────────────────────────────────────
 *   - current.json 생성/변환   → approve-commit.mjs 담당
 *   - archive.json 생성        → approve-commit.mjs 담당
 *   - archive/details 복사     → approve-commit.mjs 담당
 *   - manifest.json 갱신       → approve-commit.mjs 담당
 *   - current/details 생성     → detail:generate 담당
 *   - git push                 → 수동 (또는 CI)
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

// ── 검증 ──────────────────────────────────────────────────────────────────────
// 전제: approve-commit.mjs가 이미 실행되어 current.json / archive / manifest가
//       반영된 상태여야 합니다.
//
// [BLOCKER] 조건:
//   1. approval.json 존재
//   2. approval.draft_week_id 일치
//   3. approval.decision === 'approved'
//   4. draft 파일 존재
//   5. current.json 존재 + week_id 일치 (approve-commit 완료 확인)
//   6. manifest.json 존재
//   7. current.json market_summary에 '[편집 필요]' placeholder 없음
// [WARNING]: signal_review, draft detail 커버리지, overlap_history 중복
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

  // ── [BLOCKER 5] current.json 존재 + week_id 일치 (approve-commit 완료 확인)
  // approve-commit.mjs가 먼저 실행되어 current.json을 생성했는지 검증합니다.
  // manifest.draft_week_id 체크는 approve-commit이 null로 세팅하므로 사용하지 않습니다.
  const currentReport = readJson(PATHS.currentMain)
  if (!currentReport) {
    blockers.push(
      `current.json이 없습니다. 먼저 승인 반영을 실행하세요: ` +
      `npm run approval:commit -- --decision approved --reviewed-by <이름> ` +
      `--acknowledge-data-quality --week-id ${weekId}`
    )
  } else if (currentReport.week_id !== weekId) {
    blockers.push(
      `current.json의 week_id(${currentReport.week_id})가 입력 week_id(${weekId})와 다릅니다. ` +
      `먼저 승인 반영을 실행하세요: ` +
      `npm run approval:commit -- --decision approved --reviewed-by <이름> ` +
      `--acknowledge-data-quality --week-id ${weekId}`
    )
  }

  // ── [BLOCKER 6] manifest.json 존재
  const manifest = readJson(PATHS.manifest)
  if (!manifest) {
    blockers.push('manifest.json 파일이 없습니다.')
  }

  // ── [BLOCKER 7] current.json market_summary에 [편집 필요] placeholder 없음
  // approve-commit.mjs가 auto-generate에 실패하거나 수동으로 placeholder를 남긴 경우 차단.
  if (currentReport) {
    const ms = currentReport.market_summary ?? {}
    const PLACEHOLDER = '[편집 필요]'
    const badFields = []
    if (String(ms.global?.headline ?? '').includes(PLACEHOLDER))
      badFields.push('global.headline')
    if (String(ms.domestic?.kospi?.brief ?? '').includes(PLACEHOLDER))
      badFields.push('domestic.kospi.brief')
    if (String(ms.domestic?.kosdaq?.brief ?? '').includes(PLACEHOLDER))
      badFields.push('domestic.kosdaq.brief')
    if (String(ms.domestic?.week_theme ?? '').includes(PLACEHOLDER))
      badFields.push('domestic.week_theme')
    for (const sh of ms.domestic?.sector_highlights ?? []) {
      if (String(sh.note ?? '').includes(PLACEHOLDER))
        badFields.push(`domestic.sector_highlights[${sh.sector}].note`)
    }
    if (badFields.length > 0) {
      blockers.push(
        `current.json market_summary에 [편집 필요] placeholder가 남아 있습니다: ` +
        `${badFields.join(', ')}. ` +
        `approval:commit을 재실행하거나 current.json을 직접 수정하세요.`
      )
    }
  }

  // currentWeekId: manifest.current_week_id (요약 출력용, 블로커 아님)
  const currentWeekId = manifest?.current_week_id

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

  // ── [WARNING 3] current/details 커버리지 (approve-commit + detail:generate 완료 확인)
  // detail:generate는 current/details에 직접 씁니다 (draft/details 아님).
  if (draft) {
    const draftPicks = (draft.picks ?? []).map(p => p.ticker)
    const currentDetailFiles = listJsonFiles(PATHS.currentDetails)
    const detailTickers = currentDetailFiles.map(f => {
      const m = f.match(/^(?:stock|etf)_(.+)\.json$/)
      return m ? m[1] : null
    }).filter(Boolean)
    const missingDetails = draftPicks.filter(t => !detailTickers.includes(t))
    if (missingDetails.length > 0) {
      warnings.push(
        `current/details 중 picks에 없는 ticker: ${missingDetails.join(', ')} — ` +
        `detail:generate를 먼저 실행하세요: npm run detail:generate -- --week-id ${weekId}`
      )
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

  return { blockers, warnings, approval, manifest, draft, currentWeekId }
}

// ── Phase 함수 ─────────────────────────────────────────────────────────────────

function phaseA_archiveCurrentMain(currentWeekId, dryRun, log, archivedAt) {
  log('Phase A', `current/current.json → archive/${currentWeekId}.json (archived_at 추가)`)
  const src = PATHS.currentMain
  const dst = path.join(PATHS.archiveBase, `${currentWeekId}.json`)
  const current = readJson(src)
  if (dryRun) {
    log('Phase A', `  [DRY] WRITE data/archive/${currentWeekId}.json`)
    log('Phase A', `    archived_at: ${JSON.stringify(current?.archived_at ?? null)} → "${archivedAt}"`)
  } else {
    ensureDir(PATHS.archiveBase)
    const archived = { ...current, archived_at: archivedAt }
    writeJson(dst, archived)
    log('Phase A', `  ✓ 아카이브 완료: data/archive/${currentWeekId}.json (archived_at: ${archivedAt})`)
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

function phaseC_draftToCurrentMain(weekId, dryRun, log, publishedAt) {
  log('Phase C', `draft/${weekId}.json → current/current.json (published_at 설정, draft_note 제거)`)
  const src = path.join(PATHS.draftBase, `${weekId}.json`)
  const dst = PATHS.currentMain
  const draft = readJson(src)
  if (dryRun) {
    log('Phase C', `  [DRY] WRITE data/current/current.json`)
    log('Phase C', `    published_at: ${JSON.stringify(draft?.published_at ?? null)} → "${publishedAt}"`)
    if (draft && 'draft_note' in draft) {
      const preview = String(draft.draft_note ?? '').substring(0, 40)
      log('Phase C', `    draft_note  : "${preview}${draft.draft_note?.length > 40 ? '...' : ''}" → (제거)`)
    }
  } else {
    ensureDir(path.dirname(dst))
    const current = { ...draft, published_at: publishedAt }
    delete current.draft_note
    writeJson(dst, current)
    log('Phase C', `  ✓ 완료: data/current/current.json (published_at: ${publishedAt}, draft_note 제거)`)
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
  const { blockers, warnings, approval, manifest, draft, currentWeekId } = runChecks(weekId, verbose)

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

  const log = makeLogger()

  // ── Phase별 실행 ─────────────────────────────────────────────────────────────
  // Phase A, B, C, E는 approve-commit.mjs가 담당하므로 이 스크립트에서 건너뜁니다.
  //   Phase A (current.json → archive)  : approve-commit 완료
  //   Phase B (current/details → archive): approve-commit 완료
  //   Phase C (draft → current.json)    : approve-commit 완료
  //   Phase E (manifest 갱신)            : approve-commit 완료
  printSection(dryRun ? '[DRY-RUN] 예정 파일 변경 (실제 수정 없음)' : '[PUBLISH] 파일 변경 시작')
  console.log('')

  let lastCompletedPhase = 'Phase 0'

  try {
    log('Phase A', '(skip — approve-commit.mjs 가 current.json 아카이브 완료)')
    lastCompletedPhase = 'Phase A (skipped)'

    log('Phase B', '(skip — approve-commit.mjs 가 current/details 아카이브 완료)')
    lastCompletedPhase = 'Phase B (skipped)'

    log('Phase C', '(skip — approve-commit.mjs 가 draft → current.json 변환 완료)')
    lastCompletedPhase = 'Phase C (skipped)'

    // Phase D: draft/details → current/details (draft/details 없으면 no-op)
    // detail:generate가 current/details에 직접 쓰므로 대개 no-op입니다.
    phaseD_draftDetailsToCurrentDetails(dryRun, log)
    lastCompletedPhase = 'Phase D'

    log('Phase E', '(skip — approve-commit.mjs 가 manifest.json 갱신 완료)')
    lastCompletedPhase = 'Phase E (skipped)'

    // Phase F: overlap_history.json 갱신
    phaseF_updateOverlapHistory(weekId, draft, publishedAt, dryRun, log)
    lastCompletedPhase = 'Phase F'

    // Phase G: approval.json 초기화 (다음 사이클 준비)
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

#!/usr/bin/env node
/**
 * approve.mjs
 *
 * 로컬 approval write 스크립트.
 * data/manifests/approval.json의 검수 의사결정 필드를 갱신합니다.
 *
 * 이 스크립트가 수정하는 파일:
 *   - data/manifests/approval.json  (write 모드)
 *
 * 이 스크립트가 절대 수정하지 않는 파일:
 *   - data/manifests/manifest.json
 *   - data/current/*, data/draft/*, data/archive/*
 *   - data/news_signals/*, signal_review.json
 *   - admin/overlap_history.json
 *
 * 사용법:
 *   node scripts/approve.mjs --decision approved --reviewed-by jina
 *   node scripts/approve.mjs --decision approved --reviewed-by jina --note "검수 완료" --dry-run
 *   npm run approval:write -- --decision approved --reviewed-by jina
 *
 * 주의:
 *   --dry-run 플래그 없이 실행하면 approval.json이 실제로 수정됩니다.
 *   실행 전 반드시 --dry-run으로 변경 내용을 확인하세요.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── 경로 상수 ──────────────────────────────────────────────────────────────────
const APPROVAL_PATH = path.join(ROOT, 'data/manifests/approval.json')
const DRAFT_DIR     = path.join(ROOT, 'data/draft')

// ── 허용 enum 값 ───────────────────────────────────────────────────────────────
const ALLOWED_DECISIONS = ['approved', 'rejected', 'on_hold', 'pending']

// ── C-4 헬퍼 ───────────────────────────────────────────────────────────────────

function draftFilePath(weekId) {
  return path.join(DRAFT_DIR, `${weekId}.json`)
}

function draftExists(weekId) {
  if (!weekId) return false
  return fs.existsSync(draftFilePath(weekId))
}

/**
 * publish_ready: approved + draft_exists + data_quality_acknowledged + blocking_issues 없음
 * 이 값은 자동 계산만 하며, 사용자가 직접 설정할 수 없습니다.
 * publish_ready === true 여도 publish는 별도 수동 수행 필요합니다.
 */
function computePublishReady(next) {
  return (
    next.decision === 'approved' &&
    next.draft_exists === true &&
    next.data_quality_acknowledged === true &&
    (next.blocking_issues?.length ?? 1) === 0
  )
}
const ALLOWED_NEWS_SIGNAL_STATUSES = ['SUFFICIENT', 'PARTIAL', 'SPARSE']

// ── 확정 필드 목록 ─────────────────────────────────────────────────────────────
// draft_report_id / draft_week_id 는 수정 불가
// draft_exists / publish_ready 는 자동 계산 (사용자 직접 설정 불가)
const WRITABLE_FIELDS = [
  'decision', 'reviewed_by', 'reviewed_at', 'notes', 'news_signal_review_status',
  'blocking_issues', 'data_quality_acknowledged',  // C-4 추가
]
const READONLY_FIELDS  = ['draft_report_id', 'draft_week_id']
const COMPUTED_FIELDS  = ['draft_exists', 'publish_ready']   // C-4 자동 계산

// ── 유틸 ───────────────────────────────────────────────────────────────────────
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function nowIso() {
  return new Date().toISOString()
}

function parseArgs() {
  const args = process.argv.slice(2)
  const result = {
    decision: null,
    reviewedBy: null,
    note: null,
    newsSignalReviewStatus: null,
    weekId: null,
    blockingIssues: null,          // C-4: 쉼표 구분 문자열 또는 'none'
    acknowledgeDataQuality: false,  // C-4: 플래그
    dryRun: false,
    json: false,
    verbose: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]

    switch (arg) {
      case '--decision':
        result.decision = next; i++; break
      case '--reviewed-by':
        result.reviewedBy = next; i++; break
      case '--note':
        result.note = next; i++; break
      case '--news-signal-review-status':
        result.newsSignalReviewStatus = next; i++; break
      case '--week-id':
        result.weekId = next; i++; break
      case '--blocking-issues':
        result.blockingIssues = next; i++; break
      case '--acknowledge-data-quality':
        result.acknowledgeDataQuality = true; break
      case '--dry-run':
        result.dryRun = true; break
      case '--json':
        result.json = true; break
      case '--verbose':
        result.verbose = true; break
    }
  }

  return result
}

// ── 검증 ───────────────────────────────────────────────────────────────────────
function validate(args, current) {
  const errors = []
  const warnings = []

  // 필수: --decision
  if (!args.decision) {
    errors.push('--decision 인자가 필요합니다. 허용값: ' + ALLOWED_DECISIONS.join(' / '))
  } else if (!ALLOWED_DECISIONS.includes(args.decision)) {
    errors.push(`허용되지 않은 decision 값: "${args.decision}". 허용값: ${ALLOWED_DECISIONS.join(' / ')}`)
  }

  // 필수: --reviewed-by
  if (!args.reviewedBy || args.reviewedBy.trim() === '') {
    errors.push('--reviewed-by 인자가 필요합니다. 검수자 이름을 입력하세요.')
  }

  // 선택: --news-signal-review-status enum 검증
  if (args.newsSignalReviewStatus !== null) {
    if (!ALLOWED_NEWS_SIGNAL_STATUSES.includes(args.newsSignalReviewStatus)) {
      errors.push(
        `허용되지 않은 news-signal-review-status 값: "${args.newsSignalReviewStatus}". 허용값: ${ALLOWED_NEWS_SIGNAL_STATUSES.join(' / ')}`
      )
    }
  }

  // approval.json 존재 여부
  if (!fs.existsSync(APPROVAL_PATH)) {
    errors.push(`approval.json 파일이 없습니다: ${APPROVAL_PATH}`)
    return { errors, warnings }
  }

  // approval.json 구조 검증 (확정 필드 존재 여부)
  if (!current) {
    errors.push('approval.json을 읽을 수 없습니다. JSON 형식이 올바른지 확인하세요.')
    return { errors, warnings }
  }

  const missingFields = READONLY_FIELDS.filter(f => !(f in current))
  if (missingFields.length > 0) {
    errors.push(`approval.json에 필수 필드가 없습니다: ${missingFields.join(', ')}`)
  }

  if (!('decision' in current)) {
    errors.push('approval.json에 decision 필드가 없습니다.')
  }

  // --week-id 일치 검증
  if (args.weekId) {
    if (current.draft_week_id !== args.weekId) {
      errors.push(
        `--week-id 불일치: 입력값 "${args.weekId}" ≠ approval.json의 draft_week_id "${current.draft_week_id}"`
      )
    }
  }

  // C-4: draft 파일 존재 확인 (pending 외 상태로 전환 시 차단)
  if (args.decision && args.decision !== 'pending') {
    const weekId = args.weekId ?? current?.draft_week_id
    if (!weekId) {
      errors.push('draft_week_id가 없습니다. approval.json에 draft_week_id를 먼저 설정하세요.')
    } else if (!draftExists(weekId)) {
      errors.push(
        `data/draft/${weekId}.json 파일이 없습니다. Phase C-3을 먼저 실행하세요: npm run draft:c3 -- --week-id ${weekId}`
      )
    }
  }

  // pending으로 되돌리는 경우 경고
  if (args.decision === 'pending') {
    warnings.push('decision을 "pending"으로 설정합니다. 이전 승인/반려 상태가 초기화됩니다.')
  }

  // news_signal_review_status 미전달 시 현재 값 유지 안내
  if (args.newsSignalReviewStatus === null && current.news_signal_review_status) {
    warnings.push(
      `--news-signal-review-status 미전달. 현재 값 "${current.news_signal_review_status}" 유지됩니다.`
    )
  }

  return { errors, warnings }
}

// ── diff 계산 ──────────────────────────────────────────────────────────────────
function buildNext(args, current, reviewedAt) {
  const next = { ...current }

  next.decision    = args.decision
  next.reviewed_by = args.reviewedBy
  next.reviewed_at = reviewedAt
  next.notes       = args.note !== null ? args.note : (current.notes ?? null)

  if (args.newsSignalReviewStatus !== null) {
    next.news_signal_review_status = args.newsSignalReviewStatus
  }
  // newsSignalReviewStatus === null 이면 기존 값 유지 (next에 이미 복사됨)

  // C-4: blocking_issues
  if (args.blockingIssues !== null) {
    next.blocking_issues = (args.blockingIssues === 'none' || args.blockingIssues.trim() === '')
      ? []
      : args.blockingIssues.split(',').map(s => s.trim()).filter(Boolean)
  } else {
    next.blocking_issues = current.blocking_issues ?? []
  }

  // C-4: data_quality_acknowledged
  next.data_quality_acknowledged = args.acknowledgeDataQuality
    ? true
    : (current.data_quality_acknowledged ?? false)

  // C-4: 자동 계산 필드
  const weekId = args.weekId ?? current.draft_week_id
  next.draft_exists   = draftExists(weekId)
  next.publish_ready  = computePublishReady(next)

  return next
}

function buildDiff(current, next) {
  const changed = []
  const allKeys = new Set([...Object.keys(current), ...Object.keys(next)])

  for (const key of allKeys) {
    const before = current[key] ?? null
    const after = next[key] ?? null
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changed.push({ field: key, before, after })
    }
  }

  return changed
}

// ── 출력 ───────────────────────────────────────────────────────────────────────
function printHuman({ args, current, next, diff, errors, warnings, reviewedAt }) {
  const isBlocked = errors.length > 0
  const status = isBlocked ? '🚫 BLOCKED' : (args.dryRun ? '🔍 DRY-RUN (변경 없음)' : '✅ WRITTEN')

  console.log('')
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log(`║  APPROVE: ${(args.weekId || current?.draft_week_id || '?').padEnd(49)}║`)
  console.log(`║  actor  : ${(args.reviewedBy || '?').padEnd(49)}║`)
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`  상태: ${status}`)
  console.log('')

  if (errors.length > 0) {
    console.log('────────────────────────────────────────────────────────────')
    console.log('[오류 (ERRORS)]')
    errors.forEach(e => console.log(`  ✗ ${e}`))
    console.log('')
  }

  if (warnings.length > 0) {
    console.log('────────────────────────────────────────────────────────────')
    console.log('[경고 (WARNINGS)]')
    warnings.forEach(w => console.log(`  ⚠  ${w}`))
    console.log('')
  }

  if (!isBlocked && diff.length > 0) {
    console.log('────────────────────────────────────────────────────────────')
    console.log('[변경 필드 (CHANGED FIELDS)]')
    diff.forEach(d => {
      const before = d.before === null ? 'null' : `"${d.before}"`
      const after = d.after === null ? 'null' : `"${d.after}"`
      console.log(`  ${d.field}: ${before} → ${after}`)
    })
    console.log('')
  }

  if (!isBlocked && diff.length === 0) {
    console.log('────────────────────────────────────────────────────────────')
    console.log('[변경 없음] 현재 값과 동일합니다.')
    console.log('')
  }

  // decision / C-4 필드 / news_signal_review_status 역할 구분 안내
  if (!isBlocked) {
    console.log('────────────────────────────────────────────────────────────')
    console.log('[역할 구분 안내]')
    console.log(`  decision                  : "${next?.decision ?? args.decision}" — 발행 게이트 (유일한 차단 조건)`)
    const nss = next?.news_signal_review_status ?? current?.news_signal_review_status ?? null
    console.log(`  news_signal_review_status : "${nss ?? 'null'}" — 참고 정보 전용 (발행 차단 조건 아님)`)
    console.log('  ── C-4 필드 ──')
    console.log(`  draft_exists              : ${next?.draft_exists ?? '?'} — draft 파일 존재 여부 (자동 계산)`)
    const bi = next?.blocking_issues ?? []
    console.log(`  blocking_issues           : [${bi.join(', ') || '없음'}] — 승인 차단 이슈`)
    console.log(`  data_quality_acknowledged : ${next?.data_quality_acknowledged ?? false} — 데이터 한계 인지 여부`)
    console.log(`  publish_ready             : ${next?.publish_ready ?? false} — 자동 계산. true여도 publish는 수동 수행`)
    console.log('')
  }

  if (!isBlocked && args.dryRun) {
    console.log('  ※ dry-run 결과입니다. --dry-run 플래그를 제거하면 실제 파일이 수정됩니다.')
  }

  if (!isBlocked && !args.dryRun && diff.length > 0) {
    console.log(`  ✓ data/manifests/approval.json 갱신 완료 (${reviewedAt})`)
    console.log('  ✓ manifest.json / draft / current / archive / signal_review 수정 없음')
  }

  console.log('════════════════════════════════════════════════════════════')
  console.log('')
}

function printJson({ args, current, next, diff, errors, warnings, reviewedAt }) {
  const isBlocked = errors.length > 0
  const out = {
    dry_run: args.dryRun,
    week_id: args.weekId || current?.draft_week_id || null,
    actor: args.reviewedBy,
    decision: args.decision,
    note: args.note,
    news_signal_review_status: args.newsSignalReviewStatus,
    status: isBlocked ? 'BLOCKED' : (args.dryRun ? 'DRY_RUN' : 'WRITTEN'),
    errors,
    warnings,
    changed_fields: diff.map(d => d.field),
    diff,
    executed_at: reviewedAt,
    approval_after: isBlocked ? null : next,
  }
  console.log(JSON.stringify(out, null, 2))
}

// ── 메인 ───────────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs()
  const reviewedAt = nowIso()

  const current = readJson(APPROVAL_PATH)
  const { errors, warnings } = validate(args, current)

  const next = errors.length === 0
    ? buildNext(args, current, reviewedAt)
    : null

  const diff = errors.length === 0
    ? buildDiff(current, next)
    : []

  if (args.json) {
    printJson({ args, current, next, diff, errors, warnings, reviewedAt })
  } else {
    printHuman({ args, current, next, diff, errors, warnings, reviewedAt })
  }

  if (errors.length > 0) {
    process.exit(1)
  }

  // 실제 write — dry-run이 아니고 변경이 있을 때만
  if (!args.dryRun && diff.length > 0) {
    fs.writeFileSync(APPROVAL_PATH, JSON.stringify(next, null, 2) + '\n', 'utf-8')
  }

  process.exit(0)
}

main()

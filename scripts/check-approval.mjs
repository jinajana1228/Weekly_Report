#!/usr/bin/env node
/**
 * scripts/check-approval.mjs
 *
 * Phase C-4 approval 상태 조회 스크립트 (읽기 전용).
 *
 * 이 스크립트는 어떤 파일도 수정하지 않습니다.
 * - approval.json 읽기 전용
 * - draft 파일 존재 여부 확인
 * - publish_ready 조건 해설
 *
 * 사용법:
 *   node scripts/check-approval.mjs
 *   node scripts/check-approval.mjs --week-id 2026-W14
 *   npm run approval:check -- --week-id 2026-W14
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname     = path.dirname(fileURLToPath(import.meta.url))
const ROOT          = path.resolve(__dirname, '..')
const APPROVAL_PATH = path.join(ROOT, 'data/manifests/approval.json')
const DRAFT_DIR     = path.join(ROOT, 'data/draft')

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')) }
  catch { return null }
}

function parseArgs() {
  const args = process.argv.slice(2)
  const result = { weekId: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--week-id') { result.weekId = args[i + 1]; i++ }
  }
  return result
}

function draftExists(weekId) {
  if (!weekId) return false
  return fs.existsSync(path.join(DRAFT_DIR, `${weekId}.json`))
}

function decisionIcon(d) {
  switch (d) {
    case 'approved':  return '✅'
    case 'rejected':  return '❌'
    case 'on_hold':   return '⏸️ '
    case 'pending':   return '⏳'
    default:          return '❓'
  }
}

function main() {
  const args   = parseArgs()
  const apv    = readJson(APPROVAL_PATH)

  if (!apv) {
    console.error('❌ approval.json을 읽을 수 없습니다:', APPROVAL_PATH)
    process.exit(1)
  }

  const weekId     = args.weekId ?? apv.draft_week_id
  const draftFound = draftExists(weekId)

  // --week-id 불일치 경고
  if (args.weekId && args.weekId !== apv.draft_week_id) {
    console.warn(`⚠️  --week-id "${args.weekId}" ≠ approval.json draft_week_id "${apv.draft_week_id}"`)
    console.warn('   approval.json은 하나의 week_id만 관리합니다.')
    console.warn('')
  }

  // ── 기본 정보 출력 ───────────────────────────────────────────────────────────
  console.log('')
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log(`║  APPROVAL STATUS — ${(weekId ?? '?').padEnd(39)}║`)
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`  draft_report_id  : ${apv.draft_report_id ?? 'null'}`)
  console.log(`  draft_week_id    : ${apv.draft_week_id ?? 'null'}`)
  console.log(`  draft 파일       : data/draft/${weekId}.json — ${draftFound ? '✅ 존재' : '❌ 없음 (Phase C-3 필요)'}`)
  console.log('')
  console.log('────────────────────────────────────────────────────────────')
  console.log('[승인 상태]')
  console.log(`  decision                  : ${decisionIcon(apv.decision)} ${apv.decision ?? 'null'}`)
  console.log(`  reviewed_by               : ${apv.reviewed_by ?? 'null'}`)
  console.log(`  reviewed_at               : ${apv.reviewed_at ?? 'null'}`)
  console.log(`  notes                     : ${apv.notes ?? 'null'}`)
  console.log(`  news_signal_review_status : ${apv.news_signal_review_status ?? 'null'}`)
  console.log('')
  console.log('────────────────────────────────────────────────────────────')
  console.log('[C-4 publish_ready 조건]')

  const conditions = [
    {
      label: 'decision === approved',
      ok:    apv.decision === 'approved',
      value: apv.decision,
      fix:   `npm run approval:commit -- --decision approved --reviewed-by <이름> --acknowledge-data-quality --week-id ${weekId}`,
    },
    {
      label: 'draft_exists === true',
      ok:    draftFound,
      value: draftFound,
      fix:   `npm run draft:c3 -- --week-id ${weekId}`,
    },
    {
      label: 'data_quality_acknowledged === true',
      ok:    apv.data_quality_acknowledged === true,
      value: apv.data_quality_acknowledged,
      fix:   `npm run approval:commit -- --decision approved --reviewed-by <이름> --acknowledge-data-quality --week-id ${weekId}`,
    },
    {
      label: 'blocking_issues 없음',
      ok:    (apv.blocking_issues?.length ?? 1) === 0,
      value: `[${(apv.blocking_issues ?? []).join(', ') || '없음'}]`,
      fix:   `npm run approval:commit -- --decision approved --reviewed-by <이름> --blocking-issues none --acknowledge-data-quality --week-id ${weekId}`,
    },
  ]

  conditions.forEach(c => {
    const icon = c.ok ? '  ✅' : '  ❌'
    console.log(`${icon}  ${c.label} (현재: ${c.value})`)
    if (!c.ok) console.log(`        → 해결: ${c.fix}`)
  })

  const allOk = conditions.every(c => c.ok)
  console.log('')
  console.log(`  publish_ready (자동계산) : ${apv.publish_ready === true ? '✅ true' : '❌ false'}`)
  if (apv.publish_ready !== allOk) {
    console.log(`  ⚠️  저장된 publish_ready(${apv.publish_ready}) ≠ 현재 조건 계산(${allOk})`)
    console.log('     approval.json을 재실행해 동기화하세요.')
  }

  console.log('')
  console.log('────────────────────────────────────────────────────────────')
  console.log('[다음 단계 안내]')
  if (allOk) {
    console.log('  ✅ 모든 조건 충족 — 아래 명령 1회로 승인+반영 완료:')
    console.log(`     npm run approval:commit -- --decision approved --reviewed-by <이름> \\`)
    console.log(`       --acknowledge-data-quality --week-id ${weekId}`)
    console.log('  ※ 반영 전 드라이런 권장: 위 명령에 --dry-run 추가')
  } else {
    console.log('  ❌ 미충족 조건 해소 후 아래 명령으로 승인+반영:')
    console.log(`     npm run approval:commit -- --decision approved --reviewed-by <이름> \\`)
    console.log(`       --acknowledge-data-quality --week-id ${weekId}`)
  }
  console.log('')
  console.log('  이 스크립트는 어떤 파일도 수정하지 않습니다.')
  console.log('════════════════════════════════════════════════════════════')
  console.log('')
}

main()

#!/usr/bin/env node
/**
 * scripts/lib/week-id.mjs
 *
 * ISO 8601 주차 ID 계산 유틸리티.
 * 포맷: YYYY-Www (예: 2026-W14)
 *
 * 사용법:
 *   import { getCurrentWeekId, dateToWeekId, parseWeekId } from './lib/week-id.mjs'
 */

/**
 * 날짜에서 ISO 8601 주차 번호를 계산합니다.
 * @param {Date} date
 * @returns {{ year: number, week: number }}
 */
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // ISO 주의 목요일을 기준으로 연도를 결정
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return { year: d.getUTCFullYear(), week }
}

/**
 * 현재 날짜의 week_id를 반환합니다.
 * @returns {string} 예: "2026-W14"
 */
export function getCurrentWeekId() {
  return dateToWeekId(new Date())
}

/**
 * 주어진 Date의 week_id를 반환합니다.
 * @param {Date} date
 * @returns {string} 예: "2026-W14"
 */
export function dateToWeekId(date) {
  const { year, week } = getISOWeek(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/**
 * week_id 문자열을 파싱합니다.
 * @param {string} weekId 예: "2026-W14"
 * @returns {{ year: number, week: number }}
 */
export function parseWeekId(weekId) {
  const m = weekId.match(/^(\d{4})-W(\d{2})$/)
  if (!m) throw new Error(`Invalid week_id format: ${weekId}`)
  return { year: parseInt(m[1], 10), week: parseInt(m[2], 10) }
}

/**
 * week_id가 유효한 포맷인지 확인합니다.
 * @param {string} weekId
 * @returns {boolean}
 */
export function isValidWeekId(weekId) {
  try {
    parseWeekId(weekId)
    return true
  } catch {
    return false
  }
}

// CLI 직접 실행 시 현재 week_id 출력
if (process.argv[1] && process.argv[1].endsWith('week-id.mjs')) {
  console.log(getCurrentWeekId())
}

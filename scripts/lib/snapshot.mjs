#!/usr/bin/env node
/**
 * scripts/lib/snapshot.mjs
 *
 * 스냅샷 저장·읽기 유틸리티.
 * 수집 스크립트에서 공통으로 사용합니다.
 *
 * 저장 경로: data/snapshots/{week_id}/{filename}
 * 이 유틸리티는 data/current, data/draft, data/archive를 절대 건드리지 않습니다.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

const SNAPSHOTS_DIR = path.join(ROOT, 'data/snapshots')
const CONFIG_DIR = path.join(ROOT, 'config')

/**
 * 유니버스 설정을 읽습니다.
 * @returns {{ tickers: Array<object> }}
 */
export function loadUniverse() {
  const filePath = path.join(CONFIG_DIR, 'universe.json')
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (err) {
    throw new Error(`universe.json 로드 실패: ${err.message}`)
  }
}

/**
 * active=true인 종목만 반환합니다.
 * @returns {Array<object>}
 */
export function getActiveTickers() {
  const universe = loadUniverse()
  return universe.tickers.filter((t) => t.active !== false)
}

/**
 * active=true이고 asset_type=stock인 종목만 반환합니다.
 * @returns {Array<object>}
 */
export function getActiveStocks() {
  return getActiveTickers().filter((t) => t.asset_type === 'stock')
}

/**
 * active=true이고 asset_type=etf인 종목만 반환합니다.
 * @returns {Array<object>}
 */
export function getActiveETFs() {
  return getActiveTickers().filter((t) => t.asset_type === 'etf')
}

/**
 * 스냅샷 디렉토리 경로를 반환합니다. 없으면 생성합니다.
 * @param {string} weekId
 * @returns {string} 디렉토리 절대 경로
 */
export function getSnapshotDir(weekId) {
  const dir = path.join(SNAPSHOTS_DIR, weekId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 스냅샷 파일을 저장합니다.
 * @param {string} weekId
 * @param {string} filename  예: "krx_price.json"
 * @param {object} payload   저장할 데이터 객체
 */
export function saveSnapshot(weekId, filename, payload) {
  const dir = getSnapshotDir(weekId)
  const filePath = path.join(dir, filename)
  const content = JSON.stringify(payload, null, 2)
  fs.writeFileSync(filePath, content, 'utf-8')
  const sizeKb = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1)
  console.log(`  [저장] ${path.relative(ROOT, filePath)} (${sizeKb} KB)`)
}

/**
 * 스냅샷 파일을 읽습니다. 없으면 null을 반환합니다.
 * @param {string} weekId
 * @param {string} filename
 * @returns {object|null}
 */
export function readSnapshot(weekId, filename) {
  const filePath = path.join(SNAPSHOTS_DIR, weekId, filename)
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * 수집 결과 envelope를 생성합니다.
 * @param {object} opts
 * @param {string} opts.weekId
 * @param {string} opts.source       예: "KRX_OHLCV"
 * @param {string} opts.schemaVersion 예: "1.0"
 * @param {string} opts.asOf         예: "2026-04-03"
 * @param {Array|object} opts.data   실제 수집 데이터
 * @returns {object}
 */
export function makeEnvelope({ weekId, source, schemaVersion, asOf, data }) {
  return {
    week_id: weekId,
    collected_at: new Date().toISOString(),
    source,
    schema_version: schemaVersion,
    as_of: asOf,
    data,
  }
}

/**
 * 환경 변수에서 API 키를 읽습니다. 없으면 에러를 던집니다.
 * @param {string} envKey  예: "DART_API_KEY"
 * @returns {string}
 */
export function requireEnv(envKey) {
  const val = process.env[envKey]
  if (!val) {
    throw new Error(`환경 변수 ${envKey}가 설정되지 않았습니다. .env.local 또는 환경 변수를 확인하세요.`)
  }
  return val
}

/**
 * 환경 변수에서 API 키를 읽습니다. 없으면 null을 반환합니다.
 * @param {string} envKey
 * @returns {string|null}
 */
export function optionalEnv(envKey) {
  return process.env[envKey] ?? null
}

/**
 * 지연 함수 (rate limit 준수용).
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * CLI 인자에서 --week-id 값을 파싱합니다.
 * 없으면 null을 반환합니다.
 * @returns {string|null}
 */
export function parseWeekIdArg() {
  const idx = process.argv.indexOf('--week-id')
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1]
  }
  return null
}

/**
 * CLI 인자에서 --dry-run 플래그를 확인합니다.
 * @returns {boolean}
 */
export function isDryRun() {
  return process.argv.includes('--dry-run')
}

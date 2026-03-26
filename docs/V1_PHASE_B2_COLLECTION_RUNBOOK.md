# V1 Phase B-2 수집 운영 런북 (Runbook)

> 최종 업데이트: 2026-03-26
> 대상: Phase B-2 수집 스크립트 운영자

---

## 1. 최초 설정 (최초 1회)

### 1-1. API 키 발급

| 소스 | 발급 URL | 소요 시간 | 비고 |
|------|----------|-----------|------|
| DART OpenAPI | https://opendart.fss.or.kr/intro/main.do | 즉시 | 무료, 10,000건/일 |
| ECOS (한국은행) | https://ecos.bok.or.kr/api/#/DevGuide/APIKeyApplication | 즉시 | 무료 |
| FRED | https://fred.stlouisfed.org/docs/api/api_key.html | 즉시 | 무료 |
| KRX | 불필요 | — | 공개 엔드포인트 |

### 1-2. 환경 변수 설정

프로젝트 루트에 `.env.local` 파일 생성:

```env
DART_API_KEY=여기에_DART_키_입력
ECOS_API_KEY=여기에_ECOS_키_입력
FRED_API_KEY=여기에_FRED_키_입력
```

> `.env.local`은 `.gitignore`에 이미 포함되어 있습니다. 커밋하지 마세요.

> **자동 로딩**: `node scripts/...` CLI 직접 실행 시에도 `scripts/lib/snapshot.mjs`가
> 초기화 시점에 `.env.local`을 자동으로 읽어 적재합니다. dotenv 등 별도 패키지 불필요.
> 시스템 환경변수(CI 등)가 이미 있으면 `.env.local` 값으로 덮어쓰지 않습니다.

### 1-3. 동작 확인 (드라이런)

```bash
npm run collect:all -- --week-id 2026-W14 --dry-run
```

오류 없이 각 수집기가 실행되면 준비 완료입니다.

---

## 2. 정기 수집 절차 (격주 리포트 발행 전)

### 2-1. 실행 타이밍

| 단계 | 타이밍 | 명령 |
|------|--------|------|
| D-1 (일요일 저녁) | 리포트 발행 전날 | `npm run collect:all -- --week-id YYYY-Www` |
| D-0 (월요일 아침) | 발행 당일, 드래프트 작성 전 | 필요 시 재수집 |

### 2-2. 수집 실행

```bash
# week_id 확인 (현재 주)
node scripts/lib/week-id.mjs

# 전체 수집
npm run collect:all -- --week-id 2026-W14

# 결과 확인
ls data/snapshots/2026-W14/
```

### 2-3. 수집 결과 검증

```bash
# 파일 생성 확인
ls -la data/snapshots/2026-W14/

# 요약 확인
cat data/snapshots/2026-W14/collection_run_summary.json

# KRX 오류 확인
node -e "const d=JSON.parse(require('fs').readFileSync('data/snapshots/2026-W14/krx_price.json')); console.log('레코드:', d.data.length, '/ 오류:', (d._errors||[]).length)"
```

정상 수집 기준:
- `krx_price.json` data 배열 15건 이상
- `dart_financials.json` data 배열 24건 이상 (12종목 × 2분기+연간 일부)
- `market_indicators.json` ecos.usd_krw.value 값 있음

---

## 3. 부분 재수집

특정 소스만 실패한 경우 해당 수집기만 재실행합니다.

```bash
# KRX만
npm run collect:krx -- --week-id 2026-W14

# DART만
npm run collect:dart -- --week-id 2026-W14

# 거시 지표만
npm run collect:market -- --week-id 2026-W14

# DART 건너뛰고 나머지
npm run collect:all -- --week-id 2026-W14 --skip-dart
```

---

## 4. 유니버스 관리

### 4-1. 종목 추가

`config/universe.json`의 `tickers` 배열에 추가:

```json
{
  "ticker": "000660",
  "name": "SK하이닉스",
  "market": "KOSPI",
  "sector": "TECH",
  "asset_type": "stock",
  "dart_corp_code": "00164779",
  "etf_krx_code": null,
  "active": true
}
```

**DART 고유번호 확인 방법**:
1. https://dart.fss.or.kr 접속
2. 기업명으로 검색
3. 기업 개황에서 고유번호 확인

### 4-2. 종목 임시 제외

```json
{ "ticker": "000000", ..., "active": false }
```

`active: false`로 설정하면 모든 수집에서 자동 제외됩니다.

### 4-3. 종목 영구 삭제

`config/universe.json`에서 항목 삭제 후 커밋.

---

## 5. 오류 대응

### Case A: KRX HTTP 오류 (5xx)

**증상**: `krx_price.json`에 대부분 레코드 없음, `_errors` 다수

**원인**: KRX 서버 점검 또는 일시적 오류

**대응**:
```bash
# 1-2시간 후 재시도
npm run collect:krx -- --week-id 2026-W14

# 또는 점검 완료 후 재시도
```

### Case B: DART API 오류 [020] (인증 실패)

**증상**: `DART API 오류 [020]` 메시지

**원인**: API 키 만료 또는 잘못된 키

**대응**:
1. DART OpenAPI 포털에서 키 확인
2. `.env.local`의 `DART_API_KEY` 업데이트
3. 재실행

### Case C: DART API 오류 [010] (일일 한도 초과)

**증상**: `DART API 오류 [010]`

**원인**: 10,000건/일 한도 초과 (매우 드문 경우)

**대응**:
- 익일 재실행 (한국시간 자정 리셋)
- 평상시 사용량: 약 45건 (15종목 × 3 API)

### Case D: Yahoo Finance 차단

**증상**: `market_indicators.json`의 `yahoo` 값이 모두 null

**원인**: Yahoo Finance 비공식 API 차단 또는 User-Agent 필터

**대응**:
- Yahoo는 보조 데이터이므로 당장 운영에 영향 없음
- S&P500/NASDAQ/VIX는 수동으로 market_indicators.json에 메모
- Phase C에서 공식 대체 소스 검토

### Case E: ECOS/FRED 응답 이상

**증상**: `ecos.usd_krw.value`가 null

**대응**:
```bash
# API 키 확인
node -e "console.log(process.env.ECOS_API_KEY)" # .env.local 로드는 dotenv 별도 필요
cat .env.local | grep ECOS

# ECOS 직접 테스트 (브라우저에서)
# https://ecos.bok.or.kr/api/StatisticSearch/{키}/json/kr/1/1/731Y001/D/20260401/20260407/0000001
```

---

## 6. 수집 결과를 리포트에 반영하는 방법 (현재 단계: 수동)

Phase B-2는 수집만 합니다. 리포트 JSON(`data/draft/`)에 반영하는 과정은 현재 수동입니다.

1. `data/snapshots/{week_id}/krx_price.json` 열기
2. 해당 종목의 `close`, `market_cap_krw` 등 확인
3. `data/draft/{week_id}.json` 및 `details/*.json`에 수동 입력
4. Phase C에서 이 과정이 자동화됩니다.

> **뉴스 신호에 대해**: 뉴스 입력은 이 절차의 체크리스트가 아닙니다.
> Phase B-2 수집은 수치 데이터(KRX·DART·거시지표)만으로 완성됩니다.
> 뉴스가 없어도 수집 완료 기준을 충족하며, 수치 기반 발행이 가능합니다.
> 뉴스 자동화 및 수동 입력 UI는 Phase C 이후에 검토합니다.

---

## 7. .gitignore 권장 설정

수집된 원본 스냅샷 데이터는 git에 포함하지 않는 것을 권장합니다:

```gitignore
# Phase B-2 수집 스냅샷 (원본 API 응답)
data/snapshots/**/*.json

# 단, 디렉토리 구조는 유지
!data/snapshots/.gitkeep
!data/snapshots/README.md

# API 키
.env.local
.env*.local
```

---

## 8. 빠른 참조 명령어

```bash
# 현재 week_id 확인
node scripts/lib/week-id.mjs

# 전체 수집 (드라이런)
npm run collect:all -- --week-id $(node scripts/lib/week-id.mjs) --dry-run

# 전체 수집 (실제)
npm run collect:all -- --week-id $(node scripts/lib/week-id.mjs)

# 수집 결과 디렉토리 확인
ls data/snapshots/$(node scripts/lib/week-id.mjs)/

# 수집 요약 확인
cat data/snapshots/$(node scripts/lib/week-id.mjs)/collection_run_summary.json

# KRX 오류 항목 확인
node -e "
const f='data/snapshots/$(node scripts/lib/week-id.mjs)/krx_price.json';
const d=JSON.parse(require('fs').readFileSync(f));
console.log('정상:', d.data.length, '/ 오류:', (d._errors||[]).length);
(d._errors||[]).forEach(e=>console.log(' -', e.ticker, e.error));
"
```

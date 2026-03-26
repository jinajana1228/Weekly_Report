# V1 Phase B-2 수집 구현 레퍼런스

> 최종 업데이트: 2026-03-26
> 상태: 구현 완료 (Phase B-2 최소 구현)

---

## 1. 개요

Phase B-2는 V1 실제 데이터 연결의 첫 번째 실행 단계입니다.
공개 API에서 원본 데이터를 수집해 `data/snapshots/{week_id}/`에 저장합니다.
리포트 JSON 반영(변환 로직)은 Phase C에서 구현합니다.

### 설계 원칙

| 원칙 | 내용 |
|------|------|
| **격리** | 수집 결과는 `data/snapshots/`에만 저장. `current/draft/archive` 비접촉 |
| **소스별 독립 실패** | 한 수집기 실패가 다른 수집기를 중단시키지 않음 |
| **유니버스 중앙화** | 대상 종목은 `config/universe.json` 단일 파일로 관리 |
| **재실행 안전** | 같은 week_id로 재실행하면 파일 덮어쓰기 (멱등성) |
| **드라이런 지원** | `--dry-run` 플래그로 실제 저장 없이 검증 가능 |

---

## 2. 파일 구조

```
config/
  universe.json                         ← 수집 대상 종목 목록

scripts/
  lib/
    week-id.mjs                         ← ISO 8601 주차 계산 유틸
    snapshot.mjs                        ← 저장·읽기·유니버스 로드 유틸
  collect-krx.mjs                       ← KRX 수집기
  collect-dart.mjs                      ← DART 수집기
  collect-market-indicators.mjs         ← ECOS + FRED + Yahoo 수집기
  run-phase-b2-collection.mjs           ← 마스터 러너

data/snapshots/
  {week_id}/
    krx_price.json
    krx_flow.json
    krx_exchange_status.json
    krx_indices.json
    krx_listing.json
    krx_etf_meta.json
    dart_financials.json
    dart_disclosures.json
    dart_audit.json
    market_indicators.json
    krx_collection_summary.json
    dart_collection_summary.json
    collection_run_summary.json
```

---

## 3. config/universe.json 구조

```json
{
  "_schema_version": "1.0",
  "tickers": [
    {
      "ticker": "005930",
      "name": "삼성전자",
      "market": "KOSPI",
      "sector": "TECH",
      "asset_type": "stock",
      "dart_corp_code": "00126380",
      "etf_krx_code": null,
      "active": true
    }
  ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `ticker` | string | KRX 6자리 종목코드 |
| `dart_corp_code` | string\|null | DART 고유번호 (8자리). ETF는 null |
| `etf_krx_code` | string\|null | ETF 구성종목 조회용 코드. 일반주식은 null |
| `active` | boolean | false 설정 시 모든 수집에서 제외 |

### 종목 추가 방법

1. `config/universe.json`에 항목 추가
2. DART 고유번호는 DART 기업개황 검색에서 확인: https://dart.fss.or.kr
3. `active: false`로 임시 제외 가능

---

## 4. 수집기별 상세

### 4-1. KRX 수집기 (`collect-krx.mjs`)

**수집 기준일**: 실행일 기준 최근 영업일 (토·일 → 금요일)

| 파일 | 실제 소스 | envelope source | 설명 |
|------|-----------|-----------------|------|
| `krx_price.json` | Yahoo Finance (.KS/.KQ) | `YAHOO_PRICE_KR` | 종가·시가·고저·거래량·시총·52주 고저 |
| `krx_flow.json` | — (수집 불가) | `KRX_FLOW_UNAVAILABLE` | 빈 데이터 + 사유 명시 |
| `krx_exchange_status.json` | KRX OAP MDCSTAT30001 | `KRX_EXCHANGE_STATUS` | 투자경고·매매정지 지정 여부 |
| `krx_indices.json` | Yahoo Finance (^KS11 등) | `YAHOO_INDICES_KR` | KOSPI, KOSDAQ, KOSPI200 |
| `krx_listing.json` | KRX OAP MDCSTAT03901 | `KRX_LISTING` | 상장주식수, 상장일 |
| `krx_etf_meta.json` | KRX OAP MDCSTAT04601 | `KRX_ETF_META` | 추적지수, 보수율, NAV |

**소스 분리 이유**:
KRX `data.krx.co.kr/comm/bldAttendant/executeForResourceBundle.cmd`는 JSESSIONID 브라우저 세션이 필요합니다.
Node.js fetch 환경에서 HTML 오류페이지를 반환하므로 price/indices/flow는 대체 소스를 사용합니다.

**flow 수집 불가 사유**:
외국인·기관 수급 데이터는 KRX 공식 REST API(openkrx.or.kr) 신청 또는
KRX 파일 다운로드 방식으로 Phase B-3 또는 C에서 구현 예정.

**Yahoo Finance KR 심볼**:
- 주식: `{ticker}.KS` (KOSPI), `{ticker}.KQ` (KOSDAQ)
- 지수: `^KS11` (KOSPI), `^KQ11` (KOSDAQ), `^KS200` (KOSPI200)

### 4-2. DART 수집기 (`collect-dart.mjs`)

**소스**: DART OpenAPI (opendart.fss.or.kr)
**인증**: DART_API_KEY 환경 변수 필수
**일일 한도**: 10,000건 (무료)

| 파일 | 엔드포인트 | 설명 |
|------|-----------|------|
| `dart_financials.json` | /fnlttSinglAcnt.json | 별도재무제표, 최근 2분기·연간 |
| `dart_disclosures.json` | /list.json | 최근 4주 공시 목록 |
| `dart_audit.json` | /fnlttAuditOpnn.json | 감사의견, 감사법인 |

**주의사항**:
- `fs_div: 'OFS'` = 별도(Separate) 재무제표 (연결은 CFS)
- ETF는 dart_corp_code가 null이므로 자동 건너뜀
- API 오류 코드 `013` = 데이터 없음 (정상 빈 응답으로 처리)
- 요청 간 300ms 대기

### 4-3. 거시 지표 수집기 (`collect-market-indicators.mjs`)

**소스**: ECOS + FRED + Yahoo Finance (보조)

| 소스 | 항목 | 환경 변수 |
|------|------|-----------|
| ECOS | USD/KRW 기준환율 (731Y001), BOK 기준금리 (722Y001) | ECOS_API_KEY |
| FRED | 미국 10년물 (DGS10), 연방기금금리 (FEDFUNDS) | FRED_API_KEY |
| Yahoo Finance | S&P500 (^GSPC), NASDAQ (^IXIC), VIX (^VIX) | 없음 |

**Yahoo Finance 주의**:
- 비공식 엔드포인트 (`query1.finance.yahoo.com/v8/finance/chart`)
- 차단·변경 가능성 있음. Hard Filter에 사용 불가, 보조 참고용만 허용
- 실패 시 해당 항목만 오류 기록, 전체 수집 중단 없음

---

## 5. 공통 envelope 포맷

모든 수집 파일은 다음 구조를 따릅니다:

```json
{
  "week_id": "2026-W14",
  "collected_at": "2026-04-07T09:00:00.000Z",
  "source": "KRX_OHLCV",
  "schema_version": "1.0",
  "as_of": "20260407",
  "data": [ ... ],
  "_errors": [
    { "ticker": "000000", "error": "오류 내용" }
  ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `week_id` | string | 수집 대상 주차 (ISO 8601) |
| `collected_at` | ISO 8601 | 수집 실행 시각 (UTC) |
| `source` | string | 소스 식별자 |
| `schema_version` | string | 파일 스키마 버전 (하위 호환 추적용) |
| `as_of` | string | 데이터 기준일 (KRX: YYYYMMDD, 그 외: YYYY-MM-DD) |
| `data` | array | 수집된 레코드 배열 |
| `_errors` | array | 개별 실패 항목 목록 (없으면 생략) |

---

## 6. 환경 변수 설정

`.env.local` (프로젝트 루트):

```env
# DART OpenAPI — https://opendart.fss.or.kr/intro/main.do
DART_API_KEY=your_dart_api_key_here

# ECOS (한국은행) — https://ecos.bok.or.kr/api/#/DevGuide/APIKeyApplication
ECOS_API_KEY=your_ecos_api_key_here

# FRED — https://fred.stlouisfed.org/docs/api/api_key.html
FRED_API_KEY=your_fred_api_key_here
```

**KRX는 인증 불필요** — API 키 없이 동작합니다.

**`.env.local` 자동 로딩 방식**:
`scripts/lib/snapshot.mjs` 모듈 초기화 시 프로젝트 루트의 `.env.local`을 자동으로 읽어
`process.env`에 적재합니다. `node scripts/...` CLI 직접 실행 시에도 별도 설정 없이 동작합니다.
이미 설정된 시스템 환경변수(CI 등)는 덮어쓰지 않습니다.

---

## 7. 오류 처리 전략

| 수준 | 처리 방법 |
|------|-----------|
| 종목 단위 실패 | `_errors` 배열에 기록 후 다음 종목 계속 |
| 수집 항목 단위 실패 | 해당 항목 summary에 fatal 기록 후 다음 항목 계속 |
| 수집기 단위 실패 | `collection_run_summary.json`에 기록. 다른 수집기 계속 |
| API 키 없음 (DART) | 즉시 종료 (exit 1) |
| API 키 없음 (ECOS/FRED) | 경고 출력 후 해당 소스만 건너뜀 |
| Yahoo 비공식 차단 | 해당 지수만 null 기록, 전체 중단 없음 |

---

## 8. 구현 제외 항목 (Phase C 이후)

> Phase B-2는 수치 데이터(KRX·DART·거시지표) 수집만으로 완성된 단계입니다.
> 뉴스 신호는 수집 완성의 전제 조건이 아닙니다. 뉴스 없이도 수집 완료 기준을 충족합니다.

- 뉴스 자동 수집 — Phase C 이후 검토. Phase B-2 미포함, 수집 완성에 영향 없음
- 뉴스 수동 입력 UI — Phase C 이후 검토. Phase B-2 미포함
- KRX ETF 구성종목 상세 (KOFIA API, Phase B-3 또는 C)
- 스냅샷 → 리포트 JSON 변환 로직
- Hard Filter 자동 판단
- 추천 로직 자동화
- Admin UI 변경

---

## 9. Self-check

구현 전 확인 목록:

- [x] `data/current`, `data/draft`, `data/archive` 수정 없음
- [x] `approval.json`, `manifest.json` 수정 없음
- [x] 뉴스 자동화 없음
- [x] Hard Filter 판단 로직 없음
- [x] 추천 로직 없음
- [x] 유니버스를 코드 내 하드코딩하지 않고 `config/universe.json`으로 분리
- [x] ESM (.mjs) 패턴 준수
- [x] built-in fetch (Node.js 18+) 사용
- [x] 각 수집기 독립 실패 처리
- [x] --dry-run 플래그 지원
- [x] --week-id 인자 지원

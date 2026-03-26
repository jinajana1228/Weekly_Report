# V1 Phase B-3 정규화/변환 구현 레퍼런스

> 최종 업데이트: 2026-03-26
> 상태: 구현 완료 (Phase B-3 최소 구현)

---

## 1. 개요

Phase B-3는 Phase B-2 수집 결과를 후속 로직(추천/Hard Filter/리포트 생성)이
바로 참조할 수 있는 **정규화된 중간 데이터**로 변환하는 단계입니다.

원천 데이터(raw snapshots)를 그대로 두고, 별도 저장 영역(`data/processed/`)에 가공본을 생성합니다.

### 설계 원칙

| 원칙 | 내용 |
|------|------|
| **격리** | processed는 snapshots/current/draft/archive와 독립된 별도 영역 |
| **비파괴** | snapshots 원천 파일을 덮어쓰거나 수정하지 않음 |
| **유니버스 기준** | 정규화 기준은 `config/universe.json`. 하드코딩 금지 |
| **provenance 추적** | 각 필드에 source 식별자 기록 — 어디서 온 값인지 추적 가능 |
| **unavailable 명시** | 수집 불가 데이터는 null로 사라지게 하지 않고 status/reason 기록 |
| **판단 배제** | 추천/Hard Filter/점수 계산 없음. 정규화/변환만 수행 |
| **재실행 안전** | 같은 week_id로 재실행하면 덮어쓰기 (멱등성) |

---

## 2. 파일 구조

```
scripts/
  normalize-phase-b3.mjs         ← Phase B-3 메인 정규화 스크립트

data/
  snapshots/{week_id}/           ← Phase B-2 원천 (변경 없음)
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
  processed/{week_id}/           ← Phase B-3 정규화 산출물 (신규)
    normalized_entities.json
    market_context.json
    source_health.json
```

---

## 3. 정규화 스크립트

### `scripts/normalize-phase-b3.mjs`

**단일 진입점**. `--week-id` 인자를 받아 3개 processed 파일을 생성합니다.

```bash
node scripts/normalize-phase-b3.mjs --week-id 2026-W14
node scripts/normalize-phase-b3.mjs --week-id 2026-W14 --dry-run
npm run normalize:b3 -- --week-id 2026-W14
```

**내부 구조**:

| 함수 | 생성 파일 | 역할 |
|------|-----------|------|
| `buildNormalizedEntities(weekId)` | `normalized_entities.json` | 종목/ETF 단위 통합 |
| `buildMarketContext(weekId)` | `market_context.json` | 시장 지표 요약 |
| `buildSourceHealth(weekId)` | `source_health.json` | 수집 품질 정리 |
| `saveProcessed(weekId, filename, payload)` | — | processed 저장 유틸 |

**외부 의존성**: `scripts/lib/snapshot.mjs`(기존), `scripts/lib/week-id.mjs`(기존). 신규 패키지 없음.

---

## 4. processed 파일 상세

### 4-1. `normalized_entities.json`

**목적**: 유니버스 전체 종목/ETF를 ticker 단위로 통합한 마스터 레코드.
후속 추천/Hard Filter 로직이 이 파일 하나를 참조하면 됩니다.

**소스 결합 우선순위**:

| 필드 | 소스 | 비고 |
|------|------|------|
| ticker, name, asset_type, market, sector_code | `config/universe.json` | 기준 마스터 |
| price | `krx_price.json` | Yahoo Finance .KS/.KQ 수집본 |
| listing | `krx_listing.json` | KRX OAP (현재 unavailable) |
| exchange_status | `krx_exchange_status.json` | KRX OAP (투자경고/매매정지 여부) |
| flow | `krx_flow.json` | KRX OAP (현재 unavailable) |
| dart_financials | `dart_financials.json` | DART OpenAPI (stock 전용) |
| dart_disclosures | `dart_disclosures.json` | DART OpenAPI (stock 전용) |
| dart_audit | `dart_audit.json` | DART OpenAPI (stock 전용) |
| etf_meta | `krx_etf_meta.json` | KRX OAP ETF 메타 (etf 전용, 현재 unavailable) |

**최상위 구조**:
```json
{
  "week_id": "2026-W14",
  "built_at": "2026-03-26T10:00:00.000Z",
  "schema_version": "1.0",
  "source_refs": { "price": "data/snapshots/2026-W14/krx_price.json", ... },
  "record_count": 15,
  "records": [ ... ]
}
```

**레코드 구조 (stock 예시)**:
```json
{
  "ticker": "005930",
  "name": "삼성전자",
  "asset_type": "stock",
  "market": "KOSPI",
  "sector_code": "TECH",
  "price": {
    "close": 180100, "open": null, "high": 185900, "low": 178900,
    "prev_close": null, "volume": 34014311,
    "market_cap_krw": null, "week52_high": 223000, "week52_low": 52900,
    "as_of": "20260326", "source": "krx_price", "price_provider": "yahoo_finance"
  },
  "listing": {
    "status": "unavailable",
    "reason": "상장 정보 없음 — KRX OAP 브라우저 세션 필요",
    "source": "krx_listing"
  },
  "exchange_status": {
    "is_exchange_designated": false,
    "as_of": "20260326",
    "source": "krx_exchange_status"
  },
  "flow": {
    "status": "unavailable",
    "reason": "KRX OAP 브라우저 세션 필요 — 자동 수집 불가",
    "source": "krx_flow"
  },
  "dart_financials": {
    "period_count": 1,
    "periods": [{
      "bsns_year": "2025", "reprt_code": "11011", "fs_div": "OFS",
      "financials": { "매출액": { ... }, "영업이익": { ... }, ... }
    }],
    "source": "dart_financials"
  },
  "dart_disclosures": {
    "bgn_de": "20260226", "count": 1,
    "recent": [{ "rcept_no": "...", "report_nm": "사업보고서 (2025.12)", ... }],
    "source": "dart_disclosures"
  },
  "dart_audit": {
    "bsns_year": null, "audit_opinion": null, "audit_firm": null, "going_concern": null,
    "_note": "2025·2024 모두 미공시 또는 수집 불가: ...",
    "source": "dart_audit"
  },
  "etf_meta": null
}
```

**ETF 레코드 차이점**:
- `dart_financials`, `dart_disclosures`, `dart_audit` → `null`
- `etf_meta` → `{ status: "unavailable", reason: "...", source: "krx_etf_meta" }` (현재)

---

### 4-2. `market_context.json`

**목적**: 시장 전체 맥락을 한 파일에서 참조 가능.
리포트 시장 요약 섹션 생성 시 이 파일 하나를 참조합니다.

**최상위 구조**:
```json
{
  "week_id": "2026-W14",
  "built_at": "...",
  "schema_version": "1.0",
  "source_refs": { "kr_indices": "...", "market_indicators": "..." },
  "kr_indices": {
    "kospi":    { "close": 5460.46, "prev_close": null, "change_pct": null, "volume": 925093, "as_of": "20260326", "source": "krx_indices", "price_provider": "yahoo_finance" },
    "kosdaq":   { ... },
    "kospi200": { ... }
  },
  "kr_macro": {
    "usd_krw":  { "value": 1467.2, "time": "20260126", "unit": "KRW", "source": "ecos" },
    "bok_rate": { "value": 2.5,    "time": "202602",   "unit": "%",   "source": "ecos" }
  },
  "us_macro": {
    "us_10y_treasury": { "value": 4.39, "date": "2026-03-24", "unit": "%", "source": "fred" },
    "fed_funds_rate":  { "value": 3.64, "date": "2026-02-01", "unit": "%", "source": "fred" }
  },
  "global_equities": {
    "sp500":  { "price": 6591.9, "change_pct": -0.5, "source": "yahoo", "_note": "보조 참고용 — Hard Filter 판단에 사용 불가" },
    "nasdaq": { ... },
    "vix":    { ... }
  }
}
```

**Yahoo 보조 데이터 주의**:
`global_equities`의 Yahoo 값은 `_note: "보조 참고용 — Hard Filter 판단에 사용 불가"` 필드가
항상 포함됩니다. 후속 로직은 이 필드를 확인해 사용 범위를 제한해야 합니다.

---

### 4-3. `source_health.json`

**목적**: source별 수집 상태 정리. 후속 로직이 어떤 필드를 신뢰할 수 있는지 파악합니다.

**status 값**:

| 값 | 의미 |
|----|------|
| `"ok"` | 모든 레코드 정상 수집 |
| `"partial"` | 일부 성공, 일부 오류 |
| `"unavailable"` | 전체 수집 불가 (세션 문제, API 키 없음 등) |

**최상위 구조**:
```json
{
  "week_id": "2026-W14",
  "built_at": "...",
  "schema_version": "1.0",
  "sources": {
    "krx_price":           { "status": "ok",          "record_count": 15, "error_count": 0 },
    "krx_flow":            { "status": "unavailable",  "reason": "KRX OAP 브라우저 세션 필요 ...", "record_count": 0 },
    "krx_exchange_status": { "status": "ok",           "record_count": 15, "error_count": 0 },
    "krx_indices":         { "status": "ok",           "record_count": 3,  "error_count": 0 },
    "krx_listing":         { "status": "unavailable",  "reason": "상장 정보 없음", ... },
    "krx_etf_meta":        { "status": "unavailable",  "reason": "ETF 메타 없음", ... },
    "dart_financials":     { "status": "ok",           "record_count": 9,  "error_count": 0 },
    "dart_disclosures":    { "status": "ok",           "record_count": 12, "error_count": 0 },
    "dart_audit":          { "status": "partial",      "record_count": 12, "error_count": ... },
    "ecos":                { "status": "ok",           "indicators": ["usd_krw", "bok_rate"] },
    "fred":                { "status": "ok",           "indicators": ["us_10y_treasury", "fed_funds_rate"] },
    "yahoo_market":        { "status": "ok",           "indicators": ["^GSPC", "^IXIC", "^VIX"], "_note": "보조 참고용" }
  },
  "summary": {
    "trustable":   ["krx_price", "krx_exchange_status", "krx_indices", "dart_financials", "dart_disclosures", "ecos", "fred"],
    "partial":     ["dart_audit"],
    "unavailable": [
      { "source": "krx_flow",    "reason": "KRX OAP 브라우저 세션 필요 ..." },
      { "source": "krx_listing", "reason": "상장 정보 없음" },
      { "source": "krx_etf_meta","reason": "ETF 메타 없음" }
    ]
  }
}
```

---

## 5. 정규화 규칙

### 5-1. 소스 우선순위

| 데이터 유형 | 사용 소스 | 비고 |
|-------------|-----------|------|
| 종목 마스터(기준) | `config/universe.json` | ticker, name, asset_type, market, sector_code |
| 주가/거래량 | `krx_price.json` → Yahoo Finance .KS/.KQ | KRX OAP 세션 불가로 Yahoo 대체 |
| 지수 (KOSPI 등) | `krx_indices.json` → Yahoo Finance ^KS11 등 | 동일 이유 |
| 재무제표 | `dart_financials.json` → DART OpenAPI | stock 전용, ETF 적용 안 함 |
| 공시 | `dart_disclosures.json` → DART OpenAPI | stock 전용 |
| 감사의견 | `dart_audit.json` → DART OpenAPI | stock 전용 |
| 환율/기준금리 | `market_indicators.json` → ECOS | Hard Filter 판단 가능 |
| 미국 금리 | `market_indicators.json` → FRED | Hard Filter 판단 가능 |
| 글로벌 지수/VIX | `market_indicators.json` → Yahoo | 보조 참고용, Hard Filter 불가 |
| 수급(flow) | — | 현재 unavailable, Phase B-3/C에서 구현 예정 |
| ETF 메타 | `krx_etf_meta.json` → KRX OAP | 현재 unavailable |
| 상장정보 | `krx_listing.json` → KRX OAP | 현재 unavailable |

### 5-2. 누락/불가 데이터 처리 방식

| 상황 | 처리 방법 |
|------|-----------|
| 스냅샷 파일 자체 없음 | `{ status: "unavailable", reason: "파일 없음", source: "..." }` |
| 레코드에 `error` 필드 있음 | `{ status: "unavailable", reason: error값, source: "..." }` |
| KRX flow 전체 불가 | `{ status: "unavailable", reason: collection_note값, source: "krx_flow" }` |
| ETF가 아닌데 etf_meta 조회 | `null` (적용 대상 아님) |
| stock인데 dart_corp_code 없음 | DART 필드를 null이 아닌 `status: "unavailable"` 로 기록 |
| ETF인데 DART 조회 | `dart_financials`, `dart_disclosures`, `dart_audit` = `null` |
| audit `_note` 있음 | `_note` 필드 그대로 유지 (fallback 이력 보존) |

### 5-3. Source Provenance 추적

모든 정규화된 필드에는 `source` 키가 포함됩니다:

```json
"price": { ..., "source": "krx_price", "price_provider": "yahoo_finance" }
"exchange_status": { ..., "source": "krx_exchange_status" }
"dart_financials": { ..., "source": "dart_financials" }
"usd_krw": { ..., "source": "ecos" }
"sp500": { ..., "source": "yahoo", "_note": "보조 참고용 — Hard Filter 판단에 사용 불가" }
```

`source_refs` 필드에는 각 source의 원본 파일 경로가 기록됩니다.

---

## 6. Snapshots ↔ Processed 관계

```
data/snapshots/{week_id}/krx_price.json        ──┐
data/snapshots/{week_id}/krx_listing.json       ──┤
data/snapshots/{week_id}/krx_exchange_status.json──┤
data/snapshots/{week_id}/krx_flow.json          ──┤  normalize-phase-b3.mjs
data/snapshots/{week_id}/dart_financials.json   ──┤  (변환 전용, 판단 없음)
data/snapshots/{week_id}/dart_disclosures.json  ──┤
data/snapshots/{week_id}/dart_audit.json        ──┤
data/snapshots/{week_id}/krx_etf_meta.json      ──┤
data/snapshots/{week_id}/krx_indices.json       ──┤
data/snapshots/{week_id}/market_indicators.json ──┘

        ↓  (읽기 전용, 원천 파일 변경 없음)

data/processed/{week_id}/normalized_entities.json  ← ticker 통합 마스터
data/processed/{week_id}/market_context.json       ← 시장 요약
data/processed/{week_id}/source_health.json        ← 수집 품질
```

원천 → 처리본 방향만 존재합니다.
`normalize-phase-b3.mjs`는 snapshots를 **읽기만** 하고, processed는 **쓰기만** 합니다.

---

## 7. 이번 단계에서 의도적으로 하지 않은 것

| 항목 | 이유 |
|------|------|
| 추천 로직 구현 | Phase C 이후 |
| Hard Filter 판단 | Phase C 이후 |
| 종목 점수 계산 | Phase C 이후 |
| picks 선정 | Phase C 이후 |
| current/draft/archive 생성 | Phase C 이후 |
| approval/manifest 수정 | Phase C 이후 |
| 뉴스 자동화 | Phase C 이후 |
| KRX flow 대체 소스 수집 | Phase B-2 범위 확대 → 별도 단계 |
| KRX listing/etf_meta 수정 | Phase B-2 범위 확대 → 별도 단계 |
| DART audit URL 오류 수정 | Phase B-2 버그픽스 범위 → 별도 처리 |

---

## 8. Self-check before Phase C

- [x] **정규화/변환 범위**: snapshots → processed 3개 파일 변환만 구현
- [x] **snapshots/processed 분리**: `data/snapshots/`는 읽기 전용, `data/processed/`에만 쓰기
- [x] **current/draft/archive 비접촉**: 해당 파일 접근 코드 없음
- [x] **추천/Hard Filter 판단 로직 없음**: 점수, picks, 필터 판단 코드 없음
- [x] **source provenance 유지**: 모든 필드에 `source` 키 포함
- [x] **unavailable 명시**: status/reason으로 명시, null로 조용히 사라지게 하지 않음
- [x] **유니버스 기준**: `config/universe.json` 기준 결합, 하드코딩 없음
- [x] **운영 원칙 준수**:
  - V1 자동 수집 중심 원칙 유지
  - 사람은 Admin 최종 승인만 원칙 유지
  - 뉴스 관련 기능 없음
  - current/draft/archive 파일 기반 구조 유지 (변경 없음)
  - snapshots 독립 영역 유지

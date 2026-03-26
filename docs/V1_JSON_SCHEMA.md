# V1 JSON 스키마 설계 문서

> **문서 목적**: V1 파일 기반 운영 구조에서 사용하는 모든 JSON 파일의 스키마를 정의한다.
> 이 문서는 이후 단계에서 Claude가 임의로 필드를 추가하거나 변경하는 것을 방지하기 위한 기준이다.
> **JSON 키 네이밍 규칙**: 모든 JSON 키는 `snake_case`를 사용한다.

---

## 1. 파일 구조 개요

```
data/
├── current/
│   ├── current.json                    ← 현재 공개 중인 메인 리포트 (Public)
│   └── details/                        ← 현재 에디션 상세 리포트 폴더 (Public)
│       ├── stock_{ticker}.json         ← 일반 종목 상세
│       └── etf_{ticker}.json           ← ETF 상세
│
├── draft/
│   ├── {YYYY-WNN}.json                 ← 검수 중인 초안 메인 리포트 (Admin Only)
│   └── details/                        ← 초안 에디션 상세 리포트 폴더 (Admin Only)
│       ├── stock_{ticker}.json
│       └── etf_{ticker}.json
│
├── archive/
│   ├── {YYYY-WNN}.json                 ← 과거 발행본 메인 리포트 (Public)
│   └── details/                        ← 아카이브 상세 리포트 폴더 (Public)
│       ├── stock_{ticker}.json
│       └── etf_{ticker}.json
│
└── manifests/
    ├── manifest.json                   ← 에디션 메타 인덱스 (Admin Only)
    └── approval.json                   ← 검수 의사결정 (Admin Only)

admin/
└── overlap_history.json                ← 최근 3주 추천 이력 (Admin Only)
```

### 파일 명명 원칙

| 파일 유형 | 명명 규칙 | 예시 |
|----------|----------|------|
| 메인 리포트 (current) | `current.json` (고정) | `current.json` |
| 메인 리포트 (draft/archive) | `{YYYY-WNN}.json` | `2026-W14.json` |
| 일반 종목 상세 | `stock_{ticker}.json` | `stock_005930.json` |
| ETF 상세 | `etf_{ticker}.json` | `etf_360750.json` |
| 상세 리포트 ID | `DTL-{week_id}-{ticker}` | `DTL-2026-W13-005930` |

> **원칙**: archive 파일명의 `YYYY-WNN`과 파일 내부 `week_id`는 **반드시 일치**해야 한다.

---

## 2. 메인 리포트와 상세 리포트의 역할 분리

| 파일 유형 | 역할 | 용도 |
|----------|------|------|
| 메인 리포트 (`current.json`, `YYYY-WNN.json`) | 홈 화면, 에디션 목록, 카드 요약 | 공개 노출, 상태 전환 대상 |
| 상세 리포트 (`details/` 하위) | 종목 클릭 후 상세 페이지 | 공개 노출, 메인 리포트와 독립 파일 |

**메인 → 상세 참조 방식**:
- pick의 `detail_report_id` 필드 → 해당 에디션 `details/` 폴더의 파일과 매핑
- 형식: `DTL-{week_id}-{ticker}` → `{state}/details/{asset_type}_{ticker}.json`
- 예: `DTL-2026-W13-005930` → `data/current/details/stock_005930.json`

**manifest는 메인 리포트 인덱스 중심**:
- manifest.json은 current/draft/archive 메인 리포트 경로를 관리한다.
- detail 파일 목록은 manifest에 포함하지 않는다.

---

## 3. 리포트 JSON 스키마 (메인 리포트: current / draft / archive 공통)

current / draft / archive는 **동일한 최상위 구조**를 공유한다.
차이는 특정 필드의 값 유무(`published_at`, `archived_at`, `draft_note`)와 파일 위치로 구분된다.

> **원칙**: 리포트 JSON에 `status` 필드를 추가하지 않는다. 리포트 상태는 파일 위치로 결정된다.

### 최상위 필드

| 필드명 | 타입 | current | draft | archive | 설명 |
|--------|------|---------|-------|---------|------|
| `report_id` | string | 필수 | 필수 | 필수 | 형식: `RPT-{YYYY-WNN}` |
| `week_id` | string | 필수 | 필수 | 필수 | 형식: `YYYY-WNN`. 파일명과 반드시 일치 |
| `schema_version` | string | 필수 | 필수 | 필수 | V1 고정값: `"1.0"` |
| `data_as_of` | string (YYYY-MM-DD) | 필수 | 필수 | 필수 | 종목·시장 데이터 기준일 |
| `generated_at` | string (ISO 8601) | 필수 | 필수 | 필수 | draft 생성 시각 |
| `published_at` | string (ISO 8601) | 필수 | null | 필수 | 발행 완료 시각 |
| `archived_at` | string (ISO 8601) | 미포함 | 미포함 | 필수 | archive 이동 시각 |
| `draft_note` | string | 미포함 | 선택 | 미포함 | 초안 생성 시 작성자 메모 (draft 전용) |
| `market_summary` | object | 필수 | 필수 | 필수 | 시장 요약 |
| `picks` | array[5] | 필수 | 필수 | 필수 | 메인 추천 5개 |
| `related_news` | array | 필수 | 필수 | 필수 | 구조화된 뉴스 신호 |
| `disclaimer` | string | 필수 | 필수 | 필수 | 서비스 성격 안내 문구 |

---

### 3-1. market_summary 스키마

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `global.headline` | string | 필수 | 주간 글로벌 시장 핵심 요약 |
| `global.key_index_changes` | array | 필수 | 주요 지수 등락률 목록 |
| `global.key_index_changes[].index` | string | 필수 | 지수명 |
| `global.key_index_changes[].change_pct` | number | 필수 | 주간 등락률 (%) |
| `global.sentiment` | string (enum) | 필수 | `positive` / `neutral` / `negative` |
| `domestic.kospi` | object | 필수 | level, change_pct, brief 포함 |
| `domestic.kosdaq` | object | 필수 | level, change_pct, brief 포함 |
| `domestic.sector_highlights` | array | 필수 | 주간 주요 섹터 흐름 (2~4개) |
| `domestic.sector_highlights[].sector` | string (enum) | 필수 | 13개 허용 섹터 코드 중 하나 |
| `domestic.sector_highlights[].direction` | string (enum) | 필수 | `up` / `neutral` / `down` |
| `domestic.sector_highlights[].note` | string | 필수 | 섹터 흐름 한 줄 설명 |
| `domestic.week_theme` | string | 필수 | 이번 주 국내 시장 핵심 테마 문장 |

---

### 3-2. pick 스키마

picks 배열은 정확히 5개 항목을 포함해야 하며, 각 항목의 `sector`는 서로 중복되지 않아야 한다.

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `rank` | integer (1~5) | 필수 | 추천 순위 |
| `ticker` | string | 필수 | 종목 코드 또는 ETF 코드 |
| `name` | string | 필수 | 종목명 또는 ETF명 |
| `market` | string (enum) | 필수 | `KOSPI` / `KOSDAQ` / `ETF` |
| `sector` | string (enum) | 필수 | 13개 확정 섹터 코드 중 하나 |
| `asset_type` | string (enum) | 필수 | `stock` / `etf` |
| `one_line_reason` | string | 필수 | 메인 카드에 표시되는 한 줄 추천 이유 |
| `stance` | string | 필수 | 단기 운용 의견 |
| `price_zone` | object | 필수 | reference_price, currency, watch_low, watch_high |
| `catalyst_summary` | string | 필수 | 2~4주 내 주요 촉매 요약 |
| `risk_summary` | string | 필수 | 핵심 리스크 요약 |
| `same_sector_alternatives` | array[2] | 필수 | 동일 섹터 추가 추천 2개 |
| `same_sector_alternatives[].ticker` | string | 필수 | 종목 코드 |
| `same_sector_alternatives[].name` | string | 필수 | 종목명 |
| `same_sector_alternatives[].one_line_reason` | string | 필수 | 한 줄 추가 추천 이유 |
| `detail_report_id` | string | 필수 | 상세 리포트 참조 식별자. 형식: `DTL-{week_id}-{ticker}` |
| `etf_summary` | object | etf만 포함 | ETF 전용 요약 (`asset_type = etf`인 경우만) |

#### etf_summary 하위 스키마 (ETF pick 전용)

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `benchmark` | string | 필수 | 추종 지수명 |
| `manager` | string | 필수 | 운용사명 |
| `top_holdings` | array | 필수 | name, weight_pct 포함 (최대 5개) |
| `geographic_exposure` | string | 필수 | 지역 노출 요약 |
| `hedge_policy` | string | 필수 | 환헤지 정책 설명 |
| `leverage_inverse` | boolean | 필수 | 레버리지/인버스 여부 |
| `fee_summary` | string | 필수 | 보수 관련 요약 안내 |

---

### 3-3. related_news 항목 스키마

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `title` | string | 필수 | 기사 제목 (전문 아님) |
| `source` | string | 필수 | 출처 매체명 |
| `url` | string | 필수 | 기사 URL |
| `published_at` | string (ISO 8601) | 필수 | 기사 발행 시각 |
| `keywords` | array[string] | 필수 | 핵심 키워드 목록 |
| `sentiment` | string (enum) | 필수 | `positive` / `neutral` / `negative` |
| `related_sectors` | array[string] | 필수 | 관련 섹터 코드 목록 |

---

## 4. manifest.json 스키마

위치: `data/manifests/manifest.json`
역할: current/draft/archive **메인 리포트** 경로를 관리하는 인덱스 파일.
**detail 파일 목록은 manifest에 포함하지 않는다.**

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `schema_version` | string | 필수 | V1 고정값: `"1.0"` |
| `current_report_id` | string | 필수 | 현재 발행 중인 에디션의 report_id |
| `current_week_id` | string | 필수 | 현재 발행 중인 에디션의 week_id |
| `current_file_path` | string | 필수 | current 파일 상대 경로 |
| `draft_report_id` | string | 조건부 | 검수 중인 draft의 report_id (없으면 null) |
| `draft_week_id` | string | 조건부 | 검수 중인 draft의 week_id (없으면 null) |
| `draft_file_path` | string | 조건부 | draft 파일 상대 경로 (없으면 null) |
| `archive_week_ids` | array[string] | 필수 | 보관된 모든 에디션의 week_id 목록 (최신순) |
| `archive_base_path` | string | 필수 | archive 파일 기본 경로 |
| `data_as_of` | string (YYYY-MM-DD) | 필수 | current 에디션의 데이터 기준일 |
| `last_generated_at` | string (ISO 8601) | 필수 | 가장 최근 draft 생성 시각 |
| `last_published_at` | string (ISO 8601) | 필수 | 가장 최근 발행 완료 시각 |

---

## 5. approval.json 스키마

위치: `data/manifests/approval.json`
역할: 현재 draft에 대한 admin의 검수 의사결정 기록.

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `draft_report_id` | string | 필수 | 검수 대상 draft의 report_id |
| `draft_week_id` | string | 필수 | 검수 대상 draft의 week_id |
| `decision` | string (enum) | 필수 | `pending` / `approved` / `rejected` / `on_hold` |
| `reviewed_by` | string | 필수 | 검수자 식별자 (검수 전: null) |
| `reviewed_at` | string (ISO 8601) | 필수 | 최종 검수 액션 시각 (검수 전: null) |
| `notes` | string | 선택 | 검수 메모 (반려 사유, 보류 이유 등) |
| `news_signal_review_status` | string (enum) | 선택 | 뉴스 신호 검수 집계 요약 상태. `SUFFICIENT` / `PARTIAL` / `SPARSE`. **참고 정보 전용 — `decision` 필드에 영향 없음. 발행 차단 조건 아님.** |

> **확정**: `news_signal_review_status`는 `signal_review.json`의 신호 검수 결과를 집계한 요약 상태 필드다. approval.json의 발행 게이트 역할(`decision`)과 독립적이며, 이 필드의 값은 발행 가능 여부를 결정하지 않는다.
> **미확정**: 예외 연속 추천 승인 플래그 필드는 세부 정책 확정 후 이 스키마에 추가한다.

---

## 6. overlap_history.json 스키마

위치: `admin/overlap_history.json`
역할: 최근 3개 에디션의 메인 추천 티커 이력 (중복 추천 정책 검증용).

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `schema_version` | string | 필수 | V1 고정값: `"1.0"` |
| `last_updated_at` | string (ISO 8601) | 필수 | 마지막 업데이트 시각 |
| `recent_editions` | array (최대 3개) | 필수 | 최신순 정렬 |
| `recent_editions[].week_id` | string | 필수 | 에디션 주차 식별자 |
| `recent_editions[].published_at` | string (ISO 8601) | 필수 | 해당 에디션 발행 시각 |
| `recent_editions[].main_picks` | array[string] | 필수 | 메인 추천 5개 티커 목록 |

---

## 7. 상세 리포트 스키마

### 7-1. 일반 종목 상세 리포트 (stock_{ticker}.json)

위치: `{state}/details/stock_{ticker}.json`

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `detail_report_id` | string | 필수 | 형식: `DTL-{week_id}-{ticker}` |
| `report_id` | string | 필수 | 소속 에디션의 report_id |
| `week_id` | string | 필수 | 소속 에디션의 week_id |
| `ticker` | string | 필수 | 종목 코드 |
| `name` | string | 필수 | 종목명 |
| `sector` | string (enum) | 필수 | 13개 허용 섹터 코드 중 하나 |
| `asset_type` | string (enum) | 필수 | `stock` |
| `data_as_of` | string (YYYY-MM-DD) | 필수 | 데이터 기준일 |
| `company_overview` | string | 필수 | 회사/사업 간략 소개 |
| `price_reference` | object | 필수 | pick의 price_zone과 동일 구조 |
| `stance` | string | 필수 | 단기 운용 의견 (pick보다 상세) |
| `bull_points` | array[string] | 필수 | 강세 논거 (2~4개) |
| `bear_points` | array[string] | 필수 | 약세 논거 (2~3개) |
| `catalysts_2_to_4_weeks` | array[string] | 필수 | 2~4주 내 주요 촉매 (2~4개) |
| `risks` | array[string] | 필수 | 상세 리스크 (2~4개) |
| `financial_summary` | object | 필수 | 재무 요약 (미확정 — 필드 구조 추후 확정) |
| `related_news` | array | 선택 | 종목 관련 구조화 뉴스 신호 |

### 7-2. ETF 상세 리포트 추가 필드 (etf_{ticker}.json)

일반 종목 상세 리포트의 모든 필드 포함 + 아래 추가 필드.
`asset_type`은 `"etf"`로 설정.

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `etf_overview` | string | 필수 | ETF 상세 설명 |
| `benchmark` | string | 필수 | 추종 지수명 |
| `manager` | string | 필수 | 운용사명 |
| `top_holdings` | array | 필수 | name, weight_pct 포함 (최대 5개) |
| `geographic_exposure` | object | 필수 | 국가/지역별 비중 (key: 지역명, value: 비중 숫자) |
| `sector_exposure` | object | 선택 | 섹터별 비중 (해당 시) |
| `hedge_policy` | string | 필수 | 환헤지 정책 상세 설명 |
| `leverage_inverse_flag` | boolean | 필수 | 레버리지/인버스 여부 |
| `fee_summary` | string | 필수 | 보수 상세 안내 |
| `etf_specific_risks` | array[string] | 필수 | ETF 고유 리스크 목록 (2~4개) |

---

## 8. 파일 간 참조 관계

```
data/manifests/manifest.json
    ├── current_file_path → data/current/current.json
    ├── draft_file_path → data/draft/{week_id}.json
    └── archive_week_ids → data/archive/{week_id}.json 목록

data/manifests/approval.json
    └── draft_report_id → data/draft/{week_id}.json의 report_id와 일치

data/current/current.json (메인 리포트)
    └── picks[].detail_report_id (DTL-2026-W13-{ticker})
            └── data/current/details/{asset_type}_{ticker}.json

data/draft/{YYYY-WNN}.json (메인 리포트)
    └── picks[].detail_report_id (DTL-{week_id}-{ticker})
            └── data/draft/details/{asset_type}_{ticker}.json

data/archive/{YYYY-WNN}.json (메인 리포트)
    └── picks[].detail_report_id (DTL-{week_id}-{ticker})
            └── data/archive/details/{asset_type}_{ticker}.json

admin/overlap_history.json
    └── recent_editions[].week_id (이력 참조용, 파일 직접 참조 없음)
```

---

## 9. 섹터 허용값 (V1 확정 13개)

| 코드 | 설명 |
|------|------|
| `TECH` | IT·반도체 |
| `BATTERY` | 2차전지·전기차 |
| `HEALTHCARE` | 헬스케어·바이오 |
| `FINANCE` | 금융 |
| `CONSUMER` | 소비·유통 |
| `INDUSTRIAL` | 산업재·기계 |
| `MATERIAL` | 소재·화학 |
| `ENERGY` | 에너지 |
| `TELECOM` | 통신·미디어 |
| `REALESTATE` | 건설·부동산 |
| `ETF_DOMESTIC` | 국내지수 ETF |
| `ETF_OVERSEAS` | 해외지수 ETF |
| `ETF_BOND_DIV` | 채권·배당 ETF |

---

## 10. enum 필드 전체 허용값 요약

| 필드 | 허용값 |
|------|--------|
| `market` | `KOSPI`, `KOSDAQ`, `ETF` |
| `asset_type` | `stock`, `etf` |
| `sector` | 위 13개 코드 |
| `global.sentiment` | `positive`, `neutral`, `negative` |
| `sector_highlights[].direction` | `up`, `neutral`, `down` |
| `news.sentiment` | `positive`, `neutral`, `negative` |
| `approval.decision` | `pending`, `approved`, `rejected`, `on_hold` |

---

## 11. 확정 vs 추후 확장 가능 항목 요약

| 항목 | 상태 |
|------|------|
| 메인 리포트 최상위 구조 | **확정** |
| pick 기본 필드 전체 | **확정** |
| etf_summary 기본 필드 (pick 내) | **확정** |
| 일반 종목 상세 리포트 구조 | **확정** |
| ETF 상세 리포트 추가 필드 | **확정** |
| market_summary 구조 | **확정** |
| related_news 구조 | **확정** |
| manifest.json 구조 | **확정** |
| approval.json 기본 구조 | **확정** |
| overlap_history.json 구조 | **확정** |
| 13개 섹터 코드 | **확정** |
| 상세 리포트 파일 경로 구조 | **확정** (`{state}/details/{type}_{ticker}.json`) |
| archive 파일명-week_id 일치 원칙 | **확정** |
| financial_summary 상세 필드 | **미확정** (데이터 소스 확정 후) |
| geographic_exposure / sector_exposure 상세 구조 | **미확정** (ETF 데이터 소스 확정 후) |
| 예외 연속 추천 승인 플래그 (approval 확장) | **미확정** (세부 정책 확정 후) |

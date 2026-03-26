# V1 JSON 파일 역할 경계 정의

> **문서 목적**: V1 파일 기반 운영에서 각 JSON 파일이 담당하는 데이터 범위와 담당하지 않는 범위를 명확히 정의한다.
> 파일 간 역할이 겹치면 동일 데이터가 중복 저장되거나 수정 시 불일치가 발생한다.
> 이 문서는 구현자가 어떤 파일을 언제 읽고 쓸지 판단하는 기준이 된다.
> 실제 코드 구현·파일 작성은 이 문서를 기반으로 다음 단계에서 진행한다.

---

## 1. 파일 목록 및 역할 한 줄 요약

| 파일명 | 경로 | 역할 한 줄 요약 |
|--------|------|--------------|
| `current.json` | `data/current/` | 현재 발행 중인 최신 메인 리포트 |
| `{YYYY-WNN}.json` | `data/draft/` | 작성 중인 초안 메인 리포트 |
| `{YYYY-WNN}.json` | `data/archive/` | 이전 발행본 (불변) |
| `stock_{ticker}.json` | `data/{state}/details/` | 특정 개별주의 수치·분석·내러티브 전체 |
| `etf_{ticker}.json` | `data/{state}/details/` | 특정 ETF의 수치·분석·내러티브 전체 |
| `{scope}_signals.json` | `data/news_signals/{week_id}/` | 자동 생성된 뉴스 신호 원본 데이터 |
| `signal_review.json` | `data/news_signals/{week_id}/` | 뉴스 신호에 대한 admin 검수 결과 |
| `approval.json` | `data/manifests/` | 최종 발행 검수 상태 (에디션 단위 승인/반려) |
| `manifest.json` | `data/manifests/` | 에디션 발행 메타 정보 |
| `overlap_history.json` | `admin/` | 최근 3개 에디션 메인 추천 이력 |

> **중요**: 리포트 파일명 자체가 상태를 표현한다. 파일 내부에 `status` / `report_status` 필드를 두지 않는다. 상태는 파일 위치(`data/draft/` / `data/current/` / `data/archive/`)로 결정된다.

---

## 2. 메인 리포트 (`current.json` / `{YYYY-WNN}.json`)

### 담는 것 ✅

- 주간 식별자 및 메타 (`week_id`, `report_id`, `schema_version`, `data_as_of`)
- 시각 필드: `generated_at` (draft 생성 시각, 전 상태 필수), `published_at` (발행 완료 시각, current/archive 필수, draft는 null), `archived_at` (archive 이동 시각, archive만 필수)
- 시장 분석 요약 (`market_summary.phase`, `market_summary.key_variable`, `market_summary.caution_point`)
- 글로벌 지표 (`market_summary.global.*` — headline, key_index_changes, sentiment(`positive`/`neutral`/`negative`) 등)
- 국내 지표 (`market_summary.domestic.*` — kospi, kosdaq, sector_highlights, week_theme 등)
- 섹터 방향성 (`favored_sectors[]`, `cautious_sectors[]`, `sector_returns[]`)
- 메인 추천 목록 (`picks[]`) — 티커, 섹터, 스탠스, 한 줄 이유, price_zone, detail_report_id 참조
- 동일 섹터 대안 목록 (`picks[].same_sector_alternatives[]`)
- 각 pick의 Soft Flag 여부, 연속 추천 여부, 예외 적용 여부 플래그

### 담지 않는 것 ❌

- 리포트 상태 필드(`report_status`, `status`, `published_date`) → 파일 위치가 상태를 결정
- 종목별 세부 수치 전체 (가격, 수급, 재무, 거래소 지정 등) → 상세 리포트에 있음
- 뉴스 신호 원본 데이터 → 뉴스 신호 파일에 있음
- 뉴스 검수 결과 → signal_review.json에 있음
- admin 검수 상태 전체 → approval.json에 있음
- 에디션 간 중복 추천 이력 → overlap_history.json에 있음
- 기사 원문 또는 기사 본문 요약 전체

### 파일 간 참조 방식

- `picks[].detail_report_id` → `data/{state}/details/stock_{ticker}.json` 또는 `etf_{ticker}.json` 참조
- `picks[].has_exception` → `data/manifests/approval.json`의 예외 기록과 연동 (ID 기반)
- 뉴스 신호는 메인 리포트에서 직접 참조하지 않음 (상세 리포트에서 참조)

### current / draft / archive 구분

| 상태 | 파일 경로 | 특징 |
|------|---------|------|
| 초안 | `data/draft/{YYYY-WNN}.json` | 작성 중. 수정 가능. `published_at: null` |
| 최신 발행본 | `data/current/current.json` | admin 승인 후 전환. `published_at`: 발행 완료 시각 |
| 이전 발행본 | `data/archive/{YYYY-WNN}.json` | 불변. 소급 수정 금지. `archived_at`: 이동 시각 |

---

## 3. 상세 리포트 (`data/{state}/details/stock_{ticker}.json` / `etf_{ticker}.json`)

### 담는 것 ✅

- 리포트 식별 정보 (`detail_report_id`, `report_id`, `week_id`, `ticker`, `name`, `sector`, `asset_type`, `data_as_of`)
- 시세 전체 (`price_reference.*` — 확정 키: pick의 `price_zone`과 동일 구조)
- 유동성 (`liquidity.avg_volume_20d`)
- 상장 정보 (`listing.market`, `listing.ipo_date`)
- 수급 데이터 (`flow.*`)
- 촉매 평가 (`catalyst.*`)
- 재무 데이터 (`financials.*`) — 개별주만
- ETF 메타 (`etf.*`) — ETF만
- 거래소 지정 현황 (`exchange_status.*`)
- 내러티브 (`narrative.*` — structural_risks, short_term_risks, bear_case_points, recommendation_rationale)
- 연결된 뉴스 신호 ID 목록 (`linked_signal_ids[]`) — 승인된 신호의 ID만 참조

### 담지 않는 것 ❌

- 시장 전체 지표 (KOSPI 등락률 등) → 메인 리포트에 있음
- 다른 종목의 데이터
- 뉴스 신호 원본 데이터 (ID 참조만 허용)
- 검수 상태 및 예외 기록 → approval.json에 있음
- 발행 상태 정보 → 파일 위치가 결정

### 주요 원칙

- 상세 리포트는 **에디션 고유**다. 동일 종목이 다음 주에 다시 추천되면 새 `detail_report_id`로 새 파일이 생성된다.
- 파일명: `stock_{ticker}.json` 또는 `etf_{ticker}.json` — 에디션 정보는 포함하지 않고 `{state}/details/` 위치가 에디션을 결정한다.
- **archive 상세 경로**: `data/archive/details/stock_{ticker}.json` (에디션별 하위 폴더 없음). `V1_SAMPLE_DATA_GUIDE.md` 샘플 경로(`data/archive/details/stock_017670.json`) 기준.
- `linked_signal_ids[]`에는 `signal_review.json`에서 `review_status = "APPROVED"` && `is_used_in_report = true`인 신호의 `signal_id`만 포함한다.
- Fallback 발행 시 `linked_signal_ids[]`는 빈 배열 `[]`로 두며 발행을 막지 않는다.

> **보정 메모**: 이전 설계의 `reports/detail/{detail_report_id}.json` 경로는 `data/{state}/details/stock_{ticker}.json` / `etf_{ticker}.json` 형식으로 수정했다. archive detail 경로는 `data/archive/{YYYY-WNN}/details/...`가 아닌 `data/archive/details/...` (평탄 구조)임을 명시했다. `V1_JSON_SCHEMA.md` / `V1_SAMPLE_DATA_GUIDE.md` 확정 구조 기준.

---

## 4. 뉴스 신호 원본 데이터 파일 (`data/news_signals/{week_id}/{scope}_signals.json`)

### 담는 것 ✅

- 자동/반자동으로 생성된 뉴스 신호 원본 전체
- 파일 최상위: `week_id`, `scope`, `generated_at`, `signal_count`, `signals[]`
- 각 신호: `signal_id`, `scope`, `direction`, `signal_level`, `confidence`, `catalyst_type`, `relevance_window`
- `source_name`, `published_at`
- `headline_summary` (80자 이내 요약), `why_it_matters` (150자 이내)
- scope별 추가 필드 (related_sector_code, related_ticker, duplicate_group_id 등)
- `admin_review_needed` 플래그

### 담지 않는 것 ❌

- 기사 본문 전체 또는 기사 원문 텍스트
- 기사 URL만으로 본문이 재구성되는 구조 (URL 참조는 허용하나 본문 저장 금지)
- 검수 결과 (`review_status`, `is_approved`, `discard_reason`) → signal_review.json에 있음
- 발행 반영 여부 → signal_review.json에 있음

### 주요 원칙

- 이 파일은 **읽기 전용** 원본이다. 자동 생성 후 수정하지 않는다.
- 검수 과정에서 신호 내용을 바꾸려면 `signal_review.json`의 `validation_note`에 보완 내용을 기록하되, 원본 파일은 수정하지 않는다.
- scope별로 파일을 분리한다 (`market_signals.json`, `sector_signals.json`, `stock_signals.json`, `etf_signals.json`).
- 파일 경로 예시: `data/news_signals/2026-W13/sector_signals.json`

---

## 5. 뉴스 신호 검수 결과 파일 (`data/news_signals/{week_id}/signal_review.json`)

### 담는 것 ✅

- 최상위: `week_id`, `review_completed`, `last_updated_at`, `summary.*`, `reviews[]`
- 원본 신호 참조 ID (`signal_id`)
- 검수 상태 (`review_status`: PENDING / APPROVED / DISCARDED / ON_HOLD)
- 검수자 (`reviewed_by`)
- 검수 시각 (`reviewed_at`)
- 유효성 보완 메모 (`validation_note`)
- 폐기 사유 코드 (`discard_reason`)
- 리포트 반영 여부 (`is_used_in_report`)
- 중복 그룹 내 대표 신호 여부 (`is_representative`)

### 담지 않는 것 ❌

- 뉴스 신호 원본 내용 (headline_summary 등) → scope별 원본 신호 파일에 있음
- 최종 에디션 발행 승인 상태 → approval.json에 있음
- 추천 종목 정보 → 메인/상세 리포트에 있음

### approval.json과의 관계

- `signal_review.json`은 **개별 신호 단위** 검수 상태 관리
- `approval.json`은 **에디션 전체** 최종 발행 검수 상태 관리
- `news_signal_review_status`는 signal_review.json의 집계 결과를 요약 반영하는 **확정 필드**다. 발행 차단 조건이 아닌 참고 정보 전용.
- `has_news_signal_issues`는 미확정 확장 후보다 (V1.1 검토 대상).

**`news_signal_review_status` 집계 규칙 (구현 단계에서 적용, 임계값 미확정)**:

| signal_review 상태 | approval.json `news_signal_review_status` 반영 |
|------------------|-----------------|
| APPROVED 신호가 3개 이상 (MARKET 1+ 포함) | `"SUFFICIENT"` |
| APPROVED 신호 일부 존재, 기준 미달 | `"PARTIAL"` |
| APPROVED 신호 0개 | `"SPARSE"` → Fallback 발행 (발행 차단 아님) |

> **`has_news_signal_issues` 집계 (미확정 확장)**: ON_HOLD 신호 1개 이상 시 `true`. V1.1에서 채택 여부 결정.

---

## 6. Admin Approval 파일 (`data/manifests/approval.json`)

> **중요**: 파일 위치는 `data/manifests/approval.json`이다. `draft/approval.json`이 아님에 주의한다. `V1_JSON_SCHEMA.md` 확정 경로 기준.

### 확정 스키마 (7개 필드) ✅

- `draft_report_id`: 초안 리포트 참조 ID (예: `"RPT-2026-W14"`)
- `draft_week_id`: 초안 주간 식별자 (예: `"2026-W14"`)
- `decision`: 검수 결정 (`"pending"` / `"approved"` / `"rejected"` / `"on_hold"`) — **소문자**
- `reviewed_by`: 검수자 식별자. 검수 전: null
- `reviewed_at`: 검수 시각 (ISO 8601). 검수 전: null
- `notes`: 검수 메모 (선택, 자유 형식)
- `news_signal_review_status`: 뉴스 신호 검수 집계 요약 상태 (`"SUFFICIENT"` / `"PARTIAL"` / `"SPARSE"`). **참고 정보 전용 — `decision` 결정에 영향 없음. 발행 차단 조건 아님.**

> **`news_signal_review_status` 원칙**: 이 필드는 `signal_review.json`의 신호 검수 결과를 집계한 요약 상태다. approval.json의 발행 게이트 역할(`decision`)과 독립적이며, 이 필드의 값이 어떤 값이든 발행 가능 여부를 제한하지 않는다. signal_review의 세부 내용을 approval.json에 복사하지 않으며, 요약 상태 수준에서만 참조한다.

### 담지 않는 것 ❌

- 개별 뉴스 신호 원본 또는 검수 상세 → signal_review.json에 있음
- 종목별 세부 수치 → 상세 리포트에 있음
- 에디션 간 추천 이력 → overlap_history.json에 있음
- 시장 분석 수치 → 메인 리포트에 있음

### 미확정 확장 후보 (구현 단계에서 사용자 판단 필요)

| 후보 필드 | 제안 이유 | 상태 |
|---------|---------|------|
| `exception_picks[]` | 예외 승인 기록 구조화 | 미확정 |
| `soft_flag_items[]` | Soft Flag 종목 별도 기록 | 미확정 |
| `cautious_sector_picks[]` | cautious 섹터 내 종목 추적 | 미확정 |
| `has_news_signal_issues` | ON_HOLD 신호 존재 여부 | 미확정 |

### 주요 원칙

- `approval.json`은 **발행 게이트** 역할이다. 이 파일의 `decision = "approved"`여야 current 전환이 가능하다.
- draft → current 전환 시 approval.json도 archive로 함께 이동하여 보존된다.

---

## 7. 중복 추천 이력 파일 (`admin/overlap_history.json`)

### 확정 스키마 ✅

- `schema_version`: V1 고정값 `"1.0"`
- `last_updated_at`: 마지막 업데이트 시각
- 최근 3개 에디션 목록: `recent_editions[]` (최신순, 최대 3개)
  - `recent_editions[].week_id`: 에디션 주차 식별자
  - `recent_editions[].published_at`: 해당 에디션 발행 시각
  - `recent_editions[].main_picks[]`: 메인 추천 5개 티커 목록

### 미확정 확장 후보

- `recent_editions[].alternatives[]`: alternatives 노출 티커 목록 — `V1_JSON_SCHEMA.md` 확정 스키마에 없는 항목이다. `main_picks[]`만 확정되어 있으며, `alternatives[]`는 필요 시 추가 논의 후 채택한다.

> **보정 메모**: 이전 설계의 `editions[]` → `recent_editions[]`로 수정. `published_at` 필드 추가. `V1_JSON_SCHEMA.md` 확정 스키마 기준.

### 담지 않는 것 ❌

- 종목 세부 수치
- 시장 분석 내용
- 뉴스 신호 정보
- 추천 이유 내러티브

### 주요 원칙

- 발행 완료 후 자동으로 갱신된다. 가장 오래된 에디션은 4번째 에디션 추가 시 삭제된다.
- 3주 연속 추천 방지(V1_RECOMMENDATION_POLICY_FINALIZATION.md 5절)를 위해 n-1, n-2 에디션 데이터가 반드시 유지되어야 한다.

> **보정 메모**: 이전 설계의 `editions[].edition_id`는 `editions[].week_id`로 수정했다. `alternatives[]`는 미확정 항목임을 명시했다. `V1_SAMPLE_DATA_GUIDE.md` 확정 구조 기준.

---

## 8. 파일 간 참조 관계 요약

```
admin/overlap_history.json
  ← 발행 완료 시 갱신 (main_picks[] 기준, week_id 키 사용)

data/manifests/approval.json
  ← signal_review.json 집계 결과를 news_signal_review_status로 요약 참조 (확정 필드 — 참고 정보 전용)
  ← 메인 리포트의 soft_flag, exception 정보를 검수 완료 후 기록 (미확정 확장 후보 — V1.1 검토)

data/current/current.json (draft → current 전환)
  → picks[].detail_report_id → data/current/details/stock_{ticker}.json 또는 etf_{ticker}.json
  ← approval.json decision="approved" 조건 충족 시 전환

data/{state}/details/stock_{ticker}.json / etf_{ticker}.json
  → linked_signal_ids[] → data/news_signals/{week_id}/signal_review.json 참조
     (APPROVED && is_used_in_report=true인 signal_id만 포함)

data/news_signals/{week_id}/{scope}_signals.json (원본, 읽기 전용)
  → signal_id → data/news_signals/{week_id}/signal_review.json

data/news_signals/{week_id}/signal_review.json
  → signal_id (원본 신호 파일 참조)
  ← approval.json의 news_signal_review_status 집계 근거 (확정 필드 — 참고 정보 전용)
```

---

## 9. 역할이 겹치지 않도록 하는 원칙

| 원칙 | 적용 방법 |
|------|---------|
| **원본 불변 원칙** | 뉴스 신호 원본 파일은 생성 후 수정하지 않는다. 검수 결과는 signal_review.json에 분리 저장한다. |
| **archive 불변 원칙** | archive로 이동된 파일은 수정하지 않는다. 오류 발견 시 다음 에디션에서 정정 표시. |
| **참조 전용 원칙** | 메인 리포트는 상세 데이터를 직접 포함하지 않고 ID 참조만 사용한다. |
| **요약 집계 원칙** | approval.json은 signal_review의 세부를 복사하지 않고 요약 상태만 집계한다. |
| **역할 단일 책임 원칙** | 각 파일은 하나의 명확한 역할만 담당한다. 동일 정보가 두 파일에 독립적으로 저장되지 않는다. |
| **발행 게이트 단일화** | approval.json만이 current 전환 가능 여부를 결정한다. 다른 파일의 상태로 직접 전환하지 않는다. |
| **상태 = 위치 원칙** | 리포트 JSON에 status 필드를 두지 않는다. `data/draft/` / `data/current/` / `data/archive/` 위치가 상태를 결정한다. |

---

## 10. Self-check before implementation

### 이번 보정에서 기존 파일 구조와 맞추기 위해 수정한 항목 (1차 보정)
- 파일 목록 테이블 경로 전면 수정, `edition_id` → `week_id`, `report_status` 삭제
- `global_indicators.*` → `market_summary.global.*`, `domestic_indicators.*` → `market_summary.domestic.*`
- approval.json 경로, 스키마, overlap_history.json 위치 수정

### 이번 보정에서 기존 샘플 구조와 맞추기 위해 수정한 항목 (2차 보정)
- archive detail 경로: `data/archive/{YYYY-WNN}/details/...` → `data/archive/details/...` (평탄 구조)
- `published_date` 삭제 → `data_as_of`, `generated_at`, `published_at`, `archived_at`, `schema_version`으로 교체
- `global.sentiment` enum: 소문자 `"positive"/"neutral"/"negative"` 명시
- `approval.decision` enum: 대문자 → 소문자 (`"pending"/"approved"/"rejected"/"on_hold"`)
- `overlap_history`: `editions[]` → `recent_editions[]`; `published_at` 포함; 확정 구조 명시
- 상태 구분 테이블에 `published_at` / `archived_at` 필드 표시 추가
- 상세 리포트 담는 것: `report_id`, `data_as_of` 추가; `price_reference` 확정 키 명시

### archive detail 경로를 어떻게 최종 정리했는지
- `data/archive/details/stock_{ticker}.json` / `data/archive/details/etf_{ticker}.json` (단일 flat 폴더)
- 에디션별 서브폴더 없음. `V1_SAMPLE_DATA_GUIDE.md` 샘플 경로 기준

### published_date / published_at 관계를 어떻게 정리했는지
- `published_date` 키 삭제 (확정 스키마에 없음)
- 확정 시각 필드 4개: `generated_at` (draft 생성, 전 상태 필수) / `published_at` (발행 완료, current·archive 필수, draft null) / `archived_at` (archive 이동, archive만 필수) / `data_as_of` (데이터 기준일 YYYY-MM-DD, 전 상태 필수)

### approval current 전환 조건을 어떻게 표현했는지
- `decision = "approved"` (소문자 확정)가 current 전환의 게이트 조건
- signal_review 관련 조건은 8절 참조. 뉴스 부족 시에도 수치 기반 발행 가능 원칙 유지

### 여전히 확정이 더 필요한 경로/파일 구조 항목
- `approval.json` 확장 필드 채택 여부 (exception_picks, soft_flag_items 등)
- `overlap_history.json`의 `alternatives[]` 추가 여부
- `news_signal_review_status` 자동 집계 임계값
- draft → current 전환 트리거 조건의 정확한 구현 방식

### 내가 임의로 기존 운영 구조를 뒤집지 않은 것
- 기존 JSON 파일 수정 없음 / 코드 없음 / 빌드 실행 없음
- 확정 스키마(`V1_JSON_SCHEMA.md`) 기준 구조를 바꾸지 않고, 새 문서 쪽을 보정
- approval.json 확정 6개 필드를 임의로 변경하거나 삭제하지 않음
- 뉴스 부족 시 수치 기반 발행 가능 원칙(fallback) 유지

---

> 이 문서는 V1 JSON 파일 역할 경계 정의 설계 문서다.
> 실제 파일 구조 구현·디렉터리 생성·코드 작성은 이 문서를 기반으로 다음 단계에서 진행한다.

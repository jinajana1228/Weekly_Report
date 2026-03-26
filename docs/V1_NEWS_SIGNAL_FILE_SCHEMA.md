# V1 뉴스 신호 파일 스키마 설계

> **문서 목적**: V1 파일 기반 운영에서 뉴스 신호 데이터와 검수 결과를 저장하는 파일의 권장 구조를 정의한다.
> 뉴스 신호 자동 생성 구현·크롤러·API 연동은 이 문서에서 다루지 않는다.
> 구현자가 파일을 작성하고 파서를 설계할 때 참조하는 스키마 설계 문서다.

---

## 1. 뉴스 신호 파일 디렉터리 구조

```
data/
  news_signals/
    {week_id}/                     ← 에디션별 격리 디렉터리 (예: 2026-W13)
      market_signals.json          ← scope=MARKET 신호 원본
      sector_signals.json          ← scope=SECTOR 신호 원본
      stock_signals.json           ← scope=STOCK 신호 원본
      etf_signals.json             ← scope=ETF 신호 원본
      signal_review.json           ← 위 4개 파일의 신호 검수 결과 (통합 관리)
```

> **전체 data/ 구조에서의 위치**:
> `data/news_signals/`는 `data/current/`, `data/draft/`, `data/archive/`, `data/manifests/`와 같은 계층에 위치한다. `V1_JSON_SCHEMA.md` 확정 파일 트리 기준.

**원칙**:
- 에디션별 디렉터리로 격리하여 에디션 간 신호 혼용을 방지한다.
- scope별 파일 분리로 각 파일의 크기를 관리 가능한 수준으로 유지한다.
- 원본 신호 4개 파일은 **읽기 전용**이다. 생성 후 수정하지 않는다.
- `signal_review.json`만 admin 검수 진행 중 갱신된다.

> **보정 메모**: 이전 설계의 `news_signals/{edition_id}/` (예: `ed_20260325`)는 `data/news_signals/{week_id}/` (예: `data/news_signals/2026-W13/`)로 수정했다. `week_id` 형식은 `YYYY-WNN`으로 확정. `V1_JSON_SCHEMA.md` / `V1_SAMPLE_DATA_GUIDE.md` 기준.

---

## 2. 뉴스 신호 원본 파일 권장 구조

### 2-1. 공통 최상위 구조 (4개 파일 공통)

```json
{
  "week_id": "2026-W13",
  "scope": "SECTOR",
  "generated_at": "2026-03-24T18:00:00+09:00",
  "signal_count": 5,
  "signals": [
    { ... }
  ]
}
```

| 키 | 타입 | 설명 |
|----|------|------|
| `week_id` | string | 상위 에디션 연결 ID. 형식: `YYYY-WNN`. 예: `"2026-W13"` |
| `scope` | enum string | 이 파일의 신호 범위 (`"MARKET"` / `"SECTOR"` / `"STOCK"` / `"ETF"`) |
| `generated_at` | string (ISO 8601) | 자동 생성 시각 |
| `signal_count` | integer | 신호 총 건수 |
| `signals[]` | array of object | 신호 목록 |

---

### 2-2. `signals[]` 공통 필드 구조

모든 scope에 공통으로 포함되는 신호 객체 필드:

```json
{
  "signal_id": "ns_20260325_s_001",
  "week_id": "2026-W13",
  "scope": "SECTOR",
  "direction": "bullish",
  "signal_level": "moderate",
  "confidence": "high",
  "catalyst_type": "POLICY",
  "relevance_window": "1_2_weeks",
  "source_name": "금융위원회",
  "published_at": "2026-03-24T10:30:00+09:00",
  "headline_summary": "반도체 국가전략기술 추가 지정 검토 발표",
  "why_it_matters": "TECH 섹터 수혜 기대. 정책 발표 이후 2주 내 업종 수급 반응 가능성.",
  "admin_review_needed": false,
  "duplicate_group_id": null
}
```

---

### 2-3. scope별 추가 필드

#### scope = MARKET 추가 필드

```json
{
  "market_impact_region": "DOMESTIC",
  "related_indicator": "USD/KRW"
}
```

#### scope = SECTOR 추가 필드

```json
{
  "related_sector_code": "TECH",
  "sector_direction_alignment": "aligned"
}
```

#### scope = STOCK 추가 필드

```json
{
  "related_ticker": "000660",
  "related_sector_code": "TECH",
  "is_pick_candidate": true,
  "catalyst_connected": true
}
```

#### scope = ETF 추가 필드

```json
{
  "related_ticker": "069500",
  "etf_sector_code": "ETF_DOMESTIC",
  "related_underlying_index": "KOSPI200"
}
```

---

## 3. signal_review.json 권장 구조

### 3-1. 최상위 구조

```json
{
  "week_id": "2026-W13",
  "review_completed": false,
  "last_updated_at": "2026-03-24T20:00:00+09:00",
  "summary": {
    "total_signals": 18,
    "approved": 7,
    "discarded": 6,
    "on_hold": 2,
    "pending": 3
  },
  "reviews": [
    { ... }
  ]
}
```

| 키 | 타입 | 설명 |
|----|------|------|
| `week_id` | string | 상위 에디션 연결. 형식: `YYYY-WNN` |
| `review_completed` | boolean | 전체 검수 완료 여부 |
| `last_updated_at` | string (ISO 8601) | 마지막 검수 갱신 시각 |
| `summary.total_signals` | integer | 전체 신호 수 |
| `summary.approved` | integer | 승인된 신호 수 |
| `summary.discarded` | integer | 폐기된 신호 수 |
| `summary.on_hold` | integer | 보류 중인 신호 수 |
| `summary.pending` | integer | 미검수 신호 수 |
| `reviews[]` | array of object | 개별 신호 검수 결과 목록 |

---

### 3-2. `reviews[]` 개별 항목 구조

```json
{
  "signal_id": "ns_20260325_s_001",
  "review_status": "APPROVED",
  "reviewed_by": "admin",
  "reviewed_at": "2026-03-24T20:15:00+09:00",
  "validation_note": null,
  "discard_reason": null,
  "is_used_in_report": true,
  "is_representative": true
}
```

| 키 | 타입 | 필수 | 설명 |
|----|------|------|------|
| `signal_id` | string | ✅ | 원본 신호 파일의 signal_id와 일치 |
| `review_status` | enum string | ✅ | `"PENDING"` / `"APPROVED"` / `"DISCARDED"` / `"ON_HOLD"` |
| `reviewed_by` | string | 선택 | admin 식별자. PENDING이면 null |
| `reviewed_at` | string (ISO 8601) | 선택 | 검수 완료 시각. PENDING이면 null |
| `validation_note` | string | 선택 | 최대 200자 보완 메모. 없으면 null |
| `discard_reason` | enum string | 선택 | DISCARDED 시 사유. 아래 enum 참조. null이면 미폐기 |
| `is_used_in_report` | boolean | ✅ | 발행 리포트에 실제 반영 여부 |
| `is_representative` | boolean | 선택 | 중복 그룹 내 대표 신호 여부. null이면 단독 신호 |

---

## 4. 신호 ID 규칙 권장안

### 4-1. signal_id 형식

```
ns_{YYYYMMDD}_{scope_prefix}_{sequence}
```

| 부분 | 설명 |
|------|------|
| `ns` | news signal 고정 prefix |
| `{YYYYMMDD}` | 신호 생성 기준일 (발행 에디션 날짜) |
| `{scope_prefix}` | `m` (MARKET) / `s` (SECTOR) / `st` (STOCK) / `e` (ETF) |
| `{sequence}` | 해당 scope 내 순번 (001, 002, ...) |

**예시**:
- `ns_20260325_m_001` — 2026-W13 에디션 MARKET 신호 1번
- `ns_20260325_s_003` — 2026-W13 에디션 SECTOR 신호 3번
- `ns_20260325_st_007` — 2026-W13 에디션 STOCK 신호 7번

### 4-2. week_id 형식 (확정)

```
YYYY-WNN
```

예시: `2026-W13` (2026년 13번째 ISO 주)

> **보정 메모**: 이전 설계의 `edition_id` (`ed_{YYYYMMDD}` 형식)는 삭제하고 확정된 `week_id` (`YYYY-WNN`) 형식으로 통일했다. 신호 파일 내 `edition_id` 키도 `week_id`로 변경.

### 4-3. detail_report_id 형식 (확정)

```
DTL-{week_id}-{ticker}
```

예시: `DTL-2026-W13-005930`

> **보정 메모**: 이전 설계의 `dr_{ticker}_{YYYYMMDD}` 형식은 삭제하고 확정된 `DTL-{week_id}-{ticker}` 형식으로 변경했다. `V1_SAMPLE_DATA_GUIDE.md` 확정 기준.

---

## 5. duplicate_group_id 처리 방식 권장안

### 5-1. duplicate_group_id 형식

```
dg_{YYYYMMDD}_{scope_prefix}_{group_sequence}
```

예시: `dg_20260325_s_001` — 2026-W13 에디션 SECTOR 중복 그룹 1번

### 5-2. 처리 흐름

```
① 자동 생성 시스템이 유사 신호를 탐지하여 동일 duplicate_group_id 부여
   → 단독 신호는 duplicate_group_id = null

② signal_review.json에서 같은 duplicate_group_id를 가진 항목 목록 확인

③ admin이 대표 신호 1개를 선택:
   - is_representative = true → review_status = "APPROVED"
   - 나머지는 is_representative = false → review_status = "DISCARDED"
   - discard_reason = "DUPLICATE"

④ 대표 신호 선택 우선순위 (권장):
   1. confidence = "high" 우선
   2. source_name이 공식 기관인 신호 우선
   3. published_at이 가장 이른 신호 우선 (최초 발표)
```

### 5-3. 중복 그룹이 없는 경우

`duplicate_group_id`가 `null`인 신호는 독립 신호로 처리한다. `is_representative` 필드도 `null`로 두어 단독 신호임을 표시한다.

---

## 6. 승인 / 폐기 / 보류 상태 필드 권장안

### 6-1. review_status enum

| 값 | 의미 | 다음 상태 |
|----|------|---------|
| `PENDING` | 검수 전 초기 상태 | → APPROVED / DISCARDED / ON_HOLD |
| `APPROVED` | 발행 반영 가능 승인 | → (변경 없음) |
| `DISCARDED` | 폐기 결정 | → (변경 없음) |
| `ON_HOLD` | 판단 보류 (추가 확인 필요) | → APPROVED / DISCARDED |

### 6-2. discard_reason enum

| 값 | 의미 |
|----|------|
| `LOW_CONFIDENCE` | confidence=low 신호 |
| `RUMOR` | 루머성/비확인 정보 |
| `DUPLICATE` | 중복 그룹 내 비대표 신호 |
| `OUTDATED` | published_at 기준 오래된 기사 또는 재전송 |
| `WEAK_RELEVANCE` | why_it_matters 빈약, 서비스 연관성 낮음 |
| `DIRECTION_CONFLICT` | 수치 방향과 충돌하는 신호 (수치 우선 원칙 적용) |
| `OTHER` | 위 분류 외 기타 사유 |

### 6-3. is_used_in_report 설정 규칙

| 조건 | is_used_in_report |
|------|-----------------|
| review_status = APPROVED 이고 detail report의 linked_signal_ids[]에 포함됨 | `true` |
| review_status = APPROVED이나 linked_signal_ids에 포함되지 않음 | `false` |
| review_status = DISCARDED 또는 ON_HOLD | `false` |
| Fallback 발행 시 모든 신호 | `false` |

---

## 7. 메인 리포트 / 상세 리포트와의 연결 방식

### 7-1. 상세 리포트 ↔ 뉴스 신호 연결

```json
// data/current/details/stock_000660.json 내
{
  "linked_signal_ids": [
    "ns_20260325_st_003",
    "ns_20260325_s_001"
  ]
}
```

- `linked_signal_ids[]`에는 `signal_review.json`에서 `review_status = "APPROVED"` AND `is_used_in_report = true`인 신호 ID만 포함한다.
- 메인 리포트(`current.json` / `{YYYY-WNN}.json`)는 뉴스 신호를 직접 참조하지 않는다. 상세 리포트를 통해 간접 연결된다.
- 뉴스 신호 원본 내용(`headline_summary`, `why_it_matters`)을 상세 리포트에 복사하지 않는다. ID 참조만 허용한다.

> **보정 메모**: 이전 설계의 상세 리포트 경로 예시 `reports/detail/dr_000660_20260325.json`은 `data/current/details/stock_000660.json`으로 수정했다. `V1_JSON_SCHEMA.md` 확정 경로 기준.

### 7-2. approval.json ↔ signal_review.json 연결

```json
// data/manifests/approval.json 내 (확정 6개 필드 기준)
{
  "draft_report_id": "RPT-2026-W13",
  "draft_week_id": "2026-W13",
  "decision": "approved",
  "reviewed_by": "admin",
  "reviewed_at": "2026-03-25T10:00:00+09:00",
  "notes": "신호 검수 완료. 뉴스 신호 7개 approved."
}
```

> **decision enum**: 소문자 고정 — `"pending"` / `"approved"` / `"rejected"` / `"on_hold"`. `V1_JSON_SCHEMA.md` 확정 enum 기준.

- `data/manifests/approval.json`은 확정 스키마 6개 필드를 기본으로 한다.
- `news_signal_review_status`와 `has_news_signal_issues` 필드는 미확정 확장 후보다. 채택 시 signal_review.json의 summary 집계 결과를 반영한다.
- approval.json은 signal_review.json의 세부 내용을 복사하지 않는다.

> **보정 메모**: 이전 설계의 `draft/approval.json`은 `data/manifests/approval.json`으로 수정했다. 뉴스 신호 관련 확장 필드(`news_signal_review_status`, `has_news_signal_issues`)는 미확정 항목으로 표시했다. `V1_JSON_SCHEMA.md` 확정 경로 기준.

---

## 8. Fallback 발행 시 뉴스 신호 처리

### 8-1. 뉴스 신호 상태별 Fallback 처리

| 신호 상태 | 상태 판단 기준 | Fallback 처리 |
|---------|------------|-------------|
| `SUFFICIENT` | APPROVED 3개 이상 + MARKET 신호 1개 이상 포함 | 정상 발행. 뉴스 신호 활용. |
| `PARTIAL` | APPROVED 신호 일부 존재, SUFFICIENT 기준 미달 | 유효 신호만 선택 반영. 발행 가능. |
| `SPARSE` | APPROVED 신호 0개 | 수치 기반 단독 Fallback 발행. linked_signal_ids[] 빈 배열. |
| `FALLBACK` | 신호 파일 자체 없음 (자동 생성 실패) | 수치 기반 단독 발행. 신호 파일 없음 상태 기록. |

### 8-2. Fallback 발행 시 신호 필드 처리 방식

- 상세 리포트의 `linked_signal_ids[]`는 `[]` (빈 배열)로 설정한다. null이 아닌 빈 배열.
- `data/manifests/approval.json`의 `notes` 필드에 Fallback 사유를 기록한다.
- 뉴스 신호 원본 파일이 없는 경우, 에디션 디렉터리에 `_no_signals.flag` 파일을 생성하여 의도적 빈 상태임을 표시하는 방식 검토 (구현 단계에서 결정).

### 8-3. Fallback 발행이더라도 남겨야 하는 필드

Fallback 발행에서 수치 기반으로 반드시 채워야 하는 필드:
- `market_summary.phase`, `market_summary.key_variable`, `market_summary.caution_point`
- `market_summary.global.*`, `market_summary.domestic.*`
- `favored_sectors[]`, `cautious_sectors[]`
- `picks[].one_line_reason` (뉴스 없이 수치 기반 작성)
- `narrative.structural_risks[]`, `narrative.short_term_risks[]`, `narrative.bear_case_points[]`

뉴스 신호 부재로 생략 가능한 필드:
- `linked_signal_ids[]` → `[]` 처리
- `catalyst.recent_disclosure_summary` → DART 공시 기반으로 대체 가능

---

## 9. approval.json과의 관계 정리

| 항목 | `data/manifests/approval.json` | `data/news_signals/{week_id}/signal_review.json` |
|------|-------------|------------------|
| 역할 | 에디션 최종 발행 게이트 | 개별 뉴스 신호 검수 결과 저장 |
| 뉴스 신호 정보 보유 | 확정: `notes`에 자유 형식 메모만 / 미확정 확장 채택 시 요약 2개 필드 | 신호별 상세 검수 결과 전체 |
| 갱신 시점 | 최종 발행 검수 완료 시 | admin이 신호 검수할 때마다 갱신 |
| 데이터 흐름 방향 | signal_review의 집계를 읽어 요약 반영 (단방향, 미확정) | approval을 읽지 않음 |
| 발행 게이트 역할 | ✅ `decision="APPROVED"`여야 current 전환 가능 | ❌ 발행 결정 권한 없음 |
| 보관 위치 | `data/manifests/approval.json` → archive 이동 | `data/news_signals/{week_id}/signal_review.json` → 동일 위치 유지 |

**approval.json `decision = "approved"` 전환 조건**:

| 조건 | 분류 | 설명 |
|------|------|------|
| signal_review.json `review_completed = true` | **권장 조건** | 뉴스 신호 검수가 완료된 경우의 정상 경로 |
| `news_signal_review_status = "SUFFICIENT"` | **권장 조건** | APPROVED 신호 3개 이상 포함 시 (미확정 확장 채택 시) |
| `news_signal_review_status = "PARTIAL"` | **허용 조건** | 신호 일부 존재, 기준 미달이나 발행 가능 |
| `news_signal_review_status = "SPARSE"` / `"FALLBACK"` | **Fallback 예외 허용** | 수치 기반 단독 발행으로 명시적 결정 시 허용 |

> **핵심 운영 원칙**: `signal_review.review_completed = true`는 **절대 필수 조건이 아니다**. 뉴스 신호가 부족하거나 없어도 수치 데이터가 정상이면 admin이 `decision = "approved"`를 내릴 수 있다. approval.json의 `notes`에 Fallback 사유를 기록하는 것으로 충분하다.

---

## 10. Self-check before implementation

### 이번 보정에서 기존 파일 구조와 맞추기 위해 수정한 항목 (1차 보정)
- 디렉터리: `news_signals/{edition_id}/` → `data/news_signals/{week_id}/`
- `edition_id` → `week_id` 전체 교체; `detail_report_id` 형식 수정; approval.json 경로 수정

### 이번 보정에서 기존 샘플 구조와 맞추기 위해 수정한 항목 (2차 보정)
- approval.json 예시: `decision: "APPROVED"` → `decision: "approved"` (소문자 확정 enum)
- 9절 approval.json 위치 표기 통일 (`data/manifests/approval.json`)
- current 전환 조건: `review_completed = true` 절대 필수 → 권장/허용/Fallback 예외 조건표로 교체

### archive detail 경로를 어떻게 최종 정리했는지
- 7-1절 상세 리포트 경로 예시: `data/current/details/stock_000660.json` (current 기준)
- archive 상세 경로: `data/archive/details/stock_{ticker}.json` (에디션별 하위폴더 없는 평탄 구조)

### published_date / published_at 관계를 어떻게 정리했는지
- 이 문서는 news_signals 파일 전용이므로 `published_date` 키가 원래 없었음
- 뉴스 신호 원본 파일의 `published_at`은 기사 발행 시각 (신호별 필드, 유지)
- 메인 리포트의 시각 필드(`generated_at`, `published_at`, `archived_at`)와 의미 충돌 없음

### approval current 전환 조건을 어떻게 표현했는지
- `signal_review.review_completed = true`를 절대 필수 조건 표현에서 제거
- 조건표로 분류: 권장 / 허용 / Fallback 예외 3단계로 명확히 구분
- 핵심: 뉴스 신호 없어도 수치 기반 발행 가능. admin의 `decision = "approved"` 결정이 최종 게이트

### 여전히 확정이 더 필요한 경로/파일 구조 항목
- Fallback 상태 표시 방식 (`_no_signals.flag` 파일 사용 여부)
- `news_signal_review_status` 자동 집계 임계값 (미확정 확장 채택 시)
- signal_review.json `summary` 자동 계산 방식

### 구현 전에 사용자가 최종 판단해야 하는 항목
- Fallback 발행 시 독자에게 "뉴스 신호 없음" 표시 여부 (UI 결정)
- approval.json의 미확정 확장 필드 (`news_signal_review_status`, `has_news_signal_issues`) 채택 여부
- `_no_signals.flag` 방식 vs 빈 파일 방식 중 선택
- SUFFICIENT 기준 신호 수 최종 확정 (3개 이상 권장)

### 내가 임의로 기존 운영 구조를 뒤집지 않은 것
- 코드 없음 / 크롤러 없음 / API 연동 없음
- 기존 JSON 파일 수정 없음 / 기존 샘플 JSON 수정 없음
- 기존 UI 변경 없음 / 빌드 실행 없음
- 기사 본문 저장 구조 설계 없음
- 확정 스키마(`V1_JSON_SCHEMA.md`) 기준 구조를 바꾸지 않고, 새 문서 쪽을 보정
- 뉴스 부족 시 수치 기반 발행 가능 원칙(Fallback) 유지; signal_review 조건을 발행 차단 수단으로 쓰지 않음

---

> 이 문서는 V1 뉴스 신호 파일 스키마 설계 문서다.
> 실제 파일 생성·JSON 키 구현·자동 생성 로직 작성은 이 문서를 기반으로 다음 단계에서 진행한다.

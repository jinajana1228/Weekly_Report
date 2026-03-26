# V1 manifest / approval 파일 설계 문서

> **문서 목적**: manifest.json과 approval.json 각 파일의 역할, 필드 정의, 전환 트리거를 정의한다.
> **전제**: DB 없음. 상태 관리는 이 두 파일이 핵심이다.

---

## 역할 구분

| 파일 | 위치 | 역할 |
|------|------|------|
| `manifest.json` | `data/manifests/manifest.json` | 에디션 파일 경로 인덱스 기록 |
| `approval.json` | `data/manifests/approval.json` | admin의 **검수 의사결정** 기록 |

두 파일은 역할이 다르다.
- `manifest.json`: "이 에디션이 무엇인가" — 콘텐츠 식별 정보
- `approval.json`: "admin이 이 draft를 어떻게 판단했는가" — 검수 결정 기록

리포트 저장 상태(draft/current/archive)는 파일이 어느 폴더에 있는지로 결정되며,
manifest.json에 별도의 status 필드로 중복 표현하지 않는다.

---

## 1. manifest.json 필드 정의

> **주의 (구조 불일치)**: 이 섹션에 정의된 manifest 스키마(`edition_id`, `data_reference_date`, `picks[]` 등)는 초기 설계안이며, **실제 구현된 `data/manifests/manifest.json` 구조와 다르다.** 실제 manifest.json은 에디션별 내용을 담지 않고, current·draft·archive 파일 경로 인덱스 역할을 한다. **확정 스키마는 `V1_JSON_SCHEMA.md` §4를 기준으로 한다.** 이 섹션은 초기 설계 맥락 보존을 위해 유지하며, 구현 기준으로 사용하지 않는다.

### 공통 필드 (current / draft / archive 모두 포함)

| 필드명 | 타입 | 필수 여부 | 설명 |
|--------|------|-----------|------|
| `edition_id` | string | 필수 | 에디션 고유 식별자. 형식: `YYYY-WNN` (예: `2025-W14`) |
| `data_reference_date` | string (YYYY-MM-DD) | 필수 | 종목/시장 데이터의 기준일 |
| `created_at` | string (ISO 8601) | 필수 | 이 manifest가 처음 생성된 시각 |
| `picks` | array | 필수 | 메인 추천 5개의 참조 정보 목록 |
| `picks[].pick_id` | string | 필수 | pick 파일 참조 식별자 (예: `pick_01`) |
| `picks[].ticker` | string | 필수 | 종목 티커 또는 ETF 코드 |
| `picks[].name` | string | 필수 | 종목명 또는 ETF명 |
| `picks[].sector` | string | 필수 | 배정된 섹터 (섹터 분류 체계 미확정 — 후속 결정 필요) |
| `picks[].type` | string (enum) | 필수 | `STOCK` / `ETF` |

### current 전용 추가 필드

| 필드명 | 타입 | 필수 여부 | 설명 |
|--------|------|-----------|------|
| `published_at` | string (ISO 8601) | 필수 | 실제 발행(current 전환) 완료 시각 |

### archive 전용 추가 필드

| 필드명 | 타입 | 필수 여부 | 설명 |
|--------|------|-----------|------|
| `published_at` | string (ISO 8601) | 필수 | 원본 발행 시각 (current 시절 기록 그대로 유지) |
| `archived_at` | string (ISO 8601) | 필수 | archive로 이동된 시각 |

### draft 전용 추가 필드

| 필드명 | 타입 | 필수 여부 | 설명 |
|--------|------|-----------|------|
| `draft_notes` | string | 선택 | 초안 생성 시 작성자 메모 |

---

## 2. approval.json 필드 정의

### 위치
```
data/manifests/approval.json
```

> **보정**: 이전 문서에서 `admin/approval.json`으로 표기되어 있었으나 실제 파일 경로는 `data/manifests/approval.json`이다. `V1_JSON_SCHEMA.md` §5 및 실제 파일 기준으로 수정.

### 역할
- 현재 draft에 대한 admin의 검수 의사결정만을 기록한다.
- `approval.json`의 `decision` = `"approved"`가 current 전환의 유일한 트리거이다.
- `news_signal_review_status`는 참고 정보 전용이며 발행 차단 조건이 아니다.

### 확정 필드 정의 (7개)

| 필드명 | 타입 | 필수 여부 | 설명 |
|--------|------|-----------|------|
| `draft_report_id` | string | 필수 | 검수 대상 draft의 report_id (예: `"RPT-2026-W14"`) |
| `draft_week_id` | string | 필수 | 검수 대상 draft의 week_id (예: `"2026-W14"`). `manifest.json`의 `draft_week_id`와 일치해야 함 |
| `decision` | string (enum) | 필수 | 검수 결과. 허용값: `"pending"` / `"approved"` / `"rejected"` / `"on_hold"` — **소문자** |
| `reviewed_by` | string | 필수 | 검수자 식별자. 검수 전: `null` |
| `reviewed_at` | string (ISO 8601) | 필수 | 최종 검수 액션 시각. 검수 전: `null` |
| `notes` | string | 선택 | admin의 검수 메모 (반려 사유, 보류 이유 등). null 허용 |
| `news_signal_review_status` | string (enum) | 선택 | 뉴스 신호 검수 집계 요약 상태. 허용값: `"SUFFICIENT"` / `"PARTIAL"` / `"SPARSE"`. **참고 정보 전용 — `decision`에 영향 없음. 발행 차단 조건 아님.** |

> **보정**: 이전 문서의 `target_edition_id`는 `draft_report_id` + `draft_week_id` 두 필드로 분리되어 있다. `reviewer_note`는 `notes`로 확정됐다. `reviewed_by`는 이전 문서에 누락되어 있었으나 실제 파일에 존재하며 확정 필드다. `news_signal_review_status`는 V1_CONSISTENCY_FIX_LOG.md §2에 따라 확정 필드로 승격됐다.

### decision 값 정의

| 값 | 의미 | current에 미치는 영향 |
|----|------|---------------------|
| `"pending"` | 검수 대기 중 | 없음. current 유지 |
| `"approved"` | 승인 완료 | draft → current 전환, 기존 current → archive 이동 |
| `"rejected"` | 반려 | 없음. draft 유지, 수정 후 재검수 |
| `"on_hold"` | 보류 | 없음. current 유지. fallback 정책 참조 |

### 미확정 확장 후보

| 후보 필드 | 제안 이유 | 상태 |
|---------|---------|------|
| `has_news_signal_issues` | ON_HOLD 신호 존재 여부 플래그 | 미확정 — V1.1 검토 |
| `exception_picks[]` | 예외 승인 기록 구조화 | 미확정 — V1에서는 `notes`로 대체 |

---

## 3. current 전환 트리거

current 전환이 발생하는 유일한 조건:

> `data/manifests/approval.json`의 `decision` = `"approved"`
> AND `approval.json`의 `draft_week_id`가 `data/manifests/manifest.json`의 `draft_week_id`와 일치

이 조건이 충족되지 않은 상태에서 current 전환이 일어나면 안 된다.

> **보정**: 이전 문서에서 `admin/approval.json`의 `target_edition_id`와 `data/draft/manifest.json`의 `edition_id`를 비교하는 것으로 표기되어 있었으나, 실제 구조 기준으로 수정했다.

---

## 4. 파일 간 연동 개요

```
[admin 승인]
    data/manifests/approval.json → decision: "approved" 기록
    (draft_week_id가 manifest.json의 draft_week_id와 일치 확인)
            ↓
    [전환 프로세스]
    기존 current → data/archive/{week_id}.json으로 이동
    data/draft/{week_id}.json → data/current/current.json으로 이동
    data/manifests/manifest.json 갱신 (current_week_id, archive_week_ids 등)
    data/manifests/approval.json 초기화 (decision: "pending" 상태로)
    admin/overlap_history.json 갱신
            ↓
    Git commit + push → 배포 환경 반영
```

---

## 5. 중복 추천 관련 필드 (후보안)

아래 필드/파일은 중복 추천 정책 구현을 위한 설계 후보이다.
현재 확정된 구조가 아니며, 정책 및 구현 단계에서 채택 여부를 결정한다.

| 후보 항목 | 설명 | 현재 상태 |
|----------|------|----------|
| `picks[].is_consecutive` (메인 리포트) | 직전 주 연속 추천 여부 플래그 | 후보안, 미확정 |
| `is_consecutive_exception` (approval) | 연속 추천 예외 승인 플래그 | 후보안, 미확정 |
| `admin/overlap_history.json` | 최근 3주 추천 이력 별도 파일 | **확정** — `V1_JSON_SCHEMA.md` §6 기준 |

이 항목들은 확정 전까지 manifest.json / approval.json의 필수 구조에 포함하지 않는다.

---

> **미확정**: `picks[].sector` 필드의 허용값 목록은 섹터 분류 체계 확정 후 정의한다.
> **미확정**: approval.json을 admin UI로 수정할지, 파일 직접 편집 방식으로 할지는 기술 스택 확정 후 결정한다.
> **미확정**: 중복 추천 관련 필드/파일의 채택 여부는 구현 단계에서 결정한다.

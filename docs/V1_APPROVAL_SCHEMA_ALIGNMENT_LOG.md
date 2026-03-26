# V1 Approval 스키마 정렬 이력 (Approval Schema Alignment Log)

> **문서 목적**: approval.json 관련 문서 간 스키마 불일치를 발견하고, 실제 파일 구조 기준으로 정렬한 이력을 기록한다.
> **보정 일자**: 2026-03-26
> **선행 문서**: `V1_CONSISTENCY_FIX_LOG.md` (1차 보정 이력)

---

## 1. 이번 보정의 목적

1차 정합성 보정(`V1_CONSISTENCY_FIX_LOG.md`)에서 `V1_MANIFEST_APPROVAL_SCHEMA.md`의 approval 스키마가 실제 파일 구조와 다름을 발견했으나 당시 범위 밖으로 분류했다. 이번 단계에서 다음 3가지를 완료한다.

1. `V1_MANIFEST_APPROVAL_SCHEMA.md`의 approval 섹션을 실제 `data/manifests/approval.json` 구조와 정렬
2. `V1_JSON_FILE_ROLE_BOUNDARIES.md` §5·§8의 `news_signal_review_status` 관련 "미확정 확장 채택 시" 표현 잔존 제거
3. 관련 문서 전체에서 approval 확정 필드 / 참고 필드 / 미확정 후보 분류를 동일 기준으로 통일

---

## 2. 발견된 문서 간 불일치 목록

### 불일치 A: `V1_MANIFEST_APPROVAL_SCHEMA.md` — approval 파일 위치 오류

| 항목 | 이전 (잘못된) 표기 | 실제 (정확한) 표기 |
|------|------------------|------------------|
| 파일 위치 (역할 구분 테이블) | `admin/approval.json` | `data/manifests/approval.json` |
| 파일 위치 (§2 위치) | `admin/approval.json` | `data/manifests/approval.json` |
| 파일 위치 (§3 전환 트리거) | `admin/approval.json` | `data/manifests/approval.json` |
| 파일 위치 (§4 다이어그램) | `approval.json` (경로 미명시) | `data/manifests/approval.json` |

### 불일치 B: `V1_MANIFEST_APPROVAL_SCHEMA.md` — approval 필드명 오류

| 이전 (잘못된) 필드명 | 실제 (정확한) 필드명 | 비고 |
|--------------------|------------------|------|
| `target_edition_id` | `draft_report_id` + `draft_week_id` | 단일 필드가 두 필드로 분리되어 있음 |
| `reviewer_note` | `notes` | 필드명 변경 |
| (누락) | `reviewed_by` | 검수자 식별자. 실제 파일에 존재하나 문서에 없었음 |
| (누락) | `news_signal_review_status` | 1차 보정에서 확정 필드로 승격됐으나 이 문서에 반영 안 됨 |

### 불일치 C: `V1_MANIFEST_APPROVAL_SCHEMA.md` §3 — 전환 트리거 참조 오류

| 항목 | 이전 (잘못된) 표기 | 실제 (정확한) 표기 |
|------|------------------|------------------|
| 파일 경로 | `admin/approval.json` | `data/manifests/approval.json` |
| 비교 필드 (approval) | `target_edition_id` | `draft_week_id` |
| 비교 대상 파일 | `data/draft/manifest.json` | `data/manifests/manifest.json` |
| 비교 필드 (manifest) | `edition_id` | `draft_week_id` |

### 불일치 D: `V1_JSON_FILE_ROLE_BOUNDARIES.md` §5 — `news_signal_review_status` 여전히 미확정으로 표현

- 이전: "approval.json의 **미확정 확장 필드인** `news_signal_review_status`와 `has_news_signal_issues`가 채택될 경우"
- 실제: `news_signal_review_status`는 1차 보정에서 확정 필드로 승격됨. `has_news_signal_issues`만 여전히 미확정.
- 집계 규칙 표 헤더도 "(미확정 확장)"으로 표기되어 있었음

### 불일치 E: `V1_JSON_FILE_ROLE_BOUNDARIES.md` §8 — 참조 다이어그램에 "(미확정 확장 채택 시)" 잔존

- 이전: `data/manifests/approval.json` ← "signal_review.json 집계 결과를 news_signal_review_status로 요약 참조 **(미확정 확장 채택 시)**"
- 이전: `signal_review.json` ← "approval.json의 news_signal_review_status 집계 근거 **(미확정 확장 채택 시)**"
- 실제: `news_signal_review_status`는 확정 필드이므로 "(미확정 확장 채택 시)" 조건부 표현 불필요

---

## 3. 정렬 기준

모든 보정의 기준은 다음 순서를 따랐다.

1. **실제 파일 우선**: `data/manifests/approval.json`의 실제 키 이름이 최우선 기준
2. **확정 문서 우선**: `V1_JSON_SCHEMA.md` §5 (approval 스키마) — 가장 최근에 확정된 문서
3. **1차 보정 이력**: `V1_CONSISTENCY_FIX_LOG.md` §2 — `news_signal_review_status` 확정 처리 이력
4. **운영 원칙**: approval = 발행 게이트(`decision`), `news_signal_review_status` = 참고 정보 전용

---

## 4. approval 필드 최종 분류 기준 (이번 보정 후 통일된 기준)

| 필드명 | 분류 | 역할 | 비고 |
|--------|------|------|------|
| `draft_report_id` | **확정 필드** | 검수 대상 draft report_id 참조 | 필수 |
| `draft_week_id` | **확정 필드** | 검수 대상 draft week_id 참조. 전환 트리거 비교 기준 | 필수 |
| `decision` | **확정 필드 (게이트)** | 발행 가능 여부를 결정하는 유일한 게이트. `"pending"/"approved"/"rejected"/"on_hold"` | 필수 |
| `reviewed_by` | **확정 필드** | 검수자 식별자. 검수 전 null | 필수 |
| `reviewed_at` | **확정 필드** | 검수 시각 (ISO 8601). 검수 전 null | 필수 |
| `notes` | **확정 필드** | 검수 메모 (자유 형식). null 허용 | 선택 |
| `news_signal_review_status` | **확정 필드 (참고 전용)** | 뉴스 신호 검수 집계 요약. `"SUFFICIENT"/"PARTIAL"/"SPARSE"`. 발행 차단 조건 아님 | 선택 |
| `has_news_signal_issues` | 미확정 확장 후보 | ON_HOLD 신호 존재 여부 플래그 | V1.1 검토 |
| `exception_picks[]` | 미확정 확장 후보 | 예외 승인 기록 구조화 | V1에서는 `notes`로 대체 |
| `soft_flag_items[]` | 미확정 확장 후보 | Soft Flag 종목 별도 기록 | 미확정 |
| `cautious_sector_picks[]` | 미확정 확장 후보 | cautious 섹터 내 종목 추적 | 미확정 |

> **핵심 원칙**: `decision` 필드만이 발행 가능 여부를 결정한다. `news_signal_review_status`를 포함한 나머지 모든 필드는 발행 차단 조건이 될 수 없다.

---

## 5. 수정한 파일 목록

| 파일 | 수정 내용 |
|------|-----------|
| `docs/V1_MANIFEST_APPROVAL_SCHEMA.md` | ① 역할 구분 테이블 approval 경로 수정 ② §1 manifest 섹션 상단에 "구조 불일치 주의" 메모 추가 ③ §2 approval 위치·필드 전면 재작성 (7개 확정 필드 + 미확정 후보 테이블) ④ §3 전환 트리거 경로·필드명 수정 ⑤ §4 다이어그램 경로 구체화 ⑥ §5 overlap_history 확정 상태 반영 |
| `docs/V1_JSON_FILE_ROLE_BOUNDARIES.md` | ① §5 approval.json과의 관계 절 — `news_signal_review_status` 확정 표현으로 수정. `has_news_signal_issues` 미확정 유지 ② §8 참조 다이어그램 — news_signal_review_status 2곳의 "(미확정 확장 채택 시)" → "(확정 필드 — 참고 정보 전용)"으로 수정 |
| `docs/V1_CONSISTENCY_FIX_LOG.md` | ① V1_MANIFEST_APPROVAL_SCHEMA.md 항목을 "미보정" → "보정 완료"로 변경 ② 의도적으로 하지 않은 것 목록 업데이트 |

---

## 6. 이번 단계에서 의도적으로 하지 않은 것

- `data/manifests/approval.json` 파일 자체 변경 없음 (이미 올바른 상태)
- `V1_MANIFEST_APPROVAL_SCHEMA.md` §1 manifest 스키마 재작성 없음 (초기 설계안으로 보존, 주의 메모 추가로 대체)
  - 이유: 실제 manifest.json은 인덱스 파일이고, §1은 초기 설계의 per-edition manifest 개념을 담고 있어 완전히 다른 구조임. 이를 재작성하면 설계 맥락이 소실될 수 있음. `V1_JSON_SCHEMA.md` §4를 정확한 기준 문서로 명시하는 것으로 대체.
- approval write 기능 구현 없음
- publish 스크립트 구현 없음
- admin UI 수정 없음
- JSON 샘플 파일 수정 없음
- build/dev 실행 없음
- background command 실행 없음
- 새로운 구조 도입 없음

---

## 7. 이번 보정 후 아직 남겨둔 미확정 항목

| 항목 | 상태 | 비고 |
|------|------|------|
| `news_signal_review_status` 집계 임계값 | 미확정 | SUFFICIENT 조건(APPROVED 3개 이상, MARKET 1개 이상 등) — 수집 스크립트 구현 단계에서 확정 |
| `has_news_signal_issues` 필드 채택 여부 | 미확정 | V1.1 검토 대상 |
| `exception_picks[]` 구조 | 미확정 | V1에서는 `notes` 자유 기재로 대체 |
| `soft_flag_items[]`, `cautious_sector_picks[]` | 미확정 | 운영 필요 시 추가 논의 |
| approval write 방식 | 미확정 | CLI 스크립트 vs 직접 JSON 편집. 배포 환경 확정 후 결정 |
| `V1_MANIFEST_APPROVAL_SCHEMA.md` §1 manifest 스키마 | 초기 설계안 보존 | 실제 구현 기준은 `V1_JSON_SCHEMA.md` §4. §1 재작성은 범위 밖으로 분류 |

---

## 8. approval 게이트 역할과 참고 필드 역할 혼동 방지 원칙

이번 보정에서 모든 문서에 다음 원칙을 일관되게 반영했다.

| 구분 | 필드 | 역할 | 발행 차단 여부 |
|------|------|------|--------------|
| 게이트 필드 | `decision` | current 전환의 유일한 트리거. `"approved"`여야만 전환 가능 | **발행 차단** (`"pending"/"rejected"/"on_hold"` 시) |
| 참고 필드 | `news_signal_review_status` | 뉴스 신호 검수 집계 요약. 어떤 값이어도 발행 차단 불가 | **발행 차단 아님** |
| 참고 필드 | `reviewed_by`, `reviewed_at`, `notes` | 검수 행위 기록. 발행 조건과 무관 | **발행 차단 아님** |
| 미확정 후보 | `has_news_signal_issues` 등 | 아직 도입 안 됨. 도입 시에도 발행 차단 조건이 될 수 없음 | **발행 차단 아님** |

---

> 이 문서는 approval.json 스키마 정렬 보정 이력이다.
> 다음 단계(approval write 구현)로 진행하기 전에 이 문서의 "아직 남겨둔 미확정 항목"을 검토한다.

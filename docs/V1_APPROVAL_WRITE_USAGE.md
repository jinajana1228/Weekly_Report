# V1 Approval Write 사용 가이드

> **문서 목적**: `scripts/approve.mjs`의 사용법, 입력 인자, 허용 값, 주의사항을 기록한다.
> **관련 스크립트**: `scripts/approve.mjs`
> **npm 단축키**: `npm run approval:write -- [args]`

---

## 1. 스크립트 목적

`scripts/approve.mjs`는 `data/manifests/approval.json`의 검수 의사결정 필드를 로컬에서 안전하게 갱신하는 CLI 도구다.

- **단일 파일 원칙**: `data/manifests/approval.json` 이외의 파일은 절대 수정하지 않는다.
- **게이트 원칙**: `decision` 필드만이 발행 가능 여부를 결정한다. `news_signal_review_status`는 참고 정보 전용이며 발행 차단 조건이 아니다.
- **dry-run 기본 워크플로**: 실제 write 전에 반드시 `--dry-run`으로 변경 내용을 확인한다.

---

## 2. 입력 인자

### 필수 인자

| 인자 | 설명 |
|------|------|
| `--decision <값>` | 검수 결과. 허용값: `approved` / `rejected` / `on_hold` / `pending` |
| `--reviewed-by <이름>` | 검수자 식별자 (예: `jina`). 빈 문자열 불허 |

### 선택 인자

| 인자 | 설명 | 미전달 시 동작 |
|------|------|----------------|
| `--note <텍스트>` | 검수 메모 (반려 사유, 보류 이유 등) | 기존 `notes` 값 유지 |
| `--news-signal-review-status <값>` | 뉴스 신호 검수 집계 요약. 허용값: `SUFFICIENT` / `PARTIAL` / `SPARSE` | 기존 값 유지 (경고 출력) |
| `--week-id <week_id>` | `approval.json`의 `draft_week_id`와 일치 여부를 사전 검증 | 검증 생략 |
| `--dry-run` | 실제 write 없이 변경 예정 내용만 출력 | — |
| `--json` | 출력 형식을 JSON으로 변경 (자동화/파이프 활용 시) | Human-readable 텍스트 출력 |
| `--verbose` | 상세 출력 활성화 | — |

---

## 3. 허용 값 목록

### `--decision`

| 값 | 의미 | current 전환 영향 |
|----|------|------------------|
| `approved` | 승인 완료 | draft → current 전환 트리거 (publish 스크립트 실행 시) |
| `rejected` | 반려 | 없음. draft 유지, 수정 후 재검수 필요 |
| `on_hold` | 보류 | 없음. current 유지 |
| `pending` | 검수 대기 초기화 | 기존 승인/반려 상태가 초기화됨 (경고 출력) |

### `--news-signal-review-status`

| 값 | 의미 |
|----|------|
| `SUFFICIENT` | 뉴스 신호 충분 (APPROVED 신호 다수) |
| `PARTIAL` | 뉴스 신호 일부 (혼재 상태) |
| `SPARSE` | 뉴스 신호 부족 |

> **주의**: `news_signal_review_status`는 어떤 값이어도 발행을 차단하지 않는다. `SPARSE` 상태여도 `decision: approved`이면 발행 가능하다.

---

## 4. 실제 수정되는 approval 필드

스크립트가 갱신하는 필드는 다음 5개에 한정된다.

| 필드 | 갱신 규칙 |
|------|-----------|
| `decision` | `--decision` 인자 값으로 덮어쓰기 |
| `reviewed_by` | `--reviewed-by` 인자 값으로 덮어쓰기 |
| `reviewed_at` | 스크립트 실행 시각 ISO 8601 자동 기록 |
| `notes` | `--note` 전달 시 갱신, 미전달 시 기존 값 유지 |
| `news_signal_review_status` | `--news-signal-review-status` 전달 시 갱신, 미전달 시 기존 값 유지 |

### 절대 수정하지 않는 필드

| 필드 | 이유 |
|------|------|
| `draft_report_id` | 검수 대상 식별자. 스크립트 실행 중 변경 불가 (read-only) |
| `draft_week_id` | 검수 대상 week 식별자. 스크립트 실행 중 변경 불가 (read-only) |

---

## 5. 수정하지 않는 파일 (보호 범위)

이 스크립트는 다음 파일들을 절대 수정하지 않는다.

| 파일/경로 | 이유 |
|-----------|------|
| `data/manifests/manifest.json` | current 전환 트리거가 아님. publish 스크립트 담당 |
| `data/current/*` | publish 스크립트 담당 |
| `data/draft/*` | draft 내용 변경 없음 |
| `data/archive/*` | publish 스크립트 담당 |
| `data/news_signals/*` | 뉴스 신호 원본. 수집 스크립트 담당 |
| `data/news_signals/signal_review.json` | 신호 검수 세부 기록. approve.mjs 범위 밖 |
| `admin/overlap_history.json` | 중복 추천 이력. publish 스크립트 담당 |

---

## 6. dry-run과 실제 write의 차이

| 구분 | `--dry-run` 포함 | `--dry-run` 미포함 |
|------|-----------------|-------------------|
| 파일 수정 | 없음 | `approval.json` 갱신 |
| 변경 예정 내용 출력 | ✓ | ✓ |
| `reviewed_at` | 출력에만 표시 (가상) | 실제 기록 |
| 상태 표시 | `🔍 DRY-RUN (변경 없음)` | `✅ WRITTEN` |

**권장 워크플로**:
```
# 1단계: dry-run으로 먼저 확인
npm run approval:write -- --decision approved --reviewed-by jina --dry-run

# 2단계: 내용 확인 후 실제 write
npm run approval:write -- --decision approved --reviewed-by jina
```

---

## 7. 운영 원칙과의 관계

| 원칙 | 스크립트 동작 |
|------|---------------|
| approval = 에디션 발행 게이트 | `decision: approved` 기록만 담당. 실제 current 전환은 publish 스크립트가 수행 |
| `decision`이 유일한 게이트 | `news_signal_review_status` 값과 무관하게 `decision: approved`면 발행 가능 구조 유지 |
| signal_review = 비차단 참고 입력 | `news_signal_review_status`는 참고 기록용. 발행 차단 조건으로 사용 불가 |
| 파일 기반 운영 | DB 없음. `approval.json` 단일 파일만 수정 |
| --week-id 안전장치 | `--week-id`를 함께 전달하면 `draft_week_id` 불일치 시 write 차단 (잘못된 에디션 검수 방지) |

---

## 8. 출력 형식

### Human-readable (기본)

```
╔══════════════════════════════════════════════════════════╗
║  APPROVE: 2026-W14                                       ║
║  actor  : jina                                           ║
╚══════════════════════════════════════════════════════════╝

  상태: ✅ WRITTEN

────────────────────────────────────────────────────────────
[변경 필드 (CHANGED FIELDS)]
  decision: "pending" → "approved"
  reviewed_by: null → "jina"
  reviewed_at: null → "2026-03-26T10:00:00.000Z"

────────────────────────────────────────────────────────────
[역할 구분 안내]
  decision                : "approved" — 발행 게이트 (유일한 차단 조건)
  news_signal_review_status: "PARTIAL" — 참고 정보 전용 (발행 차단 조건 아님)

  ✓ data/manifests/approval.json 갱신 완료 (2026-03-26T10:00:00.000Z)
  ✓ manifest.json / draft / current / archive / signal_review 수정 없음
════════════════════════════════════════════════════════════
```

### JSON 형식 (`--json`)

```json
{
  "dry_run": false,
  "week_id": "2026-W14",
  "actor": "jina",
  "decision": "approved",
  "note": null,
  "news_signal_review_status": null,
  "status": "WRITTEN",
  "errors": [],
  "warnings": [],
  "changed_fields": ["decision", "reviewed_by", "reviewed_at"],
  "diff": [...],
  "executed_at": "2026-03-26T10:00:00.000Z",
  "approval_after": {...}
}
```

---

## 9. 사용 예시

```bash
# 기본 승인
npm run approval:write -- --decision approved --reviewed-by jina

# dry-run으로 먼저 확인
npm run approval:write -- --decision approved --reviewed-by jina --dry-run

# 반려 + 사유 기록
npm run approval:write -- --decision rejected --reviewed-by jina --note "NAVER 데이터 기준일 오류 확인 필요"

# 보류 + 뉴스 신호 상태 기록
npm run approval:write -- --decision on_hold --reviewed-by jina --news-signal-review-status SPARSE --note "뉴스 신호 부족으로 보류"

# week-id 안전 검증 포함
npm run approval:write -- --decision approved --reviewed-by jina --week-id 2026-W14

# JSON 출력 (자동화 파이프라인 연동 시)
npm run approval:write -- --decision approved --reviewed-by jina --json
```

---

## 10. 오류 시나리오

| 오류 상황 | 메시지 | 해결 방법 |
|-----------|--------|-----------|
| `--decision` 미전달 | `--decision 인자가 필요합니다.` | 허용값 중 하나 전달 |
| `--decision` 허용되지 않은 값 | `허용되지 않은 decision 값: ...` | `approved/rejected/on_hold/pending` 중 선택 |
| `--reviewed-by` 미전달 또는 빈값 | `--reviewed-by 인자가 필요합니다.` | 검수자 이름 전달 |
| `--news-signal-review-status` 허용되지 않은 값 | `허용되지 않은 news-signal-review-status 값: ...` | `SUFFICIENT/PARTIAL/SPARSE` 중 선택 |
| `approval.json` 파일 없음 | `approval.json 파일이 없습니다.` | 파일 경로 확인: `data/manifests/approval.json` |
| `--week-id` 불일치 | `--week-id 불일치: 입력값 ... ≠ approval.json의 draft_week_id ...` | approval.json의 실제 `draft_week_id` 확인 |

---

> **관련 문서**:
> - `docs/V1_MANIFEST_APPROVAL_SCHEMA.md` — approval 필드 정의
> - `docs/V1_ADMIN_WRITE_STRATEGY.md` — approval write 전략
> - `docs/V1_APPROVAL_SCHEMA_ALIGNMENT_LOG.md` — approval 스키마 정렬 이력

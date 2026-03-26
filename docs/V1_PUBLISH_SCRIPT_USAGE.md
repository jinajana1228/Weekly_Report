# V1 Publish 스크립트 사용 가이드

> **문서 목적**: `scripts/publish.mjs`의 목적, 인자, Phase별 동작, 수정 파일 범위, 주의사항을 기록한다.
> **관련 스크립트**: `scripts/publish.mjs`
> **npm 단축키**: `npm run publish -- [args]`

---

## 1. 스크립트 목적

`scripts/publish.mjs`는 `approval.json`이 `approved` 상태인 draft를 current로 발행하는 로컬 CLI 도구다.

**역할:**
1. 기존 current → archive로 이동
2. draft → current로 전환
3. `manifest.json` 인덱스 갱신
4. `overlap_history.json` 추천 이력 갱신
5. `approval.json` 발행 후 초기화
6. draft 파일 정리 (선택)
7. git commit 생성 (선택)

**전제 원칙:**
- `approval.decision === "approved"`가 발행의 유일한 차단 조건이다.
- `signal_review.json`은 참고 입력이며, 발행을 차단하지 않는다.
- archive detail 파일 충돌(동일 파일명)은 경고만 출력하고 덮어쓰기를 허용한다.
- dry-run 모드에서는 절대 파일을 수정하지 않는다.

---

## 2. 입력 인자

### 필수 인자

| 인자 | 설명 |
|------|------|
| `--week-id <WEEK_ID>` | 발행할 draft의 week_id (예: `2026-W14`) |
| `--actor <이름>` | 발행을 실행하는 사람 식별자 (git commit 메시지에 포함) |

### 선택 인자

| 인자 | 기본값 | 설명 |
|------|--------|------|
| `--dry-run` | false | 실제 파일 변경 없이 예정 변경 내용만 출력 |
| `--note <텍스트>` | null | 발행 메모 (git commit 메시지에 포함) |
| `--keep-draft` | false | Phase H(draft 파일 삭제)를 건너뜀. draft 파일 보존 |
| `--skip-git` | false | Phase I(git commit)를 건너뜀. 수동 커밋 필요 |
| `--verbose` | false | 상세 경고 출력 활성화 |
| `--json` | false | 출력 형식 JSON (향후 파이프라인 연동용) |

---

## 3. 각 Phase 설명

### Phase 0: pre-check

발행 전 모든 조건을 검증한다. 차단 조건(BLOCKER)이 하나라도 있으면 이후 Phase를 실행하지 않고 종료한다.

| 검증 항목 | 종류 | 이유 |
|-----------|------|------|
| `approval.json` 파일 존재 | BLOCKER | 게이트 파일 없으면 발행 불가 |
| `approval.draft_week_id` == `--week-id` | BLOCKER | 다른 에디션 검수 결과로 발행하는 오조작 방지 |
| `approval.decision` == `"approved"` | BLOCKER | **유일한 발행 게이트** |
| `data/draft/{week_id}.json` 존재 | BLOCKER | 발행할 draft가 없으면 불가 |
| `manifest.json` 존재 및 `draft_week_id` 일치 | BLOCKER | 인덱스 불일치 방지 |
| `data/current/current.json` 존재 | BLOCKER | archive할 current가 없으면 불가 |
| `data/archive/{currentWeekId}.json` 미존재 | BLOCKER | 동일 주차 archive 덮어쓰기 방지 |
| `signal_review.json` 존재 여부 | WARNING | 뉴스 신호 참고 정보. 차단 아님 |
| `signal_review.review_completed` | WARNING | 미완료여도 발행 가능 |
| draft detail 커버리지 | WARNING | 상세 파일 없어도 발행 가능 |
| `linked_signal_ids` 매핑 | WARNING | 참고 검증. 차단 아님 |
| overlap_history 중복 ticker | WARNING | 참고 검증. 차단 아님 |
| archive/details 파일명 충돌 | WARNING | 덮어쓰기 예정 안내. 차단 아님 |

### Phase A: current 메인 → archive

`data/current/current.json`을 `data/archive/{currentWeekId}.json`으로 복사한다.

- 대상: `data/current/current.json` → `data/archive/{currentWeekId}.json`
- 원본 삭제 없음 (Phase D에서 교체)

### Phase B: current details → archive details

`data/current/details/` 내 모든 JSON 파일을 `data/archive/details/`로 복사한다.

- 동일 파일명이 이미 archive/details에 있으면 **경고 출력 후 덮어쓰기** (V1 운영 원칙: archive detail 충돌 덮어쓰기 허용)
- 원본 삭제 없음 (Phase D에서 교체)

### Phase C: draft 메인 → current 메인

`data/draft/{week_id}.json`을 `data/current/current.json`으로 복사한다.

- 기존 `current.json`은 이미 Phase A에서 archive됨

### Phase D: draft details → current details

`data/draft/details/` 내 모든 JSON 파일을 `data/current/details/`로 복사한다.

- 기존 `current/details/` 파일 전체 삭제 후 새 파일 복사 (교체 방식)
- 기존 current/details는 Phase B에서 이미 archive됨

### Phase E: manifest.json 갱신

| 필드 | 이전 값 | 이후 값 |
|------|---------|---------|
| `current_report_id` | 이전 에디션 | 발행된 draft의 `report_id` |
| `current_week_id` | 이전 week_id | `--week-id` 값 |
| `current_file_path` | 동일 | `"data/current/current.json"` |
| `draft_report_id` | draft 값 | `null` |
| `draft_week_id` | draft 값 | `null` |
| `draft_file_path` | draft 값 | `null` |
| `archive_week_ids` | 기존 배열 | 기존 배열 + 방금 archive된 week_id |
| `last_published_at` | 이전 발행 시각 | 현재 ISO 8601 시각 |

### Phase F: overlap_history.json 갱신

`admin/overlap_history.json`에 발행된 에디션의 picks를 기록한다.

- 신규 에디션 항목을 `recent_editions` 배열 맨 앞에 추가
- 최근 3개 에디션만 유지 (오래된 항목 자동 trim)
- 기록 내용: `{ week_id, published_at, main_picks: [ticker...] }`

### Phase G: approval.json 초기화

발행 완료 후 approval.json을 다음 사이클을 위해 초기화한다.

| 필드 | 초기화 값 | 이유 |
|------|-----------|------|
| `decision` | `"pending"` | 다음 draft 검수 대기 상태로 복귀 |
| `reviewed_by` | `null` | 검수자 정보 초기화 |
| `reviewed_at` | `null` | 검수 시각 초기화 |
| `notes` | `null` | 메모 초기화 |
| `news_signal_review_status` | `null` | per-draft 참고 정보. 새 draft 사이클을 위해 초기화 |
| `draft_report_id` | **유지** | 새 draft 준비 단계에서 별도 갱신됨 |
| `draft_week_id` | **유지** | 새 draft 준비 단계에서 별도 갱신됨 |

### Phase H: draft 파일 정리 (선택)

`--keep-draft` 없을 때: `data/draft/{week_id}.json` 및 `data/draft/details/` 내 파일 삭제.

`--keep-draft` 있을 때: Phase H를 건너뜀. draft 파일 보존.

### Phase I: git commit (선택)

`--skip-git` 없을 때: 변경된 파일 전체를 git add -A 후 commit.

- commit 메시지 형식: `publish: {week_id} — {note} (actor: {actor})`
- note 없으면: `publish: {week_id} (actor: {actor})`

`--skip-git` 있을 때: Phase I를 건너뜀. 수동 커밋 필요.

git commit 실패 시 경고만 출력 (파일 변경은 이미 완료된 상태이므로 차단하지 않음).

---

## 4. dry-run과 실제 publish의 차이

| 구분 | `--dry-run` 포함 | `--dry-run` 미포함 |
|------|-----------------|-------------------|
| 파일 복사/이동 | 없음 | 실행 |
| 파일 삭제 | 없음 | 실행 (Phase H) |
| manifest.json 갱신 | 없음 | 실행 |
| overlap_history.json 갱신 | 없음 | 실행 |
| approval.json 초기화 | 없음 | 실행 |
| git commit | 없음 | 실행 (Phase I) |
| 예정 변경 내용 출력 | ✓ | ✓ |
| pre-check 검증 | ✓ | ✓ |

**권장 워크플로:**

```bash
# 1단계: dry-run으로 먼저 확인
npm run publish -- --week-id 2026-W14 --actor jina --dry-run

# 2단계: 내용 확인 후 실제 발행
npm run publish -- --week-id 2026-W14 --actor jina
```

---

## 5. 수정하는 파일 범위

### 항상 수정하는 파일

| 파일 | 변경 내용 |
|------|-----------|
| `data/archive/{currentWeekId}.json` | 기존 current 메인 복사 (신규 생성) |
| `data/archive/details/` | 기존 current details 복사 |
| `data/current/current.json` | draft 메인으로 교체 |
| `data/current/details/` | draft details로 교체 |
| `data/manifests/manifest.json` | 인덱스 갱신 |
| `admin/overlap_history.json` | 추천 이력 갱신 |
| `data/manifests/approval.json` | 발행 후 초기화 |

### 선택적으로 수정하는 파일

| 파일 | 조건 |
|------|------|
| `data/draft/{week_id}.json` | `--keep-draft` 없을 때 삭제 |
| `data/draft/details/*` | `--keep-draft` 없을 때 삭제 |
| git index | `--skip-git` 없을 때 commit |

### 절대 수정하지 않는 파일

| 파일/경로 |
|-----------|
| `data/news_signals/**` (signal_review.json 포함) |
| `admin/overlap_history.json` 이외 admin 파일 |
| `docs/**` |
| `scripts/**` |
| `src/**` (Next.js 소스) |

---

## 6. signal_review가 발행 차단 조건이 아닌 이유

**운영 원칙 §7**: `signal_review`는 발행 차단 조건이 아니라 참고 입력이다.

- 뉴스 신호는 수치 데이터의 대체재가 아니라 보완 신호다 (운영 원칙 §3)
- 뉴스가 부족해도 수치 기반 발행이 가능해야 한다 (운영 원칙 §4)
- `signal_review.json`이 없거나 `review_completed: false`여도 `approval.decision: "approved"`라면 발행 진행

따라서 `signal_review` 관련 검증 결과는 모두 WARNING으로만 출력하고, 발행을 차단하지 않는다.

---

## 7. archive detail 충돌을 경고로만 처리하는 이유

**운영 원칙 §8**: archive detail 충돌은 V1에서 덮어쓰기 허용이다.

- `data/archive/details/`는 flat 구조다. 동일 ticker 파일명이 다른 에디션과 충돌할 수 있다.
- V1에서는 이 충돌을 차단하지 않고 덮어쓰기로 해결한다.
- 충돌 발생 시 경고 메시지로 사전 안내한다.

메인 archive 파일(`data/archive/{week_id}.json`)은 week_id가 고유하므로 충돌이 없다. BLOCKER로 처리.

---

## 8. keep-draft / skip-git 옵션

### `--keep-draft`

draft 파일을 삭제하지 않고 보존한다.

- 사용 시기: 발행 후 draft를 추가 검토하거나 백업 목적으로 보존할 때
- 효과: Phase H(draft 파일 삭제)를 건너뜀
- 주의: draft 파일이 남아 있으면 다음 에디션 준비 시 혼선이 생길 수 있다. 보존 후 수동 정리 권장.

### `--skip-git`

git commit을 자동 생성하지 않는다.

- 사용 시기: CI 환경에서 별도 commit 단계가 있을 때, 또는 여러 변경을 묶어 하나의 commit으로 처리할 때
- 효과: Phase I(git commit)를 건너뜀
- 주의: 파일 변경은 완료된 상태이므로 수동으로 `git add -A && git commit -m "publish: {week_id}"` 실행 필요

---

## 9. 실패 처리 정책

- 각 Phase 실행 중 예외 발생 시 즉시 중단하고 오류 메시지를 출력한다.
- 마지막으로 완료된 Phase를 출력하여 영향 범위를 파악할 수 있게 한다.
- **자동 롤백은 지원하지 않는다** (V1 범위).
- 복구 방법: `git status`로 변경 범위 확인 후 `git restore .` 또는 개별 파일 `git checkout HEAD -- <파일>`로 수동 복구.

---

## 10. git commit 처리 규칙

| 항목 | 내용 |
|------|------|
| 기본 동작 | Phase I에서 자동 git commit 실행 |
| --skip-git | Phase I를 건너뜀. 수동 커밋 필요 |
| commit 메시지 형식 | `publish: {week_id} (actor: {actor})` |
| note 있을 때 | `publish: {week_id} — {note} (actor: {actor})` |
| commit 실패 시 | 경고만 출력. 파일 변경은 이미 완료됨. 수동 커밋 필요 |

---

## 11. 사용 예시

```bash
# 기본 발행 (dry-run 먼저 확인)
npm run publish -- --week-id 2026-W14 --actor jina --dry-run
npm run publish -- --week-id 2026-W14 --actor jina

# 메모 포함
npm run publish -- --week-id 2026-W14 --actor jina --note "정기 발행"

# draft 파일 보존
npm run publish -- --week-id 2026-W14 --actor jina --keep-draft

# git commit 생략 (수동 커밋)
npm run publish -- --week-id 2026-W14 --actor jina --skip-git

# dry-run + 상세 출력
npm run publish -- --week-id 2026-W14 --actor jina --dry-run --verbose
```

---

## 12. 이번 단계에서 의도적으로 구현하지 않은 것

| 항목 | 이유 |
|------|------|
| 자동 롤백 (auto rollback) | V1 범위 밖. git으로 수동 복구 가능 |
| signal_review 자동 생성/수정 | 수집 스크립트 담당 영역 |
| admin UI write 기능 | 이번 단계 범위 밖 |
| runtime API write | 이번 단계 범위 밖 |
| /admin 보호 로직 변경 | 이미 구현 완료 |
| 다음 draft 자동 생성 | 별도 단계에서 결정 |
| approval.json draft_report_id/draft_week_id 갱신 | 새 draft 준비 단계에서 별도 처리 |
| news_signal_review_status 자동 집계 | 임계값 미확정. 수집 스크립트 구현 단계에서 확정 |

---

> **관련 문서**:
> - `docs/V1_MANIFEST_APPROVAL_SCHEMA.md` — approval 필드 및 current 전환 트리거 정의
> - `docs/V1_APPROVAL_WRITE_USAGE.md` — approval write CLI 사용법
> - `docs/V1_ADMIN_WRITE_STRATEGY.md` — admin write 전략 전체 맥락
> - `docs/V1_JSON_FILE_ROLE_BOUNDARIES.md` — 파일별 역할 경계

# V1 로컬 발행 Dry-Run 스크립트 사용 가이드

## 1. 목적

`scripts/dry-run-publish.mjs`는 실제 파일을 변경하지 않고,
현재 발행 가능 상태를 점검하고 **예정 변경 내역만 출력**하는 로컬 관리자 도구입니다.

- 실행 전 발행 가능 여부를 사전 검증합니다.
- 차단 조건과 경고 조건을 명확하게 구분합니다.
- 실제 발행 시 어떤 파일이 어떻게 변경될지 미리 확인할 수 있습니다.
- 어떤 경우에도 **파일 수정, 이동, git commit은 하지 않습니다**.

---

## 2. 입력 인자

| 인자 | 필수 여부 | 설명 |
|------|-----------|------|
| `--week-id` | **필수** | 발행할 draft week_id (예: `2026-W14`) |
| `--actor` | **필수** | 실행자 이름 (기록용, 예: `홍길동`) |
| `--note` | 선택 | 발행 메모 (기록용) |
| `--json` | 선택 | 결과를 JSON 형식으로 출력 (파이프/자동화용) |
| `--verbose` | 선택 | 추가 진단 정보 포함 출력 |

---

## 3. 실행 방법

```bash
# 기본 실행 (사람이 읽는 출력)
node scripts/dry-run-publish.mjs --week-id 2026-W14 --actor 홍길동

# npm script 별칭 사용
npm run publish:dry-run -- --week-id 2026-W14 --actor 홍길동

# 메모 포함
node scripts/dry-run-publish.mjs --week-id 2026-W14 --actor 홍길동 --note "NAVER 픽 최종 확인 완료"

# JSON 출력 (자동화 파이프라인용)
node scripts/dry-run-publish.mjs --week-id 2026-W14 --actor 홍길동 --json

# 상세 진단
node scripts/dry-run-publish.mjs --week-id 2026-W14 --actor 홍길동 --verbose
```

---

## 4. 검증 항목 상세

### 4-1. 차단 조건 (BLOCKERS) — 발행 불가

아래 중 하나라도 해당하면 dry-run 결과는 `BLOCKED`로 출력되며,
실제 발행 스크립트도 차단되어야 합니다.

| # | 검증 항목 | 설명 |
|---|-----------|------|
| B1 | `approval.json` 미존재 | 발행 게이트 파일 자체가 없음 |
| B2 | `approval.draft_week_id` ≠ `--week-id` | 승인된 에디션과 입력 week_id 불일치 |
| B3 | `approval.decision` ≠ `'approved'` | 미승인 상태로 발행 불가 **(핵심 차단)** |
| B4 | `data/draft/{week_id}.json` 미존재 | draft 메인 파일 없음 |
| B5 | `manifest.json` 미존재 | manifest 파일 없음 |
| B6 | `manifest.draft_week_id` ≠ `--week-id` | manifest와 입력 week_id 불일치 |
| B7 | `data/current/current.json` 미존재 | 현재 발행본 파일 없음 |
| B8 | `data/archive/{week_id}.json` 이미 존재 | archive에 동일 week_id 충돌 |

> **중요:** B3(`approval.decision !== 'approved'`)이 유일한 **실질적 발행 의사 차단 조건**입니다.
> 나머지는 파일 정합성 문제입니다.

### 4-2. 경고 조건 (WARNINGS) — 발행 가능, 확인 권장

경고는 발행을 차단하지 않습니다. 확인 후 판단하세요.

| # | 검증 항목 | 설명 |
|---|-----------|------|
| W1 | `signal_review.json` 미존재 | 뉴스 신호 검수 없이 발행됨 (수치 기반 발행은 가능) |
| W2 | `signal_review.review_completed = false` | 미완료 신호 검수, PENDING 항목 수 포함 출력 |
| W3 | draft detail 파일 미커버 | picks 중 상세 파일이 없는 ticker |
| W4 | `linked_signal_ids` 매핑 불일치 | detail의 linked_signal_ids가 signal_review에 없음 |
| W5 | overlap_history 중복 ticker | 최근 에디션 pick과 겹치는 ticker 발견 |
| W6 | archive detail 동일 파일명 충돌 | 아카이브 시 덮어쓰기 예정 파일 존재 |

> **뉴스 관련 경고(W1, W2, W3, W4)는 절대 차단 조건으로 승격되지 않습니다.**
> 운영 원칙에 따라 뉴스는 보완 신호이며 수치 기반 발행은 항상 가능해야 합니다.

---

## 5. 출력 구조

### 사람이 읽는 출력 (기본)

```
╔══════════════════════════════════════════════════════════╗
║  DRY-RUN: 2026-W14                                       ║
║  actor  : 홍길동                                          ║
╚══════════════════════════════════════════════════════════╝

  상태: 🚫 BLOCKED  (또는 ✅ READY)

────────────────────────────────────────────────────────────
[차단 조건 (BLOCKERS)]
  ✗ approval.decision이 'pending'입니다. 'approved' 상태여야 발행할 수 있습니다.

────────────────────────────────────────────────────────────
[경고 (WARNINGS)]
  ⚠  signal_review.review_completed=false. PENDING 항목 2개 남아 있습니다.

────────────────────────────────────────────────────────────
[발행 시 진행 순서 (PHASE PLAN)]
  Phase A: 현재 에디션(2026-W13) 아카이브
  Phase B: 신규 에디션(2026-W14) 발행
  Phase C: 상태 파일 갱신
  Phase D: 초안 정리 (선택)

────────────────────────────────────────────────────────────
[예정 파일 변경 (PLANNED FILE CHANGES)]
  [Phase A] COPY  data/current/current.json → data/archive/2026-W13.json
  [Phase A] COPY  data/current/details/stock_005930.json → data/archive/details/stock_005930.json
  [Phase A] COPY  data/current/details/etf_360750.json → data/archive/details/etf_360750.json
  [Phase B] MOVE  data/draft/2026-W14.json → data/current/current.json
  [Phase B] MOVE  data/draft/details/stock_035420.json → data/current/details/stock_035420.json
  [Phase C] UPDATE data/manifests/manifest.json
  [Phase C] UPDATE admin/overlap_history.json
  [Phase C] RESET  data/manifests/approval.json
  [Phase D] DELETE data/draft/2026-W14.json (선택적 cleanup)

────────────────────────────────────────────────────────────
[예정 git commit 메시지 (PLANNED COMMITS)]
  1. archive: 2026-W13
  2. publish: 2026-W14
  3. post-publish: manifest + overlap + approval reset (2026-W14)

────────────────────────────────────────────────────────────
[DRY-RUN SUMMARY]
  week_id  : 2026-W14
  actor    : 홍길동
  blockers : 1
  warnings : 2
  result   : BLOCKED

  ※ 이 출력은 dry-run 결과입니다. 실제 파일 변경은 없습니다.
════════════════════════════════════════════════════════════
```

### JSON 출력 (`--json` 플래그)

```json
{
  "dry_run": true,
  "week_id": "2026-W14",
  "actor": "홍길동",
  "note": null,
  "status": "BLOCKED",
  "blockers": [
    "approval.decision이 'pending'입니다. 'approved' 상태여야 발행할 수 있습니다."
  ],
  "warnings": [
    "signal_review.review_completed=false. PENDING 항목 2개 남아 있습니다."
  ],
  "planned_file_changes": [...],
  "planned_commit_messages": [
    "archive: 2026-W13",
    "publish: 2026-W14",
    "post-publish: manifest + overlap + approval reset (2026-W14)"
  ],
  "phase_plan": [...],
  "executed_at": "2026-04-06T09:00:00.000Z"
}
```

---

## 6. exit code

| exit code | 의미 |
|-----------|------|
| `0` | READY — 차단 조건 없음 (경고가 있어도 0) |
| `1` | BLOCKED — 차단 조건 1개 이상 |

---

## 7. 실제 publish 스크립트와의 차이

| 항목 | dry-run | publish (미구현) |
|------|---------|-----------------|
| 파일 복사/이동 | ❌ 없음 | ✅ 실행 |
| manifest 갱신 | ❌ 없음 | ✅ 실행 |
| approval 초기화 | ❌ 없음 | ✅ 실행 |
| overlap_history 갱신 | ❌ 없음 | ✅ 실행 |
| git commit | ❌ 없음 | ✅ 실행 |
| 검증 로직 | ✅ 동일 | ✅ 동일 |
| 출력 형식 | 사람/JSON | 진행 로그 |
| exit code | 0/1 | 0/1 |

publish 스크립트는 dry-run 검증을 통과한 경우에만 실제 변경을 수행합니다.
**publish 스크립트는 이번 단계에서 구현하지 않습니다.**

---

## 8. 이번 단계에서 의도적으로 하지 않은 것

- **실제 publish 스크립트 구현 안 함** — dry-run만 구현
- **approval.json write 안 함** — approval 상태는 수동 또는 미래 admin write 단계에서 처리
- **파일 복사/이동 코드 없음** — 모든 변경은 "예정" 출력만
- **git 명령 실행 없음** — commit 메시지는 출력만
- **Web UI 연동 없음** — 로컬 CLI 전용
- **멀티 step 자동 발행 없음** — 사람이 단계별로 확인 후 결정

---

## 9. 운영 원칙과의 관계

| 원칙 | dry-run 반영 방식 |
|------|-------------------|
| approval이 유일한 발행 게이트 | B3가 유일한 실질 차단 조건 |
| 뉴스는 보완 신호 | signal_review 관련은 전부 WARNING |
| 수치 기반 발행 항상 가능 | 뉴스 없어도 READY 가능 |
| 파일 기반 운영 | fs.readFileSync만 사용, write 없음 |
| 사람이 최종 판단 | dry-run 결과를 사람이 보고 판단 |

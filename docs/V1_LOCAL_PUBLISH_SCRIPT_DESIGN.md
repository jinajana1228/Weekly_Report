# V1 로컬 발행 스크립트 설계

> **문서 목적**: approval이 승인된 후 로컬에서 실행하는 발행 전환 스크립트의 입력/출력/Phase별 처리 순서를 구현 전에 확정하기 위한 설계 문서.
> **단계**: 전략 확정 단계 — 실제 스크립트 코드 작성 금지. 이 문서는 구현 전 설계 기준으로 사용한다.

---

## 1. 스크립트 목적과 운영 원칙

### 목적
- `approval.decision === "approved"`가 확인된 후, 로컬 파일시스템에서 draft → current → archive 전환을 안전하게 실행한다.
- 각 Phase 완료 시 git commit을 생성하여 감사 기록과 단계별 rollback 기반을 마련한다.
- 파일 기반 V1 운영 구조에서 런타임 write 없이 발행 전환을 완결한다.

### 핵심 운영 원칙 (스크립트 설계 전제)
1. **approval.decision이 유일한 발행 차단 게이트다.** 스크립트는 approval.json 확인 후에만 진행한다.
2. **signal_review는 참고 입력이지 차단 조건이 아니다.** signal_review 상태와 무관하게 발행이 진행된다. 미완료 시 경고만 출력한다.
3. **Phase 순서를 절대 역행하지 않는다.** 특히 Phase 2(archive 복사) 완료 전 Phase 3(current 전환) 시작 금지.
4. **각 Phase 실패 시 즉시 중단한다.** 이후 Phase를 건너뛰거나 재시도하지 않는다.
5. **dry-run 모드를 반드시 지원한다.** 실제 파일 변경 없이 실행 계획만 출력한다.

---

## 2. 스크립트 입력값 / 출력값 권장안

### 2-1. 입력값 (CLI Arguments)

| 인수 | 필수 여부 | 예시 | 설명 |
|------|-----------|------|------|
| `--week-id` | **필수** | `2026-W14` | 발행할 draft의 week_id. approval.json과 교차 검증 |
| `--actor` | **필수** | `"홍길동"` | 발행 실행자 이름. git commit 메시지와 approval에 기록 |
| `--note` | 선택 | `"W14 정상 발행"` | 발행 메모. approval.notes에 기록 (없으면 null) |
| `--dry-run` | 선택 | (플래그) | 실제 파일 변경 없이 실행 계획과 예상 변경 파일 목록만 출력 |
| `--skip-signal-warning` | 선택 | (플래그) | signal_review 미완료 경고를 억제 (발행은 항상 진행됨) |

### 2-2. 출력값 (실행 결과)

| 항목 | 내용 |
|------|------|
| 실행 결과 | `SUCCESS` / `FAILURE` / `DRY_RUN_COMPLETE` |
| 변경된 파일 목록 | 복사/갱신된 파일 경로 전체 목록 |
| 생성된 git commit 목록 | commit hash + 메시지 (--dry-run 시 예상 메시지만 출력) |
| 실패 시 중단 Phase 번호 | 어느 Phase에서 중단됐는지 |
| 경고 목록 | signal_review 미완료, detail 파일 누락 등 비차단 경고 |
| 권장 commit 메시지 | git commit 메시지 형식 참고용 |

### 2-3. 권장 commit 메시지 형식

```
[Phase A] archive: {이전_week_id}
[Phase B] publish: {새_week_id}
[Phase C] post-publish: reset approval + update overlap_history
```

---

## 3. 발행 전 검증 (Phase 0: Pre-check)

스크립트 시작 시 파일 변경 없이 아래 항목을 순서대로 검증한다.

| 번호 | 검증 항목 | 실패 시 동작 | 차단 여부 |
|------|-----------|-------------|-----------|
| 0-1 | `--week-id` 값이 `YYYY-WNN` 형식인지 | 즉시 종료 + 오류 출력 | **차단** |
| 0-2 | `data/manifests/approval.json` 파일 존재 확인 | 즉시 종료 | **차단** |
| 0-3 | `approval.decision === "approved"` 확인 | 즉시 종료 + 현재 decision 출력 | **차단** |
| 0-4 | `approval.draft_week_id === --week-id` 일치 확인 | 즉시 종료 + 불일치 값 출력 | **차단** |
| 0-5 | `data/manifests/manifest.json` 파일 존재 확인 | 즉시 종료 | **차단** |
| 0-6 | `manifest.draft_week_id === --week-id` 일치 확인 | 즉시 종료 | **차단** |
| 0-7 | `data/draft/{week_id}.json` 파일 존재 확인 | 즉시 종료 | **차단** |
| 0-8 | `data/current/current.json` 파일 존재 확인 | 즉시 종료 | **차단** |
| 0-9 | git working tree가 clean한지 확인 (uncommitted 없음) | 경고 출력 + 사용자 확인 요청 | 권장 확인 |
| 0-10 | draft picks의 detail 파일들 존재 여부 확인 | **경고만 출력** (발행 계속) | 비차단 |
| 0-11 | `signal_review.json` 존재 여부 확인 | **경고만 출력** | 비차단 |
| 0-12 | `signal_review.review_completed === true` 확인 | **경고만 출력** — "뉴스 신호 검수 미완료. 수치 기반 발행 진행." | **비차단** |
| 0-13 | overlap_history 기준 중복 ticker 여부 확인 | **경고만 출력** | 비차단 |

> **signal_review에 대한 명시적 정책**:
> `signal_review`는 발행 차단 조건이 아니다. `review_completed = false`이거나 파일 자체가 없어도 발행이 진행된다. 경고 메시지로만 알린다. 뉴스 부족 시에도 수치 기반 발행이 항상 가능해야 한다는 V1 운영 원칙에 따른다.

---

## 4. Phase별 처리 순서

### Phase A: 기존 Current → Archive 전환

**목적**: 현재 current 에디션을 archive로 안전하게 복사.

| 번호 | 작업 | 대상 파일 | 세부 사항 |
|------|------|-----------|-----------|
| A-1 | manifest에서 `current_week_id` 값 읽기 | `manifest.json` (읽기만) | archive 파일명으로 사용 |
| A-2 | `current.json`에 `archived_at` 필드 추가하여 복사 | `data/current/current.json` → `data/archive/{current_week_id}.json` | `archived_at`: 실행 시각 ISO 8601 |
| A-3 | `current/details/` 파일들을 `archive/details/`로 복사 | `data/current/details/*` → `data/archive/details/*` | 파일명 충돌 처리 정책 적용 (§6 참조) |
| A-4 | 복사 완료 확인 | archive 경로 파일 존재 확인 | 실패 시 즉시 중단 |

**Phase A 완료 조건**: `data/archive/{current_week_id}.json` 존재 + `archived_at` 필드 포함 확인.

**Phase A 실패 시**: Phase B 절대 시작 금지. 복사된 archive 파일이 있으면 수동 삭제 후 재시도 가능.

**Phase A 완료 후 git commit:**
```
commit message: "archive: {current_week_id}"
포함 파일: data/archive/{current_week_id}.json, data/archive/details/* (추가된 파일들)
```

---

### Phase B: Draft → Current 전환

**목적**: draft 에디션을 새 current로 전환.

**전제 조건**: Phase A가 완전히 완료되어야 한다. Phase A 실패 시 Phase B 진행 금지.

| 번호 | 작업 | 대상 파일 | 세부 사항 |
|------|------|-----------|-----------|
| B-1 | `draft/{week_id}.json`에 `published_at` 필드 설정하여 `current.json`으로 복사 | `data/draft/{week_id}.json` → `data/current/current.json` | `published_at`: 실행 시각 ISO 8601 |
| B-2 | `draft/details/` 파일들을 `current/details/`로 복사 | `data/draft/details/*` → `data/current/details/*` | 기존 current/details는 Phase A에서 archive됨 |
| B-3 | 복사 완료 확인 | `data/current/current.json` week_id 필드 확인 | 실패 시 즉시 중단 |

**Phase B 완료 조건**: `data/current/current.json`의 `week_id`가 새 에디션 week_id와 일치.

**Phase B 완료 후 git commit:**
```
commit message: "publish: {새_week_id}"
포함 파일: data/current/current.json, data/current/details/* (변경된 파일들)
```

---

### Phase C: 상태 파일 갱신 (Manifest + Overlap History + Approval)

**목적**: 발행 완료 후 인덱스/이력/승인 파일을 새 상태로 갱신.

**전제 조건**: Phase B가 완전히 완료되어야 한다.

| 번호 | 작업 | 대상 파일 | 세부 사항 |
|------|------|-----------|-----------|
| C-1 | manifest 갱신 | `data/manifests/manifest.json` | `current_*` 필드를 새 에디션으로, `archive_week_ids[]`에 구 에디션 추가, `draft_*` 필드를 null 처리, `last_published_at` 갱신 |
| C-2 | overlap_history 갱신 | `admin/overlap_history.json` | `recent_editions[]` 앞에 새 에디션 추가, 최오래된 항목 제거 (최근 3개 유지) |
| C-3 | approval 초기화 | `data/manifests/approval.json` | `decision: "pending"`, `reviewed_by: null`, `reviewed_at: null`, `notes: null`, `draft_report_id: null`, `draft_week_id: null` |
| C-4 | C-1 ~ C-3 완료 확인 | 각 파일 읽기 검증 | 실패 시 경고 출력 후 계속 (비차단) |

**overlap_history 갱신 실패 시**: 경고만 출력하고 발행은 완료된 것으로 처리. Phase C 전체를 중단하지 않는다.

**Phase C 완료 후 git commit:**
```
commit message: "post-publish: reset approval, update manifest and overlap_history for {새_week_id}"
포함 파일: data/manifests/manifest.json, data/manifests/approval.json, admin/overlap_history.json
```

---

### Phase D: 정리 (Optional Cleanup)

**목적**: 발행 완료된 draft 파일 정리. 사용자 확인 후 실행.

| 번호 | 작업 | 대상 파일 | 세부 사항 |
|------|------|-----------|-----------|
| D-1 | draft 메인 리포트 파일 삭제 | `data/draft/{week_id}.json` | Phase A~C 완전 완료 확인 후에만 실행 |
| D-2 | draft details 파일 삭제 | `data/draft/details/*` | |
| D-3 | news_signals 보존 | `data/news_signals/{week_id}/*` | **삭제하지 않는다** — 발행된 에디션의 신호 이력 참조용 |

**Phase D는 선택 실행**이다. `--skip-cleanup` 플래그로 건너뛸 수 있다. git에 파일이 추적되므로 나중에 삭제해도 git history에서 복원 가능.

**Phase D git commit (선택):**
```
commit message: "cleanup: remove draft {week_id} files"
```

---

## 5. 전체 실행 흐름 요약

```
[스크립트 시작]
  │
  ├─ Phase 0: Pre-check (파일 변경 없음)
  │     0-1 ~ 0-8: 차단 조건 확인 → 실패 시 즉시 종료
  │     0-9 ~ 0-13: 비차단 경고 출력 (signal_review 포함)
  │     └─ dry-run이면 여기서 계획 출력 후 종료
  │
  ├─ Phase A: 기존 Current → Archive
  │     A-1 ~ A-3: archive 파일 생성
  │     A-4: 완료 확인
  │     └─ git commit "archive: {구_week_id}"
  │
  ├─ Phase B: Draft → Current (Phase A 완료 후에만)
  │     B-1 ~ B-2: current 파일 교체
  │     B-3: 완료 확인
  │     └─ git commit "publish: {새_week_id}"
  │
  ├─ Phase C: 상태 파일 갱신 (Phase B 완료 후에만)
  │     C-1: manifest 갱신
  │     C-2: overlap_history 갱신 (실패 시 경고만)
  │     C-3: approval 초기화
  │     └─ git commit "post-publish: ..."
  │
  └─ Phase D: 정리 (선택)
        D-1 ~ D-2: draft 파일 삭제
        D-3: news_signals 보존
        └─ git commit "cleanup: ..." (선택)

[스크립트 종료]
  출력: SUCCESS / FAILURE + 변경 파일 목록 + commit 목록
```

---

## 6. Archive Detail 동일 Ticker 충돌 처리 정책

### 문제 정의

현재 archive details 경로: `data/archive/details/stock_{ticker}.json` (flat 구조)

동일 ticker가 서로 다른 에디션에 등장할 경우, 나중 에디션의 발행 시 이전 archive detail 파일이 덮어씌워질 수 있다.

예시:
- W12에서 삼성전자(005930)가 발행됨 → `data/archive/details/stock_005930.json` (W12 기준)
- W17에서 삼성전자(005930)가 다시 발행됨 → 같은 경로 파일 덮어쓰기 → W12 archive detail 소실

### 후보 비교

| 후보 | 방식 | 장점 | 단점 | 로더 변경 |
|------|------|------|------|-----------|
| **A: flat 유지 + 정책 관리** | 현행 유지. 충돌 시 덮어쓰기 허용. overlap_history로 ticker 재사용 3에디션 방지 | 구현 없음 | 4번째 에디션 이후 충돌 가능 | 없음 |
| **B: 파일명에 week_id 포함** | `stock_{ticker}_{week_id}.json` | 충돌 없음 | 로더의 파일명 탐색 로직 변경 필요 | 필요 |
| **C: archive/{week_id}/details/ 하위 폴더** | 에디션별 폴더 분리 | 완벽한 격리 | 폴더 구조 변경 = 로더 대규모 수정, 기존 샘플 파일 구조 파괴 | 필요 (대규모) |
| **D: detail_report_id 기반 파일명** | `DTL-2026-W12-005930.json` | 충돌 없음 + 의미 있는 파일명 | 로더 로직 변경 필요 (detail_report_id → 경로 변환) | 필요 |

### V1 권장안: 후보 A (flat 유지 + 운영 정책 관리)

**이유:**
- 구현 없이 즉시 적용 가능 (로더 변경 없음)
- overlap_history의 3에디션 이력 관리가 자연적인 충돌 방지 역할을 함 (단기간 ticker 재선택 불가)
- V1 파일 기반 원칙을 지키며 추가 복잡도 없음

**V1 운영 정책 (충돌 방지 수칙):**
1. 스크립트 Phase 0에서 draft picks의 ticker와 현재 archive/details 내 파일 목록을 교차 확인, 충돌 가능 파일이 있으면 경고 출력
2. 충돌이 확인된 경우, archive detail의 소실 여부를 git history로 복원 가능함을 명시
3. 덮어쓰기가 실제로 발생하면 해당 에디션의 archive detail은 최신 에디션 기준 데이터로 업데이트됨 (허용 정책)

**V1.1 권장 전환안: 후보 D (detail_report_id 기반 파일명)**
- `DTL-{week_id}-{ticker}.json` 형식으로 파일명 변경
- 로더의 `loadArchiveDetail()` 함수가 detail_report_id를 파라미터로 받아 경로를 구성
- 기존 샘플 파일 이름 변경 필요 (마이그레이션 작업 동반)

---

## 7. Approval 초기화 시점 권장안

### 후보 비교

| 후보 | 시점 | 장점 | 단점 |
|------|------|------|------|
| A: 발행 완료 직후 (Phase C) | current 전환 후 즉시 | 상태 명확. 다음 draft 준비 명확히 시작 | 발행 완료 직전 확인 기회 소실 |
| B: 다음 draft 파일 생성 시 | 다음 수집 사이클 시작 시 | 이전 approval 기록을 한동안 볼 수 있음 | approval.decision이 "approved"로 남아 혼동 가능 |

### V1 권장: **후보 A (Phase C에서 발행 완료 직후 즉시 초기화)**

**이유:**
- `approval.decision = "approved"`가 남아 있으면 다음 사람이 이미 발행된 것을 재발행하려는 혼동 가능
- 이전 approval 기록은 git history에 보존되므로 초기화해도 감사 기록 손실 없음
- Phase C에서 approval 초기화 + manifest draft_* null 처리를 함께 진행하면 상태 일관성 유지

**초기화 후 approval.json 상태:**
```json
{
  "draft_report_id": null,
  "draft_week_id": null,
  "decision": "pending",
  "reviewed_by": null,
  "reviewed_at": null,
  "notes": null
}
```

---

## 8. Manifest Draft 필드 처리 권장안

### 후보 비교

| 후보 | 방식 | 장점 | 단점 |
|------|------|------|------|
| A: null 처리 (발행 직후) | Phase C에서 `draft_*` 필드를 null로 | 명확. "현재 draft 없음" 상태 표현 | 다음 draft 파일 생성 전까지 draft_week_id 없음 |
| B: 발행된 week_id 유지 | Phase C에서 변경 안 함 | 처리 단순 | draft_week_id가 방금 current가 된 week_id를 가리켜 혼동 |
| C: 다음 draft week_id 예측 입력 | 발행 시 다음 week_id를 미리 설정 | 다음 draft 준비 즉시 완료 | 다음 week_id 미확정 상태에서 입력 강제 |

### V1 권장: **후보 A (Phase C에서 null 처리)**

**이유:**
- "현재 draft 없음" 상태를 명확히 표현
- admin 화면에서 "검수 대기 draft 없음" 상태를 정확히 반영
- 다음 draft 파일이 생성되면 manifest를 갱신 (별도 draft 준비 스크립트 또는 수동 갱신)

**발행 후 manifest draft 필드 상태:**
```json
{
  "draft_report_id": null,
  "draft_week_id": null,
  "draft_file_path": null
}
```

---

## 9. 실패 / 부분 실패 시 중단 및 복구 원칙

| 실패 케이스 | 중단 원칙 | 복구 방법 |
|-------------|-----------|-----------|
| Phase 0 차단 조건 실패 | 즉시 종료. 파일 변경 없음 | 조건 해소 후 재실행 |
| Phase A 실패 (archive 복사 중) | 즉시 중단. Phase B 금지 | 복사된 archive 파일 수동 삭제 후 Phase A 재실행 |
| Phase A 완료 후 Phase B 실패 | 즉시 중단 | git history에서 Phase A commit 확인 → Phase B만 재실행 |
| Phase B 완료 후 Phase C 실패 (manifest) | 경고 출력 후 중단. 발행은 사실상 완료 | manifest 수동 갱신 필요 |
| Phase C 내 overlap_history 갱신 실패 | 경고만 출력. Phase C 나머지 진행 | overlap_history 수동 갱신 (다음 발행 전 보완) |
| Phase C 내 approval 초기화 실패 | 경고 출력. 발행은 완료로 처리 | approval.json 수동 초기화 |
| git commit 실패 (Phase A 완료 후) | 경고 출력. 파일은 이미 변경됨 | `git add + git commit` 수동 실행 |

**복구 불가 케이스 (데이터 소실 위험):**
- Phase A 없이 Phase B가 실행된 경우 (설계상 방지되나, 수동 편집 오류 시 가능)
- 이 경우 git history에서 직전 `current.json` 파일 복원 필요

**예방 원칙**: 스크립트 실행 전 반드시 `git status`가 clean한 상태여야 한다. Phase 0에서 이를 확인한다.

---

## 10. Git Commit 단위 권장안

V1에서는 **3개 commit** 단위를 권장한다.

| Commit | 시점 | 포함 내용 | 목적 |
|--------|------|-----------|------|
| Commit 1 | Phase A 완료 후 | `data/archive/{week_id}.json` + `data/archive/details/*` | archive rollback 기준점 확보 |
| Commit 2 | Phase B 완료 후 | `data/current/current.json` + `data/current/details/*` | publish rollback 기준점 확보 |
| Commit 3 | Phase C 완료 후 | `manifest.json` + `approval.json` + `overlap_history.json` | 상태 파일 변경 감사 기록 |

**이 단위의 장점:**
- Phase A 실패 후 재시도 시 Commit 1이 없으면 Phase A를 처음부터 재실행
- Phase B만 실패한 경우 Commit 1을 기준으로 Phase B만 재실행
- 상태 파일 실수 시 Commit 2까지 rollback 가능 (발행은 유지, 상태 파일만 복원)

**최종 git push**: 모든 commit 완료 후 한 번 push. Commit 단위로 push하지 않는다.

---

## 11. Signal Review 역할 표현 정리

이 문서 전체에서 signal_review는 다음과 같이 표현된다:

| 잘못된 표현 | 올바른 표현 |
|-------------|-------------|
| "signal_review가 완료되어야 발행할 수 있다" | "signal_review는 권장 확인 대상이다. 완료 여부와 무관하게 발행 가능하다" |
| "신호 검수를 통과해야 한다" | "신호 검수 미완료 시 경고를 출력한다. 발행은 계속 진행된다" |
| "signal_review = 발행 게이트" | "signal_review = 뉴스 신호 검수 참고 입력" |
| "뉴스 신호가 부족하면 발행 불가" | "뉴스 신호 부족 시 fallback: 수치 기반 발행 허용" |

**Phase 0에서의 signal_review 처리 (명확화):**
```
signal_review.json 없음 → 경고: "신호 파일 없음. 수치 기반 발행으로 진행."
review_completed = false → 경고: "신호 검수 미완료. 수치 기반 발행으로 진행."
approval.decision = "approved" → 발행 허가 (signal_review 상태와 무관)
```

---

## 12. 아직 최종 확정이 필요한 항목

| 항목 | 현재 상태 | 확정 필요 이유 |
|------|-----------|----------------|
| 스크립트 언어 | 미정 | Node.js vs Python vs Shell script |
| `published_at` 값 설정 주체 | 미정 | 스크립트 실행 시각 자동 설정 vs 관리자 명시 입력 |
| Phase A git commit 시점 | 미정 | A-4 직후 vs Phase B와 합산 |
| news_signals 파일 보존 기간 | 미정 | 무기한 보존 vs 일정 에디션 경과 후 삭제 |
| dry-run 출력 포맷 | 미정 | JSON vs 텍스트 리포트 vs 인터랙티브 |
| git push 자동화 여부 | 미정 | 스크립트가 push까지 할지 vs 관리자가 별도 실행 |
| 다음 draft 준비 스크립트 연계 | 미정 | 발행 스크립트 완료 후 next-draft 준비 스크립트를 별도로 설계할지 |
| ticker 충돌 경고 임계값 | 미정 | Phase 0에서 몇 개 이상 충돌 시 중단 vs 항상 경고만 |

---

## Self-check before implementation

### 이번 문서에서 권장 발행 스크립트 설계로 제시한 것
- **3-Phase + Optional Cleanup (A/B/C/D)** 구조, 각 Phase별 git commit
- **Phase 0: Pre-check** — approval.decision이 유일한 차단 게이트. signal_review는 비차단 경고만
- **Archive detail 충돌**: flat 유지 + 운영 정책 관리 (V1), detail_report_id 파일명 (V1.1)
- **Approval 초기화**: Phase C에서 발행 직후 null 처리
- **Manifest draft 필드**: Phase C에서 null 처리

### V1에서 아직 구현하지 않기로 둔 것
- 실제 스크립트 코드
- detail_report_id 기반 파일명 변환 (로더 변경 필요 → V1.1)
- archive 에디션별 하위 폴더 구조 (V1.1)
- git push 자동화 코드
- 다음 draft 준비 스크립트

### 구현 전에 사용자가 최종 판단해야 하는 항목
- 스크립트 언어 선택 (Node.js / Python / Shell)
- git push 자동화 포함 여부
- Phase A와 B commit을 합칠지 분리할지
- ticker 충돌 시 경고만 할지 중단할지

### signal_review / approval / manifest / overlap_history / archive details 경계를 어떻게 유지했는지
- **approval**: Phase 0 차단 게이트. Phase C에서 초기화. signal_review와 혼동 없음
- **signal_review**: Phase 0에서 비차단 경고만. 발행 흐름에 관여하지 않음
- **manifest**: Phase C에서 current/archive/draft 인덱스 갱신. 상태 결정 역할 없음
- **overlap_history**: Phase C에서 별도 갱신. 실패해도 발행 차단 없음
- **archive details**: Phase A에서 복사. V1 flat 구조 유지. 충돌 시 덮어쓰기 정책 명시

### 내가 임의로 구현하거나 기존 구조를 바꾸지 않은 것
- 실제 스크립트 코드 없음
- 기존 파일 구조 변경 없음
- 기존 로더/타입 변경 없음
- build/dev 실행 없음
- background command 없음

### 현재 운영 원칙 점검
| 원칙 | 점검 결과 |
|------|-----------|
| 자동 수집 중심 | 발행 스크립트는 수집과 독립적. 수집 자동화에 영향 없음 |
| 사람은 최종 승인만 | Phase 0의 approval.decision 확인이 사람 개입 전부. 이후 스크립트 자동 처리 |
| 뉴스는 보완 신호 | signal_review를 비차단 경고로만 처리. Phase 0에서 명시적으로 "수치 기반 발행 진행" 표현 |
| 뉴스 부족 시 발행 가능 | signal_review 없거나 미완료여도 Phase 진행 차단 없음 |
| approval = 에디션 게이트 | Phase 0에서 approval.decision 확인이 유일한 차단 조건 |
| signal_review = 검수 결과 | Phase 0 비차단 참고 입력으로만 취급. Phase B/C와 무관 |
| 파일 기반 운영 | 스크립트는 파일 복사/갱신만 수행. DB/런타임 write 없음 |
| current/draft/archive 구조 유지 | Phase A~B가 기존 폴더 구조 그대로 유지하며 전환 |

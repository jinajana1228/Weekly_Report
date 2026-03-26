# V1 발행 전환 전략

> **문서 목적**: draft → current → archive 전환 절차와 파일 관계, 성공/실패 조건, fallback 원칙을 정의하는 설계 문서.
> **단계**: 전략 확정 단계 — 실제 파일 이동/write 구현 금지. 이 문서는 구현 전 판단 기준으로 사용한다.

---

## 1. 발행 전환 개요

V1은 파일 위치가 곧 상태이다. 파일을 이동하거나 교체하는 것이 상태 전환 자체다.

```
[draft 상태]
  data/draft/{week_id}.json
  data/draft/details/...
  data/news_signals/{week_id}/...
  data/manifests/approval.json (decision: "pending")

            ↓ 관리자 승인 + publish 실행

[current 상태]
  data/current/current.json       ← 새로 교체됨
  data/current/details/...        ← 새로 교체됨

            ↓ (동시에)

[archive 상태]
  data/archive/{이전_week_id}.json      ← 기존 current가 이동됨
  data/archive/details/{ticker}.json    ← 기존 current/details가 이동됨

            ↓ (이후)

  data/manifests/manifest.json    ← 갱신됨
  data/manifests/approval.json    ← 초기화됨 (다음 draft용)
  admin/overlap_history.json      ← 갱신됨
```

---

## 2. 발행 전환 절차 (단계별)

### Phase 1 — 발행 준비 확인 (Pre-publish Check)

| 번호 | 확인 항목 | 조건 | 차단 여부 |
|------|-----------|------|-----------|
| 1-1 | `approval.decision === "approved"` | 필수 | **차단** |
| 1-2 | `data/draft/{week_id}.json` 존재 확인 | 필수 | **차단** |
| 1-3 | `manifest.draft_week_id`와 `approval.draft_week_id` 일치 확인 | 필수 | **차단** |
| 1-4 | draft picks의 `detail_report_id` 파일들이 존재하는지 확인 | 권장 | 경고만 (발행 허용) |
| 1-5 | `signal_review.review_completed === true` | 권장 | 경고만 (Fallback 허용) |
| 1-6 | draft picks 섹터 중복 없음 확인 | 권장 | 경고만 |
| 1-7 | overlap_history 기준 중복 티커 없음 확인 | 권장 | 경고만 |

> **원칙**: 1-1 ~ 1-3은 발행 차단 조건. 1-4 ~ 1-7은 권장 확인 사항이며 미충족 시 경고를 표시하되 발행을 막지 않는다.
> 뉴스 신호 검수 미완료는 발행 차단 조건이 아니다 — "수치 기반 발행은 항상 가능" 원칙.

---

### Phase 2 — 기존 Current 아카이브 처리

| 번호 | 작업 | 대상 | 비고 |
|------|------|------|------|
| 2-1 | 현재 `manifest.current_week_id` 값을 변수로 저장 | manifest.json 읽기 | 이후 archive 파일명으로 사용 |
| 2-2 | `data/current/current.json` → `data/archive/{current_week_id}.json` 복사 | 메인 리포트 | `archived_at` 필드 추가하여 저장 |
| 2-3 | `data/current/details/` 하위 파일들 → `data/archive/details/` 복사 | 상세 리포트 | 동일 파일명으로 복사 (아카이브는 flat 구조) |
| 2-4 | Phase 2 완료 마커 기록 (V1에서는 별도 파일 불필요 — git commit으로 대체) | — | 실패 시 rollback 기준점 |

> **주의**: `data/archive/details/`는 flat 구조다. 에디션별 하위 폴더가 없다. 동일 ticker가 다른 에디션에 등장하면 파일이 덮어씌워질 수 있다 → 현재 샘플에서는 에디션 간 ticker 중복 없으므로 V1에서는 허용. V1.1에서 에디션별 폴더 구조 검토 필요.

---

### Phase 3 — Draft를 Current로 전환

| 번호 | 작업 | 대상 | 비고 |
|------|------|------|------|
| 3-1 | `data/draft/{week_id}.json` → `data/current/current.json` 복사 | 메인 리포트 | `published_at` 필드를 실제 발행 시각으로 설정 |
| 3-2 | `data/draft/details/` 하위 파일들 → `data/current/details/` 복사 | 상세 리포트 | 기존 current/details 파일은 Phase 2에서 이미 archive됨 |
| 3-3 | 복사 완료 확인 | 필수 체크 | 파일 존재 여부 재확인 |

> **주의**: Phase 2가 완전히 완료된 후에만 Phase 3을 시작한다. Phase 2 실패 시 Phase 3 진행 금지.

---

### Phase 4 — Manifest 갱신

| 번호 | 갱신 항목 | 변경 내용 |
|------|-----------|-----------|
| 4-1 | `current_report_id` | 새 에디션 report_id |
| 4-2 | `current_week_id` | 새 에디션 week_id |
| 4-3 | `current_file_path` | `data/current/current.json` (고정) |
| 4-4 | `archive_week_ids[]` | 기존 current_week_id 추가 |
| 4-5 | `last_published_at` | 발행 시각 |
| 4-6 | `data_as_of` | 새 에디션의 data_as_of |
| 4-7 | `draft_report_id` / `draft_week_id` / `draft_file_path` | 다음 draft 준비 전까지 null 또는 비워둠 (확정 필요) |

---

### Phase 5 — Approval.json 초기화

발행이 완료된 후 다음 draft를 위해 approval.json을 초기화한다.

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

> **주의**: 발행 완료 후 즉시 초기화할지, 다음 draft가 준비된 후 초기화할지는 운영 방식에 따라 결정. V1 권장: 발행 완료 직후 초기화하되, 이전 approval 기록은 git history에 보존됨.

---

### Phase 6 — Overlap History 갱신

| 번호 | 작업 | 내용 |
|------|------|------|
| 6-1 | `admin/overlap_history.json`의 `recent_editions[]` 배열에 새 에디션 추가 | `week_id`, `published_at`, `main_picks[]` |
| 6-2 | 가장 오래된 에디션 제거 (최근 3개 유지) | 현재 설계: W11, W12, W13 보관 → W14 추가 시 W11 제거 |

> **overlap_history 갱신은 발행 차단 조건이 아니다.** 갱신 실패 시 경고만 기록하고 발행은 완료된 것으로 처리한다. 다음 draft 준비 전 수동 보완 가능.

---

### Phase 7 — 선택적 정리 (Optional Cleanup)

| 번호 | 작업 | V1 권장 여부 |
|------|------|-------------|
| 7-1 | `data/draft/{week_id}.json` 삭제 | 권장 — current 전환 후 불필요 |
| 7-2 | `data/draft/details/` 하위 파일 삭제 | 권장 |
| 7-3 | `data/news_signals/{week_id}/` 보존 | **보존 권장** — archive 에디션의 신호 이력 참조용 |

> **V1에서 draft 삭제는 모든 Phase 완료 확인 후에만 실행한다.** 삭제 전 git commit이 있으면 git에서 복원 가능하므로 risk 낮음.

---

## 3. 파일 간 전환 관계 요약

```
발행 전:
  manifest.current_week_id = "2026-W13"
  manifest.draft_week_id   = "2026-W14"
  approval.decision        = "approved"
  data/current/current.json        (W13 데이터)
  data/draft/2026-W14.json         (W14 데이터)

발행 후:
  manifest.current_week_id = "2026-W14"
  manifest.archive_week_ids = [..., "2026-W13"]  ← W13 추가
  approval.decision        = "pending"            ← 초기화
  data/current/current.json        (W14 데이터)   ← 교체
  data/archive/2026-W13.json       (W13 데이터)   ← 신규
  admin/overlap_history.json       (W14 이력 추가) ← 갱신
```

---

## 4. 발행 성공 조건

아래 조건이 모두 충족되어야 발행이 완료된 것으로 간주한다.

| 번호 | 조건 | 확인 방법 |
|------|------|-----------|
| S-1 | `data/current/current.json`이 새 에디션 데이터를 담고 있음 | `week_id` 필드 확인 |
| S-2 | `data/archive/{이전_week_id}.json`이 존재하고 `archived_at` 필드를 포함 | 파일 존재 + 필드 확인 |
| S-3 | `manifest.current_week_id`가 새 에디션 week_id와 일치 | manifest 읽기 |
| S-4 | `manifest.archive_week_ids[]`에 이전 week_id가 포함됨 | manifest 읽기 |
| S-5 | `approval.decision`이 "pending"으로 초기화됨 | approval 읽기 |
| S-6 | `admin/overlap_history.json`에 새 에디션 이력이 추가됨 | overlap_history 읽기 |

> S-6은 권장 확인 사항. S-1 ~ S-5가 충족되면 발행 완료로 처리한다.

---

## 5. 발행 실패 / 부분 실패 케이스별 Fallback 원칙

### Case 1: approval이 approved인데 current 전환 실패

**상황**: Phase 3 실행 중 오류. `data/current/current.json`이 갱신되지 않음.

**원칙**:
- **중단 후 수동 복구**. Phase 2(아카이브)가 완료됐다면 `data/archive/{이전_week_id}.json`은 이미 존재.
- `data/current/current.json`은 이전 상태가 유지 → 기존 current가 계속 서비스됨.
- draft 파일은 그대로 존재 → Phase 3을 재시도 가능.
- approval.decision은 "approved" 상태 유지 → Phase 1을 다시 통과할 수 있음.
- **사용자 서비스 중단 없음.**

**복구 절차**:
1. Phase 2가 완료됐는지 확인 (archive 파일 존재 확인)
2. Phase 3(current 교체)만 재시도
3. 완료 후 Phase 4~6 이어서 진행

---

### Case 2: current 갱신은 됐는데 archive 반영 누락

**상황**: Phase 3은 완료. Phase 2(아카이브 복사)가 실패하거나 누락됨.

**원칙**:
- **위험 상황 — 이전 current 데이터가 소실될 수 있음.**
- V1에서는 git history에서 이전 `current.json` 복원 가능.
- 즉시 git history에서 이전 current 파일을 수동으로 복원하여 `data/archive/{이전_week_id}.json`으로 저장.
- manifest의 `archive_week_ids`에 수동으로 추가.

**예방 원칙**: Phase 2 완료 확인 전 Phase 3 진행 금지. Phase 간 순서 의존성을 명시적으로 지킨다.

---

### Case 3: overlap_history만 갱신 누락

**상황**: Phase 6 실패. S-1 ~ S-5는 모두 충족.

**원칙**:
- **발행 자체는 성공**으로 처리.
- `admin/overlap_history.json`을 수동으로 갱신.
- 다음 draft 준비 시(중복 검사 시) 누락이 발견되면 해당 시점에 보완 가능.
- 서비스 중단 없음. 중복 검사만 부정확해질 수 있음.

---

### Case 4: manifest 갱신 실패

**상황**: Phase 4 실패. `manifest.current_week_id`가 구 에디션을 가리키고 있음.

**원칙**:
- `data/current/current.json`은 새 에디션 데이터지만 manifest는 이전 상태.
- 화면은 new current를 직접 읽으므로 홈 화면은 정상 동작할 수 있음.
- 단 archive 목록, admin 화면 등 manifest에 의존하는 기능이 오동작할 수 있음.
- **즉시 manifest 수동 갱신 필요.**

---

### Case 5: signal_review 요약 상태와 approval 상태 엇갈린 경우

**상황**: `signal_review.review_completed = false`이지만 `approval.decision = "approved"`.

**원칙**:
- **이는 정상 허용 상태다.** V1 운영 원칙 — "뉴스가 부족해도 수치 기반 발행 가능".
- signal_review 미완료는 발행 차단 조건이 아님.
- `approval.notes`에 신호 검수 미완료 사유를 기록하는 것을 권장.
- 이후 신호 검수 결과를 소급 보완할 수 있음 (발행된 데이터에는 영향 없음).

---

### Case 6: approval.json 초기화 실패 (Phase 5 실패)

**상황**: 발행 완료 후 approval.json이 초기화되지 않아 `decision = "approved"` 상태가 남아 있음.

**원칙**:
- 서비스 동작에 즉각 영향 없음.
- 단 다음 draft 준비 시 approval 상태가 혼동을 줄 수 있음.
- 발견 즉시 수동으로 초기화.
- **V1에서는 발행 직후 approval.json 초기화를 발행 완료 체크리스트에 포함한다.**

---

## 6. Rollback 전략

### Rollback 가능 여부

| Phase | 실패 시 rollback 가능 여부 | 복원 방법 |
|-------|---------------------------|-----------|
| Phase 1 (사전 확인) | 해당 없음 — 파일 변경 없음 | — |
| Phase 2 (archive 복사) | 가능 | archive 파일 삭제. git revert 가능 |
| Phase 3 (current 교체) | **어려움** | git에서 이전 current.json 복원 필요 |
| Phase 4 (manifest 갱신) | 가능 | manifest 이전 상태 복원 (git revert) |
| Phase 5 (approval 초기화) | 가능 | approval.json 수동 복원 |
| Phase 6 (overlap_history 갱신) | 가능 | overlap_history 수동 수정 |

### V1 Rollback 원칙

1. **git이 최후의 안전망이다.** 각 Phase를 별도 git commit으로 처리하면 Phase 단위 rollback 가능.
2. **Phase 3(current 교체) 전이 롤백의 마지노선이다.** Phase 3 이후에는 이전 current 상태 복원이 어렵다.
3. **Phase 2 완료 전 Phase 3을 절대 시작하지 않는다.**
4. **발행 전 현재 상태 스냅샷을 보장하는 수단 = git commit.** 발행 실행 직전 git commit이 있어야 한다.

### V1 권장 발행 실행 방식 (Git 기반)
```
발행 실행 전:
  git status 확인 (uncommitted 파일 없음 확인)

발행 실행 (Phase 2 ~ Phase 6을 순서대로 수동/스크립트):
  Phase 2 완료 → git commit "archive W13"
  Phase 3 완료 → git commit "publish W14 as current"
  Phase 4 완료 → git commit "update manifest"
  Phase 5 완료 → git commit "reset approval"
  Phase 6 완료 → git commit "update overlap_history"

실패 시:
  git log로 직전 commit 확인
  git revert 또는 git checkout {commit} -- {파일} 로 복원
```

> V1에서 각 Phase를 별도 commit으로 나누면 단계별 복원이 가능하다. 단 최종적으로는 하나의 "발행 완료" commit으로 squash해도 무방.

---

## 7. V1 권장 전환 전략

### 권장: 수동 스크립트 기반 + Git Commit 단위 관리

**이 방식이 V1에 적합한 이유:**
- 런타임 파일 이동/쓰기 없이 로컬에서 안전하게 실행 가능
- 각 Phase를 git commit으로 기록 → 감사 추적 + 단계별 rollback 가능
- 배포 환경(Vercel 등) 파일시스템 제약 없음
- 실수 시 git revert로 즉시 복원 가능
- 발행 빈도가 격주 수준이므로 수동 실행 부담 없음

**구현 방향 (V1 구현 단계에서 결정):**
- 단순 shell script 또는 Node.js 스크립트로 Phase 2~6 순서 실행
- 각 Phase 완료 후 git commit 자동 생성
- V1 목표: 스크립트 한 번 실행으로 Phase 1~6 완료

---

## 8. V1에서 Read-only 구조를 유지해야 하는 이유

현재 단계에서 write 구현 없이 read-only만 운영하는 이유:

1. **배포 환경 확정 전**: 런타임 write가 가능한 환경인지 미확정. Vercel 서버리스면 런타임 write 불가.
2. **발행 전환 절차 미확정**: Phase 순서와 실패 시 fallback 원칙이 이 문서를 통해 처음 명시됨. 절차 확정 전 write 구현 시 부분 실패 케이스 미대응.
3. **인증 미구현**: write API는 반드시 인증 후 접근 가능해야 함. 인증 없는 write 경로는 보안 위험.
4. **테스트 기반 없음**: 발행 전환은 파일 이동/교체가 포함된 복잡한 작업. 테스트 없이 구현하면 데이터 손실 위험.

**결론**: read-only → write 전략 확정 → 인증 설계 → write 구현 순서가 올바른 순서다.

---

## 9. V1에서 지양하고 V1.1/V2로 미룰 전략

| 전략 | 이유 | 미루는 시점 |
|------|------|-------------|
| 런타임 자동 발행 (approval 저장 즉시 current 전환) | 원자성 보장 어려움. V1 복잡도 초과 | V1.1+ |
| archive/details 에디션별 폴더 구조 | 현재 flat 구조에서 변경 시 기존 경로 파괴 | V1.1 |
| 발행 전환 API endpoint | 런타임 파일 이동 = 서버리스 불가 + 원자성 문제 | V1.1 (자체 서버 확정 시) |
| 발행 미리보기/롤백 UI | 기능 범위 초과 | V2 |
| 에디션 간 detail ticker 충돌 자동 방지 | flat archive 구조 변경 필요 | V1.1 |
| 발행 이력 DB 저장 | 외부 DB 도입 = V1 원칙 위배 | V2 |

---

## 10. 아직 최종 확정이 필요한 항목

| 항목 | 현재 상태 | 확정 필요 이유 |
|------|-----------|----------------|
| 발행 스크립트 실행 환경 | 미정 | 로컬 실행 vs 서버 실행 vs GitHub Actions |
| `approval.json` 초기화 시점 | 미정 | 발행 완료 즉시 vs 다음 draft 파일 생성 시 |
| `manifest.json`의 draft 필드 초기화 방식 | 미정 | 발행 후 null 처리 vs 다음 draft 생성 전까지 유지 |
| Phase 간 git commit 단위 | 미정 | Phase별 별도 commit vs 발행 완료 후 하나의 commit |
| `data/draft/` 파일 삭제 시점 | 미정 | 발행 완료 직후 vs 다음 발행 직전 |
| 동일 ticker archive 충돌 정책 | 미정 | flat 구조에서 동일 ticker가 archive에 이미 있을 경우 덮어쓰기 허용 여부 |
| `published_at` 필드 설정 주체 | 미정 | 스크립트가 자동으로 현재 시각 설정 vs 관리자가 명시 |

---

## Self-check before implementation

### 이번 문서에서 권장 발행 전환 전략으로 제시한 것
- **수동 스크립트 기반 + Git Commit 단위 관리**: Phase 2~6을 순서대로 실행하고 각 Phase를 git commit으로 기록. 실패 시 git revert로 복원.
- Phase 순서 의존성 명시: Phase 2 완료 전 Phase 3 금지.
- Fallback 원칙 6개 케이스 정의.

### V1에서 아직 구현하지 않기로 둔 것
- 런타임 발행 전환 API
- 자동 approval 감지 → 자동 current 전환
- archive/details 에디션별 폴더 구조 변경
- 발행 미리보기/rollback UI
- 발행 이력 DB 저장

### 구현 전에 사용자가 최종 판단해야 하는 항목
- 발행 스크립트 실행 환경 (로컬 vs GitHub Actions vs 서버)
- approval.json 초기화 시점
- manifest draft 필드 초기화 방식
- Phase별 commit 단위 vs 단일 commit 방식
- draft 파일 삭제 시점

### manifest / approval / overlap_history / current / archive 경계를 어떻게 유지했는지
- **manifest.json**: 파일 경로 인덱스 역할. 전환 후 새 current/archive 정보 반영. 직접 상태 저장 안 함.
- **approval.json**: 에디션 최종 발행 결정만 담음. 전환 완료 후 초기화. 발행 절차 자체를 제어하지 않음.
- **signal_review.json**: 신호 검수 결과만 담음. 발행 전환 절차에 포함되지 않음. 뉴스 신호 파일은 `data/news_signals/{week_id}/`에서 보존.
- **overlap_history.json**: 발행 완료 후 별도 Phase(Phase 6)에서 갱신. 발행 차단 조건이 아님.
- **current.json / archive.json**: 파일 위치로 상태 결정. 이동=전환.

### 내가 임의로 구현하거나 기존 구조를 바꾸지 않은 것
- 실제 파일 이동/복사 코드 없음
- 실제 API route 없음
- 기존 JSON 파일 구조 변경 없음
- 기존 UI 수정 없음
- build/dev 실행 없음
- background command 없음

### 현재 운영 원칙 점검
| 원칙 | 점검 결과 |
|------|-----------|
| V1은 자동 수집 중심 | 발행 전환 절차는 수동이지만 수집 자동화와 독립적. 충돌 없음 |
| 사람은 최종 승인만 판단 | Phase 1의 approval.decision 확인이 사람 개입의 전부. 이후는 스크립트 자동 처리 |
| 뉴스는 보완 신호 | signal_review 미완료가 발행 차단 조건이 아님 (Case 5 명시) |
| 뉴스 부족해도 발행 가능 | Phase 1의 1-5(signal_review) 조건을 "권장/경고"로 분류 |
| approval = 에디션 게이트 | Phase 1에서 approval.decision === "approved" 확인이 유일한 차단 조건 |
| signal_review = 검수 결과 | signal_review는 발행 전환 절차에서 참고만. 전환 실행에 직접 관여하지 않음 |
| V1은 파일 기반 운영 | 전환 = 파일 복사/이동. DB 없음. manifest가 인덱스 역할 |
| current/draft/archive 구조 유지 | Phase 2~3을 통해 기존 구조 그대로 유지 |

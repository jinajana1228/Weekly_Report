# V1 리허설 런북 (Rehearsal Runbook)

> **문서 목적**: 실제 운영 전에 운영자가 CLI 흐름을 안전하게 리허설할 수 있도록 단계별 절차, 기대 결과, 이상 상황 대응을 정리한다.
> **기준 샘플**: `week_id = 2026-W14`, `actor = jina`
> **관련 문서**: `V1_OPERATION_CHECKLIST.md` (체크리스트)

---

## 리허설과 실제 운영의 차이

| 구분 | 리허설 | 실제 운영 |
|------|--------|-----------|
| 목적 | CLI 흐름 숙지, 기대 결과 확인 | 실제 에디션 발행 |
| approval write actual | **수행 가능** (approval.json만 변경) | 동일 |
| publish | **dry-run만 수행** | dry-run 후 actual 수행 |
| git commit | **--skip-git으로 생략** | 실행 (또는 수동) |
| 복구 방법 | git restore . 또는 git checkout HEAD -- 파일 | 동일 |

> **리허설의 핵심 제약**: publish actual은 리허설 시 실행하지 않는다. `--dry-run`으로 예정 결과만 확인한다.
> 리허설에서 approval write actual은 수행 가능하지만, 리허설 후 반드시 `approval.json`을 원래 상태로 복구한다.

---

## 전제 조건 확인 (리허설 시작 전)

리허설을 시작하기 전에 아래 파일 상태를 확인한다.

```
[ ] data/manifests/approval.json 존재
    → "draft_week_id": "2026-W14"
    → "decision": "pending"

[ ] data/draft/2026-W14.json 존재

[ ] data/draft/details/ 에 5개 파일 존재
    → stock_035420.json
    → stock_373220.json
    → stock_267260.json
    → stock_036460.json
    → etf_232080.json

[ ] data/manifests/manifest.json 의 draft_week_id === "2026-W14"

[ ] data/current/current.json 존재

[ ] data/archive/2026-W14.json 미존재 (있으면 BLOCKER)
```

---

## PHASE R-1: approval write dry-run

### 목적
approval write CLI가 올바르게 동작하는지 확인한다. 실제 파일 변경 없이 예정 변경 내용을 출력한다.

### 실행 예시

```bash
npm run approval:write -- \
  --decision approved \
  --reviewed-by jina \
  --week-id 2026-W14 \
  --dry-run
```

또는 메모 포함:

```bash
npm run approval:write -- \
  --decision approved \
  --reviewed-by jina \
  --week-id 2026-W14 \
  --note "W14 리허설 검수" \
  --dry-run
```

### 기대 결과

```
╔══════════════════════════════════════════════════════════╗
║  APPROVE: 2026-W14                                       ║
║  actor  : jina                                           ║
╚══════════════════════════════════════════════════════════╝

  상태: 🔍 DRY-RUN (변경 없음)

[변경 필드 (CHANGED FIELDS)]
  decision: "pending" → "approved"
  reviewed_by: null → "jina"
  reviewed_at: null → "20XX-XX-XXTXX:XX:XX.XXXZ"

[역할 구분 안내]
  decision                : "approved" — 발행 게이트 (유일한 차단 조건)
  news_signal_review_status: "PARTIAL" — 참고 정보 전용 (발행 차단 조건 아님)

  ※ dry-run 결과입니다. --dry-run 플래그를 제거하면 실제 파일이 수정됩니다.
```

### 확인 포인트

```
[ ] R-1-1. 상태가 "🔍 DRY-RUN (변경 없음)"인가?
[ ] R-1-2. [오류 (ERRORS)] 섹션이 없거나 비어있는가?
[ ] R-1-3. decision: "pending" → "approved" 변경 예정이 보이는가?
[ ] R-1-4. news_signal_review_status가 "참고 정보 전용"으로 표시되는가?
[ ] R-1-5. data/manifests/approval.json을 확인하면 변경이 없는가?
           (dry-run이므로 decision은 여전히 "pending"이어야 함)
```

### 이상 상황 및 중단 지점

| 이상 상황 | 원인 | 조치 |
|-----------|------|------|
| `[오류] --decision 인자가 필요합니다` | --decision 누락 | 인자 추가 후 재시도 |
| `[오류] --week-id 불일치` | approval.json의 draft_week_id ≠ 2026-W14 | approval.json 확인 |
| `[오류] approval.json 파일이 없습니다` | 파일 경로 오류 | data/manifests/ 디렉터리 확인 |
| `[오류] 허용되지 않은 decision 값` | decision 값 오타 | approved/rejected/on_hold/pending 중 선택 |

---

## PHASE R-2: approval write actual

### 목적
R-1 dry-run 결과 이상 없음을 확인한 후 실제로 approval.json을 갱신한다.

> **리허설 주의**: 이 단계를 실행하면 `approval.json`이 실제로 변경된다. 리허설 후 원래 상태로 복구 필요.

### 실행 예시

```bash
npm run approval:write -- \
  --decision approved \
  --reviewed-by jina \
  --week-id 2026-W14
```

### 기대 결과

```
  상태: ✅ WRITTEN

[변경 필드 (CHANGED FIELDS)]
  decision: "pending" → "approved"
  reviewed_by: null → "jina"
  reviewed_at: null → "20XX-XX-XXTXX:XX:XX.XXXZ"

  ✓ data/manifests/approval.json 갱신 완료
  ✓ manifest.json / draft / current / archive / signal_review 수정 없음
```

### 확인 포인트

```
[ ] R-2-1. 출력 상태가 "✅ WRITTEN"인가?

[ ] R-2-2. data/manifests/approval.json을 직접 열어 확인:
           - "decision": "approved"
           - "reviewed_by": "jina"
           - "reviewed_at": "20XX-..." (ISO 8601)
           - "draft_report_id": 기존 값 유지
           - "draft_week_id": "2026-W14" 유지
           - "notes": 기존 값(null) 유지
           - "news_signal_review_status": 기존 값("PARTIAL") 유지

[ ] R-2-3. data/manifests/manifest.json이 변경되지 않았는가?
[ ] R-2-4. data/draft/2026-W14.json이 변경되지 않았는가?
```

### 이상 상황 및 중단 지점

| 이상 상황 | 원인 | 조치 |
|-----------|------|------|
| 상태가 WRITTEN이 아닌 BLOCKED | 검증 오류 | 오류 메시지 확인 후 해소 |
| approval.json이 변경됐으나 값이 의도와 다름 | 인자 오타 | git restore data/manifests/approval.json 복구 후 재시도 |

### 리허설 후 복구 (리허설에서만 필요)

```bash
# approval.json을 이전 상태(decision: pending)로 복구
git checkout HEAD -- data/manifests/approval.json
```

---

## PHASE R-3: publish dry-run

### 목적
publish CLI의 pre-check 검증과 예정 파일 변경 내용을 확인한다. 실제 파일 변경 없음.

> **중요**: R-2에서 approval write actual을 실행하지 않았다면 (또는 복구했다면) approval.json을 다시 approved 상태로 만들어야 이 단계가 READY를 반환한다.

### 실행 예시

```bash
npm run publish -- \
  --week-id 2026-W14 \
  --actor jina \
  --dry-run
```

### 기대 결과

```
╔══════════════════════════════════════════════════════════════╗
║  DRY-RUN: 2026-W14                                          ║
║  actor  : jina                                              ║
╚══════════════════════════════════════════════════════════════╝

[Phase 0] pre-check

[차단 조건 (BLOCKERS)]
  (없음)

[경고 (WARNINGS)] — 발행 차단 아님
  ⚠  signal_review.json 없음 (...) — 발행 차단 조건 아님.

[DRY-RUN] 예정 파일 변경 (실제 수정 없음)
  [Phase A] current/current.json → archive/2026-W13.json (archived_at 추가)
  [Phase A]   [DRY] WRITE data/archive/2026-W13.json
  [Phase A]     archived_at: null → "20XX-XX-XXTXX:XX:XX.XXXZ"
  [Phase B] [DRY] COPY data/current/details/etf_360750.json → data/archive/details/etf_360750.json
  ...
  [Phase C] draft/2026-W14.json → current/current.json (published_at 설정, draft_note 제거)
  [Phase C]   [DRY] WRITE data/current/current.json
  [Phase C]     published_at: null → "20XX-XX-XXTXX:XX:XX.XXXZ"
  [Phase C]     draft_note  : "[예시] 2026-W14 초안. NAVER TECH 섹터..." → (제거)
  [Phase D] [DRY] COPY data/draft/details/stock_035420.json → data/current/details/stock_035420.json
  ...
  [Phase E] [DRY] UPDATE manifest.json
    current_week_id  : 2026-W13 → 2026-W14
    draft_week_id    : 2026-W14 → null
    archive_week_ids : [..., "2026-W13"]
  [Phase F] [DRY] UPDATE overlap_history.json
  [Phase G] [DRY] RESET approval.json
    decision: "approved" → "pending"
    ...
  [Phase H] [DRY] DELETE data/draft/2026-W14.json
  [Phase I] [DRY] COMMIT "publish: 2026-W14 (actor: jina)"

[DRY-RUN COMPLETE]
  blockers : 0
  warnings : 1 (또는 경고 수)
  ※ 실제 파일 변경 없음.
```

### 확인 포인트

```
[ ] R-3-1. [차단 조건 (BLOCKERS)] 섹션이 "(없음)"인가?
           BLOCKER가 있으면 → 즉시 중단 (R-3 중단)

[ ] R-3-2. signal_review 관련 경고가 있다면:
           "발행 차단 조건 아님" 문구를 확인. 인지 후 계속.

[ ] R-3-3. archive/details 충돌 경고가 있다면:
           어떤 파일이 덮어써지는지 확인. 인지 후 계속.

[ ] R-3-4. Phase A: current → archive/{currentWeekId} 복사 예정 확인
[ ] R-3-5. Phase C: draft/2026-W14.json → current/current.json 복사 예정 확인
[ ] R-3-6. Phase E: manifest current_week_id 2026-W13 → 2026-W14 변경 예정 확인
[ ] R-3-7. Phase G: approval.json decision "approved" → "pending" 초기화 예정 확인
[ ] R-3-8. 최종 "DRY-RUN COMPLETE" 출력 확인

[ ] R-3-9. 실제 파일이 변경됐는가? (변경되면 안 됨)
           git status로 확인: 변경 사항 없어야 함
```

### signal_review 경고 처리 판단 기준

```
경고 예시:
  "signal_review.json 없음. 뉴스 신호 검수 없이 발행됩니다. — 발행 차단 조건 아님."

판단 기준:
  → 운영 원칙 §3, §4, §7 기준: 뉴스 부족해도 수치 기반 발행 가능.
  → 인지 후 계속 진행. publish actual로 넘어간다.
  → signal_review 때문에 publish를 중단하지 않는다.
```

### 이상 상황 및 중단 지점

| 이상 상황 | 원인 | 조치 |
|-----------|------|------|
| BLOCKER: decision !== approved | approval write 미실행 또는 복구됨 | R-2 approval write 재실행 |
| BLOCKER: draft_week_id 불일치 | manifest 또는 approval의 week_id 오류 | 해당 파일 확인 |
| BLOCKER: archive/{currentWeekId}.json 이미 존재 | 중복 발행 시도 | 기존 archive 파일 확인 후 중단 |
| BLOCKER: current.json 없음 | current 파일 경로 오류 | data/current/ 디렉터리 확인 |

---

## PHASE R-4: publish actual (실제 운영 시)

> **리허설에서는 이 단계를 실행하지 않는다.**
> R-3 dry-run으로 흐름을 확인하는 것으로 리허설은 완료된다.

### 실제 운영 시 실행 예시

```bash
# 기본 (draft 정리 + git commit 자동)
npm run publish -- \
  --week-id 2026-W14 \
  --actor jina

# draft 보존 + git 수동 커밋
npm run publish -- \
  --week-id 2026-W14 \
  --actor jina \
  --keep-draft \
  --skip-git
```

### 기대 결과

```
[PUBLISH COMPLETE]
  week_id        : 2026-W14
  actor          : jina
  published_at   : 20XX-XX-XXTXX:XX:XX.XXXZ
  archived       : 2026-W13
  keep-draft     : false
  git-commit     : true

  ✓ 발행 완료.
```

### publish actual 후 확인 항목 (실제 운영 시)

```
[ ] R-4-1. data/current/current.json → report_id, week_id = 2026-W14 기준인가?
           published_at이 null이 아닌 ISO 8601 값으로 채워져 있는가?
           draft_note 필드가 존재하지 않는가?

[ ] R-4-2. data/archive/2026-W13.json → 신규 생성됐는가?
           archived_at이 이번 publish 시각으로 채워져 있는가?
           published_at은 이전 발행 시각(W13 원본)으로 유지됐는가?

[ ] R-4-3. data/current/details/ → draft/details의 5개 파일로 교체됐는가?
           stock_035420, stock_373220, stock_267260, stock_036460, etf_232080

[ ] R-4-4. data/archive/details/ → 이전 current/details 파일이 복사됐는가?

[ ] R-4-5. data/manifests/manifest.json 확인:
           - current_week_id: "2026-W14"
           - draft_week_id: null
           - archive_week_ids: ["2026-W12", "2026-W13"] (기존 + 방금 archive된 W13)
           - last_published_at: 현재 시각

[ ] R-4-6. data/manifests/approval.json 확인:
           - decision: "pending"
           - reviewed_by: null
           - reviewed_at: null
           - news_signal_review_status: null

[ ] R-4-7. admin/overlap_history.json 확인:
           - recent_editions[0]: { week_id: "2026-W14", main_picks: [...] }
           - 최대 3개 유지

[ ] R-4-8. (--keep-draft 없을 때) data/draft/2026-W14.json 삭제됐는가?

[ ] R-4-9. (--skip-git 없을 때) git log 최신 commit:
           "publish: 2026-W14 (actor: jina)"
```

---

## keep-draft / skip-git 옵션 사용 시기

### `--keep-draft`

| 상황 | 권장 여부 | 이유 |
|------|-----------|------|
| 발행 후 draft를 검토하거나 백업 목적 | 사용 | draft 파일이 삭제되지 않고 보존됨 |
| 다음 에디션과 혼선이 없는 경우 | 미사용 (기본) | draft 파일이 자동 정리됨 |
| 리허설 (dry-run only) | 해당 없음 | dry-run은 어떤 파일도 변경하지 않음 |

> 주의: `--keep-draft`로 draft 파일을 보존하면, 다음 에디션 준비 시 이전 draft 파일이 남아 혼선을 줄 수 있다. 보존 후 수동 정리 필요.

### `--skip-git`

| 상황 | 권장 여부 | 이유 |
|------|-----------|------|
| CI/CD 파이프라인에서 별도 commit 단계가 있을 때 | 사용 | 중복 commit 방지 |
| 여러 변경을 묶어 하나의 commit으로 처리할 때 | 사용 | 수동 commit으로 메시지 직접 제어 |
| 일반 로컬 운영 | 미사용 (기본) | 자동 commit으로 이력 즉시 기록 |

> 주의: `--skip-git` 사용 후 반드시 수동으로 `git add -A && git commit`을 실행해야 한다.

---

## 리허설 완료 후 원상 복구 절차

리허설 중 실행한 approval write actual이 있었다면 아래 복구 절차를 따른다.

```bash
# approval.json만 원래 상태로 복구
git checkout HEAD -- data/manifests/approval.json

# 확인
cat data/manifests/approval.json
# "decision": "pending" 이어야 함
```

다른 파일은 dry-run만 실행했으므로 복구 불필요.

---

## 운영 중단 기준 요약

### 절대 중단해야 하는 경우 (BLOCKER)

```
✗ approval.json 없음
✗ approval.draft_week_id ≠ --week-id
✗ approval.decision ≠ "approved"
✗ data/draft/{week_id}.json 없음
✗ manifest.json 없음 또는 draft_week_id 불일치
✗ data/current/current.json 없음
✗ data/archive/{currentWeekId}.json 이미 존재
✗ publish 실행 중 Phase에서 예외 발생 (오류 출력 후 자동 중단)
```

위 상황에서 스크립트는 `process.exit(1)` 또는 `process.exit(2)`로 자동 중단된다. 수동 개입 필요.

### 경고 확인 후 계속 진행 가능한 경우 (WARNING)

```
⚠  signal_review.json 없음 → 인지 후 진행 (차단 아님)
⚠  signal_review.review_completed === false → 인지 후 진행
⚠  draft detail 커버리지 부족 → 인지 후 진행
⚠  linked_signal_ids 매핑 불일치 → 인지 후 진행
⚠  overlap_history 중복 ticker → 의도 확인 후 진행
⚠  archive/details 동일 파일명 → 덮어쓰기 허용. 인지 후 진행
```

> **archive detail 충돌에 대해**: V1 운영 원칙 §8에 따라 이 경고 단독으로는 publish를 중단하지 않는다.

---

## 전체 리허설 흐름 요약

```
[리허설 시작]
  │
  ▼
[R-1] approval write --dry-run
  ├─ ERRORS 있음 → 중단, 원인 해소
  └─ ERRORS 없음 → R-2 진행
  │
  ▼
[R-2] approval write actual (리허설 선택)
  ├─ WRITTEN 확인
  └─ approval.json 변경 내용 검증
  │  (리허설 후 git checkout HEAD -- data/manifests/approval.json 복구)
  │
  ▼
[R-3] publish --dry-run
  ├─ BLOCKER 있음 → 즉시 중단, 원인 해소
  ├─ WARNING 있음 → 내용 인지 후 계속
  └─ READY → 기대 파일 변경 내용 확인
  │
  ▼
[리허설 완료]
  (publish actual은 실제 운영 시에만 수행)
  │
  ▼
[실제 운영 시]
[R-4] publish actual
  └─ 발행 후 7개 파일 상태 확인 (V1_OPERATION_CHECKLIST.md STEP 7)
```

---

## 이번 단계에서 의도적으로 하지 않은 것

| 항목 | 이유 |
|------|------|
| publish actual 리허설 실행 | 문서화 단계. 실제 파일 변경 금지 |
| approval write actual 자동 실행 | 운영자가 직접 판단하여 실행해야 함 |
| signal_review 파일 생성/수정 | 수집 스크립트 담당 영역 |
| 샘플 JSON 수정 | 문서화 단계. 수정 금지 |
| 새로운 CLI 기능 구현 | 이번 단계 범위 밖 |
| git commit/push | 문서화 단계. 실행 금지 |
| 자동 롤백 구현 | V1 범위 밖. git 수동 복구로 대체 |

---

## Self-check before operation

### 이 런북에서 정리한 운영 점검 포인트 / 리허설 절차
- R-1 ~ R-4의 4단계로 전체 흐름 구성
- 각 단계별 실행 명령 예시, 기대 결과 출력, 확인 포인트 체크리스트 포함
- R-3(publish dry-run) 결과에서 Phase별 예정 변경 내용을 운영자가 직접 대조하도록 구성

### 절대 중단 항목과 경고 확인 항목을 어떻게 구분했는지
- "운영 중단 기준 요약" 섹션에서 두 유형을 명시적으로 분리
- BLOCKER: ✗ 기호. 스크립트가 자동 중단. 해소 전 진행 불가.
- WARNING: ⚠ 기호. 스크립트가 계속 진행. 운영자가 내용 인지 후 진행 여부 판단.
- signal_review와 archive detail 충돌에 대해 "중단하지 않는다"는 표현을 명시

### approval / signal_review / manifest / overlap_history / archive details 경계
- approval: R-1~R-2에서만 다룸. 발행 게이트로만 취급.
- signal_review: R-3 경고 처리 판단 기준에서만 언급. 차단 아님 명시.
- manifest: R-3 예정 변경과 R-4 확인 항목에서 인덱스 역할로만 다룸.
- overlap_history: R-4 확인 항목에서 추천 이력으로만 다룸.
- archive details: R-3 경고 처리에서 덮어쓰기 허용 원칙 명시.

### 운영자가 최소 개입으로 따라갈 수 있게 어떻게 정리했는지
- 각 단계를 R-번호로 명확히 구분
- 실행 명령은 복사하여 바로 사용할 수 있는 형태로 제공
- 기대 결과를 실제 출력과 유사한 형태로 표현
- 이상 상황 테이블에서 원인과 조치를 1:1로 매핑
- 전체 흐름 다이어그램으로 리허설 구조를 한눈에 파악 가능하게 구성

### 내가 임의로 실행하거나 구조를 바꾸지 않은 것
- 코드 수정 없음
- 실제 approval write 실행 없음
- 실제 publish 실행 없음
- 실제 git commit/push 없음
- JSON 샘플 수정 없음
- 구조 재설계 없음
- background command 실행 없음

### 현재 운영 원칙에 위배되지 않는지 점검한 항목
- §3 뉴스는 보완 신호: signal_review 경고를 WARNING으로만 기재. "발행 차단 조건 아님" 명시 ✓
- §4 뉴스 부족해도 수치 기반 발행 가능: signal_review 없어도 진행 안내 ✓
- §5 approval = 발행 게이트: BLOCKER B3(decision !== approved)만 차단 조건 ✓
- §7 signal_review = 참고 입력: WARNING으로만 분류. 중단 권고 없음 ✓
- §8 archive detail 덮어쓰기 허용: WARNING 확인 후 진행 안내. 중단 권고 없음 ✓
- §10 실제 실행 아님: 문서 작성만 수행. 실제 파일 변경 없음 ✓

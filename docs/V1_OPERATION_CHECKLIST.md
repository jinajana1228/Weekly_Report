# V1 운영 체크리스트 (Operation Checklist)

> **문서 목적**: approval write → publish dry-run → publish actual 흐름에서 운영자가 각 단계별로 확인해야 할 항목을 정리한다.
> **대상**: 실제 발행을 수행하는 운영자
> **관련 문서**: `V1_REHEARSAL_RUNBOOK.md` (단계별 리허설 절차)

---

## 핵심 원칙 (체크리스트 전 필독)

| 원칙 | 내용 |
|------|------|
| 발행 게이트 | `approval.decision === "approved"` 만이 차단 조건이다 |
| signal_review 역할 | 참고 입력. 발행을 차단하지 않는다 |
| archive detail 충돌 | 경고만 출력. 덮어쓰기 허용. 중단 조건 아님 |
| dry-run 우선 | 모든 실제 실행 전에 dry-run으로 먼저 확인한다 |
| 자동 롤백 없음 | publish 실패 시 git으로 수동 복구한다 |

---

## 차단 항목 vs 경고 항목 구분

### 절대 중단 (BLOCKER) — 해소 전 진행 불가

| # | 항목 | 관련 단계 |
|---|------|-----------|
| B1 | `approval.json` 파일이 없음 | approval write, publish |
| B2 | `approval.draft_week_id` ≠ `--week-id` | approval write, publish |
| B3 | `approval.decision` ≠ `"approved"` | publish |
| B4 | `data/draft/{week_id}.json` 없음 | publish |
| B5 | `manifest.json` 없음 또는 `draft_week_id` 불일치 | publish |
| B6 | `data/current/current.json` 없음 | publish |
| B7 | `manifest.current_file_path`가 가리키는 파일 없음 | publish |
| B8 | `data/archive/{currentWeekId}.json` 이미 존재 | publish |

### 경고 확인 후 진행 가능 (WARNING) — 중단 조건 아님

| # | 항목 | 이유 |
|---|------|------|
| W1 | `signal_review.json` 없음 | 뉴스 신호는 보완 입력. 차단 조건 아님 (운영 원칙 §7) |
| W2 | `signal_review.review_completed === false` | 미완료 신호 검수. 수치 기반 발행 가능 (운영 원칙 §4) |
| W3 | draft detail 파일 커버리지 부족 | 일부 종목 상세 없이 발행 가능. 사전 인지 필요 |
| W4 | `linked_signal_ids` 매핑 불일치 | 참고 검증. 차단 아님 |
| W5 | overlap_history 중복 ticker | 의도적 연속 추천일 수 있음. 확인 후 진행 |
| W6 | `archive/details` 동일 파일명 존재 | 덮어쓰기 허용 (운영 원칙 §8). 중단 조건 아님 |

> **운영자 주의**: W6(archive detail 충돌)은 V1 정책상 의도된 허용 사항이다. 이 경고만으로 publish를 중단하지 않는다.

---

## STEP 1: approval write 전 체크

### 확인할 파일
- `data/manifests/approval.json`
- `data/draft/{week_id}.json` (draft 존재 여부)

### 체크 항목

```
[ ] 1-1. approval.json 파일이 존재하는가?
         경로: data/manifests/approval.json

[ ] 1-2. approval.json의 draft_week_id가 발행 예정 week_id와 일치하는가?
         예: "draft_week_id": "2026-W14"

[ ] 1-3. 현재 approval.decision 값이 무엇인가?
         기대값: "pending" (아직 검수 전)
         비고: "approved"가 이미 있으면 재검수인지 확인

[ ] 1-4. draft 메인 파일이 존재하는가?
         경로: data/draft/{week_id}.json

[ ] 1-5. draft의 picks, report_id, data_as_of가 올바른지 확인했는가?
         (approval write는 draft 내용을 바꾸지 않음. 내용 오류는 이 시점에 확인)

[ ] 1-6. --dry-run 없이 approval write를 실행하기 전에
         반드시 --dry-run 결과를 먼저 확인했는가?
```

---

## STEP 2: approval write 실행 (dry-run)

```bash
# 권장 명령
npm run approval:write -- --decision approved --reviewed-by {이름} --week-id {week_id} --dry-run
```

### dry-run 결과에서 확인할 항목

```
[ ] 2-1. 상태가 "🔍 DRY-RUN (변경 없음)"인가? (오류 없음 확인)

[ ] 2-2. [변경 필드 (CHANGED FIELDS)] 섹션에서
         변경될 필드가 의도한 대로인가?
         - decision: "pending" → "approved"
         - reviewed_by: null → {입력한 이름}
         - reviewed_at: null → {현재 시각}

[ ] 2-3. [역할 구분 안내] 섹션에서
         decision: "approved" — 발행 게이트 확인
         news_signal_review_status: 참고 정보 전용 확인

[ ] 2-4. [오류 (ERRORS)] 섹션이 비어있는가?
         오류가 있으면 → 즉시 중단, 원인 해소 후 재시도

[ ] 2-5. [경고 (WARNINGS)] 섹션이 있다면 내용을 확인했는가?
         (경고는 진행 차단 아님. 내용 인지 후 진행 가능)
```

---

## STEP 3: approval write 실행 (actual)

```bash
# 권장 명령
npm run approval:write -- --decision approved --reviewed-by {이름} --week-id {week_id}
```

### actual write 후 확인할 항목

```
[ ] 3-1. 출력 상태가 "✅ WRITTEN"인가?

[ ] 3-2. data/manifests/approval.json 파일을 직접 열어 확인했는가?
         - decision: "approved"
         - reviewed_by: {입력한 이름}
         - reviewed_at: {현재 ISO 8601 시각}
         - draft_report_id: 기존 값 유지 (변경 없음)
         - draft_week_id: 기존 값 유지 (변경 없음)

[ ] 3-3. news_signal_review_status를 입력하지 않았다면
         기존 값("PARTIAL" 등)이 그대로 유지되었는가?

[ ] 3-4. notes 필드: 별도 --note 없이 실행했다면 기존 값(null 또는 기존 메모)이 유지되었는가?
```

---

## STEP 4: publish dry-run 전 체크

```
[ ] 4-1. STEP 3 완료 후 approval.decision === "approved" 상태인가?
         (이 상태가 아니면 publish dry-run에서 BLOCKER 발생)

[ ] 4-2. draft 메인 파일이 존재하는가?
         경로: data/draft/{week_id}.json

[ ] 4-3. draft detail 파일이 picks 수만큼 존재하는가?
         경로: data/draft/details/
         - stock_{ticker}.json 또는 etf_{ticker}.json 형식
         - 부족해도 publish 자체는 가능. 단, 경고 확인 필요

[ ] 4-4. manifest.json의 draft_week_id가 발행 예정 week_id와 일치하는가?
         경로: data/manifests/manifest.json

[ ] 4-5. data/current/current.json이 존재하는가?
         (archive될 현재 current 파일)

[ ] 4-6. data/archive/{currentWeekId}.json이 아직 없는가?
         (이미 있으면 BLOCKER — 중복 archive 방지)
```

---

## STEP 5: publish dry-run 실행 및 결과 확인

```bash
# 권장 명령
npm run publish -- --week-id {week_id} --actor {이름} --dry-run
```

### 차단 조건(BLOCKER) 확인

```
[ ] 5-1. [차단 조건 (BLOCKERS)] 섹션이 "(없음)"인가?
         BLOCKER가 하나라도 있으면 → 즉시 중단, 원인 해소 후 재시도

[ ] 5-2. 상태가 "✅ READY"인가? (BLOCKED이면 중단)
```

### 경고(WARNING) 확인

```
[ ] 5-3. [경고 (WARNINGS)] 항목을 확인했는가?
         각 경고 항목에 대해 운영자가 인지하고 진행 결정 필요

[ ] 5-4. signal_review 관련 경고가 있다면:
         → 뉴스 신호 참고 정보. 발행 차단 아님. 인지 후 진행 가능.
         → 운영 원칙 §7 기준

[ ] 5-5. archive/details 파일명 충돌 경고가 있다면:
         → 덮어쓰기 허용. 진행 가능. (운영 원칙 §8)
         → 어떤 파일이 덮어써지는지 인지했는가?

[ ] 5-6. overlap_history 중복 ticker 경고가 있다면:
         → 연속 추천 여부 의도적인지 확인. 의도라면 진행.
```

### 예정 파일 변경 확인

```
[ ] 5-7. [DRY-RUN] 섹션에서 예정 변경 내용이 의도한 대로인가?
         - Phase A: current.json → archive/{currentWeekId}.json 복사
         - Phase B: current/details/* → archive/details/* 복사
         - Phase C: draft/{week_id}.json → current/current.json 복사
         - Phase D: draft/details/* → current/details/* 교체
         - Phase E: manifest.json 갱신 (current/draft/archive 필드)
         - Phase F: overlap_history.json 갱신
         - Phase G: approval.json 초기화
         - Phase H: draft 파일 삭제 (--keep-draft 없을 때)
         - Phase I: git commit (--skip-git 없을 때)
```

---

## STEP 6: publish actual 실행

```bash
# 권장 명령 (dry-run 결과 이상 없을 때)
npm run publish -- --week-id {week_id} --actor {이름}

# draft 보존이 필요한 경우
npm run publish -- --week-id {week_id} --actor {이름} --keep-draft

# git commit을 수동으로 처리할 경우
npm run publish -- --week-id {week_id} --actor {이름} --skip-git
```

### 실행 중 확인 항목

```
[ ] 6-1. 각 Phase 로그에서 오류(⚠ 또는 오류 메시지)가 없는가?

[ ] 6-2. 최종 출력이 "[PUBLISH COMPLETE]"인가?
         (오류 발생 시 "[오류 발생 — 중단]" 메시지 확인)

[ ] 6-3. 오류가 발생했다면:
         - 어느 Phase에서 중단됐는가?
         - git status로 실제 변경된 파일 범위 확인
         - git restore . 또는 git checkout HEAD -- {파일}로 수동 복구
```

---

## STEP 7: publish actual 후 확인

publish 완료 후 반드시 아래 파일들을 직접 열어 상태를 점검한다.

### 7-1. `data/current/current.json`

```
[ ] report_id가 새로 발행된 에디션의 것인가?
    기대값: "RPT-2026-W14" (또는 해당 week_id 기준)

[ ] week_id가 --week-id 값인가?

[ ] published_at이 채워져 있는가? (null이면 버그)
    기대값: publish 실행 시각의 ISO 8601 문자열
    예: "2026-04-10T10:00:00.000Z"

[ ] draft_note 필드가 존재하지 않는가? (잔존하면 버그)
    current는 발행본이므로 draft 전용 필드가 남아 있으면 안 됨

[ ] picks 내용이 draft 파일의 것과 동일한가?

[ ] data_as_of가 올바른가?
```

### 7-2. `data/archive/{oldWeekId}.json`

```
[ ] 파일이 새로 생성됐는가?
    경로: data/archive/{기존 current_week_id}.json

[ ] archived_at이 채워져 있는가? (없으면 버그)
    기대값: 이번 publish 실행 시각의 ISO 8601 문자열
    (Phase A에서 추가됨)

[ ] published_at이 archive 이전 원본 발행 시각을 그대로 유지하는가?
    (archived_at과 다른 시각이어야 정상)

[ ] report_id, week_id가 이전 에디션 기준인가?
```

### 7-3. `data/current/details/`

```
[ ] draft detail 파일들이 현재 current/details/로 복사됐는가?
    파일명: stock_{ticker}.json, etf_{ticker}.json

[ ] 이전 current detail 파일이 제거됐는가?
    (Phase D에서 기존 current/details/* 삭제 후 새 파일 복사)
```

### 7-4. `data/archive/details/`

```
[ ] 기존 current/details 파일들이 archive/details/로 복사됐는가?

[ ] 충돌(덮어쓰기)이 있었다면 경고에서 인지한 파일인가?
```

### 7-5. `data/manifests/manifest.json`

```
[ ] current_week_id: 새 week_id로 변경됐는가?
    기대값: {--week-id 값}

[ ] current_report_id: 새 에디션 report_id인가?

[ ] draft_week_id: null인가?

[ ] draft_report_id: null인가?

[ ] draft_file_path: null인가?

[ ] archive_week_ids: 기존 current의 week_id가 새로 추가됐는가?

[ ] last_published_at: 현재 발행 시각(ISO 8601)으로 갱신됐는가?
```

### 7-6. `data/manifests/approval.json`

```
[ ] decision: "pending"으로 초기화됐는가?

[ ] reviewed_by: null인가?

[ ] reviewed_at: null인가?

[ ] notes: null인가?

[ ] news_signal_review_status: null인가?

[ ] draft_report_id / draft_week_id: 기존 값이 유지됐는가?
    (다음 draft 준비 단계에서 별도 갱신 예정)
```

### 7-7. `admin/overlap_history.json`

```
[ ] recent_editions 배열 첫 번째 항목이 방금 발행된 week_id인가?

[ ] 해당 항목의 main_picks가 draft의 picks ticker 목록과 일치하는가?

[ ] recent_editions가 최대 3개인가? (4개 이상이면 오류)

[ ] last_updated_at이 현재 발행 시각으로 갱신됐는가?
```

### 7-8. draft 파일 상태 (`--keep-draft` 여부 확인)

```
[ ] --keep-draft 없이 실행했다면:
    data/draft/{week_id}.json 삭제됐는가?
    data/draft/details/ 파일들 삭제됐는가?

[ ] --keep-draft 있이 실행했다면:
    draft 파일이 남아있는가? (의도한 상태)
    이후 수동 정리 계획이 있는가?
```

### 7-9. git 상태 (`--skip-git` 여부 확인)

```
[ ] --skip-git 없이 실행했다면:
    git log로 최신 commit 메시지 확인:
    기대값: "publish: {week_id} (actor: {이름})"

[ ] --skip-git 있이 실행했다면:
    git status로 stage되지 않은 변경 파일 확인
    수동으로 git add -A && git commit -m "publish: {week_id} (actor: {이름})" 실행 필요
```

---

## 운영자가 확인해야 할 파일 목록 (요약)

| 단계 | 파일 | 확인 내용 |
|------|------|-----------|
| approval write 후 | `data/manifests/approval.json` | decision, reviewed_by, reviewed_at |
| publish 후 | `data/current/current.json` | report_id, week_id, picks |
| publish 후 | `data/archive/{oldWeekId}.json` | 이전 current 내용과 일치 |
| publish 후 | `data/current/details/*` | draft detail 파일로 교체됨 |
| publish 후 | `data/archive/details/*` | 이전 current details 복사됨 |
| publish 후 | `data/manifests/manifest.json` | current/draft/archive 필드 갱신 |
| publish 후 | `data/manifests/approval.json` | decision: pending, reviewed 필드 null |
| publish 후 | `admin/overlap_history.json` | 최신 에디션 추가, 3개 유지 |

---

## 실수하기 쉬운 항목

| 실수 유형 | 내용 | 예방 방법 |
|-----------|------|-----------|
| approval write를 dry-run 없이 실행 | 의도치 않은 값 write | 항상 --dry-run 먼저 |
| --week-id 누락 | validation 오류 발생 | 필수 인자 확인 |
| publish를 approval write 전에 실행 | BLOCKER 발생 (decision !== approved) | 순서 준수: approval write → publish |
| signal_review 경고에 publish 중단 | 불필요한 발행 지연 | signal_review는 참고 입력. 경고 확인 후 진행 |
| archive detail 충돌 경고에 publish 중단 | 불필요한 발행 지연 | 덮어쓰기 허용. 경고 인지 후 진행 |
| publish actual 후 파일 확인 생략 | 이상 상태 미감지 | STEP 7 체크리스트 반드시 실행 |
| --skip-git 후 수동 commit 누락 | 변경사항이 git에 기록되지 않음 | skip-git 사용 시 수동 commit 필수 |
| approval.json의 draft_week_id 불일치 상태 방치 | 다음 발행 시 BLOCKER 발생 | 새 draft 준비 시 draft_week_id 갱신 |

---

## Self-check before operation

### 이 체크리스트에서 정리한 운영 점검 포인트
- 7단계 흐름으로 구성: approval write dry-run → actual → publish dry-run → actual → 발행 후 확인
- 각 단계별 확인 파일과 필드를 구체적으로 명시
- STEP 7(publish 후 확인)에서 7개 파일 각각의 기대 상태를 필드 수준으로 정의

### 절대 중단 항목과 경고 확인 항목을 어떻게 구분했는지
- BLOCKER(B1~B8): `process.exit(1)`로 스크립트가 자동 중단되는 항목. 해소 전 진행 불가.
- WARNING(W1~W6): 스크립트가 경고를 출력하고 계속 진행하는 항목. 운영자가 내용을 인지하고 진행 여부를 판단.
- 체크리스트 상단 표에서 두 유형을 분리하여 운영자 혼동 방지

### approval / signal_review / manifest / overlap_history / archive details 경계
- approval: STEP 2~3(write)과 STEP 7-6(초기화 확인)에서만 다룸. 발행 게이트로만 취급.
- signal_review: STEP 5-4에서 경고 확인 항목으로만 언급. 차단 조건 아님을 명시.
- manifest: STEP 7-5에서 발행 후 인덱스 갱신 확인으로만 다룸.
- overlap_history: STEP 7-7에서 추천 이력 갱신 확인으로만 다룸.
- archive details: STEP 5-5에서 경고 확인 항목으로 언급. 덮어쓰기 허용임을 명시.

### 운영자가 최소 개입으로 따라갈 수 있게 어떻게 정리했는지
- 체크박스(`[ ]`) 형식으로 순서대로 따라가면 완료되는 구조
- 각 항목에 기대값 예시 포함
- 실수하기 쉬운 항목 별도 표로 정리

### 내가 임의로 실행하거나 구조를 바꾸지 않은 것
- 코드 수정 없음
- 실제 approval write 실행 없음
- 실제 publish 실행 없음
- JSON 샘플 수정 없음
- 구조 재설계 없음

### 현재 운영 원칙에 위배되지 않는지 점검한 항목
- §5 approval = 발행 게이트: BLOCKER B3만 decision 차단. 다른 조건으로 차단 없음 ✓
- §7 signal_review = 참고 입력: W1, W2를 WARNING으로만 분류. 차단 조건에 넣지 않음 ✓
- §8 archive detail 덮어쓰기 허용: W6를 WARNING으로만 분류. 중단 권고 없음 ✓
- §10 실제 실행 아님: 문서 작성만 수행 ✓

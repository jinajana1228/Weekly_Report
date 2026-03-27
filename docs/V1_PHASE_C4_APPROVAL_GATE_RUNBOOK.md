# V1 Phase C-4 Admin 검토/승인 게이트 운영 런북 (Runbook)

> 최종 업데이트: 2026-03-26
> 대상: Phase C-4 Approval Gate 운영자 (admin)

---

## 1. 전제 조건

Phase C-4 실행 전 Phase C-3 draft 생성이 완료되어 있어야 합니다.

```bash
# 입력 파일 존재 확인
ls data/draft/
# 필요 파일: 2026-W14.json

ls data/manifests/
# 필요 파일: approval.json
```

---

## 2. 전체 흐름

```
npm run draft:c3 -- --week-id 2026-W14   (C-3)
        ↓
npm run approval:check -- --week-id 2026-W14   (C-4: 현재 상태 확인)
        ↓ admin가 data/draft/2026-W14.json 직접 검토
npm run approval:commit -- --decision approved --reviewed-by <이름> \
  --acknowledge-data-quality --week-id 2026-W14   (C-5: 승인+반영 1회 완료)
        ↓
approval.json + current.json + manifest.json 자동 반영 완료
```

---

## 3. 명령어 레퍼런스

### 3-1. 현재 상태 확인 (읽기 전용)

```bash
npm run approval:check -- --week-id 2026-W14
```

출력 예시 (pending 상태):
```
[C-4 publish_ready 조건]
  ❌  decision === approved (현재: pending)
  ✅  draft_exists === true (현재: true)
  ❌  data_quality_acknowledged === true (현재: false)
  ✅  blocking_issues 없음 (현재: [없음])

  publish_ready (자동계산) : ❌ false
```

### 3-2. 드라이런 (저장 없이 변경 내용 미리보기)

```bash
npm run approval:commit -- \
  --decision approved \
  --reviewed-by jina \
  --acknowledge-data-quality \
  --note "C-4 검토 완료. Soft Flag 3종목 watchlist 확인. HF_OVERHEATED 인지." \
  --week-id 2026-W14 \
  --dry-run
```

### 3-3. 승인 + 반영 (approved) — 1회로 완료

```bash
npm run approval:commit -- \
  --decision approved \
  --reviewed-by <검토자> \
  --acknowledge-data-quality \
  --note "<검토 메모>" \
  --week-id 2026-W14
```

**`--acknowledge-data-quality`를 반드시 포함해야 approval.json + current.json + manifest.json이 반영됩니다.**

### 3-4. 반려 (rejected) — approval.json만 기록

```bash
npm run approval:commit -- \
  --decision rejected \
  --reviewed-by <검토자> \
  --blocking-issues "이슈1,이슈2" \
  --note "<반려 사유>" \
  --week-id 2026-W14
```

### 3-5. 보류 (on_hold) — approval.json만 기록

```bash
npm run approval:commit -- \
  --decision on_hold \
  --reviewed-by <검토자> \
  --note "<보류 사유>" \
  --week-id 2026-W14
```

### 3-6. 초기화 (pending으로 되돌리기) — approval.json만 기록

```bash
npm run approval:commit -- \
  --decision pending \
  --reviewed-by <검토자> \
  --note "재검토 필요" \
  --week-id 2026-W14
```

---

## 4. admin 검토 절차 (C-4 게이트)

승인 전 반드시 `data/draft/{week_id}.json`을 열어 아래 항목을 확인합니다.

### 4-1. [필수] Soft Flag 종목 확인

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const d = JSON.parse(readFileSync('data/draft/2026-W14.json', 'utf-8'))
const all = [...d.candidate_picks.primary, ...d.candidate_picks.secondary, ...d.watchlist]
all.filter(e => e.review_required).forEach(e => {
  console.log(`[SF] ${e.ticker} ${e.name} (${e.final_rank}위 ${e.total_score}점)`)
  console.log('  triggered:', e.triggered_rules.join(', '))
  console.log('  caution_flags:', e.caution_flags.join(' / '))
})
EOF
```

- `HF_NEGATIVE_EARNINGS`: 적자 일시적/구조적 여부 판단
- `HF_LOW_LIQUIDITY`: 실제 20거래일 평균 거래대금 수동 확인 권장

### 4-2. [필수] HF_OVERHEATED 인지

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const d = JSON.parse(readFileSync('data/draft/2026-W14.json', 'utf-8'))
console.log(d.admin_notes.find(n => n.includes('OVERHEATED')))
EOF
```

전체 15종목 HF_OVERHEATED 미평가 상태입니다. 승인 시 `--acknowledge-data-quality` 필수.

### 4-3. [필수] primary_candidates 최종 확인

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const d = JSON.parse(readFileSync('data/draft/2026-W14.json', 'utf-8'))
d.candidate_picks.primary.forEach(c => {
  console.log(`#${c.rank} ${c.ticker} ${c.name} ${c.total_score}점 [${c.hard_filter_decision}]`)
  console.log('  ', c.inclusion_reason)
  if (c.caution_flags.length > 0) c.caution_flags.forEach(f => console.log('  ⚠️ ', f))
})
EOF
```

### 4-4. [필수] data_quality_notes 확인

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const d = JSON.parse(readFileSync('data/draft/2026-W14.json', 'utf-8'))
d.data_quality_notes.forEach((n, i) => console.log(`${i+1}. ${n}`))
EOF
```

---

## 5. 승인 후 상태 확인

```bash
npm run approval:check -- --week-id 2026-W14
```

모든 조건 충족 시 `approval:check` 출력 하단에 다음 단계 명령이 직접 안내됩니다.
(`approval:commit` 1회 실행으로 승인+반영 완료)

```bash
# approval.json 내용 직접 확인
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const a = JSON.parse(readFileSync('data/manifests/approval.json', 'utf-8'))
console.log(JSON.stringify(a, null, 2))
EOF
```

---

## 6. blocking_issues 사용법

특정 이슈가 있어 반영을 차단하고 싶을 때:

```bash
npm run approval:commit -- \
  --decision on_hold \
  --reviewed-by jina \
  --blocking-issues "HF_OVERHEATED 재평가 필요,LG에너지솔루션 적자 원인 미확인" \
  --note "가격 이력 수집 후 재평가 예정" \
  --week-id 2026-W14
```

이슈 해소 후 승인+반영:

```bash
npm run approval:commit -- \
  --decision approved \
  --reviewed-by jina \
  --blocking-issues none \
  --acknowledge-data-quality \
  --note "이슈 해소 완료. 최종 승인." \
  --week-id 2026-W14
```

---

## 7. publish_ready 조건 체크리스트

```
publish_ready: true ← 아래 4가지 모두 충족 시

  □ decision === 'approved'
  □ draft_exists === true              (npm run draft:c3 실행 완료)
  □ data_quality_acknowledged === true  (--acknowledge-data-quality 포함)
  □ blocking_issues.length === 0       (이슈 목록 비어 있음)
```

`publish_ready: true` 상태에서 `npm run approval:commit -- --decision approved ...` 실행 시 current/archive/manifest가 즉시 반영됩니다.

---

## 8. 재실행 (멱등)

```bash
# 동일 내용 재실행 — 안전 (approval + current 덮어씀)
npm run approval:commit -- --decision approved --reviewed-by jina \
  --acknowledge-data-quality --week-id 2026-W14
```

---

## 9. 오류 대응

| 오류 메시지 | 원인 | 해결 |
|-------------|------|------|
| `data/draft/{week_id}.json 파일이 없습니다` | C-3 미실행 | `npm run draft:c3 -- --week-id {week_id}` |
| `--decision 인자가 필요합니다` | 필수 인자 누락 | `--decision approved|rejected|on_hold|pending` 추가 |
| `--reviewed-by 인자가 필요합니다` | 필수 인자 누락 | `--reviewed-by <이름>` 추가 |
| `--week-id 불일치` | approval.json의 week_id와 다름 | approval.json의 `draft_week_id` 확인 |
| `허용되지 않은 decision 값` | 잘못된 enum | `approved|rejected|on_hold|pending` 중 선택 |

---

## 10. Self-check before approval:commit

- [x] **draft 검토 완료**: primary 5종목 + admin_notes 확인 후 실행
- [x] **draft 존재 확인 차단**: 없으면 오류로 차단 (C-5 게이트)
- [x] **approval:commit 1회로 완료**: approved 결정 시 current/manifest까지 즉시 반영
- [x] **rejected/on_hold/pending**: approval.json만 기록, current 비접촉
- [x] **어떤 파일도 수정하지 않는 check-approval.mjs**: 읽기 전용
- [x] **approval:write (보조)**: approval.json만 기록하는 레거시 도구 — 현재 운영 동선은 approval:commit 사용
- [x] **manifest.json 비접촉**: approve.mjs / check-approval.mjs 모두 읽기/쓰기 없음
- [x] **data_quality_acknowledged 강제**: 없으면 publish_ready never true

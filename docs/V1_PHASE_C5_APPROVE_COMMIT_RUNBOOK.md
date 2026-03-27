# V1 Phase C-5 승인+반영 통합 운영 런북 (Runbook)

> 최종 업데이트: 2026-03-26
> 대상: Phase C-5 Approve-Commit 운영자 (admin)

---

## 1. 전제 조건

Phase C-5 실행 전 Phase C-3 draft 생성이 완료되어 있어야 합니다.

```bash
# 필수 파일 확인
ls data/draft/              # {week_id}.json 존재 여부
ls data/manifests/          # approval.json, manifest.json 존재 여부
```

---

## 2. 전체 운영 흐름

```
npm run evaluate:hf -- --week-id {week_id}   (C-1)
npm run score:c2    -- --week-id {week_id}   (C-2)
npm run draft:c3    -- --week-id {week_id}   (C-3)
        ↓
admin: data/draft/{week_id}.json 검토
        ↓
npm run approval:check -- --week-id {week_id}   (사전 상태 확인)
        ↓
npm run approval:commit -- --decision approved --reviewed-by <이름> \
  --acknowledge-data-quality --week-id {week_id} --dry-run   (사전 확인)
        ↓
npm run approval:commit -- --decision approved --reviewed-by <이름> \
  --acknowledge-data-quality --week-id {week_id}   (실제 반영)
        ↓
완료: approval + current + manifest 반영됨
```

---

## 3. 명령어 레퍼런스

### 3-1. 사전 상태 확인 (읽기 전용)

```bash
npm run approval:check -- --week-id 2026-W14
```

### 3-2. 드라이런 (저장 없이 미리보기) — 항상 먼저 실행

```bash
npm run approval:commit -- \
  --decision approved \
  --reviewed-by jina \
  --acknowledge-data-quality \
  --note "검토 완료. Soft Flag 3종목 watchlist 확인. HF_OVERHEATED 인지." \
  --week-id 2026-W14 \
  --dry-run
```

### 3-3. 실제 승인 + 반영 (1회 실행으로 완료)

```bash
npm run approval:commit -- \
  --decision approved \
  --reviewed-by jina \
  --acknowledge-data-quality \
  --note "검토 완료." \
  --week-id 2026-W14
```

성공 시 자동 반영:
- `data/manifests/approval.json` — decision: approved, publish_ready: true
- `data/current/current.json`    — 새 주차 picks 반영
- `data/manifests/manifest.json` — current_week_id 갱신
- `data/draft/2026-W14.json`     — **유지 (삭제 안 함)**

### 3-4. 반려 (current 반영 없음)

```bash
npm run approval:commit -- \
  --decision rejected \
  --reviewed-by jina \
  --blocking-issues "HF_OVERHEATED 재평가 필요,LG에너지솔루션 적자 원인 미확인" \
  --note "재평가 후 재승인 요청" \
  --week-id 2026-W14
```

### 3-5. 보류 (current 반영 없음)

```bash
npm run approval:commit -- \
  --decision on_hold \
  --reviewed-by jina \
  --note "추가 검토 필요" \
  --week-id 2026-W14
```

### 3-6. blocking_issues 해소 후 재승인

```bash
npm run approval:commit -- \
  --decision approved \
  --reviewed-by jina \
  --acknowledge-data-quality \
  --blocking-issues none \
  --note "이슈 해소 완료. 최종 승인." \
  --week-id 2026-W14
```

---

## 4. 승인 전 admin 검토 절차

### 4-1. primary_candidates 5종목 확인

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const d = JSON.parse(readFileSync('data/draft/2026-W14.json', 'utf-8'))
d.candidate_picks.primary.forEach(c => {
  console.log(`#${c.rank} ${c.ticker} ${c.name} ${c.total_score}점 [${c.hard_filter_decision}]`)
  console.log('  ', c.inclusion_reason)
  c.caution_flags.forEach(f => console.log('  ⚠️ ', f))
})
EOF
```

### 4-2. Soft Flag 종목 위치 확인

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const d = JSON.parse(readFileSync('data/draft/2026-W14.json', 'utf-8'))
const all = [
  ...d.candidate_picks.primary.map(e=>({...e,bucket:'primary'})),
  ...d.candidate_picks.secondary.map(e=>({...e,bucket:'secondary'})),
  ...d.watchlist.map(e=>({...e,bucket:'watchlist'})),
]
all.filter(e=>e.review_required).forEach(e =>
  console.log(`[SF/${e.bucket}] ${e.ticker} ${e.name} — ${e.triggered_rules.join(', ')}`)
)
EOF
```

### 4-3. admin_notes 전체 확인

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const d = JSON.parse(readFileSync('data/draft/2026-W14.json', 'utf-8'))
d.admin_notes.forEach((n,i) => console.log(`${i+1}. ${n}`))
EOF
```

### 4-4. current.json 반영 후 picks 확인 (승인 후)

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const c = JSON.parse(readFileSync('data/current/current.json', 'utf-8'))
console.log('report_id:', c.report_id, '/ published_at:', c.published_at)
c.picks.forEach(p => console.log(`#${p.rank} ${p.ticker} ${p.name} (${p.sector})`))
console.log('favored:', c.favored_sectors)
console.log('cautious:', c.cautious_sectors)
EOF
```

---

## 5. 승인 차단 조건 (BLOCKED 상태)

| 조건 | 오류 메시지 | 해결 방법 |
|------|------------|----------|
| `--week-id` 미입력 | `--week-id 필수` | `--week-id 2026-W14` 추가 |
| `--reviewed-by` 미입력 | `--reviewed-by 필수` | 검토자 이름 추가 |
| week_id 불일치 | `week_id 불일치` | approval.json의 draft_week_id 확인 |
| draft 파일 없음 | `파일 없음. npm run draft:c3 실행 필요` | C-3 재실행 |
| `--acknowledge-data-quality` 누락 | `--acknowledge-data-quality 필수` | 플래그 추가 |
| blocking_issues 있음 | `blocking_issues 미해소` | `--blocking-issues none`으로 해소 |

---

## 6. 결과 검증

### 6-1. 전체 검증 스크립트

```bash
node --input-type=module << 'EOF'
import { readFileSync, existsSync } from 'fs'
const c = JSON.parse(readFileSync('data/current/current.json', 'utf-8'))
const m = JSON.parse(readFileSync('data/manifests/manifest.json', 'utf-8'))
const a = JSON.parse(readFileSync('data/manifests/approval.json', 'utf-8'))
const checks = [
  ['approval.decision === approved', a.decision === 'approved'],
  ['approval.publish_ready === true', a.publish_ready === true],
  ['current.week_id 일치', c.week_id === a.draft_week_id],
  ['current.picks 5건', c.picks?.length === 5],
  ['manifest.current_week_id 일치', m.current_week_id === a.draft_week_id],
  ['draft 유지됨', existsSync(`data/draft/${a.draft_week_id}.json`)],
]
checks.forEach(([label, ok]) => console.log(ok ? '✅' : '❌', label))
EOF
```

---

## 7. 재실행 (멱등)

```bash
# 동일 week_id 재실행 — 안전 (덮어씀)
npm run approval:commit -- --decision approved --reviewed-by jina \
  --acknowledge-data-quality --week-id 2026-W14
```

C-3 재생성 후 재반영:
```bash
npm run draft:c3       -- --week-id 2026-W14
npm run approval:commit -- --decision approved --reviewed-by jina \
  --acknowledge-data-quality --week-id 2026-W14
```

---

## 8. [편집 필요] 마커 처리

승인 반영 후 current.json에는 `[편집 필요]` 마커가 포함된 필드가 있습니다.
admin이 직접 편집해야 하는 필드:

| 필드 | 내용 |
|------|------|
| `market_summary.global.headline` | 이번 주 글로벌 이슈 한 줄 요약 |
| `market_summary.domestic.*.brief` | 국내 증시 동향 설명 |
| `market_summary.domestic.week_theme` | 이번 주 핵심 테마 |
| `picks[].stance` | 각 종목 투자 관점 (점수 힌트 제공됨) |
| `picks[].catalyst_summary` | 모멘텀 촉매 요약 |
| `picks[].sector_highlights[].note` | 섹터별 동향 설명 |

current.json 직접 편집 후 저장하면 됩니다. 재실행 없음.

---

## 9. 빠른 참조 명령어

```bash
# 전체 C 파이프라인
WEEK=$(node scripts/lib/week-id.mjs)
npm run evaluate:hf -- --week-id $WEEK
npm run score:c2    -- --week-id $WEEK
npm run draft:c3    -- --week-id $WEEK

# 드라이런 확인
npm run approval:commit -- --decision approved --reviewed-by jina \
  --acknowledge-data-quality --week-id $WEEK --dry-run

# 실제 승인 반영
npm run approval:commit -- --decision approved --reviewed-by jina \
  --acknowledge-data-quality --week-id $WEEK
```

---

## 10. Self-check before approval:commit

- [x] **draft 검토 완료**: primary 5종목 + admin_notes 확인
- [x] **Soft Flag 종목 원인 파악**: triggered_rules 검토
- [x] **HF_OVERHEATED 인지**: `--acknowledge-data-quality` 포함 결정
- [x] **blocking_issues 없음**: `--blocking-issues none` 또는 빈 상태
- [x] **dry-run 먼저 실행**: 반영 전 picks 미리보기 확인
- [x] **draft 파일 유지**: 승인 후에도 data/draft/ 보관 확인

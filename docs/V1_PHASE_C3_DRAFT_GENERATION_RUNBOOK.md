# V1 Phase C-3 Draft 생성 운영 런북 (Runbook)

> 최종 업데이트: 2026-03-26
> 대상: Phase C-3 Draft 생성 스크립트 운영자

---

## 1. 전제 조건

Phase C-3 실행 전 Phase C-2 스코어링이 완료되어 있어야 합니다.

```bash
# 입력 파일 존재 확인
ls data/analysis/2026-W14/
# 필요 파일: hard_filter_results.json, scoring_results.json, scoring_summary.json

ls data/processed/2026-W14/
# 필요 파일: normalized_entities.json, market_context.json
```

---

## 2. 실행 순서

```bash
# step 1 — Phase B-3 정규화 (이미 완료된 경우 생략)
npm run normalize:b3 -- --week-id 2026-W14

# step 2 — Phase C-1 Hard Filter (이미 완료된 경우 생략)
npm run evaluate:hf -- --week-id 2026-W14

# step 3 — Phase C-2 스코어링 (이미 완료된 경우 생략)
npm run score:c2 -- --week-id 2026-W14

# step 4 — Phase C-3 Draft 생성
npm run draft:c3 -- --week-id 2026-W14
```

### 드라이런 먼저 (저장 없이 결과 확인)

```bash
npm run draft:c3 -- --week-id 2026-W14 --dry-run
```

---

## 3. 생성 기대 산출물

```
data/draft/
  2026-W14.json   (약 20~30 KB — primary 5건 + secondary 5건 + watchlist 5건 + admin_notes)
```

성공 콘솔 출력 예시:
```
📋 Phase C-3 Draft 생성 시작
  ...

✅ Phase C-3 Draft 생성 완료
   status           : draft
   primary          : 5건
   secondary        : 5건
   watchlist        : 5건
   Hard Block 제외  : 0건
   Soft Flag (감점) : N건 (review_required)

   ── primary_candidates ────────────────────────────────────
   # 1  267260  HD현대일렉트릭       95점
   # 2  005490  POSCO홀딩스         85점
   ...
```

---

## 4. 결과 검증

### 4-1. 파일 생성 확인

```bash
ls data/draft/
```

### 4-2. draft 요약 확인

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const d = JSON.parse(readFileSync('data/draft/2026-W14.json', 'utf-8'))
console.log('status:', d.status)
console.log('primary:', d.summary.primary_count)
console.log('secondary:', d.summary.secondary_count)
console.log('watchlist:', d.summary.watchlist_count)
console.log('excluded:', d.summary.excluded_hard_block)
console.log('review_required:', d.summary.review_required_count)
console.log()
console.log('=== primary_candidates ===')
d.candidate_picks.primary.forEach(c => {
  console.log(`#${c.rank} ${c.ticker} ${c.name} ${c.total_score}점 [${c.hard_filter_decision}] rev:${c.review_required}`)
})
EOF
```

### 4-3. admin_notes 확인

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const d = JSON.parse(readFileSync('data/draft/2026-W14.json', 'utf-8'))
console.log('=== admin_notes ===')
d.admin_notes.forEach((n, i) => console.log(`${i+1}. ${n}`))
EOF
```

### 4-4. Soft Flag 종목 위치 확인

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const d = JSON.parse(readFileSync('data/draft/2026-W14.json', 'utf-8'))
const allEntries = [
  ...d.candidate_picks.primary.map(e => ({...e, bucket: 'primary'})),
  ...d.candidate_picks.secondary.map(e => ({...e, bucket: 'secondary'})),
  ...d.watchlist.map(e => ({...e, bucket: 'watchlist'})),
]
const sf = allEntries.filter(e => e.hard_filter_decision === 'soft_flag')
console.log('Soft Flag 종목 위치:')
sf.forEach(e => {
  console.log(`  [${e.bucket}] #${e.final_rank} ${e.ticker} ${e.name} ${e.total_score}점`)
  console.log('    triggered:', e.triggered_rules.join(', '))
  console.log('    review_required:', e.review_required)
  console.log('    caution_flags:', e.caution_flags.length, '건')
})
EOF
```

### 4-5. current/archive 비접촉 확인

```bash
# 이 명령의 출력 날짜가 이번 draft:c3 실행 전과 동일해야 합니다
ls -la data/current/current.json
ls -la data/archive/
```

---

## 5. draft 구조 이해

### candidate_picks.primary (rank 1~5)
핵심 검토 대상. admin이 picks로 확정 여부를 결정하는 주요 후보군.
- Soft Flag가 이 범위에 있으면 `review_required: true`

### candidate_picks.secondary (rank 6~10)
보조 검토 대상. primary에서 제외 결정 시 대안 풀.
- primary와 동일한 구조

### watchlist (rank 11+)
참고/관찰 목록. 자동 제외 아님.
- 2026-W14 기준: SK텔레콤, 삼성물산, LG에너지솔루션(SF), 한국가스공사(SF), CJ제일제당(SF)

### excluded_or_caution
hard_block 종목만 여기에 기록됨. 2026-W14 기준 0건.

---

## 6. admin 검토 절차

draft 파일은 **admin이 직접 검토**한 후 publish 여부를 결정합니다.

### 필수 확인 항목

1. **[필수] Soft Flag 종목 원인 확인**
   - `review_required: true` 항목의 `triggered_rules` 확인
   - HF_LOW_LIQUIDITY: 20거래일 평균 거래대금 수동 확인
   - HF_NEGATIVE_EARNINGS: 적자 원인(일시적/구조적) 확인

2. **[필수] HF_OVERHEATED 경고 인지**
   - 전체 15종목 모두 `caution_flags`에 포함
   - 단기 급등 가능성 있는 종목 있으면 실제 주가 추이 수동 확인

3. **[필수] primary 섹터 집중 검토**
   - `admin_notes`의 섹터 집중 경고 확인
   - 2026-W14 기준: INDUSTRIAL 2개 (HD현대일렉트릭, HD현대중공업)

4. **[필수] draft 상태 확인 후 수동 publish**
   - 이 파일만으로는 어디에도 게시되지 않음
   - 승인 후 publish 스크립트 별도 실행 필요

### 권장 확인 항목

- quality 중립값(20) 적용 주식의 실제 수익성 검토
- primary 5개 중 ETF 포함 여부 확인 (V1 점수 구조상 ETF는 quality 중립)
- secondary에서 primary로 승격할 후보 검토

---

## 7. 재실행 (멱등)

```bash
# 동일 week_id 재실행 — 덮어쓰기 (안전)
npm run draft:c3 -- --week-id 2026-W14
```

C-2 재실행 후 draft 재생성:
```bash
npm run score:c2 -- --week-id 2026-W14
npm run draft:c3 -- --week-id 2026-W14
```

B-3부터 전체 재실행:
```bash
npm run normalize:b3 -- --week-id 2026-W14
npm run evaluate:hf  -- --week-id 2026-W14
npm run score:c2     -- --week-id 2026-W14
npm run draft:c3     -- --week-id 2026-W14
```

---

## 8. publish로 넘어가기 전 체크리스트

**C-4 이후(admin 승인 → publish) 진행 전 반드시 확인:**

### 필수 확인

- [ ] `data/draft/{week_id}.json` 존재
- [ ] `status: "draft"` 확인 (published 아님)
- [ ] `admin_notes` 항목 전부 확인 완료
- [ ] Soft Flag 종목 `review_required: true` 항목 원인 검토 완료
- [ ] primary_candidates 최종 선택 결정
- [ ] Hard Block 종목 있으면 사유 확인 완료

### 권장 확인

- [ ] primary + secondary 중 제외할 종목 메모
- [ ] primary 내 섹터 편중 여부 판단
- [ ] ETF/주식 비중 최종 검토
- [ ] HF_OVERHEATED 경고 인지하고 급등 우려 종목 수동 점검

### 확인 스크립트

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const d = JSON.parse(readFileSync('data/draft/2026-W14.json', 'utf-8'))
const checks = [
  ['status=draft',           d.status === 'draft'],
  ['primary 5건',            d.candidate_picks.primary.length === 5],
  ['secondary 5건',          d.candidate_picks.secondary.length === 5],
  ['admin_notes 존재',       d.admin_notes.length > 0],
  ['excluded 확인',          Array.isArray(d.excluded_or_caution)],
  ['source_refs 존재',       !!d.source_refs],
  ['market_context 존재',    !!d.market_context_summary],
]
checks.forEach(([label, ok]) => console.log(ok ? '✅' : '❌', label))
console.log()
const reviewRequired = [
  ...d.candidate_picks.primary,
  ...d.candidate_picks.secondary,
  ...d.watchlist,
].filter(e => e.review_required)
console.log(`⚠️  review_required 종목 ${reviewRequired.length}건:`)
reviewRequired.forEach(e =>
  console.log(`   ${e.ticker} ${e.name} [${e.bucket ?? 'unknown'}] — ${e.triggered_rules.join(', ')}`)
)
EOF
```

---

## 9. 빠른 참조 명령어

```bash
# 전체 C 파이프라인 실행
npm run evaluate:hf -- --week-id $(node scripts/lib/week-id.mjs)
npm run score:c2    -- --week-id $(node scripts/lib/week-id.mjs)
npm run draft:c3    -- --week-id $(node scripts/lib/week-id.mjs)

# draft primary 확인
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const d = JSON.parse(readFileSync('data/draft/2026-W14.json', 'utf-8'))
console.log('status:', d.status, '/ primary:', d.summary.primary_count, '/ review_required:', d.summary.review_required_count)
d.candidate_picks.primary.forEach(c =>
  console.log(`#${c.rank} ${c.ticker} ${c.name} ${c.total_score}점 ${c.review_required ? '[review⚠️]' : ''}`)
)
EOF
```

---

## 10. Self-check before publish

- [x] **구현 범위**: draft 생성만. picks 확정/publish 없음
- [x] **current 비접촉**: `data/current/current.json` 쓰기 없음
- [x] **archive 비접촉**: `data/archive/*` 쓰기 없음
- [x] **approval/manifest 비접촉**: 자동 변경 없음
- [x] **Soft Flag 자동 제외 금지**: 점수 기반 위치 배정 + `review_required + caution_flags`
- [x] **inclusion_reason 포함**: 모든 후보에 이유 텍스트 자동 생성
- [x] **admin_notes 자동 생성**: Soft Flag/OVERHEATED/섹터집중/중립값 경고
- [x] **멱등성**: 재실행 덮어쓰기 (안전)
- [x] **뉴스 없음**: 외부 뉴스 연동 없음
- [x] **운영 원칙 준수**:
  - V1 자동 수집 중심 원칙 유지
  - current/draft/archive 구조 변경 없음
  - snapshots/processed 독립 영역 유지

# V1 Phase C-2 스코어링/우선순위화 운영 런북 (Runbook)

> 최종 업데이트: 2026-03-26
> 대상: Phase C-2 스코어링 스크립트 운영자

---

## 1. 전제 조건

Phase C-2 실행 전 반드시 Phase C-1이 완료되어 있어야 합니다.

```bash
# 입력 파일 존재 확인
ls data/analysis/2026-W14/
# 필요 파일: hard_filter_results.json

ls data/processed/2026-W14/
# 필요 파일: normalized_entities.json
```

---

## 2. 실행 순서

```bash
# step 1 — Phase B-3 정규화 (이미 완료된 경우 생략)
npm run normalize:b3 -- --week-id 2026-W14

# step 2 — Phase C-1 Hard Filter (이미 완료된 경우 생략)
npm run evaluate:hf -- --week-id 2026-W14

# step 3 — Phase C-2 스코어링
npm run score:c2 -- --week-id 2026-W14
```

### 드라이런 먼저 (저장 없이 결과 확인)

```bash
npm run score:c2 -- --week-id 2026-W14 --dry-run
```

---

## 3. 생성 기대 산출물

```
data/analysis/2026-W14/
  scoring_results.json   (약 150~300 KB — 15개 엔티티 전체 점수 상세)
  scoring_summary.json   (약 5~15 KB — 순위 요약 + 상위 7위)
```

성공 콘솔 출력 예시:
```
📊 Phase C-2 스코어링/우선순위화 시작
  week_id  : 2026-W14
  dry-run  : false
  입력[1]  : data/analysis/2026-W14/hard_filter_results.json
  입력[2]  : data/processed/2026-W14/normalized_entities.json
  출력     : data/analysis/2026-W14/

  로드 완료: 엔티티 15건, HF 결과 15건
  [저장] data/analysis/2026-W14/scoring_results.json (xxx KB)
  [저장] data/analysis/2026-W14/scoring_summary.json (x.x KB)

✅ Phase C-2 스코어링 완료
   총 엔티티       : 15건
   스코어링 대상   : 15건
   Hard Block 제외 : 0건
   Soft Flag 감점  : 3건

   순위  티커    이름              총점  Q  / L  / M  / P    HF
   # 1  005930  삼성전자           72점  32/30/10/  0
   # 2  035420  NAVER              77점  40/25/15/  0
   ...
```

---

## 4. 결과 검증

### 4-1. 파일 생성 확인

```bash
ls data/analysis/2026-W14/
```

### 4-2. 요약 확인

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const s = JSON.parse(readFileSync('data/analysis/2026-W14/scoring_summary.json', 'utf-8'))
console.log('총 엔티티:', s.total_entities)
console.log('스코어링 대상:', s.scored_entities)
console.log('Hard Block 제외:', s.excluded_hard_block)
console.log('Soft Flag 감점:', s.soft_flag_penalty_count)
console.log('\n=== 상위 순위 ===')
s.top_ranked.forEach(r => {
  const cs = r.component_scores
  console.log(`#${r.rank} ${r.ticker} ${r.name} — 총점 ${r.total_score} (Q:${cs.quality_score}/L:${cs.liquidity_score}/M:${cs.market_position_score}/P:${cs.penalty_score}) [HF:${r.hard_filter_decision}]`)
})
EOF
```

### 4-3. 특정 종목 점수 확인

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const r = JSON.parse(readFileSync('data/analysis/2026-W14/scoring_results.json', 'utf-8'))
const entity = r.results.find(e => e.ticker === '373220')
console.log(JSON.stringify({
  ticker:               entity.ticker,
  name:                 entity.name,
  total_score:          entity.total_score,
  final_rank:           entity.final_rank,
  hard_filter_decision: entity.hard_filter_decision,
  component_scores:     entity.component_scores,
  triggered_rules:      entity.triggered_rules,
  score_notes:          entity.score_notes,
}, null, 2))
EOF
```

### 4-4. Hard Block 종목 확인

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const r = JSON.parse(readFileSync('data/analysis/2026-W14/scoring_results.json', 'utf-8'))
const hb = r.results.filter(e => !e.eligible_for_next_phase)
console.log('Hard Block 제외:', hb.length, '건')
hb.forEach(e => console.log(' ', e.ticker, e.name, '—', e.exclusion_reason))
EOF
```

---

## 5. 컴포넌트별 검증 포인트

### quality_score
- ETF 3개: 모두 중립값 20 예상
- 한국가스공사(036460), KB금융(105560): 중립값 20 예상 (별도재무 영업이익 미수집)
- LG에너지솔루션(373220): Soft Flag로 인해 낮은 점수 예상 (HF_NEGATIVE_EARNINGS)
- NAVER, 셀트리온: 고이익률 → 40점 예상

### liquidity_score
- 삼성전자, NAVER, POSCO홀딩스: 대형주 → 30점 예상
- 한국가스공사, CJ제일제당: HF_LOW_LIQUIDITY Soft Flag → 낮은 liquidity_score + 감점 예상
- 주의: 1일 프록시 (provisional)

### market_position_score
- 결과는 수집 시점의 주가에 따라 다름
- week52_high/low가 null이면 중립값 15

### penalty_score
- LG에너지솔루션: HF_NEGATIVE_EARNINGS -10
- 한국가스공사, CJ제일제당: HF_LOW_LIQUIDITY -8

---

## 6. 재실행 (멱등)

```bash
# 동일 week_id 재실행 — 덮어쓰기 (안전)
npm run score:c2 -- --week-id 2026-W14
```

B-3 재정규화 후 전체 재실행:
```bash
npm run normalize:b3 -- --week-id 2026-W14
npm run evaluate:hf  -- --week-id 2026-W14
npm run score:c2     -- --week-id 2026-W14
```

---

## 7. 다음 단계(C-3)로 넘기기 전 체크리스트

Phase C-3(picks 확정 / draft 생성) 진행 전 반드시 확인:

### 필수 확인

- [ ] `data/analysis/{week_id}/scoring_results.json` 존재
- [ ] `data/analysis/{week_id}/scoring_summary.json` 존재
- [ ] `scoring_results.json`의 `total` = 15 (또는 active 유니버스 수와 일치)
- [ ] Hard Block 종목이 있으면 `exclusion_reason` 확인 완료
- [ ] Soft Flag 감점 종목에 대해 C-1 admin 검토 메모 작성 완료
- [ ] `_data_quality_notes` 확인 — 중요 데이터 한계 파악

### 권장 확인

- [ ] HF_LOW_LIQUIDITY Soft Flag 종목의 실제 20거래일 거래대금 수동 확인 (1일 프록시 보정)
- [ ] quality_score 중립값(20) 적용 종목의 실제 수익성 수동 확인 권장
- [ ] 상위 3~5위 종목의 점수 구성(Q/L/M/P) 각 축 적절성 검토

### 확인 스크립트

```bash
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const r = JSON.parse(readFileSync('data/analysis/2026-W14/scoring_results.json', 'utf-8'))
const s = JSON.parse(readFileSync('data/analysis/2026-W14/scoring_summary.json', 'utf-8'))
const checks = [
  ['총 엔티티=15', r.total === 15],
  ['Hard Block 없음', s.excluded_hard_block === 0],
  ['scored_entities > 0', s.scored_entities > 0],
  ['top_ranked 존재', s.top_ranked.length > 0],
  ['1위 final_rank=1', s.top_ranked[0]?.rank === 1],
]
checks.forEach(([label, ok]) => console.log(ok ? '✅' : '❌', label))
console.log()
console.log('⚠️  중립값 적용 종목:')
r.results
  .filter(e => e.component_scores?.quality_score === 20 && e.asset_type === 'stock')
  .forEach(e => console.log('   quality=20(중립):', e.ticker, e.name))
r.results
  .filter(e => e.component_scores?.liquidity_score === 15)
  .forEach(e => console.log('   liquidity=15(중립):', e.ticker, e.name))
EOF
```

---

## 8. 빠른 참조 명령어

```bash
# 전체 파이프라인 (B-3 완료 후)
npm run evaluate:hf -- --week-id $(node scripts/lib/week-id.mjs)
npm run score:c2    -- --week-id $(node scripts/lib/week-id.mjs)

# 순위 요약
node --input-type=module << 'EOF'
import { readFileSync } from 'fs'
const s = JSON.parse(readFileSync(`data/analysis/${process.argv[2] ?? '2026-W14'}/scoring_summary.json`, 'utf-8'))
console.log(`scored:${s.scored_entities} / hb:${s.excluded_hard_block} / sf감점:${s.soft_flag_penalty_count}`)
s.top_ranked.slice(0,5).forEach(r => {
  const c = r.component_scores
  console.log(`#${r.rank} ${r.ticker} ${r.name} ${r.total_score}점 Q${c.quality_score}/L${c.liquidity_score}/M${c.market_position_score}/P${c.penalty_score}`)
})
EOF
```

---

## 9. Self-check before Phase C-3

- [x] **구현 범위**: 점수 계산 + 순위 부여만. picks/draft/current/archive 생성 없음
- [x] **processed/analysis 분리**: `data/processed/`는 읽기 전용. `data/analysis/`에만 쓰기
- [x] **current/draft/archive 비접촉**: 해당 경로 접근 없음
- [x] **picks 없음**: final_rank 산출만. picks 확정 없음
- [x] **Hard Block 제외**: `eligible_for_next_phase: false` — 점수 없음
- [x] **Soft Flag 감점**: 자동 제외 아님 — penalty 반영 후 eligible
- [x] **중립값 명시**: unavailable 시 null 아닌 중립값 사용 + status 기록
- [x] **score_provenance**: 모든 컴포넌트에 basis/status/source 기록
- [x] **멱등성**: 재실행 시 덮어쓰기 (안전)
- [x] **뉴스 없음**: 외부 뉴스 연동 없음
- [x] **운영 원칙 준수**:
  - V1 자동 수집 중심 원칙 유지
  - Soft Flag 종목은 admin 검토 이후 C-3 진행 권장
  - current/draft/archive 구조 변경 없음
  - snapshots/processed 독립 영역 유지

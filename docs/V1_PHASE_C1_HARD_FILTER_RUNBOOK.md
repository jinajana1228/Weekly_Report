# V1 Phase C-1 Hard Filter 판단 운영 런북 (Runbook)

> 최종 업데이트: 2026-03-26
> 대상: Phase C-1 Hard Filter 스크립트 운영자

---

## 1. 전제 조건

Phase C-1 실행 전 반드시 Phase B-3 정규화가 완료되어 있어야 합니다.

```bash
# 입력 파일 존재 확인
ls data/processed/2026-W14/
# 필요 파일: normalized_entities.json
```

---

## 2. 실행 순서

```bash
# step 1 — Phase B-2 수집 (이미 완료된 경우 생략)
npm run collect:all -- --week-id 2026-W14

# step 2 — Phase B-3 정규화 (이미 완료된 경우 생략)
npm run normalize:b3 -- --week-id 2026-W14

# step 3 — Phase C-1 Hard Filter 판단
npm run evaluate:hf -- --week-id 2026-W14
```

### 드라이런 먼저 (저장 없이 결과 확인)

```bash
npm run evaluate:hf -- --week-id 2026-W14 --dry-run
```

---

## 3. 생성 기대 산출물

```
data/analysis/2026-W14/
  hard_filter_results.json   (약 100~200 KB — 15개 엔티티 전체 판정)
  hard_filter_summary.json   (약 5~10 KB — 요약)
```

성공 콘솔 출력 예시:
```
✅ Phase C-1 Hard Filter 완료
   Hard Block  : 0건
   Soft Flag   : 3건
   Pass        : 12건
   [FLAG]  373220 LG에너지솔루션 — HF_NEGATIVE_EARNINGS
   [FLAG]  036460 한국가스공사 — HF_LOW_LIQUIDITY
   [FLAG]  097950 CJ제일제당 — HF_LOW_LIQUIDITY
```

---

## 4. 결과 검증

### 4-1. 파일 생성 확인

```bash
ls data/analysis/2026-W14/
```

### 4-2. 요약 확인

```bash
node -e "
const s = JSON.parse(require('fs').readFileSync('data/analysis/2026-W14/hard_filter_summary.json'));
console.log('Hard Block:', s.by_decision.hard_block);
console.log('Soft Flag:', s.by_decision.soft_flag, '—', s.soft_flag_tickers.map(t=>t.ticker+' '+t.name).join(', '));
console.log('Pass:', s.by_decision.pass);
console.log('Unavailable — NEWLY_LISTED:', s.input_unavailable_counts.HF_NEWLY_LISTED);
console.log('Unavailable — OVERHEATED:', s.input_unavailable_counts.HF_OVERHEATED);
"
```

### 4-3. 특정 종목 판정 확인

```bash
node -e "
const r = JSON.parse(require('fs').readFileSync('data/analysis/2026-W14/hard_filter_results.json'));
const entity = r.results.find(e => e.ticker === '036460');
console.log(JSON.stringify({
  ticker: entity.ticker,
  name: entity.name,
  overall_decision: entity.overall_decision,
  triggered_rules: entity.triggered_rules,
  unavailable_inputs: entity.unavailable_inputs,
}, null, 2));
"
```

---

## 5. Rule별 검증 포인트

### HF_EXCHANGE_STATUS
- 정상: 현재 유니버스 모두 `is_exchange_designated: false` → pass 예상
- 이상: `hard_block` 종목 등장 시 → KRX 거래소 지정 여부 수동 확인 필요
- 검증:
```bash
node -e "
const r = JSON.parse(require('fs').readFileSync('data/analysis/2026-W14/hard_filter_results.json'));
const hb = r.results.filter(e => e.rule_results.find(rr=>rr.rule==='HF_EXCHANGE_STATUS')?.decision === 'hard_block');
console.log('HF_EXCHANGE_STATUS Hard Block:', hb.map(e=>e.ticker+' '+e.name));
"
```

### HF_NEWLY_LISTED
- **현재 상태**: `input_unavailable_counts.HF_NEWLY_LISTED === 0` (정상 동작)
- KRX OAP 수집 불가 → `config/universe.json`의 `listing_date` 정적 fallback 사용
- Fallback 데이터 출처: 공개 자료 기반 수동 입력 (`listing_date_source: "universe_config"`)
- 검증: 결과 `source` 필드가 `"universe_config"`이면 fallback 사용 중
- KRX 수집 정상화 후: krx_listing 재수집 → B-3 재정규화 → C-1 재실행 → source 자동 전환

### HF_LOW_PRICE
- 정상: 현재 유니버스 모두 고가주 → 전체 pass 예상
- ETF 1,000원 미만 Soft Flag 주의

### HF_LOW_LIQUIDITY
- **주의**: 1일 거래대금 프록시 사용. 결과는 provisional.
- 현재 예상: 한국가스공사(036460), CJ제일제당(097950) Soft Flag
- `_note: "[주의] 1일 거래대금 프록시"` 필드 확인 필수

### HF_OVERHEATED
- 현재 전체 `input_unavailable` (가격 이력 없음)
- 거래소 단기과열 지정은 HF_EXCHANGE_STATUS에서 처리됨

### HF_NEGATIVE_EARNINGS
- **현재 상태**: 대부분 데이터 있음 (10건 pass/soft_flag). 잔여 2건 unavailable (한국가스공사·KB금융 — 별도재무제표 영업이익 없음)
- 한국가스공사: 공기업 특성, KB금융: 금융지주사 영업이익 계정명 상이
- `input_unavailable_counts.HF_NEGATIVE_EARNINGS` 건수 확인
- 양수 영업이익 확인:
```bash
node -e "
const r = JSON.parse(require('fs').readFileSync('data/analysis/2026-W14/hard_filter_results.json'));
r.results.filter(e=>e.asset_type==='stock').forEach(e => {
  const rule = e.rule_results.find(rr=>rr.rule==='HF_NEGATIVE_EARNINGS');
  if (rule) console.log(e.ticker, e.name.slice(0,8), rule.decision, rule.ttm_operating_income_krw ? (rule.ttm_operating_income_krw/1e8).toFixed(0)+'억' : '');
});
"
```

### HF_AUDIT_ISSUE
- **현재 상태**: `input_unavailable_counts.HF_AUDIT_ISSUE === 0` (정상 동작)
- 수집 엔드포인트: `/accnutAdtorNmNdAdtOpinion.json` (구 `/fnlttAuditOpnn.json`은 [101] 오류)
- 현재 유니버스 12개 종목 전부 2025 "적정의견" 확인
- corp_code: DART corpCode.xml 기반 정확한 코드로 업데이트됨 (`config/universe.json`)

---

## 6. Soft Flag 종목 admin 검토 절차

Soft Flag 종목은 자동 제외가 아닙니다. 정책 문서(V1_HARD_FILTER_POLICY.md 4절) 기준으로
admin이 반드시 검토해야 합니다.

```bash
# Soft Flag 목록 출력
node -e "
const s = JSON.parse(require('fs').readFileSync('data/analysis/2026-W14/hard_filter_summary.json'));
console.log('=== Soft Flag 종목 (admin 검토 필요) ===');
s.soft_flag_tickers.forEach(t => {
  console.log(t.ticker, t.name, '—', t.triggered_rules.join(', '));
});
"
```

Soft Flag 검토 시 admin이 확인해야 할 사항:
- **HF_LOW_LIQUIDITY**: 1일 프록시 결과인지 확인. 실제 20거래일 평균 거래대금 수동 확인 권장.
- **HF_NEGATIVE_EARNINGS**: 적자 원인(일시적 vs 구조적) 확인.
- **HF_AUDIT_ISSUE (soft_flag 시)**: 감사의견 원문 확인.

---

## 7. 재실행 (멱등)

```bash
# 동일 week_id 재실행 — 덮어쓰기 (안전)
npm run evaluate:hf -- --week-id 2026-W14
```

B-2 재수집 후 전체 재실행:
```bash
npm run collect:all -- --week-id 2026-W14
npm run normalize:b3 -- --week-id 2026-W14
npm run evaluate:hf -- --week-id 2026-W14
```

---

## 8. 다음 단계(추천/스코어링)로 넘기기 전 체크리스트

Phase C-2(추천 점수 계산 / picks 선정) 진행 전 반드시 확인:

### 필수 확인

- [ ] `data/analysis/{week_id}/hard_filter_results.json` 존재
- [ ] `data/analysis/{week_id}/hard_filter_summary.json` 존재
- [ ] `hard_filter_results.json`의 `total` = 15 (또는 active 유니버스 수와 일치)
- [ ] `hard_filter_summary.json`의 `by_decision` 합계 = `total`
- [ ] Hard Block 종목이 있으면 해당 ticker에 대한 거래소/DART 원인 확인 완료
- [ ] Soft Flag 종목에 대해 admin 검토 메모 작성 (후속 추천 반영 전)
- [ ] `_data_quality_notes` 확인 — 중요 데이터 한계 파악

### 권장 확인

- [ ] HF_LOW_LIQUIDITY Soft Flag 종목의 실제 20거래일 거래대금 수동 확인
- [ ] HF_NEWLY_LISTED: universe_config fallback 사용 시 해당 종목의 상장일 정확도 수동 검증 권장
- [ ] HF_AUDIT_ISSUE: 감사의견 데이터 있음 — 비적정 종목 없음 확인

### 확인 스크립트

```bash
node -e "
const r = JSON.parse(require('fs').readFileSync('data/analysis/2026-W14/hard_filter_results.json'));
const s = JSON.parse(require('fs').readFileSync('data/analysis/2026-W14/hard_filter_summary.json'));
const checks = [
  ['총 엔티티=15', r.total === 15],
  ['hard_block 없음', s.by_decision.hard_block === 0],
  ['합계 일치', s.by_decision.hard_block + s.by_decision.soft_flag + s.by_decision.pass === s.total],
  ['HF_EXCHANGE_STATUS 데이터 있음', s.input_unavailable_counts.HF_EXCHANGE_STATUS === 0],
  ['HF_LOW_PRICE 데이터 있음', s.input_unavailable_counts.HF_LOW_PRICE === 0],
  ['HF_LOW_LIQUIDITY 데이터 있음', s.input_unavailable_counts.HF_LOW_LIQUIDITY === 0],
  ['HF_NEWLY_LISTED 데이터 있음', s.input_unavailable_counts.HF_NEWLY_LISTED === 0],
  ['HF_AUDIT_ISSUE 데이터 있음', s.input_unavailable_counts.HF_AUDIT_ISSUE === 0],
];
checks.forEach(([label, ok]) => console.log(ok ? '✅' : '❌', label));
console.log();
console.log('⚠️  확인 필요한 unavailable:');
Object.entries(s.input_unavailable_counts).filter(([k,v])=>v>0).forEach(([k,v])=>console.log('  ', k, v+'건'));
"
```

---

## 9. 빠른 참조 명령어

```bash
# 전체 파이프라인 (B-2 수집 완료 후)
npm run normalize:b3 -- --week-id $(node scripts/lib/week-id.mjs)
npm run evaluate:hf -- --week-id $(node scripts/lib/week-id.mjs)

# 판정 요약
node -e "const s=JSON.parse(require('fs').readFileSync('data/analysis/$(node scripts/lib/week-id.mjs)/hard_filter_summary.json')); console.log('HB:', s.by_decision.hard_block, '/ SF:', s.by_decision.soft_flag, '/ PASS:', s.by_decision.pass); s.soft_flag_tickers.forEach(t=>console.log('  SF:', t.ticker, t.name, t.triggered_rules.join(',')))"

# Pass 종목 목록 (후속 추천 후보)
node -e "const s=JSON.parse(require('fs').readFileSync('data/analysis/$(node scripts/lib/week-id.mjs)/hard_filter_summary.json')); console.log('Pass 후보:', s.pass_tickers.join(', '))"
```

---

## 10. Self-check before Phase C-2

- [x] **구현 범위**: pass/soft_flag/hard_block 판정만. 추천/점수/picks 없음
- [x] **processed/analysis 분리**: `data/processed/`는 읽기 전용. `data/analysis/`에만 쓰기
- [x] **current/draft/archive 비접촉**: 해당 경로 접근 없음
- [x] **추천/점수/picks 없음**: 판정 코드만 존재. 점수 계산 없음
- [x] **unavailable 명시**: `input_unavailable`로 기록. null 조용히 처리 금지
- [x] **source provenance**: 모든 rule에 `source` 키. `source_provenance` 맵 포함
- [x] **processed 입력 기준**: snapshots를 직접 읽지 않음
- [x] **멱등성**: 재실행 시 덮어쓰기 (안전)
- [x] **운영 원칙 준수**:
  - V1 자동 수집 중심 원칙 유지
  - Soft Flag 종목은 admin 검토 필요 (자동 포함/제외 없음)
  - 뉴스 관련 기능 없음
  - current/draft/archive 구조 변경 없음
  - snapshots/processed 독립 영역 유지

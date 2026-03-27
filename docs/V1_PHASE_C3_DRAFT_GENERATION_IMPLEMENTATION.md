# V1 Phase C-3 Draft 생성 구현 문서

> 최종 업데이트: 2026-03-26
> 구현 대상: `scripts/generate-draft-c3.mjs`

---

## 1. C-2와 C-3의 역할 차이

| 구분 | Phase C-2 (스코어링) | Phase C-3 (Draft 생성) |
|------|----------------------|------------------------|
| 목적 | 수치 점수 부여 + 순위 산출 | 후보군 구조화 + admin 검토용 초안 생성 |
| 결정 | `total_score` + `final_rank` | `primary/secondary/watchlist` 분류 + `inclusion_reason` |
| 출력 위치 | `data/analysis/` | `data/draft/` |
| 자동화 수준 | 완전 자동 (데이터 → 점수) | 구조화 자동, **최종 판단은 admin** |
| picks 확정 | ❌ 없음 | ❌ 없음 (draft 상태) |
| publish | ❌ 없음 | ❌ 없음 |

C-2는 "얼마나 높은가"를 숫자로 표현합니다.
C-3는 "어디에 놓을 것인가"를 구조로 표현하고 admin이 검토할 컨텍스트를 함께 제공합니다.

---

## 2. 후보 선정 구조와 이유

### 2-1. 세 등급 분류

```
eligible 종목 (hard_block 제외)
  final_rank 1~5   → candidate_picks.primary    (핵심 검토 대상)
  final_rank 6~10  → candidate_picks.secondary  (보조 검토 대상)
  final_rank 11+   → watchlist                  (참고/관찰)
hard_block          → excluded_or_caution        (스코어링 제외)
```

**이 구조를 택한 이유:**
- V1은 설명 가능한 단순 구조 우선 원칙 → primary/secondary/watchlist 3계층으로 충분
- primary 5개 = 1~2주 추천 picks 검토에 적합한 사이즈
- secondary = admin이 primary 중 제외 결정 시 대안 확보
- watchlist = Soft Flag 저점수 종목 포함 — 자동 제외 아님, admin이 볼 수 있음

### 2-2. Soft Flag 종목의 draft 반영

Soft Flag 종목은 **자동 제외하지 않습니다.** 아래 방식으로 draft에 포함됩니다.

| Soft Flag 종목의 final_rank | draft 위치 | 표기 |
|-----------------------------|------------|------|
| 1~5 (primary 범위) | `candidate_picks.primary` | `review_required: true` + `caution_flags` |
| 6~10 (secondary 범위) | `candidate_picks.secondary` | `review_required: true` + `caution_flags` |
| 11+ (watchlist 범위) | `watchlist` | `review_required: true` + `caution_flags` |

2026-W14 기준 Soft Flag 3종목(LG에너지솔루션·한국가스공사·CJ제일제당)은 모두 rank 13~15로 `watchlist`에 위치합니다.

각 Soft Flag 항목에는 다음이 포함됩니다:
```json
{
  "review_required": true,
  "caution_flags": [
    "HF_NEGATIVE_EARNINGS Soft Flag — 영업적자. 일시적 vs 구조적 원인 확인 필요."
  ]
}
```

### 2-3. 점수만으로 기계적으로 자르지 않는 이유

- 동점 종목이 많을 수 있음 (V1 점수 구조 특성상 같은 등급에 여러 종목이 집중 가능)
- 점수로 자르면 admin이 context를 잃음 → `inclusion_reason`, `score_notes`, `caution_flags`를 함께 제공
- admin이 primary에서 특정 종목을 제외하거나 secondary를 승격할 수 있도록 전체 구조를 노출

---

## 3. 각 후보 항목 구조

```json
{
  "rank": 1,
  "ticker": "267260",
  "name": "HD현대일렉트릭",
  "asset_type": "stock",
  "market": "KOSPI",
  "sector_code": "INDUSTRIAL",
  "total_score": 95,
  "final_rank": 1,
  "hard_filter_decision": "pass",
  "component_scores": {
    "quality_score": 40,
    "liquidity_score": 25,
    "market_position_score": 30,
    "penalty_score": 0
  },
  "triggered_rules": [],
  "unavailable_inputs": ["HF_OVERHEATED"],
  "score_notes": ["HF_OVERHEATED 미평가 — ..."],
  "price_snapshot": {
    "close": 965000,
    "week52_high": 1116000,
    "week52_low": 264500,
    "week52_position_pct": 82,
    "as_of": "20260326",
    "source": "krx_price"
  },
  "quality_detail": {
    "op_margin_pct": 26.3,
    "bsns_year": "2025",
    "source": "dart_financials"
  },
  "inclusion_reason": "C-2 1위(95점). 영업이익률 26.3%(2025). 52주 포지션 82% — 강한 상승 모멘텀.",
  "review_required": false,
  "caution_flags": [
    "HF_OVERHEATED 미평가 — 단기 급등 과열 여부 미반영. 가격 이력(5일/20일) 확보 후 재평가 필요."
  ]
}
```

---

## 4. draft 전체 구조

```
data/draft/{week_id}.json
  ├── week_id, status("draft"), generated_at, schema_version
  ├── source_refs                 입력 파일 참조
  ├── summary                     건수 요약 (아래 집계 기준 참고)
  ├── market_context_summary      시장 지표 스냅샷 (참고용)
  ├── candidate_picks
  │   ├── primary    (rank 1~5)   핵심 검토 후보
  │   └── secondary  (rank 6~10)  보조 후보
  ├── watchlist      (rank 11+)   참고/관찰 목록
  ├── excluded_or_caution         hard_block 제외 항목
  ├── admin_notes                 admin이 확인해야 할 사항
  └── data_quality_notes          데이터 한계 목록
```

**summary 집계 기준:**

| 필드 | 집계 범위 |
|------|-----------|
| `primary_count` | `candidate_picks.primary` 건수 |
| `secondary_count` | `candidate_picks.secondary` 건수 |
| `watchlist_count` | `watchlist` 건수 |
| `excluded_hard_block` | `excluded_or_caution` 건수 |
| `soft_flag_in_candidates` | **primary + secondary + watchlist 전체** 중 `hard_filter_decision === 'soft_flag'` 건수 |
| `review_required_count` | **primary + secondary + watchlist 전체** 중 `review_required === true` 건수 |

`soft_flag_in_candidates`와 `review_required_count`는 watchlist 포함 전체 eligible 범위를 집계합니다.
primary + secondary만 본다면 Soft Flag 저점수 종목이 watchlist에 있을 때 0으로 보여 오해를 유발하기 때문입니다.

---

## 5. admin이 draft에서 최종 확인해야 할 항목

draft는 자동 생성 결과입니다. 다음 항목은 **반드시 admin이 직접 확인**해야 합니다.

### 필수 확인

1. **Soft Flag 종목의 C-1 검토 완료 여부**
   - `review_required: true` 항목들의 triggered_rules 원인이 해소됐는지
   - 특히 HF_LOW_LIQUIDITY는 1일 프록시 기반 — 실제 20거래일 거래대금 확인

2. **HF_OVERHEATED 미평가 상태**
   - 전체 15종목에 `caution_flags`에 경고 포함
   - 가격 이력 수집 전까지는 단기 급등 종목이 과대평가될 수 있음

3. **primary 섹터 집중**
   - `admin_notes`에서 동일 섹터 2개 이상 시 경고 자동 포함
   - 섹터 분산 여부는 admin이 최종 판단

4. **quality 중립값 적용 종목의 실제 수익성**
   - `quality_detail: null` 이거나 `quality_score === 20`인 주식
   - 2026-W14 기준: 한국가스공사, KB금융

### 권장 확인

- secondary에서 primary로 승격할 종목 여부
- primary에서 제외할 종목 여부
- ETF와 주식 혼합 비율 (현재 primary에 ETF 없음 — 점수 구조상 ETF는 quality 중립값)

---

## 6. draft 상태와 publish의 관계

```
C-3: data/draft/{week_id}.json 생성 ← 현재 단계
         ↓ (admin 검토)
C-4: admin이 draft 내용 확인 및 수정 결정
         ↓ (admin 승인)
C-5: publish → data/current/current.json 갱신, data/archive/ 이동
```

**C-3는 절대로 아래를 수행하지 않습니다:**
- `data/current/current.json` 갱신
- `data/archive/*` 생성/수정
- `approval.json` / `manifest.json` 변경
- publish 수행

---

## 7. 데이터 한계 (2026-W14 기준)

| 항목 | 상태 | draft 영향 |
|------|------|-----------|
| HF_OVERHEATED | 전체 미평가 | 모든 후보에 caution_flag 포함 |
| market_cap_krw | 미수집 | price_snapshot에 null |
| KB금융 quality | 중립값 | admin_notes에 명시 |
| 한국가스공사 quality | 중립값 | admin_notes에 명시 |
| liquidity_score | 1일 프록시 | provisional caution 표기 없음 (HF_LOW_LIQUIDITY Soft Flag 종목만 caution) |

---

## 8. 설계 원칙 Self-check

- [x] **draft 상태**: `status: "draft"` 고정. approval/publish 없음
- [x] **hard_block 제외**: `eligible_for_next_phase: false` → `excluded_or_caution`
- [x] **soft_flag 자동 제외 금지**: 점수 기반 위치 + `review_required: true` + `caution_flags`
- [x] **inclusion_reason 포함**: 모든 후보 항목에 자동 생성 이유 텍스트
- [x] **processed/analysis → draft 방향**: 읽기 전용 준수
- [x] **current/archive 비접촉**: 해당 경로 쓰기 없음
- [x] **admin_notes 자동 생성**: Soft Flag/OVERHEATED/섹터집중/중립값 경고 자동 포함
- [x] **멱등성**: 재실행 시 덮어쓰기 (안전)

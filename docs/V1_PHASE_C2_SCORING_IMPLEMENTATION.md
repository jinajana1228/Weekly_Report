# V1 Phase C-2 스코어링/우선순위화 구현 문서

> 최종 업데이트: 2026-03-26
> 구현 대상: `scripts/score-phase-c2.mjs`

---

## 1. 목적 및 위치

Phase C-2는 Phase C-1(Hard Filter)을 통과한 종목에 **설명 가능한 단순 점수**를 부여하고
우선순위(final_rank)를 산출합니다.

- 입력: `data/analysis/{week_id}/hard_filter_results.json` + `data/processed/{week_id}/normalized_entities.json`
- 출력: `data/analysis/{week_id}/scoring_results.json` + `data/analysis/{week_id}/scoring_summary.json`
- **금지**: picks 확정, draft/current/archive 생성, 뉴스 연동, approval 연동 없음

---

## 2. 스코어링 모델 (V1)

V1은 세 가지 독립 축으로 수익성·유동성·모멘텀을 평가합니다.

```
total_score (0~100)
  = quality_score         (0~40)   수익성 — DART 영업이익률
  + liquidity_score       (0~30)   유동성 — 1일 거래대금 프록시
  + market_position_score (0~30)   모멘텀 — 52주 가격 포지션
  + penalty_score         (0~-20)  Soft Flag 감점 (상한 -20)
```

---

## 3. 각 컴포넌트 상세

### 3-1. quality_score (0~40)

DART 연간 사업보고서(reprt_code=11011)에서 영업이익/매출액 비율(영업이익률) 계산.

| 영업이익률          | 점수 | 해당 종목 예시              |
|---------------------|------|-----------------------------|
| ≥ 20%               |  40  | NAVER ~28%, 셀트리온 ~31%   |
| 10% 이상 20% 미만   |  32  | 삼성전자 ~10%, HD현대중공업 |
| 5% 이상 10% 미만    |  24  | SK텔레콤 ~7%                |
| 0% 이상 5% 미만     |  16  | 삼성물산 ~3%, CJ제일제당    |
| 0% 미만 (적자)      |   5  | LG에너지솔루션 -17%         |
| ETF 또는 데이터 없음| **20** | 중립값                    |

**데이터 한계**: 한국가스공사(036460), KB금융(105560) 별도재무 영업이익 미수집 → 중립값 20 적용.

### 3-2. liquidity_score (0~30)

KRX 1일 거래대금 프록시(종가 × 거래량)로 시장 접근성 평가.

| 1일 거래대금         | 점수 | 비고              |
|----------------------|------|-------------------|
| ≥ 1,000억원          |  30  |                   |
| 500억 이상 1,000억 미만|  25  |                   |
| 200억 이상 500억 미만 |  20  |                   |
| 100억 이상 200억 미만 |  15  |                   |
| 50억 이상 100억 미만  |   8  |                   |
| < 50억원             |   3  |                   |
| 데이터 없음          | **15** | 중립값           |

**주의**: 20거래일 평균이 아닌 1일 프록시. **provisional**.

### 3-3. market_position_score (0~30)

52주 포지션 = (현재가 - 52주 저점) / (52주 고점 - 52주 저점).
높은 포지션 = 52주 고점 근처 = 상승 모멘텀 강함.

| 52주 포지션 | 점수 |
|-------------|------|
| ≥ 80%       |  30  |
| ≥ 60%       |  25  |
| ≥ 40%       |  20  |
| ≥ 20%       |  15  |
| < 20%       |  10  |
| 데이터 없음 | **15** (중립) |

### 3-4. penalty_score (0 이하, 최대 -20)

C-1 Soft Flag에 따른 감점. **자동 제외가 아닙니다.** 감점 반영 후 다음 단계로 전달.

| Soft Flag 규칙       | 감점 | 이유                           |
|----------------------|------|--------------------------------|
| HF_NEGATIVE_EARNINGS | -10  | TTM 영업이익 음수              |
| HF_LOW_LIQUIDITY     |  -8  | 저유동성 (1일 프록시 기준)     |
| HF_LOW_PRICE         |  -5  | 동전주                         |
| HF_AUDIT_ISSUE       | -15  | 감사의견 비확인                |

복수 Soft Flag 합산 시 **상한 -20** 적용.

---

## 4. Hard Block vs Soft Flag 처리

| C-1 결정   | C-2 처리                                        |
|------------|-------------------------------------------------|
| hard_block | 스코어링 제외. `total_score: null`, `eligible_for_next_phase: false` |
| soft_flag  | 정상 스코어링 + penalty 감점. `eligible_for_next_phase: true` |
| pass       | 정상 스코어링. penalty 없음.                    |

---

## 5. 랭킹 결정 규칙

1. `eligible_for_next_phase: true` 종목만 랭킹 대상.
2. `total_score` 내림차순 정렬.
3. 동점 시 `liquidity_score` 내림차순 (시장 접근성 우선).
4. `final_rank` 1위부터 순번 부여.

---

## 6. 데이터 출처 매핑

| 컴포넌트               | 출처                  | 필드                                  |
|------------------------|-----------------------|---------------------------------------|
| quality_score          | dart_financials       | 영업이익 / 매출액 (11011 연간보고서)  |
| liquidity_score        | krx_price             | close × volume (1일 프록시)           |
| market_position_score  | krx_price             | close, week52_high, week52_low        |
| penalty_score          | hard_filter_results   | triggered_rules (Soft Flag 목록)      |

---

## 7. 산출물 구조

### scoring_results.json (엔티티별 상세)
```json
{
  "week_id": "2026-W14",
  "built_at": "ISO8601",
  "schema_version": "1.0",
  "source_refs": { ... },
  "total": 15,
  "results": [
    {
      "ticker": "005930",
      "name": "삼성전자",
      "asset_type": "stock",
      "market": "KOSPI",
      "sector_code": "TECH",
      "hard_filter_decision": "pass",
      "eligible_for_next_phase": true,
      "exclusion_reason": null,
      "total_score": 72,
      "final_rank": 3,
      "component_scores": {
        "quality_score": 32,
        "liquidity_score": 30,
        "market_position_score": 10,
        "penalty_score": 0
      },
      "score_provenance": { ... },
      "triggered_rules": [],
      "unavailable_inputs": ["HF_OVERHEATED"],
      "score_notes": ["HF_OVERHEATED 미평가 — ..."]
    }
  ]
}
```

### scoring_summary.json (요약)
```json
{
  "week_id": "2026-W14",
  "total_entities": 15,
  "scored_entities": 15,
  "excluded_hard_block": 0,
  "soft_flag_penalty_count": 3,
  "by_asset_type": { "stock": {...}, "etf": {...} },
  "score_distribution": { "excellent": 0, "good": 5, "moderate": 7, "low": 3, "poor": 0 },
  "top_ranked": [ ... ],
  "_data_quality_notes": [ ... ],
  "_phase_note": "C-2 산출물은 우선순위 참고용입니다. picks 확정은 C-3 이후."
}
```

점수 분포 구간:

| 구간         | total_score |
|--------------|-------------|
| excellent    | ≥ 80        |
| good         | ≥ 60        |
| moderate     | ≥ 40        |
| low          | ≥ 20        |
| poor         | < 20        |

---

## 8. 현재 데이터 한계 (2026-W14 기준)

| 항목                       | 상태                          | 영향                                    |
|----------------------------|-------------------------------|-----------------------------------------|
| HF_OVERHEATED              | 전체 input_unavailable        | 단기 급등 과열 여부 미반영 — 과열 종목 점수 과대 가능 |
| HF_LOW_LIQUIDITY           | 1일 프록시 (provisional)      | liquidity_score와 감점 모두 잠정치       |
| 한국가스공사, KB금융       | 영업이익 미수집               | quality_score 중립값 20 적용             |
| 시가총액                   | 미수집                        | 규모 보정 없음                           |

---

## 9. 설계 원칙 Self-check

- [x] **총점 0~100**: `Math.max(0, Math.min(100, rawTotal))` 보정
- [x] **Hard Block 제외**: `eligible_for_next_phase: false`, `total_score: null`
- [x] **Soft Flag 감점 (자동 제외 아님)**: `penalty_score` 반영 후 eligible
- [x] **중립값 사용**: 데이터 없을 때 null 대신 중립값(20/15) 사용
- [x] **score_provenance**: 모든 컴포넌트에 basis/status/source 기록
- [x] **processed/analysis 분리**: `data/processed/`는 읽기 전용, `data/analysis/`에만 쓰기
- [x] **current/draft/archive 비접촉**: 해당 경로 접근 없음
- [x] **picks/approval 없음**: 순위 산출만. 추천 확정 없음
- [x] **멱등성**: 재실행 시 덮어쓰기 (안전)
- [x] **뉴스 없음**: 외부 뉴스 연동 없음

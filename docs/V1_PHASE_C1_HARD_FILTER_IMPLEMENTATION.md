# V1 Phase C-1 Hard Filter 판단 구현 레퍼런스

> 최종 업데이트: 2026-03-26
> 상태: 구현 완료 (Phase C-1 최소 구현)
> 정책 기준: docs/V1_HARD_FILTER_POLICY.md

---

## 1. 개요

Phase C-1은 Phase B-3에서 생성한 정규화 데이터를 입력으로 받아
정책 문서 기준의 Hard Filter 판정 결과를 `data/analysis/{week_id}/`에 저장합니다.

이 단계는 **판정만** 합니다. 추천/점수/picks 생성은 하지 않습니다.

### 설계 원칙

| 원칙 | 내용 |
|------|------|
| **입력 분리** | raw snapshots가 아닌 processed 파일만 참조 |
| **판단 배제** | 추천/점수/picks 없음. pass/soft_flag/hard_block 판정만 |
| **unavailable 명시** | 입력 부재는 조용히 무시하지 않고 `input_unavailable`로 기록 |
| **provenance 유지** | 각 rule 결과에 source 식별자 포함 |
| **멱등성** | 같은 week_id 재실행 시 덮어쓰기 (안전) |
| **격리** | analysis는 processed/current/draft/archive와 독립 |

---

## 2. 파일 구조

```
scripts/
  evaluate-hard-filters.mjs        ← Phase C-1 메인 판단 스크립트

data/
  processed/{week_id}/             ← 입력 (Phase B-3, 변경 없음)
    normalized_entities.json
  analysis/{week_id}/              ← 출력 (Phase C-1 신규)
    hard_filter_results.json
    hard_filter_summary.json

docs/
  V1_HARD_FILTER_POLICY.md        ← 정책 기준 원본 (이 구현의 기준 문서)
```

---

## 3. 구현된 Rule Set

| Rule ID | 정책 기준 (V1_HARD_FILTER_POLICY.md) | Hard Block 조건 | Soft Flag 조건 | 개별주 | ETF |
|---------|--------------------------------------|-----------------|----------------|--------|-----|
| `HF_EXCHANGE_STATUS` | 2-1절. 공식 지정 이슈 종목 | `is_exchange_designated: true` | (지정 유형 세분화 후 투자주의 분리 예정) | ✅ | ✅ |
| `HF_NEWLY_LISTED` | 2-3절. 신규 상장 6개월 미만 | 상장 후 < 180일 | — | ✅ | ✅ |
| `HF_LOW_PRICE` | 2-4절. 동전주 | 개별주 close < 2,000원 | ETF close < 1,000원 | ✅ | ✅(Soft) |
| `HF_LOW_LIQUIDITY` | 2-5절. 저유동성 (시장별 분리) | KOSPI < 50억 / KOSDAQ < 20억 / ETF < 10억 | KOSPI 50~100억 / KOSDAQ 20~30억 / ETF 10~20억 | ✅ | ✅ |
| `HF_OVERHEATED` | 2-6절. 단기 급등 과열 | 5일 +40% / 20일 +80% 초과 | 5일 +20~40% / 20일 +30~80% | ✅ | ✅ |
| `HF_NEGATIVE_EARNINGS` | 2-2절. 영업 적자 | 2분기 연속 적자 + TTM 음수 (HEALTHCARE 예외: Soft Flag) | TTM 영업이익 합산 음수 | ✅ | ❌(미적용) |
| `HF_AUDIT_ISSUE` | 2-1절. 감사의견 비적정 | 한정/부적정/의견거절 | 알 수 없는 의견 형식 | ✅ | ❌(미적용) |

### Rule별 입력/기준/결과 상세

#### HF_EXCHANGE_STATUS
- **입력**: `entity.exchange_status.is_exchange_designated` (boolean)
- **기준**: `true` → Hard Block, `false` → pass
- **현재 한계**: 지정 유형(관리/거래정지/경고/위험/과열/주의) 구분 불가. `true`이면 보수적 Hard Block.
  - 해소 방법: KRX OAP API에서 지정 유형 필드 확보 후 투자주의 → Soft Flag 분리
- **source**: `krx_exchange_status`

#### HF_NEWLY_LISTED
- **입력**: `entity.listing.listing_date`
- **기준**: (asOf 기준일 - 상장일) < 180일 → Hard Block
- **현재 상태**: krx_listing KRX OAP 수집 불가이나 `config/universe.json`의 `listing_date` fallback으로 정상 판단 중. `input_unavailable_counts = 0`.
- **source**: `krx_listing` (KRX 수집 시) 또는 `universe_config` (fallback 시). 결과의 `source` 필드로 구분.

#### HF_LOW_PRICE
- **입력**: `entity.price.close`
- **기준**:
  - 개별주: close < 2,000원 → Hard Block
  - ETF: close < 1,000원 → Soft Flag
- **source**: `krx_price`

#### HF_LOW_LIQUIDITY
- **입력**: `entity.price.volume`, `entity.price.close`
- **계산**: `daily_value = volume × close` (1일 거래대금 프록시)
- **기준 (시장별, 정책 2-5절)**:

  | 시장 | Hard Block | Soft Flag |
  |------|-----------|-----------|
  | KOSPI 개별주 | < 50억원 | 50~100억원 |
  | KOSDAQ 개별주 | < 20억원 | 20~30억원 |
  | ETF | < 10억원 | 10~20억원 |

- **데이터 한계**: 1일 프록시. 정확한 판단은 최근 20거래일 평균 필요. 결과는 provisional.
- **source**: `krx_price`

#### HF_OVERHEATED
- **입력**: 5거래일/20거래일 가격 이력 필요
- **기준 (정책 2-6절)**:
  - 5일 +40% 초과 → Hard Block / 5일 +20~40% → Soft Flag
  - 20일 +80% 초과 → Hard Block / 20일 +30~80% → Soft Flag
- **현재 상태**: 다일 거래일 스냅샷만 있으므로 전체 `input_unavailable`
  - 거래소 단기과열 지정은 `HF_EXCHANGE_STATUS`에서 이미 처리됨
- **source**: `krx_price`

#### HF_NEGATIVE_EARNINGS
- **입력**: `entity.dart_financials.periods[].financials['영업이익'].thstrm_amount`
- **기준 (정책 2-2절)**:
  - TTM (연간 11011 기준) 영업이익 합산 음수 → Soft Flag
  - 최근 2분기 연속 적자 + TTM 음수 → Hard Block
  - HEALTHCARE 섹터: Hard Block → Soft Flag 완화 적용
- **ETF**: 미적용 (`not_applicable`)
- **파싱**: 한국식 숫자 포맷 `"23,603,619,000,000"` → `parseKrwAmount()` 처리
- **source**: `dart_financials`

#### HF_AUDIT_ISSUE
- **입력**: `entity.dart_audit.audit_opinion`
- **기준**: `한정` / `부적정` / `의견거절` 포함 → Hard Block, `적정` → pass
- **ETF**: 미적용 (`not_applicable`)
- **현재 상태**: 정상화됨. DART 엔드포인트 `/accnutAdtorNmNdAdtOpinion.json` 수정 및 `dart_corp_code` 전종목 업데이트 완료. 현재 유니버스 12개 종목 전부 "적정의견" 확인. `input_unavailable_counts = 0`.
- **source**: `dart_audit`

---

## 4. 생성 파일 상세

### 4-1. `hard_filter_results.json`

**목적**: 엔티티별 전체 rule 판정 결과. 후속 추천 로직이 이 파일을 읽어 후보군을 확정합니다.

**최상위 구조**:
```json
{
  "week_id": "2026-W14",
  "built_at": "...",
  "schema_version": "1.0",
  "source_ref": "data/processed/2026-W14/normalized_entities.json",
  "total": 15,
  "results": [ ... ]
}
```

**엔티티 판정 레코드 구조**:
```json
{
  "ticker": "005930",
  "name": "삼성전자",
  "asset_type": "stock",
  "market": "KOSPI",
  "sector_code": "TECH",
  "overall_decision": "pass",
  "triggered_rules": [],
  "unavailable_inputs": ["HF_OVERHEATED"],
  "not_applicable": [],
  "rule_results": [
    {
      "rule": "HF_EXCHANGE_STATUS",
      "decision": "pass",
      "triggered": false,
      "input_available": true,
      "applicable": true,
      "basis": "is_exchange_designated: false — 거래소 지정 없음",
      "source": "krx_exchange_status"
    },
    ...
  ],
  "source_provenance": {
    "HF_EXCHANGE_STATUS": "krx_exchange_status",
    "HF_LOW_PRICE": "krx_price",
    "HF_NEGATIVE_EARNINGS": "dart_financials",
    ...
  },
  "_input_ref": "data/processed/2026-W14/normalized_entities.json"
}
```

**overall_decision 결정 로직**:
1. 어느 rule이라도 `hard_block` → `hard_block`
2. 어느 rule이라도 `soft_flag` (hard_block 없음) → `soft_flag`
3. 그 외 → `pass` (일부 `input_unavailable` 있더라도 pass로 처리, `unavailable_inputs`에 기록)

---

### 4-2. `hard_filter_summary.json`

**목적**: 전체 판정 요약. 운영자가 빠르게 이슈를 파악할 수 있는 요약본.

**구조**:
```json
{
  "week_id": "2026-W14",
  "built_at": "...",
  "schema_version": "1.0",
  "total": 15,
  "by_decision": {
    "hard_block": 0,
    "soft_flag": 3,
    "pass": 12
  },
  "rule_trigger_counts": {
    "HF_EXCHANGE_STATUS": 0,
    "HF_NEWLY_LISTED": 0,
    "HF_LOW_PRICE": 0,
    "HF_LOW_LIQUIDITY": 2,
    "HF_OVERHEATED": 0,
    "HF_NEGATIVE_EARNINGS": 1,
    "HF_AUDIT_ISSUE": 0
  },
  "input_unavailable_counts": {
    "HF_NEWLY_LISTED": 0,
    "HF_OVERHEATED": 15,
    "HF_AUDIT_ISSUE": 0,
    "HF_NEGATIVE_EARNINGS": 2,
    ...
  },
  "hard_block_tickers": [],
  "soft_flag_tickers": [
    { "ticker": "373220", "name": "LG에너지솔루션", "triggered_rules": ["HF_NEGATIVE_EARNINGS"] },
    { "ticker": "036460", "name": "한국가스공사",   "triggered_rules": ["HF_LOW_LIQUIDITY"] },
    { "ticker": "097950", "name": "CJ제일제당",     "triggered_rules": ["HF_LOW_LIQUIDITY"] }
  ],
  "pass_tickers": ["005930", "035420", ...],
  "_data_quality_notes": [ ... ]
}
```

---

## 5. Processed ↔ Analysis 관계

```
data/processed/{week_id}/normalized_entities.json  ──┐
                                                       │  evaluate-hard-filters.mjs
                                                       │  (판정만. 추천/점수/picks 없음)
                                                       ↓
data/analysis/{week_id}/hard_filter_results.json   ← 개별 판정
data/analysis/{week_id}/hard_filter_summary.json   ← 전체 요약
```

processed 파일은 읽기 전용. analysis 파일은 쓰기 전용.

---

## 6. unavailable 처리 방식

| 상황 | 처리 |
|------|------|
| 전체 source unavailable (listing, overheated) | `input_unavailable` - 해당 rule 판단 보류. `unavailable_inputs[]`에 기록 |
| 개별 레코드 데이터 없음 (audit_opinion: null) | `input_unavailable` - 조용히 무시 금지 |
| ETF에 영업이익/감사의견 rule 적용 | `not_applicable` - 적용 대상 아님 명시 |
| KRX flow unavailable | Hard Filter 필수 입력이 아니므로 사용하지 않음 (수급 기반 rule 없음) |

**unavailable_inputs가 있더라도 overall_decision에 영향 없음**:
- unavailable 규칙이 많아도 trigger된 규칙이 없으면 `pass`
- 단, `_data_quality_notes`와 `unavailable_inputs[]`에 명시적으로 기록됨

---

## 7. source provenance

모든 rule 결과에 `source` 키 포함:
- `HF_EXCHANGE_STATUS` → `"krx_exchange_status"`
- `HF_NEWLY_LISTED` → `"krx_listing"` (KRX 수집 정상 시) 또는 `"universe_config"` (KRX OAP 수집 불가 시 fallback)
  - fallback 사용 시 결과에 `listing_date_note` 필드 추가됨
- `HF_LOW_PRICE` → `"krx_price"`
- `HF_LOW_LIQUIDITY` → `"krx_price"`
- `HF_OVERHEATED` → `"krx_price"`
- `HF_NEGATIVE_EARNINGS` → `"dart_financials"`
- `HF_AUDIT_ISSUE` → `"dart_audit"`

각 엔티티 결과에 `source_provenance` 객체가 포함되어 rule → source 매핑을 한눈에 볼 수 있습니다.
또한 `_input_ref`로 입력 processed 파일 경로를 추적합니다.

---

## 8. 현재 판정 결과 한계 (2026-W14 기준)

| Rule | 판단 가능 여부 | 비고 |
|------|---------------|------|
| HF_EXCHANGE_STATUS | ✅ (단, 유형 세분화 불가) | is_exchange_designated 단일 boolean만 수집됨 |
| HF_NEWLY_LISTED | ✅ (universe_config fallback) | krx_listing KRX OAP 수집 불가. config/universe.json 정적 상장일 사용 중 |
| HF_LOW_PRICE | ✅ | close 가격 정상 수집됨 |
| HF_LOW_LIQUIDITY | ⚠️ provisional (1일 프록시) | 20거래일 평균 데이터 없음 |
| HF_OVERHEATED | ❌ 전체 input_unavailable | 5일/20일 가격 이력 없음 |
| HF_NEGATIVE_EARNINGS | ✅ (10/12개 회사 판단 완료) | 2건 unavailable — 한국가스공사·KB금융 (계정과목 특성) |
| HF_AUDIT_ISSUE | ✅ | DART 엔드포인트·corp_code 수정 완료. 12개 종목 "적정의견" 확인 |

---

## 9. 이번 단계에서 의도적으로 하지 않은 것

| 항목 | 이유 |
|------|------|
| 추천 점수 계산 | Phase C-2 이후 |
| picks 선정 | Phase C-2 이후 |
| same_sector_alternatives 생성 | Phase C-2 이후 |
| current/draft/archive 생성 | Phase C-2 이후 |
| approval/manifest 수정 | Phase C 이후 |
| 뉴스 자동화 | Phase C 이후 |
| KRX listing 자동 수집 정상화 | KRX OAP 세션 문제 미해결. 현재 universe_config fallback 운용 중 |
| 20거래일 가격 이력 수집 | Phase B-2 범위 확대 → 별도 단계 |

---

## 10. Self-check before Phase C-2

- [x] **판단 범위**: pass/soft_flag/hard_block 판정만. 추천/점수/picks 코드 없음
- [x] **processed/analysis 분리**: `data/processed/`는 읽기 전용. `data/analysis/`에만 쓰기
- [x] **current/draft/archive 비접촉**: 해당 경로 접근 코드 없음
- [x] **추천/점수/picks 없음**: 판정 코드만 존재
- [x] **unavailable 명시**: `input_unavailable`로 기록. 조용히 숨기지 않음
- [x] **source provenance**: 모든 rule 결과에 `source` 키 포함
- [x] **processed 입력 기준**: snapshots 직접 읽지 않음
- [x] **유니버스 기준 유지**: processed 엔티티 기준으로만 판단. 하드코딩 없음
- [x] **운영 원칙 준수**:
  - V1 자동 수집 중심 원칙 유지
  - 사람은 Admin 최종 승인만 판단 (Soft Flag admin 검토 절차 준수)
  - 뉴스 관련 기능 없음
  - current/draft/archive 구조 변경 없음
  - snapshots/processed 독립 영역 유지

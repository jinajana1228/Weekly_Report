# V1 데이터 필드 요구사항

> **문서 목적**: V1 서비스 운영에 필요한 데이터 필드를 영역별로 정의하고, 각 필드가 어느 정책 문서·화면·JSON 구조와 연결되는지 매핑한다. "없으면 안 되는 필드"와 "있으면 좋은 필드"를 명확히 구분한다.
> 이 문서는 설계 문서이며, 실제 JSON 스키마 작성·코드 구현은 다음 단계에서 진행한다.
> 필드명은 개념적 표기이며, 실제 JSON 키 이름은 구현 단계에서 확정한다.

---

## 1. 시장 분석용 필수 데이터 필드

### 1-1. 글로벌 지표 필드

| 필드명 (개념) | 설명 | 연결 문서/화면/구조 | 우선순위 |
|------------|------|-----------------|---------|
| `global.us_sp500_weekly_return` | S&P 500 주간 등락률 (%) | V1_MARKET_ANALYSIS_LOGIC.md 글로벌 레이어, market_summary | 없으면 안 됨 |
| `global.us_nasdaq_weekly_return` | NASDAQ 주간 등락률 (%) | V1_MARKET_ANALYSIS_LOGIC.md 글로벌 레이어 | 없으면 안 됨 |
| `global.vix_level` | VIX 지수 현재 수준 및 전주 대비 변화 | 글로벌 시장 요약, ETF 우선 추천 판단 | 없으면 안 됨 |
| `global.us_10y_yield` | 미국 10년 국채 금리 (%) | 글로벌 시장 요약, favored_sectors 금리 환경 판단 | 없으면 안 됨 |
| `global.usd_krw` | 달러/원 환율 | 글로벌·국내 시장 요약, 수출 섹터 방향성 | 없으면 안 됨 |
| `global.fomc_stance` | 연준 현재 스탠스 (hawkish/neutral/dovish) | 글로벌 시장 요약, 금리 환경 판단 | 없으면 안 됨 |
| `global.wti_price` | WTI 유가 (달러/배럴) | 글로벌 시장 요약, ENERGY 섹터 판단 | 있으면 좋음 |
| `global.dxy_level` | 달러 인덱스 (DXY) | 글로벌 시장 요약 보완, 신흥국 자금 흐름 참조 | 있으면 좋음 |

### 1-2. 국내 거시 및 지수 필드

| 필드명 (개념) | 설명 | 연결 문서/화면/구조 | 우선순위 |
|------------|------|-----------------|---------|
| `domestic.kospi_weekly_return` | KOSPI 주간 등락률 (%) | V1_MARKET_ANALYSIS_LOGIC.md, market_summary | 없으면 안 됨 |
| `domestic.kosdaq_weekly_return` | KOSDAQ 주간 등락률 (%) | V1_MARKET_ANALYSIS_LOGIC.md, market_summary | 없으면 안 됨 |
| `domestic.foreign_net_buy_weekly` | 외국인 KOSPI 주간 순매수 (억 원) | 국내 수급 레이어, 수급 방향 판단 | 없으면 안 됨 |
| `domestic.institution_net_buy_weekly` | 기관 KOSPI 주간 순매수 (억 원) | 국내 수급 레이어, 수급 방향 판단 | 없으면 안 됨 |
| `domestic.bok_rate` | 한국은행 기준금리 (%) | 국내 시장 요약, 금리 환경 | 있으면 좋음 |
| `domestic.vkospi_level` | VKOSPI 수준 | 국내 변동성 판단, ETF 우선 추천 트리거 보완 | 있으면 좋음 |

### 1-3. 섹터·업종 필드

| 필드명 (개념) | 설명 | 연결 문서/화면/구조 | 우선순위 |
|------------|------|-----------------|---------|
| `sector.weekly_returns[]` | 서비스 13개 섹터별 주간 등락률 목록 | favored/cautious_sectors 판단, V1_MARKET_ANALYSIS_LOGIC.md | 없으면 안 됨 |
| `sector.krx_to_service_mapping` | KRX 업종 → 서비스 13개 섹터 변환 매핑 테이블 | sector.weekly_returns 계산 기반, 섹터 배지 | 없으면 안 됨 |

### 1-4. 시장 요약 및 섹터 방향성 필드

| 필드명 (개념) | 설명 | 연결 문서/화면/구조 | 우선순위 |
|------------|------|-----------------|---------|
| `market_summary.phase` | 현재 시장 국면 서술 (수동 입력) | market_summary 카드 표시, V1_MARKET_ANALYSIS_LOGIC.md | 없으면 안 됨 |
| `market_summary.key_variable` | 이번 주 핵심 변수 서술 (수동 입력) | market_summary 카드 표시 | 없으면 안 됨 |
| `market_summary.caution_point` | 주의 요인 서술 (수동 입력) | market_summary 카드 표시 | 없으면 안 됨 |
| `favored_sectors[]` | 이번 주 우호 섹터 목록 (서비스 13개 섹터 중) | 추천 로직 시장 적합도, 추천 카드 섹터 배지 | 없으면 안 됨 |
| `cautious_sectors[]` | 이번 주 주의 섹터 목록 | 추천 로직 시장 적합도, Admin 검수 | 없으면 안 됨 |

---

## 2. 추천 엔진용 필수 데이터 필드

### 2-1. Hard Filter용 필드

#### 공식 지정 필드

| 필드명 (개념) | 설명 | 연결 필터 | 우선순위 |
|------------|------|---------|---------|
| `exchange_status.is_management` | 관리종목 지정 여부 (boolean) | V1_HARD_FILTER 2-1 Hard Block | 없으면 안 됨 |
| `exchange_status.is_halted` | 거래정지 여부 (boolean) | V1_HARD_FILTER 2-1 Hard Block | 없으면 안 됨 |
| `exchange_status.audit_opinion` | 감사의견 코드 (clean/qualified/adverse/disclaimer) | V1_HARD_FILTER 2-1 Hard Block | 없으면 안 됨 |
| `exchange_status.investment_warning` | 투자경고 지정 여부 (boolean) | V1_HARD_FILTER 2-1 Hard Block | 없으면 안 됨 |
| `exchange_status.investment_danger` | 투자위험 지정 여부 (boolean) | V1_HARD_FILTER 2-1 Hard Block | 없으면 안 됨 |
| `exchange_status.short_term_overheating` | 단기과열 지정 여부 및 지정 기간 | V1_HARD_FILTER 2-1 Hard Block + 2-6 연동 | 없으면 안 됨 |
| `exchange_status.investment_caution` | 투자주의 지정 여부 (boolean) | V1_HARD_FILTER 2-1 Soft Flag | 없으면 안 됨 |

#### 재무 적자 필터 필드

| 필드명 (개념) | 설명 | 연결 필터 | 우선순위 |
|------------|------|---------|---------|
| `financials.ttm_operating_income` | TTM(최근 4분기) 영업이익 합산 | V1_HARD_FILTER 2-2 Soft Flag 판단 | 없으면 안 됨 |
| `financials.quarterly_op_income_recent` | 최근 분기 영업이익 | V1_HARD_FILTER 2-2 연속 적자 Hard Block | 없으면 안 됨 |
| `financials.quarterly_op_income_prev` | 직전 분기 영업이익 | V1_HARD_FILTER 2-2 연속 적자 Hard Block | 없으면 안 됨 |

#### 신규 상장·동전주 필터 필드

| 필드명 (개념) | 설명 | 연결 필터 | 우선순위 |
|------------|------|---------|---------|
| `listing.ipo_date` | 상장일 (YYYYMMDD) | V1_HARD_FILTER 2-3 6개월 미만 Hard Block | 없으면 안 됨 |
| `listing.market` | 상장 시장 (KOSPI/KOSDAQ/ETF) | V1_HARD_FILTER 2-5 시장별 기준 분기 | 없으면 안 됨 |
| `price.close` | 현재 종가 (원) | V1_HARD_FILTER 2-4 동전주 + 가격 위치 평가 | 없으면 안 됨 |

#### 저유동성·급등 필터 필드

| 필드명 (개념) | 설명 | 연결 필터 | 우선순위 |
|------------|------|---------|---------|
| `liquidity.avg_volume_20d` | 최근 20거래일 일평균 거래대금 (억 원) | V1_HARD_FILTER 2-5 Hard Block/Soft Flag | 없으면 안 됨 |
| `price.return_5d` | 최근 5거래일 등락률 (%) | V1_HARD_FILTER 2-6 Hard Block/Soft Flag | 없으면 안 됨 |
| `price.return_20d` | 최근 20거래일 등락률 (%) | V1_HARD_FILTER 2-6 Hard Block/Soft Flag | 없으면 안 됨 |

---

### 2-2. 단기 촉매 (Short-term Catalyst) 평가 필드

| 필드명 (개념) | 설명 | 연결 정책/화면 | 우선순위 |
|------------|------|------------|---------|
| `catalyst.earnings_date` | 다음 실적 발표 예정일 | V1_RECOMMENDATION_LOGIC.md 단기 촉매 | 없으면 안 됨 |
| `catalyst.recent_disclosure_summary` | 최근 주요 공시 요약 (계약·인허가·파트너십) | 단기 촉매 평가, 추천 카드 내러티브 | 없으면 안 됨 |
| `catalyst.earnings_surprise_flag` | 직전 실적 발표에서 어닝 서프라이즈 여부 | 단기 촉매 평가 | 있으면 좋음 |
| `catalyst.policy_tailwind` | 정책 수혜 여부 신호 (boolean 또는 방향 코드) | V1_RECOMMENDATION_LOGIC.md 정책 촉매 | 있으면 좋음 |
| `catalyst.index_event` | 지수 편입/제외 이벤트 여부 | 단기 촉매 평가 | 있으면 좋음 |

---

### 2-3. 가격 위치 (Price Position) 평가 필드

| 필드명 (개념) | 설명 | 연결 정책/화면 | 우선순위 |
|------------|------|------------|---------|
| `price.high_52w` | 52주 최고가 (원) | V1_RECOMMENDATION_LOGIC.md 가격 위치, 추천 카드 | 없으면 안 됨 |
| `price.low_52w` | 52주 최저가 (원) | V1_RECOMMENDATION_LOGIC.md 가격 위치, 추천 카드 | 없으면 안 됨 |
| `price.ma20` | 20일 이동평균 (원) | 가격 위치 평가 | 없으면 안 됨 |
| `price.ma60` | 60일 이동평균 (원) | 가격 위치 평가 | 없으면 안 됨 |
| `price.ma120` | 120일 이동평균 (원) | 가격 위치 평가 | 없으면 안 됨 |
| `price.interest_range.lower` | 관심 구간 하단 (원, 운영자 설정) | 추천 카드, 상세 리포트 | 없으면 안 됨 |
| `price.interest_range.upper` | 관심 구간 상단 (원, 운영자 설정) | 추천 카드, 상세 리포트 | 없으면 안 됨 |
| `price.rsi_14d` | 14일 RSI | 가격 위치 평가 보완 | 있으면 좋음 |

---

### 2-4. 수급 신호 (Supply/Demand Signal) 평가 필드

| 필드명 (개념) | 설명 | 연결 정책/화면 | 우선순위 |
|------------|------|------------|---------|
| `flow.foreign_net_5d` | 외국인 5거래일 순매수 (억 원) | V1_RECOMMENDATION_LOGIC.md 수급 신호 | 없으면 안 됨 |
| `flow.foreign_net_20d` | 외국인 20거래일 순매수 (억 원) | V1_RECOMMENDATION_LOGIC.md 수급 신호 | 없으면 안 됨 |
| `flow.institution_net_5d` | 기관 5거래일 순매수 (억 원) | V1_RECOMMENDATION_LOGIC.md 수급 신호 | 없으면 안 됨 |
| `flow.institution_net_20d` | 기관 20거래일 순매수 (억 원) | V1_RECOMMENDATION_LOGIC.md 수급 신호 | 없으면 안 됨 |
| `flow.short_sell_ratio` | 공매도 비중 (%) | 수급 신호 평가 보완 | 있으면 좋음 |

---

### 2-5. 시장 적합도 (Market Fit) 평가 필드

| 필드명 (개념) | 설명 | 연결 정책/화면 | 우선순위 |
|------------|------|------------|---------|
| `meta.sector` | 종목 소속 섹터 (서비스 13개 섹터 중 1개) | 섹터 분산 강제, 시장 적합도, 섹터 배지 | 없으면 안 됨 |
| `meta.market_cap_tier` | 시총 구간 (large/mid/small) | 시장 국면 정합성 판단 | 있으면 좋음 |
| `meta.beta` | KOSPI 또는 KOSDAQ 대비 베타 | 시장 변동성 민감도 판단 | 있으면 좋음 |

---

### 2-6. 재무 안전성 (Financial Safety) 평가 필드

| 필드명 (개념) | 설명 | 연결 정책/화면 | 우선순위 |
|------------|------|------------|---------|
| `financials.debt_to_equity` | 부채비율 (D/E Ratio, %) | 재무 안전성 평가 | 없으면 안 됨 |
| `financials.current_ratio` | 유동비율 | 단기 지급 능력 판단 | 있으면 좋음 |
| `financials.interest_coverage` | 이자보상배율 | 이자 비용 대비 안전성 | 있으면 좋음 |
| `financials.revenue_yoy` | 매출 전년 동기 대비 성장률 (%) | 성장성 방향 판단 보완 | 있으면 좋음 |
| `financials.burn_rate` | 현금소진율 (HEALTHCARE 섹터 한정) | V1_HARD_FILTER 2-2 바이오 예외 판단 | 있으면 좋음 (HEALTHCARE 한정) |

---

## 3. ETF 전용 필수 데이터 필드

> ETF에는 개별주 공통 필드(`exchange_status.*`, `listing.*`, `price.*`, `liquidity.*`, `meta.sector`)가 동일하게 적용된다. 재무 필드(`financials.*`)는 ETF에 적용하지 않는다.

| 필드명 (개념) | 설명 | 연결 정책/화면 | 우선순위 |
|------------|------|------------|---------|
| `etf.underlying_index` | 추종 지수명 (string) | ETF 상세 리포트, 추천 카드, Admin ETF 설명 검수 | 없으면 안 됨 |
| `etf.is_currency_hedged` | 환헤지 여부 (boolean) | ETF 상세 리포트, 리스크 설명, Admin ETF 검수 | 없으면 안 됨 |
| `etf.leverage_type` | 레버리지/인버스 타입 (1x/2x/-1x/-2x/none 등) | Hard Filter 2-6 급등 환산 기준, ETF 리스크 설명 | 없으면 안 됨 |
| `etf.ter` | 총보수 (TER, %, 연간) | ETF 상세 리포트, Admin ETF 검수 | 없으면 안 됨 |
| `etf.aum` | 운용 규모 (억 원) | ETF 상세 리포트, 저유동성 판단 보완 | 없으면 안 됨 |
| `etf.top_holdings[]` | 상위 구성 종목 목록 (종목명 + 비중) | ETF 상세 리포트 | 없으면 안 됨 |
| `etf.country_exposure{}` | 국가/지역 노출 비중 (%) | ETF 상세 리포트, 리스크 설명 | 있으면 좋음 |
| `etf.sector_exposure{}` | 섹터 노출 비중 (%) | ETF 상세 리포트 | 있으면 좋음 |
| `etf.nav_premium_discount` | NAV 대비 괴리율 (%) | ETF 가격 위치 평가 | 있으면 좋음 |
| `etf.has_lp` | LP(유동성공급자) 지정 여부 | Hard Filter 2-5 ETF 예외 판단 | 있으면 좋음 |
| `etf.distribution_yield` | 분배금 수익률 (%, 배당형 ETF 한정) | ETF 상세 리포트 (배당형 한정) | V1.1 확장 |

---

## 4. Admin 검수용 필수 데이터 필드

| 필드명 (개념) | 설명 | 연결 정책/화면 | 우선순위 |
|------------|------|------------|---------|
| `overlap_history.editions[].main_picks[]` | 최근 3개 에디션 메인 추천 티커 목록 | V1_RECOMMENDATION_POLICY_FINALIZATION.md 5절, Admin 검수 | 없으면 안 됨 |
| `overlap_history.editions[].alternatives[]` | 최근 에디션 alternatives 노출 티커 목록 | same_sector_alternatives 3-1절 강제 제거 기준 | 없으면 안 됨 |
| `approval.status` | 현재 에디션 검수 상태 (pending/approved/rejected/on_hold) | Admin 검수 화면 상태 관리 | 없으면 안 됨 |
| `approval.exception_picks[]` | 예외 승인 기록 배열 (ticker, exception_type, reason, approved_by, approved_at) | V1_RECOMMENDATION_POLICY_FINALIZATION.md 8-1절, Admin 검수 이력 | 없으면 안 됨 |
| `draft.soft_flag_items[]` | Soft Flag 종목 목록 및 플래그 사유 | V1_HARD_FILTER_POLICY.md 4절, Admin 검수 화면 | 없으면 안 됨 |
| `draft.cautious_sector_picks[]` | cautious_sectors 내 포함된 종목 목록 | V1_ADMIN_REVIEW_CRITERIA.md, Admin 검수 | 없으면 안 됨 |
| `report.structural_risks` | 구조적 리스크 필드 존재 및 내용 | V1_ADMIN_REVIEW_CRITERIA.md 리스크 누락 체크 | 없으면 안 됨 |
| `report.short_term_risks` | 단기 리스크 필드 존재 및 내용 | V1_ADMIN_REVIEW_CRITERIA.md 리스크 누락 체크 | 없으면 안 됨 |
| `report.bear_case_points` | 약세 시나리오 필드 존재 및 내용 | V1_ADMIN_REVIEW_CRITERIA.md 리스크 누락 체크 | 없으면 안 됨 |
| `alternatives.one_line_reason` | alternatives 각 종목의 추천 이유 (연속노출 라벨 포함) | V1_RECOMMENDATION_POLICY_FINALIZATION.md 3-1절 [연속노출] 라벨 | 없으면 안 됨 |
| `etf_report.underlying_index` | ETF 추종 지수 기재 여부 확인 | V1_ADMIN_REVIEW_CRITERIA.md ETF 설명 충분성 | 없으면 안 됨 |
| `etf_report.is_currency_hedged` | 환헤지 기재 여부 확인 | V1_ADMIN_REVIEW_CRITERIA.md ETF 설명 충분성 | 없으면 안 됨 |
| `etf_report.ter` | 총보수 기재 여부 확인 | V1_ADMIN_REVIEW_CRITERIA.md ETF 설명 충분성 | 없으면 안 됨 |
| `approval.review_memo` | 검수자 메모 (자유 텍스트) | Admin 검수 기록, 운영 이력 | 있으면 좋음 |
| `draft.market_summary_data_refs[]` | 시장 요약 문구 근거 수치 목록 | 시장 분석 문구 검수용 근거 | 있으면 좋음 |

---

## 5. 필드-정책 문서 연결 매핑 요약

| 정책 문서 | 핵심 연결 필드 |
|---------|-------------|
| V1_HARD_FILTER_POLICY.md 2-1 (공식 지정) | `exchange_status.*` 전체 7개 |
| V1_HARD_FILTER_POLICY.md 2-2 (적자) | `financials.ttm_operating_income`, `financials.quarterly_op_income_*` |
| V1_HARD_FILTER_POLICY.md 2-3 (신규 상장) | `listing.ipo_date` |
| V1_HARD_FILTER_POLICY.md 2-4 (동전주) | `price.close` |
| V1_HARD_FILTER_POLICY.md 2-5 (저유동성) | `liquidity.avg_volume_20d`, `listing.market`, `etf.has_lp` |
| V1_HARD_FILTER_POLICY.md 2-6 (급등) | `price.return_5d`, `price.return_20d`, `etf.leverage_type` |
| V1_RECOMMENDATION_LOGIC.md 단기 촉매 | `catalyst.*` |
| V1_RECOMMENDATION_LOGIC.md 가격 위치 | `price.*` (ma, 52w, rsi, interest_range) |
| V1_RECOMMENDATION_LOGIC.md 수급 신호 | `flow.*` |
| V1_RECOMMENDATION_LOGIC.md 시장 적합도 | `meta.sector`, `favored_sectors[]`, `cautious_sectors[]` |
| V1_RECOMMENDATION_LOGIC.md 재무 안전성 | `financials.*` |
| V1_RECOMMENDATION_POLICY_FINALIZATION.md 5절 (3주 연속 금지) | `overlap_history.*` |
| V1_RECOMMENDATION_POLICY_FINALIZATION.md 3-1절 ([연속노출] 라벨) | `alternatives.one_line_reason` |
| V1_RECOMMENDATION_POLICY_FINALIZATION.md 8-1절 (exception_picks) | `approval.exception_picks[]` |
| V1_ADMIN_REVIEW_CRITERIA.md | `approval.*`, `draft.soft_flag_items[]`, `report.*`, `etf_report.*` |
| V1_MARKET_ANALYSIS_LOGIC.md | `global.*`, `domestic.*`, `sector.*`, `market_summary.*`, `favored_sectors[]`, `cautious_sectors[]` |

---

## 6. 필드 우선순위 분류 요약

### "없으면 안 되는 필드" — V1 Day 1 필수

아래 필드가 없으면 특정 기능이 작동하지 않거나 발행이 불가능하다.

**Hard Filter 동작 불가 필드** (모두 없으면 안 됨):
- `exchange_status.*` 전체 (관리/정지/경고/위험/과열/주의)
- `financials.ttm_operating_income`, `financials.quarterly_op_income_*` (2개)
- `listing.ipo_date`, `listing.market`
- `price.close`, `price.return_5d`, `price.return_20d`
- `liquidity.avg_volume_20d`

**추천 평가 동작 불가 필드** (없으면 안 됨):
- `meta.sector`, `favored_sectors[]`, `cautious_sectors[]`
- `price.high_52w`, `price.low_52w`, `price.ma20`, `price.ma60`, `price.ma120`
- `price.interest_range.lower`, `price.interest_range.upper`
- `flow.foreign_net_5d`, `flow.foreign_net_20d`, `flow.institution_net_5d`, `flow.institution_net_20d`
- `catalyst.earnings_date`, `catalyst.recent_disclosure_summary`
- `financials.debt_to_equity`

**시장 분석 동작 불가 필드** (없으면 안 됨):
- `global.us_sp500_weekly_return`, `global.us_nasdaq_weekly_return`
- `global.vix_level`, `global.us_10y_yield`, `global.usd_krw`, `global.fomc_stance`
- `domestic.kospi_weekly_return`, `domestic.kosdaq_weekly_return`
- `domestic.foreign_net_buy_weekly`, `domestic.institution_net_buy_weekly`
- `sector.weekly_returns[]`, `sector.krx_to_service_mapping`
- `market_summary.phase`, `market_summary.key_variable`, `market_summary.caution_point`

**ETF 필수 필드** (없으면 안 됨):
- `etf.underlying_index`, `etf.is_currency_hedged`, `etf.leverage_type`
- `etf.ter`, `etf.aum`, `etf.top_holdings[]`

**Admin 검수 필수 필드** (없으면 안 됨):
- `overlap_history.editions[].main_picks[]`, `overlap_history.editions[].alternatives[]`
- `approval.status`, `approval.exception_picks[]`
- `draft.soft_flag_items[]`, `draft.cautious_sector_picks[]`
- `report.structural_risks`, `report.short_term_risks`, `report.bear_case_points`
- `alternatives.one_line_reason`
- `etf_report.underlying_index`, `etf_report.is_currency_hedged`, `etf_report.ter`

---

### "있으면 좋은 필드" — 운영 안정화 후 추가 권장

| 분야 | 필드 목록 |
|-----|---------|
| 글로벌 지표 | `global.wti_price`, `global.dxy_level` |
| 국내 거시 | `domestic.bok_rate`, `domestic.vkospi_level` |
| 가격 위치 | `price.rsi_14d` |
| 수급 신호 | `flow.short_sell_ratio` |
| 시장 적합도 | `meta.market_cap_tier`, `meta.beta` |
| 재무 안전성 | `financials.current_ratio`, `financials.interest_coverage`, `financials.revenue_yoy`, `financials.burn_rate` (HEALTHCARE 한정) |
| 단기 촉매 | `catalyst.earnings_surprise_flag`, `catalyst.policy_tailwind`, `catalyst.index_event` |
| ETF 전용 | `etf.country_exposure`, `etf.sector_exposure`, `etf.nav_premium_discount`, `etf.has_lp` |
| Admin 검수 | `approval.review_memo`, `draft.market_summary_data_refs[]` |

---

### "V1.1 이상 확장 가능 필드"

| 필드 | 확장 이유 |
|-----|---------|
| `etf.distribution_yield` | 배당형 ETF 수익 구조 설명 필요 시 |
| `flow.loan_balance_trend` | 대차잔고 공매도 선행 신호 분석 시 |
| `analyst.report_direction` | 기관 리포트 방향 집계 시스템 구축 시 |
| `sector.short_sell_ratio[]` | 섹터별 공매도 비중 추적 시 |
| `global.sector_index_sox` | 글로벌 반도체 지수 등 섹터 연동 강화 시 |
| `market_summary.news_signals[]` | 뉴스 신호 구조화 파일 분리 저장 시 |

---

## 7. Self-check before implementation

### 이번 문서에서 내가 정의한 필수 데이터 항목
- 시장 분석용: 18개 필드 (없으면 안 됨 14개 + 있으면 좋음 4개)
- Hard Filter용: 17개 필드 (전부 없으면 안 됨)
- 추천 평가 5개 축별: 단기촉매 5개 / 가격위치 8개 / 수급 5개 / 시장적합도 3개 / 재무안전성 5개
- ETF 전용: 11개 필드 (없으면 안 됨 6개 + 있으면 좋음 4개 + V1.1 확장 1개)
- Admin 검수용: 15개 필드 (없으면 안 됨 13개 + 있으면 좋음 2개)

### 이번 문서에서 권장안으로 제시한 것
- 필드-정책문서 연결 매핑 (어떤 필드가 어떤 정책 문서와 연결되는지)
- 필드 우선순위 3단계 분류 (없으면 안 됨 / 있으면 좋음 / V1.1 확장)
- 개별주-ETF 공용 필드와 ETF 전용 필드 구분 원칙

### 아직 최종 확정하지 않은 것
- 실제 JSON 키 이름 (이 문서의 필드명은 개념적 표기)
- 필드 타입 정의 (string/number/boolean/array 등 스키마 확정)
- ETF와 개별주 공통 JSON 구조 vs 분리 구조 결정
- 수치 단위 기준 (거래대금 단위 — 원 / 백만 원 / 억 원 등)
- KRX 업종 → 서비스 섹터 매핑 테이블 실제 내용

### 구현 전에 사용자가 최종 판단해야 하는 항목
- JSON 스키마 설계 방향 (종목별 단일 파일 vs 분리 파일)
- 필드 타입 및 단위 기준 확정
- "있으면 좋은 필드"의 V1 포함 여부 결정
- ETF 메타 필드의 갱신 주기 및 관리 책임 확정

### 내가 임의로 구현하거나 기존 구조를 바꾸지 않은 것
- 코드 없음
- 실제 JSON 파일 수정 없음
- 기존 정책 문서 변경 없음
- 기존 UI/컴포넌트 변경 없음
- 빌드/실행 없음

---

> 이 문서는 V1 데이터 필드 요구사항 설계 문서다.
> 실제 JSON 스키마 설계 및 구현은 이 문서를 기반으로 다음 단계에서 진행한다.

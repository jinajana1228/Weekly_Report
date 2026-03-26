# V1 개념 필드 → 실제 JSON 키 매핑

> **문서 목적**: 기존 정책 문서에서 정의한 개념 필드를 V1 파일 기반 운영에서 실제로 사용할 JSON 키로 매핑한다.
> 이 문서는 구현자가 실제 파일을 작성하거나 파서를 설계할 때 참조하는 설계 문서다.
> 실제 JSON 파일 수정·코드 구현은 이 문서를 기반으로 다음 단계에서 진행한다.

---

## 1. 네이밍 규칙

| 규칙 | 내용 |
|------|------|
| 케이스 | `snake_case` 통일 |
| 배열 | 복수형 키명 + `[]` 표기 (예: `picks`, `favored_sectors`) |
| 중첩 객체 | 점 표기법으로 경로 표현 (예: `market_summary.global.sentiment`) |
| ID 필드 | `_id` suffix 사용 (예: `week_id`, `signal_id`, `report_id`) |
| 날짜/시각 | ISO 8601 문자열 (예: `"2026-03-25T09:00:00+09:00"`) |
| 불리언 | `is_` prefix (예: `is_approved`, `is_discarded`) |
| 상태 enum | 대문자 스네이크 (예: `"APPROVED"`, `"PENDING"`) |

**ID 형식 규칙 (확정)**:

| 식별자 | 형식 | 예시 |
|--------|------|------|
| `week_id` | `YYYY-WNN` | `2026-W13` |
| `report_id` | `RPT-{YYYY-WNN}` | `RPT-2026-W13` |
| `detail_report_id` | `DTL-{week_id}-{ticker}` | `DTL-2026-W13-005930` |
| `signal_id` | `ns_{YYYYMMDD}_{scope_prefix}_{seq}` | `ns_20260325_s_001` |

> **중요**: 리포트 상태(`DRAFT` / `CURRENT` / `ARCHIVED`)는 JSON 내 필드로 저장하지 않는다.
> 파일 위치(`data/draft/` / `data/current/` / `data/archive/`)로 결정된다.

---

## 2. 영역별 JSON 키 매핑

### 2-1. 시장 분석 영역

**저장 파일**:
- `data/current/current.json` (최신 발행본)
- `data/draft/{YYYY-WNN}.json` (초안)
- `data/archive/{YYYY-WNN}.json` (이전 발행본)

(메인 리포트 최상위 `market_summary` 섹션)

| 개념 필드 | 실제 키 | 타입 | 필수 | 설명 |
|---------|--------|------|------|------|
| 주간 식별자 | `week_id` | string | ✅ | 예: `"2026-W13"`. 파일명과 반드시 일치 |
| 리포트 ID | `report_id` | string | ✅ | 예: `"RPT-2026-W13"` |
| 스키마 버전 | `schema_version` | string | ✅ | V1 고정값: `"1.0"` |
| 데이터 기준일 | `data_as_of` | string (YYYY-MM-DD) | ✅ | 종목·시장 데이터 기준일 |
| draft 생성 시각 | `generated_at` | string (ISO 8601) | ✅ | draft 생성 시각. current/archive도 포함 |
| 발행 완료 시각 | `published_at` | string (ISO 8601) | 조건부 | current/archive: 필수. draft: null |
| archive 이동 시각 | `archived_at` | string (ISO 8601) | 조건부 | archive만 필수. current/draft: 미포함 |
| 시장 국면 서술 | `market_summary.phase` | string | ✅ | 예: `"완만한 반등 국면"` |
| 핵심 변수 서술 | `market_summary.key_variable` | string | ✅ | 예: `"FOMC 금리 결정 방향"` |
| 주의 요인 서술 | `market_summary.caution_point` | string | ✅ | 예: `"원화 약세 지속 가능성"` |
| 핵심 수치 근거 목록 | `market_summary.data_refs[]` | array of object | 선택 | 시장 요약 문구의 수치 근거 (내부 구조 미확정) |
| 글로벌 헤드라인 | `market_summary.global.headline` | string | ✅ | 확정 필드 |
| 주요 지수 변화 | `market_summary.global.key_index_changes[]` | array of object | ✅ | 확정 필드. S&P500·NASDAQ·VIX 등 포함 |
| 글로벌 센티멘트 | `market_summary.global.sentiment` | enum string | ✅ | 확정 필드. `"positive"` / `"neutral"` / `"negative"` |
| S&P500 주간 등락률 | `market_summary.global.sp500_weekly_return` | number | ✅ | 단위: % |
| NASDAQ 주간 등락률 | `market_summary.global.nasdaq_weekly_return` | number | ✅ | 단위: % |
| VIX 수준 | `market_summary.global.vix_level` | number | ✅ | 절대값 |
| 미국 10년 국채 금리 | `market_summary.global.us_10y_yield` | number | ✅ | 단위: % |
| USD/KRW 환율 | `market_summary.global.usd_krw` | number | ✅ | 원 단위 |
| FOMC 스탠스 | `market_summary.global.fomc_stance` | enum string | ✅ | `"hawkish"` / `"neutral"` / `"dovish"` |
| WTI 유가 | `market_summary.global.wti_price` | number | 선택 | 달러/배럴 |
| DXY 달러 인덱스 | `market_summary.global.dxy_level` | number | 선택 | 절대값 |
| KOSPI 주간 등락률 | `market_summary.domestic.kospi` | number | ✅ | 확정 필드. 단위: % |
| KOSDAQ 주간 등락률 | `market_summary.domestic.kosdaq` | number | ✅ | 확정 필드. 단위: % |
| 섹터 하이라이트 | `market_summary.domestic.sector_highlights[]` | array of object | ✅ | 확정 필드 |
| 주간 테마 | `market_summary.domestic.week_theme` | string | ✅ | 확정 필드 |
| 외국인 KOSPI 주간 순매수 | `market_summary.domestic.foreign_net_buy_weekly` | number | ✅ | 단위: 억 원 |
| 기관 KOSPI 주간 순매수 | `market_summary.domestic.institution_net_buy_weekly` | number | ✅ | 단위: 억 원 |
| 한국은행 기준금리 | `market_summary.domestic.bok_rate` | number | 선택 | 단위: % |
| 우호 섹터 목록 | `favored_sectors[]` | array of string | ✅ | 서비스 섹터 코드 목록 |
| 주의 섹터 목록 | `cautious_sectors[]` | array of string | ✅ | 서비스 섹터 코드 목록 |
| 섹터별 주간 등락률 | `sector_returns[]` | array of object | ✅ | `{sector_code, weekly_return}` 형태 |

> **보정 메모**: 이전 설계의 `global_indicators.*` / `domestic_indicators.*` 키는 `market_summary.global.*` / `market_summary.domestic.*` 하위로 통합했다. `V1_JSON_SCHEMA.md` 확정 구조 기준.

---

### 2-2. 메인 추천 pick 영역

**저장 파일**: 위 2-1절과 동일 (메인 리포트 `picks[]` 배열)

| 개념 필드 | 실제 키 | 타입 | 필수 | 설명 |
|---------|--------|------|------|------|
| 추천 순위 | `picks[].rank` | integer | ✅ | 1~5 |
| 종목 티커 | `picks[].ticker` | string | ✅ | 예: `"005930"` |
| 종목명 | `picks[].name` | string | ✅ | 예: `"삼성전자"` |
| 섹터 코드 | `picks[].sector` | enum string | ✅ | 서비스 13개 섹터 중 1개 |
| 추천 유형 (개별주/ETF) | `picks[].asset_type` | enum string | ✅ | `"STOCK"` / `"ETF"` |
| 스탠스 | `picks[].stance` | string | ✅ | 확정 필드 |
| 한 줄 추천 이유 | `picks[].one_line_reason` | string | ✅ | 최대 100자 |
| 관심 구간 하단 | `picks[].price_zone.watch_low` | integer | ✅ | 원 단위 |
| 관심 구간 상단 | `picks[].price_zone.watch_high` | integer | ✅ | 원 단위 |
| 상세 리포트 참조 ID | `picks[].detail_report_id` | string | ✅ | 예: `"DTL-2026-W13-005930"` |
| 직전 주 연속 추천 여부 | `picks[].is_consecutive` | boolean | ✅ | Hard Filter 연속 추천 여부 |
| 예외 적용 여부 | `picks[].has_exception` | boolean | ✅ | `approval.json`의 예외 기록과 연동 여부 |
| Soft Flag 여부 | `picks[].has_soft_flag` | boolean | ✅ | Soft Flag 종목 여부 |
| 동일 섹터 대안 목록 | `picks[].same_sector_alternatives[]` | array of object | ✅ | 아래 구조 참조 |

**`same_sector_alternatives[]` 내부 구조**:

| 개념 필드 | 실제 키 | 타입 | 필수 | 설명 |
|---------|--------|------|------|------|
| 대안 티커 | `ticker` | string | ✅ | |
| 대안 종목명 | `name` | string | ✅ | |
| 한 줄 이유 | `one_line_reason` | string | ✅ | 최대 80자. [연속노출] 라벨 포함 가능 |
| 연속 노출 라벨 | `is_repeat_exposure` | boolean | ✅ | `[연속노출]` 해당 여부 |

> **보정 메모**: `picks[].interest_range.lower/upper`는 `picks[].price_zone.watch_low/watch_high`로 수정했다. `V1_JSON_SCHEMA.md` 확정 키 기준.

---

### 2-3. 상세 리포트 영역 — 개별주 (Stock Detail Report)

**저장 파일**:
- `data/current/details/stock_{ticker}.json`
- `data/draft/details/stock_{ticker}.json`
- `data/archive/details/stock_{ticker}.json`

> **archive detail 경로 주의**: archive 상세 리포트는 에디션별 하위 폴더로 분리되지 않는다. `data/archive/details/`가 모든 아카이브 에디션의 상세 파일을 담는 단일 폴더다. `V1_JSON_SCHEMA.md` / `V1_SAMPLE_DATA_GUIDE.md` 확정 구조 기준.

| 개념 필드 | 실제 키 | 타입 | 필수 | 설명 |
|---------|--------|------|------|------|
| 상세 리포트 ID | `detail_report_id` | string | ✅ | 예: `"DTL-2026-W13-005930"` |
| 주간 식별자 참조 | `week_id` | string | ✅ | 상위 메인 리포트 연결. 예: `"2026-W13"` |
| 종목 티커 | `ticker` | string | ✅ | |
| 종목명 | `name` | string | ✅ | |
| 섹터 코드 | `sector` | enum string | ✅ | |
| 현재 종가 | `price.close` | integer | ✅ | 원 |
| 52주 최고가 | `price.high_52w` | integer | ✅ | 원 |
| 52주 최저가 | `price.low_52w` | integer | ✅ | 원 |
| 20일 이동평균 | `price.ma20` | integer | ✅ | 원 |
| 60일 이동평균 | `price.ma60` | integer | ✅ | 원 |
| 120일 이동평균 | `price.ma120` | integer | ✅ | 원 |
| 관심 구간 하단 | `price.price_zone.watch_low` | integer | ✅ | 원 |
| 관심 구간 상단 | `price.price_zone.watch_high` | integer | ✅ | 원 |
| 5거래일 등락률 | `price.return_5d` | number | ✅ | % |
| 20거래일 등락률 | `price.return_20d` | number | ✅ | % |
| 14일 RSI | `price.rsi_14d` | number | 선택 | |
| 20거래일 일평균 거래대금 | `liquidity.avg_volume_20d` | number | ✅ | 억 원 |
| 상장 시장 | `listing.market` | enum string | ✅ | `"KOSPI"` / `"KOSDAQ"` |
| 상장일 | `listing.ipo_date` | string (ISO date) | ✅ | |
| 외국인 5일 순매수 | `flow.foreign_net_5d` | number | ✅ | 억 원 |
| 외국인 20일 순매수 | `flow.foreign_net_20d` | number | ✅ | 억 원 |
| 기관 5일 순매수 | `flow.institution_net_5d` | number | ✅ | 억 원 |
| 기관 20일 순매수 | `flow.institution_net_20d` | number | ✅ | 억 원 |
| 공매도 비중 | `flow.short_sell_ratio` | number | 선택 | % |
| 다음 실적 발표일 | `catalyst.earnings_date` | string (ISO date) | ✅ | |
| 최근 주요 공시 요약 | `catalyst.recent_disclosure_summary` | string | ✅ | 최대 200자 |
| 어닝 서프라이즈 여부 | `catalyst.earnings_surprise_flag` | boolean | 선택 | |
| 정책 수혜 신호 | `catalyst.policy_tailwind` | boolean | 선택 | |
| 지수 이벤트 여부 | `catalyst.index_event` | boolean | 선택 | |
| TTM 영업이익 | `financials.ttm_operating_income` | number | ✅ | 억 원 |
| 최근 분기 영업이익 | `financials.quarterly_op_income_recent` | number | ✅ | 억 원 |
| 직전 분기 영업이익 | `financials.quarterly_op_income_prev` | number | ✅ | 억 원 |
| 부채비율 | `financials.debt_to_equity` | number | ✅ | % |
| 유동비율 | `financials.current_ratio` | number | 선택 | |
| 이자보상배율 | `financials.interest_coverage` | number | 선택 | |
| 매출 YoY 성장률 | `financials.revenue_yoy` | number | 선택 | % |
| 시총 구간 | `meta.market_cap_tier` | enum string | 선택 | `"large"` / `"mid"` / `"small"` |
| 베타 | `meta.beta` | number | 선택 | |
| 관리종목 여부 | `exchange_status.is_management` | boolean | ✅ | |
| 거래정지 여부 | `exchange_status.is_halted` | boolean | ✅ | |
| 감사의견 코드 | `exchange_status.audit_opinion` | enum string | ✅ | `"clean"` / `"qualified"` / `"adverse"` / `"disclaimer"` |
| 투자경고 여부 | `exchange_status.investment_warning` | boolean | ✅ | |
| 투자위험 여부 | `exchange_status.investment_danger` | boolean | ✅ | |
| 단기과열 여부 | `exchange_status.short_term_overheating` | boolean | ✅ | |
| 투자주의 여부 | `exchange_status.investment_caution` | boolean | ✅ | |
| 구조적 리스크 목록 | `narrative.structural_risks[]` | array of string | ✅ | Admin 검수 필수 항목 |
| 단기 리스크 목록 | `narrative.short_term_risks[]` | array of string | ✅ | Admin 검수 필수 항목 |
| 약세 시나리오 목록 | `narrative.bear_case_points[]` | array of string | ✅ | Admin 검수 필수 항목 |
| 추천 이유 상세 | `narrative.recommendation_rationale` | string | ✅ | |
| 연결된 뉴스 신호 ID 목록 | `linked_signal_ids[]` | array of string | 선택 | 승인된 신호만 참조 |

> **보정 메모**: 저장 경로는 `reports/detail/{detail_report_id}.json`에서 `{state}/details/stock_{ticker}.json`으로 수정했다. `detail_report_id` 형식은 `dr_{ticker}_{YYYYMMDD}`에서 `DTL-{week_id}-{ticker}`로, `edition_id` 참조는 `week_id`로 수정했다. `V1_JSON_SCHEMA.md` / `V1_SAMPLE_DATA_GUIDE.md` 확정 구조 기준.

---

### 2-4. 상세 리포트 영역 — ETF (ETF Detail Report)

**저장 파일**:
- `data/current/details/etf_{ticker}.json`
- `data/draft/details/etf_{ticker}.json`
- `data/archive/details/etf_{ticker}.json`

개별주와 공통으로 사용하는 필드: `price.*`, `liquidity.*`, `listing.*`, `exchange_status.*`, `meta.*`, `narrative.*`, `linked_signal_ids[]`

**ETF 전용 추가 필드**:

| 개념 필드 | 실제 키 | 타입 | 필수 | 설명 |
|---------|--------|------|------|------|
| 추종 지수명 | `etf.underlying_index` | string | ✅ | |
| 환헤지 여부 | `etf.is_currency_hedged` | boolean | ✅ | |
| 레버리지 타입 | `etf.leverage_type` | enum string | ✅ | `"1x"` / `"2x"` / `"-1x"` / `"-2x"` / `"none"` |
| 총보수 (TER) | `etf.ter` | number | ✅ | % 연간 |
| 운용 규모 (AUM) | `etf.aum` | number | ✅ | 억 원 |
| 상위 구성 종목 | `etf.top_holdings[]` | array of object | ✅ | `{name, weight}` 형태 |
| 국가/지역 노출 | `etf.country_exposure{}` | object | 선택 | 키: 국가명, 값: 비중(%) |
| 섹터 노출 | `etf.sector_exposure{}` | object | 선택 | 키: 섹터명, 값: 비중(%) |
| NAV 괴리율 | `etf.nav_premium_discount` | number | 선택 | % |
| LP 지정 여부 | `etf.has_lp` | boolean | 선택 | |
| 분배금 수익률 | `etf.distribution_yield` | number | 선택 | % (V1.1 확장) |

---

### 2-5. 뉴스 신호 데이터 영역

**저장 파일**: `data/news_signals/{week_id}/{scope}_signals.json`
(예: `data/news_signals/2026-W13/sector_signals.json`)
(상세 구조는 V1_NEWS_SIGNAL_FILE_SCHEMA.md 참조)

| 개념 필드 | 실제 키 | 타입 | 필수 | 설명 |
|---------|--------|------|------|------|
| 신호 고유 ID | `signal_id` | string | ✅ | 예: `"ns_20260325_s_001"` |
| 주간 식별자 참조 | `week_id` | string | ✅ | 상위 에디션 연결. 예: `"2026-W13"` |
| 영향 범위 | `scope` | enum string | ✅ | `"MARKET"` / `"SECTOR"` / `"STOCK"` / `"ETF"` |
| 방향성 | `direction` | enum string | ✅ | `"bullish"` / `"bearish"` / `"neutral"` |
| 신호 강도 | `signal_level` | enum string | ✅ | `"strong"` / `"moderate"` / `"weak"` |
| 신뢰도 | `confidence` | enum string | ✅ | `"high"` / `"medium"` / `"low"` |
| 촉매 유형 | `catalyst_type` | enum string | ✅ | `"POLICY"` / `"EARNINGS"` / `"REGULATORY"` / `"MACRO"` / `"SECTOR_TREND"` / `"OTHER"` |
| 신호 유효 기간 | `relevance_window` | enum string | ✅ | `"this_week"` / `"1_2_weeks"` / `"1_month"` / `"beyond"` |
| 출처 이름 | `source_name` | string | ✅ | |
| 발행 시각 | `published_at` | string (ISO 8601) | ✅ | |
| 제목 요약 | `headline_summary` | string | ✅ | 최대 80자. 기사 전문 금지 |
| 서비스 관련 이유 | `why_it_matters` | string | ✅ | 최대 150자 |
| 관련 섹터 코드 | `related_sector_code` | enum string | scope별 필수 | SECTOR/STOCK/ETF에서 필수 |
| 관련 티커 | `related_ticker` | string | scope별 필수 | STOCK/ETF에서 필수 |
| 수치 방향 일치 여부 | `sector_direction_alignment` | enum string | 선택 | `"aligned"` / `"conflicting"` / `"neutral"` |
| 후보군 포함 여부 | `is_pick_candidate` | boolean | 선택 | STOCK에서만 사용 |
| 촉매 연결 여부 | `catalyst_connected` | boolean | STOCK 필수 | |
| 중복 묶음 ID | `duplicate_group_id` | string | 선택 | null이면 단독 신호 |
| admin 검수 필요 플래그 | `admin_review_needed` | boolean | ✅ | 자동 설정 |
| 시장 영향 지역 | `market_impact_region` | enum string | MARKET 필수 | `"DOMESTIC"` / `"US"` / `"GLOBAL"` |
| 연관 수치 지표명 | `related_indicator` | string | 선택 | MARKET에서 사용 |
| ETF 기초지수명 | `related_underlying_index` | string | 선택 | ETF에서 사용 |
| ETF 섹터 코드 | `etf_sector_code` | enum string | ETF 필수 | `"ETF_DOMESTIC"` / `"ETF_OVERSEAS"` / `"ETF_BOND_DIV"` |

---

### 2-6. 뉴스 검수 데이터 영역

**저장 파일**: `data/news_signals/{week_id}/signal_review.json`

| 개념 필드 | 실제 키 | 타입 | 필수 | 설명 |
|---------|--------|------|------|------|
| 참조 신호 ID | `signal_id` | string | ✅ | 원본 신호 파일 참조 |
| 검수 상태 | `review_status` | enum string | ✅ | `"PENDING"` / `"APPROVED"` / `"DISCARDED"` / `"ON_HOLD"` |
| 검수자 | `reviewed_by` | string | 선택 | admin 식별자 |
| 검수 시각 | `reviewed_at` | string (ISO 8601) | 선택 | 검수 완료 시각 |
| 유효성 메모 | `validation_note` | string | 선택 | 최대 200자. 검수 보완 |
| 폐기 사유 코드 | `discard_reason` | enum string | 선택 | `"LOW_CONFIDENCE"` / `"RUMOR"` / `"DUPLICATE"` / `"OUTDATED"` / `"WEAK_RELEVANCE"` / `"OTHER"` |
| 리포트 반영 여부 | `is_used_in_report` | boolean | ✅ | 승인 후 실제 리포트에 반영되었는지 |
| 대표 신호 여부 | `is_representative` | boolean | 선택 | 중복 그룹 내 대표 신호 여부 |

---

### 2-7. Admin Approval 영역

**저장 파일**: `data/manifests/approval.json`

> **중요**: 이 파일은 `draft/approval.json`이 아니라 `data/manifests/approval.json`이다. `V1_JSON_SCHEMA.md` 확정 경로 기준.

#### 확정 스키마 (6개 필드)

| 개념 필드 | 실제 키 | 타입 | 필수 | 설명 |
|---------|--------|------|------|------|
| 초안 리포트 참조 ID | `draft_report_id` | string | ✅ | 예: `"RPT-2026-W13"` |
| 초안 주간 식별자 | `draft_week_id` | string | ✅ | 예: `"2026-W13"` |
| 검수 결정 | `decision` | enum string | ✅ | `"pending"` / `"approved"` / `"rejected"` / `"on_hold"` (소문자) |
| 검수자 | `reviewed_by` | string | ✅ | admin 식별자. 검수 전: null |
| 검수 시각 | `reviewed_at` | string (ISO 8601) | ✅ | 검수 전: null |
| 검수 메모 | `notes` | string | 선택 | 자유 형식 메모 |

#### 미확정 확장 필드 (설계 제안, 구현 단계에서 사용자 판단 필요)

아래 필드는 V1_RECOMMENDATION_POLICY_FINALIZATION.md 및 V1_NEWS_SIGNAL_REVIEW_AND_FALLBACK.md에서 필요성이 제안되었으나, `V1_JSON_SCHEMA.md` 확정 스키마에는 포함되지 않은 항목이다. 구현 단계에서 채택 여부를 결정한다.

| 후보 키 | 타입 | 제안 이유 |
|---------|------|---------|
| `exception_picks[]` | array of object | 예외 승인 기록 관리 |
| `soft_flag_items[]` | array of object | Soft Flag 종목 목록 |
| `cautious_sector_picks[]` | array of string | cautious 섹터 내 종목 |
| `news_signal_review_status` | enum string | `"SUFFICIENT"` / `"PARTIAL"` / `"SPARSE"` / `"FALLBACK"` |
| `has_news_signal_issues` | boolean | signal_review에 ON_HOLD 존재 여부 |

---

## 3. 파일별 키 사용 범위 요약

| 파일 | 포함되는 주요 최상위 키 |
|------|---------------------|
| `data/current/current.json` / `data/draft/{YYYY-WNN}.json` | `week_id`, `report_id`, `schema_version`, `data_as_of`, `generated_at`, `published_at`, `market_summary`, `favored_sectors`, `cautious_sectors`, `sector_returns`, `picks[]` |
| `data/{state}/details/stock_{ticker}.json` | `detail_report_id`, `week_id`, `ticker`, `sector`, `price`, `liquidity`, `listing`, `flow`, `catalyst`, `financials`, `exchange_status`, `narrative`, `linked_signal_ids` |
| `data/{state}/details/etf_{ticker}.json` | 위 stock 파일과 동일 (financials 제외) + `etf` |
| `data/news_signals/{week_id}/{scope}_signals.json` | `signal_id`, `week_id`, `scope`, `direction`, `signal_level`, `confidence`, `catalyst_type`, `relevance_window`, `source_name`, `published_at`, `headline_summary`, `why_it_matters`, scope별 추가 필드 |
| `data/news_signals/{week_id}/signal_review.json` | `signal_id`, `review_status`, `reviewed_by`, `reviewed_at`, `validation_note`, `discard_reason`, `is_used_in_report`, `is_representative` |
| `data/manifests/approval.json` | `draft_report_id`, `draft_week_id`, `decision`, `reviewed_by`, `reviewed_at`, `notes` (확정 6개) |
| `admin/overlap_history.json` | `schema_version`, `last_updated_at`, `recent_editions[]` (각 에디션의 `week_id`, `published_at`, `main_picks[]`) |

> **`overlap_history.json` 주의**: 배열 키는 `editions[]`가 아니라 `recent_editions[]`다 (`V1_JSON_SCHEMA.md` 확정). `alternatives[]`는 확정 스키마에 없으며, 필요 시 추가 논의 후 채택한다.

---

## 4. 기존 정책 문서 연결 관계

| 키 그룹 | 연결 정책 문서 |
|--------|-------------|
| `exchange_status.*` | V1_HARD_FILTER_POLICY.md 2-1절 |
| `financials.*` | V1_HARD_FILTER_POLICY.md 2-2절, V1_DATA_FIELD_REQUIREMENTS.md 2-6절 |
| `listing.ipo_date` | V1_HARD_FILTER_POLICY.md 2-3절 |
| `price.close` | V1_HARD_FILTER_POLICY.md 2-4절 |
| `liquidity.avg_volume_20d` | V1_HARD_FILTER_POLICY.md 2-5절 |
| `price.return_5d`, `price.return_20d` | V1_HARD_FILTER_POLICY.md 2-6절 |
| `catalyst.*` | V1_RECOMMENDATION_LOGIC.md 단기 촉매 섹션 |
| `flow.*` | V1_RECOMMENDATION_LOGIC.md 수급 신호 섹션 |
| `favored_sectors[]`, `cautious_sectors[]` | V1_MARKET_ANALYSIS_LOGIC.md |
| `narrative.structural_risks[]` 외 | V1_ADMIN_REVIEW_CRITERIA.md |
| `approval.json` 확장 후보 (`exception_picks[]` 등) | V1_RECOMMENDATION_POLICY_FINALIZATION.md 8-1절 |
| `signal_id`, `scope`, `direction` 외 | V1_NEWS_SIGNAL_DATA_POLICY.md |
| `review_status`, `discard_reason` 외 | V1_NEWS_SIGNAL_REVIEW_AND_FALLBACK.md |
| `etf.*` | V1_DATA_FIELD_REQUIREMENTS.md 3절 |
| `picks[].sector` | V1_KRX_SECTOR_MAPPING.md |

---

## 5. Self-check before implementation

### 이번 보정에서 기존 파일 구조와 맞추기 위해 수정한 항목 (1차 보정)
- `edition_id` → `week_id` + `report_id`로 분리; `report_status` 삭제; 경로 전면 수정
- `global_indicators.*` → `market_summary.global.*`; `domestic_indicators.*` → `market_summary.domestic.*`
- `picks[].interest_range.*` → `picks[].price_zone.watch_low/watch_high`
- `detail_report_id` 형식: `dr_` → `DTL-{week_id}-{ticker}`; `approval.json` 경로 수정

### 이번 보정에서 기존 샘플 구조와 맞추기 위해 수정한 항목 (2차 보정)
- archive detail 경로: `data/archive/{YYYY-WNN}/details/...` → `data/archive/details/...` (평탄 구조)
- `published_date` 삭제 → `data_as_of`, `generated_at`, `published_at`, `archived_at`, `schema_version`으로 교체
- `global.sentiment` enum: `"risk_on"/"risk_off"` → `"positive"/"neutral"/"negative"`
- `approval.decision` enum: 대문자 → 소문자 (`"pending"/"approved"/"rejected"/"on_hold"`)
- `overlap_history`: `editions[]` → `recent_editions[]`; `published_at` 포함

### archive detail 경로를 어떻게 최종 정리했는지
- 경로: `data/archive/details/stock_{ticker}.json` / `data/archive/details/etf_{ticker}.json`
- archive 상세는 에디션별 하위 폴더 없이 `data/archive/details/` 단일 폴더에 보관
- 동일 ticker의 에디션 간 상세 파일은 에디션 식별을 파일 내부 `week_id` 필드로 구분
- 근거: `V1_JSON_SCHEMA.md` 파일 트리, `V1_SAMPLE_DATA_GUIDE.md` 샘플 경로(`data/archive/details/stock_017670.json`)

### published_date / published_at 관계를 어떻게 정리했는지
- `published_date`는 확정 스키마에 없는 비확정 키 → 삭제
- 확정 4개 키로 대체: `data_as_of` (데이터 기준일), `generated_at` (draft 생성), `published_at` (발행 완료, draft에서 null), `archived_at` (archive 이동, archive 전용)
- `published_at`이 "발행 시각"에 해당; `data_as_of`가 "데이터 기준일"에 해당

### 여전히 확정이 더 필요한 경로/파일 구조 항목
- `market_summary.data_refs[]` 내부 구조 (미확정)
- `sector_returns[]` 내부 구조 세부
- `approval.json` 확장 필드 채택 여부 (exception_picks, soft_flag_items 등)
- `overlap_history.json`의 `alternatives[]` 추가 여부
- 개별주·ETF 상세 리포트 단일 스키마 통합 vs asset_type 분기

### 내가 임의로 기존 운영 구조를 뒤집지 않은 것
- 코드 없음 / API 연동 없음 / 기존 JSON 파일 수정 없음
- 기존 샘플 데이터 수정 없음 / UI 변경 없음 / 빌드 실행 없음
- 확정 스키마(`V1_JSON_SCHEMA.md`) 기준 키 구조를 바꾸지 않고, 새 문서 쪽을 보정

---

> 이 문서는 V1 개념 필드 → 실제 JSON 키 매핑 설계 문서다.
> 실제 JSON 파일 작성·스키마 적용·코드 구현은 이 문서를 기반으로 다음 단계에서 진행한다.

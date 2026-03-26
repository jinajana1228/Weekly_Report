# V1 뉴스 신호 데이터 구조 정책

> **문서 목적**: V1 서비스 운영에서 자동/반자동으로 생성된 뉴스 신호 결과물의 데이터 구조를 정의한다.
> 뉴스 신호는 수치 데이터의 대체재가 아닌 보완 신호다. 운영자가 매주 직접 입력하는 구조가 아니며,
> 자동/반자동으로 생성된 결과를 admin이 검수·승인하는 구조를 기준으로 설계한다.
> 이 문서는 설계 문서이며, 실제 코드 구현·크롤러 작성·LLM 연동은 다음 단계에서 진행한다.

---

## 1. 뉴스 신호의 위치와 역할

### 1-1. V1 데이터 계층에서 뉴스 신호의 위치

```
[1계층] 공식 수치 데이터 (KRX, DART, ECOS, FRED)
         ← 추천 로직 핵심 판단 근거. 뉴스로 대체 불가.

[2계층] 뉴스 신호 (자동/반자동 생성 결과)
         ← 수치 데이터 해석 보완. 단기 촉매 평가 보조.
         ← 시장 요약 문구 맥락 보강.

[3계층] admin 검수 판단
         ← 뉴스 신호 유효성 확인, 발행 여부 최종 결정.
```

**중요 원칙**: 뉴스 신호만으로 섹터 방향성(favored/cautious), 종목 추천 여부, 시장 국면 판단이 결정되어서는 안 된다. 수치 데이터와 교차 확인 후 보완 맥락으로만 활용한다.

### 1-2. 뉴스 신호가 서비스에서 사용되는 위치

| 사용 위치 | 역할 |
|---------|------|
| 시장 요약 (market_summary) | 수치 기반 국면 서술의 맥락 보강 |
| favored_sectors / cautious_sectors | 수치 방향성과 부합하는 정책·이슈 신호 보완 |
| 단기 촉매 평가 (catalyst) | 공시 외 정책·업황 변화 신호 보완 |
| ETF 설명 (etf_report) | 추종 지수 관련 시장 이슈 맥락 보강 |
| Admin 검수 화면 | 신호 유효성 확인, 추천 사유 연결 검수 |

---

## 2. 뉴스 신호 데이터 구조 권장안

### 2-1. 신호 레벨(scope) 구분

뉴스 신호는 영향 범위에 따라 4개 레벨로 구분한다.

| scope | 의미 | 예시 |
|-------|------|------|
| `MARKET` | 시장 전체에 영향을 주는 신호 | FOMC 결정, 미중 무역 협상, 글로벌 지정학 리스크 |
| `SECTOR` | 특정 섹터에 영향을 주는 신호 | 반도체 수출 규제, 바이오 임상 정책 변화, 금리 결정 |
| `STOCK` | 특정 종목에 영향을 주는 신호 | 개별 공시 외 정책 수혜, 파트너십 발표, 수주 소식 |
| `ETF` | 특정 ETF 또는 추종 지수에 영향을 주는 신호 | 기초지수 리밸런싱, 해외 지수 구성 변경 |

---

### 2-2. 전체 필드 정의

#### 공통 필드 (모든 scope에 적용)

| 필드명 | 타입 | 필수/선택 | 생성 방식 | 설명 |
|-------|------|---------|---------|------|
| `signal_id` | string | **필수** | 자동 생성 | 신호 고유 식별자 (예: `ns_20260325_001`) |
| `scope` | enum | **필수** | 자동 생성 | 신호 영향 범위 (MARKET/SECTOR/STOCK/ETF) |
| `direction` | enum | **필수** | 자동 생성 | 신호 방향성 (bullish/bearish/neutral) |
| `signal_level` | enum | **필수** | 자동 생성 | 신호 강도 (strong/moderate/weak) |
| `confidence` | enum | **필수** | 자동 생성 | 신호 신뢰도 (high/medium/low) |
| `catalyst_type` | enum | **필수** | 자동 생성 | 촉매 유형 (POLICY/EARNINGS/REGULATORY/MACRO/SECTOR_TREND/OTHER) |
| `relevance_window` | enum | **필수** | 자동 생성 | 신호 유효 기간 (this_week/1_2_weeks/1_month/beyond) |
| `source_name` | string | **필수** | 자동 생성 | 출처 이름 (예: "금융위원회", "Reuters") |
| `published_at` | ISO 8601 | **필수** | 자동 생성 | 기사/공시 발행 시각 |
| `headline_summary` | string | **필수** | 자동 생성 | 제목 기반 한 줄 요약 (최대 80자). 기사 전문이 아닌 요약 |
| `why_it_matters` | string | **필수** | 자동 생성 (검수 보완 허용) | 이 신호가 서비스 추천/시장 분석에 왜 관련되는지 (최대 150자) |
| `admin_review_needed` | boolean | **필수** | 자동 생성 | admin 검수 필요 여부 플래그 (신뢰도 low이거나 방향 미확정인 경우 자동 true) |
| `duplicate_group_id` | string | 선택 | 자동 생성 | 동일 이슈를 다루는 신호들의 그룹 ID. 중복 묶음 처리용 |
| `validation_note` | string | 선택 | **검수 전용** | admin이 검수 시 기록하는 유효성 메모 (자유 텍스트, 최대 200자) |
| `is_approved` | boolean | **필수** | 검수 후 결정 | 발행 반영 승인 여부 (기본값: false) |
| `is_discarded` | boolean | **필수** | 검수 후 결정 | 폐기 여부 (기본값: false) |

---

#### scope = MARKET 전용 추가 필드

| 필드명 | 타입 | 필수/선택 | 생성 방식 | 설명 |
|-------|------|---------|---------|------|
| `market_impact_region` | enum | **필수** | 자동 생성 | 영향 시장 지역 (DOMESTIC/US/GLOBAL) |
| `related_indicator` | string | 선택 | 자동 생성 | 연관 수치 지표명 (예: "VIX", "USD/KRW", "US 10Y Yield") |

---

#### scope = SECTOR 전용 추가 필드

| 필드명 | 타입 | 필수/선택 | 생성 방식 | 설명 |
|-------|------|---------|---------|------|
| `related_sector_code` | enum (서비스 13개 섹터) | **필수** | 자동 생성 | 영향 받는 서비스 섹터 코드 (TECH, BATTERY 등) |
| `sector_direction_alignment` | enum | 선택 | 자동 생성 | 수치 기반 섹터 방향성과 일치 여부 (aligned/conflicting/neutral) |

---

#### scope = STOCK 전용 추가 필드

| 필드명 | 타입 | 필수/선택 | 생성 방식 | 설명 |
|-------|------|---------|---------|------|
| `related_ticker` | string | **필수** | 자동 생성 | 연관 종목 티커 |
| `related_sector_code` | enum | **필수** | 자동 생성 | 해당 종목의 서비스 섹터 코드 |
| `is_pick_candidate` | boolean | 선택 | 자동 생성 | 해당 종목이 이번 주 후보군에 포함되어 있는지 여부 |
| `catalyst_connected` | boolean | **필수** | 자동 생성 | 이 신호가 단기 촉매 평가와 연결되는지 여부 |

---

#### scope = ETF 전용 추가 필드

| 필드명 | 타입 | 필수/선택 | 생성 방식 | 설명 |
|-------|------|---------|---------|------|
| `related_ticker` | string | **필수** | 자동 생성 | 연관 ETF 티커 |
| `related_underlying_index` | string | 선택 | 자동 생성 | 영향 받는 기초지수명 |
| `etf_sector_code` | enum | **필수** | 자동 생성 | ETF 섹터 코드 (ETF_DOMESTIC/ETF_OVERSEAS/ETF_BOND_DIV) |

---

### 2-3. enum 권장안

#### `direction`
| 값 | 의미 |
|----|------|
| `bullish` | 긍정적 방향 신호 |
| `bearish` | 부정적 방향 신호 |
| `neutral` | 방향성 불명확 또는 양방향 해석 가능 |

#### `signal_level`
| 값 | 의미 |
|----|------|
| `strong` | 시장·섹터·종목에 즉각적이고 명확한 영향 가능성 |
| `moderate` | 부분적 또는 조건부 영향 가능성 |
| `weak` | 맥락 보강 수준, 독립 판단 근거로 부족 |

#### `confidence`
| 값 | 의미 |
|----|------|
| `high` | 공식 기관 발표 또는 복수 신뢰 소스에서 확인됨 |
| `medium` | 단일 신뢰 소스이나 출처 명확 |
| `low` | 출처 불명확, 루머성, 단일 비공식 소스 |

#### `catalyst_type`
| 값 | 의미 |
|----|------|
| `POLICY` | 정부·금융당국·거래소의 정책 발표 |
| `EARNINGS` | 실적 발표 관련 신호 (어닝 서프라이즈, 어닝 쇼크 등) |
| `REGULATORY` | 규제 변화, 인허가, 감사 이슈 |
| `MACRO` | 금리, 환율, 경기지표 변화 |
| `SECTOR_TREND` | 업황 방향 변화, 수요·공급 구조 변화 |
| `OTHER` | 위 분류에 해당하지 않는 기타 신호 |

#### `relevance_window`
| 값 | 의미 |
|----|------|
| `this_week` | 발행 주 내 즉각 유효 |
| `1_2_weeks` | 1~2주 내 유효 (이번 추천 에디션 관점) |
| `1_month` | 1개월 관점 추천과 연관 (서비스 추천 기간과 일치) |
| `beyond` | 1개월 초과 장기 신호 (V1 단기 관점에서 참고 수준) |

#### `scope`
| 값 | 의미 |
|----|------|
| `MARKET` | 시장 전체 영향 신호 |
| `SECTOR` | 특정 섹터 영향 신호 |
| `STOCK` | 특정 종목 영향 신호 |
| `ETF` | 특정 ETF/기초지수 영향 신호 |

---

### 2-4. 필드 생성 방식 분류 요약

| 분류 | 필드 목록 |
|------|---------|
| **자동 생성 대상** | signal_id, scope, direction, signal_level, confidence, catalyst_type, relevance_window, source_name, published_at, headline_summary, why_it_matters, duplicate_group_id, admin_review_needed, market_impact_region, related_indicator, related_sector_code, sector_direction_alignment, related_ticker, is_pick_candidate, catalyst_connected, related_underlying_index, etf_sector_code |
| **검수 전용 필드** | validation_note, is_approved, is_discarded |
| **V1.1 이후 확장 검토** | `sentiment_score` (정량화된 감성 점수), `cross_signal_link` (관련 수치 데이터 연결 ID) |

> `why_it_matters`는 자동 생성이 기본이다. 자동 생성 내용이 부정확하거나 부족한 경우 admin이 `validation_note`에 보완 내용을 기록하되, `why_it_matters` 자체를 운영자가 직접 작성하는 구조는 V1 기본 운영 방식이 아니다.

---

## 3. 뉴스 신호 파일 구조 방향 (설계 예시)

> **주의**: 아래는 파일 구조의 개념적 방향 제시다. 실제 파일명·경로·JSON 키 이름은 구현 단계에서 확정한다.

```
data/
  news_signals/
    week_20260325/          ← 해당 주 신호 저장 디렉터리
      market_signals.json   ← scope=MARKET 신호 목록
      sector_signals.json   ← scope=SECTOR 신호 목록
      stock_signals.json    ← scope=STOCK 신호 목록
      etf_signals.json      ← scope=ETF 신호 목록
      signal_review.json    ← admin 검수 결과 (is_approved, is_discarded, validation_note)
```

**설계 원칙**:
- 각 주의 신호는 별도 디렉터리에 격리 저장한다. 주간 단위 비교가 용이해진다.
- `signal_review.json`은 원본 신호 파일을 수정하지 않고 검수 결과를 별도 관리한다.
- 발행 후 해당 주 신호 디렉터리는 archive로 이동한다. 불변 원칙 적용.

---

## 4. 뉴스 신호 필드가 서비스 각 부분에서 사용되는 방식

| 서비스 사용 위치 | 사용 필드 | 사용 방식 |
|--------------|---------|---------|
| 시장 요약 (`market_summary`) | `scope=MARKET` 신호의 `headline_summary`, `direction`, `catalyst_type` | 수치 기반 국면 서술 시 보완 맥락 |
| `favored_sectors` 판단 | `scope=SECTOR` 신호의 `related_sector_code`, `direction`, `sector_direction_alignment` | 수치 방향과 일치하는 신호만 보완 근거로 활용 |
| `cautious_sectors` 판단 | `scope=SECTOR` 신호의 `related_sector_code`, `direction=bearish` | 수치 방향과 일치하는 bearish 신호만 참조 |
| 단기 촉매 평가 (`catalyst`) | `scope=STOCK` 신호의 `catalyst_connected=true`, `catalyst_type`, `why_it_matters` | 공시 외 정책·업황 보완 신호로 활용 |
| ETF 설명 (`etf_report`) | `scope=ETF` 신호의 `headline_summary`, `related_underlying_index` | 기초지수 관련 시장 맥락 보강 |
| Admin 검수 화면 | `admin_review_needed=true` 신호 목록, `validation_note` | 유효성 확인, 발행 반영 여부 결정 |

---

## 5. 아직 최종 확정하지 않은 항목

| 항목 | 미확정 이유 | 확정 방법 |
|------|-----------|---------|
| `why_it_matters` 자동 생성 방식 | 자동화 구현 방식 미결 (키워드 추출 vs 요약 모델) | 구현 단계에서 결정 |
| `headline_summary` 최대 글자 수 | 80자 권장이나 UI 레이아웃 확정 후 조정 필요 | UI 구현 단계에서 확정 |
| `duplicate_group_id` 자동 생성 알고리즘 | 유사도 기반 묶음 방식 미결 | 구현 단계에서 결정 |
| `sector_direction_alignment` 자동 계산 방식 | 수치 기반 섹터 방향성 데이터와 연동 로직 미결 | 구현 단계에서 결정 |
| 뉴스 신호 파일 최대 보관 개수 (주당) | 신호가 너무 많으면 admin 검수 부담 증가 | 운영 경험 후 상한선 결정 |
| `relevance_window=beyond` 신호의 발행 반영 여부 | 장기 신호를 1개월형 서비스에 포함할지 여부 | 운영 원칙 결정 필요 |
| V1.1 확장 필드 (`sentiment_score`, `cross_signal_link`) 추가 시점 | V1 운영 안정화 후 결정 | 별도 검토 |

---

## 6. Self-check before implementation

### 이번 문서에서 권장 뉴스 신호 구조/검수 규칙으로 제시한 것
- 4개 scope 레벨 (MARKET/SECTOR/STOCK/ETF) 구분
- 공통 필수 필드 14개 + scope별 추가 필드 정의
- 5개 enum 권장안 (direction, signal_level, confidence, catalyst_type, relevance_window)
- 자동 생성 필드 vs 검수 전용 필드 분류
- 파일 구조 방향 (주별 격리, signal_review.json 분리)

### 자동/반자동 생성 대상으로 본 것
- signal_id, scope, direction, signal_level, confidence, catalyst_type, relevance_window
- source_name, published_at, headline_summary, why_it_matters
- duplicate_group_id, admin_review_needed
- scope별 추가 필드 전체 (related_sector_code, related_ticker 등)

### admin 검수 전용으로 본 것
- validation_note (검수 시 유효성 메모)
- is_approved (발행 반영 승인 여부)
- is_discarded (폐기 여부)

### 아직 최종 확정하지 않은 필드/규칙
- why_it_matters 자동 생성 구체 방식
- duplicate_group_id 알고리즘
- sector_direction_alignment 계산 방식
- 주당 신호 최대 보관 개수 상한
- relevance_window=beyond 신호의 발행 반영 여부

### 구현 전에 사용자가 최종 판단해야 하는 항목
- 뉴스 자동 생성 도구 선택 (어떤 소스, 어떤 추출 방식)
- why_it_matters 자동 생성 방식 (키워드 기반 vs 요약 모델)
- 주당 신호 상한선 결정 (admin 검수 부담 기준)
- relevance_window=beyond 신호의 서비스 포함 여부

### 내가 임의로 구현하거나 기존 구조를 바꾸지 않은 것
- 코드 없음
- 크롤러 설계 없음
- LLM 연동 구현 없음
- 기사 본문 저장 구조 설계 없음
- 기존 JSON 파일 수정 없음
- 기존 UI 변경 없음
- 빌드/실행 없음

### 현재 운영 원칙(사람은 승인만, 직접 입력 지양)에 위배되지 않는지 점검한 항목
- `why_it_matters`는 자동 생성 기본으로 명시함 (운영자 직접 작성 구조 아님)
- `validation_note`는 자동 생성이 불충분한 경우 검수 보완용으로만 허용 (기본 입력 구조 아님)
- 모든 수동 입력 필드를 최소화하고 자동 생성 + 검수 승인 구조로 설계함
- 뉴스 신호가 수치 데이터의 대체재가 아님을 1절에서 명시함
- admin은 is_approved/is_discarded 결정 + validation_note 기록만 담당하도록 설계함

---

> 이 문서는 V1 뉴스 신호 데이터 구조 정책 설계 문서다.
> 실제 자동 생성 구현·크롤러·JSON 스키마 확정은 이 문서를 기반으로 다음 단계에서 진행한다.

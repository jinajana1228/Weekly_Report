# V1 샘플 데이터 가이드

> **문서 목적**: V1 샘플 JSON 파일들의 역할, 관계, 작성 원칙을 정의한다.
> **중요**: 샘플 파일은 실제 투자 데이터가 아니며, 스키마 구조와 상태 전환 검증을 위한 예시 데이터이다.

---

## 샘플 데이터의 성격

| 구분 | 설명 |
|------|------|
| 목적 | 스키마 유효성 검증, UI 렌더링 확인, 상태 전환 흐름 시연 |
| 실제 데이터 여부 | 아님. 모두 예시용 가상 데이터 |
| 투자 조언 여부 | 아님. 모든 수치와 설명은 예시임을 명시해야 함 |
| Mock 데이터와 차이 | Mock은 실제 서비스 운영을 위한 가짜 데이터이고, 이 샘플은 스키마 검증을 위한 최소 예시 데이터 |

---

## 샘플 파일 전체 목록

### 메인 리포트 파일 (Main Report Files)

| 파일 경로 | 역할 | 공개 범위 | 에디션 |
|-----------|------|----------|--------|
| `data/current/current.json` | 현재 공개 중인 리포트 샘플 | Public | W13 |
| `data/draft/2026-W14.json` | 검수 대기 초안 샘플 | Admin Only | W14 |
| `data/archive/2026-W12.json` | 과거 발행본 샘플 | Public | W12 |
| `data/manifests/manifest.json` | 에디션 메타 인덱스 샘플 | Admin Only | - |
| `data/manifests/approval.json` | 검수 의사결정 샘플 | Admin Only | W14 기준 |
| `admin/overlap_history.json` | 최근 추천 이력 샘플 | Admin Only | W11~W13 이력 |

### 상세 리포트 파일 (Detail Report Files)

| 파일 경로 | 역할 | 공개 범위 | 연결 pick |
|-----------|------|----------|-----------|
| `data/current/details/stock_005930.json` | 삼성전자 상세 (W13 current) | Public | W13 rank 1 |
| `data/current/details/etf_360750.json` | TIGER 미국S&P500 상세 (W13 current) | Public | W13 rank 5 |
| `data/draft/details/stock_035420.json` | NAVER 상세 (W14 draft) | Admin Only | W14 rank 1 |
| `data/draft/details/stock_373220.json` | LG에너지솔루션 상세 (W14 draft) | Admin Only | W14 rank 2 |
| `data/draft/details/stock_267260.json` | HD현대일렉트릭 상세 (W14 draft) | Admin Only | W14 rank 3 |
| `data/draft/details/stock_036460.json` | 한국가스공사 상세 (W14 draft) | Admin Only | W14 rank 4 |
| `data/draft/details/etf_232080.json` | TIGER 코스닥150 상세 (W14 draft) | Admin Only | W14 rank 5 |
| `data/archive/details/stock_017670.json` | SK텔레콤 상세 (W12 archive) | Public | W12 rank 1 |

> W14 draft는 picks 5개 모두 상세 파일이 존재한다. stock 타입 4개(035420, 373220, 267260, 036460)와 etf 타입 1개(232080)로 구성되어 있다.
> current(W13)와 archive(W12)는 대표 종목 1~2개의 상세 파일만 유지한다.

---

## 파일별 에디션 관계

```
[W11 archive] → [W12 archive]              → [W13 current]              → [W14 draft]
                     ↑                              ↑                           ↑
          data/archive/2026-W12.json    data/current/current.json    data/draft/2026-W14.json
          + details/stock_017670.json   + details/stock_005930.json  + details/stock_035420.json
                                        + details/etf_360750.json    + details/stock_373220.json
                                        (approval을 통해 발행됨)      + details/stock_267260.json
                                                                     + details/stock_036460.json
                                                                     + details/etf_232080.json
                                                                     (approval: pending)
```

**archive 파일 명명 원칙**: 파일명은 반드시 내부 `week_id`와 일치해야 한다.
- `data/archive/2026-W12.json` → 내부 `week_id: "2026-W12"` ✓
- 예외 또는 설명용 불일치를 허용하지 않는다.

---

## 에디션별 pick 구성

각 에디션의 샘플 picks는 섹터 중복 없이 구성되었으며, 에디션 간 티커 중복도 없다.

### W13 (current): 현재 발행본

| rank | ticker | name | sector | 상세 샘플 파일 |
|------|--------|------|--------|----------------|
| 1 | 005930 | 삼성전자 | TECH | `data/current/details/stock_005930.json` ✓ |
| 2 | 068270 | 셀트리온 | HEALTHCARE | (샘플 없음) |
| 3 | 105560 | KB금융 | FINANCE | (샘플 없음) |
| 4 | 097950 | CJ제일제당 | CONSUMER | (샘플 없음) |
| 5 | 360750 | TIGER 미국S&P500 | ETF_OVERSEAS | `data/current/details/etf_360750.json` ✓ |

### W14 (draft): 검수 대기 초안

| rank | ticker | name | sector | 상세 샘플 파일 |
|------|--------|------|--------|----------------|
| 1 | 035420 | NAVER | TECH | `data/draft/details/stock_035420.json` ✓ |
| 2 | 373220 | LG에너지솔루션 | BATTERY | `data/draft/details/stock_373220.json` ✓ |
| 3 | 267260 | HD현대일렉트릭 | INDUSTRIAL | `data/draft/details/stock_267260.json` ✓ |
| 4 | 036460 | 한국가스공사 | ENERGY | `data/draft/details/stock_036460.json` ✓ |
| 5 | 232080 | TIGER 코스닥150 | ETF_DOMESTIC | `data/draft/details/etf_232080.json` ✓ |

> TECH 섹터 내 W13(삼성전자)과 W14(NAVER)는 서로 다른 티커이므로 중복 추천 정책 위반 아님.

### W12 (archive): 이전 발행본

| rank | ticker | name | sector | 상세 샘플 파일 |
|------|--------|------|--------|----------------|
| 1 | 017670 | SK텔레콤 | TELECOM | `data/archive/details/stock_017670.json` ✓ |
| 2 | 005490 | POSCO홀딩스 | MATERIAL | (샘플 없음) |
| 3 | 329180 | HD현대중공업 | INDUSTRIAL | (샘플 없음) |
| 4 | 028260 | 삼성물산 | REALESTATE | (샘플 없음) |
| 5 | 069500 | KODEX 200 | ETF_DOMESTIC | (샘플 없음) |

---

## 상세 샘플 파일의 역할과 필요성

### 1. pick과의 연결 방식

메인 리포트 파일의 각 pick은 `detail_report_id` 필드를 통해 상세 파일을 참조한다.

```
current.json picks[0].detail_report_id = "DTL-2026-W13-005930"
    → data/current/details/stock_005930.json
    → 내부 detail_report_id: "DTL-2026-W13-005930" (일치 확인)

current.json picks[4].detail_report_id = "DTL-2026-W13-360750"
    → data/current/details/etf_360750.json
    → 내부 detail_report_id: "DTL-2026-W13-360750" (일치 확인)
```

### 2. UI/라우팅 검증에 필요한 이유

상세 페이지는 `/report/[ticker]` 또는 `/report/[week_id]/[ticker]` 형태의 동적 라우팅을 사용할 가능성이 높다.
상세 샘플 파일이 있어야 아래 항목을 구현 전에 검증할 수 있다.

| 검증 항목 | 관련 샘플 파일 |
|-----------|----------------|
| stock 타입 상세 페이지 렌더링 | `stock_005930.json`, `stock_017670.json`, `stock_035420.json` |
| etf 타입 상세 페이지 렌더링 (추가 필드 포함) | `etf_360750.json` |
| current 상태 종목 상세 접근 경로 | `data/current/details/` 하위 파일 |
| draft 상태 종목 상세 (Admin Only 접근) | `data/draft/details/` 하위 파일 |
| archive 상태 종목 상세 접근 경로 | `data/archive/details/` 하위 파일 |
| detail_report_id 기반 파일 조회 로직 | DTL-{week_id}-{ticker} → 파일 경로 변환 |

### 3. stock vs etf 스키마 차이 검증

`etf_360750.json`은 stock 상세 파일에 없는 ETF 전용 필드를 포함한다.
이 샘플이 있어야 ETF 상세 페이지에서 추가 필드를 올바르게 렌더링하는지 확인할 수 있다.

| 필드 | stock | etf |
|------|-------|-----|
| company_overview | ✓ | ✓ |
| financial_summary | ✓ (주식 지표) | ✓ (ETF 수익률/비용) |
| etf_overview | — | ✓ |
| benchmark | — | ✓ |
| manager | — | ✓ |
| top_holdings | — | ✓ |
| geographic_exposure | — | ✓ |
| sector_exposure | — | ✓ |
| hedge_policy | — | ✓ |
| leverage_inverse_flag | — | ✓ |
| fee_summary | — | ✓ |
| etf_specific_risks | — | ✓ |

### 4. current/draft/archive 상태별 상세 파일 관계

동일 종목이 다른 에디션에 등장할 경우, 상세 파일도 에디션별로 별도 생성된다.

```
data/current/details/stock_005930.json   → DTL-2026-W13-005930 (W13 기준 데이터)
data/archive/details/stock_005930.json  → DTL-2026-W12-005930 (W12 기준 데이터, 미래 가능)
```

샘플에서는 동일 티커의 에디션 간 중복이 없도록 구성하여 파일명 충돌 없이 상태별 경로 구조를 시연한다.

---

## overlap_history 샘플 이력 구성

`admin/overlap_history.json`은 W11, W12, W13 3개 에디션의 메인 picks 이력을 포함한다.

- **W13**: 005930, 068270, 105560, 097950, 360750
- **W12**: 017670, 005490, 329180, 028260, 069500
- **W11**: 042700, 128940, 032830, 271560, 379800

W14 draft 준비 시 이 파일을 참조하여 중복 여부 확인.
W13 picks 중 어떤 티커도 W14 draft에 포함되지 않았으므로 정상 상태.

---

## 샘플 데이터 작성 원칙

1. **예시임을 명시**: 텍스트 필드 내 `[예시]` 표기를 포함하여 실제 데이터가 아님을 표시
2. **실제 투자 조언 금지**: 종목 설명은 중립적이고 사실에 기반하지 않는 가상 시나리오로 작성
3. **스키마 검증 가능**: 모든 필수 필드가 채워져 있어야 하며, enum 허용값을 준수해야 함
4. **섹터 중복 없음**: 동일 에디션 내 5개 picks의 sector 코드는 모두 달라야 함
5. **파일명 = week_id**: archive 파일을 포함한 모든 에디션 파일은 파일명과 내부 `week_id`가 일치해야 함
6. **키 네이밍 통일**: 모든 JSON 키는 `snake_case`
7. **날짜 형식 일관성**: 날짜는 `YYYY-MM-DD`, 시각은 ISO 8601 (`+09:00` 타임존 포함)
8. **현실적 수치**: 실제 종목명, 티커를 사용하되 수치(가격, 등락률 등)는 예시임

---

## 실제 운영 전환 시 이 샘플을 사용하는 방법

| 단계 | 설명 |
|------|------|
| 홈 화면 개발 | `data/current/current.json`을 읽어 5개 pick 카드 렌더링 확인 |
| 상세 페이지 개발 | `stock_005930.json` (stock 타입), `etf_360750.json` (etf 타입)으로 상세 페이지 레이아웃 검증 |
| 라우팅 로직 개발 | `detail_report_id` → 파일 경로 변환 함수 검증 |
| Admin 화면 개발 | `data/manifests/approval.json` 읽기/쓰기 흐름 확인 |
| 상태 전환 테스트 | draft → current → archive 전환 시 파일 구조 변화 검증 |
| 중복 이력 검증 | `admin/overlap_history.json` 기반 W14 draft 중복 여부 판단 로직 확인 |
| archive 상세 접근 테스트 | `data/archive/details/stock_017670.json`으로 과거 에디션 상세 페이지 경로 확인 |

---

> 이 샘플 데이터는 실제 서비스 데이터가 아니며, 구현 단계에서 실제 데이터로 교체되거나 제거되어야 한다.

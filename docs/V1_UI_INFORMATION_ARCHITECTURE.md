# V1 UI 정보 구조 (Information Architecture)

> **문서 목적**: V1 서비스의 전체 화면 구조, 사용자 흐름, 공개/관리 영역 경계를 정의한다.
> **중요**: 이 문서는 설계 전용이다. 구현 방식(코드/컴포넌트/인증)은 후속 단계에서 결정한다.

---

## 전체 화면 구조 맵

```
[서비스 전체]
│
├── [PUBLIC 영역] ──────────────────────────────────────────────────
│   │
│   ├── 홈 화면 (/)
│   │   ├── 리포트 메타 블록
│   │   ├── 글로벌/국내 시장 요약 블록
│   │   ├── 유리한 섹터 / 주의 섹터 블록
│   │   ├── 메인 추천 5개 카드
│   │   │   └── 각 카드 → 종목 상세 화면 진입
│   │   ├── 관련 뉴스 링크
│   │   ├── disclaimer
│   │   └── archive 목록 진입 링크
│   │
│   ├── 종목 상세 화면 (/report/[ticker])
│   │   ├── 일반 종목 상세
│   │   └── ETF 상세 (추가 블록 포함)
│   │
│   ├── archive 목록 화면 (/archive)
│   │   └── 과거 에디션 목록 → archive 상세 진입
│   │
│   └── archive 상세 화면 (/archive/[week_id])
│       ├── archive 메인 리포트
│       └── archive 종목 상세 (/archive/[week_id]/report/[ticker])
│
└── [ADMIN ONLY 영역] ──────────────────────────────────────────────
    │
    ├── admin 검수 화면 (/admin/review)
    │   ├── draft 메타 정보
    │   ├── approval 상태
    │   ├── 5개 추천 요약
    │   ├── overlap_history 참고 영역
    │   └── 승인/반려/보류 액션 영역
    │
    └── admin draft 상세 검토 화면 (/admin/review/report/[ticker])
        ├── draft 종목 상세 (일반 종목 또는 ETF)
        └── 검수 notes 영역
```

---

## Public 영역 / Admin 영역 구분

| 영역 | 접근 대상 | 포함 화면 |
|------|----------|-----------|
| Public | 모든 방문자 | 홈, 종목 상세, archive 목록, archive 상세 |
| Admin Only | 관리자만 | admin 검수 화면, admin draft 상세 검토 화면 |

**원칙**:
- Public 영역은 `data/current/`와 `data/archive/` 데이터만 읽는다.
- Admin 영역은 `data/draft/`, `data/manifests/`, `admin/` 데이터까지 접근한다.
- `approval.json`이 `pending` 상태인 draft는 Public에 절대 노출되지 않는다.
- Admin 접근 제어 구현 방식(인증/세션)은 후속 구현 단계에서 결정한다.

---

## 사용자 흐름

### Public 사용자 흐름

```
홈 화면 (/)
    │
    ├─[카드 클릭]──→ 종목 상세 화면 (/report/[ticker])
    │                  └─[뒤로가기]──→ 홈 화면
    │
    └─[archive 링크]──→ archive 목록 화면 (/archive)
                          └─[에디션 클릭]──→ archive 상세 화면 (/archive/[week_id])
                                               └─[종목 클릭]──→ archive 종목 상세
                                                              (/archive/[week_id]/report/[ticker])
```

### Admin 사용자 흐름

```
admin 검수 화면 (/admin/review)
    │
    ├─[종목 상세 검토]──→ admin draft 상세 (/admin/review/report/[ticker])
    │                        └─[뒤로가기]──→ admin 검수 화면
    │
    └─[승인/반려/보류]──→ approval.json 갱신 (approval 상태 변경)
                          → 승인 시: current 전환, 이전 current archive 이동
```

---

## 각 화면의 목적

| 화면 | 목적 |
|------|------|
| 홈 화면 | 금주 리포트의 시장 요약 및 5개 메인 추천 제공. 서비스의 진입점. |
| 종목 상세 화면 | 개별 pick의 상세 분석 정보 제공. 투자 근거, 리스크, 촉매 등 포함. |
| ETF 상세 화면 | 종목 상세 + ETF 전용 운용 정보 제공. 동일 흐름에서 추가 블록 표시. |
| archive 목록 화면 | 과거 발행된 에디션 목록 제공. 히스토리 탐색 진입점. |
| archive 상세 화면 | 과거 에디션의 메인 리포트 열람. 불변 데이터 기반 렌더링. |
| archive 종목 상세 | 과거 에디션 기준의 개별 pick 상세 정보 제공. |
| admin 검수 화면 | 관리자가 draft를 검토하고 승인/반려/보류 결정을 내리는 화면. |
| admin draft 상세 검토 | 관리자가 개별 draft 종목의 상세 내용을 검토하는 화면. |

---

## 각 화면의 핵심 정보 블록

### 홈 화면

| 블록 | 설명 |
|------|------|
| 리포트 메타 | week_id, published_at, data_as_of |
| 글로벌 시장 요약 | market_summary.global 텍스트 블록 |
| 국내 시장 요약 | market_summary.domestic 텍스트 블록 |
| 유리한 섹터 | market_summary.favorable_sectors (코드 + 설명) |
| 주의 섹터 | market_summary.caution_sectors (코드 + 설명) |
| 메인 추천 카드 5개 | rank, name, sector, stance, one_line_reason, same_sector_alternatives[2] |
| 관련 뉴스 링크 | related_news (홈 수준 요약) |
| disclaimer | 투자 조언 아님 고지 |
| archive 진입 링크 | /archive 링크 |

### 종목 상세 화면

| 블록 | 설명 |
|------|------|
| 종목 기본 정보 | ticker, name, market, sector, asset_type |
| 핵심 요약 | one_line_reason 또는 stance |
| 가격 참고 구간 | price_reference (reference_price, watch_low, watch_high) |
| 투자 관점 | stance |
| 강세 근거 | bull_points |
| 약세 근거 | bear_points |
| 단기 촉매 | catalysts_2_to_4_weeks |
| 리스크 | risks |
| 재무 요약 | financial_summary (schema_note 포함 표시) |
| 관련 뉴스 | related_news |
| 데이터 기준일 | data_as_of |

### ETF 상세 화면 (종목 상세 블록 + 추가)

| 추가 블록 | 설명 |
|-----------|------|
| ETF 개요 | etf_overview |
| 벤치마크 | benchmark |
| 운용사 | manager |
| 주요 구성 종목 | top_holdings |
| 지역 배분 | geographic_exposure |
| 섹터 배분 | sector_exposure |
| 환헤지 정책 | hedge_policy |
| 레버리지/인버스 여부 | leverage_inverse_flag |
| 비용 요약 | fee_summary |
| ETF 전용 리스크 | etf_specific_risks |

### archive 목록 화면

| 블록 | 설명 |
|------|------|
| 에디션 목록 | week_id, published_at, picks 요약(ticker/name 5개) |
| 상세 진입 링크 | 각 에디션의 /archive/[week_id] 링크 |

### archive 상세 화면

현재 홈 화면과 동일한 정보 구조. 단, 데이터 소스가 archive 에디션 파일 기준.
archived_at 날짜 표시 추가.

### admin 검수 화면

| 블록 | 설명 |
|------|------|
| draft 메타 정보 | draft week_id, data_as_of |
| approval 상태 | pending / approved / rejected / on_hold |
| 5개 추천 요약 | draft picks 목록 (ticker, name, sector, stance) |
| 중복 체크 참고 | overlap_history 최근 3개 에디션 이력 표시 |
| current 상태 확인 | 현재 발행 중인 current의 week_id, picks 요약 |
| 액션 영역 | 승인 / 반려 / 보류 버튼 |
| notes 영역 | 검수 메모 입력/표시 |

---

## 화면 간 이동 관계

```
홈 (/)
  ↕ [카드 클릭 / 뒤로가기]
종목 상세 (/report/[ticker])

홈 (/)
  ↕ [archive 링크 / 뒤로가기]
archive 목록 (/archive)
  ↕ [에디션 클릭 / 뒤로가기]
archive 상세 (/archive/[week_id])
  ↕ [종목 클릭 / 뒤로가기]
archive 종목 상세 (/archive/[week_id]/report/[ticker])

admin 검수 (/admin/review)
  ↕ [종목 상세 검토 / 뒤로가기]
admin draft 상세 (/admin/review/report/[ticker])
```

---

> 구현 방식(인증, 컴포넌트 구조, 스타일)은 이 문서에서 정의하지 않는다.
> 이 문서는 화면 정보 구조와 흐름만 정의한다.

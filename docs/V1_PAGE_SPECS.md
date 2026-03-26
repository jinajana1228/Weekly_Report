# V1 페이지별 명세 (Page Specifications)

> **문서 목적**: V1의 각 페이지 목적, 표시 블록, 데이터 요구사항, 사용자 행동, 실패 처리를 정의한다.
> **중요**: 이 문서는 설계 전용이다. 컴포넌트 구조, 스타일, 코드는 후속 단계에서 결정한다.

---

## 페이지 1 — 홈 화면

**라우트**: `/`
**권한**: Public

### 페이지 목적
금주 current 리포트의 시장 요약과 메인 5개 추천을 독자에게 제공한다. 서비스의 주요 진입점.

### 표시 블록

| 블록 ID | 블록명 | 위치 우선순위 |
|---------|--------|--------------|
| H-01 | 리포트 메타 정보 | 상단 |
| H-02 | 글로벌 시장 요약 | 상단 ~ 중단 |
| H-03 | 국내 시장 요약 | 중단 |
| H-04 | 유리한 섹터 / 주의 섹터 | 중단 |
| H-05 | 메인 추천 5개 카드 | 중단 (핵심) |
| H-06 | 관련 뉴스 링크 | 하단 |
| H-07 | disclaimer | 하단 고정 |
| H-08 | archive 진입 링크 | 하단 |

### 필수 데이터
- `current.json`: week_id, published_at, data_as_of
- `current.json`: market_summary (global_summary, domestic_summary, favorable_sectors, caution_sectors)
- `current.json`: picks[5] (rank, ticker, name, sector, asset_type, one_line_reason, stance, same_sector_alternatives[2], detail_report_id)
- `current.json`: related_news (홈 수준 표시)

### 선택 데이터
- `current.json`: picks[n].price_zone (있으면 카드에 표시)
- `current.json`: picks[n].catalyst_summary (있으면 카드에 표시)
- `current.json`: picks[n].risk_summary (있으면 카드에 표시)

### 사용자가 할 수 있는 행동
- 종목 카드 클릭 → `/report/[ticker]`로 이동
- archive 링크 클릭 → `/archive`로 이동
- 관련 뉴스 링크 클릭 → 외부 링크 (새 탭)

### public/admin 권한
- Public. 인증 불필요.

### 실패/빈 상태 처리
- `current.json` 로드 실패: 서비스 점검 안내 화면 표시. 이전 캐시 데이터 표시 금지.
- picks 5개 미만: 로드된 pick만 표시. (V1 운영상 5개 미만은 없어야 하나 방어 처리 필요)
- related_news 없음: 뉴스 블록 숨김 처리.
- market_summary 일부 누락: 해당 블록만 "준비 중" 처리, 나머지 블록 정상 표시.

### 아직 미정인 항목
- 관련 뉴스를 홈 수준에서 몇 개까지 표시할지 (카드당 뉴스 수)
- same_sector_alternatives의 홈 화면 표시 방식 (카드 내 인라인 vs 확장 영역)
- 모바일 레이아웃 카드 배치 방식

---

## 페이지 2 — 일반 종목 상세 화면

**라우트**: `/report/[ticker]`
**권한**: Public
**대상**: asset_type = `stock`인 picks

### 페이지 목적
현재 에디션에서 선정된 개별 종목의 상세 분석 정보를 제공한다. 선정 근거, 리스크, 단기 촉매 포함.

### 표시 블록

| 블록 ID | 블록명 |
|---------|--------|
| S-01 | 종목 기본 정보 (ticker, name, market, sector, asset_type) |
| S-02 | 핵심 요약 (one_line_reason) |
| S-03 | 투자 관점 (stance) |
| S-04 | 가격 참고 구간 (price_reference) |
| S-05 | 강세 근거 (bull_points) |
| S-06 | 약세 근거 (bear_points) |
| S-07 | 단기 촉매 (catalysts_2_to_4_weeks) |
| S-08 | 리스크 (risks) |
| S-09 | 재무 요약 (financial_summary) |
| S-10 | 관련 뉴스 (related_news) |
| S-11 | 데이터 기준일 (data_as_of) |

### 필수 데이터
- `data/current/details/stock_{ticker}.json` 전체
- 특히: ticker, name, sector, asset_type, stance, bull_points, bear_points, catalysts_2_to_4_weeks, risks, data_as_of

### 선택 데이터
- `financial_summary`: schema_note가 있으면 미확정 안내와 함께 표시
- `related_news`: 있으면 표시, 없으면 블록 숨김
- `price_reference.watch_low`, `watch_high`: 있으면 구간 표시

### 사용자가 할 수 있는 행동
- 뒤로가기 → 홈 화면
- 관련 뉴스 링크 클릭 → 외부 링크 (새 탭)

### public/admin 권한
- Public. 인증 불필요.

### 실패/빈 상태 처리
- 상세 파일 없음: "해당 종목 상세 정보를 준비 중입니다" 안내 표시
- `ticker`가 현재 picks에 없는 값: 404 안내 화면
- `financial_summary` 누락 또는 schema_note만 있음: "재무 데이터 준비 중" 표시

### 아직 미정인 항목
- financial_summary의 실제 표시 필드 (데이터 소스 확정 후 결정)
- bull_points / bear_points 개수 제한 또는 접기 처리 방식
- 홈으로 돌아가는 네비게이션 방식 (breadcrumb vs 뒤로가기 버튼)

---

## 페이지 3 — ETF 상세 화면

**라우트**: `/report/[ticker]`
**권한**: Public
**대상**: asset_type = `etf`인 picks

### 페이지 목적
현재 에디션에서 선정된 ETF의 상세 분석 정보를 제공한다. 일반 종목 상세와 동일 흐름에서 ETF 전용 블록 추가 표시.

### 표시 블록

**일반 종목 상세 블록 전체(S-01 ~ S-11) 포함, 아래 추가 블록 표시**

| 블록 ID | 블록명 |
|---------|--------|
| E-01 | ETF 개요 (etf_overview) |
| E-02 | 벤치마크 (benchmark) |
| E-03 | 운용사 (manager) |
| E-04 | 주요 구성 종목 (top_holdings) |
| E-05 | 지역 배분 (geographic_exposure) |
| E-06 | 섹터 배분 (sector_exposure) |
| E-07 | 환헤지 정책 (hedge_policy) |
| E-08 | 레버리지/인버스 여부 (leverage_inverse_flag) |
| E-09 | 비용 요약 (fee_summary) |
| E-10 | ETF 전용 리스크 (etf_specific_risks) |

### 필수 데이터
- `data/current/details/etf_{ticker}.json` 전체
- 일반 종목 필수 데이터 + ETF 전용 필드 전체

### 선택 데이터
- `sector_exposure.schema_note`: 있으면 미확정 안내와 함께 표시
- `top_holdings`: 있으면 목록 표시, 없으면 블록 숨김

### 사용자가 할 수 있는 행동
- 일반 종목 상세와 동일

### public/admin 권한
- Public. 인증 불필요.

### 실패/빈 상태 처리
- 일반 종목 상세와 동일 원칙
- ETF 전용 필드 누락 시: 해당 블록만 "준비 중" 처리, 나머지 블록 정상 표시

### 아직 미정인 항목
- 일반 종목 상세 템플릿과 ETF 상세 템플릿을 단일로 처리할지 분리할지는 구현 단계에서 결정
- top_holdings 표시 개수 (전체 표시 vs 상위 N개)
- sector_exposure 시각화 방식 (텍스트 목록 vs 차트)

---

## 페이지 4 — archive 목록 화면

**라우트**: `/archive`
**권한**: Public

### 페이지 목적
과거 발행된 에디션 목록을 제공한다. 독자가 히스토리 탐색을 시작하는 진입점.

### 표시 블록

| 블록 ID | 블록명 |
|---------|--------|
| AL-01 | archive 에디션 목록 |
| AL-02 | 각 에디션의 week_id, published_at |
| AL-03 | 각 에디션의 picks 요약 (ticker + name 5개) |
| AL-04 | 각 에디션 상세 진입 링크 |

### 필수 데이터
- `data/manifests/manifest.json`: archive_week_ids, archive_base_path
- 각 `data/archive/{week_id}.json`: week_id, published_at, picks (ticker, name, sector)

### 선택 데이터
- 각 archive 에디션의 market_summary 요약 (있으면 미리보기 표시)

### 사용자가 할 수 있는 행동
- 에디션 클릭 → `/archive/[week_id]`로 이동
- 홈 링크 → `/`로 이동

### public/admin 권한
- Public. 인증 불필요.
- manifest.json 접근 시 archive 관련 필드만 사용. approval, draft 관련 정보 사용 금지.

### 실패/빈 상태 처리
- manifest 로드 실패: "archive 목록을 불러올 수 없습니다" 안내
- archive_week_ids가 빈 배열: "아직 archive된 에디션이 없습니다" 안내
- 특정 archive week JSON 로드 실패: 해당 에디션 항목을 "데이터 준비 중"으로 표시, 나머지는 정상 표시

### 아직 미정인 항목
- archive 목록 정렬 방식 (최신순 vs 오래된순)
- 목록 페이지네이션 여부 (V1에서는 목록 수가 적으므로 전체 표시로 충분할 수 있음)

---

## 페이지 5 — archive 상세 화면

**라우트**: `/archive/[week_id]`
**권한**: Public

### 페이지 목적
특정 과거 에디션의 메인 리포트를 표시한다. 홈 화면과 동일 정보 구조이나 archive 데이터 기준으로 렌더링.

### 표시 블록

홈 화면 블록(H-01 ~ H-08)과 동일 구성.

| 추가/변경 블록 | 설명 |
|----------------|------|
| archived_at 날짜 표시 | archive 시점 명시 ("이 리포트는 {archived_at} 기준 archived된 에디션입니다") |
| current와 동일한 현재 에디션임을 나타내는 UI 제거 | archive 에디션임을 명확히 구분 |

### 필수 데이터
- `data/archive/{week_id}.json` 전체 (week_id, published_at, archived_at, picks, market_summary, related_news)

### 선택 데이터
- 홈 화면 선택 데이터와 동일

### 사용자가 할 수 있는 행동
- 종목 카드 클릭 → `/archive/[week_id]/report/[ticker]`로 이동
- archive 목록 링크 → `/archive`로 이동
- 홈 링크 → `/`로 이동

### public/admin 권한
- Public. 인증 불필요.

### 실패/빈 상태 처리
- `week_id`가 manifest의 archive_week_ids에 없는 값: 404 안내 화면
- archive week JSON 로드 실패: "해당 에디션 데이터를 불러올 수 없습니다" 안내

### 아직 미정인 항목
- archive 상세와 current 홈 화면의 공유 가능한 레이아웃 범위 (구현 단계에서 결정)

---

## 페이지 6 — archive 종목 상세 화면

**라우트**: `/archive/[week_id]/report/[ticker]`
**권한**: Public

### 페이지 목적
특정 과거 에디션 기준의 개별 종목 상세 정보를 제공한다. 현재 에디션 종목 상세와 동일 정보 구조.

### 표시 블록
- asset_type = `stock`: 일반 종목 상세 블록(S-01 ~ S-11)과 동일
- asset_type = `etf`: ETF 상세 블록(S-01 ~ S-11 + E-01 ~ E-10)과 동일

archive 에디션 컨텍스트 표시 추가:
- 현재 에디션이 아님을 명확히 표시 (예: "이 내용은 {week_id} 에디션 기준입니다")

### 필수 데이터
- `data/archive/details/{asset_type}_{ticker}.json` 전체

### 선택 데이터
- 현재 에디션 상세 파일과 동일 원칙

### 사용자가 할 수 있는 행동
- 뒤로가기 → `/archive/[week_id]`
- 홈 링크 → `/`

### public/admin 권한
- Public. 인증 불필요.

### 실패/빈 상태 처리
- 상세 파일 없음: "해당 종목의 archive 상세 정보를 준비 중입니다" 안내
- `ticker`가 해당 archive 에디션 picks에 없는 값: 404 안내

### 아직 미정인 항목
- 현재 에디션 종목 상세와 archive 종목 상세의 공유 가능한 레이아웃 범위 (구현 단계에서 결정)

---

## 페이지 7 — admin 검수 화면

**라우트**: `/admin/review`
**권한**: Admin Only

### 페이지 목적
관리자가 현재 draft를 검토하고 승인/반려/보류 결정을 내리는 화면.

### 표시 블록

| 블록 ID | 블록명 |
|---------|--------|
| ADM-01 | draft 메타 정보 (week_id, data_as_of) |
| ADM-02 | approval 현재 상태 (pending / approved / rejected / on_hold) |
| ADM-03 | 금주 5개 추천 요약 (ticker, name, sector, stance) |
| ADM-04 | 중복 체크 참고 — overlap_history 최근 3개 에디션 이력 |
| ADM-05 | current 상태 확인 — 현재 발행 중인 current week_id + picks 요약 |
| ADM-06 | 승인 / 반려 / 보류 액션 영역 |
| ADM-07 | 검수 notes 입력/표시 영역 |

### 필수 데이터
- `data/draft/{week_id}.json`: week_id, data_as_of, picks 전체
- `data/manifests/approval.json`: decision, reviewed_by, reviewed_at, notes
- `admin/overlap_history.json`: recent_editions (최근 3개)
- `data/manifests/manifest.json`: draft_week_id, draft_file_path (draft 파일 경로 확인용)
- `data/current/current.json`: week_id, picks 요약 (current 확인용)

### 선택 데이터
- `approval.json.notes`: 이전 검수 메모 있으면 표시

### 사용자가 할 수 있는 행동
- 개별 종목 클릭 → `/admin/review/report/[ticker]`로 이동
- 승인 버튼 → approval.json.decision을 `approved`로 변경 (+ 전환 프로세스 트리거)
- 반려 버튼 → approval.json.decision을 `rejected`로 변경
- 보류 버튼 → approval.json.decision을 `on_hold`로 변경
- notes 입력 → approval.json.notes 저장

### public/admin 권한
- Admin Only. 인증 필요 (구현 방식은 후속 구현 단계에서 결정).

### 실패/빈 상태 처리
- draft 파일 없음: "현재 검수 대기 중인 draft가 없습니다" 안내
- approval.json 로드 실패: 액션 영역 비활성화, 오류 안내 표시
- overlap_history.json 로드 실패: 중복 체크 블록만 "이력 데이터를 불러올 수 없습니다" 표시, 나머지 정상 표시

### 아직 미정인 항목
- admin 인증 방식 (Vercel Password Protection, Basic Auth, 기타) — 구현 단계에서 결정
- 승인 시 전환 프로세스(파일 이동)의 실제 구현 방식 — 구현 단계에서 결정
- approval.json 쓰기 방식 (Git commit 자동화 vs 수동) — 구현 단계에서 결정

---

## 페이지 8 — admin draft 상세 검토 화면

**라우트**: `/admin/review/report/[ticker]`
**권한**: Admin Only

### 페이지 목적
관리자가 개별 draft 종목의 상세 내용을 검토한다. 종목 상세 화면과 동일 정보 구조이나 draft 데이터 기준.

### 표시 블록
- asset_type = `stock`: 일반 종목 상세 블록(S-01 ~ S-11)과 동일
- asset_type = `etf`: ETF 상세 블록(S-01 ~ S-11 + E-01 ~ E-10)과 동일

admin 전용 추가 블록:
- draft 에디션 컨텍스트 표시 (week_id, data_as_of)
- `/admin/review`로 돌아가는 내비게이션

### 필수 데이터
- `data/draft/details/{asset_type}_{ticker}.json` 전체

### 선택 데이터
- 종목 상세 화면 선택 데이터와 동일 원칙

### 사용자가 할 수 있는 행동
- 뒤로가기 → `/admin/review`
- 관련 뉴스 링크 클릭 → 외부 링크 (새 탭)

### public/admin 권한
- Admin Only. 인증 필요.

### 실패/빈 상태 처리
- 상세 파일 없음: "해당 종목의 draft 상세 파일이 없습니다" 안내
- `ticker`가 현재 draft picks에 없는 값: 404 안내

### 아직 미정인 항목
- admin 전용 상세 뷰와 public 상세 뷰의 공유 가능 레이아웃 범위 (구현 단계에서 결정)
- admin 상세 검토 화면에서 직접 메모/수정 기능 추가 여부 (V1 범위 외일 가능성 높음)

---

> 각 페이지의 실제 컴포넌트 분리, 스타일, 레이아웃은 이 문서에서 정의하지 않는다.
> 이 문서는 페이지별 정보 구조와 데이터 요구사항만 정의한다.

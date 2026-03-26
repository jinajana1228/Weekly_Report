# V1 라우팅 구조 설계 (Route Map)

> **문서 목적**: V1에서 필요한 모든 라우트, 각 라우트의 역할, 참조 JSON 파일, 접근 권한을 정의한다.
> **중요**: 이 문서는 설계 전용이다. 실제 라우트 파일, 코드, 프레임워크 구현은 후속 단계에서 결정한다.

---

## Public 라우트 목록

| 라우트 | 역할 | 참조 JSON 파일 |
|--------|------|----------------|
| `/` | 홈 화면 — 금주 current 리포트 표시 | `data/current/current.json` |
| `/report/[ticker]` | 현재 에디션 종목 상세 | `data/current/details/{asset_type}_{ticker}.json` |
| `/archive` | 과거 에디션 목록 | `data/manifests/manifest.json` (archive_week_ids 참조) + 각 archive week JSON |
| `/archive/[week_id]` | 특정 과거 에디션 리포트 | `data/archive/{week_id}.json` |
| `/archive/[week_id]/report/[ticker]` | 과거 에디션 종목 상세 | `data/archive/details/{asset_type}_{ticker}.json` |

## Admin Only 라우트 목록

| 라우트 | 역할 | 참조 JSON 파일 |
|--------|------|----------------|
| `/admin/review` | draft 검수 화면 | `data/draft/{week_id}.json`, `data/manifests/approval.json`, `admin/overlap_history.json`, `data/current/current.json` |
| `/admin/review/report/[ticker]` | draft 종목 상세 검토 | `data/draft/details/{asset_type}_{ticker}.json` |

---

## 라우트별 상세 설계

---

### `/` — 홈 화면

- **권한**: Public
- **데이터 소스**: `data/current/current.json`
- **파라미터**: 없음
- **설명**: `current.json`의 메인 5개 pick 카드, 시장 요약, 관련 뉴스를 표시. 항상 current 데이터 기준으로 렌더링.
- **진입 경로**: 직접 접근 (서비스 진입점)
- **이탈 경로**: `/report/[ticker]`, `/archive`

---

### `/report/[ticker]` — 현재 에디션 종목/ETF 상세

- **권한**: Public
- **데이터 소스**: `data/current/details/{asset_type}_{ticker}.json`
- **파라미터**: `ticker` (예: `005930`, `360750`)
- **파일 경로 변환**:
  ```
  ticker → current.json에서 해당 pick의 asset_type 확인
        → data/current/details/{asset_type}_{ticker}.json 로드
  ```
- **detail_report_id 연결**:
  ```
  current.json picks[n].detail_report_id = "DTL-2026-W13-005930"
  → 파일: data/current/details/stock_005930.json
  ```
- **설명**: 현재 에디션 기준의 종목 또는 ETF 상세. asset_type이 `etf`이면 ETF 전용 블록 추가 표시.
- **일반 종목 / ETF 구분 처리**:
  - 라우트 경로는 동일 (`/report/[ticker]`)
  - 렌더링 시 `asset_type` 필드로 구분
  - 정보 구조 차이(ETF 추가 블록)는 `V1_PAGE_SPECS.md` 참조
  - 단일 템플릿 vs 별도 템플릿 여부는 구현 단계에서 결정
- **진입 경로**: 홈 화면 카드 클릭
- **이탈 경로**: 홈 화면 (뒤로가기)

---

### `/archive` — archive 목록

- **권한**: Public
- **데이터 소스**: `data/manifests/manifest.json` (archive_week_ids 목록 참조) + 각 `data/archive/{week_id}.json`
- **파라미터**: 없음
- **설명**: manifest의 `archive_week_ids` 배열을 기반으로 과거 에디션 목록 구성. 각 에디션의 week_id, published_at, picks 요약 표시.
- **manifest 접근 원칙**: archive_week_ids와 archive_base_path만 사용. approval/draft 관련 정보 사용 불가.
- **진입 경로**: 홈 화면 archive 링크
- **이탈 경로**: `/archive/[week_id]`

---

### `/archive/[week_id]` — archive 상세 (에디션 기준)

- **권한**: Public
- **데이터 소스**: `data/archive/{week_id}.json`
- **파라미터**: `week_id` (예: `2026-W12`)
- **파일 경로 변환**:
  ```
  week_id → data/archive/{week_id}.json
  예: 2026-W12 → data/archive/2026-W12.json
  ```
- **설명**: 특정 과거 에디션의 메인 리포트 표시. 홈 화면과 동일 정보 구조이나 archived_at 날짜 추가 표시. 데이터 불변.
- **진입 경로**: `/archive` 목록
- **이탈 경로**: `/archive/[week_id]/report/[ticker]`, `/archive` (뒤로가기)

---

### `/archive/[week_id]/report/[ticker]` — archive 종목/ETF 상세

- **권한**: Public
- **데이터 소스**: `data/archive/details/{asset_type}_{ticker}.json`
- **파라미터**: `week_id`, `ticker`
- **파일 경로 변환**:
  ```
  week_id + ticker → archive/{week_id}.json에서 해당 pick의 asset_type 확인
                  → data/archive/details/{asset_type}_{ticker}.json 로드
  ```
- **detail_report_id 연결**:
  ```
  archive/{week_id}.json picks[n].detail_report_id = "DTL-2026-W12-017670"
  → 파일: data/archive/details/stock_017670.json
  ```
- **설명**: 특정 과거 에디션 기준의 종목 상세. 현재 에디션 상세와 동일 정보 구조. archive 데이터 기준으로 렌더링.
- **진입 경로**: `/archive/[week_id]` 종목 클릭
- **이탈 경로**: `/archive/[week_id]` (뒤로가기)

---

### `/admin/review` — admin 검수 화면

- **권한**: Admin Only
- **데이터 소스**:
  - `data/draft/{week_id}.json` (draft 메인 리포트)
  - `data/manifests/approval.json` (현재 approval 상태)
  - `admin/overlap_history.json` (최근 3개 에디션 이력)
  - `data/current/current.json` (현재 current 확인용)
- **파라미터**: 없음 (항상 현재 draft 기준)
- **설명**: 관리자가 현재 draft를 검토하는 화면. draft week_id는 manifest에서 확인. approval 상태 표시 및 변경 액션 제공.
- **draft week_id 확인 방법**: `data/manifests/manifest.json`의 `draft_week_id` 및 `draft_file_path` 참조
- **진입 경로**: 직접 접근 (관리자)
- **이탈 경로**: `/admin/review/report/[ticker]`

---

### `/admin/review/report/[ticker]` — admin draft 상세 검토

- **권한**: Admin Only
- **데이터 소스**: `data/draft/details/{asset_type}_{ticker}.json`
- **파라미터**: `ticker`
- **파일 경로 변환**:
  ```
  ticker → draft/{week_id}.json에서 해당 pick의 asset_type 확인
        → data/draft/details/{asset_type}_{ticker}.json 로드
  ```
- **설명**: 관리자가 개별 draft 종목의 상세 내용을 검토. 검수 notes 입력 기능 포함.
- **진입 경로**: `/admin/review`에서 종목 클릭
- **이탈 경로**: `/admin/review` (뒤로가기)

---

## current / archive / draft 데이터 구분 원칙

| 데이터 종류 | 기준 경로 | 라우트 접근 |
|-------------|----------|-------------|
| current | `data/current/` | Public — `/`, `/report/[ticker]` |
| archive | `data/archive/` | Public — `/archive`, `/archive/[week_id]`, `/archive/[week_id]/report/[ticker]` |
| draft | `data/draft/` | Admin Only — `/admin/review`, `/admin/review/report/[ticker]` |

**원칙**:
- Public 라우트는 current와 archive 데이터만 읽는다.
- draft 데이터는 Admin Only 라우트에서만 접근한다.
- `approval.json`이 `pending` 상태인 draft는 어떤 Public 라우트에도 노출되지 않는다.

---

## detail_report_id → 파일 경로 변환 규칙

```
detail_report_id 형식: DTL-{week_id}-{ticker}

변환 과정:
1. week_id로 state(current/archive/draft) 결정
   - current 에디션 week_id → data/current/details/
   - archive 에디션 week_id → data/archive/details/
   - draft 에디션 week_id   → data/draft/details/

2. 메인 리포트의 해당 pick에서 asset_type 확인 (stock 또는 etf)

3. 파일 경로 조합:
   {state}/details/{asset_type}_{ticker}.json

예시:
DTL-2026-W13-005930 → data/current/details/stock_005930.json
DTL-2026-W13-360750 → data/current/details/etf_360750.json
DTL-2026-W12-017670 → data/archive/details/stock_017670.json
DTL-2026-W14-035420 → data/draft/details/stock_035420.json
```

---

## archive 라우트 방식 결정 근거

- archive 파일명 = week_id (예: `2026-W12.json`)이므로 `week_id`를 URL 파라미터로 사용
- `/archive/[week_id]`는 `data/archive/{week_id}.json`으로 직접 매핑 가능
- archive 종목 상세는 week_id + ticker 두 파라미터 필요 (에디션 컨텍스트 보존 필요)
- current 종목 상세는 week_id 불필요 (항상 current 기준이므로 ticker만으로 충분)

---

> 실제 라우트 파일 생성, 프레임워크 선택, 파일 읽기 구현은 이 문서에서 정의하지 않는다.
> 이 문서는 라우트 구조와 데이터 참조 설계만 정의한다.

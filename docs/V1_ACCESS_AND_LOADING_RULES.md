# V1 접근/로딩 정책 (Access and Loading Rules)

> **문서 목적**: V1에서 어떤 JSON 파일이 public 접근 가능한지, admin only인지, 각 데이터를 어떻게 로딩하는지의 정책을 정의한다.
> **중요**: 이 문서는 정책 정의 전용이다. 실제 접근 제어 구현 방식(코드/인증/Vercel 설정)은 후속 구현 단계에서 결정한다.

---

## 파일별 접근 분류

### Public 접근 가능 파일

| 파일 경로 | 접근 라우트 |
|-----------|-------------|
| `data/current/current.json` | `/` |
| `data/current/details/stock_{ticker}.json` | `/report/[ticker]` |
| `data/current/details/etf_{ticker}.json` | `/report/[ticker]` |
| `data/archive/{week_id}.json` | `/archive`, `/archive/[week_id]` |
| `data/archive/details/stock_{ticker}.json` | `/archive/[week_id]/report/[ticker]` |
| `data/archive/details/etf_{ticker}.json` | `/archive/[week_id]/report/[ticker]` |
| `data/manifests/manifest.json` | `/archive` (archive 관련 필드만 사용) |

> `manifest.json`은 archive 목록 구성에 필요하여 `/archive` 라우트에서 읽는다.
> 단, public 접근 시에는 `archive_week_ids`, `archive_base_path` 필드만 사용해야 한다.
> `draft_*`, `current_*` 관련 필드를 public 화면에 노출하지 않는다.

### Admin Only 파일

| 파일 경로 | 이유 |
|-----------|------|
| `data/draft/{week_id}.json` | 미발행 초안. 승인 전 public 노출 금지. |
| `data/draft/details/stock_{ticker}.json` | draft 종목 상세. 동일 이유. |
| `data/draft/details/etf_{ticker}.json` | draft ETF 상세. 동일 이유. |
| `data/manifests/approval.json` | 검수 의사결정 파일. 관리자 전용 운영 데이터. |
| `admin/overlap_history.json` | 중복 추천 이력. 관리자 검수 보조 데이터. |
| `data/manifests/manifest.json` (draft 관련 필드) | draft_report_id, draft_week_id, draft_file_path는 admin 전용 |

---

## manifest / approval / overlap_history 접근 원칙

### manifest.json 접근 원칙

| 필드 그룹 | public 사용 가능 여부 | 사용 라우트 |
|------------|----------------------|-------------|
| `archive_week_ids` | 가능 | `/archive` |
| `archive_base_path` | 가능 | `/archive` |
| `current_report_id`, `current_week_id`, `current_file_path` | 가능 (current 로딩 확인용) | `/` |
| `draft_report_id`, `draft_week_id`, `draft_file_path` | 불가 (admin only) | `/admin/review` |
| `last_generated_at`, `last_published_at`, `data_as_of` | 가능 | `/` |

### approval.json 접근 원칙

- Admin Only 파일. Public 라우트에서 절대 읽지 않는다.
- approval.json의 `decision` 값은 화면에서 아래와 같이 처리한다.

| decision 값 | Public 화면 영향 | admin 화면 표시 |
|-------------|-----------------|----------------|
| `pending` | draft 미노출. current 그대로 유지. | "검수 대기 중" 표시 |
| `approved` | 전환 완료 후 new current 표시. | "승인됨" 표시 |
| `rejected` | current 그대로 유지. | "반려됨" 표시 |
| `on_hold` | current 그대로 유지. | "보류 중" 표시 |

### overlap_history.json 접근 원칙

- Admin Only 파일. `/admin/review` 라우트에서만 사용.
- public 화면에서 중복 이력을 직접 표시하지 않는다.
- admin 검수 화면에서 참고 정보로만 표시.

---

## current / archive / draft 데이터 로딩 구분 원칙

| 데이터 종류 | 로딩 트리거 | 경로 |
|-------------|------------|------|
| current | `/` 화면 로딩 시 항상 | `data/current/current.json` |
| current 상세 | `/report/[ticker]` 로딩 시 | `data/current/details/{asset_type}_{ticker}.json` |
| archive 목록 | `/archive` 로딩 시 | `manifest.json` → 각 `data/archive/{week_id}.json` |
| archive 상세 | `/archive/[week_id]` 로딩 시 | `data/archive/{week_id}.json` |
| archive 종목 상세 | `/archive/[week_id]/report/[ticker]` 로딩 시 | `data/archive/details/{asset_type}_{ticker}.json` |
| draft | `/admin/review` 로딩 시 (Admin Only) | `data/draft/{week_id}.json` |
| draft 종목 상세 | `/admin/review/report/[ticker]` (Admin Only) | `data/draft/details/{asset_type}_{ticker}.json` |

**원칙**:
1. current 데이터는 항상 `data/current/` 경로에서 읽는다. 다른 경로와 혼용하지 않는다.
2. archive 데이터는 항상 `data/archive/` 경로에서 읽는다. week_id가 URL 파라미터로 전달된다.
3. draft 데이터는 Admin Only 라우트에서만 읽는다. Public 라우트에서 draft 경로를 참조하지 않는다.
4. 세 가지 상태(current/archive/draft)의 데이터를 동일 Public 화면에 혼합하지 않는다.

---

## 상세 리포트 파일 로딩 원칙

### 파일 경로 결정 방법

```
1단계: 메인 리포트에서 해당 pick의 detail_report_id 확인
       예: picks[0].detail_report_id = "DTL-2026-W13-005930"

2단계: 메인 리포트의 asset_type 확인
       예: picks[0].asset_type = "stock"

3단계: 현재 state(current/archive/draft) 확인 → 기본 경로 결정
       current → data/current/details/
       archive → data/archive/details/
       draft   → data/draft/details/

4단계: 파일 경로 조합
       {base_path}{asset_type}_{ticker}.json
       예: data/current/details/stock_005930.json
```

### 상세 파일 로딩 우선 원칙

- 상세 파일은 반드시 해당 에디션과 동일한 state 폴더에서 읽는다.
  - current 에디션 상세 → `data/current/details/`
  - archive 에디션 상세 → `data/archive/details/`
  - draft 에디션 상세 → `data/draft/details/`
- 다른 state 폴더의 상세 파일로 fallback하지 않는다.
  - 예: current 상세 파일 없다고 archive 상세 파일을 대신 표시하지 않음

---

## 데이터 누락 시 fallback 원칙

| 누락 상황 | fallback 처리 |
|-----------|--------------|
| `current.json` 로드 실패 | 서비스 점검 안내. 이전 데이터로 대체 표시 금지. |
| 특정 종목 상세 파일 없음 | "상세 정보를 준비 중입니다" 안내. 다른 에디션 상세로 대체 금지. |
| archive 특정 week JSON 없음 | 해당 에디션 항목만 오류 표시. 목록 전체 실패 처리 금지. |
| `financial_summary` 미확정 | `schema_note` 포함 표시. "데이터 준비 중" 안내 함께 표시. |
| `related_news` 없음 | 뉴스 블록 숨김. 전체 화면 실패 처리 금지. |
| `market_summary` 일부 누락 | 누락된 블록만 "준비 중" 처리. 나머지 블록 정상 표시. |
| `overlap_history.json` 로드 실패 | admin 검수 화면에서 해당 블록만 오류 표시. 전체 검수 화면 실패 처리 금지. |

**원칙**: 부분 누락은 부분 처리. 전체 화면 실패를 방지한다.

---

## approval이 pending일 때 Public은 어떻게 보이는지

- **current 화면(`/`)**: 변화 없음. 현재 `data/current/current.json` 그대로 표시.
- **종목 상세(`/report/[ticker]`)**: 변화 없음. current 데이터 기준 그대로 표시.
- **archive 화면**: 변화 없음.
- **draft 데이터**: 어떤 public 화면에도 노출되지 않는다.
- **요약**: `approval.json.decision = "pending"` 상태에서 public 사용자는 변화를 인지할 수 없다. 기존 current가 정상 표시된다.

---

## admin에서만 보여야 하는 정보

| 정보 | 이유 |
|------|------|
| draft 리포트 내용 (picks 포함) | 미발행 초안. 승인 전 노출 금지. |
| approval.json의 decision 값 | 내부 운영 상태. 외부 노출 불필요. |
| approval.json의 reviewed_by, reviewed_at, notes | 내부 검수 기록. |
| overlap_history.json 이력 | 내부 운영 참고 데이터. |
| manifest.json의 draft 관련 필드 | draft 경로 정보. admin 전용. |

---

## 접근 제어 구현 방식에 대한 원칙 입장

이 문서는 "무엇을 보호해야 하는가"를 정의한다.
"어떻게 보호할 것인가"(Vercel Password Protection, Basic Auth, Next.js middleware 등)는 후속 구현 단계에서 결정한다.

보호 대상 경로 (원칙):
- `/admin/*` — Admin Only 라우트 전체
- `data/draft/*` — draft 파일 직접 접근 차단
- `data/manifests/approval.json` — 직접 접근 차단
- `admin/overlap_history.json` — 직접 접근 차단
- `data/manifests/manifest.json`의 draft 관련 필드 — public 노출 금지

---

> 이 문서는 접근/로딩 정책만 정의한다.
> 실제 구현 코드, 인증 방식, 파일 읽기 로직은 이 문서에서 정의하지 않는다.

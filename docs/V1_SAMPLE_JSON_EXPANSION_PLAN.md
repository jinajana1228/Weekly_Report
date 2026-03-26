# V1 샘플 JSON 확장 반영 계획

> **문서 목적**: V1 JSON 키 구조 확정 이후, 기존 샘플 JSON에 어떤 필드를 어떻게 추가/수정했는지 기록한다.
> 이 문서는 확장 실행 결과와 판단 근거를 함께 남겨 향후 스키마 변경 시 참조점이 된다.

---

## 1. 확장 배경

V1 JSON 키 구조 문서(V1_JSON_KEY_MAPPING.md, V1_JSON_FILE_ROLE_BOUNDARIES.md, V1_NEWS_SIGNAL_FILE_SCHEMA.md)가
최종 보정된 이후, 기존 샘플 파일들이 확정된 키 구조를 완전히 반영하지 않은 항목이 발견되었다.

확장 반영 시점: 2026-03-25 (V1 설계 완료 후)

---

## 2. 메인 리포트 파일 확장

### 추가 필드: `favored_sectors`, `cautious_sectors`, `sector_returns`

이 3개 필드는 V1_JSON_KEY_MAPPING.md에서 메인 리포트 필드로 확정되었으나,
샘플 생성 시 누락된 상태였다.

#### 삽입 위치

`picks[]` 배열 이후, `related_news[]` 배열 직전

```json
"favored_sectors": [...],
"cautious_sectors": [...],
"sector_returns": [
  { "sector_code": "...", "weekly_return": 0.0 }
],
"related_news": [...]
```

#### 파일별 반영 내역

| 파일 | favored_sectors | cautious_sectors | sector_returns 섹터 |
|------|-----------------|-----------------|---------------------|
| `data/current/current.json` (W13) | `["TECH", "FINANCE"]` | `["BATTERY"]` | TECH, FINANCE, HEALTHCARE, CONSUMER, BATTERY |
| `data/draft/2026-W14.json` (W14) | `["ENERGY", "INDUSTRIAL"]` | `["BATTERY"]` | ENERGY, INDUSTRIAL, TECH, ETF_DOMESTIC, BATTERY |
| `data/archive/2026-W12.json` (W12) | `["TELECOM", "MATERIAL"]` | `[]` | TELECOM, MATERIAL, INDUSTRIAL, REALESTATE, ETF_DOMESTIC |

**`favored_sectors` / `cautious_sectors` 결정 근거**:
- `market_summary.domestic.sector_highlights[].direction` 값 기준
  - `"up"` → `favored_sectors`에 포함
  - `"down"` → `cautious_sectors`에 포함
  - `"neutral"` → 어느 쪽에도 미포함

**`sector_returns` 구성 원칙**:
- 해당 에디션의 picks에 등장한 섹터를 우선 포함
- 섹터 코드는 V1_SECTOR_TAXONOMY.md 허용 코드 사용
- 수치는 모두 예시값이며 실제 수익률이 아님

---

## 3. 상세 리포트 파일 확장

### 추가 필드: `linked_signal_ids`

V1_NEWS_SIGNAL_FILE_SCHEMA.md에서 확정된 필드.
상세 리포트에서 해당 종목/ETF의 픽 근거로 채택된 신호 ID 목록을 참조한다.

#### 삽입 위치

`data_as_of` 필드 바로 아래, `company_overview` 직전

```json
"data_as_of": "YYYY-MM-DD",
"linked_signal_ids": [...],
"company_overview": "..."
```

#### 파일별 반영 내역

| 파일 | linked_signal_ids | 이유 |
|------|-------------------|------|
| `data/current/details/stock_005930.json` (삼성전자, W13) | `[]` | W13 신호 파일 미작성 (current 단계 완료 후 뉴스 신호 파일 설계됨) |
| `data/current/details/etf_360750.json` (TIGER S&P500, W13) | `[]` | 동일 이유 |
| `data/draft/details/stock_035420.json` (NAVER, W14) | `["ns_20260403_st_001", "ns_20260403_s_001"]` | W14 signal_review에서 APPROVED + is_used_in_report=true |
| `data/archive/details/stock_017670.json` (SK텔레콤, W12) | `[]` | W12 신호 파일 미작성 (archive 전환 시 신호 연동 미완료) |

**`linked_signal_ids` 포함 기준**:
- `signal_review.json`에서 `review_status: "APPROVED"` AND `is_used_in_report: true`인 신호만 포함
- `PENDING` 또는 `DISCARDED` 신호는 포함하지 않음
- 해당 에디션의 신호 파일 자체가 없는 경우 빈 배열 `[]` 허용

---

## 4. approval.json 확장

### 추가 필드: `news_signal_review_status`

이 필드는 확정 스키마에 포함되지 않은 **미확정 확장 후보**이나,
샘플에서 W14 draft 상태의 신호 검수 부분 완료 상황을 표현하기 위해 추가되었다.

```json
"news_signal_review_status": "PARTIAL"
```

**허용값 (예시)**:
- `"NONE"` — 신호 파일 없음 또는 검수 미시작
- `"PARTIAL"` — 일부 신호 검수 완료, 일부 PENDING 잔존
- `"COMPLETE"` — 모든 신호 검수 완료 (`signal_review.review_completed = true`)

**주의**: 이 필드는 V1 확정 스키마 외 선택적 확장 후보이며, 실제 구현 시 도입 여부를 재결정해야 한다.

---

## 5. 신규 생성 파일 (뉴스 신호 샘플)

W13과 W12는 신호 파일을 작성하지 않고, W14 draft 1개 에디션에 집중하여
4가지 scope 신호 파일 + 1개 signal_review 파일을 작성하였다.

| 파일 경로 | scope | 신호 수 |
|-----------|-------|---------|
| `data/news_signals/2026-W14/market_signals.json` | market | 2 |
| `data/news_signals/2026-W14/sector_signals.json` | sector | 3 |
| `data/news_signals/2026-W14/stock_signals.json` | stock | 3 |
| `data/news_signals/2026-W14/etf_signals.json` | etf | 1 |
| `data/news_signals/2026-W14/signal_review.json` | — | 9건 검토 |

**signal_review 통계**:

| review_status | 건수 |
|---------------|------|
| APPROVED | 6 |
| DISCARDED | 1 |
| PENDING | 2 |
| 합계 | 9 |

`review_completed: false` — PENDING 2건이 잔존하므로 검수 미완료 상태.
이 상태에서 `approval.json`의 `news_signal_review_status: "PARTIAL"`이 의미하는 바와 일치함.

---

## 6. W13/W12 신호 파일 미작성 이유

W13(current)과 W12(archive)의 신호 파일은 다음 이유로 샘플에서 생략하였다:

1. **설계 시점 차이**: W13 current는 뉴스 신호 파일 설계 전에 완성된 에디션 샘플임
2. **archive 신호 불필요성**: archive 에디션의 상세 파일 접근은 가능하지만 신호 검수 재진행은 없음
3. **샘플 범위 집중**: 신호 파일이 실제로 활용되는 draft → 검수 → current 전환 흐름을 W14 1개 에디션으로 충분히 시연 가능

향후 W13 신호 소급 필요 시: `data/news_signals/2026-W13/` 하위에 동일 구조로 작성 가능.

---

> 이 문서는 샘플 JSON 확장 작업의 실행 결과 기록이며, 실제 서비스 전환 시 실데이터로 교체되어야 한다.

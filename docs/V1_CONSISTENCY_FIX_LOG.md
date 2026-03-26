# V1 정합성 보정 이력 (Consistency Fix Log)

> **문서 목적**: 문서와 실제 파일 사이의 불일치를 정리한 보정 이력을 기록한다.
> **보정 일자**: 2026-03-26
> **보정 단계**: 정합성 보정 단계 (구현 전, 기존 구조 안에서 불일치만 보정)

---

## 1. 보정 배경

다음 3개의 불일치가 발견되어 보정을 진행했다.

1. `approval.json`의 `news_signal_review_status` 필드: 샘플 파일에 이미 존재하지만 문서에서는 "미확정 확장 후보"로 분류되어 있던 상태
2. `manifest.json`의 `archive_week_ids`: 실제 파일이 없는 phantom week_id(W11, W10)가 포함된 상태
3. `draft/details` 커버리지: draft picks 5개 중 상세 파일이 1개(035420)만 존재했던 상태

---

## 2. 불일치 1: approval.json의 `news_signal_review_status` 처리

### 발견된 불일치
- `data/manifests/approval.json`: `"news_signal_review_status": "PARTIAL"` 이미 존재
- `docs/V1_JSON_SCHEMA.md` §5: 6개 확정 필드만 명시. `news_signal_review_status` 미포함
- `docs/V1_JSON_FILE_ROLE_BOUNDARIES.md` §6: "미확정 확장 후보" 분류
- `docs/V1_ADMIN_WRITE_STRATEGY.md` §1-2: "미확정 확장 후보" 분류

### 보정 방향: **확정 필드로 승격**

**승격 이유:**
- 이 필드는 `signal_review.json` 신호 검수 결과의 집계 요약 상태(`SUFFICIENT` / `PARTIAL` / `SPARSE`)다
- approval.json의 발행 게이트 역할(`decision`)과 완전히 독립적이다
- `V1_JSON_FILE_ROLE_BOUNDARIES.md` §9 "요약 집계 원칙"에서 이미 "approval.json은 signal_review의 세부를 복사하지 않고 요약 상태만 집계한다"고 명시
- `V1_JSON_FILE_ROLE_BOUNDARIES.md` §5에서 SUFFICIENT/PARTIAL/SPARSE 집계 로직이 이미 설계됨
- 샘플 파일에 이미 존재하므로 제거하면 샘플과 문서 간 불일치가 역방향으로 발생

**운영 원칙과 충돌 여부 점검:**

| 원칙 | 점검 결과 |
|------|-----------|
| approval = 에디션 발행 게이트 | `decision` 필드가 유일한 게이트 역할. `news_signal_review_status`는 참고 정보 전용이며 발행 차단 조건 아님 ✓ |
| signal_review = 비차단 참고 입력 | `news_signal_review_status`가 어떤 값이어도 발행 차단 불가. "SPARSE" 상태여도 `decision: approved` 시 발행 가능 ✓ |
| signal_review 세부를 approval에 넣지 않음 | 개별 신호 내용, review_status 세부, review_note 등은 여전히 signal_review.json에만 있음. 요약 상태 1개 필드만 포함 ✓ |

**보정 내용:**
- `docs/V1_JSON_SCHEMA.md` §5: `news_signal_review_status` 7번째 확정 필드로 추가. "참고 정보 전용, 발행 차단 조건 아님" 명시
- `docs/V1_JSON_FILE_ROLE_BOUNDARIES.md` §6: "미확정 확장 후보" 테이블에서 제거 → "확정 스키마 (7개 필드)" 목록에 추가. 원칙 설명 추가
- `docs/V1_ADMIN_WRITE_STRATEGY.md` §1-2: "미확정 확장 후보"에서 분리 → "확정된 참고 정보 필드" 신규 섹션(§1-2)으로 이동. 기존 §1-3(확장 후보)은 §1-3으로 유지, §1-3(쓰기 대상 경계 원칙)은 §1-4로 번호 조정

**approval.json 파일:** 변경 없음 (이미 올바른 상태)

---

## 3. 불일치 2: manifest.json phantom archive_week_ids

### 발견된 불일치
- `data/manifests/manifest.json`의 `archive_week_ids`: `["2026-W12", "2026-W11", "2026-W10"]`
- `data/archive/` 실제 파일: `2026-W12.json`만 존재. W11, W10 파일 없음
- V1 운영 원칙: "manifest는 실제 파일 인덱스와 일치해야 한다"

### 보정 방향: **manifest에서 phantom 항목 제거**

**선택 이유:**
- "V1에서는 구조 단순성이 더 중요하다. 실제 파일 기준으로 manifest를 맞추는 쪽이 우선이다"는 기준에 따름
- phantom week_id는 dry-run 스크립트가 archive 충돌을 검사할 때 오판 가능성을 만들 수 있음
- W11, W10 샘플 파일을 새로 생성하는 방향도 가능하나, 이번 단계에서 archive 샘플 확장은 범위 밖

**보정 내용:**
- `data/manifests/manifest.json`: `archive_week_ids`를 `["2026-W12"]`로 축소

**결과:**
```
보정 전: "archive_week_ids": ["2026-W12", "2026-W11", "2026-W10"]
보정 후: "archive_week_ids": ["2026-W12"]
```

---

## 4. 불일치 3: draft picks와 detail 파일 커버리지

### 발견된 불일치
- `data/draft/2026-W14.json` picks: 5개 (035420 NAVER, 373220 LG에너지솔루션, 267260 HD현대일렉트릭, 036460 한국가스공사, 232080 TIGER 코스닥150)
- `data/draft/details/` 실제 파일: `stock_035420.json` 1개만 존재
- 누락된 detail: stock_373220.json, stock_267260.json, stock_036460.json, etf_232080.json (4개)

### 보정 방향: **누락된 detail 파일 4개 생성**

**선택 이유:**
- "이 서비스는 상세 리포트가 중요한 구조. 가능하면 picks를 줄이기보다 detail 샘플을 채우는 방향을 우선 검토"하는 기준에 따름
- dry-run 실행 시 W3 경고(detail 파일 미존재)가 4개 발생하는 상태였음
- draft picks를 조정하는 방식은 기존 draft 샘플 구조를 바꾸는 것이므로 지양

**생성한 파일 목록:**

| 파일 | 종목 | 섹터 | asset_type | detail_report_id |
|------|------|------|-----------|-----------------|
| `data/draft/details/stock_373220.json` | LG에너지솔루션 | BATTERY | stock | DTL-2026-W14-373220 |
| `data/draft/details/stock_267260.json` | HD현대일렉트릭 | INDUSTRIAL | stock | DTL-2026-W14-267260 |
| `data/draft/details/stock_036460.json` | 한국가스공사 | ENERGY | stock | DTL-2026-W14-036460 |
| `data/draft/details/etf_232080.json` | TIGER 코스닥150 | ETF_DOMESTIC | etf | DTL-2026-W14-232080 |

**스키마 준수 사항:**
- `detail_report_id`: `DTL-{week_id}-{ticker}` 형식 준수
- `report_id`: `RPT-2026-W14` (draft 에디션 report_id 일치)
- `week_id`: `"2026-W14"` (draft 파일과 일치)
- `data_as_of`: `"2026-04-03"` (draft 메인 파일과 동일)
- stock 상세: `company_overview`, `price_reference`, `stance`, `bull_points`, `bear_points`, `catalysts_2_to_4_weeks`, `risks`, `financial_summary`, `related_news` 포함
- etf 상세(232080): `etf_overview`, `benchmark`, `manager`, `top_holdings`, `geographic_exposure`, `sector_exposure`, `hedge_policy`, `leverage_inverse_flag`, `fee_summary`, `etf_specific_risks` 포함 (`etf_360750.json` 구조 기준)
- `linked_signal_ids`: stock은 해당 섹터·종목 signal ID 예시 사용, ETF는 `[]` (빈 배열)
- 모든 값은 `[예시]` 접두사 또는 예시 데이터임을 명시

**최종 커버리지:**
- 보정 후 `data/draft/details/`: 5개 파일 (5/5 picks 커버)

---

## 5. 수정된 파일 목록

| 파일 | 변경 유형 | 변경 내용 |
|------|----------|-----------|
| `data/manifests/manifest.json` | 수정 | `archive_week_ids`에서 W11, W10 제거 |
| `data/draft/details/stock_373220.json` | 신규 생성 | LG에너지솔루션 W14 draft 상세 리포트 |
| `data/draft/details/stock_267260.json` | 신규 생성 | HD현대일렉트릭 W14 draft 상세 리포트 |
| `data/draft/details/stock_036460.json` | 신규 생성 | 한국가스공사 W14 draft 상세 리포트 |
| `data/draft/details/etf_232080.json` | 신규 생성 | TIGER 코스닥150 W14 draft 상세 리포트 (ETF) |
| `docs/V1_JSON_SCHEMA.md` | 수정 | approval.json 스키마에 `news_signal_review_status` 추가 (확정 필드) |
| `docs/V1_JSON_FILE_ROLE_BOUNDARIES.md` | 수정 | `news_signal_review_status`를 미확정 후보에서 확정 스키마로 이동 |
| `docs/V1_ADMIN_WRITE_STRATEGY.md` | 수정 | `news_signal_review_status` 확정 처리. 섹션 번호 조정 (1-3 쓰기 경계 → 1-4) |
| `docs/V1_SAMPLE_DATA_GUIDE.md` | 수정 | W14 draft detail 커버리지 테이블 5개 ✓로 갱신. 다이어그램 업데이트 |
| `docs/V1_CONSISTENCY_FIX_LOG.md` | 신규 생성 | 이 문서 |

---

## 6. 아직 남겨둔 미확정 항목

이번 보정에서 정리하지 않은 항목이며, 다음 단계 이전에 별도 확정이 필요하다.

| 항목 | 현재 상태 | 확정 필요 이유 |
|------|-----------|----------------|
| `approval.json`의 `has_news_signal_issues` 필드 | 미확정 확장 후보 | ON_HOLD 신호 존재 여부 플래그. 채택 여부 미결정 |
| `approval.json`의 `exception_picks[]` 구조 | 미확정 (V1에서는 `notes`로 대체) | 예외 승인 기록 구조화 필요 시 V1.1 확장 검토 |
| `V1_MANIFEST_APPROVAL_SCHEMA.md` 스키마 불일치 | **보정 완료** | `V1_APPROVAL_SCHEMA_ALIGNMENT_LOG.md` 참조. approval 필드명 전면 수정(target_edition_id→draft_report_id+draft_week_id, reviewer_note→notes, reviewed_by 추가, news_signal_review_status 추가). 파일 경로 수정(admin/→data/manifests/). §3 전환 트리거 수정. |
| W11, W10 archive 샘플 파일 | 미생성 | manifest에서는 제거했으나 실제 운영에서는 과거 에디션이 늘어날 것. 현재는 W12 1개만 존재 |
| `news_signal_review_status` 자동 집계 임계값 | 미확정 | SUFFICIENT 조건(APPROVED 신호 3개 이상, MARKET 1개 이상 등)은 수집 스크립트 구현 시 확정 필요 |
| approval write 방식 | 미확정 | CLI 스크립트 형식 vs 직접 JSON 편집. V1 배포 환경 확정 후 결정 |
| 실제 publish 스크립트 | 미구현 | dry-run 이후 단계. 이번 보정 범위 밖 |

---

## 7. 이번 단계에서 의도적으로 하지 않은 것

- approval.json 파일 자체 변경 없음 (이미 올바른 상태였음)
- approval write 기능 구현 없음
- publish 스크립트 구현 없음
- admin UI write 기능 추가 없음
- `V1_MANIFEST_APPROVAL_SCHEMA.md` 수정 없음 (1차 보정 범위 외 — 이후 `V1_APPROVAL_SCHEMA_ALIGNMENT_LOG.md`에서 별도 보정 완료)
- W11, W10 archive 샘플 파일 생성 없음 (현재 운영 샘플 범위에서 불필요)
- dry-run 스크립트 로직 변경 없음
- middleware 보호 로직 변경 없음
- build/dev 실행 없음
- background command 실행 없음
- 새로운 구조 도입 없음

---

## 8. 운영 원칙 최종 점검

| 원칙 | 보정 내용과의 관계 |
|------|------------------|
| V1은 자동 수집 중심 | 보정 내용은 샘플 데이터·문서 정합성에 한정. 수집 자동화 구조에 영향 없음 ✓ |
| 사람은 승인 중심 | `decision` 필드가 유일한 게이트 역할 유지. `news_signal_review_status`는 참고만 ✓ |
| 뉴스는 보완 신호 | `news_signal_review_status` 확정 후에도 발행 차단 조건 아님 ✓ |
| 뉴스 부족 시 수치 기반 발행 가능 | "SPARSE" 상태여도 `decision: approved`면 발행 가능 구조 유지 ✓ |
| approval = 에디션 발행 게이트 | `decision` 필드의 게이트 역할 변경 없음 ✓ |
| signal_review = 비차단 참고 입력 | signal_review 세부가 approval로 이동하지 않음. 요약 1개 필드만 추가 ✓ |
| archive detail 충돌 덮어쓰기 허용 | archive detail flat 구조 변경 없음 ✓ |
| 파일 기반 운영 유지 | DB 도입 없음. 파일 구조 변경 없음 ✓ |

---

> 이 문서는 V1 정합성 보정 이력 기록이다.
> 이번 단계에서 확정된 사항과 아직 미확정으로 남긴 사항을 다음 단계 진행 전에 참조한다.

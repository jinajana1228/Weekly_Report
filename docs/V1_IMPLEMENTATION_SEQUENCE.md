# V1 구현 순서 설계

> **문서 목적**: V1 설계 문서 및 샘플 JSON이 완비된 시점에서, 실제 코드 구현을 시작할 때 따라야 할 순서와 각 단계의 목적을 정의한다.
> 이 문서는 '무엇을 먼저 만들어야 하는가'에 대한 기준 문서이다.

---

## 구현 원칙

1. **데이터 계층 먼저**: API나 UI보다 먼저 파일 읽기/쓰기 로직을 완성한다.
2. **샘플 JSON이 테스트 기준**: 모든 로더·파서는 기존 샘플 파일을 올바르게 처리해야 통과로 간주한다.
3. **상태 전환은 파일 이동**: DB 없이 파일 경로만으로 상태를 결정하는 V1 원칙을 유지한다.
4. **Admin 기능은 마지막**: Public 읽기 흐름이 완성된 후 Admin 쓰기 흐름을 추가한다.

---

## Phase 0: 환경 준비

| 항목 | 내용 |
|------|------|
| 0-1 | 프레임워크/런타임 선정 확정 (예: Next.js App Router + TypeScript) |
| 0-2 | 디렉토리 구조 초기화 (`src/`, `data/`, `docs/` 분리) |
| 0-3 | 린터·포매터 설정 (ESLint, Prettier) |
| 0-4 | 샘플 JSON 파일 전체 복사 (`data/` 하위) |
| 0-5 | 환경변수 파일 설정 (`.env.local`) |

---

## Phase 1: 데이터 로더 구현

JSON 파일을 읽어 TypeScript 타입으로 변환하는 계층.

| 순서 | 구현 항목 | 참조 문서 | 검증 기준 |
|------|-----------|-----------|-----------|
| 1-1 | `MainReport` 타입 정의 | V1_JSON_SCHEMA.md | current.json 파싱 성공 |
| 1-2 | `DetailReport` 타입 정의 (stock/etf 분기 포함) | V1_JSON_SCHEMA.md | stock_005930.json + etf_360750.json 파싱 성공 |
| 1-3 | `current.json` 로더 (`getCurrentReport()`) | V1_ACCESS_AND_LOADING_RULES.md | W13 데이터 반환 확인 |
| 1-4 | `details/` 로더 (`getDetailReport(ticker, state)`) | V1_ACCESS_AND_LOADING_RULES.md | DTL ID → 파일 경로 변환 확인 |
| 1-5 | `archive/` 로더 (`getArchiveList()`, `getArchiveReport(weekId)`) | V1_ACCESS_AND_LOADING_RULES.md | W12 데이터 반환 확인 |
| 1-6 | `manifest.json` 로더 (`getManifest()`) | V1_MANIFEST_APPROVAL_SCHEMA.md | 에디션 목록 반환 확인 |
| 1-7 | `news_signals/` 로더 (`getSignalsByWeek(weekId)`) | V1_NEWS_SIGNAL_FILE_SCHEMA.md | W14 신호 4파일 병합 반환 확인 |

**로더 구현 완료 기준**: 모든 샘플 파일에 대해 타입 오류 없이 파싱 가능해야 함.

---

## Phase 2: Public API 구현

로더를 감싸는 API 엔드포인트 계층. 외부 공개 데이터만 처리한다.

| 순서 | 엔드포인트 | 역할 | 참조 문서 |
|------|-----------|------|-----------|
| 2-1 | `GET /api/report/current` | current.json 전체 반환 | V1_ROUTE_MAP.md |
| 2-2 | `GET /api/report/current/picks` | picks[] 배열만 반환 | V1_ROUTE_MAP.md |
| 2-3 | `GET /api/report/current/picks/[ticker]` | 단일 pick 요약 반환 | V1_ROUTE_MAP.md |
| 2-4 | `GET /api/report/current/details/[ticker]` | 상세 리포트 반환 (stock/etf 자동 분기) | V1_ROUTE_MAP.md |
| 2-5 | `GET /api/report/archive` | archive 에디션 목록 반환 | V1_ROUTE_MAP.md |
| 2-6 | `GET /api/report/archive/[weekId]` | 과거 에디션 메인 리포트 반환 | V1_ROUTE_MAP.md |
| 2-7 | `GET /api/report/archive/[weekId]/details/[ticker]` | 과거 에디션 상세 리포트 반환 | V1_ROUTE_MAP.md |

**구현 완료 기준**: 모든 엔드포인트가 샘플 데이터 기반 200 응답을 반환해야 함.

---

## Phase 3: Public 화면 구현

| 순서 | 화면/컴포넌트 | 데이터 소스 | 참조 문서 |
|------|-------------|------------|-----------|
| 3-1 | 홈 화면 — 주간 요약 + 5개 pick 카드 | `GET /api/report/current` | V1_PAGE_SPECS.md |
| 3-2 | 종목 상세 화면 (stock 타입) | `GET /api/report/current/details/[ticker]` | V1_PAGE_SPECS.md |
| 3-3 | ETF 상세 화면 (etf 타입 추가 필드) | 동일 엔드포인트, `asset_type` 분기 | V1_PAGE_SPECS.md |
| 3-4 | 아카이브 목록 화면 | `GET /api/report/archive` | V1_PAGE_SPECS.md |
| 3-5 | 아카이브 에디션 상세 화면 | `GET /api/report/archive/[weekId]` | V1_PAGE_SPECS.md |
| 3-6 | 아카이브 종목 상세 화면 | `GET /api/report/archive/[weekId]/details/[ticker]` | V1_PAGE_SPECS.md |

---

## Phase 4: Admin API 구현

draft → current → archive 상태 전환을 처리하는 Admin 전용 계층.

| 순서 | 엔드포인트 | 역할 | 참조 문서 |
|------|-----------|------|-----------|
| 4-1 | `GET /api/admin/draft` | draft 리포트 조회 | V1_ADMIN_FLOW.md |
| 4-2 | `GET /api/admin/approval` | approval.json 현재 상태 조회 | V1_MANIFEST_APPROVAL_SCHEMA.md |
| 4-3 | `PATCH /api/admin/approval` | decision 업데이트 (pending → approved/rejected/on_hold) | V1_MANIFEST_APPROVAL_SCHEMA.md |
| 4-4 | `POST /api/admin/publish` | approved → current 파일 이동 + archive 처리 | V1_STATE_TRANSITION_RULES.md |
| 4-5 | `GET /api/admin/signals/[weekId]` | 신호 파일 목록 조회 | V1_NEWS_SIGNAL_FILE_SCHEMA.md |
| 4-6 | `GET /api/admin/signals/[weekId]/review` | signal_review.json 조회 | V1_NEWS_SIGNAL_FILE_SCHEMA.md |
| 4-7 | `PATCH /api/admin/signals/[weekId]/review/[signalId]` | 개별 신호 review_status 업데이트 | V1_NEWS_SIGNAL_FILE_SCHEMA.md |

**상태 전환 구현 우선 순서**: draft 읽기 → approval 읽기/쓰기 → publish (파일 이동) 순서로 구현.

---

## Phase 5: Admin 화면 구현

| 순서 | 화면/컴포넌트 | 참조 문서 |
|------|-------------|-----------|
| 5-1 | draft 리포트 미리보기 화면 | V1_ADMIN_FLOW.md |
| 5-2 | 신호 검수 화면 (signal_review 기반 APPROVED/DISCARDED/PENDING 토글) | V1_ADMIN_REVIEW_CRITERIA.md |
| 5-3 | 승인 결정 화면 (approval.decision 업데이트) | V1_MANIFEST_APPROVAL_SCHEMA.md |
| 5-4 | 발행 실행 확인 화면 (publish 트리거) | V1_STATE_TRANSITION_RULES.md |
| 5-5 | 중복 이력 확인 패널 (overlap_history 기반) | V1_OVERLAP_HISTORY_POLICY.md |

---

## Phase 6: 검증 및 안정화

| 항목 | 내용 |
|------|------|
| 6-1 | 전체 샘플 JSON으로 E2E 흐름 검증 (draft → 신호 검수 → approve → publish → archive 확인) |
| 6-2 | stock/etf 타입 상세 페이지 렌더링 차이 검증 |
| 6-3 | archive 에디션 접근 경로 (`data/archive/details/` flat 구조) 검증 |
| 6-4 | `linked_signal_ids` → 신호 상세 팝업/링크 동작 검증 |
| 6-5 | Admin 인증 미들웨어 추가 (Admin API 보호) |
| 6-6 | Fallback 처리 검증 (신호 파일 없을 때 publish 가능 여부) |

---

## 구현 단계별 의존성 요약

```
Phase 0 (환경)
  └─ Phase 1 (로더)
       └─ Phase 2 (Public API)
            └─ Phase 3 (Public 화면)
       └─ Phase 4 (Admin API)
            └─ Phase 5 (Admin 화면)
Phase 3 + Phase 5 완료 → Phase 6 (검증)
```

Phase 1은 Phase 2/4 모두의 선행 조건이며, Phase 2와 Phase 4는 병렬 구현 가능.
Phase 3와 Phase 5도 API가 완성된 순서대로 병렬 진행 가능.

---

## 참조 문서 목록

| 목적 | 문서 |
|------|------|
| 파일 구조 전체 | V1_FOLDER_STRUCTURE.md |
| JSON 키 매핑 | V1_JSON_KEY_MAPPING.md |
| 파일 역할 경계 | V1_JSON_FILE_ROLE_BOUNDARIES.md |
| JSON 스키마 전체 | V1_JSON_SCHEMA.md |
| 접근/로딩 규칙 | V1_ACCESS_AND_LOADING_RULES.md |
| 상태 전환 규칙 | V1_STATE_TRANSITION_RULES.md |
| 라우트 맵 | V1_ROUTE_MAP.md |
| 페이지 사양 | V1_PAGE_SPECS.md |
| Admin 흐름 | V1_ADMIN_FLOW.md |
| 신호 파일 스키마 | V1_NEWS_SIGNAL_FILE_SCHEMA.md |
| 신호 검수 기준 | V1_ADMIN_REVIEW_CRITERIA.md |
| 승인 스키마 | V1_MANIFEST_APPROVAL_SCHEMA.md |
| 중복 이력 정책 | V1_OVERLAP_HISTORY_POLICY.md |
| 샘플 데이터 가이드 | V1_SAMPLE_DATA_GUIDE.md |
| 샘플 확장 계획 | V1_SAMPLE_JSON_EXPANSION_PLAN.md |

---

> 이 문서는 V1 구현 시작 전 작성된 설계 기준이며, 구현 진행 중 변경 사항이 생기면 이 문서를 갱신하고 변경 이유를 기록한다.

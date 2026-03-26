# V1 상태 파일 설계 문서

> **문서 목적**: current / draft / archive 각 상태 파일의 구조, 역할, 보관 규칙을 정의한다.
> **전제**: DB 없음. 모든 상태는 JSON 파일로 관리된다.
> **핵심 원칙**: 리포트의 상태는 "어느 폴더에 파일이 있는가"로 결정된다. 별도 상태 필드로 이를 중복 표현하지 않는다.

---

## 리포트 상태 체계

이 프로젝트에서 리포트의 상태는 두 가지로 분리된다.

| 구분 | 정의 | 결정 방식 |
|------|------|----------|
| **리포트 저장 상태** | 이 리포트가 현재 어디에 있는가 | 파일이 위치한 폴더로 결정 (`draft/` / `current/` / `archive/`) |
| **검수 의사결정 상태** | admin이 이 draft에 대해 어떤 결정을 했는가 | `admin/approval.json`의 `decision` 필드로 결정 |

두 상태를 하나의 status 필드로 섞어서 표현하지 않는다.

---

## 상태 개요

| 리포트 저장 상태 | 폴더 위치 | 설명 | 동시 존재 수 |
|----------------|----------|------|-------------|
| `draft` | `data/draft/` | admin 검수 대기 중인 초안 | V1 운영 원칙상 주차당 1개 기본 |
| `current` | `data/current/` | 현재 공개 중인 리포트 | 항상 1개 |
| `archive` | `data/archive/YYYY-WNN/` | 과거 발행본 (불변 보관) | 제한 없음 |

---

## 1. current 파일

### 위치
```
data/current/
├── manifest.json
├── market_summary.json
├── picks/
│   ├── pick_01.json ~ pick_05.json
└── news_signals.json
```

### 운영 원칙
- `current`는 서비스가 살아 있는 동안 **항상 1개** 존재해야 한다.
- `current`가 없는 상태는 서비스 장애로 간주한다.
- `current`의 내용은 admin 승인 완료 이전까지 변경되지 않는다.
- 새 에디션 승인 시 기존 `current`는 `archive`로 이동하고, draft가 `current`로 들어온다.
- 발행 완료 이후 `current` 내용의 임의 수정은 금지된다.

### manifest.json 핵심 필드
- 에디션 식별자 (예: 주차 기반 ID)
- 발행 기준일 (data_reference_date)
- 발행 완료 시각 (published_at)
- 메인 추천 종목 목록 (ticker, 종목명, 섹터, 타입 등 — 상세 필드는 스키마 문서 참조)

---

## 2. draft 파일

### 위치
```
data/draft/
├── manifest.json
├── market_summary.json
├── picks/
│   ├── pick_01.json ~ pick_05.json
└── news_signals.json
```

### 운영 원칙
- `draft`는 V1 운영 원칙상 **주차당 1개를 기본**으로 한다.
  - 신규 draft 생성 시 기존 draft는 덮어쓴다.
  - 재생성/보정본 처리 방식은 후속 운영 정책으로 남긴다.
- `draft`는 절대 public 화면에 노출되지 않는다. (admin only)
- admin 검수 전까지 `draft`는 `current`에 영향을 주지 않는다.
- 승인 시 `draft` 전체가 `current`로 이동한다.
- 반려 시 `draft`는 그 자리에 유지되며 수정 후 재검수가 가능하다.

### manifest.json 핵심 필드
- 에디션 식별자
- 초안 생성 시각 (created_at)
- 데이터 기준일 (data_reference_date)
- 메인 추천 종목 목록
- 작성자 메모 (선택)

> draft/manifest.json에는 검수 의사결정 상태(승인/반려 등)를 기록하지 않는다.
> 검수 결과는 `admin/approval.json`에만 기록한다.

---

## 3. archive 파일

### 위치
```
data/archive/
└── {YYYY-WNN}/           # 폴더명 규칙: 발행 기준 주차
    ├── manifest.json
    ├── market_summary.json
    ├── picks/
    │   ├── pick_01.json ~ pick_05.json
    └── news_signals.json
```

### 폴더명 규칙
- 형식: `YYYY-WNN` (예: `2025-W14`, `2025-W16`)
- 기준: 해당 에디션의 발행 기준 주차 (월요일이 속한 ISO 주차)

### 운영 원칙
- `archive`에 들어간 파일은 **불변(immutable)** 이다. 수정 금지.
- 삭제 금지. 발행 이력은 영구 보관한다.
- archive 내 파일은 public에서 조회 가능하다 (아카이브 페이지).
- archive의 폴더 구조는 current와 동일하게 유지한다 (일관된 조회를 위해).

### manifest.json 핵심 필드
- 에디션 식별자
- 원본 발행 시각 (published_at, current 시절 기록 그대로 유지)
- archive 이동 시각 (archived_at)
- 메인 추천 종목 목록
- 데이터 기준일

---

## 파일명 규칙

| 파일 | 규칙 | 예시 |
|------|------|------|
| manifest.json | 고정 파일명 | `manifest.json` |
| market_summary.json | 고정 파일명 | `market_summary.json` |
| pick 파일 | 순서 기반 고정 번호 (01~05) | `pick_01.json`, `pick_05.json` |
| news_signals.json | 고정 파일명 | `news_signals.json` |
| archive 폴더 | YYYY-WNN | `2025-W14/` |

---

> **미확정**: pick 파일 내부의 실제 필드 스키마는 추천 로직 및 데이터 소스 확정 후 정의한다.
> **미확정**: market_summary.json 및 news_signals.json의 상세 필드 구조는 데이터 수집 방식 확정 후 정의한다.
> **미확정**: 재생성/보정본 draft 처리 방식은 후속 운영 정책으로 결정한다.

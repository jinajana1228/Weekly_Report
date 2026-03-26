# V1 프로젝트 폴더 구조 설계 문서

> **문서 목적**: V1 파일 기반 운영 구조에서 프로젝트 루트 기준 폴더와 파일의 역할을 정의한다.
> **전제**: DB 없음, 파일 기반 JSON + Git + Vercel 구조. 별도 백엔드 서버 없음.

---

## 전체 폴더 구조

```
Weely_Report/
│
├── docs/                          # 설계 문서 (운영 참조용, public 아님)
│   ├── V1_FOLDER_STRUCTURE.md
│   ├── V1_STATE_FILES.md
│   ├── V1_MANIFEST_APPROVAL_SCHEMA.md
│   ├── V1_ADMIN_FLOW.md
│   ├── V1_STATE_TRANSITION_RULES.md
│   ├── V1_FALLBACK_POLICY.md
│   └── V1_OVERLAP_POLICY_MAPPING.md
│
├── data/                          # 운영 데이터 루트
│   ├── current/                   # 현재 공개 중인 리포트
│   │   ├── manifest.json          # 현재 에디션 메타 + 상태
│   │   ├── market_summary.json    # 시장 요약 데이터
│   │   ├── picks/                 # 메인 추천 5개 리포트
│   │   │   ├── pick_01.json
│   │   │   ├── pick_02.json
│   │   │   ├── pick_03.json
│   │   │   ├── pick_04.json
│   │   │   └── pick_05.json
│   │   └── news_signals.json      # 구조화된 뉴스 신호 (참고용)
│   │
│   ├── draft/                     # admin 검수 중인 초안
│   │   ├── manifest.json          # 초안 메타 + approval 상태
│   │   ├── market_summary.json
│   │   ├── picks/
│   │   │   ├── pick_01.json
│   │   │   ├── pick_02.json
│   │   │   ├── pick_03.json
│   │   │   ├── pick_04.json
│   │   │   └── pick_05.json
│   │   └── news_signals.json
│   │
│   └── archive/                   # 과거 발행본 (불변 보관)
│       ├── 2025-W12/              # 폴더명 규칙: YYYY-WNN (ISO 주차)
│       │   ├── manifest.json
│       │   ├── market_summary.json
│       │   ├── picks/
│       │   └── news_signals.json
│       ├── 2025-W14/
│       └── ...
│
├── admin/                         # admin 전용 파일 (public 미노출)
│   ├── approval.json              # 현재 draft의 승인 상태 파일
│   └── overlap_history.json       # 중복 추천 이력 관리 파일
│
└── src/                           # 프론트엔드 소스 (기술 스택 미확정)
    └── (구현 단계에서 결정)
```

---

## 폴더 및 파일 역할 정의

### `data/current/`
| 항목 | 설명 |
|------|------|
| 접근 범위 | **Public** (누구나 읽을 수 있음) |
| 역할 | 현재 공개 중인 최신 리포트 데이터 |
| 상태 | 항상 1개 존재해야 함 |
| 변경 시점 | admin 승인 완료 후에만 교체됨 |
| 변경 주체 | 자동화 스크립트 또는 admin 승인 액션 |

### `data/draft/`
| 항목 | 설명 |
|------|------|
| 접근 범위 | **Admin Only** (public에 절대 노출 금지) |
| 역할 | 금주 생성된 초안, admin 검수 대기 상태 |
| 상태 | 최대 1개 유지 |
| 변경 시점 | 매주 일요일 밤 초안 생성 시 교체됨 |
| 변경 주체 | 자동화 스크립트 또는 수동 준비 프로세스 |

### `data/archive/`
| 항목 | 설명 |
|------|------|
| 접근 범위 | **Public** (아카이브 목록/상세 페이지에서 조회 가능) |
| 역할 | 과거 발행본 영구 보관 |
| 상태 | 발행 이력 전체 축적, 삭제 금지 |
| 변경 시점 | current가 새 에디션으로 교체될 때 기존 current 이동 |
| 변경 주체 | 승인 흐름의 일부로 자동 처리 |

### `admin/`
| 항목 | 설명 |
|------|------|
| 접근 범위 | **Admin Only** |
| `approval.json` | 현재 draft의 승인 상태, 검수 결과, 검수자 메모 포함 |
| `overlap_history.json` | 최근 3주 메인 추천 종목 이력 (중복 추천 정책 적용에 사용) |

### `docs/`
| 항목 | 설명 |
|------|------|
| 접근 범위 | **운영 참조용** (public 미노출 권장) |
| 역할 | 설계 원칙, 운영 정책, 파일 스키마 문서 |

---

## Public / Admin Only 구분 요약

| 경로 | Public 여부 | 비고 |
|------|-------------|------|
| `data/current/` | Public | 홈/상세 페이지에서 읽음 |
| `data/archive/` | Public | 아카이브 페이지에서 읽음 |
| `data/draft/` | Admin Only | 절대 public 노출 금지 |
| `admin/approval.json` | Admin Only | 승인 상태 관리 |
| `admin/overlap_history.json` | Admin Only | 중복 추천 이력 |
| `docs/` | 운영 참조용 | 배포 환경에 포함 여부는 구현 단계 결정 |

---

## 제약 사항

- `data/draft/` 내용은 어떠한 경우에도 public 화면에 노출되면 안 된다.
- `data/current/`는 항상 1개 이상 존재해야 하며, 비어 있는 상태는 허용하지 않는다.
- `data/archive/` 내 파일은 발행 완료 후 수정이 금지된다 (불변 보관 원칙).
- `admin/` 폴더는 Vercel 배포 시 public 경로에 포함되지 않도록 구현 단계에서 반드시 처리해야 한다.

---

> **미확정**: 최종 기술 스택(프레임워크)에 따라 `src/` 하위 구조 및 파일 서빙 방식은 구현 단계에서 결정한다.
> **미확정**: Vercel에서 `admin/`, `data/draft/` 경로를 차단하는 구체적인 방법은 기술 스택 확정 후 결정한다.

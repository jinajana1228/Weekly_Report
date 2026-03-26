# V1 Admin 쓰기 전략

> **문서 목적**: admin에서 발생하는 쓰기 대상과 저장 전략 후보를 비교하고, V1 기준 권장 전략을 확정하기 위한 설계 문서.
> **단계**: 전략 확정 단계 — 실제 write 구현 금지. 이 문서는 구현 전 판단 기준으로 사용한다.

---

## 1. Admin 쓰기 대상 목록

### 1-1. 확정 필드 (Confirmed Write Targets)

| 대상 | 파일 | 필드 | 쓰기 시점 |
|------|------|------|-----------|
| 발행 결정 | `data/manifests/approval.json` | `decision` | Admin이 승인/반려/보류 선택 시 |
| 검수자 정보 | `data/manifests/approval.json` | `reviewed_by` | 승인 행위 시 |
| 검수 시각 | `data/manifests/approval.json` | `reviewed_at` | 승인 행위 시 |
| 검수 메모 | `data/manifests/approval.json` | `notes` | 검수 시 선택적으로 작성 |

### 1-2. 확정된 참고 정보 필드 (Confirmed Reference Fields)

| 대상 | 파일 | 필드 | 상태 | 비고 |
|------|------|------|------|------|
| 신호 검수 요약 상태 | `data/manifests/approval.json` | `news_signal_review_status` | **확정** | 참고 정보 전용. `decision`에 영향 없음. 발행 차단 조건 아님. |

> **`news_signal_review_status` 원칙**: 이 필드는 `signal_review.json`의 신호 검수 결과를 집계한 요약 상태(`SUFFICIENT` / `PARTIAL` / `SPARSE`)다. approval.json의 발행 게이트 역할(`decision`)과 독립적이며, 이 필드의 값은 발행 가능 여부를 결정하지 않는다. signal_review의 세부 내용을 approval.json에 복사하지 않으며, 요약 상태 수준에서만 참조한다.

### 1-3. 확장 후보 필드 (Extension Candidates — 미확정)

| 대상 | 파일 | 필드 | 상태 |
|------|------|------|------|
| 신호별 검수 결과 | `data/news_signals/{week_id}/signal_review.json` | `review_items[].review_status` | 확장 후보. V1 수동 편집 대상 |
| 신호별 검수 메모 | `data/news_signals/{week_id}/signal_review.json` | `review_items[].review_note` | 확장 후보 |
| 예외 승인 기록 | (미정) | exception 관련 필드 | V1에서는 `notes`로 대체 권장 |

> **중요**: `exception_picks` 또는 별도 예외 승인 필드는 V1 스키마에 없음. V1에서는 `approval.notes`에 예외 사유를 텍스트로 기재하는 방식으로 대체한다. 별도 예외 승인 구조는 V1.1 확장 후보로 분류.

### 1-4. 쓰기 대상 경계 원칙

```
approval.json    = 에디션 최종 발행 결정 상태 (decision + 검수자 정보)
signal_review    = 뉴스 신호 개별 검수 결과 (review_status per signal)
```

- **두 파일의 쓰기 주체와 시점을 분리한다.**
- `approval.json`은 최종 발행 게이트 결정 시 한 번 기록된다.
- `signal_review.json`은 신호 검수 과정에서 점진적으로 업데이트될 수 있다.
- 두 파일의 쓰기 로직을 하나의 API endpoint로 묶지 않는다.

---

## 2. 저장 전략 후보 비교

### 후보 A: 런타임 파일 쓰기 (Runtime JSON Write)

관리자 액션 시 서버가 직접 JSON 파일을 수정하는 방식.

| 항목 | 평가 |
|------|------|
| 구현 난이도 | 낮음 (fs.writeFile 기반) |
| 배포 환경 적합성 | **낮음** — Vercel 등 서버리스 환경은 런타임 파일시스템이 읽기 전용. 자체 서버(Railway 등)에서는 가능하나 인스턴스 재시작 시 파일 소실 위험 있음 |
| 운영 안정성 | 낮음 — 동시 요청 시 race condition. 파일 손상 가능성 |
| rollback 가능성 | 없음 (덮어쓰기 방식) |
| 감사/이력 추적 | 없음 (별도 로그 없으면 변경 이력 소실) |
| V1 적합성 | **부적합** — 배포 환경 제약 + 안정성 부족 |

### 후보 B: Git Commit 기반 반영 (Git-based Write)

관리자 액션이 git commit을 생성하고 원격 저장소에 push → CI/CD가 재배포하는 방식.

| 항목 | 평가 |
|------|------|
| 구현 난이도 | 높음 — Git API 인증, commit 생성, push 로직 필요 |
| 배포 환경 적합성 | 높음 — Vercel은 git push로 자동 재배포. 파일시스템 제약 우회 가능 |
| 운영 안정성 | 높음 — git 자체가 원자적 commit 단위 |
| rollback 가능성 | 높음 — `git revert` 또는 이전 commit으로 복원 |
| 감사/이력 추적 | 높음 — commit log가 자동 감사 기록 |
| V1 적합성 | **부분 적합** — 이상적이나 구현 복잡도가 V1 수준을 초과함 |

> **장기 방향**: V1.1 또는 V2에서 admin 저장 → GitHub API로 파일 업데이트 → 재배포 트리거 구조가 가장 이상적임. 단 V1에서는 즉시 구현 불가.

### 후보 C: 외부 저장소/KV (DB or Key-Value Store)

Supabase, Vercel KV, PlanetScale, Redis 등 외부 저장소에 admin 상태를 저장하는 방식.

| 항목 | 평가 |
|------|------|
| 구현 난이도 | 중간~높음 — 외부 서비스 연동 필요 |
| 배포 환경 적합성 | 높음 — 서버리스 환경에서도 write 가능 |
| 운영 안정성 | 높음 — 트랜잭션 지원 |
| rollback 가능성 | 중간 — DB 수준에서는 가능하나 파일 상태와 동기화 필요 |
| 감사/이력 추적 | 높음 — audit 테이블 구성 가능 |
| V1 적합성 | **부적합** — V1은 파일 기반 운영 원칙. 외부 DB 도입은 V1 설계 원칙에 위배 |

### 후보 D: 로컬 관리자 도구 / 수동 파일 편집 + Git Commit

관리자가 로컬에서 스크립트를 실행하거나 직접 JSON을 편집 → git commit/push → 자동 재배포되는 방식.

| 항목 | 평가 |
|------|------|
| 구현 난이도 | **가장 낮음** — 별도 런타임 write 로직 불필요 |
| 배포 환경 적합성 | **높음** — 배포 환경 파일시스템 제약 없음 |
| 운영 안정성 | **높음** — git이 상태 관리. 실수 시 revert 가능 |
| rollback 가능성 | **높음** — git history 기반 즉시 복원 |
| 감사/이력 추적 | **높음** — commit log = 자동 감사 기록 |
| V1 적합성 | **가장 적합** — 파일 기반 운영 원칙과 완전히 일치 |

> **단점**: 비기술 관리자에게 부담. 하지만 V1에서 "사람은 최종 승인만 판단한다"는 원칙 하에 관리자는 소수이며, 간단한 CLI 스크립트 제공으로 충분히 해소 가능.

---

## 3. V1 기준 권장 전략

### **권장: 후보 D — 로컬 관리자 도구 + Git Commit**

**핵심 흐름:**
```
1. 관리자가 로컬에서 admin 화면 확인 (read-only)
2. 관리자가 CLI 스크립트 또는 직접 JSON 편집으로 approval.json 업데이트
3. git commit + push
4. 배포 환경이 새 파일 상태를 반영 (자동 재배포 또는 수동 배포)
```

**이 방식이 V1에 적합한 이유:**
- 런타임 write 구현 없이 즉시 운영 시작 가능
- git history가 감사 기록 역할 수행
- Vercel/서버리스 파일시스템 제약 없음
- "사람은 최종 승인만 판단" 원칙과 일치 — 발행 빈도가 낮으면 수동 편집 부담 없음
- rollback = `git revert` 한 줄

**approval.json 업데이트 대상 필드 (V1):**
```
decision: "approved" | "rejected" | "on_hold"
reviewed_by: "담당자명"
reviewed_at: "ISO 8601 타임스탬프"
notes: "검수 메모 (선택)"
```

**signal_review.json 업데이트 방식 (V1):**
- 신호 수집 스크립트가 자동 생성한 signal_review.json을 관리자가 직접 편집
- 개별 신호의 `review_status` (APPROVED/DISCARDED/PENDING) 변경
- 동일한 git commit 방식으로 반영

---

## 4. V1에서 즉시 구현하지 않을 전략

| 전략 | 이유 | 미루는 시점 |
|------|------|-------------|
| 런타임 파일 쓰기 API | 배포 환경 제약 + 안정성 부족 | — (배포 구조 재검토 전까지 보류) |
| GitHub API 기반 자동 commit | 구현 복잡도 초과 | V1.1 |
| 외부 KV/DB (Supabase, Vercel KV) | V1 파일 기반 원칙 위배 | V2 |
| approval UI에서 실시간 저장 | 런타임 write 필요 → 배포 환경 제약 | V1.1 |
| signal_review 실시간 토글 UI | 동일 이유 | V1.1 |
| 예외 승인(exception_picks) 별도 구조 | V1 스키마에 없음 | V1.1 확장 검토 |
| Admin 감사 로그 별도 파일 | V1에서는 git log로 대체 | V2 |

---

## 5. Admin 인증/보호 방식과의 관계

### 현재 상태
- `/admin/*` 경로에 인증 미들웨어 없음
- 정적 뷰로만 운영 중 (read-only)

### 쓰기 전략과의 관계

**후보 D(로컬 관리자 도구)를 선택할 경우:**
- 런타임 write API가 없으므로 인증 미들웨어가 write 보호 역할을 할 필요가 없음
- Admin 화면(`/admin/*`)은 "조회 전용 대시보드"이므로 기본 인증(예: HTTP Basic Auth 또는 Middleware 비밀 경로)으로 충분
- V1에서 인증 구현 우선순위는 낮음 — 외부에 서비스되지 않는 동안은 경로 비공개만으로 충분

**만약 런타임 write API를 도입할 경우 (V1.1+):**
- write API endpoint에 반드시 인증 토큰 검사 필요
- Next.js Middleware 또는 API route 레벨 인증 필요
- 이 경우 인증 전략과 write 전략을 동시에 설계해야 함

### V1 권장 인증 방식
- Admin 화면: Next.js Middleware에서 경로 보호 (환경변수 기반 비밀 경로 또는 Basic Auth)
- write 동작 없으므로 인증 복잡도 최소화
- 인증 구현을 V1 write 구현 이전에 먼저 적용하는 것을 권장

---

## 6. 아직 최종 확정이 필요한 항목

| 항목 | 현재 상태 | 확정 필요 이유 |
|------|-----------|----------------|
| V1 배포 환경 확정 | 미정 | Vercel 서버리스 vs 자체 서버(Railway)에 따라 런타임 write 가능 여부가 달라짐 |
| CLI 스크립트 형식 확정 | 미정 | 관리자가 스크립트를 쓸지, 직접 JSON 편집할지 운영 방식 결정 필요 |
| approval.json 초기화 방식 | 미정 | 발행 완료 후 다음 draft를 위해 approval.json을 어떻게 초기화할지 |
| signal_review 수동 vs 부분 자동화 | 미정 | 신호 수집 스크립트가 signal_review를 자동 생성하는지, 수동 작성하는지 |
| `news_signal_review_status` 필드 확정 여부 | 미확정 확장 후보 | approval.json에 포함할지 별도 파일로 분리할지 |
| exception 승인 기록 방식 | 미확정 | V1에서 `notes`로 충분한지, 별도 구조가 필요한지 |

---

## Self-check before implementation

### 이번 문서에서 권장 쓰기 전략으로 제시한 것
- **후보 D (로컬 관리자 도구 + Git Commit)**: `approval.json` 및 `signal_review.json`을 관리자가 로컬에서 편집/스크립트로 갱신 후 git commit/push. 배포 환경이 새 상태 반영.

### V1에서 아직 구현하지 않기로 둔 것
- 런타임 파일 쓰기 API
- GitHub API 기반 자동 commit
- 외부 KV/DB
- approval UI 실시간 저장
- signal_review 실시간 토글
- 예외 승인 별도 구조

### 구현 전에 사용자가 최종 판단해야 하는 항목
- V1 배포 환경 확정 (Vercel 서버리스 vs 자체 서버)
- CLI 스크립트 형식 vs 직접 JSON 편집 중 운영 방식 선택
- Admin 인증 미들웨어 도입 시점 결정

> **확정 완료**: `news_signal_review_status` 필드는 approval.json의 7번째 확정 필드로 정리되었다. 발행 차단 조건이 아닌 참고 정보 전용이다. (V1_CONSISTENCY_FIX_LOG.md 참조)

### approval / signal_review 경계를 어떻게 유지했는지
- `approval.json` 쓰기 대상: `decision`, `reviewed_by`, `reviewed_at`, `notes`, `news_signal_review_status`(집계 요약만) — 에디션 최종 발행 결정 + 뉴스 신호 요약 상태
- `signal_review.json` 쓰기 대상: `review_items[].review_status`, `review_items[].review_note` — 신호 검수 결과만 포함
- 두 파일의 쓰기 시점, 담당자, 목적을 명시적으로 분리
- 하나의 write API로 두 파일을 동시에 업데이트하는 방식 권장하지 않음

### 내가 임의로 구현하거나 기존 구조를 바꾸지 않은 것
- 실제 write 코드, API route, server action 작성 없음
- 기존 JSON 파일 구조 변경 없음
- 기존 UI 수정 없음
- build/dev 실행 없음

### 현재 운영 원칙 점검
| 원칙 | 점검 결과 |
|------|-----------|
| V1은 자동 수집 중심 | write 전략은 수동 승인 영역에만 한정. 수집 자동화에 영향 없음 |
| 사람은 최종 승인만 판단 | 권장 전략(D)이 이 원칙에 가장 부합 — 사람 개입은 approval.json 편집 한 번 |
| 뉴스는 보완 신호 | signal_review write는 approval write와 독립적으로 설계. 뉴스 검수 미완료 시에도 발행 가능한 구조 |
| 파일 기반 운영 | 권장 전략(D)이 파일 기반 원칙과 완전 일치 |
| approval = 에디션 게이트 | approval.json 쓰기 대상을 에디션 결정 필드로 한정 |
| signal_review = 검수 결과 | signal_review.json 쓰기 대상을 신호 검수 필드로 한정 |

# V1 admin 승인 흐름 문서

> **문서 목적**: 일요일 밤 draft 생성부터 월요일 오전 승인/발행까지 전체 운영 흐름을 정의한다.
> **전제**: DB 없음. 파일 기반 운영. admin은 단일 운영자 기준으로 정의하며, 다중 승인자 체계는 미확정.

---

## 전체 흐름 개요

```
[일요일 밤]            [월요일 오전]              [월요일 오전 이후]
     │                      │                           │
  draft 생성          admin 검수 시작             public 화면 반영
     │                      │
  approval.json          검수 항목 확인
  (decision: pending)        │
                      승인 / 반려 / 보류
                             │
                   ┌─────────┼─────────┐
                 승인       반려       보류
                   │         │          │
             current 전환  draft 유지  fallback 정책
             archive 이동  수정 필요   (V1_FALLBACK_POLICY.md)
```

---

## 단계별 흐름

### 1단계: draft 생성 (일요일 밤)

- 시점: 매주 일요일 밤 (자동화 방식 미확정)
- 생성 대상:
  - `data/draft/manifest.json`
  - `data/draft/market_summary.json`
  - `data/draft/picks/pick_01.json ~ pick_05.json`
  - `data/draft/news_signals.json`
  - `admin/approval.json` (decision: `pending`)
- 이 시점에서 `data/current/`는 **변경되지 않는다.**
- 기존 draft가 있다면 신규 생성 시 덮어쓴다.

### 2단계: admin 검수 (월요일 오전)

admin이 확인해야 하는 항목은 아래와 같다.

#### 필수 검수 항목

| 항목 | 확인 내용 |
|------|-----------|
| 추천 종목 수 | 메인 추천이 정확히 5개인지 |
| 섹터 중복 | 5개 종목 간 섹터 중복이 없는지 |
| 제외 조건 위반 | 동전주, 소시총, 적자, 신규상장, 거래정지 등 필터 조건 위반 종목 없는지 |
| 중복 추천 | 직전 주 메인 추천 종목이 포함되어 있는지 (원칙적 제외) |
| ETF 처리 | ETF가 포함된 경우 ETF 전용 필드가 있는지 |
| 데이터 기준일 | data_reference_date가 이번 주 기준에 맞는지 |
| 추가 추천 2개 | 각 메인 카드의 동일 섹터 추가 추천 2개가 존재하는지 |
| 시장 요약 | market_summary.json의 내용이 적절한지 |
| 뉴스 신호 | news_signals.json이 구조화된 형태를 따르고 기사 전문이 포함되지 않았는지 |

#### 선택 검수 항목

| 항목 | 확인 내용 |
|------|-----------|
| 종목 서술 품질 | 각 pick 파일의 강세/약세 논거, 촉매, 리스크 서술이 충분한지 |
| 전체 에디션 일관성 | 시장 요약과 추천 종목의 방향성이 일관되는지 |

> 연속 추천 예외 처리 항목은 중복 추천 세부 정책 확정 후 이 체크리스트에 추가한다.

---

### 3단계: 승인 결정

#### 승인 시
- `admin/approval.json`의 `decision` → `approved`, `reviewed_at` 기록
- current 전환 프로세스 진행 (→ V1_STATE_TRANSITION_RULES.md 참조)
- 전환 완료 후 Git push → Vercel 반영

#### 반려 시
- `admin/approval.json`의 `decision` → `rejected`, `reviewer_note`에 반려 사유 기록
- `data/current/`는 **변경 없음** (기존 current 유지)
- 수정 후 draft 재준비 → 1단계부터 재시작

#### 보류 시
- `admin/approval.json`의 `decision` → `on_hold`, `reviewer_note`에 보류 사유 기록
- `data/current/`는 **변경 없음** (기존 current 유지)
- fallback 정책에 따라 처리 (→ V1_FALLBACK_POLICY.md 참조)

---

## 각 결정의 public 화면 영향 요약

| 결정 | data/current/ | public 화면 |
|------|---------------|-------------|
| pending (검수 전) | 변경 없음 | 기존 에디션 표시 |
| approved | 새 에디션으로 교체 | 새 에디션 표시 |
| rejected | 변경 없음 | 기존 에디션 유지 |
| on_hold | 변경 없음 | 기존 에디션 유지 |

---

## 보안 원칙

- `data/draft/` 및 `admin/` 경로는 public에 노출되지 않아야 한다.
- admin 기능에는 인증/인가가 필요하다.
- 구체적인 구현 방식(접근 차단, 인증 방법 등)은 기술 스택 확정 후 결정한다.

---

> **미확정**: 자동화 방식 (GitHub Actions, 수동 스크립트 등)은 기술 스택 확정 후 결정한다.
> **미확정**: admin 검수 UI의 구체적인 구현 방식은 구현 단계에서 결정한다.
> **미확정**: 다중 승인자 체계는 운영 정책 확정 후 결정한다.
> **미확정**: 검수 알림 방식은 운영 환경 확정 후 결정한다.

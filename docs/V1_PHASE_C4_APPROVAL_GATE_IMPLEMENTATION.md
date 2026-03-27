# V1 Phase C-4 Admin 검토/승인 게이트 구현 문서

> 최종 업데이트: 2026-03-26
> 구현 대상: `scripts/approve.mjs` (보완), `scripts/check-approval.mjs` (신규)

---

## 1. C-3 draft와 C-4 approval의 역할 차이

| 구분 | Phase C-3 (Draft 생성) | Phase C-4 (Approval Gate) |
|------|------------------------|---------------------------|
| 목적 | 후보군 구조화 + 검토용 초안 생성 | admin 검토 결과를 공식 기록에 남김 |
| 산출물 | `data/draft/{week_id}.json` | `data/manifests/approval.json` 갱신 |
| 자동화 | 완전 자동 (스크립트 실행 = 생성 완료) | **admin이 반드시 직접 실행** |
| 결정 | 점수 기반 구조화 + 경고 생성 | approved / rejected / on_hold / pending |
| publish | ❌ 없음 | ❌ 없음 (`publish_ready: true`여도 수동 publish 필요) |

C-3는 "무엇이 후보인가"를 구조로 표현합니다.
C-4는 "admin이 검토했고 이 결과를 공식 승인한다"는 **책임 기록**입니다.

---

## 2. approval.json이 왜 최종 발행 게이트인가

```
data/draft/{week_id}.json    ← C-3 자동 생성 (스크립트)
         ↓ admin 검토
data/manifests/approval.json ← C-4 admin 기록 (수동 CLI)
         ↓ publish_ready === true 확인 후
publish 스크립트             ← C-5 수동 실행 (별도 단계)
         ↓
data/current/current.json 갱신
```

`approval.json`은 자동으로 갱신되지 않습니다. 오직 admin이 `npm run approval:write`를 명시적으로 실행해야만 갱신됩니다.

이 구조가 필요한 이유:
- 스크립트 오류나 데이터 품질 문제가 있어도 자동 publish를 막음
- Soft Flag 종목 포함 여부 등 비즈니스 판단을 admin이 직접 승인
- 심층 감사 추적 (`reviewed_by`, `reviewed_at`, `notes` 기록)

---

## 3. approved와 publish의 차이

| 상태 | 의미 | 자동 연동 |
|------|------|-----------|
| `decision: approved` | admin이 이 draft를 검토했고 발행 허가함 | ❌ — publish 자동 실행 없음 |
| `publish_ready: true` | 승인 + draft 존재 + 품질 인지 + 이슈 없음 | ❌ — publish 자동 실행 없음 |
| publish 수행 | `data/current/current.json` 갱신, archive 이동 | 별도 수동 실행 필요 |

**`approved` ≠ published.**

`publish_ready: true`는 "publish해도 좋다"는 기술적 조건 충족 표시일 뿐입니다.
실제 publish는 admin이 별도로 publish 스크립트를 실행해야 합니다.

---

## 4. approval.json 구조

```json
{
  "draft_report_id": "RPT-2026-W14",   // readonly — draft 식별자
  "draft_week_id":   "2026-W14",        // readonly — week 식별자
  "decision":        "pending",         // approved | rejected | on_hold | pending
  "reviewed_by":     null,              // 검토자 이름
  "reviewed_at":     null,              // ISO8601 기록 시각
  "notes":           null,              // 검토 메모
  "news_signal_review_status": null,    // SUFFICIENT | PARTIAL | SPARSE (참고용)
  "draft_exists":    true,              // 자동 계산 — data/draft/{week_id}.json 존재 여부
  "blocking_issues": [],                // admin이 명시한 차단 이슈 목록
  "data_quality_acknowledged": false,   // admin이 데이터 한계를 인지했는가
  "publish_ready":   false              // 자동 계산 — 4가지 조건 모두 충족 시 true
}
```

### publish_ready 자동 계산 조건 (모두 충족해야 true)

```
decision === 'approved'
  AND draft_exists === true
  AND data_quality_acknowledged === true
  AND blocking_issues.length === 0
```

`publish_ready`와 `draft_exists`는 스크립트가 자동 계산합니다. 사용자가 직접 설정할 수 없습니다.

---

## 5. draft 파일이 없으면 승인 차단

`decision`을 `pending` 이외 상태로 변경할 때, `data/draft/{week_id}.json`이 없으면 스크립트가 오류를 반환하고 `approval.json`을 수정하지 않습니다.

```
✗ data/draft/2026-W14.json 파일이 없습니다.
  Phase C-3을 먼저 실행하세요: npm run draft:c3 -- --week-id 2026-W14
```

`pending`으로 되돌리는 경우에는 draft 존재 여부를 확인하지 않습니다 (초기화 허용).

---

## 6. Soft Flag / HF_OVERHEATED / data_quality_notes 처리

### 승인 시 admin이 직접 판단해야 할 항목

| 항목 | 위치 | 승인 시 처리 |
|------|------|-------------|
| Soft Flag 종목 | `data/draft/{week_id}.json` → `watchlist`의 `review_required: true` | admin이 포함 여부 판단 후 `notes`에 기록 |
| HF_OVERHEATED 미평가 | draft `admin_notes[1]` / 모든 후보 `caution_flags` | `data_quality_acknowledged: true` + `notes`에 인지 메모 |
| data_quality_notes | draft `data_quality_notes` | `data_quality_acknowledged: true`로 인지 확인 |
| blocking_issues | admin이 명시 | 없으면 `[]`, 있으면 이슈 기록 |

### data_quality_acknowledged 의미

`--acknowledge-data-quality` 플래그를 포함해 실행하면 `data_quality_acknowledged: true`가 됩니다. 이는 admin이 다음을 확인했음을 의미합니다:
- HF_OVERHEATED 전체 미평가 → 단기 급등 과열 미반영
- HF_LOW_LIQUIDITY provisional → 1일 프록시 기반
- 한국가스공사·KB금융 quality 중립값 적용
- 기타 draft `data_quality_notes` 항목들

이 플래그 없이는 `publish_ready: true`가 될 수 없습니다.

---

## 7. 상태 전환 규칙

| 전환 | 허용 | 비고 |
|------|------|------|
| pending → approved | ✅ | draft 존재 + reviewed-by 필수 |
| pending → rejected | ✅ | draft 존재 + reviewed-by 필수 |
| pending → on_hold  | ✅ | draft 존재 + reviewed-by 필수 |
| approved → pending | ✅ | 초기화 (draft 미확인) — 경고 발생 |
| rejected → approved| ✅ | 재검토 가능 |
| approved → rejected| ✅ | 재검토 가능 |

---

## 8. 설계 원칙 Self-check

- [x] **draft 존재 차단**: `pending` 외 상태 전환 시 draft 파일 없으면 오류
- [x] **publish 자동 실행 없음**: `publish_ready: true`여도 publish 코드 없음
- [x] **current/archive 비접촉**: `approve.mjs` / `check-approval.mjs` 모두 쓰기 없음
- [x] **manifest.json 비접촉**: 읽기/쓰기 없음
- [x] **기존 호환 유지**: 기존 필드 구조 그대로, 신규 필드만 추가
- [x] **자동 계산 필드 보호**: `draft_exists`, `publish_ready`는 사용자가 직접 설정 불가
- [x] **dry-run 지원**: `--dry-run` 시 approval.json 미수정
- [x] **멱등성**: 동일 값 재실행 시 변경 없음으로 처리

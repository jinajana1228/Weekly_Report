# V1 Phase C-5 승인+반영 통합 구현 문서

> 최종 업데이트: 2026-03-26
> 구현 대상: `scripts/approve-commit.mjs`

---

## 1. 왜 수동 publish를 제거했는가

기존 구조는 "승인 → 수동 publish CLI 실행" 2단계였습니다.
이를 제거하고 "승인 즉시 반영"으로 변경한 이유:

| 기존 (2단계) | 변경 후 (1단계) |
|-------------|----------------|
| approval:write → 별도 publish 명령 | approval:commit 1회로 완료 |
| publish 누락 사고 가능 | 승인이 곧 반영 — 누락 없음 |
| 두 단계의 상태 불일치 가능 | 원자적 처리로 일관성 보장 |

단, **안전장치는 그대로 유지**합니다. 승인 즉시 반영이지만, 모든 게이트 조건이 통과해야만 반영됩니다.

---

## 2. 운영 흐름

```
C-1: npm run evaluate:hf -- --week-id {week_id}
C-2: npm run score:c2     -- --week-id {week_id}
C-3: npm run draft:c3     -- --week-id {week_id}
     ↓ admin가 data/draft/{week_id}.json 검토
C-5: npm run approval:commit -- --decision approved --reviewed-by <이름> \
       --acknowledge-data-quality --week-id {week_id}
     ↓ 게이트 통과 시 4개 파일 원자적 반영
```

---

## 3. 승인 즉시 반영의 안전장치

`approved` 결정 시 아래 **5가지 게이트 모두 통과해야만** 파일이 기록됩니다.

| 게이트 | 확인 내용 | 차단 메시지 |
|--------|-----------|------------|
| week_id 일치 | `--week-id` == approval.json.draft_week_id | `week_id 불일치` |
| draft 파일 존재 | `data/draft/{week_id}.json` 존재 | `파일 없음. npm run draft:c3 실행 필요` |
| reviewed_by 입력 | `--reviewed-by` 비어있지 않음 | `--reviewed-by 필수` |
| data_quality_acknowledged | `--acknowledge-data-quality` 플래그 포함 | `--acknowledge-data-quality 필수` |
| blocking_issues 없음 | 이슈 목록 비어있음 | `blocking_issues 미해소` |

**조건 하나라도 실패하면 어떤 파일도 수정되지 않습니다.**

---

## 4. dry-run과 실제 승인 반영의 차이

| 구분 | `--dry-run` 포함 | `--dry-run` 미포함 |
|------|-----------------|-------------------|
| 게이트 검증 | 동일하게 수행 | 동일하게 수행 |
| 파일 기록 | ❌ 없음 | ✅ 4개 파일 기록 |
| 콘솔 출력 | 반영 예정 내용 미리보기 | 반영 완료 확인 |

dry-run에서 "반영 대상 파일", "picks 미리보기", "approval.json 변경 후 상태"를 모두 확인할 수 있습니다.
**항상 dry-run을 먼저 실행한 후 실제 승인을 수행하세요.**

---

## 5. 실패 시 파일 무변경 원칙

```
검증 단계 (메모리 내)
  → 게이트 조건 전체 확인
  → 모든 페이로드 빌드 (approval / current / archive / manifest)
       ↓ 하나라도 실패
      즉시 오류 출력 + process.exit(1)
      → 어떤 파일도 기록하지 않음

  → 모두 통과 시
       ↓ dry-run이면 여기서 종료 (파일 기록 없음)
       ↓ 실제 실행이면 순서대로 기록:
          1. approval.json
          2. archive/{old_week_id}.json (새 주차인 경우만)
          3. current/current.json
          4. manifest.json
```

Node.js는 OS 수준 원자적 트랜잭션을 지원하지 않으므로, 쓰기 도중 프로세스가 강제 종료되면 부분 기록이 발생할 수 있습니다. 이 경우 `npm run draft:c3`과 `npm run approval:commit`을 재실행하면 멱등적으로 복구됩니다.

---

## 6. current / archive / manifest 각각의 역할

| 파일 | 역할 | C-5에서 처리 |
|------|------|-------------|
| `data/current/current.json` | 현재 공개 중인 리포트. 프론트엔드가 읽는 메인 파일 | draft에서 빌드하여 덮어씀 |
| `data/archive/{old_week_id}.json` | 이전 current를 보관. 히스토리 조회용 | 기존 current week가 다른 경우에만 생성 |
| `data/manifests/manifest.json` | current/archive 메타 인덱스 | current_week_id, archive_week_ids 갱신 |
| `data/manifests/approval.json` | 승인 상태 게이트 기록 | decision/reviewed_by/publish_ready 갱신 |
| `data/draft/{week_id}.json` | C-3 생성 초안 | **수정/삭제 없음** — 기록 보존 |

---

## 7. current.json 생성 방식 (draft → current 매핑)

| current.json 필드 | 출처 | 비고 |
|-------------------|------|------|
| `report_id` | `RPT-{week_id}` | 자동 생성 |
| `week_id` | args.weekId | |
| `data_as_of` | market_context_summary.as_of | YYYYMMDD → YYYY-MM-DD 변환 |
| `published_at` | 실행 시각 | |
| `picks` | candidate_picks.primary (5건) | one_line_reason = inclusion_reason |
| `picks[].stance` | C-2 점수 기반 힌트 + `[편집 필요]` | admin 편집 권장 |
| `picks[].catalyst_summary` | `[편집 필요]` | pipeline에서 미생성 |
| `picks[].risk_summary` | caution_flags 자동 채움 | |
| `market_summary.domestic.kospi.level` | market_context_summary.kospi.close | |
| `market_summary.global.headline` | `[편집 필요]` | 편집 권장 |
| `favored_sectors` | primary 상위 3개 섹터 | |
| `cautious_sectors` | watchlist Soft Flag 섹터 | |
| `sector_returns` | `[]` | 미수집 |
| `related_news` | `[]` | 미수집 |

`[편집 필요]` 마커가 있는 필드는 admin이 current.json을 직접 편집하거나 이후 단계에서 채워야 합니다.

---

## 8. rejected / on_hold / pending 처리

| decision | approval.json | current / archive / manifest |
|----------|--------------|------------------------------|
| `approved` | ✅ 갱신 | ✅ 갱신 |
| `rejected` | ✅ 갱신 | ❌ 비접촉 |
| `on_hold` | ✅ 갱신 | ❌ 비접촉 |
| `pending` | ✅ 갱신 (초기화) | ❌ 비접촉 |

---

## 9. 멱등성 (재실행 안전성)

동일 week_id로 재실행 시:
- approval.json: 동일 값으로 덮어씀 (안전)
- current.json: 동일 draft 기반 재생성 (안전)
- archive: 기존 current week == 새 week면 생성하지 않음 (안전)
- manifest: 이미 있는 archive_week_id는 중복 추가하지 않음 (안전)

---

## 10. admin이 승인 전 반드시 확인해야 하는 항목

1. **`data/draft/{week_id}.json` primary_candidates 5종목 검토**
   - inclusion_reason 적절성
   - caution_flags 인지
   - 섹터 분산 (admin_notes 참조)

2. **Soft Flag 종목 watchlist 검토**
   - `review_required: true` 항목의 triggered_rules 원인

3. **HF_OVERHEATED 전체 미평가 인지** (`--acknowledge-data-quality` 포함)

4. **data_quality_notes 확인**
   - quality 중립값 종목, liquidity provisional 등

5. **blocking_issues 없음 확인** (있으면 `--blocking-issues none`으로 해소)

---

## 11. 설계 원칙 Self-check

- [x] **단일 명령으로 완료**: `approval:commit` 1회로 4파일 원자적 반영
- [x] **조건 미충족 시 무변경**: 게이트 실패 시 process.exit(1) 전 파일 기록 없음
- [x] **dry-run 완전 지원**: 파일 기록 없이 전체 미리보기
- [x] **draft 삭제 없음**: `data/draft/{week_id}.json` 유지
- [x] **rejected/on_hold/pending**: approval.json만 기록, current 비접촉
- [x] **멱등성**: 재실행 시 예측 가능한 결과
- [x] **current → archive 자동 보관**: 새 주차 승인 시 기존 current 자동 archive

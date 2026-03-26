# V1 상태 전환 규칙 문서

> **문서 목적**: draft → current → archive 전환의 운영 원칙과 핵심 규칙을 정의한다.
> **전제**: 전환은 파일 이동으로 이루어지며, 전환 후 Git commit + push가 필수이다.

---

## 상태 전환 개요

```
[일요일 밤]          [admin 승인]           [다음 에디션 승인]
     │                    │                        │
  draft 생성          draft → current          current → archive
  (data/draft/)       (data/current/)         (data/archive/YYYY-WNN/)
```

리포트의 상태는 파일이 위치한 폴더로 결정된다.
전환 = 파일/폴더를 적절한 위치로 이동하는 것이다.

---

## 핵심 전환 원칙 (4가지)

1. **승인 전 current 유지**: admin 승인 없이 current는 변경되지 않는다.
2. **승인 시 current 전환**: approval.json의 decision = `approved`이면 draft → current 전환이 발생한다.
3. **이전 current는 archive 이동**: 새 에디션이 current가 될 때 기존 current는 반드시 archive로 이동한다.
4. **실패 시 기존 current 유지**: 전환 중 오류 발생 시 기존 current를 유지한다. 부분 전환 상태는 허용하지 않는다.

---

## 1. draft → current 전환

### 전환 발생 조건

- `admin/approval.json`의 `decision` = `approved`
- `approval.json`의 `target_edition_id`가 `data/draft/manifest.json`의 `edition_id`와 일치

### 전환 작업 순서

```
1. 기존 data/current/ 전체를 data/archive/{edition_id}/ 로 이동
   - archive/manifest.json에 archived_at 추가
2. data/draft/ 전체를 data/current/ 로 이동
   - current/manifest.json에 published_at 추가
3. admin/approval.json 초기화 (decision: pending, target_edition_id: null 등)
4. Git commit + push → Vercel 반영
```

**부분 전환 금지**: 작업 중 오류가 발생하면 전체 작업을 중단하고 기존 상태를 유지한다.

---

## 2. current → archive 전환

- current → archive 이동은 **항상 draft → current 전환의 일부로 발생한다.**
- 독립적으로 current를 archive로 이동하는 것은 원칙적으로 허용하지 않는다.
- current가 archive로 이동하는 유일한 사유는 "새 에디션 승인 완료"이다.

---

## 3. draft 유지 / 폐기 원칙

| 상황 | draft 처리 |
|------|-----------|
| 반려 (rejected) | 그 자리 유지. 수정 후 재검수 가능 |
| 보류 (on_hold) | 그 자리 유지. fallback 정책 참조 |
| 승인 완료 | current로 이동됨 → draft 폴더는 비워짐 |
| 신규 draft 생성 시 | 기존 draft를 덮어쓴다 |

반려/폐기된 draft는 V1에서 별도 보관하지 않는다.

---

## 4. archive 불변 원칙

| 상황 | 허용 여부 |
|------|----------|
| 일반 수정 | 금지 |
| 오탈자/데이터 오류 수정 | 금지. 후속 에디션에서 정정 공지 권장 |
| 삭제 | 금지 |

archive 오류 수정이 반드시 필요한 경우의 처리 정책(errata 등)은 별도 수립이 필요하다. (미확정)

---

## 5. 승인과 Vercel 반영 사이의 지연

- 파일 기반 운영에서 approval.json 변경만으로 public 화면이 바뀌지 않는다.
- Git commit + push 완료 후 Vercel이 재배포되어야 public에 반영된다.
- "승인 완료" 시점과 "public 반영" 시점 사이에 짧은 지연이 생기는 것은 정상 동작이다.

---

> **미확정**: 전환 프로세스의 자동화 방식은 기술 스택 확정 후 결정한다.
> **미확정**: 전환 실패 시 롤백 처리 방식은 구현 단계에서 정의한다.
> **미확정**: archive 오류 수정 정책(errata)은 별도 수립이 필요하다.

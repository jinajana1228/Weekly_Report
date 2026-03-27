# data/analysis/

Phase C-1 Hard Filter 판단 결과 저장 디렉토리.

Phase B-3 processed 데이터(`data/processed/{week_id}/`)를 입력으로 받아
정책 문서(docs/V1_HARD_FILTER_POLICY.md) 기준의 Hard Filter 판정 결과를 저장합니다.

---

## 디렉토리 구조

```
data/analysis/
  {week_id}/
    hard_filter_results.json   ← 개별 엔티티 Hard Filter 판정 결과 (전체)
    hard_filter_summary.json   ← 전체 요약 (rule별 건수, 판정별 분류)
```

---

## 계층 분리 원칙

| 디렉토리 | 역할 | 생성 단계 |
|----------|------|-----------|
| `data/snapshots/{week_id}/` | 원천 API 응답 (raw) | Phase B-2 |
| `data/processed/{week_id}/` | 정규화 가공본 (중간 계층) | Phase B-3 |
| `data/analysis/{week_id}/` | 판단 결과 계층 (Hard Filter) | Phase C-1 |
| `data/current/`, `data/draft/`, `data/archive/` | 운영 파일 | Phase C 이후 |

- analysis 파일은 processed를 **덮어쓰지 않습니다**.
- analysis 파일은 current/draft/archive와 **독립됩니다**.
- analysis 파일에는 **추천/점수/picks 결과가 포함되지 않습니다**.

---

## 결정(decision) 값 의미

| 값 | 의미 |
|----|------|
| `hard_block` | 즉시 제외. 점수 계산 없이 후보 제거. |
| `soft_flag` | admin 검토 필요. 자동 제외 아님. |
| `pass` | Hard Filter 통과 (일부 input_unavailable 가능). |
| `input_unavailable` | 해당 rule의 입력 데이터 부재. 판단 보류. |
| `not_applicable` | 해당 엔티티 유형에 적용 안 됨 (ETF 등). |

---

## 생성 방법

```bash
# Phase B-3 정규화 먼저
npm run normalize:b3 -- --week-id 2026-W14

# Phase C-1 Hard Filter 판단
npm run evaluate:hf -- --week-id 2026-W14

# 드라이런 (저장 없이 결과 확인)
npm run evaluate:hf -- --week-id 2026-W14 --dry-run
```

---

## .gitignore

생성된 JSON 파일은 git 추적에서 제외됩니다:
```
data/analysis/**/*.json
```

이 README.md 파일과 디렉토리 구조는 git에 포함됩니다.

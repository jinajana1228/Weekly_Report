# data/processed/

Phase B-3 정규화/변환 결과물 저장 디렉토리.

Phase B-2 수집 결과(`data/snapshots/{week_id}/`)의 원천 데이터를
후속 추천/Hard Filter 로직이 바로 참조할 수 있는 **중간 계층 데이터**로 가공해 저장합니다.

---

## 디렉토리 구조

```
data/processed/
  {week_id}/
    normalized_entities.json   ← 종목/ETF 단위 통합 정규화 데이터
    market_context.json        ← 시장 지표 요약 (지수, 거시지표, 글로벌)
    source_health.json         ← 수집 품질/가용성 정리
```

---

## 계층 분리 원칙

| 디렉토리 | 역할 | 생성 단계 |
|----------|------|-----------|
| `data/snapshots/{week_id}/` | 원천 API 응답 (raw) | Phase B-2 |
| `data/processed/{week_id}/` | 정규화 가공본 (중간 계층) | Phase B-3 |
| `data/current/`, `data/draft/`, `data/archive/` | 운영 파일 | Phase C 이후 |

- processed 파일은 snapshots를 **덮어쓰지 않습니다**.
- processed 파일은 current/draft/archive와 **독립됩니다**.
- processed 파일에는 추천/Hard Filter 판단 결과가 **포함되지 않습니다**.

---

## 생성 방법

```bash
# week_id 확인
node scripts/lib/week-id.mjs

# Phase B-3 정규화 실행
npm run normalize:b3 -- --week-id 2026-W14

# 드라이런 (저장 없이 결과 확인)
npm run normalize:b3 -- --week-id 2026-W14 --dry-run
```

Phase B-2 수집이 먼저 완료되어야 합니다:
```bash
npm run collect:all -- --week-id 2026-W14
```

---

## 파일별 목적

### normalized_entities.json
유니버스 전체 종목/ETF를 ticker 기준으로 통합합니다.
가격(krx_price), 상장정보(krx_listing), 투자경고(krx_exchange_status),
재무(dart_financials), 공시(dart_disclosures), 감사(dart_audit), ETF메타(krx_etf_meta)를
한 레코드에 결합합니다.

### market_context.json
시장 전체 맥락을 요약합니다.
KOSPI/KOSDAQ/KOSPI200 지수, USD/KRW, BOK 기준금리, 미국 10년물/FFR,
S&P500/NASDAQ/VIX를 한 파일에서 참조할 수 있습니다.

### source_health.json
source별 수집 상태(ok/partial/unavailable)를 정리합니다.
후속 로직이 어떤 데이터를 신뢰할 수 있는지 파악하는 데 사용합니다.

---

## .gitignore

생성된 JSON 파일은 git 추적에서 제외됩니다 (`.gitignore` 설정):
```
data/processed/**/*.json
```

이 README.md 파일과 디렉토리 구조는 git에 포함됩니다.

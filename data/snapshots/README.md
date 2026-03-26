# data/snapshots/

Phase B-2 데이터 수집 결과 저장소.

## 구조

```
data/snapshots/
  {week_id}/                        # 예: 2026-W14
    krx_price.json                  # KRX 시세 (OHLCV, 52주 고저, 시총)
    krx_flow.json                   # KRX 수급 (외국인·기관 순매수)
    krx_exchange_status.json        # KRX 거래소 지정 종목 여부
    krx_indices.json                # KRX 주요 지수 (KOSPI, KOSDAQ, KOSPI200)
    krx_listing.json                # KRX 상장 정보 (상장주식수)
    krx_etf_meta.json               # KRX ETF 기본 정보 (추적지수, 보수율)
    dart_financials.json            # DART 재무제표 (별도, 최근 2분기·연간)
    dart_disclosures.json           # DART 공시 목록 (최근 4주)
    dart_audit.json                 # DART 감사의견
    market_indicators.json          # ECOS+FRED+Yahoo 거시 지표
    krx_collection_summary.json     # KRX 수집 실행 요약
    dart_collection_summary.json    # DART 수집 실행 요약
    collection_run_summary.json     # 전체 수집 실행 요약
```

## 파일 포맷 (공통 envelope)

```json
{
  "week_id": "2026-W14",
  "collected_at": "2026-04-07T09:00:00.000Z",
  "source": "KRX_OHLCV",
  "schema_version": "1.0",
  "as_of": "20260407",
  "data": [ ... ],
  "_errors": [ ... ]
}
```

## 격리 원칙

- 이 디렉토리는 **data/current, data/draft, data/archive와 완전히 분리**됩니다.
- 수집 스크립트는 이 디렉토리만 수정합니다.
- 발행 스크립트(publish.mjs)는 이 디렉토리를 건드리지 않습니다.
- 스냅샷은 참고 원본 데이터입니다. 리포트 JSON으로의 변환은 Phase C에서 구현합니다.

## 실행 방법

```bash
# 전체 수집
npm run collect:all -- --week-id 2026-W14

# 개별 수집
npm run collect:krx -- --week-id 2026-W14
npm run collect:dart -- --week-id 2026-W14
npm run collect:market -- --week-id 2026-W14

# 드라이런
npm run collect:all -- --week-id 2026-W14 --dry-run
```

## 주의

- `.gitignore`에 `data/snapshots/**/*.json`을 추가해 민감 수집 데이터를 제외하는 것을 권장합니다.
- `collection_run_summary.json` 등 메타 파일은 선택적으로 커밋할 수 있습니다.

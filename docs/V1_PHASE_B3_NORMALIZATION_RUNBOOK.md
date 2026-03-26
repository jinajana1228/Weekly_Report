# V1 Phase B-3 정규화/변환 운영 런북 (Runbook)

> 최종 업데이트: 2026-03-26
> 대상: Phase B-3 정규화 스크립트 운영자

---

## 1. 전제 조건

Phase B-3 정규화 전에 반드시 Phase B-2 수집이 완료되어 있어야 합니다.

```bash
# Phase B-2 수집 먼저
npm run collect:all -- --week-id 2026-W14

# 수집 결과 확인
ls data/snapshots/2026-W14/
# 아래 파일이 존재해야 함:
# krx_price.json, krx_indices.json, krx_exchange_status.json
# dart_financials.json, dart_disclosures.json, dart_audit.json
# market_indicators.json
```

---

## 2. 정기 실행 절차

### 2-1. 실행 타이밍

| 단계 | 타이밍 | 명령 |
|------|--------|------|
| Phase B-2 수집 완료 후 | 수집 직후 또는 D-1 저녁 | `npm run normalize:b3 -- --week-id YYYY-Www` |

Phase B-2 → Phase B-3 순서로 실행합니다.

### 2-2. 드라이런 (저장 없이 결과 확인)

```bash
npm run normalize:b3 -- --week-id 2026-W14 --dry-run
```

콘솔에 각 파일의 내용이 출력됩니다. 저장 없이 결과를 먼저 확인할 때 사용합니다.

### 2-3. 실제 실행

```bash
# week_id 확인
node scripts/lib/week-id.mjs

# 정규화 실행
npm run normalize:b3 -- --week-id 2026-W14
```

### 2-4. 생성 기대 산출물

```
data/processed/2026-W14/
  normalized_entities.json   (약 50~150 KB)
  market_context.json        (약 5~10 KB)
  source_health.json         (약 3~8 KB)
```

성공 시 콘솔 출력:
```
✅ Phase B-3 정규화 완료 — 성공 3/3, 실패 0/3
   출력: data/processed/2026-W14/
   - normalized_entities.json
   - market_context.json
   - source_health.json
```

---

## 3. 수집 결과 검증

### 3-1. 파일 생성 확인

```bash
ls data/processed/2026-W14/
```

### 3-2. normalized_entities 기본 검증

```bash
node -e "
const d = JSON.parse(require('fs').readFileSync('data/processed/2026-W14/normalized_entities.json'));
console.log('레코드 수:', d.record_count);
const withPrice = d.records.filter(r => r.price?.close != null).length;
const withAudit = d.records.filter(r => r.dart_audit?.audit_opinion != null).length;
console.log('가격 있음:', withPrice);
console.log('감사의견 있음:', withAudit);
"
```

정상 기준:
- `record_count`: 15 (유니버스 전체)
- 가격 있음: 15 이상
- 감사의견 있음: 일부 (2025 사업보고서 제출 전 기업은 null 가능)

### 3-3. market_context 기본 검증

```bash
node -e "
const d = JSON.parse(require('fs').readFileSync('data/processed/2026-W14/market_context.json'));
console.log('KOSPI:', d.kr_indices.kospi.close);
console.log('USD/KRW:', d.kr_macro.usd_krw.value);
console.log('BOK 금리:', d.kr_macro.bok_rate.value, '%');
console.log('US 10Y:', d.us_macro.us_10y_treasury.value, '%');
"
```

정상 기준:
- KOSPI close: 숫자 값 존재
- USD/KRW value: 1,000~2,000 범위 숫자
- BOK 금리 value: 1~5 범위 숫자

### 3-4. source_health 요약 확인

```bash
node -e "
const d = JSON.parse(require('fs').readFileSync('data/processed/2026-W14/source_health.json'));
console.log('신뢰 가능:', d.summary.trustable.join(', '));
console.log('부분 성공:', d.summary.partial.join(', '));
console.log('불가:', d.summary.unavailable.map(u => u.source).join(', '));
"
```

현재 예상 결과:
- 신뢰 가능: `krx_price, krx_exchange_status, krx_indices, dart_financials, dart_disclosures, ecos, fred`
- 부분 성공: `dart_audit` (2025 사업보고서 미공시 기업 존재)
- 불가: `krx_flow, krx_listing, krx_etf_meta` (KRX OAP 세션 문제)

---

## 4. Source 누락 시 확인 포인트

### Case A: `normalized_entities.json`에서 가격이 모두 null

원인: Phase B-2에서 `krx_price.json` 수집 실패

확인:
```bash
node -e "const d=JSON.parse(require('fs').readFileSync('data/snapshots/2026-W14/krx_price.json')); console.log('count:', d.data?.length, 'errors:', d._errors?.length)"
```

대응: `npm run collect:krx -- --week-id 2026-W14` 후 재정규화

---

### Case B: ECOS/FRED 값이 unavailable

원인: Phase B-2에서 API 키 없이 수집됐거나 수집 실패

확인:
```bash
cat data/snapshots/2026-W14/market_indicators.json | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
console.log('ecos:', JSON.stringify(d.ecos));
console.log('fred:', JSON.stringify(d.fred));
"
```

대응:
1. `.env.local`에 `ECOS_API_KEY`, `FRED_API_KEY` 확인
2. `npm run collect:market -- --week-id 2026-W14` 후 재정규화

---

### Case C: DART financials가 0건

원인: Phase B-2에서 DART 수집 실패 (API 키 문제 또는 한도 초과)

확인:
```bash
cat data/snapshots/2026-W14/dart_collection_summary.json
```

대응: `npm run collect:dart -- --week-id 2026-W14` 후 재정규화

---

### Case D: normalized_entities 레코드 수가 15 미만

원인: `config/universe.json`에서 일부 종목이 `active: false`로 설정됨

확인:
```bash
node -e "
const u=JSON.parse(require('fs').readFileSync('config/universe.json'));
console.log('active:', u.tickers.filter(t=>t.active!==false).length);
console.log('inactive:', u.tickers.filter(t=>t.active===false).length);
"
```

---

## 5. 부분 재실행

정규화는 멱등합니다. 같은 `week_id`로 재실행하면 기존 파일을 덮어씁니다.

```bash
# 전체 재실행
npm run normalize:b3 -- --week-id 2026-W14

# 드라이런으로 결과 확인 후 실행
npm run normalize:b3 -- --week-id 2026-W14 --dry-run
npm run normalize:b3 -- --week-id 2026-W14
```

특정 소스만 재수집 후 정규화:
```bash
# KRX만 재수집 → 정규화
npm run collect:krx -- --week-id 2026-W14
npm run normalize:b3 -- --week-id 2026-W14
```

---

## 6. 다음 단계(추천/Hard Filter 로직)로 넘기기 전 체크리스트

Phase C(추천/Hard Filter/리포트 생성) 진행 전 반드시 아래를 확인하세요.

### 필수 확인

- [ ] `data/processed/{week_id}/normalized_entities.json` 존재
- [ ] `data/processed/{week_id}/market_context.json` 존재
- [ ] `data/processed/{week_id}/source_health.json` 존재
- [ ] `normalized_entities.json`의 `record_count` = 15 (또는 active 종목 수와 일치)
- [ ] 가격(`price.close`)이 null이 아닌 레코드 10건 이상
- [ ] `market_context.json`의 `kr_indices.kospi.close` 값 존재
- [ ] `market_context.json`의 `kr_macro.usd_krw.value` 값 존재
- [ ] `source_health.json`의 `summary.trustable`에 `krx_price` 포함

### 선택 확인 (없어도 수치 기반 발행 가능)

- [ ] `dart_audit.audit_opinion`이 null이 아닌 레코드 존재 (2025 사업보고서 공시 여부에 따라 달라짐)
- [ ] `dart_financials.period_count` > 0인 레코드 존재
- [ ] `global_equities.sp500.price` 값 존재 (Yahoo 차단 시 null 가능)

### 확인 스크립트

```bash
node -e "
const e = JSON.parse(require('fs').readFileSync('data/processed/2026-W14/normalized_entities.json'));
const m = JSON.parse(require('fs').readFileSync('data/processed/2026-W14/market_context.json'));
const h = JSON.parse(require('fs').readFileSync('data/processed/2026-W14/source_health.json'));

const checks = [
  ['record_count=15', e.record_count === 15],
  ['가격 존재 10건+', e.records.filter(r=>r.price?.close!=null).length >= 10],
  ['KOSPI 값 존재', m.kr_indices?.kospi?.close != null],
  ['USD/KRW 존재', m.kr_macro?.usd_krw?.value != null],
  ['trustable에 krx_price', h.summary.trustable.includes('krx_price')],
];
checks.forEach(([label, ok]) => console.log(ok ? '✅' : '❌', label));
"
```

모든 항목이 ✅이면 Phase C 진행 가능합니다.

---

## 7. 빠른 참조 명령어

```bash
# week_id 확인
node scripts/lib/week-id.mjs

# Phase B-2 수집 (전제)
npm run collect:all -- --week-id $(node scripts/lib/week-id.mjs)

# Phase B-3 정규화 (드라이런)
npm run normalize:b3 -- --week-id $(node scripts/lib/week-id.mjs) --dry-run

# Phase B-3 정규화 (실제)
npm run normalize:b3 -- --week-id $(node scripts/lib/week-id.mjs)

# 결과 확인
ls data/processed/$(node scripts/lib/week-id.mjs)/

# source_health 요약
node -e "
const d=JSON.parse(require('fs').readFileSync('data/processed/$(node scripts/lib/week-id.mjs)/source_health.json'));
console.log('신뢰:', d.summary.trustable.join(', '));
console.log('불가:', d.summary.unavailable.map(u=>u.source).join(', '));
"
```

---

## 8. Self-check before Phase C

- [x] **구현 범위**: snapshots → processed 변환만. 추천/판단 없음
- [x] **분리 확인**: `data/snapshots/`는 읽기 전용. `data/processed/`에만 쓰기
- [x] **current/draft/archive 비접촉**: 해당 경로 접근 없음
- [x] **추천/Hard Filter 없음**: 점수 계산, picks 선정, 필터 판단 코드 없음
- [x] **source provenance**: 모든 필드에 `source` 키 포함
- [x] **unavailable 명시**: `status/reason` 형태로 명시. null로 숨기지 않음
- [x] **멱등성**: 같은 week_id 재실행 시 덮어쓰기 (안전)
- [x] **운영 원칙 위배 없음**:
  - V1 자동 수집 중심 원칙 유지
  - 사람은 Admin 최종 승인만 판단
  - 뉴스 관련 기능 없음
  - current/draft/archive 구조 변경 없음
  - snapshots 독립 영역 유지

import { notFound } from "next/navigation";
import Link from "next/link";
import {
  loadCurrentReport,
  loadCurrentDetail,
  loadNewsSignals,
  loadSignalReview,
} from "@/lib/dataLoader";
import { isETFDetail } from "@/lib/types";
import { fmtNum } from "@/lib/fmt";
import SectorBadge from "@/components/ui/SectorBadge";
import BullBearSection from "@/components/detail/BullBearSection";
import ETFSection from "@/components/detail/ETFSection";
import LinkedSignalsSection from "@/components/detail/LinkedSignalsSection";
import NewsCard from "@/components/ui/NewsCard";

// ─── 재무 필드 한글 라벨 ──────────────────────────────────────────────────────
const FINANCIAL_LABELS: Record<string, string> = {
  revenue:                 "매출액",
  operating_income:        "영업이익",
  operating_margin_pct:    "영업이익률",
  per:                     "PER",
  pbr:                     "PBR",
  roe_pct:                 "ROE",
  revenue_growth_yoy_pct:  "매출 성장률 (YoY)",
  dividend_yield_pct:      "배당수익률",
  ytd_return_pct:          "연초대비 수익률",
  "1y_return_pct":         "1년 수익률",
  tracking_error_pct:      "추적오차율",
  total_expense_ratio_pct: "총보수",
  aum_billion_krw:         "순자산",
}

export function generateStaticParams() {
  const report = loadCurrentReport();
  return (report?.picks ?? []).map((p) => ({ ticker: p.ticker }));
}

export default function ReportDetailPage({
  params,
}: {
  params: { ticker: string };
}) {
  const { ticker } = params;
  const report = loadCurrentReport();
  if (!report) notFound();

  const pick = report.picks.find((p) => p.ticker === ticker);
  if (!pick) notFound();

  const detail = loadCurrentDetail(pick.asset_type, ticker);
  // Load news signals for this week (read-only; gracefully empty if no signal files exist)
  const allSignals = loadNewsSignals(report.week_id);
  const signalReview = loadSignalReview(report.week_id);
  const reviewItems = signalReview?.review_items ?? [];

  // 52주 데이터 (detail이 있을 때만)
  const w52High = detail?.price_reference.week52_high ?? null;
  const w52Low  = detail?.price_reference.week52_low  ?? null;
  const w52Pos  = detail?.price_reference.position_in_52w_pct ?? null;
  const has52w  = w52High != null && w52Low != null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      {/* Breadcrumb */}
      <nav className="text-xs text-zinc-500">
        <Link href="/" className="hover:text-zinc-400 transition-colors">이번 주</Link>
        <span className="mx-2 text-zinc-600">·</span>
        <span className="text-zinc-400">{pick.name}</span>
      </nav>

      {/* Hero */}
      <header>
        <div className="flex items-center gap-2 mb-3">
          <SectorBadge sector={pick.sector} />
          {pick.asset_type === "etf" && (
            <span className="text-xs font-medium text-sky-400 bg-sky-950/50 border border-sky-700/40 rounded px-2 py-0.5">
              ETF
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold text-zinc-50 tracking-tight">{pick.name}</h1>
        <p className="text-sm font-mono text-zinc-500 mt-1.5">
          {pick.ticker} · {pick.market}
        </p>
      </header>

      {/* One-line reason */}
      <div className="accent-line">
        <p className="text-base text-zinc-300 leading-relaxed">
          {pick.one_line_reason}
        </p>
      </div>

      {/* Price reference */}
      <div className="section-card">
        <p className="label-meta mb-4">가격 참고 구간</p>

        {/* 기준가 + 관심 구간 */}
        <div className="flex flex-wrap gap-x-10 gap-y-3 text-sm">
          <div>
            <p className="text-xs text-zinc-500 mb-1">기준가</p>
            <p className="text-2xl font-mono font-semibold text-zinc-50">
              {fmtNum(pick.price_zone.reference_price)}
              <span className="text-sm text-zinc-500 ml-1.5">
                {pick.price_zone.currency}
              </span>
            </p>
          </div>
          {(pick.price_zone.watch_low != null || pick.price_zone.watch_high != null) && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">관심 구간</p>
              <p className="font-mono text-zinc-300 text-sm">
                {fmtNum(pick.price_zone.watch_low)} –{" "}
                {fmtNum(pick.price_zone.watch_high)}
              </p>
            </div>
          )}
        </div>

        {/* 52주 가격 범위 */}
        {has52w && (
          <div className="mt-4 pt-4 border-t border-zinc-700/60">
            <p className="text-xs text-zinc-500 mb-3">52주 가격 범위</p>
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm mb-3">
              <div>
                <p className="text-xs text-zinc-600 mb-0.5">52주 고가</p>
                <p className="font-mono text-zinc-300">{fmtNum(w52High)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-600 mb-0.5">52주 저가</p>
                <p className="font-mono text-zinc-300">{fmtNum(w52Low)}</p>
              </div>
              {w52Pos != null && (
                <div>
                  <p className="text-xs text-zinc-600 mb-0.5">현재 위치</p>
                  <p className="font-mono text-zinc-300">{w52Pos}%</p>
                </div>
              )}
            </div>
            {w52Pos != null && (
              <div>
                <div className="flex justify-between text-xs text-zinc-600 mb-1.5">
                  <span>저가</span>
                  <span className="text-zinc-500">52주 구간 내 {w52Pos}% 위치</span>
                  <span>고가</span>
                </div>
                <div className="relative h-1.5 bg-zinc-700/80 rounded-full">
                  <div
                    className="absolute top-0 left-0 h-1.5 bg-sky-600/50 rounded-full"
                    style={{ width: `${w52Pos}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-sky-400 rounded-full ring-2 ring-zinc-800"
                    style={{ left: `${w52Pos}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stance */}
      <div className="section-card">
        <p className="label-meta mb-2">투자 관점</p>
        <p className="text-sm text-zinc-300 leading-relaxed">{pick.stance}</p>
      </div>

      {/* Detail: if file exists */}
      {detail ? (
        <>
          {/* Company overview */}
          <div className="section-card">
            <p className="label-meta mb-2">기업 개요</p>
            <p className="text-sm text-zinc-400 leading-relaxed">
              {detail.company_overview}
            </p>
          </div>

          {/* Bull / Bear */}
          <BullBearSection
            bullPoints={detail.bull_points}
            bearPoints={detail.bear_points}
          />

          {/* Catalysts */}
          <div className="section-card">
            <p className="label-meta text-sky-400/70 mb-3">단기 촉매 (2~4주)</p>
            <ul className="space-y-2.5">
              {detail.catalysts_2_to_4_weeks.map((c, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-zinc-300 leading-relaxed">
                  <span className="text-sky-400/60 shrink-0 mt-0.5 font-mono">→</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          {/* Risks */}
          <div className="section-card">
            <p className="label-meta mb-3">주요 리스크</p>
            <ul className="space-y-2.5">
              {detail.risks.map((r, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-zinc-300 leading-relaxed">
                  <span className="text-rose-500/60 shrink-0 mt-0.5 font-mono">!</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {/* Financial summary */}
          <div className="section-card">
            <p className="label-meta mb-3">재무 요약</p>
            {detail.financial_summary.schema_note && (
              <p className="text-xs text-amber-500/70 bg-amber-950/30 border border-amber-800/30 rounded px-3 py-2 mb-4 leading-relaxed">
                {detail.financial_summary.schema_note}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(detail.financial_summary)
                .filter(([k]) => k !== "schema_note")
                .map(([k, v]) => (
                  <div key={k} className="bg-zinc-700/60 border border-zinc-600/40 rounded-md p-2.5">
                    <p className="text-xs text-zinc-500 mb-1">
                      {FINANCIAL_LABELS[k] ?? k}
                    </p>
                    <p className="text-sm font-mono text-zinc-300">{String(v)}</p>
                  </div>
                ))}
            </div>
          </div>

          {/* ETF section */}
          {isETFDetail(detail) && <ETFSection detail={detail} />}

          {/* Data as of */}
          <p className="text-xs text-zinc-500">
            데이터 기준일: {detail.data_as_of}
          </p>

          {/* Linked news signals (supplementary, read-only) */}
          <LinkedSignalsSection
            signalIds={detail.linked_signal_ids ?? []}
            allSignals={allSignals}
            reviewItems={reviewItems}
          />

          {/* News */}
          {detail.related_news?.length > 0 && (
            <div className="section-card">
              <p className="label-meta mb-3">관련 뉴스</p>
              {detail.related_news.map((item, i) => (
                <NewsCard key={i} item={item} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {pick.catalyst_summary && (
            <div className="section-card">
              <p className="label-meta text-sky-400/70 mb-3">주요 촉매 (2~4주)</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{pick.catalyst_summary}</p>
            </div>
          )}

          {pick.risk_summary && (
            <div className="section-card">
              <p className="label-meta mb-3">주요 리스크</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{pick.risk_summary}</p>
            </div>
          )}

          <p className="text-xs text-zinc-500">데이터 기준일: {report.data_as_of}</p>
          <p className="text-xs text-zinc-500">* 상세 분석 리포트는 순차 업데이트 예정입니다.</p>
        </>
      )}

      {/* Back */}
      <Link href="/" className="text-sm text-sky-400 hover:text-sky-300 font-medium transition-colors">
        ← 이번 주 리포트로 돌아가기
      </Link>
    </div>
  );
}

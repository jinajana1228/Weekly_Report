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
        <div className="flex gap-10 text-sm">
          <div>
            <p className="text-xs text-zinc-500 mb-1">기준가</p>
            <p className="text-2xl font-mono font-semibold text-zinc-50">
              {fmtNum(pick.price_zone.reference_price)}
              <span className="text-sm text-zinc-500 ml-1.5">
                {pick.price_zone.currency}
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">관심 구간</p>
            <p className="font-mono text-zinc-300 text-sm">
              {fmtNum(pick.price_zone.watch_low)} –{" "}
              {fmtNum(pick.price_zone.watch_high)}
            </p>
          </div>
        </div>
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
                    <p className="text-xs text-zinc-500 mb-1">{k}</p>
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
        <div className="section-card text-center py-8">
          <p className="text-sm text-zinc-500">상세 정보를 준비 중입니다.</p>
        </div>
      )}

      {/* Back */}
      <Link href="/" className="text-sm text-sky-400 hover:text-sky-300 font-medium transition-colors">
        ← 이번 주 리포트로 돌아가기
      </Link>
    </div>
  );
}

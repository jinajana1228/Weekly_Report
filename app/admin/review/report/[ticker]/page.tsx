import { notFound } from "next/navigation";
import Link from "next/link";
import {
  loadManifest,
  loadDraftReport,
  loadDraftDetail,
  loadNewsSignals,
  loadSignalReview,
} from "@/lib/dataLoader";
import { isETFDetail } from "@/lib/types";
import SectorBadge from "@/components/ui/SectorBadge";
import BullBearSection from "@/components/detail/BullBearSection";
import ETFSection from "@/components/detail/ETFSection";
import LinkedSignalsSection from "@/components/detail/LinkedSignalsSection";
import NewsCard from "@/components/ui/NewsCard";

export default function AdminDraftDetailPage({
  params,
}: {
  params: { ticker: string };
}) {
  const { ticker } = params;
  const manifest = loadManifest();
  if (!manifest) notFound();

  const draft = loadDraftReport(manifest.draft_week_id);
  if (!draft) notFound();

  const pick = draft.picks.find((p) => p.ticker === ticker);
  if (!pick) notFound();

  const detail = loadDraftDetail(pick.asset_type, ticker);
  // Read-only: load signals for this draft week (gracefully empty if no files)
  const allSignals = loadNewsSignals(draft.week_id);
  const signalReview = loadSignalReview(draft.week_id);
  const reviewItems = signalReview?.review_items ?? [];

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      {/* Admin banner */}
      <div className="bg-zinc-800 border border-zinc-700/50 rounded-lg px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-sm font-medium text-zinc-200">Admin — Draft 상세 검토</span>
        </div>
        <Link href="/admin/review" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← 검수 화면
        </Link>
      </div>

      {/* Draft notice */}
      <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg px-4 py-2.5">
        <p className="text-xs text-amber-500/80">
          이 내용은 <span className="font-medium text-amber-400">{draft.week_id}</span> draft 기준
          데이터입니다. 미발행 상태이며 public에 노출되지 않습니다.
        </p>
      </div>

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

      <div className="border-l-2 border-amber-600/50 pl-4">
        <p className="text-base text-zinc-300 leading-relaxed">{pick.one_line_reason}</p>
      </div>

      {/* Price reference */}
      <div className="section-card">
        <p className="label-meta mb-4">가격 참고 구간 (Draft 기준)</p>
        <div className="flex gap-10 text-sm">
          <div>
            <p className="text-xs text-zinc-500 mb-1">기준가</p>
            <p className="text-2xl font-mono font-semibold text-zinc-50">
              {pick.price_zone.reference_price.toLocaleString()}
              <span className="text-sm text-zinc-500 ml-1.5">{pick.price_zone.currency}</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">관심 구간</p>
            <p className="font-mono text-zinc-300 text-sm">
              {pick.price_zone.watch_low.toLocaleString()} – {pick.price_zone.watch_high.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Stance */}
      <div className="section-card">
        <p className="label-meta mb-2">투자 관점</p>
        <p className="text-sm text-zinc-300 leading-relaxed">{pick.stance}</p>
      </div>

      {/* Detail */}
      {detail ? (
        <>
          <div className="section-card">
            <p className="label-meta mb-2">기업 개요</p>
            <p className="text-sm text-zinc-400 leading-relaxed">{detail.company_overview}</p>
          </div>

          <BullBearSection bullPoints={detail.bull_points} bearPoints={detail.bear_points} />

          <div className="section-card">
            <p className="label-meta text-sky-400/70 mb-3">단기 촉매 (2~4주)</p>
            <ul className="space-y-2.5">
              {detail.catalysts_2_to_4_weeks.map((c, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-zinc-300 leading-relaxed">
                  <span className="text-sky-400/60 shrink-0 mt-0.5 font-mono">→</span>{c}
                </li>
              ))}
            </ul>
          </div>

          <div className="section-card">
            <p className="label-meta mb-3">주요 리스크</p>
            <ul className="space-y-2.5">
              {detail.risks.map((r, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-zinc-300 leading-relaxed">
                  <span className="text-rose-500/60 shrink-0 mt-0.5 font-mono">!</span>{r}
                </li>
              ))}
            </ul>
          </div>

          {isETFDetail(detail) && <ETFSection detail={detail} />}

          {/* Linked news signals — admin view with review notes (read-only) */}
          <LinkedSignalsSection
            signalIds={detail.linked_signal_ids ?? []}
            allSignals={allSignals}
            reviewItems={reviewItems}
            showAdminInfo={true}
          />

          <p className="text-xs text-zinc-500">데이터 기준일: {detail.data_as_of}</p>

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
          <p className="text-sm text-zinc-500">
            해당 종목의 draft 상세 파일이 없습니다.
          </p>
        </div>
      )}
    </div>
  );
}

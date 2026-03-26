import { notFound } from "next/navigation";
import Link from "next/link";
import {
  loadManifest,
  loadArchiveReport,
  loadArchiveDetail,
} from "@/lib/dataLoader";
import { isETFDetail } from "@/lib/types";
import { fmtNum } from "@/lib/fmt";
import SectorBadge from "@/components/ui/SectorBadge";
import BullBearSection from "@/components/detail/BullBearSection";
import ETFSection from "@/components/detail/ETFSection";
import NewsCard from "@/components/ui/NewsCard";

export function generateStaticParams() {
  const manifest = loadManifest();
  const weekIds = manifest?.archive_week_ids ?? [];
  return weekIds.flatMap((week_id) => {
    const report = loadArchiveReport(week_id);
    return (report?.picks ?? []).map((p) => ({ week_id, ticker: p.ticker }));
  });
}

export default function ArchiveDetailReportPage({
  params,
}: {
  params: { week_id: string; ticker: string };
}) {
  const { week_id, ticker } = params;

  const manifest = loadManifest();
  if (!manifest || !manifest.archive_week_ids.includes(week_id)) notFound();

  const report = loadArchiveReport(week_id);
  if (!report) notFound();

  const pick = report.picks.find((p) => p.ticker === ticker);
  if (!pick) notFound();

  const detail = loadArchiveDetail(week_id, pick.asset_type, ticker);

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      {/* Breadcrumb */}
      <nav className="text-xs text-zinc-500">
        <Link href="/archive" className="hover:text-zinc-400 transition-colors">아카이브</Link>
        <span className="mx-2 text-zinc-600">·</span>
        <Link href={`/archive/${week_id}`} className="hover:text-zinc-400 transition-colors">
          {week_id}
        </Link>
        <span className="mx-2 text-zinc-600">·</span>
        <span className="text-zinc-400">{pick.name}</span>
      </nav>

      {/* Archive notice */}
      <div className="bg-zinc-800/70 border border-zinc-700 rounded-lg px-4 py-2.5">
        <p className="text-xs text-zinc-500">
          이 내용은 <span className="font-medium text-zinc-400">{week_id}</span> 에디션
          기준 데이터입니다. 현재 시점과 다를 수 있습니다.
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

      <div className="border-l-2 border-zinc-700 pl-4">
        <p className="text-base text-zinc-400 leading-relaxed">{pick.one_line_reason}</p>
      </div>

      {/* Price reference */}
      <div className="section-card">
        <p className="label-meta mb-4">가격 참고 구간 ({week_id} 기준)</p>
        <div className="flex gap-10 text-sm">
          <div>
            <p className="text-xs text-zinc-500 mb-1">기준가</p>
            <p className="text-2xl font-mono font-semibold text-zinc-50">
              {fmtNum(pick.price_zone.reference_price)}
              <span className="text-sm text-zinc-500 ml-1.5">{pick.price_zone.currency}</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">관심 구간</p>
            <p className="font-mono text-zinc-300 text-sm">
              {fmtNum(pick.price_zone.watch_low)} – {fmtNum(pick.price_zone.watch_high)}
            </p>
          </div>
        </div>
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
          <p className="text-sm text-zinc-500">해당 에디션의 상세 정보를 준비 중입니다.</p>
        </div>
      )}

      <Link href={`/archive/${week_id}`} className="text-sm text-sky-400 hover:text-sky-300 font-medium transition-colors">
        ← {week_id} 리포트로 돌아가기
      </Link>
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { loadManifest, loadArchiveReport } from "@/lib/dataLoader";
import PickCard from "@/components/home/PickCard";
import MarketSummary from "@/components/home/MarketSummary";
import SectorBadge, { SECTOR_LABELS } from "@/components/ui/SectorBadge";
import NewsCard from "@/components/ui/NewsCard";

export function generateStaticParams() {
  const manifest = loadManifest();
  return (manifest?.archive_week_ids ?? []).map((weekId) => ({ week_id: weekId }));
}

export default function ArchiveDetailPage({
  params,
}: {
  params: { week_id: string };
}) {
  const { week_id } = params;
  const manifest = loadManifest();
  if (!manifest || !manifest.archive_week_ids.includes(week_id)) notFound();

  const report = loadArchiveReport(week_id);
  if (!report) notFound();

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-12">
      {/* Breadcrumb */}
      <nav className="text-xs text-zinc-500">
        <Link href="/archive" className="hover:text-zinc-400 transition-colors">아카이브</Link>
        <span className="mx-2 text-zinc-600">·</span>
        <span className="text-zinc-400">{week_id}</span>
      </nav>

      {/* Archive notice */}
      {report.disclaimer?.includes("예시 데이터") ? (
        <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg px-4 py-2.5">
          <p className="text-xs text-amber-500/80">
            예시 에디션 — 실제 운영 데이터가 아닙니다. 서비스 초기 샘플 데이터로 작성된 에디션입니다.
          </p>
        </div>
      ) : (
        <div className="bg-zinc-800/70 border border-zinc-700 rounded-lg px-4 py-2.5">
          <p className="text-xs text-zinc-500">
            과거 에디션 — {week_id} 기준 데이터입니다. 불변 아카이브입니다.
          </p>
        </div>
      )}

      {/* Meta */}
      <section>
        <div className="flex items-end justify-between mb-1">
          <div>
            <p className="label-meta mb-1">
              {report.week_id} ·{" "}
              {report.published_at
                ? new Date(report.published_at).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "—"}
            </p>
            <h1 className="text-2xl font-bold text-zinc-50">
              과거 리포트 — {week_id}
            </h1>
            {report.archived_at && (
              <p className="text-xs text-zinc-500 mt-1">
                아카이브:{" "}
                {new Date(report.archived_at).toLocaleDateString("ko-KR")} (불변)
              </p>
            )}
          </div>
          <p className="text-xs text-zinc-500">데이터 기준: {report.data_as_of}</p>
        </div>
        <div className="border-b border-zinc-700 mt-4" />
      </section>

      {/* Market summary */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">시장 요약</h2>
        <MarketSummary market={report.market_summary} />
      </section>

      {/* Favored / Cautious sectors */}
      {((report.favored_sectors?.length ?? 0) > 0 ||
        (report.cautious_sectors?.length ?? 0) > 0) && (
        <section className="section-card">
          <p className="label-meta mb-3">당시 섹터 흐름</p>
          <div className="flex flex-wrap gap-6">
            {report.favored_sectors && report.favored_sectors.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 mb-1.5">선호</p>
                <div className="flex flex-wrap gap-1.5">
                  {report.favored_sectors.map((s) => (
                    <SectorBadge key={s} sector={s} />
                  ))}
                </div>
              </div>
            )}
            {report.cautious_sectors && report.cautious_sectors.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 mb-1.5">주의</p>
                <div className="flex flex-wrap gap-1.5">
                  {report.cautious_sectors.map((s) => (
                    <span
                      key={s}
                      className="text-xs font-medium text-amber-400/80 bg-amber-950/20 border border-amber-800/30 rounded px-2 py-0.5"
                    >
                      {SECTOR_LABELS[s] ?? s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Picks */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">메인 추천</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {report.picks.map((pick) => (
            <PickCard
              key={pick.ticker}
              pick={pick}
              basePath={`/archive/${week_id}/report`}
            />
          ))}
        </div>
      </section>

      {/* News */}
      {report.related_news?.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">관련 뉴스</h2>
          <div className="section-card">
            {report.related_news.map((item, i) => (
              <NewsCard key={i} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Disclaimer */}
      {report.disclaimer && (
        <section>
          <p className="text-xs text-zinc-500 leading-relaxed bg-zinc-800/60 rounded-lg p-4 border border-zinc-700">
            {report.disclaimer}
          </p>
        </section>
      )}

      <Link href="/archive" className="text-sm text-sky-400 hover:text-sky-300 font-medium transition-colors">
        ← 아카이브 목록
      </Link>
    </div>
  );
}

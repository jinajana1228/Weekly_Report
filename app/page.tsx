import { loadCurrentReport } from "@/lib/dataLoader";
import PickCard from "@/components/home/PickCard";
import MarketSummary from "@/components/home/MarketSummary";
import NewsCard from "@/components/ui/NewsCard";
import SectorBadge from "@/components/ui/SectorBadge";
import Link from "next/link";

export default function HomePage() {
  const report = loadCurrentReport();

  if (!report) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-20 text-center">
        <p className="text-zinc-500">리포트를 불러올 수 없습니다. 서비스 점검 중입니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-12">
      {/* Report meta */}
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
                : "발행일 미정"}
            </p>
            <h1 className="text-2xl font-bold text-zinc-50 tracking-tight">
              이번 주 추천 종목
            </h1>
          </div>
          <p className="text-xs text-zinc-500">
            데이터 기준일: {report.data_as_of}
          </p>
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
          <p className="label-meta mb-3">이번 주 섹터 흐름</p>
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
                      {s}
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
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
          메인 추천 {report.picks.length}종목
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {report.picks.map((pick) => (
            <PickCard key={pick.ticker} pick={pick} basePath="/report" />
          ))}
        </div>
      </section>

      {/* Related news */}
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

      {/* Archive link */}
      <section className="flex items-center justify-between pt-4 border-t border-zinc-700">
        <Link
          href="/archive"
          className="text-sm text-sky-400 hover:text-sky-300 font-medium transition-colors"
        >
          과거 리포트 아카이브 보기 →
        </Link>
      </section>

      {/* Disclaimer */}
      <section>
        <p className="text-xs text-zinc-500 leading-relaxed bg-zinc-800/60 rounded-lg p-4 border border-zinc-700">
          {report.disclaimer}
        </p>
      </section>
    </div>
  );
}

import { loadManifest, loadArchiveReport } from "@/lib/dataLoader";
import Link from "next/link";
import SectorBadge from "@/components/ui/SectorBadge";

export default function ArchiveListPage() {
  const manifest = loadManifest();
  if (!manifest) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-20 text-center">
        <p className="text-zinc-500">아카이브 목록을 불러올 수 없습니다.</p>
      </div>
    );
  }

  const { archive_week_ids } = manifest;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <section>
        <p className="label-meta mb-1">과거 리포트</p>
        <h1 className="text-2xl font-bold text-zinc-50">아카이브</h1>
        <div className="border-b border-zinc-800 mt-4" />
      </section>

      {/* List */}
      {archive_week_ids.length === 0 ? (
        <p className="text-sm text-zinc-500">아직 archived된 에디션이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {archive_week_ids.map((weekId) => {
            const report = loadArchiveReport(weekId);
            return (
              <Link
                key={weekId}
                href={`/archive/${weekId}`}
                className="section-card block hover:border-zinc-600/60 transition-colors"
              >
                {report ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-semibold text-zinc-100">{weekId}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          발행:{" "}
                          {report.published_at
                            ? new Date(report.published_at).toLocaleDateString("ko-KR")
                            : "—"}
                          {report.archived_at && (
                            <span className="ml-2 text-zinc-500">
                              아카이브:{" "}
                              {new Date(report.archived_at).toLocaleDateString("ko-KR")}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-xs text-sky-400 font-medium">
                        보기 →
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {report.picks.map((p) => (
                        <div
                          key={p.ticker}
                          className="flex items-center gap-1.5 text-xs bg-zinc-700/60 border border-zinc-600/50 rounded px-2 py-1"
                        >
                          <SectorBadge sector={p.sector} />
                          <span className="text-zinc-400 font-medium">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-300">{weekId}</span>
                    <span className="text-xs text-zinc-500">데이터 준비 중</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <Link href="/" className="text-sm text-sky-400 hover:text-sky-300 font-medium transition-colors">
        ← 이번 주 리포트
      </Link>
    </div>
  );
}

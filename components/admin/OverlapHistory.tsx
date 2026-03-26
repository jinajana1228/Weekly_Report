import type { OverlapHistory } from "@/lib/types";

export default function OverlapHistoryPanel({ data }: { data: OverlapHistory }) {
  return (
    <div className="section-card">
      <p className="label-meta mb-3">최근 추천 이력 (중복 참고)</p>
      <div className="space-y-3">
        {data.recent_editions.map((ed) => (
          <div key={ed.week_id} className="text-sm py-3 border-b border-zinc-700 last:border-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono font-medium text-zinc-300">{ed.week_id}</span>
              <span className="text-xs text-zinc-500">
                {new Date(ed.published_at).toLocaleDateString("ko-KR")}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ed.main_picks.map((ticker) => (
                <span
                  key={ticker}
                  className="font-mono text-xs bg-zinc-700/80 border border-zinc-600/60 text-zinc-300 rounded px-2 py-0.5"
                >
                  {ticker}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

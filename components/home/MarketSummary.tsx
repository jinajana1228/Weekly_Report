import type { MainReport } from "@/lib/types";
import SectorBadge from "@/components/ui/SectorBadge";
import { fmtNum, fmtChangePct } from "@/lib/fmt";

export default function MarketSummary({
  market,
}: {
  market: MainReport["market_summary"];
}) {
  const { global, domestic } = market;
  return (
    <div className="space-y-4">
      {/* Global */}
      <div className="section-card">
        <p className="label-meta mb-3">글로벌 시장</p>
        <p className="text-sm text-zinc-300 leading-relaxed mb-4">
          {global.headline}
        </p>
        <div className="flex flex-wrap gap-2">
          {global.key_index_changes.map((idx) => (
            <div
              key={idx.index}
              className="flex items-center gap-2 text-xs bg-zinc-700/60 border border-zinc-600/50 rounded px-3 py-1.5"
            >
              <span className="text-zinc-500">{idx.index}</span>
              <span
                className={`font-mono font-medium ${
                  idx.change_pct >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {idx.change_pct >= 0 ? "+" : ""}
                {idx.change_pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Domestic */}
      <div className="section-card">
        <p className="label-meta mb-3">국내 시장</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: "KOSPI", data: domestic.kospi },
            { label: "KOSDAQ", data: domestic.kosdaq },
          ].map(({ label, data }) => (
            <div key={label} className="bg-zinc-700/60 border border-zinc-600/40 rounded-lg p-3">
              <p className="text-xs text-zinc-500 mb-1">{label}</p>
              <p className="text-lg font-mono font-semibold text-zinc-100">
                {fmtNum(data.level)}
              </p>
              <p
                className={`text-xs font-mono font-medium ${
                  data.change_pct == null
                    ? "text-zinc-500"
                    : data.change_pct >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                {fmtChangePct(data.change_pct)}
              </p>
              <p className="text-xs text-zinc-500 mt-1 leading-snug">
                {data.brief}
              </p>
            </div>
          ))}
        </div>

        {/* Week theme */}
        <div className="bg-zinc-700/50 border border-zinc-600/40 rounded-lg p-4 mb-4">
          <p className="label-meta mb-1.5">주간 테마</p>
          <p className="text-sm text-zinc-300 leading-relaxed">
            {domestic.week_theme}
          </p>
        </div>

        {/* Sector highlights */}
        <p className="label-meta mb-3">섹터 동향</p>
        <div className="space-y-2.5">
          {domestic.sector_highlights.map((sh) => (
            <div key={sh.sector} className="flex items-start gap-3">
              <SectorBadge sector={sh.sector} />
              <span
                className={`text-xs shrink-0 font-mono font-medium mt-0.5 ${
                  sh.direction === "up"
                    ? "text-emerald-400"
                    : sh.direction === "down"
                    ? "text-rose-400"
                    : "text-zinc-500"
                }`}
              >
                {sh.direction === "up" ? "▲" : sh.direction === "down" ? "▼" : "—"}
              </span>
              <p className="text-xs text-zinc-500 leading-snug">{sh.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

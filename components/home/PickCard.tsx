import Link from "next/link";
import type { Pick } from "@/lib/types";
import SectorBadge from "@/components/ui/SectorBadge";
import { fmtNum } from "@/lib/fmt";

interface Props {
  pick: Pick;
  basePath?: string; // "/report" or "/archive/2026-W12/report"
}

export default function PickCard({ pick, basePath = "/report" }: Props) {
  const isETF = pick.asset_type === "etf";
  return (
    <div className="section-card hover:border-zinc-600/60 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-zinc-500">#{pick.rank}</span>
            <SectorBadge sector={pick.sector} />
            {isETF && (
              <span className="text-xs font-medium text-sky-400 bg-sky-950/50 border border-sky-700/40 rounded px-2 py-0.5">
                ETF
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-zinc-50 leading-tight">
            {pick.name}
          </h3>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">
            {pick.ticker} · {pick.market}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-mono font-medium text-zinc-200">
            {fmtNum(pick.price_zone.reference_price)}
          </p>
          <p className="text-xs text-zinc-500">{pick.price_zone.currency}</p>
        </div>
      </div>

      {/* One-line reason */}
      <div className="accent-line mb-4">
        <p className="text-sm text-zinc-300 leading-relaxed">
          {pick.one_line_reason}
        </p>
      </div>

      {/* Stance */}
      <p className="text-xs text-zinc-500 leading-relaxed mb-3">{pick.stance}</p>

      {/* Watch range */}
      <div className="flex gap-4 mb-3 text-xs">
        <span className="text-zinc-500">
          관심 구간:{" "}
          <span className="font-mono text-zinc-300">
            {fmtNum(pick.price_zone.watch_low)} –{" "}
            {fmtNum(pick.price_zone.watch_high)}
          </span>
        </span>
      </div>

      {/* Alternatives */}
      {(pick.same_sector_alternatives ?? []).length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-700">
          <p className="label-meta mb-2">동일 섹터 대안</p>
          <div className="space-y-2 bg-zinc-700/50 rounded-md p-3">
            {(pick.same_sector_alternatives ?? []).map((alt) => (
              <div key={alt.ticker} className="flex items-start gap-2 text-xs">
                <span className="font-mono text-zinc-500 shrink-0 mt-0.5">
                  {alt.ticker}
                </span>
                <div>
                  <span className="font-medium text-zinc-400">{alt.name}</span>
                  <span className="text-zinc-500 ml-1">— {alt.one_line_reason}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail link */}
      <div className="mt-4 pt-3 border-t border-zinc-700">
        <Link
          href={`${basePath}/${pick.ticker}`}
          className="text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors"
        >
          상세 리포트 보기 →
        </Link>
      </div>
    </div>
  );
}

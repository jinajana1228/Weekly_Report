import type { ETFDetail } from "@/lib/types";

export default function ETFSection({ detail }: { detail: ETFDetail }) {
  return (
    <div className="space-y-4">
      {/* Overview */}
      <div className="section-card">
        <p className="label-meta mb-3">ETF 개요</p>
        <p className="text-sm text-zinc-300 leading-relaxed">{detail.etf_overview}</p>
        <div className="divider" />
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="label-meta mb-1">벤치마크</p>
            <p className="text-zinc-200">{detail.benchmark}</p>
          </div>
          <div>
            <p className="label-meta mb-1">운용사</p>
            <p className="text-zinc-200">{detail.manager}</p>
          </div>
          <div>
            <p className="label-meta mb-1">레버리지/인버스</p>
            <p className={detail.leverage_inverse_flag ? "text-rose-400" : "text-zinc-400"}>
              {detail.leverage_inverse_flag ? "해당" : "해당 없음"}
            </p>
          </div>
          <div>
            <p className="label-meta mb-1">비용</p>
            <p className="text-zinc-400 text-xs leading-relaxed">{detail.fee_summary}</p>
          </div>
        </div>
      </div>

      {/* Top holdings */}
      {detail.top_holdings?.length > 0 && (
        <div className="section-card">
          <p className="label-meta mb-3">주요 구성 종목</p>
          <div className="space-y-0">
            {detail.top_holdings.map((h, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-zinc-700 last:border-0"
              >
                <span className="text-sm text-zinc-300">{h.name}</span>
                <div className="flex items-center gap-3">
                  <div
                    className="h-1 bg-sky-600/40 rounded-full"
                    style={{ width: `${Math.max(h.weight_pct * 6, 8)}px` }}
                  />
                  <span className="font-mono text-sm text-zinc-400 w-10 text-right">
                    {h.weight_pct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Geo & Sector exposure */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="section-card">
          <p className="label-meta mb-3">지역 배분</p>
          {Object.entries(detail.geographic_exposure).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-1.5 border-b border-zinc-700 last:border-0">
              <span className="text-sm text-zinc-400">{k}</span>
              <span className="font-mono text-sm text-zinc-200">{v}%</span>
            </div>
          ))}
        </div>
        <div className="section-card">
          <p className="label-meta mb-3">섹터 배분</p>
          {detail.sector_exposure.schema_note && (
            <p className="text-xs text-amber-500/70 bg-amber-950/30 border border-amber-800/30 rounded px-2.5 py-1.5 mb-3 leading-relaxed">
              {detail.sector_exposure.schema_note}
            </p>
          )}
          <div className="space-y-0">
            {Object.entries(detail.sector_exposure)
              .filter(([k]) => k !== "schema_note")
              .map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b border-zinc-700/60 last:border-0">
                  <span className="text-xs text-zinc-500">{k}</span>
                  <span className="font-mono text-xs text-zinc-400">{v}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Hedge policy */}
      <div className="section-card">
        <p className="label-meta mb-2">환헤지 정책</p>
        <p className="text-sm text-zinc-300 leading-relaxed">{detail.hedge_policy}</p>
      </div>

      {/* ETF specific risks */}
      {detail.etf_specific_risks?.length > 0 && (
        <div className="section-card border-t-2 border-t-rose-700/40">
          <p className="label-meta text-rose-500/80 mb-3">ETF 전용 리스크</p>
          <ul className="space-y-2.5">
            {detail.etf_specific_risks.map((r, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-zinc-300 leading-relaxed">
                <span className="text-rose-500/60 shrink-0 mt-0.5 font-mono">!</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

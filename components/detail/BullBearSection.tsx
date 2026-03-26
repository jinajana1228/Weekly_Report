export default function BullBearSection({
  bullPoints,
  bearPoints,
}: {
  bullPoints: string[];
  bearPoints: string[];
}) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="section-card border-t-2 border-t-emerald-700/50">
        <p className="label-meta text-emerald-500/80 mb-3">강세 근거</p>
        <ul className="space-y-2.5">
          {bullPoints.map((pt, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-zinc-300 leading-relaxed">
              <span className="text-emerald-500/70 shrink-0 mt-0.5 font-mono">+</span>
              {pt}
            </li>
          ))}
        </ul>
      </div>
      <div className="section-card border-t-2 border-t-rose-700/50">
        <p className="label-meta text-rose-500/80 mb-3">약세 근거</p>
        <ul className="space-y-2.5">
          {bearPoints.map((pt, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-zinc-300 leading-relaxed">
              <span className="text-rose-500/70 shrink-0 mt-0.5 font-mono">−</span>
              {pt}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

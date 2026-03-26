import type { Sentiment } from "@/lib/types";

const map: Record<Sentiment, { label: string; cls: string }> = {
  positive: { label: "긍정", cls: "text-emerald-400 bg-emerald-950/60 border border-emerald-800/50" },
  negative: { label: "부정", cls: "text-rose-400 bg-rose-950/60 border border-rose-800/50" },
  neutral: { label: "중립", cls: "text-zinc-500 bg-zinc-800 border border-zinc-700/50" },
};

export default function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const { label, cls } = map[sentiment];
  return (
    <span className={`inline-block text-xs font-medium rounded px-2 py-0.5 ${cls}`}>
      {label}
    </span>
  );
}

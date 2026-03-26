// read-only: displays linked news signal summaries — no write actions
import type { NewsSignal, SignalReviewItem, SignalReviewStatus } from "@/lib/types";

interface Props {
  signalIds: string[];
  allSignals: NewsSignal[];
  reviewItems: SignalReviewItem[];
  showAdminInfo?: boolean;
}

function DirectionBadge({ direction }: { direction: string }) {
  if (direction === "bullish")
    return (
      <span className="text-xs font-medium text-emerald-400 bg-emerald-900/30 border border-emerald-700/30 rounded px-1.5 py-0.5">
        강세 신호
      </span>
    );
  if (direction === "bearish")
    return (
      <span className="text-xs font-medium text-rose-400 bg-rose-900/30 border border-rose-700/30 rounded px-1.5 py-0.5">
        약세 신호
      </span>
    );
  return (
    <span className="text-xs font-medium text-zinc-400 bg-zinc-700/50 border border-zinc-600/40 rounded px-1.5 py-0.5">
      중립
    </span>
  );
}

function ReviewStatusBadge({ status }: { status: SignalReviewStatus }) {
  if (status === "APPROVED")
    return <span className="text-xs text-emerald-400/80 font-medium">✓ 승인</span>;
  if (status === "DISCARDED")
    return <span className="text-xs text-zinc-500 line-through">제외</span>;
  return <span className="text-xs text-amber-400/70">⏳ 검토중</span>;
}

export default function LinkedSignalsSection({
  signalIds,
  allSignals,
  reviewItems,
  showAdminInfo = false,
}: Props) {
  if (!signalIds || signalIds.length === 0) return null;

  const matched = signalIds
    .map((id) => ({
      signal: allSignals.find((s) => s.signal_id === id) ?? null,
      review: reviewItems.find((r) => r.signal_id === id) ?? null,
    }))
    .filter((m) => m.signal !== null);

  if (matched.length === 0) return null;

  return (
    <div className="section-card">
      <div className="flex items-center justify-between mb-3">
        <p className="label-meta">
          연결된 뉴스 신호{" "}
          <span className="font-normal text-zinc-600">
            ({matched.length}건 · 보완 신호)
          </span>
        </p>
        <span className="text-xs text-zinc-600 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5">
          read-only
        </span>
      </div>

      <div className="space-y-2.5">
        {matched.map(({ signal, review }) => {
          if (!signal) return null;
          return (
            <div
              key={signal.signal_id}
              className="border border-zinc-700/50 rounded-lg px-3 py-2.5 bg-zinc-800/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <DirectionBadge direction={signal.direction} />
                    <span className="text-xs text-zinc-500 font-mono">{signal.scope}</span>
                    {signal.admin_review_needed && (
                      <span className="text-xs text-amber-500/70 bg-amber-950/30 border border-amber-800/30 rounded px-1.5 py-0.5">
                        검토 필요
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2">
                    {signal.title}
                  </p>
                  {showAdminInfo && review?.review_note && (
                    <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed border-t border-zinc-700/50 pt-1.5">
                      검수 메모: {review.review_note}
                    </p>
                  )}
                </div>
                {review && (
                  <div className="shrink-0 pt-0.5">
                    <ReviewStatusBadge status={review.review_status} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-zinc-600 mt-3">
        ※ 뉴스 신호는 수치 기반 픽의 보완 자료입니다. 이 화면은 read-only입니다.
      </p>
    </div>
  );
}

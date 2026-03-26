// read-only: displays signal review status — no write actions
import type { SignalReview } from "@/lib/types";

interface Props {
  review: SignalReview;
  newsSignalReviewStatus?: string;
}

export default function SignalReviewSummary({ review, newsSignalReviewStatus }: Props) {
  const approved = review.review_items.filter((i) => i.review_status === "APPROVED").length;
  const discarded = review.review_items.filter((i) => i.review_status === "DISCARDED").length;
  const pending = review.review_items.filter((i) => i.review_status === "PENDING").length;

  return (
    <section className="section-card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="label-meta">뉴스 신호 검수 현황</p>
        <div className="flex items-center gap-2 flex-wrap">
          {newsSignalReviewStatus && (
            <span className="text-xs font-mono text-amber-400/80 bg-amber-950/30 border border-amber-800/30 rounded px-2 py-0.5">
              {newsSignalReviewStatus}
            </span>
          )}
          <span
            className={`text-xs font-medium rounded px-2 py-0.5 ${
              review.review_completed
                ? "bg-emerald-900/40 text-emerald-400 border border-emerald-700/40"
                : "bg-zinc-700/50 text-zinc-400 border border-zinc-600/40"
            }`}
          >
            {review.review_completed ? "검수 완료" : "검수 진행 중"}
          </span>
          <span className="text-xs text-zinc-600 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5">
            read-only
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center mb-4">
        <div className="bg-zinc-700/50 border border-zinc-600/40 rounded-md px-2 py-2.5">
          <p className="text-xs text-zinc-500 mb-1">전체</p>
          <p className="text-xl font-mono font-semibold text-zinc-200">{review.total_signal_count}</p>
        </div>
        <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-md px-2 py-2.5">
          <p className="text-xs text-emerald-600 mb-1">승인</p>
          <p className="text-xl font-mono font-semibold text-emerald-400">{approved}</p>
        </div>
        <div className="bg-zinc-700/30 border border-zinc-700/40 rounded-md px-2 py-2.5">
          <p className="text-xs text-zinc-500 mb-1">제외</p>
          <p className="text-xl font-mono font-semibold text-zinc-500">{discarded}</p>
        </div>
        <div className="bg-amber-900/20 border border-amber-800/30 rounded-md px-2 py-2.5">
          <p className="text-xs text-amber-600 mb-1">검토중</p>
          <p className="text-xl font-mono font-semibold text-amber-400">{pending}</p>
        </div>
      </div>

      {pending > 0 && (
        <p className="text-xs text-amber-500/70 bg-amber-950/20 border border-amber-900/30 rounded px-3 py-2 mb-3">
          PENDING {pending}건 잔존 — 수치 기반 발행은 여전히 가능합니다 (Fallback 허용).
        </p>
      )}

      <p className="text-xs text-zinc-600">
        ※ 뉴스 신호는 보완 신호입니다. 신호 부족·미완료 상태에서도 수치 기반 발행이 가능합니다.
        이 화면은 read-only — 검수 결과 수정 불가.
      </p>
    </section>
  );
}

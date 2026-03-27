import {
  loadManifest,
  loadDraftReport,
  loadApproval,
  loadOverlapHistory,
  loadCurrentReport,
  loadSignalReview,
} from "@/lib/dataLoader";
import Link from "next/link";
import SectorBadge from "@/components/ui/SectorBadge";
import ApprovalBadge from "@/components/ui/ApprovalBadge";
import OverlapHistoryPanel from "@/components/admin/OverlapHistory";
import SignalReviewSummary from "@/components/admin/SignalReviewSummary";
import SignOutButton from "@/components/admin/SignOutButton";

export default function AdminReviewPage() {
  const manifest = loadManifest();
  const approval = loadApproval();
  const overlapHistory = loadOverlapHistory();
  const current = loadCurrentReport();
  const draft = manifest ? loadDraftReport(manifest.draft_week_id) : null;
  // Read-only: load signal review for the draft week (gracefully null if no signal files)
  const signalReview = manifest ? loadSignalReview(manifest.draft_week_id) : null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      {/* Admin banner */}
      <div className="bg-zinc-800 border border-zinc-700/50 rounded-lg px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-sm font-medium text-zinc-200">Admin — 검수 화면</span>
        </div>
        <SignOutButton />
      </div>

      {/* Header */}
      <section>
        <p className="label-meta mb-1">Draft 검수</p>
        <h1 className="text-2xl font-bold text-zinc-50">
          {manifest?.draft_week_id ?? "—"} 검수
        </h1>
        <div className="border-b border-zinc-700 mt-4" />
      </section>

      {/* Approval status */}
      <section className="section-card">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <p className="label-meta mb-3">검수 상태</p>
            {approval ? (
              <>
                <ApprovalBadge decision={approval.decision} />
                {approval.reviewed_at && (
                  <p className="text-xs text-zinc-500 mt-2">
                    검수일: {new Date(approval.reviewed_at).toLocaleString("ko-KR")}
                  </p>
                )}
                {approval.reviewed_by && (
                  <p className="text-xs text-zinc-500">
                    검수자: {approval.reviewed_by}
                  </p>
                )}
                {approval.notes && (
                  <div className="mt-3 bg-zinc-700/50 border border-zinc-600/50 rounded-md px-3 py-2">
                    <p className="text-xs text-zinc-400 leading-relaxed">{approval.notes}</p>
                  </div>
                )}
                {/* Published context: approval exists but no draft = already live */}
                {!draft && current && (
                  <p className="text-xs text-zinc-400 mt-3 bg-zinc-700/30 border border-zinc-600/30 rounded px-3 py-1.5">
                    {current.week_id} 에디션 발행 완료 — 현재 운영 중입니다. 다음 draft 검수 대기 상태입니다.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-500">approval.json을 불러올 수 없습니다.</p>
            )}
          </div>

          {/* Action buttons (read-only UI — no write action) */}
          <div className="flex flex-col gap-2 items-end shrink-0">
            <p className="label-meta mb-1">액션</p>
            <button
              disabled
              className="text-xs font-medium px-4 py-2 rounded bg-zinc-600 text-zinc-300 cursor-not-allowed border border-zinc-500/60"
              title="쓰기 동작 미구현"
            >
              승인
            </button>
            <button
              disabled
              className="text-xs font-medium px-4 py-2 rounded border border-zinc-600/60 text-zinc-400 cursor-not-allowed"
              title="쓰기 동작 미구현"
            >
              반려
            </button>
            <button
              disabled
              className="text-xs font-medium px-4 py-2 rounded border border-zinc-600/60 text-zinc-400 cursor-not-allowed"
              title="쓰기 동작 미구현"
            >
              보류
            </button>
          </div>
        </div>

        {/* Notes input (placeholder, no write) */}
        <div className="mt-5 pt-4 border-t border-zinc-700">
          <p className="label-meta mb-2">검수 메모</p>
          <textarea
            disabled
            placeholder="검수 메모 입력 (쓰기 동작 미구현)"
            className="w-full text-sm border border-zinc-600/60 rounded-lg p-3 text-zinc-400 bg-zinc-700/40 resize-none cursor-not-allowed placeholder:text-zinc-600"
            rows={3}
          />
        </div>
      </section>

      {/* Current report reference */}
      {current && (
        <section className="section-card">
          <p className="label-meta mb-3">현재 발행 중 (Current)</p>
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono font-semibold text-zinc-200">{current.week_id}</span>
            <span className="text-xs text-zinc-500">
              발행:{" "}
              {current.published_at
                ? new Date(current.published_at).toLocaleDateString("ko-KR")
                : "—"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {current.picks.map((p) => (
              <span
                key={p.ticker}
                className="font-mono text-xs bg-zinc-700/80 border border-zinc-600/60 text-zinc-300 rounded px-2 py-0.5"
              >
                {p.ticker}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Signal review summary (read-only) */}
      {signalReview ? (
        <SignalReviewSummary
          review={signalReview}
          newsSignalReviewStatus={approval?.news_signal_review_status}
        />
      ) : (
        <section className="section-card">
          <p className="label-meta mb-2">뉴스 신호 검수 현황</p>
          <p className="text-sm text-zinc-500">
            신호 파일 없음 — 수치 기반 발행이 가능합니다 (Fallback).
          </p>
        </section>
      )}

      {/* Overlap history */}
      {overlapHistory && <OverlapHistoryPanel data={overlapHistory} />}

      {/* Draft picks */}
      {draft ? (
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
            Draft 추천 {draft.picks.length}종목 — {draft.week_id}
          </h2>
          <div className="space-y-2">
            {draft.picks.map((pick) => (
              <Link
                key={pick.ticker}
                href={`/admin/review/report/${pick.ticker}`}
                className="section-card flex items-start justify-between hover:border-zinc-600/60 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-mono text-zinc-500">#{pick.rank}</span>
                    <SectorBadge sector={pick.sector} />
                  </div>
                  <p className="font-semibold text-zinc-100">{pick.name}</p>
                  <p className="text-xs font-mono text-zinc-500 mt-0.5">{pick.ticker}</p>
                  <p className="text-xs text-zinc-500 mt-2 leading-relaxed line-clamp-2">
                    {pick.one_line_reason}
                  </p>
                </div>
                <span className="text-xs text-sky-400 font-medium shrink-0 ml-4">
                  상세 검토 →
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <div className="section-card text-center py-8">
          <p className="text-sm text-zinc-500">
            현재 검수 대기 중인 draft가 없습니다.
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

interface ApproveActionProps {
  weekId: string | null;
  hasDraft: boolean;
  currentDecision: string | null;
}

export default function ApproveAction({
  weekId,
  hasDraft,
  currentDecision,
}: ApproveActionProps) {
  const [status, setStatus] = useState<
    "idle" | "confirm" | "loading" | "success" | "error"
  >("idle");
  const [reviewedBy, setReviewedBy] = useState("");
  const [message, setMessage] = useState("");

  const canApprove = hasDraft && weekId && currentDecision === "pending";

  async function handleApprove() {
    if (!weekId || !reviewedBy.trim()) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/admin/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week_id: weekId,
          reviewed_by: reviewedBy.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "승인 요청 실패");
        return;
      }

      setStatus("success");
      setMessage(data.message);
    } catch {
      setStatus("error");
      setMessage("네트워크 오류가 발생했습니다.");
    }
  }

  // 승인 불가 상태
  if (!canApprove) {
    let reason = "승인 불가";
    if (!hasDraft) reason = "검수 대기 중인 draft가 없습니다";
    else if (!weekId) reason = "week_id를 확인할 수 없습니다";
    else if (currentDecision !== "pending") reason = `현재 상태: ${currentDecision}`;

    return (
      <div className="flex flex-col gap-2 items-end shrink-0">
        <p className="label-meta mb-1">액션</p>
        <button
          disabled
          className="text-xs font-medium px-4 py-2 rounded bg-zinc-600 text-zinc-300 cursor-not-allowed border border-zinc-500/60"
          title={reason}
        >
          승인
        </button>
        <p className="text-xs text-zinc-600 max-w-[160px] text-right">{reason}</p>
      </div>
    );
  }

  // 성공
  if (status === "success") {
    return (
      <div className="flex flex-col gap-2 items-end shrink-0">
        <p className="label-meta mb-1">액션</p>
        <div className="text-xs font-medium px-4 py-2 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/60">
          승인 요청 완료
        </div>
        <p className="text-xs text-emerald-400/80 max-w-[200px] text-right leading-relaxed">
          {message}
        </p>
      </div>
    );
  }

  // 확인 대화 또는 초기 상태
  return (
    <div className="flex flex-col gap-2 items-end shrink-0">
      <p className="label-meta mb-1">액션</p>

      {status === "confirm" ? (
        <>
          <input
            type="text"
            value={reviewedBy}
            onChange={(e) => setReviewedBy(e.target.value)}
            placeholder="검수자 이름"
            className="text-xs border border-zinc-600/60 rounded px-3 py-1.5 bg-zinc-700/60 text-zinc-200 w-[160px] placeholder:text-zinc-500"
            autoFocus
          />
          <button
            onClick={handleApprove}
            disabled={!reviewedBy.trim() || status === "loading"}
            className={`text-xs font-medium px-4 py-2 rounded border transition-colors w-[160px] ${
              reviewedBy.trim()
                ? "bg-emerald-700/60 text-emerald-100 border-emerald-600/60 hover:bg-emerald-700/80"
                : "bg-zinc-600 text-zinc-400 border-zinc-500/60 cursor-not-allowed"
            }`}
          >
            {status === "loading" ? "처리 중..." : `${weekId} 승인 확정`}
          </button>
          <button
            onClick={() => { setStatus("idle"); setReviewedBy(""); }}
            className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            취소
          </button>
        </>
      ) : (
        <button
          onClick={() => setStatus("confirm")}
          className="text-xs font-medium px-4 py-2 rounded bg-sky-700/60 text-sky-100 border border-sky-600/60 hover:bg-sky-700/80 transition-colors"
        >
          승인
        </button>
      )}

      {status === "error" && (
        <p className="text-xs text-rose-400 max-w-[200px] text-right">{message}</p>
      )}
    </div>
  );
}

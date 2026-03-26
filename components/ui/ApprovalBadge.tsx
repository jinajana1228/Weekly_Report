import type { ApprovalDecision } from "@/lib/types";

const map: Record<ApprovalDecision, { label: string; cls: string }> = {
  pending: { label: "검수 대기", cls: "text-amber-400 bg-amber-950/50 border-amber-700/50" },
  approved: { label: "승인됨", cls: "text-emerald-400 bg-emerald-950/50 border-emerald-700/50" },
  rejected: { label: "반려됨", cls: "text-rose-400 bg-rose-950/50 border-rose-700/50" },
  on_hold: { label: "보류 중", cls: "text-zinc-400 bg-zinc-800 border-zinc-700/50" },
};

export default function ApprovalBadge({ decision }: { decision: ApprovalDecision }) {
  const { label, cls } = map[decision];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium border rounded-md px-3 py-1 ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

/** null/undefined 숫자를 안전하게 포맷합니다. */
export function fmtNum(v: number | null | undefined): string {
  if (v == null) return "-";
  return v.toLocaleString();
}

/** null/undefined change_pct를 "+0.5%" 형식으로 포맷합니다. */
export function fmtChangePct(v: number | null | undefined): string {
  if (v == null) return "-";
  return `${v >= 0 ? "+" : ""}${v}%`;
}

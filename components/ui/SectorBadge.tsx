import type { SectorCode } from "@/lib/types";

export const SECTOR_LABELS: Record<SectorCode, string> = {
  TECH: "테크",
  BATTERY: "배터리",
  HEALTHCARE: "헬스케어",
  FINANCE: "금융",
  CONSUMER: "소비재",
  INDUSTRIAL: "산업재",
  MATERIAL: "소재",
  ENERGY: "에너지",
  TELECOM: "통신",
  REALESTATE: "부동산",
  ETF_DOMESTIC: "ETF 국내",
  ETF_OVERSEAS: "ETF 해외",
  ETF_BOND_DIV: "ETF 채권·배당",
};

export default function SectorBadge({ sector }: { sector: SectorCode }) {
  return (
    <span className="inline-block text-xs font-medium text-zinc-300 bg-zinc-700/80 border border-zinc-600/60 rounded px-2 py-0.5">
      {SECTOR_LABELS[sector] ?? sector}
    </span>
  );
}

// ─────────────────────────────────────────────
// Shared sub-types
// ─────────────────────────────────────────────
export type Sentiment = "positive" | "negative" | "neutral";
export type AssetType = "stock" | "etf";
export type SectorCode =
  | "TECH" | "BATTERY" | "HEALTHCARE" | "FINANCE" | "CONSUMER"
  | "INDUSTRIAL" | "MATERIAL" | "ENERGY" | "TELECOM" | "REALESTATE"
  | "ETF_DOMESTIC" | "ETF_OVERSEAS" | "ETF_BOND_DIV";

export interface SectorReturn {
  sector_code: SectorCode;
  weekly_return: number;
}

export interface NewsItem {
  title: string;
  source: string;
  url: string;
  published_at: string;
  keywords: string[];
  sentiment: Sentiment;
  related_sectors: SectorCode[];
}

export interface SectorHighlight {
  sector: SectorCode;
  direction: "up" | "down" | "neutral";
  note: string;
}

export interface IndexChange {
  index: string;
  change_pct: number;
}

export interface SameAlternative {
  ticker: string;
  name: string;
  one_line_reason: string;
}

export interface PriceZone {
  reference_price: number;
  currency: string;
  watch_low: number | null;
  watch_high: number | null;
}

export interface ETFSummary {
  benchmark: string;
  manager: string;
  top_holdings: { name: string; weight_pct: number }[];
  geographic_exposure: string;
  hedge_policy: string;
  leverage_inverse: boolean;
  fee_summary: string;
}

// ─────────────────────────────────────────────
// Main Report — Pick
// ─────────────────────────────────────────────
export interface Pick {
  rank: number;
  ticker: string;
  name: string;
  market: string;
  sector: SectorCode;
  asset_type: AssetType;
  one_line_reason: string;
  stance: string;
  price_zone: PriceZone;
  catalyst_summary: string;
  risk_summary: string;
  same_sector_alternatives: SameAlternative[] | null;
  detail_report_id: string | null;
  etf_summary?: ETFSummary;
}

// ─────────────────────────────────────────────
// Main Report
// ─────────────────────────────────────────────
export interface MainReport {
  report_id: string;
  week_id: string;
  schema_version: string;
  data_as_of: string;
  generated_at: string;
  published_at: string | null;
  archived_at?: string;
  draft_note?: string;
  market_summary: {
    global: {
      headline: string;
      key_index_changes: IndexChange[];
      sentiment: Sentiment;
    };
    domestic: {
      kospi: { level: number; change_pct: number | null; brief: string };
      kosdaq: { level: number; change_pct: number | null; brief: string };
      sector_highlights: SectorHighlight[];
      week_theme: string;
    };
  };
  picks: Pick[];
  favored_sectors?: SectorCode[];
  cautious_sectors?: SectorCode[];
  sector_returns?: SectorReturn[];
  related_news: NewsItem[];
  disclaimer: string;
}

// ─────────────────────────────────────────────
// Detail Report — Stock
// ─────────────────────────────────────────────
export interface PriceReference {
  reference_price: number;
  currency: string;
  watch_low: number | null;
  watch_high: number | null;
  week52_high?: number | null;
  week52_low?: number | null;
  position_in_52w_pct?: number | null;
}

export interface FinancialSummary {
  schema_note?: string;
  revenue?: string | null;
  operating_income?: string | null;
  operating_margin_pct?: string | null;
  per?: string | null;
  pbr?: string | null;
  roe_pct?: string | null;
  revenue_growth_yoy_pct?: string | null;
  dividend_yield_pct?: string | null;
  ytd_return_pct?: string | null;
  "1y_return_pct"?: string | null;
  tracking_error_pct?: string | null;
  total_expense_ratio_pct?: string | null;
  aum_billion_krw?: string | null;
}

export interface StockDetail {
  detail_report_id: string;
  report_id: string;
  week_id: string;
  ticker: string;
  name: string;
  sector: SectorCode;
  asset_type: AssetType;
  data_as_of: string;
  linked_signal_ids?: string[];
  company_overview: string;
  price_reference: PriceReference;
  stance: string;
  bull_points: string[];
  bear_points: string[];
  catalysts_2_to_4_weeks: string[];
  risks: string[];
  financial_summary: FinancialSummary;
  related_news: NewsItem[];
}

// ─────────────────────────────────────────────
// Detail Report — ETF (extends StockDetail)
// ─────────────────────────────────────────────
export interface ETFDetail extends StockDetail {
  etf_overview: string;
  benchmark: string;
  manager: string;
  top_holdings: { name: string; weight_pct: number }[];
  geographic_exposure: Record<string, number>;
  sector_exposure: Record<string, string> & { schema_note?: string };
  hedge_policy: string;
  leverage_inverse_flag: boolean;
  fee_summary: string;
  etf_specific_risks: string[];
}

export type DetailReport = StockDetail | ETFDetail;

export function isETFDetail(d: DetailReport): d is ETFDetail {
  return d.asset_type === "etf";
}

// ─────────────────────────────────────────────
// Manifest
// ─────────────────────────────────────────────
export interface Manifest {
  schema_version: string;
  current_report_id: string;
  current_week_id: string;
  current_file_path: string;
  draft_report_id: string;
  draft_week_id: string;
  draft_file_path: string;
  archive_week_ids: string[];
  archive_base_path: string;
  data_as_of: string;
  last_generated_at: string;
  last_published_at: string;
}

// ─────────────────────────────────────────────
// Approval
// ─────────────────────────────────────────────
export type ApprovalDecision = "pending" | "approved" | "rejected" | "on_hold";

export interface Approval {
  draft_report_id: string;
  draft_week_id: string;
  decision: ApprovalDecision;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  news_signal_review_status?: string;
}

// ─────────────────────────────────────────────
// Overlap History
// ─────────────────────────────────────────────
export interface OverlapEdition {
  week_id: string;
  published_at: string;
  main_picks: string[];
}

export interface OverlapHistory {
  schema_version: string;
  last_updated_at: string;
  recent_editions: OverlapEdition[];
}

// ─────────────────────────────────────────────
// News Signal (read-only)
// ─────────────────────────────────────────────
export type SignalScope = "market" | "sector" | "stock" | "etf";
export type SignalDirection = "bullish" | "bearish" | "neutral";
export type SignalStrength = "strong" | "moderate" | "weak";
export type SignalReviewStatus = "APPROVED" | "DISCARDED" | "PENDING";

export interface NewsSignal {
  signal_id: string;
  scope: SignalScope;
  direction: SignalDirection;
  strength: SignalStrength;
  title: string;
  summary: string;
  source: string;
  source_url: string;
  published_at: string;
  keywords: string[];
  affected_sectors: SectorCode[];
  affected_tickers: string[];
  admin_review_needed: boolean;
  is_used_in_report: boolean;
}

export interface NewsSignalFile {
  week_id: string;
  scope: SignalScope;
  generated_at: string;
  signals: NewsSignal[];
}

export interface SignalReviewItem {
  signal_id: string;
  review_status: SignalReviewStatus;
  review_note: string;
}

export interface SignalReview {
  week_id: string;
  reviewed_at: string;
  reviewed_by: string;
  review_completed: boolean;
  total_signal_count: number;
  review_items: SignalReviewItem[];
}

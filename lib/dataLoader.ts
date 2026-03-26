import fs from "fs";
import path from "path";
import type {
  MainReport,
  DetailReport,
  Manifest,
  Approval,
  OverlapHistory,
  NewsSignal,
  NewsSignalFile,
  SignalReview,
  SignalScope,
} from "./types";

const ROOT = process.cwd();

function readJson<T>(filePath: string): T | null {
  try {
    const abs = path.join(ROOT, filePath);
    const raw = fs.readFileSync(abs, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ─── Public loaders ───────────────────────────

export function loadCurrentReport(): MainReport | null {
  return readJson<MainReport>("data/current/current.json");
}

export function loadArchiveReport(weekId: string): MainReport | null {
  return readJson<MainReport>(`data/archive/${weekId}.json`);
}

export function loadManifest(): Manifest | null {
  return readJson<Manifest>("data/manifests/manifest.json");
}

export function loadCurrentDetail(
  assetType: "stock" | "etf",
  ticker: string
): DetailReport | null {
  return readJson<DetailReport>(
    `data/current/details/${assetType}_${ticker}.json`
  );
}

export function loadArchiveDetail(
  weekId: string,
  assetType: "stock" | "etf",
  ticker: string
): DetailReport | null {
  return readJson<DetailReport>(
    `data/archive/details/${assetType}_${ticker}.json`
  );
}

// ─── Admin-only loaders ───────────────────────

export function loadApproval(): Approval | null {
  return readJson<Approval>("data/manifests/approval.json");
}

export function loadOverlapHistory(): OverlapHistory | null {
  return readJson<OverlapHistory>("admin/overlap_history.json");
}

export function loadDraftReport(weekId: string): MainReport | null {
  return readJson<MainReport>(`data/draft/${weekId}.json`);
}

export function loadDraftDetail(
  assetType: "stock" | "etf",
  ticker: string
): DetailReport | null {
  return readJson<DetailReport>(
    `data/draft/details/${assetType}_${ticker}.json`
  );
}

// ─── News Signal loaders (read-only) ──────────

export function loadNewsSignals(weekId: string): NewsSignal[] {
  const scopes: SignalScope[] = ["market", "sector", "stock", "etf"];
  const all: NewsSignal[] = [];
  for (const scope of scopes) {
    const file = readJson<NewsSignalFile>(
      `data/news_signals/${weekId}/${scope}_signals.json`
    );
    if (file?.signals) all.push(...file.signals);
  }
  return all;
}

export function loadSignalReview(weekId: string): SignalReview | null {
  return readJson<SignalReview>(
    `data/news_signals/${weekId}/signal_review.json`
  );
}

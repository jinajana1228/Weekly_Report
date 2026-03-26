import type { NewsItem } from "@/lib/types";
import SentimentBadge from "./SentimentBadge";

export default function NewsCard({ item }: { item: NewsItem }) {
  const date = new Date(item.published_at).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
  return (
    <div className="flex items-start gap-3 py-3 border-b border-zinc-700 last:border-0">
      <div className="flex-1 min-w-0">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-zinc-300 hover:text-sky-400 leading-snug line-clamp-2 transition-colors"
        >
          {item.title}
        </a>
        <p className="mt-1 text-xs text-zinc-500">
          {item.source} · {date}
        </p>
      </div>
      <SentimentBadge sentiment={item.sentiment} />
    </div>
  );
}

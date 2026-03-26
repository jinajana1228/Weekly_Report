import Link from "next/link";

export default function Header() {
  return (
    <header className="bg-zinc-950 border-b border-zinc-700">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="text-base font-semibold tracking-tight text-zinc-50">
            Weekly Report
          </span>
          <span className="text-xs text-zinc-500 font-normal border border-zinc-600 rounded px-2 py-0.5">
            KR
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/"
            className="text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            이번 주
          </Link>
          <Link
            href="/archive"
            className="text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            아카이브
          </Link>
          <Link
            href="/admin/review"
            className="text-zinc-500 hover:text-zinc-300 transition-colors text-xs"
          >
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}

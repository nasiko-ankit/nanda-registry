import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-[color:var(--page-bg)]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-sm border border-black/10 bg-white px-3 text-sm font-semibold tracking-[0.28em] text-slate-900 shadow-sm">
            NR
          </span>
          <span className="hidden truncate font-serif text-lg italic tracking-tight text-slate-950 sm:block">
            NANDA AI Catalog Server
          </span>
        </Link>
      </div>
    </header>
  );
}

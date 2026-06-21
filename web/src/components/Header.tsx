import Link from "next/link";

const AGENT_COUNT = 30;

export function Header() {
  return (
    <header className="bg-surface-light border-b border-line sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-4">
        {/* LEFT: brand link */}
        <Link
          href="/"
          className="flex items-center gap-3 min-w-0 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-card bg-brand-800 text-white text-xs font-semibold tracking-wide"
          >
            NR
          </span>
          <span className="hidden sm:block h-6 border-l border-line" />
          <span className="hidden sm:flex flex-col leading-tight min-w-0">
            <span className="font-semibold text-ink-strong truncate">
              Nanda Registry
            </span>
            <span className="text-xs text-ink-weak truncate">
              Agent registry &amp; directory
            </span>
          </span>
        </Link>

        {/* RIGHT: counter chip */}
        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end leading-tight">
            <span className="text-base font-bold text-ink-strong">
              {AGENT_COUNT} + agents registered
            </span>
            <span className="text-xs text-ink-weak">Indexed</span>
          </div>
        </div>
      </div>
    </header>
  );
}

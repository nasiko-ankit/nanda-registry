"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchRegistryAgents } from "@/lib/registry-api";
import type { RegistryAgentRecord } from "@/lib/registry-types";

// View-model for an agent card in the Explore grid.
type AgentVM = {
  id: string;
  name: string;
  type: "A2A" | "MCP" | "REST";
  version: string;
  date: string;
  identifier: string;
  description: string;
  url: string;
  tags: string[];
  verified: boolean;
  typeBadge: string;
  status: "Active" | "Inactive";
};

const PAGE_SIZE = 6;

const REGISTRY_BASE_URL =
  process.env.NEXT_PUBLIC_REGISTRY_API_URL || "https://travel26.net/api";

function deriveTypeBadge(mediaType: string): "A2A" | "MCP" | "REST" {
  const mt = (mediaType ?? "").toLowerCase();
  if (mt.includes("a2a")) return "A2A";
  if (mt.includes("mcp")) return "MCP";
  return "REST";
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function toViewModel(rec: RegistryAgentRecord): AgentVM {
  const badge = deriveTypeBadge(rec.mediaType);
  const status: "Active" | "Inactive" =
    rec.metadata?.status === "inactive" ? "Inactive" : "Active";
  return {
    id: rec.identifier,
    name: rec.displayName?.trim() || rec.identifier,
    type: badge,
    version: rec.version ?? "v1.0",
    date: formatDate(rec.updatedAt),
    identifier: rec.identifier,
    description: rec.description ?? "",
    url: rec.url,
    tags: rec.tags ?? [],
    verified: rec.metadata?.status === "active",
    typeBadge: badge,
    status,
  };
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [records, setRecords] = useState<AgentVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [protocols, setProtocols] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRegistryAgents(REGISTRY_BASE_URL, "")
      .then((entries) => {
        if (cancelled) return;
        setRecords(entries.map(toViewModel));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Derive filter options from real data.
  const protocolOptions = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => set.add(r.type));
    return Array.from(set).sort();
  }, [records]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => set.add(r.status));
    return Array.from(set).sort();
  }, [records]);

  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => r.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort().slice(0, 30);
  }, [records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q) && !a.identifier.toLowerCase().includes(q)) {
        return false;
      }
      if (protocols.size > 0 && !protocols.has(a.type)) return false;
      if (statuses.size > 0 && !statuses.has(a.status)) return false;
      if (tags.size > 0 && !a.tags.some((t) => tags.has(t))) return false;
      return true;
    });
  }, [records, search, protocols, statuses, tags]);

  const total = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, total);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pages = buildPageList(currentPage, total);

  function toggle(set: Set<string>, value: string, update: (next: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    update(next);
    setPage(1);
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold text-ink-strong leading-tight">Explore</h2>
        <p className="mt-1 text-sm text-ink-medium max-w-3xl">
          Browse the secure directory of agents published to this registry.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <FilterSidebar
          search={search}
          onSearch={(v) => {
            setSearch(v);
            setPage(1);
          }}
          protocolOptions={protocolOptions}
          statusOptions={statusOptions}
          tagOptions={tagOptions}
          protocols={protocols}
          onToggleProtocol={(v) => toggle(protocols, v, setProtocols)}
          statuses={statuses}
          onToggleStatus={(v) => toggle(statuses, v, setStatuses)}
          tags={tags}
          onToggleTag={(v) => toggle(tags, v, setTags)}
        />

        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-surface-strong h-[200px] rounded-card animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <div className="bg-surface-light rounded-card border border-line p-8 text-center">
              <p className="text-sm font-semibold text-ink-strong">
                Could not reach {hostnameOf(REGISTRY_BASE_URL)}. Check that the API is running.
              </p>
              <p className="mt-2 font-mono text-xs text-ink-weak break-all">{error}</p>
            </div>
          ) : records.length === 0 ? (
            <div className="bg-surface-light rounded-card border border-line p-8 text-center">
              <p className="text-sm font-semibold text-ink-medium">No agents registered yet.</p>
            </div>
          ) : pageItems.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {pageItems.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          ) : (
            <div className="bg-surface-light rounded-card border border-line p-8 text-center">
              <p className="text-sm font-semibold text-ink-strong">No agents match these filters</p>
              <p className="mt-1 text-xs text-ink-weak">Adjust search, protocol, status or tags.</p>
            </div>
          )}

          {!loading && !error && records.length > 0 && (
            <Pagination
              page={currentPage}
              total={total}
              pages={pages}
              onChange={(p) => setPage(p)}
            />
          )}
        </div>
      </div>
    </main>
  );
}

// ── FilterSidebar ─────────────────────────────────────────────────────────────

function FilterSidebar({
  search,
  onSearch,
  protocolOptions,
  statusOptions,
  tagOptions,
  protocols,
  onToggleProtocol,
  statuses,
  onToggleStatus,
  tags,
  onToggleTag,
}: {
  search: string;
  onSearch: (v: string) => void;
  protocolOptions: string[];
  statusOptions: string[];
  tagOptions: string[];
  protocols: Set<string>;
  onToggleProtocol: (v: string) => void;
  statuses: Set<string>;
  onToggleStatus: (v: string) => void;
  tags: Set<string>;
  onToggleTag: (v: string) => void;
}) {
  return (
    <aside className="lg:w-64 flex-shrink-0">
      <div className="bg-surface-strong rounded-card border border-line p-4 space-y-5 sticky top-24 max-h-[calc(100vh-7rem)] flex flex-col overflow-hidden">
        {/* SEARCH */}
        <div className="flex-shrink-0">
          <label
            htmlFor="search"
            className="block text-xs font-semibold uppercase tracking-wide text-ink-medium mb-1.5"
          >
            Search
          </label>
          <input
            type="text"
            id="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Filter by agent name..."
            className="w-full rounded-control border-2 border-line bg-surface-light px-3 py-2 text-sm text-ink placeholder:text-ink-weak focus:outline-none focus:border-brand-500"
          />
        </div>

        {/* PROTOCOL */}
        <div className="flex-shrink-0">
          <span className="block text-xs font-semibold uppercase tracking-wide text-ink-medium mb-2">
            Protocol
          </span>
          <div className="space-y-1.5">
            {protocolOptions.length === 0 ? (
              <p className="text-xs text-ink-weak">No options</p>
            ) : (
              protocolOptions.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 text-sm text-ink cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={protocols.has(opt)}
                    onChange={() => onToggleProtocol(opt)}
                    className="rounded border-line-strong text-brand-500 focus:ring-brand-500"
                  />
                  <span>{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* STATUS */}
        <div className="flex-shrink-0">
          <span className="block text-xs font-semibold uppercase tracking-wide text-ink-medium mb-2">
            Status
          </span>
          <div className="space-y-1.5">
            {statusOptions.length === 0 ? (
              <p className="text-xs text-ink-weak">No options</p>
            ) : (
              statusOptions.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 text-sm text-ink cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={statuses.has(opt)}
                    onChange={() => onToggleStatus(opt)}
                    className="rounded border-line-strong text-brand-500 focus:ring-brand-500"
                  />
                  <span>{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* TAGS */}
        <div className="flex-1 min-h-0 flex flex-col">
          <span className="block text-xs font-semibold uppercase tracking-wide text-ink-medium mb-2">
            Tags
          </span>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {tagOptions.length === 0 ? (
              <p className="text-xs text-ink-weak">No tags</p>
            ) : (
              tagOptions.map((t) => (
                <label
                  key={t}
                  className="flex items-center gap-2 text-sm text-ink cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={tags.has(t)}
                    onChange={() => onToggleTag(t)}
                    className="rounded border-line-strong text-brand-500 focus:ring-brand-500"
                  />
                  <span className="truncate">{t}</span>
                </label>
              ))
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── AgentCard ─────────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentVM }) {
  return (
    <article
      role="button"
      tabIndex={0}
      className="bg-surface-light rounded-card border border-line/70 shadow-card p-4 hover:shadow-card-hover hover:border-line-strong transition cursor-pointer flex flex-col h-full gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="font-semibold text-ink-strong truncate">{agent.name}</h3>
            {agent.verified && (
              <span className="inline-flex flex-shrink-0" title="Verified">
                <svg
                  className="w-4 h-4 text-brand-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-ink-weak">
            Version {agent.version}
            {agent.date ? ` • ${agent.date}` : ""}
          </div>
        </div>
        {agent.typeBadge && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[#fdeccc] text-[#8a5a06] flex-shrink-0">
            {agent.typeBadge}
          </span>
        )}
      </div>
      <p className="text-sm text-ink line-clamp-2 leading-relaxed">{agent.description}</p>
      <div className="flex flex-wrap gap-1.5 mt-auto">
        {agent.tags.slice(0, 4).map((t) => (
          <span
            key={t}
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-tag text-ink"
          >
            {t}
          </span>
        ))}
      </div>
    </article>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({
  page,
  total,
  pages,
  onChange,
}: {
  page: number;
  total: number;
  pages: Array<number | "...">;
  onChange: (p: number) => void;
}) {
  return (
    <nav className="flex items-center justify-center gap-2 mt-6 pb-4">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="px-3 py-1.5 text-sm font-medium rounded text-ink border-2 border-line bg-surface-light hover:border-line-strong disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        Previous
      </button>
      <div className="flex items-center gap-1">
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`gap-${i}`} className="px-2 py-1 text-sm text-ink-weak">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={
                "min-w-9 h-9 px-2 text-sm font-medium rounded-full transition " +
                (p === page ? "bg-brand-500 text-white" : "text-ink hover:bg-surface-strong")
              }
            >
              {p}
            </button>
          ),
        )}
      </div>
      <button
        onClick={() => onChange(Math.min(total, page + 1))}
        disabled={page === total}
        className="px-3 py-1.5 text-sm font-medium rounded text-ink border-2 border-line bg-surface-light hover:border-line-strong disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        Next
      </button>
    </nav>
  );
}

function buildPageList(current: number, total: number): Array<number | "..."> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | "..."> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("...");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("...");
  out.push(total);
  return out;
}

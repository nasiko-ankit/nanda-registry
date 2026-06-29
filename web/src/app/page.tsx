"use client";

import { useCallback, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { JsonPanel } from "@/components/JsonPanel";
import { cn } from "@/lib/utils";
import type {
  RegistryAgentRecord,
  RegistryAgentCreatePayload,
  RegistryAgentUpdatePayload,
  RegistryUser,
} from "@/lib/registry-types";
import {
  RegistryApiError,
  createRegistryAgent,
  deleteRegistryAgent,
  fetchRegistryAgents,
  searchRegistryAgents,
  updateRegistryAgent,
  loginToRegistry,
  registerOnRegistry,
  getRegistryMe,
} from "@/lib/registry-api";

const REGISTRY_API_URL = process.env.NEXT_PUBLIC_REGISTRY_API_URL ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

type AuthMode = "login" | "register";
type ConnectState = "idle" | "connecting" | "connected";
type PanelMode = "view" | "create" | "edit";

interface Session {
  registryUrl: string;
  token: string;
  user: RegistryUser | null;
}

interface FormState {
  agent_id: string;
  display_name: string;
  description: string;
  url: string;
  tags: string[];
  ttl_seconds: string;
}

const EMPTY_FORM: FormState = {
  agent_id: "",
  display_name: "",
  description: "",
  url: "",
  tags: [],
  ttl_seconds: "3600",
};

function agentToForm(agent: RegistryAgentRecord): FormState {
  return {
    agent_id: agent.identifier,
    display_name: agent.displayName,
    description: agent.description ?? "",
    url: agent.url,
    tags: agent.tags ?? [],
    ttl_seconds: String(agent.metadata?.ttl_seconds ?? 3600),
  };
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, type = "text", disabled = false, hint, error,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; disabled?: boolean; hint?: string; error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className={cn(
          "w-full rounded-2xl border px-4 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-slate-300 bg-white disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-rose-300 bg-rose-50/40" : "border-black/10",
        )}
      />
      {error ? <p className="mt-1 text-[11px] text-rose-500">{error}</p>
        : hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
    </label>
  );
}

// ── Tags chip input ────────────────────────────────────────────────────────────

function TagsInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState("");

  function commit(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setInput("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(input); }
    else if (e.key === "Backspace" && !input && tags.length > 0) onChange(tags.slice(0, -1));
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Tags</span>
      <div className="flex min-h-[42px] flex-wrap gap-1.5 rounded-2xl border border-black/10 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-slate-300">
        {tags.map((tag) => (
          <span key={tag} className="flex items-center gap-1 rounded-full border border-black/10 bg-slate-100 px-2.5 py-0.5 font-mono text-xs text-slate-700">
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))} className="ml-0.5 leading-none text-slate-400 hover:text-slate-900">×</button>
          </span>
        ))}
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown} onBlur={() => { if (input) commit(input); }}
          placeholder={tags.length === 0 ? "e.g. customer-service, billing" : ""}
          className="min-w-[160px] flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-slate-300"
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Press Enter or comma to add.</p>
    </div>
  );
}

// ── Agent card ─────────────────────────────────────────────────────────────────

function AgentCard({ agent, selected, onClick }: { agent: RegistryAgentRecord; selected: boolean; onClick: () => void }) {
  const status = (agent.metadata?.status as string) ?? "active";
  return (
    <button onClick={onClick} className={cn("w-full rounded-2xl border p-4 text-left transition", selected ? "border-slate-950 bg-slate-50 shadow-sm" : "border-black/10 bg-white hover:bg-slate-50")}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-slate-950">{agent.displayName}</span>
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.15em]",
          status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500")}>
          {status}
        </span>
      </div>
      <p className="mt-1 truncate font-mono text-xs text-slate-500">{agent.identifier}</p>
      {(agent.tags ?? []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(agent.tags ?? []).slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full border border-black/8 bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500">{tag}</span>
          ))}
          {(agent.tags ?? []).length > 3 && <span className="font-mono text-[10px] text-slate-400">+{(agent.tags ?? []).length - 3}</span>}
        </div>
      )}
    </button>
  );
}

// ── Connect / Auth screen ──────────────────────────────────────────────────────

function ConnectScreen({
  onConnected,
  connectState,
}: {
  onConnected: (session: Session) => void;
  connectState: ConnectState;
}) {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function connect() {
    setLoading(true);
    setError(null);
    try {
      const token = authMode === "register"
        ? await registerOnRegistry(REGISTRY_API_URL, email, password, displayName || undefined)
        : await loginToRegistry(REGISTRY_API_URL, email, password);
      const user = await getRegistryMe(REGISTRY_API_URL, token);
      onConnected({ registryUrl: REGISTRY_API_URL, token, user });
    } catch (err) {
      setError(err instanceof RegistryApiError ? err.message : "Could not sign in — check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  const isReady = email.trim() && password.trim();

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm space-y-5">
        <div>
          <h2 className="font-serif text-xl italic text-slate-950">AI Catalog Manager</h2>
          <p className="mt-1 text-xs text-slate-500">
            Sign in to manage your agents on the NANDA AI Catalog.
          </p>
        </div>

        {/* Auth mode tabs */}
        <div>
          <div className="mb-4 flex rounded-xl border border-black/10 p-1 text-sm">
            {([["login", "Sign in"], ["register", "Create account"]] as [AuthMode, string][]).map(([key, label]) => (
              <button
                key={key} type="button"
                onClick={() => { setAuthMode(key); setError(null); }}
                className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition",
                  authMode === key ? "bg-slate-950 text-white" : "text-slate-500 hover:text-slate-700")}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {authMode === "register" && (
              <Field label="Display name (optional)" value={displayName} onChange={setDisplayName} placeholder="Your name" />
            )}
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
            <Field label="Password" value={password} onChange={setPassword} placeholder="••••••••" type="password"
              hint={authMode === "register" ? "At least 8 characters." : undefined} />
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        <button
          onClick={connect}
          disabled={loading || !isReady || connectState === "connecting"}
          className="w-full rounded-2xl bg-slate-950 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Connecting…" : authMode === "register" ? "Create account & connect" : "Sign in & connect"}
        </button>
      </div>
    </div>
  );
}

// ── Agent form ─────────────────────────────────────────────────────────────────

function AgentForm({ mode, form, patchForm, onSave, onCancel, saving, saveError }: {
  mode: "create" | "edit"; form: FormState;
  patchForm: (key: keyof FormState, val: string | string[]) => void;
  onSave: () => void; onCancel: () => void; saving: boolean; saveError: string | null;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold text-slate-950">
        {mode === "create" ? "New agent" : `Edit ${form.agent_id}`}
      </h2>

      <Field label="Agent ID" value={form.agent_id} onChange={(v) => patchForm("agent_id", v)}
        placeholder="my-agent" disabled={mode === "edit"}
        hint={mode === "edit" ? "Agent ID cannot be changed." : "Lowercase letters, numbers, hyphens. Permanent."} />

      <Field label="Display Name" value={form.display_name} onChange={(v) => patchForm("display_name", v)} placeholder="My Agent" />
      <Field label="Description (optional)" value={form.description} onChange={(v) => patchForm("description", v)} placeholder="What this agent does" />
      <Field label="Card URL" value={form.url} onChange={(v) => patchForm("url", v)}
        placeholder="https://agents.example.com/my-agent/a2a.json"
        hint="URL to the A2A card JSON describing this agent's capabilities." />
      <TagsInput tags={form.tags} onChange={(tags) => patchForm("tags", tags)} />
      <Field label="TTL Seconds" value={form.ttl_seconds} onChange={(v) => patchForm("ttl_seconds", v)} placeholder="3600"
        hint="How long resolvers should cache this agent record." />

      {saveError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{saveError}</div>
      )}

      <div className="flex gap-3">
        <button onClick={onSave} disabled={saving}
          className="rounded-2xl bg-slate-950 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-60">
          {saving ? "Saving…" : mode === "create" ? "Create agent" : "Save changes"}
        </button>
        <button onClick={onCancel} className="rounded-2xl border border-black/10 bg-white px-6 py-2.5 text-sm font-medium text-slate-700">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function RegistryManagerPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [connectState, setConnectState] = useState<ConnectState>("idle");

  const [agents, setAgents] = useState<RegistryAgentRecord[]>([]);
  const [selected, setSelected] = useState<RegistryAgentRecord | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("view");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RegistryAgentRecord[] | null>(null);
  const [searching, setSearching] = useState(false);

  const visibleAgents = searchResults ?? agents;

  const patchForm = (key: keyof FormState, val: string | string[]) =>
    setForm((f) => ({ ...f, [key]: val }));

  async function onConnected(s: Session) {
    setConnectState("connecting");
    try {
      const data = await fetchRegistryAgents(s.registryUrl, s.token);
      setAgents(data);
      setSelected(data[0] ?? null);
      setSession(s);
      setConnectState("connected");
    } catch (err) {
      setConnectState("idle");
      throw err;
    }
  }

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const data = await fetchRegistryAgents(session.registryUrl, session.token);
      setAgents(data);
    } catch { /* silent */ }
  }, [session]);

  function signOut() {
    setSession(null);
    setAgents([]);
    setSelected(null);
    setPanelMode("view");
    setConnectState("idle");
  }

  async function runSearch(q: string) {
    if (!session) return;
    if (!q.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const results = await searchRegistryAgents(session.registryUrl, q.trim(), session.token);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() { setSearchQuery(""); setSearchResults(null); }

  function startCreate() { setForm(EMPTY_FORM); setSelected(null); setSaveError(null); setPanelMode("create"); }
  function startEdit() { if (!selected) return; setForm(agentToForm(selected)); setSaveError(null); setPanelMode("edit"); }

  function formToCreatePayload(): RegistryAgentCreatePayload {
    return {
      agent_id: form.agent_id,
      display_name: form.display_name,
      description: form.description || undefined,
      url: form.url,
      tags: form.tags,
      ttl_seconds: parseInt(form.ttl_seconds, 10) || 3600,
    };
  }

  function formToUpdatePayload(): RegistryAgentUpdatePayload {
    return {
      display_name: form.display_name,
      description: form.description || undefined,
      url: form.url,
      tags: form.tags,
      ttl_seconds: parseInt(form.ttl_seconds, 10) || 3600,
    };
  }

  async function save() {
    if (!session) return;
    setSaving(true); setSaveError(null);
    try {
      if (panelMode === "create") {
        const created = await createRegistryAgent(session.registryUrl, session.token, formToCreatePayload());
        await refresh();
        setSelected(created);
        setPanelMode("view");
      } else if (panelMode === "edit" && selected) {
        const updated = await updateRegistryAgent(session.registryUrl, session.token, selected.identifier, formToUpdatePayload());
        await refresh();
        setSelected(updated);
        setPanelMode("view");
      }
    } catch (err) {
      setSaveError(err instanceof RegistryApiError ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAgent() {
    if (!selected || !session) return;
    const deletedId = selected.identifier;
    setDeleting(true);
    try {
      await deleteRegistryAgent(session.registryUrl, session.token, deletedId);
      // Fetch fresh list so selection uses post-delete state, not stale closure
      const data = await fetchRegistryAgents(session.registryUrl, session.token);
      setAgents(data);
      setSelected(data.find((a) => a.identifier !== deletedId) ?? null);
      setPanelMode("view");
    } catch { /* state reflects actual server state via next refresh */ }
    finally { setDeleting(false); }
  }

  // ── Connect gate ─────────────────────────────────────────────────────────────

  if (!session) {
    return (
      <PageShell title="Registry Manager" description="Manage agents on your Registry Server.">
        <ConnectScreen onConnected={onConnected} connectState={connectState} />
      </PageShell>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────────

  return (
    <PageShell title="Registry Manager" description={session.registryUrl}>
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-black/10 bg-white px-4 py-2.5 shadow-sm">
        <div className="text-sm text-slate-600">
          {session.user
            ? <><span className="font-medium text-slate-950">{session.user.display_name ?? session.user.email}</span><span className="ml-2 text-xs text-slate-400">{session.user.email}</span></>
            : <span className="font-mono text-xs text-slate-500">admin token</span>
          }
        </div>
        <button onClick={signOut} className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50">
          Disconnect
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Agents ({searchResults ? `${visibleAgents.length} of ${agents.length}` : agents.length})
            </span>
            <button onClick={startCreate} className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">+ New</button>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-1.5">
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim()) clearSearch();
              }}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(searchQuery); }}
              placeholder="Search or paste URN…"
              className="flex-1 rounded-2xl border border-black/10 bg-white px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-slate-300"
            />
            {searchQuery ? (
              <button onClick={clearSearch} className="rounded-full border border-black/10 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-50">✕</button>
            ) : (
              <button onClick={() => runSearch(searchQuery)} disabled={!searchQuery.trim() || searching}
                className="rounded-2xl border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                {searching ? "…" : "Go"}
              </button>
            )}
          </div>

          <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
            {visibleAgents.length === 0 ? (
              <div className="rounded-2xl border border-black/10 bg-white p-5 text-center">
                {searchResults !== null ? (
                  <p className="text-sm text-slate-500">No agents match &ldquo;{searchQuery}&rdquo;</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-700">No agents yet</p>
                    <button onClick={startCreate} className="mt-3 rounded-2xl bg-slate-950 px-4 py-2 text-xs font-medium text-white">+ New agent</button>
                  </>
                )}
              </div>
            ) : visibleAgents.map((agent) => (
              <AgentCard key={agent.identifier} agent={agent}
                selected={selected?.identifier === agent.identifier}
                onClick={() => { setSelected(agent); setPanelMode("view"); setSaveError(null); }} />
            ))}
          </div>
        </div>

        {/* Main panel */}
        <div>
          {panelMode === "create" || panelMode === "edit" ? (
            <AgentForm mode={panelMode} form={form} patchForm={patchForm}
              onSave={save} onCancel={() => { setPanelMode("view"); setSaveError(null); }}
              saving={saving} saveError={saveError} />
          ) : selected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button onClick={startEdit} className="rounded-2xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Edit</button>
                <button onClick={deleteAgent} disabled={deleting}
                  className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50">
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>

              <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm space-y-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-slate-950">{selected.displayName}</h2>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.15em]",
                      (selected.metadata?.status ?? "active") === "active"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-500")}>
                      {String(selected.metadata?.status ?? "active")}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-slate-500">{selected.identifier}</p>
                </div>

                {selected.description && <p className="text-sm text-slate-600">{selected.description}</p>}

                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Card URL</span>
                    <a href={selected.url} target="_blank" rel="noopener noreferrer"
                      className="mt-0.5 block break-all font-mono text-xs text-indigo-600 hover:underline">
                      {selected.url}
                    </a>
                  </div>
                  <div>
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">TTL</span>
                    <p className="mt-0.5 font-mono text-xs text-slate-700">{selected.metadata?.ttl_seconds ?? "—"}s</p>
                  </div>
                  {(selected.tags ?? []).length > 0 && (
                    <div>
                      <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Tags</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {(selected.tags ?? []).map((tag) => (
                          <span key={tag} className="rounded-full border border-black/10 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-700">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <JsonPanel data={selected} />
            </div>
          ) : (
            <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm text-center">
              <p className="text-sm font-medium text-slate-700">Select an agent</p>
              <p className="mt-1 text-xs text-slate-400">Choose from the list, or create a new one.</p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

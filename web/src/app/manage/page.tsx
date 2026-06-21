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

// ── Shared primitives (Outshift exact utility-class strings) ─────────────────

// Card grid item (interactive selectable card) - see CANONICAL.md article pattern
const cardClass =
  "bg-surface-light rounded-card border border-line/70 shadow-card p-4 hover:shadow-card-hover hover:border-line-strong transition flex flex-col h-full gap-3";
// Static info/settings/form card - more padding, no hover
const infoCardClass =
  "bg-surface-light rounded-card border border-line p-6 shadow-card";

const primaryBtnClass =
  "inline-flex items-center justify-center h-9 rounded-control bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 transition";
const secondaryBtnClass =
  "inline-flex items-center justify-center h-9 rounded-control border-2 border-line bg-surface-light px-3 text-sm font-medium text-ink hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-60 transition";
const dangerBtnClass =
  "inline-flex items-center justify-center h-9 rounded-control bg-[color:var(--color-danger)] px-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 transition";

const inputClass =
  "w-full h-10 rounded-control border-2 border-line bg-surface-light px-3 text-sm text-ink placeholder:text-ink-weak focus:outline-none focus:border-brand-500 transition-colors";

const microLabelClass =
  "block text-xs font-bold uppercase tracking-wide text-ink-weak";

const pillClass =
  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold";

function statusPillClass(status: string) {
  if (status === "active") {
    return cn(pillClass, "bg-accent-teal text-accent-teal-ink");
  }
  if (status === "pending") {
    return cn(pillClass, "bg-[#fdeccc] text-[#8a5a06]");
  }
  if (status === "suspended") {
    return cn(pillClass, "bg-[#fef3f2] text-[#b42318]");
  }
  return cn(pillClass, "bg-surface-tag text-ink");
}

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
      <span className={cn(microLabelClass, "mb-1")}>{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className={cn(
          inputClass,
          error ? "border-[color:var(--color-danger)] bg-[#fef3f2] focus:border-[color:var(--color-danger)]" : "",
        )}
      />
      {error ? <p className="mt-1 text-[11px] text-[color:var(--color-danger)]">{error}</p>
        : hint ? <p className="mt-1 text-[11px] text-ink-weak">{hint}</p> : null}
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
      <span className={cn(microLabelClass, "mb-1")}>Tags</span>
      <div className="flex min-h-[42px] flex-wrap gap-1.5 rounded-control border-2 border-line bg-surface-light px-3 py-2 focus-within:border-brand-500 transition-colors">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-tag text-ink">
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))} className="ml-0.5 leading-none text-ink-weak hover:text-ink-strong">×</button>
          </span>
        ))}
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown} onBlur={() => { if (input) commit(input); }}
          placeholder={tags.length === 0 ? "e.g. customer-service, billing" : ""}
          className="min-w-[160px] flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-weak"
        />
      </div>
      <p className="mt-1 text-[11px] text-ink-weak">Press Enter or comma to add.</p>
    </div>
  );
}

// ── Agent card ─────────────────────────────────────────────────────────────────

function AgentCard({ agent, selected, onClick }: { agent: RegistryAgentRecord; selected: boolean; onClick: () => void }) {
  const status = (agent.metadata?.status as string) ?? "active";
  return (
    <article
      onClick={onClick}
      className={cn(
        "bg-surface-light rounded-card border shadow-card p-4 hover:shadow-card-hover transition cursor-pointer flex flex-col h-full gap-3 text-left",
        selected
          ? "border-brand-500 bg-brand-200/60"
          : "border-line/70 hover:border-line-strong",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-ink-strong truncate">{agent.displayName}</h3>
        <span className={statusPillClass(status)}>{status}</span>
      </div>
      <p className="font-mono text-xs text-ink-medium truncate">{agent.identifier}</p>
      {(agent.tags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2 mt-auto">
          {(agent.tags ?? []).slice(0, 3).map((tag) => (
            <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-tag text-ink">{tag}</span>
          ))}
          {(agent.tags ?? []).length > 3 && <span className="text-xs text-ink-weak self-center">+{(agent.tags ?? []).length - 3}</span>}
        </div>
      )}
    </article>
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
      setError(err instanceof RegistryApiError ? err.message : "Could not sign in - check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  const isReady = email.trim() && password.trim();

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className={cn(infoCardClass, "space-y-5")}>
        <div>
          <h2 className="font-semibold text-ink-strong text-lg">Registry Manager</h2>
          <p className="mt-1 text-xs text-ink-medium">
            Sign in to manage your agents on the NANDA Registry.
          </p>
        </div>

        {/* Auth mode tabs */}
        <div>
          <div className="mb-4 flex rounded-control border-2 border-line p-1 text-sm">
            {([["login", "Sign in"], ["register", "Create account"]] as [AuthMode, string][]).map(([key, label]) => (
              <button
                key={key} type="button"
                onClick={() => { setAuthMode(key); setError(null); }}
                className={cn("flex-1 rounded-control py-1.5 text-xs font-medium transition",
                  authMode === key
                    ? "bg-brand-500 text-white"
                    : "text-ink-medium hover:text-ink-strong")}
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
          <div className="rounded-control border border-[color:var(--color-danger)]/30 bg-[#fef3f2] px-4 py-3 text-sm text-[color:var(--color-danger)]">{error}</div>
        )}

        <button
          onClick={connect}
          disabled={loading || !isReady || connectState === "connecting"}
          className={cn(primaryBtnClass, "w-full h-11")}
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
    <div className={cn(infoCardClass, "space-y-4")}>
      <h2 className="font-semibold text-ink-strong text-lg">
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
        <div className="rounded-control border border-[color:var(--color-danger)]/30 bg-[#fef3f2] px-4 py-3 text-sm text-[color:var(--color-danger)]">{saveError}</div>
      )}

      <div className="flex gap-3">
        <button onClick={onSave} disabled={saving} className={primaryBtnClass}>
          {saving ? "Saving…" : mode === "create" ? "Create agent" : "Save changes"}
        </button>
        <button onClick={onCancel} className={secondaryBtnClass}>
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
      <div className={cn(infoCardClass, "mb-4 flex items-center justify-between px-4 py-2.5")}>
        <div className="text-sm text-ink-medium">
          {session.user
            ? <><span className="font-medium text-ink-strong">{session.user.display_name ?? session.user.email}</span><span className="ml-2 text-xs text-ink-weak">{session.user.email}</span></>
            : <span className="font-mono text-xs text-ink-medium">admin token</span>
          }
        </div>
        <button
          onClick={signOut}
          className="text-xs font-medium text-ink-weak hover:text-ink transition"
        >
          Disconnect
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={microLabelClass}>
              Agents ({searchResults ? `${visibleAgents.length} of ${agents.length}` : agents.length})
            </span>
            <button
              onClick={startCreate}
              className={cn(primaryBtnClass, "h-8 px-3 text-xs")}
            >
              + New
            </button>
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
              className={cn(inputClass, "flex-1 text-xs h-9")}
            />
            {searchQuery ? (
              <button
                onClick={clearSearch}
                className={cn(secondaryBtnClass, "h-9 px-2.5 text-xs")}
              >
                ✕
              </button>
            ) : (
              <button
                onClick={() => runSearch(searchQuery)}
                disabled={!searchQuery.trim() || searching}
                className={cn(secondaryBtnClass, "h-9 px-3 text-xs disabled:opacity-40")}
              >
                {searching ? "…" : "Go"}
              </button>
            )}
          </div>

          <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
            {visibleAgents.length === 0 ? (
              <div className={cn(infoCardClass, "text-center")}>
                {searchResults !== null ? (
                  <p className="text-sm text-ink-medium">No agents match &ldquo;{searchQuery}&rdquo;</p>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-ink-strong">No agents yet</p>
                    <button onClick={startCreate} className={cn(primaryBtnClass, "mt-3")}>
                      + New agent
                    </button>
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
                <button onClick={startEdit} className={primaryBtnClass}>Edit</button>
                <button onClick={deleteAgent} disabled={deleting} className={dangerBtnClass}>
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>

              <div className={cn(infoCardClass, "space-y-3")}>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-ink-strong text-lg">{selected.displayName}</h2>
                    <span className={statusPillClass(String(selected.metadata?.status ?? "active"))}>
                      {String(selected.metadata?.status ?? "active")}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-ink-medium">{selected.identifier}</p>
                </div>

                {selected.description && <p className="text-sm text-ink leading-relaxed">{selected.description}</p>}

                <div className="space-y-2 text-sm">
                  <div>
                    <span className={microLabelClass}>Card URL</span>
                    <a href={selected.url} target="_blank" rel="noopener noreferrer"
                      className="mt-0.5 block break-all font-mono text-xs text-brand-500 hover:text-brand-600 hover:underline">
                      {selected.url}
                    </a>
                  </div>
                  <div>
                    <span className={microLabelClass}>TTL</span>
                    <p className="mt-0.5 font-mono text-xs text-ink">{selected.metadata?.ttl_seconds ?? "-"}s</p>
                  </div>
                  {(selected.tags ?? []).length > 0 && (
                    <div>
                      <span className={microLabelClass}>Tags</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {(selected.tags ?? []).map((tag) => (
                          <span key={tag} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-tag text-ink">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <JsonPanel data={selected} />
            </div>
          ) : (
            <div className={cn(infoCardClass, "text-center")}>
              <p className="text-sm font-semibold text-ink-strong">Select an agent</p>
              <p className="mt-1 text-xs text-ink-weak">Choose from the list, or create a new one.</p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

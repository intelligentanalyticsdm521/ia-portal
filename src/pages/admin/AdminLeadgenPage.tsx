// AdminLeadgenPage — Founder-only admin UI for SPARK Lead Gen V1.
//
// Backend: routes/leadgenFounderAdmin.js in LUMEN-API. All endpoints are
// behind a Bearer FOUNDER_ADMIN_TOKEN header (NOT the user's MSAL token).
// The token never leaves this browser session — we prompt for it once and
// keep it in localStorage. Founder is the only person who has the token.
//
// Tabs:
//   1. Term Review     — customer-submitted unknown taxonomy terms
//   2. Industry Review — customer-submitted unknown industries
//   3. Source Ablation — per-discovery-source rollup + bar chart
//   4. Blocklist       — global domain blocklist CRUD
//   5. Hunter Balance  — Hunter credits remaining + spend
//
// No MSAL token, no useSparkApi — pure fetch with the founder token. Means
// the page can be loaded even if the signed-in MSAL session has weird tenant
// state (founder ops should always work).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw, Trash2, Plus, AlertTriangle, Lock, ShieldCheck,
  BarChart3, ListChecks, Building2, Ban, Wallet,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { LeadgenTermReviewModal } from "../../components/admin/LeadgenTermReviewModal";

// ─────────────────────────────────────────────────────────────────────────
// Config / shared helpers
// ─────────────────────────────────────────────────────────────────────────

const LUMEN_API_BASE =
  (import.meta.env.VITE_LUMEN_API_BASE as string) ||
  (import.meta.env.VITE_SPARK_API_BASE as string) ||
  "https://app-lumen-api-prod-c6afftekgua4axh9.centralus-01.azurewebsites.net";

const TOKEN_KEY = "ia_founder_admin_token";

function getStoredToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}
function setStoredToken(t: string) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

/** Founder-token-authenticated fetch against lumen-api /api/v1/* */
async function founderFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${LUMEN_API_BASE}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// ─────────────────────────────────────────────────────────────────────────
// Types (mirror backend shapes)
// ─────────────────────────────────────────────────────────────────────────

interface TermQueueRow {
  id: number;
  submitted_term: string;
  normalized_term: string | null;
  hint: string | null;
  tenant_id: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  reviewed_at: string | null;
  action_taken: string | null;
  resolved_term_id: number | null;
  resolved_term?: string | null;
}

interface IndustryQueueRow {
  id: number;
  submitted_industry: string;
  normalized_industry: string | null;
  hint: string | null;
  tenant_id: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  reviewed_at: string | null;
}

interface BlocklistRow {
  id: number;
  domain_pattern: string;
  match_type: string;
  category: string | null;
  reason: string | null;
  created_at: string;
  is_active: number;
}

interface SourceRollupRow {
  source: string;
  requests: number;
  raw_results: number;
  unique_domains: number;
  duplicates: number;
  errors: number;
  unique_per_request: number;
  dupe_rate: number;
  error_rate: number;
}

interface HunterBalanceShape {
  available: number;
  reset_at?: string | null;
  credits_used_this_process: number;
  total_credits?: number;
}

type TabKey = "terms" | "industries" | "ablation" | "blocklist" | "hunter";

const TABS: Array<{ key: TabKey; label: string; icon: typeof ListChecks }> = [
  { key: "terms",      label: "Term Review",     icon: ListChecks },
  { key: "industries", label: "Industry Review", icon: Building2 },
  { key: "ablation",   label: "Source Ablation", icon: BarChart3 },
  { key: "blocklist",  label: "Blocklist",       icon: Ban },
  { key: "hunter",     label: "Hunter Balance",  icon: Wallet },
];

// ─────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────

export function AdminLeadgenPage() {
  const [token, setTokenState] = useState<string>(() => getStoredToken());
  const [tokenInput, setTokenInput] = useState<string>("");
  const [tab, setTab] = useState<TabKey>("terms");

  const setToken = useCallback((t: string) => {
    setStoredToken(t);
    setTokenState(t);
  }, []);

  if (!token) {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6">
          <div className="flex items-center gap-2 text-amber-900">
            <Lock className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Founder admin token required</h1>
          </div>
          <p className="mt-2 text-sm text-amber-900/80">
            Paste the <code>FOUNDER_ADMIN_TOKEN</code> from KV to unlock the SPARK Lead Gen V1
            admin surface. Stored in this browser only.
          </p>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Bearer token"
            className="mt-4 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-mono"
          />
          <button
            disabled={!tokenInput.trim()}
            onClick={() => setToken(tokenInput.trim())}
            className="mt-3 w-full rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-100 p-2 text-amber-800">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">SPARK Lead Gen — Founder Admin</h1>
            <p className="text-xs text-slate-500">
              Quarterly taxonomy curation, source ablation, global blocklist, Hunter spend.
            </p>
          </div>
        </div>
        <button
          onClick={() => { setToken(""); setTokenInput(""); }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          Clear token
        </button>
      </header>

      {/* Tab nav */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? "border-[#EF6C33] text-slate-900"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab bodies */}
      {tab === "terms"      && <TermReviewTab token={token} />}
      {tab === "industries" && <IndustryReviewTab token={token} />}
      {tab === "ablation"   && <SourceAblationTab token={token} />}
      {tab === "blocklist"  && <BlocklistTab token={token} />}
      {tab === "hunter"     && <HunterBalanceTab token={token} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Term Review tab
// ─────────────────────────────────────────────────────────────────────────

function TermReviewTab({ token }: { token: string }) {
  const [rows, setRows] = useState<TermQueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [selected, setSelected] = useState<TermQueueRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const path = `/admin/leadgen-v1/term-review-queue${showResolved ? "?include_resolved=1" : ""}`;
      const r = await founderFetch<{ data: TermQueueRow[] }>(token, path);
      setRows(r.data || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, showResolved]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          {loading ? "Loading…" : `${rows.length} entr${rows.length === 1 ? "y" : "ies"}`}
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
            />
            Show resolved
          </label>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {error && <ErrorBanner error={error} />}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Term</th>
              <th className="px-3 py-2 text-left">Normalized</th>
              <th className="px-3 py-2 text-left">Hint</th>
              <th className="px-3 py-2 text-left">Tenant</th>
              <th className="px-3 py-2 text-right">Occurrences</th>
              <th className="px-3 py-2 text-left">First seen</th>
              <th className="px-3 py-2 text-left">Last seen</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">No entries</td></tr>
            ) : null}
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => !r.reviewed_at && setSelected(r)}
                className={`border-b border-slate-100 ${r.reviewed_at ? "opacity-60" : "cursor-pointer hover:bg-amber-50/40"}`}
              >
                <td className="px-3 py-2 font-semibold text-slate-900">{r.submitted_term}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.normalized_term || "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{r.hint || "—"}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{truncId(r.tenant_id)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.occurrence_count}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(r.first_seen_at)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(r.last_seen_at)}</td>
                <td className="px-3 py-2">
                  {r.reviewed_at ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                      {r.action_taken || "resolved"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                      pending
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LeadgenTermReviewModal
        open={!!selected}
        entry={selected}
        token={token}
        apiBase={LUMEN_API_BASE}
        onClose={() => setSelected(null)}
        onResolved={() => { setSelected(null); void load(); }}
      />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Industry Review tab — read-only; resolve endpoint not yet shipped.
// ─────────────────────────────────────────────────────────────────────────

function IndustryReviewTab({ token }: { token: string }) {
  const [rows, setRows] = useState<IndustryQueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await founderFetch<{ data: IndustryQueueRow[] }>(token, "/admin/leadgen-v1/industry-review-queue");
      setRows(r.data || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          {loading ? "Loading…" : `${rows.length} pending`}
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        Read-only view. Industry resolve endpoint is not yet implemented in
        <code className="ml-1">leadgenFounderAdmin.js</code>. {/* TODO(backend): mirror term resolve endpoint for industry queue. */}
      </div>

      {error && <ErrorBanner error={error} />}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Industry</th>
              <th className="px-3 py-2 text-left">Normalized</th>
              <th className="px-3 py-2 text-left">Hint</th>
              <th className="px-3 py-2 text-left">Tenant</th>
              <th className="px-3 py-2 text-right">Occurrences</th>
              <th className="px-3 py-2 text-left">First seen</th>
              <th className="px-3 py-2 text-left">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">No entries</td></tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="px-3 py-2 font-semibold text-slate-900">{r.submitted_industry}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.normalized_industry || "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{r.hint || "—"}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{truncId(r.tenant_id)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.occurrence_count}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(r.first_seen_at)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(r.last_seen_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Source Ablation tab
// ─────────────────────────────────────────────────────────────────────────

const DAY_RANGES = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 180, label: "Last 180 days" },
];

function SourceAblationTab({ token }: { token: string }) {
  const [rows, setRows] = useState<SourceRollupRow[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await founderFetch<{ data: SourceRollupRow[]; days: number }>(
        token,
        `/admin/leadgen-v1/source-ablation?days=${days}`
      );
      setRows(r.data || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, days]);

  useEffect(() => { void load(); }, [load]);

  const chartData = useMemo(
    () => rows.map((r) => ({ source: r.source, unique_domains: r.unique_domains })),
    [rows]
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-700">Range:</label>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
          >
            {DAY_RANGES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error && <ErrorBanner error={error} />}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Unique domains per source</h3>
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
        ) : chartData.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">No data in this window</div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="source" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="unique_domains" fill="#EF6C33" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-right">Requests</th>
              <th className="px-3 py-2 text-right">Raw results</th>
              <th className="px-3 py-2 text-right">Unique domains</th>
              <th className="px-3 py-2 text-right">Duplicates</th>
              <th className="px-3 py-2 text-right">Errors</th>
              <th className="px-3 py-2 text-right">Unique / req</th>
              <th className="px-3 py-2 text-right">Dupe rate</th>
              <th className="px-3 py-2 text-right">Error rate</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">No data in this window</td></tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.source} className="border-b border-slate-100">
                <td className="px-3 py-2 font-semibold text-slate-900">{r.source}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.requests}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.raw_results}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.unique_domains}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.duplicates}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.errors}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtRatio(r.unique_per_request)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.dupe_rate)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.error_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Blocklist tab
// ─────────────────────────────────────────────────────────────────────────

const MATCH_TYPES = ["exact", "prefix", "suffix"] as const;
const CATEGORIES = ["social", "directory", "jobs", "maps", "chain", "gov", "edu", "digital", "other"] as const;
type MatchType = typeof MATCH_TYPES[number];
type BlockCategory = typeof CATEGORIES[number];

function BlocklistTab({ token }: { token: string }) {
  const [rows, setRows] = useState<BlocklistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await founderFetch<{ data: BlocklistRow[] }>(token, "/admin/leadgen-v1/blocklist");
      setRows(r.data || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const onDelete = async (id: number) => {
    if (!confirm("Soft-delete this blocklist entry?")) return;
    try {
      await founderFetch(token, `/admin/leadgen-v1/blocklist/${id}`, { method: "DELETE" });
      void load();
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          {loading ? "Loading…" : `${rows.length} entr${rows.length === 1 ? "y" : "ies"}`}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d85e2a]"
          >
            <Plus className="h-3.5 w-3.5" /> Add to blocklist
          </button>
        </div>
      </div>

      {error && <ErrorBanner error={error} />}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Domain pattern</th>
              <th className="px-3 py-2 text-left">Match</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Reason</th>
              <th className="px-3 py-2 text-left">Added</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">No entries</td></tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id} className={`border-b border-slate-100 ${r.is_active ? "" : "opacity-50"}`}>
                <td className="px-3 py-2 font-mono text-xs text-slate-900">{r.domain_pattern}</td>
                <td className="px-3 py-2 text-xs">{r.match_type}</td>
                <td className="px-3 py-2 text-xs">{r.category || "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{r.reason || "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(r.created_at)}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    r.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {r.is_active ? "active" : "deleted"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {r.is_active === 1 && (
                    <button
                      onClick={() => void onDelete(r.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BlocklistAddModal
        open={showAdd}
        token={token}
        onClose={() => setShowAdd(false)}
        onAdded={() => { setShowAdd(false); void load(); }}
      />
    </section>
  );
}

function BlocklistAddModal({
  open, token, onClose, onAdded,
}: {
  open: boolean; token: string; onClose: () => void; onAdded: () => void;
}) {
  const [domain, setDomain] = useState("");
  const [matchType, setMatchType] = useState<MatchType>("exact");
  const [category, setCategory] = useState<BlockCategory>("other");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setDomain(""); setMatchType("exact"); setCategory("other"); setReason(""); setError(null); }
  }, [open]);

  if (!open) return null;

  const save = async () => {
    setSaving(true); setError(null);
    try {
      await founderFetch(token, "/admin/leadgen-v1/blocklist", {
        method: "POST",
        body: JSON.stringify({
          domain_pattern: domain.trim(),
          match_type: matchType,
          category,
          reason: reason.trim() || undefined,
        }),
      });
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const valid = domain.trim().length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[480px] max-w-[94vw] overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 text-white"
             style={{ background: "linear-gradient(to right, #0B1C24, #1a3540)" }}>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#EF6C33" }}>SPARK · ADMIN</div>
            <h2 className="text-base font-semibold">Add to global blocklist</h2>
          </div>
        </div>

        <div className="space-y-3 p-5">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Domain pattern *</label>
            <input
              type="text" value={domain} onChange={(e) => setDomain(e.target.value)}
              placeholder="indeed.com"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
            <p className="mt-1 text-[11px] text-slate-500">Lowercased, www. stripped server-side.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Match type</label>
              <select value={matchType} onChange={(e) => setMatchType(e.target.value as MatchType)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {MATCH_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as BlockCategory)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Reason</label>
            <input
              type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="job board, not a buyer"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button onClick={onClose}
                  className="rounded px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
            Cancel
          </button>
          <button disabled={!valid || saving} onClick={() => void save()}
                  className="rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {saving ? "Adding…" : "Add to blocklist"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Hunter Balance tab
// ─────────────────────────────────────────────────────────────────────────

function HunterBalanceTab({ token }: { token: string }) {
  const [balance, setBalance] = useState<HunterBalanceShape | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await founderFetch<{ data: HunterBalanceShape }>(token, "/admin/leadgen-v1/hunter-balance");
      setBalance(r.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error && <ErrorBanner error={error} />}

      <div className="grid gap-4 md:grid-cols-3">
        <BigStat
          label="Credits available"
          value={loading || !balance ? "—" : balance.available.toLocaleString()}
          accent="#EF6C33"
        />
        <BigStat
          label="Used this process"
          value={loading || !balance ? "—" : balance.credits_used_this_process.toLocaleString()}
          accent="#1A3A4A"
        />
        <BigStat
          label="Total plan credits"
          value={loading || !balance || balance.total_credits == null ? "—" : balance.total_credits.toLocaleString()}
          accent="#5A7A8A"
        />
      </div>

      {balance?.reset_at && (
        <div className="text-xs text-slate-500">
          Plan resets at <strong>{fmtDate(balance.reset_at)}</strong>.
        </div>
      )}
    </section>
  );
}

function BigStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2 text-4xl font-bold tabular-nums" style={{ color: accent }}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared atoms
// ─────────────────────────────────────────────────────────────────────────

function ErrorBanner({ error }: { error: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
      <div>{error}</div>
    </div>
  );
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString(undefined, {
      year: "2-digit", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return s; }
}
function truncId(id: string | null): string {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
function fmtRatio(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(2);
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default AdminLeadgenPage;

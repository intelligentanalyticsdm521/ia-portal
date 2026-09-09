// pages/admin/AgentsAcrossBusinessesPage.tsx — /app/admin/agents
//
// The founder's one page for the whole agent suite: every ARGUS agent, every
// Business, what it proposed, what got approved, and what it actually cost us.
//
// THIS IS THE ONLY SURFACE IN THE PLATFORM THAT SHOWS cost_usd FOR AGENT WORK
// (AG-1). Every client-facing read model hides it on purpose — it is our
// provider cost basis and showing it to a customer publishes the margin.
//
// Route is behind RequireFounderRoute, but the gate that matters is LUMEN's:
// /api/v1/il/admin/* is authVerify + founderOnly and fails closed, so a direct
// call gets a 403 whether or not the link is on screen.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Bot, RefreshCw, AlertTriangle } from "lucide-react";
import { useActiveAccount } from "../../auth/useAccessToken";
import { lumenGet } from "../../lib/lumenApi";
import { AgentControlsCard } from "./AgentControlsCard";
import { AgentCodeProposalsCard } from "./AgentCodeProposalsCard";

interface AgentCell {
  agent: string;
  agent_label: string;
  product: string;
  /**
   * "agent" or "oversight". ARGUS pack 1 added the Governance layer itself as a
   * source, and its numbers are deliberately NOT runs and NOT cost: the rows it
   * reads ARE the other agents' runs, each already carrying that agent's own
   * cost, so counting them again would double every total on this page. It
   * reports `checked` and `flagged` instead.
   */
  kind?: string;
  runs: number;
  failed: number;
  cost_usd: number;
  last_run_at: string | null;
  waiting: number;
  approved: number;
  declined: number;
  other: number;
  checked?: number;
  flagged?: number;
}

interface BusinessRow {
  tenant_id: string;
  business_name: string | null;
  agents: AgentCell[];
  runs: number;
  waiting: number;
  approved: number;
  declined: number;
  cost_usd: number;
  checked?: number;
  flagged?: number;
}

/**
 * ONE flat object, because lib/lumenApi.ts strips the { data: … } envelope and
 * would drop a sibling `meta` — including `unavailable`, which is the
 * "these numbers are incomplete" banner. LUMEN folds it all into `data`.
 */
interface Rollup {
  window_days: number;
  businesses: BusinessRow[];
  by_agent: Array<Omit<AgentCell, "last_run_at" | "failed"> & { businesses: number }>;
  totals: {
    runs: number; failed: number; waiting: number; approved: number;
    declined: number; cost_usd: number; checked?: number; flagged?: number;
  };
  agents: Array<{ agent: string; agent_label: string; product: string; kind?: string }>;
  unavailable: Array<{ agent: string; error: string }>;
  note: string;
}

function usd(n: number | null | undefined): string {
  if (n == null) return "—";
  const v = Number(n);
  return v === 0 ? "$0" : v < 0.01 ? `$${v.toFixed(6)}` : `$${v.toFixed(2)}`;
}

function when(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const WINDOWS = [7, 30, 90];

export default function AgentsAcrossBusinessesPage() {
  const { instance } = useMsal();
  const account = useActiveAccount();
  const [days, setDays] = useState(30);
  const [rollup, setRollup] = useState<Rollup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const r = await lumenGet<Rollup>(instance, account, `/api/v1/il/admin/agents/activity?days=${days}`);
      setRollup(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the agent rollup.");
    } finally {
      setLoading(false);
    }
  }, [instance, account, days]);

  useEffect(() => { void load(); }, [load]);

  const totals = rollup?.totals;
  const byAgent = useMemo(() => rollup?.by_agent ?? [], [rollup]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <Bot className="mt-1 h-5 w-5 text-violet-600" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Agents across businesses</h1>
            <p className="mt-1 text-sm text-slate-500">
              Every ARGUS agent, every business, with what it cost us. Internal — the client-facing
              agent pages never show a cost figure.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded border border-slate-300">
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setDays(w)}
                className={`px-2.5 py-1 text-xs ${days === w ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              >{w}d</button>
            ))}
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />Refresh
          </button>
        </div>
      </header>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {rollup && rollup.unavailable.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />These numbers are incomplete
          </div>
          <ul className="mt-1 space-y-0.5">
            {rollup.unavailable.map((u, i) => <li key={`${u.agent}-${i}`}>{u.agent}: {u.error}</li>)}
          </ul>
        </div>
      )}

      {/* ARGUS pack 1 - the switches and the limits, on a screen instead of in a
          query window. Placed above the numbers because when you need a kill
          switch you are not reading a table first. */}
      <AgentControlsCard onChanged={() => void load()} />

      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          {[
            { label: "Runs", value: String(totals.runs) },
            { label: "Failed runs", value: String(totals.failed) },
            { label: "Waiting on a client", value: String(totals.waiting) },
            { label: "Approved", value: String(totals.approved) },
            { label: `Our cost, ${rollup?.window_days}d`, value: usd(totals.cost_usd) },
            {
              label: "Runs oversight checked",
              value: `${totals.checked ?? 0}${(totals.flagged ?? 0) > 0 ? ` · ${totals.flagged} flagged` : ""}`,
            },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">{c.label}</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{c.value}</div>
            </div>
          ))}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By agent</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">Businesses</th>
                <th className="px-3 py-2 text-right font-medium">Runs</th>
                <th className="px-3 py-2 text-right font-medium">Waiting</th>
                <th className="px-3 py-2 text-right font-medium">Approved</th>
                <th className="px-3 py-2 text-right font-medium">Declined</th>
                <th className="px-3 py-2 text-right font-medium">Our cost</th>
              </tr>
            </thead>
            <tbody>
              {byAgent.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-500">No agent has run in this window.</td></tr>
              )}
              {byAgent.map((a) => (
                <tr key={a.agent} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-800">{a.agent_label}</td>
                  <td className="px-3 py-2 text-slate-500">{a.product}</td>
                  <td className="px-3 py-2 text-right">{a.businesses}</td>
                  {/* The oversight layer runs no cycles of its own and spends
                      nothing. Printing "0 runs / $0" would read as broken; what
                      it actually did is a count of other agents' runs checked. */}
                  {a.kind === "oversight" ? (
                    <td colSpan={5} className="px-3 py-2 text-right text-slate-600">
                      checked {a.checked ?? 0} runs
                      {(a.flagged ?? 0) > 0 ? `, flagged ${a.flagged}` : ", none flagged"}
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right">{a.runs}</td>
                      <td className="px-3 py-2 text-right">{a.waiting}</td>
                      <td className="px-3 py-2 text-right">{a.approved}</td>
                      <td className="px-3 py-2 text-right">{a.declined}</td>
                      <td className="px-3 py-2 text-right font-medium">{usd(a.cost_usd)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By business</h2>
        <div className="space-y-2">
          {(rollup?.businesses ?? []).length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500">
              Nothing has run for anyone in this window.
            </div>
          )}
          {(rollup?.businesses ?? []).map((b) => (
            <details key={b.tenant_id} className="rounded-lg border border-slate-200 bg-white">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-3 py-2">
                {/* PRE-WALK 1: a business whose name we could not resolve
                    rendered as a bare GUID, which reads as data corruption
                    rather than as "we could not name this one". The id is
                    still shown — it is what you search on — but it is never
                    the whole label. */}
                <span className="text-xs font-semibold text-slate-900">
                  {b.business_name || <span className="text-slate-500">Unknown business</span>}
                  <span className="ml-2 font-normal text-slate-400">{b.tenant_id}</span>
                </span>
                <span className="flex gap-4 text-[11px] text-slate-600">
                  <span>{b.runs} runs</span>
                  <span>{b.waiting} waiting</span>
                  <span>{b.approved} approved</span>
                  <span className="font-medium text-slate-900">{usd(b.cost_usd)}</span>
                </span>
              </summary>
              <table className="w-full border-t border-slate-100 text-xs">
                <tbody>
                  {b.agents.map((a) => a.kind === "oversight" ? (
                    <tr key={a.agent} className="border-t border-slate-50">
                      <td className="px-3 py-1.5 text-slate-700">{a.agent_label}</td>
                      <td colSpan={6} className="px-3 py-1.5 text-right text-slate-500">
                        checked {a.checked ?? 0} runs{(a.flagged ?? 0) > 0 ? `, flagged ${a.flagged}` : ", none flagged"}
                        {" \u00b7 last "}{when(a.last_run_at)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-400">no spend</td>
                    </tr>
                  ) : (
                    <tr key={a.agent} className="border-t border-slate-50">
                      <td className="px-3 py-1.5 text-slate-700">{a.agent_label}</td>
                      <td className="px-3 py-1.5 text-right text-slate-500">{a.runs} runs</td>
                      <td className="px-3 py-1.5 text-right text-slate-500">{a.failed} failed</td>
                      <td className="px-3 py-1.5 text-right text-slate-500">{a.waiting} waiting</td>
                      <td className="px-3 py-1.5 text-right text-slate-500">{a.approved} approved</td>
                      <td className="px-3 py-1.5 text-right text-slate-500">{a.declined} declined</td>
                      <td className="px-3 py-1.5 text-right text-slate-500">last {when(a.last_run_at)}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-slate-800">{usd(a.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
        </div>
      </section>

      <AgentCodeProposalsCard />

      {rollup && <p className="text-[11px] text-slate-400">{rollup.note}</p>}
    </div>
  );
}

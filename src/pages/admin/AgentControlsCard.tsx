// pages/admin/AgentControlsCard.tsx — the founder's switches, on a screen.
//
// THREE THINGS THAT COULD ONLY BE DONE IN A QUERY WINDOW
//
//   1. The platform-wide AI spend switch (`argus.platform_config spend_enabled`).
//      Every metering wrapper in every repo reads it fail-closed — only the exact
//      word `true` enables spend — it has been live in production since
//      2026-08-21, and there was no route and no screen. Turning off every AI
//      call on the platform meant writing an UPDATE.
//
//   2. The suite cost ceiling. It had a default of $25/month, a warn ratio and no
//      way to change either. Now that the ceiling actually HALTS runs (ARGUS
//      pack 1), being unable to raise it without SQL would be worse than it not
//      working at all.
//
//   3. Stopping ONE agent across every business. The env kill switches need a
//      deploy; the per-business switch needs opening each business in turn.
//      Neither is a thing to reach for at 22:00.
//
// EVERY WRITE ECHOES THE WORDS BACK. Not a `confirm: true` boolean — a `confirm`
// FLAG is one stray body field away from no confirmation at all, and two of these
// three stop work across the whole platform. The server rejects a wrong or
// missing phrase with 428 and tells you the phrase; this card types it for you and
// still makes you press twice.
//
// AN UNREADABLE SWITCH IS NEVER RENDERED AS "OFF". On production today the argus
// grant gap (S-6) is the likeliest reason for anything here to be unreadable, and
// a founder screen that says "spend is off" when the truth is "we are not allowed
// to look" is worse than an error.
import { useCallback, useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { AlertTriangle, Ban, DollarSign, Power, ShieldAlert } from "lucide-react";
import { useActiveAccount } from "../../auth/useAccessToken";
import { lumenGet, lumenPost, lumenPut } from "../../lib/lumenApi";

interface SpendSwitch {
  table: string | null;
  enabled: boolean | null;
  raw?: string | null;
  present?: boolean;
  updated_by?: string | null;
  updated_at?: string | null;
  unavailable?: string;
  note?: string;
}

interface CeilingRow {
  tenant_id: string;
  suite_monthly_ceiling_usd: number | null;
  warn_ratio: number;
  per_agent_ceiling_usd: number | null;
  enforced: boolean;
  breached_at: string | null;
  breached_reason: string | null;
  spend_usd: number;
  calls: number;
  window_days: number;
  verdict: string;
  ratio: number | null;
  halts_runs: boolean;
}

interface AgentEnablement {
  agent: string;
  label: string;
  product: string;
  on_count: number;
  off_count: number;
  total: number;
}

interface Controls {
  window_days: number;
  spend_switch: SpendSwitch;
  ceilings: CeilingRow[];
  agents: AgentEnablement[];
  confirm_words: { SPEND_OFF: string; SPEND_ON: string; STOP_AGENT: string };
  unavailable: Array<{ source?: string; agent?: string; error: string }>;
}

const usd = (n: number | null | undefined) => {
  if (n == null) return "—";
  const v = Number(n);
  return v === 0 ? "$0" : v < 0.01 ? `$${v.toFixed(6)}` : `$${v.toFixed(2)}`;
};

const VERDICT_TONE: Record<string, string> = {
  ok: "text-emerald-700",
  warn: "text-amber-700",
  breached: "text-rose-700",
  no_ceiling_configured: "text-slate-500",
  not_enforced: "text-slate-500",
  ceiling_unreadable: "text-rose-700",
};

const VERDICT_WORDS: Record<string, string> = {
  ok: "within its limit",
  warn: "getting close",
  breached: "over the limit — runs are halted",
  no_ceiling_configured: "no limit set",
  not_enforced: "limit switched off — capping nothing",
  ceiling_unreadable: "could not be checked",
};

export function AgentControlsCard({ onChanged }: { onChanged?: () => void }) {
  const { instance } = useMsal();
  const account = useActiveAccount();
  const [c, setC] = useState<Controls | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const r = await lumenGet<Controls>(instance, account, "/api/v1/il/admin/agents/controls");
      setC(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the agent controls.");
    } finally {
      setLoading(false);
    }
  }, [instance, account]);

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setNotice(null);
    setError(null);
    try {
      setNotice(await fn());
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  const toggleSpend = (enable: boolean) => {
    if (!c) return;
    const phrase = enable ? c.confirm_words.SPEND_ON : c.confirm_words.SPEND_OFF;
    const typed = window.prompt(
      enable
        ? `This lets every AI feature on the platform spend again.\n\nType exactly:\n${phrase}`
        : `This stops EVERY AI call on the whole platform, for every business, immediately — agents, the Responder, Design Studio, all of it.\n\nType exactly:\n${phrase}`,
    );
    if (typed == null) return;
    void run("spend", async () => {
      await lumenPut(instance, account!, "/api/v1/il/admin/agents/controls/spend", { enabled: enable, confirm: typed });
      return enable ? "AI spend is allowed again." : "AI spend is stopped platform-wide.";
    });
  };

  const saveCeiling = (row: CeilingRow) => {
    const raw = edit[row.tenant_id];
    if (raw == null) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) { setError("That is not a number of dollars."); return; }
    void run(`ceiling-${row.tenant_id}`, async () => {
      await lumenPut(instance, account!, "/api/v1/il/admin/agents/controls/ceiling", {
        tenant_id: row.tenant_id, suite_monthly_ceiling_usd: n,
      });
      setEdit((e) => { const next = { ...e }; delete next[row.tenant_id]; return next; });
      return `Limit set to ${usd(n)} a month. Raising it also clears the "over the limit" mark.`;
    });
  };

  const setEnforced = (row: CeilingRow, enforced: boolean) =>
    run(`enforce-${row.tenant_id}`, async () => {
      await lumenPut(instance, account!, "/api/v1/il/admin/agents/controls/ceiling", {
        tenant_id: row.tenant_id, enforced,
      });
      return enforced ? "The limit will stop runs again." : "The limit is switched off — it is now caps nothing.";
    });

  const stopAgent = (a: AgentEnablement) => {
    if (!c) return;
    const typed = window.prompt(
      `This switches "${a.label}" off for all ${a.on_count} business(es) that have it on.\n\n`
      + `Turning it back on is per business, on that business's own Agents page — there is no start-everywhere button, on purpose.\n\n`
      + `Type exactly:\n${c.confirm_words.STOP_AGENT}`,
    );
    if (typed == null) return;
    void run(`stop-${a.agent}`, async () => {
      const r = await lumenPost<{ switched_off: number }>(instance, account!, "/api/v1/il/admin/agents/controls/stop", {
        agent: a.agent, confirm: typed,
      });
      return `${a.label} switched off for ${r.switched_off} business(es).`;
    });
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-300 bg-white p-4">
      <header className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600" />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Kill switches and spending limits</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Internal. Every change here takes effect for real businesses immediately, and every one of
            them asks you to type the words.
          </p>
        </div>
      </header>

      {error && <div className="rounded border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900">{error}</div>}
      {notice && <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700">{notice}</div>}
      {loading && !c && <div className="text-xs text-slate-500">Loading…</div>}

      {c && c.unavailable.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />Some of this could not be read
          </div>
          <ul className="mt-1 space-y-0.5">
            {c.unavailable.map((u, i) => (
              <li key={i}>{u.source || u.agent}: {u.error}</li>
            ))}
          </ul>
          <p className="mt-1">
            Nothing above should be read as "switched off" — a permission we do not have and a
            switch that is off look identical from here, and they are not the same thing.
          </p>
        </div>
      )}

      {/* 1. THE BIG ONE */}
      {c && (
        <div className="rounded border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <Power className={`mt-0.5 h-4 w-4 ${c.spend_switch.enabled === true ? "text-emerald-600" : c.spend_switch.enabled === false ? "text-rose-600" : "text-amber-600"}`} />
              <div>
                <div className="text-xs font-semibold text-slate-900">AI spend, platform-wide</div>
                <div className="text-[11px] text-slate-600">
                  {c.spend_switch.enabled === true
                    ? "Allowed. Every AI feature can spend."
                    : c.spend_switch.enabled === false
                      ? "Stopped. No AI call anywhere can spend."
                      : "UNKNOWN — we could not read the switch. Do not assume either answer."}
                </div>
                {c.spend_switch.note && <div className="mt-0.5 text-[11px] text-slate-400">{c.spend_switch.note}</div>}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toggleSpend(false)}
                disabled={busy === "spend" || c.spend_switch.enabled === false}
                className="inline-flex items-center gap-1 rounded border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
              ><Ban className="h-3 w-3" />Stop all AI spend</button>
              <button
                type="button"
                onClick={() => toggleSpend(true)}
                disabled={busy === "spend" || c.spend_switch.enabled === true}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >Allow it again</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. PER-BUSINESS CEILINGS */}
      {c && (
        <div className="rounded border border-slate-200">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <DollarSign className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-900">
              Monthly spending limit per business
            </span>
            <span className="text-[11px] text-slate-500">
              Over the limit now STOPS runs. It used to be a number on a report.
            </span>
          </div>
          {c.ceilings.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500">
              No business has a limit row yet. One is created for every business that has an agent.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Business</th>
                  <th className="px-3 py-1.5 text-right font-medium">Spent, {c.window_days}d</th>
                  <th className="px-3 py-1.5 text-right font-medium">Limit</th>
                  <th className="px-3 py-1.5 font-medium">Where it stands</th>
                  <th className="px-3 py-1.5 text-right font-medium">Set a new limit</th>
                </tr>
              </thead>
              <tbody>
                {c.ceilings.map((row) => (
                  <tr key={row.tenant_id} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-mono text-[11px] text-slate-600">{row.tenant_id}</td>
                    <td className="px-3 py-1.5 text-right">{usd(row.spend_usd)}
                      <span className="ml-1 text-slate-400">({row.calls})</span>
                    </td>
                    <td className="px-3 py-1.5 text-right">{usd(row.suite_monthly_ceiling_usd)}</td>
                    <td className={`px-3 py-1.5 ${VERDICT_TONE[row.verdict] || "text-slate-600"}`}>
                      {VERDICT_WORDS[row.verdict] || row.verdict}
                      {row.ratio != null && <span className="ml-1 text-slate-400">{Math.round(row.ratio * 100)}%</span>}
                      {row.breached_at && <div className="text-[11px] text-slate-500">since {new Date(row.breached_at).toLocaleString()}</div>}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="text"
                          value={edit[row.tenant_id] ?? ""}
                          placeholder={String(row.suite_monthly_ceiling_usd ?? "25")}
                          onChange={(e) => setEdit((p) => ({ ...p, [row.tenant_id]: e.target.value }))}
                          className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={() => saveCeiling(row)}
                          disabled={busy === `ceiling-${row.tenant_id}` || edit[row.tenant_id] == null || edit[row.tenant_id] === ""}
                          className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 disabled:opacity-40"
                        >Save</button>
                        <button
                          type="button"
                          onClick={() => void setEnforced(row, !row.enforced)}
                          disabled={busy === `enforce-${row.tenant_id}`}
                          className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 disabled:opacity-40"
                          title={row.enforced ? "Stop this limit from halting runs" : "Let this limit halt runs again"}
                        >{row.enforced ? "Enforcing" : "Off"}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 3. ONE AGENT, EVERYWHERE */}
      {c && c.agents.length > 0 && (
        <div className="rounded border border-slate-200">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-900">
            Switch one agent off for every business
          </div>
          <ul>
            {c.agents.map((a) => (
              <li key={a.agent} className="flex items-center justify-between gap-3 border-t border-slate-50 px-3 py-1.5 first:border-t-0">
                <span className="text-xs text-slate-800">
                  {a.label} <span className="text-slate-400">({a.product})</span>
                </span>
                <span className="flex items-center gap-3 text-[11px] text-slate-600">
                  <span>{a.on_count} on · {a.off_count} off</span>
                  <button
                    type="button"
                    onClick={() => stopAgent(a)}
                    disabled={busy === `stop-${a.agent}` || a.on_count === 0}
                    className="rounded border border-rose-300 bg-white px-2 py-0.5 font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                  >Stop everywhere</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default AgentControlsCard;

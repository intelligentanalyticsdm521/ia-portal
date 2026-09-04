// pages/admin/IlLearningPage.tsx — IL-1, the founder's Intelligence Layer card.
//
// One question, answered on one page: **can we trust the model yet, and what is
// it costing us?**
//
// Read-only. The two buttons re-run work the platform already does on its own
// schedule (recompute the gate; retrain from the log). Nothing on this page can
// change a label, and no label anywhere executes anything — L4.
//
// Route: /app/admin/il-learning (RequireFounderRoute; LUMEN 403s non-founders
// independently — the server gate is the one that matters).
//
// TERMINOLOGY (`reference_intelligence_layer_terminology`): this is the
// Intelligence Layer. No vendor and no external model is named anywhere on the
// page — the second opinion is "the judge", which is what it is.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Brain, RefreshCw, GraduationCap, ShieldCheck, ShieldAlert, Target, Scale, Coins } from "lucide-react";
import { useActiveAccount } from "../../auth/useAccessToken";
import {
  getIlGate, getIlDecisions, recomputeIlGate, trainIlModel,
  getIlLearning, getIlOutcomeSummary, syncIlOutcomes,
  type IlGateSummary, type IlDecisionRow,
  type IlLearningSummary, type IlOutcomeSummary, type IlWeightSet,
} from "../../lib/ilApi";

function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${Number(n).toFixed(1)}%`;
}
function usd(n: number | null | undefined): string {
  return n == null ? "—" : `$${Number(n).toFixed(4)}`;
}
function short(id: string): string {
  return id ? id.slice(0, 8) : "—";
}
/** A 0-1 rate as a percentage, or an em dash. */
function rate(n: number | null | undefined): string {
  return n == null ? "—" : `${(Number(n) * 100).toFixed(0)}%`;
}
function money(n: number | null | undefined): string {
  return `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** The four dimensions, in the order they are scored. */
const DIMENSION_ORDER: Array<keyof IlWeightSet> = [
  "contactAccessibility", "businessHealth", "findability", "enrichmentDepth",
];

const STATUS_COPY: Record<string, { label: string; tone: string; blurb: string }> = {
  shadow: {
    label: "Proving itself",
    tone: "bg-amber-50 text-amber-800 border-amber-200",
    blurb: "Every decision is checked. The model's answer is logged; the checked answer is the one shown.",
  },
  live: {
    label: "Trusted",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
    blurb: "Cleared the gate. One decision in twenty is still checked, and any business it reads badly stays fully checked.",
  },
  off: {
    label: "Checking off",
    tone: "bg-slate-100 text-slate-600 border-slate-200",
    blurb: "No second opinion is being taken for this model.",
  },
};

export default function IlLearningPage() {
  const { instance } = useMsal();
  const account = useActiveAccount();

  const [gate, setGate] = useState<IlGateSummary | null>(null);
  const [decisions, setDecisions] = useState<IlDecisionRow[]>([]);
  const [learning, setLearning] = useState<IlLearningSummary | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [outcomes, setOutcomes] = useState<IlOutcomeSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const [g, d, l] = await Promise.all([
        getIlGate(instance, account),
        getIlDecisions(instance, account, { limit: 50 }),
        getIlLearning(instance, account),
      ]);
      setGate(g);
      setDecisions(Array.isArray(d) ? d : []);
      setLearning(l);
      // Default to the business with the most finished leads — the only one
      // whose numbers mean anything on a page you have just opened.
      setPicked((cur) => cur || l?.outcomes?.[0]?.tenant_id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the Intelligence Layer summary.");
    } finally {
      setLoading(false);
    }
  }, [instance, account]);

  useEffect(() => { void load(); }, [load]);

  // The per-business outcomes table. A second fetch on purpose: it is driven by
  // the picker, and re-fetching the whole page every time the founder changes
  // business would be three calls for one table.
  useEffect(() => {
    let cancelled = false;
    if (!account || !picked) { setOutcomes(null); return () => { cancelled = true; }; }
    getIlOutcomeSummary(instance, account, picked)
      .then((r) => { if (!cancelled) setOutcomes(r); })
      .catch(() => { if (!cancelled) setOutcomes(null); });
    return () => { cancelled = true; };
  }, [instance, account, picked]);

  const run = async (name: string, fn: () => Promise<string>) => {
    setBusy(name);
    setNotice(null);
    setError(null);
    try {
      setNotice(await fn());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${name} failed.`);
    } finally {
      setBusy(null);
    }
  };

  const th = gate?.thresholds;

  // The judging bill so far this month, straight from the log.
  const monthCost = useMemo(
    () => (gate?.spend_this_month || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0),
    [gate]
  );
  const monthJudged = useMemo(
    () => (gate?.spend_this_month || []).reduce((s, r) => s + Number(r.judged || 0), 0),
    [gate]
  );
  const monthDecisions = useMemo(
    () => (gate?.spend_this_month || []).reduce((s, r) => s + Number(r.decisions || 0), 0),
    [gate]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <section className="rounded-lg border bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-100 p-2 text-indigo-800">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Intelligence Layer</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Can we trust the model yet, and what is it costing us? Read-only — nothing here changes a
              decision, and no label ever acts on its own.
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => void load()}
              disabled={loading || busy != null}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button
              onClick={() => run("recompute", async () => {
                await recomputeIlGate(instance, account!);
                return "Agreement recomputed for every model.";
              })}
              disabled={loading || busy != null}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {busy === "recompute" ? "Recomputing…" : "Recompute the gate"}
            </button>
            <button
              onClick={() => run("train", async () => {
                const r = await trainIlModel(instance, account!, {});
                if (r.trained) {
                  return `Retrained on ${r.from_log} checked decisions plus the ${r.from_seed}-line starter set — version ${r.version}, ${pct((r.holdout_accuracy ?? 0) * 100)} on held-out messages. It starts over at full checking.`;
                }
                return r.reason || "Nothing to retrain on yet.";
              })}
              disabled={loading || busy != null}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <GraduationCap className="h-3.5 w-3.5" />
              {busy === "train" ? "Training…" : "Retrain from the log"}
            </button>
            <button
              onClick={() => run("outcomes", async () => {
                const r = await syncIlOutcomes(instance, account!, {});
                const cal = r.calibration;
                return `Rolled up ${r.sync.snapshotted} new leads and ${r.sync.events_merged} results. `
                  + (cal
                    ? `${cal.platform.verdict.explain} ${cal.promoted} business${cal.promoted === 1 ? "" : "es"} scoring on their own numbers.`
                    : "Calibration was not re-run.");
              })}
              disabled={loading || busy != null}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <Target className="h-3.5 w-3.5" />
              {busy === "outcomes" ? "Rolling up…" : "Roll up results"}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>
      )}

      {/* ── this month, in three numbers ───────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Decisions this month" value={monthDecisions.toLocaleString()} sub="Every tier is logged — logging is free." />
        <Stat label="Checked by the judge" value={monthJudged.toLocaleString()} sub={monthDecisions ? `${((monthJudged / monthDecisions) * 100).toFixed(0)}% of decisions` : "—"} />
        <Stat label="Cost of checking" value={`$${monthCost.toFixed(2)}`} sub="Platform cost. No client is billed for it." />
      </section>

      {/* ── models ─────────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white">
        <header className="flex items-baseline gap-3 border-b px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Models</h2>
          {th && (
            <span className="text-xs text-gray-500">
              A model goes live at {th.platform_agreement_pct}% agreement over its last {th.window} checked
              decisions, across every business. After that, one in {Math.round(1 / th.sample_rate)} is still checked.
            </span>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
                {["Model", "Version", "Status", "Agreement", "Checked", "Decisions", "Held-out accuracy", "Trained"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(gate?.models || []).map((m) => {
                const s = STATUS_COPY[m.status] || STATUS_COPY.off;
                return (
                  <tr key={m.model_id} className="border-t align-top">
                    <td className="px-4 py-2 font-medium capitalize">{m.kind.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-600">{m.model_version}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${s.tone}`}>{s.label}</span>
                      <div className="mt-1 max-w-xs text-xs text-gray-500">{s.blurb}</div>
                    </td>
                    <td className="px-4 py-2 font-semibold">
                      {m.agreement_pct == null
                        ? <span className="font-normal text-gray-400" title={`Fewer than ${th?.window ?? 200} checked decisions so far`}>not enough yet</span>
                        : pct(m.agreement_pct)}
                    </td>
                    <td className="px-4 py-2">{m.judged_seen?.toLocaleString?.() ?? m.judged_seen}</td>
                    <td className="px-4 py-2">{m.decisions_seen?.toLocaleString?.() ?? m.decisions_seen}</td>
                    <td className="px-4 py-2">{m.holdout_acc == null ? "—" : pct(Number(m.holdout_acc) * 100)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-500">
                      {m.trained_at ? new Date(m.trained_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                );
              })}
              {!gate?.models?.length && !loading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                  No model has been seeded yet. It seeds itself the first time the platform makes a decision.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── per business ───────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white">
        <header className="flex items-baseline gap-3 border-b px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">By business</h2>
          {th && (
            <span className="text-xs text-gray-500">
              A business below {th.tenant_min_pct}% agreement — or with fewer than {th.tenant_min_judged} checked
              decisions — stays fully checked no matter how well the model is doing everywhere else.
            </span>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
                {["Business", "Model", "Agreement", "Decisions", "Checked", "Checking", "Budget used"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(gate?.tenants || []).map((t) => {
                const full = t.mode === "100pct_llm";
                const budget = Number(t.budget_usd || 0);
                const spent = Number(t.spent_usd || 0);
                const spentPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
                return (
                  <tr key={`${t.tenant_id}:${t.kind}`} className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">{short(t.tenant_id)}</td>
                    <td className="px-4 py-2 capitalize">{t.kind.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2">
                      {t.agreement_pct == null
                        ? <span className="text-gray-400">not enough yet</span>
                        : <span className={Number(t.agreement_pct) < (th?.tenant_min_pct ?? 90) ? "font-semibold text-amber-700" : ""}>{pct(t.agreement_pct)}</span>}
                    </td>
                    <td className="px-4 py-2">{t.decisions}</td>
                    <td className="px-4 py-2">{t.judged}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${full ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                        {full ? <ShieldAlert className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                        {full ? "Every decision" : "1 in 20"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {budget > 0 ? (
                        <div className="min-w-[120px]">
                          <div className="text-xs text-gray-600">${spent.toFixed(3)} of ${budget.toFixed(2)} {t.budget_month ? `· ${t.budget_month}` : ""}</div>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                            <div className={`h-1.5 rounded-full ${spentPct >= 100 ? "bg-red-500" : "bg-indigo-400"}`} style={{ width: `${spentPct}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">no checking budget (Lite)</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!gate?.tenants?.length && !loading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No business has been through an IL decision yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── weights ────────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white">
        <header className="flex items-baseline gap-3 border-b px-5 py-3">
          <Scale className="h-4 w-4 shrink-0 text-slate-500" />
          <h2 className="text-sm font-semibold text-gray-900">Scoring weights, fitted from real results</h2>
          {learning?.thresholds && (
            <span className="text-xs text-gray-500">
              The score is 100 points across four things. Once a business has {learning.thresholds.tenant_min_outcomes} finished
              leads we re-share those 100 points according to which of them actually became jobs for them — never below{" "}
              {learning.thresholds.min_weight} or above {learning.thresholds.max_weight} for any one of them, and never until the
              prediction has been checked against what happened.
            </span>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
                {["Business", "Version", "Using it?", "Finished leads", "Became jobs", "Points shared out", "Why"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(learning?.weights || []).map((w) => {
                const live = w.status === "live";
                const caps = learning?.platform_caps;
                return (
                  <tr key={w.weights_id} className="border-t align-top">
                    <td className="px-4 py-2 font-mono text-xs">{short(w.tenant_id)}</td>
                    <td className="px-4 py-2 tabular-nums">v{w.version}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${live
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                        {live ? "Scoring with it" : "Fitted, not used yet"}
                      </span>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{w.outcomes_seen}</td>
                    <td className="px-4 py-2 tabular-nums">{w.conversions}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {DIMENSION_ORDER.map((d) => {
                          const fitted = w.weights?.[d];
                          const cap = caps?.[d];
                          const moved = fitted != null && cap != null && fitted !== cap;
                          const prior = w.priors?.[d];
                          return (
                            <span
                              key={d}
                              title={`${learning?.dimension_labels?.[d] || d}${prior
                                ? ` — ${prior.successes} of ${prior.n} became jobs (everyone else: ${rate(prior.platform_rate)})${prior.shrunk ? "; too few to stand on its own yet, so it is blended with everyone else's" : ""}`
                                : ""}`}
                              className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${moved ? "bg-indigo-50 text-indigo-800" : "bg-slate-100 text-slate-600"}`}
                            >
                              {(learning?.dimension_labels?.[d] || d).split(" ").slice(0, 3).join(" ")}: {fitted ?? "—"}
                              {moved ? ` (was ${cap})` : ""}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="max-w-xs px-4 py-2 text-xs text-gray-600">
                      {w.gate?.business?.explain || (w.fitted_at ? "Fitted; not checked against results yet." : "—")}
                    </td>
                  </tr>
                );
              })}
              {!learning?.weights?.length && !loading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                  No business has enough finished leads to fit its own weights. Everyone is scored on the standard points.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── calibration ────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white">
        <header className="flex items-baseline gap-3 border-b px-5 py-3">
          <Target className="h-4 w-4 shrink-0 text-slate-500" />
          <h2 className="text-sm font-semibold text-gray-900">Calibration — we said Hot. Did Hot convert?</h2>
          {learning?.thresholds && (
            <span className="text-xs text-gray-500">
              Predicted from every scored lead that arrived before the last {learning.thresholds.calibration_period_days} days;
              measured against what the leads inside those {learning.thresholds.calibration_period_days} days actually did. Two
              different sets of leads on purpose — a prediction checked against the leads that made it is not a check.
              Everyone&rsquo;s bands must land within {learning.thresholds.platform_max_error_pts} points, and one business within{" "}
              {learning.thresholds.tenant_max_error_pts}, before it is scored on its own numbers.
            </span>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
                {["Scope", "Band", "We predicted", "They actually did", "Out by", "Leads measured"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(learning?.calibration || []).map((c) => {
                const limit = c.scope === "platform"
                  ? (learning?.thresholds.platform_max_error_pts ?? 10)
                  : (learning?.thresholds.tenant_max_error_pts ?? 15);
                const thin = c.n < (learning?.thresholds.band_min_n ?? 5);
                const off = c.error_pts != null && c.error_pts > limit;
                return (
                  <tr key={`${c.scope}:${c.tenant_id || "all"}:${c.band}`} className="border-t">
                    <td className="px-4 py-2 text-xs">
                      {c.scope === "platform"
                        ? <span className="font-medium text-slate-800">Everyone</span>
                        : <span className="font-mono">{short(c.tenant_id || "")}</span>}
                    </td>
                    <td className="px-4 py-2 capitalize">{c.band}</td>
                    <td className="px-4 py-2 tabular-nums">{rate(c.predicted_rate)}</td>
                    <td className="px-4 py-2 tabular-nums">{rate(c.observed_rate)}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {c.error_pts == null
                        ? <span className="text-gray-400">—</span>
                        : thin
                          ? <span className="text-gray-400" title={`Fewer than ${learning?.thresholds.band_min_n} leads — too few to hold anyone to`}>{c.error_pts} pts (too few)</span>
                          : <span className={off ? "font-semibold text-amber-700" : "text-emerald-700"}>{c.error_pts} pts</span>}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{c.n}</td>
                  </tr>
                );
              })}
              {!learning?.calibration?.length && !loading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nothing measured yet. Calibration needs leads that arrived, were scored, and then either became jobs or did
                  not — it cannot be back-filled from history, because the score on an old lead is not the score it arrived with.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── results by arrival band ────────────────────────────────────── */}
      <section className="rounded-lg border bg-white">
        <header className="flex flex-wrap items-baseline gap-3 border-b px-5 py-3">
          <Coins className="h-4 w-4 shrink-0 text-slate-500" />
          <h2 className="text-sm font-semibold text-gray-900">What happened to the leads</h2>
          <span className="text-xs text-gray-500">
            By the band the lead arrived in, not the band it is in now. Money is money actually collected — paid invoices only,
            never a quote total.
          </span>
          <label className="ml-auto flex items-center gap-2 text-xs text-gray-600">
            Business
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs"
            >
              {(learning?.outcomes || []).map((o) => (
                <option key={o.tenant_id} value={o.tenant_id}>{short(o.tenant_id)} · {o.leads} leads</option>
              ))}
              {!learning?.outcomes?.length && <option value="">none yet</option>}
            </select>
          </label>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
                {["Arrived as", "Leads", "Became jobs", "Rate", "Quotes accepted", "Jobs done", "Invoices paid", "Repeat visits", "Money collected"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(outcomes?.bands || []).map((b) => (
                <tr key={b.band} className="border-t">
                  <td className="px-4 py-2 font-medium capitalize">{b.band}</td>
                  <td className="px-4 py-2 tabular-nums">{b.leads}</td>
                  <td className="px-4 py-2 tabular-nums">{b.converted}</td>
                  <td className="px-4 py-2 tabular-nums">{rate(b.conversion_rate)}</td>
                  <td className="px-4 py-2 tabular-nums">{b.quotes_accepted}</td>
                  <td className="px-4 py-2 tabular-nums">{b.jobs_completed}</td>
                  <td className="px-4 py-2 tabular-nums">{b.invoices_paid}</td>
                  <td className="px-4 py-2 tabular-nums">{b.return_visits}</td>
                  <td className="px-4 py-2 tabular-nums">{money(b.money_collected)}</td>
                </tr>
              ))}
              {outcomes && (
                <tr className="border-t bg-slate-50 font-medium">
                  <td className="px-4 py-2">All</td>
                  <td className="px-4 py-2 tabular-nums">{outcomes.totals.leads}</td>
                  <td className="px-4 py-2 tabular-nums">{outcomes.totals.converted}</td>
                  <td className="px-4 py-2 tabular-nums">{rate(outcomes.totals.conversion_rate)}</td>
                  <td className="px-4 py-2" colSpan={3} />
                  <td className="px-4 py-2 tabular-nums">{outcomes.totals.return_visits}</td>
                  <td className="px-4 py-2 tabular-nums">{money(outcomes.totals.money_collected)}</td>
                </tr>
              )}
              {!outcomes?.bands?.length && !loading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                  No results rolled up for this business yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {outcomes && (
          <div className="border-t px-5 py-2 text-xs text-gray-500">
            A lead counts as having become a job when a quote was accepted or a job completed within{" "}
            {outcomes.conversion_window_days} days of it arriving. Money can land months later and is counted whenever it does.
          </div>
        )}
      </section>

      {/* ── the log ────────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white">
        <header className="flex items-baseline gap-3 border-b px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Latest decisions</h2>
          <span className="text-xs text-gray-500">
            What was written is kept to the first 200 characters, on purpose — this is a decision log, not a copy of anyone's inbox.
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
                {["When", "Business", "Subject", "Model said", "Judge said", "Used", "Agreed", "Cost", "What they wrote"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {decisions.map((d) => (
                <tr key={d.decision_id} className="border-t align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-500">{new Date(d.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono text-xs">{short(d.tenant_id)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs">{d.subject_kind} {d.subject_id}</td>
                  <td className="px-4 py-2">
                    <div className="whitespace-nowrap">{d.model_label.replace(/_/g, " ")}</div>
                    <div className="text-xs text-gray-500">{d.model_confidence == null ? "" : `${(Number(d.model_confidence) * 100).toFixed(0)}% sure`}</div>
                  </td>
                  <td className="px-4 py-2">
                    {d.llm_label
                      ? <div className="whitespace-nowrap">{d.llm_label.replace(/_/g, " ")}</div>
                      : <span className="text-xs text-gray-400">{d.judged_by.replace(/^model_?/, "") || "not checked"}</span>}
                    {d.llm_reason && <div className="max-w-xs text-xs text-gray-500">{d.llm_reason}</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-medium">{d.final_label.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2">
                    {d.agreed == null ? <span className="text-gray-300">—</span>
                      : d.agreed ? <span className="text-emerald-700">yes</span>
                      : <span className="font-medium text-amber-700">no</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-500">{Number(d.cost_usd || 0) === 0 ? "—" : usd(d.cost_usd)}</td>
                  <td className="max-w-sm px-4 py-2 text-xs text-gray-600">{d.input_excerpt || "—"}</td>
                </tr>
              ))}
              {!decisions.length && !loading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">Nothing has been decided yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

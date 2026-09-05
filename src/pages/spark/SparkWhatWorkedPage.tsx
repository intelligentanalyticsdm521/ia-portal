// SparkWhatWorkedPage — "One report a month: which source produced paid jobs,
// what each lead cost, which campaign got a reply." (SALES_PLAYBOOK §3 row 5.)
//
// Two halves and nothing else:
//   1. WHAT HAPPENED — each finding is one plain sentence, and the numbers
//      behind it are one click away. The evidence is the trust mechanism: a
//      client who cannot see where a figure came from stops believing the next
//      one (IL_LEARNING_ARCHITECTURE §3, "explainability is mandatory").
//   2. WHAT TO DO NEXT — 2-4 plain steps and ONE link. Done and Dismiss record
//      what the owner decided; neither makes the platform do anything (L4,
//      locked, even on Authority). There is no Apply button here and there
//      must never be one.
//
// TIER: the server strips what this business may not see and says WHICH gate
// applied. Hot / Warm / Cold is Pro (`lead_intelligence`); the paragraph is
// Standard (`narrative_available`). Two reasons, two sentences, never one
// "locked" — and each one is a visible upgrade line rather than a hidden
// section, because a hidden report cannot sell an upgrade.
//
// VOCABULARY: "your business", never "tenant". "Inquiries", "quotes", "jobs".

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, ChevronRight, Loader2, Lock, RefreshCw, X } from "lucide-react";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { useLumenApi } from "../../hooks/useLumenApi";
import {
  IL_FINDINGS_PATHS,
  FINDING_KIND_LABEL,
  labelForEvidenceKey,
  formatEvidenceValue,
  type IlFinding,
  type IlFindingPeriod,
  type IlFindingsReport,
  type IlPlaybook,
} from "../../lib/ilFindingsApi";

/** The order the report reads in: money, then cost, then response, then rules. */
const KIND_ORDER = [
  "source_roi", "lead_cost", "time_to_first_reply", "channel_reply",
  "campaign_reply", "rule_effect", "conversion_by_band",
];

/**
 * Why the month has no written-up paragraph, in the owner's words. Never the
 * engine's status string, and never silence: a report that quietly drops its
 * first paragraph is a report the reader assumes is broken.
 */
function narrativeAbsenceLine(status: string | null): string {
  switch (status) {
    case "no_findings":
      return "There was not enough in the month to write up. The numbers below are everything we could measure.";
    case "budget_spent":
    case "budget_unreadable":
      return "The written summary was not produced this month. The numbers below are unaffected.";
    case "rejected_unverified_number":
    case "rejected_too_long":
    case "unparseable":
      return "The written summary did not pass our own check, so it was not shown. Every figure on this page is still yours to read — the check exists so nothing on it is unverified.";
    case "disabled":
    case "not_configured":
      return "The written summary is switched off at the moment. The numbers below are unaffected.";
    default:
      return "The written summary could not be produced this month. The numbers below are unaffected.";
  }
}

function orderOf(kind: string) {
  const i = KIND_ORDER.indexOf(kind);
  return i < 0 ? KIND_ORDER.length : i;
}

/** One row of evidence. Arrays of objects render as a small table; everything
 *  else as a label and a value. Nothing is hidden — if the engine stored it,
 *  the owner can see it. */
function EvidenceValue({ k, value }: { k: string; value: unknown }) {
  if (Array.isArray(value) && value.length && typeof value[0] === "object" && value[0] !== null) {
    const rows = value as Record<string, unknown>[];
    const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              {cols.map((c) => <th key={c} className="py-1 pr-4 font-medium">{labelForEvidenceKey(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 text-slate-800">
                {cols.map((c) => (
                  <th key={c} scope="row" className="py-1 pr-4 text-left font-normal tabular-nums">
                    {formatEvidenceValue(c, r[c])}
                  </th>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <span className="tabular-nums text-slate-800">{formatEvidenceValue(k, value)}</span>;
}

function FindingRow({ finding }: { finding: IlFinding }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(finding.evidence || {});
  return (
    <li className="border-b border-slate-100 last:border-b-0">
      <div className="px-4 py-3">
        <div className="text-sm font-semibold text-slate-900">{finding.title_plain}</div>
        <p className="mt-0.5 text-sm text-slate-600">{finding.body_plain}</p>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {open ? "Hide the numbers" : "Where this came from"}
          </button>
        )}
        {open && (
          <dl className="mt-2 space-y-1.5 rounded border border-slate-200 bg-slate-50 p-3">
            {entries.map(([k, v]) => (
              <div key={k} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-3">
                <dt className="text-xs font-medium text-slate-500">{labelForEvidenceKey(k)}</dt>
                <dd className="text-xs"><EvidenceValue k={k} value={v} /></dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </li>
  );
}

function PlaybookRow({
  play, busy, onDecide,
}: {
  play: IlPlaybook;
  busy: boolean;
  onDecide: (id: number, verb: "done" | "dismiss") => void;
}) {
  return (
    <li className="border-b border-amber-100 px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{play.title}</div>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5">
            {play.steps.map((s, i) => (
              <li key={i} className="text-sm text-slate-700">{s}</li>
            ))}
          </ol>
          <Link
            to={play.action_url}
            className="mt-2 inline-block text-xs font-semibold text-indigo-700 underline hover:text-indigo-900"
          >
            {play.action_label}
          </Link>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            title="Done"
            onClick={() => onDecide(play.playbook_id, "done")}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Done
          </button>
          <button
            type="button"
            title="Dismiss"
            onClick={() => onDecide(play.playbook_id, "dismiss")}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="h-3 w-3" />
            Dismiss
          </button>
        </div>
      </div>
    </li>
  );
}

export function SparkWhatWorkedPage() {
  const { get, post, ready } = useLumenApi();
  const [period, setPeriod] = useState<string | null>(null);
  const [periods, setPeriods] = useState<IlFindingPeriod[]>([]);
  const [report, setReport] = useState<IlFindingsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [r, p] = await Promise.all([
        get<IlFindingsReport>(IL_FINDINGS_PATHS.report(period || undefined)),
        get<IlFindingPeriod[]>(IL_FINDINGS_PATHS.periods),
      ]);
      setReport(r);
      setPeriods(Array.isArray(p) ? p : []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready, period]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (id: number, verb: "done" | "dismiss") => {
    setBusy(id);
    try {
      await post(verb === "done" ? IL_FINDINGS_PATHS.playbookDone(id) : IL_FINDINGS_PATHS.playbookDismiss(id), {});
      setReport((cur) => (cur
        ? { ...cur, playbooks: cur.playbooks.map((p) => (p.playbook_id === id ? { ...p, status: verb === "done" ? "done" : "dismissed" } : p)) }
        : cur));
    } catch {
      await load();
    } finally {
      setBusy(null);
    }
  };

  const refresh = async () => {
    setRunning(true);
    try {
      await post(IL_FINDINGS_PATHS.run, period ? { period } : {});
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setRunning(false);
    }
  };

  // PRE-WALK 1: the August report on the fixture business drew ONE section of
  // the seven and said nothing at all about the other six. The data was
  // honestly thin — but a report that promises "which source produced paid
  // jobs, what each lead cost, which campaign got a reply" and then shows one
  // card reads as broken software rather than as a quiet month.
  //
  // Every section is drawn now. One with rows shows them; one without shows
  // what it is waiting for, in the server's words (`coverage`), because the
  // server is the only thing that knows the thresholds. A section this plan
  // does not include says THAT instead — a different reason, a different
  // sentence (`reference_nav_visibility_semantics`).
  const grouped = useMemo(() => {
    const list = [...(report?.findings || [])].sort(
      (a, b) => orderOf(a.kind) - orderOf(b.kind) || a.finding_id - b.finding_id
    );
    const rowsByKind = new Map<string, IlFinding[]>();
    for (const f of list) {
      const arr = rowsByKind.get(f.kind);
      if (arr) arr.push(f);
      else rowsByKind.set(f.kind, [f]);
    }
    const coverage = report?.coverage;
    const kinds = coverage?.length
      ? coverage.map((c) => c.kind)
      : [...rowsByKind.keys()].sort((a, b) => orderOf(a) - orderOf(b));
    const waiting = new Map((coverage || []).map((c) => [c.kind, c]));
    const out: {
      kind: string; label: string; rows: IlFinding[];
      waitingFor: string | null; gated: string | null;
    }[] = [];
    for (const kind of kinds) {
      const c = waiting.get(kind);
      out.push({
        kind,
        label: FINDING_KIND_LABEL[kind] || "Also worth knowing",
        rows: rowsByKind.get(kind) || [],
        waitingFor: c?.waiting_for ?? null,
        gated: c?.gated ?? null,
      });
    }
    // Anything stored under a kind the server did not list still gets shown.
    for (const kind of rowsByKind.keys()) {
      if (!out.some((g) => g.kind === kind)) {
        out.push({
          kind, label: FINDING_KIND_LABEL[kind] || "Also worth knowing",
          rows: rowsByKind.get(kind) || [], waitingFor: null, gated: null,
        });
      }
    }
    return out;
  }, [report]);

  const openPlays = (report?.playbooks || []).filter((p) => p.status === "open");

  return (
    <SparkPageShell
      title="What worked"
      subtitle={report ? report.label : "Your month, in plain numbers"}
      help="One report a month: where the work came from, what each lead cost, and what got a response. Every number can be opened to show the figures behind it. Nothing on this page does anything on its own."
      loading={loading}
      error={error}
      actions={
        <div className="flex items-center gap-2">
          {periods.length > 1 && (
            <select
              aria-label="Month"
              value={period || report?.period || ""}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
            >
              {periods.map((p) => (
                <option key={p.period} value={p.period.trim()}>{p.period.trim()}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Bring it up to date
          </button>
        </div>
      }
    >
      {report && (report.empty || !report.findings.length) ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          <p className="font-medium text-slate-900">Nothing to report for {report.label} yet.</p>
          <p className="mt-1">
            This report is produced on the 1st of each month from the inquiries, quotes and paid work of the
            month before. Once your business has a month behind it, this is where it lands.
          </p>
        </div>
      ) : report ? (
        <div className="space-y-5">
          {report.narrative && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-[15px] leading-relaxed text-slate-800">{report.narrative}</p>
              <p className="mt-2 text-[11px] text-slate-400">
                Powered by ARGUS AI. Every figure above is checked against the numbers below before it is shown.
              </p>
            </div>
          )}

          {/* PRE-WALK 1: the paragraph was simply absent, with nothing to say
              it had been tried. A month whose write-up could not be produced
              says so — the numbers below are unaffected, and that is the part
              that matters. */}
          {report.narrative_available && !report.narrative && report.run && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {narrativeAbsenceLine(report.run.narrative_status)}
            </div>
          )}

          {!report.narrative_available && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <Lock className="mr-1.5 -mt-0.5 inline h-3.5 w-3.5 text-slate-400" />
              The month written up as a paragraph comes with Standard. The numbers below are yours on every plan.
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">What happened</h2>
              <p className="text-xs text-slate-500">Open any line to see the figures behind it.</p>
            </div>
            {grouped.map((g) => (
              <div key={g.kind}>
                <div className="bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {g.label}
                </div>
                {g.rows.length > 0 ? (
                  <ul>{g.rows.map((f) => <FindingRow key={f.finding_id} finding={f} />)}</ul>
                ) : (
                  <p className="px-4 py-2.5 text-xs text-slate-500">
                    {g.gated === "pro"
                      ? "Comes with Pro."
                      : (g.waitingFor || "Nothing to measure here this month.")}
                  </p>
                )}
              </div>
            ))}
          </div>

          {!report.lead_intelligence && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <Lock className="mr-1.5 -mt-0.5 inline h-3.5 w-3.5 text-slate-400" />
              Whether the Hot / Warm / Cold ranking is earning its keep comes with Pro.
            </div>
          )}

          {openPlays.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50">
              <div className="border-b border-amber-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">What to do next</h2>
                <p className="text-xs text-slate-600">
                  Nothing here happens on its own. Each one opens the screen where you can do it.
                </p>
              </div>
              <ul>
                {openPlays.map((p) => (
                  <PlaybookRow key={p.playbook_id} play={p} busy={busy === p.playbook_id} onDecide={decide} />
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </SparkPageShell>
  );
}

export default SparkWhatWorkedPage;

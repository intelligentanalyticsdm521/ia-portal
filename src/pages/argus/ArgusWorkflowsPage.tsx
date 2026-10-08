// ArgusWorkflowsPage — ARGUS → Workflows.
//
// Contract CONTRACT_ARGUS_CHAT_PLAYBOOKS_2026-10-07 §F.2. Replaces (and the
// replace means the old file is DELETED) ArgusWorkflowAutomationsPage.
//
// Every process that runs for the business in one list: what starts it,
// whether it runs on its own or waits for the owner, and what it did. Today the
// only kind is the website chat (trigger "Chat message"); the list is built
// from GET /argus/workflows so a new kind is a new row, not a new page.
//
//   All       — one row per workflow: mode (Automatic / Send me first), on/off,
//               last ran, runs this month. A row opens its steps read-only
//               (the same tree as SPARK → Lead sources); paths are switched
//               on or off THERE, where the chat is set up.
//   Needs you — held steps (Send it now / Don't send) and chat messages ARGUS
//               could not place (Reply now opens the lead's Conversation tab
//               right here; Save for when you edit the chat; Ignore). The tree
//               only learns from what the owner approves.
//   History   — what each step did, with the report link when there is one.
//   Set-up runs — the founder's onboarding observe view (moved unchanged).
//
// ARGUS → Your team (contract ARGUS employees phase 1 §F.4) widened two tabs:
//   All       also one row per switched-on job (GET /me/team/jobs?enabled=1):
//             its name, when it runs, "Made by: your web person", the same mode
//             control and On switch as the employee page (both write PUT
//             /me/team/jobs/:key — one row, no second copy), and Open.
//   Needs you also every waiting item from ARION, SPARK and OLIVER (each
//             product's own ?waiting=1, Promise.allSettled), with a chip per
//             employee. A source that failed says so in its own line.
// A business without SPARK reads "The website chat comes with SPARK." where the
// chat would be — it no longer hides the jobs or the other Needs-you sources.
//
// Data: one load on mount (workflows + needs-you + the switched-on jobs
// together); History, the trees and Set-up runs load on their first open. No
// polling (convention_data_fetching).
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight, CheckCircle2, MessageSquare, X } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useIsFounder } from "../../hooks/useIsFounder";
import { useTeamApi } from "../../hooks/useTeam";
import { useNeedsYou } from "../../hooks/useNeedsYou";
import { JobControls } from "../../components/argus/team/JobRow";
import { NeedsYouList } from "../../components/argus/team/NeedsYouList";
import {
  EMPLOYEE_KEYS, employeeRoute, madeByWords, teamLoadWords,
  type EmployeeKey, type JobView,
} from "../../lib/team";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { SparkLeadModal } from "../../components/spark/SparkLeadModal";
import { ChatWorkflowSteps } from "../../components/spark/ChatWorkflowTree";
import { OnboardingObservePanel } from "../../components/argus/OnboardingObservePanel";
import {
  ADD_TO_CHAT_LABEL, ADD_TO_CHAT_WORDS, CHAT_WF, LEAD_SOURCES_ROUTE, NO_SPARK_WORDS,
  buildDisplayTree, enabledChangedWords, heldSentence, historyCursor, historyLine, intentLine,
  isPackageRefusal, loadFailedWords, mergeHistory, modeChangedWords, openResultWords, refusalSentences,
  relativeTime, workflowGate, workflowsTabFrom,
  type ArgusWorkflowRow, type ChatPlaybookRow, type ChatWorkflowMode, type NeedsYouItem,
  type WorkflowHistoryRow, type WorkflowsTab as Tab,
} from "../../lib/chatWorkflows";

/** A refusal, in its own colour, right where it happened — never the green notice. */
function Refusal({ lines }: { lines: string[] | undefined }) {
  if (!lines || !lines.length) return null;
  return (
    <div className="mt-2 flex items-start gap-1.5 rounded bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800 ring-1 ring-rose-200" role="alert">
      <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
      <span>{lines.join(" ")}</span>
    </div>
  );
}

const itemKey = (i: NeedsYouItem) => (i.kind === "held" ? `held:${i.run_id}` : `unmatched:${i.unmatched_id}`);

export function ArgusWorkflowsPage() {
  const { get, post, put, ready } = useSparkApi();
  const team = useTeamApi();
  const needs = useNeedsYou(["arion", "spark", "oliver"]);
  const isFounder = useIsFounder();
  const [params, setParams] = useSearchParams();
  const tab = workflowsTabFrom(params.get("tab"), isFounder);
  const setTab = (t: Tab) => setParams(t === "all" ? {} : { tab: t }, { replace: true });
  // Needs you → the employee chip, kept in the URL (?from=web).
  const fromParam = params.get("from");
  const picked: EmployeeKey | null = (EMPLOYEE_KEYS as readonly string[]).includes(fromParam || "") ? (fromParam as EmployeeKey) : null;
  const pick = (k: EmployeeKey | null) => setParams(k ? { tab: "needs-you", from: k } : { tab: "needs-you" }, { replace: true });

  // The switched-on jobs (ARGUS → Your team), one row each on All.
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const [workflows, setWorkflows] = useState<ArgusWorkflowRow[]>([]);
  const [needsYou, setNeedsYou] = useState<NeedsYouItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [noSpark, setNoSpark] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // notice = what a click did, said in green. Refusals never go here: they
  // sit on their own row in rose (rowError, rowWords) or in pageAlert.
  const [notice, setNotice] = useState<string | null>(null);
  const [pageAlert, setPageAlert] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rowWords, setRowWords] = useState<Record<string, { ok: boolean; lines: string[] }>>({});

  // the read-only trees, loaded the first time a row is opened
  const [open, setOpen] = useState<string | null>(null);
  const [trees, setTrees] = useState<ChatPlaybookRow[] | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const treesAsked = useRef(false);

  // History, loaded the first time its tab opens
  const [history, setHistory] = useState<WorkflowHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyMore, setHistoryMore] = useState(false);
  const historyAsked = useRef(false);
  const historyRows = useRef<WorkflowHistoryRow[]>([]);
  // The server's own cursor for "Show older", when it sends one.
  const historyNext = useRef<string | null>(null);

  // Reply now → the lead's own modal, on its Conversation tab, on this page
  const [replyLead, setReplyLead] = useState<number | null>(null);

  const loadNeedsYou = useCallback(async () => {
    const r = await get<{ data: NeedsYouItem[] }>(CHAT_WF.needsYou);
    setNeedsYou(r.data || []);
  }, [get]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      setNoSpark(false);
      try {
        const [wf, ny] = await Promise.all([
          get<{ data: ArgusWorkflowRow[]; meta?: { needs_you_total?: number } }>(CHAT_WF.workflows),
          get<{ data: NeedsYouItem[] }>(CHAT_WF.needsYou),
        ]);
        if (cancelled) return;
        setWorkflows(wf.data || []);
        setNeedsYou(ny.data || []);
      } catch (err) {
        if (cancelled) return;
        if (isPackageRefusal(err)) setNoSpark(true);
        else setLoadError(refusalSentences(err).join(" "));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, get]);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    setJobsError(null);
    try {
      const r = await team.jobsOn();
      setJobs(r.jobs || []);
    } catch (err) {
      setJobsError(`We couldn't load your team's jobs. ${teamLoadWords(err)}`);
    } finally {
      setJobsLoading(false);
    }
  }, [team]);

  useEffect(() => {
    if (!team.ready) return;
    void loadJobs();
  }, [team.ready, loadJobs]);

  const replaceJob = (next: JobView) => setJobs((list) => list.map((j) => (j.job_key === next.job_key ? next : j)));

  const loadHistory = useCallback(async (older: boolean) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const before = older ? historyCursor(historyRows.current, historyNext.current) : null;
      const r = await get<{ data: WorkflowHistoryRow[]; meta?: { next?: string | null } }>(CHAT_WF.history(before));
      const rows = r.data || [];
      historyNext.current = r.meta?.next ?? null;
      const merged = mergeHistory(older ? historyRows.current : [], rows);
      historyRows.current = merged.rows;
      setHistory(merged.rows);
      // A full page that added nothing new means there is nothing older to show.
      setHistoryMore(rows.length >= 50 && merged.added > 0);
    } catch (err) {
      setHistoryError(refusalSentences(err).join(" "));
      // The first load failed: opening the tab again (or Try again) asks again.
      if (!older) historyAsked.current = false;
    } finally {
      setHistoryLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (!ready || tab !== "history" || historyAsked.current) return;
    historyAsked.current = true;
    void loadHistory(false);
  }, [ready, tab, loadHistory]);

  async function openRow(id: string) {
    setOpen((o) => (o === id ? null : id));
    if (treesAsked.current) return;
    treesAsked.current = true;
    setTreeError(null);
    try {
      const r = await get<{ data: ChatPlaybookRow[] }>(CHAT_WF.playbooks);
      setTrees(r.data || []);
    } catch (err) {
      setTreeError(refusalSentences(err).join(" "));
      treesAsked.current = false;
    }
  }

  async function setMode(w: ArgusWorkflowRow, mode: ChatWorkflowMode) {
    setBusy(`mode:${w.workflow_id}`);
    setRowError((e) => ({ ...e, [w.workflow_id]: [] }));
    try {
      await put(CHAT_WF.workflow(w.workflow_id), { mode });
      setWorkflows((list) => list.map((x) => (x.workflow_id === w.workflow_id ? { ...x, mode } : x)));
      setNotice(modeChangedWords(w.name, mode));
    } catch (err) {
      setRowError((e) => ({ ...e, [w.workflow_id]: refusalSentences(err) }));
    } finally {
      setBusy(null);
    }
  }

  async function setEnabled(w: ArgusWorkflowRow, enabled: boolean) {
    setBusy(`on:${w.workflow_id}`);
    setRowError((e) => ({ ...e, [w.workflow_id]: [] }));
    try {
      await put(CHAT_WF.workflow(w.workflow_id), { enabled });
      setWorkflows((list) => list.map((x) => (x.workflow_id === w.workflow_id ? { ...x, enabled } : x)));
      setNotice(enabledChangedWords(w.name, enabled));
    } catch (err) {
      setRowError((e) => ({ ...e, [w.workflow_id]: refusalSentences(err) }));
    } finally {
      setBusy(null);
    }
  }

  /** One Needs-you button. On success the row leaves the list with its sentence shown in the notice. */
  async function decide(item: NeedsYouItem, path: string, done: string) {
    const key = itemKey(item);
    setBusy(key);
    setRowWords((w) => ({ ...w, [key]: { ok: true, lines: [] } }));
    try {
      const r = await post<{ ok?: boolean; words?: string; plain?: string }>(path, {});
      const words = r?.words || r?.plain || done;
      setNeedsYou((list) => list.filter((x) => itemKey(x) !== key));
      setNotice(words);
    } catch (err) {
      setRowWords((w) => ({ ...w, [key]: { ok: false, lines: refusalSentences(err) } }));
    } finally {
      setBusy(null);
    }
  }

  // The tab count is the sum: the chat's items and every employee's.
  const needsCount = needsYou.length + needs.rows.length;
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "all", label: "All" },
    { key: "needs-you", label: `Needs you (${needsCount})` },
    { key: "history", label: "History" },
    ...(isFounder ? [{ key: "setup" as Tab, label: "Set-up runs" }] : []),
  ];

  return (
    <OliverPageWrapper
      title="Workflows"
      subtitle="What runs for your business, whether it runs on its own or waits for you, and what it did."
      loading={false}
      error={null}
    >
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg border px-3.5 py-1.5 text-[13px] font-semibold ${tab === t.key
              ? "border-[#1A3A4A] bg-[#1A3A4A] text-white"
              : "border-slate-300 bg-white text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900 ring-1 ring-emerald-200" role="status">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="flex-1">{notice}</div>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-emerald-700"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {pageAlert && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-2.5 text-xs text-rose-800 ring-1 ring-rose-200" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="flex-1">{pageAlert}</div>
          <button type="button" onClick={() => setPageAlert(null)} aria-label="Dismiss" className="text-rose-700"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {tab === "setup" && isFounder && <OnboardingObservePanel />}

      {tab !== "setup" && loading && <div className="p-6 text-sm text-slate-500">Loading…</div>}
      {tab !== "setup" && !loading && noSpark && (
        <div className="mb-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">{NO_SPARK_WORDS}</div>
      )}
      {tab !== "setup" && !loading && loadError && (
        <div className="mb-3 rounded-lg bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
          {loadFailedWords([loadError])}
        </div>
      )}

      {!loading && tab === "all" && (
        <div className="mb-3 space-y-3">
          {jobsError && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-4 py-2.5 text-xs text-rose-800 ring-1 ring-rose-200" role="alert">
              <span className="flex-1">{jobsError}</span>
              <button type="button" onClick={() => void loadJobs()} className="rounded border border-rose-300 px-2 py-0.5 font-semibold">Try again</button>
            </div>
          )}
          {jobs.map((j) => (
            <div key={j.job_key} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="block truncate text-[15px] font-bold text-slate-900">{j.display_name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-800 ring-1 ring-sky-200">
                      {j.trigger_words}
                    </span>
                    <span>· {madeByWords(j.employee_key)}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <JobControls job={j} onChanged={replaceJob} onNotice={setNotice} />
                  <Link to={employeeRoute(j.employee_key, "jobs")} className="text-xs font-semibold text-slate-700 underline">Open</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !noSpark && !loadError && tab === "all" && (
        <div className="space-y-3">
          {workflows.length === 0 && jobs.length === 0 && !jobsLoading && (
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">
              No workflows yet. A website chat workflow appears here once it is set up for your website, and a job appears here once you switch it on in ARGUS → Your team.
            </div>
          )}
          {workflows.map((w) => {
            const isOpen = open === w.workflow_id;
            const ran = relativeTime(w.last_ran_at);
            const pb = trees?.find((t) => t.playbook_id === w.workflow_id) || null;
            const tree = pb ? buildDisplayTree(pb.tree, { owner: pb.owner_display }) : null;
            const gate = workflowGate(w);
            return (
              <div key={w.workflow_id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => void openRow(w.workflow_id)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 items-center gap-2 text-left"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-500" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-500" />}
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-bold text-slate-900">{w.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-800 ring-1 ring-sky-200">
                          <MessageSquare className="h-3 w-3" />{w.trigger?.label || "Chat message"}
                        </span>
                        {w.site_label && <span>on {w.site_label}</span>}
                        <span>· {ran ? `Last ran ${ran}` : "Hasn't run yet"}</span>
                        <span>· {w.runs_this_month} this month</span>
                        {w.needs_you_count > 0 && <span className="font-semibold text-amber-800">· {w.needs_you_count} need you</span>}
                      </span>
                    </span>
                  </button>
                  {!gate.controls ? (
                    <p className="max-w-xs text-xs text-slate-600">{gate.words}</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-slate-700">
                        <span className="font-semibold">Runs</span>
                        <select
                          value={w.mode}
                          disabled={busy === `mode:${w.workflow_id}`}
                          onChange={(e) => void setMode(w, e.target.value as ChatWorkflowMode)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs"
                          aria-label={`How ${w.name} runs`}
                        >
                          <option value="automatic">Automatic</option>
                          <option value="review">Send me first</option>
                        </select>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={w.enabled}
                          disabled={busy === `on:${w.workflow_id}`}
                          onChange={(e) => void setEnabled(w, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300"
                          aria-label={`${w.name} on`}
                        />
                        {w.enabled ? "On" : "Off"}
                      </label>
                    </div>
                  )}
                </div>
                <Refusal lines={rowError[w.workflow_id]} />
                {isOpen && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {treeError && <p className="text-xs text-rose-700" role="alert">We couldn&rsquo;t load its steps: {treeError} Close it and open it again to retry.</p>}
                    {!treeError && !trees && <p className="text-xs text-slate-500">Loading its steps…</p>}
                    {tree && (
                      <div className="space-y-3">
                        {tree.services.map((s) => (
                          <div key={s.key}>
                            <div className="text-xs font-bold text-slate-900">{s.label}</div>
                            {s.intro.length > 0 && <div className="mt-1"><ChatWorkflowSteps steps={s.intro} /></div>}
                            <ul className="mt-1 space-y-2">
                              {s.paths.map((p) => (
                                <li key={p.key} className="rounded bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                                  <div className={`text-[11px] font-semibold ${p.enabled ? "text-slate-800" : "text-slate-400 line-through"}`}>
                                    {p.label}{p.enabled ? "" : " (off)"}
                                  </div>
                                  <div className="mt-1"><ChatWorkflowSteps steps={p.steps} /></div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                        {tree.shared.length > 0 && (
                          <div>
                            <div className="text-xs font-bold text-slate-900">Used by every service</div>
                            <ul className="mt-1 space-y-2">
                              {tree.shared.map((p) => (
                                <li key={p.key} className="rounded bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                                  <div className={`text-[11px] font-semibold ${p.enabled ? "text-slate-800" : "text-slate-400 line-through"}`}>
                                    {p.label}{p.enabled ? "" : " (off)"}
                                  </div>
                                  <div className="mt-1"><ChatWorkflowSteps steps={p.steps} /></div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    {trees && !pb && <p className="text-xs text-slate-500">This workflow has no steps to show.</p>}
                    <Link to={LEAD_SOURCES_ROUTE} className="mt-3 inline-block text-xs font-semibold text-slate-700 underline">
                      Switch paths on or off in SPARK → Lead sources
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && tab === "needs-you" && (
        <div className="mb-3">
          <NeedsYouList
            rows={needs.rows}
            failures={needs.failures}
            loading={needs.loading}
            onDecide={needs.decide}
            onRetry={() => void needs.reload()}
            jobNames={Object.fromEntries(jobs.map((j) => [j.job_key, j.display_name]))}
            chips={{ picked, onPick: pick }}
            emptyWords={picked
              ? "Nothing from them needs you right now."
              : needsYou.length > 0 ? "Nothing from your team needs you right now." : "Nothing needs you right now."}
          />
        </div>
      )}

      {!loading && !noSpark && !loadError && tab === "needs-you" && !picked && (
        <div className="space-y-3">
          {needsYou.map((item) => {
            const key = itemKey(item);
            const words = rowWords[key];
            const rowBusy = busy === key;
            if (item.kind === "held") {
              const since = relativeTime(item.waiting_since);
              return (
                <div key={key} className="rounded-xl bg-white p-4 ring-1 ring-amber-200">
                  <div className="text-sm font-semibold text-slate-900">{heldSentence(item)}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {item.workflow_name}{since ? ` · waiting since ${since}` : ""}
                  </div>
                  {item.summary_plain && <p className="mt-1 text-xs text-slate-700">{item.summary_plain}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={() => void decide(item, CHAT_WF.approve(item.run_id), "Sent on its way. You'll see what it did under History.")}
                      className="rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Send it now
                    </button>
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={() => void decide(item, CHAT_WF.skip(item.run_id), "Not sent. The visitor's details stay on the lead.")}
                      className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                    >
                      Don&rsquo;t send
                    </button>
                  </div>
                  {words && words.lines.length > 0 && (
                    <p className={`mt-2 text-xs ${words.ok ? "text-emerald-800" : "text-rose-700"}`} role="alert">{words.lines.join(" ")}</p>
                  )}
                </div>
              );
            }
            const looks = intentLine(item.intent_words, item.sure);
            const at = relativeTime(item.at);
            return (
              <div key={key} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <div className="text-sm text-slate-900">&ldquo;{item.text}&rdquo;</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                  {looks && <span>{looks}</span>}
                  {at && <span>· {at}</span>}
                  {item.reason === "hold" && (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-800 ring-1 ring-rose-200">
                      Complaint, refund or legal — answer it yourself
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.lead_id != null && (
                    <button
                      type="button"
                      onClick={() => setReplyLead(item.lead_id)}
                      className="rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Reply now
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={rowBusy}
                    onClick={() => void decide(item, CHAT_WF.addToChat(item.unmatched_id), ADD_TO_CHAT_WORDS)}
                    className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                  >
                    {ADD_TO_CHAT_LABEL}
                  </button>
                  <button
                    type="button"
                    disabled={rowBusy}
                    onClick={() => void decide(item, CHAT_WF.ignore(item.unmatched_id), "Ignored. It won't show here again.")}
                    className="text-xs font-semibold text-slate-500 underline disabled:opacity-40"
                  >
                    Ignore
                  </button>
                </div>
                {item.lead_id == null && (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    They haven&rsquo;t left an email or number yet, so there&rsquo;s no one to reply to. ARGUS asks for one in the chat.
                  </p>
                )}
                {words && words.lines.length > 0 && (
                  <p className={`mt-2 text-xs ${words.ok ? "text-emerald-800" : "text-rose-700"}`} role="alert">{words.lines.join(" ")}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && !noSpark && !loadError && tab === "history" && (
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          {historyError && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-rose-700" role="alert">
              <span>We couldn&rsquo;t load the history: {historyError}</span>
              <button
                type="button"
                disabled={historyLoading}
                onClick={() => { historyAsked.current = true; void loadHistory(history.length > 0); }}
                className="rounded border border-rose-300 px-2 py-0.5 font-semibold text-rose-800 disabled:opacity-40"
              >
                Try again
              </button>
            </div>
          )}
          {!historyError && historyLoading && history.length === 0 && <p className="text-sm text-slate-500">Loading…</p>}
          {!historyError && !historyLoading && history.length === 0 && (
            <p className="text-sm text-slate-600">Nothing has run yet.</p>
          )}
          {history.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {history.map((h) => (
                <li key={h.run_id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{historyLine(h)}</div>
                    <div className="text-[11px] text-slate-500">
                      {h.workflow_name}{h.visitor_name ? ` · ${h.visitor_name}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    {h.file_url && (
                      <a href={h.file_url} target="_blank" rel="noopener" className="font-semibold text-sky-700 underline">{openResultWords(h.result_label)}</a>
                    )}
                    <span>{h.at ? new Date(h.at).toLocaleString() : ""}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {historyMore && (
            <button
              type="button"
              disabled={historyLoading}
              onClick={() => void loadHistory(true)}
              className="mt-3 rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
            >
              {historyLoading ? "Loading…" : "Show older"}
            </button>
          )}
        </div>
      )}

      <SparkLeadModal
        leadId={replyLead}
        open={replyLead != null}
        initialTab="conversation"
        onClose={() => {
          setReplyLead(null);
          // The server marks the message replied when the owner answers (§C.11);
          // one read of the list shows it gone.
          void loadNeedsYou().catch((err) => setPageAlert(`We couldn't refresh Needs you: ${refusalSentences(err).join(" ")}`));
        }}
      />
    </OliverPageWrapper>
  );
}

export default ArgusWorkflowsPage;

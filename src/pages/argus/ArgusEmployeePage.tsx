// ArgusEmployeePage — ARGUS → Your team → {the web person | the marketer | the
// office administrator} (contract CONTRACT_ARGUS_EMPLOYEES_PHASE1_2026-10-08 §F.2).
//
// One page per employee, the same page for all three (service keys
// argus_team_web / argus_team_marketer / argus_team_office). It replaced, and
// deleted, the three per-product Agents pages: the work an employee does lives
// with the employee, not in three Settings menus.
//
//   Today       What I did (the last 7 days of runs) and What needs you (the
//               count and the first three, each opening Needs you)
//   Needs you   the cards, this employee only (their product's own activity
//               endpoint, ?waiting=1; each button calls that product's route)
//   Jobs        one row per job: the On switch (or the words when there is none),
//               Automatic / Send me first (or why not), Last did, {n} need you,
//               the stopped-itself line, Run it now, and what it is waiting
//               for you to tell it. A job's name opens its drawer (?job=).
//   History     every run of this employee's jobs, newest first
//   What I know the Business Brief answers its live jobs read, set or not set,
//               each linked to its box on Your business; for the web person also
//               what it has learned about your writing
//
// The switch and the mode write ONE row (PUT /me/team/jobs/:key on
// platform-api) — the same row ARGUS → Workflows writes. The office
// administrator's jobs are doors onto the switches OLIVER already has
// (components/argus/team/doors.ts).
//
// Data: one load on arrival (the employee and its jobs, its runs, its product's
// settings, and the waiting items together); What I know's learned-voice and a
// job's changes load on their first open. No polling (convention_data_fetching).
//
// Back sits top left (convention_back_button_top_left) and pops one level: a
// job's drawer closes, otherwise it goes to ARGUS → Workflows. Tabs and the open
// job are in the URL, so the browser's Back does the same.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronLeft, X } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useIsFounder } from "../../hooks/useIsFounder";
import { useArionTeam, useTeamApi } from "../../hooks/useTeam";
import { useNeedsYou } from "../../hooks/useNeedsYou";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { AgentRunHistoryPanel } from "../../components/agents/AgentRunHistoryPanel";
import { NameBlockDialog } from "../../builder/NameBlockDialog";
import { JobRow, type DoorView } from "../../components/argus/team/JobRow";
import { JobDrawer } from "../../components/argus/team/JobDrawer";
import { NeedsYouList } from "../../components/argus/team/NeedsYouList";
import { LearnedVoice } from "../../components/argus/team/LearnedVoice";
import { doorReads, doorState, doorWrite, type DoorRule, type DoorRuleRun } from "../../components/argus/team/doors";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import type { ArionLearnedVoice } from "../../lib/arionApi";
import type { AgentRunRow, AgentRunsPayload, AgentSettingsResponse } from "../../components/agents/types";
import {
  EMPLOYEE_NAME, EMPLOYEE_SOURCE, EMPLOYEE_TABS, PLAN_PRICING_ROUTE, RUNS_PATHS, YourEmployee,
  AGENT_JOBS, belongsTo, briefFieldRoute, employeeOfRow, employeeTabFrom, haltedLine, knowFields,
  lastRunByJob, needCountWords, notOnTeamWords, productNotOwnedWords, relativeTime, runNowCall,
  runResultWords, teamLoadWords, knownJobKeys, waitingByJob, whatIDid, yourEmployee,
  type EmployeeKey, type EmployeeTab, type JobView, type TeamEmployee,
} from "../../lib/team";

const WORKFLOWS_ROUTE = "/app/services/argus_workflows";

/** The keyword source, in words — the founder's knob, never a vendor's name. */
const KEYWORD_SOURCES: Array<{ value: string; label: string }> = [
  { value: "auto", label: "Pick for me" },
  { value: "se_ranking", label: "Our paid keyword tool" },
  { value: "rankmath", label: "The website's own search plugin" },
  { value: "none", label: "No keyword tool" },
];

export function ArgusEmployeePage({ employeeKey }: { employeeKey: EmployeeKey }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = employeeTabFrom(params.get("tab"));
  const openJobKey = params.get("job");
  const isFounder = useIsFounder();
  const source = EMPLOYEE_SOURCE[employeeKey];

  const team = useTeamApi();
  const arion = useArionTeam();
  const spark = useSparkApi();
  const oliver = useOliverApi();
  const needs = useNeedsYou([source]);

  const [employee, setEmployee] = useState<TeamEmployee | null>(null);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<AgentRunRow[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AgentSettingsResponse | null>(null);
  const [rule, setRule] = useState<DoorRule | null>(null);
  const [ruleRuns, setRuleRuns] = useState<DoorRuleRun[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pageAlert, setPageAlert] = useState<string | null>(null);
  const [doorBusy, setDoorBusy] = useState<string | null>(null);
  const [doorRefusal, setDoorRefusal] = useState<Record<string, string | null>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [askingBrief, setAskingBrief] = useState<string | null>(null);
  const [voice, setVoice] = useState<ArionLearnedVoice | null>(null);
  const voiceAsked = useRef(false);

  const fns = useRef({ arion, spark, oliver });
  fns.current = { arion, spark, oliver };
  const ready = team.ready && arion.ready && spark.ready && oliver.ready;

  const setTab = (t: EmployeeTab) => setParams(t === "today" ? {} : { tab: t }, { replace: true });
  const openJob = (k: string) => setParams({ tab: "jobs", job: k });
  const closeJob = () => setParams({ tab: "jobs" });
  const back = () => (openJobKey ? closeJob() : navigate(WORKFLOWS_ROUTE));

  /** This product's runs, read with its own client. */
  const loadRuns = useCallback(async () => {
    const { arion: a, spark: sp, oliver: o } = fns.current;
    setRunsError(null);
    try {
      let payload: AgentRunsPayload | null;
      if (source === "arion") payload = await a.runs();
      else if (source === "spark") payload = (await sp.get<{ data: AgentRunsPayload }>(RUNS_PATHS.spark)).data;
      else payload = await o.get<AgentRunsPayload>(RUNS_PATHS.oliver);
      setRuns(payload?.rows || []);
    } catch (err) {
      setRuns([]);
      setRunsError(`We couldn't load what ${yourEmployee(employeeKey)} has done. ${apiErrorMessage(err)}`);
    }
  }, [source, employeeKey]);

  /** The product's own settings: the stopped-itself lines, the founder's knobs and the office doors. */
  const loadSettings = useCallback(async () => {
    const { arion: a, spark: sp, oliver: o } = fns.current;
    try {
      if (source === "arion") setSettings(await a.settings());
      else if (source === "spark") setSettings((await sp.get<{ data: AgentSettingsResponse }>("/api/v1/agents/settings?product=spark")).data);
      else setSettings(await o.get<AgentSettingsResponse>("/agents/settings"));
    } catch {
      // Unknown, not "off": the halted lines and the doors say they could not be read.
      setSettings(null);
    }
  }, [source]);

  const loadRule = useCallback(async (ruleKey: string) => {
    const { oliver: o } = fns.current;
    const [ruleRead, runsRead] = doorReads({ kind: "oliver_rule", rule_key: ruleKey });
    const [r, rr] = await Promise.allSettled([o.get<DoorRule>(ruleRead), o.get<DoorRuleRun[]>(runsRead)]);
    setRule(r.status === "fulfilled" ? r.value : null);
    setRuleRuns(rr.status === "fulfilled" && Array.isArray(rr.value) ? rr.value : null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [emp] = await Promise.all([team.employee(employeeKey), loadRuns(), loadSettings()]);
      setEmployee(emp.employee);
      setJobs(emp.jobs || []);
      const ruleDoor = (emp.jobs || []).find((j) => j.door?.kind === "oliver_rule");
      if (ruleDoor?.door?.rule_key) await loadRule(ruleDoor.door.rule_key);
    } catch (err) {
      setLoadError(teamLoadWords(err));
    } finally {
      setLoading(false);
    }
  }, [team, employeeKey, loadRuns, loadSettings, loadRule]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  // What I know → the web person's learned voice, read the first time the tab opens.
  useEffect(() => {
    if (!ready || tab !== "know" || employeeKey !== "web" || voiceAsked.current) return;
    voiceAsked.current = true;
    fns.current.arion.voice().then(setVoice).catch(() => setVoice(null));
  }, [ready, tab, employeeKey]);

  // When the job list could not be read, the runs and waiting items still show, by the jobs this product runs.
  const jobKeys = useMemo(() => (jobs.length ? jobs.map((j) => j.job_key) : knownJobKeys(employeeKey)), [jobs, employeeKey]);
  const jobNames = useMemo(() => Object.fromEntries(jobs.map((j) => [j.job_key, j.display_name])), [jobs]);
  const myRows = useMemo(() => needs.rows.filter((r) => employeeOfRow(r) === employeeKey), [needs.rows, employeeKey]);
  const myRuns = useMemo(() => (runs || []).filter((r) => belongsTo(r, jobKeys)), [runs, jobKeys]);
  const lastRun = useMemo(() => lastRunByJob(myRuns, jobKeys), [myRuns, jobKeys]);
  const waitingCount = useMemo(() => waitingByJob(myRows, jobKeys), [myRows, jobKeys]);

  const replaceJob = (next: JobView) => setJobs((list) => list.map((j) => (j.job_key === next.job_key ? next : j)));

  /** The stopped-itself line for a job, from its product's settings. */
  const haltedFor = (job: JobView) => {
    const agentKey = Object.keys(AGENT_JOBS).find((k) => AGENT_JOBS[k].includes(job.job_key));
    const agent = settings?.agents?.find((a) => a.key === agentKey);
    if (!agent?.paused) return null;
    const resume = async () => {
      setPageAlert(null);
      try {
        if (source === "arion") setSettings(await fns.current.arion.putSettings({ paused: false }));
        else if (source === "spark") {
          setSettings((await fns.current.spark.put<{ data: AgentSettingsResponse }>("/api/v1/agents/settings", { [agent.key]: { paused: false } })).data);
        } else {
          const w = doorWrite({ kind: "oliver_agent", section: agent.key as "qtc" | "fieldops" }, { resume: true });
          if (w) setSettings(await fns.current.oliver.put<AgentSettingsResponse>(w.path, w.body));
        }
        setNotice(`Started again: ${job.display_name}.`);
      } catch (err) {
        setPageAlert(apiErrorMessage(err));
      }
    };
    // The Responder's own stop lives on its page; its switch-back-on is there.
    return { words: haltedLine(agent.paused_reason, agent.halted_at), onResume: agent.settings_href ? undefined : resume };
  };

  /** A door onto the switch OLIVER already has. */
  const doorFor = (job: JobView): DoorView | null => {
    if (!job.door) return null;
    const door = job.door;
    const state = doorState(door, settings, rule, ruleRuns);
    const writeDoor = async (change: Parameters<typeof doorWrite>[1], done: string) => {
      const w = doorWrite(door, change);
      if (!w) return;
      setDoorBusy(job.job_key);
      setDoorRefusal((r) => ({ ...r, [job.job_key]: null }));
      try {
        if (w.method === "PUT") setSettings(await fns.current.oliver.put<AgentSettingsResponse>(w.path, w.body));
        else setRule(await fns.current.oliver.patch<DoorRule>(w.path, w.body));
        setNotice(done);
      } catch (err) {
        setDoorRefusal((r) => ({ ...r, [job.job_key]: apiErrorMessage(err) }));
      } finally {
        setDoorBusy(null);
      }
    };
    return {
      state,
      busy: doorBusy === job.job_key,
      refusal: doorRefusal[job.job_key] || null,
      onToggle: (enabled) => void writeDoor({ enabled }, enabled ? `Switched on: ${job.display_name}.` : `Switched off: ${job.display_name}.`),
      onKnob: (field, value) => void writeDoor({ knob: { field, value } }, `Saved: ${job.display_name}.`),
    };
  };

  const runNow = async (job: JobView, brief?: string) => {
    const call = runNowCall(job.job_key, brief);
    if (!call) return;
    if (call.asksBrief && !brief) { setAskingBrief(job.job_key); return; }
    setAskingBrief(null);
    setRunning(job.job_key);
    setNotice(null);
    setPageAlert(null);
    try {
      const { arion: a, spark: sp, oliver: o } = fns.current;
      const out = call.source === "arion" ? await a.post(call.path, call.body)
        : call.source === "spark" ? await sp.post<unknown>(call.path, call.body)
          : await o.post<unknown>(call.path, call.body);
      setNotice(runResultWords(out));
      await Promise.all([needs.reload(), loadRuns()]);
    } catch (err) {
      setPageAlert(apiErrorMessage(err));
    } finally {
      setRunning(null);
    }
  };

  const saveFounderKnob = async (patch: Record<string, unknown>) => {
    setPageAlert(null);
    try {
      setSettings(await fns.current.arion.putSettings(patch));
      setNotice("Saved.");
    } catch (err) {
      setPageAlert(apiErrorMessage(err));
    }
  };

  const name = employee?.display_name || EMPLOYEE_NAME[employeeKey];
  const need = needCountWords(myRows.length);
  const notOwned = employee?.product_owned === false;
  const notOnTeam = !notOwned && jobs.some((j) => j.hire_required && !j.on_team);
  const openJobView = openJobKey ? jobs.find((j) => j.job_key === openJobKey) || null : null;
  const contentAgent = settings?.agents?.find((a) => a.key === "content");
  const runsPayload: AgentRunsPayload | null = runs === null ? null : {
    rows: myRuns,
    meta: {
      total: myRuns.length, limit: 50,
      failed: myRuns.filter((r) => r.outcome === "failed").length,
      held: myRuns.filter((r) => r.outcome === "escalated").length,
      halted: myRuns.filter((r) => r.outcome === "halted").length,
      last_run_at: myRuns[0]?.started_at || null,
      degraded: [],
    },
  };
  const did = whatIDid(myRuns);
  const know = knowFields(jobs);

  return (
    <OliverPageWrapper title={name} loading={false} error={null}>
      <div className="mb-3">
        <button type="button" onClick={back} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900">
          <ChevronLeft className="h-3.5 w-3.5" />Back
        </button>
      </div>

      <header className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">{name}</h1>
        {employee?.job_line && <p className="mt-0.5 text-sm text-slate-600">{employee.job_line}</p>}
        {need && (
          <button type="button" onClick={() => setTab("needs-you")} className="mt-1 text-xs font-semibold text-amber-800 underline">{need}</button>
        )}
      </header>

      {notOwned && (
        <div className="mb-3 rounded-lg bg-violet-50 px-4 py-2.5 text-xs text-slate-800 ring-1 ring-violet-200">
          {productNotOwnedWords(employeeKey)}{" "}
          <Link to={PLAN_PRICING_ROUTE} className="font-semibold underline">Plan &amp; Pricing</Link>
        </div>
      )}
      {notOnTeam && (
        <div className="mb-3 rounded-lg bg-slate-50 px-4 py-2.5 text-xs text-slate-700 ring-1 ring-slate-200">{notOnTeamWords(employeeKey)}</div>
      )}

      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {EMPLOYEE_TABS.map((t) => (
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
            {t.key === "needs-you" ? `Needs you (${myRows.length})` : t.label}
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

      {loading && <div className="p-6 text-sm text-slate-500">Loading…</div>}
      {!loading && loadError && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200" role="alert">
          <span className="flex-1">We couldn&rsquo;t load {yourEmployee(employeeKey)}&rsquo;s jobs. {loadError}</span>
          <button type="button" onClick={() => void load()} className="rounded border border-rose-300 px-2 py-0.5 text-xs font-semibold">Try again</button>
        </div>
      )}

      {!loading && tab === "today" && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
            <h2 className="text-sm font-bold text-slate-900">What I did</h2>
            {runsError && <p className="mt-1 text-xs text-rose-700" role="alert">{runsError}</p>}
            {!runsError && did.length === 0 && <p className="mt-1 text-xs text-slate-600">Nothing in the last 7 days.</p>}
            <ul className="mt-2 space-y-1.5">
              {did.map((d) => (
                <li key={d.id} className="flex justify-between gap-2 text-xs">
                  <span className="text-slate-800">{d.words}</span>
                  <span className="flex-shrink-0 text-[11px] text-slate-500">{relativeTime(d.at)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
            <h2 className="text-sm font-bold text-slate-900">What needs you</h2>
            {needs.failures.map((f) => <p key={f.source} className="mt-1 text-xs text-rose-700" role="alert">{f.words}</p>)}
            <p className="mt-1 text-xs text-slate-600">
              {myRows.length === 0 ? "Nothing needs you right now." : `${myRows.length} waiting for you.`}
            </p>
            <ul className="mt-2 space-y-1.5">
              {myRows.slice(0, 3).map((r) => (
                <li key={`${r.agent}:${r.id}`}>
                  <button type="button" onClick={() => setTab("needs-you")} className="text-left text-xs font-semibold text-slate-800 underline">
                    {r.summary}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {!loading && tab === "needs-you" && (
        <NeedsYouList
          rows={myRows}
          failures={needs.failures}
          loading={needs.loading}
          jobNames={jobNames}
          onDecide={needs.decide}
          onRetry={() => void needs.reload()}
        />
      )}

      {!loading && !loadError && tab === "jobs" && (
        <div className="space-y-3">
          {jobs.length === 0 && (
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">No jobs to show yet.</div>
          )}
          {jobs.map((job) => {
            const call = runNowCall(job.job_key);
            return (
              <JobRow
                key={job.job_key}
                job={job}
                onChanged={replaceJob}
                onNotice={setNotice}
                onOpen={() => openJob(job.job_key)}
                lastDidIso={lastRun[job.job_key] || null}
                needCount={waitingCount[job.job_key] || 0}
                halted={haltedFor(job)}
                onRunNow={call ? () => void runNow(job) : null}
                running={running === job.job_key}
                door={doorFor(job)}
              />
            );
          })}

          {employeeKey === "web" && isFounder && contentAgent && (
            <section className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-300">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">For you only (founder)</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="font-medium text-slate-800">What this business pays for it</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">Dollars a month. Left blank, we cannot tell you whether it is earning its keep.</span>
                  <input
                    type="text"
                    defaultValue={contentAgent.settings.price_usd_monthly == null ? "" : String(contentAgent.settings.price_usd_monthly)}
                    placeholder="e.g. 199"
                    onBlur={(e) => void saveFounderKnob({ price_usd_monthly: e.target.value.trim() === "" ? null : e.target.value.trim() })}
                    className="mt-1 w-32 rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                </label>
                <label className="block text-xs">
                  <span className="font-medium text-slate-800">Where its keywords come from</span>
                  <select
                    defaultValue={String(contentAgent.settings.keyword_provider || "auto")}
                    onChange={(e) => void saveFounderKnob({ keyword_provider: e.target.value })}
                    className="mt-1 block rounded border border-slate-300 px-2 py-1 text-xs"
                  >
                    {KEYWORD_SOURCES.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </label>
              </div>
              {contentAgent.margin && <p className="mt-2 text-[11px] text-slate-600">{contentAgent.margin.message}</p>}
            </section>
          )}
        </div>
      )}

      {!loading && tab === "history" && (
        <div className="space-y-2">
          {runsError && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-rose-700" role="alert">
              <span>{runsError}</span>
              <button type="button" onClick={() => void loadRuns()} className="rounded border border-rose-300 px-2 py-0.5 font-semibold">Try again</button>
            </div>
          )}
          <AgentRunHistoryPanel
            runs={runsPayload}
            loading={runs === null}
            defaultOpen
            emptyBody={`${YourEmployee(employeeKey)} hasn't done anything yet. Switch a job on, then press Run it now on the Jobs tab.`}
          />
        </div>
      )}

      {!loading && !loadError && tab === "know" && (
        <div className="space-y-4">
          <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
            <h2 className="text-sm font-bold text-slate-900">What I know about your business</h2>
            <p className="mt-0.5 text-xs text-slate-600">
              I only use what you saved on Your business. Anything we filled in for you is a suggestion until you press Save there.
            </p>
            {know.length === 0 && <p className="mt-2 text-xs text-slate-600">None of my jobs read your business details yet.</p>}
            <ul className="mt-2 divide-y divide-slate-100">
              {know.map((f) => (
                <li key={f.field} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                  <span className="text-slate-800">{f.label}</span>
                  <span className="flex items-center gap-3">
                    <span className={f.set ? "text-emerald-700" : "text-amber-800"}>{f.set ? "Set" : "Not set"}</span>
                    <Link to={briefFieldRoute(f.field)} className="font-semibold underline">Change it</Link>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          {employeeKey === "web" && <LearnedVoice voice={voice} />}
        </div>
      )}

      {openJobView && (
        <JobDrawer
          job={openJobView}
          onClose={closeJob}
          onChanged={replaceJob}
          onNotice={setNotice}
          runs={myRuns.filter((r) => belongsTo(r, [openJobView.job_key]))}
          door={doorFor(openJobView)}
          loadChanges={team.changes}
        />
      )}

      {askingBrief && (
        <NameBlockDialog
          title="What should it be about?"
          intro="One line is enough. It writes the draft from it and leaves it in Needs you for you to read — nothing is sent."
          nameLabel="In one line"
          namePlaceholder="Spring clean-ups, booking from the first week of April"
          askNote={false}
          confirmLabel="Write the draft"
          onSave={(brief) => {
            const job = jobs.find((j) => j.job_key === askingBrief);
            if (job) void runNow(job, brief);
          }}
          onClose={() => setAskingBrief(null)}
        />
      )}
    </OliverPageWrapper>
  );
}

export default ArgusEmployeePage;

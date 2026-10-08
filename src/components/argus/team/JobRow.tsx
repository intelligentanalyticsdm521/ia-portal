// JobRow — one of an employee's jobs on the Jobs tab, and JobControls — the
// job's On switch and its mode, wherever the job's switch is shown
// (contract ARGUS employees phase 1 §F.2, §F.4, §F.5).
//
// JobControls is the ONE control for a team-home job. The Jobs tab, ARGUS →
// Workflows, Settings → The Responder and ARION → My Business → Reviews all
// render it, and it writes PUT /me/team/jobs/:key, so the four places read and
// write the same row. What it shows is decided by lib/team.ts jobRowState:
//   · planned / locked / no switch of its own → the words, no switch
//   · an employee not on the team             → no switch (the page says why once)
//   · can't be switched on (plan)             → the switch is off and locked, with the plan sentence
//   · "always asks" jobs                      → no Automatic, ever (M19)
// The screen shows what the server answered, never an optimistic guess. A
// refusal shows in rose on the row; the green notice is only for what worked.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight, Lock, Play } from "lucide-react";
import { useJobWriter } from "../../../hooks/useTeam";
import {
  briefFieldRoute, canRunNow, jobRowState, lastDidWords, needCountWords, pausedWords, relativeTime, shownMode,
  waitingForBriefWords, type JobMode, type JobView,
} from "../../../lib/team";
import type { DoorKnob, DoorRowView, DoorState } from "./doors";

function GateLink({ line }: { line: { words: string; link?: { label: string; to: string } } }) {
  return (
    <span>
      {line.words}
      {line.link && (
        <> <Link to={line.link.to} className="font-semibold underline">{line.link.label}</Link></>
      )}
    </span>
  );
}

/** On, but doing nothing (JobView.problem): the server's sentence, in rose, never a quiet "On". */
export function ProblemLine({ words }: { words: string }) {
  return (
    <div className="flex max-w-xs items-start gap-1.5 rounded bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800 ring-1 ring-rose-200" role="alert" data-job-problem>
      <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
      <span>{words}</span>
    </div>
  );
}

interface ControlsProps {
  job: JobView;
  /** The server's new JobView after a change that worked. */
  onChanged: (job: JobView) => void;
  /** The green sentence for what worked. */
  onNotice?: (words: string) => void;
  /** Show only the mode (the Responder page puts the switch and the mode in two sections). */
  hideSwitch?: boolean;
  /** Show only the switch. */
  hideMode?: boolean;
}

export function JobControls({ job, onChanged, onNotice, hideSwitch, hideMode }: ControlsProps) {
  const writer = useJobWriter();
  const [refusal, setRefusal] = useState<string | null>(null);
  const st = jobRowState(job);
  const busy = writer.busy === job.job_key;

  const change = async (patch: { enabled?: boolean; mode?: JobMode }) => {
    setRefusal(null);
    const out = await writer.write(job, patch);
    if (out.ok) {
      onChanged(out.job);
      onNotice?.(out.words);
    } else {
      setRefusal(out.words);
    }
  };

  if (st.control !== "switch") {
    return st.lockLine ? (
      <p className="flex max-w-xs items-start gap-1.5 text-xs text-slate-600">
        <Lock className="mt-0.5 h-3 w-3 flex-shrink-0 text-slate-400" />
        <span>{st.lockLine}</span>
      </p>
    ) : null;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-3">
        {st.modeControl && !hideMode ? (
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <span className="font-semibold">Runs</span>
            <select
              value={shownMode(job)}
              disabled={busy}
              onChange={(e) => void change({ mode: e.target.value as JobMode })}
              className="rounded border border-slate-300 px-2 py-1 text-xs"
              aria-label={`How ${job.display_name} runs`}
            >
              <option value="automatic" disabled={!!st.automaticLine}>Automatic</option>
              <option value="review">Send me first</option>
            </select>
          </label>
        ) : null}
        {!hideSwitch && (
          <label className={`flex items-center gap-2 text-xs font-semibold ${st.switchLocked ? "text-slate-400" : "cursor-pointer text-slate-700"}`}>
            <input
              type="checkbox"
              role="switch"
              checked={job.enabled === true}
              disabled={busy || st.switchLocked}
              onChange={(e) => void change({ enabled: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
              aria-label={`${job.display_name} on`}
            />
            {job.enabled === true ? "On" : "Off"}
          </label>
        )}
      </div>
      {st.modeLine && !hideMode && <p className="text-[11px] text-slate-600">{st.modeLine}</p>}
      {st.automaticLine && !hideMode && (
        <p className="text-[11px] text-slate-600"><GateLink line={st.automaticLine} /></p>
      )}
      {st.switchLocked && st.gateLine && (
        <p className="text-[11px] text-slate-600"><GateLink line={st.gateLine} /></p>
      )}
      {st.paused && st.gateLine && (
        <p className="text-[11px] font-semibold text-amber-800">
          <GateLink line={{ ...st.gateLine, words: pausedWords(st.gateLine.words) }} />
        </p>
      )}
      {st.problemLine && !hideSwitch && <ProblemLine words={st.problemLine} />}
      {refusal && (
        <div className="flex items-start gap-1.5 rounded bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800 ring-1 ring-rose-200" role="alert">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span>{refusal}</span>
        </div>
      )}
    </div>
  );
}

/** A door: the switch where the job's setting already lives (the office administrator's jobs). */
export interface DoorView {
  state: DoorState;
  /** What the row shows: the switch, the locked words, or that it could not be read (doors.ts doorRowView). */
  row: DoorRowView;
  busy: boolean;
  refusal: string | null;
  onToggle: (enabled: boolean) => void;
  onKnob: (field: string, value: number | string) => void;
  onResume?: () => void;
}

export function DoorControls({ job, door }: { job: JobView; door: DoorView }) {
  const st = door.state;
  const view = door.row;
  return (
    <div className="space-y-1.5">
      {view.control === "unread" && (
        <p className="text-[11px] text-rose-700" role="alert">{view.words}</p>
      )}
      {view.control === "locked" && (
        <p className="flex max-w-xs items-start gap-1.5 text-xs text-slate-600">
          <Lock className="mt-0.5 h-3 w-3 flex-shrink-0 text-slate-400" />
          <GateLink line={view} />
        </p>
      )}
      {view.control === "switch" && (
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            role="switch"
            checked={st.enabled === true}
            disabled={door.busy || (st.enabled !== true && !view.canSwitchOn)}
            onChange={(e) => door.onToggle(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
            aria-label={`${job.display_name} on`}
          />
          {st.enabled ? "On" : "Off"}
        </label>
      )}
      {view.control === "switch" && view.gate && (
        <p className="text-[11px] font-semibold text-amber-800">
          <GateLink line={{ ...view.gate, words: pausedWords(view.gate.words) }} />
        </p>
      )}
      {view.control === "switch" && job.lock_words && <p className="text-[11px] text-slate-600">{job.lock_words}</p>}
      {st.lastSentAt && relativeTime(st.lastSentAt) && (
        <p className="text-[11px] text-slate-500">Last sent {relativeTime(st.lastSentAt)}</p>
      )}
      {st.lastMissAt && relativeTime(st.lastMissAt) && (
        <p className="text-[11px] text-amber-800">Didn&rsquo;t send last time ({relativeTime(st.lastMissAt)})</p>
      )}
      {door.refusal && (
        <div className="flex items-start gap-1.5 rounded bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800 ring-1 ring-rose-200" role="alert">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span>{door.refusal}</span>
        </div>
      )}
    </div>
  );
}

/** The door's knobs ("Chase a quote after 3 days"), saved on change of each box. */
export function DoorKnobs({ knobs, values, busy, onKnob }: {
  knobs: DoorKnob[];
  values: Record<string, number | string | boolean | null>;
  busy: boolean;
  onKnob: (field: string, value: number | string) => void;
}) {
  if (!knobs.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {knobs.map((k) => (
        <label key={k.field} className="block">
          <span className="block text-xs font-medium text-slate-800">{k.label}</span>
          {k.hint && <span className="mt-0.5 block text-[11px] text-slate-500">{k.hint}</span>}
          <span className="mt-1 flex items-center gap-2">
            <input
              type={k.type === "text" ? "text" : "number"}
              min={k.min}
              max={k.max}
              defaultValue={values[k.field] == null ? "" : String(values[k.field])}
              placeholder={k.placeholder}
              disabled={busy}
              onBlur={(e) => onKnob(k.field, k.type === "text" ? e.target.value : Number(e.target.value))}
              className={`${k.type === "text" ? "w-32" : "w-24"} rounded border border-slate-300 px-2 py-1 text-xs`}
            />
            {k.suffix && <span className="text-[11px] text-slate-500">{k.suffix}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

interface RowProps {
  job: JobView;
  onChanged: (job: JobView) => void;
  onNotice: (words: string) => void;
  /** Open the job's drawer (When I do it, the steps, How much, …). */
  onOpen: () => void;
  lastDidIso?: string | null;
  needCount?: number;
  /** The halted line, from the product's own settings. */
  halted?: { words: string; onResume?: () => void } | null;
  /** Run it now, where the job has a run route. */
  onRunNow?: (() => void) | null;
  running?: boolean;
  door?: DoorView | null;
}

export function JobRow({ job, onChanged, onNotice, onOpen, lastDidIso, needCount, halted, onRunNow, running, door }: RowProps) {
  const st = jobRowState(job);
  const last = lastDidWords(lastDidIso || null);
  const need = needCountWords(needCount || 0);
  const isOn = st.control === "door" ? door?.state.enabled === true : job.enabled === true;
  const canRun = canRunNow({ hasRunRoute: !!onRunNow, isOn, paused: st.paused, halted: !!halted, problem: job.problem });

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200" id={`job-${job.job_key}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-1 text-[15px] font-bold text-slate-900">
            {job.display_name}<ChevronRight className="h-4 w-4 text-slate-400" />
          </span>
          <span className="mt-0.5 block text-xs text-slate-600">{job.description_plain}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            {job.trigger_words && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-800 ring-1 ring-sky-200">{job.trigger_words}</span>
            )}
            {last && <span>· {last}</span>}
            {need && <span className="font-semibold text-amber-800">· {need}</span>}
          </span>
        </button>
        <div className="flex flex-col items-end gap-2">
          {st.control === "door" && door ? <DoorControls job={job} door={door} /> : (
            <JobControls job={job} onChanged={onChanged} onNotice={onNotice} />
          )}
          {st.control === "door" && st.problemLine && <ProblemLine words={st.problemLine} />}
          {canRun && (
            <button
              type="button"
              onClick={onRunNow!}
              disabled={running}
              className="inline-flex items-center gap-1 rounded border border-violet-300 bg-white px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-40"
            >
              <Play className="h-3 w-3" />{running ? "Running…" : "Run it now"}
            </button>
          )}
        </div>
      </div>

      {st.control === "door" && door && door.row.control === "switch" && door.state.enabled === true && door.state.knobs.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <DoorKnobs knobs={door.state.knobs} values={door.state.values} busy={door.busy} onKnob={door.onKnob} />
        </div>
      )}

      {halted && (
        <div className="mt-2 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span className="flex-1">{halted.words}</span>
          {halted.onResume && (
            <button type="button" onClick={halted.onResume} className="flex-shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800">
              Start it again
            </button>
          )}
        </div>
      )}

      {(job.waiting_for_brief || []).length > 0 && (
        <ul className="mt-2 space-y-1">
          {job.waiting_for_brief.map((w) => (
            <li key={w.field} className="text-[11px] text-amber-900">
              <Link to={briefFieldRoute(w.field)} className="underline">{waitingForBriefWords(w)}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default JobRow;

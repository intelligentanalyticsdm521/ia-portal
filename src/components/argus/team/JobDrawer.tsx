// JobDrawer — one job, read-only except its limits (contract ARGUS employees
// phase 1 §F.2 "The job drawer").
//
//   1. When I do it            the trigger, in words
//   2. The steps               each step's sentence
//   3. What I'm allowed to do / What I never do
//   4. How much                the owner's limits (Save → PUT /me/team/jobs/:key { vars });
//                              a door job shows its door's knobs instead
//   5. What I read about your business   each answer, set or not set, linked
//   6. The version line        "Version 3, the standard set" / "…, set up for your business"
//   7. Last 20 runs, and Notes and activity (GET …/changes, read when the drawer opens)
//
// The job description itself is shown, never edited: phase 1 has no editor
// (§H.6). Opened from the job's name; its open state is in the URL (?job=), so
// Back closes it.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useJobWriter } from "../../../hooks/useTeam";
import {
  NOT_BUILT_WORDS, briefFieldRoute, choiceLabel, varLimitWords, varText, varsPayload, versionLine, whenWords,
  type JobView, type TeamJobChange, type VarDef,
} from "../../../lib/team";
import type { AgentRunRow } from "../../agents/types";
import { DoorKnobs, type DoorView } from "./JobRow";

interface Props {
  job: JobView;
  onClose: () => void;
  onChanged: (job: JobView) => void;
  onNotice: (words: string) => void;
  runs: AgentRunRow[];
  door?: DoorView | null;
  loadChanges: (jobKey: string) => Promise<TeamJobChange[]>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-100 pt-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-1.5 text-xs text-slate-700">{children}</div>
    </section>
  );
}

function VarBox({ name, def, value, onChange, disabled }: {
  name: string; def: VarDef; value: string; onChange: (v: string) => void; disabled: boolean;
}) {
  const limit = varLimitWords(def);
  let input: React.ReactNode;
  if (def.type === "list") {
    input = <textarea rows={4} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs" />;
  } else if (def.type === "choice") {
    input = (
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1 rounded border border-slate-300 px-2 py-1 text-xs">
        {(def.options || []).map((o) => <option key={o} value={o}>{choiceLabel(name, o)}</option>)}
      </select>
    );
  } else if (def.type === "stars") {
    input = (
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1 rounded border border-slate-300 px-2 py-1 text-xs">
        <option value="4">4 stars and up</option>
        <option value="5">5 stars only</option>
      </select>
    );
  } else if (def.type === "time") {
    input = <input type="time" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1 rounded border border-slate-300 px-2 py-1 text-xs" />;
  } else {
    input = <input type="number" min={def.min} max={def.max} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1 w-24 rounded border border-slate-300 px-2 py-1 text-xs" />;
  }
  return (
    <label className="block" data-var={name}>
      <span className="block text-xs font-medium text-slate-800">{def.label}</span>
      {input}
      {limit && <span className="mt-0.5 block text-[11px] text-slate-500">{limit}</span>}
    </label>
  );
}

export function JobDrawer({ job, onClose, onChanged, onNotice, runs, door, loadChanges }: Props) {
  const writer = useJobWriter();
  const defs = job.var_defs || {};
  const initial = () => Object.fromEntries(Object.keys(defs).map((k) => [k, varText(job.vars?.[k])]));
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [changes, setChanges] = useState<TeamJobChange[] | null>(null);
  const [changesError, setChangesError] = useState<string | null>(null);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    // Once per job opened (convention_data_fetching).
    if (asked.current === job.job_key) return;
    asked.current = job.job_key;
    setChanges(null);
    setChangesError(null);
    loadChanges(job.job_key)
      .then((c) => setChanges(c))
      .catch(() => setChangesError("We couldn't load what changed. Close this and open it again to retry."));
  }, [job.job_key, loadChanges]);

  const pb = job.playbook;
  const dirty = Object.keys(draft).filter((k) => draft[k] !== varText(job.vars?.[k]));

  const save = async () => {
    const only = Object.fromEntries(dirty.map((k) => [k, draft[k]]));
    const checked = varsPayload(defs, only);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors([]);
    const out = await writer.write(job, { vars: checked.vars });
    if (out.ok) { onChanged(out.job); onNotice(out.words); }
    else setErrors([out.words]);
  };

  const lastRuns = runs.slice(0, 20);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={job.display_name}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">{job.display_name}</h2>
            <p className="mt-0.5 text-xs text-slate-600">{job.description_plain}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-500"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-4 space-y-4">
          <Section title="When I do it">
            {whenWords(job)}
          </Section>

          <Section title="The steps">
            {pb && pb.steps.length > 0 ? (
              <ol className="list-decimal space-y-0.5 pl-4">
                {pb.steps.map((s, i) => <li key={i}>{s.words}</li>)}
              </ol>
            ) : <p className="text-slate-500">{job.state === "live" ? "No steps to show for this one." : (job.lock_words || NOT_BUILT_WORDS)}</p>}
          </Section>

          {pb && (
            <>
              <Section title="What I'm allowed to do">
                {pb.allowed.length ? <ul className="space-y-0.5">{pb.allowed.map((w, i) => <li key={i}>· {w}</li>)}</ul> : <p className="text-slate-500">Nothing listed.</p>}
              </Section>
              <Section title="What I never do">
                {pb.never.length ? <ul className="space-y-0.5">{pb.never.map((w, i) => <li key={i}>· {w}</li>)}</ul> : <p className="text-slate-500">Nothing listed.</p>}
              </Section>
            </>
          )}

          <Section title="How much">
            {door ? (
              <DoorKnobs knobs={door.state.knobs} values={door.state.values} busy={door.busy} onKnob={door.onKnob} />
            ) : Object.keys(defs).length === 0 ? (
              <p className="text-slate-500">There is nothing to set for this one.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(defs).map(([k, def]) => (
                  <VarBox key={k} name={k} def={def} value={draft[k] ?? ""} disabled={writer.busy === job.job_key}
                    onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))} />
                ))}
                {errors.length > 0 && (
                  <p className="rounded bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800 ring-1 ring-rose-200" role="alert">{errors.join(" ")}</p>
                )}
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={dirty.length === 0 || writer.busy === job.job_key}
                  className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {writer.busy === job.job_key ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </Section>

          {pb && pb.reads.length > 0 && (
            <Section title="What I read about your business">
              <ul className="space-y-1">
                {pb.reads.map((r) => (
                  <li key={r.field} className="flex items-center justify-between gap-2">
                    <span>{r.label}</span>
                    <span className="flex items-center gap-2">
                      <span className={r.set ? "text-emerald-700" : "text-amber-800"}>{r.set ? "Set" : "Not set"}</span>
                      <Link to={briefFieldRoute(r.field)} className="font-semibold underline">Change it</Link>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {versionLine(pb) && <p className="border-t border-slate-100 pt-3 text-[11px] text-slate-500">{versionLine(pb)}</p>}

          <Section title="Last 20 runs">
            {lastRuns.length === 0 ? <p className="text-slate-500">It hasn&rsquo;t run yet.</p> : (
              <ul className="divide-y divide-slate-100">
                {lastRuns.map((r) => (
                  <li key={r.run_id} className="flex justify-between gap-2 py-1">
                    <span>{r.outcome_label}</span>
                    <span className="text-[11px] text-slate-500">{r.started_at ? new Date(r.started_at).toLocaleString() : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Notes and activity">
            {changesError && <p className="text-rose-700" role="alert">{changesError}</p>}
            {!changesError && changes === null && <p className="text-slate-500">Loading…</p>}
            {changes && changes.length === 0 && <p className="text-slate-500">Nothing has changed on this job yet.</p>}
            {changes && changes.length > 0 && (
              <ul className="space-y-1">
                {changes.map((c, i) => (
                  <li key={`${c.at}-${i}`} className="flex justify-between gap-2">
                    <span>{c.words}</span>
                    <span className="text-[11px] text-slate-500">{c.at ? new Date(c.at).toLocaleString() : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

export default JobDrawer;

// ProjectDetailsTab — the project's planning surface (2026-08-08).
//
// Brandon: "we just need to add the date structure, capacity loads like hours or
// engagement level (s/m/l) in there so we can track etc. I'd probably just mimic
// what we did for tasks overview and details... Replace notes with the new
// details section. Then if the combined tasks go over the project hours we need
// a flag there as well to up expectations."
//
// Deliberately the same two-tab vocabulary as TaskModal: Overview is what the
// project IS and where it stands; Details is what it was PLANNED to be. Mixing
// them is what made the old Overview a wall of half-editable meta cards.
//
// The notes thread lives at the bottom of this tab rather than being deleted
// with the Notes tab it replaced — those notes are real project history, and a
// tab that vanishes takes its data out of reach.
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { ConsultingProjectRow, ProjectCapacity } from "./ConsultingProjectModal";
import { loadBand, BAND_STYLE } from "../../pages/consulting/workTypes";

const SIZE_LABEL: Record<string, string> = { s: "Small", m: "Medium", l: "Large" };

/** DATE columns arrive as YYYY-MM-DD; `new Date(...)` on one is UTC-midnight and
 *  renders a day early in every western timezone. Slice, don't parse. */
function dateInput(v?: string | null): string {
  return v ? String(v).slice(0, 10) : "";
}

export function ProjectDetailsTab({
  project, capacity, viewerRole, savingDetail = false, onDetailPatch, notesSlot,
}: {
  project: ConsultingProjectRow;
  capacity?: ProjectCapacity;
  viewerRole: "founder" | "client";
  savingDetail?: boolean;
  onDetailPatch?: (fields: Record<string, unknown>) => void | Promise<void>;
  /** The existing notes thread, rendered beneath the planning fields. */
  notesSlot?: React.ReactNode;
}) {
  const [start, setStart] = useState(dateInput(project.start_date));
  const [end, setEnd] = useState(dateInput(project.target_end_date));
  const [hours, setHours] = useState(project.estimate_hours != null ? String(project.estimate_hours) : "");
  const [size, setSize] = useState(project.estimate_size || "");
  const [notes, setNotes] = useState(project.internal_notes || "");

  // Re-seed when the project reloads after a save, so the inputs never drift
  // from what the server actually stored.
  useEffect(() => {
    setStart(dateInput(project.start_date));
    setEnd(dateInput(project.target_end_date));
    setHours(project.estimate_hours != null ? String(project.estimate_hours) : "");
    setSize(project.estimate_size || "");
    setNotes(project.internal_notes || "");
  }, [project.project_id, project.start_date, project.target_end_date,
      project.estimate_hours, project.estimate_size, project.internal_notes]);

  const readOnly = viewerRole !== "founder" || !onDetailPatch;
  const budget = capacity?.budget_hours ?? null;
  const committed = capacity?.committed_hours ?? 0;
  const band = loadBand(committed, budget);
  const style = BAND_STYLE[band];

  const f = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60";
  const l = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

  const patch = (fields: Record<string, unknown>) => { void onDetailPatch?.(fields); };

  // Order matters: a date range that runs backwards is a typo, not a plan.
  const rangeBroken = Boolean(start && end && start > end);

  return (
    <div className="space-y-4 px-5 py-4">
      {/* ── Capacity flag ─────────────────────────────────────────────────── */}
      {budget != null ? (
        <div className="rounded-xl border px-4 py-3"
          style={{ background: style.bg, borderColor: style.border }}>
          <div className="flex items-center gap-2">
            {band === "over" || band === "high" ? (
              <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: style.text }} />
            ) : null}
            <span className="text-sm font-bold tabular-nums" style={{ color: style.text }}>
              {committed}h committed <span className="font-medium opacity-70">of {budget}h budgeted</span>
            </span>
            {style.note && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{ background: style.border }}>{style.note}</span>
            )}
          </div>
          <p className="mt-1 text-[11px]" style={{ color: style.text }}>
            {band === "over" || band === "high"
              ? "The tasks on this project now add up to more than it was budgeted for — reset expectations or cut scope before it slips."
              : `${capacity?.task_count ?? 0} tasks · ${capacity?.done_count ?? 0} done · ${capacity?.actual_hours ?? 0}h logged`}
            {(capacity?.unsized ?? 0) > 0 && (
              <strong> · {capacity?.unsized} unsized, so the real number is higher.</strong>
            )}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <strong className="text-slate-700">No capacity baseline.</strong>{" "}
          Set budgeted hours below and this project starts flagging when its tasks outgrow it.
          {(capacity?.task_count ?? 0) > 0 && (
            <> Its {capacity?.task_count} tasks currently add up to <strong>{committed}h</strong>.</>
          )}
        </div>
      )}

      {/* ── Schedule ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule</div>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={l}>Planned start</label>
            <input type="date" value={start} disabled={readOnly || savingDetail} className={f}
              onChange={(e) => {
                setStart(e.target.value);
                // Save on change, not on blur: a date picker emits change the
                // moment a date is chosen, and blur-only saving loses the edit
                // silently if the modal is closed without tabbing out.
                if (dateInput(project.start_date) !== e.target.value) patch({ start_date: e.target.value || null });
              }} />
          </div>
          <div>
            <label className={l}>Target end</label>
            <input type="date" value={end} disabled={readOnly || savingDetail} className={f}
              onChange={(e) => {
                setEnd(e.target.value);
                if (dateInput(project.target_end_date) !== e.target.value) patch({ target_end_date: e.target.value || null });
              }} />
          </div>
        </div>
        {rangeBroken && (
          <p className="mt-2 text-[11px] font-semibold text-rose-700">
            The target end is before the planned start.
          </p>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          Planned start is what you sold; <strong>Started</strong> on the Overview is when work actually
          began. The gap between them is the slip.
        </p>
      </div>

      {/* ── Size ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Size</div>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={l}>Budgeted hours</label>
            <input type="number" min={0} step="0.5" value={hours} disabled={readOnly || savingDetail}
              placeholder="blank = no baseline" className={f}
              onChange={(e) => setHours(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              onBlur={() => {
                const next = hours.trim() === "" ? null : Number(hours);
                if (next != null && (!Number.isFinite(next) || next < 0)) return;
                if ((project.estimate_hours ?? null) === next) return;
                patch({ estimate_hours: next });
              }} />
            <p className="mt-1 text-[11px] text-slate-500">
              Blank means <strong>no baseline</strong> — never treated as zero.
            </p>
          </div>
          <div>
            <label className={l}>Engagement level</label>
            <select value={size} disabled={readOnly || savingDetail} className={f}
              onChange={(e) => {
                setSize(e.target.value);
                patch({ estimate_size: e.target.value || null });
              }}>
              <option value="">—</option>
              {Object.entries(SIZE_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              For engagements sold by size rather than by the hour. Independent of the budget above.
            </p>
          </div>
        </div>
      </div>

      {/* ── Internal notes ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Internal notes <span className="font-normal normal-case tracking-normal text-slate-400">
            — never shown to the client
          </span>
        </div>
        <textarea value={notes} rows={4} disabled={readOnly || savingDetail}
          className={`mt-2 ${f}`} placeholder="Scope caveats, who to call, what not to promise…"
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => { if ((project.internal_notes || "") !== notes) patch({ internal_notes: notes || null }); }} />
      </div>

      {notesSlot}
    </div>
  );
}

export default ProjectDetailsTab;

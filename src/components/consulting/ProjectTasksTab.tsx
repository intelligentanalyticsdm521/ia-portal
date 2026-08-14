// ProjectTasksTab — every task on the project, in one list (2026-08-08).
//
// Brandon: "Then we probably just need a task view so I can see all the linked
// tasks within the project modal."
//
// The Milestones tab shows tasks grouped UNDER the milestone that claimed them,
// which is the right view when you are running the milestone — but it silently
// omits every task with no milestone_id, and those are exactly the ones that go
// missing. This tab is the complete list, milestone or not.
//
// Read-only by design: editing a task means opening the task, and there is
// already one modal for that. A second editable copy is how two surfaces drift.
import { useMemo } from "react";
import type { ConsultingTask, ConsultingProjectMilestone } from "./ConsultingProjectModal";
import { TASK_STAGE_LABELS, TASK_STATUS_LABELS } from "./ConsultingProjectModal";
import { STAGE_TINT, PRIORITY_TINT, PLATFORM_LABEL } from "../../pages/consulting/workTypes";

const DONE = new Set(["completed", "cancelled"]);

function fmtDateOnly(v?: string | null): string {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}` : "";
}

export function ProjectTasksTab({
  tasks, milestones, onOpenTask,
}: {
  tasks: ConsultingTask[];
  milestones: ConsultingProjectMilestone[];
  onOpenTask?: (t: ConsultingTask) => void;
}) {
  const milestoneName = useMemo(() => {
    const m = new Map<string, string>();
    milestones.forEach((x) => m.set(x.milestone_id, x.name));
    return m;
  }, [milestones]);

  // Open work first — the list exists to answer "what is left", and a project
  // with 40 shipped tasks buries its 3 live ones otherwise.
  const ordered = useMemo(() => {
    const rank = (t: ConsultingTask) => (DONE.has(t.stage) ? 1 : 0);
    return [...tasks].sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const da = a.due_at || "9999", db = b.due_at || "9999";
      return String(da).localeCompare(String(db));
    });
  }, [tasks]);

  if (!tasks.length) {
    return (
      <div className="px-6 py-10 text-center text-sm text-slate-500">
        No tasks on this project yet. Add them from the Work board, or under a milestone.
      </div>
    );
  }

  const open = ordered.filter((t) => !DONE.has(t.stage));
  const openHours = open.reduce((s, t) => s + Number(t.estimate_hours || 0), 0);
  const unsized = open.filter((t) => t.estimate_hours == null && !t.estimate_size).length;

  return (
    <div className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <span className="text-sm font-bold text-slate-800 tabular-nums">
          {open.length} <span className="text-xs font-medium text-slate-500">open</span>
        </span>
        <span className="text-sm font-bold text-slate-800 tabular-nums">
          {tasks.length - open.length} <span className="text-xs font-medium text-slate-500">done</span>
        </span>
        {openHours > 0 && (
          <span className="text-sm font-bold text-slate-800 tabular-nums">
            {openHours}<span className="text-xs font-medium text-slate-500">h remaining</span>
          </span>
        )}
        {unsized > 0 && (
          <span className="text-xs font-semibold text-amber-700">{unsized} unsized</span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Task</th>
              <th className="px-3 py-2 font-semibold">Stage</th>
              <th className="px-3 py-2 font-semibold">Milestone</th>
              <th className="px-3 py-2 font-semibold">Owner</th>
              <th className="px-3 py-2 font-semibold">Release</th>
              <th className="px-3 py-2 text-right font-semibold">Est.</th>
              <th className="px-3 py-2 font-semibold">Due</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((t) => {
              const done = DONE.has(t.stage);
              const overdue = !done && t.due_at && String(t.due_at).slice(0, 10) < new Date().toISOString().slice(0, 10);
              return (
                <tr key={t.id} className={`border-b border-slate-100 last:border-0 ${done ? "opacity-60" : ""}`}>
                  <td className="px-3 py-2">
                    {onOpenTask ? (
                      <button type="button" onClick={() => onOpenTask(t)}
                        className="text-left font-semibold text-slate-800 hover:text-[#EF6C33]">
                        {t.title}
                      </button>
                    ) : (
                      <span className="font-semibold text-slate-800">{t.title}</span>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {t.platform && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {PLATFORM_LABEL[t.platform] || t.platform}
                        </span>
                      )}
                      {t.priority && t.priority !== "normal" && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                          style={{ background: PRIORITY_TINT[t.priority] || "#64748b" }}>{t.priority}</span>
                      )}
                      {t.origin === "client" && (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">client</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                      style={{ background: STAGE_TINT[t.stage] || "#64748b" }}>
                      {TASK_STAGE_LABELS[t.stage] || t.stage}
                    </span>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {TASK_STATUS_LABELS[t.status] || t.status}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {t.milestone_id
                      ? milestoneName.get(t.milestone_id) || "—"
                      : <span className="text-slate-400">No milestone</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {t.assignee_name || <span className="text-slate-400">Unassigned</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {t.release_name || <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {t.estimate_hours != null ? `${t.estimate_hours}h`
                      : t.estimate_size || <span className="text-amber-600">unsized</span>}
                  </td>
                  <td className={`px-3 py-2 tabular-nums ${overdue ? "font-semibold text-rose-700" : "text-slate-600"}`}>
                    {fmtDateOnly(t.due_at) || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProjectTasksTab;

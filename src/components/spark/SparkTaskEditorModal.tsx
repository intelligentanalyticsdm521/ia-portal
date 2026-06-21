// SparkTaskEditorModal — Phase 1 create/edit/view modal for SPARK named tasks
// (lumen.spark_task rows). Backs the SparkTasksPage admin surface and the
// F-CS.3 task_call dropdown (the dropdown lists what this modal manages).
//
// Phase 1 scope:
//   - Overview tab: name (input), description (textarea — backend doesn't
//     persist it yet but the F-CS.3 surface already shows step_count so this
//     field forward-declares the column we'll add).
//   - Steps tab: read-only summary list of steps from steps_json. No inline
//     editor yet — that's Phase 2. The Save button on a brand-new task seeds
//     one trivial step so the API write succeeds (steps_json must be a non-
//     empty array per validateStepsJson in routes/sparkTasks.js).
//   - Activity tab: empty placeholder.
//
// API surface (LUMEN-API batch 8 commit 0bca7a1):
//   GET    /api/v1/spark_tasks/:id   → detail (with steps_json)
//   POST   /api/v1/spark_tasks       → create
//   PATCH  /api/v1/spark_tasks/:id   → update
//   DELETE /api/v1/spark_tasks/:id   → soft delete (is_active = 0)
//
// Auto-unwrap: sparkApi.ts does NOT unwrap envelopes (unlike oliverApi),
// so every call here destructures `.data` explicitly.
import { useEffect, useState } from "react";
import { Save, Trash2, AlertTriangle, Plus, Edit3, ListOrdered, Activity as ActivityIcon } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IadmModal, IadmButton } from "../IadmModal";

type Tab = "overview" | "steps" | "activity";

interface SparkTaskDetail {
  task_id: number;
  name: string;
  description: string | null;
  steps_json: unknown; // array of step objects (or string if it failed to parse server-side)
  step_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Existing task ID to edit, or null for create-new. */
  taskId: number | null;
  onChanged?: () => void;
}

// Seed step used when a user creates a brand-new task via this Phase 1 modal.
// Step editing is Phase 2 — for now we just need a valid non-empty array that
// passes the backend's validateStepsJson() check. `wait` with a 1-minute delay
// is the cheapest no-op that still makes the task "do something" if invoked.
const SEED_STEPS = [{ step_type: "wait", config: { minutes: 1 } }];

export function SparkTaskEditorModal({ open, onClose, taskId, onChanged }: Props) {
  const { get, post, patch, del, ready } = useSparkApi();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stepsJson, setStepsJson] = useState<unknown>(SEED_STEPS);
  const [stepCount, setStepCount] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset/fetch on open. Resetting state INSIDE the effect (vs. relying on
  // a key-remount) keeps the modal from flashing prior content while data
  // re-fetches for a different task id.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setTab("overview");
    if (taskId == null) {
      setName("");
      setDescription("");
      setStepsJson(SEED_STEPS);
      setStepCount(SEED_STEPS.length);
      setIsActive(true);
      setCreatedAt(null);
      setUpdatedAt(null);
      return;
    }
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await get<{ data: SparkTaskDetail }>(`/api/v1/spark_tasks/${taskId}`);
        if (cancelled) return;
        const row = r?.data;
        if (!row) { setError("Task not found."); return; }
        setName(row.name || "");
        setDescription(row.description || "");
        setStepsJson(row.steps_json ?? []);
        setStepCount(row.step_count ?? 0);
        setIsActive(!!row.is_active);
        setCreatedAt(row.created_at || null);
        setUpdatedAt(row.updated_at || null);
      } catch (err) {
        if (!cancelled) setError(String((err as Error)?.message || err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, taskId, ready, get]);

  async function save() {
    if (!name.trim()) { setError("Name is required."); setTab("overview"); return; }
    setSaving(true); setError(null);
    try {
      if (taskId == null) {
        // Create. Backend requires a non-empty steps_json array — we seed with
        // a single wait step so Phase 1 callers can create tasks without
        // hand-rolling JSON. They can fill in real steps in Phase 2.
        const payload = {
          name: name.trim(),
          steps_json: Array.isArray(stepsJson) && stepsJson.length > 0 ? stepsJson : SEED_STEPS,
        };
        await post<{ data: SparkTaskDetail }>(`/api/v1/spark_tasks`, payload);
      } else {
        // Update. Send only the editable Phase-1 fields (name + is_active).
        // steps_json is intentionally left untouched until Phase 2 ships the
        // inline editor — sending stepsJson now would just re-serialize the
        // same array we read out, which is a no-op write but wastes audit rows.
        await patch<{ data: SparkTaskDetail }>(`/api/v1/spark_tasks/${taskId}`, {
          name: name.trim(),
          is_active: isActive,
        });
      }
      onChanged?.();
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (taskId == null) return;
    if (!confirm(`Delete "${name}"? This soft-deletes the task; any automation step that calls it by id will start failing immediately.`)) return;
    setSaving(true); setError(null);
    try {
      await del<{ ok: true }>(`/api/v1/spark_tasks/${taskId}`);
      onChanged?.();
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  const isEdit = taskId != null;
  const stepsArray: Array<Record<string, unknown>> = Array.isArray(stepsJson)
    ? (stepsJson as Array<Record<string, unknown>>)
    : [];

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="SPARK · TASK"
      title={isEdit ? (name || "Task") : "New task"}
      subtitle={isEdit
        ? `${stepCount} step${stepCount === 1 ? "" : "s"}${isActive ? "" : " · inactive"}`
        : "Reusable sub-automation invoked by task_call steps"}
      size="info"
      footer={
        <>
          {isEdit && (
            <button
              onClick={remove}
              disabled={saving}
              className="mr-auto text-xs text-rose-600 hover:text-rose-700 inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          )}
          <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
          <IadmButton
            variant="accent"
            product="spark"
            onClick={save}
            disabled={saving || loading}
            icon={isEdit ? <Save className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create task"}
          </IadmButton>
        </>
      }
    >
      <div className="flex h-full flex-col">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1 flex-shrink-0">
          {([
            { key: "overview", label: "Overview", icon: Edit3 },
            { key: "steps",    label: stepCount ? `Steps (${stepCount})` : "Steps", icon: ListOrdered },
            { key: "activity", label: "Activity", icon: ActivityIcon },
          ] as Array<{ key: Tab; label: string; icon: typeof Edit3 }>).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.key
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                    : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {loading && <div className="text-sm text-slate-500">Loading…</div>}

          {!loading && tab === "overview" && (
            <div className="space-y-4 max-w-2xl">
              <Field label="Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="task-input"
                  autoFocus
                  placeholder="Welcome follow-up"
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Shown in the F-CS.3 task_call dropdown when an IL rule step references this task.
                </p>
              </Field>
              <Field label="Description (optional)">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="task-input"
                  placeholder="Short note explaining what this task does. Forward-declared — backend column lands in Phase 2."
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Stored locally only for now. The backend column lands with steps editing in Phase 2.
                </p>
              </Field>
              {isEdit && (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  Task is active
                </label>
              )}
              {isEdit && (createdAt || updatedAt) && (
                <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                  {createdAt && <>Created {new Date(createdAt).toLocaleString()}</>}
                  {createdAt && updatedAt && <> · </>}
                  {updatedAt && <>Updated {new Date(updatedAt).toLocaleString()}</>}
                </div>
              )}
            </div>
          )}

          {!loading && tab === "steps" && (
            <div className="max-w-3xl">
              <p className="text-xs text-slate-500 mb-3">
                Read-only step list. Inline step editing ships in Phase 2 —
                until then, edit steps_json directly in the database for advanced
                cases.
              </p>
              {stepsArray.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-8 text-center">
                  <ListOrdered className="h-7 w-7 text-slate-300 mx-auto mb-2" />
                  <div className="text-sm font-semibold text-slate-900">No steps yet</div>
                  <p className="text-xs text-slate-500 mt-1">
                    {isEdit
                      ? "This task has no steps. It will exit immediately when invoked."
                      : "On save, a single wait step is seeded so the task is valid. Replace it in Phase 2."}
                  </p>
                </div>
              ) : (
                <ol className="space-y-2">
                  {stepsArray.map((step, idx) => {
                    const type = String(step.step_type ?? step.type ?? "?").toLowerCase();
                    const config = (step.config ?? {}) as Record<string, unknown>;
                    return (
                      <li
                        key={idx}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-start gap-3"
                      >
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold inline-flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold uppercase tracking-wider text-[#EF6C33]">{type}</div>
                          <StepFields config={config} />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}

          {!loading && tab === "activity" && (
            <div className="max-w-2xl">
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
                <ActivityIcon className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <div className="text-sm font-semibold text-slate-900">Activity history coming soon</div>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Per-task invocation history (which automation called it, when, how long,
                  did it succeed) lands once the runtime is wired to emit task-scoped audit rows.
                </p>
              </div>
            </div>
          )}

          <style>{`
            .task-input {
              width: 100%;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 6px 10px;
              font-size: 13px;
              font-family: inherit;
            }
            .task-input:focus { outline: none; border-color: #EF6C33; box-shadow: 0 0 0 1px #EF6C33; }
          `}</style>
        </div>
      </div>
    </IadmModal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

// Render the small subset of step-config fields we know about. Kept narrow on
// purpose — Phase 1 is read-only and only needs to give the reader enough
// signal to recognize the step. Phase 2 (inline editor) will render proper
// type-aware widgets.
function StepFields({ config }: { config: Record<string, unknown> }) {
  const entries = Object.entries(config);
  if (entries.length === 0) {
    return <div className="text-[11px] text-slate-400 mt-0.5">No config</div>;
  }
  return (
    <dl className="mt-0.5 text-[11px] text-slate-600 grid grid-cols-[max-content_1fr] gap-x-2 gap-y-0.5">
      {entries.slice(0, 6).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-slate-500">{k}</dt>
          <dd className="font-mono text-slate-700 truncate">{stringifyValue(v)}</dd>
        </div>
      ))}
      {entries.length > 6 && (
        <div className="col-span-2 text-slate-400 italic">+ {entries.length - 6} more</div>
      )}
    </dl>
  );
}

function stringifyValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

export default SparkTaskEditorModal;

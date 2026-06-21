// SparkTaskEditorModal — Phase 1 (a54a046) + Phase 2 (e3f489b) + Batch 10
// shared-editor refactor (this commit). Modal for editing SPARK named tasks
// (lumen.spark_task rows). Backs the SparkTasksPage admin surface and the
// F-CS.3 task_call dropdown (the dropdown lists what this modal manages).
//
// Per-step editing now lives in the shared <StepConfigEditor /> (see
// sparkStepEditor.tsx). This file owns the modal shell, the steps-list
// column with drag-reorder + add/remove, and the save/delete plumbing.
//
// Why disabledKinds=['task_call']:
//   The runtime rejects nested task_call inside a task (see
//   validateStepsJson in LUMEN-API routes/sparkTasks.js: "nested task_call
//   not supported in v1"). We block it both in the type-picker dropdown
//   (so the user can't add a new one) and at the field-renderer (legacy
//   nested rows show an "amend or delete" banner instead of fields).
//
// API surface (LUMEN-API batch 8 commit 0bca7a1 + migration 046):
//   GET    /api/v1/spark_tasks/:id   → detail (with steps_json + description)
//   POST   /api/v1/spark_tasks       → create
//   PATCH  /api/v1/spark_tasks/:id   → update
//   DELETE /api/v1/spark_tasks/:id   → soft delete (is_active = 0)
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Save, Trash2, AlertTriangle, Plus, Edit3, ListOrdered, Activity as ActivityIcon,
  GripVertical, X,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IadmModal, IadmButton } from "../IadmModal";
import {
  StepConfigEditor,
  classifyKind,
  defaultConfigForKind,
  normalizeStep,
  validateSteps,
  summarizeStep,
  KIND_STYLES,
  type Step,
  type SparkLookups,
} from "./sparkStepEditor";

type Tab = "overview" | "steps" | "activity";

interface SparkTaskDetail {
  task_id: number;
  name: string;
  description: string | null;
  steps_json: unknown;
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

// ── Step model ─────────────────────────────────────────────────────────────
// Steps are stored in normalized {type, config} shape in editor state. On
// save we POST/PATCH as {step_type, config} (the spec doc form); the runtime
// + writer both accept either shape.
function normalizeSteps(stepsJson: unknown): Step[] {
  if (!Array.isArray(stepsJson)) return [];
  return (stepsJson as unknown[]).map(normalizeStep);
}

// Seed for brand-new tasks. Matches the F-CS.6 runtime contract: non-empty
// array, no nested task_call. A 1-day wait is the cheapest no-op that's
// still meaningful when invoked.
const SEED_STEPS: Step[] = [{ type: "wait", config: defaultConfigForKind("wait") }];

// ── Component ──────────────────────────────────────────────────────────────
export function SparkTaskEditorModal({ open, onClose, taskId, onChanged }: Props) {
  const { get, post, patch, del, ready } = useSparkApi();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<Step[]>(SEED_STEPS);
  const [isActive, setIsActive] = useState(true);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-step selection for the inline editor. -1 = none selected (default
  // is "first step" once steps load).
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  // Drag-reorder state. We only track the index being dragged; the drop
  // target is computed from the dragenter event's currentTarget data-idx.
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Lookups for the inline editor dropdowns. Same set as the suggestions
  // panel, minus sparkTasks (task_call is disabled here, so the picker has
  // no use for a task list).
  const [emailTemplates, setEmailTemplates] = useState<Array<{ id: number; template_key: string; name: string }>>([]);
  const [smsTemplates,   setSmsTemplates]   = useState<Array<{ id: number; template_key: string; name: string }>>([]);
  const [tags,           setTags]           = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTab("overview");
    setSelectedIdx(0);
    if (taskId == null) {
      setName("");
      setDescription("");
      setSteps(SEED_STEPS);
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
        setSteps(normalizeSteps(row.steps_json));
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

  // Lookups — fetched once per modal-open. Best-effort; the dropdowns just
  // become text inputs on failure.
  useEffect(() => {
    if (!open || !ready) return;
    get<{ items: Array<{ id: number; template_key: string; name: string }> }>("/api/v1/email-templates")
      .then((r) => setEmailTemplates(r?.items || []))
      .catch(() => setEmailTemplates([]));
    get<{ items: Array<{ id: number; template_key: string; name: string }> }>("/api/v1/sms-templates")
      .then((r) => setSmsTemplates(r?.items || []))
      .catch(() => setSmsTemplates([]));
    get<{ data: Array<{ id: number; name: string }> }>("/api/v1/tags")
      .then((r) => setTags(r?.data || []))
      .catch(() => setTags([]));
  }, [open, ready, get]);

  const updateStep = useCallback((idx: number, next: Step) => {
    setSteps((prev) => {
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    });
  }, []);

  const addStep = useCallback(() => {
    setSteps((prev) => {
      const seed: Step = { type: "wait", config: defaultConfigForKind("wait") };
      const next = [...prev, seed];
      // Select the newly-added step so the editor flips to its config
      // immediately. We use the post-append length, not prev.length, to be
      // robust to React 18 strict-mode double invocation.
      setSelectedIdx(next.length - 1);
      return next;
    });
    setTab("steps");
  }, []);

  const removeStep = useCallback((idx: number) => {
    setSteps((prev) => {
      if (prev.length <= 1) return prev; // backend requires >= 1 step
      const copy = prev.slice();
      copy.splice(idx, 1);
      return copy;
    });
    setSelectedIdx((prev) => Math.max(0, Math.min(prev, /* will be re-clamped after render */ prev - (idx <= prev ? 1 : 0))));
  }, []);

  // Drag handlers. Pure index-swap on drop — no animations, no live preview;
  // the visual reorder happens on drop. Tasks are short enough that this is
  // fine in practice.
  const onDragStart = (idx: number) => () => setDragIdx(idx);
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (targetIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx == null || dragIdx === targetIdx) { setDragIdx(null); return; }
    setSteps((prev) => {
      const copy = prev.slice();
      const [picked] = copy.splice(dragIdx, 1);
      copy.splice(targetIdx, 0, picked);
      return copy;
    });
    // After reorder, follow the dragged step to its new index so the user's
    // selected-step focus doesn't jump to whatever happened to land at the
    // old index.
    setSelectedIdx(targetIdx);
    setDragIdx(null);
  };
  const onDragEnd = () => setDragIdx(null);

  async function save() {
    if (!name.trim()) { setError("Name is required."); setTab("overview"); return; }
    // Client-side step validation — surface the full list instead of one
    // 400 at a time. Server runs the same checks defensively. validateSteps
    // returns {valid, errors[]}; we collapse to a single newline string for
    // the inline banner.
    const validation = validateSteps(steps);
    if (!validation.valid) {
      setError(validation.errors.map((e) => e.message).join("\n"));
      setTab("steps");
      return;
    }
    // Also guard the runtime's "no nested task_call in a task" rule. The
    // shared validator doesn't know about this caller-specific restriction —
    // it's the same rule the UI enforces via disabledKinds, but a legacy row
    // could still land here after type-change races. Belt + braces.
    const nested = steps.findIndex((s) => {
      const t = (s.type || "").toLowerCase();
      return t === "task_call" || t === "call" || t === "task";
    });
    if (nested >= 0) {
      setError(`Step ${nested + 1}: nested task_call is not allowed inside a task. Change the type or delete this step.`);
      setTab("steps");
      return;
    }
    setSaving(true); setError(null);
    try {
      // Send steps as {step_type, config} on the wire — both shapes work
      // server-side, but the spec docs read step_type, so we normalize to
      // that on the way out.
      const stepsForWire = steps.map((s) => ({ step_type: s.type, config: s.config }));
      const desc = description.trim() ? description.trim() : null;
      if (taskId == null) {
        await post<{ data: SparkTaskDetail }>(`/api/v1/spark_tasks`, {
          name: name.trim(),
          description: desc,
          steps_json: stepsForWire,
        });
      } else {
        await patch<{ data: SparkTaskDetail }>(`/api/v1/spark_tasks/${taskId}`, {
          name: name.trim(),
          description: desc,
          steps_json: stepsForWire,
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

  // Clamp selectedIdx whenever steps shrinks (e.g. after removeStep).
  useEffect(() => {
    if (selectedIdx >= steps.length) {
      setSelectedIdx(Math.max(0, steps.length - 1));
    }
  }, [steps.length, selectedIdx]);

  const stepCount = steps.length;

  // Lookups passed into the shared editor. sparkTasks intentionally omitted
  // — task_call is disabled in this surface.
  const lookups = useMemo<SparkLookups>(
    () => ({ emailTemplates, smsTemplates, tags }),
    [emailTemplates, smsTemplates, tags]
  );

  if (!open) return null;
  const isEdit = taskId != null;

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
            <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2 whitespace-pre-wrap">
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
                  maxLength={500}
                  className="task-input"
                  placeholder="Short note explaining what this task does."
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Saved to lumen.spark_task.description (NVARCHAR 500). Surfaced in the task_call dropdown so admins remember what each task is for.
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
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 max-w-5xl">
              {/* Step list (left column) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase font-semibold text-slate-500">Steps</div>
                  <button
                    type="button"
                    onClick={addStep}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-3 w-3" /> Add step
                  </button>
                </div>
                {steps.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-6 text-center">
                    <ListOrdered className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                    <div className="text-xs font-semibold text-slate-900">No steps yet</div>
                    <p className="text-[11px] text-slate-500 mt-1">Click "Add step" to begin.</p>
                  </div>
                ) : (
                  <ol className="space-y-1.5">
                    {steps.map((step, idx) => {
                      const kind = classifyKind(step.type);
                      const style = KIND_STYLES[kind];
                      const Icon = style.icon;
                      const isSelected = idx === selectedIdx;
                      const isDragging = dragIdx === idx;
                      return (
                        <li
                          key={idx}
                          draggable
                          onDragStart={onDragStart(idx)}
                          onDragOver={onDragOver}
                          onDrop={onDrop(idx)}
                          onDragEnd={onDragEnd}
                          onClick={() => setSelectedIdx(idx)}
                          className={`group flex items-start gap-2 rounded-lg border ${
                            isSelected ? "border-[#EF6C33] ring-1 ring-[#EF6C33]" : "border-slate-200"
                          } bg-white px-2.5 py-1.5 cursor-pointer ${isDragging ? "opacity-40" : ""}`}
                          data-idx={idx}
                        >
                          <span
                            className="cursor-grab text-slate-300 hover:text-slate-500 mt-0.5"
                            title="Drag to reorder"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </span>
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold inline-flex items-center justify-center mt-0.5">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider ${style.bg} ${style.text}`}>
                              <Icon className="h-3 w-3" />
                              {step.type || "?"}
                            </div>
                            <div className="text-[11px] text-slate-600 truncate mt-0.5">
                              {summarizeStep(step)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeStep(idx); }}
                            disabled={steps.length <= 1}
                            title={steps.length <= 1 ? "Tasks must have at least one step" : "Delete this step"}
                            className="text-slate-300 hover:text-rose-500 disabled:opacity-30 disabled:hover:text-slate-300"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              {/* Editor (right column) — shared StepConfigEditor with the
                  type-picker shown (admins change a step's kind in place)
                  and task_call blocked (nested task_call rejected at
                  runtime — see file header). */}
              <div>
                {steps[selectedIdx] ? (
                  <StepConfigEditor
                    step={steps[selectedIdx]}
                    lookups={lookups}
                    onChange={(next) => updateStep(selectedIdx, next)}
                    showTypeSelector
                    disabledKinds={["task_call"]}
                    index={selectedIdx}
                    totalSteps={steps.length}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-[11px] text-slate-500 text-center">
                    Select a step on the left to edit it, or click "Add step".
                  </div>
                )}
              </div>
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

export default SparkTaskEditorModal;

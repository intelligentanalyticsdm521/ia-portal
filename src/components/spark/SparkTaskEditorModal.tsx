// SparkTaskEditorModal — Phase 1 (a54a046) + Phase 2 (this commit) editor for
// SPARK named tasks (lumen.spark_task rows). Backs the SparkTasksPage admin
// surface and the F-CS.3 task_call dropdown (the dropdown lists what this
// modal manages).
//
// Phase 1 (shipped) gave us name + description + read-only step list.
// Phase 2 (this commit) adds:
//   - Overview: description now persists (LUMEN-API migration 046 added the
//     column; routes/sparkTasks.js round-trips it).
//   - Steps tab: per-step inline editor for the F-CS.6 step types, mirroring
//     the F-CS.3 SparkSuggestionsPanel EditDrawer field set:
//       send_email          → subject + template_key
//       send_sms            → message + body + template_key
//       wait                → duration + unit
//       tag/add_tag/remove_tag → tag dropdown
//       update_field        → field dropdown + value
//       branch_*            → condition + (optional) gte / campaign_id
//       goal                → name + when.contact_field + when.equals
//       task_call           → BLOCKED at write-time (the runtime rejects
//                             nested task_call). The Add button doesn't
//                             include it; the validator rejects it.
//   - Add Step button → appends a default "wait 1 day" step and selects it.
//   - Delete step button → removes the step (with a guard: can't delete
//     the last step — the API requires len >= 1).
//   - Simple drag-list reorder (HTML5 drag/drop with index swap). Tasks
//     are usually short (< 10 steps), so the ReactFlow surface from F-CS.3
//     would be overkill. We use a vertical list with a drag handle column.
//
// On the F-CS.3 pattern: the per-kind input components ARE near-identical
// to SparkSuggestionsPanel's EditDrawer. They couldn't be directly imported
// without first refactoring that file to export the inner pieces — see the
// "Followup" note in this commit's summary.
//
// API surface (LUMEN-API batch 8 commit 0bca7a1 + migration 046):
//   GET    /api/v1/spark_tasks/:id   → detail (with steps_json + description)
//   POST   /api/v1/spark_tasks       → create
//   PATCH  /api/v1/spark_tasks/:id   → update
//   DELETE /api/v1/spark_tasks/:id   → soft delete (is_active = 0)
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Save, Trash2, AlertTriangle, Plus, Edit3, ListOrdered, Activity as ActivityIcon,
  Mail, MessageSquare, Clock, GitBranch, Flag, Tag,
  GripVertical, X,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IadmModal, IadmButton } from "../IadmModal";

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
// We store the steps array in normalized {type, config} shape inside the
// editor. On save we POST/PATCH that shape — the runtime + writer both
// accept {step_type, config} and {type, config} interchangeably.
interface NormalStep {
  type: string;
  config: Record<string, unknown>;
}

function normalizeStep(raw: unknown): NormalStep {
  const r = (raw ?? {}) as Record<string, unknown>;
  const type = String(r.step_type || r.type || "").toLowerCase();
  if (r.config && typeof r.config === "object") {
    return { type, config: { ...(r.config as Record<string, unknown>) } };
  }
  // Flat shape — strip discriminators, keep the rest as config.
  const cfg: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === "step_type" || k === "type") continue;
    cfg[k] = v;
  }
  return { type, config: cfg };
}

function normalizeSteps(stepsJson: unknown): NormalStep[] {
  if (!Array.isArray(stepsJson)) return [];
  return (stepsJson as unknown[]).map(normalizeStep);
}

// ── Step kind metadata (mirrors F-CS.3 SparkSuggestionsPanel KIND_STYLES) ──
type StepKind =
  | "send_email" | "send_sms" | "wait" | "branch"
  | "task_call" | "goal" | "tag" | "update_field" | "other";

function classifyKind(type: string): StepKind {
  const t = (type || "").toLowerCase();
  if (t === "send_email" || t === "email") return "send_email";
  if (t === "send_sms" || t === "sms") return "send_sms";
  if (t === "wait" || t === "delay") return "wait";
  if (t.startsWith("branch")) return "branch";
  if (t === "task_call" || t === "call" || t === "task") return "task_call";
  if (t === "goal") return "goal";
  if (t === "tag" || t === "add_tag" || t === "remove_tag") return "tag";
  if (t === "update_field" || t === "set_field") return "update_field";
  return "other";
}

const KIND_STYLES: Record<StepKind, { bg: string; ring: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
  send_email:   { bg: "bg-blue-50",     ring: "ring-blue-300",    text: "text-blue-900",    icon: Mail },
  send_sms:     { bg: "bg-green-50",    ring: "ring-green-300",   text: "text-green-900",   icon: MessageSquare },
  wait:         { bg: "bg-yellow-50",   ring: "ring-yellow-300",  text: "text-yellow-900",  icon: Clock },
  branch:       { bg: "bg-orange-50",   ring: "ring-orange-300",  text: "text-orange-900",  icon: GitBranch },
  task_call:    { bg: "bg-orange-50",   ring: "ring-orange-300",  text: "text-orange-900",  icon: ListOrdered },
  goal:         { bg: "bg-emerald-50",  ring: "ring-emerald-300", text: "text-emerald-900", icon: Flag },
  tag:          { bg: "bg-slate-100",   ring: "ring-slate-300",   text: "text-slate-700",   icon: Tag },
  update_field: { bg: "bg-slate-100",   ring: "ring-slate-300",   text: "text-slate-700",   icon: Edit3 },
  other:        { bg: "bg-slate-50",    ring: "ring-slate-300",   text: "text-slate-700",   icon: Edit3 },
};

// ── Step registry — must match LUMEN-API runtime + validateStepsJson ───────
const UPDATE_FIELD_ALLOWED = [
  "first_name", "last_name", "company", "title",
  "source", "lifecycle_stage", "contact_intelligence_score",
] as const;

const GOAL_CONTACT_FIELDS = [
  "lifecycle_stage", "contact_intelligence_score", "source", "company", "title",
] as const;

// Kinds that the Add Step menu offers. task_call is deliberately excluded —
// the runtime rejects nested task_call (see validateStepsJson in
// routes/sparkTasks.js: "nested task_call not supported in v1"). Showing it
// in the picker would just produce save-time errors, which is worse UX than
// not showing it at all.
const ADD_KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "wait",         label: "Wait (delay)" },
  { value: "send_email",   label: "Send email" },
  { value: "send_sms",     label: "Send SMS" },
  { value: "add_tag",      label: "Add tag" },
  { value: "remove_tag",   label: "Remove tag" },
  { value: "update_field", label: "Update field" },
  { value: "branch_score", label: "Branch on score" },
  { value: "branch_email_opened", label: "Branch on email opened" },
  { value: "goal",         label: "Goal" },
];

// Default config for a freshly-added step. Picked so the result passes
// validateSteps() immediately (no required-field nag the moment you add).
function defaultConfigForKind(type: string): Record<string, unknown> {
  const t = (type || "").toLowerCase();
  if (t === "wait" || t === "delay") return { days: 1 };
  if (t === "send_email" || t === "email") return { subject: "" };
  if (t === "send_sms" || t === "sms") return { message: "" };
  if (t === "add_tag" || t === "remove_tag" || t === "tag") return { tag_name: "" };
  if (t === "update_field" || t === "set_field") return { field: "lifecycle_stage", value: "" };
  if (t === "branch_score") return { gte: 50 };
  if (t === "branch_email_opened") return {};
  if (t.startsWith("branch_")) return {};
  if (t === "goal") return { name: "", when: { contact_field: "lifecycle_stage", equals: "" } };
  return {};
}

// ── Client-side validator (mirrors LUMEN-API validateStepsJson + the
//    F-CS.3 SparkSuggestionsPanel validateSteps function). We run this
//    BEFORE POST/PATCH so the user sees a usable error list instead of a
//    server 400 with a single message about the first failing step.
interface ValidationError { index: number; message: string }
function validateSteps(steps: NormalStep[]): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!steps.length) {
    errs.push({ index: -1, message: "A task must have at least one step." });
    return errs;
  }
  steps.forEach((s, i) => {
    const t = (s.type || "").toLowerCase();
    const cfg = s.config || {};
    if (!t) {
      errs.push({ index: i, message: `Step ${i + 1}: missing type.` });
      return;
    }
    // Mirror server-side guard: nested task_call rejected.
    if (t === "task_call" || t === "call" || t === "task") {
      errs.push({ index: i, message: `Step ${i + 1}: nested task_call is not supported.` });
      return;
    }
    switch (t) {
      case "send_email":
      case "email":
        if (!cfg.template_key && !cfg.template_id && !cfg.subject) {
          errs.push({ index: i, message: `Step ${i + 1} (send_email): need template_key or subject.` });
        }
        break;
      case "send_sms":
      case "sms":
        if (!cfg.template_key && !cfg.template_id && !cfg.message && !cfg.body) {
          errs.push({ index: i, message: `Step ${i + 1} (send_sms): need template_key or message.` });
        }
        break;
      case "wait":
      case "delay": {
        const m = Number(cfg.minutes || 0);
        const h = Number(cfg.hours || 0);
        const d = Number(cfg.days || 0);
        if (m <= 0 && h <= 0 && d <= 0) {
          errs.push({ index: i, message: `Step ${i + 1} (wait): duration must be > 0.` });
        }
        break;
      }
      case "goal":
        if (!cfg.name) errs.push({ index: i, message: `Step ${i + 1} (goal): name is required.` });
        if (!(cfg.when as { contact_field?: string } | undefined)?.contact_field) {
          errs.push({ index: i, message: `Step ${i + 1} (goal): when.contact_field is required.` });
        }
        break;
      case "tag":
      case "add_tag":
      case "remove_tag":
        if (!cfg.tag_name) errs.push({ index: i, message: `Step ${i + 1} (tag): tag_name is required.` });
        break;
      case "update_field":
      case "set_field": {
        if (!cfg.field) {
          errs.push({ index: i, message: `Step ${i + 1} (update_field): field is required.` });
          break;
        }
        const f = String(cfg.field);
        if (!UPDATE_FIELD_ALLOWED.includes(f as typeof UPDATE_FIELD_ALLOWED[number])) {
          errs.push({ index: i, message: `Step ${i + 1} (update_field): "${f}" not allowed. Pick one of ${UPDATE_FIELD_ALLOWED.join(", ")}.` });
        }
        break;
      }
      default:
        if (t.startsWith("branch_")) {
          if (cfg.condition == null && cfg.gte == null && cfg.campaign_id == null) {
            errs.push({ index: i, message: `Step ${i + 1} (${t}): need a condition (gte / campaign_id / condition).` });
          }
        }
        break;
    }
  });
  return errs;
}

// Seed for brand-new tasks. Matches the F-CS.6 runtime contract: non-empty
// array, no nested task_call. A 1-day wait is the cheapest no-op that's
// still meaningful when invoked.
const SEED_STEPS: NormalStep[] = [{ type: "wait", config: { days: 1 } }];

// ── Component ──────────────────────────────────────────────────────────────
export function SparkTaskEditorModal({ open, onClose, taskId, onChanged }: Props) {
  const { get, post, patch, del, ready } = useSparkApi();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<NormalStep[]>(SEED_STEPS);
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

  // Lookups for the inline editor dropdowns. Same as F-CS.3 panel — fetched
  // once on open; failures degrade to text-input fallbacks.
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

  const updateStep = useCallback((idx: number, next: NormalStep) => {
    setSteps((prev) => {
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    });
  }, []);

  const addStep = useCallback(() => {
    setSteps((prev) => {
      const seed: NormalStep = { type: "wait", config: defaultConfigForKind("wait") };
      const next = [...prev, seed];
      // Select the newly-added step so the editor flips to its config
      // immediately. We use the post-append length, not prev.length, to
      // be robust to React 18 strict-mode double invocation.
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
    // After reorder, follow the dragged step to its new index so the
    // user's selected-step focus doesn't jump to whatever happened to
    // land at the old index.
    setSelectedIdx(targetIdx);
    setDragIdx(null);
  };
  const onDragEnd = () => setDragIdx(null);

  async function save() {
    if (!name.trim()) { setError("Name is required."); setTab("overview"); return; }
    // Client-side step validation — surface the full list instead of one
    // 400 at a time. Server runs the same checks defensively.
    const stepErrs = validateSteps(steps);
    if (stepErrs.length) {
      setError(stepErrs.map((e) => e.message).join("\n"));
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

  // ── Lookups passed into the inline editor.
  const lookups = useMemo(
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
                              {summarize(step)}
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

              {/* Editor (right column) */}
              <div>
                {steps[selectedIdx] ? (
                  <StepEditor
                    step={steps[selectedIdx]}
                    index={selectedIdx}
                    totalSteps={steps.length}
                    lookups={lookups}
                    onChange={(next) => updateStep(selectedIdx, next)}
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

// One-line summary of a step for the list view. Mirrors stepLabel() in
// SparkSuggestionsPanel but trimmed for the narrower column here.
function summarize(step: NormalStep): string {
  const t = (step.type || "").toLowerCase();
  const cfg = step.config || {};
  if (t === "send_email" || t === "email") {
    return String(cfg.subject || cfg.template_key || "(no subject)").slice(0, 60);
  }
  if (t === "send_sms" || t === "sms") {
    return String(cfg.message || cfg.body || cfg.template_key || "(no message)").slice(0, 60);
  }
  if (t === "wait" || t === "delay") {
    const d = Number(cfg.days || 0), h = Number(cfg.hours || 0), m = Number(cfg.minutes || 0);
    if (d > 0) return `Wait ${d} day${d === 1 ? "" : "s"}`;
    if (h > 0) return `Wait ${h} hour${h === 1 ? "" : "s"}`;
    if (m > 0) return `Wait ${m} min${m === 1 ? "" : "s"}`;
    return "Wait —";
  }
  if (t.startsWith("branch_")) {
    return String(cfg.condition || cfg.gte != null ? `score >= ${cfg.gte}` : (cfg.campaign_id != null ? `campaign #${cfg.campaign_id}` : t));
  }
  if (t === "goal") return String(cfg.name || "(unnamed goal)").slice(0, 60);
  if (t === "tag" || t === "add_tag") return `Add tag: ${cfg.tag_name || "—"}`;
  if (t === "remove_tag") return `Remove tag: ${cfg.tag_name || "—"}`;
  if (t === "update_field" || t === "set_field") return `${cfg.field || "?"} = ${cfg.value ?? "—"}`;
  return t || "?";
}

// ── StepEditor — inline form for the selected step. ─────────────────────────
// Mirrors the SparkSuggestionsPanel EditDrawer field set + behavior, with
// the kind selector promoted to the top so the user can change a step's
// type in place (the F-CS.3 panel doesn't need that — its kinds are
// dictated by the IL suggestion shape).
interface StepEditorProps {
  step: NormalStep;
  index: number;
  totalSteps: number;
  lookups: {
    emailTemplates: Array<{ id: number; template_key: string; name: string }>;
    smsTemplates:   Array<{ id: number; template_key: string; name: string }>;
    tags:           Array<{ id: number; name: string }>;
  };
  onChange: (next: NormalStep) => void;
}

function StepEditor({ step, index, totalSteps, lookups, onChange }: StepEditorProps) {
  const t = (step.type || "").toLowerCase();
  const cfg = step.config || {};

  const setCfg = (patch: Record<string, unknown>) =>
    onChange({ type: step.type, config: { ...cfg, ...patch } });

  const setType = (nextType: string) =>
    onChange({ type: nextType, config: defaultConfigForKind(nextType) });

  const labelClass = "block text-[10px] uppercase font-semibold text-slate-500 mb-1";
  const inputClass =
    "w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]";

  // wait — single duration + unit. If the existing config has BOTH days and
  // hours set we just pick whichever is non-zero first.
  const waitDays    = Number(cfg.days  || cfg.wait_days  || 0);
  const waitHours   = Number(cfg.hours || cfg.wait_hours || 0);
  const waitMinutes = Number(cfg.minutes || 0);
  const waitUnit: "days" | "hours" | "minutes" =
    waitDays > 0 ? "days" : waitHours > 0 ? "hours" : waitMinutes > 0 ? "minutes" : "days";
  const waitAmount = waitDays || waitHours || waitMinutes || 1;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-slate-700">
          Edit step {index + 1} of {totalSteps}{" "}
          <span className="text-slate-400">· {t || "unknown"}</span>
        </div>
      </div>

      <div>
        <label className={labelClass}>Step type</label>
        <select
          className={inputClass}
          value={step.type}
          onChange={(e) => setType(e.target.value)}
        >
          {/* Include the current step.type even if it's not in ADD_KIND_OPTIONS
              (e.g. a legacy step that came in via DB seed). That way the user
              isn't surprised by the picker silently switching their step. */}
          {!ADD_KIND_OPTIONS.find((k) => k.value === step.type) && step.type && (
            <option value={step.type}>{step.type} (current)</option>
          )}
          {ADD_KIND_OPTIONS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
        <p className="text-[10px] text-slate-500 mt-0.5">
          Changing type resets this step's config. task_call is intentionally not offered — nested task_call is rejected by the runtime.
        </p>
      </div>

      {/* send_email */}
      {(t === "send_email" || t === "email") && (
        <>
          <div>
            <label className={labelClass}>Subject</label>
            <input
              className={inputClass}
              value={String(cfg.subject || "")}
              onChange={(e) => setCfg({ subject: e.target.value })}
              placeholder="Re: your recent activity"
            />
          </div>
          <div>
            <label className={labelClass}>Template</label>
            <select
              className={inputClass}
              value={String(cfg.template_key || "")}
              onChange={(e) => setCfg({ template_key: e.target.value || null })}
            >
              <option value="">(no template — use subject + body)</option>
              {lookups.emailTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.template_key}>{tpl.name} ({tpl.template_key})</option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* send_sms — subject N/A; message + optional body + template */}
      {(t === "send_sms" || t === "sms") && (
        <>
          <div>
            <label className={labelClass}>Message</label>
            <textarea
              className={inputClass}
              rows={3}
              value={String(cfg.message || "")}
              onChange={(e) => setCfg({ message: e.target.value })}
              placeholder="Hi {{first_name}}, quick follow-up — reply STOP to opt out."
            />
          </div>
          <div>
            <label className={labelClass}>Body (optional alternate)</label>
            <textarea
              className={inputClass}
              rows={2}
              value={String(cfg.body || "")}
              onChange={(e) => setCfg({ body: e.target.value })}
              placeholder="Used if `message` is empty"
            />
          </div>
          <div>
            <label className={labelClass}>Template (optional)</label>
            <select
              className={inputClass}
              value={String(cfg.template_key || "")}
              onChange={(e) => setCfg({ template_key: e.target.value || null })}
            >
              <option value="">(no template — use message)</option>
              {lookups.smsTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.template_key}>{tpl.name} ({tpl.template_key})</option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* wait */}
      {(t === "wait" || t === "delay") && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelClass}>Duration</label>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={waitAmount}
              onChange={(e) => {
                const n = Math.max(0, parseInt(e.target.value || "0", 10) || 0);
                setCfg({
                  days:    waitUnit === "days"    ? n : undefined,
                  hours:   waitUnit === "hours"   ? n : undefined,
                  minutes: waitUnit === "minutes" ? n : undefined,
                  wait_days: undefined,
                  wait_hours: undefined,
                });
              }}
            />
          </div>
          <div className="flex-1">
            <label className={labelClass}>Unit</label>
            <select
              className={inputClass}
              value={waitUnit}
              onChange={(e) => {
                const unit = e.target.value as "days" | "hours" | "minutes";
                setCfg({
                  days:    unit === "days"    ? waitAmount : undefined,
                  hours:   unit === "hours"   ? waitAmount : undefined,
                  minutes: unit === "minutes" ? waitAmount : undefined,
                  wait_days: undefined,
                  wait_hours: undefined,
                });
              }}
            >
              <option value="days">days</option>
              <option value="hours">hours</option>
              <option value="minutes">minutes</option>
            </select>
          </div>
        </div>
      )}

      {/* tag / add_tag / remove_tag */}
      {(t === "tag" || t === "add_tag" || t === "remove_tag") && (
        <div>
          <label className={labelClass}>Tag</label>
          <select
            className={inputClass}
            value={String(cfg.tag_name || cfg.tag || "")}
            onChange={(e) => setCfg({ tag_name: e.target.value, tag: undefined })}
          >
            <option value="">(pick a tag)</option>
            {lookups.tags.map((tag) => (
              <option key={tag.id} value={tag.name}>{tag.name}</option>
            ))}
          </select>
          <div className="mt-1 text-[10px] text-slate-500">
            Tags matched by name at runtime (auto-created if missing).
          </div>
        </div>
      )}

      {/* update_field */}
      {(t === "update_field" || t === "set_field") && (
        <>
          <div>
            <label className={labelClass}>Field</label>
            <select
              className={inputClass}
              value={String(cfg.field || "")}
              onChange={(e) => setCfg({ field: e.target.value || null })}
            >
              <option value="">(pick a field)</option>
              {UPDATE_FIELD_ALLOWED.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Value</label>
            <input
              className={inputClass}
              value={String(cfg.value ?? "")}
              onChange={(e) => setCfg({ value: e.target.value })}
              placeholder="engaged"
            />
          </div>
        </>
      )}

      {/* branch_* */}
      {t.startsWith("branch_") && (
        <>
          <div>
            <label className={labelClass}>Branch type</label>
            <div className="text-xs text-slate-700 font-mono">{t}</div>
          </div>
          <div>
            <label className={labelClass}>Condition (free-form description)</label>
            <input
              className={inputClass}
              value={String(cfg.condition || "")}
              onChange={(e) => setCfg({ condition: e.target.value || null })}
              placeholder={t === "branch_score" ? "lead_score >= 50" : "email opened in last 7d"}
            />
          </div>
          {t === "branch_score" && (
            <div>
              <label className={labelClass}>Score threshold (gte)</label>
              <input
                type="number"
                className={inputClass}
                value={cfg.gte != null ? Number(cfg.gte) : ""}
                onChange={(e) =>
                  setCfg({ gte: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })
                }
                placeholder="50"
              />
            </div>
          )}
          {t === "branch_email_opened" && (
            <div>
              <label className={labelClass}>Campaign ID (optional)</label>
              <input
                type="number"
                className={inputClass}
                value={cfg.campaign_id != null ? Number(cfg.campaign_id) : ""}
                onChange={(e) =>
                  setCfg({ campaign_id: e.target.value === "" ? null : Math.max(1, parseInt(e.target.value, 10) || 0) })
                }
                placeholder="(any campaign)"
              />
            </div>
          )}
        </>
      )}

      {/* goal */}
      {t === "goal" && (
        <>
          <div>
            <label className={labelClass}>Goal name</label>
            <input
              className={inputClass}
              value={String(cfg.name || "")}
              onChange={(e) => setCfg({ name: e.target.value })}
              placeholder="converted_to_customer"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelClass}>Contact field</label>
              <select
                className={inputClass}
                value={String((cfg.when as { contact_field?: string } | undefined)?.contact_field || "")}
                onChange={(e) =>
                  setCfg({
                    when: {
                      ...((cfg.when as Record<string, unknown> | undefined) || {}),
                      contact_field: e.target.value,
                    },
                  })
                }
              >
                <option value="">(pick a field)</option>
                {GOAL_CONTACT_FIELDS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className={labelClass}>Equals</label>
              <input
                className={inputClass}
                value={String((cfg.when as { equals?: string } | undefined)?.equals ?? "")}
                onChange={(e) =>
                  setCfg({
                    when: {
                      ...((cfg.when as Record<string, unknown> | undefined) || {}),
                      equals: e.target.value,
                    },
                  })
                }
                placeholder="active_customer"
              />
            </div>
          </div>
        </>
      )}

      {/* task_call — show informational message, do NOT offer fields. */}
      {(t === "task_call" || t === "call" || t === "task") && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
          Nested task_call is not allowed inside a task. Change the type above to a different step kind, or delete this step.
        </div>
      )}

      {/* fallback — unrecognized type */}
      {!["send_email", "email", "send_sms", "sms", "wait", "delay",
         "task_call", "call", "task", "goal",
         "tag", "add_tag", "remove_tag",
         "update_field", "set_field"].includes(t) &&
       !t.startsWith("branch_") && (
          <div className="text-[11px] text-slate-500">
            No inline editor for "{t}" steps. Switch to a different type above, or remove this step.
          </div>
       )}
    </div>
  );
}

export default SparkTaskEditorModal;

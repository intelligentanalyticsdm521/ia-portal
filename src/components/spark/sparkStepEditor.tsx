// sparkStepEditor — shared per-step config editor for the F-CS.6 SPARK step
// registry. Extracted from SparkSuggestionsPanel.tsx (EditDrawer) and
// SparkTaskEditorModal.tsx (StepEditor) which had ~200 lines of duplicated
// per-kind field renderers, validators, and constants each.
//
// Single source of truth for:
//   - the F-CS.6 step-type registry (kind classification, default config,
//     ADD picker, KIND_STYLES)
//   - per-kind input form (subject/template, message/body/template,
//     duration+unit, tag picker, field+value, branch_score gte,
//     branch_email_opened campaign_id, goal name+when, task_call picker)
//   - normalizeStep — accepts either `{step_type, config}` or `{type, ...flat}`
//     and returns `{type, config}`
//   - validateSteps — returns `{ valid, errors: { stepIndex, message }[] }`
//
// Future SPARK step-kind changes (new kind, renamed field, expanded validator)
// only happen here.
//
// Callers:
//   - SparkSuggestionsPanel (IL rule customize) — passes `showTypeSelector={false}`
//     because the IL suggestion shape dictates the kind.
//   - SparkTaskEditorModal (named-task editor) — passes
//     `disabledKinds={['task_call']}` because the runtime rejects nested
//     task_call inside a task.
//
// Mirrors LUMEN-API runtime in `routes/sparkTasks.js` (validateStepsJson) +
// `lib/automationRuntime.js` (per-kind executors). Keep this file aligned
// when those change.
import type { ComponentType } from "react";
import {
  Mail, MessageSquare, Clock, GitBranch, Phone, Flag, Tag, Edit3,
} from "lucide-react";

// ── Public types ────────────────────────────────────────────────────────────
export type StepConfig = Record<string, unknown>;

/** Normalized in-editor step shape. Wire shape may be {step_type, config}; we
 *  always work in {type, config} inside the editor and let the caller pick
 *  the wire encoding on POST/PATCH. */
export interface Step {
  type: string;
  config: StepConfig;
}

/** Lookup data for the editor's dropdowns. sparkTasks is optional because
 *  task_call only appears in the suggestions editor — the task editor blocks
 *  nested task_call entirely. */
export interface SparkLookups {
  emailTemplates: Array<{ id: number; template_key: string; name: string }>;
  smsTemplates:   Array<{ id: number; template_key: string; name: string }>;
  tags:           Array<{ id: number; name: string }>;
  sparkTasks?:    Array<{ task_id: number; name: string; step_count?: number }>;
}

/** Coarse kind buckets used for icon/color styling. Distinct from the wire
 *  `step.type` string (which can include branch_score / branch_email_opened
 *  variants that all collapse to the "branch" bucket). */
export type StepKind =
  | "send_email" | "send_sms" | "wait" | "branch"
  | "task_call" | "goal" | "tag" | "update_field" | "other";

// ── Constants exported for callers + node renderers ─────────────────────────
/** Contact columns the `update_field` step is allowed to write. Mirrors
 *  `routes/sparkTasks.js` UPDATE_FIELD_ALLOWED. Adding here without adding
 *  there will fail at runtime. */
export const UPDATE_FIELD_ALLOWED = [
  "first_name",
  "last_name",
  "company",
  "title",
  "source",
  "lifecycle_stage",
  "contact_intelligence_score",
] as const;

/** Fields a `goal` step may compare against on the contact row. */
export const GOAL_CONTACT_FIELDS = [
  "lifecycle_stage",
  "contact_intelligence_score",
  "source",
  "company",
  "title",
] as const;

/** Type-picker options (also seeds defaultConfigForKind). task_call is in this
 *  list so the suggestions editor can offer it; callers that want to forbid
 *  it (e.g. task editor) pass `disabledKinds={['task_call']}`. */
export const ADD_KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "wait",                label: "Wait (delay)" },
  { value: "send_email",          label: "Send email" },
  { value: "send_sms",            label: "Send SMS" },
  { value: "add_tag",             label: "Add tag" },
  { value: "remove_tag",          label: "Remove tag" },
  { value: "update_field",        label: "Update field" },
  { value: "branch_score",        label: "Branch on score" },
  { value: "branch_email_opened", label: "Branch on email opened" },
  { value: "goal",                label: "Goal" },
  { value: "task_call",           label: "Call task" },
];

/** Visual style + icon per coarse kind. Re-exported so the suggestions panel
 *  ReactFlow node renderer can use the same palette. */
export const KIND_STYLES: Record<StepKind, { bg: string; ring: string; text: string; icon: ComponentType<{ className?: string }> }> = {
  send_email:   { bg: "bg-blue-50",     ring: "ring-blue-300",    text: "text-blue-900",    icon: Mail },
  send_sms:     { bg: "bg-green-50",    ring: "ring-green-300",   text: "text-green-900",   icon: MessageSquare },
  wait:         { bg: "bg-yellow-50",   ring: "ring-yellow-300",  text: "text-yellow-900",  icon: Clock },
  branch:       { bg: "bg-orange-50",   ring: "ring-orange-300",  text: "text-orange-900",  icon: GitBranch },
  task_call:    { bg: "bg-orange-50",   ring: "ring-orange-300",  text: "text-orange-900",  icon: Phone },
  goal:         { bg: "bg-emerald-50",  ring: "ring-emerald-300", text: "text-emerald-900", icon: Flag },
  tag:          { bg: "bg-slate-100",   ring: "ring-slate-300",   text: "text-slate-700",   icon: Tag },
  update_field: { bg: "bg-slate-100",   ring: "ring-slate-300",   text: "text-slate-700",   icon: Edit3 },
  other:        { bg: "bg-slate-50",    ring: "ring-slate-300",   text: "text-slate-700",   icon: Edit3 },
};

// ── Pure helpers ────────────────────────────────────────────────────────────
/** Classify a wire `step.type` string into a coarse StepKind for styling.
 *  Mirrors the legacy classifyStep + classifyKind helpers. */
export function classifyKind(type: string): StepKind {
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

/** Default config seed for a freshly-added or freshly-type-changed step.
 *  Picked so the result passes validateSteps() immediately (no required-field
 *  nag the moment you add). */
export function defaultConfigForKind(kind: string): StepConfig {
  const t = (kind || "").toLowerCase();
  if (t === "wait" || t === "delay") return { days: 1 };
  if (t === "send_email" || t === "email") return { subject: "" };
  if (t === "send_sms" || t === "sms") return { message: "" };
  if (t === "add_tag" || t === "remove_tag" || t === "tag") return { tag_name: "" };
  if (t === "update_field" || t === "set_field") return { field: "lifecycle_stage", value: "" };
  if (t === "branch_score") return { gte: 50 };
  if (t === "branch_email_opened") return {};
  if (t.startsWith("branch_")) return {};
  if (t === "goal") return { name: "", when: { contact_field: "lifecycle_stage", equals: "" } };
  if (t === "task_call" || t === "call" || t === "task") return {};
  return {};
}

/** Coerce either `{step_type, config}` (wire/IL shape) or `{type, ...flat}`
 *  (legacy suggestions shape) into `{type, config}`. Also lowercases the
 *  type discriminator. */
export function normalizeStep(raw: unknown): Step {
  const r = (raw ?? {}) as Record<string, unknown>;
  const type = String(r.step_type || r.type || "").toLowerCase();
  if (r.config && typeof r.config === "object") {
    return { type, config: { ...(r.config as StepConfig) } };
  }
  // Flat shape — strip discriminators, keep the rest as config.
  const cfg: StepConfig = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === "step_type" || k === "type") continue;
    cfg[k] = v;
  }
  return { type, config: cfg };
}

/** Validate a list of steps against the F-CS.6 registry. Returns the spec's
 *  `{ valid, errors }` shape so callers can short-circuit on `valid`. */
export interface StepValidationError {
  stepIndex: number;
  message: string;
}
export interface StepValidationResult {
  valid: boolean;
  errors: StepValidationError[];
}

export function validateSteps(steps: Step[]): StepValidationResult {
  const errors: StepValidationError[] = [];
  if (!steps.length) {
    errors.push({ stepIndex: -1, message: "No steps — add at least one before saving." });
    return { valid: false, errors };
  }
  steps.forEach((s, i) => {
    const t = (s.type || "").toLowerCase();
    const cfg = s.config || {};
    if (!t) {
      errors.push({ stepIndex: i, message: `Step ${i + 1}: missing type.` });
      return;
    }
    switch (t) {
      case "send_email":
      case "email":
        if (!cfg.template_key && !cfg.template_id && !cfg.subject) {
          errors.push({ stepIndex: i, message: `Step ${i + 1} (send_email): need template_key or subject.` });
        }
        break;
      case "send_sms":
      case "sms":
        if (!cfg.template_key && !cfg.template_id && !cfg.message && !cfg.body) {
          errors.push({ stepIndex: i, message: `Step ${i + 1} (send_sms): need template_key or message.` });
        }
        break;
      case "wait":
      case "delay": {
        const m = Number(cfg.minutes || 0);
        const h = Number(cfg.hours || 0);
        const d = Number(cfg.days || 0);
        if (m <= 0 && h <= 0 && d <= 0) {
          errors.push({ stepIndex: i, message: `Step ${i + 1} (wait): duration must be > 0.` });
        }
        break;
      }
      case "task_call":
      case "call":
      case "task":
        if (cfg.task_id == null && !cfg.task_name) {
          errors.push({ stepIndex: i, message: `Step ${i + 1} (task_call): need task_id or task_name.` });
        }
        break;
      case "goal":
        if (!cfg.name) {
          errors.push({ stepIndex: i, message: `Step ${i + 1} (goal): name is required.` });
        }
        if (!(cfg.when as { contact_field?: string } | undefined)?.contact_field) {
          errors.push({ stepIndex: i, message: `Step ${i + 1} (goal): when.contact_field is required.` });
        }
        break;
      case "tag":
      case "add_tag":
      case "remove_tag":
        if (!cfg.tag_name) {
          errors.push({ stepIndex: i, message: `Step ${i + 1} (tag): tag_name is required.` });
        }
        break;
      case "update_field":
      case "set_field": {
        if (!cfg.field) {
          errors.push({ stepIndex: i, message: `Step ${i + 1} (update_field): field is required.` });
          break;
        }
        const f = String(cfg.field);
        if (!UPDATE_FIELD_ALLOWED.includes(f as (typeof UPDATE_FIELD_ALLOWED)[number])) {
          errors.push({
            stepIndex: i,
            message: `Step ${i + 1} (update_field): "${f}" is not an allowed field. Pick one of ${UPDATE_FIELD_ALLOWED.join(", ")}.`,
          });
        }
        break;
      }
      default:
        if (t.startsWith("branch_")) {
          // Runtime supports branch_score (gte) + branch_email_opened. We
          // don't hard-fail when the config has a free-form `condition` —
          // legacy suggestions arrive that way — but we do require something.
          if (cfg.condition == null && cfg.gte == null && cfg.campaign_id == null) {
            errors.push({ stepIndex: i, message: `Step ${i + 1} (${t}): need a condition (gte / campaign_id / condition).` });
          }
        }
        // Unknown types pass through — server-side validates against the
        // current registry; client just sanity-checks the common shapes.
        break;
    }
  });
  return { valid: errors.length === 0, errors };
}

// ── StepConfigEditor ────────────────────────────────────────────────────────
/** Optional one-line summary helper for list/kanban renderers. Trimmed for
 *  narrow columns. Mirrors the legacy stepLabel + summarize helpers. */
export function summarizeStep(step: Step): string {
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
    if (cfg.gte != null) return `score >= ${cfg.gte}`;
    if (cfg.campaign_id != null) return `campaign #${cfg.campaign_id}`;
    return String(cfg.condition || t);
  }
  if (t === "goal") return String(cfg.name || "(unnamed goal)").slice(0, 60);
  if (t === "tag" || t === "add_tag") return `Add tag: ${cfg.tag_name || "—"}`;
  if (t === "remove_tag") return `Remove tag: ${cfg.tag_name || "—"}`;
  if (t === "update_field" || t === "set_field") return `${cfg.field || "?"} = ${cfg.value ?? "—"}`;
  if (t === "task_call" || t === "call" || t === "task") {
    return String(cfg.task_name || (cfg.task_id != null ? `Task #${cfg.task_id}` : "(no task)")).slice(0, 60);
  }
  return t || "?";
}

export interface StepConfigEditorProps {
  step: Step;
  lookups: SparkLookups;
  onChange: (next: Step) => void;
  /** When false, the type selector at the top is hidden (suggestions editor
   *  keeps the IL-decided kind locked). Default true. */
  showTypeSelector?: boolean;
  /** Kinds removed from the type-picker dropdown AND blocked at change-type.
   *  If the current step's kind is in this list (e.g. legacy data), the
   *  editor shows an informational banner instead of fields. */
  disabledKinds?: string[];
  /** Optional whitelist — when set, only these wire kinds appear in the
   *  picker (overrides ADD_KIND_OPTIONS). disabledKinds still filters this
   *  list. */
  allowedKinds?: string[];
  /** 1-indexed position label ("Edit step N of M"). Omit to hide the header. */
  index?: number;
  totalSteps?: number;
}

export function StepConfigEditor({
  step,
  lookups,
  onChange,
  showTypeSelector = true,
  disabledKinds,
  allowedKinds,
  index,
  totalSteps,
}: StepConfigEditorProps) {
  const t = (step.type || "").toLowerCase();
  const cfg = step.config || {};
  const disabledSet = new Set((disabledKinds || []).map((k) => k.toLowerCase()));

  const setCfg = (patch: StepConfig) =>
    onChange({ type: step.type, config: { ...cfg, ...patch } });

  const setType = (nextType: string) =>
    onChange({ type: nextType, config: defaultConfigForKind(nextType) });

  const labelClass = "block text-[10px] uppercase font-semibold text-slate-500 mb-1";
  const inputClass =
    "w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]";

  // wait — single duration + unit. If existing config has BOTH days and hours
  // set we pick whichever is non-zero first.
  const waitDays    = Number(cfg.days  || cfg.wait_days  || 0);
  const waitHours   = Number(cfg.hours || cfg.wait_hours || 0);
  const waitMinutes = Number(cfg.minutes || 0);
  const waitUnit: "days" | "hours" | "minutes" =
    waitDays > 0 ? "days" : waitHours > 0 ? "hours" : waitMinutes > 0 ? "minutes" : "days";
  const waitAmount = waitDays || waitHours || waitMinutes || 1;

  // Whitelist applied first, then disabledSet strips entries from the picker.
  const pickerOptions = (allowedKinds && allowedKinds.length
    ? ADD_KIND_OPTIONS.filter((k) => allowedKinds.map((a) => a.toLowerCase()).includes(k.value))
    : ADD_KIND_OPTIONS
  ).filter((k) => !disabledSet.has(k.value));

  const currentKindBlocked = disabledSet.has(t);

  // Header — only shown when index/totalSteps are provided. The suggestions
  // editor wants it; some callers (e.g. inline edits in a wizard) may not.
  const header =
    typeof index === "number" && typeof totalSteps === "number" ? (
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-slate-700">
          Edit step {index + 1} of {totalSteps}{" "}
          <span className="text-slate-400">· {t || "unknown"}</span>
        </div>
      </div>
    ) : null;

  // task_call dropdown source. Only available when lookups.sparkTasks is
  // provided AND task_call is not disabled by the caller.
  const sparkTasks = lookups.sparkTasks || [];

  // Compute task_call picker state up-front so the JSX stays readable.
  const taskCallCurrentId = cfg.task_id != null ? Number(cfg.task_id) : null;
  const knownTaskIds = new Set(sparkTasks.map((tk) => tk.task_id));
  const taskInList = taskCallCurrentId != null && knownTaskIds.has(taskCallCurrentId);
  const taskIsCustom =
    (taskCallCurrentId != null && !taskInList) ||
    (taskCallCurrentId == null && !!cfg.task_name);
  const taskSelectValue = taskIsCustom
    ? "__custom__"
    : (taskInList ? String(taskCallCurrentId) : "");

  const recognizedKinds = new Set([
    "send_email", "email", "send_sms", "sms", "wait", "delay",
    "task_call", "call", "task", "goal",
    "tag", "add_tag", "remove_tag",
    "update_field", "set_field",
  ]);
  const isRecognized = recognizedKinds.has(t) || t.startsWith("branch_");

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5">
      {header}

      {/* Type selector — top-of-editor, opt-in. */}
      {showTypeSelector && (
        <div>
          <label className={labelClass}>Step type</label>
          <select
            className={inputClass}
            value={step.type}
            onChange={(e) => setType(e.target.value)}
          >
            {/* Surface the current type even if it's not in the picker (e.g.
                legacy step that came in via DB seed or a disabled kind). */}
            {!pickerOptions.find((k) => k.value === step.type) && step.type && (
              <option value={step.type}>{step.type} (current)</option>
            )}
            {pickerOptions.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Changing type resets this step's config.
            {disabledSet.size > 0 && (
              <> Disabled kinds: <span className="font-mono">{[...disabledSet].join(", ")}</span>.</>
            )}
          </p>
        </div>
      )}

      {/* Disabled-kind banner — current step is something the caller forbids
          (e.g. legacy nested task_call inside a task). Don't render fields;
          tell the user to switch or delete. */}
      {currentKindBlocked && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
          The "{t}" step kind is not allowed in this context. Change the type
          above to a different kind, or delete this step.
        </div>
      )}

      {/* send_email */}
      {!currentKindBlocked && (t === "send_email" || t === "email") && (
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
                <option key={tpl.id} value={tpl.template_key}>
                  {tpl.name} ({tpl.template_key})
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* send_sms */}
      {!currentKindBlocked && (t === "send_sms" || t === "sms") && (
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
          {/* Optional alternate body — kept for the task editor surface; the
              suggestions editor historically only had Message but the runtime
              accepts both. Empty body just stays unsaved. */}
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
                <option key={tpl.id} value={tpl.template_key}>
                  {tpl.name} ({tpl.template_key})
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* wait */}
      {!currentKindBlocked && (t === "wait" || t === "delay") && (
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
                // Reset all three so we don't leave a stale value lingering
                // when the user changes unit.
                setCfg({
                  days: waitUnit === "days" ? n : undefined,
                  hours: waitUnit === "hours" ? n : undefined,
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
                  days: unit === "days" ? waitAmount : undefined,
                  hours: unit === "hours" ? waitAmount : undefined,
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

      {/* task_call — only when lookups.sparkTasks is provided AND task_call
          isn't disabled. Falls back to custom-id input. */}
      {!currentKindBlocked && (t === "task_call" || t === "call" || t === "task") && (
        <div className="space-y-2">
          <div>
            <label className={labelClass}>Task</label>
            <select
              className={inputClass}
              value={taskSelectValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  setCfg({ task_id: null, task_name: undefined });
                } else if (v === "__custom__") {
                  setCfg({ task_id: null, task_name: undefined });
                } else {
                  setCfg({ task_id: parseInt(v, 10), task_name: undefined });
                }
              }}
            >
              <option value="">(pick a task)</option>
              {sparkTasks.map((tk) => (
                <option key={tk.task_id} value={String(tk.task_id)}>
                  {tk.name}
                  {tk.step_count ? ` — ${tk.step_count} step${tk.step_count === 1 ? "" : "s"}` : ""}
                </option>
              ))}
              <option value="__custom__">Custom task_id…</option>
            </select>
            <div className="mt-1 text-[10px] text-slate-500">
              {sparkTasks.length
                ? `Choose a saved task from this tenant or pick "Custom task_id" to reference one by id.`
                : `No named tasks yet — create one in the IL admin or use "Custom task_id" to reference an existing row in lumen.spark_task.`}
            </div>
          </div>
          {taskIsCustom && (
            <>
              <div>
                <label className={labelClass}>Custom task ID</label>
                <input
                  type="number"
                  className={inputClass}
                  value={cfg.task_id != null ? Number(cfg.task_id) : ""}
                  onChange={(e) =>
                    setCfg({
                      task_id: e.target.value === "" ? null : Math.max(1, parseInt(e.target.value, 10) || 0),
                    })
                  }
                  placeholder="123"
                />
                <div className="mt-1 text-[10px] text-slate-500">
                  References a row in lumen.spark_task by id. Use task name instead if you don't have the id.
                </div>
              </div>
              <div>
                <label className={labelClass}>Task name (optional)</label>
                <input
                  className={inputClass}
                  value={String(cfg.task_name || "")}
                  onChange={(e) => setCfg({ task_name: e.target.value || null })}
                  placeholder="welcome-call"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* branch_* */}
      {!currentKindBlocked && t.startsWith("branch_") && (
        <>
          <div>
            <label className={labelClass}>Branch type</label>
            <div className="text-xs text-slate-700 font-mono">{t}</div>
          </div>
          <div>
            <label className={labelClass}>Condition</label>
            <input
              className={inputClass}
              value={String(cfg.condition || "")}
              onChange={(e) => setCfg({ condition: e.target.value || null })}
              placeholder={t === "branch_score" ? "lead_score >= 50" : "email opened in last 7d"}
            />
            <div className="mt-1 text-[10px] text-slate-500">
              Free-form description shown in the editor. Runtime evaluates the structured fields below.
            </div>
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
      {!currentKindBlocked && t === "goal" && (
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

      {/* tag */}
      {!currentKindBlocked && (t === "tag" || t === "add_tag" || t === "remove_tag") && (
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
      {!currentKindBlocked && (t === "update_field" || t === "set_field") && (
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

      {/* fallback — unrecognized type. Only shown if the kind isn't disabled
          (a disabled kind already has its own banner above). */}
      {!currentKindBlocked && !isRecognized && (
        <div className="text-[11px] text-slate-500">
          No inline editor for "{t}" steps. {showTypeSelector
            ? "Switch to a different type above, or remove this step."
            : "Edit the steps_json directly in the IL rules admin page if you need to change this step."}
        </div>
      )}
    </div>
  );
}

export default StepConfigEditor;

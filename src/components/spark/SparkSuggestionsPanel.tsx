// SparkSuggestionsPanel — F-CS.2 view + F-CS.3 inline customize editor.
//
// Renders inside SparkCampaignComposerModal as the "Suggestions" tab. Each
// open suggestion (status='proposed') becomes a card with:
//   - Header: rule name + score band + contact (when present)
//   - ReactFlow graph rendering the suggested_steps top-to-bottom, one node
//     per step. Node colors/shapes follow the spec in F-CS.6:
//       send_email           rounded blue
//       send_sms             rounded green
//       wait                 yellow w/ duration label
//       branch_*             diamond (orange)
//       task_call            orange (CRM activity or sub-automation)
//       goal                 filled green dot
//       tag / update_field   grey utility nodes
//   - Accept    → POST /api/v1/il/suggestions/:id/accept
//   - Dismiss   → POST /api/v1/il/suggestions/:id/dismiss
//   - Customize → enters edit mode for the *rule* (NOT the suggestion).
//
// Edit mode (F-CS.3):
//   - ReactFlow becomes controlled: nodes draggable along Y so the user can
//     reorder. After each drag we sort by current y and rebuild edges.
//   - An inline drawer below the graph exposes per-node fields for the
//     currently-selected node (subject + template_key for send_email, etc).
//   - Save  → POST /api/v1/il/rules/:rule_id/customize  body { steps }.
//             The rule_override row is now mode='customize' with the new
//             steps_json. The runtime will use these on the NEXT match.
//   - Cancel → discard draft + back to view-only.
//   - Validation: rebuilt steps_json is sanity-checked against the F-CS.6
//     step-type registry shape before submitting. Invalid configs fail
//     client-side, not at runtime.
//
// v1 scope guardrails:
//   - Linear top-to-bottom only — no branch-target rewiring (the runtime
//     supports it, but the editor doesn't surface it; future F-CS task).
//   - No ADD-node — you can only edit/reorder existing steps. Add-node
//     would mean dropping a sidebar palette + per-kind blank configs, which
//     is the next iteration.
//
// Data layer + endpoints shipped in batch 5 (LUMEN-API d7964eb,
// routes/ilRules.js).
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeProps,
  type NodeChange,
  applyNodeChanges,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { Check, X, Pencil, Mail, MessageSquare, Clock, GitBranch, Phone, Flag, Tag, Edit3, Save, Undo2 } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";

// ── Suggestion + step types ─────────────────────────────────────────────────
interface SuggestionStep {
  step_type?: string;
  type?: string;
  config?: Record<string, unknown>;
  // Loose pass-through for legacy/flat configs.
  [key: string]: unknown;
}

interface Suggestion {
  suggestion_id: number;
  contact_id: number;
  rule_id: number;
  rule_key: string;
  rule_name: string;
  score_at_match: number | null;
  score_band_min: number | null;
  score_band_max: number | null;
  status: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  suggested_steps: SuggestionStep[];
}

interface Props {
  /** Optional contact filter — when set, only suggestions for this contact load. */
  contactId?: number | null;
  /** Called after the user accepts a suggestion (parent can refresh + close). */
  onAccepted?: (automationId: number, suggestionId: number) => void;
  /** Called after the user dismisses a suggestion (parent may want to refresh). */
  onDismissed?: (suggestionId: number) => void;
  /** Called after the user saves a customized rule (parent may want to refresh). */
  onCustomized?: (ruleId: number) => void;
}

// ── Node styling ────────────────────────────────────────────────────────────
type StepKind = "send_email" | "send_sms" | "wait" | "branch" | "task_call" | "goal" | "tag" | "update_field" | "other";

function classifyStep(step: SuggestionStep): StepKind {
  const t = String(step.step_type || step.type || "").toLowerCase();
  if (t.startsWith("send_email") || t === "email") return "send_email";
  if (t.startsWith("send_sms") || t === "sms") return "send_sms";
  if (t === "wait" || t === "delay") return "wait";
  if (t.startsWith("branch")) return "branch";
  if (t === "task_call" || t === "call" || t === "task") return "task_call";
  if (t === "goal") return "goal";
  if (t === "tag" || t === "add_tag" || t === "remove_tag") return "tag";
  if (t === "update_field" || t === "set_field") return "update_field";
  return "other";
}

// Normalize a step to a uniform shape: { type, config }. The suggestions API
// may hand us either { step_type, config } or { type, ...flat }. The editor
// rewrites everything to { type, config } so the saved JSON is consistent.
function normalizeStep(step: SuggestionStep): { type: string; config: Record<string, unknown> } {
  const type = String(step.step_type || step.type || "").toLowerCase();
  if (step.config && typeof step.config === "object") {
    return { type, config: { ...(step.config as Record<string, unknown>) } };
  }
  // Flat shape — strip the discriminator keys, keep everything else as config.
  const cfg: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(step)) {
    if (k === "step_type" || k === "type") continue;
    cfg[k] = v;
  }
  return { type, config: cfg };
}

function stepLabel(step: SuggestionStep): string {
  const t = String(step.step_type || step.type || "step");
  const cfg = (step.config as Record<string, unknown>) || (step as Record<string, unknown>);
  switch (classifyStep(step)) {
    case "send_email": {
      const subject = (cfg.subject as string) || (cfg.template_name as string) || (cfg.template_key as string) || "Email";
      return String(subject).slice(0, 60);
    }
    case "send_sms": {
      const body = (cfg.body as string) || (cfg.message as string) || (cfg.content_sms as string) || "SMS";
      return String(body).slice(0, 60);
    }
    case "wait": {
      const dur = (cfg.duration as string) || (cfg.delay as string) ||
        (cfg.days ? `${cfg.days}d` : null) ||
        (cfg.hours ? `${cfg.hours}h` : null) ||
        (cfg.minutes ? `${cfg.minutes}m` : null) ||
        (cfg.wait_days ? `${cfg.wait_days}d` : null) ||
        (cfg.wait_hours ? `${cfg.wait_hours}h` : null) || "wait";
      return `Wait ${dur}`;
    }
    case "branch": {
      const cond = (cfg.condition as string) || t.replace(/^branch_/, "").replace(/_/g, " ");
      return `If ${cond}?`;
    }
    case "task_call": {
      const title = (cfg.title as string) || (cfg.task_name as string) ||
        (cfg.task_id != null ? `Task #${cfg.task_id}` : "Call task");
      return String(title).slice(0, 60);
    }
    case "goal":
      return (cfg.name as string) || "Goal";
    case "tag":
      return `${t === "remove_tag" ? "Remove" : "Add"} tag: ${(cfg.tag_name as string) || (cfg.tag as string) || ""}`;
    case "update_field":
      return `Set ${(cfg.field as string) || "field"}`;
    default:
      return t;
  }
}

// Visual style per kind. We render custom node components so the colors +
// shapes match the spec without bringing in another lib.
const KIND_STYLES: Record<StepKind, { bg: string; ring: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
  send_email:   { bg: "bg-blue-50",  ring: "ring-blue-300",   text: "text-blue-900",   icon: Mail },
  send_sms:     { bg: "bg-green-50", ring: "ring-green-300",  text: "text-green-900",  icon: MessageSquare },
  wait:         { bg: "bg-yellow-50",ring: "ring-yellow-300", text: "text-yellow-900", icon: Clock },
  branch:       { bg: "bg-orange-50",ring: "ring-orange-300", text: "text-orange-900", icon: GitBranch },
  task_call:    { bg: "bg-orange-50",ring: "ring-orange-300", text: "text-orange-900", icon: Phone },
  goal:         { bg: "bg-emerald-100",ring: "ring-emerald-500",text: "text-emerald-900",icon: Flag },
  tag:          { bg: "bg-slate-100",ring: "ring-slate-300",  text: "text-slate-700",  icon: Tag },
  update_field: { bg: "bg-slate-100",ring: "ring-slate-300",  text: "text-slate-700",  icon: Edit3 },
  other:        { bg: "bg-slate-50", ring: "ring-slate-300",  text: "text-slate-700",  icon: Edit3 },
};

interface StepNodeData {
  label: string;
  kind: StepKind;
  selected?: boolean;
}

function StepNode({ data }: NodeProps<StepNodeData>) {
  const style = KIND_STYLES[data.kind];
  const Icon = style.icon;
  const selectedRing = data.selected ? "ring-2 ring-offset-1 ring-[#EF6C33]" : `ring-1 ${style.ring}`;
  // Diamond for branch; filled dot for goal; rounded card for everything else.
  if (data.kind === "branch") {
    return (
      <div className="relative" style={{ width: 140, height: 80 }}>
        <Handle type="target" position={Position.Top} className="!bg-slate-400" />
        <div
          className={`absolute inset-0 ${style.bg} ${style.text} ${selectedRing} flex items-center justify-center text-[11px] font-semibold text-center px-2`}
          style={{ transform: "rotate(45deg)", width: 80, height: 80, left: 30, top: 0 }}
        >
          <div style={{ transform: "rotate(-45deg)", width: 80 }} className="px-1 leading-tight">
            {data.label}
          </div>
        </div>
        <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
      </div>
    );
  }
  if (data.kind === "goal") {
    return (
      <div className="flex flex-col items-center">
        <Handle type="target" position={Position.Top} className="!bg-slate-400" />
        <div className={`h-6 w-6 rounded-full ${style.bg} ${selectedRing}`} />
        <div className="mt-1 text-[10px] font-semibold text-emerald-900">{data.label}</div>
      </div>
    );
  }
  return (
    <div className={`rounded-lg ${style.bg} ${style.text} ${selectedRing} shadow-sm px-3 py-2 min-w-[160px] max-w-[200px]`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-70">
        <Icon className="h-3 w-3" />
        <span>{data.kind.replace("_", " ")}</span>
      </div>
      <div className="mt-0.5 text-xs font-semibold leading-snug">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  );
}

const NODE_TYPES = { step: StepNode };

const Y_SPACING = 110;

function buildNodes(steps: SuggestionStep[], opts: { editing: boolean; selectedId: string | null }): Node<StepNodeData>[] {
  return steps.map((step, i) => {
    const id = `n${i}`;
    return {
      id,
      type: "step",
      position: { x: 0, y: i * Y_SPACING },
      data: { label: stepLabel(step), kind: classifyStep(step), selected: opts.editing && opts.selectedId === id },
      draggable: opts.editing,
      selectable: opts.editing,
    };
  });
}

function buildEdges(count: number): Edge[] {
  const edges: Edge[] = [];
  for (let i = 1; i < count; i++) {
    edges.push({
      id: `e${i - 1}-${i}`,
      source: `n${i - 1}`,
      target: `n${i}`,
      type: "smoothstep",
      style: { stroke: "#94a3b8", strokeWidth: 1.5 },
    });
  }
  return edges;
}

// ── Step registry (F-CS.6 shape) ────────────────────────────────────────────
// Used to validate the rebuilt steps_json client-side before POST.
// Mirrors the runtime in LUMEN-API/src/lib/automationRuntime.js.
const UPDATE_FIELD_ALLOWED = [
  "first_name",
  "last_name",
  "company",
  "title",
  "source",
  "lifecycle_stage",
  "contact_intelligence_score",
] as const;

const GOAL_CONTACT_FIELDS = [
  "lifecycle_stage",
  "contact_intelligence_score",
  "source",
  "company",
  "title",
] as const;

interface ValidationError {
  index: number;
  message: string;
}

function validateSteps(steps: { type: string; config: Record<string, unknown> }[]): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!steps.length) {
    errs.push({ index: -1, message: "No steps — add at least one before saving." });
    return errs;
  }
  steps.forEach((s, i) => {
    const t = (s.type || "").toLowerCase();
    const cfg = s.config || {};
    if (!t) {
      errs.push({ index: i, message: `Step ${i + 1}: missing type.` });
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
      case "task_call":
      case "call":
      case "task":
        if (cfg.task_id == null && !cfg.task_name) {
          errs.push({ index: i, message: `Step ${i + 1} (task_call): need task_id or task_name.` });
        }
        break;
      case "goal":
        if (!cfg.name) {
          errs.push({ index: i, message: `Step ${i + 1} (goal): name is required.` });
        }
        if (!(cfg.when as { contact_field?: string } | undefined)?.contact_field) {
          errs.push({ index: i, message: `Step ${i + 1} (goal): when.contact_field is required.` });
        }
        break;
      case "tag":
      case "add_tag":
      case "remove_tag":
        if (!cfg.tag_name) {
          errs.push({ index: i, message: `Step ${i + 1} (tag): tag_name is required.` });
        }
        break;
      case "update_field":
      case "set_field": {
        if (!cfg.field) {
          errs.push({ index: i, message: `Step ${i + 1} (update_field): field is required.` });
          break;
        }
        const f = String(cfg.field);
        if (!UPDATE_FIELD_ALLOWED.includes(f as (typeof UPDATE_FIELD_ALLOWED)[number])) {
          errs.push({
            index: i,
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
            errs.push({ index: i, message: `Step ${i + 1} (${t}): need a condition (gte / campaign_id / condition).` });
          }
        }
        // Unknown types pass through — server-side validates against the
        // current registry; client just sanity-checks the common shapes.
        break;
    }
  });
  return errs;
}

// ── Inline edit drawer ──────────────────────────────────────────────────────
interface EditDrawerProps {
  step: { type: string; config: Record<string, unknown> };
  index: number;
  totalSteps: number;
  emailTemplates: Array<{ id: number; template_key: string; name: string }>;
  smsTemplates: Array<{ id: number; template_key: string; name: string }>;
  tags: Array<{ id: number; name: string }>;
  onChange: (next: { type: string; config: Record<string, unknown> }) => void;
}

function EditDrawer({ step, index, totalSteps, emailTemplates, smsTemplates, tags, onChange }: EditDrawerProps) {
  const t = (step.type || "").toLowerCase();
  const cfg = step.config || {};

  const setCfg = (patch: Record<string, unknown>) =>
    onChange({ type: step.type, config: { ...cfg, ...patch } });

  const labelClass = "block text-[10px] uppercase font-semibold text-slate-500 mb-1";
  const inputClass =
    "w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]";

  // wait — split current cfg into days/hours/minutes if any of those exist.
  const waitDays = Number(cfg.days || cfg.wait_days || 0);
  const waitHours = Number(cfg.hours || cfg.wait_hours || 0);
  const waitMinutes = Number(cfg.minutes || 0);
  // Pick a unit for the single duration+unit selector the spec calls for.
  const waitUnit: "days" | "hours" | "minutes" =
    waitDays > 0 ? "days" : waitHours > 0 ? "hours" : waitMinutes > 0 ? "minutes" : "days";
  const waitAmount = waitDays || waitHours || waitMinutes || 1;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold text-slate-700">
          Edit step {index + 1} of {totalSteps}{" "}
          <span className="text-slate-400">· {t || "unknown"}</span>
        </div>
      </div>

      {/* send_email */}
      {(t === "send_email" || t === "email") && (
        <div className="space-y-2">
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
              {emailTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.template_key}>
                  {tpl.name} ({tpl.template_key})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* send_sms */}
      {(t === "send_sms" || t === "sms") && (
        <div className="space-y-2">
          <div>
            <label className={labelClass}>Message</label>
            <textarea
              className={inputClass}
              rows={3}
              value={String(cfg.message || cfg.body || "")}
              onChange={(e) => setCfg({ message: e.target.value, body: undefined })}
              placeholder="Hi {{first_name}}, quick follow-up — reply STOP to opt out."
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
              {smsTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.template_key}>
                  {tpl.name} ({tpl.template_key})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* wait */}
      {(t === "wait" || t === "delay") && (
        <div className="space-y-2">
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
                  // Reset all three so we don't leave a stale (e.g. hours)
                  // value lingering when the user picks days.
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
        </div>
      )}

      {/* task_call */}
      {(t === "task_call" || t === "call" || t === "task") && (
        <div className="space-y-2">
          <div>
            <label className={labelClass}>Task ID</label>
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
              References a row in lumen.spark_task. Use task name instead if you don't have the id.
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
        </div>
      )}

      {/* branch_* */}
      {t.startsWith("branch_") && (
        <div className="space-y-2">
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
        </div>
      )}

      {/* goal */}
      {t === "goal" && (
        <div className="space-y-2">
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
                  <option key={f} value={f}>
                    {f}
                  </option>
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
        </div>
      )}

      {/* tag */}
      {(t === "tag" || t === "add_tag" || t === "remove_tag") && (
        <div className="space-y-2">
          <div>
            <label className={labelClass}>Tag</label>
            <select
              className={inputClass}
              value={String(cfg.tag_name || cfg.tag || "")}
              onChange={(e) => setCfg({ tag_name: e.target.value, tag: undefined })}
            >
              <option value="">(pick a tag)</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.name}>
                  {tag.name}
                </option>
              ))}
            </select>
            <div className="mt-1 text-[10px] text-slate-500">
              Tags are matched by name at runtime (auto-created if missing).
            </div>
          </div>
        </div>
      )}

      {/* update_field */}
      {(t === "update_field" || t === "set_field") && (
        <div className="space-y-2">
          <div>
            <label className={labelClass}>Field</label>
            <select
              className={inputClass}
              value={String(cfg.field || "")}
              onChange={(e) => setCfg({ field: e.target.value || null })}
            >
              <option value="">(pick a field)</option>
              {UPDATE_FIELD_ALLOWED.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
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
        </div>
      )}

      {/* fallback */}
      {!["send_email", "email", "send_sms", "sms", "wait", "delay", "task_call", "call", "task", "goal", "tag", "add_tag", "remove_tag", "update_field", "set_field"].includes(t) &&
        !t.startsWith("branch_") && (
          <div className="text-[11px] text-slate-500">
            No inline editor for "{t}" steps. Edit the steps_json directly in the IL rules admin
            page if you need to change this step.
          </div>
        )}
    </div>
  );
}

// ── Suggestion card ─────────────────────────────────────────────────────────
interface CardLookups {
  emailTemplates: Array<{ id: number; template_key: string; name: string }>;
  smsTemplates: Array<{ id: number; template_key: string; name: string }>;
  tags: Array<{ id: number; name: string }>;
}

function SuggestionCard({
  s,
  onAccept,
  onDismiss,
  onStartCustomize,
  onSaveCustomize,
  onCancelCustomize,
  busy,
  editingRuleId,
  draftSteps,
  setDraftSteps,
  saving,
  saveError,
  lookups,
}: {
  s: Suggestion;
  onAccept: (id: number) => void;
  onDismiss: (id: number) => void;
  onStartCustomize: (s: Suggestion) => void;
  onSaveCustomize: (ruleId: number, steps: SuggestionStep[]) => void;
  onCancelCustomize: () => void;
  busy: boolean;
  editingRuleId: number | null;
  draftSteps: SuggestionStep[];
  setDraftSteps: (steps: SuggestionStep[]) => void;
  saving: boolean;
  saveError: string | null;
  lookups: CardLookups;
}) {
  const isEditing = editingRuleId === s.rule_id;
  // While editing, the graph + drawer mirror draftSteps. Otherwise we render
  // the suggestion's own steps (read-only).
  const stepsForGraph = isEditing ? draftSteps : (s.suggested_steps || []);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // When the user enters/exits edit mode, reset the selected node to the
  // first step (or null when leaving).
  const prevEditing = useRef(isEditing);
  useEffect(() => {
    if (prevEditing.current !== isEditing) {
      setSelectedNodeId(isEditing && stepsForGraph.length ? "n0" : null);
      prevEditing.current = isEditing;
    }
  }, [isEditing, stepsForGraph.length]);

  // Controlled nodes when editing — uncontrolled (recomputed each render)
  // when read-only. ReactFlow handles both modes; we just need to keep our
  // draftSteps in sync after a drag.
  const [editNodes, setEditNodes] = useState<Node<StepNodeData>[]>([]);
  useEffect(() => {
    if (isEditing) {
      setEditNodes(buildNodes(stepsForGraph, { editing: true, selectedId: selectedNodeId }));
    }
    // We deliberately depend on draftSteps (via stepsForGraph) and the
    // selection, not on editNodes itself — that would re-fire forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, draftSteps, selectedNodeId]);

  const viewNodes = useMemo(
    () => (!isEditing ? buildNodes(s.suggested_steps || [], { editing: false, selectedId: null }) : []),
    [s.suggested_steps, isEditing]
  );
  const edges = useMemo(() => buildEdges(stepsForGraph.length), [stepsForGraph.length]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Apply ReactFlow's diff to our local node list first so dragging feels
      // smooth.
      setEditNodes((prev) => {
        const next = applyNodeChanges(changes, prev);
        // If a drag ended, re-sort by Y and rebuild draftSteps in the new order.
        const dragEnded = changes.some((c) => c.type === "position" && c.dragging === false);
        if (dragEnded) {
          const sorted = [...next].sort((a, b) => a.position.y - b.position.y);
          // Map sorted ids back to draftSteps order. Node ids are stable
          // (n0, n1, …) and point at the original draftSteps index, so we
          // can just look them up.
          const newOrder: SuggestionStep[] = [];
          for (const n of sorted) {
            const origIdx = parseInt(n.id.slice(1), 10);
            if (!Number.isNaN(origIdx) && draftSteps[origIdx]) {
              newOrder.push(draftSteps[origIdx]);
            }
          }
          // Push to parent. The useEffect above will then rebuild editNodes
          // with refreshed positions on the next render.
          if (newOrder.length === draftSteps.length) {
            setDraftSteps(newOrder);
            // After reorder the previously-selected node's id no longer
            // points at the same step. Clear selection to avoid confusion.
            setSelectedNodeId(newOrder.length ? "n0" : null);
          }
        }
        return next;
      });
    },
    [draftSteps, setDraftSteps]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<StepNodeData>) => {
    setSelectedNodeId(node.id);
  }, []);

  const selectedIndex = selectedNodeId ? parseInt(selectedNodeId.slice(1), 10) : -1;
  const selectedStep =
    isEditing && selectedIndex >= 0 && selectedIndex < draftSteps.length
      ? normalizeStep(draftSteps[selectedIndex])
      : null;

  const updateSelectedStep = useCallback(
    (next: { type: string; config: Record<string, unknown> }) => {
      if (selectedIndex < 0) return;
      const copy = draftSteps.slice();
      copy[selectedIndex] = { type: next.type, config: next.config };
      setDraftSteps(copy);
    },
    [draftSteps, selectedIndex, setDraftSteps]
  );

  const band = s.score_band_min != null && s.score_band_max != null
    ? `${s.score_band_min}–${s.score_band_max}`
    : null;
  const contactLabel = [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || s.email || `Contact #${s.contact_id}`;

  // Graph height scales with step count, capped so a 10-step suggestion
  // doesn't dominate the modal. ReactFlow renders inside this fixed box.
  const graphHeight = Math.max(180, Math.min(440, (stepsForGraph.length || 1) * 110 + 60));

  return (
    <div className={`rounded-lg border bg-white ${isEditing ? "border-[#EF6C33]" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase font-semibold text-slate-500">{s.rule_key}</div>
          <div className="text-sm font-semibold text-slate-900 truncate">{s.rule_name}</div>
          <div className="mt-0.5 text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
            <span>{contactLabel}</span>
            {band && (
              <span className="inline-flex items-center rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 ring-1 ring-orange-200">
                Score {band}
              </span>
            )}
            {s.score_at_match != null && (
              <span className="text-slate-400">matched at {s.score_at_match}</span>
            )}
            {isEditing && (
              <span className="inline-flex items-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-[#EF6C33] ring-1 ring-orange-300">
                Editing rule
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isEditing && (
            <>
              <button
                type="button"
                onClick={() => onAccept(s.suggestion_id)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              >
                <Check className="h-3 w-3" /> Accept
              </button>
              <button
                type="button"
                onClick={() => onDismiss(s.suggestion_id)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <X className="h-3 w-3" /> Dismiss
              </button>
              <button
                type="button"
                onClick={() => onStartCustomize(s)}
                disabled={busy || (editingRuleId !== null && editingRuleId !== s.rule_id)}
                title={
                  editingRuleId !== null && editingRuleId !== s.rule_id
                    ? "Finish editing the other rule first"
                    : "Customize the rule that produced this suggestion"
                }
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Pencil className="h-3 w-3" /> Customize
              </button>
            </>
          )}
          {isEditing && (
            <>
              <button
                type="button"
                onClick={() => onSaveCustomize(s.rule_id, draftSteps)}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded border border-[#EF6C33] bg-[#EF6C33] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#d85c25] disabled:opacity-50"
              >
                <Save className="h-3 w-3" /> {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={onCancelCustomize}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Undo2 className="h-3 w-3" /> Cancel
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ height: graphHeight }} className="bg-slate-50">
        {stepsForGraph.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            (no steps in this suggestion)
          </div>
        ) : isEditing ? (
          <ReactFlow
            nodes={editNodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            zoomOnScroll={false}
            panOnScroll={false}
            panOnDrag
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} color="#e2e8f0" />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <ReactFlow
            nodes={viewNodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnScroll={false}
            panOnScroll={false}
            panOnDrag
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} color="#e2e8f0" />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>

      {/* Edit drawer — only shown in edit mode. Persists below the graph so
          the user can see both the flow and the field editor without modal
          context switching. */}
      {isEditing && (
        <div className="border-t border-slate-200 p-3 space-y-2">
          <div className="text-[10px] text-slate-500">
            Drag nodes up/down to reorder. Click a node to edit its config below.
            Linear top-to-bottom only — branch targets aren't editable in this view.
          </div>
          {selectedStep ? (
            <EditDrawer
              step={selectedStep}
              index={selectedIndex}
              totalSteps={draftSteps.length}
              emailTemplates={lookups.emailTemplates}
              smsTemplates={lookups.smsTemplates}
              tags={lookups.tags}
              onChange={updateSelectedStep}
            />
          ) : (
            <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-[11px] text-slate-500">
              Click a node above to edit its configuration.
            </div>
          )}
          {saveError && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 whitespace-pre-wrap">
              {saveError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────
export function SparkSuggestionsPanel({ contactId, onAccepted, onDismissed, onCustomized }: Props) {
  const { get, post, ready } = useSparkApi() as {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
    ready: boolean;
  };

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // F-CS.3 edit state. We track a SINGLE in-flight customize at a time so
  // the user can't half-edit two rules at once and accidentally save the
  // wrong draft.
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [draftSteps, setDraftSteps] = useState<SuggestionStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  // Lookups for the edit drawer dropdowns. We fetch once when the panel
  // first mounts (templates/tags don't change often enough to warrant a
  // per-edit refetch). Failures degrade gracefully — the dropdowns just
  // render with the legacy free-text placeholders.
  const [emailTemplates, setEmailTemplates] = useState<Array<{ id: number; template_key: string; name: string }>>([]);
  const [smsTemplates, setSmsTemplates] = useState<Array<{ id: number; template_key: string; name: string }>>([]);
  const [tags, setTags] = useState<Array<{ id: number; name: string }>>([]);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const path = contactId
        ? `/api/v1/il/suggestions?contact_id=${contactId}`
        : "/api/v1/il/suggestions";
      const r = await get<{ data: Suggestion[] }>(path);
      setSuggestions(r?.data || []);
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setLoading(false);
    }
  }, [get, ready, contactId]);

  useEffect(() => {
    load();
  }, [load]);

  // Lookups — fire-and-forget on mount.
  useEffect(() => {
    if (!ready) return;
    get<{ items: Array<{ id: number; template_key: string; name: string }> }>("/api/v1/email-templates")
      .then((r) => setEmailTemplates(r?.items || []))
      .catch(() => setEmailTemplates([]));
    get<{ items: Array<{ id: number; template_key: string; name: string }> }>("/api/v1/sms-templates")
      .then((r) => setSmsTemplates(r?.items || []))
      .catch(() => setSmsTemplates([]));
    get<{ data: Array<{ id: number; name: string }> }>("/api/v1/tags")
      .then((r) => setTags(r?.data || []))
      .catch(() => setTags([]));
  }, [ready, get]);

  async function accept(id: number) {
    if (!confirm("Accept this suggestion? It will create an automation and enroll the contact.")) return;
    setBusyId(id);
    setError(null);
    try {
      const r = await post<{ data: { automation_id: number } }>(`/api/v1/il/suggestions/${id}/accept`, {});
      const automationId = r?.data?.automation_id;
      // Remove the accepted suggestion from the list immediately.
      setSuggestions((prev) => prev.filter((s) => s.suggestion_id !== id));
      if (automationId != null) onAccepted?.(automationId, id);
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(id: number) {
    setBusyId(id);
    setError(null);
    try {
      await post(`/api/v1/il/suggestions/${id}/dismiss`, {});
      setSuggestions((prev) => prev.filter((s) => s.suggestion_id !== id));
      onDismissed?.(id);
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setBusyId(null);
    }
  }

  function startCustomize(s: Suggestion) {
    // Seed the draft from the suggestion's own steps so the user starts from
    // exactly what the IL proposed. They can also customize from a different
    // suggestion of the same rule, but the rule_override applies tenant-wide
    // — saving here changes the rule for ALL future suggestions of this kind.
    setEditingRuleId(s.rule_id);
    setDraftSteps((s.suggested_steps || []).map((step) => ({ ...step })));
    setSaveError(null);
    setSavedFlash(null);
  }

  function cancelCustomize() {
    setEditingRuleId(null);
    setDraftSteps([]);
    setSaveError(null);
  }

  async function saveCustomize(ruleId: number, steps: SuggestionStep[]) {
    // Normalize each step to { type, config } before validating + sending.
    const normalized = steps.map((s) => normalizeStep(s));
    const validationErrors = validateSteps(normalized);
    if (validationErrors.length) {
      setSaveError(validationErrors.map((e) => e.message).join("\n"));
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await post(`/api/v1/il/rules/${ruleId}/customize`, { steps: normalized });
      // Success — drop edit state, refetch suggestions (the SAME contact
      // suggestion the user came in on stays in the list; only NEW
      // suggestions for this rule will pick up the override), surface a flash.
      setEditingRuleId(null);
      setDraftSteps([]);
      setSavedFlash("Rule customized. New suggestions for this rule will use your version.");
      // Refetch so we pick up any backend-side recomputation. Best-effort —
      // a 5xx here doesn't roll back the save.
      load().catch(() => undefined);
      onCustomized?.(ruleId);
      // Auto-hide the flash after a few seconds so it doesn't pile up.
      setTimeout(() => setSavedFlash(null), 6000);
    } catch (err) {
      setSaveError(String((err as Error)?.message || err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-xs text-slate-500 p-2">Loading suggestions…</div>;
  }
  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{error}</div>
    );
  }
  if (!suggestions.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <div className="text-sm font-semibold text-slate-700">No open suggestions</div>
        <div className="mt-1 text-xs text-slate-500">
          The Intelligence Layer proposes campaigns when a contact crosses a scoring band
          (e.g. a contact warming to a hot lead). Check back once activity comes in.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {savedFlash && (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800 flex items-start gap-2">
          <Check className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{savedFlash}</span>
        </div>
      )}
      {suggestions.map((s) => (
        <SuggestionCard
          key={s.suggestion_id}
          s={s}
          onAccept={accept}
          onDismiss={dismiss}
          onStartCustomize={startCustomize}
          onSaveCustomize={saveCustomize}
          onCancelCustomize={cancelCustomize}
          busy={busyId === s.suggestion_id}
          editingRuleId={editingRuleId}
          draftSteps={draftSteps}
          setDraftSteps={setDraftSteps}
          saving={saving}
          saveError={editingRuleId === s.rule_id ? saveError : null}
          lookups={{ emailTemplates, smsTemplates, tags }}
        />
      ))}
    </div>
  );
}

export default SparkSuggestionsPanel;

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
//     The drawer itself is now the shared <StepConfigEditor /> — see
//     sparkStepEditor.tsx for the per-kind field renderers and validator.
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
import { Check, X, Pencil, Save, Undo2 } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import {
  StepConfigEditor,
  classifyKind,
  normalizeStep as normalizeStepShared,
  validateSteps as validateStepsShared,
  KIND_STYLES,
  type Step,
  type StepKind,
  type SparkLookups,
} from "./sparkStepEditor";

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

// ── Node label/classification (suggestion-shaped) ───────────────────────────
// SuggestionStep can be either {step_type, config} or {type, ...flat}; we
// route it through the shared normalizeStep + classifyKind so this file only
// owns the ReactFlow node rendering.
function classifySuggestionStep(step: SuggestionStep): StepKind {
  return classifyKind(String(step.step_type || step.type || ""));
}

function stepLabel(step: SuggestionStep): string {
  const t = String(step.step_type || step.type || "step");
  const cfg = (step.config as Record<string, unknown>) || (step as Record<string, unknown>);
  switch (classifySuggestionStep(step)) {
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
      data: { label: stepLabel(step), kind: classifySuggestionStep(step), selected: opts.editing && opts.selectedId === id },
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

// ── Suggestion card ─────────────────────────────────────────────────────────
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
  lookups: SparkLookups;
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
  // Normalize through the shared helper so the editor always sees
  // {type, config}, never a legacy flat shape.
  const selectedStep: Step | null =
    isEditing && selectedIndex >= 0 && selectedIndex < draftSteps.length
      ? normalizeStepShared(draftSteps[selectedIndex])
      : null;

  const updateSelectedStep = useCallback(
    (next: Step) => {
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

      {/* Edit drawer — only shown in edit mode. The shared StepConfigEditor
          owns the per-kind form. We pass showTypeSelector={false} because
          the IL suggestion shape dictates the kind (changing kinds mid-rule
          would be a different feature — the user could express that intent
          by dismissing and re-customizing). */}
      {isEditing && (
        <div className="border-t border-slate-200 p-3 space-y-2">
          <div className="text-[10px] text-slate-500">
            Drag nodes up/down to reorder. Click a node to edit its config below.
            Linear top-to-bottom only — branch targets aren't editable in this view.
          </div>
          {selectedStep ? (
            <StepConfigEditor
              step={selectedStep}
              lookups={lookups}
              onChange={updateSelectedStep}
              showTypeSelector={false}
              index={selectedIndex}
              totalSteps={draftSteps.length}
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
  // Batch 7 — F-CS.6 named tasks for the task_call dropdown. Fetched once on
  // mount alongside the other lookups; failure degrades to the legacy
  // "Custom task_id" numeric fallback.
  const [sparkTasks, setSparkTasks] = useState<Array<{ task_id: number; name: string; step_count?: number }>>([]);

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
    get<{ data: Array<{ task_id: number; name: string; step_count?: number }> }>("/api/v1/spark_tasks")
      .then((r) => setSparkTasks(r?.data || []))
      .catch(() => setSparkTasks([]));
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
    // Normalize each step to {type, config} via the shared helper before
    // validating + sending. validateStepsShared returns {valid, errors[]} —
    // we collapse the message list into a single newline-joined string for
    // the inline error banner.
    const normalized = steps.map((s) => normalizeStepShared(s));
    const validation = validateStepsShared(normalized);
    if (!validation.valid) {
      setSaveError(validation.errors.map((e) => e.message).join("\n"));
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
          lookups={{ emailTemplates, smsTemplates, tags, sparkTasks }}
        />
      ))}
    </div>
  );
}

export default SparkSuggestionsPanel;

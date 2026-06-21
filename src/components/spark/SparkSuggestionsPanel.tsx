// SparkSuggestionsPanel — F-CS.2 view-only IL suggestions panel.
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
//   - Accept  → POST /api/v1/il/suggestions/:id/accept
//   - Dismiss → POST /api/v1/il/suggestions/:id/dismiss
//   - Customize → disabled (F-CS.3)
//
// VIEW-ONLY for v1 — no drag/reorder/edit. F-CS.3 ships the editor.
//
// Data layer + endpoints shipped in batch 5 (LUMEN-API d7964eb,
// routes/ilRules.js).
import { useEffect, useMemo, useState, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeProps,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { Check, X, Pencil, Mail, MessageSquare, Clock, GitBranch, Phone, Flag, Tag, Edit3 } from "lucide-react";
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

function stepLabel(step: SuggestionStep): string {
  const t = String(step.step_type || step.type || "step");
  const cfg = (step.config as Record<string, unknown>) || (step as Record<string, unknown>);
  switch (classifyStep(step)) {
    case "send_email": {
      const subject = (cfg.subject as string) || (cfg.template_name as string) || "Email";
      return String(subject).slice(0, 60);
    }
    case "send_sms": {
      const body = (cfg.body as string) || (cfg.content_sms as string) || "SMS";
      return String(body).slice(0, 60);
    }
    case "wait": {
      const dur = (cfg.duration as string) || (cfg.delay as string) ||
        (cfg.wait_days ? `${cfg.wait_days}d` : null) ||
        (cfg.wait_hours ? `${cfg.wait_hours}h` : null) || "wait";
      return `Wait ${dur}`;
    }
    case "branch": {
      const cond = (cfg.condition as string) || t.replace(/^branch_/, "").replace(/_/g, " ");
      return `If ${cond}?`;
    }
    case "task_call": {
      const title = (cfg.title as string) || "Call task";
      return String(title).slice(0, 60);
    }
    case "goal":
      return (cfg.name as string) || "Goal";
    case "tag":
      return `${t === "remove_tag" ? "Remove" : "Add"} tag: ${(cfg.tag as string) || ""}`;
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
}

function StepNode({ data }: NodeProps<StepNodeData>) {
  const style = KIND_STYLES[data.kind];
  const Icon = style.icon;
  // Diamond for branch; filled dot for goal; rounded card for everything else.
  if (data.kind === "branch") {
    return (
      <div className="relative" style={{ width: 140, height: 80 }}>
        <Handle type="target" position={Position.Top} className="!bg-slate-400" />
        <div
          className={`absolute inset-0 ${style.bg} ${style.text} ring-1 ${style.ring} flex items-center justify-center text-[11px] font-semibold text-center px-2`}
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
        <div className={`h-6 w-6 rounded-full ${style.bg} ring-2 ${style.ring}`} />
        <div className="mt-1 text-[10px] font-semibold text-emerald-900">{data.label}</div>
      </div>
    );
  }
  return (
    <div className={`rounded-lg ${style.bg} ${style.text} ring-1 ${style.ring} shadow-sm px-3 py-2 min-w-[160px] max-w-[200px]`}>
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

function buildGraph(steps: SuggestionStep[]): { nodes: Node<StepNodeData>[]; edges: Edge[] } {
  const nodes: Node<StepNodeData>[] = [];
  const edges: Edge[] = [];
  const ySpacing = 110;
  steps.forEach((step, i) => {
    const id = `n${i}`;
    nodes.push({
      id,
      type: "step",
      position: { x: 0, y: i * ySpacing },
      data: { label: stepLabel(step), kind: classifyStep(step) },
      draggable: false,
      selectable: false,
    });
    if (i > 0) {
      edges.push({
        id: `e${i - 1}-${i}`,
        source: `n${i - 1}`,
        target: id,
        type: "smoothstep",
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
      });
    }
  });
  return { nodes, edges };
}

// ── Suggestion card ─────────────────────────────────────────────────────────
function SuggestionCard({
  s,
  onAccept,
  onDismiss,
  busy,
}: {
  s: Suggestion;
  onAccept: (id: number) => void;
  onDismiss: (id: number) => void;
  busy: boolean;
}) {
  const { nodes, edges } = useMemo(() => buildGraph(s.suggested_steps || []), [s.suggested_steps]);

  const band = s.score_band_min != null && s.score_band_max != null
    ? `${s.score_band_min}–${s.score_band_max}`
    : null;
  const contactLabel = [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || s.email || `Contact #${s.contact_id}`;

  // Graph height scales with step count, capped so a 10-step suggestion
  // doesn't dominate the modal. ReactFlow renders inside this fixed box.
  const graphHeight = Math.max(180, Math.min(440, (s.suggested_steps?.length || 1) * 110 + 60));

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
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
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
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
            disabled
            title="Customize coming in F-CS.3"
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-400 cursor-not-allowed"
          >
            <Pencil className="h-3 w-3" /> Customize
          </button>
        </div>
      </div>
      <div style={{ height: graphHeight }} className="bg-slate-50">
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            (no steps in this suggestion)
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
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
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────
export function SparkSuggestionsPanel({ contactId, onAccepted, onDismissed }: Props) {
  const { get, post, ready } = useSparkApi() as {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
    ready: boolean;
  };

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

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
      {suggestions.map((s) => (
        <SuggestionCard
          key={s.suggestion_id}
          s={s}
          onAccept={accept}
          onDismiss={dismiss}
          busy={busyId === s.suggestion_id}
        />
      ))}
    </div>
  );
}

export default SparkSuggestionsPanel;

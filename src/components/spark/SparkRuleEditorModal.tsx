// SparkRuleEditorModal — adaptive create/edit modal for SPARK lead rules.
//
// User feedback: "I ALREADY SEE 3 PAGES FOR RULES, THAT SHOULD BE FUCKING 1."
// Built to consolidate Scoring + Routing + Auto-Tag rules behind one library
// page (SparkRulesPage). This modal handles all three types via type-adaptive
// form fields.
//
// All three rule types share:
//   - name
//   - condition (JSON object)
//   - sort_order
//   - is_active (edit only)
//
// Type-specific fields:
//   - scoring: event_trigger + points + decay_days
//   - routing: routing_type + routing_target (JSON)
//   - autotag: tags (string array)
//
// API endpoints (verified against route handlers):
//   POST   /scoring-rules        | PATCH /scoring-rules/:id        | DELETE /:id
//   POST   /routing-rules        | PATCH /routing-rules/:id        | DELETE /:id
//   POST   /lead-autotag-rules   | PATCH /lead-autotag-rules/:id   | DELETE /:id
//
// PATCH endpoints were added in D-09/D-10/D-11 — before that day, rules
// couldn't be edited at all, only deleted + recreated.
import { useEffect, useState } from "react";
import { Save, Trash2, AlertTriangle, Plus } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IadmModal, IadmButton } from "../IadmModal";

export type RuleType = "scoring" | "routing" | "autotag";

interface ScoringRule {
  id?: number;
  name: string;
  description?: string;
  event_trigger: string;
  condition?: Record<string, unknown> | null;
  points: number;
  decay_days?: number | null;
  sort_order: number;
  is_active?: boolean;
}

interface RoutingRule {
  id?: number;
  name: string;
  condition?: Record<string, unknown> | null;
  routing_type: "round_robin" | "weighted" | "specific_user" | "territory";
  routing_target: { user?: string; users?: string[]; territory_id?: number } | null;
  sort_order: number;
  is_active?: boolean;
}

interface AutoTagRule {
  id?: number;
  name: string;
  condition?: Record<string, unknown> | null;
  tags: string[];
  sort_order: number;
  is_active?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  ruleType: RuleType;
  /** Existing rule ID to edit, or null for create-new. */
  ruleId: number | null;
  onChanged?: () => void;
}

const SCORING_TRIGGERS = [
  "email.opened", "email.clicked", "form.submitted", "page.visited", "field.value",
];
const ROUTING_TYPES = ["round_robin", "weighted", "specific_user", "territory"] as const;

// Endpoints by rule type
const ENDPOINTS: Record<RuleType, { list: string; one: (id: number) => string }> = {
  scoring: { list: "/api/v1/scoring-rules",      one: (id) => `/api/v1/scoring-rules/${id}` },
  routing: { list: "/api/v1/routing-rules",      one: (id) => `/api/v1/routing-rules/${id}` },
  autotag: { list: "/api/v1/lead-autotag-rules", one: (id) => `/api/v1/lead-autotag-rules/${id}` },
};

const TYPE_LABEL: Record<RuleType, string> = {
  scoring: "Scoring rule",
  routing: "Routing rule",
  autotag: "Auto-tag rule",
};

const DEFAULT_SCORING: ScoringRule = {
  name: "", event_trigger: "email.opened", points: 5,
  condition: null, decay_days: null, sort_order: 100, is_active: true,
};
const DEFAULT_ROUTING: RoutingRule = {
  name: "", routing_type: "round_robin", routing_target: { users: [] },
  condition: null, sort_order: 100, is_active: true,
};
const DEFAULT_AUTOTAG: AutoTagRule = {
  name: "", tags: [], condition: {},
  sort_order: 100, is_active: true,
};

export function SparkRuleEditorModal({ open, onClose, ruleType, ruleId, onChanged }: Props) {
  const { get, post, patch, del, ready } = useSparkApi() as {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
    patch: <T>(p: string, body?: unknown) => Promise<T>;
    del: <T>(p: string) => Promise<T>;
    ready: boolean;
  };

  const [scoring, setScoring] = useState<ScoringRule>(DEFAULT_SCORING);
  const [routing, setRouting] = useState<RoutingRule>(DEFAULT_ROUTING);
  const [autotag, setAutotag] = useState<AutoTagRule>(DEFAULT_AUTOTAG);
  const [conditionRaw, setConditionRaw] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [usersInput, setUsersInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch when opening for edit
  useEffect(() => {
    if (!open || !ready) return;
    setError(null);
    if (ruleId == null) {
      // Create-new defaults
      setScoring(DEFAULT_SCORING);
      setRouting(DEFAULT_ROUTING);
      setAutotag(DEFAULT_AUTOTAG);
      setConditionRaw("");
      setTagInput("");
      setUsersInput("");
      return;
    }
    setLoading(true);
    (async () => {
      try {
        // List endpoint returns all; filter by id to find the row.
        // (None of the three rule types expose a per-id GET.)
        const r = await get<{ data: Array<{ id: number; [k: string]: unknown }> }>(ENDPOINTS[ruleType].list);
        const row = (r.data || []).find((x) => x.id === ruleId);
        if (!row) { setError("Rule not found."); setLoading(false); return; }
        // condition_json + tags_json + routing_target_json all come as strings from SQL.
        const cond = parseJson(row.condition_json);
        if (ruleType === "scoring") {
          const r2 = row as unknown as ScoringRule & { condition_json?: string };
          setScoring({ ...DEFAULT_SCORING, ...r2, condition: cond });
          setConditionRaw(cond ? JSON.stringify(cond, null, 2) : "");
        } else if (ruleType === "routing") {
          const r2 = row as unknown as RoutingRule & { condition_json?: string; routing_target_json?: string };
          const tgt = parseJson(row.routing_target_json) || { users: [] };
          setRouting({ ...DEFAULT_ROUTING, ...r2, condition: cond, routing_target: tgt });
          setConditionRaw(cond ? JSON.stringify(cond, null, 2) : "");
          setUsersInput(Array.isArray(tgt.users) ? tgt.users.join(", ") : "");
        } else {
          const r2 = row as unknown as AutoTagRule & { condition_json?: string; tags_json?: string };
          const tags = parseJson(row.tags_json) || [];
          setAutotag({ ...DEFAULT_AUTOTAG, ...r2, condition: cond, tags });
          setConditionRaw(cond ? JSON.stringify(cond, null, 2) : "");
          setTagInput(Array.isArray(tags) ? tags.join(", ") : "");
        }
      } catch (err) {
        setError(String((err as Error)?.message || err));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, ready, ruleType, ruleId, get]);

  // Esc + click-outside close is handled by IadmModal.

  async function save() {
    setSaving(true); setError(null);
    try {
      // Parse condition_raw to JSON if present (allow blank)
      let cond: Record<string, unknown> | null = null;
      if (conditionRaw.trim()) {
        try { cond = JSON.parse(conditionRaw); }
        catch { setError("Condition must be valid JSON or empty."); setSaving(false); return; }
      }

      if (ruleType === "scoring") {
        if (!scoring.name.trim()) { setError("Name is required."); setSaving(false); return; }
        if (!scoring.event_trigger) { setError("Event trigger is required."); setSaving(false); return; }
        const payload: Partial<ScoringRule> = {
          name: scoring.name,
          description: scoring.description || undefined,
          event_trigger: scoring.event_trigger,
          condition: cond,
          points: scoring.points,
          decay_days: scoring.decay_days,
          sort_order: scoring.sort_order,
        };
        if (ruleId != null) {
          await patch(ENDPOINTS.scoring.one(ruleId), { ...payload, is_active: scoring.is_active });
        } else {
          await post(ENDPOINTS.scoring.list, payload);
        }
      } else if (ruleType === "routing") {
        if (!routing.name.trim()) { setError("Name is required."); setSaving(false); return; }
        // Parse users CSV → array
        const users = usersInput.split(",").map((s) => s.trim()).filter(Boolean);
        const target = { ...(routing.routing_target || {}), users };
        const payload: Partial<RoutingRule> = {
          name: routing.name,
          condition: cond,
          routing_type: routing.routing_type,
          routing_target: target,
          sort_order: routing.sort_order,
        };
        if (ruleId != null) {
          await patch(ENDPOINTS.routing.one(ruleId), { ...payload, is_active: routing.is_active });
        } else {
          await post(ENDPOINTS.routing.list, payload);
        }
      } else {
        if (!autotag.name.trim()) { setError("Name is required."); setSaving(false); return; }
        const tags = tagInput.split(",").map((s) => s.trim()).filter(Boolean);
        if (tags.length === 0) { setError("At least one tag required."); setSaving(false); return; }
        const payload: Partial<AutoTagRule> = {
          name: autotag.name,
          condition: cond || {},
          tags,
          sort_order: autotag.sort_order,
        };
        if (ruleId != null) {
          await patch(ENDPOINTS.autotag.one(ruleId), { ...payload, is_active: autotag.is_active });
        } else {
          await post(ENDPOINTS.autotag.list, payload);
        }
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
    if (ruleId == null) return;
    if (!confirm("Delete this rule? This cannot be undone.")) return;
    setSaving(true);
    try {
      await del(ENDPOINTS[ruleType].one(ruleId));
      onChanged?.();
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  const isEdit = ruleId != null;

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow={`SPARK · ${TYPE_LABEL[ruleType].toUpperCase()}`}
      title={isEdit ? "Edit rule" : "New rule"}
      subtitle={TYPE_LABEL[ruleType]}
      size="md"
      footer={
        <>
          {/* Delete pinned to the left via mr-auto — only on edit */}
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
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create rule"}
          </IadmButton>
        </>
      }
    >
      <div className="p-5">
          {loading && <div className="text-sm text-slate-500">Loading…</div>}
          {error && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && ruleType === "scoring" && (
            <div className="space-y-3">
              <Field label="Name">
                <input value={scoring.name} onChange={(e) => setScoring({ ...scoring, name: e.target.value })} className="rule-input" autoFocus />
              </Field>
              <Field label="Description (optional)">
                <input value={scoring.description ?? ""} onChange={(e) => setScoring({ ...scoring, description: e.target.value })} className="rule-input" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Event trigger">
                  <select value={scoring.event_trigger} onChange={(e) => setScoring({ ...scoring, event_trigger: e.target.value })} className="rule-input bg-white">
                    {SCORING_TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Points">
                  <input type="number" value={scoring.points} onChange={(e) => setScoring({ ...scoring, points: Number(e.target.value) })} className="rule-input" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Decay days (optional)">
                  <input type="number" value={scoring.decay_days ?? ""} onChange={(e) => setScoring({ ...scoring, decay_days: e.target.value === "" ? null : Number(e.target.value) })} className="rule-input" />
                </Field>
                <Field label="Sort order">
                  <input type="number" value={scoring.sort_order} onChange={(e) => setScoring({ ...scoring, sort_order: Number(e.target.value) })} className="rule-input" />
                </Field>
              </div>
            </div>
          )}

          {!loading && ruleType === "routing" && (
            <div className="space-y-3">
              <Field label="Name">
                <input value={routing.name} onChange={(e) => setRouting({ ...routing, name: e.target.value })} className="rule-input" autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Routing type">
                  <select value={routing.routing_type} onChange={(e) => setRouting({ ...routing, routing_type: e.target.value as RoutingRule["routing_type"] })} className="rule-input bg-white">
                    {ROUTING_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select>
                </Field>
                <Field label="Sort order">
                  <input type="number" value={routing.sort_order} onChange={(e) => setRouting({ ...routing, sort_order: Number(e.target.value) })} className="rule-input" />
                </Field>
              </div>
              <Field label={routing.routing_type === "specific_user" ? "Assign to (email)" : "Eligible users (CSV of emails)"}>
                <input value={usersInput} onChange={(e) => setUsersInput(e.target.value)} className="rule-input" placeholder="alice@co.com, bob@co.com" />
                <p className="text-[11px] text-slate-500 mt-0.5">For round-robin / weighted, list all eligible users.</p>
              </Field>
            </div>
          )}

          {!loading && ruleType === "autotag" && (
            <div className="space-y-3">
              <Field label="Name">
                <input value={autotag.name} onChange={(e) => setAutotag({ ...autotag, name: e.target.value })} className="rule-input" autoFocus />
              </Field>
              <Field label="Tags (CSV)">
                <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} className="rule-input" placeholder="enterprise, hot-lead" />
                <p className="text-[11px] text-slate-500 mt-0.5">Comma-separated. Tags are applied to matching incoming leads.</p>
              </Field>
              <Field label="Sort order">
                <input type="number" value={autotag.sort_order} onChange={(e) => setAutotag({ ...autotag, sort_order: Number(e.target.value) })} className="rule-input" />
              </Field>
            </div>
          )}

          {/* Condition JSON — shared across all 3 types */}
          {!loading && (
            <div className="mt-3">
              <Field label={`Condition (JSON, optional)${ruleType === "autotag" ? " — required by some auto-tag rules" : ""}`}>
                <textarea
                  value={conditionRaw}
                  onChange={(e) => setConditionRaw(e.target.value)}
                  rows={4}
                  className="rule-input font-mono text-xs"
                  placeholder={'{"country": ["US"], "min_score": 50}'}
                />
                <p className="text-[11px] text-slate-500 mt-0.5">Empty = match every event. Match keys depend on the rule type.</p>
              </Field>
            </div>
          )}

          {/* Active checkbox — only on edit */}
          {!loading && isEdit && (
            <div className="mt-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={
                    ruleType === "scoring" ? !!scoring.is_active
                    : ruleType === "routing" ? !!routing.is_active
                    : !!autotag.is_active
                  }
                  onChange={(e) => {
                    if (ruleType === "scoring") setScoring({ ...scoring, is_active: e.target.checked });
                    else if (ruleType === "routing") setRouting({ ...routing, is_active: e.target.checked });
                    else setAutotag({ ...autotag, is_active: e.target.checked });
                  }}
                />
                Rule is active
              </label>
            </div>
          )}
        <style>{`
          .rule-input {
            width: 100%;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 13px;
          }
          .rule-input:focus { outline: none; border-color: #EF6C33; box-shadow: 0 0 0 1px #EF6C33; }
        `}</style>
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

function parseJson(v: unknown): any {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
}

export default SparkRuleEditorModal;

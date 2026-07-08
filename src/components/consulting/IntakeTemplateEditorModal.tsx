// IntakeTemplateEditorModal — F4 (Consulting Rework 2026-06-25).
//
// Founder editor for intake-kind document templates (consulting.document_template
// kind='intake'). Drag-drop question builder with per-question scoring.
//
// Backed by:
//   GET    /consulting/document-templates/:id  → load row
//   POST   /consulting/document-templates       → create
//   PATCH  /consulting/document-templates/:id  → update
//
// Question shape (matches migration 109's question_schema_json):
//   {
//     id: string,                // stable across edits (used by scoring + answer maps)
//     type: 'slider_1_10' | 'multi_select' | 'single_select'
//        | 'short_text' | 'long_text' | 'bullet_list',
//     label: string,
//     required?: boolean,
//     section?: string,          // optional grouping tag for the score breakdown
//     options?: string[],        // for *_select kinds
//     max_select?: number,       // for multi_select
//     max_items?: number,        // for bullet_list
//     placeholder?: string,      // for text kinds
//   }
//
// Scoring shape (per-question rules → score_config_json):
//   {
//     present_points?: number,   // points awarded if the answer is non-empty
//     per_pick_points?: number,  // (multi_select / bullet_list) points per item
//     per_item_points?: number,  // alias of per_pick_points for bullet_list
//     slider_points?: number,    // multiplier × slider value (default 1)
//     max?: number,              // hard cap for this question
//     option_points?: Record<string, number>,  // per-option scoring (single/multi)
//     section?: string,          // duplicates the question section for breakdown
//   }
//
// Drag-drop is implemented with native HTML5 drag events — no library dep
// (kept the Portal bundle lean per Brandon's "no third-party product surface"
// rule for the founder UI). The drag handle is the row header chevron; drop
// indicators are inline.
//
// System-seed rows (is_system_seed=1) open read-only with a single "Clone to
// founder scope" action that POSTs a new founder-scoped template seeded from
// the system row. The original system row is never mutated.
//
// Per the IA_Portal modal standards (F-107), this uses IadmModal size="info"
// (1200×80vh) so the question list has room to breathe.

import { useCallback, useEffect, useMemo, useState } from "react";
import { IadmModal, CORE_BLUE } from "../IadmModal";
import { useOliverApi } from "../../hooks/useOliverApi";
import { GripVertical, Plus, Trash2, ChevronDown, ChevronRight, Lock, Copy, AlertCircle } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────

export type IntakeQuestionType =
  | "slider_1_10"
  | "multi_select"
  | "single_select"
  | "short_text"
  | "long_text"
  | "bullet_list";

export interface IntakeQuestion {
  id: string;
  type: IntakeQuestionType;
  label: string;
  required?: boolean;
  section?: string;
  options?: string[];
  max_select?: number;
  max_items?: number;
  placeholder?: string;
  // Optional field this answer pre-fills when the intake is submitted. Namespaced:
  //   brand.*   → client's brand voice profile (AI tone)
  //   profile.* → the Business Profile section of onboarding (confirmed, not silently written)
  //   owner.*   → the Owner Account section of onboarding
  maps_to?: string;
}

// The target fields an intake answer can pre-fill. Grouped by destination.
// Keys MUST match the backend projection (lib/intakeProjection.js) + the
// onboarding prefill shape (onboardClient.js prefill.profile / prefill.owner).
export const MAPS_TO_OPTIONS: { group: string; items: { value: string; label: string }[] }[] = [
  {
    group: "Business profile (fills the onboarding Business Profile step)",
    items: [
      { value: "profile.business_name", label: "Business name" },
      { value: "profile.primary_contact_email", label: "Business contact email" },
      { value: "profile.phone", label: "Business phone" },
      { value: "profile.website", label: "Website URL" },
      { value: "profile.address_street", label: "Address — street" },
      { value: "profile.address_city", label: "Address — city" },
      { value: "profile.address_state", label: "Address — state/province" },
      { value: "profile.address_zip", label: "Address — postal code" },
      { value: "profile.primary_color", label: "Brand color (primary)" },
      { value: "profile.logo_url", label: "Logo URL" },
    ],
  },
  {
    group: "Owner account (fills the onboarding Owner step)",
    items: [
      { value: "owner.first_name", label: "Owner first name" },
      { value: "owner.last_name", label: "Owner last name" },
      { value: "owner.display_name", label: "Owner display name" },
    ],
  },
  {
    group: "Brand voice (syncs to the AI brand profile)",
    items: [
      { value: "brand.voice_traits", label: "Voice traits (multi-select)" },
      { value: "brand.tones_to_avoid", label: "Tones to avoid (multi-select)" },
      { value: "brand.slider_casual_formal", label: "Slider — casual ↔ formal" },
      { value: "brand.slider_affordable_premium", label: "Slider — affordable ↔ premium" },
      { value: "brand.slider_traditional_modern", label: "Slider — traditional ↔ modern" },
      { value: "brand.slider_local_corporate", label: "Slider — local ↔ corporate" },
      { value: "brand.differentiators", label: "Differentiators (bullet list)" },
      { value: "brand.visual_direction", label: "Visual direction (single-select)" },
      { value: "brand.photography_preference", label: "Photography preference (single-select)" },
      { value: "brand.admired_brands", label: "Admired brands (text)" },
      { value: "brand.avoid_brand", label: "Brand to avoid (text)" },
      { value: "brand.positioning_territories", label: "Positioning territories (multi-select)" },
    ],
  },
];

export interface IntakeScoreRule {
  present_points?: number;
  per_pick_points?: number;
  per_item_points?: number;
  slider_points?: number;
  max?: number;
  option_points?: Record<string, number>;
  section?: string;
}

export interface IntakeScoreConfig {
  sections?: string[];
  max_points?: number;
  questions: Record<string, IntakeScoreRule>;
}

interface TemplateDetail {
  template_id: string;
  slug: string;
  scope: "system" | "founder" | "per_tenant";
  kind: "intake";
  name: string;
  description?: string | null;
  // The API (normalizeTemplateRow) returns `question_schema`/`score_config`;
  // keep the `_json` aliases for tolerance.
  question_schema?: IntakeQuestion[] | string | null;
  score_config?: IntakeScoreConfig | string | null;
  question_schema_json?: IntakeQuestion[] | string | null;
  score_config_json?: IntakeScoreConfig | string | null;
  version: number;
  is_system_seed: boolean | number;
  is_archived: boolean | number;
}

export interface IntakeTemplateEditorModalProps {
  open: boolean;
  /** null = create mode. Non-null = edit (or view, for system-seed). */
  templateId: string | null;
  onClose: () => void;
  onSaved?: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────

const QUESTION_TYPE_LABEL: Record<IntakeQuestionType, string> = {
  slider_1_10:   "Slider 1–10",
  multi_select:  "Multi-select",
  single_select: "Single-select",
  short_text:    "Short text",
  long_text:     "Long text",
  bullet_list:   "Bullet list",
};

function asBool(v: boolean | number | undefined): boolean {
  return typeof v === "number" ? v === 1 : !!v;
}

function parseQuestions(raw: IntakeQuestion[] | string | null | undefined): IntakeQuestion[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return Array.isArray(raw) ? raw : [];
}

function parseScore(raw: IntakeScoreConfig | string | null | undefined): IntakeScoreConfig {
  if (!raw) return { questions: {} };
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.questions) return parsed as IntakeScoreConfig;
      return { questions: {} };
    } catch { return { questions: {} }; }
  }
  return raw;
}

function genQuestionId(): string {
  // Short stable id — readable in the schema JSON without bloating storage.
  return `q_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36).slice(-3)}`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

// ─── Component ──────────────────────────────────────────────────────────

export function IntakeTemplateEditorModal({
  open, templateId, onClose, onSaved,
}: IntakeTemplateEditorModalProps) {
  const { get, post, patch } = useOliverApi();

  const isCreate = !templateId;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Template-level fields
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<IntakeQuestion[]>([]);
  const [scoreConfig, setScoreConfig] = useState<IntakeScoreConfig>({ questions: {} });
  const [isSystem, setIsSystem] = useState(false);
  const [version, setVersion] = useState(1);

  // Drag/drop state — track the index of the dragged row + the hover target.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!templateId) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await get<{ template: TemplateDetail }>(`/consulting/document-templates/${templateId}`);
      const t = r?.template;
      if (!t) throw new Error("Template not found.");
      setName(t.name || "");
      setSlug(t.slug || "");
      setDescription(t.description || "");
      setQuestions(parseQuestions(t.question_schema ?? t.question_schema_json));
      setScoreConfig(parseScore(t.score_config ?? t.score_config_json));
      setIsSystem(asBool(t.is_system_seed));
      setVersion(t.version || 1);
    } catch (e) {
      const msg = (e as Error).message || "Could not load template";
      if (/404|not.?found/i.test(msg)) {
        setErr("F4 backend endpoint not deployed yet — load failed.");
      } else {
        setErr(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [get, templateId]);

  useEffect(() => {
    if (!open) return;
    if (isCreate) {
      // Reset for create mode
      setName("");
      setSlug("");
      setDescription("");
      setQuestions([]);
      setScoreConfig({ questions: {} });
      setIsSystem(false);
      setVersion(1);
      setErr(null);
      setInfo(null);
    } else {
      void load();
    }
  }, [open, isCreate, load]);

  // Section list derived from question.section + scoreConfig.sections.
  const sectionList = useMemo(() => {
    const seen = new Set<string>();
    (scoreConfig.sections || []).forEach((s) => { if (s) seen.add(s); });
    for (const q of questions) { if (q.section) seen.add(q.section); }
    return Array.from(seen);
  }, [scoreConfig.sections, questions]);

  // Derived max_points — sum of per-question caps when present, falls back
  // to a heuristic when a rule is missing a 'max'.
  const computedMax = useMemo(() => {
    let total = 0;
    for (const q of questions) {
      const rule = scoreConfig.questions[q.id];
      if (!rule) continue;
      if (typeof rule.max === "number") { total += rule.max; continue; }
      if (q.type === "slider_1_10") total += 10 * (rule.slider_points ?? 1);
      else if (q.type === "multi_select") {
        const cap = q.max_select ?? (q.options?.length ?? 0);
        total += (rule.present_points ?? 0) + cap * (rule.per_pick_points ?? 0);
      } else if (q.type === "bullet_list") {
        const cap = q.max_items ?? 5;
        total += (rule.present_points ?? 0) + cap * (rule.per_item_points ?? rule.per_pick_points ?? 0);
      } else {
        total += rule.present_points ?? 0;
      }
    }
    return total;
  }, [questions, scoreConfig]);

  // ── Mutators ────────────────────────────────────────────────────────

  function addQuestion(type: IntakeQuestionType) {
    if (isSystem) return;
    const id = genQuestionId();
    const q: IntakeQuestion = { id, type, label: "Untitled question" };
    if (type === "multi_select" || type === "single_select") q.options = ["option_a", "option_b"];
    if (type === "multi_select") q.max_select = 3;
    if (type === "bullet_list") q.max_items = 3;
    setQuestions((arr) => [...arr, q]);
    setScoreConfig((sc) => ({
      ...sc,
      questions: { ...sc.questions, [id]: defaultRuleForType(type) },
    }));
  }

  function defaultRuleForType(type: IntakeQuestionType): IntakeScoreRule {
    switch (type) {
      case "slider_1_10":   return { slider_points: 1, max: 10 };
      case "multi_select":  return { present_points: 4, per_pick_points: 2, max: 10 };
      case "single_select": return { present_points: 4 };
      case "short_text":    return { present_points: 2 };
      case "long_text":     return { present_points: 4 };
      case "bullet_list":   return { present_points: 4, per_item_points: 3, max: 12 };
    }
  }

  function updateQuestion(idx: number, patch: Partial<IntakeQuestion>) {
    if (isSystem) return;
    setQuestions((arr) => arr.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function deleteQuestion(idx: number) {
    if (isSystem) return;
    const q = questions[idx];
    if (!q) return;
    if (!confirm(`Delete question "${q.label}"? This can't be undone.`)) return;
    setQuestions((arr) => arr.filter((_, i) => i !== idx));
    setScoreConfig((sc) => {
      const next = { ...sc.questions };
      delete next[q.id];
      return { ...sc, questions: next };
    });
  }

  function updateScoreRule(qid: string, patch: Partial<IntakeScoreRule>) {
    if (isSystem) return;
    setScoreConfig((sc) => ({
      ...sc,
      questions: {
        ...sc.questions,
        [qid]: { ...(sc.questions[qid] || {}), ...patch },
      },
    }));
  }

  function moveQuestion(from: number, to: number) {
    if (isSystem) return;
    if (from === to || from < 0 || to < 0) return;
    setQuestions((arr) => {
      const next = arr.slice();
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
  }

  // ── DnD handlers ────────────────────────────────────────────────────

  function onDragStart(idx: number) {
    return (e: React.DragEvent) => {
      if (isSystem) { e.preventDefault(); return; }
      setDragIndex(idx);
      // Provide a generic payload so non-Chrome browsers initiate the drag.
      e.dataTransfer.setData("text/plain", String(idx));
      e.dataTransfer.effectAllowed = "move";
    };
  }

  function onDragOver(idx: number) {
    return (e: React.DragEvent) => {
      if (isSystem) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dropIndex !== idx) setDropIndex(idx);
    };
  }

  function onDrop(idx: number) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      if (isSystem) return;
      if (dragIndex === null) return;
      moveQuestion(dragIndex, idx);
      setDragIndex(null);
      setDropIndex(null);
    };
  }

  function onDragEnd() {
    setDragIndex(null);
    setDropIndex(null);
  }

  // ── Save / clone ────────────────────────────────────────────────────

  async function handleSave() {
    setErr(null);
    setInfo(null);
    if (!name.trim()) { setErr("Template name is required."); return; }
    if (questions.length === 0) { setErr("Add at least one question before saving."); return; }
    setSaving(true);
    try {
      const scoreConfigOut = { ...scoreConfig, max_points: computedMax || scoreConfig.max_points };
      const body = {
        kind: "intake" as const,
        name: name.trim(),
        slug: (slug || slugify(name)).trim() || slugify(name),
        description: description.trim() || null,
        // Canonical names the backend reads. (`_json` aliases kept for any
        // older backend still expecting them — backend accepts either.)
        question_schema: questions,
        score_config: scoreConfigOut,
        question_schema_json: questions,
        score_config_json: scoreConfigOut,
      };
      if (isCreate) {
        await post(`/consulting/document-templates`, body);
      } else {
        await patch(`/consulting/document-templates/${templateId}`, body);
      }
      onSaved?.();
    } catch (e) {
      const msg = (e as Error).message || "Save failed";
      if (/404|not.?found/i.test(msg)) {
        setErr("F4 backend not deployed yet — save will work once the API ships.");
      } else {
        setErr(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCloneToFounderScope() {
    if (!templateId) return;
    setSaving(true);
    setErr(null);
    setInfo(null);
    try {
      // Per F4 backend contract: POST with source_template_id triggers a
      // server-side clone that copies fields + flips scope to 'founder'
      // and is_system_seed to 0. If the route is not built yet, fall back
      // to a manual round-trip POST.
      const r = await post<{ template: { template_id: string } }>(`/consulting/document-templates`, {
        source_template_id: templateId,
        scope: "founder",
      });
      if (r?.template?.template_id) {
        setInfo("Cloned to a new founder-scope template — close this modal to see it in the library.");
      } else {
        setInfo("Clone request sent.");
      }
      onSaved?.();
    } catch (e) {
      const msg = (e as Error).message || "Clone failed";
      if (/404|not.?found/i.test(msg)) {
        setErr("F4 backend not deployed yet — clone will work once the API ships.");
      } else {
        setErr(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const readOnly = isSystem;

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="oliver"
      eyebrow={isCreate ? "NEW INTAKE TEMPLATE" : readOnly ? "SYSTEM INTAKE TEMPLATE" : "EDIT INTAKE TEMPLATE"}
      title={
        <span className="inline-flex items-center gap-2">
          {readOnly && <Lock className="h-4 w-4" />}
          {isCreate ? "New Intake Template" : name || "Intake Template"}
        </span>
      }
      subtitle={
        <span className="text-xs">
          {readOnly
            ? "System template — read-only. Clone to founder scope to edit."
            : "Drag rows to reorder. Each question can carry custom scoring rules."}
        </span>
      }
      size="info"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-slate-500">
            Computed max points: <strong>{computedMax || scoreConfig.max_points || 0}</strong>
            {sectionList.length > 0 && (
              <span className="ml-2">· Sections: {sectionList.join(" / ")}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
            >
              Close
            </button>
            {readOnly ? (
              <button
                type="button"
                onClick={handleCloneToFounderScope}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: CORE_BLUE }}
              >
                <Copy className="h-3.5 w-3.5" />
                {saving ? "Cloning…" : "Clone to founder scope"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: CORE_BLUE }}
              >
                {saving ? "Saving…" : isCreate ? "Create template" : "Save changes"}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex h-full flex-col overflow-y-auto">
        {loading && (
          <div className="px-6 py-10 text-center text-sm text-slate-500">Loading template…</div>
        )}

        {!loading && (
          <div className="px-5 py-4 space-y-4">
            {err && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 inline-flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" /> {err}
              </div>
            )}
            {info && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {info}
              </div>
            )}

            {/* Template meta */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={readOnly}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Slug
                </label>
                <input
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder={name ? slugify(name) : "auto-generated from name"}
                  disabled={readOnly}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono disabled:bg-slate-50 disabled:text-slate-500"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">Used in the URL + as a stable identifier — auto-generated from name if blank.</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  disabled={readOnly}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            </div>

            {/* Add-question palette */}
            {!readOnly && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Add question:</span>
                {(Object.keys(QUESTION_TYPE_LABEL) as IntakeQuestionType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addQuestion(t)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white text-xs text-slate-700 hover:border-[#0C4A60] hover:text-[#0C4A60]"
                  >
                    <Plus className="h-3 w-3" /> {QUESTION_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            )}

            {/* Question list */}
            <ol className="space-y-2" onDragEnd={onDragEnd}>
              {questions.length === 0 && (
                <li className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                  No questions yet — pick a question type above to add one.
                </li>
              )}
              {questions.map((q, idx) => (
                <QuestionRow
                  key={q.id}
                  index={idx}
                  question={q}
                  rule={scoreConfig.questions[q.id] || {}}
                  readOnly={readOnly}
                  isDragTarget={dropIndex === idx}
                  onDragStart={onDragStart(idx)}
                  onDragOver={onDragOver(idx)}
                  onDrop={onDrop(idx)}
                  onChange={(patch) => updateQuestion(idx, patch)}
                  onRuleChange={(rp) => updateScoreRule(q.id, rp)}
                  onDelete={() => deleteQuestion(idx)}
                />
              ))}
            </ol>

            <div className="text-[10px] text-slate-500 italic pt-2">
              Version v{version}. Saving creates a new version snapshot. Existing submissions
              keep the version they were submitted against — edits never invalidate a snapshot.
            </div>
          </div>
        )}
      </div>
    </IadmModal>
  );
}

// ─── QuestionRow ────────────────────────────────────────────────────────

interface QuestionRowProps {
  index: number;
  question: IntakeQuestion;
  rule: IntakeScoreRule;
  readOnly: boolean;
  isDragTarget: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onChange: (patch: Partial<IntakeQuestion>) => void;
  onRuleChange: (patch: Partial<IntakeScoreRule>) => void;
  onDelete: () => void;
}

function QuestionRow({
  index, question, rule, readOnly, isDragTarget,
  onDragStart, onDragOver, onDrop, onChange, onRuleChange, onDelete,
}: QuestionRowProps) {
  const [open, setOpen] = useState(false);

  // Option editor (multi/single select)
  function updateOption(i: number, val: string) {
    const next = (question.options || []).slice();
    next[i] = val;
    onChange({ options: next });
  }
  function addOption() {
    onChange({ options: [...(question.options || []), `option_${(question.options?.length || 0) + 1}`] });
  }
  function removeOption(i: number) {
    const next = (question.options || []).filter((_, j) => j !== i);
    onChange({ options: next });
  }

  return (
    <li
      draggable={!readOnly}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`rounded-lg border bg-white transition ${
        isDragTarget ? "border-[#0C4A60] shadow-md" : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <span
          className={`mt-1 ${readOnly ? "text-slate-300" : "text-slate-400 cursor-grab"}`}
          title={readOnly ? "System template — locked" : "Drag to reorder"}
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <input
              value={question.label}
              onChange={(e) => onChange({ label: e.target.value })}
              disabled={readOnly}
              placeholder="Question label"
              className="flex-1 rounded border border-transparent hover:border-slate-200 focus:border-slate-300 px-1.5 py-1 text-sm font-semibold text-slate-900 disabled:bg-transparent disabled:text-slate-700"
            />
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
              {QUESTION_TYPE_LABEL[question.type]}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
            <span>id: <code className="bg-slate-50 px-1 rounded font-mono">{question.id}</code></span>
            {question.section && <span>section: {question.section}</span>}
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!question.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                disabled={readOnly}
                className="h-3 w-3 rounded border-slate-300"
              />
              Required
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-slate-400 hover:text-slate-700"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand details"}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={onDelete}
            className="mt-1 text-slate-400 hover:text-rose-600"
            title="Delete question"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-slate-100 px-3 py-3 space-y-3">
          {/* Type-specific editor */}
          {(question.type === "multi_select" || question.type === "single_select") && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Choices {question.type === "multi_select" && question.max_select != null && (
                  <span className="font-normal italic ml-1">(max {question.max_select})</span>
                )}
              </div>
              <div className="space-y-1.5">
                {(question.options || []).map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={opt}
                      onChange={(e) => updateOption(i, e.target.value)}
                      disabled={readOnly}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs font-mono disabled:bg-slate-50 disabled:text-slate-500"
                    />
                    <input
                      type="number"
                      value={rule.option_points?.[opt] ?? ""}
                      onChange={(e) => {
                        const n = e.target.value === "" ? undefined : Number(e.target.value);
                        const nextMap = { ...(rule.option_points || {}) };
                        if (n == null) delete nextMap[opt];
                        else nextMap[opt] = n;
                        onRuleChange({ option_points: nextMap });
                      }}
                      disabled={readOnly}
                      placeholder="pts"
                      title="Score per option (optional)"
                      className="w-16 rounded border border-slate-200 px-1.5 py-1 text-xs text-right disabled:bg-slate-50"
                    />
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => removeOption(i)}
                        className="text-slate-400 hover:text-rose-600"
                        title="Remove choice"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={addOption}
                    className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-[#0C4A60]"
                  >
                    <Plus className="h-3 w-3" /> Add choice
                  </button>
                )}
              </div>
              {question.type === "multi_select" && (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <label>Max choices:</label>
                  <input
                    type="number"
                    value={question.max_select ?? 3}
                    onChange={(e) => onChange({ max_select: Math.max(1, Number(e.target.value) || 1) })}
                    disabled={readOnly}
                    className="w-16 rounded border border-slate-300 px-1.5 py-0.5 disabled:bg-slate-50"
                  />
                </div>
              )}
            </div>
          )}

          {question.type === "bullet_list" && (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <label>Max items:</label>
              <input
                type="number"
                value={question.max_items ?? 3}
                onChange={(e) => onChange({ max_items: Math.max(1, Number(e.target.value) || 1) })}
                disabled={readOnly}
                className="w-16 rounded border border-slate-300 px-1.5 py-0.5 disabled:bg-slate-50"
              />
            </div>
          )}

          {(question.type === "short_text" || question.type === "long_text") && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Placeholder (optional)
              </label>
              <input
                value={question.placeholder || ""}
                onChange={(e) => onChange({ placeholder: e.target.value })}
                disabled={readOnly}
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-50"
              />
            </div>
          )}

          {/* Pre-fills — where this answer flows when the intake is submitted.
              Optional; drives the data-driven intake→prefill (no hardcoding). */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Pre-fills (optional)
            </label>
            <select
              value={question.maps_to || ""}
              onChange={(e) => onChange({ maps_to: e.target.value || undefined })}
              disabled={readOnly}
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs bg-white disabled:bg-slate-50"
            >
              <option value="">— Doesn't pre-fill anything</option>
              {MAPS_TO_OPTIONS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {question.maps_to && (
              <p className="mt-0.5 text-[10px] text-slate-500">
                On submit, this answer pre-fills <code>{question.maps_to}</code>
                {question.maps_to.startsWith("profile.") || question.maps_to.startsWith("owner.")
                  ? " — shown in onboarding for confirmation, never written silently."
                  : " — synced to the client's brand voice profile."}
              </p>
            )}
          </div>

          {/* Section + scoring */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
                Section
              </label>
              <input
                value={question.section || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange({ section: v || undefined });
                  onRuleChange({ section: v || undefined });
                }}
                disabled={readOnly}
                placeholder="voice / visual / …"
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
                Max points
              </label>
              <input
                type="number"
                value={rule.max ?? ""}
                onChange={(e) => onRuleChange({ max: e.target.value === "" ? undefined : Number(e.target.value) })}
                disabled={readOnly}
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-50"
              />
            </div>
            {question.type === "slider_1_10" && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
                  Per slider unit
                </label>
                <input
                  type="number"
                  value={rule.slider_points ?? 1}
                  onChange={(e) => onRuleChange({ slider_points: Number(e.target.value) || 0 })}
                  disabled={readOnly}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-50"
                />
              </div>
            )}
            {(question.type === "multi_select" || question.type === "single_select" || question.type === "short_text" || question.type === "long_text" || question.type === "bullet_list") && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
                  Present pts
                </label>
                <input
                  type="number"
                  value={rule.present_points ?? ""}
                  onChange={(e) => onRuleChange({ present_points: e.target.value === "" ? undefined : Number(e.target.value) })}
                  disabled={readOnly}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-50"
                />
              </div>
            )}
            {(question.type === "multi_select" || question.type === "bullet_list") && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
                  Per pick / item
                </label>
                <input
                  type="number"
                  value={(question.type === "bullet_list" ? rule.per_item_points : rule.per_pick_points) ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                    if (question.type === "bullet_list") onRuleChange({ per_item_points: v });
                    else onRuleChange({ per_pick_points: v });
                  }}
                  disabled={readOnly}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-50"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default IntakeTemplateEditorModal;

// ConsultingIntakeFormPage — F4 (Consulting Rework 2026-06-25).
//
// Client-facing intake form player. Mounted at /app/consulting/intake/:submissionId
// inside the authenticated app shell (NOT a public token page — clients hit it
// from a SPARK welcome email link after they sign in to their portal).
//
// Behavior:
//   • Loads GET /consulting/intake-submissions/:id which returns the
//     submission row + frozen-at-version question_schema_json from the
//     joined template + any prior answers_json (for resume-after-save).
//   • Renders one form component per question_schema entry, by question.type:
//       slider_1_10   → <input type="range" min=1 max=10>
//       multi_select  → checkbox grid (max_select enforced)
//       single_select → radio group
//       short_text    → <input type="text">
//       long_text     → <textarea>
//       bullet_list   → array of small <input>s up to max_items
//   • "Save draft" → PATCH .../intake-submissions/:id { answers_json,
//                                                       is_draft: true }
//   • "Submit" → POST .../intake-submissions/:id/submit
//     → server scores + writes PDF + flips is_draft to 0, returns score_total
//     + score_breakdown + pdf_blob_path.
//   • On submit success, swap the form for a "Thanks — here's your score"
//     screen with PDF download link + "Open in Project" link.
//
// All endpoints are gated by viewer = project owner OR a member of the
// linked client tenant — the F4 backend handles that.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { CheckCircle2, AlertCircle, FileDown, ArrowRight } from "lucide-react";
import type { IntakeQuestion } from "../../components/consulting/IntakeTemplateEditorModal";

// ─── Types ──────────────────────────────────────────────────────────────

interface SubmissionDetail {
  submission_id: string;
  project_id: string;
  project_name: string | null;
  template_id: string;
  template_name: string;
  template_version: number;
  question_schema_json: IntakeQuestion[] | string;
  answers_json: Record<string, unknown> | string | null;
  is_draft: boolean | number;
  submitted_at: string | null;
  score_total: number | null;
  score_breakdown_json: Record<string, unknown> | string | null;
  pdf_blob_path: string | null;
}

type AnswerValue = number | string | string[] | null;

function parseQuestions(raw: IntakeQuestion[] | string): IntakeQuestion[] {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function parseAnswers(raw: Record<string, unknown> | string | null | undefined): Record<string, AnswerValue> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === "object") ? (parsed as Record<string, AnswerValue>) : {};
    } catch { return {}; }
  }
  return (raw as Record<string, AnswerValue>) || {};
}

function asBool(v: boolean | number | undefined): boolean {
  return typeof v === "number" ? v === 1 : !!v;
}

// ─── Page ───────────────────────────────────────────────────────────────

export function ConsultingIntakeFormPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const { get, patch, post, ready } = useOliverApi();

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [questions, setQuestions] = useState<IntakeQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  // Post-submit result panel (replaces the form on success)
  const [result, setResult] = useState<{
    score_total: number | null;
    score_breakdown: Record<string, unknown> | null;
    pdf_blob_path: string | null;
    project_id: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!ready || !submissionId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ submission: SubmissionDetail }>(`/consulting/intake-submissions/${submissionId}`);
      const s = r?.submission;
      if (!s) throw new Error("Submission not found.");
      setSubmission(s);
      setQuestions(parseQuestions(s.question_schema_json));
      setAnswers(parseAnswers(s.answers_json));
      // If already-submitted, jump straight to the result panel.
      if (!asBool(s.is_draft) && s.submitted_at) {
        setResult({
          score_total: s.score_total,
          score_breakdown: typeof s.score_breakdown_json === "string"
            ? safeJson(s.score_breakdown_json)
            : (s.score_breakdown_json as Record<string, unknown> | null),
          pdf_blob_path: s.pdf_blob_path,
          project_id: s.project_id,
        });
      }
    } catch (e) {
      const msg = (e as Error).message || "Could not load intake form";
      if (/404|not.?found/i.test(msg)) {
        setError("Intake form not available — the F4 backend may not be deployed yet or this link is invalid.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [get, ready, submissionId]);

  useEffect(() => { load(); }, [load]);

  // Track required-question completion for the Submit button enabled state.
  const missingRequired = useMemo(() => {
    const missing: string[] = [];
    for (const q of questions) {
      if (!q.required) continue;
      const v = answers[q.id];
      if (!isAnswered(q, v)) missing.push(q.label);
    }
    return missing;
  }, [questions, answers]);

  function updateAnswer(qid: string, v: AnswerValue) {
    setAnswers((a) => ({ ...a, [qid]: v }));
    setSavedMessage(null);
  }

  async function handleSaveDraft() {
    if (!submissionId) return;
    setSaving(true);
    setSubmitErr(null);
    setSavedMessage(null);
    try {
      await patch(`/consulting/intake-submissions/${submissionId}`, {
        answers_json: answers,
        is_draft: true,
      });
      setSavedMessage("Draft saved.");
    } catch (e) {
      const msg = (e as Error).message || "Save failed";
      if (/404|not.?found/i.test(msg)) {
        setSubmitErr("Draft save endpoint not deployed yet — keep this tab open until the F4 backend lands.");
      } else {
        setSubmitErr(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!submissionId) return;
    if (missingRequired.length > 0) {
      setSubmitErr(`Please answer all required questions: ${missingRequired.join(", ")}`);
      return;
    }
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const r = await post<{
        submission: {
          submission_id: string;
          project_id: string;
          score_total: number | null;
          score_breakdown_json: Record<string, unknown> | string | null;
          pdf_blob_path: string | null;
        };
      }>(`/consulting/intake-submissions/${submissionId}/submit`, {
        answers_json: answers,
      });
      const s = r?.submission;
      if (s) {
        setResult({
          score_total: s.score_total,
          score_breakdown: typeof s.score_breakdown_json === "string"
            ? safeJson(s.score_breakdown_json)
            : (s.score_breakdown_json as Record<string, unknown> | null),
          pdf_blob_path: s.pdf_blob_path,
          project_id: s.project_id,
        });
      } else {
        // The F4 backend might respond {ok:true} only — still flip into the
        // result panel using whatever we already had loaded.
        setResult({
          score_total: null,
          score_breakdown: null,
          pdf_blob_path: null,
          project_id: submission?.project_id || "",
        });
      }
    } catch (e) {
      const msg = (e as Error).message || "Submit failed";
      if (/404|not.?found/i.test(msg)) {
        setSubmitErr("Submit endpoint not deployed yet — your draft is safe; the F4 backend will pick it up when it ships.");
      } else {
        setSubmitErr(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <OliverPageWrapper title="Intake Form" subtitle="IA Consulting" error={null} loading={true}>
        <div />
      </OliverPageWrapper>
    );
  }
  if (error) {
    return (
      <OliverPageWrapper title="Intake Form" subtitle="IA Consulting" error={null} loading={false}>
        <div className="max-w-2xl mx-auto">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700 inline-flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div>{error}</div>
          </div>
        </div>
      </OliverPageWrapper>
    );
  }

  // Post-submit success panel
  if (result) {
    return (
      <OliverPageWrapper
        title={submission?.template_name || "Intake Submitted"}
        subtitle={submission?.project_name ? `IA Consulting · ${submission.project_name}` : "IA Consulting"}
        error={null}
        loading={false}
      >
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-6 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-3">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="text-lg font-bold text-emerald-900">Thanks — intake submitted.</div>
            <p className="text-sm text-emerald-800 mt-1">
              Your project owner has been notified. You can download the snapshot below or jump back to your project.
            </p>
          </div>

          {result.score_total != null && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your score</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-slate-900">{result.score_total}</span>
                <span className="text-sm text-slate-500">points</span>
              </div>
              {result.score_breakdown && (
                <BreakdownChips breakdown={result.score_breakdown} />
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {result.pdf_blob_path && (
              <a
                href={result.pdf_blob_path}
                download
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FileDown className="h-3.5 w-3.5" />
                Download PDF snapshot
              </a>
            )}
            {result.project_id && (
              <Link
                to={`/app/admin/consulting/projects?open=${encodeURIComponent(result.project_id)}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#0C4A60] text-white text-xs font-semibold hover:bg-[#0a3d50]"
              >
                Open in Project
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </OliverPageWrapper>
    );
  }

  // Form mode
  return (
    <OliverPageWrapper
      title={submission?.template_name || "Intake Form"}
      subtitle={submission?.project_name ? `IA Consulting · ${submission.project_name}` : "IA Consulting"}
      error={null}
      loading={false}
    >
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <h1 className="text-lg font-bold text-slate-900">{submission?.template_name}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Answer as many as you can. You can save a draft and come back later, or submit when you're done.
            {missingRequired.length > 0 && (
              <span className="ml-2 text-amber-700 font-semibold">
                {missingRequired.length} required answer{missingRequired.length === 1 ? "" : "s"} remaining.
              </span>
            )}
          </p>
        </div>

        {questions.map((q, idx) => (
          <QuestionInput
            key={q.id}
            index={idx + 1}
            question={q}
            value={answers[q.id]}
            onChange={(v) => updateAnswer(q.id, v)}
          />
        ))}

        {submitErr && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 inline-flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> {submitErr}
          </div>
        )}
        {savedMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {savedMessage}
          </div>
        )}

        {/* Action bar — sticky at the bottom of the viewport so the buttons
            stay reachable on long forms. */}
        <div className="sticky bottom-0 -mx-2 mt-4 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 bg-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || missingRequired.length > 0}
            className="px-4 py-1.5 rounded bg-[#0C4A60] text-white text-xs font-semibold disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </OliverPageWrapper>
  );
}

// ─── Per-question input ─────────────────────────────────────────────────

function QuestionInput({
  index, question, value, onChange,
}: {
  index: number;
  question: IntakeQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
        Question {index}
        {question.section && <span className="ml-1 text-slate-400">· {question.section}</span>}
      </div>
      <div className="text-sm font-semibold text-slate-900">
        {question.label}
        {question.required && <span className="ml-1 text-rose-500">*</span>}
      </div>

      <div className="mt-3">
        {question.type === "slider_1_10" && (
          <SliderInput value={typeof value === "number" ? value : undefined} onChange={(n) => onChange(n)} />
        )}
        {question.type === "multi_select" && (
          <MultiSelectInput question={question} value={Array.isArray(value) ? value : []} onChange={(arr) => onChange(arr)} />
        )}
        {question.type === "single_select" && (
          <SingleSelectInput question={question} value={typeof value === "string" ? value : ""} onChange={(s) => onChange(s)} />
        )}
        {question.type === "short_text" && (
          <input
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={question.placeholder || ""}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        )}
        {question.type === "long_text" && (
          <textarea
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={question.placeholder || ""}
            rows={4}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        )}
        {question.type === "bullet_list" && (
          <BulletListInput question={question} value={Array.isArray(value) ? value : []} onChange={(arr) => onChange(arr)} />
        )}
      </div>
    </div>
  );
}

function SliderInput({ value, onChange }: { value: number | undefined; onChange: (n: number) => void }) {
  const v = typeof value === "number" ? value : 5;
  return (
    <div>
      <input
        type="range"
        min={1}
        max={10}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
        <span>1</span>
        <span className="font-bold text-slate-700">{v}</span>
        <span>10</span>
      </div>
    </div>
  );
}

function MultiSelectInput({
  question, value, onChange,
}: {
  question: IntakeQuestion;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const max = question.max_select ?? (question.options?.length ?? 0);
  function toggle(opt: string) {
    if (value.includes(opt)) {
      onChange(value.filter((x) => x !== opt));
    } else {
      if (value.length >= max) return; // enforced silently — UI shows count
      onChange([...value, opt]);
    }
  }
  return (
    <div>
      {max > 0 && (
        <div className="text-[11px] text-slate-500 mb-1">
          Pick up to {max}. {value.length}/{max} selected.
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
        {(question.options || []).map((opt) => {
          const active = value.includes(opt);
          const disabled = !active && value.length >= max;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              disabled={disabled}
              className={`text-left rounded border px-2 py-1.5 text-xs transition ${
                active
                  ? "border-[#0C4A60] bg-[#0C4A60]/5 text-[#0C4A60] font-semibold"
                  : disabled
                    ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {opt.replace(/_/g, " ")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SingleSelectInput({
  question, value, onChange,
}: {
  question: IntakeQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
      {(question.options || []).map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`text-left rounded border px-2 py-1.5 text-xs transition ${
              active
                ? "border-[#0C4A60] bg-[#0C4A60]/5 text-[#0C4A60] font-semibold"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            {opt.replace(/_/g, " ")}
          </button>
        );
      })}
    </div>
  );
}

function BulletListInput({
  question, value, onChange,
}: {
  question: IntakeQuestion;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const max = question.max_items ?? 5;
  function update(i: number, s: string) {
    const next = value.slice();
    next[i] = s;
    onChange(next);
  }
  function add() {
    if (value.length >= max) return;
    onChange([...value, ""]);
  }
  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i));
  }
  return (
    <div className="space-y-1.5">
      {value.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-slate-400 text-xs w-4 text-right">{i + 1}.</span>
          <input
            value={v}
            onChange={(e) => update(i, e.target.value)}
            placeholder={question.placeholder || `Item ${i + 1}`}
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-slate-400 hover:text-rose-600 text-xs"
            title="Remove"
          >
            ✕
          </button>
        </div>
      ))}
      {value.length < max && (
        <button
          type="button"
          onClick={add}
          className="text-xs text-slate-600 hover:text-[#0C4A60]"
        >
          + Add item ({value.length}/{max})
        </button>
      )}
    </div>
  );
}

// ─── Breakdown chips ────────────────────────────────────────────────────

function BreakdownChips({ breakdown }: { breakdown: Record<string, unknown> }) {
  // F4 backend returns score_breakdown_json shaped like:
  //   { sections: { voice: 12, visual: 8, positioning: 9, differentiators: 11 } }
  // Render whatever the server gave us — defensive against shape drift.
  const sections = (breakdown as { sections?: Record<string, number> }).sections;
  if (!sections || typeof sections !== "object") return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {Object.entries(sections).map(([k, v]) => (
        <span key={k} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
          <strong className="capitalize">{k.replace(/_/g, " ")}</strong>: {v}
        </span>
      ))}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function isAnswered(q: IntakeQuestion, v: unknown): boolean {
  if (q.type === "slider_1_10") return typeof v === "number" && v >= 1 && v <= 10;
  if (q.type === "multi_select") return Array.isArray(v) && v.length > 0;
  if (q.type === "single_select") return typeof v === "string" && v.length > 0;
  if (q.type === "bullet_list") return Array.isArray(v) && v.filter((s) => typeof s === "string" && s.trim()).length > 0;
  return typeof v === "string" && v.trim().length > 0;
}

function safeJson(s: string): Record<string, unknown> | null {
  try { const parsed = JSON.parse(s); return (parsed && typeof parsed === "object") ? parsed : null; }
  catch { return null; }
}

export default ConsultingIntakeFormPage;

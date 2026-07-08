// PublicFormPage.tsx — public, no-login consulting form fill.
//
// Mounted at /p/forms/:token (alongside the other public /p pages). The token
// IS the auth — a prospect who is NOT a tenant yet opens the emailed link,
// fills the form, and submits. All calls go DIRECTLY to oliver-api's public
// /p/forms endpoints (no MSAL, no bearer token). Mirrors PublicRevisionPage.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const OLIVER_API_BASE =
  (import.meta.env.VITE_OLIVER_API_BASE as string) ||
  "https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net";

const ACCENT = "#1A3A4A";

interface FormQuestion {
  id: string;
  type: "slider_1_10" | "multi_select" | "single_select" | "short_text" | "long_text" | "bullet_list";
  label: string;
  required?: boolean;
  options?: string[];
  max_select?: number;
  max_items?: number;
  placeholder?: string;
}
interface FormPayload {
  template_name: string;
  template_description?: string | null;
  project_name: string;
  question_schema: FormQuestion[];
  answers: Record<string, unknown>;
  is_draft: boolean;
  submitted_at: string | null;
}

export function PublicFormPage() {
  const { token } = useParams<{ token: string }>();
  const [form, setForm] = useState<FormPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${OLIVER_API_BASE}/p/forms/${token}`);
      if (res.status === 404) throw new Error("This form link is invalid or has expired.");
      if (!res.ok) throw new Error(`Couldn't load the form (${res.status}).`);
      const body = await res.json();
      const f: FormPayload = body?.data?.form;
      setForm(f);
      setAnswers(f?.answers && typeof f.answers === "object" ? f.answers : {});
      if (f && !f.is_draft) setDone(true);
    } catch (e) {
      setError((e as Error).message || "Couldn't load the form.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  function setAnswer(id: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmit() {
    if (!form) return;
    // Client-side required check (server re-validates).
    const missing = form.question_schema.filter((q) => {
      if (!q.required) return false;
      const v = answers[q.id];
      return Array.isArray(v) ? v.length === 0 : v == null || String(v).trim() === "";
    });
    if (missing.length) { setError(`Please answer: ${missing.map((q) => q.label).join(", ")}`); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${OLIVER_API_BASE}/p/forms/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (res.status === 409) { setDone(true); return; }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.message || `Submit failed (${res.status}).`);
      }
      setDone(true);
    } catch (e) {
      setError((e as Error).message || "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const wrap: React.CSSProperties = { maxWidth: 640, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1e293b" };

  if (loading) return <div style={wrap}>Loading…</div>;
  if (error && !form) return <div style={{ ...wrap, color: "#9F1239" }}>{error}</div>;
  if (!form) return <div style={wrap}>Form not found.</div>;

  if (done) {
    return (
      <div style={wrap}>
        <div style={{ borderTop: `4px solid ${ACCENT}`, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>✓</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "8px 0" }}>Thank you!</h1>
          <p style={{ color: "#475569" }}>Your responses for <strong>{form.template_name}</strong> have been submitted. We'll take it from here.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderTop: `4px solid ${ACCENT}`, borderRadius: 12, padding: 28 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8", fontWeight: 700 }}>Intelligent Analytics</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "6px 0 2px" }}>{form.template_name}</h1>
        {form.template_description && <p style={{ color: "#64748b", fontSize: 14, marginTop: 0 }}>{form.template_description}</p>}

        {error && <div style={{ color: "#9F1239", background: "#FEF2F2", borderRadius: 8, padding: "8px 12px", margin: "12px 0", fontSize: 14 }}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 20 }}>
          {form.question_schema.map((q) => (
            <div key={q.id}>
              <label style={{ display: "block", fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                {q.label}{q.required && <span style={{ color: "#dc2626" }}> *</span>}
              </label>
              <QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{ marginTop: 24, width: "100%", padding: "12px 16px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>
    </div>
  );
}

function QuestionInput({ q, value, onChange }: { q: FormQuestion; value: unknown; onChange: (v: unknown) => void }) {
  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14, boxSizing: "border-box" };

  if (q.type === "short_text") {
    return <input style={inputStyle} value={(value as string) || ""} placeholder={q.placeholder || ""} onChange={(e) => onChange(e.target.value)} />;
  }
  if (q.type === "long_text") {
    return <textarea style={{ ...inputStyle, minHeight: 90 }} value={(value as string) || ""} placeholder={q.placeholder || ""} onChange={(e) => onChange(e.target.value)} />;
  }
  if (q.type === "slider_1_10") {
    const n = typeof value === "number" ? value : 5;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input type="range" min={1} max={10} value={n} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
        <span style={{ fontWeight: 700, minWidth: 20, textAlign: "center" }}>{n}</span>
      </div>
    );
  }
  if (q.type === "single_select") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(q.options || []).map((opt) => (
          <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="radio" name={q.id} checked={value === opt} onChange={() => onChange(opt)} /> {opt}
          </label>
        ))}
      </div>
    );
  }
  if (q.type === "multi_select") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (opt: string) => {
      if (arr.includes(opt)) onChange(arr.filter((x) => x !== opt));
      else if (!q.max_select || arr.length < q.max_select) onChange([...arr, opt]);
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(q.options || []).map((opt) => (
          <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={arr.includes(opt)} onChange={() => toggle(opt)} /> {opt}
          </label>
        ))}
        {q.max_select && <span style={{ fontSize: 12, color: "#94a3b8" }}>Pick up to {q.max_select}.</span>}
      </div>
    );
  }
  if (q.type === "bullet_list") {
    const count = q.max_items || 5;
    const arr = Array.isArray(value) ? (value as string[]) : [];
    const rows = Array.from({ length: count }, (_, i) => arr[i] || "");
    const setRow = (i: number, v: string) => {
      const next = [...rows];
      next[i] = v;
      onChange(next.filter((x) => String(x).trim() !== ""));
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r, i) => (
          <input key={i} style={inputStyle} value={r} placeholder={`Item ${i + 1}`} onChange={(e) => setRow(i, e.target.value)} />
        ))}
      </div>
    );
  }
  return null;
}

export default PublicFormPage;

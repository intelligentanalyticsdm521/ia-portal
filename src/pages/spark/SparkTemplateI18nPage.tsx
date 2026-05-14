// SparkTemplateI18nPage — Multi-language email + SMS template translations (v1.18).
//
// Shows the i18n coverage matrix (which templates have which locales) and
// lets the user pick a template to add/remove translations. Per-locale text
// is plain UTF-8; render uses the same {{var}} interpolation as the primary.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Languages, Plus, Trash2, Mail, MessageSquare, Globe2 } from "lucide-react";

interface TemplateCoverage {
  id: number;
  template_key: string;
  primary_subject?: string;
  locales: string | null; // comma-separated locale tags
}

interface CoverageResponse {
  email: TemplateCoverage[];
  sms: TemplateCoverage[];
}

interface EmailTranslation {
  id: number;
  template_id: number;
  locale: string;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  created_at: string;
}

interface SmsTranslation {
  id: number;
  template_id: number;
  locale: string;
  body: string | null;
  created_at: string;
}

const COMMON_LOCALES = [
  { tag: "es-US", label: "Spanish (US)" },
  { tag: "es-MX", label: "Spanish (Mexico)" },
  { tag: "fr-CA", label: "French (Canada)" },
  { tag: "fr-FR", label: "French (France)" },
  { tag: "de-DE", label: "German" },
  { tag: "pt-BR", label: "Portuguese (Brazil)" },
  { tag: "it-IT", label: "Italian" },
  { tag: "zh-CN", label: "Chinese (Simplified)" },
  { tag: "ja-JP", label: "Japanese" },
];

export function SparkTemplateI18nPage() {
  const { get, post, del, ready } = useSparkApi();
  const [coverage, setCoverage] = useState<CoverageResponse>({ email: [], sms: [] });
  const [kind, setKind] = useState<"email" | "sms">("email");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [emailTrans, setEmailTrans] = useState<EmailTranslation[]>([]);
  const [smsTrans, setSmsTrans] = useState<SmsTranslation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ locale: "es-US", subject: "", body_html: "", body_text: "", body: "" });

  const fetchCoverage = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<CoverageResponse>("/api/v1/template-i18n/coverage");
      setCoverage({ email: r.email || [], sms: r.sms || [] });
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { fetchCoverage(); }, [fetchCoverage]);

  const fetchTranslations = useCallback(async () => {
    if (!ready || selectedId == null) { setEmailTrans([]); setSmsTrans([]); return; }
    try {
      if (kind === "email") {
        const r = await get<{ data: EmailTranslation[] }>(`/api/v1/email-templates/${selectedId}/translations`);
        setEmailTrans(r?.data || []);
      } else {
        const r = await get<{ data: SmsTranslation[] }>(`/api/v1/sms-templates/${selectedId}/translations`);
        setSmsTrans(r?.data || []);
      }
    } catch { /* swallow — non-critical */ }
  }, [get, ready, selectedId, kind]);
  useEffect(() => { fetchTranslations(); }, [fetchTranslations]);

  async function addTranslation() {
    if (selectedId == null || !form.locale) return;
    try {
      if (kind === "email") {
        await post(`/api/v1/email-templates/${selectedId}/translations`, {
          locale: form.locale, subject: form.subject || null, body_html: form.body_html || null, body_text: form.body_text || null,
        });
      } else {
        if (!form.body) { alert("Body required for SMS translation."); return; }
        await post(`/api/v1/sms-templates/${selectedId}/translations`, {
          locale: form.locale, body: form.body,
        });
      }
      setAdding(false);
      setForm({ locale: "es-US", subject: "", body_html: "", body_text: "", body: "" });
      await fetchCoverage();
      await fetchTranslations();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function removeTranslation(locale: string) {
    if (selectedId == null) return;
    if (!confirm(`Delete the ${locale} translation?`)) return;
    try {
      const base = kind === "email" ? "email-templates" : "sms-templates";
      await del(`/api/v1/${base}/${selectedId}/translations/${encodeURIComponent(locale)}`);
      await fetchCoverage();
      await fetchTranslations();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  const rows = kind === "email" ? coverage.email : coverage.sms;
  const selected = rows.find((t) => t.id === selectedId) || null;
  const translations = kind === "email" ? emailTrans : smsTrans;

  return (
    <SparkPageShell
      title="Template Translations"
      subtitle={`${coverage.email.length} email · ${coverage.sms.length} SMS templates`}
      help="Per-locale text variants for your email and SMS templates. At send time the system picks the contact's preferred_locale and falls back to the primary (en-US) if missing. Set preferred_locale on a contact via PATCH /contacts/:id/locale."
      loading={loading}
      error={error}
    >
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <button onClick={() => { setKind("email"); setSelectedId(null); }} className={`px-3 py-2 text-sm border-b-2 -mb-px ${kind === "email" ? "border-[#EF6C33] text-[#EF6C33] font-semibold" : "border-transparent text-slate-600"}`}>
          <Mail className="inline h-4 w-4 mr-1" /> Email ({coverage.email.length})
        </button>
        <button onClick={() => { setKind("sms"); setSelectedId(null); }} className={`px-3 py-2 text-sm border-b-2 -mb-px ${kind === "sms" ? "border-[#EF6C33] text-[#EF6C33] font-semibold" : "border-transparent text-slate-600"}`}>
          <MessageSquare className="inline h-4 w-4 mr-1" /> SMS ({coverage.sms.length})
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
        {/* Template list */}
        <aside>
          <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-2">Templates</div>
          {rows.length === 0 ? (
            <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500 text-center">
              No {kind} templates configured.
            </div>
          ) : (
            <ul className="space-y-1">
              {rows.map((t) => {
                const locs = t.locales ? t.locales.split(",") : [];
                return (
                  <li key={t.id}>
                    <button onClick={() => setSelectedId(t.id)} className={`w-full text-left rounded px-2 py-1.5 border ${selectedId === t.id ? "border-[#EF6C33] bg-orange-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                      <div className="text-xs font-mono text-slate-700 truncate">{t.template_key}</div>
                      <div className="flex flex-wrap gap-0.5 mt-1">
                        {locs.length === 0 ? (
                          <span className="text-[10px] text-slate-400 italic">No translations</span>
                        ) : (
                          locs.map((l) => (
                            <span key={l} className="text-[10px] uppercase font-semibold px-1 py-0.5 rounded bg-slate-200 text-slate-700">
                              {l}
                            </span>
                          ))
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Detail pane */}
        <section>
          {!selected ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-slate-500">
              <Languages className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              Select a template to manage its translations.
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xs uppercase font-semibold text-slate-500 tracking-wide">Template</div>
                  <div className="font-mono text-sm text-slate-900">{selected.template_key}</div>
                  {kind === "email" && selected.primary_subject && (
                    <div className="text-xs text-slate-500 mt-1">Primary subject: {selected.primary_subject}</div>
                  )}
                </div>
                <button onClick={() => setAdding(true)} className="text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> Add translation
                </button>
              </div>

              {adding && (
                <div className="mb-4 rounded-lg border-2 border-[#EF6C33] bg-orange-50 p-3">
                  <div className="text-xs font-bold text-slate-900 mb-2">New translation</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="text-xs">
                      <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Locale</div>
                      <select value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5">
                        {COMMON_LOCALES.map((l) => <option key={l.tag} value={l.tag}>{l.tag} — {l.label}</option>)}
                      </select>
                    </label>
                    {kind === "email" && (
                      <label className="text-xs">
                        <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Subject</div>
                        <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
                      </label>
                    )}
                  </div>
                  {kind === "email" ? (
                    <>
                      <label className="block mt-2 text-xs">
                        <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Body (HTML)</div>
                        <textarea value={form.body_html} onChange={(e) => setForm({ ...form, body_html: e.target.value })} rows={5} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono text-xs" />
                      </label>
                      <label className="block mt-2 text-xs">
                        <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Body (plain text fallback)</div>
                        <textarea value={form.body_text} onChange={(e) => setForm({ ...form, body_text: e.target.value })} rows={3} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono text-xs" />
                      </label>
                    </>
                  ) : (
                    <label className="block mt-2 text-xs">
                      <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Body *</div>
                      <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={3} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono text-xs" />
                      <div className="text-[10px] text-slate-500 mt-1">{form.body.length} chars · ~{Math.ceil(form.body.length / 160)} SMS segments</div>
                    </label>
                  )}
                  <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => setAdding(false)} className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">Cancel</button>
                    <button onClick={addTranslation} className="text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white">Save</button>
                  </div>
                </div>
              )}

              {translations.length === 0 ? (
                <div className="text-xs text-slate-400 italic text-center py-4">No translations yet. Click "Add translation" above.</div>
              ) : (
                <ul className="space-y-2">
                  {translations.map((t) => (
                    <li key={t.id} className="rounded border border-slate-200 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="flex items-center gap-1 text-xs font-semibold text-slate-900">
                          <Globe2 className="h-3.5 w-3.5 text-[#EF6C33]" /> {t.locale}
                        </span>
                        <button onClick={() => removeTranslation(t.locale)} className="text-[10px] px-2 py-0.5 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50 flex items-center gap-1">
                          <Trash2 className="h-3 w-3" /> Remove
                        </button>
                      </div>
                      {kind === "email" ? (
                        <>
                          {("subject" in t) && (t as EmailTranslation).subject && (
                            <div className="text-xs text-slate-700"><span className="font-semibold">Subject:</span> {(t as EmailTranslation).subject}</div>
                          )}
                          {(t as EmailTranslation).body_text && (
                            <pre className="mt-1 text-[10px] text-slate-600 bg-slate-50 rounded p-2 whitespace-pre-wrap font-mono max-h-40 overflow-auto">
                              {(t as EmailTranslation).body_text}
                            </pre>
                          )}
                        </>
                      ) : (
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">{(t as SmsTranslation).body}</pre>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
    </SparkPageShell>
  );
}

export default SparkTemplateI18nPage;

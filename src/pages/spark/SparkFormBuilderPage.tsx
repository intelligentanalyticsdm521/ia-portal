// SparkFormBuilderPage — Visual form designer (v4.2).
//
// F-104 refactor: the editor body + state has been extracted into a shared
// FormBuilderEditor component (exported below) so the same editor renders
// either as this routed page (deep links / back-compat) or inside
// SparkFormBuilderModal (the new primary surface, opened from
// SparkFormsPage). When the user clicks "Create Form" or "Edit in Builder"
// on the library they get the modal — no navigation, no page swap.
//
// Two-pane layout (inside the editor):
//   Left:  field list + per-field config + field palette
//   Right: live preview of the form as it will render publicly
//
// Form definition is persisted to lumen.form.fields_schema via the existing
// PUT /api/v1/forms/:id endpoint. The hosted/public render endpoint
// (/api/v1/forms/:id/public) returns the parsed schema so external sites
// can mount the form without auth.
import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import {
  Type, Mail, Phone, AlignLeft, ChevronDown, Square, CircleDot, Calendar, Hash, Lock,
  Trash2, ArrowUp, ArrowDown, Save, Eye, Copy, Check, Settings as SettingsIcon,
} from "lucide-react";

// ── Field type registry ──────────────────────────────────────────────

export type FieldType = "text" | "email" | "phone" | "textarea" | "select" | "checkbox" | "radio" | "date" | "number" | "hidden";

export interface FormField {
  id: string;
  type: FieldType;
  name: string;            // form field name; e.g. "first_name"
  label: string;
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  defaultValue?: string;
  // For select / radio
  options?: Array<{ value: string; label: string }>;
  // For number
  min?: number;
  max?: number;
  // For text/textarea
  maxLength?: number;
}

const FIELD_TYPE_META: Record<FieldType, { label: string; icon: typeof Type; description: string }> = {
  text:     { label: "Text",       icon: Type,       description: "Single-line text input" },
  email:    { label: "Email",      icon: Mail,       description: "Validated email address" },
  phone:    { label: "Phone",      icon: Phone,      description: "Phone number with input mask" },
  textarea: { label: "Textarea",   icon: AlignLeft,  description: "Multi-line free text" },
  select:   { label: "Select",     icon: ChevronDown, description: "Dropdown with options" },
  checkbox: { label: "Checkbox",   icon: Square,     description: "Single yes/no checkbox" },
  radio:    { label: "Radio",      icon: CircleDot,  description: "Mutually exclusive choices" },
  date:     { label: "Date",       icon: Calendar,   description: "Date picker" },
  number:   { label: "Number",     icon: Hash,       description: "Numeric input" },
  hidden:   { label: "Hidden",     icon: Lock,       description: "Hidden value submitted invisibly" },
};

export interface FormRow {
  id: number;
  tenant_id: string;
  name: string;
  fields_schema: string | null;
  slug: string | null;
  is_active: boolean;
  submission_count: number;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function defaultField(type: FieldType): FormField {
  const base: FormField = {
    id: uid(),
    type,
    name: type,
    label: FIELD_TYPE_META[type].label,
    required: false,
  };
  if (type === "select" || type === "radio") {
    base.options = [
      { value: "option_1", label: "Option 1" },
      { value: "option_2", label: "Option 2" },
    ];
  }
  return base;
}

// ── Shared editor (used by both the page and the modal) ──────────────

interface EditorProps {
  formId: string;
  /** Renders without the header config block (name/slug/URLs/QR). Default false. */
  compact?: boolean;
  /** Called after a successful save; the parent typically refreshes its list. */
  onSaved?: () => void;
}

/**
 * FormBuilderEditor — the actual designer. No page chrome, no modal chrome —
 * just the editor. Used by SparkFormBuilderPage and SparkFormBuilderModal.
 *
 * Exposes a `header` portion (form name + slug + URLs + QR) and a `body`
 * portion (palette + field list + config panel). The container decides where
 * to put the Save button (the editor returns the current dirty state via
 * `onSaved` but the parent owns the button placement).
 */
export function FormBuilderEditor({ formId, onSaved }: EditorProps) {
  const { get, put, ready } = useSparkApi();

  const [formRow, setFormRow] = useState<FormRow | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyTarget, setCopyTarget] = useState<"submit" | "hosted" | null>(null);

  const fetchForm = useCallback(async () => {
    if (!ready || !formId) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: FormRow }>(`/api/v1/forms/${formId}`);
      setFormRow(r.data);
      setName(r.data.name || "");
      setSlug(r.data.slug || "");
      let parsed: FormField[] = [];
      try { parsed = r.data.fields_schema ? JSON.parse(r.data.fields_schema) : []; } catch { parsed = []; }
      // Ensure every field has an id (older saves may not have one)
      setFields(parsed.map((f) => ({ ...f, id: f.id || uid() })));
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready, formId]);
  useEffect(() => { fetchForm(); }, [fetchForm]);

  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;

  function addField(type: FieldType) {
    const newField = defaultField(type);
    setFields((curr) => [...curr, newField]);
    setSelectedFieldId(newField.id);
  }
  function removeField(fid: string) {
    setFields((curr) => curr.filter((f) => f.id !== fid));
    if (selectedFieldId === fid) setSelectedFieldId(null);
  }
  function moveField(fid: string, direction: -1 | 1) {
    setFields((curr) => {
      const idx = curr.findIndex((f) => f.id === fid);
      if (idx < 0) return curr;
      const next = idx + direction;
      if (next < 0 || next >= curr.length) return curr;
      const out = [...curr];
      [out[idx], out[next]] = [out[next], out[idx]];
      return out;
    });
  }
  function updateField(fid: string, patch: Partial<FormField>) {
    setFields((curr) => curr.map((f) => f.id === fid ? { ...f, ...patch } : f));
  }

  async function save() {
    if (!formRow) return;
    setSaving(true);
    try {
      await put(`/api/v1/forms/${formRow.id}`, { name, fields_schema: fields, slug: slug.trim() || null });
      setSavedAt(new Date());
      onSaved?.();
    } catch (err) { alert(`Save failed: ${(err as Error).message}`); }
    finally { setSaving(false); }
  }

  // Submit URL uses LUMEN-API base (read from window for now; the env var
  // can override). Hosted page renders an HTML form at /api/v1/forms/:id/hosted.
  const apiBase = ((typeof window !== "undefined" && (window as unknown as { __LUMEN_API_BASE?: string }).__LUMEN_API_BASE) as string | undefined)
    || `${typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : ""}`;
  const submitUrl = formRow ? `${apiBase}/api/v1/forms/${formRow.id}/submit` : "";
  // Prefer the slug URL when a slug is saved; otherwise fall back to /hosted.
  const slugUrl = (formRow && formRow.slug)
    ? `${apiBase}/api/v1/f/${encodeURIComponent(formRow.tenant_id)}/${encodeURIComponent(formRow.slug)}`
    : null;
  const hostedUrl = slugUrl || (formRow ? `${apiBase}/api/v1/forms/${formRow.id}/hosted` : "");
  const qrSvgUrl = formRow ? `${apiBase}/api/v1/forms/${formRow.id}/qr.svg?size=200` : "";

  async function copyText(text: string, target: "submit" | "hosted") {
    try {
      await navigator.clipboard.writeText(text);
      setCopyTarget(target);
      setCopied(true);
      setTimeout(() => { setCopied(false); setCopyTarget(null); }, 1500);
    } catch (e) { alert(`Copy failed: ${(e as Error).message}`); }
  }

  if (loading) {
    return <div className="text-sm text-slate-500 p-4">Loading form…</div>;
  }
  if (error) {
    return <div className="text-sm text-red-600 p-4">Couldn't load form: {String((error as Error)?.message || error)}</div>;
  }

  return (
    <div className="space-y-3">
      {/* Save bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-slate-500">
          {formRow ? `${formRow.submission_count.toLocaleString()} submission${formRow.submission_count === 1 ? "" : "s"} received` : ""}
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="text-[10px] text-emerald-700 flex items-center gap-1">
              <Check className="h-3 w-3" /> Saved at {savedAt.toLocaleTimeString()}
            </span>
          )}
          <button onClick={save} disabled={saving || !formRow} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1 disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save form"}
          </button>
        </div>
      </div>

      {/* Form-level config */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="text-xs md:col-span-1 space-y-2">
            <label className="block">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Form name</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Quote Request"
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33]"
              />
            </label>
            <label className="block">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">URL slug (optional)</div>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+/, "").slice(0, 60))}
                placeholder="quote-request"
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono focus:border-[#EF6C33]"
              />
              <div className="text-[10px] text-slate-500 mt-1">
                Lowercase letters, numbers, dashes. Unique per tenant. Save to publish at /f/&lt;tenant&gt;/&lt;slug&gt;.
              </div>
            </label>
          </div>
          <div className="md:col-span-2 text-xs space-y-2">
            <div>
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Hosted form URL (no JS / public)</div>
              <div className="flex gap-1">
                <code className="flex-1 font-mono text-[10px] bg-slate-50 border border-slate-200 rounded px-2 py-1.5 truncate">{hostedUrl}</code>
                <button onClick={() => copyText(hostedUrl, "hosted")} className="text-xs px-2 py-1.5 rounded bg-slate-700 text-white flex items-center gap-1">
                  {copied && copyTarget === "hosted" ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                </button>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Link to or iframe this URL. Renders a complete HTML form with self-submit and a thank-you screen on success.
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Direct submit URL (for embedded widgets)</div>
              <div className="flex gap-1">
                <code className="flex-1 font-mono text-[10px] bg-slate-50 border border-slate-200 rounded px-2 py-1.5 truncate">{submitUrl}</code>
                <button onClick={() => copyText(submitUrl, "submit")} className="text-xs px-2 py-1.5 rounded bg-slate-700 text-white flex items-center gap-1">
                  {copied && copyTarget === "submit" ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                </button>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                POST a JSON body with field names matching your <code className="font-mono">name</code> values. Built-in contact fields (first_name, last_name, email, phone, company) auto-merge into <code className="font-mono">lumen.contact</code>.
              </div>
            </div>
          </div>
        </div>
        {/* QR code preview row — encodes the hosted URL so you can print, paste, or share to mobile. */}
        {formRow && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-start gap-3">
            <div className="flex-shrink-0 border border-slate-200 rounded p-1 bg-white">
              <img src={qrSvgUrl} alt="Hosted form QR code" width={160} height={160} loading="lazy" />
            </div>
            <div className="text-xs text-slate-700 min-w-0 flex-1">
              <div className="font-semibold text-slate-900 mb-1">QR code</div>
              <div className="text-[11px] text-slate-600 mb-2">Scans to the hosted form URL above. Use it on print collateral, vehicle wraps, table tents, or SMS — anywhere a customer might want to fill out the form on their phone.</div>
              <a href={qrSvgUrl} target="_blank" rel="noreferrer" className="text-[11px] text-[#EF6C33] underline hover:no-underline">
                Open full-size SVG ↗
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-3">
        {/* Field palette */}
        <aside>
          <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-2">Add a field</div>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(FIELD_TYPE_META) as FieldType[]).map((t) => {
              const meta = FIELD_TYPE_META[t];
              const Icon = meta.icon;
              return (
                <button
                  key={t}
                  onClick={() => addField(t)}
                  className="flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-slate-200 bg-white hover:bg-orange-50 hover:border-[#EF6C33]"
                  title={meta.description}
                >
                  <Icon className="h-3.5 w-3.5 text-slate-500" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Field list + live preview */}
        <section>
          <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-2 flex items-center justify-between">
            <span>Fields ({fields.length})</span>
            <span className="flex items-center gap-1 normal-case font-normal text-slate-400"><Eye className="h-3 w-3" /> live preview</span>
          </div>
          {fields.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-xs text-slate-500">
              <SettingsIcon className="h-6 w-6 mx-auto text-slate-300 mb-2" />
              No fields yet. Pick a field type from the palette to add your first one.
            </div>
          ) : (
            <ul className="space-y-2">
              {fields.map((f, i) => (
                <li
                  key={f.id}
                  className={`rounded-lg border p-3 transition-colors ${selectedFieldId === f.id ? "border-[#EF6C33] bg-orange-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  onClick={() => setSelectedFieldId(f.id)}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] uppercase font-bold tracking-wide bg-slate-200 text-slate-700 px-1 py-0.5 rounded">{f.type}</span>
                      <span className="text-xs font-mono text-slate-500">{f.name}</span>
                      {f.required && <span className="text-[9px] text-red-600">required</span>}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); moveField(f.id, -1); }} disabled={i === 0} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); moveField(f.id, 1); }} disabled={i === fields.length - 1} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); removeField(f.id); }} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                  <FieldPreview field={f} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Field config panel */}
        <aside>
          <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-2">Field settings</div>
          {selectedField ? (
            <FieldConfigPanel field={selectedField} onChange={(patch) => updateField(selectedField.id, patch)} />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-xs text-slate-500">
              Click a field to configure it.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ── Page (deep-link / back-compat surface) ───────────────────────────

/**
 * The modal at SparkFormsPage is the primary surface (F-104). This routed
 * page survives for back-compat with any deep links that still go to
 * /app/services/spark_form_builder?id=… — it just wraps the same editor in
 * a SparkPageShell and adds a "Back to Forms" affordance.
 */
export function SparkFormBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const formId = id || searchParams.get("id") || "";

  if (!formId) {
    return (
      <SparkPageShell title="Form Builder" subtitle="No form selected">
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          Choose a form from <button onClick={() => navigate("/app/services/spark_forms")} className="text-[#EF6C33] underline">Forms</button> to edit, or create a new form first.
        </div>
      </SparkPageShell>
    );
  }

  return (
    <SparkPageShell
      title={`Form Builder`}
      subtitle="Tip: the same editor opens as a modal from the Forms page — that's the recommended surface."
      help="Visually design the fields, labels, and validation rules of your SPARK form. The hosted submit URL is below; embed it in your site or share directly."
    >
      <FormBuilderEditor formId={formId} />
    </SparkPageShell>
  );
}

// ── Preview + config (private helpers) ───────────────────────────────

function FieldPreview({ field }: { field: FormField }) {
  const label = (
    <label className="block text-xs font-medium text-slate-700 mb-0.5">
      {field.label} {field.required && <span className="text-red-500">*</span>}
    </label>
  );
  const helpText = field.helpText && <div className="text-[10px] text-slate-500 mt-0.5">{field.helpText}</div>;
  if (field.type === "textarea") {
    return (
      <div>
        {label}
        <textarea placeholder={field.placeholder} rows={3} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-slate-50" disabled />
        {helpText}
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <div>
        {label}
        <select className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-slate-50" disabled>
          <option>{field.placeholder || "Select…"}</option>
          {(field.options || []).map((o) => <option key={o.value}>{o.label}</option>)}
        </select>
        {helpText}
      </div>
    );
  }
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-1.5 text-xs text-slate-700">
        <input type="checkbox" disabled /> {field.label} {field.required && <span className="text-red-500">*</span>}
        {helpText}
      </label>
    );
  }
  if (field.type === "radio") {
    return (
      <div>
        {label}
        <div className="space-y-0.5">
          {(field.options || []).map((o) => (
            <label key={o.value} className="flex items-center gap-1 text-xs text-slate-700">
              <input type="radio" name={field.name} disabled /> {o.label}
            </label>
          ))}
        </div>
        {helpText}
      </div>
    );
  }
  if (field.type === "hidden") {
    return <div className="text-[10px] italic text-slate-500">[hidden] default value: <code className="font-mono">{field.defaultValue || "(none)"}</code></div>;
  }
  const inputType = field.type === "phone" ? "tel" : field.type;
  return (
    <div>
      {label}
      <input type={inputType} placeholder={field.placeholder} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-slate-50" disabled />
      {helpText}
    </div>
  );
}

function FieldConfigPanel({ field, onChange }: { field: FormField; onChange: (patch: Partial<FormField>) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <label className="block text-xs">
        <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Label</div>
        <input value={field.label} onChange={(e) => onChange({ label: e.target.value })} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
      </label>
      <label className="block text-xs">
        <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Field name (snake_case)</div>
        <input
          value={field.name}
          onChange={(e) => onChange({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
          className="w-full text-sm border border-slate-300 rounded px-2 py-1 font-mono"
        />
        <div className="text-[10px] text-slate-500 mt-0.5">Used as the JSON key in submitted payloads.</div>
      </label>
      {field.type !== "checkbox" && field.type !== "radio" && field.type !== "hidden" && (
        <label className="block text-xs">
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Placeholder</div>
          <input value={field.placeholder || ""} onChange={(e) => onChange({ placeholder: e.target.value })} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
        </label>
      )}
      {(field.type === "select" || field.type === "radio") && (
        <div className="text-xs">
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Options (one per line, value|label)</div>
          <textarea
            rows={4}
            value={(field.options || []).map((o) => `${o.value}|${o.label}`).join("\n")}
            onChange={(e) => {
              const opts = e.target.value.split("\n").map((line) => {
                const [v, l] = line.split("|").map((s) => s.trim());
                return v ? { value: v, label: l || v } : null;
              }).filter(Boolean) as Array<{ value: string; label: string }>;
              onChange({ options: opts });
            }}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1 font-mono"
          />
        </div>
      )}
      {field.type === "hidden" && (
        <label className="block text-xs">
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Default value</div>
          <input value={field.defaultValue || ""} onChange={(e) => onChange({ defaultValue: e.target.value })} className="w-full text-sm border border-slate-300 rounded px-2 py-1 font-mono" />
        </label>
      )}
      {field.type === "number" && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label>
            <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Min</div>
            <input type="number" value={field.min ?? ""} onChange={(e) => onChange({ min: e.target.value === "" ? undefined : Number(e.target.value) })} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
          </label>
          <label>
            <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Max</div>
            <input type="number" value={field.max ?? ""} onChange={(e) => onChange({ max: e.target.value === "" ? undefined : Number(e.target.value) })} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
          </label>
        </div>
      )}
      {(field.type === "text" || field.type === "textarea") && (
        <label className="block text-xs">
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Max length</div>
          <input type="number" value={field.maxLength ?? ""} onChange={(e) => onChange({ maxLength: e.target.value === "" ? undefined : Number(e.target.value) })} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
        </label>
      )}
      <label className="block text-xs">
        <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Help text</div>
        <input value={field.helpText || ""} onChange={(e) => onChange({ helpText: e.target.value })} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
      </label>
      <label className="flex items-center gap-1.5 text-xs pt-2 border-t border-slate-100">
        <input type="checkbox" checked={!!field.required} onChange={(e) => onChange({ required: e.target.checked })} />
        Required field
      </label>
    </div>
  );
}

export default SparkFormBuilderPage;

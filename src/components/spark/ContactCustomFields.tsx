// ContactCustomFields — the fields a business defines for itself.
//
// lumen.custom_field and custom_field_value have existed for a long time, with
// a complete API behind them: field definitions per tenant, typed values,
// dropdown options, required flags. OLIVER used them. The SPARK contact modal
// never did, so there was no way to record anything the standard columns did
// not already cover — a clothing client's shirt size, a dentist's referring
// practice, an agency's account number.
//
// TWO WAYS TO CREATE A FIELD, ON PURPose
// --------------------------------------
// Founder 2026-08-19: "admin can set some generalized ones to use, then you
// can create a new one on the actual modal and it saves it to the admin
// section." That is right, and it is what HubSpot does — because the second
// path is how fields actually get created. Nobody opens a settings screen to
// invent a field in the abstract; they are looking at a real contact, realise
// there is nowhere to put something, and want it there and then. A field made
// here is a normal tenant-wide definition, so it appears on every contact
// afterwards.
//
// WHAT BELONGS HERE VERSUS A TAG
// ------------------------------
// A field is a VALUE that varies per person and that you would sort or filter
// by — shirt size, account number, renewal date. A tag is a yes/no FACT —
// likes pink, VIP. If every contact would have a value it is a field; if only
// some would, it is a tag. Getting that wrong gives every contact an empty box.
import { useCallback, useEffect, useState } from "react";
import { Plus, SlidersHorizontal, X } from "lucide-react";

const SPARK_ORANGE = "#EF6C33";
type FieldType = "string" | "number" | "date" | "boolean" | "enum";

interface CustomFieldValue {
  field_id: number;
  field_key: string;
  label: string;
  field_type: FieldType;
  enum_options: string | null;
  required: boolean;
  value_text: string | null;
}

interface Props {
  contactId: number;
  editing: boolean;
  /** Values staged while editing; committed by the modal's Save. */
  draft: Record<string, string>;
  onDraftChange: (next: Record<string, string>) => void;
  get: <T>(p: string) => Promise<T>;
  post: <T>(p: string, body?: unknown) => Promise<T>;
  ready: boolean;
}

export function ContactCustomFields({ contactId, editing, draft, onDraftChange, get, post, ready }: Props) {
  const [fields, setFields] = useState<CustomFieldValue[] | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!ready || !contactId) return;
    try {
      const r = await get<{ data: CustomFieldValue[] }>(`/api/v1/custom-fields/values/contact/${contactId}`);
      setFields(r.data || []);
    } catch {
      setFields([]);
    }
  }, [get, contactId, ready]);

  useEffect(() => { load(); }, [load]);

  if (!fields) return null;
  // Nothing defined and not editing: stay out of the way entirely rather than
  // showing an empty section header on every contact.
  if (!fields.length && !editing) return null;

  const valueOf = (f: CustomFieldValue) =>
    draft[f.field_key] !== undefined ? draft[f.field_key] : (f.value_text ?? "");
  const setValue = (key: string, v: string) => onDraftChange({ ...draft, [key]: v });

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <SlidersHorizontal className="h-3 w-3" /> Your own fields
      </h3>

      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {fields.map((f) => (
            <div key={f.field_id}>
              <div className="text-[10px] font-semibold uppercase text-slate-500">
                {f.label}{f.required && <span className="ml-0.5 text-rose-500">*</span>}
              </div>
              {editing ? (
                <CustomInput field={f} value={valueOf(f)} onChange={(v) => setValue(f.field_key, v)} />
              ) : (
                <div className="mt-0.5 text-sm text-slate-900">
                  {renderValue(f, valueOf(f))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        adding ? (
          <NewFieldForm
            post={post}
            onDone={async () => { setAdding(false); await load(); }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline"
            style={{ color: SPARK_ORANGE }}
          >
            <Plus className="h-3 w-3" /> Add a field
          </button>
        )
      )}

      {!fields.length && !adding && editing && (
        <p className="mt-1 text-[11px] text-slate-500">
          No custom fields yet. Add one for anything your business tracks that the
          standard fields do not cover — it becomes available on every contact.
        </p>
      )}
    </div>
  );
}

function renderValue(f: CustomFieldValue, v: string) {
  if (!v) return <span className="italic text-slate-400">—</span>;
  if (f.field_type === "boolean") return v === "true" ? "Yes" : "No";
  if (f.field_type === "date") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleDateString();
  }
  return v;
}

function CustomInput({ field, value, onChange }: {
  field: CustomFieldValue; value: string; onChange: (v: string) => void;
}) {
  const cls = "mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]";

  if (field.field_type === "boolean") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  if (field.field_type === "enum") {
    // enum_options is stored as JSON; a malformed value must not take the
    // whole modal down, so it degrades to a plain text box.
    let opts: string[] = [];
    try { const p = JSON.parse(field.enum_options || "[]"); if (Array.isArray(p)) opts = p.map(String); } catch { /* falls through */ }
    if (opts.length) {
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">—</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
  }
  return (
    <input
      type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cls}
    />
  );
}

/** Define a new field without leaving the contact. */
function NewFieldForm({ post, onDone, onCancel }: {
  post: <T>(p: string, body?: unknown) => Promise<T>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("string");
  const [options, setOptions] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    const clean = label.trim();
    if (!clean) return;
    // The API requires snake_case, starting with a letter, 60 chars max. Deriving
    // it from the label means nobody has to know that — "Shirt size" becomes
    // shirt_size on its own.
    const key = clean.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
    if (!/^[a-z]/.test(key)) {
      setErr("Start the name with a letter.");
      return;
    }
    setSaving(true); setErr(null);
    try {
      await post("/api/v1/custom-fields", {
        entity_kind: "contact",
        field_key: key,
        label: clean,
        field_type: type,
        ...(type === "enum"
          ? { enum_options: options.split(",").map((o) => o.trim()).filter(Boolean) }
          : {}),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That field could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">New field</span>
        <button onClick={onCancel} aria-label="Cancel" className="text-slate-400 hover:text-slate-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          autoFocus
          value={label}
          onChange={(e) => { setLabel(e.target.value); setErr(null); }}
          placeholder="Shirt size"
          className="rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as FieldType)}
          className="rounded border border-slate-300 px-2 py-1 text-xs"
        >
          <option value="string">Text</option>
          <option value="number">Number</option>
          <option value="date">Date</option>
          <option value="boolean">Yes / No</option>
          <option value="enum">Choose from a list</option>
        </select>
      </div>
      {type === "enum" && (
        <input
          value={options}
          onChange={(e) => setOptions(e.target.value)}
          placeholder="Small, Medium, Large"
          className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-xs"
        />
      )}
      {err && <div className="mt-1.5 text-[11px] text-rose-600">{err}</div>}
      <p className="mt-1.5 text-[10px] text-slate-500">
        This field is added for every contact, not just this one.
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
        <button
          onClick={create}
          disabled={saving || !label.trim() || (type === "enum" && !options.trim())}
          className="rounded px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: SPARK_ORANGE }}
        >
          {saving ? "Adding…" : "Add field"}
        </button>
      </div>
    </div>
  );
}

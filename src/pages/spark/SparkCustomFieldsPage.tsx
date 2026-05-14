// SparkCustomFieldsPage — Custom field definitions for contacts/deals/accounts (v4.0).
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Trash2, GripVertical, Type, Hash, Calendar, ToggleLeft, ListChecks, Star } from "lucide-react";

type EntityKind = "contact" | "deal" | "account";
type FieldType = "string" | "number" | "date" | "boolean" | "enum";

interface CustomField {
  id: number;
  entity_kind: EntityKind;
  field_key: string;
  label: string;
  field_type: FieldType;
  enum_options: string | null;
  required: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

const TYPE_META: Record<FieldType, { icon: typeof Type; label: string; color: string }> = {
  string: { icon: Type, label: "Text", color: "#64748B" },
  number: { icon: Hash, label: "Number", color: "#2563EB" },
  date: { icon: Calendar, label: "Date", color: "#7C3AED" },
  boolean: { icon: ToggleLeft, label: "Yes/No", color: "#0F766E" },
  enum: { icon: ListChecks, label: "Pick list", color: "#EF6C33" },
};

const KINDS: EntityKind[] = ["contact", "deal", "account"];

export function SparkCustomFieldsPage() {
  const { get, post, del, ready } = useSparkApi();
  const [kind, setKind] = useState<EntityKind>("contact");
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    field_key: "",
    label: "",
    field_type: "string" as FieldType,
    enum_options: "",
    required: false,
    sort_order: 0,
  });

  const fetchFields = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: CustomField[] }>(`/api/v1/custom-fields?entity_kind=${kind}`);
      setFields(r?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready, kind]);
  useEffect(() => { fetchFields(); }, [fetchFields]);

  async function create() {
    if (!/^[a-z][a-z0-9_]{0,59}$/.test(form.field_key)) { alert("field_key must be snake_case starting with a letter (≤60 chars)"); return; }
    if (!form.label.trim()) { alert("Label required"); return; }
    if (form.field_type === "enum") {
      const opts = form.enum_options.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      if (opts.length === 0) { alert("Enum field requires at least one option (comma or newline-separated)"); return; }
    }
    try {
      const enum_options = form.field_type === "enum"
        ? form.enum_options.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
        : null;
      await post("/api/v1/custom-fields", {
        entity_kind: kind,
        field_key: form.field_key,
        label: form.label,
        field_type: form.field_type,
        enum_options,
        required: form.required,
        sort_order: form.sort_order,
      });
      setCreating(false);
      setForm({ field_key: "", label: "", field_type: "string", enum_options: "", required: false, sort_order: 0 });
      await fetchFields();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function remove(id: number) {
    if (!confirm("Soft-delete this field? Existing values stay in the database.")) return;
    try { await del(`/api/v1/custom-fields/${id}`); await fetchFields(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  return (
    <SparkPageShell
      title="Custom Fields"
      subtitle={`${fields.length} field${fields.length === 1 ? "" : "s"} on ${kind}`}
      help="Tenant-specific extra fields on contacts, deals, or accounts. Values are stored independently of the row schema and surface in the entity detail panes via /custom-fields/values/:kind/:id."
      actions={
        <button onClick={() => setCreating(true)} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New field
        </button>
      }
      loading={loading}
      error={error}
    >
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {KINDS.map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`px-3 py-2 text-sm border-b-2 -mb-px capitalize ${kind === k ? "border-[#EF6C33] text-[#EF6C33] font-semibold" : "border-transparent text-slate-600"}`}>
            {k}
          </button>
        ))}
      </div>

      {creating && (
        <div className="mb-4 rounded-lg border-2 border-[#EF6C33] bg-orange-50 p-4">
          <div className="text-sm font-bold text-slate-900 mb-3">New custom field on {kind}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="text-xs">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Field key (snake_case) *</div>
              <input
                value={form.field_key}
                onChange={(e) => setForm({ ...form, field_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                placeholder="e.g. preferred_language"
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
                autoFocus
              />
            </label>
            <label className="text-xs">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Label *</div>
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. Preferred Language"
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
              />
            </label>
            <label className="text-xs">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Type</div>
              <select value={form.field_type} onChange={(e) => setForm({ ...form, field_type: e.target.value as FieldType })} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5">
                {(Object.keys(TYPE_META) as FieldType[]).map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Sort order</div>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
              />
            </label>
          </div>
          {form.field_type === "enum" && (
            <label className="block mt-2 text-xs">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Options (one per line, or comma-separated)</div>
              <textarea
                value={form.enum_options}
                onChange={(e) => setForm({ ...form, enum_options: e.target.value })}
                rows={4}
                placeholder="Bronze&#10;Silver&#10;Gold&#10;Platinum"
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
              />
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs mt-2">
            <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} />
            Required field
          </label>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setCreating(false)} className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">Cancel</button>
            <button onClick={create} className="text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white">Create</button>
          </div>
        </div>
      )}

      {fields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <ListChecks className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <div className="text-sm font-medium text-slate-700">No custom fields on {kind} yet.</div>
          <div className="text-xs text-slate-500 mt-1">Add fields to capture tenant-specific data without schema migrations.</div>
        </div>
      ) : (
        <ul className="space-y-2">
          {fields.map((f) => {
            const meta = TYPE_META[f.field_type];
            const Icon = meta.icon;
            let opts: string[] = [];
            if (f.field_type === "enum" && f.enum_options) {
              try { opts = JSON.parse(f.enum_options); } catch { /* ignore */ }
            }
            return (
              <li key={f.id} className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-2">
                <GripVertical className="h-4 w-4 text-slate-300 mt-1 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900">{f.label}</span>
                    <code className="text-[10px] text-slate-500 bg-slate-100 px-1 py-0.5 rounded">{f.field_key}</code>
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded text-white flex items-center gap-1" style={{ background: meta.color }}>
                      <Icon className="h-3 w-3" /> {meta.label}
                    </span>
                    {f.required && (
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex items-center gap-1">
                        <Star className="h-3 w-3 fill-red-500" /> Required
                      </span>
                    )}
                  </div>
                  {opts.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {opts.map((o) => (
                        <span key={o} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{o}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400 mt-1">Sort {f.sort_order} · created {new Date(f.created_at).toLocaleDateString()}</div>
                </div>
                <button onClick={() => remove(f.id)} className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50">
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SparkPageShell>
  );
}

export default SparkCustomFieldsPage;

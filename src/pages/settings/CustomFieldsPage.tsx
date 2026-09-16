// Settings → Custom fields — ONE page for the extra fields a business needs on
// its customers, its properties, its jobs and its deals.
//
// Spec: overnight-report/CUSTOMER_MODEL_MULTISITE_2026-09-15.md §9 (D-121) and
// §12. Moved here from SPARK — the page it replaces is deleted, not left
// beside this one — because these fields are not a SPARK thing: a "trigger
// depth" is read by a crew on a job sheet, a "PO required" prints on an
// invoice, and only a "deal stage reason" was ever CRM-shaped.
//
// ── WHAT THE OLD PAGE COULD NOT SAY ───────────────────────────────────────
// It had three kinds (contact / deal / account) and no `show_on`, so a field
// existed and then had nowhere to appear: the API stored the definition and
// every card ignored it. This page adds the two columns migration 181 gave
// `lumen.custom_field`:
//
//   help_text  the sentence under the box. A field called "Trigger" means
//              nothing to the person filling it in six months from now.
//   show_on    WHERE it appears — the customer card, the location card, the
//              job sheet, and whether it becomes a merge tag. Granted on
//              PRESENCE: a field with nothing ticked shows NOWHERE, so
//              "Internal margin note" cannot land on a customer's job sheet
//              because somebody forgot a checkbox.
//
// `merge_field` is the one with teeth outside this page: it is what puts a
// definition in the merge-tag picker AND the renderer, so a field nobody
// ticked cannot silently become a tag in a customer's email.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import {
  Plus, Trash2, Type, Hash, Calendar, ToggleLeft, ListChecks, Star, X,
} from "lucide-react";
import {
  type CustomFieldDef, type ShowOnTarget, CUSTOM_FIELD_TABS, type CustomFieldTabKey,
  parseShowOn,
} from "../../lib/customerModel";

type FieldType = CustomFieldDef["field_type"];

const TYPE_META: Record<FieldType, { icon: typeof Type; label: string; color: string }> = {
  string: { icon: Type, label: "Text", color: "#64748B" },
  number: { icon: Hash, label: "Number", color: "#2563EB" },
  date: { icon: Calendar, label: "Date", color: "#7C3AED" },
  boolean: { icon: ToggleLeft, label: "Yes/No", color: "#0F766E" },
  enum: { icon: ListChecks, label: "Pick list", color: "#EF6C33" },
};

/** What each `show_on` target means, in the words the card it lands on uses. */
const SHOW_ON_META: Array<{ key: ShowOnTarget; label: string; help: string }> = [
  { key: "customer_card", label: "Customer card", help: "On the customer's record, next to their billing details." },
  { key: "location_card", label: "Location card", help: "On the property page — where the crew reads it before they drive there." },
  { key: "job_sheet", label: "Job sheet", help: "On the job itself, and on what the crew sees in the field." },
  { key: "merge_field", label: "Merge field", help: "Usable as a tag in emails and documents. Nothing else puts it there." },
];

/** The targets that make sense for each tab. A job field on a location card
 *  would be a promise nothing keeps — no location card renders job values. */
const TARGETS_FOR: Record<CustomFieldTabKey, ShowOnTarget[]> = {
  customer: ["customer_card", "merge_field"],
  property: ["location_card", "job_sheet", "merge_field"],
  job: ["job_sheet", "merge_field"],
  deal: ["merge_field"],
};

const EMPTY_FORM = {
  field_key: "",
  label: "",
  field_type: "string" as FieldType,
  enum_options: "",
  required: false,
  sort_order: 0,
  help_text: "",
  show_on: [] as ShowOnTarget[],
};

export function CustomFieldsPage() {
  const { get, post, patch, del, ready } = useSparkApi();
  const [tab, setTab] = useState<CustomFieldTabKey>("customer");
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const active = useMemo(() => CUSTOM_FIELD_TABS.find((t) => t.key === tab)!, [tab]);

  const fetchFields = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: CustomFieldDef[] }>(`/api/v1/custom-fields?entity_kind=${active.apiKind}`);
      setFields(r?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready, active.apiKind]);
  useEffect(() => { fetchFields(); }, [fetchFields]);

  async function create() {
    if (!/^[a-z][a-z0-9_]{0,59}$/.test(form.field_key)) {
      alert("The key must be snake_case, start with a letter and be 60 characters or fewer.");
      return;
    }
    if (!form.label.trim()) { alert("Give the field a label — it is what the person filling it in reads."); return; }
    const opts = form.enum_options.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (form.field_type === "enum" && opts.length === 0) {
      alert("A pick list needs at least one option.");
      return;
    }
    setBusy(true);
    try {
      await post("/api/v1/custom-fields", {
        entity_kind: active.apiKind,
        field_key: form.field_key,
        label: form.label.trim(),
        field_type: form.field_type,
        enum_options: form.field_type === "enum" ? opts : null,
        required: form.required,
        sort_order: form.sort_order,
        help_text: form.help_text.trim() || null,
        show_on: form.show_on,
      });
      setCreating(false);
      setForm(EMPTY_FORM);
      await fetchFields();
    } catch (err) { alert(`Could not add the field: ${(err as Error).message}`); }
    finally { setBusy(false); }
  }

  /** Toggle one target on an existing field, in place. */
  async function toggleTarget(f: CustomFieldDef, target: ShowOnTarget) {
    const current = parseShowOn(f.show_on);
    const next = current.includes(target) ? current.filter((t) => t !== target) : [...current, target];
    setBusy(true);
    try {
      await patch(`/api/v1/custom-fields/${f.id}`, { show_on: next });
      await fetchFields();
    } catch (err) { alert(`Could not change where it shows: ${(err as Error).message}`); }
    finally { setBusy(false); }
  }

  async function toggleRequired(f: CustomFieldDef) {
    setBusy(true);
    try {
      await patch(`/api/v1/custom-fields/${f.id}`, { required: !f.required });
      await fetchFields();
    } catch (err) { alert(`Could not change it: ${(err as Error).message}`); }
    finally { setBusy(false); }
  }

  async function remove(id: number, label: string) {
    if (!confirm(`Remove "${label}"? The values already filled in stay in the database — the field just stops being offered.`)) return;
    try { await del(`/api/v1/custom-fields/${id}`); await fetchFields(); }
    catch (err) { alert(`Could not remove it: ${(err as Error).message}`); }
  }

  const targets = TARGETS_FOR[tab];

  return (
    <SparkPageShell
      title="Custom fields"
      subtitle={`${fields.length} field${fields.length === 1 ? "" : "s"} on ${active.label.toLowerCase()}`}
      help={
        <>
          <strong className="mb-1 block">The extra things your business needs to know.</strong>
          A field exists on a KIND of record — a customer, a property, a job or a deal — and it appears
          wherever you tick “Show on”. A field with nothing ticked is stored and shown nowhere, which is
          deliberate: it is how “internal” fields stay internal.
          <br /><br />
          <strong>Merge field</strong> is the one that reaches outside this page. Ticking it puts the field in
          the merge-tag picker and in what actually gets sent, so only tick it for something you are happy
          a customer reads.
        </>
      }
      actions={
        <button onClick={() => setCreating(true)} className="spark-btn spark-btn-accent" data-testid="new-field">
          <Plus className="h-3.5 w-3.5" /> New field
        </button>
      }
      loading={loading}
      error={error}
    >
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {CUSTOM_FIELD_TABS.map((t) => (
          <button
            key={t.key}
            data-testid={`cf-tab-${t.key}`}
            onClick={() => { setTab(t.key); setCreating(false); setForm(EMPTY_FORM); }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t.key ? "border-[#EF6C33] font-semibold text-[#EF6C33]" : "border-transparent text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {creating && (
        <div className="mb-4 rounded-lg border-2 border-[#EF6C33] bg-orange-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">New field on {active.noun}s</span>
            <button onClick={() => setCreating(false)} className="text-slate-500 hover:text-slate-800"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="text-xs">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Label *</div>
              <input
                data-testid="field-label"
                value={form.label}
                onChange={(e) => {
                  const label = e.target.value;
                  // The key is derived from the label until somebody edits it:
                  // nobody should have to invent snake_case to add a field, and
                  // the key is what the merge tag and every stored value use.
                  const derived = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
                  setForm((f) => ({ ...f, label, field_key: f.field_key && f.field_key !== autoKey(f.label) ? f.field_key : derived }));
                }}
                placeholder="Trigger depth"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                autoFocus
              />
            </label>
            <label className="text-xs">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Key</div>
              <input
                data-testid="field-key"
                value={form.field_key}
                onChange={(e) => setForm({ ...form, field_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                placeholder="trigger_depth"
                className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
              />
              <p className="mt-0.5 text-[11px] text-slate-500">How it is stored, and what a merge tag is built from. It cannot change later.</p>
            </label>
            <label className="text-xs md:col-span-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Help text</div>
              <input
                data-testid="field-help"
                value={form.help_text}
                onChange={(e) => setForm({ ...form, help_text: e.target.value })}
                placeholder='The snowfall we start plowing at, in inches.'
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <p className="mt-0.5 text-[11px] text-slate-500">
                The sentence under the box. “Trigger” means nothing to the person filling it in six months from now.
              </p>
            </label>
            <label className="text-xs">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Type</div>
              <select
                value={form.field_type}
                onChange={(e) => setForm({ ...form, field_type: e.target.value as FieldType })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              >
                {(Object.keys(TYPE_META) as FieldType[]).map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Sort order</div>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          {form.field_type === "enum" && (
            <label className="mt-2 block text-xs">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Options (one per line, or comma-separated)</div>
              <textarea
                value={form.enum_options}
                onChange={(e) => setForm({ ...form, enum_options: e.target.value })}
                rows={4}
                placeholder={"Salt only\nSalt and sand\nBrine"}
                className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
              />
            </label>
          )}

          <fieldset className="mt-3">
            <legend className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Show on</legend>
            <div className="grid gap-1 md:grid-cols-2">
              {targets.map((t) => {
                const meta = SHOW_ON_META.find((m) => m.key === t)!;
                const on = form.show_on.includes(t);
                return (
                  <label key={t} className="flex items-start gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs">
                    <input
                      type="checkbox"
                      data-testid={`show-on-${t}`}
                      checked={on}
                      onChange={() => setForm((f) => ({
                        ...f,
                        show_on: on ? f.show_on.filter((x) => x !== t) : [...f.show_on, t],
                      }))}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-semibold text-slate-800">{meta.label}</span>
                      <span className="block text-[11px] text-slate-500">{meta.help}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {form.show_on.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-700">
                Nothing ticked: the field will be stored and shown nowhere. That is a real answer for an
                internal note — tick something if anybody is meant to fill it in.
              </p>
            )}
          </fieldset>

          <label className="mt-2 flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} />
            Required — the card marks it, and it is the first thing missing on a half-filled record
          </label>

          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Cancel</button>
            <button onClick={create} disabled={busy} data-testid="field-save" className="rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? "Adding…" : "Add field"}
            </button>
          </div>
        </div>
      )}

      {fields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <ListChecks className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <div className="text-sm font-medium text-slate-700">No custom fields on {active.noun}s yet.</div>
          <div className="mt-1 text-xs text-slate-500">
            {tab === "property"
              ? "Trigger depth, plowing areas, snow storage, gate notes — the things a crew needs before they arrive."
              : "Add the things your business asks about that nobody else does."}
          </div>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="field-list">
          {fields.map((f) => {
            const meta = TYPE_META[f.field_type];
            const Icon = meta.icon;
            const on = parseShowOn(f.show_on);
            let opts: string[] = [];
            if (f.field_type === "enum" && f.enum_options) {
              try { opts = JSON.parse(f.enum_options); } catch { /* ignore */ }
            }
            return (
              <li key={f.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{f.label}</span>
                      <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">{f.field_key}</code>
                      <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white" style={{ background: meta.color }}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleRequired(f)}
                        disabled={busy}
                        title="Required fields are marked on the card"
                        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          f.required ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <Star className={`h-3 w-3 ${f.required ? "fill-red-500" : ""}`} /> {f.required ? "Required" : "Optional"}
                      </button>
                    </div>
                    {f.help_text && <div className="mt-1 text-[11px] text-slate-600">{f.help_text}</div>}
                    {opts.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {opts.map((o) => <span key={o} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">{o}</span>)}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Show on</span>
                      {targets.map((t) => {
                        const meta2 = SHOW_ON_META.find((m) => m.key === t)!;
                        const isOn = on.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            disabled={busy}
                            title={meta2.help}
                            data-testid={`toggle-${f.field_key}-${t}`}
                            onClick={() => toggleTarget(f, t)}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                              isOn ? "bg-[#E8F4FB] text-[#0C4A60] ring-[#A8CDD8]" : "bg-white text-slate-400 ring-slate-200"
                            }`}
                          >
                            {meta2.label}
                          </button>
                        );
                      })}
                      {on.length === 0 && <span className="text-[10px] text-amber-700">shown nowhere</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(f.id, f.label)}
                    className="flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SparkPageShell>
  );
}

/** The key a given label would have produced, so a hand-edited one is left alone. */
function autoKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

export default CustomFieldsPage;

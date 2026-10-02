// SignupFormBuilder — F-113.
//
// Modal-based 3-column builder for the customer-portal signup form.
//   Left   — Available field library (8 categories, 25 templates)
//   Center — Selected fields (toggle required, edit label, reorder ↑↓, delete)
//   Right  — Live preview of how the form will render to a customer
//
// Plus a "Custom field" creator that lets the tenant add up to 10 of their
// own fields (text / textarea / select / checkbox / number / email / phone
// / date). Custom fields are stored in `custom_fields[]` on the signup
// config blob; the backend persists them inside oliver.tenant_settings.
//
// Reorder uses ↑↓ buttons (not HTML5 drag-drop) for cross-browser
// reliability; a future enhancement can layer drag in without changing
// the data model.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, ArrowUp, ArrowDown, Search, Save, Lock,
} from "lucide-react";
import { IadmModal, IadmButton } from "../IadmModal";
import PhoneInput from "../PhoneInput";

type FieldKind = "text" | "textarea" | "select" | "checkbox" | "number" | "email" | "phone" | "date" | "address";

export interface LibraryField {
  key: string;
  label: string;
  enabled: boolean;
  required: boolean;
  required_locked?: boolean;
  category?: string;
  kind?: FieldKind;
  options?: string[];
  order?: number;
}

export interface CustomField {
  key: string;
  label: string;
  placeholder?: string;
  kind: FieldKind;
  options?: string[];
  enabled: boolean;
  required: boolean;
  is_custom: true;
}

export interface SignupConfig {
  fields: LibraryField[];
  custom_fields: CustomField[];
  welcome_text: string;
  submit_label: string;
}

const MAX_CUSTOM = 10;

function unique<T>(arr: T[]) { return Array.from(new Set(arr)); }

function categoryOf(f: LibraryField) { return f.category || "Other"; }

interface Props {
  open: boolean;
  config: SignupConfig | null;
  onClose: () => void;
  onSave: (next: SignupConfig) => Promise<void> | void;
  /** Render as a plain panel inside another window instead of a window of its own. */
  inline?: boolean;
  saving?: boolean;
  /**
   * Inline only (1 Oct 2026, Brandon: "the save signup form button can we move
   * that next to done. I missed it because you have to scroll down to do it").
   * The window that holds this panel owns the draft: it puts "Save signup
   * form" in its own footer beside Done, and the draft survives a trip to
   * another tab. When `draft` is given the panel renders no Save of its own.
   */
  draft?: SignupConfig | null;
  onDraftChange?: (next: SignupConfig) => void;
}

export function SignupFormBuilder({ open, config, onClose, onSave, saving, inline = false, draft: draftProp, onDraftChange }: Props) {
  const controlled = inline && draftProp !== undefined;
  const [innerDraft, setInnerDraft] = useState<SignupConfig | null>(null);
  const draft = controlled ? draftProp : innerDraft;
  const setDraft = useCallback((next: SignupConfig | null | ((d: SignupConfig | null) => SignupConfig | null)) => {
    if (!controlled) { setInnerDraft(next); return; }
    const v = typeof next === "function" ? next(draftProp ?? null) : next;
    if (v) onDraftChange?.(v);
  }, [controlled, draftProp, onDraftChange]);
  const [query, setQuery] = useState("");
  const [customDraft, setCustomDraft] = useState<Partial<CustomField>>({ kind: "text", enabled: true, required: false });

  useEffect(() => {
    if (!controlled && open && config) setInnerDraft({ ...config, fields: [...config.fields], custom_fields: [...config.custom_fields] });
  }, [controlled, open, config]);

  const categories = useMemo(() => unique((draft?.fields || []).map(categoryOf)), [draft]);

  if (!open || !draft) return null;

  const selected = draft.fields.filter((f) => f.enabled);
  const available = draft.fields.filter((f) => !f.enabled);
  const filteredAvailable = query.trim()
    ? available.filter((f) => `${f.label} ${categoryOf(f)}`.toLowerCase().includes(query.toLowerCase()))
    : available;

  const selectedAll = [
    ...selected.map((f) => ({ ...f, is_custom: false as const })),
    ...draft.custom_fields.map((f) => ({ ...f, is_custom: true as const })),
  ];

  const update = (next: Partial<SignupConfig>) => setDraft((d) => d ? { ...d, ...next } : d);

  const enable = (key: string) => {
    update({ fields: draft.fields.map((f) => f.key === key ? { ...f, enabled: true } : f) });
  };
  const disable = (key: string) => {
    update({ fields: draft.fields.map((f) => f.key === key ? { ...f, enabled: f.required_locked ? true : false } : f) });
  };
  const setRequired = (key: string, required: boolean, isCustom: boolean) => {
    if (isCustom) update({ custom_fields: draft.custom_fields.map((f) => f.key === key ? { ...f, required } : f) });
    else update({ fields: draft.fields.map((f) => f.key === key ? { ...f, required: f.required_locked ? true : required } : f) });
  };
  const setLabel = (key: string, label: string, isCustom: boolean) => {
    if (isCustom) update({ custom_fields: draft.custom_fields.map((f) => f.key === key ? { ...f, label } : f) });
    else update({ fields: draft.fields.map((f) => f.key === key ? { ...f, label } : f) });
  };
  const move = (key: string, dir: -1 | 1, isCustom: boolean) => {
    if (isCustom) {
      const arr = [...draft.custom_fields];
      const i = arr.findIndex((f) => f.key === key);
      if (i < 0) return;
      const j = i + dir;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      update({ custom_fields: arr });
    } else {
      // For library fields we encode order as index on the enabled subset.
      const enabled = draft.fields.filter((f) => f.enabled);
      const i = enabled.findIndex((f) => f.key === key);
      if (i < 0) return;
      const j = i + dir;
      if (j < 0 || j >= enabled.length) return;
      [enabled[i], enabled[j]] = [enabled[j], enabled[i]];
      // re-stamp order on the library fields
      const orderMap = new Map(enabled.map((f, idx) => [f.key, idx]));
      update({
        fields: draft.fields.map((f) =>
          orderMap.has(f.key) ? { ...f, order: orderMap.get(f.key) as number } : f
        ),
      });
    }
  };
  const removeCustom = (key: string) => {
    update({ custom_fields: draft.custom_fields.filter((f) => f.key !== key) });
  };
  const addCustom = () => {
    if (draft.custom_fields.length >= MAX_CUSTOM) return;
    const label = (customDraft.label || "").trim();
    if (!label) return;
    const key = (customDraft.key || label).toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);
    if (draft.custom_fields.some((f) => f.key === key)) {
      alert("A custom field with that key already exists. Pick a different label.");
      return;
    }
    const cf: CustomField = {
      key,
      label,
      placeholder: customDraft.placeholder || "",
      kind: (customDraft.kind as FieldKind) || "text",
      options: customDraft.kind === "select" ? (String(customDraft.options || "").split(",").map((s) => s.trim()).filter(Boolean)) : undefined,
      enabled: true,
      required: !!customDraft.required,
      is_custom: true,
    };
    update({ custom_fields: [...draft.custom_fields, cf] });
    setCustomDraft({ kind: "text", enabled: true, required: false });
  };

  if (inline) {
    // The panel fills the window's body: three columns as tall as the window,
    // each scrolling on its own. Save lives in the window's footer (controlled)
    // — or, for a caller that gave no draft, at the bottom of the panel.
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
      <div className="grid grid-cols-12 gap-4 h-full p-4">
        {/* ── LEFT: Library ───────────────────────────────────────────────── */}
        <div className="col-span-4 flex flex-col h-full min-h-0 rounded-lg border border-slate-200 bg-white">
          <div className="px-3 py-2 border-b border-slate-200">
            <div className="text-xs font-bold text-slate-900">Field library</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{filteredAvailable.length} available · {selected.length}/{draft.fields.length} selected</div>
            <div className="mt-2 relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or category"
                className="w-full pl-7 pr-2 py-1 text-xs rounded border border-slate-300"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
            {categories.map((cat) => {
              const items = filteredAvailable.filter((f) => categoryOf(f) === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 mb-1">{cat}</div>
                  <div className="space-y-1">
                    {items.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => enable(f.key)}
                        className="w-full text-left px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-50 hover:border-[#FEC82C] text-xs flex items-center justify-between"
                      >
                        <span className="truncate">
                          <span className="font-medium text-slate-900">{f.label}</span>
                          <span className="ml-1.5 text-[10px] text-slate-400">{f.kind}</span>
                        </span>
                        <Plus className="h-3 w-3 text-slate-400 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {filteredAvailable.length === 0 && (
              <div className="text-[11px] text-slate-500 text-center py-6">All library fields are already on your form.</div>
            )}
          </div>
        </div>

        {/* ── CENTER: Selected ───────────────────────────────────────────── */}
        <div className="col-span-5 flex flex-col h-full min-h-0 rounded-lg border border-slate-200 bg-white">
          <div className="px-3 py-2 border-b border-slate-200">
            <div className="text-xs font-bold text-slate-900">Form fields</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{selectedAll.length} fields · max 10 custom</div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
            {selectedAll.length === 0 && (
              <div className="text-center py-6 text-[11px] text-slate-500">Tap a field on the left to add it.</div>
            )}
            {selectedAll.map((f, i) => (
              <div key={f.key} className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => move(f.key, -1, f.is_custom)} disabled={i === 0} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                  <button onClick={() => move(f.key, +1, f.is_custom)} disabled={i === selectedAll.length - 1} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                  <input
                    type="text"
                    value={f.label}
                    onChange={(e) => setLabel(f.key, e.target.value, f.is_custom)}
                    className="flex-1 text-xs px-2 py-1 rounded border border-transparent bg-white hover:border-slate-300 focus:border-[#FEC82C]"
                  />
                  <span className="text-[9px] font-mono text-slate-400 px-1">{f.kind}</span>
                  {!f.is_custom && (f as LibraryField).required_locked && (
                    <span title="Required by core" className="text-amber-500"><Lock className="h-3 w-3" /></span>
                  )}
                  <label className="flex items-center gap-1 text-[10px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={f.required}
                      disabled={!f.is_custom && (f as LibraryField).required_locked}
                      onChange={(e) => setRequired(f.key, e.target.checked, f.is_custom)}
                    />
                    req
                  </label>
                  {f.is_custom ? (
                    <button onClick={() => removeCustom(f.key)} className="rounded p-0.5 text-rose-500 hover:bg-rose-100"><Trash2 className="h-3 w-3" /></button>
                  ) : (
                    <button onClick={() => disable(f.key)} disabled={(f as LibraryField).required_locked} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 disabled:opacity-30"><Trash2 className="h-3 w-3" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Custom-field creator */}
          <div className="border-t border-slate-200 bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Add a custom field <span className="text-slate-400">({draft.custom_fields.length}/{MAX_CUSTOM})</span></div>
            <div className="grid grid-cols-6 gap-1.5">
              <input
                placeholder="Label"
                value={customDraft.label || ""}
                onChange={(e) => setCustomDraft({ ...customDraft, label: e.target.value })}
                className="col-span-3 text-xs px-2 py-1 rounded border border-slate-300"
              />
              <select
                value={customDraft.kind}
                onChange={(e) => setCustomDraft({ ...customDraft, kind: e.target.value as FieldKind })}
                className="col-span-2 text-xs px-2 py-1 rounded border border-slate-300 bg-white"
              >
                <option value="text">Text</option>
                <option value="textarea">Long text</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="select">Dropdown</option>
                <option value="checkbox">Yes/No</option>
              </select>
              <button
                disabled={draft.custom_fields.length >= MAX_CUSTOM}
                onClick={addCustom}
                className="col-span-1 text-xs rounded bg-[#FEC82C] text-[#1A3A4A] font-semibold disabled:opacity-30"
              >
                Add
              </button>
              {customDraft.kind === "select" && (
                <input
                  placeholder="Options, comma-separated"
                  value={(customDraft.options as unknown as string) || ""}
                  onChange={(e) => setCustomDraft({ ...customDraft, options: e.target.value as unknown as string[] })}
                  className="col-span-6 text-xs px-2 py-1 rounded border border-slate-300"
                />
              )}
              <input
                placeholder="Placeholder (optional)"
                value={customDraft.placeholder || ""}
                onChange={(e) => setCustomDraft({ ...customDraft, placeholder: e.target.value })}
                className="col-span-5 text-xs px-2 py-1 rounded border border-slate-300"
              />
              <label className="col-span-1 flex items-center justify-center gap-1 text-[10px] text-slate-700">
                <input type="checkbox" checked={!!customDraft.required} onChange={(e) => setCustomDraft({ ...customDraft, required: e.target.checked })} /> Req
              </label>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Preview ─────────────────────────────────────────────── */}
        <div className="col-span-3 flex flex-col h-full min-h-0 rounded-lg border border-slate-200 bg-slate-50">
          <div className="px-3 py-2 border-b border-slate-200 bg-white">
            <div className="text-xs font-bold text-slate-900">Customer-facing preview</div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <FormPreview config={draft} selectedAll={selectedAll} onWelcome={(t) => update({ welcome_text: t })} onSubmitLabel={(t) => update({ submit_label: t })} />
          </div>
        </div>
      </div>
        </div>
        {!controlled && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
            <IadmButton variant="primary" onClick={() => onSave(draft)} disabled={!!saving}>
              <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save signup form"}
            </IadmButton>
          </div>
        )}
      </div>
    );
  }

  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow="CUSTOMER PORTAL · SIGNUP FORM"
      title="Build the customer signup form"
      subtitle="Pick which fields a customer sees when they self-register on your portal, add custom questions, and preview the form."
      size="report"
      footer={
        <>
          <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
          <IadmButton
            variant="primary"
            onClick={() => onSave(draft)}
            disabled={!!saving}
          >
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save signup form"}
          </IadmButton>
        </>
      }
    >
      <div className="grid grid-cols-12 gap-4 h-full p-4">
        {/* ── LEFT: Library ───────────────────────────────────────────────── */}
        <div className="col-span-4 flex flex-col h-full min-h-0 rounded-lg border border-slate-200 bg-white">
          <div className="px-3 py-2 border-b border-slate-200">
            <div className="text-xs font-bold text-slate-900">Field library</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{filteredAvailable.length} available · {selected.length}/{draft.fields.length} selected</div>
            <div className="mt-2 relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or category"
                className="w-full pl-7 pr-2 py-1 text-xs rounded border border-slate-300"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
            {categories.map((cat) => {
              const items = filteredAvailable.filter((f) => categoryOf(f) === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 mb-1">{cat}</div>
                  <div className="space-y-1">
                    {items.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => enable(f.key)}
                        className="w-full text-left px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-50 hover:border-[#FEC82C] text-xs flex items-center justify-between"
                      >
                        <span className="truncate">
                          <span className="font-medium text-slate-900">{f.label}</span>
                          <span className="ml-1.5 text-[10px] text-slate-400">{f.kind}</span>
                        </span>
                        <Plus className="h-3 w-3 text-slate-400 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {filteredAvailable.length === 0 && (
              <div className="text-[11px] text-slate-500 text-center py-6">All library fields are already on your form.</div>
            )}
          </div>
        </div>

        {/* ── CENTER: Selected ───────────────────────────────────────────── */}
        <div className="col-span-5 flex flex-col h-full min-h-0 rounded-lg border border-slate-200 bg-white">
          <div className="px-3 py-2 border-b border-slate-200">
            <div className="text-xs font-bold text-slate-900">Form fields</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{selectedAll.length} fields · max 10 custom</div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
            {selectedAll.length === 0 && (
              <div className="text-center py-6 text-[11px] text-slate-500">Tap a field on the left to add it.</div>
            )}
            {selectedAll.map((f, i) => (
              <div key={f.key} className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => move(f.key, -1, f.is_custom)} disabled={i === 0} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                  <button onClick={() => move(f.key, +1, f.is_custom)} disabled={i === selectedAll.length - 1} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                  <input
                    type="text"
                    value={f.label}
                    onChange={(e) => setLabel(f.key, e.target.value, f.is_custom)}
                    className="flex-1 text-xs px-2 py-1 rounded border border-transparent bg-white hover:border-slate-300 focus:border-[#FEC82C]"
                  />
                  <span className="text-[9px] font-mono text-slate-400 px-1">{f.kind}</span>
                  {!f.is_custom && (f as LibraryField).required_locked && (
                    <span title="Required by core" className="text-amber-500"><Lock className="h-3 w-3" /></span>
                  )}
                  <label className="flex items-center gap-1 text-[10px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={f.required}
                      disabled={!f.is_custom && (f as LibraryField).required_locked}
                      onChange={(e) => setRequired(f.key, e.target.checked, f.is_custom)}
                    />
                    req
                  </label>
                  {f.is_custom ? (
                    <button onClick={() => removeCustom(f.key)} className="rounded p-0.5 text-rose-500 hover:bg-rose-100"><Trash2 className="h-3 w-3" /></button>
                  ) : (
                    <button onClick={() => disable(f.key)} disabled={(f as LibraryField).required_locked} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 disabled:opacity-30"><Trash2 className="h-3 w-3" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Custom-field creator */}
          <div className="border-t border-slate-200 bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Add a custom field <span className="text-slate-400">({draft.custom_fields.length}/{MAX_CUSTOM})</span></div>
            <div className="grid grid-cols-6 gap-1.5">
              <input
                placeholder="Label"
                value={customDraft.label || ""}
                onChange={(e) => setCustomDraft({ ...customDraft, label: e.target.value })}
                className="col-span-3 text-xs px-2 py-1 rounded border border-slate-300"
              />
              <select
                value={customDraft.kind}
                onChange={(e) => setCustomDraft({ ...customDraft, kind: e.target.value as FieldKind })}
                className="col-span-2 text-xs px-2 py-1 rounded border border-slate-300 bg-white"
              >
                <option value="text">Text</option>
                <option value="textarea">Long text</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="select">Dropdown</option>
                <option value="checkbox">Yes/No</option>
              </select>
              <button
                disabled={draft.custom_fields.length >= MAX_CUSTOM}
                onClick={addCustom}
                className="col-span-1 text-xs rounded bg-[#FEC82C] text-[#1A3A4A] font-semibold disabled:opacity-30"
              >
                Add
              </button>
              {customDraft.kind === "select" && (
                <input
                  placeholder="Options, comma-separated"
                  value={(customDraft.options as unknown as string) || ""}
                  onChange={(e) => setCustomDraft({ ...customDraft, options: e.target.value as unknown as string[] })}
                  className="col-span-6 text-xs px-2 py-1 rounded border border-slate-300"
                />
              )}
              <input
                placeholder="Placeholder (optional)"
                value={customDraft.placeholder || ""}
                onChange={(e) => setCustomDraft({ ...customDraft, placeholder: e.target.value })}
                className="col-span-5 text-xs px-2 py-1 rounded border border-slate-300"
              />
              <label className="col-span-1 flex items-center justify-center gap-1 text-[10px] text-slate-700">
                <input type="checkbox" checked={!!customDraft.required} onChange={(e) => setCustomDraft({ ...customDraft, required: e.target.checked })} /> Req
              </label>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Preview ─────────────────────────────────────────────── */}
        <div className="col-span-3 flex flex-col h-full min-h-0 rounded-lg border border-slate-200 bg-slate-50">
          <div className="px-3 py-2 border-b border-slate-200 bg-white">
            <div className="text-xs font-bold text-slate-900">Customer-facing preview</div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <FormPreview config={draft} selectedAll={selectedAll} onWelcome={(t) => update({ welcome_text: t })} onSubmitLabel={(t) => update({ submit_label: t })} />
          </div>
        </div>
      </div>
    </IadmModal>
  );
}

function FormPreview({
  config, selectedAll, onWelcome, onSubmitLabel,
}: {
  config: SignupConfig;
  selectedAll: Array<LibraryField | (CustomField & { is_custom: boolean })>;
  onWelcome: (t: string) => void;
  onSubmitLabel: (t: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Welcome text</label>
        <textarea
          rows={2}
          value={config.welcome_text}
          onChange={(e) => onWelcome(e.target.value)}
          className="w-full text-xs mt-0.5 px-2 py-1 rounded border border-slate-300 bg-white"
        />
      </div>
      <div className="rounded-lg bg-white p-3 border border-slate-200 shadow-sm">
        <div className="text-xs text-slate-600 mb-2">{config.welcome_text}</div>
        <div className="space-y-2">
          {selectedAll.map((f) => (
            <PreviewField key={f.key} field={f} />
          ))}
        </div>
        <div className="mt-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Submit label</label>
          <input
            type="text"
            value={config.submit_label}
            onChange={(e) => onSubmitLabel(e.target.value)}
            className="w-full text-xs mt-0.5 px-2 py-1 rounded border border-slate-300 bg-white"
          />
          <button disabled className="mt-2 w-full rounded-md py-2 text-xs font-semibold text-[#1A3A4A] bg-[#FEC82C]">
            {config.submit_label || "Create my account"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewField({ field }: { field: LibraryField | (CustomField & { is_custom: boolean }) }) {
  const kind = field.kind || "text";
  const placeholder = (field as CustomField).placeholder || "";
  const opts = (field as LibraryField).options || (field as CustomField).options || [];
  const label = (
    <span className="block text-[10px] font-semibold text-slate-700">
      {field.label}{field.required && <span className="text-rose-500 ml-0.5">*</span>}
    </span>
  );
  if (kind === "textarea") {
    return <label className="block">{label}<textarea disabled rows={2} placeholder={placeholder || ""} className="w-full text-xs mt-0.5 px-2 py-1 rounded border border-slate-200 bg-slate-50" /></label>;
  }
  if (kind === "select") {
    return (
      <label className="block">{label}
        <select disabled className="w-full text-xs mt-0.5 px-2 py-1 rounded border border-slate-200 bg-slate-50">
          <option>{opts[0] || "—"}</option>
        </select>
      </label>
    );
  }
  if (kind === "checkbox") {
    return <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" disabled />{field.label}</label>;
  }
  if (kind === "address") {
    return (
      <div>
        {label}
        <input disabled placeholder="Street address" className="w-full text-xs mt-0.5 px-2 py-1 rounded border border-slate-200 bg-slate-50" />
        <div className="grid grid-cols-3 gap-1 mt-1">
          <input disabled placeholder="City" className="text-xs px-2 py-1 rounded border border-slate-200 bg-slate-50" />
          <input disabled placeholder="State" className="text-xs px-2 py-1 rounded border border-slate-200 bg-slate-50" />
          <input disabled placeholder="ZIP" className="text-xs px-2 py-1 rounded border border-slate-200 bg-slate-50" />
        </div>
      </div>
    );
  }
  if (kind === "phone") {
    return (
      <label className="block">{label}
        <PhoneInput
          value=""
          onChange={() => { /* preview only */ }}
          disabled
          placeholder={placeholder || "(555) 555-5555"}
          className="w-full text-xs mt-0.5 px-2 py-1 rounded border border-slate-200 bg-slate-50"
        />
      </label>
    );
  }
  return (
    <label className="block">{label}
      <input
        type={kind === "email" ? "email" : kind === "number" ? "number" : kind === "date" ? "date" : "text"}
        disabled
        placeholder={placeholder || ""}
        className="w-full text-xs mt-0.5 px-2 py-1 rounded border border-slate-200 bg-slate-50"
      />
    </label>
  );
}

export default SignupFormBuilder;

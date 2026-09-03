// CustomFieldsPage — per-entity custom field definitions, tier-capped.
//
// This is the machinery the non-profit fund/class dimension (Milestone 4) is
// modelled on, so the shape matters beyond this page: a definition belongs to
// an entity, carries a type, and its values live one-per-row.
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { StellaShell, STELLA_INDIGO } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import {
  DbCard, DbError, DbLoading, DbButton, DbInput, DbSelect, DbField, DbEmpty,
  DbNotice, useNotice, Pill, DbModal, DbTable, CapLine,
} from "./DbManagerKit";

type Def = {
  custom_field_def_id: string; target_entity: string; field_key: string;
  display_name: string | null; data_type: string; required: boolean; created_at: string;
};
type Meta = { current_tier: string; limit: number | null; used: number; types: string[] };

// Entity keys the API accepts (its TAG_TARGETS map), with customer-facing labels.
const ENTITIES = [
  { key: "transaction", label: "Transactions" },
  { key: "counterparty", label: "Vendors & Customers" },
  { key: "coa_account", label: "Accounts" },
  { key: "document", label: "Documents" },
  { key: "mileage_entry", label: "Mileage" },
  { key: "materials_log", label: "Materials" },
];

export function StellaCustomFieldsPage() {
  const api = useStellaApi();
  const [entity, setEntity] = useState("transaction");
  const [defs, setDefs] = useState<Def[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ display_name: "", field_key: "", data_type: "text", required: false });

  const load = useCallback(() => {
    if (!api.ready) return;
    setDefs(null);
    api.getFull<{ data: Def[]; meta: Meta }>(`/db-manager/custom-fields/${entity}`)
      .then((r) => { setDefs(r.data); setMeta(r.meta); })
      .catch(setError);
  }, [api, entity]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    const label = form.display_name.trim();
    if (!label) return;
    setBusy(true); setError(null);
    try {
      // Derive the key from the label so the customer never has to think about
      // one; they can still override it before saving.
      const key = (form.field_key.trim() || label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      await api.post("/db-manager/custom-fields", {
        target_entity: entity, field_key: key, display_name: label,
        data_type: form.data_type, required: form.required,
      });
      showNotice(`“${label}” added to ${ENTITIES.find((e) => e.key === entity)?.label}.`);
      setCreating(false);
      setForm({ display_name: "", field_key: "", data_type: "text", required: false });
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function remove(d: Def) {
    if (!window.confirm(`Delete “${d.display_name || d.field_key}”? Every value saved against it will be deleted too.`)) return;
    setBusy(true); setError(null);
    try {
      await api.del(`/db-manager/custom-fields/${d.custom_field_def_id}`);
      showNotice(`Deleted “${d.display_name || d.field_key}”.`);
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  if (error && !defs && !meta) {
    return <StellaShell title="Custom Fields" subtitle="Track what your business needs."><DbError error={error} /></StellaShell>;
  }

  const atCap = !!meta && meta.limit !== null && meta.used >= meta.limit;

  return (
    <StellaShell
      title="Custom Fields"
      subtitle="Track the things your business needs that a standard chart of accounts doesn't cover."
      actions={
        <DbButton onClick={() => setCreating(true)} disabled={atCap} title={atCap ? "You've used every custom field on your plan." : undefined}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={13} /> New field</span>
        </DbButton>
      }
    >
      <DbNotice text={notice} />
      <DbError error={error} />

      <DbCard
        title="Add fields to"
        actions={meta ? <CapLine used={meta.used} limit={meta.limit} noun="custom fields" /> : null}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {ENTITIES.map((e) => (
            <button
              key={e.key} onClick={() => setEntity(e.key)}
              style={{
                padding: "6px 12px", borderRadius: 99, fontSize: 12,
                fontWeight: e.key === entity ? 700 : 500, cursor: "pointer",
                border: `1px solid ${e.key === entity ? STELLA_INDIGO : "#E2E8F0"}`,
                background: e.key === entity ? "#E8E9FA" : "#fff",
                color: e.key === entity ? STELLA_INDIGO : "#475569",
              }}
            >{e.label}</button>
          ))}
        </div>

        {!defs ? <DbLoading /> : (
          <DbTable
            columns={[
              { key: "display_name", label: "Field" },
              { key: "field_key", label: "Key" },
              { key: "data_type", label: "Type" },
              { key: "required", label: "Required", type: "bool" },
              { key: "created_at", label: "Added", type: "datetime" },
              { key: "action", label: "" },
            ]}
            rows={defs.map((d) => ({
              ...d,
              display_name: d.display_name || d.field_key,
              field_key: <code style={{ fontSize: 10, color: "#64748B" }}>{d.field_key}</code>,
              data_type: <Pill>{d.data_type}</Pill>,
              action: <DbButton variant="danger" onClick={() => remove(d)} disabled={busy}><Trash2 size={13} /></DbButton>,
            })) as never}
            empty={<DbEmpty
              title="No custom fields on this yet"
              reason="Add one to capture something STELLA doesn't ask for out of the box — a property code, a grant, a crew name."
            />}
          />
        )}
      </DbCard>

      {creating && (
        <DbModal title="New custom field" onClose={() => setCreating(false)} width={460}>
          <div style={{ display: "grid", gap: 12 }}>
            <DbField label="What is it called?">
              <DbInput
                autoFocus value={form.display_name} maxLength={200} placeholder="e.g. Property code"
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </DbField>
            <DbField label="Type">
              <DbSelect value={form.data_type} onChange={(e) => setForm({ ...form, data_type: e.target.value })}>
                {(meta?.types || ["text", "number", "date", "bool", "select"]).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </DbSelect>
            </DbField>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#334155" }}>
              <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} />
              Required — a row can't be saved without it
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <DbButton onClick={create} disabled={busy || !form.display_name.trim()}>{busy ? "Saving…" : "Add field"}</DbButton>
              <DbButton variant="ghost" onClick={() => setCreating(false)}>Cancel</DbButton>
            </div>
          </div>
        </DbModal>
      )}
    </StellaShell>
  );
}

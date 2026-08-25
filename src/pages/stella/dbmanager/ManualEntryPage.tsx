// ManualEntryPage — structured entry driven by the SAME field definitions the
// importer uses (GET /db-manager/manual-entry). One definition, two doorways:
// a row typed here and a row imported from a spreadsheet land identically,
// because they go through the same validator and the same promoter.
import { useEffect, useState } from "react";
import { PlusCircle } from "lucide-react";
import { StellaShell, STELLA_INDIGO } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import {
  DbCard, DbError, DbLoading, DbButton, DbInput, DbSelect, DbField, DbNotice, useNotice, Pill,
} from "./DbManagerKit";

type Field = {
  key: string; label: string; type: string; required: boolean;
  values?: string[]; max?: number;
};
type Entity = { entity: string; label: string; fields: Field[] };

export function StellaManualEntryPage() {
  const api = useStellaApi();
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [active, setActive] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [notice, showNotice] = useNotice();

  useEffect(() => {
    if (!api.ready) return;
    api.get<Entity[]>("/db-manager/manual-entry")
      .then((rows) => { setEntities(rows); setActive((p) => p || rows[0]?.entity || ""); })
      .catch(setError);
  }, [api]);

  const entity = entities?.find((e) => e.entity === active) || null;

  function set(key: string, v: string) { setValues((prev) => ({ ...prev, [key]: v })); }

  async function submit() {
    if (!entity) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      for (const f of entity.fields) if (values[f.key] !== undefined) body[f.key] = values[f.key];
      const r = await api.post<{ id: string }>(`/db-manager/manual-entry/${entity.entity}`, body);
      showNotice(`Saved. ${entity.label.replace(/s$/, "")} created (${r.id.slice(0, 8)}…).`);
      setValues({});
    } catch (e) {
      // The API returns { error, details: [...] } for validation — surface each
      // line rather than a single opaque "validation_failed".
      const d = (e as { details?: string[] })?.details;
      setError(d?.length ? { message: d.join(" · ") } : e);
    } finally { setSaving(false); }
  }

  if (error && !entities) {
    return <StellaShell title="Manual Entry" subtitle="Add a single row by hand."><DbError error={error} /></StellaShell>;
  }

  return (
    <StellaShell title="Manual Entry" subtitle="Add one row by hand — the same fields and checks the importer uses.">
      <DbNotice text={notice} />
      {!entities ? <DbLoading /> : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 220px) 1fr", gap: 16, alignItems: "start" }}>
          <DbCard title="What are you adding?">
            <div style={{ display: "grid", gap: 2 }}>
              {entities.map((e) => (
                <button
                  key={e.entity}
                  onClick={() => { setActive(e.entity); setValues({}); setError(null); }}
                  style={{
                    textAlign: "left", padding: "8px 10px", borderRadius: 7, border: 0,
                    background: e.entity === active ? "#E8E9FA" : "transparent", cursor: "pointer",
                    fontSize: 12, fontWeight: e.entity === active ? 700 : 500,
                    color: e.entity === active ? STELLA_INDIGO : "#334155",
                  }}
                >{e.label}</button>
              ))}
            </div>
          </DbCard>

          <DbCard title={entity ? entity.label : ""}>
            <DbError error={error} />
            {!entity ? null : (
              <form onSubmit={(ev) => { ev.preventDefault(); submit(); }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  {entity.fields.map((f) => (
                    <DbField
                      key={f.key}
                      label={f.required ? `${f.label} *` : f.label}
                      hint={f.type === "date" ? "YYYY-MM-DD" : f.type === "decimal" ? "Numbers only" : undefined}
                    >
                      {f.type === "enum" ? (
                        <DbSelect value={values[f.key] || ""} onChange={(e) => set(f.key, e.target.value)}>
                          <option value="">—</option>
                          {(f.values || []).map((v) => <option key={v} value={v}>{v}</option>)}
                        </DbSelect>
                      ) : f.type === "bool" ? (
                        <DbSelect value={values[f.key] || ""} onChange={(e) => set(f.key, e.target.value)}>
                          <option value="">—</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </DbSelect>
                      ) : (
                        <DbInput
                          type={f.type === "date" ? "date" : "text"}
                          inputMode={f.type === "decimal" ? "decimal" : undefined}
                          value={values[f.key] || ""}
                          onChange={(e) => set(f.key, e.target.value)}
                          maxLength={f.max}
                        />
                      )}
                    </DbField>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
                  <DbButton type="submit" disabled={saving}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <PlusCircle size={13} /> {saving ? "Saving…" : `Add ${entity.label.replace(/s$/, "")}`}
                    </span>
                  </DbButton>
                  <Pill>* required</Pill>
                </div>
              </form>
            )}
          </DbCard>
        </div>
      )}
    </StellaShell>
  );
}

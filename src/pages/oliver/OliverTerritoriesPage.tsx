import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, DataTable, EmptyState, Button, FilterBar, type Column,
} from "../../components/oliver/ui";
import { Edit3, Trash2, MapPin, Plus } from "lucide-react";

interface TerritoryRules {
  states?: string[];
  cities?: string[];
  zip_prefixes?: string[];
}

interface Territory {
  territory_id: string;
  name: string;
  description: string | null;
  rules_json: string | TerritoryRules | null;
  primary_worker_id: string | null;
  backup_worker_ids: string[] | string | null;
  is_active: boolean;
}

interface WorkerLite { worker_id: string; first_name?: string; last_name?: string; email?: string; display_name?: string; }

function parseRules(raw: string | TerritoryRules | null): TerritoryRules {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}
function parseBackupIds(raw: string[] | string | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}
function summarizeRules(rules: TerritoryRules): string {
  const bits: string[] = [];
  if (rules.states?.length) bits.push(`${rules.states.length} state${rules.states.length === 1 ? "" : "s"}`);
  if (rules.cities?.length) bits.push(`${rules.cities.length} cit${rules.cities.length === 1 ? "y" : "ies"}`);
  if (rules.zip_prefixes?.length) bits.push(`${rules.zip_prefixes.length} zip prefix${rules.zip_prefixes.length === 1 ? "" : "es"}`);
  return bits.length ? bits.join(" · ") : "no rules";
}

export function OliverTerritoriesPage() {
  const { get, post, patch, del, ready } = useOliverApi();
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [workers, setWorkers] = useState<WorkerLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Territory | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [t, w] = await Promise.all([
        get<Territory[]>("/territories"),
        get<WorkerLite[]>("/workers?per_page=100"),
      ]);
      setTerritories(t || []);
      setWorkers(w || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filtered = useMemo(() => {
    if (!search.trim()) return territories;
    const q = search.toLowerCase();
    return territories.filter((t) => (t.name || "").toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q));
  }, [territories, search]);

  function workerName(id: string | null): string {
    if (!id) return "—";
    const w = workers.find((w) => w.worker_id === id);
    if (!w) return id.slice(0, 8);
    return w.display_name || `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim() || w.email || id.slice(0, 8);
  }

  async function toggleActive(t: Territory) {
    try {
      await patch(`/territories/${t.territory_id}`, { is_active: !t.is_active });
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function deleteTerritory(t: Territory) {
    if (!confirm(`Delete territory "${t.name}"?`)) return;
    try {
      await del(`/territories/${t.territory_id}`);
      setFlash(`Deleted "${t.name}".`);
      setTimeout(() => setFlash(null), 3000);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const columns: Column<Territory>[] = [
    {
      key: "name", header: "Territory", sortable: true, sortAccessor: (t) => t.name,
      render: (t) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1A3A4A", display: "flex", alignItems: "center", gap: 6 }}>
            <MapPin size={13} color="#5A7A8A" />
            {t.name}
          </div>
          {t.description && <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>{t.description}</div>}
        </div>
      ),
    },
    {
      key: "rules", header: "Coverage",
      render: (t) => <span style={{ fontSize: 11, color: "#0B1C24" }}>{summarizeRules(parseRules(t.rules_json))}</span>,
    },
    {
      key: "primary", header: "Primary worker",
      render: (t) => <span style={{ fontSize: 12, color: "#0B1C24" }}>{workerName(t.primary_worker_id)}</span>,
    },
    {
      key: "backups", header: "Backups",
      render: (t) => {
        const ids = parseBackupIds(t.backup_worker_ids);
        return ids.length ? (
          <span style={{ fontSize: 11, color: "#0B1C24" }}>{ids.length} worker{ids.length === 1 ? "" : "s"}</span>
        ) : <span style={{ color: "#94A3B8", fontSize: 11 }}>none</span>;
      },
    },
    {
      key: "active", header: "Active",
      render: (t) => (
        <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }} onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={t.is_active} onChange={() => toggleActive(t)} />
        </label>
      ),
    },
    {
      key: "actions", header: "", align: "right",
      render: (t) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => setEditing(t)}><Edit3 size={11} /></Button>
          <Button variant="ghost" size="sm" onClick={() => deleteTerritory(t)}><Trash2 size={11} color="#dc2626" /></Button>
        </div>
      ),
    },
  ];

  return (
    <OliverPageWrapper title="Territories" subtitle="Geographic service zones and worker assignments" error={error} loading={loading && !territories.length}>
      <PageHeader
        title="Territories"
        subtitle="Define service zones by state, city, or ZIP — auto-route incoming jobs to the right worker."
        actions={<Button variant="primary" onClick={() => setShowCreate(true)}><Plus size={12} /> New territory</Button>}
      />

      {flash && <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>{flash}</div>}

      {!territories.length && !loading ? (
        <EmptyState
          title="No territories defined"
          description="Territories help auto-assign incoming service requests to the right worker based on geography."
          action={<Button variant="primary" onClick={() => setShowCreate(true)}>+ Create first territory</Button>}
        />
      ) : (
        <>
          <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search territories…" />
          <DataTable rows={filtered} columns={columns} rowKey={(t) => t.territory_id} initialSort={{ key: "name", direction: "asc" }} emptyMessage="No territories match your search." />
        </>
      )}

      {(showCreate || editing) && (
        <TerritoryDrawer
          territory={editing}
          workers={workers}
          onClose={() => { setShowCreate(false); setEditing(null); }}
          onSaved={(msg) => { setShowCreate(false); setEditing(null); reload(); setFlash(msg); setTimeout(() => setFlash(null), 3000); }}
          api={{ post, patch }}
        />
      )}
    </OliverPageWrapper>
  );
}

function TerritoryDrawer({ territory, workers, onClose, onSaved, api }: {
  territory: Territory | null;
  workers: WorkerLite[];
  onClose: () => void;
  onSaved: (msg: string) => void;
  api: { post: <T>(p: string, b?: unknown) => Promise<T>; patch: <T>(p: string, b: unknown) => Promise<T> };
}) {
  const existingRules = territory ? parseRules(territory.rules_json) : {};
  const existingBackups = territory ? parseBackupIds(territory.backup_worker_ids) : [];

  const [name, setName] = useState(territory?.name ?? "");
  const [description, setDescription] = useState(territory?.description ?? "");
  const [states, setStates] = useState((existingRules.states ?? []).join(", "));
  const [cities, setCities] = useState((existingRules.cities ?? []).join(", "));
  const [zips, setZips] = useState((existingRules.zip_prefixes ?? []).join(", "));
  const [primary, setPrimary] = useState(territory?.primary_worker_id ?? "");
  const [backups, setBackups] = useState<Set<string>>(new Set(existingBackups));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleBackup(id: string) {
    const next = new Set(backups);
    if (next.has(id)) next.delete(id); else next.add(id);
    setBackups(next);
  }

  function parseList(s: string): string[] {
    return s.split(",").map((x) => x.trim()).filter(Boolean);
  }

  async function submit() {
    if (!name.trim()) { setErr("Name is required"); return; }
    setErr(null); setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        rules: {
          states: parseList(states),
          cities: parseList(cities),
          zip_prefixes: parseList(zips),
        },
        primary_worker_id: primary || null,
        backup_worker_ids: Array.from(backups),
      };
      if (territory) {
        await api.patch(`/territories/${territory.territory_id}`, body);
        onSaved(`Updated "${name}".`);
      } else {
        await api.post("/territories", body);
        onSaved(`Created "${name}".`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 520, height: "100%", background: "#fff", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }}>
        <div style={{ padding: 20, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A3A4A" }}>{territory ? "Edit territory" : "New territory"}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <label><span style={pLabel}>Name</span><input style={pInput} placeholder="North Side, Downtown, etc." value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
          <label><span style={pLabel}>Description</span><textarea rows={2} style={{ ...pInput, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} /></label>

          <div style={{ padding: 12, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", marginBottom: 8 }}>Coverage rules</div>
            <label><span style={pLabel}>States (comma-separated, 2-letter codes)</span><input style={pInput} placeholder="CA, OR, WA" value={states} onChange={(e) => setStates(e.target.value)} /></label>
            <label style={{ display: "block", marginTop: 10 }}><span style={pLabel}>Cities (comma-separated)</span><input style={pInput} placeholder="San Francisco, Oakland" value={cities} onChange={(e) => setCities(e.target.value)} /></label>
            <label style={{ display: "block", marginTop: 10 }}><span style={pLabel}>ZIP prefixes (comma-separated)</span><input style={pInput} placeholder="941, 946" value={zips} onChange={(e) => setZips(e.target.value)} /></label>
          </div>

          <label><span style={pLabel}>Primary worker</span>
            <select style={pInput} value={primary} onChange={(e) => setPrimary(e.target.value)}>
              <option value="">— Unassigned —</option>
              {workers.map((w) => {
                const name = w.display_name || `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim() || w.email || w.worker_id.slice(0, 8);
                return <option key={w.worker_id} value={w.worker_id}>{name}</option>;
              })}
            </select>
          </label>
          <div>
            <span style={pLabel}>Backup workers ({backups.size} selected)</span>
            <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #E2E8F0", borderRadius: 6, padding: 8 }}>
              {workers.filter((w) => w.worker_id !== primary).map((w) => {
                const name = w.display_name || `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim() || w.email || w.worker_id.slice(0, 8);
                return (
                  <label key={w.worker_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 4px", fontSize: 12 }}>
                    <input type="checkbox" checked={backups.has(w.worker_id)} onChange={() => toggleBackup(w.worker_id)} />
                    <span>{name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !name.trim()}>{saving ? "Saving…" : (territory ? "Save" : "Create territory")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const pInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24" };
const errBox: React.CSSProperties = { padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 };

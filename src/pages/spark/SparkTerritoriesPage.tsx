// SparkTerritoriesPage — Lead territory rules and ownership
//
// A territory is a named set of geo + industry rules plus an assigned owner.
// The routing engine and the territory-routing strategy use these rows to pick
// the right lead owner when a new lead lands.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Trash2, Pencil, MapPin } from "lucide-react";

interface TerritoryRules {
  states?: string[];
  cities?: string[];
  zip_prefixes?: string[];
  industries?: string[];
  countries?: string[];
}

interface TerritoryRow {
  id: number;
  name: string;
  description: string | null;
  rules_json: string | null;
  assigned_to: string | null;
  is_active: boolean;
}

function parseRules(json: string | null): TerritoryRules {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return (v && typeof v === "object") ? v as TerritoryRules : {};
  } catch {
    return {};
  }
}

function summarize(r: TerritoryRules): string {
  const parts: string[] = [];
  if (r.states?.length)        parts.push(`States: ${r.states.join(", ")}`);
  if (r.cities?.length)        parts.push(`Cities: ${r.cities.join(", ")}`);
  if (r.zip_prefixes?.length)  parts.push(`ZIPs: ${r.zip_prefixes.join(", ")}`);
  if (r.industries?.length)    parts.push(`Industries: ${r.industries.join(", ")}`);
  if (r.countries?.length)     parts.push(`Countries: ${r.countries.join(", ")}`);
  return parts.join(" · ") || "No rules";
}

function csv(s: string): string[] {
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

export function SparkTerritoriesPage() {
  const { get, post, put, del, ready } = useSparkApi();
  const [rows, setRows] = useState<TerritoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TerritoryRow | null>(null);
  const [busy, setBusy] = useState(false);

  // form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [states, setStates] = useState("");
  const [cities, setCities] = useState("");
  const [zipPrefixes, setZipPrefixes] = useState("");
  const [industries, setIndustries] = useState("");
  const [countries, setCountries] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: TerritoryRow[] }>("/api/v1/lead-territories");
      setRows(r?.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { fetchList(); }, [fetchList]);

  function resetForm() {
    setName(""); setDescription("");
    setStates(""); setCities(""); setZipPrefixes("");
    setIndustries(""); setCountries(""); setAssignedTo("");
    setEditing(null);
  }

  function openCreate() {
    resetForm();
    setShowModal(true);
  }

  function openEdit(row: TerritoryRow) {
    const r = parseRules(row.rules_json);
    setEditing(row);
    setName(row.name);
    setDescription(row.description || "");
    setStates((r.states || []).join(", "));
    setCities((r.cities || []).join(", "));
    setZipPrefixes((r.zip_prefixes || []).join(", "));
    setIndustries((r.industries || []).join(", "));
    setCountries((r.countries || []).join(", "));
    setAssignedTo(row.assigned_to || "");
    setShowModal(true);
  }

  async function save() {
    if (!name.trim()) {
      alert("Name is required.");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        rules: {
          states: csv(states),
          cities: csv(cities),
          zip_prefixes: csv(zipPrefixes),
          industries: csv(industries),
          countries: csv(countries),
        },
        assigned_to: assignedTo.trim() || null,
      };
      if (editing) {
        // useSparkApi has no PATCH helper; PUT semantics are accepted by the backend.
        await put(`/api/v1/lead-territories/${editing.id}`, body);
      } else {
        await post("/api/v1/lead-territories", body);
      }
      setShowModal(false);
      resetForm();
      await fetchList();
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: TerritoryRow) {
    try {
      await put(`/api/v1/lead-territories/${row.id}`, { is_active: !row.is_active });
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: !row.is_active } : r));
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this territory? Any routing rules pointing at it will need to be updated.")) return;
    try {
      await del(`/api/v1/lead-territories/${id}`);
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    }
  }

  const actions = (
    <button
      onClick={openCreate}
      className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white hover:bg-[#d85a25] flex items-center gap-1"
    >
      <Plus className="h-4 w-4" /> New territory
    </button>
  );

  return (
    <SparkPageShell
      title="Territories"
      subtitle={`${rows.length} territor${rows.length === 1 ? "y" : "ies"}`}
      help="Geographic and industry-based groupings that drive lead ownership. Routing rules with the 'territory' strategy assign new leads to the territory owner. Order doesn't matter — the first matching territory wins."
      actions={actions}
      loading={loading}
      error={error}
    >
      <div className="overflow-x-auto">
        <table className="spark-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Criteria</th>
              <th>Owner</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-sm text-slate-500 py-8">
                  <MapPin className="h-5 w-5 mx-auto text-slate-300 mb-1" />
                  No territories defined yet.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const rules = parseRules(row.rules_json);
              return (
                <tr key={row.id}>
                  <td>
                    <div className="font-medium text-slate-900">{row.name}</div>
                    {row.description && <div className="text-xs text-slate-500 mt-0.5">{row.description}</div>}
                  </td>
                  <td className="text-xs text-slate-600">{summarize(rules)}</td>
                  <td className="text-sm text-slate-700">{row.assigned_to || "—"}</td>
                  <td>
                    <button
                      onClick={() => toggleActive(row)}
                      className={`text-[11px] px-2 py-0.5 rounded border ${row.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}
                    >
                      {row.is_active ? "Active" : "Off"}
                    </button>
                  </td>
                  <td className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(row)}
                      className="text-slate-500 hover:bg-slate-100 rounded p-1"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(row.id)}
                      className="text-rose-600 hover:bg-rose-50 rounded p-1"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200">
              <div className="text-xs uppercase font-bold text-slate-500">{editing ? "Edit" : "New"}</div>
              <div className="text-base font-semibold text-slate-900 mt-0.5">{editing ? "Edit territory" : "Create territory"}</div>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm max-h-[70vh] overflow-y-auto">
              <FormField label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Texas - Energy"
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </FormField>
              <FormField label="Description">
                <input value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Energy-sector accounts in Texas"
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </FormField>
              <FormField label="States (comma-separated)">
                <input value={states} onChange={(e) => setStates(e.target.value)}
                  placeholder="TX, OK, LA"
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </FormField>
              <FormField label="Cities (comma-separated)">
                <input value={cities} onChange={(e) => setCities(e.target.value)}
                  placeholder="Dallas, Houston"
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </FormField>
              <FormField label="ZIP prefixes (comma-separated)">
                <input value={zipPrefixes} onChange={(e) => setZipPrefixes(e.target.value)}
                  placeholder="752, 770"
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </FormField>
              <FormField label="Industries (comma-separated)">
                <input value={industries} onChange={(e) => setIndustries(e.target.value)}
                  placeholder="Energy, Oil & Gas"
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </FormField>
              <FormField label="Countries (comma-separated)">
                <input value={countries} onChange={(e) => setCountries(e.target.value)}
                  placeholder="US, CA"
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </FormField>
              <FormField label="Assigned to (email)">
                <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
                  placeholder="rep@company.com"
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </FormField>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button onClick={() => setShowModal(false)}
                className="text-sm px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={busy} onClick={save}
                className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white hover:bg-[#d85a25] disabled:opacity-50">
                {busy ? "Saving…" : (editing ? "Save" : "Create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default SparkTerritoriesPage;

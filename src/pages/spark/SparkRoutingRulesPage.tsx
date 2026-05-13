// SparkRoutingRulesPage — Inbound lead routing rules
//
// Rules run in `sort_order` (lowest first). The first rule whose condition
// matches the lead determines the owner. Routing strategy can be round-robin
// across a user pool, weighted random, a specific user, or a territory
// (which then resolves via the SparkTerritoriesPage rules).
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, X, Route } from "lucide-react";

type RoutingType = "round_robin" | "weighted" | "specific_user" | "territory";

const ROUTING_TYPES: RoutingType[] = ["round_robin", "weighted", "specific_user", "territory"];

const ROUTING_STYLE: Record<RoutingType, string> = {
  round_robin:   "bg-blue-50 text-blue-700 border-blue-200",
  weighted:      "bg-indigo-50 text-indigo-700 border-indigo-200",
  specific_user: "bg-emerald-50 text-emerald-700 border-emerald-200",
  territory:     "bg-amber-50 text-amber-700 border-amber-200",
};

interface RoutingCondition {
  min_score?: number;
  max_score?: number;
  industry?: string[];
  country?: string[];
  state?: string[];
  city?: string[];
  temperature?: string[];
}

interface RoutingTarget {
  users?: string[];
  user?: string;
  territory_id?: number;
  weights?: Record<string, number>;
}

interface RoutingRow {
  id: number;
  name: string;
  condition_json: string | null;
  routing_type: RoutingType;
  routing_target_json: string | null;
  is_active: boolean;
  sort_order: number;
}

function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    const v = JSON.parse(json);
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function summarizeCondition(c: RoutingCondition): string {
  const parts: string[] = [];
  if (typeof c.min_score === "number") parts.push(`score ≥ ${c.min_score}`);
  if (typeof c.max_score === "number") parts.push(`score ≤ ${c.max_score}`);
  if (c.industry?.length)    parts.push(`industry: ${c.industry.join(", ")}`);
  if (c.country?.length)     parts.push(`country: ${c.country.join(", ")}`);
  if (c.state?.length)       parts.push(`state: ${c.state.join(", ")}`);
  if (c.city?.length)        parts.push(`city: ${c.city.join(", ")}`);
  if (c.temperature?.length) parts.push(`temp: ${c.temperature.join(", ")}`);
  return parts.join(" · ") || "Always match";
}

function summarizeTarget(type: RoutingType, t: RoutingTarget): string {
  if (type === "round_robin" || type === "weighted") {
    const users = t.users || [];
    if (!users.length) return "no users";
    return users.join(", ");
  }
  if (type === "specific_user") return t.user || "(unset)";
  if (type === "territory")     return t.territory_id ? `Territory #${t.territory_id}` : "(no territory)";
  return "—";
}

function csv(s: string): string[] {
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

export function SparkRoutingRulesPage() {
  const { get, post, del, ready } = useSparkApi();
  const [rows, setRows] = useState<RoutingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);

  // form
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("100");
  const [routingType, setRoutingType] = useState<RoutingType>("round_robin");
  // condition fields
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [temperature, setTemperature] = useState("");
  // target fields
  const [users, setUsers] = useState("");
  const [specificUser, setSpecificUser] = useState("");
  const [territoryId, setTerritoryId] = useState("");

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: RoutingRow[] }>("/api/v1/routing-rules");
      setRows(r?.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { fetchList(); }, [fetchList]);

  function resetForm() {
    setName(""); setSortOrder("100");
    setRoutingType("round_robin");
    setMinScore(""); setMaxScore("");
    setIndustry(""); setCountry(""); setState(""); setCity("");
    setTemperature("");
    setUsers(""); setSpecificUser(""); setTerritoryId("");
  }

  async function save() {
    if (!name.trim()) {
      alert("Name is required.");
      return;
    }
    const condition: RoutingCondition = {};
    if (minScore.trim()) condition.min_score = Number(minScore);
    if (maxScore.trim()) condition.max_score = Number(maxScore);
    if (industry.trim()) condition.industry = csv(industry);
    if (country.trim())  condition.country  = csv(country);
    if (state.trim())    condition.state    = csv(state);
    if (city.trim())     condition.city     = csv(city);
    if (temperature.trim()) condition.temperature = csv(temperature);

    const target: RoutingTarget = {};
    if (routingType === "round_robin" || routingType === "weighted") {
      const list = csv(users);
      if (!list.length) {
        alert("Round-robin / weighted requires at least one user.");
        return;
      }
      target.users = list;
    } else if (routingType === "specific_user") {
      if (!specificUser.trim()) {
        alert("Specific-user routing requires a user.");
        return;
      }
      target.user = specificUser.trim();
    } else if (routingType === "territory") {
      const tid = Number(territoryId);
      if (!Number.isFinite(tid) || tid <= 0) {
        alert("Territory routing requires a numeric territory id.");
        return;
      }
      target.territory_id = tid;
    }

    setBusy(true);
    try {
      await post("/api/v1/routing-rules", {
        name: name.trim(),
        condition,
        routing_type: routingType,
        routing_target: target,
        sort_order: Number(sortOrder) || 100,
      });
      setShowModal(false);
      resetForm();
      await fetchList();
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this routing rule? Leads already assigned won't be re-routed.")) return;
    try {
      await del(`/api/v1/routing-rules/${id}`);
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    }
  }

  const actions = (
    <button
      onClick={() => { resetForm(); setShowModal(true); }}
      className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white hover:bg-[#d85a25] flex items-center gap-1"
    >
      <Plus className="h-4 w-4" /> New rule
    </button>
  );

  return (
    <SparkPageShell
      title="Routing rules"
      subtitle={`${rows.length} rule${rows.length === 1 ? "" : "s"}`}
      help="Rules that pick the owner of every inbound lead. Rules run in sort order (lowest first) and the first match wins. Round-robin and weighted distribute across a user pool; territory routing defers to the matching territory owner."
      actions={actions}
      loading={loading}
      error={error}
    >
      <div className="overflow-x-auto">
        <table className="spark-table">
          <thead>
            <tr>
              <th>Sort</th>
              <th>Name</th>
              <th>Condition</th>
              <th>Strategy</th>
              <th>Target</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-sm text-slate-500 py-8">
                  <Route className="h-5 w-5 mx-auto text-slate-300 mb-1" />
                  No routing rules yet.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const cond = parseJson<RoutingCondition>(row.condition_json, {});
              const target = parseJson<RoutingTarget>(row.routing_target_json, {});
              return (
                <tr key={row.id}>
                  <td className="text-xs text-slate-500">{row.sort_order}</td>
                  <td className="font-medium text-slate-900">{row.name}</td>
                  <td className="text-xs text-slate-600">{summarizeCondition(cond)}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[11px] border font-mono ${ROUTING_STYLE[row.routing_type] || "bg-slate-50 text-slate-700 border-slate-200"}`}>
                      {row.routing_type}
                    </span>
                  </td>
                  <td className="text-xs text-slate-600">{summarizeTarget(row.routing_type, target)}</td>
                  <td>
                    <button
                      onClick={() => remove(row.id)}
                      className="text-rose-600 hover:bg-rose-50 rounded p-1"
                      title="Delete"
                    >
                      <X className="h-4 w-4" />
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
              <div className="text-xs uppercase font-bold text-slate-500">New</div>
              <div className="text-base font-semibold text-slate-900 mt-0.5">Routing rule</div>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <FormField label="Name">
                    <input value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="High-value enterprise"
                      className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                  </FormField>
                </div>
                <FormField label="Sort order">
                  <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
              </div>

              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide pt-2 border-t border-slate-100">Match conditions</div>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Min score">
                  <input type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)}
                    placeholder="e.g. 80"
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
                <FormField label="Max score">
                  <input type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
              </div>
              <FormField label="Industries (comma-separated)">
                <input value={industry} onChange={(e) => setIndustry(e.target.value)}
                  placeholder="SaaS, FinTech"
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </FormField>
              <div className="grid grid-cols-3 gap-2">
                <FormField label="Country">
                  <input value={country} onChange={(e) => setCountry(e.target.value)}
                    placeholder="US"
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
                <FormField label="State">
                  <input value={state} onChange={(e) => setState(e.target.value)}
                    placeholder="TX, NY"
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
                <FormField label="City">
                  <input value={city} onChange={(e) => setCity(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
              </div>
              <FormField label="Temperature (comma-separated)">
                <input value={temperature} onChange={(e) => setTemperature(e.target.value)}
                  placeholder="hot, warm"
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </FormField>

              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide pt-2 border-t border-slate-100">Routing strategy</div>
              <FormField label="Strategy">
                <select value={routingType} onChange={(e) => setRoutingType(e.target.value as RoutingType)}
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33] bg-white">
                  {ROUTING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </FormField>

              {(routingType === "round_robin" || routingType === "weighted") && (
                <FormField label="Users (comma-separated emails)">
                  <input value={users} onChange={(e) => setUsers(e.target.value)}
                    placeholder="alice@co.com, bob@co.com"
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
              )}
              {routingType === "specific_user" && (
                <FormField label="User (email)">
                  <input value={specificUser} onChange={(e) => setSpecificUser(e.target.value)}
                    placeholder="rep@co.com"
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
              )}
              {routingType === "territory" && (
                <FormField label="Territory id">
                  <input type="number" value={territoryId} onChange={(e) => setTerritoryId(e.target.value)}
                    placeholder="e.g. 3"
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button onClick={() => setShowModal(false)}
                className="text-sm px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={busy} onClick={save}
                className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white hover:bg-[#d85a25] disabled:opacity-50">
                {busy ? "Saving…" : "Create"}
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

export default SparkRoutingRulesPage;

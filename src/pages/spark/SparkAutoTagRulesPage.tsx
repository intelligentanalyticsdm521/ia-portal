// SparkAutoTagRulesPage — Auto-tag rules applied to incoming leads
//
// When a new lead is created, rules in this list run in `sort_order` and any
// matching rule appends its tags to the lead. Conditions can match on score
// range, industry, geo, or computed temperature ("hot"/"warm"/"cold").
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, X, Tag } from "lucide-react";

interface AutoTagCondition {
  min_score?: number;
  max_score?: number;
  industry?: string[];
  country?: string[];
  state?: string[];
  city?: string[];
  temperature?: string[];
}

interface AutoTagRow {
  id: number;
  name: string;
  condition_json: string | null;
  tags_json: string | null;
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

function summarize(c: AutoTagCondition): string {
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

function csv(s: string): string[] {
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

export function SparkAutoTagRulesPage() {
  const { get, post, del, ready } = useSparkApi();
  const [rows, setRows] = useState<AutoTagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);

  // form
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("100");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [temperature, setTemperature] = useState("");
  const [tags, setTags] = useState("");

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: AutoTagRow[] }>("/api/v1/lead-autotag-rules");
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
    setMinScore(""); setMaxScore("");
    setIndustry(""); setCountry(""); setState(""); setCity("");
    setTemperature(""); setTags("");
  }

  async function save() {
    if (!name.trim()) {
      alert("Name is required.");
      return;
    }
    const tagsList = csv(tags);
    if (!tagsList.length) {
      alert("At least one tag is required.");
      return;
    }
    setBusy(true);
    try {
      const condition: AutoTagCondition = {};
      if (minScore.trim()) condition.min_score = Number(minScore);
      if (maxScore.trim()) condition.max_score = Number(maxScore);
      if (industry.trim()) condition.industry = csv(industry);
      if (country.trim())  condition.country  = csv(country);
      if (state.trim())    condition.state    = csv(state);
      if (city.trim())     condition.city     = csv(city);
      if (temperature.trim()) condition.temperature = csv(temperature);
      await post("/api/v1/lead-autotag-rules", {
        name: name.trim(),
        condition,
        tags: tagsList,
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
    if (!confirm("Delete this auto-tag rule? Existing tags on leads will not be removed.")) return;
    try {
      await del(`/api/v1/lead-autotag-rules/${id}`);
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
      title="Auto-tag rules"
      subtitle={`${rows.length} rule${rows.length === 1 ? "" : "s"}`}
      help="Rules that automatically append tags to new leads. Rules run in sort_order (lowest first) and all matching rules apply. Use to bucket leads (e.g. tag 'enterprise' if score ≥ 80) without writing automation flows."
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
              <th>Conditions</th>
              <th>Tags</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-sm text-slate-500 py-8">
                  <Tag className="h-5 w-5 mx-auto text-slate-300 mb-1" />
                  No auto-tag rules yet.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const cond = parseJson<AutoTagCondition>(row.condition_json, {});
              const tagsArr = parseJson<string[]>(row.tags_json, []);
              return (
                <tr key={row.id}>
                  <td className="text-xs text-slate-500">{row.sort_order}</td>
                  <td className="font-medium text-slate-900">{row.name}</td>
                  <td className="text-xs text-slate-600">{summarize(cond)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {tagsArr.length === 0 && <span className="text-xs text-slate-400">—</span>}
                      {tagsArr.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded text-[11px] border border-[#EF6C33]/30 bg-[#FFF6F0] text-[#0B1C24]">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
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
              <div className="text-base font-semibold text-slate-900 mt-0.5">Auto-tag rule</div>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <FormField label="Name">
                    <input value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="Hot enterprise lead"
                      className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                  </FormField>
                </div>
                <FormField label="Sort order">
                  <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Min score">
                  <input type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)}
                    placeholder="e.g. 80"
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
                <FormField label="Max score">
                  <input type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)}
                    placeholder="e.g. 100"
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
                    placeholder="US, CA"
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
                <FormField label="State">
                  <input value={state} onChange={(e) => setState(e.target.value)}
                    placeholder="TX, NY"
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
                <FormField label="City">
                  <input value={city} onChange={(e) => setCity(e.target.value)}
                    placeholder="Dallas"
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
              </div>
              <FormField label="Temperature (comma-separated: hot, warm, cold)">
                <input value={temperature} onChange={(e) => setTemperature(e.target.value)}
                  placeholder="hot, warm"
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </FormField>
              <FormField label="Tags to apply (comma-separated)">
                <input value={tags} onChange={(e) => setTags(e.target.value)}
                  placeholder="enterprise, hot-lead"
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

export default SparkAutoTagRulesPage;

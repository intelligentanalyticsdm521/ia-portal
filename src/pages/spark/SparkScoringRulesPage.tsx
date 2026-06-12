// @deprecated 2026-06-12 - orphan after refactor. Superseded by Rules consolidation (2026-05-28): merged into SparkRulesPage. Confirm with founder before deletion (task #174).
// SparkScoringRulesPage — Lead scoring rules
//
// Each rule fires when its trigger event happens (or its condition matches)
// and applies its `points` to the lead's running score. Negative points pull
// the score down. `decay_days` decays the awarded points back to zero linearly
// over that many days.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, X, Zap } from "lucide-react";

type Trigger = "email.opened" | "email.clicked" | "form.submitted" | "page.visited" | "field.value";

const TRIGGERS: Trigger[] = [
  "email.opened",
  "email.clicked",
  "form.submitted",
  "page.visited",
  "field.value",
];

interface ScoringRow {
  id: number;
  name: string;
  description: string | null;
  event_trigger: Trigger;
  condition_json: string | null;
  points: number;
  decay_days: number | null;
  is_active: boolean;
  sort_order: number;
}

const TRIGGER_STYLE: Record<Trigger, string> = {
  "email.opened":    "bg-blue-50 text-blue-700 border-blue-200",
  "email.clicked":   "bg-indigo-50 text-indigo-700 border-indigo-200",
  "form.submitted":  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "page.visited":    "bg-slate-100 text-slate-700 border-slate-200",
  "field.value":     "bg-amber-50 text-amber-700 border-amber-200",
};

export function SparkScoringRulesPage() {
  const { get, post, del, ready } = useSparkApi();
  const [rows, setRows] = useState<ScoringRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);

  // form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<Trigger>("email.opened");
  const [points, setPoints] = useState("5");
  const [decayDays, setDecayDays] = useState("");
  const [sortOrder, setSortOrder] = useState("100");
  const [conditionJson, setConditionJson] = useState("");

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: ScoringRow[] }>("/api/v1/scoring-rules");
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
    setTrigger("email.opened");
    setPoints("5"); setDecayDays("");
    setSortOrder("100"); setConditionJson("");
  }

  async function save() {
    if (!name.trim()) {
      alert("Name is required.");
      return;
    }
    const pts = Number(points);
    if (!Number.isFinite(pts)) {
      alert("Points must be a number.");
      return;
    }
    let condition: unknown = undefined;
    if (conditionJson.trim()) {
      try {
        condition = JSON.parse(conditionJson);
      } catch {
        alert("Condition JSON is not valid JSON.");
        return;
      }
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        event_trigger: trigger,
        points: pts,
        sort_order: Number(sortOrder) || 100,
      };
      if (decayDays.trim()) body.decay_days = Number(decayDays);
      if (condition !== undefined) body.condition = condition;
      await post("/api/v1/scoring-rules", body);
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
    if (!confirm("Delete this scoring rule? Historic points already awarded to leads will stay.")) return;
    try {
      await del(`/api/v1/scoring-rules/${id}`);
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
      title="Scoring rules"
      subtitle={`${rows.length} rule${rows.length === 1 ? "" : "s"}`}
      help="Award (or deduct) points when a lead does something or matches a field condition. The cumulative score drives temperature (hot/warm/cold) and can feed routing. Decay days slowly returns awarded points to zero — useful for engagement-based scoring."
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
              <th>Trigger</th>
              <th>Points</th>
              <th>Decay</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-sm text-slate-500 py-8">
                  <Zap className="h-5 w-5 mx-auto text-slate-300 mb-1" />
                  No scoring rules yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="text-xs text-slate-500">{row.sort_order}</td>
                <td>
                  <div className="font-medium text-slate-900">{row.name}</div>
                  {row.description && <div className="text-xs text-slate-500 mt-0.5">{row.description}</div>}
                </td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-[11px] border font-mono ${TRIGGER_STYLE[row.event_trigger] || "bg-slate-50 text-slate-700 border-slate-200"}`}>
                    {row.event_trigger}
                  </span>
                </td>
                <td>
                  <span className={`font-semibold text-sm ${row.points > 0 ? "text-emerald-700" : row.points < 0 ? "text-rose-700" : "text-slate-700"}`}>
                    {row.points > 0 ? "+" : ""}{row.points}
                  </span>
                </td>
                <td className="text-xs text-slate-500">{row.decay_days ? `${row.decay_days}d` : "—"}</td>
                <td>
                  <span className={`text-[11px] px-2 py-0.5 rounded border ${row.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                    {row.is_active ? "Active" : "Off"}
                  </span>
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
            ))}
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
              <div className="text-base font-semibold text-slate-900 mt-0.5">Scoring rule</div>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm max-h-[70vh] overflow-y-auto">
              <FormField label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Opened a pricing email"
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </FormField>
              <FormField label="Description (optional)">
                <input value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Awards points when a lead opens any pricing-tagged email"
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </FormField>
              <FormField label="Event trigger">
                <select value={trigger} onChange={(e) => setTrigger(e.target.value as Trigger)}
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33] bg-white">
                  {TRIGGERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </FormField>
              <div className="grid grid-cols-3 gap-2">
                <FormField label="Points">
                  <input type="number" value={points} onChange={(e) => setPoints(e.target.value)}
                    placeholder="5 or -5"
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
                <FormField label="Decay (days)">
                  <input type="number" value={decayDays} onChange={(e) => setDecayDays(e.target.value)}
                    placeholder="optional"
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
                <FormField label="Sort order">
                  <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
                </FormField>
              </div>
              <FormField label="Condition JSON (optional)">
                <textarea value={conditionJson} onChange={(e) => setConditionJson(e.target.value)}
                  rows={5}
                  placeholder='{"tag": "pricing"}'
                  className="w-full text-xs font-mono border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
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

export default SparkScoringRulesPage;

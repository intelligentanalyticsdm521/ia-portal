// SparkStellaPage — STELLA Send Intelligence
//
// Heatmap of historical send + open data with a best-time-to-send
// recommendation per tenant. Per-contact override below.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Sparkles, Clock, Search } from "lucide-react";

interface HeatRow { dow: number; hour: number; sends: number; opens: number; rate: number; }
interface Recommendation { dow: number; hour: number; rate: number; sends: number; opens: number; label: string; }

const DOW_LABELS = ["", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // dow 1..7
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function SparkStellaPage() {
  const { get, ready } = useSparkApi();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<{ heatmap: HeatRow[]; recommendation: Recommendation | null; sample_size: number; note?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [contactId, setContactId] = useState("");
  const [perContact, setPerContact] = useState<{ best_hour: number; label: string; opens_at_this_hour: number } | null>(null);

  const fetchData = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ heatmap: HeatRow[]; recommendation: Recommendation | null; sample_size: number; note?: string | null }>(`/api/v1/stella/best-time?days=${days}`);
      setData(r);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready, days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function lookupContact() {
    const cid = parseInt(contactId);
    if (!cid) return;
    try {
      const r = await get<{ data: { best_hour: number; label: string; opens_at_this_hour: number } | null }>(`/api/v1/stella/per-contact/${cid}`);
      setPerContact(r?.data || null);
    } catch (err) {
      alert(`Lookup failed: ${(err as Error).message}`);
    }
  }

  // Map heatmap to a 7x24 grid for rendering
  const grid = useMemo(() => {
    if (!data) return null;
    const g: Record<number, Record<number, HeatRow>> = {};
    for (let d = 1; d <= 7; d++) { g[d] = {}; for (const h of HOURS) g[d][h] = { dow: d, hour: h, sends: 0, opens: 0, rate: 0 }; }
    for (const row of data.heatmap) {
      if (g[row.dow]) g[row.dow][row.hour] = row;
    }
    return g;
  }, [data]);

  const maxRate = useMemo(() => Math.max(0, ...(data?.heatmap || []).filter(r => r.sends >= 20).map(r => r.rate)), [data]);

  return (
    <SparkPageShell
      title="STELLA Send Intelligence"
      subtitle={data ? `${data.sample_size.toLocaleString()} sends in the last ${days} days` : "Loading…"}
      help="STELLA analyzes your historical send + open data to find the best time to send emails. Cells with fewer than 20 sends are de-emphasized. A personalized recommendation per contact is also available below."
      filters={
        <div className="flex items-center gap-2">
          {[30, 60, 90, 180, 365].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`text-xs px-3 py-1 rounded-full border ${days === d ? "bg-[#0B1C24] text-white border-[#0B1C24]" : "border-slate-200"}`}>
              {d}d
            </button>
          ))}
        </div>
      }
      loading={loading}
      error={error}
    >
      {/* Recommendation */}
      <div className="spark-mini-card mb-4">
        <div className="spark-mini-card-header">
          <span className="spark-mini-card-title flex items-center gap-1"><Sparkles className="h-4 w-4 text-purple-600" /> STELLA's recommendation</span>
        </div>
        <div className="p-4">
          {data?.recommendation ? (
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-slate-900">{data.recommendation.label.split("(")[0].trim()}</div>
              <div className="text-sm text-slate-600 mt-1">{data.recommendation.rate ?? 0}% open rate based on {(data.recommendation.sends ?? 0).toLocaleString()} sends in this window</div>
            </div>
          ) : (
            <div className="text-sm text-slate-500 italic">Not enough data yet to make a confident recommendation. {data?.note || "Send at least 20 emails in a single hour-of-week slot."}</div>
          )}
        </div>
      </div>

      {/* Heatmap */}
      <div className="spark-mini-card">
        <div className="spark-mini-card-header">
          <span className="spark-mini-card-title">Open rate heatmap (day × hour)</span>
          <span className="text-xs text-slate-500">Darker = higher engagement</span>
        </div>
        <div className="p-3 overflow-x-auto">
          <table className="text-[10px]">
            <thead>
              <tr>
                <th className="w-10"></th>
                {HOURS.map(h => <th key={h} className="w-7 text-center font-normal text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 7].map(d => (
                <tr key={d}>
                  <td className="font-semibold text-slate-600 pr-1">{DOW_LABELS[d]}</td>
                  {HOURS.map(h => {
                    const cell = grid?.[d]?.[h];
                    const lowSample = !cell || cell.sends < 20;
                    const intensity = maxRate > 0 && cell ? cell.rate / maxRate : 0;
                    const bg = lowSample
                      ? "rgb(248, 250, 252)"  // slate-50
                      : `rgba(239, 108, 51, ${0.15 + intensity * 0.75})`;
                    return (
                      <td key={h} title={cell ? `${DOW_LABELS[d]} ${h}:00 — ${cell.sends} sends, ${cell.opens} opens, ${cell.rate}% rate` : ""}
                        className="w-7 h-6 border border-white"
                        style={{ background: bg }}>
                        {!lowSample && cell.rate >= maxRate * 0.85 ? <div className="text-[8px] text-center font-bold text-slate-700">{Math.round(cell.rate)}</div> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-contact lookup */}
      <div className="spark-mini-card mt-4">
        <div className="spark-mini-card-header">
          <span className="spark-mini-card-title flex items-center gap-1"><Clock className="h-4 w-4" /> Per-contact best hour</span>
        </div>
        <div className="p-3 space-y-2">
          <div className="flex gap-2">
            <input value={contactId} onChange={(e) => setContactId(e.target.value)} placeholder="Contact ID"
              className="text-sm border border-slate-300 rounded px-2 py-1 w-40" />
            <button onClick={lookupContact} disabled={!contactId.trim()}
              className="text-sm px-3 py-1.5 rounded bg-[#0B1C24] text-white flex items-center gap-1 disabled:opacity-50">
              <Search className="h-3 w-3" /> Lookup
            </button>
          </div>
          {perContact && (
            <div className="border border-slate-200 rounded p-2 text-sm">
              <span className="font-semibold">{perContact.label}</span> — best hour for this contact ({perContact.opens_at_this_hour} opens at this hour)
            </div>
          )}
          {perContact === null && contactId && !loading && (
            <div className="text-xs text-slate-500 italic">No open history yet for that contact.</div>
          )}
        </div>
      </div>
    </SparkPageShell>
  );
}

export default SparkStellaPage;

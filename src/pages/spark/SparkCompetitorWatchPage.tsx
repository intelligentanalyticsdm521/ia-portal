// SparkCompetitorWatchPage — Track competitor domains
//
// Watched competitor domains get periodically crawled for pricing changes,
// hero copy changes, and new blog posts. Findings appear in the row's
// last_findings_json and on the Insights page.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, X, Eye } from "lucide-react";

interface CompetitorRow {
  id: number;
  domain: string;
  name: string | null;
  notes: string | null;
  last_checked_at: string | null;
  last_findings_json: string | null;
  is_active: boolean;
}

function fmtTime(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

function findingCount(json: string | null): number {
  if (!json) return 0;
  try {
    const v = JSON.parse(json);
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === "object" && Array.isArray((v as { findings?: unknown[] }).findings)) {
      return (v as { findings: unknown[] }).findings.length;
    }
    if (v && typeof v === "object") return Object.keys(v).length;
    return 0;
  } catch {
    return 0;
  }
}

export function SparkCompetitorWatchPage() {
  const { get, post, del, ready } = useSparkApi();
  const [rows, setRows] = useState<CompetitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);

  // form
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: CompetitorRow[] }>("/api/v1/competitor-watch");
      setRows(r?.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { fetchList(); }, [fetchList]);

  function resetForm() {
    setDomain(""); setName(""); setNotes("");
  }

  async function save() {
    if (!domain.trim()) {
      alert("Domain is required.");
      return;
    }
    setBusy(true);
    try {
      await post("/api/v1/competitor-watch", {
        domain: domain.trim(),
        name: name.trim() || null,
        notes: notes.trim() || null,
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
    if (!confirm("Stop watching this competitor? Past findings will be retained.")) return;
    try {
      await del(`/api/v1/competitor-watch/${id}`);
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
      <Plus className="h-4 w-4" /> Watch domain
    </button>
  );

  return (
    <SparkPageShell
      title="Competitor watch"
      subtitle={`${rows.length} domain${rows.length === 1 ? "" : "s"}`}
      help="Add competitor domains to monitor for pricing changes, hero copy changes, and new content. Findings update on the daily competitor crawl and surface in the Insights feed when something changes."
      actions={actions}
      loading={loading}
      error={error}
    >
      <div className="overflow-x-auto">
        <table className="spark-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Name</th>
              <th>Last checked</th>
              <th>Findings</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-sm text-slate-500 py-8">
                  <Eye className="h-5 w-5 mx-auto text-slate-300 mb-1" />
                  No competitor domains watched yet.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const count = findingCount(row.last_findings_json);
              return (
                <tr key={row.id}>
                  <td className="font-medium text-slate-900">{row.domain}</td>
                  <td className="text-sm text-slate-700">
                    {row.name || "—"}
                    {row.notes && <div className="text-xs text-slate-500 mt-0.5">{row.notes}</div>}
                  </td>
                  <td className="text-xs text-slate-500">{fmtTime(row.last_checked_at)}</td>
                  <td>
                    {count > 0 ? (
                      <span className="px-2 py-0.5 rounded text-[11px] border border-[#EF6C33]/30 bg-[#FFF6F0] text-[#0B1C24]">
                        {count} finding{count === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => remove(row.id)}
                      className="text-rose-600 hover:bg-rose-50 rounded p-1"
                      title="Stop watching"
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
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200">
              <div className="text-xs uppercase font-bold text-slate-500">New</div>
              <div className="text-base font-semibold text-slate-900 mt-0.5">Watch competitor domain</div>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm">
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">Domain</label>
                <input value={domain} onChange={(e) => setDomain(e.target.value)}
                  placeholder="competitor.com"
                  className="mt-1 w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">Display name</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Corp"
                  className="mt-1 w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Their enterprise tier looks similar to ours; watch for pricing moves."
                  className="mt-1 w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button onClick={() => setShowModal(false)}
                className="text-sm px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={busy} onClick={save}
                className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white hover:bg-[#d85a25] disabled:opacity-50">
                {busy ? "Saving…" : "Watch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

export default SparkCompetitorWatchPage;

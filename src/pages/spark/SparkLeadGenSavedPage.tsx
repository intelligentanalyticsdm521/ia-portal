// SparkLeadGenSavedPage — F-150/F-163 Lead Gen V1 saved searches list.
//
// Lists every lumen.search_profile row for this tenant. "Run again" re-submits
// the saved profile as a new /leadgen/jobs run and navigates to the progress
// page. "Edit" deep-links to the New Search form with the profile pre-loaded
// (V1.1; for V1 it just navigates and the user re-enters — TODO below).
//
// Reference: C:\dev\claude code\overnight-report\30_LEADGEN_V1_SPEC.md
//
// NOTE: a different page named SparkSavedSearchesPage already exists at
// `spark_saved_searches` — that one is the cross-entity reusable filter
// library (contacts/deals/leads/campaigns). This page is specifically for
// Lead Gen search profiles. Keep them separate.
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Play, Trash2, Search, Plus, MapPin, Tag, Clock } from "lucide-react";

interface SearchProfile {
  id: string;
  name: string;
  customer_category_id?: number | null;
  customer_category_name?: string | null;
  search_mode?: string;
  state?: string;
  cities?: Array<{ id: number; name: string; state?: string }>;
  city_count?: number;
  term_count?: number;
  max_leads?: number;
  include_cold_leads?: boolean;
  last_run_at: string | null;
  last_run_lead_count: number | null;
  created_at: string;
}

export function SparkLeadGenSavedPage() {
  const { get, post, del, ready } = useSparkApi();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      // GET /api/v1/leadgen/profiles → { data: SearchProfile[] }
      const r = await get<{ data: SearchProfile[] }>("/api/v1/leadgen/profiles");
      setProfiles(r?.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  async function runAgain(p: SearchProfile) {
    setRunning(p.id);
    try {
      // POST /api/v1/leadgen/profiles/:id/run → { data: { job_id } }
      type RunResp = { data?: { job_id?: string | number } };
      const r = await post<RunResp>(`/api/v1/leadgen/profiles/${p.id}/run`, {});
      const jobId = r?.data?.job_id;
      if (jobId != null) {
        navigate(`/app/spark/leadgen/jobs/${jobId}`);
      } else {
        setError(new Error("Backend returned no job_id."));
      }
    } catch (err) {
      setError(err);
    } finally {
      setRunning(null);
    }
  }

  async function remove(p: SearchProfile) {
    if (!confirm(`Delete saved search "${p.name}"? This cannot be undone.`)) return;
    try {
      // DELETE /api/v1/leadgen/profiles/:id
      await del(`/api/v1/leadgen/profiles/${p.id}`);
      await load();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <SparkPageShell
      title="Saved Lead Searches"
      subtitle={`${profiles.length} saved`}
      help="Re-run any saved search with one click — no need to reconfigure each time. Saved searches keep your category, terms, location, radius, and search mode."
      error={error}
      loading={loading}
      actions={
        <Link
          to="/app/spark/leadgen/b2b_new"
          className="text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white hover:bg-[#D85F2A] flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" /> New search
        </Link>
      }
    >
      {profiles.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
          <Search className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <div className="text-sm font-medium text-slate-700">No saved searches yet</div>
          <div className="text-xs text-slate-500 mt-1">Create a search in <Link to="/app/spark/leadgen/b2b_new" className="text-[#EF6C33] hover:underline">New Search</Link> and click "Save this search" to add it here.</div>
          <Link
            to="/app/spark/leadgen/b2b_new"
            className="mt-4 inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white"
          >
            <Plus className="h-3.5 w-3.5" /> New search
          </Link>
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Location</th>
                <th className="px-4 py-2">Mode</th>
                <th className="px-4 py-2 text-right">Last run</th>
                <th className="px-4 py-2 text-right">Last result</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profiles.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 align-top">
                    <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Created {new Date(p.created_at).toLocaleDateString()}</div>
                  </td>
                  <td className="px-4 py-2.5 align-top text-xs text-slate-700">
                    {p.customer_category_name || <span className="text-slate-300 italic">—</span>}
                    {typeof p.term_count === "number" && p.term_count > 0 && (
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Tag className="h-2.5 w-2.5" /> {p.term_count} extra term{p.term_count === 1 ? "" : "s"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 align-top text-xs text-slate-700">
                    {p.state ? (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-slate-400" />
                        {p.state}
                        {typeof p.city_count === "number" && p.city_count > 0 && (
                          <span className="text-[10px] text-slate-400">· {p.city_count} cit{p.city_count === 1 ? "y" : "ies"}</span>
                        )}
                      </div>
                    ) : <span className="text-slate-300 italic">—</span>}
                    {p.include_cold_leads && (
                      <div className="text-[9px] text-blue-700 bg-blue-50 inline-block px-1.5 py-0.5 rounded mt-1">incl. cold</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    {p.search_mode ? (
                      <span className="text-[10px] uppercase tracking-wide bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                        {p.search_mode}
                      </span>
                    ) : <span className="text-slate-300 italic text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5 align-top text-right text-xs text-slate-500">
                    {p.last_run_at ? (
                      <div className="flex items-center justify-end gap-1">
                        <Clock className="h-3 w-3 text-slate-300" />
                        {new Date(p.last_run_at).toLocaleDateString()}
                      </div>
                    ) : <span className="text-slate-300 italic">Never</span>}
                  </td>
                  <td className="px-4 py-2.5 align-top text-right text-xs">
                    {typeof p.last_run_lead_count === "number" ? (
                      <span className="font-semibold text-slate-900 tabular-nums">{p.last_run_lead_count}</span>
                    ) : <span className="text-slate-300 italic">—</span>}
                    {p.max_leads && (
                      <span className="text-[10px] text-slate-400"> / {p.max_leads}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 align-top text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => runAgain(p)}
                        disabled={running === p.id}
                        className="text-[11px] px-2 py-1 rounded bg-[#EF6C33] text-white hover:bg-[#D85F2A] disabled:opacity-50 flex items-center gap-1"
                      >
                        <Play className="h-3 w-3" /> {running === p.id ? "Running…" : "Run again"}
                      </button>
                      <button
                        onClick={() => remove(p)}
                        className="text-[11px] px-1.5 py-1 rounded border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SparkPageShell>
  );
}

export default SparkLeadGenSavedPage;

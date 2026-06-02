// ConsultingDeliverablesPage — F-140 redesign.
//
// Unified artifact library for the consulting hub. Pulls client-visible
// artifacts from EVERY active project and presents them in a filterable
// grid. Tags by Build Your Series (engagement_type from parent project)
// for the user-requested categorization.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface Deliverable {
  artifact_id: string;
  project_id: string;
  project_number: string;
  project_title: string;
  project_engagement_type?: string | null;
  project_type_display: string;
  client_business_name?: string | null;
  kind: string;
  title: string;
  description?: string;
  file_url?: string;
  external_link?: string;
  status: string;
  is_client_visible: boolean;
  uploaded_by_kind: string;
  uploaded_by_name?: string;
  created_at: string;
}

const ENGAGEMENT_COLORS: Record<string, string> = {
  build_your_brand: "#EF6C33",
  build_your_foundation: "#3B82F6",
  build_your_clarity: "#8B5CF6",
  build_your_engine: "#10B981",
};

const KIND_ICON: Record<string, string> = {
  proposal: "📄", design: "🎨", contract: "📝", brief: "📋",
  spec: "📐", code: "💻", copy: "✍️", other: "📎",
};

export function ConsultingDeliverablesPage() {
  const { get, ready } = useOliverApi();
  const [items, setItems] = useState<Deliverable[]>([]);
  const [kindFilter, setKindFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: { projects: any[] } }>("/consulting-projects?include_archived=1");
      const projects = r.data?.projects || [];
      const all: Deliverable[] = [];
      for (const p of projects) {
        try {
          const pd = await get<{ data: any }>(`/consulting-projects/${p.project_id}`);
          for (const a of (pd.data?.artifacts || [])) {
            all.push({
              ...a,
              project_id: p.project_id,
              project_number: p.project_number,
              project_title: p.title,
              project_engagement_type: p.engagement_type,
              project_type_display: p.project_type_display,
              client_business_name: p.client_business_name,
            });
          }
        } catch { /* skip projects we can't load */ }
      }
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setItems(all);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => items.filter(i => {
    if (kindFilter && i.kind !== kindFilter) return false;
    if (tagFilter && i.project_engagement_type !== tagFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!i.title.toLowerCase().includes(s) &&
          !(i.project_title || "").toLowerCase().includes(s) &&
          !(i.client_business_name || "").toLowerCase().includes(s)) return false;
    }
    return true;
  }), [items, kindFilter, tagFilter, search]);

  const kinds = useMemo(() => Array.from(new Set(items.map(i => i.kind))), [items]);
  const tags = useMemo(() => Array.from(new Set(items.map(i => i.project_engagement_type).filter(Boolean) as string[])), [items]);

  return (
    <OliverPageWrapper title="Deliverables" subtitle="IA Consulting · Unified artifact library" error={error} loading={loading}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-48" />
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All types</option>
            {kinds.map(k => <option key={k} value={k}>{KIND_ICON[k] || ""} {k}</option>)}
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All engagements</option>
            {tags.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
          <span className="ml-auto text-xs text-slate-500">{filtered.length} of {items.length} deliverable{items.length === 1 ? "" : "s"}</span>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-6 py-12 text-center text-sm text-slate-500">
            {items.length === 0 ? "No deliverables yet — upload them from inside a project." : "No matches for current filters."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(d => {
              const tagColor = d.project_engagement_type ? ENGAGEMENT_COLORS[d.project_engagement_type] : "#94a3b8";
              return (
                <div key={d.artifact_id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{KIND_ICON[d.kind] || "📎"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs uppercase font-bold text-slate-500">{d.kind}</div>
                      <div className="text-sm font-semibold text-slate-900 truncate">{d.title}</div>
                    </div>
                  </div>
                  {d.description && <div className="text-xs text-slate-600 mb-2 line-clamp-2">{d.description}</div>}
                  <div className="flex flex-wrap items-center gap-1 mb-2">
                    {d.project_engagement_type && (
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white" style={{ background: tagColor }}>
                        {d.project_engagement_type.replace(/_/g, " ").replace("build your ", "")}
                      </span>
                    )}
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{d.project_type_display}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mb-2">
                    {d.client_business_name && <>📁 {d.client_business_name} · </>}
                    <a href={`/app/services/consulting_projects?open=${d.project_id}`} className="text-blue-600 hover:underline">
                      {d.project_number}
                    </a>
                  </div>
                  {(d.file_url || d.external_link) && (
                    <a href={d.file_url || d.external_link} target="_blank" rel="noreferrer"
                      className="text-xs font-semibold text-blue-600 hover:underline">
                      Open ↗
                    </a>
                  )}
                  <div className="mt-2 text-[10px] text-slate-400">
                    {new Date(d.created_at).toLocaleDateString()} · by {d.uploaded_by_kind}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}

export default ConsultingDeliverablesPage;

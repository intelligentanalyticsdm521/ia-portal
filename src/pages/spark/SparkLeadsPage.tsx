// SparkLeadsPage — B2B Lead Inbox (F-LG.2 + F-LG.5 + F-LG.7 + F-LG.8 + F-LG.10)
//
// Live page replacing the F-124 "Coming Soon" pause. Lists leads from the
// existing /api/v1/leads endpoint with filter chips (All / Hot / Warm /
// Cold + lifecycle), pagination, and per-row actions: Suppress domain,
// Promote to contact, Dismiss. Per Brandon's locked rules:
//   • Score badge on every row (hover = top 3+/2-; click = detail drawer)
//   • Promote sends lead → lumen.contact at lifecycle_stage='lead' (SPARK
//     workflow engine moves it forward)
//   • Suppress writes the domain to lumen.suppression_list — never seen
//     again by this tenant
//   • Same-contact-diff-business review_flag surfaces as an amber pill
//
// Bulk actions land in F-LG.2.4 (next pass). Detail drawer in F-LG.2.6.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, MoreVertical, Search, X, CheckCircle2 } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";

interface RecentRun {
  run_id: number;
  target_count: number | null;
  leads_found: number | null;
  cache_hits: number | null;
  status: string;
  completed_at: string | null;
  summary: null | {
    delivered: number;
    flagged_review: number;
    from_cache: number;
    skipped: { no_email: number; already_in_inbox: number; insert_failed: number };
    target_count: number;
    raw_qualified: number;
  };
}

type Tier = "hot" | "warm" | "cold";

interface Lead {
  id: number;
  tenant_id: string;
  domain: string;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  composite_score: number | null;
  hot_warm_cold: Tier | null;
  score_contact_accessibility: number | null;
  score_business_health: number | null;
  score_findability: number | null;
  score_enrichment_depth: number | null;
  status: string | null;
  source: string | null;
  sources_found: string | null;
  lifecycle_stage: string | null;
  review_flag: string | null;
  is_from_cache: boolean | null;
  cache_age_days: number | null;
  contact_id: number | null;
  created_at: string;
}

interface LeadListResponse {
  data: Lead[];
  meta: { total: number; page: number; per_page: number; total_pages: number };
}

const TIER_BADGE: Record<Tier, string> = {
  hot: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
  warm: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  cold: "bg-sky-100 text-sky-700 ring-1 ring-sky-200",
};

export function SparkLeadsPage() {
  const { get, post, ready } = useSparkApi();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [meta, setMeta] = useState<LeadListResponse["meta"] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [tierFilter, setTierFilter] = useState<"all" | Tier>("all");
  const [search, setSearch] = useState("");
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // F-LG.10: Run Summary honesty pane — banner shown after the most recent
  // completed sweep. Auto-dismisses after the user closes it; we remember
  // dismissed run_ids in sessionStorage so it doesn't haunt them across
  // page navigations within the same session.
  const [recentRun, setRecentRun] = useState<RecentRun | null>(null);
  const [dismissedRunIds, setDismissedRunIds] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("leadgen_dismissed_runs") || "[]")); }
    catch { return new Set(); }
  });

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("page", String(page));
      qs.set("limit", "50");
      if (tierFilter !== "all") qs.set("temperature", tierFilter);
      const r = await get<LeadListResponse>(`/api/v1/leads?${qs.toString()}`);
      setLeads(r.data || []);
      setMeta(r.meta || null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready, page, tierFilter]);

  useEffect(() => { load(); }, [load]);

  // F-LG.10: fetch the most recent completed run to render the summary banner
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    get<{ data: RecentRun | null }>("/api/v1/leadgen/runs/recent")
      .then((r) => {
        if (cancelled) return;
        const d = (r as { data?: RecentRun | null })?.data || null;
        setRecentRun(d);
      })
      .catch(() => { if (!cancelled) setRecentRun(null); });
    return () => { cancelled = true; };
  }, [get, ready]);

  const dismissRecentRun = (runId: number) => {
    const next = new Set(dismissedRunIds);
    next.add(runId);
    setDismissedRunIds(next);
    try { sessionStorage.setItem("leadgen_dismissed_runs", JSON.stringify([...next])); } catch { /* ignore */ }
  };

  const filteredLeads = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter((l) =>
      (l.business_name || "").toLowerCase().includes(q) ||
      (l.domain || "").toLowerCase().includes(q) ||
      (l.email || "").toLowerCase().includes(q)
    );
  }, [leads, search]);

  const onSuppress = async (lead: Lead) => {
    if (!confirm(`Suppress ${lead.domain}? Future searches will skip this domain.`)) return;
    setBusyId(lead.id);
    setActionMenuOpen(null);
    try {
      await post(`/api/v1/leads/${lead.id}/suppress`, { scope: "domain", reason: "Suppressed from Lead Inbox" });
      setLeads((rows) => rows.filter((r) => r.id !== lead.id));
    } catch (err) {
      alert(`Suppress failed: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  const onPromote = async (lead: Lead) => {
    setBusyId(lead.id);
    setActionMenuOpen(null);
    try {
      const r = await post<{ data?: { contact_id?: number } }>(`/api/v1/leads/${lead.id}/promote`, {});
      const contactId = (r as { data?: { contact_id?: number } })?.data?.contact_id;
      setLeads((rows) => rows.map((row) => row.id === lead.id ? { ...row, contact_id: contactId ?? row.contact_id, status: "accepted" } : row));
    } catch (err) {
      alert(`Promote failed: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  const onDismiss = async (lead: Lead) => {
    setBusyId(lead.id);
    setActionMenuOpen(null);
    try {
      await post(`/api/v1/leads/${lead.id}/dismiss`, {});
      setLeads((rows) => rows.filter((r) => r.id !== lead.id));
    } catch (err) {
      alert(`Dismiss failed: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(() => {
    const c = { all: leads.length, hot: 0, warm: 0, cold: 0 };
    for (const l of leads) {
      if (l.hot_warm_cold === "hot") c.hot++;
      else if (l.hot_warm_cold === "warm") c.warm++;
      else if (l.hot_warm_cold === "cold") c.cold++;
    }
    return c;
  }, [leads]);

  return (
    <SparkPageShell title="Lead Inbox" subtitle="B2B leads — discovery, review, and CRM hand-off" error={error} loading={loading}>
      <div className="p-6 space-y-4">
        {/* F-LG.10: Run Summary honesty pane — shown after a sweep completes.
            Locked Brandon 2026-06-19: customer must see exactly what was
            delivered vs. skipped (already-in-inbox, no-email, blocklisted)
            so the inbox feels honest not black-box. */}
        {recentRun && recentRun.status === "completed" && !dismissedRunIds.has(recentRun.run_id) && (
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-emerald-900 text-sm">
                    Run #{recentRun.run_id} complete — {recentRun.summary?.delivered ?? recentRun.leads_found ?? 0} of {recentRun.summary?.target_count ?? recentRun.target_count ?? 0} delivered
                    {(recentRun.summary?.from_cache ?? 0) > 0 && (
                      <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">{recentRun.summary?.from_cache} cached</span>
                    )}
                    {(recentRun.summary?.flagged_review ?? 0) > 0 && (
                      <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900">{recentRun.summary?.flagged_review} flagged for review</span>
                    )}
                  </div>
                  {recentRun.summary && (recentRun.summary.skipped.already_in_inbox + recentRun.summary.skipped.no_email + recentRun.summary.skipped.insert_failed) > 0 && (
                    <div className="mt-1 text-xs text-emerald-800">
                      Skipped:
                      {recentRun.summary.skipped.already_in_inbox > 0 && (
                        <span className="ml-2">{recentRun.summary.skipped.already_in_inbox} already in your inbox</span>
                      )}
                      {recentRun.summary.skipped.no_email > 0 && (
                        <span className="ml-2">· {recentRun.summary.skipped.no_email} no email</span>
                      )}
                      {recentRun.summary.skipped.insert_failed > 0 && (
                        <span className="ml-2">· {recentRun.summary.skipped.insert_failed} other</span>
                      )}
                    </div>
                  )}
                  {(recentRun.summary?.delivered ?? 0) < (recentRun.summary?.target_count ?? 0) && (
                    <div className="mt-1 text-xs text-emerald-800">
                      Under-delivered — try expanding your search (broader radius, more terms, or Search Mode = Broad).
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => dismissRecentRun(recentRun.run_id)} className="text-emerald-700 hover:text-emerald-900 flex-shrink-0" title="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Filter chips + search + new run */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "hot", "warm", "cold"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTierFilter(t); setPage(1); }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${tierFilter === t ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                {t === "all" ? "All" : t[0].toUpperCase() + t.slice(1)}
                {t === "all" ? ` (${counts.all})` : t === "hot" ? ` (${counts.hot})` : t === "warm" ? ` (${counts.warm})` : ` (${counts.cold})`}
              </button>
            ))}
            <div className="relative ml-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search business, domain, email…"
                className="pl-8 pr-3 py-1.5 rounded-md border border-slate-300 text-sm bg-white w-64"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <a
            href="/app/services/spark_leadgen_new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#EF6C33] px-4 py-2 text-sm font-semibold text-white hover:bg-[#D85F2A]"
          >
            <Sparkles className="h-4 w-4" />
            New B2B Lead Run
          </a>
        </div>

        {/* Inbox table */}
        <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Lifecycle</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Found</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeads.map((l) => {
                const score = l.composite_score ?? 0;
                const tier = l.hot_warm_cold;
                const scoreTip =
                  `Score ${score}` +
                  (l.score_contact_accessibility != null ? ` · Contact ${l.score_contact_accessibility}` : "") +
                  (l.score_business_health != null ? ` · Health ${l.score_business_health}` : "") +
                  (l.score_findability != null ? ` · Findability ${l.score_findability}` : "") +
                  (l.score_enrichment_depth != null ? ` · Enrich ${l.score_enrichment_depth}` : "");
                return (
                  <tr key={l.id} className="hover:bg-slate-50 relative">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-semibold text-slate-900">{l.business_name || l.domain}</div>
                          <div className="text-[10px] text-slate-500">{l.domain}</div>
                        </div>
                        {l.review_flag === "same_contact_diff_business" && (
                          <span title="Same email matched at another business — review and decide: legit new business, update existing, or merge."
                                className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-800">
                            Review
                          </span>
                        )}
                        {l.is_from_cache && (
                          <span title={`From cache (${l.cache_age_days ?? "?"}d old) — reused from another tenant's earlier discovery, saving Hunter cost.`}
                                className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600">
                            Cached
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        title={scoreTip}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${tier ? TIER_BADGE[tier] : "bg-slate-100 text-slate-600"}`}
                      >
                        {score}
                        <span className="ml-1 opacity-70">{tier ? tier[0].toUpperCase() : "—"}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{l.email || <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{l.phone || <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{l.lifecycle_stage || "lead"}</td>
                    <td className="px-4 py-3 text-[10px] text-slate-500">{l.source || l.sources_found || "—"}</td>
                    <td className="px-4 py-3 text-[10px] text-slate-500 whitespace-nowrap">{new Date(l.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block">
                        <button
                          disabled={busyId === l.id}
                          onClick={() => setActionMenuOpen(actionMenuOpen === l.id ? null : l.id)}
                          className="rounded-md p-1.5 hover:bg-slate-200 disabled:opacity-50"
                          title="Actions"
                        >
                          <MoreVertical className="h-4 w-4 text-slate-500" />
                        </button>
                        {actionMenuOpen === l.id && (
                          <div className="absolute right-0 top-full mt-1 z-20 rounded-lg bg-white shadow-lg ring-1 ring-slate-200 py-1 w-44 text-left">
                            <button
                              onClick={() => onPromote(l)}
                              disabled={!!l.contact_id}
                              className="w-full px-3 py-1.5 text-xs text-left hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {l.contact_id ? "✓ Already a contact" : "Promote to contact"}
                            </button>
                            <button onClick={() => onSuppress(l)} className="w-full px-3 py-1.5 text-xs text-left hover:bg-rose-50 text-rose-700">
                              Suppress domain
                            </button>
                            <button onClick={() => onDismiss(l)} className="w-full px-3 py-1.5 text-xs text-left hover:bg-slate-50">
                              Dismiss
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">
                    {leads.length === 0
                      ? <>You haven't run a sweep yet. <a href="/app/services/spark_leadgen_new" className="text-[#EF6C33] font-semibold underline">Start a new B2B Lead Run →</a></>
                      : `No leads match "${search}".`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between text-xs text-slate-600">
            <div>Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, meta.total)} of {meta.total}</div>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded border border-slate-300 disabled:opacity-50"
              >Prev</button>
              <button
                disabled={page >= meta.total_pages}
                onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))}
                className="px-3 py-1 rounded border border-slate-300 disabled:opacity-50"
              >Next</button>
            </div>
          </div>
        )}
      </div>
    </SparkPageShell>
  );
}

export default SparkLeadsPage;

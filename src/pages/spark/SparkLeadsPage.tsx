// SparkLeadsPage — B2B Lead Inbox (F-LG.2 + F-LG.5 + F-LG.6.6 + F-LG.7 + F-LG.8 + F-LG.10)
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
// F-LG.6.6 Since-last-visit pill: top of page renders "🔔 X new leads
// since your last visit" when the API reports meta.since_last_visit_count
// > 0. Pill dismisses on click and ALSO auto-dismisses when the user
// clicks any lead row (clear engagement signal). Both paths fire
// POST /api/v1/leadgen/inbox/visit to reset the server-side timestamp so
// the next load returns 0 until new scheduled-run leads arrive.
//
// Bulk actions land in F-LG.2.4 (next pass). Detail drawer in F-LG.2.6.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, MoreVertical, Search, X, CheckCircle2, Bell, ShieldCheck, ShieldX, ShieldAlert, ArrowUpDown } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';

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
  // F-LG.15 adversarial verify (migration 043, batch 7 / commit d23ecfa).
  //   'promoted'                → both verifiers (SMTP + domain freshness) agreed legit
  //   'suppressed'              → at least one verifier refuted; lead was kept on the
  //                               record but suppressed from default views downstream
  //   'verification_unavailable'→ both verifiers errored (fail-closed); lead admitted
  //                               but flagged so the reviewer knows the gate didn't run
  //   null                      → not yet verified (legacy rows, or verify ran offline)
  // Canonical truth: migration 043_leadgen_adversarial_verify.sql:13.
  verification_status: "promoted" | "suppressed" | "verification_unavailable" | null;
  // JSON array of { verifier, refuted, reason, latency_ms, errored }.
  // We parse + show the failure reasons in the Verified column tooltip
  // when verification_status='suppressed'.
  verification_reasons_json: string | null;
  created_at: string;
}

// F-LG.15: parse verification_reasons_json once per row (cheap — typically
// 2 entries) and return the first non-empty refusal reason for the tooltip.
function firstRefusalReason(json: string | null | undefined): string | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return null;
    for (const entry of arr) {
      if (entry && entry.refuted && entry.reason) return String(entry.reason);
    }
    // Fall back to errored verifiers if no clean refusal reason exists.
    for (const entry of arr) {
      if (entry && entry.errored && entry.reason) return String(entry.reason);
    }
    return null;
  } catch {
    return null;
  }
}

interface LeadListResponse {
  data: Lead[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
    // F-LG.6.6 — count of new lumen.lead rows since the caller's
    // last_leads_inbox_visit_at. 0 when the user has no prior visit
    // record (first ever load) or when the column is null.
    since_last_visit_count?: number;
  };
}

const TIER_BADGE: Record<Tier, string> = {
  hot: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
  warm: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  cold: "bg-sky-100 text-sky-700 ring-1 ring-sky-200",
};

export function SparkLeadsPage() {
  // Reports covering THIS function (Brandon 2026-08-14). Above any early
  // return — a hook below one runs on some renders only.
  const insightsPayload = useProductInsightsPayload('spark');

  const { get, post, ready } = useSparkApi();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [meta, setMeta] = useState<LeadListResponse["meta"] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [tierFilter, setTierFilter] = useState<"all" | Tier>("all");
  // F-LG.15: verified filter chip. Synced to URL ?verified=all|true|false so
  // a link like /app/services/spark_leads?verified=false drops the user
  // straight onto failed-verify leads (handy for support drill-downs).
  const [verifiedFilter, setVerifiedFilter] = useState<"all" | "true" | "false">(() => {
    if (typeof window === "undefined") return "all";
    const v = new URLSearchParams(window.location.search).get("verified");
    return v === "true" || v === "false" ? v : "all";
  });
  // F-LG.15: sort. "default" = backend default (composite_score DESC). When
  // user clicks the Verified column header we flip to "verification" which
  // pushes verified rows to the top, then null, then suppressed.
  const [sortMode, setSortMode] = useState<"default" | "verification">("default");
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
  // F-LG.6.6: "X new leads since your last visit" pill state. The count comes
  // from the leads list response (meta.since_last_visit_count). Once the user
  // dismisses it OR clicks a lead row, we POST /leadgen/inbox/visit and zero
  // it locally so it doesn't re-flash until the next page load.
  const [sinceLastVisit, setSinceLastVisit] = useState<number>(0);
  const [visitPillDismissed, setVisitPillDismissed] = useState<boolean>(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("page", String(page));
      qs.set("limit", "50");
      if (tierFilter !== "all") qs.set("temperature", tierFilter);
      if (verifiedFilter !== "all") qs.set("verified", verifiedFilter);
      if (sortMode === "verification") qs.set("sort", "verification");
      const r = await get<LeadListResponse>(`/api/v1/leads?${qs.toString()}`);
      setLeads(r.data || []);
      setMeta(r.meta || null);
      // F-LG.6.6: only set the count on the initial (page=1) load — paginating
      // shouldn't re-display the pill, and changing filters shouldn't either.
      if (page === 1 && tierFilter === "all" && verifiedFilter === "all") {
        setSinceLastVisit(r.meta?.since_last_visit_count ?? 0);
        setVisitPillDismissed(false);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready, page, tierFilter, verifiedFilter, sortMode]);

  // F-LG.15: keep ?verified=… in sync with state so deep links + back/forward
  // work. We use replaceState (not push) — toggling a filter shouldn't bloat
  // the user's history stack.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (verifiedFilter === "all") url.searchParams.delete("verified");
    else url.searchParams.set("verified", verifiedFilter);
    window.history.replaceState({}, "", url.toString());
  }, [verifiedFilter]);

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

  // F-LG.6.6: dismiss the since-last-visit pill AND tell the server we just
  // visited so the count resets on next load. Idempotent — safe to call
  // multiple times (server MERGEs on (tenant_id, user_id)).
  const dismissVisitPill = useCallback(() => {
    if (visitPillDismissed) return;
    setVisitPillDismissed(true);
    setSinceLastVisit(0);
    // Fire and forget — UI shouldn't block on the visit recording.
    post("/api/v1/leadgen/inbox/visit", {}).catch(() => { /* ignore */ });
  }, [post, visitPillDismissed]);

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
      <ReportBar product="spark" detail={insightsPayload?.detail} reports={[
        { id: 'spark_lead_sources', label: 'Leads by source' },
        { id: 'spark_stage_flow', label: 'Pipeline flow' },
      ]} />
      <div className="p-6 space-y-4">
        {/* F-LG.6.6: "X new leads since your last visit" pill. Renders only
            when meta.since_last_visit_count > 0 AND the user hasn't dismissed
            it this session. Click resets the server timestamp via
            POST /leadgen/inbox/visit; clicking any lead row does the same
            (handled in <tr onClick={dismissVisitPill}> below). */}
        {sinceLastVisit > 0 && !visitPillDismissed && (
          <button
            type="button"
            onClick={dismissVisitPill}
            className="group inline-flex items-center gap-2 rounded-full bg-[#EF6C33]/10 px-4 py-1.5 text-sm font-semibold text-[#B84817] ring-1 ring-[#EF6C33]/30 hover:bg-[#EF6C33]/15 transition"
            title="Mark as seen"
          >
            <Bell className="h-3.5 w-3.5" />
            <span>
              {sinceLastVisit === 1
                ? "1 new lead since your last visit"
                : `${sinceLastVisit} new leads since your last visit`}
            </span>
            <X className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
          </button>
        )}

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
            {/* F-LG.15: Verified filter group. Visually offset by a thin
                divider so it doesn't look like a 5th temperature chip. */}
            <div className="mx-2 h-5 w-px bg-slate-200" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Show:</span>
            {([
              { value: "all", label: "All" },
              { value: "true", label: "Verified only" },
              { value: "false", label: "Failed verification" },
            ] as const).map((v) => (
              <button
                key={v.value}
                onClick={() => { setVerifiedFilter(v.value); setPage(1); }}
                title={
                  v.value === "true"  ? "Passed SMTP probe + domain freshness check (F-LG.15 adversarial verify)" :
                  v.value === "false" ? "Refuted by at least one verifier — check the Verified column for the reason" :
                  "All leads regardless of verification outcome"
                }
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${verifiedFilter === v.value ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                {v.value === "true"  && <ShieldCheck className="h-3 w-3" />}
                {v.value === "false" && <ShieldX className="h-3 w-3" />}
                {v.label}
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
            href="/app/spark/leadgen/b2b_new"
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
                {/* F-LG.15: Verified column. Header is clickable — flips
                    sortMode so verified rows surface to the top, then NULL,
                    then suppressed. Clicking again restores the default
                    composite_score sort. */}
                <th className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => { setSortMode((s) => (s === "verification" ? "default" : "verification")); setPage(1); }}
                    className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-700 ${sortMode === "verification" ? "text-slate-900" : ""}`}
                    title={sortMode === "verification"
                      ? "Verified first. Click to restore default sort (by score)."
                      : "Click to sort: verified first, then not-yet-verified, then failed."}
                  >
                    Verified
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
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
                  <tr
                    key={l.id}
                    className="hover:bg-slate-50 relative"
                    onClick={dismissVisitPill}
                  >
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
                    {/* F-LG.15: Verified badge cell. Four states map to a
                        small ring badge:
                          verified                → green check  + "Passed SMTP + domain freshness"
                          suppressed              → red X        + first refusal reason from JSON
                          verification_unavailable→ yellow alert + "Verifiers down; admitted via fail-closed"
                          null                    → grey dash    + "Not yet verified"
                        The whole badge is title-tooltipped — Brandon's call
                        to keep these inline (no hover drawer) so they're
                        scannable in a long list. */}
                    <td className="px-4 py-3">
                      {l.verification_status === "promoted" && (
                        <span
                          title="Verified — passed SMTP probe and domain freshness check."
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          Verified
                        </span>
                      )}
                      {l.verification_status === "suppressed" && (
                        <span
                          title={`Failed verification — ${firstRefusalReason(l.verification_reasons_json) || "refuted by adversarial verify gate"}`}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-rose-100 text-rose-700 ring-1 ring-rose-200"
                        >
                          <ShieldX className="h-3 w-3" />
                          Failed
                        </span>
                      )}
                      {l.verification_status === "verification_unavailable" && (
                        <span
                          title="Verifiers temporarily unavailable; lead promoted on fail-closed."
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 ring-1 ring-amber-200"
                        >
                          <ShieldAlert className="h-3 w-3" />
                          Unverified
                        </span>
                      )}
                      {l.verification_status == null && (
                        <span
                          title="Not yet verified — predates adversarial verify gate, or verifier didn't run."
                          className="inline-flex items-center gap-1 text-slate-400 text-xs"
                        >
                          —
                        </span>
                      )}
                    </td>
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
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">
                    {leads.length === 0
                      ? <>You haven't run a sweep yet. <a href="/app/spark/leadgen/b2b_new" className="text-[#EF6C33] font-semibold underline">Start a new B2B Lead Run →</a></>
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

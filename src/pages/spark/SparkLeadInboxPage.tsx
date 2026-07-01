// SparkLeadInboxPage — Unified Lead Inbox with three tabs.
//
// Locked 2026-06-25: Brandon's call to collapse three sibling SPARK pages
// (Lead Inbox + Lead Suppression + Territories) into ONE tabbed page so the
// whole lead-gen surface lives behind a single nav entry. Same backing API
// endpoints (/leads, /lead-suppression, /lead-territories) — purely UI
// consolidation.
//
// Tabs:
//   • Lead Inbox        — the existing /api/v1/leads inbox (the body of the
//                          legacy SparkLeadsPage.tsx, inlined as LeadInboxTab).
//   • Suppressed Domains — the legacy SparkLeadSuppressionPage body. Renamed
//                          from "Lead Suppression" to match Brandon's
//                          customer-facing label.
//   • Territories       — the legacy SparkTerritoriesPage body.
//
// Each tab label has a small (?) info button NEXT TO the label that opens an
// IadmModal (info size) with a plain-English explainer of what the tab does
// and when to use it. Brandon explicitly asked for a MODAL, not a tooltip,
// so the copy can breathe.
//
// Default tab = Lead Inbox. Tab state syncs to ?tab=inbox|suppressed|territories
// so ARGUS deep links + back/forward work. The legacy route keys
// (`spark_leads`, `spark_lead_suppression`, `spark_lead_territories`) still
// resolve via ServiceRouter — each pre-selects the matching tab on this page.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sparkles, MoreVertical, Search, X, CheckCircle2, Bell, ShieldCheck, ShieldX,
  ShieldAlert, ArrowUpDown, Plus, ShieldOff, Trash2, Pencil, MapPin, HelpCircle,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal, IadmButton } from "../../components/IadmModal";

// ─────────────────────────────────────────────────────────────────────────────
// Tab plumbing
// ─────────────────────────────────────────────────────────────────────────────

type TabKey = "inbox" | "suppressed" | "territories";

const TAB_ORDER: TabKey[] = ["inbox", "suppressed", "territories"];

const TAB_LABEL: Record<TabKey, string> = {
  inbox: "Lead Inbox",
  suppressed: "Suppressed Domains",
  territories: "Territories",
};

// Plain-English explainers shown in the per-tab info modals. Brandon's locked
// rule (2026-06-24) — keep these in the user's voice, no schema names.
const TAB_INFO: Record<TabKey, { title: string; body: React.ReactNode }> = {
  inbox: {
    title: "What's the Lead Inbox?",
    body: (
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          The Lead Inbox is where new B2B leads land — discovered by Lead Gen sweeps,
          captured from your forms, or imported from ARION + other sources.
        </p>
        <p>
          Each row scores the lead Hot, Warm, or Cold (a 0-100 composite of contact
          accessibility, business health, findability, and enrichment depth). Hover
          the score chip for the breakdown.
        </p>
        <p>
          The <strong>Verified</strong> column tells you whether the lead passed our
          adversarial verify gate (SMTP probe + domain freshness check). Verified is
          green; failed verification is red; "Unverified" (yellow) means the verifiers
          were down at the time and the lead was admitted on fail-closed.
        </p>
        <p className="font-semibold text-slate-900 pt-1">Use this tab to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Triage incoming leads, hottest first.</li>
          <li>Promote a lead to a CRM contact (lifecycle stage = lead).</li>
          <li>Suppress a noisy domain so it never re-appears.</li>
          <li>Dismiss leads that aren't a fit.</li>
        </ul>
      </div>
    ),
  },
  suppressed: {
    title: "What's the Suppressed Domains list?",
    body: (
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          Suppressed Domains is the block-list for the Lead Gen pipeline. Any
          domain or email address listed here is excluded from both inbound lead
          capture and any outbound send.
        </p>
        <p>
          This is separate from the email <em>deliverability</em> suppression list,
          which tracks hard bounces and complaints from the SPARK sending
          infrastructure — that's an automatic, infrastructure-level thing.
          Suppressed Domains is YOUR list, manually curated.
        </p>
        <p className="font-semibold text-slate-900 pt-1">Use this tab to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Block competitor domains so they never land in the Lead Inbox.</li>
          <li>Block ex-employees and internal staff from outbound campaigns.</li>
          <li>Honor opt-out requests from individual email addresses.</li>
          <li>Clear out known-spammy domains.</li>
        </ul>
        <p className="text-xs text-slate-500 pt-1">
          Tip: the easiest way to add an entry is to use the <strong>Suppress
          domain</strong> action right from the Lead Inbox row menu — it lands here
          automatically.
        </p>
      </div>
    ),
  },
  territories: {
    title: "What are Territories?",
    body: (
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          A Territory is a named set of geographic and industry rules with an
          assigned owner. When a new lead comes in, the routing engine uses these
          rules to pick the right person to own the lead.
        </p>
        <p>
          Rules can be any combination of states, cities, ZIP prefixes, industries,
          and countries. The first matching territory wins — order doesn't matter,
          just specificity.
        </p>
        <p className="font-semibold text-slate-900 pt-1">Use this tab to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Carve up the country (or world) into rep-owned regions.</li>
          <li>Set up industry-vertical ownership (e.g. all Energy leads → Alex).</li>
          <li>Toggle a territory on/off without losing the rules.</li>
          <li>Edit ownership when a rep changes role.</li>
        </ul>
        <p className="text-xs text-slate-500 pt-1">
          Pairs with the <strong>Routing Rules</strong> page — pick the
          "territory" strategy there to actually assign new leads to the
          territory's owner.
        </p>
      </div>
    ),
  },
};

interface Props {
  /** Optional explicit initial tab; overrides the URL ?tab= param. Used by
   *  the back-compat router cases (spark_lead_suppression, spark_lead_territories)
   *  so deep links pre-select the right tab without depending on the URL. */
  initialTab?: TabKey;
}

function readTabFromUrl(): TabKey | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("tab");
  return v === "inbox" || v === "suppressed" || v === "territories" ? v : null;
}

export function SparkLeadInboxPage({ initialTab }: Props = {}) {
  const [tab, setTab] = useState<TabKey>(() => initialTab ?? readTabFromUrl() ?? "inbox");
  const [infoOpenFor, setInfoOpenFor] = useState<TabKey | null>(null);

  // Sync ?tab= to state so deep links + back/forward keep the right tab.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (tab === "inbox") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.toString());
  }, [tab]);

  // If the router passes an initialTab AFTER mount (lazy route resolution),
  // honor it once.
  useEffect(() => {
    if (initialTab) setTab(initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);

  return (
    <SparkPageShell
      title="Lead Inbox"
      subtitle="B2B leads, suppression list, and territories — all in one place"
    >
      {/* Tab strip. Brandon's locked SPARK pattern: orange underline for the
          active tab, slate text for inactive, with a small (?) info button
          immediately to the RIGHT of each label that opens an IadmModal
          (info size) with a plain-English explainer. */}
      <div className="mb-4 flex items-end gap-1 border-b border-slate-200">
        {TAB_ORDER.map((t) => {
          const active = tab === t;
          return (
            <div key={t} className="flex items-center -mb-px">
              <button
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm border-b-2 transition-colors ${
                  active
                    ? "border-[#EF6C33] text-[#EF6C33] font-semibold"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {TAB_LABEL[t]}
              </button>
              <button
                type="button"
                onClick={() => setInfoOpenFor(t)}
                aria-label={`What is ${TAB_LABEL[t]}?`}
                title={`What is ${TAB_LABEL[t]}?`}
                className={`ml-0.5 mr-2 mb-0.5 rounded-full p-1 transition-colors ${
                  active ? "text-[#EF6C33] hover:bg-[#EF6C33]/10" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                }`}
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Tab bodies. Each component runs its own data fetch via useSparkApi so
          mounting/unmounting is cheap — no shared state across tabs. */}
      {tab === "inbox" && <LeadInboxTab />}
      {tab === "suppressed" && <SuppressedDomainsTab />}
      {tab === "territories" && <TerritoriesTab />}

      {/* Per-tab info modal. IadmModal info-size (1200 × 80vh) gives Brandon
          plenty of room for the explainer without feeling cramped. */}
      <IadmModal
        open={infoOpenFor != null}
        onClose={() => setInfoOpenFor(null)}
        product="spark"
        eyebrow="ABOUT THIS TAB"
        title={infoOpenFor ? TAB_INFO[infoOpenFor].title : ""}
        size="info"
        footer={
          <IadmButton variant="primary" onClick={() => setInfoOpenFor(null)}>
            Got it
          </IadmButton>
        }
      >
        <div className="px-6 py-5">
          {infoOpenFor ? TAB_INFO[infoOpenFor].body : null}
        </div>
      </IadmModal>
    </SparkPageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LeadInboxTab — body of the legacy SparkLeadsPage.tsx, lifted as-is.
//
// Preserves F-LG.6.6 (since-last-visit pill), F-LG.10 (Run Summary banner),
// F-LG.15 (adversarial-verify column + filter + sort), and all per-row actions
// (promote, suppress, dismiss). The SparkPageShell chrome lives on the
// parent SparkLeadInboxPage; this tab just renders the body content.
// ─────────────────────────────────────────────────────────────────────────────

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
  verification_status: "promoted" | "suppressed" | "verification_unavailable" | null;
  verification_reasons_json: string | null;
  created_at: string;
}

function firstRefusalReason(json: string | null | undefined): string | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return null;
    for (const entry of arr) {
      if (entry && entry.refuted && entry.reason) return String(entry.reason);
    }
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
    since_last_visit_count?: number;
  };
}

const TIER_BADGE: Record<Tier, string> = {
  hot: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
  warm: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  cold: "bg-sky-100 text-sky-700 ring-1 ring-sky-200",
};

function LeadInboxTab() {
  const { get, post, ready } = useSparkApi();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [meta, setMeta] = useState<LeadListResponse["meta"] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [tierFilter, setTierFilter] = useState<"all" | Tier>("all");
  const [verifiedFilter, setVerifiedFilter] = useState<"all" | "true" | "false">(() => {
    if (typeof window === "undefined") return "all";
    const v = new URLSearchParams(window.location.search).get("verified");
    return v === "true" || v === "false" ? v : "all";
  });
  const [sortMode, setSortMode] = useState<"default" | "verification">("default");
  const [search, setSearch] = useState("");
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [recentRun, setRecentRun] = useState<RecentRun | null>(null);
  const [dismissedRunIds, setDismissedRunIds] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("leadgen_dismissed_runs") || "[]")); }
    catch { return new Set(); }
  });
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (verifiedFilter === "all") url.searchParams.delete("verified");
    else url.searchParams.set("verified", verifiedFilter);
    window.history.replaceState({}, "", url.toString());
  }, [verifiedFilter]);

  useEffect(() => { load(); }, [load]);

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

  const dismissVisitPill = useCallback(() => {
    if (visitPillDismissed) return;
    setVisitPillDismissed(true);
    setSinceLastVisit(0);
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

  if (loading && leads.length === 0) {
    return <div className="text-sm text-slate-500 py-6">Loading…</div>;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <div className="font-semibold">Couldn't load the Lead Inbox.</div>
        <div className="mt-1 text-xs">{error instanceof Error ? error.message : String(error)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
          href="/app/spark/leadgen/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#EF6C33] px-4 py-2 text-sm font-semibold text-white hover:bg-[#D85F2A]"
        >
          <Sparkles className="h-4 w-4" />
          New B2B Lead Run
        </a>
      </div>

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
                    ? <>You haven't run a sweep yet. <a href="/app/spark/leadgen/new" className="text-[#EF6C33] font-semibold underline">Start a new B2B Lead Run →</a></>
                    : `No leads match "${search}".`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SuppressedDomainsTab — body of the legacy SparkLeadSuppressionPage.tsx.
//
// Same backing API (/api/v1/lead-suppression). Renamed from "Lead Suppression"
// to "Suppressed Domains" per Brandon 2026-06-25 — the customer-facing label
// should be plain English, no jargon.
// ─────────────────────────────────────────────────────────────────────────────

interface SuppressionRow {
  id: number;
  tenant_id: string;
  domain: string | null;
  email: string | null;
  reason: string | null;
  created_at: string;
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function SuppressedDomainsTab() {
  const { get, post, del, ready } = useSparkApi();
  const [rows, setRows] = useState<SuppressionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: SuppressionRow[] }>("/api/v1/lead-suppression");
      setRows(r?.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { fetchList(); }, [fetchList]);

  function resetForm() {
    setDomain("");
    setEmail("");
    setReason("");
  }

  async function save() {
    if (!domain.trim() && !email.trim()) {
      alert("Provide either a domain or an email.");
      return;
    }
    setBusy(true);
    try {
      await post("/api/v1/lead-suppression", {
        domain: domain.trim() || null,
        email: email.trim() || null,
        reason: reason.trim() || null,
      });
      setShowModal(false);
      resetForm();
      await fetchList();
    } catch (err) {
      alert(`Failed to add: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Remove this suppression? The matching domain/email will be allowed again.")) return;
    try {
      await del(`/api/v1/lead-suppression/${id}`);
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    }
  }

  if (loading && rows.length === 0) {
    return <div className="text-sm text-slate-500 py-6">Loading…</div>;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <div className="font-semibold">Couldn't load Suppressed Domains.</div>
        <div className="mt-1 text-xs">{error instanceof Error ? error.message : String(error)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"}
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white hover:bg-[#d85a25] flex items-center gap-1"
        >
          <Plus className="h-4 w-4" /> Add suppression
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="spark-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Email</th>
              <th>Reason</th>
              <th>Added</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-sm text-slate-500 py-8">
                  <ShieldOff className="h-5 w-5 mx-auto text-slate-300 mb-1" />
                  No suppressed domains or emails yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="font-medium text-slate-900">{row.domain || "—"}</td>
                <td className="text-sm text-slate-700">{row.email || "—"}</td>
                <td className="text-xs text-slate-600">
                  {row.reason ? (
                    <span className="px-2 py-0.5 rounded text-[11px] border border-slate-200 bg-slate-50">{row.reason}</span>
                  ) : "—"}
                </td>
                <td className="text-xs text-slate-500">{fmtTime(row.created_at)}</td>
                <td>
                  <button
                    onClick={() => remove(row.id)}
                    className="text-rose-600 hover:bg-rose-50 rounded p-1"
                    title="Remove suppression"
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
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200">
              <div className="text-xs uppercase font-bold text-slate-500">Add</div>
              <div className="text-base font-semibold text-slate-900 mt-0.5">Suppress a domain or email</div>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm">
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">Domain</label>
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="competitor.com"
                  className="mt-1 w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
                />
              </div>
              <div className="text-center text-[10px] uppercase tracking-wider text-slate-400">or</div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="someone@example.com"
                  className="mt-1 w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">Reason</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Competitor / spam / opt-out"
                  className="mt-1 w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="text-sm px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={save}
                className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white hover:bg-[#d85a25] disabled:opacity-50"
              >
                {busy ? "Saving…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TerritoriesTab — body of the legacy SparkTerritoriesPage.tsx.
//
// Backing API (/api/v1/lead-territories) unchanged. Full CRUD modal +
// active/off toggle preserved.
// ─────────────────────────────────────────────────────────────────────────────

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

function TerritoriesTab() {
  const { get, post, put, del, ready } = useSparkApi();
  const [rows, setRows] = useState<TerritoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TerritoryRow | null>(null);
  const [busy, setBusy] = useState(false);

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

  if (loading && rows.length === 0) {
    return <div className="text-sm text-slate-500 py-6">Loading…</div>;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <div className="font-semibold">Couldn't load Territories.</div>
        <div className="mt-1 text-xs">{error instanceof Error ? error.message : String(error)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {rows.length} territor{rows.length === 1 ? "y" : "ies"}
        </div>
        <button
          onClick={openCreate}
          className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white hover:bg-[#d85a25] flex items-center gap-1"
        >
          <Plus className="h-4 w-4" /> New territory
        </button>
      </div>

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
    </div>
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

export default SparkLeadInboxPage;

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
  Lock, ExternalLink, Receipt,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { LeadGenTermsLink } from "../../components/spark/LeadGenTermsLink";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { type LeadGenBillingRow, BILLING_STATUS_LABEL, fmtUsd, friendlyApiError } from "../../lib/leadgenBilling";
// Inbox v1 (LOCKED 2026-09-04): the lead card, the shared capacity banner, and
// the source/channel labels the row and the card both read from one place.
import { SparkLeadModal } from "../../components/spark/SparkLeadModal";
import { SparkCapacityBanner } from "../../components/spark/SparkCapacityBanner";
import { FilterChip, FilterChipRow, TAB_STRIP_ROW, TAB_STRIP_ITEM } from "../../components/spark/FilterChip";
import { rowSourceLabel, rowChannelLabel, sourceFacetLabel } from "../../lib/leadSource";

// ─────────────────────────────────────────────────────────────────────────────
// Tab plumbing
// ─────────────────────────────────────────────────────────────────────────────

type TabKey = "inbox" | "suppressed" | "territories" | "billing";

const TAB_ORDER: TabKey[] = ["inbox", "suppressed", "territories", "billing"];

const TAB_LABEL: Record<TabKey, string> = {
  inbox: "Lead Inbox",
  suppressed: "Suppressed Domains",
  territories: "Territories",
  billing: "Billing",
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
  billing: {
    title: "How is Lead Gen billed?",
    body: (
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          Every B2B lead search is billed per <strong>delivered</strong> lead — a business with a
          verified email. If we find fewer than you asked for, you only pay for what we deliver.
        </p>
        <p>
          With a <strong>SPARK Leads package</strong> a set number of leads is included every billing
          period; leads beyond that are charged per run at your package's rate. Without a package
          you pay per lead, with a minimum of 10 leads per run.
        </p>
        <p>
          Each paid run produces an invoice and receipt (emailed to you, and listed here with a PDF).
          If a payment fails, the leads from that run stay visible but <strong>locked</strong> until
          the invoice is paid.
        </p>
        <p className="font-semibold text-slate-900 pt-1">Use this tab to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>See what each run cost and how many leads it delivered.</li>
          <li>Open or download the invoice for your records.</li>
          <li>Pay an outstanding invoice to unlock its leads.</li>
        </ul>
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
  return v === "inbox" || v === "suppressed" || v === "territories" || v === "billing" ? v : null;
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
      actions={<LeadGenTermsLink />}
    >
      {/* Tab strip. Brandon's locked SPARK pattern: orange underline for the
          active tab, slate text for inactive, with a small (?) info button
          immediately to the RIGHT of each label that opens an IadmModal
          (info size) with a plain-English explainer. */}
      <div className={`mb-4 flex items-end gap-1 border-b border-slate-200 ${TAB_STRIP_ROW}`}>
        {TAB_ORDER.map((t) => {
          const active = tab === t;
          return (
            <div key={t} className={`flex items-center -mb-px ${TAB_STRIP_ITEM}`}>
              <button
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-2 max-md:min-h-[40px] text-sm border-b-2 transition-colors ${
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
      {tab === "billing" && <BillingTab />}

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
// SOURCE column (Brandon 2026-09-04): customers don't care which engine
// pointed us at a business, and we no longer store pointer names on the lead
// (storage_policy none). Every current source reads "SPARK Lead Gen"; a future
// named social source (e.g. LinkedIn) would show its own name.
// SOURCE_LABELS + sourceLabel now live in lib/leadSource so the row and the
// lead card can never disagree about what a lead says it is.

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
  // G-1 (migration 146): nullable — a person who filled in a lead form has no
  // website, and inventing one would poison the known-business exclusion.
  domain: string | null;
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
  // G-1: what the client named the source, and where the person came from.
  source_label?: string | null;
  channel?: string | null;
  kind?: "business" | "person" | null;
  lifecycle_stage: string | null;
  review_flag: string | null;
  is_from_cache: boolean | null;
  cache_age_days: number | null;
  contact_id: number | null;
  verification_status: "promoted" | "suppressed" | "verification_unavailable" | null;
  // L16 — written by the monthly overnight re-score.
  rescored_at: string | null;
  verification_reasons_json: string | null;
  created_at: string;
  // Billing model: leads of a run whose invoice is unpaid are locked (visible, not promotable).
  locked?: boolean | number | null;
  contact_masked?: boolean;
  search_job_id?: number | null;
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

interface InboxCapacity {
  unlimited: boolean;
  cap: number | null;
  used: number;
  remaining: number | null;
  pct: number;
  band: "warning" | "high" | "critical" | null;
  full: boolean;
  cold_count?: number;
}

interface LeadListResponse {
  data: Lead[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
    since_last_visit_count?: number;
    // Inbox v1: capacity rides along on the list so the page fetches once.
    inbox_capacity?: InboxCapacity | null;
    // T1/T2 — false means this tenant is below Pro: no points, no band.
    lead_intelligence?: boolean;
    // PRE-WALK 1b — the chips count the INBOX, and the server counts it. null
    // means "not read", which is why every number below is optional: a chip
    // with no number beats a chip with a wrong one.
    //   band_counts   — null for Standard (Hot/Warm/Cold is Pro and above)
    //   source_counts — RAW lumen.lead.source keys → count, folded to the
    //                   client-facing labels here by lib/leadSource
    //   last_rescored_at — newest re-score in the whole inbox, every tier
    band_counts?: { all: number; hot: number; warm: number; cold: number; unscored: number } | null;
    source_counts?: Record<string, number> | null;
    last_rescored_at?: string | null;
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
  // 2026-09-04 (Brandon): newest first by default, then score; Score and Found headers toggle.
  const [sortMode, setSortMode] = useState<"newest" | "score" | "verification">("newest");
  const [search, setSearch] = useState("");
  // Source facet (G-2): leads now arrive from connected platforms as well as
  // from B2B search, so "show me only the Google Ads ones" is a real question.
  // Grouped by the source KEY, never by the client's own label, so ten Google
  // Ads forms are one chip and not ten.
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [recentRun, setRecentRun] = useState<RecentRun | null>(null);
  const [dismissedRunIds, setDismissedRunIds] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("leadgen_dismissed_runs") || "[]")); }
    catch { return new Set(); }
  });
  const [sinceLastVisit, setSinceLastVisit] = useState<number>(0);
  const [visitPillDismissed, setVisitPillDismissed] = useState<boolean>(false);
  // Inbox v1: capacity (C7), the lead card, and the cold-lead bulk move (C7b).
  const [capacity, setCapacity] = useState<InboxCapacity | null>(null);
  const [showIntel, setShowIntel] = useState(true);
  const [openLeadId, setOpenLeadId] = useState<number | null>(null);
  // ?lead=<id> opens that lead's card straight away. The Agents page links here
  // when the Responder has a draft waiting: without this the link lands on a
  // list of forty rows and the person has to go hunting for the one they were
  // just told about. Runs once per URL; closing the card leaves the query
  // string alone so a refresh reopens what you were looking at.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("lead");
    const id = raw == null ? NaN : Number.parseInt(raw, 10);
    if (Number.isFinite(id) && id > 0) setOpenLeadId(id);
  }, []);
  const [coldOpen, setColdOpen] = useState(false);
  const [coldCount, setColdCount] = useState<number | null>(null);
  const [coldBusy, setColdBusy] = useState<"move_to_contacts" | "remove" | null>(null);
  const [coldResult, setColdResult] = useState<string | null>(null);

  // label → the raw source keys behind it, so picking a chip can tell the
  // server what it means without the server learning the labels.
  const sourceKeysByLabel = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const rawKey of Object.keys(meta?.source_counts || {})) {
      const label = sourceFacetLabel(rawKey);
      (out[label] ||= []).push(rawKey);
    }
    return out;
  }, [meta]);

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
      if (sortMode !== "newest") qs.set("sort", sortMode);
      // The Source chip filters the INBOX now, not the fifty rows on screen.
      // We send the RAW source keys behind the chosen label — seven of them
      // read "SPARK Lead Gen" — so the label map stays here and the server
      // never needs a second copy of it.
      if (sourceFilter !== "all" && sourceKeysByLabel[sourceFilter]?.length) {
        qs.set("source", sourceKeysByLabel[sourceFilter].join(","));
      }
      const r = await get<LeadListResponse>(`/api/v1/leads?${qs.toString()}`);
      setLeads(r.data || []);
      setMeta(r.meta || null);
      setCapacity(r.meta?.inbox_capacity ?? null);
      setShowIntel(r.meta?.lead_intelligence !== false);
      if (page === 1 && tierFilter === "all" && verifiedFilter === "all") {
        setSinceLastVisit(r.meta?.since_last_visit_count ?? 0);
        setVisitPillDismissed(false);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready, page, tierFilter, verifiedFilter, sortMode, sourceFilter, sourceKeysByLabel]);

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

  // Search stays on the loaded page — it is a "find the one I can see" box,
  // not a filter, and it has no chip claiming a total.
  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => (
      (l.business_name || "").toLowerCase().includes(q) ||
      (l.domain || "").toLowerCase().includes(q) ||
      (l.email || "").toLowerCase().includes(q)
    ));
  }, [leads, search]);

  // The facet only appears when there is something to choose BETWEEN — a
  // client with one source does not need a filter that says "all" and "the one".
  //
  // PRE-WALK 1b: built from the SERVER's per-source counts over the whole
  // inbox, not from the fifty rows on screen. Folded to the labels a client
  // recognises here, because that map is a Portal thing and stays one.
  const sourceFacets = useMemo(() => {
    const raw = meta?.source_counts;
    if (!raw) return [] as { key: string; count: number; label: string }[];
    const byLabel = new Map<string, number>();
    for (const [rawKey, n] of Object.entries(raw)) {
      const label = sourceFacetLabel(rawKey);
      byLabel.set(label, (byLabel.get(label) || 0) + (Number(n) || 0));
    }
    return [...byLabel.entries()]
      .map(([label, count]) => ({ key: label, count, label }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [meta]);

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
      // 409 lead_locked_unpaid arrives as a sentence from the server.
      alert(`Promote failed: ${friendlyApiError(err).message}`);
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

  // ── Cold leads (C7b) ────────────────────────────────────────────────────
  // Untouched for 90 days. They leave the inbox ONLY when the client presses
  // one of these two buttons — nothing sweeps them out on a timer.
  const refreshColdCount = useCallback(async () => {
    try {
      const r = await get<{ meta?: { total?: number } }>("/api/v1/leads/cold");
      setColdCount(r?.meta?.total ?? 0);
    } catch {
      setColdCount(null);   // the count is a nicety; the buttons still work
    }
  }, [get]);

  const openCold = useCallback(async () => {
    setColdOpen(true);
    setColdResult(null);
    setColdCount(null);
    await refreshColdCount();
  }, [refreshColdCount]);

  const runCold = async (action: "move_to_contacts" | "remove") => {
    setColdBusy(action);
    setColdResult(null);
    try {
      const r = await post<{ data?: { moved?: number; removed?: number; skipped?: number } }>(
        "/api/v1/leads/cold/bulk", { action });
      const d = (r as { data?: { moved?: number; removed?: number; skipped?: number } })?.data || {};
      const n = action === "move_to_contacts" ? (d.moved ?? 0) : (d.removed ?? 0);
      setColdResult(
        n === 0
          ? "No cold leads to move — everything in your inbox has been touched in the last 90 days."
          : action === "move_to_contacts"
            ? `Moved ${n} lead${n === 1 ? "" : "s"} to Contacts on the "Cold leads" list.`
            : `Removed ${n} lead${n === 1 ? "" : "s"} from your inbox.`
        + ((d.skipped ?? 0) > 0 ? ` ${d.skipped} could not be moved — try again.` : ""),
      );
      await load();
      await refreshColdCount();
    } catch (err) {
      setColdResult(`That didn't work: ${friendlyApiError(err).message}`);
    } finally {
      setColdBusy(null);
    }
  };

  // L16 / walk row R12 — the most recent monthly re-score in the WHOLE inbox.
  //
  // PRE-WALK 1: this used to be the newest rescored_at among the LOADED rows,
  // and page 1 of 197 held none of the 91 the job had touched — so the "Last
  // re-scored …" sentence was simply absent on the page it is written for. The
  // server reads the inbox; the page reads the server.
  const lastRescoredAt = useMemo(() => {
    const raw = meta?.last_rescored_at;
    if (!raw) return null;
    const t = Date.parse(raw);
    return Number.isNaN(t) ? null : new Date(t);
  }, [meta]);

  // Walk row R7 — the band chips. PRE-WALK 1: with 197 leads the list said
  // "Showing 1–50 of 197" over chips reading All (50) · Hot (0) · Warm (26) ·
  // Cold (24), while IA Insights → Health said Hot 51 for the same business
  // after the same re-score. A client who reads "Hot (0)" decides they have no
  // work to chase. null = the server could not count; the chip then carries no
  // number rather than a made-up one.
  const counts = meta?.band_counts ?? null;

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
      {/* C7 + Banners (LOCKED): one shared component, 60% yellow / 75% orange /
          90%+ red, with the count and the one thing to do about it. Silent
          below 60% — a bar that never goes away stops being a warning. */}
      {capacity && (
        <SparkCapacityBanner
          label="Your Lead Inbox"
          used={capacity.used}
          cap={capacity.cap}
          unlimited={capacity.unlimited}
          alwaysShow={capacity.full}
          fullNote={
            <>
              An inquiry from your own website still comes through. New B2B searches wait until
              you have made room.
            </>
          }
          action={
            <button
              type="button"
              onClick={openCold}
              className="rounded-lg border border-current/30 bg-white/80 px-3 py-1.5 text-xs font-semibold hover:bg-white"
            >
              Move cold leads
            </button>
          }
        />
      )}

      {lastRescoredAt && (
        <p className="text-xs text-slate-500">
          Last re-scored {lastRescoredAt.toLocaleDateString()} — leads nobody has worked lose ground
          over time; nothing leaves this inbox unless you move it.
        </p>
      )}

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
          {/* THE CHIP ROW (October pull-forward P4.1, 2026-09-07).
              FilterChipRow is `display: contents` on desktop — invisible to
              layout, so this container behaves exactly as it did before — and
              a horizontally scrolling 40px row on a phone. Ten chips at a
              40px tap target WRAPPED would be four rows and ~170px of an
              812px screen spent before the first lead. */}
          <FilterChipRow>
            {/* T1/T2: Hot / Warm / Cold is Pro and above. Standard still gets the
                full inbox — it just isn't sorted by a score it can't see. */}
            {(showIntel ? (["all", "hot", "warm", "cold"] as const) : (["all"] as const)).map((t) => (
              <FilterChip
                key={t}
                active={tierFilter === t}
                onClick={() => { setTierFilter(t); setPage(1); }}
              >
                {t === "all" ? "All" : t[0].toUpperCase() + t.slice(1)}
                {counts ? ` (${counts[t]})` : ""}
              </FilterChip>
            ))}
            <div className="mx-2 h-5 w-px shrink-0 bg-slate-200" aria-hidden="true" />
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Show:</span>
            {([
              { value: "all", label: "All" },
              { value: "true", label: "Verified only" },
              { value: "false", label: "Failed verification" },
            ] as const).map((v) => (
              <FilterChip
                key={v.value}
                tone="emerald"
                active={verifiedFilter === v.value}
                onClick={() => { setVerifiedFilter(v.value); setPage(1); }}
                title={
                  v.value === "true"  ? "Passed SMTP probe + domain freshness check (F-LG.15 adversarial verify)" :
                  v.value === "false" ? "Refuted by at least one verifier — check the Verified column for the reason" :
                  "All leads regardless of verification outcome"
                }
              >
                {v.value === "true"  && <ShieldCheck className="h-3 w-3" />}
                {v.value === "false" && <ShieldX className="h-3 w-3" />}
                {v.label}
              </FilterChip>
            ))}
            {sourceFacets.length > 1 && (
              <>
                <div className="mx-2 h-5 w-px shrink-0 bg-slate-200" aria-hidden="true" />
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Source:</span>
                <FilterChip
                  active={sourceFilter === "all"}
                  onClick={() => { setSourceFilter("all"); setPage(1); }}
                >
                  All sources
                </FilterChip>
                {sourceFacets.map((f) => (
                  <FilterChip
                    key={f.key}
                    active={sourceFilter === f.key}
                    onClick={() => { setSourceFilter(f.key); setPage(1); }}
                    title={`Only leads from ${f.label}`}
                  >
                    {f.label} ({f.count})
                  </FilterChip>
                ))}
              </>
            )}
          </FilterChipRow>
          <div className="relative ml-2 max-md:ml-0 max-md:w-full">
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

      {/* PHONE PASS 2026-09-06: was `overflow-hidden`, which is not "the table
          scrolls inside its own container" — it is "the table is cut off".
          Measured at 375px: wrapper clientWidth 274, table scrollWidth 1055, so
          Score, Status, Contact and every action were unreachable on a phone
          with no scrollbar to say so. x scrolls, y still clips so the rounded
          corners survive. */}
      <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-y-hidden overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Business</th>
              {showIntel && <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => { setSortMode((s) => (s === "score" ? "newest" : "score")); setPage(1); }}
                  className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-700 ${sortMode === "score" ? "text-slate-900" : ""}`}
                  title={sortMode === "score" ? "Highest score first. Click to go back to newest first." : "Click to sort by score (highest first)."}
                >
                  Score
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>}
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Lifecycle</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => { setSortMode("newest"); setPage(1); }}
                  className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-700 ${sortMode === "newest" ? "text-slate-900" : ""}`}
                  title="Newest leads first, then score (the default)."
                >
                  Found
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => { setSortMode((s) => (s === "verification" ? "newest" : "verification")); setPage(1); }}
                  className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-700 ${sortMode === "verification" ? "text-slate-900" : ""}`}
                  title={sortMode === "verification"
                    ? "Verified first. Click to go back to newest first."
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
                  className="hover:bg-slate-50 relative cursor-pointer"
                  title="Open this business"
                  onClick={() => { dismissVisitPill(); setOpenLeadId(l.id); }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-semibold text-slate-900">{l.business_name || l.domain || l.email || "Unnamed"}</div>
                        {/* A person lead has no domain (G-1) — show how to
                            reach them instead of an empty line. */}
                        <div className="text-[10px] text-slate-500">{l.domain || l.email || ""}</div>
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
                      {!!l.locked && (
                        <span title="Locked — the invoice for this lead's search run is unpaid. Pay it under the Billing tab to unlock."
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-800 ring-1 ring-amber-200">
                          <Lock className="h-3 w-3" /> Locked
                        </span>
                      )}
                    </div>
                  </td>
                  {showIntel && (
                    <td className="px-4 py-3">
                      <span
                        title={scoreTip}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${tier ? TIER_BADGE[tier] : "bg-slate-100 text-slate-600"}`}
                      >
                        {score}
                        <span className="ml-1 opacity-70">{tier ? tier[0].toUpperCase() : "—"}</span>
                      </span>
                    </td>
                  )}
                  {/* Locked (unpaid run): the server masks email/phone — "j•••@example.com" — until the invoice is paid. */}
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {l.email || <span className="text-slate-400">—</span>}
                    {!!l.locked && l.email && <div className="text-[10px] text-amber-700">Pay the invoice to view</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {l.phone || <span className="text-slate-400">—</span>}
                    {!!l.locked && l.phone && <div className="text-[10px] text-amber-700">Pay the invoice to view</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">{l.lifecycle_stage || "lead"}</td>
                  {/* "Source · via Channel" (post-capture L9). An Intake lead
                      shows the name the client gave the connection; a B2B
                      search lead falls back to the map in lib/leadSource. */}
                  <td className="px-4 py-3 text-[10px] text-slate-500">
                    {rowSourceLabel(l)}
                    {rowChannelLabel(l) && (
                      <span className="block text-slate-400">via {rowChannelLabel(l)}</span>
                    )}
                  </td>
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
                    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
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
                            disabled={!!l.contact_id || !!l.locked}
                            title={l.locked ? "Locked until the invoice for this run is paid (Billing tab)." : undefined}
                            className="w-full px-3 py-1.5 text-xs text-left hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {l.contact_id ? "✓ Already a contact" : l.locked ? "Locked — payment pending" : "Promote to contact"}
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
                <td colSpan={showIntel ? 9 : 8} className="px-4 py-12 text-center text-sm text-slate-500">
                  {leads.length === 0
                    ? <>You haven't run a sweep yet. <a href="/app/spark/leadgen/b2b_new" className="text-[#EF6C33] font-semibold underline">Start a new B2B Lead Run →</a></>
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

      {/* The lead card: the business, its people, notes, activity, actions. */}
      <SparkLeadModal
        leadId={openLeadId}
        open={openLeadId != null}
        onClose={() => setOpenLeadId(null)}
        onChanged={load}
        onRemoved={(id) => setLeads((rows) => rows.filter((r) => r.id !== id))}
      />

      {/* C7b — the ONLY way cold leads leave the inbox. Two buttons, both
          pressed by the client, neither of them on a timer. */}
      <IadmModal
        open={coldOpen}
        onClose={() => setColdOpen(false)}
        product="spark"
        eyebrow="LEAD INBOX"
        title="Move cold leads out"
        size="lg"
        footer={<IadmButton variant="ghost" onClick={() => setColdOpen(false)}>Close</IadmButton>}
      >
        <div className="px-6 py-5 space-y-4 text-sm text-slate-700">
          <p>
            A lead is <strong>cold</strong> when nobody has touched it for 90 days and it never became a
            contact. Cold leads stay in your inbox until you decide what to do with them — nothing here
            happens on its own.
          </p>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
            {coldCount == null
              ? "Counting…"
              : coldCount === 0
                ? "You have no cold leads right now."
                : <>You have <strong>{coldCount}</strong> cold lead{coldCount === 1 ? "" : "s"}.</>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="font-semibold text-slate-900 text-sm">Move to Contacts</div>
              <p className="text-xs text-slate-600 mt-1">
                Adds them to Contacts on a list called <strong>Cold leads</strong>, tagged the same way so you
                can email them later. They use your contact plan, not your inbox.
              </p>
              <button
                type="button"
                disabled={!!coldBusy || coldCount === 0}
                onClick={() => runCold("move_to_contacts")}
                className="mt-2 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D85F2A] disabled:opacity-50"
              >
                {coldBusy === "move_to_contacts" ? "Moving…" : "Move to Contacts"}
              </button>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="font-semibold text-slate-900 text-sm">Remove</div>
              <p className="text-xs text-slate-600 mt-1">
                Takes them out of the inbox and adds nothing to Contacts. We still remember the business, so a
                future search will not sell you the same one again.
              </p>
              <button
                type="button"
                disabled={!!coldBusy || coldCount === 0}
                onClick={() => runCold("remove")}
                className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {coldBusy === "remove" ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
          {coldResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              {coldResult}
            </div>
          )}
        </div>
      </IadmModal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BillingTab — receipts: one row per search run with what it cost, the invoice
// and the PDF (GET /api/v1/leadgen/billing; loading it also refreshes any open
// invoice from Stripe and unlocks the leads of a run that has since been paid).
// ─────────────────────────────────────────────────────────────────────────────

function BillingTab() {
  const { get, ready } = useSparkApi();
  const [rows, setRows] = useState<LeadGenBillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: LeadGenBillingRow[] }>("/api/v1/leadgen/billing?limit=200");
      setRows(r?.data || []);
    } catch (err) {
      setError(friendlyApiError(err));
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    let paid = 0, due = 0;
    for (const r of rows) {
      if (r.status === "paid") paid += r.amount_cents ?? 0;
      if (r.status === "invoice_open" || r.status === "invoice_failed") due += r.amount_cents ?? 0;
    }
    return { paid, due };
  }, [rows]);

  if (loading && rows.length === 0) return <div className="text-sm text-slate-500 py-6">Loading…</div>;
  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <div className="font-semibold">Couldn't load billing.</div>
        <div className="mt-1 text-xs">{error instanceof Error ? error.message : String(error)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-600 flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5 text-slate-400" /> {rows.length} run{rows.length === 1 ? "" : "s"}</span>
          <span>Paid <span className="font-semibold text-slate-900 tabular-nums">{fmtUsd(totals.paid)}</span></span>
          {totals.due > 0 && <span className="text-amber-800">Payment due <span className="font-semibold tabular-nums">{fmtUsd(totals.due)}</span></span>}
        </div>
        <button onClick={load} className="text-xs px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">Refresh</button>
      </div>

      <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Run</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Requested</th>
              <th className="px-4 py-3 text-right">Delivered</th>
              <th className="px-4 py-3 text-right">Included</th>
              <th className="px-4 py-3 text-right">Charged</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Invoice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const settled = r.status !== "reserved" && r.status !== "settling";
              const s = BILLING_STATUS_LABEL[r.status] ?? { label: r.status, tone: "muted" as const };
              const toneCls = s.tone === "ok" ? "bg-emerald-100 text-emerald-800" : s.tone === "warn" ? "bg-amber-100 text-amber-800" : s.tone === "bad" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700";
              const metered = settled ? r.metered_delivered : r.metered_reserved;
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <a href={`/app/spark/leadgen/jobs/${r.job_id}`} className="font-semibold text-slate-900 hover:text-[#EF6C33]">{r.run_name}</a>
                    <div className="text-[10px] text-slate-500">Run #{r.job_id}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{new Date(r.completed_at || r.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 text-right tabular-nums">{r.target_count}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 text-right tabular-nums">{settled ? (r.delivered_count ?? 0) : "…"}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 text-right tabular-nums">{settled ? (r.credits_consumed ?? 0) : (r.credits_reserved ?? 0)}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 text-right tabular-nums">
                    {metered ? <>{metered} × {fmtUsd(r.rate_cents)}</> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-900 text-right tabular-nums font-semibold">
                    {settled ? fmtUsd(r.amount_cents) : <span className="text-slate-400 font-normal">up to {fmtUsd((r.metered_reserved ?? 0) * (r.rate_cents ?? 0))}</span>}
                    {r.status === "refunded" && (r.refund_amount_cents ?? 0) > 0 && <div className="text-[10px] text-slate-500 font-normal">refunded {fmtUsd(r.refund_amount_cents)}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneCls}`} title={r.error_message || undefined}>{s.label}</span>
                    {r.leads_locked && (
                      <span className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800" title="Leads from this run are locked until the invoice is paid.">
                        <Lock className="h-3 w-3" /> leads locked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {r.hosted_invoice_url ? (
                      <a href={r.hosted_invoice_url} target="_blank" rel="noreferrer noopener" className="text-xs text-[#B84817] hover:text-[#EF6C33] inline-flex items-center gap-1 mr-2">
                        {r.leads_locked ? "Pay invoice" : "Invoice"} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                    {r.invoice_pdf ? (
                      <a href={r.invoice_pdf} target="_blank" rel="noreferrer noopener" className="text-xs text-slate-600 hover:text-slate-900 underline">PDF</a>
                    ) : null}
                    {!r.hosted_invoice_url && !r.invoice_pdf && <span className="text-xs text-slate-400">—</span>}
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">
                  No runs yet. <a href="/app/spark/leadgen/b2b_new" className="text-[#EF6C33] font-semibold underline">Start a new B2B Lead Run →</a>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Billed per delivered lead. Included leads come from your SPARK Leads package; extras are invoiced per run and charged to
        your card on file. Invoices and receipts are also emailed by Stripe.
      </p>
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

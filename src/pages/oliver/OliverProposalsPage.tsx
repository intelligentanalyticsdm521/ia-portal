import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
// The builder replaces the block editor that used to live in this file
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §5 step 2). The catalogue picker and the
// branded document frame moved with it: the builder renders the real branded
// document itself, so there is nothing left here to frame.
import { ProposalBuilder } from "../../builder/proposal/ProposalBuilder";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { useSearchParams } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';
import {
  PageHeader, DataTable, DetailDrawer, EmptyState, Button, FilterBar, type Column,
} from "../../components/oliver/ui";
import {
  ApproveMilestoneModal,
  type MilestoneShape,
} from "../../components/oliver/ApproveMilestoneModal";

export interface Proposal {
  proposal_id: string;
  /** The quote auto-created when this proposal was accepted (OL-1). */
  quote_id?: string | null;
  proposal_number: string;
  title: string;
  status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  /**
   * "per_event" when the document's priced lines are charged on DIFFERENT
   * bases and cannot honestly be added up (D-164). The server sends it, and
   * sends no figures with it: `total` comes back null rather than a number
   * that is true of no invoice. Optional so an older API response still types.
   */
  pricing_basis?: string | null;
  currency: string;
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  viewed_count: number;
  contact_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_company: string | null;
  version_number: number;
  created_at: string;
  // F3 — surfaced from migration 108. Optional so older API responses
  // (pre-F3) still type-check.
  free_revisions_used?: number;
  is_paused?: boolean;
}

// F3 — proposal revision row shape (matches
// GET /proposals/:id/revisions in oliver-api).
interface ProposalRevision {
  revision_id: string;
  proposal_id: string;
  revision_number: number;
  delta_cents: number | null;
  scope_change_notes: string | null;
  requires_payment: boolean;
  paused_for_payment: boolean;
  public_token: string | null;
  public_token_expires_at: string | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "lapsed";
  sent_at: string | null;
  accepted_at: string | null;
  signature_name: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  payment_milestone_id: string | null;
  created_at: string;
  updated_at: string | null;
}

interface Summary {
  total_count: number;
  draft_count: number;
  sent_count: number;
  viewed_count: number;
  accepted_count: number;
  declined_count: number;
  expired_count: number;
  open_pipeline: number;
  accepted_value: number;
}

const STATUS_PILL: Record<string, { label: string; bg: string; color: string }> = {
  draft:    { label: "Draft",    bg: "#F1F5F9", color: "#5A7A8A" },
  sent:     { label: "Sent",     bg: "#DBEAFE", color: "#1E40AF" },
  viewed:   { label: "Viewed",   bg: "#E0E7FF", color: "#4338CA" },
  accepted: { label: "Accepted", bg: "#D1FAE5", color: "#047857" },
  declined: { label: "Declined", bg: "#FEE2E2", color: "#991B1B" },
  expired:  { label: "Expired",  bg: "#F1F5F9", color: "#94A3B8" },
};

const FILTER_PILLS = [
  { key: "", label: "All open" },
  { key: "draft", label: "Drafts" },
  { key: "sent", label: "Sent" },
  { key: "viewed", label: "Viewed" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
];

/** oliver-api's own origin — the PDF is streamed by the API, not the Portal. */
const OLIVER_PDF_BASE =
  (import.meta.env.VITE_OLIVER_API_BASE as string) ||
  (import.meta.env.VITE_OLIVER_API_BASE_URL as string) || "";

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
// 2026-09-01 — DATE-ONLY values must be formatted in UTC.
//
// valid_until is a calendar date, but it is stored as a DATETIMEOFFSET at
// midnight UTC: entering 09/01/2026 saves 2026-09-01T00:00:00.000Z, which is
// correct. Rendering that instant with toLocaleDateString() in any timezone
// west of Greenwich shows the PREVIOUS day — 00:00 UTC is 19:00 on 31 August in
// Central Time. Brandon typed 09/01/2026 and the list said 8/31/26.
//
// The data was never wrong; only the reading of it. Forcing timeZone: "UTC"
// reads the date back the way it was written. Do NOT "fix" this by shifting the
// stored value — that breaks it for everyone east of Greenwich instead.
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  });
}

export function OliverProposalsPage({ embedded = false, createSignal = 0, createCards }: { embedded?: boolean; createSignal?: number; createCards?: React.ReactNode } = {}) {
  const insightsPayload = useProductInsightsPayload('oliver').payload;
  const { get, post, patch, ready } = useOliverApi();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  // The combined Quotes & Proposals page owns the two big create cards and
  // drives this page's editor through a counter — bump = open. Zero is the
  // mount value and must not open anything.
  useEffect(() => { if (createSignal > 0) setShowCreate(true); }, [createSignal]);
  const [flash, setFlash] = useState<string | null>(null);
  // F2 — focus detail drawer (Payment Splits). Driven by ?focus=<proposal_id>
  // so deep-links survive page reloads and the row click already sets it.
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const closeFocus = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = filter ? `?status=${filter}` : "";
      const data = await get<{ proposals: Proposal[]; summary: Summary }>(`/proposals${qs}`);
      setProposals(data.proposals || []);
      setSummary(data.summary || null);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, filter]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filtered = useMemo(() => {
    if (!search.trim()) return proposals;
    const q = search.toLowerCase();
    return proposals.filter((p) =>
      (p.title || "").toLowerCase().includes(q) ||
      (p.proposal_number || "").toLowerCase().includes(q) ||
      (p.customer_name || "").toLowerCase().includes(q) ||
      (p.customer_company || "").toLowerCase().includes(q));
  }, [proposals, search]);

  // Open pipeline conversion: viewed → accepted rate among proposals seen
  const conversionRate = summary && (summary.viewed_count + summary.accepted_count + summary.declined_count) > 0
    ? Math.round((summary.accepted_count / (summary.viewed_count + summary.accepted_count + summary.declined_count)) * 100)
    : null;

  const columns: Column<Proposal>[] = [
    {
      key: "title",
      header: "Proposal",
      sortable: true,
      sortAccessor: (p) => p.proposal_number,
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1A3A4A" }}>{p.title}</div>
          <div style={{ fontSize: 11, color: "#5A7A8A", fontFamily: "monospace" }}>
            {p.proposal_number}{p.version_number > 1 && <span> · v{p.version_number}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (p) => p.customer_name || p.customer_company ? (
        <div>
          <div style={{ fontSize: 12, color: "#0B1C24" }}>{p.customer_company || p.customer_name}</div>
          {p.customer_email && <div style={{ fontSize: 10, color: "#5A7A8A" }}>{p.customer_email}</div>}
        </div>
      ) : <span style={{ color: "#94A3B8", fontSize: 11 }}>—</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortable: true,
      sortAccessor: (p) => (p.pricing_basis === "per_event" ? -1 : Number(p.total)),
      /* D-164 — THE SAME RULE THAT KEEPS THE TOTAL OFF THE PAPER. A snow & ice
         agreement is priced per push, per application and per month, and this
         column used to add the three and print the answer — a figure true of
         no invoice, on the list the owner reads their pipeline off. The
         document says which basis it is on, the server sends the word, and the
         column prints the word instead of inventing a number. */
      render: (p) => (p.pricing_basis === "per_event" ? (
        <span data-per-event="1" style={{ fontSize: 11, color: "#5A7A8A" }}
          title="The lines on this document are charged on different bases — per push, per application, per month — so there is no one total">
          Per event
        </span>
      ) : (
        <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#0B1C24" }}>{fmtMoney(p.total)}</span>
      )),
    },
    {
      key: "views",
      header: "Activity",
      render: (p) => {
        if (!p.first_viewed_at) {
          return p.status === "sent"
            ? <span style={{ fontSize: 11, color: "#94A3B8" }}>Not yet viewed</span>
            : <span style={{ fontSize: 11, color: "#94A3B8" }}>—</span>;
        }
        return (
          <div style={{ fontSize: 11 }}>
            <div style={{ color: "#0B1C24" }}>Viewed {p.viewed_count}×</div>
            <div style={{ color: "#5A7A8A" }}>Last: {fmtDate(p.last_viewed_at)}</div>
          </div>
        );
      },
    },
    {
      key: "expiry",
      header: "Valid until",
      render: (p) => {
        if (!p.valid_until) return <span style={{ color: "#94A3B8", fontSize: 11 }}>—</span>;
        const ms = new Date(p.valid_until).getTime() - Date.now();
        const days = Math.floor(ms / 86400000);
        const expired = ms < 0;
        const expiring = !expired && days <= 3 && (p.status === "sent" || p.status === "viewed");
        return (
          <div>
            <div style={{ fontSize: 12, color: expired ? "#B91C1C" : expiring ? "#D97706" : "#5A7A8A", fontWeight: expired || expiring ? 600 : 400 }}>
              {fmtDate(p.valid_until)}
            </div>
            {(expired || expiring) && (
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2, color: expired ? "#B91C1C" : "#D97706" }}>
                {expired ? "Expired" : days === 0 ? "Today" : `${days}d left`}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (p) => {
        const pill = STATUS_PILL[p.status] || STATUS_PILL.draft;
        return (
          <span style={{
            display: "inline-block", padding: "3px 9px", borderRadius: 99,
            background: pill.bg, color: pill.color, fontSize: 11, fontWeight: 600,
          }}>{pill.label}</span>
        );
      },
    },
  ];

  return (
    <OliverPageWrapper title="Proposals" subtitle="Branded proposals with tracked send + click-to-accept" error={error} loading={loading && !proposals.length}>
      <ReportBar product="oliver" detail={insightsPayload?.detail} reports={[
        { id: 'oliver_proposal_funnel', label: 'Proposal funnel' },
        { id: 'oliver_win_drivers', label: 'What wins work' },
      ]} />
      <PageHeader
        title="Proposals"
        subtitle="Create a branded proposal, send a tracked link, customer clicks to accept → OLIVER quote auto-created."
        actions={!embedded ? <Button variant="primary" onClick={() => setShowCreate(true)}>+ New proposal</Button> : undefined}
      />

      {flash && (
        <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>
          {flash}
        </div>
      )}

      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="stat-card">
          <div className="stat-lbl">Open pipeline</div>
          <div className="stat-val">{fmtMoney(summary?.open_pipeline)}</div>
          <div className="stat-delta neu">{(summary?.sent_count ?? 0) + (summary?.viewed_count ?? 0)} awaiting decision</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Accepted value</div>
          <div className="stat-val" style={{ color: "#059669" }}>{fmtMoney(summary?.accepted_value)}</div>
          <div className="stat-delta neu">{summary?.accepted_count ?? 0} won</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Acceptance rate</div>
          <div className="stat-val" style={{
            color: conversionRate != null && conversionRate >= 60 ? "#059669"
              : conversionRate != null && conversionRate < 30 ? "#D97706" : undefined,
          }}>
            {conversionRate != null ? `${conversionRate}%` : "—"}
          </div>
          <div className="stat-delta neu">of viewed proposals</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Drafts</div>
          <div className="stat-val">{summary?.draft_count ?? 0}</div>
          <div className="stat-delta neu">not yet sent</div>
        </div>
      </div>

      {/* Founder sketch 2026-08-19: the big create cards sit HERE — below the
          value stats, above the list — supplied by the combined page. */}
      {createCards}

      {!proposals.length && !loading ? (
        <EmptyState
          title="No proposals yet"
          description="Send your first branded proposal. The customer gets a tracked link they click to accept — OLIVER auto-creates the quote on acceptance."
          action={!embedded ? <Button variant="primary" onClick={() => setShowCreate(true)}>+ Create your first proposal</Button> : undefined}
        />
      ) : (
        <>
          <FilterBar
            pills={FILTER_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search title, number, customer…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(p) => p.proposal_id}
            initialSort={{ key: "title", direction: "desc" }}
            emptyMessage="No proposals match these filters."
            onRowClick={(p) => {
              const next = new URLSearchParams(searchParams);
              next.set("focus", p.proposal_id);
              setSearchParams(next, { replace: false });
            }}
          />
        </>
      )}

      {showCreate && (
        <CreateProposalDrawer
          /* Exit after a Save Draft: the draft is in the database and must be
             in the list (found clicking the builder release, 2 Oct 2026 - the
             row appeared only after a reload). One list read on every close. */
          onClose={() => { setShowCreate(false); void reload(); }}
          onCreated={async (msg) => {
            setShowCreate(false);
            await reload();
            setFlash(msg);
            setTimeout(() => setFlash(null), 4000);
          }}
          api={{ get, post, patch }}
        />
      )}

      {focusId && (
        <ProposalDetailDrawer
          proposalId={focusId}
          // Pull the matching row from current list so we have total/title
          // without a second round trip when it's already cached. The
          // drawer still re-fetches milestones on mount for freshness.
          proposalSummary={proposals.find((p) => p.proposal_id === focusId) ?? null}
          onClose={closeFocus}
          onChanged={reload}
          api={{ get, post, patch }}
        />
      )}
    </OliverPageWrapper>
  );
}

// ─── The editor ─────────────────────────────────────────────────────────────
//
// REPLACED 2026-09-16 (BUILDER_PLATFORM_SCOPE_2026-09-15 §5 step 2).
//
// What stood here was ~770 lines of block editor: a modal of stacked field
// lists, one per block kind, with the document rendered beside them and the
// two kept in step by hand. Brandon's 2026-09-15 walk marked it P2 FAIL —
// "blocks are added as raw inline fields with no explanation" — and SD-010
// makes raw field lists a fail by rule.
//
// It is DELETED, not left beside the new one. Same export, same props, same
// route, same list, same buttons; behind them is the one builder every surface
// will use (src/builder/). "Replace means delete."
export function CreateProposalDrawer({
  onClose, onCreated, api, proposalId,
}: {
  onClose: () => void;
  onCreated: (msg: string) => void;
  /** Kept in the signature because Quotes & Proposals passes it; the builder
   *  offers templates in its own "start from" step and in the gallery, so a
   *  pre-picked one is no longer a separate mechanism. */
  initialTemplateId?: string | null;
  /** Opening an existing draft to keep working on it. */
  proposalId?: string | null;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
    patch?: <T>(p: string, body: unknown) => Promise<T>;
  };
}) {
  return (
    <ProposalBuilder
      api={{
        get: api.get,
        post: api.post,
        patch: api.patch ?? ((path, body) => api.post(path, body)),
      }}
      proposalId={proposalId ?? null}
      onClose={onClose}
      onSaved={onCreated}
    />
  );
}


const pLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const pInput: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6,
  background: "#fff", color: "#0B1C24",
};

// ──────────────────────────────────────────────────────────────────────────
// F2 — ProposalDetailDrawer (Payment Splits surface for proposals).
//
// Mirrors the same payment-splits dropdown + milestone list + Approve modal
// pattern from QuoteDetailDrawer in OliverQuotesPage.tsx. Opens on
// ?focus=<proposal_id> URL state. Per the F2 brief this is a NEW drawer
// scope because OliverProposalsPage previously had no detail drawer at all
// (clicking a row reloaded the page with the URL param dangling).
// ──────────────────────────────────────────────────────────────────────────
type PaymentSplitKind = "" | "50_50" | "40_30_30" | "custom";

interface PaymentMilestoneRow {
  payment_milestone_id: string;
  parent_kind: "quote" | "proposal" | "project";
  parent_id: string;
  sort_order: number;
  name: string;
  payment_pct: number | null;
  payment_amount_cents: number | null;
  status: string;
  charge_id: string | null;
}

const SPLIT_OPTIONS: Array<{ key: PaymentSplitKind; label: string }> = [
  { key: "",         label: "None" },
  { key: "50_50",    label: "50 / 50" },
  { key: "40_30_30", label: "40 / 30 / 30" },
  { key: "custom",   label: "Custom" },
];

function statusBadgeStyle(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    "n/a":             { bg: "#F1F5F9", color: "#5A7A8A" },
    ready:             { bg: "#E0E7FF", color: "#4338CA" },
    requires_action:   { bg: "#FEF3C7", color: "#92400E" },
    processing:        { bg: "#DBEAFE", color: "#1E40AF" },
    succeeded:         { bg: "#D1FAE5", color: "#047857" },
    partial_refund:    { bg: "#FEF3C7", color: "#92400E" },
    full_refund:       { bg: "#FEE2E2", color: "#991B1B" },
    disputed:          { bg: "#FEE2E2", color: "#991B1B" },
    failed:            { bg: "#FEE2E2", color: "#991B1B" },
    canceled:          { bg: "#F1F5F9", color: "#94A3B8" },
  };
  const pill = map[status] ?? map["n/a"];
  return {
    display: "inline-block", padding: "2px 8px", borderRadius: 99,
    background: pill.bg, color: pill.color,
    fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4,
  };
}

export function ProposalDetailDrawer({
  proposalId,
  proposalSummary,
  onClose,
  onChanged,
  api,
}: {
  proposalId: string;
  proposalSummary: Proposal | null;
  onClose: () => void;
  onChanged: () => void;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
    // The builder saves a revision with PATCH. The drawer is where it opens, so
    // the drawer needs the verb.
    patch: <T>(p: string, body: unknown) => Promise<T>;
  };
}) {
  const [splitKind, setSplitKind] = useState<PaymentSplitKind>("");
  const [milestones, setMilestones] = useState<PaymentMilestoneRow[]>([]);
  const [splitsBusy, setSplitsBusy] = useState(false);
  const [splitsErr, setSplitsErr] = useState<string | null>(null);
  const [customRows, setCustomRows] = useState<Array<{ name: string; pct: number }>>([
    { name: "Deposit", pct: 50 },
    { name: "Final",   pct: 50 },
  ]);
  const [approveTarget, setApproveTarget] = useState<MilestoneShape | null>(null);
  // F3 — Revisions tab state.
  const [activeTab, setActiveTab] = useState<"overview" | "revisions">("overview");
  const [revisions, setRevisions] = useState<ProposalRevision[]>([]);
  const [revsErr, setRevsErr] = useState<string | null>(null);
  const [revsNote, setRevsNote] = useState<string | null>(null);
  // Which revision the BUILDER is open on. There is no other revision editor.
  const [builderRevision, setBuilderRevision] = useState<{ proposalId: string; revisionId: string } | null>(null);
  const [creatingRevision, setCreatingRevision] = useState(false);
  // §8 item 6 — the business's countersign, and the signing record behind it.
  const [signatures, setSignatures] = useState<Array<{ party: string; signer_name: string; printed_name?: string | null; signed_at: string; ip_address: string | null; consent_text: string; document_version: number }>>([]);
  // D-174 — does this document ask to be signed? Read from the API, never
  // worked out here.
  const [signatureRequired, setSignatureRequired] = useState(true);
  const [counterName, setCounterName] = useState("");
  const [counterBusy, setCounterBusy] = useState(false);
  const [counterErr, setCounterErr] = useState<string | null>(null);
  // The public token. The business opens the SAME PDF the customer gets, by
  // the same URL — the authenticated route cannot be reached from an <a href>,
  // and a second PDF endpoint would be a second PDF.
  const [publicToken, setPublicToken] = useState<string | null>(null);
  /**
   * D-04 — the builder, opened on the DOCUMENT, from the record.
   *
   * This modal had Close · Open the PDF · Overview · Revisions · Payment
   * splits and no Edit at all, so the only route back into an unsent draft was
   * the Revisions tab's "+ Revise in the builder" — which creates a revision.
   * A draft nobody has seen has nothing to revise.
   */
  /* A DRAFT OPENS STRAIGHT INTO THE BUILDER (fewer clicks, 2 Oct 2026).
     Clicking a draft's row used to open this record first, with the builder
     one more press away; a draft has nothing to show here that the builder
     does not. So the builder is up the moment the record opens for a draft,
     and leaving the builder leaves the record too — back to the list, which
     reloads. Everything that has been sent still opens on the record. */
  const draftOpensBuilder = proposalSummary?.status === "draft";
  const [editingDocument, setEditingDocument] = useState(draftOpensBuilder);
  const leaveBuilder = () => {
    setEditingDocument(false);
    onChanged();
    if (draftOpensBuilder) onClose();
  };

  // Total in CENTS — server stores DECIMAL(18,2), round-trip Math.round.
  const parentTotalCents = proposalSummary
    ? Math.round(Number(proposalSummary.total) * 100)
    : 0;
  const proposalTitle = proposalSummary?.title ?? "Proposal";

  const reloadMilestones = useCallback(async () => {
    try {
      const list = await api.get<PaymentMilestoneRow[]>(`/proposals/${proposalId}/payment-milestones`);
      setMilestones(Array.isArray(list) ? list : []);
      if (Array.isArray(list) && list.length > 0) {
        if (list.length === 2) setSplitKind("50_50");
        else if (list.length === 3) setSplitKind("40_30_30");
        else setSplitKind("custom");
      } else {
        setSplitKind("");
      }
      setSplitsErr(null);
    } catch (e) {
      setMilestones([]);
      setSplitsErr((e as Error).message);
    }
  }, [api, proposalId]);

  useEffect(() => { reloadMilestones(); }, [reloadMilestones]);

  // F3 — Revisions reload. The founder API returns { data: [...] } so we
  // unwrap manually (mirrors the milestones API surface).
  const reloadRevisions = useCallback(async () => {
    try {
      const list = await api.get<ProposalRevision[]>(`/proposals/${proposalId}/revisions`);
      setRevisions(Array.isArray(list) ? list : []);
      setRevsErr(null);
    } catch (e) {
      setRevisions([]);
      setRevsErr((e as Error).message);
    }
  }, [api, proposalId]);

  useEffect(() => { reloadRevisions(); }, [reloadRevisions]);

  /**
   * Start a revision: create the row, then open the BUILDER on it.
   *
   * The row is created first because a revision needs a copy of the document to
   * open — the API takes that copy, and freezes a second one as the baseline
   * the diff is measured against. Two steps in the code, one button to the
   * author.
   */
  const startRevision = useCallback(async () => {
    setCreatingRevision(true);
    setRevsErr(null);
    try {
      const created = await api.post<any>(`/proposals/${proposalId}/revisions`, {});
      const id = created?.data?.revision_id ?? created?.revision_id;
      if (!id) throw new Error("The revision was created but came back without an id.");
      await reloadRevisions();
      setBuilderRevision({ proposalId, revisionId: id });
    } catch (e) {
      setRevsErr((e as Error).message);
    } finally {
      setCreatingRevision(false);
    }
  }, [api, proposalId, reloadRevisions]);

  // The signing record, from the one place it lives (oliver.document_signature
  // through GET /proposals/:id).
  useEffect(() => {
    let cancelled = false;
    api.get<any>(`/proposals/${proposalId}`)
      .then((r) => {
        if (cancelled) return;
        const row = r?.data ?? r;
        setSignatures(row?.signatures || []);
        setPublicToken(row?.token || null);
        /* D-174 — SIGNED, OR APPROVED? The SERVER decides, from the document
           (`signatureRequired` in oliver's lib/documentModel.js), and hands
           the answer to this page and to the customer's copy. Absent (an older
           API) means the rule this drawer has always shown. */
        setSignatureRequired(row?.signature_required !== false);
      })
      .catch(() => { if (!cancelled) { setSignatures([]); setPublicToken(null); } });
    return () => { cancelled = true; };
  }, [api, proposalId]);

  const usedFreeRevisions = Number(proposalSummary?.free_revisions_used ?? 0);
  const isPaused = !!proposalSummary?.is_paused;
  // The "active" revision that triggered the pause (most-recent accepted
  // with paused_for_payment=1).  Used for the banner copy.
  const pausingRevision = useMemo(() => {
    return revisions.find((r) => r.status === "accepted" && r.paused_for_payment) ?? null;
  }, [revisions]);

  async function applySplitKind(kind: PaymentSplitKind) {
    if (kind === splitKind) return;
    if (kind === "" || kind === "custom") {
      setSplitKind(kind);
      return;
    }
    setSplitsBusy(true);
    setSplitsErr(null);
    try {
      const rows = await api.post<PaymentMilestoneRow[]>(
        `/proposals/${proposalId}/payment-milestones`,
        { kind },
      );
      setMilestones(Array.isArray(rows) ? rows : []);
      setSplitKind(kind);
    } catch (e) {
      setSplitsErr((e as Error).message);
    } finally {
      setSplitsBusy(false);
    }
  }

  async function saveCustomSplit() {
    const cleaned = customRows
      .filter((r) => r.name.trim() && Number(r.pct) > 0)
      .map((r) => ({ name: r.name.trim(), pct: Number(r.pct) }));
    if (!cleaned.length) {
      setSplitsErr("Add at least one milestone");
      return;
    }
    const total = cleaned.reduce((s, r) => s + r.pct, 0);
    if (Math.round(total * 100) / 100 !== 100) {
      setSplitsErr(`Custom splits must sum to 100% (got ${total}%)`);
      return;
    }
    setSplitsBusy(true);
    setSplitsErr(null);
    try {
      const rows = await api.post<PaymentMilestoneRow[]>(
        `/proposals/${proposalId}/payment-milestones`,
        { kind: "custom", milestones: cleaned },
      );
      setMilestones(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setSplitsErr((e as Error).message);
    } finally {
      setSplitsBusy(false);
    }
  }

  function updateCustomRow(i: number, patch: Partial<{ name: string; pct: number }>) {
    setCustomRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function addCustomRow() { setCustomRows((prev) => [...prev, { name: "", pct: 0 }]); }
  function removeCustomRow(i: number) { setCustomRows((prev) => prev.filter((_, idx) => idx !== i)); }

  return (
    <DetailDrawer
      open onClose={onClose}
      title={proposalTitle}
      subtitle={proposalSummary?.proposal_number ?? proposalId}
      width="xl"
    >
      {/* ── The way back into the document (D-04) ─────────────────────────
          First thing in the drawer, because "where did my proposal go?" is the
          question this screen was answering wrongly. It opens the SAME builder
          the document was written in, on the document — no revision. */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          data-open-in-builder="1"
          onClick={() => setEditingDocument(true)}
          title={proposalSummary?.status === "draft"
            ? "Open this draft in the builder and carry on where you left off"
            : "Open the document in the builder. Nothing changes for the customer until you send an update."}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, border: "none", borderRadius: 4,
            padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#fff",
            background: "#EF6C33", cursor: "pointer",
          }}
        >
          {proposalSummary?.status === "draft" ? "Edit in the builder" : "Open in the builder"}
        </button>
        <span style={{ fontSize: 11, color: "#5A7A8A" }}>
          No revision is created — this is the document itself.
        </span>
      </div>

      {editingDocument && (
        <ProposalBuilder
          api={{ get: api.get, post: api.post, patch: api.patch }}
          proposalId={proposalId}
          onClose={leaveBuilder}
          onSaved={(msg) => { setRevsNote(msg); leaveBuilder(); }}
        />
      )}

      {/* ── Signatures (§8 item 6) ─────────────────────────────────────────
          Who signed, when, from where, to which wording, against which
          version — and the business's own countersign, which is a SECOND row
          on the record rather than an edit of the customer's. */}
      <div style={{ marginBottom: 14, padding: 12, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5A7A8A" }}>
            {signatureRequired ? "Signatures" : "Approval"}
          </span>
          {publicToken && (
            <a href={`${OLIVER_PDF_BASE}/p/proposals/${publicToken}/pdf`} target="_blank" rel="noreferrer"
              title="Open this document as a PDF, with any signatures on it — the same file the customer gets"
              style={{ fontSize: 11, fontWeight: 600, color: "#1A7DB5" }}>Open the PDF</a>
          )}
        </div>
        {signatures.length === 0 && (
          <div style={{ color: "#94A3B8" }}>
            {signatureRequired
              ? "Nobody has signed this yet."
              : "This document does not ask for a signature. Nobody has approved it yet."}
          </div>
        )}
        {signatures.map((sg) => (
          <div key={sg.party} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", borderBottom: "1px solid #F1F5F9" }}>
            {/* Said honestly: a document that never asked for a signature was
                APPROVED, and the row must not call that "signed". */}
            <span style={{ color: "#5A7A8A" }}>
              {sg.party === "customer" ? (signatureRequired ? "Signed by" : "Approved by") : "Countersigned"}
            </span>
            <span style={{ textAlign: "right" }}>
              <strong>{sg.signer_name}</strong>
              <span style={{ color: "#5A7A8A" }}> · {new Date(sg.signed_at).toLocaleString()} · v{sg.document_version}{sg.ip_address ? ` · ${sg.ip_address}` : ""}</span>
            </span>
          </div>
        ))}
        {proposalSummary?.status === "accepted" && !signatures.some((sg) => sg.party === "business") && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={counterName}
              onChange={(e) => setCounterName(e.target.value)}
              placeholder="Type your name to countersign"
              title="Your typed name becomes your signature on this document"
              style={{ border: "1px solid #CBD5E1", borderRadius: 4, padding: "6px 9px", fontSize: 12, flex: "1 1 200px" }}
            />
            <button
              type="button"
              disabled={counterBusy || counterName.trim().length < 2}
              title={counterName.trim().length < 2 ? "Type your name first" : "Countersign this document"}
              onClick={async () => {
                setCounterBusy(true); setCounterErr(null);
                try {
                  await api.post(`/proposals/${proposalId}/countersign`, { signature: counterName.trim() });
                  const d = await api.get<any>(`/proposals/${proposalId}`);
                  setSignatures((d?.data ?? d)?.signatures || []);
                  setCounterName("");
                } catch (e) { setCounterErr((e as Error).message); }
                finally { setCounterBusy(false); }
              }}
              style={{
                border: "none", borderRadius: 4, padding: "7px 12px", fontSize: 12, fontWeight: 700, color: "#fff",
                background: counterName.trim().length >= 2 ? "#0B6E8C" : "#CBD5E1",
                cursor: counterName.trim().length >= 2 ? "pointer" : "not-allowed",
              }}
            >{counterBusy ? "Signing…" : "Countersign"}</button>
            {counterErr && <span style={{ color: "#B91C1C", fontSize: 11 }}>{counterErr}</span>}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 16, padding: 12, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#5A7A8A" }}>Total</span>
          {/* Same rule, same words (D-164): a document priced per event has no
              one total on the detail panel either. */}
          <span style={{ color: "#0B1C24", fontFamily: "monospace", fontWeight: 700 }}>
            {proposalSummary?.pricing_basis === "per_event"
              ? "Per event" : fmtMoney(proposalSummary?.total)}
          </span>
        </div>
      </div>

      {/* F3 — Paused-for-payment banner. Shown whenever the parent
          proposal is paused; overrides all advance buttons. */}
      {isPaused && (
        <div style={{
          marginBottom: 14, padding: 12,
          background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 8,
          fontSize: 12, color: "#92400E", fontWeight: 600,
        }}>
          Paused — awaiting payment{pausingRevision ? ` for revision v${pausingRevision.revision_number}` : ""}.
        </div>
      )}

      {/* F3 — Tabs: Overview (payment splits) vs Revisions. */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #E2E8F0", marginBottom: 16 }}>
        {(["overview", "revisions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              padding: "8px 14px",
              fontSize: 12, fontWeight: 600,
              background: "transparent", border: 0, cursor: "pointer",
              color: activeTab === t ? "#1A3A4A" : "#5A7A8A",
              borderBottom: activeTab === t ? "2px solid #2D9CDB" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t === "overview" ? "Overview" : `Revisions${revisions.length ? ` (${revisions.length})` : ""}`}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
      <div style={{ marginTop: 4, paddingTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-oliver-teal" style={{ margin: 0 }}>
            Payment splits
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A" }}>Payment terms</label>
            <select
              value={splitKind}
              onChange={(e) => applySplitKind(e.target.value as PaymentSplitKind)}
              disabled={splitsBusy}
              style={{ ...pInput, width: "auto", padding: "4px 8px" }}
            >
              {SPLIT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {splitsErr && (
          <div style={{ marginBottom: 8, padding: 8, fontSize: 11, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 4 }}>
            {splitsErr}
          </div>
        )}

        {splitKind === "custom" && milestones.length === 0 && (
          <div style={{ marginBottom: 12, padding: 10, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 6 }}>
              Custom milestones — must sum to 100%
            </div>
            {customRows.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 32px", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <input
                  type="text" placeholder="Name (e.g. Deposit)"
                  value={r.name}
                  onChange={(e) => updateCustomRow(i, { name: e.target.value })}
                  style={pInput}
                />
                <input
                  type="number" step="1" min="0" max="100"
                  placeholder="%"
                  value={r.pct}
                  onChange={(e) => updateCustomRow(i, { pct: Number(e.target.value) })}
                  style={{ ...pInput, textAlign: "right" }}
                />
                <button
                  onClick={() => removeCustomRow(i)}
                  title="Remove"
                  style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 16 }}
                >×</button>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <button
                onClick={addCustomRow}
                style={{ fontSize: 11, fontWeight: 600, color: "#1A7DB5", background: "transparent", border: 0, cursor: "pointer" }}
              >+ Add milestone</button>
              <Button variant="primary" onClick={saveCustomSplit} disabled={splitsBusy}>
                {splitsBusy ? "Saving…" : "Save milestones"}
              </Button>
            </div>
          </div>
        )}

        {milestones.length > 0 && (
          <div style={{ border: "1px solid #E2E8F0", borderRadius: 6 }}>
            {milestones.map((m, i) => {
              const isLast = i === milestones.length - 1;
              const amount = m.payment_amount_cents != null
                ? Number(m.payment_amount_cents)
                : m.payment_pct != null
                  ? Math.round((Number(m.payment_pct) / 100) * parentTotalCents)
                  : 0;
              const pctLabel = m.payment_pct != null ? `${m.payment_pct}%` : "—";
              const canApprove = m.status === "n/a" || m.status === "ready" || m.status === "failed";
              return (
                <div key={m.payment_milestone_id} style={{
                  display: "grid", gridTemplateColumns: "32px 1fr 80px 110px 130px 160px",
                  gap: 8, padding: "10px 12px", alignItems: "center",
                  borderBottom: !isLast ? "1px solid #F1F5F9" : "none",
                }}>
                  <span style={{ fontSize: 12, fontFamily: "monospace", color: "#94A3B8" }}>{m.sort_order}</span>
                  <div style={{ fontSize: 13, color: "#0B1C24", fontWeight: 500 }}>{m.name}</div>
                  <span style={{ fontSize: 12, fontFamily: "monospace", textAlign: "right", color: "#5A7A8A" }}>{pctLabel}</span>
                  <span style={{ fontSize: 13, fontFamily: "monospace", textAlign: "right", color: "#0B1C24", fontWeight: 600 }}>
                    {fmtMoney(amount / 100)}
                  </span>
                  <span style={statusBadgeStyle(m.status)}>{m.status.replace(/_/g, " ")}</span>
                  <div style={{ textAlign: "right" }}>
                    {canApprove ? (
                      <Button variant="primary" onClick={() => setApproveTarget({
                        payment_milestone_id: m.payment_milestone_id,
                        name: m.name,
                        payment_pct: m.payment_pct,
                        payment_amount_cents: m.payment_amount_cents,
                        status: m.status,
                      })}>Approve + Charge</Button>
                    ) : (
                      <span style={{ fontSize: 10, color: "#94A3B8" }}>
                        {m.status === "succeeded" ? "Paid" : "—"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {splitKind === "" && milestones.length === 0 && (
          <div style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>
            No payment splits configured. Pick a preset above to charge in steps.
          </div>
        )}
      </div>
      )}

      {activeTab === "revisions" && (
        <div style={{ paddingTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-oliver-teal" style={{ margin: 0 }}>
              Revisions
            </h3>
            {/* D-04/D-21 — a DRAFT has nothing to revise, and this was the
                only way back into one. It is refused here and in the API. */}
            <Button
              variant="primary"
              onClick={startRevision}
              disabled={isPaused || !!creatingRevision || proposalSummary?.status === "draft"}
              title={proposalSummary?.status === "draft"
                ? "This one has not been sent yet, so there is no version to revise. Use “Edit in the builder” above and change it directly."
                : isPaused
                  ? "Cannot add a revision while paused for payment"
                  : "Open this document in the builder as a new version. Nothing changes for the customer until you send it."}
            >
              {creatingRevision ? "Opening…" : "+ Revise in the builder"}
            </Button>
          </div>

          <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 10 }}>
            Free revisions used: <strong>{usedFreeRevisions}</strong> / 1.
            {usedFreeRevisions >= 1 && (
              <span style={{ marginLeft: 6 }}>
                Next revision must be chargeable.
              </span>
            )}
          </div>

          {revsErr && (
            <div style={{ marginBottom: 8, padding: 8, fontSize: 11, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 4 }}>
              {revsErr}
            </div>
          )}
          {revsNote && (
            <div style={{ marginBottom: 8, padding: 8, fontSize: 11, background: "#F0FDF4", color: "#166534", border: "1px solid #BBF7D0", borderRadius: 4 }}>
              {revsNote}
            </div>
          )}

          {revisions.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>
              No revisions yet. Add one if the scope changes after the client accepts.
            </div>
          ) : (
            <div style={{ border: "1px solid #E2E8F0", borderRadius: 6 }}>
              {revisions.map((rev, i) => {
                const isLast = i === revisions.length - 1;
                const deltaLabel = rev.delta_cents != null
                  ? fmtMoney(Number(rev.delta_cents) / 100)
                  : "—";
                return (
                  <div key={rev.revision_id} style={{
                    display: "grid", gridTemplateColumns: "48px 1fr 110px 110px 130px",
                    gap: 8, padding: "10px 12px", alignItems: "center",
                    borderBottom: !isLast ? "1px solid #F1F5F9" : "none",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1A3A4A" }}>
                      v{rev.revision_number}
                    </span>
                    <div>
                      <div style={{ fontSize: 12, color: "#0B1C24" }}>
                        {rev.scope_change_notes
                          ? (rev.scope_change_notes.length > 80 ? rev.scope_change_notes.slice(0, 80) + "…" : rev.scope_change_notes)
                          : <span style={{ fontStyle: "italic", color: "#94A3B8" }}>No notes</span>}
                      </div>
                      <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 2 }}>
                        Created {fmtDate(rev.created_at)}
                        {rev.requires_payment && <span style={{ marginLeft: 6, color: "#92400E", fontWeight: 600 }}>· Paid</span>}
                        {rev.paused_for_payment && <span style={{ marginLeft: 6, color: "#92400E", fontWeight: 600 }}>· Paused</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontFamily: "monospace", textAlign: "right", color: "#0B1C24", fontWeight: 600 }}>
                      {deltaLabel}
                    </span>
                    <span style={statusBadgeStyle(rev.status === "draft" || rev.status === "sent" ? "ready"
                      : rev.status === "accepted" ? "succeeded"
                      : rev.status === "rejected" ? "failed"
                      : "canceled")}>
                      {rev.status}
                    </span>
                    <div style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                      {/* A revision is EDITED and SENT in the builder, which is
                          where the document is. There is no "send" here any
                          more: sending without opening it would send the
                          unedited copy the revision was created from. */}
                      {(rev.status === "draft" || rev.status === "sent") && (
                        <Button
                          variant={rev.status === "draft" ? "primary" : "secondary"}
                          onClick={() => setBuilderRevision({ proposalId, revisionId: rev.revision_id })}
                          title={rev.status === "draft"
                            ? "Open this revision in the builder — the same builder the original was written in"
                            : "Open the version that was sent"}
                        >
                          {rev.status === "draft" ? "Open in builder" : "Open"}
                        </Button>
                      )}
                      {rev.status === "sent" && rev.public_token && (
                        <a
                          href={`/p/revisions/${rev.public_token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open the page exactly as the customer sees it"
                          style={{ fontSize: 11, color: "#1A7DB5", fontWeight: 600 }}
                        >
                          Customer's page
                        </a>
                      )}
                      {rev.status === "accepted" && rev.public_token && (
                        <a
                          href={`/p/revisions/${rev.public_token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open the signed version the customer accepted"
                          style={{ fontSize: 11, color: "#1A7DB5", fontWeight: 600 }}
                        >
                          Signed copy
                        </a>
                      )}
                      {(rev.status === "rejected" || rev.status === "lapsed") && (
                        <span style={{ fontSize: 10, color: "#94A3B8" }}>—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* THE builder — the same one the original document was written in.
              §11.5: "make a revision open in the SAME builder as the original".
              The pre-builder AddRevisionModal (delta in dollars, a notes box,
              a Requires-payment tick, and no document anywhere) is DELETED, not
              left beside it. Replace means delete. */}
          {builderRevision && (
            <ProposalBuilder
              api={{ get: api.get, post: api.post, patch: api.patch }}
              revision={builderRevision}
              onClose={() => setBuilderRevision(null)}
              onSaved={async (msg) => {
                setBuilderRevision(null);
                setRevsErr(null);
                await reloadRevisions();
                onChanged();
                // The builder's own message says what happened; showing it here
                // is what the list does for every other save.
                setRevsNote(msg);
              }}
            />
          )}
        </div>
      )}

      {approveTarget && (
        <ApproveMilestoneModal
          open
          milestone={approveTarget}
          parentKind="proposal"
          parentId={proposalId}
          parentTotal={parentTotalCents}
          onConfirm={async () => {
            setApproveTarget(null);
            await reloadMilestones();
            onChanged();
          }}
          onCancel={() => setApproveTarget(null)}
        />
      )}
    </DetailDrawer>
  );
}


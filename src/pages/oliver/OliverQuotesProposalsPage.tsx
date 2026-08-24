import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, ScrollText } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { DataTable, EmptyState, FilterBar, type Column } from "../../components/oliver/ui";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { ReportBar } from "../../components/insights/ReportBar";
import { useProductInsightsPayload } from "../../hooks/useProductInsightsPayload";
import { IadmModal } from "../../components/IadmModal";
import { DocumentBrandFrame } from "../../components/oliver/DocumentBrandFrame";
import { QuoteCreateForm } from "./QuoteCreateForm";
import { QuoteDetailDrawer } from "./OliverQuotesPage";
import { CreateProposalDrawer, ProposalDetailDrawer, type Proposal } from "./OliverProposalsPage";

// ONE list for quotes and proposals — the whole point of combining the pages.
//
// Founder 2026-08-19: "this is supposed to be one full list... it either says
// quote or proposal in the description." The earlier tabbed version kept two
// separate pages under a switcher, which is exactly what he was rejecting: a
// customer's documents live in one pipeline, so they belong in one table, in
// date order, with a Type pill saying which is which and an optional
// All/Quotes/Proposals filter on top.
//
// The two big create cards sit below the value stats and above the list, per
// the sketch. Both editors and both detail drawers are owned here now — there
// are no tabs left to own them.

interface QuoteRowRaw {
  id: string;
  jobTitle: string;
  customerName?: string;
  amount: number;
  status: string;
  createdAt: string;
  validUntil?: string | null;
}

interface Row {
  kind: "quote" | "proposal";
  id: string;
  title: string;
  number: string;
  customer: string;
  total: number;
  status: string;
  createdAt: string;
}

const STATUS_PILL: Record<string, { label: string; bg: string; color: string }> = {
  draft:    { label: "Draft",    bg: "#F1F5F9", color: "#5A7A8A" },
  sent:     { label: "Sent",     bg: "#DBEAFE", color: "#1E40AF" },
  viewed:   { label: "Viewed",   bg: "#E0E7FF", color: "#4338CA" },
  accepted: { label: "Accepted", bg: "#D1FAE5", color: "#047857" },
  declined: { label: "Declined", bg: "#FEE2E2", color: "#991B1B" },
  rejected: { label: "Declined", bg: "#FEE2E2", color: "#991B1B" },
  expired:  { label: "Expired",  bg: "#F1F5F9", color: "#94A3B8" },
  invoiced: { label: "Invoiced", bg: "#D1FAE5", color: "#047857" },
};

const fmtMoney = (n?: number | null) =>
  `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OliverQuotesProposalsPage() {
  const insightsPayload = useProductInsightsPayload("oliver");
  const { get, post, patch, del, ready } = useOliverApi();
  const api = useMemo(() => ({ get, post, patch, del }), [get, post, patch, del]);

  const [quotes, setQuotes] = useState<QuoteRowRaw[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "quote" | "proposal">("all");
  // The status pills the old pages had and the rewrite dropped — founder
  // noticed inside ten minutes, which is how essential they are.
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState<null | "quote" | "proposal">(null);
  const [detail, setDetail] = useState<null | { kind: "quote" | "proposal"; id: string }>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // The oliver api client auto-unwraps { data: ... }; /quotes answers a
      // bare array, /proposals answers { proposals, summary }. Tolerate all.
      const [q, p] = await Promise.all([
        get<any>("/quotes"),
        get<any>("/proposals"),
      ]);
      setQuotes(Array.isArray(q) ? q : q?.data ?? []);
      setProposals(Array.isArray(p?.proposals) ? p.proposals : Array.isArray(p) ? p : []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  // ── the merged list ──────────────────────────────────────────────────────
  const rows = useMemo<Row[]>(() => {
    const qs: Row[] = quotes.map((q) => ({
      kind: "quote" as const,
      id: q.id,
      title: q.jobTitle || "Quote",
      number: String(q.id).slice(0, 8).toUpperCase(),
      customer: q.customerName || "—",
      total: Number(q.amount) || 0,
      status: q.status,
      createdAt: q.createdAt,
    }));
    const ps: Row[] = proposals.map((p) => ({
      kind: "proposal" as const,
      id: p.proposal_id,
      title: p.title || "Proposal",
      number: p.proposal_number,
      customer: p.customer_company || p.customer_name || "—",
      total: Number(p.total) || 0,
      status: p.status,
      createdAt: p.created_at,
    }));
    let all = [...qs, ...ps].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    if (kindFilter !== "all") all = all.filter((r) => r.kind === kindFilter);
    if (statusFilter) {
      all = statusFilter === "declined"
        ? all.filter((r) => r.status === "declined" || r.status === "rejected")
        : all.filter((r) => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      all = all.filter((r) =>
        r.title.toLowerCase().includes(q) ||
        r.number.toLowerCase().includes(q) ||
        r.customer.toLowerCase().includes(q));
    }
    return all;
  }, [quotes, proposals, kindFilter, statusFilter, search]);

  // ── combined value stats (always the WHOLE pipeline, unaffected by the
  //    filter — the filter narrows the list, not the business) ─────────────
  const stats = useMemo(() => {
    const all = [
      ...quotes.map((q) => ({ status: q.status, total: Number(q.amount) || 0 })),
      ...proposals.map((p) => ({ status: p.status, total: Number(p.total) || 0 })),
    ];
    const open = all.filter((r) => r.status === "sent" || r.status === "viewed");
    const accepted = all.filter((r) => r.status === "accepted" || r.status === "invoiced");
    const decided = all.filter((r) => ["accepted", "invoiced", "declined", "rejected"].includes(r.status));
    return {
      openValue: open.reduce((s, r) => s + r.total, 0),
      openCount: open.length,
      acceptedValue: accepted.reduce((s, r) => s + r.total, 0),
      acceptedCount: accepted.length,
      conversion: decided.length ? Math.round((accepted.length / decided.length) * 100) : null,
      drafts: all.filter((r) => r.status === "draft").length,
    };
  }, [quotes, proposals]);

  const columns: Column<Row>[] = [
    {
      key: "kind",
      header: "Type",
      render: (r) => (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
          background: r.kind === "proposal" ? "#F1EDFB" : "#E8F3F8",
          color: r.kind === "proposal" ? "#7C3AED" : "#1A7DB5",
        }}>
          {r.kind === "proposal" ? <ScrollText size={12} /> : <FileText size={12} />}
          {r.kind === "proposal" ? "Proposal" : "Quote"}
        </span>
      ),
    },
    {
      key: "title",
      header: "Document",
      sortable: true,
      sortAccessor: (r) => r.title,
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1A3A4A" }}>{r.title}</div>
          <div style={{ fontSize: 11, color: "#5A7A8A", fontFamily: "monospace" }}>{r.number}</div>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (r) => <span style={{ fontSize: 12, color: "#0B1C24" }}>{r.customer}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortable: true,
      sortAccessor: (r) => r.total,
      render: (r) => <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{fmtMoney(r.total)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const pill = STATUS_PILL[r.status] || STATUS_PILL.draft;
        return (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: pill.bg, color: pill.color }}>
            {pill.label}
          </span>
        );
      },
    },
    {
      key: "created",
      header: "Created",
      sortable: true,
      sortAccessor: (r) => r.createdAt,
      render: (r) => <span style={{ fontSize: 12, color: "#5A7A8A" }}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</span>,
    },
  ];

  const card: React.CSSProperties = {
    width: 320, minHeight: 140, textAlign: "left", cursor: "pointer",
    background: "#fff", border: "1px solid #DBE7ED", borderRadius: 12,
    padding: "20px 22px", display: "flex", flexDirection: "column", gap: 10,
    alignItems: "flex-start", boxShadow: "0 1px 4px rgba(11,28,36,0.08)",
  };
  const iconWrap: React.CSSProperties = {
    width: 38, height: 38, borderRadius: 8, display: "flex",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  };
  const filterPill = (active: boolean): React.CSSProperties => ({
    padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
    border: "1px solid " + (active ? "#1A7DB5" : "#DBE7ED"),
    borderRadius: 999, background: active ? "#1A7DB5" : "#fff",
    color: active ? "#fff" : "#5A7A8A",
  });

  return (
    // OliverPageWrapper renders the .arion-page class every OLIVER style is
    // scoped to (.stat-row, .stat-card, table chrome, pills). The first cut of
    // this page used a bare div and every one of those styles fell away — the
    // stats rendered as a vertical text list and the table as bare rows.
    <OliverPageWrapper
      title="Quotes & Proposals"
      subtitle="Every document you've priced or pitched, in one pipeline"
      error={error}
      loading={loading && !quotes.length && !proposals.length}
    >

      {/* The full-report links both old pages carried — union of the two, so
          nothing that was reachable before the merge got lost in it. */}
      <ReportBar product="oliver" detail={insightsPayload?.detail} reports={[
        { id: "oliver_proposal_funnel", label: "Proposal funnel" },
        { id: "oliver_quotes_by_service", label: "Quotes by service" },
        { id: "oliver_service_catalog", label: "What you sell" },
        { id: "oliver_win_drivers", label: "What wins work" },
      ]} />

      {flash && (
        <div style={{ margin: "0 0 12px", padding: 10, fontSize: 12, background: "#D1FAE5", color: "#047857", border: "1px solid #A7F3D0", borderRadius: 6 }}>
          {flash}
        </div>
      )}

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Open value</div>
          <div className="stat-val">{fmtMoney(stats.openValue)}</div>
          <div className="stat-delta neu">{stats.openCount} awaiting a decision</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Accepted value</div>
          <div className="stat-val" style={{ color: "#059669" }}>{fmtMoney(stats.acceptedValue)}</div>
          <div className="stat-delta neu">{stats.acceptedCount} accepted</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Conversion rate</div>
          <div className="stat-val">{stats.conversion != null ? `${stats.conversion}%` : "—"}</div>
          <div className="stat-delta neu">accepted ÷ decided</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Drafts</div>
          <div className="stat-val">{stats.drafts}</div>
          <div className="stat-delta neu">not yet sent</div>
        </div>
      </div>

      {/* Founder sketch: the two big create cards, below the stats, above the list. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, margin: "14px 0", justifyContent: "center" }}>
        <button style={card} onClick={() => setCreateOpen("quote")}>
          <span style={{ ...iconWrap, background: "#E8F3F8", color: "#1A7DB5" }}><FileText size={18} /></span>
          <span>
            <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#0B1C24" }}>Create a quote</span>
            <span style={{ display: "block", fontSize: 11.5, color: "#5A7A8A", marginTop: 3, lineHeight: 1.45 }}>
              A price for a known job — line items and totals the customer can
              accept. Accepted quotes flow straight to a job and an invoice.
            </span>
          </span>
        </button>
        <button style={card} onClick={() => setCreateOpen("proposal")}>
          <span style={{ ...iconWrap, background: "#F1EDFB", color: "#7C3AED" }}><ScrollText size={18} /></span>
          <span>
            <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#0B1C24" }}>Create a proposal</span>
            <span style={{ display: "block", fontSize: 11.5, color: "#5A7A8A", marginTop: 3, lineHeight: 1.45 }}>
              A pitch document — written sections, services pulled from your
              catalogue with their descriptions, tracked send and
              click-to-accept. Use it when you're selling the work, not just
              pricing it.
            </span>
          </span>
        </button>
      </div>

      {/* Kind on the left, status + search on the right — the default is the
          whole pipeline. */}
      <FilterBar
        pills={[
          { key: "", label: "All statuses" },
          { key: "draft", label: "Drafts" },
          { key: "sent", label: "Sent" },
          { key: "viewed", label: "Viewed" },
          { key: "accepted", label: "Accepted" },
          { key: "declined", label: "Declined" },
        ]}
        activePill={statusFilter}
        onPillChange={setStatusFilter}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search documents…"
        rightSlot={
          <div style={{ display: "flex", gap: 8 }}>
            <button style={filterPill(kindFilter === "all")} onClick={() => setKindFilter("all")}>All</button>
            <button style={filterPill(kindFilter === "quote")} onClick={() => setKindFilter("quote")}>Quotes</button>
            <button style={filterPill(kindFilter === "proposal")} onClick={() => setKindFilter("proposal")}>Proposals</button>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title={kindFilter === "all" ? "Nothing here yet" : `No ${kindFilter}s yet`}
          description="Create a quote to price a job, or a proposal to pitch the work — both land in this pipeline."
        />
      ) : (
        <DataTable<Row>
          rows={rows}
          rowKey={(r) => `${r.kind}:${r.id}`}
          columns={columns}
          onRowClick={(r) => setDetail({ kind: r.kind, id: r.id })}
        />
      )}

      {/* ── create editors, both owned here ─────────────────────────────── */}
      {createOpen === "quote" && (
        <IadmModal
          open
          onClose={() => setCreateOpen(null)}
          product="oliver"
          eyebrow="OLIVER · QUOTES & PROPOSALS"
          title="New quote"
          subtitle="What you see here is what the customer receives."
          size="info"
        >
          <div style={{ padding: 20, background: "#EEF3F6" }}>
            <DocumentBrandFrame get={get} docLabel="QUOTE">
              <QuoteCreateForm
                onCreated={() => { setCreateOpen(null); setFlash("Quote created."); reload(); }}
                onCancel={() => setCreateOpen(null)}
              />
            </DocumentBrandFrame>
          </div>
        </IadmModal>
      )}

      {createOpen === "proposal" && (
        <CreateProposalDrawer
          onClose={() => setCreateOpen(null)}
          onCreated={(msg) => { setCreateOpen(null); setFlash(msg); reload(); }}
          api={api}
        />
      )}

      {/* ── detail drawers ──────────────────────────────────────────────── */}
      {detail?.kind === "quote" && (
        <QuoteDetailDrawer
          quoteId={detail.id}
          onClose={() => setDetail(null)}
          onChanged={reload}
          api={api}
        />
      )}
      {detail?.kind === "proposal" && (
        <ProposalDetailDrawer
          proposalId={detail.id}
          proposalSummary={proposals.find((p) => p.proposal_id === detail.id) || null}
          onClose={() => setDetail(null)}
          onChanged={reload}
          api={api}
        />
      )}
    </OliverPageWrapper>
  );
}

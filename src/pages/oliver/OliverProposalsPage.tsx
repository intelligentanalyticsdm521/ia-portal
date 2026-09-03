import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import { ProposalCatalogPicker, type PickedService } from "../../components/oliver/ProposalCatalogPicker";
import { DocumentBrandFrame } from "../../components/oliver/DocumentBrandFrame";
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
  const insightsPayload = useProductInsightsPayload('oliver');
  const { get, post, ready } = useOliverApi();
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
      sortAccessor: (p) => Number(p.total),
      render: (p) => (
        <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#0B1C24" }}>{fmtMoney(p.total)}</span>
      ),
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
          onClose={() => setShowCreate(false)}
          onCreated={async (msg) => {
            setShowCreate(false);
            await reload();
            setFlash(msg);
            setTimeout(() => setFlash(null), 4000);
          }}
          api={{ get, post }}
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
          api={{ get, post }}
        />
      )}
    </OliverPageWrapper>
  );
}

// ─── Create drawer ──────────────────────────────────────────────────────────
export function CreateProposalDrawer({
  onClose, onCreated, api, initialTemplateId,
}: {
  onClose: () => void;
  onCreated: (msg: string) => void;
  /** Pre-apply this template the moment the list loads — the New/Template
      chooser on Quotes & Proposals passes the pick through here. */
  initialTemplateId?: string | null;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
  };
}) {
  // ── The block model ───────────────────────────────────────────────────────
  //
  // Founder 2026-08-19: "Proposals should be expanded to be able to add like
  // real text field descriptions, pull in the specific line items plus their
  // descriptions... make it look like a fucking proposal. Not just a quote
  // with the word proposal."
  //
  // So a proposal is a SEQUENCE OF SECTIONS, not a scope textarea over a price
  // grid:
  //   text    — a heading and a paragraph. The pitch, the situation, the
  //             recommendation. Carries no price.
  //   service — pulled from the product catalogue: name, description and
  //             feature bullets arrive pre-written, price attached. Editable
  //             here without touching the catalogue.
  //   line    — a plain priced row for one-off amounts that need no story.
  //
  // scope_html and line_items are RENDERED from the blocks at save, so the
  // backend contract (and the public accept page, and the PDF) is unchanged.
  type CardItem = { name: string; pitch?: string; price?: string; list_price?: string; per?: string; note?: string; features?: string[]; recommended?: boolean; badge?: string };
  type Block =
    | { key: number; kind: "text"; heading: string; body: string }
    | { key: number; kind: "service"; name: string; description: string; features: string[]; quantity: number; unit_price: number; recommended?: boolean;
        // Which catalogue price this line came from. Quotes, jobs and invoices
        // have always recorded these; proposals recorded neither, so an
        // accepted proposal could not be traced back to the price it quoted.
        offering_id?: string; price_id?: string | null;
        // "billed monthly" / "billed annually". 98 of 114 active prices are
        // recurring, and without this the customer reads a bare "$29.99" as
        // the entire cost of the engagement.
        cadence?: string | null }
    | { key: number; kind: "line"; description: string; quantity: number; unit_price: number; recommended?: boolean }
    // Comparison cards. Deliberately NOT priced into the total: a tier
    // comparison shows four options and the customer buys one, so summing
    // them would silently change what they are agreeing to pay. The priced
    // truth stays in service/line blocks.
    | { key: number; kind: "cards"; heading: string; intro: string; items: CardItem[] }
    | { key: number; kind: "callout"; heading: string; panels: { title: string; tone?: "accent" | "warn"; items: string[] }[] }
    | { key: number; kind: "buckets"; heading: string; intro: string; groups: { title: string; total?: string; rows: { label: string; list?: string; amount?: string }[] }[] }
    | { key: number; kind: "signature"; heading: string; parties: { name: string; lines?: string[] }[] };

  const keyRef = useRef(1);
  const nextKey = () => keyRef.current++;

  const [contacts, setContacts] = useState<Array<{ contact_id: string; first_name?: string; last_name?: string; email?: string; company_name?: string }>>([]);
  const [contactId, setContactId] = useState("");
  // Template body shape (v2): { title?, terms?, tax_rate?, blocks? }.
  // Legacy bodies ({ scope?, line_items? }) are mapped on load below.
  const [templates, setTemplates] = useState<Array<{ template_id: string; name: string; body: any; is_default?: boolean }>>([]);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [terms, setTerms] = useState("Payment due within 30 days of acceptance.");
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [taxRate, setTaxRate] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);

  useEffect(() => {
    // useOliverApi auto-unwraps the { data: ... } envelope (lib/oliverApi.ts
    // — documented at the top of that file). Reading r.data here therefore
    // got undefined from an already-unwrapped array, which emptied the
    // customer dropdown, the template picker AND the catalogue picker in one
    // go. Tolerate both shapes so a future un-unwrapped caller still works.
    const rows = (r: any): any[] => (Array.isArray(r) ? r : r?.data ?? []);
    api.get<any>("/contacts?limit=200")
      .then((r) => setContacts(rows(r)))
      .catch(() => setContacts([]));
    api.get<any>("/proposal-templates")
      .then((r) => {
        const list = rows(r).map((t: any) => ({
          template_id: t.proposal_template_id || t.template_id,
          name: t.name,
          is_default: !!t.is_default,
          body: typeof t.body_json === "string" ? safeJson(t.body_json) : (t.body_json || t.body || {}),
        }));
        setTemplates(list);
        // Chooser pick: apply it now, against the freshly fetched list —
        // onSelectTemplate reads state that has not committed yet.
        if (initialTemplateId) {
          const t = list.find((x: any) => x.template_id === initialTemplateId);
          if (t) applyTemplateBody(t);
        }
      })
      .catch(() => setTemplates([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function safeJson(s: string): any {
    try { return JSON.parse(s || "{}"); } catch { return {}; }
  }

  function onSelectTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.template_id === id);
    if (!t) return;
    applyTemplateBody(t);
  }

  function applyTemplateBody(t: { template_id: string; body: any }) {
    setTemplateId(t.template_id);
    const b = t.body || {};
    if (b.title) setTitle(String(b.title));
    if (b.terms) setTerms(String(b.terms));
    if (b.tax_rate != null) setTaxRate(String(Number(b.tax_rate) <= 1 ? Number(b.tax_rate) * 100 : Number(b.tax_rate)));
    if (Array.isArray(b.blocks) && b.blocks.length) {
      // v2 template: restore the sections exactly as they were saved.
      setBlocks(b.blocks.map((blk: any) => ({ ...blk, key: nextKey() })));
      return;
    }
    // Legacy template: a scope string becomes one text section, line items
    // become plain priced rows. Nothing is lost, it just arrives un-split.
    const legacy: Block[] = [];
    if (b.scope) legacy.push({ key: nextKey(), kind: "text", heading: "Overview", body: String(b.scope) });
    for (const it of Array.isArray(b.line_items) ? b.line_items : []) {
      legacy.push({ key: nextKey(), kind: "line", description: String(it.description || ""), quantity: Number(it.quantity) || 1, unit_price: Number(it.unit_price) || 0 });
    }
    if (legacy.length) setBlocks(legacy);
  }

  // ── Block operations ─────────────────────────────────────────────────────
  const patchBlock = (key: number, patch: Partial<Block>) =>
    setBlocks((prev) => prev.map((b) => (b.key === key ? ({ ...b, ...patch } as Block) : b)));
  const removeBlock = (key: number) => setBlocks((prev) => prev.filter((b) => b.key !== key));
  const moveBlock = (key: number, dir: -1 | 1) =>
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const addText = () => setBlocks((p) => [...p, { key: nextKey(), kind: "text", heading: "", body: "" }]);

  // Sub-item editors for the composite blocks. Each one patches a single
  // entry inside a block's array without disturbing its siblings — mutating
  // in place would lose the other cards on every keystroke.
  const patchCard = (blockKey: number, idx: number, patch: Partial<CardItem>) =>
    setBlocks((prev) => prev.map((bl) =>
      bl.key === blockKey && bl.kind === "cards"
        ? { ...bl, items: bl.items.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }
        : bl));

  const patchPanel = (blockKey: number, idx: number, patch: Partial<{ title: string; tone: "accent" | "warn"; items: string[] }>) =>
    setBlocks((prev) => prev.map((bl) =>
      bl.key === blockKey && bl.kind === "callout"
        ? { ...bl, panels: bl.panels.map((pn, i) => (i === idx ? { ...pn, ...patch } : pn)) }
        : bl));

  const patchGroup = (blockKey: number, idx: number, patch: Partial<{ title: string; total: string; rows: { label: string; list?: string; amount?: string }[] }>) =>
    setBlocks((prev) => prev.map((bl) =>
      bl.key === blockKey && bl.kind === "buckets"
        ? { ...bl, groups: bl.groups.map((g, i) => (i === idx ? { ...g, ...patch } : g)) }
        : bl));

  const addCards = () => setBlocks((p) => [...p, { key: nextKey(), kind: "cards", heading: "", intro: "", items: [
    { name: "", pitch: "", price: "", features: [] },
    { name: "", pitch: "", price: "", features: [], recommended: true },
  ] }]);
  const addCallout = () => setBlocks((p) => [...p, { key: nextKey(), kind: "callout", heading: "", panels: [
    { title: "What is included", tone: "accent", items: [""] },
    { title: "What is not", tone: "warn", items: [""] },
  ] }]);
  const addBuckets = () => setBlocks((p) => [...p, { key: nextKey(), kind: "buckets", heading: "Your total, at a glance", intro: "", groups: [
    { title: "Starting now", total: "", rows: [{ label: "", list: "", amount: "" }] },
  ] }]);
  const addSignature = () => setBlocks((p) => [...p, { key: nextKey(), kind: "signature", heading: "Agreement", parties: [
    { name: "" }, { name: "" },
  ] }]);
  const addLine = () => setBlocks((p) => [...p, { key: nextKey(), kind: "line", description: "", quantity: 1, unit_price: 0 }]);
  const addServiceFromCatalog = (picked: PickedService) =>
    setBlocks((p) => [...p, {
      key: nextKey(), kind: "service",
      name: picked.parts.name,
      description: picked.parts.description,
      features: picked.parts.features,
      quantity: 1,
      unit_price: picked.parts.unit_price,
      offering_id: picked.parts.offering_id,
      price_id: picked.parts.price_id,
      cadence: picked.parts.cadence,
    }]);

  // ── Derived money ────────────────────────────────────────────────────────
  // Money comes from service/line ONLY — never from a comparison card.
  const priced = blocks.filter((b): b is Extract<Block, { unit_price: number }> => b.kind === "service" || b.kind === "line");
  const subtotal = priced.reduce((s, b) => s + (Number(b.quantity) || 0) * (Number(b.unit_price) || 0), 0);
  const tax = subtotal * (Number(taxRate) / 100);
  const total = Math.max(0, subtotal + tax - Number(discount || 0));

  // ── Render blocks to the wire shape ──────────────────────────────────────
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paras = (s: string) => s.split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br/>")}</p>`).join("\n");

  function renderScopeHtml(): string {
    return blocks.map((b) => {
      if (b.kind === "text") {
        return [b.heading.trim() ? `<h3>${esc(b.heading.trim())}</h3>` : "", b.body.trim() ? paras(b.body) : ""].filter(Boolean).join("\n");
      }
      if (b.kind === "service") {
        return [
          `<h3>${esc(b.name)}</h3>`,
          b.description.trim() ? paras(b.description) : "",
          b.features.length ? `<ul>${b.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : "",
        ].filter(Boolean).join("\n");
      }
      // The new blocks render properly from blocks_json on the customer page.
      // scope_html is still written for the sent email and for any reader that
      // predates blocks, so each one degrades to an honest summary here rather
      // than vanishing from those surfaces.
      if (b.kind === "cards") {
        const cards = b.items.filter((c) => (c.name || "").trim()).map((c) => {
          const price = [c.list_price, c.price].filter(Boolean).join(" -> ");
          const head = [c.name, price, c.recommended ? "(recommended)" : ""].filter(Boolean).join(" - ");
          const feats = (c.features || []).filter(Boolean);
          return "<li>" + esc(head) + (feats.length ? "<ul>" + feats.map((f) => "<li>" + esc(f) + "</li>").join("") + "</ul>" : "") + "</li>";
        }).join("");
        if (!cards) return "";
        return [b.heading.trim() ? "<h3>" + esc(b.heading.trim()) + "</h3>" : "", b.intro.trim() ? paras(b.intro) : "", "<ul>" + cards + "</ul>"].filter(Boolean).join("\n");
      }
      if (b.kind === "callout") {
        const panels = b.panels.map((pn) => {
          const items = (pn.items || []).filter((x) => x.trim());
          if (!items.length) return "";
          return "<h3>" + esc(pn.title) + "</h3><ul>" + items.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>";
        }).filter(Boolean).join("\n");
        return panels ? [b.heading.trim() ? "<h3>" + esc(b.heading.trim()) + "</h3>" : "", panels].filter(Boolean).join("\n") : "";
      }
      if (b.kind === "buckets") {
        const groups = b.groups.map((g) => {
          const rows = (g.rows || []).filter((r) => (r.label || "").trim());
          if (!rows.length) return "";
          const head = [g.title, g.total].filter(Boolean).join(" - ");
          return "<h3>" + esc(head) + "</h3><ul>" + rows.map((r) => "<li>" + esc([r.label, r.amount].filter(Boolean).join(" - ")) + "</li>").join("") + "</ul>";
        }).filter(Boolean).join("\n");
        return groups ? [b.heading.trim() ? "<h3>" + esc(b.heading.trim()) + "</h3>" : "", b.intro.trim() ? paras(b.intro) : "", groups].filter(Boolean).join("\n") : "";
      }
      if (b.kind === "signature") return "";  // a signature line means nothing in an email body
      return ""; // plain priced rows appear in the totals table, not the narrative
    }).filter(Boolean).join("\n\n");
  }

  function collectLineItems() {
    return priced
      .filter((b) => (b.kind === "service" ? b.name.trim() : b.description.trim()))
      .map((b) => ({
        // A recurring price must SAY it is recurring. The amount column shows
        // a bare number, so "$29.99" with no cadence reads as the whole cost.
        description: (() => {
          const base = (b.kind === "service" ? b.name : b.description).trim();
          const cadence = b.kind === "service" ? b.cadence : null;
          return cadence && !base.includes(cadence) ? `${base} (${cadence})` : base;
        })(),
        quantity: Number(b.quantity) || 1,
        unit_price: Number(b.unit_price) || 0,
        line_total: (Number(b.quantity) || 1) * (Number(b.unit_price) || 0),
        // Ride through line_items_json untouched (parseLineItems passes the
        // array straight through), so this needs no API or migration change.
        ...(b.kind === "service" && b.offering_id ? { service_offering_id: b.offering_id } : {}),
        ...(b.kind === "service" && b.price_id ? { service_price_id: b.price_id } : {}),
        // Rides through line_items_json untouched; the customer page renders
        // it as the "Recommended" pill — the founder's own reference proposal
        // (MS Moments PDF) buckets services exactly this way.
        recommended: !!b.recommended,
      }));
  }

  async function submit(sendNow = false) {
    if (!title.trim()) { setErr("Type a title at the top of the document first."); return; }
    // Send-immediately needs somewhere to send. Catching this here beats the
    // API's 400 — the customer picker is right above the document.
    if (sendNow && !contactId) { setErr("Pick a customer to send it to, or press Save draft and share the link yourself."); return; }
    const line_items = collectLineItems();
    if (!line_items.length) { setErr("Add at least one service or priced line."); return; }
    setErr(null); setSaving(true);
    try {
      const res = await api.post<{ proposal_id: string; proposal_number: string }>("/proposals", {
        contact_id: contactId || null,
        title: title.trim(),
        scope_html: renderScopeHtml() || null,
        // The document as authored. scope_html + line_items above stay exactly
        // as they were, so nothing that reads them changes; this is what lets
        // the customer page rebuild the real document instead of a narrative.
        blocks: { v: 1, blocks: blocks.map(({ key: _k, ...rest }) => rest) },
        terms_html: terms.trim() || null,
        line_items,
        tax_rate: Number(taxRate) / 100,
        discount_amount: Number(discount) || 0,
        valid_until: validUntil || null,
      });
      let msg = `Created proposal ${res.proposal_number}.`;
      if (sendNow) {
        try {
          const sendRes = await api.post<{ url: string }>(`/proposals/${res.proposal_id}/send`);
          msg += ` Sent — public URL: ${sendRes.url}`;
        } catch (e) {
          msg += ` Send failed: ${apiErrorMessage(e)}`;
        }
      }
      onCreated(msg);
    } catch (e) {
      setErr(`Create failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  // Save what is on screen as a reusable template, sections and all.
  // "Standard snow removal proposal" is picked next winter, prices adjusted,
  // sent — not retyped.
  async function saveAsTemplate() {
    const name = window.prompt("Name this template", title.trim() || "Untitled proposal");
    if (!name || !name.trim()) return;
    setSavingTemplate(true); setErr(null);
    try {
      await api.post("/proposal-templates", {
        name: name.trim(),
        description: title.trim() ? `Saved from “${title.trim()}”` : null,
        body: {
          title: title.trim() || null,
          terms: terms.trim() || null,
          tax_rate: Number(taxRate) || 0,
          blocks: blocks.map(({ key: _k, ...rest }) => rest),
        },
      });
      window.alert(`Saved “${name.trim()}”. It's in the template picker for your next proposal.`);
    } catch (e) {
      setErr(`Could not save the template: ${(e as Error).message}`);
    } finally {
      setSavingTemplate(false);
    }
  }

  const blockShell: React.CSSProperties = { border: "1px solid #E2E8F0", borderRadius: 8, padding: 12, background: "#fff" };
  const blockToolbar = (b: Block, label: string, color: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color }}>{label}</span>
      {/* Only the PRICED blocks carry a document-level Recommended flag;
          comparison cards each carry their own, and a callout or a
          signature has nothing to recommend. */}
      {(b.kind === "service" || b.kind === "line") && (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: b.recommended ? "#B45309" : "#8AA6B4", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!b.recommended}
            onChange={(e) => patchBlock(b.key, { recommended: e.target.checked } as Partial<Block>)}
          />
          Recommended
        </label>
      )}
      <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
        <button onClick={() => moveBlock(b.key, -1)} title="Move up" style={miniBtn}>↑</button>
        <button onClick={() => moveBlock(b.key, 1)} title="Move down" style={miniBtn}>↓</button>
        <button onClick={() => removeBlock(b.key)} title="Remove section" style={{ ...miniBtn, color: "#B91C1C" }}>×</button>
      </span>
    </div>
  );

  // Founder 2026-08-19: no side bars — the editor is a pop-up modal, and you
  // edit ON the branded document: the same accent bar, logo, business name and
  // footer the customer receives, live while the words are typed.
  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow="OLIVER · QUOTES & PROPOSALS"
      title="New proposal"
      subtitle="What you see here is what the customer receives."
      size="info"
      footer={
        <>
          <button
            onClick={saveAsTemplate}
            disabled={savingTemplate || (!blocks.length && !title.trim())}
            style={{ ...addBtn, marginRight: "auto" }}
            title="Save these sections as a reusable template"
          >
            {savingTemplate ? "Saving template…" : "Save as template"}
          </button>
          {/* Greyed-out-with-no-reason is what made this un-shippable at
              10pm with a customer waiting: the title box on the page reads as
              a heading, so an empty title silently disabled everything. The
              button is always live now; submit() says exactly what is missing,
              here in the footer where it cannot scroll out of view. */}
          {err && (
            <span style={{ fontSize: 12, color: "#B91C1C", marginRight: 4 }}>{err}</span>
          )}
          <IadmButton variant="ghost" onClick={onClose} disabled={saving}>Cancel</IadmButton>
          {/* accent is documented as "second action — Save / Create / Confirm";
              ghost is Cancel's. Both as ghost put two identical bordered-white
              buttons side by side, which is how you click the wrong one. */}
          <IadmButton variant="accent" product="oliver" onClick={() => submit(false)} disabled={saving}>
            {saving ? "Working…" : "Save draft"}
          </IadmButton>
          {/* No title= — IadmButton does not take one. The label says it. */}
          <IadmButton variant="primary" product="oliver" onClick={() => submit(true)} disabled={saving}>
            {saving ? "Working…" : "Create & send"}
          </IadmButton>
        </>
      }
    >
        <div style={{ padding: 20, display: "grid", gap: 14, background: "#EEF3F6" }}>
          {templates.length > 0 && (
            <label style={{ display: "block" }}>
              <span style={pLabel}>Start from template (optional)</span>
              <select style={pInput} value={templateId} onChange={(e) => onSelectTemplate(e.target.value)}>
                <option value="">— No template —</option>
                {templates.map((t) => (
                  <option key={t.template_id} value={t.template_id}>
                    {t.name}{t.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label style={{ display: "block" }}>
              <span style={pLabel}>Customer</span>
              <select style={pInput} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">— Choose later —</option>
                {contacts.map((c) => (
                  <option key={c.contact_id} value={c.contact_id}>
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.company_name || c.contact_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <span style={pLabel}>Valid until</span>
              <input type="date" style={pInput} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </label>
            {/* 2026-09-02 — the "Send immediately" checkbox that used to sit
                here is gone. Sending is a primary action and was hidden beside
                a date field, so the button said "Save draft" unless you found
                and ticked it. It is now two explicit buttons at the bottom. */}
          </div>

          {/* ── The document, AS THE CUSTOMER GETS IT ─────────────────────
              Everything below is edited in place on the branded page — accent
              bar, logo, business name, footer — so what is on screen while
              typing IS the send. */}
          <DocumentBrandFrame get={api.get} docLabel="PROPOSAL">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Proposal title (required) — e.g. Your Platform Proposal"
              style={{
                width: "100%", border: 0, outline: "none", background: "transparent",
                borderBottom: "2px dashed #CBD5E1",
                fontSize: 24, fontWeight: 800, color: "#0B1C24", marginBottom: 12, padding: "0 0 4px",
              }}
            />

          {/* ── The document ───────────────────────────────────────────── */}
          <div>
            <span style={pLabel}>Proposal sections</span>
            <div style={{ display: "grid", gap: 10 }}>
              {blocks.length === 0 && (
                <div style={{ padding: 20, border: "1px dashed #CBD5E1", borderRadius: 8, textAlign: "center", fontSize: 12, color: "#64748B", background: "#fff" }}>
                  Build the proposal from sections: written parts for the pitch, services pulled
                  from your catalogue with their descriptions, and plain priced lines.
                </div>
              )}

              {blocks.map((b) => (
                <div key={b.key} style={blockShell}>
                  {b.kind === "text" && (
                    <>
                      {blockToolbar(b, "Written section", "#7C3AED")}
                      <input
                        style={{ ...pInput, fontWeight: 600, marginBottom: 6 }}
                        placeholder="Section heading — e.g. Your Recommended Path"
                        value={b.heading}
                        onChange={(e) => patchBlock(b.key, { heading: e.target.value })}
                      />
                      <textarea
                        style={{ ...pInput, minHeight: 88, resize: "vertical", lineHeight: 1.5 }}
                        placeholder="The words that sell it. Blank line starts a new paragraph."
                        value={b.body}
                        onChange={(e) => patchBlock(b.key, { body: e.target.value })}
                      />
                    </>
                  )}

                  {b.kind === "service" && (
                    <>
                      {blockToolbar(b, "Service — from your catalogue", "#0B6E8C")}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 84px 110px", gap: 8, marginBottom: 6 }}>
                        <input style={{ ...pInput, fontWeight: 600 }} value={b.name}
                          onChange={(e) => patchBlock(b.key, { name: e.target.value })} />
                        <input style={{ ...pInput, textAlign: "right" }} type="number" min={0} step={0.5} value={b.quantity}
                          onChange={(e) => patchBlock(b.key, { quantity: Number(e.target.value) })} title="Quantity" />
                        <input style={{ ...pInput, textAlign: "right" }} type="number" min={0} step={0.01} value={b.unit_price}
                          onChange={(e) => patchBlock(b.key, { unit_price: Number(e.target.value) })} title="Unit price" />
                      </div>
                      <textarea
                        style={{ ...pInput, minHeight: 64, resize: "vertical", lineHeight: 1.5, marginBottom: 6 }}
                        placeholder="What this service is and why it's worth having."
                        value={b.description}
                        onChange={(e) => patchBlock(b.key, { description: e.target.value })}
                      />
                      <textarea
                        style={{ ...pInput, minHeight: 48, resize: "vertical", fontSize: 12 }}
                        placeholder={"What's included — one bullet per line"}
                        value={b.features.join("\n")}
                        onChange={(e) => patchBlock(b.key, { features: e.target.value.split("\n") })}
                        onBlur={(e) => patchBlock(b.key, { features: e.target.value.split("\n").map((f) => f.trim()).filter(Boolean) })}
                      />
                      <div style={{ marginTop: 4, fontSize: 10, color: "#8AA6B4" }}>
                        Edits here change this proposal only — the catalogue keeps its own wording.
                      </div>
                    </>
                  )}

                  {b.kind === "line" && (
                    <>
                      {blockToolbar(b, "Priced line", "#B45309")}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 84px 110px", gap: 8 }}>
                        <input style={pInput} placeholder="Description" value={b.description}
                          onChange={(e) => patchBlock(b.key, { description: e.target.value })} />
                        <input style={{ ...pInput, textAlign: "right" }} type="number" min={0} step={0.5} value={b.quantity}
                          onChange={(e) => patchBlock(b.key, { quantity: Number(e.target.value) })} title="Quantity" />
                        <input style={{ ...pInput, textAlign: "right" }} type="number" min={0} step={0.01} value={b.unit_price}
                          onChange={(e) => patchBlock(b.key, { unit_price: Number(e.target.value) })} title="Unit price" />
                      </div>
                    </>
                  )}

                  {b.kind === "cards" && (
                    <>
                      {blockToolbar(b, "Comparison cards", "#B45309")}
                      <input
                        style={{ ...pInput, fontWeight: 600, marginBottom: 6 }}
                        placeholder="Section heading - e.g. Choose your ARION tier"
                        value={b.heading}
                        onChange={(e) => patchBlock(b.key, { heading: e.target.value } as Partial<Block>)}
                      />
                      <textarea
                        style={{ ...pInput, minHeight: 46, resize: "vertical", marginBottom: 8 }}
                        placeholder="One line of context above the cards (optional)"
                        value={b.intro}
                        onChange={(e) => patchBlock(b.key, { intro: e.target.value } as Partial<Block>)}
                      />
                      <div style={{ display: "grid", gap: 8 }}>
                        {b.items.map((c, ci) => (
                          <div key={ci} style={{ border: "1px solid #E2E8F0", borderRadius: 6, padding: 10, background: c.recommended ? "#FFF7ED" : "#F8FAFC" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 96px 96px 64px", gap: 6, marginBottom: 6 }}>
                              <input style={pInput} placeholder="Tier name" value={c.name}
                                onChange={(e) => patchCard(b.key, ci, { name: e.target.value })} />
                              <input style={pInput} placeholder="Was $34.99" value={c.list_price || ""}
                                onChange={(e) => patchCard(b.key, ci, { list_price: e.target.value })} />
                              <input style={pInput} placeholder="Now $14" value={c.price || ""}
                                onChange={(e) => patchCard(b.key, ci, { price: e.target.value })} />
                              <input style={pInput} placeholder="/mo" value={c.per || ""}
                                onChange={(e) => patchCard(b.key, ci, { per: e.target.value })} />
                            </div>
                            <input style={{ ...pInput, marginBottom: 6 }} placeholder="One-line pitch for this tier"
                              value={c.pitch || ""} onChange={(e) => patchCard(b.key, ci, { pitch: e.target.value })} />
                            <textarea
                              style={{ ...pInput, minHeight: 56, resize: "vertical" }}
                              placeholder="Features - one per line"
                              value={(c.features || []).join("\n")}
                              onChange={(e) => patchCard(b.key, ci, { features: e.target.value.split("\n") })}
                            />
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                              <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: c.recommended ? "#B45309" : "#8AA6B4", cursor: "pointer" }}>
                                <input type="checkbox" checked={!!c.recommended}
                                  onChange={(e) => patchCard(b.key, ci, { recommended: e.target.checked })} />
                                Recommended
                              </label>
                              <input style={{ ...pInput, maxWidth: 190 }} placeholder="Badge override"
                                value={c.badge || ""} onChange={(e) => patchCard(b.key, ci, { badge: e.target.value })} />
                              <button style={{ ...miniBtn, marginLeft: "auto", color: "#B91C1C" }} title="Remove card"
                                onClick={() => patchBlock(b.key, { items: b.items.filter((_, x) => x !== ci) } as Partial<Block>)}>x</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button style={{ ...addBtn, marginTop: 8 }}
                        onClick={() => patchBlock(b.key, { items: [...b.items, { name: "", pitch: "", price: "", features: [] }] } as Partial<Block>)}>
                        + Add card
                      </button>
                      <div style={{ fontSize: 10, color: "#8AA6B4", marginTop: 6 }}>
                        Cards are a comparison - they show options side by side and do not change the total.
                        The priced truth stays in your services and priced lines.
                      </div>
                    </>
                  )}

                  {b.kind === "callout" && (
                    <>
                      {blockToolbar(b, "Two-column callout", "#0F766E")}
                      <input
                        style={{ ...pInput, fontWeight: 600, marginBottom: 8 }}
                        placeholder="Section heading (optional)"
                        value={b.heading}
                        onChange={(e) => patchBlock(b.key, { heading: e.target.value } as Partial<Block>)}
                      />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {b.panels.map((pn, pi) => (
                          <div key={pi} style={{ border: "1px solid #E2E8F0", borderRadius: 6, padding: 10, background: "#F8FAFC" }}>
                            <input style={{ ...pInput, fontWeight: 600, marginBottom: 6 }} placeholder="Panel title"
                              value={pn.title} onChange={(e) => patchPanel(b.key, pi, { title: e.target.value })} />
                            <textarea style={{ ...pInput, minHeight: 76, resize: "vertical" }}
                              placeholder="One point per line"
                              value={(pn.items || []).join("\n")}
                              onChange={(e) => patchPanel(b.key, pi, { items: e.target.value.split("\n") })} />
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "#8AA6B4", marginTop: 6, cursor: "pointer" }}>
                              <input type="checkbox" checked={pn.tone === "warn"}
                                onChange={(e) => patchPanel(b.key, pi, { tone: e.target.checked ? "warn" : "accent" })} />
                              Flag colour (gaps / exclusions)
                            </label>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {b.kind === "buckets" && (
                    <>
                      {blockToolbar(b, "Totals at a glance", "#1D4ED8")}
                      <input
                        style={{ ...pInput, fontWeight: 600, marginBottom: 6 }}
                        placeholder="Section heading"
                        value={b.heading}
                        onChange={(e) => patchBlock(b.key, { heading: e.target.value } as Partial<Block>)}
                      />
                      <textarea style={{ ...pInput, minHeight: 40, resize: "vertical", marginBottom: 8 }}
                        placeholder="Context line (optional)"
                        value={b.intro} onChange={(e) => patchBlock(b.key, { intro: e.target.value } as Partial<Block>)} />
                      <div style={{ display: "grid", gap: 8 }}>
                        {b.groups.map((g, gi) => (
                          <div key={gi} style={{ border: "1px solid #E2E8F0", borderRadius: 6, padding: 10, background: "#F8FAFC" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 30px", gap: 6, marginBottom: 6 }}>
                              <input style={{ ...pInput, fontWeight: 600 }} placeholder="Group - e.g. Starting now"
                                value={g.title} onChange={(e) => patchGroup(b.key, gi, { title: e.target.value })} />
                              <input style={pInput} placeholder="$74.00 / mo"
                                value={g.total || ""} onChange={(e) => patchGroup(b.key, gi, { total: e.target.value })} />
                              <button style={{ ...miniBtn, color: "#B91C1C" }} title="Remove group"
                                onClick={() => patchBlock(b.key, { groups: b.groups.filter((_, x) => x !== gi) } as Partial<Block>)}>x</button>
                            </div>
                            <textarea style={{ ...pInput, minHeight: 60, resize: "vertical" }}
                              placeholder={"One row per line:  Label | was | amount"}
                              value={(g.rows || []).map((r) => [r.label, r.list, r.amount].filter((x) => x != null).join(" | ")).join("\n")}
                              onChange={(e) => patchGroup(b.key, gi, {
                                rows: e.target.value.split("\n").map((ln) => {
                                  const parts = ln.split("|").map((x) => x.trim());
                                  return { label: parts[0] || "", list: parts[1] || "", amount: parts[2] || "" };
                                }),
                              })} />
                          </div>
                        ))}
                      </div>
                      <button style={{ ...addBtn, marginTop: 8 }}
                        onClick={() => patchBlock(b.key, { groups: [...b.groups, { title: "", total: "", rows: [{ label: "", list: "", amount: "" }] }] } as Partial<Block>)}>
                        + Add group
                      </button>
                    </>
                  )}

                  {b.kind === "signature" && (
                    <>
                      {blockToolbar(b, "Signature block", "#475569")}
                      <input
                        style={{ ...pInput, fontWeight: 600, marginBottom: 8 }}
                        placeholder="Heading - e.g. Agreement and signatures"
                        value={b.heading}
                        onChange={(e) => patchBlock(b.key, { heading: e.target.value } as Partial<Block>)}
                      />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {b.parties.map((pt, pi) => (
                          <input key={pi} style={pInput} placeholder={pi === 0 ? "Customer name" : "Your business name"}
                            value={pt.name}
                            onChange={(e) => patchBlock(b.key, {
                              parties: b.parties.map((x, xi) => (xi === pi ? { ...x, name: e.target.value } : x)),
                            } as Partial<Block>)} />
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: "#8AA6B4", marginTop: 6 }}>
                        Renders signature, printed name and date lines for both parties.
                      </div>
                    </>
                  )}

                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 8 }}>
              <button onClick={addText} style={addBtn}>+ Written section</button>
              <button onClick={addLine} style={addBtn}>+ Priced line</button>
              <ProposalCatalogPicker get={api.get} ready onPick={addServiceFromCatalog} />
              <span style={{ width: 1, height: 20, background: "#E2E8F0" }} />
              <button onClick={addCards} style={addBtn}>+ Comparison cards</button>
              <button onClick={addCallout} style={addBtn}>+ Two-column callout</button>
              <button onClick={addBuckets} style={addBtn}>+ Totals at a glance</button>
              <button onClick={addSignature} style={addBtn}>+ Signature block</button>
            </div>
          </div>

          {/* ── Money ──────────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "block" }}>
              <span style={pLabel}>Tax rate (%)</span>
              <input type="number" min="0" step="0.01" style={pInput} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </label>
            <label style={{ display: "block" }}>
              <span style={pLabel}>Discount ($)</span>
              <input type="number" min="0" step="0.01" style={pInput} value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </label>
          </div>

          <div style={{ padding: 12, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "#5A7A8A" }}>Subtotal</span>
              <span style={{ color: "#0B1C24", fontFamily: "monospace" }}>{fmtMoney(subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "#5A7A8A" }}>Tax ({taxRate}%)</span>
              <span style={{ color: "#0B1C24", fontFamily: "monospace" }}>{fmtMoney(tax)}</span>
            </div>
            {Number(discount) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#5A7A8A" }}>Discount</span>
                <span style={{ color: "#0B1C24", fontFamily: "monospace" }}>-{fmtMoney(Number(discount))}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid #E2E8F0", paddingTop: 6 }}>
              <span>Total</span>
              <span style={{ fontFamily: "monospace" }}>{fmtMoney(total)}</span>
            </div>
          </div>

          <label style={{ display: "block" }}>
            <span style={pLabel}>Terms</span>
            <textarea style={{ ...pInput, minHeight: 56, resize: "vertical" }}
              value={terms} onChange={(e) => setTerms(e.target.value)} />
          </label>

          </DocumentBrandFrame>

          {err && (
            <div style={{ padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>{err}</div>
          )}
        </div>
    </IadmModal>
  );
}

const miniBtn: React.CSSProperties = { border: "1px solid #E2E8F0", background: "#fff", borderRadius: 4, width: 22, height: 22, fontSize: 12, color: "#5A7A8A", cursor: "pointer", lineHeight: 1 };
const addBtn: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#1A7DB5", background: "transparent", border: 0, cursor: "pointer", padding: 0 };

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
  const [showAddRevision, setShowAddRevision] = useState(false);

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
      <div style={{ marginBottom: 16, padding: 12, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#5A7A8A" }}>Total</span>
          <span style={{ color: "#0B1C24", fontFamily: "monospace", fontWeight: 700 }}>
            {fmtMoney(proposalSummary?.total)}
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
            <Button
              variant="primary"
              onClick={() => setShowAddRevision(true)}
              disabled={isPaused}
              title={isPaused ? "Cannot add a revision while paused for payment" : ""}
            >
              + Add revision
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
                    <div style={{ textAlign: "right" }}>
                      {rev.status === "draft" && (
                        <Button
                          variant="primary"
                          onClick={async () => {
                            try {
                              await api.post(`/proposals/${proposalId}/revisions/${rev.revision_id}/send`);
                              await reloadRevisions();
                              onChanged();
                            } catch (e) {
                              setRevsErr((e as Error).message);
                            }
                          }}
                        >Send</Button>
                      )}
                      {rev.status === "sent" && rev.public_token && (
                        <a
                          href={`/p/revisions/${rev.public_token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 11, color: "#1A7DB5", fontWeight: 600 }}
                        >
                          View link
                        </a>
                      )}
                      {(rev.status === "accepted" || rev.status === "rejected" || rev.status === "lapsed") && (
                        <span style={{ fontSize: 10, color: "#94A3B8" }}>—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showAddRevision && (
            <AddRevisionModal
              open
              proposalId={proposalId}
              freeRevisionsUsed={usedFreeRevisions}
              onClose={() => setShowAddRevision(false)}
              onCreated={async () => {
                setShowAddRevision(false);
                await reloadRevisions();
                onChanged();
              }}
              api={api}
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

// ──────────────────────────────────────────────────────────────────────────
// F3 — AddRevisionModal
//
// Founder UI for creating a draft revision.  When freeRevisionsUsed >= 1
// the requires_payment toggle is force-checked and disabled (Brandon-lock:
// 1 free revision per proposal, then chargeable).
// ──────────────────────────────────────────────────────────────────────────
function AddRevisionModal({
  open, proposalId, freeRevisionsUsed, onClose, onCreated, api,
}: {
  open: boolean;
  proposalId: string;
  freeRevisionsUsed: number;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
  };
}) {
  // Whole-dollar input for the delta — converted to cents on submit.
  const [deltaDollars, setDeltaDollars] = useState("");
  const [scopeNotes, setScopeNotes] = useState("");
  // Defaults: if a free revision is still available, requires_payment off.
  // Once used, force-on.
  const forcedPaid = freeRevisionsUsed >= 1;
  const [requiresPayment, setRequiresPayment] = useState<boolean>(forcedPaid);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    setErr(null);
    const dollars = Number(deltaDollars);
    let deltaCents: number | null = null;
    if (deltaDollars.trim() !== "") {
      if (!Number.isFinite(dollars) || dollars < 0) {
        setErr("Delta must be a non-negative number");
        return;
      }
      deltaCents = Math.round(dollars * 100);
    }
    if (requiresPayment && (!deltaCents || deltaCents <= 0)) {
      setErr("Paid revisions need a delta > $0");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/proposals/${proposalId}/revisions`, {
        delta_cents: deltaCents,
        scope_change_notes: scopeNotes.trim() || null,
        requires_payment: requiresPayment,
      });
      await onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)",
      zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 500, background: "#fff", borderRadius: 10,
        boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
      }}>
        <div style={{ padding: 18, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1A3A4A" }}>Add revision</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 18, display: "grid", gap: 14 }}>
          <label style={{ display: "block" }}>
            <span style={pLabel}>Scope change notes</span>
            <textarea
              rows={4}
              style={{ ...pInput, resize: "vertical" }}
              placeholder="Describe what changed, what's new, what's removed…"
              value={scopeNotes}
              onChange={(e) => setScopeNotes(e.target.value)}
              autoFocus
            />
          </label>

          <label style={{ display: "block" }}>
            <span style={pLabel}>Delta ($) — additional or new amount</span>
            <input
              type="number" min="0" step="0.01" style={pInput}
              placeholder="0.00"
              value={deltaDollars}
              onChange={(e) => setDeltaDollars(e.target.value)}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#0B1C24" }}>
            <input
              type="checkbox"
              checked={requiresPayment}
              disabled={forcedPaid}
              onChange={(e) => setRequiresPayment(e.target.checked)}
            />
            <span>
              Requires payment
              {forcedPaid && (
                <span style={{ marginLeft: 6, fontSize: 10, color: "#92400E" }}>
                  (free revision already used)
                </span>
              )}
            </span>
          </label>

          {err && (
            <div style={{ padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>{err}</div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={busy}>
              {busy ? "Creating…" : "Create draft revision"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

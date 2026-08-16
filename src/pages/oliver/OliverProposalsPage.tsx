import { useCallback, useEffect, useMemo, useState } from "react";
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

interface Proposal {
  proposal_id: string;
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
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export function OliverProposalsPage() {
  const insightsPayload = useProductInsightsPayload('oliver');
  const { get, post, ready } = useOliverApi();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
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
        actions={<Button variant="primary" onClick={() => setShowCreate(true)}>+ New proposal</Button>}
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

      {!proposals.length && !loading ? (
        <EmptyState
          title="No proposals yet"
          description="Send your first branded proposal. The customer gets a tracked link they click to accept — OLIVER auto-creates the quote on acceptance."
          action={<Button variant="primary" onClick={() => setShowCreate(true)}>+ Create your first proposal</Button>}
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
function CreateProposalDrawer({
  onClose, onCreated, api,
}: {
  onClose: () => void;
  onCreated: (msg: string) => void;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
  };
}) {
  const [contacts, setContacts] = useState<Array<{ contact_id: string; first_name?: string; last_name?: string; email?: string; company_name?: string }>>([]);
  const [contactId, setContactId] = useState("");
  // #77 — Proposal template picker. Fetched alongside contacts; canonical
  // template.body shape:
  //   { title?, scope?, terms?, line_items?, tax_rate?, valid_until_days? }
  const [templates, setTemplates] = useState<Array<{ template_id: string; name: string; body: any; is_default?: boolean }>>([]);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [terms, setTerms] = useState("Payment due within 30 days of acceptance.");
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [taxRate, setTaxRate] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [items, setItems] = useState<Array<{ description: string; quantity: number; unit_price: number }>>([
    { description: "", quantity: 1, unit_price: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sendImmediately, setSendImmediately] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<Array<{ contact_id: string; first_name?: string; last_name?: string; email?: string; company_name?: string }>>("/contacts?per_page=200");
        setContacts(Array.isArray(r) ? r : []);
      } catch { setContacts([]); }
      try {
        const t = await api.get<Array<{ template_id: string; name: string; body: any; is_default?: boolean }>>("/proposal-templates");
        const list = Array.isArray(t) ? t : [];
        setTemplates(list);
        // Auto-pick the default template on mount, if any.
        if (list.length > 0) {
          const def = list.find((x) => x.is_default);
          if (def) {
            setTemplateId((prev) => {
              if (prev) return prev;
              applyTemplate(def);
              return def.template_id;
            });
          }
        }
      } catch { setTemplates([]); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  function applyTemplate(t: { template_id: string; name: string; body: any }) {
    const b = t.body || {};
    if (typeof b.title === "string" && b.title.trim()) setTitle(b.title);
    if (typeof b.scope === "string") setScope(b.scope);
    if (typeof b.terms === "string") setTerms(b.terms);
    if (typeof b.tax_rate === "number") setTaxRate(String(b.tax_rate));
    if (Array.isArray(b.line_items) && b.line_items.length > 0) {
      setItems(b.line_items.map((it: any) => ({
        description: String(it?.description ?? ""),
        quantity: Number(it?.quantity ?? 1),
        unit_price: Number(it?.unit_price ?? 0),
      })));
    }
    if (typeof b.valid_until_days === "number" && b.valid_until_days > 0) {
      const d = new Date();
      d.setDate(d.getDate() + b.valid_until_days);
      setValidUntil(d.toISOString().slice(0, 10));
    }
  }

  function onSelectTemplate(id: string) {
    setTemplateId(id);
    if (!id) return;
    const t = templates.find((x) => x.template_id === id);
    if (t) applyTemplate(t);
  }

  const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
  const tax = subtotal * (Number(taxRate) / 100);
  const total = Math.max(0, subtotal + tax - Number(discount || 0));

  function updateItem(i: number, patch: Partial<{ description: string; quantity: number; unit_price: number }>) {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }
  function addItem() { setItems((prev) => [...prev, { description: "", quantity: 1, unit_price: 0 }]); }
  function removeItem(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)); }

  async function submit() {
    if (!title.trim()) { setErr("Title is required"); return; }
    if (!items.length || items.every((it) => !it.description.trim())) { setErr("Add at least one line item"); return; }
    setErr(null); setSaving(true);
    try {
      const line_items = items
        .filter((it) => it.description.trim())
        .map((it) => ({
          description: it.description.trim(),
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          line_total: Number(it.quantity) * Number(it.unit_price),
        }));
      const res = await api.post<{ proposal_id: string; proposal_number: string }>("/proposals", {
        contact_id: contactId || null,
        title: title.trim(),
        scope_html: scope.trim() || null,
        terms_html: terms.trim() || null,
        line_items,
        tax_rate: Number(taxRate) / 100,
        discount_amount: Number(discount) || 0,
        valid_until: validUntil || null,
      });
      let msg = `Created proposal ${res.proposal_number}.`;
      if (sendImmediately) {
        try {
          const sendRes = await api.post<{ url: string }>(`/proposals/${res.proposal_id}/send`);
          msg += ` Sent — public URL: ${sendRes.url}`;
        } catch (e) {
          msg += ` (auto-send failed: ${(e as Error).message})`;
        }
      }
      onCreated(msg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 560, height: "100%", background: "#fff", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }}>
        <div style={{ padding: 20, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A3A4A" }}>New proposal</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 14 }}>
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

          <label style={{ display: "block" }}>
            <span style={pLabel}>Proposal title</span>
            <input type="text" style={pInput}
              placeholder="Kitchen Remodel Proposal — Smith Residence"
              value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>

          <label style={{ display: "block" }}>
            <span style={pLabel}>Customer (optional)</span>
            <select style={pInput} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">No customer linked</option>
              {contacts.map((c) => (
                <option key={c.contact_id} value={c.contact_id}>
                  {c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "(no name)"}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "block" }}>
            <span style={pLabel}>Scope of work</span>
            <textarea rows={4} style={{ ...pInput, resize: "vertical" }}
              placeholder="Describe what's included in this proposal…"
              value={scope} onChange={(e) => setScope(e.target.value)} />
          </label>

          {/* Line items */}
          <div>
            <span style={pLabel}>Line items</span>
            <div style={{ border: "1px solid #E2E8F0", borderRadius: 6 }}>
              {items.map((it, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr 70px 100px 32px",
                  gap: 6, padding: 8, alignItems: "center",
                  borderBottom: i < items.length - 1 ? "1px solid #F1F5F9" : "none",
                }}>
                  <input type="text" placeholder="Description" value={it.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                    style={{ padding: "5px 8px", fontSize: 12, border: "1px solid #D5E2E8", borderRadius: 4 }} />
                  <input type="number" min="0" step="0.5" value={it.quantity}
                    onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                    style={{ padding: "5px 8px", fontSize: 12, border: "1px solid #D5E2E8", borderRadius: 4, textAlign: "right" }} />
                  <input type="number" min="0" step="0.01" value={it.unit_price}
                    onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })}
                    style={{ padding: "5px 8px", fontSize: 12, border: "1px solid #D5E2E8", borderRadius: 4, textAlign: "right" }} />
                  <button onClick={() => removeItem(i)} title="Remove"
                    style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 16 }}>×</button>
                </div>
              ))}
            </div>
            <button onClick={addItem} style={{ fontSize: 11, fontWeight: 600, color: "#1A7DB5", background: "transparent", border: 0, cursor: "pointer", marginTop: 8, padding: 0 }}>
              + Add line item
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label style={{ display: "block" }}>
              <span style={pLabel}>Tax rate (%)</span>
              <input type="number" min="0" step="0.01" style={pInput}
                value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </label>
            <label style={{ display: "block" }}>
              <span style={pLabel}>Discount ($)</span>
              <input type="number" min="0" step="0.01" style={pInput}
                value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </label>
            <label style={{ display: "block" }}>
              <span style={pLabel}>Valid until</span>
              <input type="date" style={pInput} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </label>
          </div>

          {/* Totals preview */}
          <div style={{ padding: 12, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}>
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
                <span style={{ color: "#059669" }}>Discount</span>
                <span style={{ color: "#059669", fontFamily: "monospace" }}>−{fmtMoney(Number(discount))}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: "1px solid #E2E8F0" }}>
              <span style={{ color: "#1A3A4A", fontWeight: 700 }}>Total</span>
              <span style={{ color: "#1A3A4A", fontFamily: "monospace", fontWeight: 700 }}>{fmtMoney(total)}</span>
            </div>
          </div>

          <label style={{ display: "block" }}>
            <span style={pLabel}>Terms & conditions</span>
            <textarea rows={2} style={{ ...pInput, resize: "vertical" }}
              value={terms} onChange={(e) => setTerms(e.target.value)} />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#0B1C24" }}>
            <input type="checkbox" checked={sendImmediately} onChange={(e) => setSendImmediately(e.target.checked)} />
            Send immediately after creating
          </label>

          {err && (
            <div style={{ padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>{err}</div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !title.trim()}>
              {saving ? "Creating…" : sendImmediately ? "Create & send" : "Save draft"}
            </Button>
          </div>
        </div>
      </div>
    </div>
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

function ProposalDetailDrawer({
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

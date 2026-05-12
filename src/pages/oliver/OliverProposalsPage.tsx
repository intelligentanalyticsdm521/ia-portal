import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, DataTable, EmptyState, Button, FilterBar, type Column,
} from "../../components/oliver/ui";

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
  const { get, post, ready } = useOliverApi();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

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
            onRowClick={(p) => window.location.href = `/app/services/oliver_proposals?focus=${p.proposal_id}`}
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
    })();
  }, [api]);

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

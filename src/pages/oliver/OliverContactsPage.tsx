import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState,
  StatusBadge, type Column,
} from "../../components/oliver/ui";

interface Contact {
  contact_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
}

interface FinancialSnapshot {
  total_jobs: number;
  total_invoiced: number;
  total_paid: number;
  total_refunded: number;
  outstanding_balance: number;
  net_collected: number;
  last_job_date?: string | null;
  last_payment_date?: string | null;
  avg_invoice_value: number;
  service_types?: string | null;
}

interface ContactDetail extends Contact {
  addresses?: Array<{ address_line_1: string; city: string; state: string; postal_code: string }>;
  financial_snapshot?: FinancialSnapshot;
}

interface Activity {
  jobs: Array<{ job_id: string; job_number: string; title: string; status: string; scheduled_start?: string | null; created_at: string; completed_by?: string | null }>;
  quotes: Array<{ quote_id: string; status: string; total: number; valid_until?: string | null; created_at: string }>;
  invoices: Array<{ invoice_id: string; invoice_number: string; status: string; total: number; amount_paid: number; balance_due: number; paid_at?: string | null; created_at: string; source: string }>;
  payments: Array<{ payment_id: string; amount: number; type: string; status: string; paid_at?: string | null; invoice_number?: string | null }>;
}

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}
function contactName(c: Contact) {
  return c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "(no name)";
}

export function OliverContactsPage() {
  const { get, ready } = useOliverApi();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<Contact[]>("/contacts");
      setContacts(data || []);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) =>
      contactName(c).toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.company_name?.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const columns: Column<Contact>[] = [
    {
      key: "name", header: "Name", sortable: true,
      sortAccessor: (c) => contactName(c).toLowerCase(),
      render: (c) => <strong style={{ color: "#0B1C24" }}>{contactName(c)}</strong>,
    },
    { key: "email",   header: "Email",   render: (c) => c.email || "—" },
    { key: "phone",   header: "Phone",   render: (c) => c.phone || "—" },
    { key: "company", header: "Company", render: (c) => c.company_name || "—" },
  ];

  return (
    <OliverPageWrapper title="Customers" subtitle="Customer database" error={error} loading={loading}>
      <PageHeader
        title="Customers"
        subtitle="Search any customer to see all their jobs, quotes, invoices, and payments"
      />
      {!contacts.length ? (
        <EmptyState title="No customers yet" description="Customers appear here as soon as you create a job, quote, or invoice for them — or when they sign up via the customer portal." />
      ) : (
        <>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name, email, phone, or company…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(c) => c.contact_id}
            onRowClick={(c) => setPickedId(c.contact_id)}
            emptyMessage="No customers match this search."
          />
        </>
      )}

      {pickedId && <ContactDetailModal contactId={pickedId} onClose={() => setPickedId(null)} api={{ get }} />}
    </OliverPageWrapper>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

function ContactDetailModal({ contactId, onClose, api }: { contactId: string; onClose: () => void; api: { get: <T>(p: string) => Promise<T> } }) {
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [tab, setTab] = useState<"overview" | "jobs" | "quotes" | "invoices" | "payments">("overview");

  useEffect(() => {
    (async () => {
      const [d, a] = await Promise.all([
        api.get<ContactDetail>(`/contacts/${contactId}`),
        api.get<Activity>(`/contacts/${contactId}/activity`),
      ]);
      setDetail(d);
      setActivity(a);
    })();
  }, [contactId, api]);

  if (!detail || !activity) {
    return <DetailDrawer open onClose={onClose} title="Loading…" width="xl"><div style={{ padding: 20, color: "#5A7A8A" }}>Loading customer…</div></DetailDrawer>;
  }

  const snap = detail.financial_snapshot;
  const addr = detail.addresses?.[0];

  return (
    <DetailDrawer
      open onClose={onClose}
      title={contactName(detail)}
      subtitle={[detail.email, detail.phone].filter(Boolean).join(" · ")}
      width="xl"
    >
      <div className="ptabs" style={{ marginBottom: 16 }}>
        <button className={`ptab${tab === "overview" ? " active" : ""}`} onClick={() => setTab("overview")}>Overview</button>
        <button className={`ptab${tab === "jobs" ? " active" : ""}`} onClick={() => setTab("jobs")}>Jobs ({activity.jobs.length})</button>
        <button className={`ptab${tab === "quotes" ? " active" : ""}`} onClick={() => setTab("quotes")}>Quotes ({activity.quotes.length})</button>
        <button className={`ptab${tab === "invoices" ? " active" : ""}`} onClick={() => setTab("invoices")}>Invoices ({activity.invoices.length})</button>
        <button className={`ptab${tab === "payments" ? " active" : ""}`} onClick={() => setTab("payments")}>Payments ({activity.payments.length})</button>
      </div>

      {tab === "overview" && snap && (
        <>
          <div className="stat-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
            <div className="stat-card">
              <div className="stat-lbl">Lifetime value</div>
              <div className="stat-val">{fmtMoney(snap.net_collected)}</div>
              <div className="stat-delta neu">net of refunds</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Total jobs</div>
              <div className="stat-val">{snap.total_jobs}</div>
              <div className="stat-delta neu">last: {fmtDate(snap.last_job_date)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Avg invoice</div>
              <div className="stat-val">{fmtMoney(snap.avg_invoice_value)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Outstanding</div>
              <div className="stat-val">{fmtMoney(snap.outstanding_balance)}</div>
              <div className="stat-delta neu">last paid: {fmtDate(snap.last_payment_date)}</div>
            </div>
          </div>

          {addr && (
            <div className="card">
              <div className="card-ttl">Service address</div>
              <div className="card-sub">{addr.address_line_1}, {addr.city}, {addr.state} {addr.postal_code}</div>
            </div>
          )}

          {snap.service_types && (
            <div className="card">
              <div className="card-ttl">Services used</div>
              <div className="card-sub">{snap.service_types}</div>
            </div>
          )}
        </>
      )}

      {tab === "jobs" && (
        <table className="tbl">
          <thead><tr>
            <th>Job #</th><th>Title</th><th>Status</th><th>Scheduled</th><th>Completed by</th>
          </tr></thead>
          <tbody>
            {activity.jobs.map((j) => (
              <tr key={j.job_id}>
                <td><strong>{j.job_number}</strong></td>
                <td>{j.title || "—"}</td>
                <td><StatusBadge status={j.status} /></td>
                <td>{fmtDate(j.scheduled_start)}</td>
                <td>{j.completed_by || "—"}</td>
              </tr>
            ))}
            {!activity.jobs.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: "20px 0", color: "#5A7A8A" }}>No jobs yet</td></tr>}
          </tbody>
        </table>
      )}

      {tab === "quotes" && (
        <table className="tbl">
          <thead><tr>
            <th>Status</th><th style={{ textAlign: "right" }}>Total</th><th>Valid until</th><th>Created</th>
          </tr></thead>
          <tbody>
            {activity.quotes.map((q) => (
              <tr key={q.quote_id}>
                <td><StatusBadge status={q.status} /></td>
                <td style={{ textAlign: "right" }}>{fmtMoney(q.total)}</td>
                <td>{fmtDate(q.valid_until)}</td>
                <td>{fmtDate(q.created_at)}</td>
              </tr>
            ))}
            {!activity.quotes.length && <tr><td colSpan={4} style={{ textAlign: "center", padding: "20px 0", color: "#5A7A8A" }}>No quotes yet</td></tr>}
          </tbody>
        </table>
      )}

      {tab === "invoices" && (
        <table className="tbl">
          <thead><tr>
            <th>Invoice #</th><th>Status</th><th style={{ textAlign: "right" }}>Total</th>
            <th style={{ textAlign: "right" }}>Paid</th><th style={{ textAlign: "right" }}>Balance</th>
            <th>Source</th><th>Date</th>
          </tr></thead>
          <tbody>
            {activity.invoices.map((i) => (
              <tr key={i.invoice_id}>
                <td><strong>{i.invoice_number}</strong></td>
                <td><StatusBadge status={i.status} /></td>
                <td style={{ textAlign: "right" }}>{fmtMoney(i.total)}</td>
                <td style={{ textAlign: "right" }}>{fmtMoney(i.amount_paid)}</td>
                <td style={{ textAlign: "right" }}>{fmtMoney(i.balance_due)}</td>
                <td style={{ fontSize: 10, textTransform: "uppercase", color: "#5A7A8A" }}>{i.source || "oliver"}</td>
                <td>{fmtDate(i.created_at)}</td>
              </tr>
            ))}
            {!activity.invoices.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: "20px 0", color: "#5A7A8A" }}>No invoices yet</td></tr>}
          </tbody>
        </table>
      )}

      {tab === "payments" && (
        <table className="tbl">
          <thead><tr>
            <th>Date</th><th>Invoice</th><th>Type</th><th style={{ textAlign: "right" }}>Amount</th><th>Status</th>
          </tr></thead>
          <tbody>
            {activity.payments.map((p) => (
              <tr key={p.payment_id}>
                <td>{fmtDate(p.paid_at)}</td>
                <td>{p.invoice_number ? <span style={{ fontFamily: "monospace" }}>{p.invoice_number}</span> : "—"}</td>
                <td>{p.type}</td>
                <td style={{ textAlign: "right", color: p.type === "refund" ? "#9333EA" : "#059669" }}>
                  {p.type === "refund" ? "−" : ""}{fmtMoney(p.amount)}
                </td>
                <td><StatusBadge status={p.status} /></td>
              </tr>
            ))}
            {!activity.payments.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: "20px 0", color: "#5A7A8A" }}>No payments yet</td></tr>}
          </tbody>
        </table>
      )}
    </DetailDrawer>
  );
}

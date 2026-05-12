import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { oliverDownload } from "../../lib/oliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState,
  StatusBadge, Button, type Column,
} from "../../components/oliver/ui";

const CUSTOMER_PILLS = [
  { key: "", label: "All" },
  { key: "f:overdue", label: "Has overdue" },
  { key: "f:outstanding", label: "Has outstanding" },
  { key: "f:paying", label: "Active paying" },
  { key: "f:new", label: "New (no invoices)" },
];

interface Contact {
  contact_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  outstanding_balance?: number;
  overdue_balance?: number;
  overdue_count?: number;
  total_paid?: number;
  last_payment_at?: string | null;
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
  const { get, post, ready } = useOliverApi();
  const { instance, accounts } = useMsal();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    const account = accounts[0];
    if (!account) return;
    setExporting(true);
    try {
      await oliverDownload(instance, account, "/exports/contacts.csv", `contacts-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  }

  const [filter, setFilter] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    customers: { imported: number; contacts_created: number; mappings_updated: number; total: number };
    invoices: { imported: number; relinked: number; total: number };
    subscriptions: { imported: number; relinked: number; total: number };
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function syncFromStripe() {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const result = await post<{
        customers: { imported: number; contacts_created: number; mappings_updated: number; total: number };
        invoices: { imported: number; relinked: number; total: number };
        subscriptions: { imported: number; relinked: number; total: number };
      }>("/settings/stripe/import");
      setSyncResult(result);
      await reload(); // Refresh the contacts list
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setSyncError(msg);
    } finally {
      setSyncing(false);
    }
  }

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
    let list = contacts;
    if (filter === "f:overdue") list = list.filter((c) => (c.overdue_count ?? 0) > 0);
    else if (filter === "f:outstanding") list = list.filter((c) => (c.outstanding_balance ?? 0) > 0);
    else if (filter === "f:paying") list = list.filter((c) => (c.total_paid ?? 0) > 0);
    else if (filter === "f:new") list = list.filter((c) => (c.total_paid ?? 0) === 0 && (c.outstanding_balance ?? 0) === 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        contactName(c).toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.company_name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [contacts, search, filter]);

  const totalOutstanding = contacts.reduce((s, c) => s + Number(c.outstanding_balance || 0), 0);
  const totalOverdue = contacts.reduce((s, c) => s + Number(c.overdue_balance || 0), 0);
  const withOverdue = contacts.filter((c) => (c.overdue_count ?? 0) > 0).length;
  const activePaying = contacts.filter((c) => (c.total_paid ?? 0) > 0).length;

  function fmtMoneyShort(n?: number | null) {
    return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  const columns: Column<Contact>[] = [
    {
      key: "name", header: "Name", sortable: true,
      sortAccessor: (c) => contactName(c).toLowerCase(),
      render: (c) => (
        <div>
          <strong style={{ color: "#0B1C24" }}>{contactName(c)}</strong>
          {(c.overdue_count ?? 0) > 0 && (
            <span style={{
              display: "inline-block", marginLeft: 8, fontSize: 10, fontWeight: 600,
              padding: "2px 6px", borderRadius: 999, background: "#FEE2E2", color: "#991B1B",
            }}>
              {c.overdue_count} overdue
            </span>
          )}
        </div>
      ),
    },
    { key: "email",   header: "Email",   render: (c) => c.email || "—" },
    { key: "phone",   header: "Phone",   render: (c) => c.phone || "—" },
    {
      key: "outstanding_balance", header: "Outstanding", align: "right", sortable: true,
      sortAccessor: (c) => Number(c.outstanding_balance ?? 0),
      render: (c) => (c.outstanding_balance ?? 0) > 0
        ? <span style={{ fontFamily: "monospace", color: (c.overdue_count ?? 0) > 0 ? "#DC2626" : "#0B1C24", fontWeight: 600 }}>
            {fmtMoneyShort(c.outstanding_balance)}
          </span>
        : <span style={{ color: "#94A3B8" }}>—</span>,
    },
    {
      key: "total_paid", header: "Lifetime paid", align: "right", sortable: true,
      sortAccessor: (c) => Number(c.total_paid ?? 0),
      render: (c) => (c.total_paid ?? 0) > 0
        ? <span style={{ fontFamily: "monospace", color: "#059669", fontWeight: 600 }}>{fmtMoneyShort(c.total_paid)}</span>
        : <span style={{ color: "#94A3B8" }}>—</span>,
    },
  ];

  return (
    <OliverPageWrapper title="Customers" subtitle="Customer database" error={error} loading={loading}>
      <PageHeader
        title="Customers"
        subtitle="Search any customer to see all their jobs, quotes, invoices, and payments"
        actions={
          <>
            <Button variant="secondary" onClick={syncFromStripe} disabled={syncing}>
              {syncing ? "Syncing from Stripe…" : "Sync from Stripe"}
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={exporting || !contacts.length}>
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <Button variant="primary" onClick={() => setShowCreate(true)}>+ New customer</Button>
          </>
        }
      />
      {syncError && (
        <div style={{ padding: 12, margin: "8px 0", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, color: "#991B1B", fontSize: 13 }}>
          Stripe sync failed: {syncError}
        </div>
      )}
      {syncResult && (
        <div style={{ padding: 12, margin: "8px 0", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, color: "#15803D", fontSize: 13 }}>
          <strong>Stripe sync complete.</strong>{" "}
          {syncResult.customers.contacts_created > 0 && <>Created {syncResult.customers.contacts_created} new customer{syncResult.customers.contacts_created === 1 ? "" : "s"}. </>}
          {syncResult.customers.mappings_updated > 0 && <>Linked {syncResult.customers.mappings_updated} existing Stripe customer{syncResult.customers.mappings_updated === 1 ? "" : "s"}. </>}
          {syncResult.invoices.imported > 0 && <>Imported {syncResult.invoices.imported} new invoice{syncResult.invoices.imported === 1 ? "" : "s"}. </>}
          {syncResult.invoices.relinked > 0 && <>Re-linked {syncResult.invoices.relinked} orphaned invoice{syncResult.invoices.relinked === 1 ? "" : "s"}. </>}
          {syncResult.subscriptions.imported > 0 && <>Imported {syncResult.subscriptions.imported} new subscription{syncResult.subscriptions.imported === 1 ? "" : "s"}. </>}
          {syncResult.subscriptions.relinked > 0 && <>Re-linked {syncResult.subscriptions.relinked} orphaned subscription{syncResult.subscriptions.relinked === 1 ? "" : "s"}.</>}
          {syncResult.customers.contacts_created === 0 &&
            syncResult.customers.mappings_updated === 0 &&
            syncResult.invoices.imported === 0 &&
            syncResult.invoices.relinked === 0 &&
            syncResult.subscriptions.imported === 0 &&
            syncResult.subscriptions.relinked === 0 && <>Everything was already up to date.</>}
        </div>
      )}
      {!contacts.length ? (
        <EmptyState title="No customers yet" description="Customers appear here as soon as you create a job, quote, or invoice for them — or when they sign up via the customer portal." />
      ) : (
        <>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-lbl">Total customers</div>
              <div className="stat-val">{contacts.length}</div>
              <div className="stat-delta neu">in your database</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Active paying</div>
              <div className="stat-val" style={{ color: "#059669" }}>{activePaying}</div>
              <div className="stat-delta neu">have paid 1+ invoice</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Outstanding</div>
              <div className="stat-val">{fmtMoneyShort(totalOutstanding)}</div>
              <div className="stat-delta neu">across all customers</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Overdue</div>
              <div className="stat-val" style={{ color: totalOverdue > 0 ? "#DC2626" : undefined }}>{fmtMoneyShort(totalOverdue)}</div>
              <div className="stat-delta neu">{withOverdue} customer{withOverdue === 1 ? "" : "s"}</div>
            </div>
          </div>

          <FilterBar
            pills={CUSTOMER_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name, email, phone, or company…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(c) => c.contact_id}
            onRowClick={(c) => setPickedId(c.contact_id)}
            initialSort={{ key: "outstanding_balance", direction: "desc" }}
            emptyMessage="No customers match this search."
          />
        </>
      )}

      {pickedId && <ContactDetailModal contactId={pickedId} onClose={() => setPickedId(null)} api={{ get, post }} />}
      {showCreate && (
        <NewContactModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); reload(); }}
          create={(b) => post("/contacts", b)}
        />
      )}
    </OliverPageWrapper>
  );
}

function NewContactModal({ onClose, onCreated, create }: { onClose: () => void; onCreated: () => void; create: (body: Record<string, string | undefined>) => Promise<unknown> }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!first.trim() || !last.trim()) { setErr("First and last name are required."); return; }
    setSubmitting(true);
    try {
      await create({
        first_name: first.trim(),
        last_name: last.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        company_name: company.trim() || undefined,
      });
      onCreated();
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("409")) setErr("A customer with this email already exists.");
      else setErr(msg || "Failed to create customer");
    } finally { setSubmitting(false); }
  }

  return (
    <DetailDrawer open onClose={onClose} title="New customer" subtitle="Add a contact to your customer database" width="md">
      {err && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
          {err}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <FormField label="First name *" value={first} onChange={setFirst} />
        <FormField label="Last name *" value={last} onChange={setLast} />
      </div>
      <FormField label="Email" value={email} onChange={setEmail} type="email" />
      <FormField label="Phone" value={phone} onChange={setPhone} type="tel" />
      <FormField label="Company name" value={company} onChange={setCompany} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={submitting || !first.trim() || !last.trim()}>
          {submitting ? "Creating…" : "Create customer"}
        </Button>
      </div>
    </DetailDrawer>
  );
}

function FormField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff" }}
      />
    </label>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

function ContactDetailModal({ contactId, onClose, api }: { contactId: string; onClose: () => void; api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T> } }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [tab, setTab] = useState<"overview" | "jobs" | "quotes" | "invoices" | "payments">("overview");
  const [showAddAddress, setShowAddAddress] = useState(false);

  const reload = async () => {
    const [d, a] = await Promise.all([
      api.get<ContactDetail>(`/contacts/${contactId}`),
      api.get<Activity>(`/contacts/${contactId}/activity`),
    ]);
    setDetail(d);
    setActivity(a);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [contactId]);

  if (!detail || !activity) {
    return <DetailDrawer open onClose={onClose} title="Loading…" width="xl"><div style={{ padding: 20, color: "#5A7A8A" }}>Loading customer…</div></DetailDrawer>;
  }

  const snap = detail.financial_snapshot;
  const addrs = detail.addresses ?? [];

  // Derive a customer-health pill from the financial snapshot so admins see
  // at a glance whether this is a top spender, at-risk, or a slow payer.
  const healthPill = (() => {
    if (!snap) return null;
    const outstanding = Number(snap.outstanding_balance || 0);
    const totalPaid = Number(snap.total_paid || 0);
    const lastPaid = snap.last_payment_date ? new Date(snap.last_payment_date).getTime() : null;
    const daysSincePaid = lastPaid ? Math.floor((Date.now() - lastPaid) / 86400000) : null;

    // Priority: overdue/slow-pay > at-risk (quiet) > top-spender > new
    if ((detail.overdue_balance ?? 0) > 0) {
      return { label: "Slow payer", bg: "#FEE2E2", color: "#991B1B", icon: "⏰" };
    }
    if (totalPaid > 0 && daysSincePaid != null && daysSincePaid > 60 && daysSincePaid <= 365) {
      return { label: "At risk · went quiet", bg: "#FEF3C7", color: "#92400E", icon: "📉" };
    }
    if (totalPaid >= 5000) {
      return { label: "Top spender", bg: "#D1FAE5", color: "#047857", icon: "🏆" };
    }
    if (totalPaid === 0 && outstanding === 0 && snap.total_jobs === 0) {
      return { label: "New customer", bg: "#F1F5F9", color: "#5A7A8A", icon: "✨" };
    }
    if (outstanding > 0) {
      return { label: "Active · has balance", bg: "#DBEAFE", color: "#1E40AF", icon: "•" };
    }
    return { label: "Active · paid up", bg: "#D1FAE5", color: "#047857", icon: "✓" };
  })();

  return (
    <DetailDrawer
      open onClose={onClose}
      title={contactName(detail)}
      subtitle={[detail.email, detail.phone].filter(Boolean).join(" · ")}
      width="xl"
      headerActions={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {healthPill && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 99,
              background: healthPill.bg, color: healthPill.color,
              fontSize: 11, fontWeight: 700,
            }}>
              <span style={{ fontSize: 13 }}>{healthPill.icon}</span>
              {healthPill.label}
            </span>
          )}
          <Button variant="secondary" onClick={() => navigate(`/app/services/oliver_quotes?for_customer=${contactId}`)}>
            + Quote
          </Button>
          <Button variant="primary" onClick={() => navigate(`/app/services/oliver_invoices?for_customer=${contactId}`)}>
            + Invoice
          </Button>
        </div>
      }
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

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <div className="card-ttl">Service addresses</div>
                <div className="card-sub">{addrs.length ? `${addrs.length} on file` : "None on file"}</div>
              </div>
              <Button variant="secondary" onClick={() => setShowAddAddress(true)}>+ Add address</Button>
            </div>
            {addrs.length ? (
              addrs.map((a, i) => (
                <div key={i} style={{ padding: "8px 0", fontSize: 12, color: "#0B1C24", borderTop: i > 0 ? "1px solid #f0f4f6" : "none" }}>
                  {a.address_line_1}, {a.city}, {a.state} {a.postal_code}
                </div>
              ))
            ) : (
              <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "4px 0" }}>
                Add a service address so this customer can be assigned to jobs.
              </div>
            )}
          </div>

          {snap.service_types && (
            <div className="card">
              <div className="card-ttl">Services used</div>
              <div className="card-sub">{snap.service_types}</div>
            </div>
          )}
        </>
      )}

      {showAddAddress && (
        <AddAddressModal
          contactId={contactId}
          onClose={() => setShowAddAddress(false)}
          onAdded={() => { setShowAddAddress(false); reload(); }}
          create={(b) => api.post(`/contacts/${contactId}/addresses`, b)}
        />
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

function AddAddressModal({ contactId, onClose, onAdded, create }: { contactId: string; onClose: () => void; onAdded: () => void; create: (body: Record<string, string>) => Promise<unknown> }) {
  const [label, setLabel] = useState("Primary");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [accessNotes, setAccessNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!line1.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      setErr("Street, city, state, and ZIP are required.");
      return;
    }
    setSubmitting(true);
    try {
      await create({
        label: label.trim() || "Primary",
        address_line_1: line1.trim(),
        address_line_2: line2.trim() || "",
        city: city.trim(), state: state.trim(),
        postal_code: zip.trim(),
        access_notes: accessNotes.trim() || "",
      });
      onAdded();
    } catch (e) {
      setErr((e as Error).message || "Failed to add address");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DetailDrawer open onClose={onClose} title="Add service address" subtitle={`Linked to contact ${contactId.slice(0, 8)}…`} width="md">
      {err && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>{err}</div>
      )}
      <FormField label="Label (e.g. Home, Office, Warehouse)" value={label} onChange={setLabel} />
      <FormField label="Street address *" value={line1} onChange={setLine1} />
      <FormField label="Suite / unit (optional)" value={line2} onChange={setLine2} />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 100px", gap: 8, marginBottom: 10 }}>
        <FormField label="City *" value={city} onChange={setCity} />
        <FormField label="State *" value={state} onChange={setState} />
        <FormField label="ZIP *" value={zip} onChange={setZip} />
      </div>
      <label style={{ display: "block", marginBottom: 10 }}>
        <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Access notes (gate code, dog warning, etc.)</span>
        <textarea
          rows={2} value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)}
          style={{ width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, fontFamily: "inherit" }}
        />
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={submitting || !line1.trim() || !city.trim() || !state.trim() || !zip.trim()}>
          {submitting ? "Adding…" : "Add address"}
        </Button>
      </div>
    </DetailDrawer>
  );
}

/**
 * CustomerModal — THE one modal for OLIVER.
 *
 * Founder spec LOCKED 2026-05-25:
 *   "It should all be one modal, not separate modals. Then depending on
 *   where they are coming from it should open the appropriate section."
 *
 * One modal, customer-rooted, deep-linkable by entry point:
 *   <CustomerModal customerId="…" />                  → opens Overview
 *   <CustomerModal focusJobId="…" />                  → resolves customer
 *                                                       → opens Jobs section
 *                                                       → expands that job
 *   <CustomerModal focusSubscriptionId="…" />         → ditto for Subs
 *   <CustomerModal focusInvoiceId="…" />              → opens Invoices section
 *
 * The modal is fixed-size (Stripe pattern — 1200px × 80vh, whitespace if
 * content is short). Internal scroll handles overflow so the page never
 * jumps between calls.
 *
 * Sections:
 *   Overview      — contact info + financial snapshot + addresses
 *   Jobs          — list; click → JobDetailPanel inline (back link returns)
 *   Quotes        — list
 *   Invoices      — list
 *   Payments      — list
 *   Subscriptions — list; click → SubscriptionDetailPanel inline
 */
import { useCallback, useEffect, useState } from "react";
import { DetailDrawer, Button, StatusBadge } from "../ui";
import { JobDetailPanel } from "./JobDetailPanel";
import { SubscriptionDetailPanel } from "./SubscriptionDetailPanel";
import {
  JobCreatePanel, QuoteCreatePanel, InvoiceCreatePanel, SubscriptionCreatePanel,
} from "./CreatePanels";

type Tab = "overview" | "jobs" | "quotes" | "invoices" | "payments" | "subscriptions";

interface ContactDetail {
  contact_id: string;
  legacy_oliver_uuid?: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
  addresses?: Array<{ address_id: string; address_line_1: string; city: string; state: string; postal_code: string }>;
  financial_snapshot?: {
    total_jobs: number;
    last_job_date?: string | null;
    net_collected: number;
    total_paid: number;
    avg_invoice_value: number;
    outstanding_balance: number;
    last_payment_date?: string | null;
    service_types?: string | null;
  };
  overdue_balance?: number;
}

interface Activity {
  jobs: Array<{ job_id: string; job_number?: string; title?: string; status: string; scheduled_start?: string | null; completed_by?: string | null }>;
  quotes: Array<{ quote_id: string; status: string; total: number; valid_until?: string | null; created_at: string }>;
  invoices: Array<{ invoice_id: string; invoice_number: string; status: string; total: number; amount_paid: number; balance_due: number; source?: string; created_at: string }>;
  payments: Array<{ payment_id: string; paid_at: string; invoice_number?: string; type: string; amount: number; status: string }>;
  subscriptions?: Array<{
    subscription_id: string;
    service_name: string;
    line_items?: string;
    amount: number;
    billing_interval: string;
    billing_interval_count: number;
    coupon_name?: string | null;
    discount_percent?: number | null;
    discount_amount?: number | null;
    current_period_end?: string;
    cancel_at_period_end?: boolean;
    status: string;
  }>;
}

function contactName(c: ContactDetail): string {
  return c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "—";
}
function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) { return d ? new Date(d).toLocaleDateString() : "—"; }

export interface CustomerModalProps {
  /** One of these three drives initial open. */
  customerId?: string;
  focusJobId?: string;
  focusSubscriptionId?: string;
  /** Optional — open straight to invoices/payments section. */
  initialSection?: Tab;

  onClose: () => void;
  onChanged?: () => void;

  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, b?: unknown) => Promise<T>;
    patch: <T>(p: string, b: unknown) => Promise<T>;
  };
}

export function CustomerModal({
  customerId: initialCustomerId,
  focusJobId,
  focusSubscriptionId,
  initialSection,
  onClose,
  onChanged,
  api,
}: CustomerModalProps) {
  // Resolved customer id — may be derived from focusJobId / focusSubscriptionId.
  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId || null);
  const [resolveErr, setResolveErr] = useState<string | null>(null);

  // Section + per-section focused item (job/sub being expanded inline).
  const [tab, setTab] = useState<Tab>(
    initialSection
      ? initialSection
      : focusJobId
        ? "jobs"
        : focusSubscriptionId
          ? "subscriptions"
          : "overview"
  );
  const [focusedJobId, setFocusedJobId] = useState<string | null>(focusJobId || null);
  const [focusedSubId, setFocusedSubId] = useState<string | null>(focusSubscriptionId || null);

  // Inline "+ New X" mode — when set, the matching section renders the create
  // panel in place of the list view. Keeps creation inside the modal per
  // founder spec.
  const [creating, setCreating] = useState<null | "job" | "quote" | "invoice" | "subscription">(null);

  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // If we were given a job/sub id but no customerId, fetch the entity first to
  // resolve its contactId. This keeps callers from having to know who the
  // customer is before opening the modal.
  useEffect(() => {
    if (customerId) return;
    if (!focusJobId && !focusSubscriptionId) return;
    (async () => {
      try {
        if (focusJobId) {
          const j = await api.get<{ data?: { contactId?: string } } | { contactId?: string }>(`/jobs/${focusJobId}`);
          const cid = ((j as any)?.data?.contactId) ?? ((j as any)?.contactId);
          if (!cid) throw new Error("This job has no linked customer.");
          setCustomerId(cid);
        } else if (focusSubscriptionId) {
          const s = await api.get<{ data?: { contact_id?: string } } | { contact_id?: string }>(`/subscriptions/${focusSubscriptionId}`);
          const cid = ((s as any)?.data?.contact_id) ?? ((s as any)?.contact_id);
          if (!cid) throw new Error("This subscription has no linked customer.");
          setCustomerId(cid);
        }
      } catch (e) {
        setResolveErr((e as Error).message);
      }
    })();
  }, [customerId, focusJobId, focusSubscriptionId, api]);

  // Load the customer + activity once we have an id.
  const reload = useCallback(async () => {
    if (!customerId) return;
    setLoadErr(null);
    try {
      const [d, a] = await Promise.all([
        api.get<ContactDetail>(`/contacts/${customerId}`),
        api.get<Activity>(`/contacts/${customerId}/activity`),
      ]);
      setDetail(d);
      setActivity(a);
    } catch (e) {
      setLoadErr((e as Error)?.message || "Failed to load this customer.");
    }
  }, [customerId, api]);

  useEffect(() => { reload(); }, [reload]);

  // Title + subtitle for the drawer header. While we're resolving job→customer
  // these stay placeholder so the modal still opens.
  const title = detail ? contactName(detail) : (resolveErr ? "Couldn't load" : "Loading customer…");
  const subtitle = detail
    ? [detail.email, detail.phone].filter(Boolean).join(" · ")
    : "";

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size="fixed"
      width="xl"
      headerActions={detail && customerId ? (
        <div style={{ display: "flex", gap: 8 }}>
          {/* Primary CTA — most common path is "skip the quote, create a job"
              per founder spec 2026-05-25. Quote/Invoice/Subscription creation
              are exposed inside their sections. */}
          <Button variant="primary" onClick={() => { setTab("jobs"); setFocusedJobId(null); setCreating("job"); }}>
            + New job
          </Button>
        </div>
      ) : undefined}
    >
      {resolveErr && (
        <div style={{ color: "#991B1B", background: "#FEE2E2", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>{resolveErr}</div>
      )}
      {loadErr && (
        <div style={{ color: "#991B1B", background: "#FEE2E2", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
          {loadErr} <Button variant="ghost" onClick={reload}>Retry</Button>
        </div>
      )}

      {!detail || !activity ? (
        <div style={{ color: "#5A7A8A", padding: 20 }}>Loading customer…</div>
      ) : (
        <>
          {/* Section tabs */}
          <div className="ptabs" style={{ marginBottom: 16 }}>
            <button className={`ptab${tab === "overview" ? " active" : ""}`} onClick={() => { setTab("overview"); setFocusedJobId(null); setFocusedSubId(null); }}>Overview</button>
            <button className={`ptab${tab === "jobs" ? " active" : ""}`} onClick={() => { setTab("jobs"); setFocusedJobId(null); }}>Jobs ({activity.jobs.length})</button>
            <button className={`ptab${tab === "quotes" ? " active" : ""}`} onClick={() => setTab("quotes")}>Quotes ({activity.quotes.length})</button>
            <button className={`ptab${tab === "invoices" ? " active" : ""}`} onClick={() => setTab("invoices")}>Invoices ({activity.invoices.length})</button>
            <button className={`ptab${tab === "payments" ? " active" : ""}`} onClick={() => setTab("payments")}>Payments ({activity.payments.length})</button>
            <button className={`ptab${tab === "subscriptions" ? " active" : ""}`} onClick={() => { setTab("subscriptions"); setFocusedSubId(null); }}>Subscriptions ({activity.subscriptions?.length ?? 0})</button>
          </div>

          {/* ── Overview ── */}
          {tab === "overview" && detail.financial_snapshot && (
            <>
              <div className="stat-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
                <div className="stat-card">
                  <div className="stat-lbl">Lifetime value</div>
                  <div className="stat-val">{fmtMoney(detail.financial_snapshot.net_collected)}</div>
                  <div className="stat-delta neu">net of refunds</div>
                </div>
                <div className="stat-card">
                  <div className="stat-lbl">Total jobs</div>
                  <div className="stat-val">{detail.financial_snapshot.total_jobs}</div>
                  <div className="stat-delta neu">last: {fmtDate(detail.financial_snapshot.last_job_date)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-lbl">Avg invoice</div>
                  <div className="stat-val">{fmtMoney(detail.financial_snapshot.avg_invoice_value)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-lbl">Outstanding</div>
                  <div className="stat-val">{fmtMoney(detail.financial_snapshot.outstanding_balance)}</div>
                  <div className="stat-delta neu">last paid: {fmtDate(detail.financial_snapshot.last_payment_date)}</div>
                </div>
              </div>

              <div className="card">
                <div className="card-ttl">Service addresses</div>
                <div className="card-sub">{(detail.addresses || []).length ? `${(detail.addresses || []).length} on file` : "None on file"}</div>
                {(detail.addresses || []).length === 0 ? (
                  <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "4px 0" }}>
                    No addresses yet. Add one from the customer's record to assign jobs to a location.
                  </div>
                ) : (detail.addresses || []).map((a, i) => (
                  <div key={a.address_id} style={{ padding: "8px 0", fontSize: 12, color: "#0B1C24", borderTop: i > 0 ? "1px solid #f0f4f6" : "none" }}>
                    {a.address_line_1}, {a.city}, {a.state} {a.postal_code}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Jobs (list / focused detail / create panel — all inline) ── */}
          {tab === "jobs" && (
            creating === "job" && customerId ? (
              <JobCreatePanel
                customerId={customerId}
                api={api}
                onCancel={() => setCreating(null)}
                onCreated={(newId) => {
                  setCreating(null);
                  reload();
                  onChanged?.();
                  if (newId) setFocusedJobId(newId);
                }}
              />
            ) : focusedJobId ? (
              <JobDetailPanel
                jobId={focusedJobId}
                api={api}
                onChanged={() => { reload(); onChanged?.(); }}
                topSlot={
                  <button
                    onClick={() => setFocusedJobId(null)}
                    style={{ background: "none", border: "none", color: "#1A7DB5", cursor: "pointer", fontSize: 12, fontWeight: 500, marginBottom: 10 }}
                  >
                    ← All jobs for {contactName(detail)}
                  </button>
                }
              />
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                  <Button variant="primary" onClick={() => setCreating("job")}>+ New job</Button>
                </div>
                <table className="tbl">
                  <thead><tr><th>Job #</th><th>Title</th><th>Status</th><th>Scheduled</th><th></th></tr></thead>
                  <tbody>
                    {activity.jobs.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: "center", padding: "20px 0", color: "#5A7A8A" }}>No jobs yet — click "+ New job" to create the first.</td></tr>
                    ) : activity.jobs.map((j) => (
                      <tr key={j.job_id} style={{ cursor: "pointer" }} onClick={() => setFocusedJobId(j.job_id)}>
                        <td><strong>{j.job_number || j.job_id.slice(0, 8)}</strong></td>
                        <td>{j.title || "—"}</td>
                        <td><StatusBadge status={j.status} /></td>
                        <td>{fmtDate(j.scheduled_start)}</td>
                        <td style={{ textAlign: "right", color: "#1A7DB5", fontSize: 11 }}>Open →</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )
          )}

          {/* ── Quotes (list / create panel) ── */}
          {tab === "quotes" && (
            creating === "quote" && customerId ? (
              <QuoteCreatePanel
                customerId={customerId}
                api={api}
                onCancel={() => setCreating(null)}
                onCreated={() => { setCreating(null); reload(); onChanged?.(); }}
              />
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                  <Button variant="primary" onClick={() => setCreating("quote")}>+ New quote</Button>
                </div>
                <table className="tbl">
                  <thead><tr><th>Status</th><th style={{ textAlign: "right" }}>Total</th><th>Valid until</th><th>Created</th></tr></thead>
                  <tbody>
                    {activity.quotes.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: "center", padding: "20px 0", color: "#5A7A8A" }}>No quotes yet — quotes are optional. Click "+ New job" to skip straight to scheduling.</td></tr>
                    ) : activity.quotes.map((q) => (
                      <tr key={q.quote_id}>
                        <td><StatusBadge status={q.status} /></td>
                        <td style={{ textAlign: "right" }}>{fmtMoney(q.total)}</td>
                        <td>{fmtDate(q.valid_until)}</td>
                        <td>{fmtDate(q.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )
          )}

          {/* ── Invoices (list / create panel) ── */}
          {tab === "invoices" && (
            creating === "invoice" && customerId ? (
              <InvoiceCreatePanel
                customerId={customerId}
                api={api}
                onCancel={() => setCreating(null)}
                onCreated={() => { setCreating(null); reload(); onChanged?.(); }}
              />
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                  <Button variant="primary" onClick={() => setCreating("invoice")}>+ New invoice</Button>
                </div>
                <table className="tbl">
                  <thead><tr>
                    <th>Invoice #</th><th>Status</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th style={{ textAlign: "right" }}>Paid</th>
                    <th style={{ textAlign: "right" }}>Balance</th>
                    <th>Source</th><th>Date</th>
                  </tr></thead>
                  <tbody>
                    {activity.invoices.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: "center", padding: "20px 0", color: "#5A7A8A" }}>No invoices yet</td></tr>
                    ) : activity.invoices.map((i) => (
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
                  </tbody>
                </table>
              </>
            )
          )}

          {/* ── Payments ── */}
          {tab === "payments" && (
            <table className="tbl">
              <thead><tr><th>Date</th><th>Invoice</th><th>Type</th><th style={{ textAlign: "right" }}>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {activity.payments.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: "20px 0", color: "#5A7A8A" }}>No payments yet</td></tr>
                ) : activity.payments.map((p) => (
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
              </tbody>
            </table>
          )}

          {/* ── Subscriptions (list / focused detail / create — all inline) ── */}
          {tab === "subscriptions" && (
            creating === "subscription" && customerId ? (
              <SubscriptionCreatePanel
                customerId={customerId}
                api={api}
                onCancel={() => setCreating(null)}
                onCreated={(newId) => {
                  setCreating(null);
                  reload();
                  onChanged?.();
                  if (newId) setFocusedSubId(newId);
                }}
              />
            ) : focusedSubId ? (
              <SubscriptionDetailPanel
                subscriptionId={focusedSubId}
                api={api}
                onChanged={() => { reload(); onChanged?.(); }}
                topSlot={
                  <button
                    onClick={() => setFocusedSubId(null)}
                    style={{ background: "none", border: "none", color: "#1A7DB5", cursor: "pointer", fontSize: 12, fontWeight: 500, marginBottom: 10 }}
                  >
                    ← All subscriptions for {contactName(detail)}
                  </button>
                }
              />
            ) : (
              <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <Button variant="primary" onClick={() => setCreating("subscription")}>+ New subscription</Button>
              </div>
              <table className="tbl">
                <thead><tr>
                  <th>Service</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Cycle</th><th>Discount</th><th>Renews</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  {!(activity.subscriptions ?? []).length ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: "20px 0", color: "#5A7A8A" }}>No subscriptions yet</td></tr>
                  ) : (activity.subscriptions ?? []).map((s) => (
                    <tr key={s.subscription_id} style={{ cursor: "pointer" }} onClick={() => setFocusedSubId(s.subscription_id)}>
                      <td>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>{s.service_name}</div>
                        {s.line_items && s.line_items !== s.service_name && (
                          <div style={{ fontSize: 11, color: "#5A7A8A" }}>{s.line_items}</div>
                        )}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtMoney(s.amount)}</td>
                      <td>{s.billing_interval_count > 1 ? `every ${s.billing_interval_count} ${s.billing_interval}s` : `/${s.billing_interval}`}</td>
                      <td>
                        {s.coupon_name
                          ? <span style={{ fontSize: 11, color: "#9333EA" }}>{s.coupon_name}{s.discount_percent ? ` (${s.discount_percent}% off)` : s.discount_amount ? ` ($${s.discount_amount} off)` : ""}</span>
                          : "—"}
                      </td>
                      <td>{s.cancel_at_period_end ? <span style={{ color: "#B45309" }}>ends {fmtDate(s.current_period_end)}</span> : fmtDate(s.current_period_end)}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td style={{ textAlign: "right", color: "#1A7DB5", fontSize: 11 }}>Open →</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )
          )}
        </>
      )}
    </DetailDrawer>
  );
}

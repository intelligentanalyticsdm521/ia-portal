/**
 * ReadyToInvoicePanel.tsx — OLIVER → Invoices → "Ready to invoice".
 *
 * CUSTOMER_MODEL_MULTISITE_2026-09-15 §9.6 and §9.12's last open item: "the
 * month-end screen (GET /invoices/ready-to-invoice, POST /invoices/batch) has
 * an API and no UI."
 *
 * ── WHAT IT IS ────────────────────────────────────────────────────────────
 * One card per PAYER. The card carries who the bill goes to (§9.6's bill-to
 * block: customer, billing contact, terms, PO), and inside it the completed and
 * un-invoiced work grouped by the SITE it happened at, each with its own
 * subtotal — because that is exactly the shape the invoice will be printed in,
 * and somebody ticking a box should be able to see what they are about to
 * create before it exists.
 *
 * A location that pays for itself is its own card. Nobody chooses that: it has
 * its own billing profile, so the API puts it in its own group and this screen
 * just draws the groups it is given. There is no "invoice this site separately"
 * switch to get wrong — §7 point 5 item 8.
 *
 * ── THE ONE THING THIS SCREEN MUST NOT DO ─────────────────────────────────
 * Hide work. A completed job with no priced lines cannot be invoiced, and it is
 * COUNTED on the card and named in the summary rather than dropped, because
 * "why is that job not on my invoice?" is the question a silent screen creates.
 *
 * Back is TOP-LEFT and pops exactly one level, and the view lives in the URL
 * (?view=ready) so the browser's Back and the nav link both work —
 * convention_back_button_top_left.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, MapPin } from "lucide-react";
import { Button } from "../../components/oliver/ui";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import {
  batchSummary, billToAddressLine, groupJobsByLocation, invoiceCount, orderForScreen,
  paysForItself, type ReadyGroup,
} from "../../lib/readyToInvoice";

export interface BatchResult {
  created: Array<{ bill_to_key: string; invoiceId: string; invoiceNumber: string; total: number }>;
  skipped: Array<{ bill_to_key: string; reason: string }>;
  failed: Array<{ bill_to_key: string; error: string }>;
}

interface Props {
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
  };
  onBack: () => void;
  /** Invoices were created: the list reloads and opens the first one. */
  onCreated: (result: BatchResult) => void;
}

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The last day of the month we are in — the default "through" for a month end. */
function defaultThrough(): string {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}

export function ReadyToInvoicePanel({ api, onBack, onCreated }: Props) {
  const [groups, setGroups] = useState<ReadyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [through, setThrough] = useState<string>(defaultThrough);
  const [dueDate, setDueDate] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get<any>(`/invoices/ready-to-invoice${through ? `?through=${encodeURIComponent(`${through}T23:59:59Z`)}` : ""}`);
      const body = r?.data ?? r;
      const list: ReadyGroup[] = orderForScreen(Array.isArray(body?.groups) ? body.groups : []);
      setGroups(list);
      // Everything that CAN be invoiced starts ticked: at month end the answer
      // is almost always "all of it", and an empty list means reading twenty
      // cards before the button does anything.
      setPicked(new Set(list.filter((g) => g.jobs.some((j) => Number(j.line_count) > 0)).map((g) => g.bill_to_key)));
    } catch (e) {
      setErr(apiErrorMessage(e));
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [api, through]);

  useEffect(() => { void load(); }, [load]);

  const n = useMemo(() => invoiceCount(groups, picked), [groups, picked]);
  const summary = useMemo(() => batchSummary(groups, picked), [groups, picked]);

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function createInvoices() {
    const keys = groups
      .filter((g) => picked.has(g.bill_to_key) && g.jobs.some((j) => Number(j.line_count) > 0))
      .map((g) => g.bill_to_key);
    if (!keys.length) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.post<any>("/invoices/batch", {
        bill_to_keys: keys,
        through: through ? `${through}T23:59:59Z` : null,
        due_date: dueDate || null,
      });
      const body: BatchResult = r?.data ?? r;
      onCreated(body);
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="ready-to-invoice">
      {/* Back: TOP-LEFT, first in the row, one level. */}
      <button
        type="button"
        onClick={onBack}
        title="Back to the invoice list"
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-[#1A7DB5] hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to invoices
      </button>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0B1C24" }}>Ready to invoice</h2>
          <div style={{ fontSize: 12, color: "#5A7A8A", marginTop: 2 }}>
            Work you have finished and not yet billed, gathered under whoever pays for it.
            One invoice per payer, with a section for each site.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ fontSize: 11, color: "#5A7A8A" }}>
            <span style={{ display: "block", marginBottom: 3, fontWeight: 600 }}>Work completed through</span>
            <input
              type="date"
              value={through}
              onChange={(e) => setThrough(e.target.value)}
              title="Only work finished on or before this date is included"
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: 11, color: "#5A7A8A" }}>
            <span style={{ display: "block", marginBottom: 3, fontWeight: 600 }}>Due date (optional)</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              title="Leave blank to use each customer's own payment terms"
              style={inputStyle}
            />
          </label>
          <Button variant="secondary" onClick={load} disabled={loading || busy} title="Look again for work that is ready">
            {loading ? "Checking…" : "Refresh"}
          </Button>
        </div>
      </div>

      {err && (
        <div className="card" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: 12, marginBottom: 10 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: "#5A7A8A" }}>Looking for work that is ready to bill…</div>
      ) : !groups.length ? (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontWeight: 600, color: "#0B1C24" }}>Nothing is waiting to be invoiced.</div>
          <div style={{ fontSize: 12, color: "#5A7A8A", marginTop: 4 }}>
            Jobs appear here once they are marked complete and carry priced lines.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gap: 12 }}>
            {groups.map((g) => (
              <PayerCard key={g.bill_to_key} group={g} picked={picked.has(g.bill_to_key)} onToggle={() => toggle(g.bill_to_key)} />
            ))}
          </div>

          <div style={{
            position: "sticky", bottom: 0, marginTop: 14, padding: "12px 14px",
            background: "#0B1C24", color: "#fff", borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          }}>
            <div style={{ fontSize: 12 }}>{summary}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="secondary"
                onClick={() => setPicked(new Set())}
                disabled={busy || !picked.size}
                title="Untick every customer"
              >
                Clear
              </Button>
              <Button
                variant="primary"
                onClick={createInvoices}
                disabled={busy || n === 0}
                title={n === 0
                  ? "Tick at least one customer with priced work"
                  : `Create ${n} invoice${n === 1 ? "" : "s"} — one for each customer ticked`}
              >
                {busy ? "Creating…" : `Create ${n} invoice${n === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** One payer, with the sites its work happened at. */
function PayerCard({ group, picked, onToggle }: { group: ReadyGroup; picked: boolean; onToggle: () => void }) {
  const locationGroups = useMemo(() => groupJobsByLocation(group), [group]);
  const own = paysForItself(group);
  const bill = group.bill_to || null;
  const terms = bill?.payment_terms_days;
  const invoiceable = group.jobs.some((j) => Number(j.line_count) > 0);

  return (
    <div
      className="card"
      data-testid="payer-card"
      data-bill-to-key={group.bill_to_key}
      style={{ padding: 0, overflow: "hidden", border: picked ? "1px solid #1A7DB5" : "1px solid #E2E8F0" }}
    >
      <div style={{ display: "flex", gap: 12, padding: "12px 14px", alignItems: "flex-start", background: picked ? "#F2F9FD" : "#FFFFFF" }}>
        <input
          type="checkbox"
          checked={picked}
          disabled={!invoiceable}
          onChange={onToggle}
          title={invoiceable
            ? (picked ? `Leave ${group.bill_to_name || "this customer"} out of this batch` : `Include ${group.bill_to_name || "this customer"} in this batch`)
            : "None of this work carries priced lines, so there is nothing to invoice yet"}
          style={{ marginTop: 3 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {own ? <MapPin className="h-4 w-4 text-[#0C4A60]" /> : <Building2 className="h-4 w-4 text-[#0C4A60]" />}
            <span style={{ fontSize: 14, fontWeight: 700, color: "#0B1C24" }}>
              {group.bill_to_name || bill?.company || bill?.name || "Unnamed customer"}
            </span>
            {own && (
              <span
                title="This location has its own billing profile, so it is billed on its own invoice"
                style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px", background: "#E8F4FB", color: "#0C4A60" }}
              >
                Pays for itself
              </span>
            )}
          </div>

          {/* The bill-to block — the same four facts the invoice will print. */}
          <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 3, lineHeight: 1.5 }}>
            {bill?.name && <span>Attn: {bill.name}{bill.email ? ` · ${bill.email}` : ""}</span>}
            {billToAddressLine(bill) && <span style={{ display: "block" }}>{billToAddressLine(bill)}</span>}
            <span style={{ display: "block" }}>
              {terms != null ? `Net ${terms}` : "No payment terms set"}
              {bill?.po_number ? ` · PO ${bill.po_number}` : ""}
              {bill?.tax_exempt ? " · Tax exempt" : ""}
            </span>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0B1C24" }}>{fmtMoney(group.total)}</div>
          <div style={{ fontSize: 11, color: "#5A7A8A" }}>
            {group.job_count} job{group.job_count === 1 ? "" : "s"} · {locationGroups.length} location{locationGroups.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid #E2E8F0" }}>
        {locationGroups.map((lg) => (
          <div key={lg.location_id || "none"} data-testid="location-group">
            <div style={{
              display: "flex", justifyContent: "space-between", gap: 10,
              padding: "7px 14px", background: "#F2F6F9", fontSize: 12, fontWeight: 700, color: "#0B1C24",
            }}>
              <span>
                {lg.name}
                {lg.addressLine && <span style={{ fontWeight: 400, color: "#5A7A8A" }}> · {lg.addressLine}</span>}
                {lg.po_number && <span style={{ fontWeight: 400, color: "#5A7A8A" }}> · PO {lg.po_number}</span>}
              </span>
              <span style={{ whiteSpace: "nowrap" }}>{fmtMoney(lg.subtotal)}</span>
            </div>
            {lg.jobs.map((j) => (
              <div key={j.job_id} style={{
                display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 8,
                padding: "6px 14px", fontSize: 12, borderBottom: "1px solid #F1F5F9", alignItems: "center",
              }}>
                <span style={{ color: Number(j.line_count) ? "#0B1C24" : "#94A3B8" }}>
                  {j.title || "Untitled job"}
                  {j.job_number ? <span style={{ color: "#5A7A8A" }}> · {j.job_number}</span> : null}
                  {!Number(j.line_count) && (
                    <span
                      title="This job has no priced lines, so it cannot be invoiced yet. Add lines to the job first."
                      style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "1px 7px", background: "#FEF3C7", color: "#92400E" }}
                    >
                      No priced lines
                    </span>
                  )}
                </span>
                <span style={{ color: "#5A7A8A", textAlign: "right" }}>{fmtDate(j.completed_at)}</span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(j.total)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {group.jobs_with_no_lines > 0 && (
        <div style={{ padding: "8px 14px", fontSize: 11, color: "#92400E", background: "#FFFBEB", borderTop: "1px solid #FDE68A" }}>
          {group.jobs_with_no_lines} job{group.jobs_with_no_lines === 1 ? "" : "s"} here carr
          {group.jobs_with_no_lines === 1 ? "ies" : "y"} no priced lines and will not be invoiced. Add lines to the job and they will appear next time.
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid #CBD5E1", borderRadius: 6, padding: "6px 8px", fontSize: 12, color: "#0B1C24", background: "#fff",
};

export default ReadyToInvoicePanel;

import { useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { Button } from "../../components/oliver/ui";

interface JobListItem {
  id: string;
  title: string;
  customerName: string;
  status: string;
}

interface ContactListItem {
  contact_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company_name?: string;
}

interface Offering {
  offering_id: string;
  name: string;
  description?: string;
  prices?: Array<{ price_id: string; amount: number; recurring_interval?: string | null }>;
}

interface LineItemDraft {
  description: string;
  quantity: number;
  unit_price: number;
  is_tax: boolean;
  /** Set when this line came from the service catalog dropdown. */
  service_offering_id?: string;
  service_price_id?: string;
}

interface CreateInvoiceProps {
  onCreated: () => void;
  onCancel: () => void;
  /** Pre-seed the form with a job (opens in "From a completed job" mode). */
  initialJobId?: string;
  /** Pre-seed the form with a customer (opens in "Bill a customer" mode). */
  initialContactId?: string;
}

const blankItem: LineItemDraft = { description: "", quantity: 1, unit_price: 0, is_tax: false };
const blankTaxItem: LineItemDraft = { description: "Sales Tax", quantity: 1, unit_price: 0, is_tax: true };

function contactName(c: ContactListItem) {
  return c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "(no name)";
}

export function InvoiceCreateForm({ onCreated, onCancel, initialJobId, initialContactId }: CreateInvoiceProps) {
  const { get, post, ready } = useOliverApi();
  const [mode, setMode] = useState<"job" | "customer">(initialJobId ? "job" : "customer");
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>(initialJobId || "");
  const [selectedContactId, setSelectedContactId] = useState<string>(initialContactId || "");
  const [items, setItems] = useState<LineItemDraft[]>([{ ...blankItem }]);
  const [dueDate, setDueDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [c, o, jc, ji] = await Promise.all([
          get<ContactListItem[]>("/contacts"),
          get<Offering[]>("/catalog/offerings").catch(() => [] as Offering[]),
          get<JobListItem[]>("/jobs?status=completed&per_page=50").catch(() => [] as JobListItem[]),
          get<JobListItem[]>("/jobs?status=invoiced&per_page=50").catch(() => [] as JobListItem[]),
        ]);
        setContacts(c || []);
        setOfferings(o || []);
        setJobs([...(jc || []), ...(ji || [])]);
      } catch (e) {
        setError(`Failed to load data: ${(e as Error).message}`);
      }
    })();
  }, [get, ready]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const it of items) {
      const lineTotal = Number(it.quantity || 0) * Number(it.unit_price || 0);
      if (it.is_tax) tax += lineTotal;
      else subtotal += lineTotal;
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [items]);

  function updateItem(idx: number, patch: Partial<LineItemDraft>) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function addLine() { setItems((prev) => [...prev, { ...blankItem }]); }
  function addTaxLine() { setItems((prev) => [...prev, { ...blankTaxItem }]); }

  function addOfferingLine(offeringId: string) {
    const off = offerings.find((o) => o.offering_id === offeringId);
    if (!off) return;
    const oneTimePrice = off.prices?.find((p) => !p.recurring_interval);
    setItems((prev) => [
      ...prev.filter((it) => it.description.trim() || it.unit_price > 0),
      {
        description: off.name,
        quantity: 1,
        unit_price: oneTimePrice ? Number(oneTimePrice.amount) : 0,
        is_tax: false,
        service_offering_id: off.offering_id,
        service_price_id: oneTimePrice?.price_id,
      },
    ]);
  }

  async function submit() {
    setError(null);
    if (mode === "job" && !selectedJobId) { setError("Pick a job first."); return; }
    if (mode === "customer" && !selectedContactId) { setError("Pick a customer first."); return; }
    const cleanedItems = items.filter((it) => it.description.trim() && Number(it.unit_price) >= 0);
    if (!cleanedItems.length) { setError("Add at least one line item."); return; }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        line_items: cleanedItems,
        due_date: dueDate || null,
      };
      if (mode === "job") body.job_id = selectedJobId;
      else body.contact_id = selectedContactId;

      await post("/invoices", body);
      onCreated();
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("stripe_not_connected") || msg.includes("412")) {
        setError("Your Stripe account isn't connected yet. Go to Business Setup → Stripe Connect to finish setup.");
      } else {
        setError(`Create failed: ${msg}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div className="card-ttl">New invoice</div>
          <div className="card-sub">Bill a customer directly or convert a completed job into an invoice</div>
        </div>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "#5A7A8A", cursor: "pointer", fontSize: 12 }}>Cancel</button>
      </div>

      {error && (
        <div style={{
          background: "#FEE2E2", border: "1px solid #FECACA",
          color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      <div className="ptabs" style={{ marginBottom: 12 }}>
        <button className={`ptab${mode === "customer" ? " active" : ""}`} onClick={() => setMode("customer")}>Bill a customer</button>
        <button className={`ptab${mode === "job" ? " active" : ""}`} onClick={() => setMode("job")}>From a completed job</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {mode === "customer" ? (
          <Field label="Customer">
            <select
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              style={selectStyle}
            >
              <option value="">— Pick a customer —</option>
              {contacts.map((c) => (
                <option key={c.contact_id} value={c.contact_id}>
                  {contactName(c)}{c.email ? ` · ${c.email}` : ""}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Job">
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              style={selectStyle}
            >
              <option value="">— Pick a completed/invoiced job —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title || "(untitled)"} — {j.customerName} ({j.status})
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Due date (optional)">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={selectStyle} />
        </Field>
      </div>

      {offerings.length > 0 && (
        <Field label="Add from your service catalog (optional)">
          <select onChange={(e) => { if (e.target.value) { addOfferingLine(e.target.value); e.target.value = ""; } }} style={selectStyle} defaultValue="">
            <option value="">— Add offering as line item —</option>
            {offerings.map((o) => {
              const oneTime = o.prices?.find((p) => !p.recurring_interval);
              return (
                <option key={o.offering_id} value={o.offering_id}>
                  {o.name}{oneTime ? ` · $${Number(oneTime.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ""}
                </option>
              );
            })}
          </select>
        </Field>
      )}

      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>Line items</div>
          <div style={{ display: "flex", gap: 6 }}>
            <Button variant="secondary" onClick={addLine}>+ Line</Button>
            <Button variant="secondary" onClick={addTaxLine}>+ Tax line</Button>
          </div>
        </div>

        <div style={{ border: "1px solid #eef2f4", borderRadius: 6 }}>
          {items.map((it, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1fr 80px 110px 32px", gap: 8,
              padding: "8px 10px", alignItems: "center",
              borderBottom: i < items.length - 1 ? "1px solid #f0f4f6" : "none",
              background: it.is_tax ? "#FFFBEB" : "transparent",
            }}>
              <input
                type="text"
                placeholder={it.is_tax ? "e.g. Iowa Sales Tax 6%" : "Description"}
                value={it.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
                style={inputStyle}
              />
              <input
                type="number" step="0.001" min="0" placeholder="Qty"
                value={it.quantity}
                onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                style={{ ...inputStyle, textAlign: "right" }}
              />
              <input
                type="number" step="0.01" min="0" placeholder="Unit $"
                value={it.unit_price}
                onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })}
                style={{ ...inputStyle, textAlign: "right" }}
              />
              <button
                type="button" onClick={() => removeItem(i)} title="Remove"
                style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 18, padding: 0 }}
              >×</button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <div style={{ width: 240, fontSize: 12 }}>
          <Row label="Subtotal" value={`$${totals.subtotal.toFixed(2)}`} />
          {totals.tax > 0 && <Row label="Tax" value={`$${totals.tax.toFixed(2)}`} color="#B45309" />}
          <div style={{ borderTop: "1px solid #eef2f4", marginTop: 4, paddingTop: 6 }}>
            <Row label="Total" value={`$${totals.total.toFixed(2)}`} bold />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          onClick={submit}
          disabled={submitting || (mode === "job" ? !selectedJobId : !selectedContactId) || !items.length}
        >
          {submitting ? "Creating…" : "Create invoice (draft)"}
        </Button>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6,
  background: "#fff", color: "#0B1C24",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "5px 8px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.18)", borderRadius: 4,
  background: "#fff",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: color || "#5A7A8A", fontWeight: bold ? 600 : 400 }}>
      <span>{label}</span>
      <span style={{ color: bold ? "#0B1C24" : color || "#0B1C24", fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}

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
}

interface CreateQuoteProps {
  onCreated: () => void;
  onCancel: () => void;
  /** When provided, opens the form in "job" mode with this job pre-selected. */
  initialJobId?: string;
  /** When provided, opens the form in "customer" mode with this contact pre-selected. */
  initialContactId?: string;
}

const blankItem: LineItemDraft = { description: "", quantity: 1, unit_price: 0 };

function contactName(c: ContactListItem) {
  return c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "(no name)";
}

export function QuoteCreateForm({ onCreated, onCancel, initialJobId, initialContactId }: CreateQuoteProps) {
  const { get, post, ready } = useOliverApi();
  const [mode, setMode] = useState<"customer" | "job">(initialJobId ? "job" : "customer");
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedJobId, setSelectedJobId] = useState(initialJobId || "");
  const [selectedContactId, setSelectedContactId] = useState(initialContactId || "");
  const [items, setItems] = useState<LineItemDraft[]>([{ ...blankItem }]);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [c, o, j1, j2, j3] = await Promise.all([
          get<ContactListItem[]>("/contacts"),
          get<Offering[]>("/catalog/offerings").catch(() => [] as Offering[]),
          get<JobListItem[]>("/jobs?status=inquiry&per_page=50").catch(() => [] as JobListItem[]),
          get<JobListItem[]>("/jobs?status=quoted&per_page=50").catch(() => [] as JobListItem[]),
          get<JobListItem[]>("/jobs?status=scheduled&per_page=50").catch(() => [] as JobListItem[]),
        ]);
        setContacts(c || []);
        setOfferings(o || []);
        setJobs([...(j1 || []), ...(j2 || []), ...(j3 || [])]);
      } catch (e) {
        setError(`Failed to load data: ${(e as Error).message}`);
      }
    })();
  }, [get, ready]);

  const total = useMemo(
    () => items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0),
    [items]
  );

  function updateItem(idx: number, patch: Partial<LineItemDraft>) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function addLine() { setItems((prev) => [...prev, { ...blankItem }]); }

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
      },
    ]);
  }

  async function submit() {
    setError(null);
    if (mode === "job" && !selectedJobId) { setError("Pick a job first."); return; }
    if (mode === "customer" && !selectedContactId) { setError("Pick a customer first."); return; }
    const cleaned = items.filter((it) => it.description.trim() && Number(it.unit_price) >= 0);
    if (!cleaned.length) { setError("Add at least one line item."); return; }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        line_items: cleaned,
        valid_until: validUntil || null,
        notes: notes.trim() || null,
      };
      if (mode === "job") body.job_id = selectedJobId;
      else body.contact_id = selectedContactId;
      await post("/quotes", body);
      onCreated();
    } catch (e) {
      setError(`Create failed: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div className="card-ttl">New quote</div>
          <div className="card-sub">Send a proposal to a customer with itemized pricing</div>
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
        <button className={`ptab${mode === "customer" ? " active" : ""}`} onClick={() => setMode("customer")}>Quote a customer</button>
        <button className={`ptab${mode === "job" ? " active" : ""}`} onClick={() => setMode("job")}>From an existing job</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {mode === "customer" ? (
          <Field label="Customer">
            <select value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)} style={selectStyle}>
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
            <select value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)} style={selectStyle}>
              <option value="">— Pick a job —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title || "(untitled)"} — {j.customerName} ({j.status})
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Valid until (optional)">
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} style={selectStyle} />
        </Field>
      </div>

      {offerings.length > 0 && (
        <Field label="Add from your service catalog (optional)">
          <select
            onChange={(e) => { if (e.target.value) { addOfferingLine(e.target.value); e.target.value = ""; } }}
            style={selectStyle}
            defaultValue=""
          >
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
          <Button variant="secondary" onClick={addLine}>+ Line</Button>
        </div>

        <div style={{ border: "1px solid #eef2f4", borderRadius: 6 }}>
          {items.map((it, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1fr 80px 110px 32px", gap: 8,
              padding: "8px 10px", alignItems: "center",
              borderBottom: i < items.length - 1 ? "1px solid #f0f4f6" : "none",
            }}>
              <input
                type="text" placeholder="Description"
                value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })}
                style={inputStyle}
              />
              <input
                type="number" step="0.001" min="0" placeholder="Qty"
                value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                style={{ ...inputStyle, textAlign: "right" }}
              />
              <input
                type="number" step="0.01" min="0" placeholder="Unit $"
                value={it.unit_price} onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })}
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

      <Field label="Notes (optional)" style={{ marginTop: 12 }}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Terms, scope, exclusions…"
          style={{ ...selectStyle, fontFamily: "inherit", resize: "vertical" }}
        />
      </Field>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <div style={{ width: 240, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: "1px solid #eef2f4", fontWeight: 600 }}>
            <span>Total</span>
            <span style={{ fontFamily: "monospace", color: "#0B1C24" }}>
              ${total.toFixed(2)}
            </span>
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
          {submitting ? "Creating…" : "Create quote (draft)"}
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

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: "block", ...style }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

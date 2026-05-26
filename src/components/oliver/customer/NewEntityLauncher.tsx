/**
 * NewEntityLauncher — Founder spec LOCKED 2026-05-25:
 *
 *   Job Board "+ New job" flow:
 *     1. Pick a customer (search existing OR create new)
 *        a. If new is selected, fill out customer info inline
 *     2. Pick Job or Quote
 *     3. Open CustomerModal scoped to that customer, in the chosen
 *        section's create panel
 *     4. User fills out the form there
 *
 * This component owns steps 1–2 only; the CustomerModal (already built)
 * handles steps 3–4 via the existing `initialCreating` + `customerId` props.
 *
 * Renders as its own fixed-size modal stacked above the JobBoard. When the
 * user picks a kind + customer, this modal closes and the parent opens
 * CustomerModal — they never overlap on screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DetailDrawer, Button } from "../ui";
import { formatPhone } from "../../../lib/formatPhone";

interface ContactRow {
  contact_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
}

type Step = "customer" | "kind";
type Kind = "job" | "quote";

type Api = {
  get: <T>(p: string) => Promise<T>;
  post: <T>(p: string, b?: unknown) => Promise<T>;
};

const inputS: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff",
};
const labelS: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A",
  marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4,
};

function contactName(c: ContactRow): string {
  return c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "(no name)";
}

export interface NewEntityLauncherProps {
  /** Default entity kind (the Job Board passes 'job'; other surfaces could
   *  pass 'quote'). User can still toggle in step 2. */
  defaultKind?: Kind;
  api: Api;
  onCancel: () => void;
  /** Called once both customer + kind are picked. Parent then opens the
   *  CustomerModal with initialCreating set to `kind`. */
  onResolved: (args: { customerId: string; kind: Kind }) => void;
}

export function NewEntityLauncher({ defaultKind = "job", api, onCancel, onResolved }: NewEntityLauncherProps) {
  const [step, setStep] = useState<Step>("customer");
  const [chosenCustomerId, setChosenCustomerId] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>(defaultKind);

  return (
    <DetailDrawer
      open
      onClose={onCancel}
      size="fixed"
      title={step === "customer" ? "New job — pick a customer" : "New job — what kind?"}
      subtitle={
        step === "customer"
          ? "Step 1 of 2 — search an existing customer or create a new one"
          : "Step 2 of 2 — confirm what you're creating"
      }
    >
      {step === "customer" && (
        <CustomerPickerStep
          api={api}
          onPicked={(cid) => { setChosenCustomerId(cid); setStep("kind"); }}
          onCancel={onCancel}
        />
      )}
      {step === "kind" && chosenCustomerId && (
        <KindPickerStep
          kind={kind}
          onKindChange={setKind}
          onConfirm={() => onResolved({ customerId: chosenCustomerId, kind })}
          onBack={() => setStep("customer")}
        />
      )}
    </DetailDrawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — customer picker
//   - Search input typeahead-filters the contacts list
//   - "+ Create new customer" button opens an inline create form
// ─────────────────────────────────────────────────────────────────────────────
function CustomerPickerStep({
  api, onPicked, onCancel,
}: {
  api: Api;
  onPicked: (customerId: string) => void;
  onCancel: () => void;
}) {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createMode, setCreateMode] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await api.get<ContactRow[] | { data: ContactRow[] }>("/contacts");
      setContacts(Array.isArray(data) ? data : ((data as any).data ?? []));
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { searchRef.current?.focus(); }, []);

  // Client-side typeahead. Customer lists for one tenant cap at ~thousands,
  // which a JS filter handles instantly — saves a server round-trip per
  // keystroke.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts.slice(0, 50); // limit visible list at idle
    return contacts.filter((c) => {
      const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
      return name.includes(q)
        || (c.company_name ?? "").toLowerCase().includes(q)
        || (c.email ?? "").toLowerCase().includes(q)
        || (c.phone ?? "").toLowerCase().includes(q);
    }).slice(0, 100);
  }, [contacts, search]);

  if (createMode) {
    return (
      <InlineCreateCustomer
        api={api}
        onCancel={() => setCreateMode(false)}
        onCreated={(newId) => onPicked(newId)}
      />
    );
  }

  return (
    <div>
      {err && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
          {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, company, email, or phone…"
          style={{ ...inputS, flex: 1, padding: "8px 12px", fontSize: 13 }}
        />
        <Button variant="secondary" onClick={() => setCreateMode(true)}>+ Create new customer</Button>
      </div>

      {loading ? (
        <div style={{ color: "#5A7A8A", padding: 20 }}>Loading customers…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 0" }}>
          <div style={{ fontSize: 13, color: "#5A7A8A", marginBottom: 12 }}>
            {search.trim()
              ? `No customers match "${search.trim()}".`
              : "No customers yet."}
          </div>
          <Button variant="primary" onClick={() => setCreateMode(true)}>+ Create new customer</Button>
        </div>
      ) : (
        <div style={{ border: "1px solid #E5E7EB", borderRadius: 6, maxHeight: 460, overflowY: "auto" }}>
          {filtered.map((c) => (
            <button
              key={c.contact_id}
              type="button"
              onClick={() => onPicked(c.contact_id)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                width: "100%", padding: "10px 12px", background: "#fff",
                border: "none", borderBottom: "1px solid #F3F4F6",
                cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1C24" }}>{contactName(c)}</div>
                <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>
                  {[c.email, c.phone ? formatPhone(c.phone) : null, c.company_name].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <span style={{ fontSize: 11, color: "#1A7DB5" }}>Pick →</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline new-customer form. Mirrors the existing NewContactModal field set
// but lives inside this launcher so the user doesn't pop yet another modal.
// ─────────────────────────────────────────────────────────────────────────────
function InlineCreateCustomer({
  api, onCancel, onCreated,
}: {
  api: Api;
  onCancel: () => void;
  onCreated: (newCustomerId: string) => void;
}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!first.trim() && !last.trim() && !company.trim()) {
      setErr("Enter at least a name or company.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ contact_id?: string; legacy_oliver_uuid?: string }>("/contacts", {
        first_name: first.trim() || null,
        last_name: last.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        company_name: company.trim() || null,
      });
      const id = (res as any)?.contact_id || (res as any)?.legacy_oliver_uuid || (res as any)?.id;
      if (!id) throw new Error("Customer created but no id returned.");
      onCreated(id);
    } catch (e) { setErr(`Create failed: ${(e as Error).message}`); }
    finally { setSubmitting(false); }
  }

  return (
    <div>
      <button
        onClick={onCancel}
        style={{ background: "none", border: "none", color: "#1A7DB5", cursor: "pointer", fontSize: 12, fontWeight: 500, marginBottom: 12 }}
      >
        ← Back to customer list
      </button>

      {err && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
          {err}
        </div>
      )}

      <div className="card">
        <div className="card-ttl">New customer</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>
          Just the basics — you can add an address, payment method, and more from the customer's modal after creating.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelS}>First name</label>
            <input value={first} onChange={(e) => setFirst(e.target.value)} style={inputS} autoFocus />
          </div>
          <div>
            <label style={labelS}>Last name</label>
            <input value={last} onChange={(e) => setLast(e.target.value)} style={inputS} />
          </div>
          <div>
            <label style={labelS}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputS} />
          </div>
          <div>
            <label style={labelS}>Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} style={inputS} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelS}>Company (optional)</label>
            <input value={company} onChange={(e) => setCompany(e.target.value)} style={inputS} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid #F1F5F9" }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={submit}
          disabled={submitting || (!first.trim() && !last.trim() && !company.trim())}>
          {submitting ? "Creating…" : "Create customer & continue"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — pick Job or Quote.
// ─────────────────────────────────────────────────────────────────────────────
function KindPickerStep({
  kind, onKindChange, onConfirm, onBack,
}: {
  kind: Kind;
  onKindChange: (k: Kind) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <button
        onClick={onBack}
        style={{ background: "none", border: "none", color: "#1A7DB5", cursor: "pointer", fontSize: 12, fontWeight: 500, marginBottom: 16 }}
      >
        ← Change customer
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <KindCard
          selected={kind === "job"}
          onClick={() => onKindChange("job")}
          title="New job"
          tagline="Schedule work directly — skip the quote step"
          body="Use when the customer has already said yes (or there's no quote step in your flow). You can add line items at create time or after."
        />
        <KindCard
          selected={kind === "quote"}
          onClick={() => onKindChange("quote")}
          title="New quote"
          tagline="Send a proposal first; convert to job if accepted"
          body="Use when the customer needs a price before deciding. Accepted quotes convert to invoices; from there, schedule the job."
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 14 }}>
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button variant="primary" onClick={onConfirm}>
          Continue — open {kind === "job" ? "new job" : "new quote"} form
        </Button>
      </div>
    </div>
  );
}

function KindCard({
  selected, onClick, title, tagline, body,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  tagline: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block", textAlign: "left",
        padding: "14px 16px",
        background: selected ? "#E8F4FB" : "#fff",
        border: `2px solid ${selected ? "#1A7DB5" : "#E5E7EB"}`,
        borderRadius: 10, cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: selected ? "#0C4A60" : "#0B1C24" }}>{title}</div>
      <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2, marginBottom: 8 }}>{tagline}</div>
      <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{body}</div>
    </button>
  );
}

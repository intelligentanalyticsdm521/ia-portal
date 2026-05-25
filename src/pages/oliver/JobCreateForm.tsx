import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { Button } from "../../components/oliver/ui";

interface ContactListItem {
  contact_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
}

interface Address {
  address_id: string;
  label?: string;
  address_line_1: string;
  city: string;
  state: string;
  postal_code: string;
}

interface JobCreateProps {
  onCreated: () => void;
  onCancel: () => void;
}

function contactName(c: ContactListItem) {
  return c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "(no name)";
}

export function JobCreateForm({ onCreated, onCancel }: JobCreateProps) {
  const { get, post, ready } = useOliverApi();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingAddrs, setLoadingAddrs] = useState(false);

  // Existing-customer mode
  const [contactId, setContactId] = useState("");
  const [addressId, setAddressId] = useState("");

  // New-customer mode (inline create)
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [addrLine1, setAddrLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  // Common job fields
  const [title, setTitle] = useState("");
  const [jobType, setJobType] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [teamNotes, setTeamNotes] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const list = await get<ContactListItem[]>("/contacts");
        setContacts(list || []);
      } catch (e) {
        setError(`Failed to load contacts: ${(e as Error).message}`);
      }
    })();
  }, [get, ready]);

  // Load addresses when an existing contact is picked
  useEffect(() => {
    if (mode !== "existing" || !contactId) { setAddresses([]); setAddressId(""); return; }
    setLoadingAddrs(true);
    (async () => {
      try {
        const detail = await get<{ addresses?: Address[] }>(`/contacts/${contactId}`);
        const addrs = detail.addresses || [];
        setAddresses(addrs);
        if (addrs.length === 1) setAddressId(addrs[0].address_id);
      } catch {
        setAddresses([]);
      } finally {
        setLoadingAddrs(false);
      }
    })();
  }, [contactId, mode, get]);

  async function submit() {
    setError(null);
    if (!title.trim()) { setError("Job title is required."); return; }

    let body: Record<string, unknown> = {
      title: title.trim(),
      job_type: jobType.trim() || null,
      scheduled_start: scheduledStart || null,
      scheduled_end: scheduledEnd || null,
      team_notes: teamNotes.trim() || null,
      customer_notes: customerNotes.trim() || null,
      source: "manual",
    };

    // Service address is OPTIONAL — consulting/agency/SaaS work doesn't
    // happen at a customer location. Service businesses (HVAC, cleaning,
    // etc.) want it; the new business-type setting (Task #33) will gate
    // this per-tenant. Until then, never block job creation on address.
    if (mode === "existing") {
      if (!contactId) { setError("Pick a customer."); return; }
      body = { ...body, contact_id: contactId };
      if (addressId) body.service_address_id = addressId;
    } else {
      if (!first.trim() || !last.trim()) { setError("First and last name are required."); return; }
      body = {
        ...body,
        contact: {
          first_name: first.trim(), last_name: last.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          company_name: company.trim() || undefined,
        },
      };
      // Address is optional. Only include if all four core fields are filled.
      if (addrLine1.trim() && city.trim() && state.trim() && zip.trim()) {
        body.address = {
          address_line_1: addrLine1.trim(),
          city: city.trim(), state: state.trim(), postal_code: zip.trim(),
        };
      }
    }

    setSubmitting(true);
    try {
      await post("/jobs", body);
      onCreated();
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("402") || msg.includes("job_limit_reached")) {
        setError("You've hit your Lite-tier job limit (50 active jobs). Upgrade to Standard to add more.");
      } else {
        setError(`Create failed: ${msg}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Address optional — only customer + title are required.
  const submitDisabled = submitting
    || !title.trim()
    || (mode === "existing" ? !contactId
                            : (!first.trim() || !last.trim()));

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div className="card-ttl">New job</div>
          <div className="card-sub">Create a job manually — picks up from "inquiry" status and flows through your normal pipeline</div>
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
        <button className={`ptab${mode === "existing" ? " active" : ""}`} onClick={() => setMode("existing")}>Existing customer</button>
        <button className={`ptab${mode === "new" ? " active" : ""}`} onClick={() => setMode("new")}>New customer</button>
      </div>

      {mode === "existing" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <Field label="Customer">
            <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={selectStyle}>
              <option value="">— Pick a customer —</option>
              {contacts.map((c) => (
                <option key={c.contact_id} value={c.contact_id}>
                  {contactName(c)}{c.email ? ` · ${c.email}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Service address (optional)">
            <select
              value={addressId}
              onChange={(e) => setAddressId(e.target.value)}
              style={selectStyle}
              disabled={!contactId || loadingAddrs}
            >
              <option value="">
                {!contactId ? "Pick a customer first" : loadingAddrs ? "Loading…" : addresses.length ? "— Pick an address (optional) —" : "(no addresses — leave blank if not needed)"}
              </option>
              {addresses.map((a) => (
                <option key={a.address_id} value={a.address_id}>
                  {[a.address_line_1, a.city, a.state, a.postal_code].filter(Boolean).join(", ")}
                </option>
              ))}
            </select>
            {contactId && !loadingAddrs && !addresses.length && (
              <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 4 }}>
                No address on file. Leave blank if this job doesn't need one (e.g. consulting),
                or add one from the customer's detail page. Service businesses will be able to
                require an address per the upcoming business-type setting.
              </div>
            )}
          </Field>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Field label="First name *">
              <input value={first} onChange={(e) => setFirst(e.target.value)} style={selectStyle} />
            </Field>
            <Field label="Last name *">
              <input value={last} onChange={(e) => setLast(e.target.value)} style={selectStyle} />
            </Field>
            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={selectStyle} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={selectStyle} />
            </Field>
            <Field label="Company (optional)">
              <input value={company} onChange={(e) => setCompany(e.target.value)} style={{ ...selectStyle, gridColumn: "1 / -1" }} />
            </Field>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
            Service address
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 80px 100px", gap: 8, marginBottom: 14 }}>
            <input placeholder="Street address *" value={addrLine1} onChange={(e) => setAddrLine1(e.target.value)} style={selectStyle} />
            <input placeholder="City *" value={city} onChange={(e) => setCity(e.target.value)} style={selectStyle} />
            <input placeholder="State *" value={state} onChange={(e) => setState(e.target.value)} style={selectStyle} />
            <input placeholder="ZIP *" value={zip} onChange={(e) => setZip(e.target.value)} style={selectStyle} />
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Job title *">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Roof repair, monthly lawn care, plumbing service" style={selectStyle} />
        </Field>
        <Field label="Job type (optional)">
          <input value={jobType} onChange={(e) => setJobType(e.target.value)} placeholder="e.g. Maintenance, Repair, Install" style={selectStyle} />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Scheduled start (optional)">
          <input type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} style={selectStyle} />
        </Field>
        <Field label="Scheduled end (optional)">
          <input type="datetime-local" value={scheduledEnd} onChange={(e) => setScheduledEnd(e.target.value)} style={selectStyle} />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <Field label="Customer notes (visible in portal)">
          <textarea rows={3} value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} style={{ ...selectStyle, fontFamily: "inherit", resize: "vertical" }} />
        </Field>
        <Field label="Internal team notes">
          <textarea rows={3} value={teamNotes} onChange={(e) => setTeamNotes(e.target.value)} style={{ ...selectStyle, fontFamily: "inherit", resize: "vertical" }} />
        </Field>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={submitDisabled}>
          {submitting ? "Creating…" : "Create job"}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

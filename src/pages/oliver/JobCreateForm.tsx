import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { Button } from "../../components/oliver/ui";
import { PhoneInput } from "../../components/PhoneInput";
import { useOliverLocations } from "../../hooks/useOliverLocations";

interface ContactListItem {
  contact_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
}

/** A past job for this customer — the return-visit picker's options. */
interface PastJob {
  job_id: string;
  job_number?: string;
  title?: string;
  status?: string;
  actual_end?: string | null;
  scheduled_start?: string | null;
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
  // Multi-location: hidden for a single-location business (and then never
  // sent). Defaults to the header picker's location, else the default one.
  const loc = useOliverLocations();
  const [locationId, setLocationId] = useState("");
  useEffect(() => {
    if (!loc.multi || locationId) return;
    setLocationId(loc.selectedLocationId !== "all" ? loc.selectedLocationId : (loc.defaultLocation?.location_id ?? ""));
  }, [loc.multi, loc.selectedLocationId, loc.defaultLocation, locationId]);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingAddrs, setLoadingAddrs] = useState(false);
  // Foundation C (F-4) — "this is us coming back for job #X". An explicit link,
  // not a guess from dates: the outcomes chain counts repeat work off it, and
  // repeat rate is one of the numbers the AI learns each business by.
  const [pastJobs, setPastJobs] = useState<PastJob[]>([]);
  const [returnOfJobId, setReturnOfJobId] = useState("");

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

  // Service-business gating: warn (but don't block) on no-address job submission.
  const [requiresServiceAddress, setRequiresServiceAddress] = useState(false);
  const [showAddrWarning, setShowAddrWarning] = useState(false);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [list, settings] = await Promise.all([
          get<ContactListItem[]>("/contacts"),
          get<{ requiresServiceAddress?: boolean }>("/settings").catch(() => ({} as { requiresServiceAddress?: boolean })),
        ]);
        setContacts(list || []);
        setRequiresServiceAddress(!!settings?.requiresServiceAddress);
      } catch (e) {
        setError(`Failed to load: ${(e as Error).message}`);
      }
    })();
  }, [get, ready]);

  // Load addresses when an existing contact is picked
  useEffect(() => {
    if (mode !== "existing" || !contactId) {
      setAddresses([]); setAddressId(""); setPastJobs([]); setReturnOfJobId("");
      return;
    }
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
      // Their earlier jobs, for the return-visit picker. A separate,
      // best-effort call: a customer with no history is the normal case, and
      // failing to list it must never stop someone booking work.
      try {
        const activity = await get<{ jobs?: PastJob[] }>(`/contacts/${contactId}/activity`);
        setPastJobs(activity.jobs || []);
      } catch {
        setPastJobs([]);
      }
      setReturnOfJobId("");
    })();
  }, [contactId, mode, get]);

  // Determine if this submit lacks a service address (in current mode).
  function hasNoAddress(): boolean {
    if (mode === "existing") return !addressId;
    // New-customer mode: address is "missing" if no street provided
    return !addrLine1.trim();
  }

  // Entry point — runs the gating check, then either shows warning or
  // submits. `bypassWarning=true` skips the gate (used by "Create anyway").
  async function attemptSubmit(bypassWarning = false) {
    setError(null);
    if (!title.trim()) { setError("Job title is required."); return; }
    if (mode === "existing" && !contactId) { setError("Pick a customer."); return; }
    if (mode === "new" && (!first.trim() || !last.trim())) {
      setError("First and last name are required.");
      return;
    }
    // Service-business warning: tenant requires addresses but this job has none.
    if (!bypassWarning && requiresServiceAddress && hasNoAddress()) {
      setShowAddrWarning(true);
      return;
    }
    await submit();
  }

  // submit takes an optional explicit addressId so callers that just
  // created an address (the NoAddressWarning "Add address" flow) can
  // attach it immediately, without waiting for the React setState round
  // trip on `addressId`. Otherwise uses the addressId from state.
  async function submit(explicitAddressId?: string) {
    setError(null);
    if (!title.trim()) { setError("Job title is required."); return; }
    const effectiveAddressId = explicitAddressId ?? addressId;

    let body: Record<string, unknown> = {
      title: title.trim(),
      job_type: jobType.trim() || null,
      scheduled_start: scheduledStart || null,
      scheduled_end: scheduledEnd || null,
      team_notes: teamNotes.trim() || null,
      customer_notes: customerNotes.trim() || null,
      source: "manual",
      ...(loc.multi && locationId ? { location_id: locationId } : {}),
      // Only sent when they picked one. The API validates it belongs to this
      // business, is not this job, and does not close a loop.
      ...(returnOfJobId ? { return_of_job_id: returnOfJobId } : {}),
    };

    // Service address is OPTIONAL — consulting/agency/SaaS work doesn't
    // happen at a customer location. Service businesses (HVAC, cleaning,
    // etc.) want it; the new business-type setting (Task #33) will gate
    // this per-tenant. Until then, never block job creation on address.
    if (mode === "existing") {
      if (!contactId) { setError("Pick a customer."); return; }
      body = { ...body, contact_id: contactId };
      if (effectiveAddressId) body.service_address_id = effectiveAddressId;
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
        // Pricing rework 2026-08-21: the Invoicing tier (plan key `lite`) has
        // no jobs at all — Standard is the first tier with a jobs board.
        setError("Jobs aren't included in OLIVER Invoicing. Upgrade to Standard to create and schedule jobs.");
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
          <Field label="Address (optional)">
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
                No address on file for this customer. Leave blank if this job doesn't need
                an address — you'll still be able to add one from the customer's record later.
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
              <PhoneInput value={phone} onChange={setPhone} style={selectStyle} />
            </Field>
            <Field label="Company (optional)">
              <input value={company} onChange={(e) => setCompany(e.target.value)} style={{ ...selectStyle, gridColumn: "1 / -1" }} />
            </Field>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
            Address (optional)
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

      {loc.multi && (
        <div style={{ marginBottom: 12 }}>
          <Field label="Location">
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={selectStyle}>
              {loc.activeLocations.map((l) => (
                <option key={l.location_id} value={l.location_id}>{l.name}{l.is_default ? " (default)" : ""}</option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Scheduled start (optional)">
          <input type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} style={selectStyle} />
        </Field>
        <Field label="Scheduled end (optional)">
          <input type="datetime-local" value={scheduledEnd} onChange={(e) => setScheduledEnd(e.target.value)} style={selectStyle} />
        </Field>
      </div>

      {mode === "existing" && pastJobs.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Field label="Is this a return visit? (optional)">
            <select value={returnOfJobId} onChange={(e) => setReturnOfJobId(e.target.value)} style={selectStyle}>
              <option value="">No — this is new work</option>
              {pastJobs.map((j) => (
                <option key={j.job_id} value={j.job_id}>
                  {[j.job_number, j.title].filter(Boolean).join(" — ")}
                  {j.actual_end ? ` (finished ${new Date(j.actual_end).toLocaleDateString()})` : ""}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
              Pick the earlier job you are going back for. It is how repeat work is counted.
            </div>
          </Field>
        </div>
      )}

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
        <Button variant="primary" onClick={() => attemptSubmit(false)} disabled={submitDisabled}>
          {submitting ? "Creating…" : "Create job"}
        </Button>
      </div>

      {showAddrWarning && (
        <NoAddressWarning
          mode={mode}
          contactId={contactId}
          api={{ post }}
          onAdded={async (newAddressId) => {
            // For existing-customer mode, the new address just came back
            // from POST /contacts/:id/addresses. Update state AND pass it
            // explicitly to submit() so we don't depend on the React
            // setState round trip (which loses to the immediate submit call).
            if (mode === "existing") setAddressId(newAddressId);
            setShowAddrWarning(false);
            await submit(newAddressId);
          }}
          onAddInlineNew={(addr) => {
            // For new-customer mode, populate the address fields in-form
            // (the existing inline-create branch sends them with the job).
            setAddrLine1(addr.address_line_1);
            setCity(addr.city);
            setState(addr.state);
            setZip(addr.postal_code);
            setShowAddrWarning(false);
            submit();
          }}
          onCreateAnyway={() => {
            setShowAddrWarning(false);
            // bypass the gate this time
            attemptSubmit(true);
          }}
          onCancel={() => setShowAddrWarning(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NoAddressWarning — Soft gate for service businesses (requires_service_address).
// Shows when a tenant flagged as "does work at customer locations" tries to
// create a job without an address. Lets them add inline OR create anyway.
// ─────────────────────────────────────────────────────────────────────────────
interface NewAddrFields {
  address_line_1: string;
  city: string;
  state: string;
  postal_code: string;
}
function NoAddressWarning({
  mode, contactId, api, onAdded, onAddInlineNew, onCreateAnyway, onCancel,
}: {
  mode: "existing" | "new";
  contactId: string;
  api: { post: <T>(p: string, b?: unknown) => Promise<T> };
  onAdded: (newAddressId: string) => void | Promise<void>;
  onAddInlineNew: (a: NewAddrFields) => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<"warn" | "addForm">("warn");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function saveAddress() {
    setErr(null);
    if (!line1.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      setErr("All four fields are required.");
      return;
    }
    if (mode === "new") {
      // No contact exists yet — push the values back into the parent form's
      // address fields. The job POST will create both contact + address.
      onAddInlineNew({
        address_line_1: line1.trim(), city: city.trim(),
        state: state.trim(), postal_code: zip.trim(),
      });
      return;
    }
    // Existing-customer: POST /contacts/:id/addresses immediately so the
    // address gets a real id we can attach to the job.
    setSubmitting(true);
    try {
      const r = await api.post<{ address_id?: string; data?: { address_id?: string }; contact_id?: string }>(
        `/contacts/${contactId}/addresses`,
        { address_line_1: line1.trim(), city: city.trim(), state: state.trim(), postal_code: zip.trim() }
      );
      const id = r.address_id || r.data?.address_id || r.contact_id || "";
      await onAdded(id);
    } catch (e) {
      setErr((e as Error).message || "Failed to add address.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1100,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "94vw", maxWidth: 500, padding: 24 }}
           onMouseDown={(e) => e.stopPropagation()}>
        {phase === "warn" ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0B1C24" }}>No address on file</div>
            <p style={{ fontSize: 13, color: "#475569", marginTop: 8, lineHeight: 1.5 }}>
              Your business is set up as a service business (work happens at the customer's location).
              Without an address, your team won't know where to go.
            </p>
            <p style={{ fontSize: 12, color: "#5A7A8A", marginTop: 4 }}>
              Tip: you can change this in Settings → Business Profile if your business doesn't need addresses.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button onClick={onCancel}
                      style={{ padding: "8px 14px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={onCreateAnyway}
                      style={{ padding: "8px 14px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer", color: "#B45309" }}>
                Create anyway
              </button>
              <button onClick={() => setPhase("addForm")}
                      style={{ padding: "8px 14px", border: "none", background: "#0F172A", color: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                Add address
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0B1C24" }}>Add address</div>
            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A" }}>Street address *</span>
                <input value={line1} onChange={(e) => setLine1(e.target.value)}
                       style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6 }} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
                <label>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A" }}>City *</span>
                  <input value={city} onChange={(e) => setCity(e.target.value)}
                         style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6 }} />
                </label>
                <label>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A" }}>State *</span>
                  <input value={state} onChange={(e) => setState(e.target.value)}
                         style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6 }} />
                </label>
                <label>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A" }}>ZIP *</span>
                  <input value={zip} onChange={(e) => setZip(e.target.value)}
                         style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6 }} />
                </label>
              </div>
              {err && <div style={{ color: "#B91C1C", fontSize: 12, marginTop: 8 }}>{err}</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button onClick={() => setPhase("warn")} disabled={submitting}
                      style={{ padding: "8px 14px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
                Back
              </button>
              <button onClick={saveAddress} disabled={submitting}
                      style={{ padding: "8px 14px", border: "none", background: "#0F172A", color: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                {submitting ? "Saving…" : "Save & create job"}
              </button>
            </div>
          </>
        )}
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

// CustomerLocationPicker — "Who is it for, and where?"
//
// Spec: overnight-report/CUSTOMER_MODEL_MULTISITE_2026-09-15.md §7 point 2, and
// the NewJob artboard in the Customers and Locations canvas.
//
// THE SAME FIRST STEP for a job, a quote, a proposal and an invoice. Before
// this there were four of them: the Job Board's launcher had one customer
// search, the invoice form had another, and the create panels inside
// CustomerModal had none at all (the customer was implied and the location was
// never asked). Four searches is four answers to "which building?" — and §2
// records what that costs: Jobber and Workiz both lose the service address when
// a document is raised without a job in the chain, and users call fixing it
// "very cumbersome".
//
// ── THE THREE RULES IT OWNS ────────────────────────────────────────────────
//  1. ONE SEARCH over the mixed list. Typing a street finds the customer,
//     because the server's search matches a location's name, street, city and
//     postcode as well as the customer's own fields (§8.4). Picking a location
//     option selects its customer in one step.
//  2. THE PICKER IS FORCED when the customer has more than one location, and
//     ABSENT when they have one (§7's degeneracy rule: "a homeowner has one
//     location, so the location pane never appears for them"). The gate is
//     `mustPickLocation` in lib/customerModel.ts, so the three screens that ask
//     cannot each answer it slightly differently.
//  3. THE SUMMARY LINE says, in one sentence, what the user has just decided:
//     where the work happens, who hears about it, and who gets the bill. It is
//     built from the SAME ladders the server walks (roles → recipients,
//     location profile ?? customer profile → bill-to), so it cannot promise
//     something the chain will not do.
//
// It reads LUMEN directly (useSparkApi is the LUMEN client) rather than taking
// an `api` prop: the mixed list, the locations, the roles and the profiles all
// live there, and a caller passing OLIVER's client by mistake would be a 404
// nobody could explain from the screen.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, MapPin, Plus, Search, Check } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import {
  type MixedCustomerRow, type CustomerLocation, type PersonRole, type BillingProfile,
  mustPickLocation, defaultLocationId, formatLocationAddress, jobSummary,
  siteContactFor, personName, resolveBillTo,
} from "../../lib/customerModel";

export interface PickedCustomer {
  kind: "company" | "person";
  /** The LUMEN id — `lumen.account.id` or `lumen.contact.id`. */
  id: string;
  name: string;
  /** The OLIVER contact UUID, when this customer is a person OLIVER knows. */
  oliverContactId: string | null;
}

export interface CustomerLocationSelection {
  customer: PickedCustomer | null;
  /** One for a job or an invoice; several allowed for a proposal. */
  locationIds: string[];
}

export interface CustomerLocationPickerProps {
  value: CustomerLocationSelection;
  onChange: (next: CustomerLocationSelection) => void;
  /** Proposals cover several sites (§7 point 2). Everything else is one. */
  multi?: boolean;
  /**
   * The customer is already known (the create panels inside a customer's own
   * record). The search pane is replaced by a line naming them; the location
   * half behaves exactly the same.
   */
  lockedCustomer?: PickedCustomer | null;
  /** Narrow the search to customers OLIVER knows. */
  scope?: "all" | "oliver";
  /** Shown under the picker. Off for surfaces that print their own. */
  showSummary?: boolean;
  /** "+ New customer" in the results list. Omit to hide it. */
  onCreateCustomer?: (typed: string) => void;
  /** Told whenever the locations load, so a caller can pre-fill its own state. */
  onLocationsLoaded?: (locations: CustomerLocation[]) => void;
}

const inputS: React.CSSProperties = {
  width: "100%", padding: "9px 10px", fontSize: 13, color: "#0B1C24",
  border: "1px solid #CBD5E1", borderRadius: 6, background: "#fff",
};
const labelS: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 600, color: "#5A7A8A",
  marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em",
};
const groupHeadS: React.CSSProperties = {
  padding: "6px 12px", background: "#F8FAFC", fontSize: 10, fontWeight: 600,
  letterSpacing: "0.06em", textTransform: "uppercase", color: "#5A7A8A",
};
const optS: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  gap: 10, padding: "9px 12px", fontSize: 13, cursor: "pointer", width: "100%",
  background: "none", border: "none", textAlign: "left",
};

/** A location option built out of a search row that matched on its address. */
interface LocationHit {
  location: CustomerLocation;
  customer: PickedCustomer;
}

export function CustomerLocationPicker({
  value, onChange, multi = false, lockedCustomer = null,
  scope = "all", showSummary = true, onCreateCustomer, onLocationsLoaded,
}: CustomerLocationPickerProps) {
  const { get, ready } = useSparkApi();
  const customer = lockedCustomer ?? value.customer;

  // ── the search half ──────────────────────────────────────────────────────
  const [typed, setTyped] = useState("");
  const [results, setResults] = useState<MixedCustomerRow[]>([]);
  const [locationHits, setLocationHits] = useState<LocationHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Every fetch carries a sequence number and only the newest one is allowed to
  // write state. Without it a slow "hop" lands after a fast "hope" and the list
  // shows the results for a prefix the user has already finished typing.
  const seq = useRef(0);

  useEffect(() => {
    if (!ready || lockedCustomer) return;
    const q = typed.trim();
    if (q.length < 2) { setResults([]); setLocationHits([]); return; }
    const mine = ++seq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ view: "mixed", search: q, limit: "8" });
        if (scope === "oliver") params.set("scope", "oliver");
        const r = await get<{ data: MixedCustomerRow[] }>(`/api/v1/customers?${params}`);
        if (mine !== seq.current) return;
        const rows = r.data || [];
        setResults(rows);
        // A row that came back because one of its LOCATIONS matched is the
        // "picking a location selects its customer in one step" case. The list
        // row alone cannot say which location matched, so the locations of the
        // rows that have any are fetched and filtered here. Capped at the first
        // three customers: this runs on every keystroke pause.
        const withSites = rows.filter((x) => x.location_count > 0).slice(0, 3);
        const loaded = await Promise.all(withSites.map(async (row) => {
          try {
            const res = await get<{ data: CustomerLocation[] }>(
              `/api/v1/customers/${row.customer_kind}/${row.customer_id}/locations`,
            );
            return (res.data || [])
              .filter((l) => matchesLocation(l, q))
              .map((l) => ({ location: l, customer: toPicked(row) }));
          } catch { return []; }
        }));
        if (mine !== seq.current) return;
        setLocationHits(loaded.flat());
      } catch (e) {
        if (mine === seq.current) setErr((e as Error).message);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [typed, get, ready, scope, lockedCustomer]);

  // ── the location half ────────────────────────────────────────────────────
  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [roles, setRoles] = useState<PersonRole[]>([]);
  const [customerProfile, setCustomerProfile] = useState<BillingProfile | null>(null);
  const [locProfile, setLocProfile] = useState<BillingProfile | null>(null);
  const [loadingSites, setLoadingSites] = useState(false);

  const customerId = customer ? `${customer.kind}/${customer.id}` : null;

  useEffect(() => {
    if (!ready || !customerId) {
      setLocations([]); setRoles([]); setCustomerProfile(null);
      return;
    }
    let live = true;
    setLoadingSites(true);
    (async () => {
      try {
        // Three calls once per customer, not one per row. The picker needs the
        // sites, who is at them and who pays; asking for them together is the
        // page-level fetch the data-fetching convention asks for.
        const [ls, ps, bp] = await Promise.all([
          get<{ data: CustomerLocation[] }>(`/api/v1/customers/${customerId}/locations`),
          get<{ data: PersonRole[] }>(`/api/v1/customers/${customerId}/people`).catch(() => ({ data: [] })),
          get<{ data: BillingProfile | null }>(`/api/v1/customers/${customerId}/billing-profile`).catch(() => ({ data: null })),
        ]);
        if (!live) return;
        const rows = ls.data || [];
        setLocations(rows);
        setRoles(ps.data || []);
        setCustomerProfile(bp.data || null);
        onLocationsLoaded?.(rows);
      } catch (e) {
        if (live) setErr((e as Error).message);
      } finally {
        if (live) setLoadingSites(false);
      }
    })();
    return () => { live = false; };
    // onLocationsLoaded deliberately not a dependency — a caller that passes an
    // inline arrow would re-fetch on every render of its parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, get, ready]);

  // Preselect only when the answer is not a guess: one location, or a flagged
  // default. Several with no default leaves the pane empty and the user picks.
  const selectedIds = value.locationIds;
  useEffect(() => {
    if (!locations.length || selectedIds.length) return;
    const pre = defaultLocationId(locations);
    if (pre) onChange({ customer: value.customer, locationIds: [pre] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);

  const chosenLocation = useMemo(
    () => locations.find((l) => l.location_id === selectedIds[0]) || null,
    [locations, selectedIds],
  );

  // The chosen site's own billing profile, when it has one. Only fetched for a
  // site the list already said pays for itself, so the common case costs
  // nothing.
  useEffect(() => {
    const site = chosenLocation as (CustomerLocation & { pays_for_itself?: boolean }) | null;
    if (!ready || !site || !site.pays_for_itself) { setLocProfile(null); return; }
    let live = true;
    get<{ data: BillingProfile | null }>(`/api/v1/locations/${site.location_id}/billing-profile`)
      .then((r) => { if (live) setLocProfile(r.data || null); })
      .catch(() => { if (live) setLocProfile(null); });
    return () => { live = false; };
  }, [chosenLocation, get, ready]);

  const forced = mustPickLocation(locations);
  const siteContact = siteContactFor(roles, selectedIds[0] || null);
  const billTo = resolveBillTo(customerProfile, locProfile);
  const billingContactName = useMemo(() => {
    const id = billTo.profile?.billing_contact_id;
    if (!id) return null;
    const hit = roles.find((r) => r.person_contact_id === id);
    return hit ? personName(hit) : null;
  }, [billTo.profile, roles]);

  const summary = jobSummary({
    location: chosenLocation,
    siteContactName: siteContact ? personName(siteContact) : null,
    billToName: billTo.paysForItself
      ? (chosenLocation ? `${chosenLocation.name} (this location pays for itself)` : null)
      : (customer ? [billingContactName, customer.name].filter(Boolean).join(", ") : null),
  });

  const pickCustomer = useCallback((row: MixedCustomerRow, locationId?: string) => {
    onChange({ customer: toPicked(row), locationIds: locationId ? [locationId] : [] });
    setOpen(false);
    setTyped("");
  }, [onChange]);

  const toggleLocation = useCallback((id: string) => {
    if (!multi) { onChange({ customer: value.customer, locationIds: [id] }); return; }
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    onChange({ customer: value.customer, locationIds: next });
  }, [multi, onChange, selectedIds, value.customer]);

  return (
    <div data-testid="customer-location-picker" style={{ display: "grid", gridTemplateColumns: forced ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr)", gap: 20 }}>
      {/* ── who ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
        <span style={labelS}>Customer</span>
        {lockedCustomer ? (
          <div style={{ ...inputS, display: "flex", alignItems: "center", gap: 8, background: "#F8FAFC" }}>
            {lockedCustomer.kind === "company"
              ? <Building2 className="h-3.5 w-3.5" style={{ color: "#0C4A60" }} />
              : <span style={{ width: 14 }} />}
            <strong>{lockedCustomer.name}</strong>
          </div>
        ) : customer ? (
          <div style={{ ...inputS, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {customer.kind === "company" && <Building2 className="h-3.5 w-3.5" style={{ color: "#0C4A60" }} />}
              <strong>{customer.name}</strong>
            </span>
            <button
              type="button"
              onClick={() => { onChange({ customer: null, locationIds: [] }); setOpen(true); }}
              style={{ background: "none", border: "none", color: "#1A7DB5", fontSize: 12, cursor: "pointer" }}
            >
              Change
            </button>
          </div>
        ) : (
          <div style={{ ...inputS, display: "flex", alignItems: "center", gap: 8, padding: 0 }}>
            <Search className="h-3.5 w-3.5" style={{ color: "#94A3B8", marginLeft: 10 }} />
            <input
              aria-label="Search customers and locations"
              value={typed}
              autoFocus
              onChange={(e) => { setTyped(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Name, email, company or address…"
              style={{ border: "none", outline: "none", flex: 1, padding: "9px 10px 9px 0", fontSize: 13, background: "transparent" }}
            />
          </div>
        )}

        {open && !customer && typed.trim().length >= 2 && (
          <div style={{
            position: "absolute", top: 62, left: 0, right: 0, zIndex: 30, background: "#fff",
            border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
            overflow: "hidden", maxHeight: 320, overflowY: "auto",
          }}>
            {locationHits.length > 0 && (
              <>
                <div style={groupHeadS}>Matches a location</div>
                {locationHits.map((hit) => (
                  <button
                    key={hit.location.location_id}
                    type="button"
                    style={optS}
                    onClick={() => pickCustomer(
                      { ...rowFromPicked(hit.customer) },
                      hit.location.location_id,
                    )}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <MapPin className="h-3.5 w-3.5" style={{ color: "#0C4A60", flexShrink: 0 }} />
                      <span style={{ minWidth: 0 }}>
                        <strong>{hit.location.name}</strong>
                        <span style={{ color: "#5A7A8A" }}> · {formatLocationAddress(hit.location)}</span>
                      </span>
                    </span>
                    <span style={{ fontSize: 11, color: "#5A7A8A", whiteSpace: "nowrap" }}>{hit.customer.name}</span>
                  </button>
                ))}
              </>
            )}
            <div style={groupHeadS}>Matches a customer</div>
            {searching && results.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 12, color: "#5A7A8A" }}>Searching…</div>
            )}
            {!searching && results.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 12, color: "#5A7A8A" }}>
                Nothing matches “{typed.trim()}”.
              </div>
            )}
            {results.map((row) => (
              <button key={`${row.customer_kind}:${row.customer_id}`} type="button" style={optS} onClick={() => pickCustomer(row)}>
                <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {row.customer_kind === "company"
                    ? <Building2 className="h-3.5 w-3.5" style={{ color: "#0C4A60", flexShrink: 0 }} />
                    : <span style={{ width: 14, flexShrink: 0 }} />}
                  <strong style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</strong>
                  {row.email && <span style={{ color: "#5A7A8A", fontSize: 12 }}>· {row.email}</span>}
                </span>
                <span style={{ fontSize: 11, color: "#5A7A8A", whiteSpace: "nowrap" }}>
                  {row.location_count === 1 ? "1 location" : `${row.location_count} locations`}
                </span>
              </button>
            ))}
            {onCreateCustomer && (
              <button
                type="button"
                style={{ ...optS, borderTop: "1px solid #E2E8F0", color: "#0C4A60", fontWeight: 600 }}
                onClick={() => onCreateCustomer(typed.trim())}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Plus className="h-3.5 w-3.5" /> New customer</span>
              </button>
            )}
          </div>
        )}

        {err && <div style={{ fontSize: 11, color: "#991B1B" }}>{err}</div>}
        {!customer && (
          <p style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.4, margin: 0 }}>
            Type a name, an email, a company or an address. Picking a location fills in its customer too.
            A homeowner has one location, so the location pane never appears for them.
          </p>
        )}
        {customer && !forced && !loadingSites && (
          <p style={{ fontSize: 11, color: "#5A7A8A", margin: 0 }}>
            {locations.length === 1
              ? `One location: ${locations[0].name}.`
              : "No locations on this customer yet — add one from their record to put the work at an address."}
          </p>
        )}
      </div>

      {/* ── where: only when there is a choice to make ── */}
      {forced && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={labelS}>
            Location{" "}
            <span style={{ color: "#EF6C33", textTransform: "none", letterSpacing: 0 }}>
              · {customer?.name} has {locations.length}, pick {multi ? "one or more" : "one"}
            </span>
          </span>
          {locations.map((l) => {
            const site = l as CustomerLocation & { pays_for_itself?: boolean; own_payment_terms_days?: number | null };
            const on = selectedIds.includes(l.location_id);
            const contact = siteContactFor(roles, l.location_id);
            return (
              <button
                key={l.location_id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleLocation(l.location_id)}
                style={{
                  textAlign: "left", background: on ? "#F5FAFD" : "#fff", cursor: "pointer",
                  border: on ? "2px solid #2D9CDB" : "1px solid #E2E8F0", borderRadius: 8,
                  padding: on ? "11px 13px" : "12px 14px",
                  display: "flex", flexDirection: "column", gap: 6,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: 999, flexShrink: 0,
                      background: on ? "#2D9CDB" : "transparent",
                      border: on ? "none" : "1px solid #CBD5E1",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {on && <Check className="h-2.5 w-2.5" style={{ color: "#fff" }} />}
                    </span>
                    {l.name}
                  </span>
                  {site.pays_for_itself
                    ? <span style={badge("#FFF3E9", "#9A4318")}>Own invoice</span>
                    : l.is_default ? <span style={badge("#E8F4FB", "#0C4A60")}>Default</span> : null}
                </span>
                <span style={{ fontSize: 12, color: "#334155" }}>{formatLocationAddress(l)}</span>
                <span style={{ fontSize: 11, color: "#5A7A8A" }}>
                  {contact ? `Site contact ${personName(contact)} · ` : ""}
                  {site.pays_for_itself
                    ? `its own invoice${site.own_payment_terms_days ? ` · Net ${site.own_payment_terms_days}` : ""}`
                    : `bills to ${customer?.name}${customerProfile?.payment_terms_days ? ` · Net ${customerProfile.payment_terms_days}` : ""}`}
                </span>
              </button>
            );
          })}
          {showSummary && selectedIds.length > 0 && (
            <div style={{
              marginTop: 4, padding: "10px 12px", borderRadius: 8, background: "#F2F6F9",
              fontSize: 12, color: "#334155", display: "flex", flexDirection: "column", gap: 2,
            }}>
              <span style={labelS}>This job will</span>
              <span data-testid="picker-summary">{summary.text}</span>
            </div>
          )}
        </div>
      )}

      {/* One location and nothing to choose: the summary still says what will
          happen, because "no picker" must not mean "no answer shown". */}
      {!forced && showSummary && chosenLocation && (
        <div style={{
          padding: "10px 12px", borderRadius: 8, background: "#F2F6F9",
          fontSize: 12, color: "#334155", display: "flex", flexDirection: "column", gap: 2,
        }}>
          <span style={labelS}>This job will</span>
          <span data-testid="picker-summary">{summary.text}</span>
        </div>
      )}
    </div>
  );
}

function badge(bg: string, fg: string): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "2px 8px",
    fontSize: 10, fontWeight: 600, background: bg, color: fg, whiteSpace: "nowrap",
  };
}

function matchesLocation(l: CustomerLocation, q: string): boolean {
  const needle = q.toLowerCase();
  return [l.name, l.address_line1, l.city, l.postal_code]
    .some((v) => String(v || "").toLowerCase().includes(needle));
}

export function toPicked(row: MixedCustomerRow): PickedCustomer {
  return {
    kind: row.customer_kind,
    id: row.customer_id,
    name: row.name,
    oliverContactId: row.oliver_contact_id,
  };
}

/** The inverse, for the location options — which already hold a PickedCustomer. */
function rowFromPicked(p: PickedCustomer): MixedCustomerRow {
  return {
    customer_kind: p.kind, customer_id: p.id, name: p.name,
    email: null, phone: null, domain: null, contact_count: 0, location_count: 0,
    oliver_contact_id: p.oliverContactId, open_balance: null, last_job_at: null,
    contact_intelligence_tier: null, contact_intelligence_score: null, source: null,
    email_unsubscribed: false, email_invalid: false, subscription_status: null, updated_at: null,
  };
}

export default CustomerLocationPicker;

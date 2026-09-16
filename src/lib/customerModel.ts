// lib/customerModel.ts — the customer model's shapes and its four decisions,
// with no React and no network in sight.
//
// Spec: overnight-report/CUSTOMER_MODEL_MULTISITE_2026-09-15.md §7 points 1–4.
//
// Four screens read this module: SPARK Contacts, SPARK Companies, OLIVER's
// customer record and the new-job / quote / proposal / invoice picker. Each of
// them could have made these calls inline, and each would have made them
// slightly differently — which is how the picker ends up forcing a choice on a
// homeowner on one screen and not on another. They live here so a test can
// drive them without a DOM, which is the Portal's runner (`node --test` over
// pure modules).

/** A row of `GET /api/v1/customers?view=mixed`. */
export interface MixedCustomerRow {
  customer_kind: "company" | "person";
  /** LUMEN's id: `lumen.account.id` for a company, `lumen.contact.id` for a person. */
  customer_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  domain: string | null;
  contact_count: number;
  location_count: number;
  /** The OLIVER contact UUID. NULL on a company — a company is not a contact. */
  oliver_contact_id: string | null;
  /** NULL means "nobody asked", which is not the same as 0. See `hasMoney`. */
  open_balance: number | null;
  last_job_at: string | null;
  contact_intelligence_tier: string | null;
  contact_intelligence_score: number | null;
  source: string | null;
  email_unsubscribed: boolean;
  email_invalid: boolean;
  subscription_status: "active" | "past_due" | "cancelled" | "trialing" | "unpaid" | "incomplete" | null;
  updated_at: string | null;
}

export interface CustomerLocation {
  location_id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  access_notes: string | null;
  gate_code: string | null;
  tax_rate: number | null;
  is_default: boolean;
  sort_order: number;
  is_archived: boolean;
}

export type CustomerRole = "primary" | "working" | "billing" | "site";

export interface PersonRole {
  role_id: string;
  role: CustomerRole;
  location_id: string | null;
  location_name: string | null;
  person_contact_id: number;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface BillingProfile {
  billing_profile_id: string;
  location_id: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  billing_contact_id: number | null;
  payment_terms_days: number | null;
  po_number: string | null;
  tax_exempt: boolean;
  stripe_customer_id: string | null;
  notes: string | null;
}

/** Where a custom field is shown. The four `show_on` targets the API accepts. */
export type ShowOnTarget = "customer_card" | "location_card" | "job_sheet" | "merge_field";

export interface CustomFieldDef {
  id: number;
  entity_kind: "contact" | "deal" | "account" | "location" | "job";
  field_key: string;
  label: string;
  field_type: "string" | "number" | "date" | "boolean" | "enum";
  enum_options: string | null;
  required: boolean;
  sort_order: number;
  show_on: string | null;
  help_text: string | null;
}

/** A definition plus this entity's value, as `/custom-fields/values/:kind/:id` returns it. */
export interface CustomFieldValue extends Omit<CustomFieldDef, "id" | "entity_kind"> {
  field_id: number;
  value_text: string | null;
}

// ── 1. The mixed list is TWO groups, and the order is the decision ─────────

export interface MixedGroups {
  companies: MixedCustomerRow[];
  /** §7 point 1's labelled group: "people without a company". */
  peopleWithoutCompany: MixedCustomerRow[];
}

/**
 * Split the mixed list into the two groups the screen draws.
 *
 * Companies first, then the labelled group. NOT a sort with companies weighted
 * first: the two groups have different rows (a company row takes no checkbox)
 * and a divider between them, so they are two lists on screen and two lists
 * here. The server already ordered each half by name; this preserves that
 * order rather than re-sorting, so the page and the pagination agree about
 * which rows are on it.
 */
export function groupMixedList(rows: readonly MixedCustomerRow[]): MixedGroups {
  const companies: MixedCustomerRow[] = [];
  const peopleWithoutCompany: MixedCustomerRow[] = [];
  for (const r of rows) {
    if (r.customer_kind === "company") companies.push(r);
    else peopleWithoutCompany.push(r);
  }
  return { companies, peopleWithoutCompany };
}

/**
 * The "People only" chip flattens the mixed list to the people on it.
 *
 * It is a FILTER of the rows already fetched, not a different request: the
 * chip exists so bulk actions have checkboxes, and a chip that re-queried
 * would give you a different page of people from the one you were looking at.
 * A company row is dropped, never turned into its contacts — those people are
 * not on this page, and pretending otherwise would let a bulk delete reach
 * rows nobody saw.
 */
export function peopleOnly(rows: readonly MixedCustomerRow[]): MixedCustomerRow[] {
  return rows.filter((r) => r.customer_kind === "person");
}

/** A row's stable key. `kind:id` — a company #10 and a contact #10 both exist. */
export function customerKey(row: Pick<MixedCustomerRow, "customer_kind" | "customer_id">): string {
  return `${row.customer_kind}:${row.customer_id}`;
}

/**
 * Did anybody ask for this row's money?
 *
 * Granted on the PRESENCE of a number, never written as `!== 0`: the list
 * returns NULL when the money columns were not computed, and rendering that as
 * "$0.00" tells an owner their customer is square when nobody looked
 * (reference_absence_based_guards_fail_open).
 */
export function hasMoney(row: Pick<MixedCustomerRow, "open_balance">): boolean {
  return typeof row.open_balance === "number";
}

// ── 2. The forced location picker ──────────────────────────────────────────

/**
 * Must the user pick a location before this document can be created?
 *
 * §7 point 2: "then the location if more than one (forced picker)". The
 * degeneracy rule is the whole point — a homeowner has one location and never
 * sees the pane — so the gate is `> 1` and nothing else. Written as a named
 * function because three screens ask it and a `locations.length > 1` typed
 * into each is three places for it to become `>= 1`.
 */
export function mustPickLocation(locations: readonly CustomerLocation[]): boolean {
  return locations.length > 1;
}

/**
 * The location a document starts on: the customer's default, else the only
 * one, else none (and then `mustPickLocation` is true and the user chooses).
 *
 * A customer with several locations and no default gets NO preselection. The
 * alternative — quietly preselecting the first — is Workiz's "picks one
 * silently" behaviour that §2 records users complaining about, and it puts a
 * crew at the wrong building with the form looking answered.
 */
export function defaultLocationId(locations: readonly CustomerLocation[]): string | null {
  if (locations.length === 1) return locations[0].location_id;
  const flagged = locations.find((l) => l.is_default);
  return flagged ? flagged.location_id : null;
}

/** One line of address, the way every card and option prints it. */
export function formatLocationAddress(l: Pick<CustomerLocation, "address_line1" | "address_line2" | "city" | "state" | "postal_code"> | null | undefined): string {
  if (!l) return "";
  const street = [l.address_line1, l.address_line2].filter(Boolean).join(", ");
  const town = [l.city, l.state].filter(Boolean).join(", ");
  return [street, town, l.postal_code].filter(Boolean).join(" ").replace(/\s+,/g, ",").trim();
}

// ── 3. The summary line ────────────────────────────────────────────────────

export interface JobSummaryInput {
  location: CustomerLocation | null;
  /** Who hears about the work: the site contact at this location, else a working contact. */
  siteContactName: string | null;
  /** Who the invoice goes to, already resolved by the caller from the profiles. */
  billToName: string | null;
}

export interface JobSummary {
  doneAt: string | null;
  updatesTo: string | null;
  invoiceTo: string | null;
  /** The one sentence the artboard prints under the picker. */
  text: string;
}

/**
 * "Be done at X · updates to Y · invoice to Z" — the artboard's summary line.
 *
 * Every clause that has no answer is DROPPED, not printed as "—". A form that
 * says "invoice to —" reads as a decision the user made; a form that omits the
 * clause reads as a question still open, which is what it is.
 */
export function jobSummary(input: JobSummaryInput): JobSummary {
  const doneAt = input.location ? input.location.name : null;
  const updatesTo = input.siteContactName || null;
  const invoiceTo = input.billToName || null;
  const parts: string[] = [];
  if (doneAt) parts.push(`Be done at ${doneAt}`);
  if (updatesTo) parts.push(`updates to ${updatesTo}`);
  if (invoiceTo) parts.push(`invoice to ${invoiceTo}`);
  return { doneAt, updatesTo, invoiceTo, text: parts.join(" · ") };
}

/**
 * Who hears about work at this location: the site contact there, then a
 * working contact at the customer, then the primary. The same ladder
 * `oliver lib/customerRecipients.js` walks (§9.5) — the summary line must not
 * name somebody the notification would not actually reach.
 */
export function siteContactFor(roles: readonly PersonRole[], locationId: string | null): PersonRole | null {
  const label = (r: PersonRole) => r;
  if (locationId) {
    const atSite = roles.find((r) => r.location_id === locationId && (r.role === "site" || r.role === "working"));
    if (atSite) return label(atSite);
  }
  const working = roles.find((r) => r.role === "working" && !r.location_id);
  if (working) return label(working);
  const primary = roles.find((r) => r.role === "primary");
  return primary ? label(primary) : null;
}

/** A person's display name from a role row. */
export function personName(r: Pick<PersonRole, "display_name" | "first_name" | "last_name" | "email"> | null | undefined): string {
  if (!r) return "";
  const n = (r.display_name || `${r.first_name || ""} ${r.last_name || ""}`).trim();
  return n || r.email || "";
}

/**
 * Which billing profile pays for work at this location: the location's own if
 * it has one, else the customer's. §7 point 4's resolution order, and the ONE
 * place the front end states it — the server resolves it again when the job is
 * created, and this is only what the summary line shows beforehand.
 */
export function resolveBillTo(
  customerProfile: BillingProfile | null,
  locationProfile: BillingProfile | null,
): { profile: BillingProfile | null; paysForItself: boolean } {
  if (locationProfile) return { profile: locationProfile, paysForItself: true };
  return { profile: customerProfile, paysForItself: false };
}

// ── 4. Custom fields ───────────────────────────────────────────────────────

/** Parse the API's `show_on` JSON. Anything unparseable is NO targets, not all. */
export function parseShowOn(raw: string | null | undefined): ShowOnTarget[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: ShowOnTarget[] = ["customer_card", "location_card", "job_sheet", "merge_field"];
    return parsed.filter((x): x is ShowOnTarget => valid.includes(x));
  } catch {
    return [];
  }
}

/**
 * The fields a card shows.
 *
 * Granted on the PRESENCE of the target in `show_on`. A field with no `show_on`
 * shows NOWHERE — the opposite default (absent means everywhere) would put a
 * field labelled "Internal margin note" on the customer's job sheet the moment
 * somebody forgot to tick a box.
 */
export function visibleOn<T extends { show_on: string | null }>(defs: readonly T[], target: ShowOnTarget): T[] {
  return defs.filter((d) => parseShowOn(d.show_on).includes(target));
}

/** The four tabs Settings → Custom fields shows, and the API kind each writes. */
export const CUSTOM_FIELD_TABS = [
  { key: "customer", label: "Customers", apiKind: "customer", noun: "customer", card: "customer_card" as ShowOnTarget },
  { key: "property", label: "Properties", apiKind: "property", noun: "location", card: "location_card" as ShowOnTarget },
  { key: "job", label: "Jobs", apiKind: "job", noun: "job", card: "job_sheet" as ShowOnTarget },
  { key: "deal", label: "Deals", apiKind: "deal", noun: "deal", card: null },
] as const;

export type CustomFieldTabKey = (typeof CUSTOM_FIELD_TABS)[number]["key"];

/** Role chips, in the order the company card lists them. */
export const ROLE_ORDER: CustomerRole[] = ["primary", "billing", "working", "site"];

export const ROLE_LABEL: Record<CustomerRole, string> = {
  primary: "Primary",
  billing: "Billing",
  working: "Working",
  site: "Site",
};

/** What each role actually decides, said in the words the card uses. */
export const ROLE_HELP: Record<CustomerRole, string> = {
  primary: "The person we deal with. Hears about anything nobody else is set up for.",
  billing: "Gets the invoices and sees the balance. Left out of campaigns unless you include them.",
  working: "Hears about the work across every location.",
  site: "Hears about the work at one location. Never sees the balance.",
};

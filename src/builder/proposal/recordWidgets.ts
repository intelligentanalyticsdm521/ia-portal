/**
 * builder/proposal/recordWidgets.ts — THE RECORD BOOK.
 *
 * What the database says about the customer, the site and the business, in the
 * one shape every surface reads it in.
 *
 * ── THE THREE WIDGETS THAT USED TO LIVE HERE ARE DELETED (D-167) ──────────
 * **Customer**, **Service Location** and **Business Info** were built on the
 * morning of 2026-09-19 and deleted the same afternoon. Brandon, looking at
 * them:
 *
 *   "What are these widgets. I don't need this. I need dynamic fields for
 *    customer information and just normal widgets … Widgets are just stylized
 *    sections for inside the container to help pull things and create an easy
 *    to use guide for the client, exactly like Elementor. Then inside these we
 *    can add a widget for like custom fields that we can then select from the
 *    database."
 *
 * So there is ONE widget — `widgets/families/ia/customField.ts` — and a
 * "Customer details" block is a SECTION TEMPLATE made of Custom Fields the
 * author can pull apart (`proposal/sectionTemplates.ts`). Stored documents
 * convert on open, on the editor's door (`upgrade.ts`) and on the server's
 * (oliver-api `lib/deletedKinds.js`).
 *
 * What is left here is the half nobody objected to: WHICH FIELDS EXIST, what
 * each one is called, what the record says, and what the author retyped. This
 * module is the reading; the Custom Field widget is the front.
 *
 * PURE. No React, no fetch — the record is handed in, as it is everywhere on
 * this platform, so every line here runs under `node --test`.
 */
import type { RenderContext } from "../render";
import { lookup } from "../merge";
import { bindingSettings } from "../widgets/binding";

/* ══════════════════════════════════════════════════════════════════════════
   The three records, and the fields each one has
   ══════════════════════════════════════════════════════════════════════════ */

/** The three records a document reads. New in 11.13; no old ids to keep. */
export type RecordKind = "customer" | "service_location" | "business_info";

export const RECORD_KINDS: readonly RecordKind[] = ["customer", "service_location", "business_info"];

/** One field of one record. */
export interface RecordFieldDef {
  /** The key on the record AND the override key. One name, not two. */
  key: string;
  /** Plain words on the page, beside the value. */
  label: string;
  /** What the author sees in edit mode when the record has nothing. */
  placeholder: string;
  /** A picture rather than a run of text — the business's logo, and only it. */
  picture?: true;
}

/**
 * WHICH FIELDS EACH RECORD HAS — 11.13.2's own list, word for word.
 *
 * "name, company, contact, email, phone, billing address / location name,
 *  address, access notes / the business's name, logo, phone, email, licence"
 *
 * Nothing else. A field that is not on that sentence is a field nobody asked
 * for, which is how the Details group happened. oliver-api `documentModel.js`
 * holds the same list and a test pins the two against each other.
 */
export const RECORD_FIELDS: Readonly<Record<RecordKind, readonly RecordFieldDef[]>> = {
  customer: [
    { key: "name", label: "Name", placeholder: "Who this is for" },
    { key: "company", label: "Company", placeholder: "The business name on the agreement" },
    { key: "contact", label: "Contact", placeholder: "Who to speak to" },
    { key: "email", label: "Email", placeholder: "Where the document goes" },
    { key: "phone", label: "Phone", placeholder: "Best number" },
    { key: "billing_address", label: "Billing address", placeholder: "Where the invoice goes" },
  ],
  service_location: [
    { key: "name", label: "Location", placeholder: "What this site is called" },
    { key: "address", label: "Address", placeholder: "Street, town, postcode" },
    /* CARRIED OVER, NOT INVENTED. 11.13.2's sentence names "location name,
       address, access notes"; the widget this replaced (`address_block`) also
       printed the SITE CONTACT, and a crew sheet that quietly stopped saying
       who to ask for on the day would be a fact deleted by a rename. */
    { key: "site_contact", label: "Site contact", placeholder: "Who to ask for on the day" },
    { key: "access_notes", label: "Access notes", placeholder: "Gate code, where to park, who to call" },
  ],
  business_info: [
    { key: "logo", label: "Logo", placeholder: "Your mark", picture: true },
    { key: "name", label: "Business", placeholder: "Your business name" },
    { key: "phone", label: "Phone", placeholder: "Your number" },
    { key: "email", label: "Email", placeholder: "Your email" },
    { key: "licence", label: "Licence", placeholder: "Your licence number" },
  ],
};

/** Is this one of the three records? */
export function isRecordKind(kind: unknown): kind is RecordKind {
  return RECORD_KINDS.includes(String(kind ?? "") as RecordKind);
}

/** The fields of one record, or an empty list for anything else. */
export function fieldsOf(kind: string): readonly RecordFieldDef[] {
  return isRecordKind(kind) ? RECORD_FIELDS[kind] : [];
}

/** One field's own words, for a panel that has only the two ids. */
export function recordFieldLabel(kind: string, field: string): string {
  return fieldsOf(kind).find((f) => f.key === field)?.label ?? field;
}

/* ══════════════════════════════════════════════════════════════════════════
   The record, as the page reads it
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The values the DATABASE has for one record, already plain strings.
 *
 * Assembled by the adapter from the customer it fetched, the location chip and
 * the business identity — the same "handed in, never fetched" contract every
 * renderer on this platform follows. Absent keys mean the record has nothing
 * there, which is a different thing from the author blanking it.
 */
export type RecordValues = Record<string, string>;

/** Every record's live values, keyed by kind. What `ctx.extra` is given. */
export type RecordBook = Partial<Record<RecordKind, RecordValues>>;

const str = (v: unknown): string => (v == null ? "" : String(v));

/** The overrides map off one widget, through the ONE binding reader. */
function overridesOf(props: Record<string, unknown> | undefined | null): Record<string, string> {
  const raw = bindingSettings(props).overrides;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (v == null || typeof v === "object") continue;
    out[k] = String(v);
  }
  return out;
}

/** One field, resolved: what it shows, where the words came from. */
export interface ResolvedField extends RecordFieldDef {
  value: string;
  /** The author retyped this one. It has stopped tracking the record. */
  overridden: boolean;
  /** What the record says, still, under the override. */
  live: string;
}

/**
 * Every field of one record, resolved against what the author retyped.
 *
 * Kept because the UPGRADE reads it: a stored Customer block is turned into one
 * Custom Field per field it showed, and "which fields did it show, and what did
 * the author type into them" is exactly this function's answer.
 *
 * An override of `""` is a real answer — "I want this line blank" — and is
 * kept, because the alternative is a field an author cannot clear.
 */
export function resolveRecord(
  kind: string,
  props: Record<string, unknown> | undefined | null,
  record: RecordValues | undefined | null,
): ResolvedField[] {
  const over = overridesOf(props);
  const rec = record || {};
  /* A FLAT PROP IS A TYPED VALUE TOO (integration, 2026-09-19).
     `address_block` stored the author's words as `props.name` / `props.address`
     / `props.contact` / `props.notes`, and a document written before the
     upgrade landed still holds them. A typed address on a signed agreement must
     not come back blank, so a flat prop counts as an override. */
  const LEGACY: Record<string, string> = { site_contact: "contact", access_notes: "notes" };
  const p: any = props || {};
  return shownFields(kind, props).map((f) => {
    const live = str(rec[f.key]);
    const flat = str(p[f.key]) || str(p[LEGACY[f.key] ?? ""]);
    const has = Object.prototype.hasOwnProperty.call(over, f.key) || !!flat;
    const typed = Object.prototype.hasOwnProperty.call(over, f.key) ? over[f.key] : flat;
    return { ...f, live, overridden: has, value: has ? typed : live };
  });
}

/**
 * WHICH FIELDS A STORED BLOCK SHOWED.
 *
 * A field was shown unless its toggle was explicitly off. Absent means ON, so a
 * block written before the toggles existed converts to every field it had —
 * which is the way round that never deletes a fact by accident.
 */
export function shownFields(kind: string, props: Record<string, unknown> | undefined | null): RecordFieldDef[] {
  const p: any = props || {};
  return fieldsOf(kind).filter((f) => p[showKey(f.key)] !== false && p[showKey(f.key)] !== "false");
}

/** The prop that said whether one field showed. One spelling, one place. */
export function showKey(field: string): string {
  return `show_${field}`;
}

/**
 * WHICH RECORD A WIDGET READS.
 *
 * Usually the one the top bar chose, which is what `book` holds. The exception
 * is a site the author pointed at a particular location: its `locationId` names
 * a row in `ctx.locations`, and that row wins.
 *
 * ── FOUND BY DRIVING IT (2026-09-19) ──────────────────────────────────────
 * The canvas did NOT have this branch and the server did
 * (`documentModel.js flatRecord`). So a document whose site was bound to one
 * location, opened after the customer had been changed, read one address in the
 * editor and printed the OTHER on the PDF. The PDF was the one telling the
 * truth — the author pointed that widget somewhere, and changing the customer
 * does not un-point it.
 */
export function recordValuesFor(
  kind: RecordKind,
  props: Record<string, unknown> | undefined | null,
  ctx: RenderContext,
  book: RecordBook,
): RecordValues {
  if (kind !== "service_location") return book[kind] || {};
  const id = str((props as any)?.locationId).toLowerCase();
  const loc: any = id ? (ctx.locations || {})[id] : null;
  if (!loc) return book.service_location || {};
  const line1 = loc.address_line1 ?? loc.address_line_1;
  const line2 = loc.address_line2 ?? loc.address_line_2;
  const address = [line1, line2, [loc.city, loc.state].filter(Boolean).join(", "), loc.postal_code]
    .filter((x) => str(x)).join(", ");
  const out: RecordValues = {};
  if (str(loc.name)) out.name = str(loc.name);
  if (address) out.address = address;
  if (str(loc.site_contact)) out.site_contact = str(loc.site_contact);
  if (str(loc.access_notes)) out.access_notes = str(loc.access_notes);
  return out;
}

/**
 * THE BOOK A SURFACE WITH NO ADAPTER CAN BUILD, out of the RenderContext.
 *
 * The proposal BUILDER hands the renderer a book it assembled from the contact,
 * the picked sites and the business identity it fetched. The customer's own
 * copy (`PublicProposalPage`), the sent wire (`proposalDoc.toWire`) and the
 * template preview do not have an adapter — they render the stored document
 * with a plain context — and a signed agreement arriving without the customer's
 * name on it is the failure this exists to stop.
 *
 * Every value comes from facts the context already carries: the merge map
 * (`customer.*`, `business.*` — the same map the tokens on the page read) and
 * `ctx.business`. It is the FALLBACK: `render.ts` asks `ctx.extra` first.
 */
export function recordBookFromContext(ctx: RenderContext): RecordBook {
  const m = ctx.merge || {};
  const at = (token: string) => str(lookup(m, token));
  const clean = (o: RecordValues): RecordValues => {
    const out: RecordValues = {};
    for (const [k, v] of Object.entries(o)) if (str(v).trim()) out[k] = str(v);
    return out;
  };
  const b: any = ctx.business || {};
  return {
    customer: clean({
      name: at("customer.name"),
      company: at("customer.company_name") || at("customer.legal_name"),
      contact: at("customer.contact_name"),
      email: at("customer.email"),
      phone: at("customer.phone"),
      billing_address: at("customer.billing_address") || at("customer.address"),
    }),
    /* A SITE IS READ OFF THE WIDGET'S OWN `locationId`, never guessed from the
       merge map — guessing is how one customer's address printed on another's
       paper (the defect the 2026-09-19 drive found). The merge map's
       `property.*` tokens ARE the document's primary site, so they are the
       fallback for a widget that names no location of its own. */
    service_location: clean({
      name: at("property.name"),
      address: at("property.address"),
      site_contact: at("property.site_contact"),
      access_notes: at("property.access_notes"),
    }),
    business_info: clean({
      logo: str(b.logoUrl),
      name: str(b.name) || at("business.name"),
      phone: at("business.phone") || str(b.phone),
      email: at("business.email") || str(b.email),
      licence: at("business.licence"),
    }),
  };
}


export default {
  RECORD_KINDS, RECORD_FIELDS,
  isRecordKind, fieldsOf, recordFieldLabel, shownFields, showKey, resolveRecord,
  recordValuesFor, recordBookFromContext,
};

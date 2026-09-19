/**
 * builder/widgets/iaData.ts — THE THREE WIDGETS THAT FILL THEMSELVES FROM THE
 * DATABASE: **Customer**, **Service Location** and **Business Info**.
 *
 * §11.13.2, in Brandon's own words: *"The fields should be dynamic. Load a
 * customer and it auto loads customer information."* And: *"Nobody types into a
 * list of boxes."* So the customer is picked once in the top bar, these three
 * widgets fill from the record, and every line is edited **on the page**.
 *
 * ── WHAT THIS REPLACES, AND IT IS DELETED NOT HIDDEN ──────────────────────
 * The Details group, the "still to fill in" counter and `merge_field`
 * ("Personal detail") were invented on 2026-09-16 to give blanks a home. They
 * are gone. `address_block` is gone too: an address on a proposal is either the
 * CUSTOMER's or the SERVICE LOCATION's, and one widget that was quietly both is
 * how a bill went to a site office. `upgrade.ts` converts every stored one by
 * its binding.
 *
 * ── A LINE THAT IS STILL A BLANK ──────────────────────────────────────────
 * A value the record does not hold — a term date, a trigger depth — is a plain
 * editable run with a placeholder in edit mode and nothing on the customer's
 * copy. Send still refuses a document with blanks by walking the page (D-164),
 * which is why these rows carry `data-edit` like any other run and are not a
 * form.
 */
import type { Widget } from "../model";
import { esc, type LocationLite, type RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, pictureFrom } from "../pictures";
import { editRun } from "./text";
import { BINDING_CONTROLS, bindingDefaults, onEmptyOf, selectionOf } from "./binding";
import { DOCUMENTS } from "./audience";
import { lookup } from "../merge";

const str = (v: unknown): string => (v == null ? "" : String(v));

/**
 * ONE ROW of a data widget, and the whole of "edited in place".
 *
 * `record` is what the database says. When it has a value the row prints it and
 * the author may still type over it — the typed value is kept on the widget and
 * wins from then on, which is §11.12's Binding rule said in one function rather
 * than in three widgets.
 */
function dataRow(
  label: string,
  path: string,
  typed: string,
  record: string,
  placeholder: string,
  ctx: RenderContext,
): string {
  const value = typed || record;
  if (!value && ctx.mode !== "edit") return "";
  return `<div class="bx-fact" style="display:flex;gap:10px;padding:4px 0">
    <span class="bx-fact-k" style="min-width:120px;color:#5A7A8A">${esc(label)}</span>${
    editRun(path, value, "bx-fact-v", placeholder, ctx, "span")}</div>`;
}

/** Nothing typed and nothing on the record: honour `on_empty` and stop. */
function emptyBody(props: any, cls: string, ctx: RenderContext): string | null {
  if (ctx.mode === "edit") return null;
  return onEmptyOf(props) === "placeholder"
    ? `<div class="${cls} ${cls}-empty" data-empty="placeholder"></div>`
    : "";
}

/* ══════════════════════════════════════════════════════════════════════════
   Customer — who the document is for
   ══════════════════════════════════════════════════════════════════════════ */

/** The record's answer for each row, from the customer picked in the top bar. */
export function customerFields(ctx: RenderContext): Record<string, string> {
  const m = ctx.merge || {};
  const at = (token: string) => str(lookup(m, token));
  return {
    name: at("customer.name"),
    legal_name: at("customer.legal_name"),
    contact_name: at("customer.contact_name"),
    email: at("customer.email"),
    phone: at("customer.phone"),
    billing_address: at("customer.billing_address") || at("customer.address"),
  };
}

export function renderCustomer(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const rec = customerFields(ctx);
  const rows: Array<[string, string, string, string]> = [
    ["Customer", "name", rec.name, "Who this is for"],
    ["Legal name", "legal_name", rec.legal_name, "The name on the contract"],
    ["Contact", "contact_name", rec.contact_name, "Who to speak to"],
    ["Email", "email", rec.email, "Where it is sent"],
    ["Phone", "phone", rec.phone, "Best number"],
    ["Billing address", "billing_address", rec.billing_address, "Where the invoice goes"],
  ];
  const shown = rows.filter(([, key, record]) => str(p[key]) || record || ctx.mode === "edit");
  if (!shown.length) {
    const early = emptyBody(p, "bx-customer", ctx);
    if (early !== null) return early;
  }
  return `<div class="bx-customer">
    ${editRun("heading", p.heading, "bx-h bx-h3", "Prepared for", ctx)}
    ${shown.map(([label, key, record, ph]) => dataRow(label, key, str(p[key]), record, ph, ctx)).join("")}
    ${ctx.mode === "edit"
      ? `<div class="bx-card-note">These fill in from the customer you picked. Type over any line and this document keeps what you typed.</div>`
      : ""}
  </div>`;
}

export const CUSTOMER_DEF: WidgetDef = {
  kind: "customer",
  label: "Customer",
  description: "Who this is for — name, contact, email, phone and billing address, straight from their record.",
  icon: "User",
  picture: pictureFrom(`<circle cx="16" cy="14" r="6" fill="#94A3B8" stroke="none"/>`
    + `<path d="M8 32c0-5 4-8 8-8s8 3 8 8" fill="#94A3B8" stroke="none"/>`
    + bar(32, 10, 24) + bar(32, 19, 20) + bar(32, 28, 26)),
  category: "Intelligent Analytics",
  adapters: DOCUMENTS,
  defaults: {
    heading: "Prepared for", name: "", legal_name: "", contact_name: "", email: "", phone: "", billing_address: "",
    ...bindingDefaults("lumen:customer"),
  },
  controls: [
    { key: "heading", label: "Heading", type: "text", tab: "content", section: "Customer" },
    ...BINDING_CONTROLS,
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   Service Location — where the work happens. What `address_block` becomes.
   ══════════════════════════════════════════════════════════════════════════ */

/** One location as the page prints it: street, second line, town, postcode. */
export function locationAddress(loc?: LocationLite | null): string {
  if (!loc) return "";
  const line1 = (loc as any).address_line1 ?? (loc as any).address_line_1;
  const line2 = (loc as any).address_line2 ?? (loc as any).address_line_2;
  return [line1, line2, [loc.city, (loc as any).state].filter(Boolean).join(", "), (loc as any).postal_code]
    .filter(Boolean).join(", ");
}

export interface LocationFields {
  heading: string;
  name: string; address: string; contact: string; notes: string; locationId: string; bound: boolean;
}

/**
 * What this block shows: the record when it is bound, what was typed otherwise.
 *
 * KEPT UNDER ITS OLD NAME. `proposalDoc.ts` belongs to another stream and reads
 * it to freeze a bound address at send; renaming the function in the same pass
 * that renames the KIND would be two changes crossing one boundary, and the
 * second one is not mine to make. The name is in the handoff.
 */
export function addressFields(
  props: Record<string, unknown> | undefined | null,
  locations?: Record<string, LocationLite> | null,
): LocationFields {
  const p: any = props || {};
  const locationId = selectionOf(p).locationId;
  const loc = locationId ? (locations || {})[locationId] : undefined;
  return {
    heading: str(p.heading),
    name: str(p.name) || str(loc?.name),
    address: str(p.address) || locationAddress(loc),
    contact: str(p.contact) || str((loc as any)?.site_contact),
    notes: str(p.notes) || str((loc as any)?.access_notes),
    locationId,
    bound: !!loc,
  };
}

export function renderServiceLocation(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const f = addressFields(p, ctx.locations);
  if (!f.name && !f.address && !f.contact && !f.notes) {
    const early = emptyBody(p, "bx-address", ctx);
    if (early !== null) return early;
  }
  return `<div class="bx-address">
    ${editRun("heading", p.heading, "bx-h bx-h3", "Service address", ctx)}
    ${dataRow("Property", "name", str(p.name), f.name, "What this site is called", ctx)}
    ${dataRow("Address", "address", str(p.address), f.address, "Street, town, postcode", ctx)}
    ${dataRow("Site contact", "contact", str(p.contact), f.contact, "Who to ask for on the day", ctx)}
    ${dataRow("Getting in", "notes", str(p.notes), f.notes, "Gate code, where to park, who to call", ctx)}
    ${f.bound && ctx.mode === "edit"
      ? `<div class="bx-card-note">These come from the customer's own record, so the crew's sheet and this page cannot disagree.</div>`
      : ""}
  </div>`;
}

export const SERVICE_LOCATION_DEF: WidgetDef = {
  kind: "service_location",
  label: "Service Location",
  description: "Where the work happens — pick one of the customer's locations and the address fills itself in.",
  icon: "MapPin",
  picture: pictureFrom(`<path d="M12 8a5 5 0 0 1 5 5c0 4-5 9-5 9s-5-5-5-9a5 5 0 0 1 5-5z" fill="#94A3B8" stroke="none"/>`
    + bar(22, 10, 34) + bar(22, 20, 26) + bar(22, 29, 30)),
  category: "Intelligent Analytics",
  adapters: DOCUMENTS,
  defaults: {
    heading: "Service address", name: "", address: "", contact: "", notes: "",
    /* `locationId` IS ONE OF THE DEFAULTS, explicitly. It is not our key alone:
       oliver-api's `locationIdsInDocument` reads it off the stored document to
       open a job per site, and `bindPlansToLocation` fills it when the author
       picks the document's location — both of which look for the key being
       PRESENT and empty, not absent. */
    locationId: "",
    ...bindingDefaults("lumen:locations"),
  },
  // "Which location" is the adapter's control (D-33): only the adapter knows
  // which locations THIS customer has. The Binding section is the shared one.
  controls: [
    { key: "heading", label: "Heading", type: "text", tab: "content", section: "Service Location" },
    ...BINDING_CONTROLS,
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   Business Info — your own name, logo, phone and licence
   ══════════════════════════════════════════════════════════════════════════ */

export function renderBusinessInfo(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const b = ctx.business || { name: "" };
  const m = ctx.merge || {};
  const name = str(p.name) || str(b.name);
  const logo = p.show_logo === false ? "" : str(p.logo_url || b.logoUrl || "");
  const rows: Array<[string, string, string, string]> = [
    ["Phone", "phone", str(lookup(m, "business.phone")), "Your number"],
    ["Email", "email", str(lookup(m, "business.email")), "Your email"],
    ["Licence", "licence", "", "Licence or registration number"],
  ];
  return `<div class="bx-business" style="display:flex;gap:12px;align-items:flex-start">
    ${logo ? `<img class="bx-logo" src="${esc(logo)}" alt="" style="width:48px;height:48px;border-radius:8px;object-fit:contain"/>` : ""}
    <div style="flex:1 1 auto;min-width:0">
      ${editRun("name", name, "bx-h bx-h3", "Your business name", ctx)}
      ${editRun("tagline", str(p.tagline) || str(b.tagline || ""), "bx-p", "What you do, in a few words", ctx, "p")}
      ${rows.map(([label, key, record, ph]) => dataRow(label, key, str(p[key]), record, ph, ctx)).join("")}
    </div>
  </div>`;
}

export const BUSINESS_INFO_DEF: WidgetDef = {
  kind: "business_info",
  label: "Business Info",
  description: "Your own name, logo, phone and licence — from your business profile.",
  icon: "Building2",
  picture: pictureFrom(`<rect x="8" y="10" width="18" height="20" rx="3" fill="#94A3B8" stroke="none"/>`
    + bar(32, 12, 24, 5) + bar(32, 22, 18) + bar(32, 30, 22)),
  category: "Intelligent Analytics",
  adapters: DOCUMENTS,
  defaults: { name: "", tagline: "", phone: "", email: "", licence: "", show_logo: true, logo_url: "" },
  controls: [
    { key: "show_logo", label: "Show your logo", type: "toggle", tab: "content", section: "Business Info" },
    { key: "logo_url", label: "A different logo", type: "image", tab: "content", section: "Business Info",
      help: "Leave this empty to use the logo from Brand Identity." },
  ],
};

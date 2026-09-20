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
import { esc } from "../esc";
import type { LocationLite, RenderContext } from "../render";
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
 * What a SITE BLOCK shows on a surface with no record book.
 *
 * The proposal canvas and the PDF draw `service_location` through the adapter's
 * `ctx.extra`, which has the customer's real locations in its hand
 * (`proposal/recordWidgets.ts`). The email, the landing page and
 * `proposalDoc.freezeOnSend` do not, so they read the document itself, and this
 * is the one function that says what that document holds.
 *
 * ── TWO PLACES A TYPED VALUE CAN BE, AND BOTH ARE READ ────────────────────
 * The record widget stores a retyped field under `overrides.<key>` — that is
 * §11.12 F.2's Binding rule, and it is what makes *Typed, not live* and *Put it
 * back* possible. An `address_block` written before D-165 stored the same words
 * as FLAT props. A stored document can hold either, so both are read, newest
 * first: `overrides` beats a flat prop beats the record. Reading only one of
 * them is how an address typed on a signed agreement came back blank.
 *
 * KEPT UNDER ITS OLD NAME: `proposalDoc.ts` freezes a bound address with it.
 */
export function addressFields(
  props: Record<string, unknown> | undefined | null,
  locations?: Record<string, LocationLite> | null,
): LocationFields {
  const p: any = props || {};
  const over: any = (p.overrides && typeof p.overrides === "object") ? p.overrides : {};
  const locationId = selectionOf(p).locationId || str(p.locationId).trim().toLowerCase();
  const loc = locationId ? (locations || {})[locationId] : undefined;
  const typed = (...keys: string[]) => {
    for (const k of keys) if (str(over[k])) return str(over[k]);
    for (const k of keys) if (str(p[k])) return str(p[k]);
    return "";
  };
  return {
    heading: str(p.heading),
    /* THE CUSTOMER'S SPELLINGS ARE READ TOO. A typed `address_block` upgrades
       to a **Customer**, whose address is `billing_address` and whose person is
       `contact`; a bound one becomes a **Service Location**, whose person is
       `site_contact`. One reader for both, because they are one widget's two
       halves and an email that drew only one of them would blank the other. */
    name: typed("name") || str(loc?.name),
    address: typed("address", "billing_address") || locationAddress(loc),
    contact: typed("site_contact", "contact", "contact_name") || str((loc as any)?.site_contact),
    notes: typed("access_notes", "notes") || str((loc as any)?.access_notes),
    locationId,
    bound: !!loc,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Business Info — your own name, logo, phone and licence
   ══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   THE THREE DEFINITIONS AND THEIR RENDERERS LIVED HERE AND ARE DELETED
   (integration, 2026-09-19)
   ══════════════════════════════════════════════════════════════════════════

   `Customer`, `Service Location` and `Business Info` are declared and drawn in
   `src/builder/proposal/recordWidgets.ts`. That is the copy the screen really
   uses: the proposal adapter hands the renderer a RECORD BOOK through
   `ctx.extra`, which `render.ts` asks before it asks `renderAtom`, so this
   file's versions only ever drew on the surfaces that do not offer the kinds.
   Two renderers for one kind is how one document came back in two different
   markups depending on which surface drew it — the golden fixtures showed it.

   What stayed is what other files read: `customerFields`, `locationAddress`
   and `addressFields` (`proposalDoc.ts` freezes a bound address with the last
   of those at send). The email and landing renderers draw these kinds from
   their own `case`, out of the props the document carries. */

export {};

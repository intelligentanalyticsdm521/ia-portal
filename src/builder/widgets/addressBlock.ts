/**
 * builder/widgets/addressBlock.ts — WHERE THE WORK HAPPENS.
 *
 * D-156: the atomic half of `property_block`. That widget was an address AND a
 * list of line items AND a subtotal locked together, so you could not put an
 * address on a page without pricing something, and you could not price a site
 * without the address widget's own layout. Here the address is an address; the
 * money beside it is `price_line` widgets in the same container, and the
 * subtotal is a `totals` widget. Three widgets, three jobs.
 *
 * Bound to one of the customer's locations, or typed — a proposal is often
 * written before the location exists in the system, and refusing to draw an
 * address until somebody creates a record is how a builder loses an author.
 */
import type { Widget } from "../model";
import { esc, type LocationLite, type RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, pictureFrom } from "../pictures";
import { editRun } from "./text";
import { BINDING_CONTROLS, bindingDefaults, onEmptyOf, selectionOf } from "./binding";

const str = (v: unknown): string => (v == null ? "" : String(v));

export interface AddressFields {
  heading: string;
  name: string;
  address: string;
  contact: string;
  notes: string;
  locationId: string;
  /** True when the values came from the customer's own location record. */
  bound: boolean;
}

/** One location as the page prints it: street, second line, town, postcode. */
export function locationAddress(loc?: LocationLite | null): string {
  if (!loc) return "";
  const line1 = (loc as any).address_line1 ?? (loc as any).address_line_1;
  const line2 = (loc as any).address_line2 ?? (loc as any).address_line_2;
  return [line1, line2, [loc.city, (loc as any).state].filter(Boolean).join(", "), (loc as any).postal_code]
    .filter(Boolean).join(", ");
}

/**
 * What this block shows: the location record when it is bound and known,
 * whatever was typed otherwise. A typed value never overwrites the record —
 * the record is the business's data and the widget is a view of it.
 */
export function addressFields(
  props: Record<string, unknown> | undefined | null,
  locations?: Record<string, LocationLite> | null,
): AddressFields {
  const p: any = props || {};
  // WHICH ROW — the shared Binding section's reader (F.2), so a service
  // address answers "which record is this" exactly as a product card does.
  const locationId = selectionOf(p).locationId;
  const loc = locationId ? (locations || {})[locationId] : undefined;
  const bound = !!loc;
  return {
    heading: str(p.heading),
    name: bound ? str(loc?.name) : str(p.name),
    address: bound ? locationAddress(loc) : str(p.address),
    contact: bound ? str((loc as any)?.site_contact ?? p.contact) : str(p.contact),
    notes: bound ? str((loc as any)?.access_notes ?? p.notes) : str(p.notes),
    locationId,
    bound,
  };
}

export function renderAddressBlock(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const f = addressFields(p, ctx.locations);
  const editing = ctx.mode === "edit";
  if (!editing && !f.name && !f.address && !f.contact && !f.notes) {
    // `on_empty` (F.2), the same three values every bound widget has. A blank
    // address used to be nothing, full stop; "leave a gap" is now a choice,
    // and it carries no words — a sentence on a page somebody signs has to be
    // one the author wrote.
    return onEmptyOf(p) === "placeholder"
      ? `<div class="bx-address bx-address-empty" data-empty="placeholder"></div>`
      : "";
  }
  const row = (label: string, value: string, path: string, placeholder: string) => {
    if (!value && !editing) return "";
    const cell = f.bound
      ? `<span>${esc(value)}</span>`
      : editRun(path, value, "bx-fact-v", placeholder, ctx, "span");
    return `<div class="bx-fact" style="display:flex;gap:10px;padding:4px 0">
      <span class="bx-fact-k" style="min-width:120px;color:#5A7A8A">${esc(label)}</span>${cell}</div>`;
  };
  return `<div class="bx-address">
    ${editRun("heading", f.heading, "bx-h bx-h3", "Service address", ctx)}
    ${row("Property", f.name, "name", "What this site is called")}
    ${row("Address", f.address, "address", "Street, town, postcode")}
    ${row("Site contact", f.contact, "contact", "Who to ask for on the day")}
    ${row("Getting in", f.notes, "notes", "Gate code, where to park, who to call")}
    ${f.bound && editing
      ? `<div class="bx-card-note">These come from the customer's own record, so the crew's sheet and this page cannot disagree.</div>`
      : ""}
  </div>`;
}

export const ADDRESS_BLOCK_DEF: WidgetDef = {
  kind: "address_block",
  label: "Service address",
  description: "Where the work happens — pick one of the customer's locations, or type an address.",
  task: "Customer & property",
  icon: "MapPin",
  picture: pictureFrom(`<path d="M12 8a5 5 0 0 1 5 5c0 4-5 9-5 9s-5-5-5-9a5 5 0 0 1 5-5z" fill="#94A3B8" stroke="none"/>`
    + bar(22, 10, 34) + bar(22, 20, 26) + bar(22, 29, 30)),
  category: "Document",
  // WHERE IT MAY BE USED (catalogue F.1). D-156 slice one shipped these as
  // PROPOSAL-only; the panes that can actually DRAW them now offer them too.
  //
  // NOT `website`: the website publish path (arion `ELEMENTOR_WIDGETS`) has no
  // emitter for this kind, and an unknown kind makes the whole page publish
  // REFUSE by name. Offering it there would be a widget an author can place
  // and never publish, which is the defect this pass exists to close. The
  // catalogue asks for it on a website; it needs the emitter first, and the
  // handoff carries the ask.
  adapters: ["proposal", "email", "landing"],
  /* NO `tier`, deliberately — i.e. free at the widget's own gate.
     G.4 puts this one on "OLIVER **or** SPARK, either", because
     `lumen.customer_location` is shared between them. `tier` is one word and
     cannot say "or", and asserting `ia:oliver` here would refuse the widget to
     a SPARK-only business that owns the data it reads. WHETHER this business
     has either product is the server's answer, which is where it belongs; the
     handoff carries the ask for a two-product gate if one is ever wanted. */
  defaults: {
    locationId: "", heading: "", name: "", address: "", contact: "", notes: "",
    ...bindingDefaults("lumen:locations"),
  },
  // "Which location" is the adapter's control (D-33): only the adapter knows
  // which locations THIS customer has. The Binding section is the shared one.
  controls: [
    { key: "heading", label: "Heading", type: "text" },
    ...BINDING_CONTROLS,
  ],
};

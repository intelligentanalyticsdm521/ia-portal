/**
 * builder/proposal/sectionTemplates.ts — THE NINE SECTION TEMPLATES.
 *
 * D-167, Brandon: *"I'm fine if we do like section templates but I do not …
 * want these types of widgets."* D-168: *"Add section - opens blank flexbox
 * container | template (this is where the things like a service address, or a
 * title page go, those are section templates, not widgets). Then clicking one
 * loads the widgets."*
 *
 * ── WHAT A SECTION TEMPLATE IS, EXACTLY ───────────────────────────────────
 * A Container tree of NORMAL widgets — Heading, Text Editor, Image, Icon List,
 * Divider, Signature — plus Custom Fields where a fact comes out of the
 * database. Nothing on this page is a special-purpose widget: once it lands the
 * author can select any part of it, restyle it, drag it somewhere else or
 * delete it, which is the whole of why the block widgets went.
 *
 * ── THE NINE ARE THE OFFER FILE'S NINE ────────────────────────────────────
 * `BUILDER_OFFERS_2026-09-19.json` → `builders.proposal.section_templates`:
 * Title page · Customer details · Service address · About us · Scope of work ·
 * Pricing options · Line items with totals · Terms and conditions · Acceptance.
 * A tenth would be an invention, and a test pins the list by name and in order.
 *
 * ── AND EVERY WIDGET IN THEM IS ON THE OFFER FILE TOO ─────────────────────
 * The same test walks each tree and refuses a kind the proposal panel does not
 * offer. A template that dropped something an author cannot then add a second
 * of is a back door into the panel.
 *
 * Pure. No React, no fetch — `build()` is a function of nothing, so the whole
 * file runs under `node --test`.
 */
import { makeContainer, makeSection, makeWidget, type Node, type Section } from "../model";
import { customFieldProps } from "../widgets/families/ia/customField";

/* ══════════════════════════════════════════════════════════════════════════
   The two helpers every template uses
   ══════════════════════════════════════════════════════════════════════════ */

/** One section holding one column of nodes — the shape the gallery places. */
function sec(nodes: Node[], extra: Partial<Section> = {}): Section {
  return makeSection({
    ...extra,
    columns: [{ id: `c_${Math.random().toString(36).slice(2, 8)}`, widgets: nodes as any }],
    layout: 1,
  });
}

/** One Custom Field, pointed at `<record>.<field>`. */
function field(key: string, opts: { label?: boolean; locationId?: string } = {}): Node {
  return makeWidget("custom_field", customFieldProps(key, {
    show_label: opts.label !== false,
    ...(opts.locationId ? { locationId: opts.locationId } : {}),
  }));
}

const h = (text: string, level = 2): Node => makeWidget("heading", { text, level });
const p = (text: string): Node => makeWidget("paragraph", { text });
const column = (children: Node[], gap = 6): Node => makeContainer({ direction: "column", gap }, children);
const row = (children: Node[], gap = 24): Node => makeContainer({ direction: "row", gap }, children);

/* ══════════════════════════════════════════════════════════════════════════
   What the gallery shows
   ══════════════════════════════════════════════════════════════════════════ */

/** The same shape `templates.ts` exports, so `SectionGallery` is unchanged. */
export interface ProposalSectionTemplate {
  key: string;
  name: string;
  /** One line, in a business owner's words — the gallery card's subtitle. */
  description: string;
  tags: string[];
  build: () => Section;
}

/** The filter chips over the nine. */
export const SECTION_TEMPLATE_TAGS = ["All", "Title pages", "Details", "Words", "Pricing", "Acceptance"];

export const PROPOSAL_SECTION_TEMPLATES: ProposalSectionTemplate[] = [
  {
    key: "title_page",
    name: "Title page",
    description: "Your mark, the document's title, and who it is for — filled from their record.",
    tags: ["Title pages"],
    build: () => sec([
      makeContainer({ direction: "column", gap: 14 }, [
        makeWidget("image", { src: "", alt: "", caption: "" }),
        h("Service Agreement", 1),
        column([
          field("customer.name"),
          field("customer.company"),
          field("service_location.address"),
        ]),
        makeWidget("divider", {}),
        column([
          field("business_info.name"),
          field("business_info.phone"),
          field("business_info.email"),
        ]),
      ]),
    ], { label: "Title page", padding: 28 }),
  },
  {
    key: "customer_details",
    name: "Customer details",
    description: "Who the document is for: name, company, contact, email, phone and where the invoice goes.",
    tags: ["Details"],
    build: () => sec([
      h("Prepared for"),
      row([
        column([field("customer.name"), field("customer.company"), field("customer.contact")]),
        column([field("customer.email"), field("customer.phone"), field("customer.billing_address")]),
      ]),
    ], { label: "Customer details" }),
  },
  {
    key: "service_address",
    name: "Service address",
    description: "Where the work happens — the site, its address, who to ask for and how to get in.",
    tags: ["Details"],
    build: () => sec([
      h("Where the work happens"),
      column([
        field("service_location.name"),
        field("service_location.address"),
        field("service_location.site_contact"),
        field("service_location.access_notes"),
      ]),
    ], { label: "Service address" }),
  },
  {
    key: "about_us",
    name: "About us",
    description: "A few lines about your business, with your own name, number and licence under them.",
    tags: ["Words"],
    build: () => sec([
      h("About us"),
      p("Write a short paragraph about your business here — how long you have been going, what you are known for, and why this customer is in good hands."),
      row([
        column([field("business_info.name"), field("business_info.phone")]),
        column([field("business_info.email"), field("business_info.licence")]),
      ]),
    ], { label: "About us" }),
  },
  {
    key: "scope_of_work",
    name: "Scope of work",
    description: "What you will do, as a short paragraph and a list anybody can read in ten seconds.",
    tags: ["Words"],
    build: () => sec([
      h("Scope of work"),
      p("Say in one paragraph what you are agreeing to do, and when."),
      makeWidget("list", {
        items: [
          "What you will do on each visit",
          "What is included in the price",
          "What is not included",
        ],
      }),
    ], { label: "Scope of work" }),
  },
  {
    key: "pricing_options",
    name: "Pricing options",
    description: "Three cards side by side. Pick a product or service for each and it fills itself in.",
    tags: ["Pricing"],
    /* THREE PRODUCT CARDS IN A ROW — the offer file's own words. They land
       UNBOUND, showing the dashed "pick one of your products" box, because a
       template cannot know which of this business's products the author means.
       Binding one is the card's own panel, which is where every other card is
       bound. */
    build: () => sec([
      h("Choose your plan"),
      p("Three ways to work together. Pick the one that suits the property."),
      makeContainer({ direction: "row", gap: 16, wrap: true }, [
        makeWidget("catalog_card", { refresh: "live", on_empty: "hide", overrides: {} }),
        makeWidget("catalog_card", { refresh: "live", on_empty: "hide", overrides: {} }),
        makeWidget("catalog_card", { refresh: "live", on_empty: "hide", overrides: {} }),
      ]),
    ], { label: "Pricing options" }),
  },
  {
    key: "line_items_totals",
    name: "Line items with totals",
    description: "Priced lines that add up, with the subtotal, tax, any discount and the total under them.",
    tags: ["Pricing"],
    build: () => sec([
      h("What you are paying for"),
      makeWidget("price_line", { name: "", description: "", quantity: 1, unit_price: 0, unit_label: "" }),
      makeWidget("price_line", { name: "", description: "", quantity: 1, unit_price: 0, unit_label: "" }),
      makeWidget("totals", { heading: "Your total", tax_mode: "business", tax_rate: null, tax_label: "" }),
    ], { label: "Line items with totals" }),
  },
  {
    key: "terms_conditions",
    name: "Terms and conditions",
    description: "Your terms as plain headings and paragraphs. Add the ones you have already written.",
    tags: ["Words"],
    /* HEADINGS + TEXT EDITORS, and nothing else. The clause picker opens the
       moment this lands (ProposalBuilder) and drops each saved clause as one
       more Heading + Text Editor — plain text from the moment it is on the
       page, with no live link back to the library, because a term somebody
       signed must not change because the library did. */
    build: () => sec([
      h("Terms and conditions"),
      h("Payment", 3),
      p("Say when you invoice and when you expect to be paid."),
      h("Cancellation", 3),
      p("Say how either side ends this, and with how much notice."),
    ], { label: "Terms and conditions" }),
  },
  {
    key: "acceptance",
    name: "Acceptance",
    description: "The line the customer signs on, with a sentence saying what they are agreeing to.",
    tags: ["Acceptance"],
    build: () => sec([
      h("Acceptance"),
      p("By signing below you accept the scope, the prices and the terms set out above."),
      makeWidget("signature", { customerLabel: "Customer signature", businessLabel: "For the business" }),
    ], { label: "Acceptance" }),
  },
];

/** The nine, by name and in order. The test reads THIS, not the objects. */
export const SECTION_TEMPLATE_NAMES: readonly string[] = PROPOSAL_SECTION_TEMPLATES.map((t) => t.name);

export function sectionTemplateByKey(key: string): ProposalSectionTemplate | undefined {
  return PROPOSAL_SECTION_TEMPLATES.find((t) => t.key === key);
}

/** The one whose placement opens the clause picker. Named once, read twice. */
export const CLAUSE_TEMPLATE_KEY = "terms_conditions";

export default {
  PROPOSAL_SECTION_TEMPLATES, SECTION_TEMPLATE_TAGS, SECTION_TEMPLATE_NAMES,
  CLAUSE_TEMPLATE_KEY, sectionTemplateByKey,
};

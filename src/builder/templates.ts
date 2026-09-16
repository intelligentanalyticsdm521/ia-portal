/**
 * builder/templates.ts — pre-made sections and shipped templates.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §7, THE TEMPLATE PRINCIPLE, agreed by
 * Brandon 2026-09-15:
 *
 *   "Open with pre-made sections and pre-made templates, NEVER a blank page.
 *    The header is pre-placed and already shows the business's information;
 *    the footer is pre-placed and offers the business's saved footers; totals
 *    and signature are pre-made sections you drop in; a customer is chosen
 *    once and every merge field fills. Templates are guidelines: open one,
 *    adjust it, save as a new template."
 *
 * ── WHERE THE WORDS LIVE ──────────────────────────────────────────────────
 * Structure here; CLAUSE TEXT in the business's own clause library
 * (oliver.clause_library), referenced by key. A template that carried the
 * Rolling In It clause bodies inline would be a second copy of them, and the
 * day a business edits a clause the templates would still send the old one.
 * `hydrateClauses()` fills the slots from whatever the library holds.
 *
 * Pure: no React, no fetch. The adapter supplies the brand kit and the library.
 */
import {
  makeSection, makeWidget, emptyDocument, type BuilderDocument, type Section, type Widget,
} from "./model";
import { DEFAULT_CONSENT } from "./render";

export interface PremadeSection {
  key: string;
  name: string;
  /** One line, in a business owner's words — the gallery card's subtitle. */
  description: string;
  /** Gallery filter chips. */
  tags: string[];
  build: () => Section;
}

export interface ShippedTemplate {
  key: string;
  name: string;
  description: string;
  build: () => BuilderDocument;
}

/* ══════════════════════════════════════════════════════════════════════════
   Pre-made sections — the gallery
   ══════════════════════════════════════════════════════════════════════════ */

const sec = (widgets: Widget[], extra: Partial<Section> = {}) =>
  makeSection({ ...extra, columns: [{ id: `c_${Math.random().toString(36).slice(2, 8)}`, widgets }], layout: 1 });

export const PREMADE_SECTIONS: PremadeSection[] = [
  {
    key: "title_dark",
    name: "Title page — dark band",
    description: "Your logo on a dark strip, customer and property filled in. The Rolling In It look.",
    tags: ["Title pages"],
    build: () => sec([
      makeWidget("doc_header", {
        style: "dark_band",
        title: "Commercial Service Agreement",
        subtitle: "A clear, dependable plan for winter weather. Prepared for signature and electronic acceptance.",
        bandRight: "Service term {{contract.start_date}} – {{contract.end_date}}",
      }),
      makeWidget("key_facts", {
        rows: [
          { label: "Customer", value: "{{customer.name}}" },
          { label: "Property", value: "{{property.name}}" },
          { label: "Service address", value: "{{property.address}}" },
          { label: "Prepared by", value: "{{business.name}} · {{business.email}}" },
        ],
      }),
    ], { padding: 24 }),
  },
  {
    key: "title_light",
    name: "Title page — light with accent rule",
    description: "Slim header, big title, one accent line. The MS Moments look.",
    tags: ["Title pages"],
    build: () => sec([
      makeWidget("doc_header", {
        style: "light_rule",
        title: "Your Platform Proposal",
        subtitle: "Prepared for {{customer.name}}",
        bandRight: "{{contract.valid_until}}",
      }),
    ], { padding: 24 }),
  },
  {
    key: "at_a_glance",
    name: "Agreement at a glance",
    description: "The short answers up front — trigger, billing, site contact — beside one paragraph of context.",
    tags: ["Terms"],
    build: () => sec([
      makeWidget("paragraph", { text: "" }),
      makeWidget("key_facts", { rows: [{ label: "", value: "" }, { label: "", value: "" }, { label: "", value: "" }, { label: "", value: "" }] }),
    ], { numbered: true, label: "Agreement at a glance" }),
  },
  {
    key: "terms",
    name: "Terms & conditions",
    description: "Numbered clauses from your saved library: billing, severe weather, property responsibilities.",
    tags: ["Terms"],
    build: () => sec([
      makeWidget("clauses", { heading: "", items: [{ title: "", body: "" }] }),
    ], { numbered: true, label: "Terms & conditions" }),
  },
  {
    key: "pricing",
    name: "Pricing schedule",
    description: "A pricing table from your services with a storm example beside it.",
    tags: ["Pricing"],
    build: () => sec([
      makeWidget("pricing_table", {
        heading: "Pricing schedule",
        intro: "This page is the single source of truth for the commercial terms of this agreement.",
        rows: [],
      }),
      makeWidget("callout", {
        heading: "",
        panels: [
          { title: "Storm example", tone: "accent", body: "" },
          { title: "Severe events", tone: "warn", body: "" },
        ],
      }),
    ], { numbered: true, label: "Pricing schedule" }),
  },
  {
    key: "acceptance",
    name: "Acceptance & e-signature",
    description: "Customer types their name to sign; you countersign. Required before they can accept.",
    tags: ["Acceptance"],
    build: () => sec([
      makeWidget("signature", {
        heading: "Acceptance",
        body: "By signing below, the Customer acknowledges that it has reviewed the service scope, pricing schedule, billing terms and general conditions of this document and authorises the work described.",
        customerLabel: "Customer / authorised representative",
        businessLabel: "",
        consent: DEFAULT_CONSENT,
        required: true,
      }),
    ], { numbered: true, label: "Acceptance" }),
  },
  {
    key: "property_plan",
    name: "Property service plan",
    description: "This location's plowing areas, snow storage, sidewalks and obstacles. The crew sees it too.",
    tags: ["Property"],
    build: () => sec([
      makeWidget("property_plan", { locationId: "", heading: "Property service plan", rows: [] }),
    ], { numbered: true, label: "Property service plan" }),
  },
  {
    key: "cards",
    name: "Comparison cards",
    description: "Two to six plans side by side, one marked Recommended. Never adds to the total.",
    tags: ["Pricing"],
    build: () => sec([
      makeWidget("comparison_cards", {
        heading: "Choose your plan",
        intro: "",
        cards: [
          { name: "", pitch: "", price: "", per: "", features: ["", "", ""] },
          { name: "", pitch: "", price: "", per: "", features: ["", "", ""], recommended: true },
          { name: "", pitch: "", price: "", per: "", features: ["", "", ""] },
        ],
      }),
    ], { label: "Choose your plan" }),
  },
  {
    key: "multisite",
    name: "Property block (multi-site)",
    description: "One block per location with its own line items and subtotal. One total at the end.",
    tags: ["Property", "Pricing"],
    build: () => sec([
      // No line items to begin with: an empty priced row on the page is a row
      // the author cannot fill by typing (a quantity and a rate are not runs of
      // text), and an empty row printed on a customer's document is a defect.
      // Services come in from Products & Services in the panel.
      makeWidget("property_block", { locationId: "", heading: "", items: [] }),
    ], { label: "Property" }),
  },
  {
    key: "totals",
    name: "Totals",
    description: "Every priced line added up once — per property where there is more than one.",
    tags: ["Pricing"],
    build: () => sec([makeWidget("totals", { heading: "Your total" })], { label: "Total" }),
  },
  {
    key: "billing",
    name: "Billing & payment",
    description: "Invoicing, payment terms, disputed charges and past-due accounts, as numbered clauses.",
    tags: ["Terms"],
    build: () => sec([
      makeWidget("clauses", { heading: "", items: [{ title: "", body: "" }] }),
    ], { numbered: true, label: "Billing & payment" }),
  },
  {
    key: "footer_notes",
    name: "Footer note",
    description: "Small print at the bottom — a legal note, a validity date, your contact line.",
    tags: ["Terms"],
    build: () => sec([makeWidget("footer_note", { text: "" })], { padding: 12 }),
  },
];

export function premadeByKey(key: string): PremadeSection | undefined {
  return PREMADE_SECTIONS.find((p) => p.key === key);
}

/**
 * The gallery's search, over whichever catalogue the builder handed it.
 *
 * Pure, and taking the list as an argument, so the email and landing adapters
 * search their own sections through the same code rather than growing a second
 * gallery apiece.
 */
export function searchSections(list: PremadeSection[], query: string, tag = "All"): PremadeSection[] {
  const q = query.trim().toLowerCase();
  return list.filter((p) => {
    if (tag !== "All" && !p.tags.includes(tag)) return false;
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.join(" ").toLowerCase().includes(q);
  });
}

/** The document builder's own sections. Kept so its callers read the same. */
export function searchPremade(query: string, tag = "All"): PremadeSection[] {
  return searchSections(PREMADE_SECTIONS, query, tag);
}

export const PREMADE_TAGS = ["All", "Title pages", "Terms", "Pricing", "Acceptance", "Property"];

/* ══════════════════════════════════════════════════════════════════════════
   Shipped templates — never a blank page
   ══════════════════════════════════════════════════════════════════════════ */

function fromKeys(keys: string[], settings: Partial<BuilderDocument["settings"]> = {}): BuilderDocument {
  const doc = emptyDocument(settings);
  doc.sections = keys.map((k) => premadeByKey(k)!.build()).filter(Boolean);
  return doc;
}

/**
 * Which clause-library keys each terms section of a shipped template wants.
 *
 * The keys, not the words. `hydrateClauses` fills them from the business's own
 * library so a clause is edited in one place and every template follows.
 */
const AGREEMENT_CLAUSE_SLOTS: Record<string, string[]> = {
  "Scope of services": ["snow_plowing", "service_trigger", "what_a_push_means", "final_cleanup", "snow_storage"],
  "Ice, deicing & optional services": ["deicing", "material_application", "sidewalks", "snow_hauling", "extra_service"],
  "Severe weather & special conditions": ["heavy_snow", "blizzard_drifting", "freezing_rain", "extreme_storms", "access_traffic"],
  "Property responsibilities": ["property_access", "parked_vehicles", "obstacles", "site_conditions"],
  "Billing & payment": ["invoicing", "payment_terms", "documentation", "disputed_charges", "past_due"],
  "General terms": ["service_timing", "reasonable_care", "damage_existing", "weather_limitations", "changes_to_scope", "term_cancellation", "entire_agreement"],
};

export const SHIPPED_TEMPLATES: ShippedTemplate[] = [
  {
    key: "service_agreement",
    name: "Service agreement (Rolling In It style)",
    description: "Dark title band, numbered clauses from your library, a rate-card pricing schedule, a property plan and e-signature.",
    build: () => {
      const doc = fromKeys(["title_dark", "at_a_glance"]);
      for (const [label, keys] of Object.entries(AGREEMENT_CLAUSE_SLOTS)) {
        if (label === "Billing & payment") continue; // placed below, in order
        const s = premadeByKey("terms")!.build();
        s.label = label;
        (s.columns[0].widgets[0].props as any).libraryKeys = keys;
        doc.sections.push(s);
        if (label === "Severe weather & special conditions") {
          doc.sections.push(premadeByKey("pricing")!.build());
        }
      }
      const billing = premadeByKey("billing")!.build();
      (billing.columns[0].widgets[0].props as any).libraryKeys = AGREEMENT_CLAUSE_SLOTS["Billing & payment"];
      // "General terms" was appended by the loop; billing belongs before it.
      doc.sections.splice(doc.sections.length - 1, 0, billing);
      doc.sections.push(premadeByKey("acceptance")!.build());
      const plan = premadeByKey("property_plan")!.build();
      plan.pageBreakBefore = true;
      doc.sections.push(plan);
      doc.sections.push(premadeByKey("footer_notes")!.build());
      return doc;
    },
  },
  {
    key: "platform_proposal",
    name: "Platform proposal (MS Moments style)",
    description: "Light header with an accent rule, a recommended path, tier cards per product and a total.",
    build: () => {
      const doc = fromKeys(["title_light"], { style: "light" });
      const path = sec([
        makeWidget("heading", { text: "Your recommended path", level: 2 }),
        makeWidget("paragraph", { text: "" }),
      ], { numbered: true, label: "Your recommended path" });
      doc.sections.push(path);
      doc.sections.push(premadeByKey("cards")!.build());
      doc.sections.push(premadeByKey("totals")!.build());
      doc.sections.push(premadeByKey("acceptance")!.build());
      doc.sections.push(premadeByKey("footer_notes")!.build());
      return doc;
    },
  },
  {
    key: "simple_proposal",
    name: "Simple proposal",
    description: "A title, what you will do, what it costs, and a signature. Four sections.",
    build: () => {
      const doc = fromKeys(["title_light"]);
      doc.sections.push(sec([
        makeWidget("heading", { text: "What we will do", level: 2 }),
        makeWidget("paragraph", { text: "" }),
      ], { numbered: true, label: "What we will do" }));
      doc.sections.push(sec([
        makeWidget("priced_line", { name: "", description: "", features: [], quantity: 1, unit_price: 0 }),
      ], { numbered: true, label: "What it costs" }));
      doc.sections.push(premadeByKey("totals")!.build());
      doc.sections.push(premadeByKey("acceptance")!.build());
      return doc;
    },
  },
];

export function templateByKey(key: string): ShippedTemplate | undefined {
  return SHIPPED_TEMPLATES.find((t) => t.key === key);
}

/* ══════════════════════════════════════════════════════════════════════════
   Hydration
   ══════════════════════════════════════════════════════════════════════════ */

export interface ClauseRow { clause_key: string; title: string; body: string }

/**
 * Fill every clause slot from the business's library.
 *
 * A key with no clause in the library is DROPPED, not left as an empty
 * numbered paragraph: an agreement that goes out with "4. " and nothing after
 * it is worse than one clause short.
 */
export function hydrateClauses(doc: BuilderDocument, library: ClauseRow[]): BuilderDocument {
  const byKey = new Map(library.map((c) => [c.clause_key, c]));
  return {
    ...doc,
    sections: doc.sections.map((s) => ({
      ...s,
      columns: s.columns.map((c) => ({
        ...c,
        widgets: c.widgets.map((w) => {
          const keys = (w.props as any)?.libraryKeys;
          if (w.kind !== "clauses" || !Array.isArray(keys)) return w;
          const items = keys.map((k: string) => byKey.get(k)).filter(Boolean)
            .map((c2: any) => ({ title: c2.title, body: c2.body, clause_key: c2.clause_key }));
          if (!items.length) return w;
          return { ...w, props: { ...w.props, items } };
        }),
      })),
    })),
  };
}

/**
 * Put the business's information on the document the moment it opens — §7's
 * "the header is pre-placed and already shows the business's information".
 * Only fields the author has not typed over are touched.
 */
export function applyBrandDefaults(
  doc: BuilderDocument,
  kit: { accent?: string; headingFont?: string; bodyFont?: string },
): BuilderDocument {
  return {
    ...doc,
    settings: {
      ...doc.settings,
      accent: doc.settings.accent || kit.accent,
      headingFont: doc.settings.headingFont || kit.headingFont,
      bodyFont: doc.settings.bodyFont || kit.bodyFont,
    },
  };
}

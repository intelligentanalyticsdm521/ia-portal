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
 * (oliver.clause_library), referenced by key. A template that carried a
 * business's clause bodies inline would be a second copy of them, and the
 * day they edited a clause the templates would still send the old one.
 * `hydrateClauses()` fills the slots from whatever the library holds.
 *
 * Pure: no React, no fetch. The adapter supplies the brand kit and the library.
 */
import {
  makeContainer, makeSection, makeWidget, emptyDocument,
  type BuilderDocument, type Section, type Widget,
} from "./model";
import { upgradeDocument } from "./upgrade";
import { DEFAULT_CONSENT, DOCUMENT_CSS, makeContext, renderDocument } from "./render";
import {
  SAMPLE_MERGE, blankEntry, type TemplateEntry, type TemplatePreview,
} from "./templateLibraryModel";

export interface PremadeSection {
  key: string;
  name: string;
  /** One line, in a business owner's words — the gallery card's subtitle. */
  description: string;
  /** Gallery filter chips. */
  tags: string[];
  /**
   * WHY THIS CLIENT'S PLAN CANNOT HAVE IT — the sentence they read.
   *
   * Handoff request R-D2. Absent means it can. A locked card stays IN the
   * gallery, greyed, with the reason as its line: hiding it would make "not on
   * your plan" indistinguishable from a section that is missing, and greying
   * it without the reason would make it indistinguishable from a bug. The
   * adapter sets it — WHAT is locked is the server's answer, never a tier
   * table in the engine (adapters/website/sitePlan.ts).
   */
  locked?: string;
  /**
   * ONE section, always.
   *
   * `buildAll` lived here for the ready-made patterns that are a heading and a
   * ROW under it — two sections, because a section had one set of columns and
   * nothing could hold a row. Containers landed, the patterns are one section
   * with a box in them, and it is deleted: a second way to place a section is
   * a second way for undo to behave.
   */
  build: () => Section;
}

/**
 * A shipped document template, as the library (§11.9, D-146) shows it.
 *
 * `description` is GONE. It said what the template looked like — "dark title
 * band", "light header with an accent rule" — which is the thing D-146 asked
 * us to stop doing: the picture shows what it looks like, and the words say
 * what it is FOR and who it is for.
 */
export interface ShippedTemplate {
  key: string;
  name: string;
  /** The badge: what kind of document this is, in the client's words. */
  purpose: string;
  /**
   * Which SEGMENTS this is for, from templateLibraryModel.BUSINESS_TYPES
   * (D-153: segments, not trades). "Any business" answers every chip; the
   * trade words live in `tags`, where the search reads them.
   */
  businessTypes: string[];
  /** Extra words the search should find — a trade, a synonym, a situation. */
  tags: string[];
  /** Two or three sentences: what it is for and when you would send it. */
  useCase: string;
  /** The trades and situations it suits, as one line. */
  bestFor: string;
  featured?: boolean;
  build: () => BuilderDocument;
}

/* ══════════════════════════════════════════════════════════════════════════
   Pre-made sections — the gallery
   ══════════════════════════════════════════════════════════════════════════ */

const sec = (widgets: Widget[], extra: Partial<Section> = {}) =>
  makeSection({ ...extra, columns: [{ id: `c_${Math.random().toString(36).slice(2, 8)}`, widgets }], layout: 1 });

/* The ready-made sections as they are WRITTEN. A handful of the older ones
   still describe themselves with a composite widget; `PREMADE_SECTIONS` below
   is this list with the D-156 upgrade applied, and that is what leaves this
   module. The raw list stays because the shipped templates build on it and
   then type words into those composites' own props — which has to happen
   BEFORE the pass, not after it, or the words would be written onto a box that
   no longer holds them. */
const PREMADE_RAW: PremadeSection[] = [
  {
    key: "title_dark",
    name: "Title page — dark band",
    description: "Your logo on a dark strip, with the customer and the property already filled in.",
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
    description: "A slim header, a big title and one accent line under it.",
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
    // D-37 — this section used to arrive as ONE EMPTY PARAGRAPH and FOUR BLANK
    // ROWS, on a template sold as "the shape of the agreement, already
    // written". Four of the five rows are merge fields that fill themselves
    // from the customer pick and the Details group, so the section arrives
    // saying something true about THIS job the moment a customer is chosen.
    build: () => sec([
      makeWidget("paragraph", {
        text: "This page is the short version. It says who the work is for, where it happens, when the term runs and what triggers a visit. Everything below it is the detail.",
      }),
      makeWidget("key_facts", {
        rows: [
          { label: "Prepared for", value: "{{customer.name}}" },
          { label: "Service address", value: "{{property.address}}" },
          { label: "Service term", value: "{{contract.start_date}} to {{contract.end_date}}" },
          { label: "We start plowing at", value: "{{snow_trigger}}" },
          { label: "Billing", value: "Per visit, invoiced monthly in arrears" },
        ],
      }),
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
        // A titled panel with an empty body is a heading pretending to be an
        // explanation. Both of these say the thing the rate card above cannot.
        panels: [
          {
            title: "Storm example", tone: "accent",
            body: "A six-inch storm that falls over two days is two visits, not one: we clear at the trigger depth and again as it keeps falling. Each visit is charged at the rate for the depth cleared on that visit.",
          },
          {
            title: "Severe events", tone: "warn",
            body: "Snowfall above {{severe_event_threshold}}, declared emergencies and anything needing extra equipment are quoted before the work starts. Nothing above that line is charged without your say-so.",
          },
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
      // D-37 — this printed as a bare heading and came out as an empty page 5
      // of the signed PDF. The rows are the crew's own sheet: choosing the
      // location in the panel fills whatever the property already has on
      // record, and whatever it does not is a box to type in rather than a
      // question nobody knew to ask.
      makeWidget("property_plan", {
        locationId: "", heading: "Property service plan",
        rows: [
          { label: "Areas we plow", value: "" },
          { label: "Where the snow goes", value: "" },
          { label: "Sidewalks and entries", value: "" },
          { label: "Where we salt", value: "" },
          { label: "Things to avoid", value: "" },
          { label: "Anything else the crew should know", value: "" },
        ],
      }),
    ], { numbered: true, label: "Property service plan" }),
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

/* ══════════════════════════════════════════════════════════════════════════
   D-156's ready-made sections — container trees, not composite widgets
   ══════════════════════════════════════════════════════════════════════════

   §11.12: *"The picker's Ready-made section tab and the + strip offer
   CONTAINER TREES, not widgets"*. Each of these is the pattern a composite
   widget used to be, built out of atomic widgets that can each be selected,
   dragged, tagged and deleted:

     Choose your plan      heading + paragraph, then a row of product cards
     This property         heading + service address + rate card + a total
     Agreement at a glance four key facts, two across

   Nothing here is a special kind. Place one and then take a card out of it,
   or drop a picture between two cards — which is the whole of what Brandon
   asked for and the whole of what the composites could not do. */

/** A row of things, as a BOX — the one shape a set of anything takes. */
const rowOf = (children: Widget[]) => makeContainer({ direction: "row", gap: 16 }, children);

/**
 * ONE PROPERTY, as a box (D-156).
 *
 * The same four things `property_block` held, each now a widget of its own:
 * the property's name, its address, a priced line per item, and the subtotal
 * for it. `totals.ts` reads "which property is this line for?" off the box the
 * address block sits in, so the money is unchanged.
 */
function propertyBox(
  heading: string,
  items: Array<{ description: string; quantity: number; unit_price: number }>,
) {
  return makeContainer(undefined, [
    makeWidget("heading", { text: heading, level: 3 }),
    makeWidget("address_block", { locationId: "", heading: "Service address" }),
    ...items.map((it) => makeWidget("price_line", {
      name: it.description, quantity: it.quantity, unit_price: it.unit_price,
      description: "", bullets: [], cadence: null,
    })),
    makeWidget("totals", { heading: "Subtotal for this property" }),
  ]);
}

/**
 * *Choose your plan* — Brandon's sentence, as ONE ready-made section.
 *
 * "Header, drag that into this box and it's now its own section inside the
 * box, then a text field under it with Pick One, then cards". That is a
 * heading, a paragraph and a ROW OF CARDS in one section, which is what a
 * container makes possible — before it, this had to be two sections and an
 * adapter that knew to place both. Both halves of that are gone.
 */
export function chooseYourPlanSections(): Section[] {
  return [
    sec([
      makeWidget("heading", { text: "Choose your plan", level: "Section title" }),
      makeWidget("paragraph", { text: "Pick one. Everything below is included in the price you choose." }),
      rowOf([
        makeWidget("catalog_card", {}),
        makeWidget("catalog_card", {}),
        makeWidget("catalog_card", {}),
      ]),
    ], { label: "Choose your plan", padding: 24 }),
  ];
}

/** *This property* — what `property_block` was, as four separate widgets. */
export function propertySections(): Section[] {
  return [
    sec([
      makeWidget("heading", { text: "This property", level: "Section title" }),
      makeWidget("address_block", { heading: "Service address" }),
      makeWidget("pricing_table", { heading: "What we charge here", rows: [] }),
      makeWidget("totals", { heading: "This property" }),
    ], { label: "This property", padding: 24 }),
  ];
}

/** *Agreement at a glance* — four key facts across, each its own widget. */
export function atAGlanceSections(): Section[] {
  const fact = (label: string, value: string) => makeWidget("key_fact", { label, value });
  return [
    sec([
      rowOf([
        fact("Customer", "{{customer.name}}"),
        fact("Service term", "{{contract.start_date}} – {{contract.end_date}}"),
        fact("Property", "{{property.address}}"),
        fact("Prepared by", "{{business.name}}"),
      ]),
    ], { label: "At a glance", padding: 24 }),
  ];
}

PREMADE_RAW.push(
  {
    key: "choose_your_plan",
    name: "Choose your plan",
    description: "A heading, a line of copy and three cards loaded from your products and services.",
    tags: ["Pricing"],
    build: () => chooseYourPlanSections()[0],
  },
  {
    key: "this_property",
    name: "This property",
    description: "One site: its address, what you charge there and a total for it.",
    tags: ["Property", "Pricing"],
    build: () => propertySections()[0],
  },
  {
    key: "at_a_glance_facts",
    name: "Agreement at a glance",
    description: "Four short answers across the top — who, where, how long, who prepared it.",
    tags: ["Terms"],
    build: () => atAGlanceSections()[0],
  },
);

/**
 * ONE SECTION, AS A TREE (D-156, integration).
 *
 * A document built in memory never passes through `deserialise`, so the
 * upgrade on the read path would never see the library — and the library would
 * be the last place in the platform handing out lumps. The same pass runs
 * here, so there is still exactly ONE table saying what a composite becomes.
 */
function asTree(p: PremadeSection): PremadeSection {
  return {
    ...p,
    build: () => upgradeDocument({ ...emptyDocument(), sections: [p.build()] }).sections[0],
  };
}

/** Every ready-made section the gallery offers, each one a tree. */
export const PREMADE_SECTIONS: PremadeSection[] = PREMADE_RAW.map(asTree);

/** The raw one, for the shipped templates that type into a composite's props. */
function rawPremade(key: string): PremadeSection | undefined {
  return PREMADE_RAW.find((p) => p.key === key);
}

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

/**
 * A SET OF PLANS, as a section: a heading, a line of copy and a row of cards.
 *
 * Written as the composite and run through the ONE conversion in `upgrade.ts`,
 * rather than assembled by hand here. A second place that knew a plan's `name`
 * becomes a card's `title` is a second place for it to be wrong.
 */
function plansSection(
  heading: string,
  intro: string,
  cards: Array<Record<string, unknown>>,
  extra: Partial<Section> = {},
): Section {
  const built = sec([makeWidget("comparison_cards", { heading, intro, cards })], extra);
  return upgradeDocument({ ...emptyDocument(), sections: [built] }).sections[0];
}

function fromKeys(keys: string[], settings: Partial<BuilderDocument["settings"]> = {}): BuilderDocument {
  const doc = emptyDocument(settings);
  doc.sections = keys.map((k) => rawPremade(k)!.build()).filter(Boolean);
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

/* As WRITTEN — a few of these still describe a page with a composite widget.
   `SHIPPED_TEMPLATES` below is this list with the D-156 upgrade applied, which
   is what a caller gets; the raw one exists because a template types words
   into a composite's own props while it builds, and that has to happen before
   the pass rather than after it. */
const SHIPPED_RAW: ShippedTemplate[] = [
  {
    key: "service_agreement",
    name: "Seasonal service agreement",
    purpose: "Recurring service agreement",
    businessTypes: ["Service industry"],
    tags: ["contract", "season", "rate card", "recurring", "signature",
      "snow & ice", "lawn & landscape", "cleaning"],
    useCase: "The agreement a customer signs before a season of recurring work starts. It carries your numbered terms, a rate card the customer can check a storm invoice against, the service plan for that property, and an electronic signature.",
    bestFor: "Snow and ice contracts, seasonal lawn care, recurring cleaning rounds — anywhere the work repeats and the rate is per visit.",
    featured: true,
    build: () => {
      const doc = fromKeys(["title_dark", "at_a_glance"]);
      for (const [label, keys] of Object.entries(AGREEMENT_CLAUSE_SLOTS)) {
        if (label === "Billing & payment") continue; // placed below, in order
        const s = rawPremade("terms")!.build();
        s.label = label;
        (s.columns[0].widgets[0].props as any).libraryKeys = keys;
        doc.sections.push(s);
        if (label === "Severe weather & special conditions") {
          doc.sections.push(rawPremade("pricing")!.build());
        }
      }
      const billing = rawPremade("billing")!.build();
      (billing.columns[0].widgets[0].props as any).libraryKeys = AGREEMENT_CLAUSE_SLOTS["Billing & payment"];
      // "General terms" was appended by the loop; billing belongs before it.
      doc.sections.splice(doc.sections.length - 1, 0, billing);
      doc.sections.push(rawPremade("acceptance")!.build());
      const plan = rawPremade("property_plan")!.build();
      plan.pageBreakBefore = true;
      doc.sections.push(plan);
      doc.sections.push(rawPremade("footer_notes")!.build());
      return doc;
    },
  },
  {
    key: "platform_proposal",
    name: "Software platform proposal",
    purpose: "Tiered plans",
    businessTypes: ["Agencies & software", "Professional services"],
    tags: ["tiers", "plans", "recommended", "subscription", "software"],
    useCase: "For selling a product or a service in tiers, where the customer picks one. Three plans sit side by side with one marked Recommended, and only what they choose is added to the total.",
    bestFor: "Agencies, software and anyone quoting good / better / best rather than one number.",
    featured: true,
    build: () => {
      const doc = fromKeys(["title_light"], { style: "light" });
      const path = sec([
        makeWidget("heading", { text: "Your recommended path", level: 2 }),
        makeWidget("paragraph", {
          text: "Here is what we would start with, and what we would leave until later. Every plan below can be moved up or down at any time — nothing here locks you in for a year.",
        }),
      ], { numbered: true, label: "Your recommended path" });
      doc.sections.push(path);
      const cards = plansSection(
        "Choose your plan",
        "Pick one. The total below counts only the plan you choose.",
        [
          {
            name: "Essentials", pitch: "Everything you need to get going", price: "$249.00", per: "per month",
            features: ["One workspace, up to five people", "Email support, next business day", "Monthly summary of what happened"],
          },
          {
            name: "Growth", pitch: "For a team that is already busy", price: "$549.00", per: "per month",
            features: ["Everything in Essentials", "Up to twenty people", "Priority support, same business day", "A quarterly review with us"],
            recommended: true,
          },
          {
            name: "Full service", pitch: "We run it with you", price: "$1,150.00", per: "per month",
            features: ["Everything in Growth", "Unlimited people", "A named contact who knows your account", "We do the setup and the changes for you"],
          },
        ],
        { label: "Choose your plan" },
      );
      doc.sections.push(cards);
      doc.sections.push(rawPremade("totals")!.build());
      doc.sections.push(rawPremade("acceptance")!.build());
      doc.sections.push(rawPremade("footer_notes")!.build());
      return doc;
    },
  },
  {
    key: "simple_proposal",
    name: "Simple proposal",
    purpose: "Simple quote",
    businessTypes: ["Any business"],
    tags: ["quote", "short", "one page", "fast"],
    useCase: "A title, what you will do, what it costs and a signature. Four sections and nothing else, for the job you could have quoted in an email but want signed for.",
    bestFor: "Any trade, any one-off job small enough to describe in a paragraph.",
    featured: true,
    build: () => {
      const doc = fromKeys(["title_light"]);
      doc.sections.push(sec([
        makeWidget("heading", { text: "What we will do", level: 2 }),
        makeWidget("paragraph", { text: "" }),
      ], { numbered: true, label: "What we will do" }));
      doc.sections.push(sec([
        makeWidget("priced_line", { name: "", description: "", features: [], quantity: 1, unit_price: 0 }),
      ], { numbered: true, label: "What it costs" }));
      doc.sections.push(rawPremade("totals")!.build());
      doc.sections.push(rawPremade("acceptance")!.build());
      return doc;
    },
  },
  {
    key: "project_proposal",
    name: "One-off project proposal",
    purpose: "One-off project",
    businessTypes: ["Service industry"],
    tags: ["project", "install", "timeline", "one-off", "deposit",
      "lawn & landscape", "home services", "hvac & plumbing"],
    useCase: "For a job with a start and an end: what is being built, what happens in what order, what it costs and when you need paying. The timeline table is the part that stops the phone calls asking how long it will take.",
    bestFor: "A landscaping install, a remodel, a replacement or any quoted project measured in days rather than months.",
    build: () => {
      const doc = fromKeys(["title_light"]);
      (doc.sections[0].columns[0].widgets[0].props as any) = {
        style: "light_rule",
        title: "Project Proposal",
        subtitle: "Prepared for {{customer.name}} · {{property.address}}",
        bandRight: "Valid until {{contract.valid_until}}",
      };
      doc.sections.push(sec([
        makeWidget("key_facts", {
          rows: [
            { label: "Site", value: "{{property.name}}" },
            { label: "Prepared by", value: "{{business.name}}" },
            { label: "Questions to", value: "{{business.email}} · {{business.phone}}" },
            { label: "Price holds until", value: "{{contract.valid_until}}" },
          ],
        }),
      ], { padding: 12 }));
      doc.sections.push(sec([
        makeWidget("heading", { text: "What we will build", level: 2 }),
        makeWidget("paragraph", {
          text: "Everything below is included in the price. If something is found once we open the ground up — a buried line, a failed base, water where it should not be — we stop, photograph it and price the extra work before we carry on. Nothing is added to your bill without a yes from you first.",
        }),
        makeWidget("list", {
          items: [
            "Site protection, and the lawn and drive made good when we leave",
            "Excavation, base preparation and removal of everything we take out",
            "Supply and installation of the materials listed in the pricing below",
            "A final walk round with you before we load up",
          ],
        }),
      ], { numbered: true, label: "What we will build" }));
      doc.sections.push(sec([
        makeWidget("heading", { text: "How the work will run", level: 2 }),
        makeWidget("data_table", {
          columns: ["Stage", "What happens", "How long"],
          rows: [
            ["1 · Before we start", "We confirm the date, mark out the area with you and arrange access", "1 day"],
            ["2 · Groundwork", "Excavation, spoil taken away, base laid and compacted", "2 days"],
            ["3 · Installation", "The work itself, built to the drawing you signed off", "3 days"],
            ["4 · Finishing", "Clean down, photographs, and your walk round", "1 day"],
          ],
        }),
      ], { numbered: true, label: "How the work will run" }));
      doc.sections.push(sec([
        makeWidget("priced_line", {
          name: "Groundwork and base preparation",
          description: "Excavation to depth, spoil removed from site, compacted sub-base laid and levelled.",
          features: ["Skip and disposal included", "Ground left level and clean"],
          quantity: 1, unit_price: 2850,
        }),
        makeWidget("priced_line", {
          name: "Supply and installation",
          description: "All materials, labour and plant hire for the installation described above.",
          features: ["Materials guaranteed for ten years", "Workmanship guaranteed for two"],
          quantity: 1, unit_price: 6400,
        }),
      ], { numbered: true, label: "What it costs" }));
      doc.sections.push(rawPremade("totals")!.build());
      doc.sections.push(sec([
        makeWidget("callout", {
          heading: "",
          panels: [
            { title: "Payment", tone: "accent", body: "A third on the day we start, a third at the end of the groundwork, and the balance within seven days of your walk round." },
            { title: "Weather", tone: "warn", body: "Heavy rain or frozen ground can move a stage by a day or two. We will tell you the same day it happens, not afterwards." },
          ],
        }),
      ], { label: "Payment and weather" }));
      doc.sections.push(rawPremade("acceptance")!.build());
      doc.sections.push(rawPremade("footer_notes")!.build());
      return doc;
    },
  },
  {
    key: "consulting_engagement",
    name: "Consulting engagement",
    purpose: "Consulting engagement",
    businessTypes: ["Professional services", "Agencies & software"],
    tags: ["consulting", "milestones", "goals", "retainer", "scope"],
    useCase: "For selling thinking rather than materials. It opens on what the client is trying to achieve, sets out how you will work with them, then puts the milestones and the fees where they can be read together.",
    bestFor: "Consultants, accountants, agencies and anyone billing for an engagement with stages rather than a product.",
    build: () => {
      const doc = fromKeys(["title_light"]);
      (doc.sections[0].columns[0].widgets[0].props as any) = {
        style: "light_rule",
        title: "Consulting Engagement",
        subtitle: "Prepared for {{customer.name}}",
        bandRight: "Valid until {{contract.valid_until}}",
      };
      doc.sections.push(sec([
        makeWidget("heading", { text: "What you are trying to achieve", level: 2 }),
        makeWidget("paragraph", {
          text: "This is what we heard when we spoke. If any of it is wrong, tell us before you sign — the plan below is built on it and it is much cheaper to change here than halfway through.",
        }),
        makeWidget("list", {
          items: [
            "A clear picture of where the time and the money are going today",
            "One way of working that the whole team can follow",
            "Something that keeps running after we leave",
          ],
        }),
      ], { numbered: true, label: "What you are trying to achieve" }));
      doc.sections.push(sec([
        makeWidget("heading", { text: "How we will work", level: 2 }),
        makeWidget("paragraph", {
          text: "We work in short stages with something to look at after each one. You get a named person, not a rota, and a standing half hour each week to ask anything. Everything we produce is yours, in a format you can open without us.",
        }),
      ], { numbered: true, label: "How we will work" }));
      doc.sections.push(sec([
        makeWidget("heading", { text: "Milestones", level: 2 }),
        makeWidget("data_table", {
          columns: ["Milestone", "What you get", "By"],
          rows: [
            ["Discovery", "Interviews, a look at your numbers, and a written summary of what we found", "End of week 2"],
            ["Recommendations", "A short document with the options, the cost of each and what we would do", "End of week 4"],
            ["Implementation support", "We work alongside your team while the change beds in", "Weeks 5 to 10"],
            ["Handover", "Written guidance, a session with the team, and thirty days of questions answered", "End of week 12"],
          ],
        }),
      ], { numbered: true, label: "Milestones" }));
      doc.sections.push(sec([
        makeWidget("priced_line", {
          name: "Discovery and recommendations",
          description: "Weeks one to four, fixed price. Paid on delivery of the written recommendations.",
          features: ["Interviews and review", "Written findings", "Options with costs"],
          quantity: 1, unit_price: 6500,
        }),
        makeWidget("priced_line", {
          name: "Implementation support",
          description: "Weeks five to twelve, two days a week.",
          features: ["A named consultant", "Weekly working session", "Handover materials"],
          quantity: 8, unit_price: 1600,
        }),
      ], { numbered: true, label: "Fees" }));
      doc.sections.push(rawPremade("totals")!.build());
      doc.sections.push(rawPremade("acceptance")!.build());
      return doc;
    },
  },
  {
    key: "maintenance_plan",
    name: "Maintenance plan",
    purpose: "Maintenance plan",
    businessTypes: ["Service industry"],
    tags: ["maintenance", "subscription", "monthly", "visits", "priority",
      "hvac & plumbing", "cleaning", "lawn & landscape", "snow & ice", "home services"],
    useCase: "For the plan a customer pays for every month whether they call you or not. It says what is included, when you will visit, what it costs a month and what still gets charged separately.",
    bestFor: "Heating and plumbing cover, cleaning contracts, grounds maintenance, gutter and roof rounds — any agreement billed monthly.",
    build: () => {
      const doc = fromKeys(["title_light"]);
      (doc.sections[0].columns[0].widgets[0].props as any) = {
        style: "light_rule",
        title: "Maintenance Plan",
        subtitle: "Prepared for {{customer.name}} · {{property.name}}",
        bandRight: "Starts {{contract.start_date}}",
      };
      doc.sections.push(sec([
        makeWidget("key_facts", {
          rows: [
            { label: "Property", value: "{{property.address}}" },
            { label: "Plan starts", value: "{{contract.start_date}}" },
            { label: "Billed", value: "Monthly, in advance" },
            { label: "Cancel", value: "Any time, with 30 days' notice" },
          ],
        }),
      ], { padding: 12 }));
      doc.sections.push(sec([
        makeWidget("heading", { text: "What is included", level: 2 }),
        makeWidget("list", {
          items: [
            "Two full service visits a year, booked in with you a fortnight ahead",
            "A written check of everything we look at, sent the same day",
            "Priority booking — plan customers go to the front of the queue",
            "No call-out charge during working hours",
            "Ten per cent off any parts or extra work we quote",
          ],
        }),
      ], { numbered: true, label: "What is included" }));
      doc.sections.push(sec([
        makeWidget("heading", { text: "Your visit schedule", level: 2 }),
        makeWidget("data_table", {
          columns: ["When", "Visit", "What we do"],
          rows: [
            ["Spring", "Full service", "Everything checked, cleaned and tested, with a written report"],
            ["Autumn", "Pre-season check", "The check that stops a breakdown in the first cold week"],
            ["Any time", "Priority call-out", "Same or next working day, no call-out charge in hours"],
          ],
        }),
      ], { numbered: true, label: "Your visit schedule" }));
      doc.sections.push(sec([
        makeWidget("priced_line", {
          name: "Maintenance plan",
          description: "Billed monthly in advance. Cancel with thirty days' notice; nothing to pay after that.",
          features: ["Two service visits a year", "Priority booking", "No call-out charge in hours"],
          quantity: 12, unit_price: 39,
          cadence: "per year",
        }),
      ], { numbered: true, label: "What it costs" }));
      doc.sections.push(rawPremade("totals")!.build());
      doc.sections.push(sec([
        makeWidget("callout", {
          heading: "",
          panels: [
            { title: "Not included", tone: "warn", body: "Parts, and any repair we quote separately. Work outside working hours is charged at the out-of-hours rate, less your plan discount." },
            { title: "If you move", tone: "accent", body: "Tell us and the plan moves with you, or stops at the end of the month you move — whichever you prefer." },
          ],
        }),
      ], { label: "The small print" }));
      doc.sections.push(rawPremade("acceptance")!.build());
      return doc;
    },
  },
  {
    key: "commercial_bid",
    name: "Commercial services bid",
    purpose: "Recurring service agreement",
    businessTypes: ["Service industry"],
    tags: ["multi-site", "bid", "tender", "per site", "commercial",
      "snow & ice", "cleaning", "lawn & landscape"],
    useCase: "For bidding on more than one property at once. Each site gets its own block with its own line items and its own subtotal, and the document ends with one total for the lot.",
    bestFor: "Property managers, retail groups, housing associations and anyone asking you to price a portfolio rather than a building.",
    build: () => {
      const doc = fromKeys(["title_dark"]);
      (doc.sections[0].columns[0].widgets[0].props as any) = {
        style: "dark_band",
        title: "Commercial Services Bid",
        subtitle: "Prepared for {{customer.name}}. Pricing below is per site and holds for the full term.",
        bandRight: "Term {{contract.start_date}} – {{contract.end_date}}",
      };
      doc.sections.push(sec([
        makeWidget("heading", { text: "Scope of work", level: 2 }),
        makeWidget("paragraph", {
          text: "One crew, one schedule and one invoice across every site listed below. Each property is priced on its own so you can add or drop a site without re-pricing the rest.",
        }),
        makeWidget("list", {
          items: [
            "A named supervisor for the account, reachable directly",
            "Photographs of every completed visit, filed by site and date",
            "One monthly invoice with a per-site breakdown",
            "Cover arranged by us when someone is off — never a missed visit",
          ],
        }),
      ], { numbered: true, label: "Scope of work" }));
      // A PROPERTY IS A BOX (D-156): its heading, its address, its priced
      // lines and its own subtotal, each of them a widget the author can move
      // or delete. It was one `property_block` composite with all four locked
      // inside it, and `totals.ts` reads the property off the box the address
      // is in, so the per-site subtotals are the same numbers they were.
      doc.sections.push(sec([propertyBox("Site 1 — Main building", [
        { description: "Scheduled service visit", quantity: 24, unit_price: 185 },
        { description: "Entrances, walkways and steps", quantity: 24, unit_price: 65 },
      ])], { label: "Site 1" }));
      doc.sections.push(sec([propertyBox("Site 2 — Car park and service yard", [
        { description: "Scheduled service visit", quantity: 24, unit_price: 240 },
        { description: "Materials applied as needed", quantity: 12, unit_price: 110 },
      ])], { label: "Site 2" }));
      doc.sections.push(rawPremade("totals")!.build());
      doc.sections.push(sec([
        makeWidget("clauses", {
          heading: "Terms",
          items: [
            { title: "Term and renewal", body: "The term runs from the start date to the end date above and renews only if both of us agree in writing. Either of us may end it with sixty days' notice." },
            { title: "Adding or removing a site", body: "A site can be added or dropped with thirty days' notice. The price for every other site is unchanged." },
            { title: "Invoicing", body: "One invoice a month, in arrears, with a per-site breakdown and the visit photographs attached. Payment is due thirty days from the invoice date." },
            { title: "Insurance", body: "We carry public liability and employer's liability cover and will send certificates before the first visit and at every renewal." },
          ],
        }),
      ], { numbered: true, label: "Terms" }));
      doc.sections.push(rawPremade("acceptance")!.build());
      doc.sections.push(rawPremade("footer_notes")!.build());
      return doc;
    },
  },
  {
    key: "partnership_proposal",
    name: "Community partnership proposal",
    purpose: "Sponsorship & partnership",
    businessTypes: ["Non-profit"],
    tags: ["sponsorship", "partnership", "donation", "community", "charity"],
    useCase: "For asking a business to support your work. It opens on what you do and who it reaches, then offers two or three levels of support side by side so the reader chooses rather than decides whether.",
    bestFor: "Charities, churches, clubs and community groups approaching a local business or a returning supporter.",
    build: () => {
      const doc = fromKeys(["title_light"]);
      (doc.sections[0].columns[0].widgets[0].props as any) = {
        style: "light_rule",
        title: "Community Partnership",
        subtitle: "An invitation to {{customer.name}} from {{business.name}}",
        bandRight: "For the coming year",
      };
      doc.sections.push(sec([
        makeWidget("heading", { text: "Why we are writing", level: 2 }),
        makeWidget("paragraph", {
          text: "We run programmes that people in this town rely on every week, and we do it on a budget that only works because local businesses stand behind it. We are asking you to be one of them for the coming year.",
        }),
        makeWidget("key_facts", {
          rows: [
            { label: "People we reached last year", value: "1,240" },
            { label: "Volunteers giving their time", value: "86" },
            { label: "Of every pound given, spent on the work", value: "92p" },
            { label: "Years we have been here", value: "17" },
          ],
        }),
      ], { numbered: true, label: "Why we are writing" }));
      const levels = plansSection(
        "How you could help",
        "Choose the level that suits you. Every one of them is acknowledged, and none of them commits you beyond the year.",
        [
          {
            name: "Supporter", pitch: "Keeps the lights on", price: "$500", per: "for the year",
            features: ["Your name on our supporters page", "A thank you in our annual report", "An invitation to the summer open day"],
          },
          {
            name: "Partner", pitch: "Funds a programme for a term", price: "$2,500", per: "for the year",
            features: ["Everything in Supporter", "Your logo at the programme itself", "A short piece about you in our newsletter", "Two places at the annual dinner"],
            recommended: true,
          },
          {
            name: "Principal partner", pitch: "Puts your name beside the work", price: "$7,500", per: "for the year",
            features: ["Everything in Partner", "Named on the programme for the full year", "A team volunteering day arranged for you", "A visit and a photograph for your own channels"],
          },
        ],
        { label: "How you could help" },
      );
      doc.sections.push(levels);
      doc.sections.push(sec([
        makeWidget("heading", { text: "What your support pays for", level: 2 }),
        makeWidget("list", {
          items: [
            "$500 runs a week of after-school sessions for twenty children",
            "$2,500 keeps the food programme stocked for a full term",
            "$7,500 funds a part-time coordinator for the year",
          ],
        }),
      ], { numbered: true, label: "What your support pays for" }));
      doc.sections.push(sec([
        makeWidget("paragraph", {
          text: "If none of these is quite right, say so and we will find something that is. A partnership that works for you is worth far more to us than a number on a page.",
        }),
      ], { label: "One more thing", padding: 16 }));
      doc.sections.push(rawPremade("acceptance")!.build());
      doc.sections.push(rawPremade("footer_notes")!.build());
      return doc;
    },
  },
];

/** Every shipped template, each one a tree (D-156). See `asTree`. */
export const SHIPPED_TEMPLATES: ShippedTemplate[] = SHIPPED_RAW.map((t) => ({
  ...t,
  build: () => upgradeDocument(t.build()),
}));

export function templateByKey(key: string): ShippedTemplate | undefined {
  return SHIPPED_TEMPLATES.find((t) => t.key === key);
}

/**
 * THE TOTAL GOES ABOVE THE SIGNATURE (D-07).
 *
 * The 2026-09-16 tester signed a $1,875 agreement whose customer copy and
 * whose five-page PDF carried three per-site subtotals and no grand total
 * anywhere. The customer put their name to a figure that was not on the paper.
 *
 * `totals` is the platform's ONE place money is added up (totals.ts
 * PRICED_KINDS), and it is a widget, so putting one immediately above the
 * signature means the canvas, the customer's own page and the PDF all print
 * the same number — three painters, one decision.
 *
 * Applied once, to every shipped template, and only when the document does not
 * already carry a totals widget: the tiered-plans template has "Your total" as
 * a section of its own and must not grow a second one. A document assembled
 * from blank sections still has no total above its signature until the
 * renderer itself grows the rule — B-A-2 in REBUILD_HANDOFF_2026-09-16.md.
 */
export function withTotalBeforeSignature(doc: BuilderDocument): BuilderDocument {
  const has = (kind: string) =>
    doc.sections.some((s) => s.columns.some((c) => c.widgets.some((w) => w.kind === kind)));
  if (has("totals") || !has("signature")) return doc;
  return {
    ...doc,
    sections: doc.sections.map((s) => ({
      ...s,
      columns: s.columns.map((c) => {
        const at = c.widgets.findIndex((w) => w.kind === "signature");
        if (at < 0) return c;
        const widgets = [...c.widgets];
        widgets.splice(at, 0, makeWidget("totals", { heading: "What you are agreeing to" }));
        return { ...c, widgets };
      }),
    })),
  };
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

/* ══════════════════════════════════════════════════════════════════════════
   The library (§11.9, D-146)
   ══════════════════════════════════════════════════════════════════════════ */

/** What the gallery needs to draw a real picture of a proposal template. */
export interface ProposalLibraryOptions {
  /** The business's own clause library, so the agreement's terms show filled. */
  clauses?: ClauseRow[];
  accent?: string;
  headingFont?: string;
  bodyFont?: string;
  business?: { name: string; tagline?: string; logoUrl?: string | null; contactLine?: string };
}

/** The page width a document preview is rendered at, before it is scaled. */
export const PROPOSAL_PREVIEW_WIDTH = 760;

/**
 * One template's picture: the REAL document through THE renderer.
 *
 * Rendered in "view" mode with `SAMPLE_MERGE`, so the card reads like a
 * finished proposal instead of a page of `__________` where merge fields go.
 * Nothing here ever reaches a customer: the adapter builds the template again,
 * unfilled, when the author picks it.
 */
export function proposalPreview(doc: BuilderDocument, o: ProposalLibraryOptions = {}): TemplatePreview {
  const ctx = makeContext(doc, {
    mode: "view",
    merge: SAMPLE_MERGE,
    accent: o.accent || doc.settings.accent,
    headingFont: o.headingFont,
    bodyFont: o.bodyFont,
    business: o.business || {
      name: SAMPLE_MERGE["business.name"],
      contactLine: `${SAMPLE_MERGE["business.email"]} · ${SAMPLE_MERGE["business.phone"]}`,
    },
  });
  return { html: renderDocument(doc, ctx), css: DOCUMENT_CSS, width: PROPOSAL_PREVIEW_WIDTH };
}

/**
 * Every proposal template as a library entry, with the empty page FIRST (D-153).
 *
 * The adapter passes its clause library and brand kit; it gets back a list it
 * hands straight to `TemplateLibrary` and a key it hands straight back to
 * `templateByKey`. No adapter draws a grid of its own any more.
 */
export function proposalLibrary(o: ProposalLibraryOptions = {}): TemplateEntry[] {
  const entries: TemplateEntry[] = SHIPPED_TEMPLATES.map((t) => ({
    id: t.key,
    title: t.name,
    purpose: t.purpose,
    businessTypes: t.businessTypes,
    tags: t.tags,
    useCase: t.useCase,
    bestFor: t.bestFor,
    featured: t.featured,
    preview: () => proposalPreview(hydrateClauses(t.build(), o.clauses || []), o),
  }));
  return [...entries, blankEntry()];
}

/**
 * A business's OWN saved templates, in the same library.
 *
 * "Save as template" browsing is not a second screen: a saved row is an entry
 * like any other, badged so it is obvious whose it is, with a picture rendered
 * from the document that was actually saved.
 */
export interface SavedTemplateRow {
  id: string;
  name: string;
  description?: string | null;
  document?: unknown;
}

export const SAVED_PURPOSE = "Your templates";

/**
 * WHERE A SAVED BLOCK IS FILED (M-23).
 *
 * A block and a template are the same stored thing — sections the author kept
 * — and they are stored the same way, because a second store for "one section
 * instead of several" would be a second thing to list, search and delete. What
 * separates them is what you DO with one: a template is where a document
 * starts, and a block is dropped into a document that already exists. So they
 * are two purposes over one row, and the row's own shape decides which:
 * exactly ONE section is a block.
 */
export const BLOCK_PURPOSE = "Your own blocks";

/** Is this saved row one the author kept as a block rather than a template? */
export function isSavedBlock(row: { document?: unknown }): boolean {
  const sections = (row?.document as { sections?: unknown[] } | undefined)?.sections;
  return Array.isArray(sections) && sections.length === 1;
}

export function savedTemplateEntries(
  rows: SavedTemplateRow[],
  open: (row: SavedTemplateRow) => BuilderDocument,
  o: ProposalLibraryOptions = {},
): TemplateEntry[] {
  return rows.map((r) => {
    const block = isSavedBlock(r);
    return {
      id: `saved:${r.id}`,
      title: r.name,
      purpose: block ? BLOCK_PURPOSE : SAVED_PURPOSE,
      businessTypes: ["Any business"],
      tags: block ? ["saved", "mine", "my blocks", "block"] : ["saved", "mine", "my templates"],
      useCase: r.description?.trim()
        ? r.description.trim()
        : block
          ? "One of your own saved blocks. Drop it into any document and change anything on it."
          : "One of your own saved templates. It opens exactly as you saved it, and anything on it can still be changed.",
      bestFor: block
        ? "The part you write the same way every time."
        : "Whatever you saved it for — your own wording, your own order, already agreed.",
      preview: () => proposalPreview(open(r), o),
    };
  });
}

/** The id a saved entry carries, back to the row it came from. */
export function savedIdOf(entryId: string): string | null {
  return entryId.startsWith("saved:") ? entryId.slice("saved:".length) : null;
}

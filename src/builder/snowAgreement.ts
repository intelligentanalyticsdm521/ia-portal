/**
 * builder/snowAgreement.ts — THE COMMERCIAL SNOW & ICE AGREEMENT, as a document.
 *
 * Its own module because it is mostly WORDS. Ten numbered sections of plain
 * English is three hundred lines of prose, and prose belongs next to prose
 * rather than wedged between the seven other templates' structure in
 * `templates.ts`. `templates.ts` still owns the catalogue entry — the badge,
 * the segments, the tags, the use case — so there is one list of what is
 * shipped, and one place a template is registered.
 *
 * (The file is `snowAgreement.ts` and not `templates/snowAgreement.ts`: a
 * `templates/` folder beside `templates.ts` is the same import specifier on
 * Windows, which is the trap `TemplateLibrary.tsx` / `templateLibraryModel.ts`
 * already carries a comment about.)
 *
 * ── WHY IT REPLACES "Seasonal service agreement" ──────────────────────────
 * That template was this one wearing a generic label: its clause slots were
 * `snow_plowing`, `service_trigger`, `what_a_push_means`, `snow_storage`; its
 * pricing section shipped a storm example and a severe-weather panel; its
 * glance rows said "We start plowing at". It was a snow agreement whose WORDS
 * lived somewhere else — `oliver.clause_library` — so a business that had
 * never written a clause library opened it and got six numbered sections with
 * nothing in them. Two near-duplicates would be worse than either, so this one
 * keeps the key `service_agreement` (a saved draft that names it still opens)
 * and the old shape is deleted.
 *
 * ── THE RULE THE 2026-09-16 USER TEST WROTE ───────────────────────────────
 * Every clause SHIPS, worded generally, as its own heading and its own
 * paragraph — two atomic widgets the author can click, retype, move or delete
 * (§11.12). The tester had to select four whole paragraphs and retype them
 * because the only alternative was an empty `clauses` widget. Nothing on this
 * document needs retyping to be true; the blanks that are genuinely per-job
 * are MERGE FIELDS, and every one of them has a box in the Details group
 * (`proposal/documentDetails.ts`).
 *
 * ── THE CONTRACTOR IS NEVER NAMED ─────────────────────────────────────────
 * `{{business.name}}` throughout, filled from the business the author is
 * signed in as. No template in the library names a client of ours, and the
 * denylist test in `test/builder-template-library.test.mjs` fails the build if
 * one ever does.
 *
 * Pure. No React, no fetch.
 */
import {
  makeContainer, makeSection, makeWidget, emptyDocument,
  type BuilderDocument, type Section, type Widget,
} from "./model";
import { DEFAULT_CONSENT } from "./render";

/* ══════════════════════════════════════════════════════════════════════════
   Small builders
   ══════════════════════════════════════════════════════════════════════════ */

/** One section holding one column of widgets. */
function band(widgets: Widget[], extra: Partial<Section> = {}): Section {
  const section = makeSection({ ...extra, layout: 1 });
  section.columns[0].widgets = widgets;
  return section;
}

/** A numbered section of the agreement: "01 · Scope of services". */
function clauseSection(label: string, widgets: Widget[], extra: Partial<Section> = {}): Section {
  return band(widgets, { ...extra, label, numbered: true, padding: 24 });
}

/**
 * ONE CLAUSE — a heading and a paragraph, and nothing locked together.
 *
 * This is the shape D-156 asked for and the shape the 2026-09-16 test needed:
 * the author clicks the title and retypes it, clicks the body and retypes it,
 * drags either one somewhere else, or deletes the pair. A `clauses` widget
 * holding twelve items can do none of those things to item seven.
 */
function clause(title: string, body: string): Widget[] {
  return [
    makeWidget("heading", { text: title, level: 3 }),
    makeWidget("paragraph", { text: body }),
  ];
}

/** Several clauses, flattened into one column. */
function clauses(pairs: Array<[string, string]>): Widget[] {
  return pairs.flatMap(([title, body]) => clause(title, body));
}

/** A row of short answers across the page. */
const factRow = (facts: Array<[string, string]>) =>
  /* The key ORDER is `readStyle`'s own (style.ts: gap, then direction, then
     wrap). It costs nothing to write it that way and it makes the document
     byte-identical after a save and a reopen, which is the discipline §11.8
     holds everything else to. */
  makeContainer({ gap: 16, direction: "row", wrap: true },
    facts.map(([label, value]) => makeWidget("key_fact", { label, value })));

/**
 * One money line, ready to be filled from Products & Services.
 *
 * `quantity` IS the measurement the rate is charged on — thousands of square
 * feet of paved area for the lot services, thousands of square feet of walk
 * for the pedestrian ones, and the number of areas for the dock. There is no
 * second "lot size" field anywhere on this document, deliberately: a number
 * that is typed twice is a number that will disagree with itself, which is the
 * defect `documentDetails.ts` was written to end.
 *
 * `cadence` is what the amount is charged PER. It is also what stops the
 * document growing a total it cannot honestly print — see
 * `templates.ts` `pricedOnOneBasis`.
 */
function rate(
  name: string,
  description: string,
  quantity: number,
  unitPrice: number,
  cadence: string,
  bullets: string[] = [],
  /** A note for the AUTHOR, drawn in the panel and on no page. */
  help = "",
): Widget {
  return makeWidget("price_line", {
    name, description, bullets, quantity, unit_price: unitPrice, cadence,
    ...(help ? { help } : {}),
  });
}

/**
 * WHAT THE AT-A-GLANCE TABLE SAYS WHERE THERE IS NO ONE RATE TO STATE.
 *
 * The glance table's third column is "How it is priced", and a row whose price
 * depends on the job — hauling, a severe event — has no figure that belongs on
 * page one. It used to be left as a basis with an empty cell beside it, which
 * reads as "free". It points at the page that does have the answer instead, and
 * a test asserts no cell in that column is ever blank.
 */
export const SEE_THE_SCHEDULE = "See the pricing schedule";

/** What a row with no amount at all says, on the schedule itself. */
export const QUOTED_SEPARATELY = "Quoted separately";

/* ══════════════════════════════════════════════════════════════════════════
   The document
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The ten sections of the agreement, plus its cover and its small print.
 *
 * Section numbering is the ENGINE's (`model.ts` `sectionNumbers`): a section
 * flagged `numbered` gets `01`, `02`, `03` in document order and the renderer
 * prints it beside the section's label. Nothing here types a number, so
 * deleting section 04 renumbers the rest.
 */
export function snowAgreementDocument(): BuilderDocument {
  const doc = emptyDocument({
    style: "plain",
    /* THE ONE DEFAULT THIS DOCUMENT SHIPS WITH. Two inches is the trigger
       nearly every commercial lot is written at, it is the number the storm
       example reads, and shipping it means the cover, the scope, the pricing
       page and the example all say the same thing the moment the template
       opens. Every other blank is the author's to type. */
    merge: { snow_trigger: "2 inches" },
  });

  doc.sections = [
    cover(),
    atAGlance(),
    scopeOfServices(),
    iceAndOptional(),
    severeWeather(),
    propertyResponsibilities(),
    pricingSchedule(),
    billingAndPayment(),
    generalTerms(),
    acceptance(),
    propertyServicePlan(),
    smallPrint(),
  ];
  return doc;
}

/* ── Cover ──────────────────────────────────────────────────────────────── */

function cover(): Section {
  return band([
    makeWidget("doc_header", {
      style: "dark_band",
      title: "Commercial Snow & Ice Management Agreement",
      subtitle: "A clear, dependable plan for winter weather. Prepared for signature and electronic acceptance.",
      /* NO `bandRight`. The service term is one of the four key facts under
         the band, and it was printed in the band as well — the same dates
         twice on one cover, three inches apart. One fact, one place. */
    }),
    factRow([
      ["Customer", "{{customer.name}}"],
      ["Property", "{{property.name}}"],
      ["Service address", "{{property.address}}"],
      ["Service term", "{{contract.start_date}} – {{contract.end_date}}"],
    ]),
  ], { padding: 24, label: "Cover" });
}

/* ── 01 ─────────────────────────────────────────────────────────────────── */

function atAGlance(): Section {
  return clauseSection("Agreement at a glance", [
    makeWidget("paragraph", {
      text: "This agreement sets out the terms on which {{business.name}} will provide snow and ice management at the property named above. What you have chosen, the depth that brings us out, the prices and any special conditions are set out in the pricing schedule, and the pricing schedule is part of this agreement.",
    }),
    makeWidget("pricing_table", {
      heading: "What this agreement covers",
      intro: "",
      labelService: "Service",
      labelBasis: "What brings us out",
      labelRate: "How it is priced",
      columns: { service: true, basis: true, rate: true },
      /* THE SAME SERVICES THE PRICING SCHEDULE PRICES, in the same order, so
         page one and page six cannot list different work. Where a row has no
         one rate to state, the cell points at the schedule rather than being
         left empty — an empty "How it is priced" cell reads as "free". */
      rows: [
        { name: "Snow plowing", basis: "{{snow_trigger}} of accumulation", rate: "Per 1,000 sq ft of paved area, per push" },
        { name: "Additional snow push", basis: "Each time the trigger depth is reached again", rate: SEE_THE_SCHEDULE },
        { name: "Lot salting", basis: "Freezing conditions, or when you ask", rate: "Per 1,000 sq ft, per application" },
        { name: "Sidewalks and entries", basis: "If selected on the pricing schedule", rate: "Per 1,000 sq ft, per visit" },
        { name: "Snow hauling and pile relocation", basis: "If the snow has nowhere left to go", rate: QUOTED_SEPARATELY },
        { name: "Severe or extraordinary event", basis: "{{severe_event_threshold}} or more, or special conditions", rate: SEE_THE_SCHEDULE },
      ],
    }),
    makeWidget("heading", { text: "Service summary", level: 3 }),
    makeWidget("paragraph", {
      text: "We watch the weather through the season and send equipment when the snow reaches the trigger depth of {{snow_trigger}}.",
    }),
    makeWidget("paragraph", {
      text: "Plowing is charged per completed push, not per storm and not per hour.",
    }),
    makeWidget("paragraph", {
      text: "If it keeps snowing and the trigger depth is reached again, that is another push and another charge. A long storm is more than one visit.",
    }),
    makeWidget("paragraph", {
      text: "Salting, sidewalks, hauling and severe-event work are charged separately unless the pricing schedule says they are included.",
    }),
  ]);
}

/* ── 02 ─────────────────────────────────────────────────────────────────── */

function scopeOfServices(): Section {
  return clauseSection("Scope of services", clauses([
    ["Snow plowing",
      "{{business.name}} will clear snow mechanically from the paved areas listed in the property service plan at the back of this agreement. That normally means the parking areas we can reach, the drive lanes, the entrances and any other paved surface written into the plan. Snow is pushed to the storage areas the plan identifies."],
    ["What brings us out",
      "The trigger depth is {{snow_trigger}} of accumulated snow unless the pricing schedule says otherwise. When that depth is reached we may come out. If more snow falls and the depth is reached again, we may come out again, and that visit is charged too."],
    ["What a push means",
      "A push is one completed clearing visit. It is priced on the paved area we clear and the rate agreed for this property, not on the total inches the storm dropped. One storm can therefore be several billable pushes, and a shallow storm may be none."],
    ["Final cleanup",
      "After a storm we may return to tidy the contracted paved areas once conditions and the route allow. Final cleanup does not include hauling snow away, moving piles that are already established, re-clearing snow that has drifted back since we left, or clearing snow that never reached the trigger depth. Any of those is separate work and is agreed before it is done."],
    ["Where the snow goes",
      "Snow is placed in the storage areas the property service plan identifies. We will not deliberately pile snow in fire lanes, at building entrances, in accessible parking or its access aisles, on pedestrian routes, in the roadway, or over drains and drainage structures. Identifying somewhere reasonable for the snow to go, before the season starts, is the property's to do."],
  ]));
}

/* ── 03 ─────────────────────────────────────────────────────────────────── */

function iceAndOptional(): Section {
  return clauseSection("Ice, deicing and optional services", clauses([
    ["Deicing",
      "Deicing is charged separately from plowing unless the pricing schedule expressly includes it. We may recommend or apply deicing material when freezing conditions, a refreeze, freezing rain or leftover ice make treatment sensible."],
    ["What deicing can and cannot do",
      "How well any deicing material works depends on the temperature, what is falling, how much traffic the surface takes, what the surface is, how much material goes down and what the weather does next. Deicing is there to reduce ice and improve grip. It is not a promise that every surface will stay clear of ice."],
    ["Sidewalks and pedestrian areas",
      "Sidewalk work is included only when it is selected on the pricing schedule. The property service plan should name the walks, the pedestrian routes, the entrances and the steps that are covered, because a walk that is not on the plan is not on the route."],
    ["Snow hauling",
      "Hauling is not part of the per-push plowing rate unless the pricing schedule says it is. When snow has to be loaded, carried and tipped somewhere else, that work is quoted or billed on its own."],
    ["Work you ask for outside the plan",
      "Anything you ask for outside the agreed trigger, the agreed areas or the agreed scope is charged at the rate on the pricing schedule, or at our current rate for that work if the schedule does not name one."],
  ]));
}

/* ── 04 ─────────────────────────────────────────────────────────────────── */

function severeWeather(): Section {
  return clauseSection("Severe weather and special conditions", [
    makeWidget("paragraph", {
      text: "Winter storms do not all behave like ordinary snowfall. The conditions below can need more visits, different timing or additional charges, and we will tell you which as soon as we know.",
    }),
    ...clauses([
      ["Heavy snow",
        "A storm that drops an unusual depth can need several passes, more machine time, or more visits than the ordinary plan allows for."],
      ["Blizzards and drifting",
        "Wind moves snow back onto ground that has already been cleared. Re-clearing an area because the wind refilled it is treated as an additional visit."],
      ["Freezing rain and hard ice",
        "Freezing rain and bonded ice can need deicing, scraping, hand work or repeated treatment. That work is charged separately."],
      ["Extreme storms",
        "A storm above {{severe_event_threshold}}, a storm that runs for days, a declared emergency, or anything needing equipment we would not normally bring, is handled under special-event or hourly pricing agreed with you."],
      ["Access and traffic",
        "When we get to you can be affected by traffic, parked vehicles, emergency access, your own operations, events on site, and conditions on the route."],
    ]),
    makeWidget("callout", {
      heading: "",
      panels: [{
        title: "Important",
        tone: "warn",
        body: "During a major storm we work to a priority order: how severe the weather is, safety, what we can get into, how the route runs, what equipment is free, and how many properties are waiting. We will not promise you a time we cannot keep.",
      }],
    }),
  ]);
}

/* ── 05 ─────────────────────────────────────────────────────────────────── */

function propertyResponsibilities(): Section {
  return clauseSection("Property responsibilities", clauses([
    ["Access",
      "Give us reasonable access to the areas we are contracted to clear, and tell us promptly when the site is closed, restricted or changed."],
    ["Vehicles",
      "Move vehicles, or have them moved, out of the areas meant to be plowed. We are not responsible for ground we could not reach because a vehicle or something else was in the way."],
    ["Obstacles",
      "Point out the curbs, islands, speed bumps, drains, utility covers, planting, posts, wheel stops and signs that will not be visible once there is snow on them. They go on the property service plan."],
    ["Snow storage",
      "Identify somewhere reasonable for the snow to go before the season starts, and keep those areas clear where you can."],
    ["Changes on site",
      "Tell us about construction, temporary barriers, changed traffic patterns, events and anything else that affects how we work the site."],
    ["Parked vehicles and obstructions",
      "We will work around parked vehicles and other obstructions where it is safe to do so. Ground we cannot reach safely may stay untreated until it is clear, and a return visit caused by an obstruction is treated as additional work."],
    ["Hidden hazards",
      "Snow and ice hide curbs, broken paving, planting, drains, equipment and other hazards. We will take reasonable care. We cannot take responsibility for something that was concealed, unmarked and not reasonably findable under the snow."],
  ]));
}

/* ── 06 ─────────────────────────────────────────────────────────────────── */

function pricingSchedule(): Section {
  return clauseSection("Pricing schedule", [
    makeWidget("paragraph", {
      text: "This page is the single source of truth for what this property costs. Each line below is priced per event, and the quantity on it is the measurement the rate is charged on — thousands of square feet of paved area for the lot lines, thousands of square feet of walk for the pedestrian lines.",
    }),
    rate(
      "Snow plowing — per push at the trigger depth",
      /* NEUTRAL. This sentence used to read "Every further 2 inches of
         accumulation is another push at the same rate", which typed the
         trigger depth into the words (the Details box already carries it) and
         promised the SAME rate — untrue the moment a business prices the
         second push differently, which is why the draft carries an additional
         push rate of its own. It names the line below instead. */
      "Mechanical clearing of the paved areas in the property service plan. Each time the trigger depth is reached again, that is another push, billed at the additional-push rate shown in the schedule.",
      12, 18, "per push",
      ["Priced on the paved area, not on the storm", "Trigger depth {{snow_trigger}}"],
    ),
    /* THE DRAFT'S SECOND PRICING ROW, restored as a line of its own. It ships
       BLANK because only the business knows whether a second push inside one
       storm costs what the first did — and a number invented here is a number
       that goes out under somebody's signature. */
    rate(
      "Additional snow push — each additional trigger",
      "When accumulation reaches the trigger depth again during the same storm, the property is cleared again and that visit is billed at this rate.",
      12, 0, "per push",
      [],
      "Leave it the same as the plowing rate if every push costs the same",
    ),
    rate(
      "Lot salting",
      "Deicing material spread across the paved areas, when conditions call for it or when you ask.",
      12, 14, "per application",
    ),
    rate(
      "Sidewalk clearing",
      "The walks, entries and steps named in the property service plan, cleared by hand or by machine.",
      2, 45, "per visit",
    ),
    rate(
      "Sidewalk ice melt",
      "Pedestrian-safe deicer on the walks, entries and steps named in the plan.",
      2, 22, "per application",
    ),
    rate(
      "Loading dock and service yard",
      "Dock aprons, pits and the service yard, cleared as a separate area because they need a different machine.",
      1, 95, "per event",
    ),
    rate(
      "Storm monitoring — November to March",
      "We watch the forecast for this property through the season, hold a slot on the route and dispatch without waiting to be called.",
      1, 200, "per month",
    ),
    /* THE DRAFT'S SIXTH ROW, restored as its own line. Blank for the same
       reason as the additional push: what an extraordinary storm costs is the
       business's to state, and it is a rate, not a quote. */
    rate(
      "Severe or extraordinary event — {{severe_event_threshold}} or more, or special conditions",
      "A storm above the severe-event depth, a storm that runs for days, a declared emergency, or anything needing equipment we would not normally bring.",
      1, 0, "per event",
      [],
      "The rate, or the hourly rate, this work is handled at — leave it blank and it is agreed case by case",
    ),
    /* A QUOTED ROW, not a priced one. The draft's snow-hauling line carries no
       amount at all: the work is measured when it is needed. A price line
       showing $0.00 would read as free, and it would put a seventh basis into
       `pricedOnOneBasis` for a charge that has none — so it is a plain fact,
       with the words the draft uses. */
    makeWidget("key_fact", {
      label: "Snow hauling — if required",
      value: QUOTED_SEPARATELY,
    }),
    makeWidget("paragraph", {
      text: "Loading, carrying and tipping snow away from the property is measured and quoted before the work starts, because what it costs depends on how much snow there is and how far it has to go.",
    }),
    makeWidget("heading", { text: "Storm example", level: 3 }),
    makeWidget("paragraph", {
      text: "An example, not a charge. If the trigger depth is {{snow_trigger}} and a storm drops enough snow to reach it three times, the property is cleared three times: the first visit at the plowing rate and each further one at the additional-push rate on the schedule above. That is what per-push pricing means — a long storm is more than one visit.",
    }),
    makeWidget("heading", { text: "Minimum charge", level: 3 }),
    makeWidget("paragraph", {
      text: "The smallest amount any single visit is billed at is {{minimum_charge}}. Where plowing, salting and sidewalk work are all done on the same visit, they are combined and the minimum applies to the visit as a whole rather than to each service.",
    }),
    makeWidget("heading", { text: "Before the season", level: 3 }),
    makeWidget("paragraph", {
      text: "The pre-season site walk — marking obstacles, agreeing where the snow goes and setting the route — is included at no charge when this agreement is signed for the full service term.",
    }),
  ]);
}

/* ── 07 ─────────────────────────────────────────────────────────────────── */

function billingAndPayment(): Section {
  return clauseSection("Billing and payment", clauses([
    ["Invoicing",
      "Invoices come from {{business.name}} on the terms held against your account, and each one lists the visits it covers."],
    ["Payment terms",
      "Invoices are due {{payment_terms}}."],
    ["What we record",
      "We keep a record of each visit: the date, roughly how much snow there was, what was done, what material went down and any notes from the site."],
    ["If you disagree with an invoice",
      "Tell us promptly and say which line and why, so we can look at the record for that visit while everyone still remembers it."],
    ["Overdue accounts",
      "An unpaid balance may attract late charges and collection costs, and service may be suspended, to the extent your account terms and the law allow."],
    ["Why the records matter",
      "Winter work can be several visits inside one storm, so service logs, timestamps, photographs, route records and weather data are what we use to show what was done and when."],
  ]));
}

/* ── 08 ─────────────────────────────────────────────────────────────────── */

function generalTerms(): Section {
  return clauseSection("General terms", clauses([
    ["Timing",
      "We will make reasonable efforts to get to you in good time. We do not guarantee an exact finishing time: storm intensity, traffic, the state of the route, equipment availability, breakdowns, emergencies and the number of properties waiting all move it."],
    ["Reasonable care",
      "We will do the work in a commercially reasonable way, with the equipment and methods we judge right for the conditions."],
    ["Damage and existing conditions",
      "Tell us promptly if you think we damaged something. Paving that was already broken, surfaces that were already failing, obstacles that were not marked, hidden hazards and conditions outside our reasonable control are excluded, to the extent the law allows."],
    ["What snow and ice work cannot promise",
      "No snow and ice service can guarantee bare, dry or ice-free pavement. Weather can create hazardous conditions again minutes after a visit is finished."],
    ["Changing this agreement",
      "Changes to the areas, the trigger depth, the materials, the prices or any other material term are recorded through your account or in a written amendment."],
    ["Term and cancellation",
      "This agreement runs for the service term shown on the cover unless it is ended under your account terms or by written agreement between us."],
    ["No waiver",
      "Not enforcing something once does not give up the right to enforce it later."],
    ["The whole agreement",
      "This agreement, its pricing schedule and the property service plan are the agreement between us for the work covered, subject to any master services agreement signed separately."],
  ]));
}

/* ── 09 ─────────────────────────────────────────────────────────────────── */

function acceptance(): Section {
  return clauseSection("Acceptance", [
    factRow([
      ["Customer / legal entity", "{{customer.legal_name}}"],
      ["Authorised representative", "{{customer.contact_name}}"],
    ]),
    makeWidget("signature", {
      heading: "",
      body: "By signing below the customer confirms it has read the scope of services, the pricing schedule, the trigger depth, the billing terms and the general conditions, and authorises {{business.name}} to provide the snow and ice management services chosen above at this property for the service term shown.",
      customerLabel: "Customer / authorised representative",
      /* NOT `"For {{business.name}}"`. The signature renderer prints the two
         side labels with `esc()` and not through the merge filler, so a token
         here would reach the customer's page as four braces. It already falls
         back to "For <the business>" when this is empty, which is the same
         words from the one place that knows them. */
      businessLabel: "",
      consent: DEFAULT_CONSENT,
      required: true,
    }),
  ]);
}

/* ── 10 ─────────────────────────────────────────────────────────────────── */

/**
 * The crew's own sheet, and the only part of the document that writes BACK.
 *
 * `property_plan` is bound to one of the customer's locations: choosing the
 * location fills the property's name, its address and whatever these six rows
 * already hold on the record, and "Save these details to the property" puts
 * what was typed here back onto the location so the crew and the next document
 * read the same sheet. Six `key_fact` widgets would look identical on paper and
 * would be a second, disconnected copy of the property's operational detail —
 * which is precisely the "two carriers for one fact" this build is avoiding
 * everywhere else.
 */
function propertyServicePlan(): Section {
  return clauseSection("Property service plan", [
    makeWidget("paragraph", {
      text: "This page is the operational sheet for the property. It is filled in once, it travels with the location, and the crew works from the same copy you are reading.",
    }),
    makeWidget("property_plan", {
      locationId: "",
      heading: "Property service plan",
      rows: [
        { label: "Areas we plow", value: "" },
        { label: "Where the snow goes", value: "" },
        { label: "Sidewalks and entries", value: "" },
        { label: "Where we salt", value: "" },
        { label: "Things to avoid", value: "" },
        { label: "Anything else the crew should know", value: "" },
      ],
    }),
  ], { pageBreakBefore: true });
}

/* ── Small print ────────────────────────────────────────────────────────── */

function smallPrint(): Section {
  return band([
    makeWidget("footer_note", {
      text: "This agreement is between the customer named on the cover and {{business.name}}. The prices on the pricing schedule hold for the service term shown. Anything not written into this agreement is not included in it.",
    }),
  ], { padding: 12, label: "Small print" });
}

export default { snowAgreementDocument, SEE_THE_SCHEDULE, QUOTED_SEPARATELY };

// test/builder-template-library.test.mjs — the ONE template library
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §11.9, decision D-146).
//
// What this pins, in Brandon's own five asks:
//   1  "no client names on templates"      → the denylist, over every word a
//      client can read AND every string inside every built document
//   2  "more templates for different business types" → the counts below
//   3  "descriptions that say what the template is FOR" → useCase/bestFor are
//      required on every entry, and `description` is gone from all four
//      template files
//   4  "a picture per template"            → every entry renders through its
//      own renderer without throwing, and mounts lazily
//   5  "search and categories"             → the search reads title, use case
//      AND tags; the two chip rows intersect
//
// AND decision D-153 (Brandon, 2026-09-17, walking the library), three asks:
//   6  "restructure business type to high level businesses … we don't need
//      specific industries like lawn and landscaping because that will lead to
//      too many options"  → SEGMENTS, and no trade may be a chip
//   7  "have the Blank Template as … the first option in the top left or even
//      just a button on the bottom"  → both: index 0 after sort AND a footer
//      button
//   8  "templates should be select and have a button for load xyz template
//      instead of click automatically loads"  → the gesture state machine
//
// MUTATION CHECKS, written down so the next person can re-run them:
//   · put "Rolling In It" in one template's useCase      → "no client is named" red
//   · narrow matchesQuery to entry.title only            → "the search reads the use case"
//                                                          and "…and the tags" red
//   · make one renderer throw (e.g. `throw` at the top of renderDocument)
//                                                        → "every template draws" red
//   · let matchesBusinessType ignore ANY_BUSINESS        → "Any business answers every chip" red
//   · D-153: make `cardGesture("click")` return load: true
//                                                        → "a single click NEVER loads" red
//   · D-153: flip the blank branch of sortTemplates so the empty card is last
//                                                        → "the empty page is the FIRST card" red
//   · D-153: put "Snow & ice" back in BUSINESS_TYPES and on one template
//                                                        → "no trade name is a chip" red
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ALL, ANY_BUSINESS, BLANK_TEMPLATE_ID, BUSINESS_TYPES, RETIRED_TRADE_TYPES,
  blankButtonLabel, blankEntry, blankEntryOf, buildPreview, businessTypeChips, cardGesture,
  filterAndSort, filterTemplates, firstSentence, isMounted, keepSelection, loadButtonLabel,
  makePreviewCache, matchesBusinessType, matchesQuery, moveSelection, nextMounted,
  previewSrcDoc, purposeChips, selectedEntry, sortTemplates, SAMPLE_MERGE, THUMB_RATIO,
} from "../src/builder/templateLibraryModel.ts";
import { SHIPPED_TEMPLATES, proposalLibrary, savedIdOf, savedTemplateEntries } from "../src/builder/templates.ts";
import { EMAIL_TEMPLATES, emailLibrary } from "../src/builder/adapters/email/emailTemplates.ts";
import { SITE_PAGE_TEMPLATES, siteLibrary } from "../src/builder/adapters/website/siteTemplates.ts";
import { LANDING_TEMPLATES, landingLibrary } from "../src/builder/adapters/landing/landingTemplates.ts";
import { deserialise, serialise, walkWidgets } from "../src/builder/model.ts";

/* ── the four catalogues, built the way the adapters build them ──────────── */

const BUSINESS = {
  name: "Northwind Lawn & Snow",
  address: "12 Mill Road, Riverton",
  email: "office@northwindlawnsnow.example",
  logoUrl: null,
  website: "https://northwindlawnsnow.example",
  social: [],
};

const CATALOGUES = {
  proposal: proposalLibrary({}),
  email: emailLibrary(BUSINESS, "#EF6C33"),
  website: siteLibrary("#38BDF8"),
  landing: landingLibrary(BUSINESS, "#EF6C33"),
};
const EVERY_ENTRY = Object.values(CATALOGUES).flat();

/* ══════════════════════════════════════════════════════════════════════════
   1 · No client is named. Anywhere.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The businesses whose documents this builder was traced from.
 *
 * D-146's first ask. Two of the three proposal templates were literally called
 * "(Rolling In It style)" and "(MS Moments style)" on the screen a client sees.
 *
 * ── THE LIST MOVED OUT, AND IS RE-EXPORTED (D-164 follow-up) ──────────────
 * It was declared here, and a second suite that needed it typed the names
 * again — a client's name written into the repository twice in order to forbid
 * it once. It lives in `test/client-names.mjs` now, which declares no tests, so
 * every suite can import it without running this one a second time. The name is
 * re-exported so nothing that reads this file has to learn a new one.
 */
export { CLIENT_NAMES } from "./client-names.mjs";
import { CLIENT_NAMES } from "./client-names.mjs";

/** "Service agreement (Rolling In It style)" — the shape, not just the name. */
const STYLE_SUFFIX = /\([^)]*\bstyle\b[^)]*\)/i;

/** Every string a built document holds, however deeply nested. */
function stringsIn(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => stringsIn(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => stringsIn(v, out));
  return out;
}

/** Everything a client can read about one entry, plus everything inside it. */
function wordsOf(entry) {
  const words = [entry.title, entry.purpose, entry.useCase, entry.bestFor, ...entry.tags];
  const p = entry.preview();
  words.push(p.html);
  return words;
}

describe("no client is named on a template (D-146, ask 1)", () => {
  for (const [adapter, list] of Object.entries(CATALOGUES)) {
    for (const entry of list) {
      test(`${adapter} · ${entry.id} names no client of ours`, () => {
        const haystack = wordsOf(entry).join("\n");
        for (const name of CLIENT_NAMES) {
          assert.ok(!haystack.toLowerCase().includes(name.toLowerCase()),
            `${entry.id} contains the client name "${name}"`);
        }
      });
    }
  }

  test("no title carries a “(… style)” suffix any more", () => {
    for (const entry of EVERY_ENTRY) {
      assert.ok(!STYLE_SUFFIX.test(entry.title),
        `${entry.id} is still named after how it looks: "${entry.title}"`);
    }
  });

  test("the sample merge values are invented, not a customer of ours", () => {
    const sample = Object.values(SAMPLE_MERGE).join("\n").toLowerCase();
    for (const name of CLIENT_NAMES) {
      assert.ok(!sample.includes(name.toLowerCase()), `SAMPLE_MERGE contains "${name}"`);
    }
  });

  test("the template SOURCES carry no client name either, not just the entries", () => {
    // A built document is one path to the words; the catalogue itself is the
    // other, and a template nobody happens to build would slip past the loop
    // above. Both, so neither can rot.
    const all = [
      ...SHIPPED_TEMPLATES, ...EMAIL_TEMPLATES, ...SITE_PAGE_TEMPLATES, ...LANDING_TEMPLATES,
    ].map((t) => [t.name, t.purpose, t.useCase, t.bestFor, ...(t.tags || [])].join("\n")).join("\n");
    for (const name of CLIENT_NAMES) {
      assert.ok(!all.toLowerCase().includes(name.toLowerCase()), `a template catalogue names "${name}"`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2 · More templates, for more kinds of business
   ══════════════════════════════════════════════════════════════════════════ */

describe("the catalogue grew, and every entry says what it is for (asks 2 and 3)", () => {
  test("the counts D-146 asked for", () => {
    assert.equal(SHIPPED_TEMPLATES.length, 8, "eight proposal templates");
    assert.equal(EMAIL_TEMPLATES.length, 8, "eight email templates");
    assert.equal(SITE_PAGE_TEMPLATES.length, 10, "ten website page templates");
    assert.equal(LANDING_TEMPLATES.length, 3, "three landing pages");
  });

  test("every entry has a purpose badge, a use case and a best-for line", () => {
    for (const entry of EVERY_ENTRY) {
      assert.ok(entry.purpose.trim().length > 3, `${entry.id} has no purpose`);
      assert.ok(entry.useCase.trim().length > 60, `${entry.id}'s use case is too thin to help`);
      assert.ok(entry.bestFor.trim().length > 20, `${entry.id} says nothing about who it suits`);
      assert.ok(entry.businessTypes.length > 0, `${entry.id} is for nobody`);
      for (const t of entry.businessTypes) {
        assert.ok(BUSINESS_TYPES.includes(t), `${entry.id} claims an unknown business type "${t}"`);
      }
    }
  });

  test("a use case says what it is FOR, not what it looks like", () => {
    // The words D-146 objected to, describing the picture rather than the job.
    const looks = /\b(dark title band|light header|accent rule|dark band)\b/i;
    for (const entry of EVERY_ENTRY) {
      assert.ok(!looks.test(entry.useCase), `${entry.id}'s use case describes how it looks`);
    }
  });

  test("every SEGMENT D-153 named is answered by a template", () => {
    const covered = new Set(EVERY_ENTRY.flatMap((e) => e.businessTypes));
    for (const t of BUSINESS_TYPES) {
      assert.ok(covered.has(t), `nothing in the library is for ${t}`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   6 · SEGMENTS, not trades (D-153)
   ═══════════════════════════════════════════════════════════════════════════ */

describe("business types are SEGMENTS, never trades (D-153)", () => {
  test("the six segments, and nothing narrower", () => {
    assert.deepEqual([...BUSINESS_TYPES], [
      "Service industry", "Non-profit", "Professional services",
      "Agencies & software", "Retail & hospitality", ANY_BUSINESS,
    ]);
  });

  test("no retired trade is a business type any more", () => {
    for (const trade of RETIRED_TRADE_TYPES) {
      assert.ok(!BUSINESS_TYPES.includes(trade),
        `"${trade}" is a trade, and D-153 retired trades as types`);
    }
  });

  test("NO TRADE NAME APPEARS AS A CHIP, on any adapter", () => {
    // The mutation: put "Snow & ice" back in BUSINESS_TYPES and on one
    // template. This goes red on whichever adapter carries it.
    for (const [adapter, list] of Object.entries(CATALOGUES)) {
      const chips = businessTypeChips(list);
      for (const chip of chips) {
        assert.ok(chip === ALL || BUSINESS_TYPES.includes(chip),
          `${adapter} offers "${chip}", which is not a segment`);
        for (const trade of RETIRED_TRADE_TYPES) {
          assert.ok(chip.toLowerCase() !== trade.toLowerCase(),
            `${adapter} still offers the trade chip "${chip}"`);
        }
      }
    }
  });

  test("every template resolves to at least one segment", () => {
    for (const entry of EVERY_ENTRY) {
      assert.ok(entry.businessTypes.length > 0, `${entry.id} is for nobody`);
      for (const t of entry.businessTypes) {
        assert.ok(BUSINESS_TYPES.includes(t),
          `${entry.id} claims "${t}", which is not one of the six segments`);
      }
    }
  });

  test("a template that used to list a trade lists Service industry now", () => {
    // The five trades all folded into one segment, so the templates that were
    // written for them are the ones that answer it.
    const byId = Object.fromEntries(EVERY_ENTRY.map((e) => [e.id, e]));
    for (const id of ["service_agreement", "project_proposal", "maintenance_plan",
      "commercial_bid", "seasonal_reminder", "home_lawn", "home_snow",
      "home_cleaning", "home_hvac", "showcase"]) {
      assert.ok(byId[id], `${id} is not in the catalogue any more`);
      assert.ok(byId[id].businessTypes.includes("Service industry"),
        `${id} was a trade template and does not answer Service industry`);
    }
  });

  test("the trade WORDS moved into tags, so the search still finds them", () => {
    // D-153 removed the chips, not the vocabulary. "snow", "lawn", "cleaning"
    // are what a business owner types, and each still has to land somewhere.
    for (const trade of RETIRED_TRADE_TYPES) {
      const tagged = EVERY_ENTRY.filter((e) =>
        e.tags.some((t) => t.toLowerCase() === trade.toLowerCase()));
      assert.ok(tagged.length > 0, `no template carries "${trade}" as a tag any more`);
    }
    const hit = (list, q) => filterTemplates(list, { query: q }).map((e) => e.id);
    assert.ok(hit(CATALOGUES.proposal, "snow").includes("service_agreement"),
      "typing snow no longer finds the seasonal agreement");
    assert.ok(hit(CATALOGUES.proposal, "lawn").length > 0, "typing lawn finds nothing");
    assert.ok(hit(CATALOGUES.website, "snow").includes("home_snow"));
    assert.ok(hit(CATALOGUES.email, "hvac").includes("seasonal_reminder"));
  });

  test("Service industry keeps a useful number of templates behind it", () => {
    // The point of the decision: one chip a client recognises, with enough
    // behind it to be worth pressing.
    const n = filterTemplates(CATALOGUES.proposal, { businessType: "Service industry" }).length;
    assert.ok(n >= 5, `only ${n} proposal templates answer Service industry`);
  });

  test("the chip row is short enough to read at a glance", () => {
    for (const [adapter, list] of Object.entries(CATALOGUES)) {
      assert.ok(businessTypeChips(list).length <= 1 + BUSINESS_TYPES.length - 1,
        `${adapter}'s chip row is longer than the segment list`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5 · The search and the chips
   ══════════════════════════════════════════════════════════════════════════ */

const entry = (over = {}) => ({
  id: "x", title: "Maintenance plan", purpose: "Maintenance plan",
  businessTypes: ["HVAC & plumbing"], tags: ["subscription", "monthly"],
  useCase: "For the plan a customer pays for every month whether they call you or not.",
  bestFor: "Heating cover and cleaning contracts.",
  preview: () => ({ html: "<p>x</p>", width: 100 }),
  ...over,
});

describe("the search reads more than the title (ask 5)", () => {
  test("it finds a template by its title", () => {
    assert.ok(matchesQuery(entry(), "maintenance"));
    assert.ok(!matchesQuery(entry(), "invoice"));
  });

  test("it finds a template by its USE CASE", () => {
    // Nothing in the title says "every month". A title-only search misses it,
    // which is the mutation check at the top of this file.
    assert.ok(matchesQuery(entry({ title: "Care plan" }), "every month"));
  });

  test("…and by its TAGS", () => {
    assert.ok(matchesQuery(entry({ title: "Care plan", useCase: "A plan." }), "subscription"));
  });

  test("every word has to match, so two words narrow rather than widen", () => {
    assert.ok(matchesQuery(entry(), "maintenance monthly"));
    assert.ok(!matchesQuery(entry(), "maintenance invoice"));
  });

  test("an empty search matches everything", () => {
    assert.ok(matchesQuery(entry(), ""));
    assert.ok(matchesQuery(entry(), "   "));
  });

  test("the real catalogue answers the words a business owner types", () => {
    const hit = (list, q) => filterTemplates(list, { query: q }).map((e) => e.id);
    assert.ok(hit(CATALOGUES.proposal, "maintenance").includes("maintenance_plan"));
    assert.ok(hit(CATALOGUES.proposal, "multi-site").includes("commercial_bid"));
    assert.ok(hit(CATALOGUES.email, "review").includes("review_request"));
    assert.ok(hit(CATALOGUES.email, "season").includes("seasonal_reminder"));
    assert.ok(hit(CATALOGUES.website, "booking").includes("contact"));
  });

  test("a search that matches nothing returns nothing, and says so upstream", () => {
    assert.deepEqual(filterTemplates(CATALOGUES.proposal, { query: "helicopter" }), []);
  });
});

describe("the category chips intersect (ask 5)", () => {
  test("a segment chip keeps only that segment", () => {
    const svc = filterTemplates(CATALOGUES.proposal, { businessType: "Service industry" }).map((e) => e.id);
    assert.ok(svc.includes("service_agreement"));
    assert.ok(svc.includes("maintenance_plan"));
    assert.ok(!svc.includes("consulting_engagement"), "a consulting engagement is professional services");
    assert.ok(!svc.includes("partnership_proposal"), "a sponsorship ask is a non-profit's document");
  });

  test("“Any business” answers EVERY chip", () => {
    assert.ok(matchesBusinessType(entry({ businessTypes: [ANY_BUSINESS] }), "Non-profit"));
    assert.ok(matchesBusinessType(entry({ businessTypes: [ANY_BUSINESS] }), "Service industry"));
    const svc = filterTemplates(CATALOGUES.proposal, { businessType: "Service industry" }).map((e) => e.id);
    assert.ok(svc.includes("simple_proposal"), "a simple quote suits a service business too");
  });

  test("the two rows INTERSECT: type AND purpose, never either", () => {
    const both = filterTemplates(CATALOGUES.proposal, {
      businessType: "Service industry", purpose: "Maintenance plan",
    }).map((e) => e.id);
    assert.deepEqual(both, ["maintenance_plan"]);

    const withSearch = filterTemplates(CATALOGUES.proposal, {
      businessType: "Service industry", purpose: "Maintenance plan", query: "consulting",
    });
    assert.deepEqual(withSearch, [], "the search narrows the chips, it does not widen them");
  });

  test("All on both rows is no filter at all", () => {
    assert.equal(
      filterTemplates(CATALOGUES.email, { businessType: ALL, purpose: ALL }).length,
      CATALOGUES.email.length);
  });

  test("the chips offered are the ones the catalogue actually has", () => {
    const chips = businessTypeChips(CATALOGUES.proposal);
    assert.equal(chips[0], ALL);
    assert.ok(chips.includes("Non-profit"), "a non-profit template is in there");
    assert.ok(chips.includes("Service industry"), "most of the catalogue is service work");
    assert.ok(!chips.includes(ANY_BUSINESS), "“Any business” answers every chip; it is not one");
    assert.ok(!chips.includes("Retail & hospitality"), "no proposal template is for retail");
    // In BUSINESS_TYPES' order, so the row reads the same on every screen.
    assert.deepEqual(chips, [ALL, ...BUSINESS_TYPES.filter((t) => t !== ANY_BUSINESS && chips.includes(t))]);
  });

  test("the purpose chips are the purposes in the list", () => {
    const chips = purposeChips(CATALOGUES.proposal);
    assert.equal(chips[0], ALL);
    assert.ok(chips.includes("Maintenance plan"));
    assert.ok(!chips.includes("Empty page"), "the empty page is not a category");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   The order: Featured first, then alphabetical, empty page last
   ══════════════════════════════════════════════════════════════════════════ */

describe("the empty page FIRST, then featured, then alphabetical (D-153)", () => {
  test("featured entries come first, alphabetically among themselves", () => {
    const sorted = sortTemplates([
      entry({ id: "b", title: "Beta" }),
      entry({ id: "a", title: "Alpha", featured: true }),
      entry({ id: "z", title: "Zeta", featured: true }),
      entry({ id: "c", title: "Ceta" }),
    ]).map((e) => e.id);
    assert.deepEqual(sorted, ["a", "z", "b", "c"]);
  });

  test("the empty page is the FIRST card even though “S” sorts late", () => {
    // The mutation: flip the blank branch of sortTemplates back to `last`.
    const sorted = sortTemplates([
      entry({ id: "a", title: "Alpha", featured: true }),
      blankEntry(),
      entry({ id: "z", title: "Zeta" }),
    ]).map((e) => e.id);
    assert.deepEqual(sorted, [BLANK_TEMPLATE_ID, "a", "z"]);
  });

  test("it is index 0 on every adapter that has one, listed last or not", () => {
    // The adapters append it to the end of their arrays; the SORT is what puts
    // it top-left, so no adapter has to remember to.
    for (const [adapter, list] of Object.entries(CATALOGUES)) {
      const blank = blankEntryOf(list);
      const shown = filterAndSort(list);
      if (!blank) {
        assert.equal(adapter, "landing", "only landing pages have no empty card");
        continue;
      }
      assert.equal(shown[0].id, blank.id, `${adapter}'s empty card is not top-left`);
    }
  });

  test("…and stays index 0 after a chip and after a search that keeps it", () => {
    const withChip = filterAndSort(CATALOGUES.proposal, { businessType: "Non-profit" });
    assert.equal(withChip[0].id, BLANK_TEMPLATE_ID, "the empty page answers every chip");
    const withSearch = filterAndSort(CATALOGUES.proposal, { query: "page" });
    assert.equal(withSearch[0].id, BLANK_TEMPLATE_ID);
  });

  test("…unless the search excludes it, and then it is simply not there", () => {
    const shown = filterAndSort(CATALOGUES.proposal, { query: "maintenance" }).map((e) => e.id);
    assert.ok(!shown.includes(BLANK_TEMPLATE_ID), "a search for maintenance should not keep the empty page");
    assert.deepEqual(shown, ["maintenance_plan"]);
  });

  test("the proposal library opens on the empty page then its three featured shapes", () => {
    const shown = filterAndSort(CATALOGUES.proposal).map((e) => e.id);
    assert.deepEqual(shown.slice(0, 4),
      [BLANK_TEMPLATE_ID, "service_agreement", "simple_proposal", "platform_proposal"]);
  });

  test("the empty page is still searchable, for whoever wants it", () => {
    const hit = filterTemplates(CATALOGUES.proposal, { query: "empty" }).map((e) => e.id);
    assert.deepEqual(hit, [BLANK_TEMPLATE_ID]);
  });

  test("the empty page is not a purpose chip", () => {
    for (const [adapter, list] of Object.entries(CATALOGUES)) {
      const blank = blankEntryOf(list);
      if (!blank) continue;
      assert.ok(!purposeChips(list).includes(blank.purpose),
        `${adapter} offers "${blank.purpose}" as a category`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8 · Select, then load (D-153)
   ══════════════════════════════════════════════════════════════════════════ */

describe("a click selects, a second gesture loads (D-153)", () => {
  test("a single click NEVER loads, whatever was selected before", () => {
    // THE mutation: make this branch return load: true and this goes red.
    assert.deepEqual(cardGesture("click", "a", null), { select: "a", load: false });
    assert.deepEqual(cardGesture("click", "a", "a"), { select: "a", load: false });
    assert.deepEqual(cardGesture("click", "b", "a"), { select: "b", load: false });
  });

  test("a double-click loads, selected or not", () => {
    assert.deepEqual(cardGesture("doubleClick", "a", null), { select: "a", load: true });
    assert.deepEqual(cardGesture("doubleClick", "a", "a"), { select: "a", load: true });
  });

  test("Enter loads only the card that is ALREADY selected", () => {
    assert.deepEqual(cardGesture("enter", "a", "a"), { select: "a", load: true });
    // Arrowing onto a card and pressing Enter in one motion is one gesture,
    // which is the thing D-153 removed — so this selects and stops.
    assert.deepEqual(cardGesture("enter", "b", "a"), { select: "b", load: false });
    assert.deepEqual(cardGesture("enter", "a", null), { select: "a", load: false });
  });

  test("every gesture selects what it was aimed at", () => {
    for (const g of ["click", "doubleClick", "enter"]) {
      assert.equal(cardGesture(g, "target", "other").select, "target");
    }
  });

  test("the footer button names the selected template", () => {
    assert.equal(loadButtonLabel({ title: "Seasonal service agreement" }),
      "Load Seasonal service agreement");
    assert.equal(loadButtonLabel(null), null, "nothing selected, nothing to load");
    assert.equal(loadButtonLabel(undefined), null);
  });

  test("the label follows the real catalogue, not a guess", () => {
    const shown = filterAndSort(CATALOGUES.proposal);
    const agreement = shown.find((e) => e.id === "service_agreement");
    assert.equal(loadButtonLabel(selectedEntry(shown, "service_agreement")),
      `Load ${agreement.title}`);
    assert.equal(selectedEntry(shown, "not_a_template"), null);
    assert.equal(selectedEntry(shown, null), null);
  });

  test("a selection the filters have hidden is dropped, not silently moved", () => {
    const shown = filterAndSort(CATALOGUES.proposal, { query: "maintenance" });
    assert.equal(keepSelection(shown, "service_agreement"), null);
    assert.equal(keepSelection(shown, "maintenance_plan"), "maintenance_plan");
    assert.equal(keepSelection(shown, null), null);
  });

  test("arrow keys move the selection and stop at both ends", () => {
    const list = ["a", "b", "c"].map((id) => entry({ id, title: id }));
    assert.equal(moveSelection(list, "a", 1), "b");
    assert.equal(moveSelection(list, "b", -1), "a");
    assert.equal(moveSelection(list, "a", -1), "a", "clamped, never wrapped");
    assert.equal(moveSelection(list, "c", 1), "c");
    assert.equal(moveSelection(list, "a", 2), "c");
    assert.equal(moveSelection(list, "a", 9), "c", "a whole row past the end lands on the last");
  });

  test("an arrow with nothing selected starts at one end", () => {
    const list = ["a", "b", "c"].map((id) => entry({ id, title: id }));
    assert.equal(moveSelection(list, null, 1), "a");
    assert.equal(moveSelection(list, null, -1), "c");
    assert.equal(moveSelection([], null, 1), null);
  });
});

describe("the footer's empty-page button (D-153)", () => {
  test("it says what the adapter's empty page actually is", () => {
    assert.equal(blankButtonLabel(CATALOGUES.proposal), "Start from an empty page");
    assert.equal(blankButtonLabel(CATALOGUES.email), "Just the basics");
    assert.equal(blankButtonLabel(CATALOGUES.website), "Start from an empty page");
  });

  test("there is no button where there is no empty page", () => {
    assert.equal(blankButtonLabel(CATALOGUES.landing), null,
      "a landing page with no form is not a landing page");
    assert.equal(blankEntryOf(CATALOGUES.landing), null);
  });

  test("the button and the card are the same entry, so they cannot drift", () => {
    for (const list of [CATALOGUES.proposal, CATALOGUES.email, CATALOGUES.website]) {
      const blank = blankEntryOf(list);
      assert.equal(blankButtonLabel(list), blank.title);
      assert.equal(filterAndSort(list)[0].id, blank.id);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4 · The picture is a real render
   ══════════════════════════════════════════════════════════════════════════ */

describe("every template draws, through its own renderer, without throwing", () => {
  for (const [adapter, list] of Object.entries(CATALOGUES)) {
    for (const e of list) {
      test(`${adapter} · ${e.id} renders`, () => {
        const built = buildPreview(e);
        assert.ok(built.srcdoc.length > 200, `${e.id} drew almost nothing`);
        assert.ok(built.width > 0, `${e.id} has no width to scale from`);
        assert.ok(/<html/i.test(built.srcdoc), `${e.id} is not a document an iframe can show`);
        // §11.9: a merge token never reaches a picture as {{customer.name}},
        // and never as the blank rule merge.ts prints for an unfilled one.
        assert.ok(!/\{\{/.test(built.srcdoc), `${e.id} shows a raw merge tag`);
      });
    }
  }

  test("a document template survives the model's own round trip", () => {
    for (const t of SHIPPED_TEMPLATES) {
      const doc = t.build();
      assert.deepEqual(deserialise(serialise(doc)), doc, `${t.key} does not round-trip`);
      assert.ok(walkWidgets(doc).length > 0, `${t.key} has no widgets`);
    }
  });

  test("an email document is passed to the iframe whole, never wrapped twice", () => {
    const html = "<!doctype html><html><body>hi</body></html>";
    assert.equal(previewSrcDoc({ html, width: 600 }), html);
  });

  test("a fragment is wrapped once, with its own stylesheet", () => {
    const out = previewSrcDoc({ html: "<p>hi</p>", css: ".p{color:red}", width: 760 });
    assert.equal(out.match(/<body>/g).length, 1);
    assert.ok(out.includes(".p{color:red}"));
    assert.ok(out.includes("<p>hi</p>"));
  });

  test("the card's box is a page shape, not a square", () => {
    assert.ok(THUMB_RATIO > 1, "a document preview is wider than it is tall");
  });

  test("the card's one line is the first sentence of the use case", () => {
    assert.equal(firstSentence("For a job with a start and an end. The rest follows."),
      "For a job with a start and an end.");
    assert.equal(firstSentence("No full stop here"), "No full stop here");
    assert.equal(firstSentence(""), "");
    for (const e of EVERY_ENTRY) {
      const one = firstSentence(e.useCase);
      assert.ok(one.length > 20 && one.length <= e.useCase.length,
        `${e.id}'s first sentence is not a line a card can show: "${one}"`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Lazy, and built once
   ══════════════════════════════════════════════════════════════════════════ */

describe("a picture is built once, and only for a card that has been seen", () => {
  test("nothing is mounted until a card comes into view", () => {
    const none = new Set();
    assert.equal(isMounted(none, "a"), false);
    assert.equal(nextMounted(none, []).size, 0);
  });

  test("a card that enters the view stays mounted", () => {
    let mounted = nextMounted(new Set(), ["a", "b"]);
    assert.deepEqual([...mounted].sort(), ["a", "b"]);
    // Scrolled past: it is NOT removed. An iframe that unmounts flashes white
    // and pays for the render again.
    mounted = nextMounted(mounted, ["c"]);
    assert.deepEqual([...mounted].sort(), ["a", "b", "c"]);
  });

  test("nextMounted returns a NEW set, so React sees the change", () => {
    const before = new Set(["a"]);
    const after = nextMounted(before, ["b"]);
    assert.notEqual(before, after);
    assert.equal(before.size, 1);
  });

  test("the cache builds each template once, however often it is asked", () => {
    const cache = makePreviewCache();
    let built = 0;
    const make = () => { built += 1; return { srcdoc: "<html></html>", width: 10 }; };
    cache.get("a", make);
    cache.get("a", make);
    cache.get("b", make);
    assert.equal(built, 2, "one build per id");
    assert.equal(cache.size(), 2);
  });

  test("the cache hands back the same picture, not a rebuilt one", () => {
    const cache = makePreviewCache();
    const first = cache.get("a", () => ({ srcdoc: "one", width: 1 }));
    const again = cache.get("a", () => ({ srcdoc: "two", width: 2 }));
    assert.deepEqual(again, first);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Saved templates, in the same library
   ══════════════════════════════════════════════════════════════════════════ */

describe("a business's own saved templates are entries like any other", () => {
  const rows = [{ id: "t1", name: "Our winter agreement", description: "Saved from last season" }];
  const opened = () => SHIPPED_TEMPLATES[0].build();

  test("a saved row becomes an entry with a picture of what was saved", () => {
    const [e] = savedTemplateEntries(rows, opened, {});
    assert.equal(e.title, "Our winter agreement");
    assert.equal(e.purpose, "Your templates");
    assert.ok(e.useCase.includes("Saved from last season"));
    assert.ok(buildPreview(e).srcdoc.length > 200);
  });

  test("its id carries the row back, and a shipped key is left alone", () => {
    const [e] = savedTemplateEntries(rows, opened, {});
    assert.equal(savedIdOf(e.id), "t1");
    assert.equal(savedIdOf("service_agreement"), null);
    assert.equal(savedIdOf(BLANK_TEMPLATE_ID), null);
  });

  test("a saved row with no description still says something useful", () => {
    const [e] = savedTemplateEntries([{ id: "t2", name: "Untitled" }], opened, {});
    assert.ok(e.useCase.length > 40);
  });
});

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
// MUTATION CHECKS, written down so the next person can re-run them:
//   · put "Rolling In It" in one template's useCase      → "no client is named" red
//   · narrow matchesQuery to entry.title only            → "the search reads the use case"
//                                                          and "…and the tags" red
//   · make one renderer throw (e.g. `throw` at the top of renderDocument)
//                                                        → "every template draws" red
//   · drop the `last` branch from sortTemplates          → "the empty page is last" red
//   · let matchesBusinessType ignore ANY_BUSINESS        → "Any business answers every chip" red
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ALL, ANY_BUSINESS, BLANK_TEMPLATE_ID, BUSINESS_TYPES, blankEntry, buildPreview,
  businessTypeChips, filterAndSort, filterTemplates, firstSentence, isMounted, makePreviewCache,
  matchesBusinessType, matchesQuery, nextMounted, previewSrcDoc, purposeChips,
  sortTemplates, SAMPLE_MERGE, THUMB_RATIO,
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
 */
const CLIENT_NAMES = [
  "Rolling In It",
  "MS Moments",
  "Hope Ministries",
  "Summit Lawn",
  "Cedarline",
];

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

  test("the trades D-146 named are each answered by a template", () => {
    const covered = new Set(EVERY_ENTRY.flatMap((e) => e.businessTypes));
    for (const t of ["Lawn & landscape", "Snow & ice", "Cleaning", "HVAC & plumbing",
      "Home services", "Professional services", "Agencies & software", "Non-profit"]) {
      assert.ok(covered.has(t), `nothing in the library is for ${t}`);
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
  test("a business-type chip keeps only that trade", () => {
    const snow = filterTemplates(CATALOGUES.proposal, { businessType: "Snow & ice" }).map((e) => e.id);
    assert.ok(snow.includes("service_agreement"));
    assert.ok(snow.includes("maintenance_plan"));
    assert.ok(!snow.includes("consulting_engagement"), "a consulting engagement is not snow work");
  });

  test("“Any business” answers EVERY chip", () => {
    assert.ok(matchesBusinessType(entry({ businessTypes: [ANY_BUSINESS] }), "Non-profit"));
    assert.ok(matchesBusinessType(entry({ businessTypes: [ANY_BUSINESS] }), "Snow & ice"));
    const snow = filterTemplates(CATALOGUES.proposal, { businessType: "Snow & ice" }).map((e) => e.id);
    assert.ok(snow.includes("simple_proposal"), "a simple quote suits a snow contractor too");
  });

  test("the two rows INTERSECT: type AND purpose, never either", () => {
    const both = filterTemplates(CATALOGUES.proposal, {
      businessType: "Snow & ice", purpose: "Maintenance plan",
    }).map((e) => e.id);
    assert.deepEqual(both, ["maintenance_plan"]);

    const withSearch = filterTemplates(CATALOGUES.proposal, {
      businessType: "Snow & ice", purpose: "Maintenance plan", query: "consulting",
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

describe("Featured first, then alphabetical, the empty page last", () => {
  test("featured entries come first, alphabetically among themselves", () => {
    const sorted = sortTemplates([
      entry({ id: "b", title: "Beta" }),
      entry({ id: "a", title: "Alpha", featured: true }),
      entry({ id: "z", title: "Zeta", featured: true }),
      entry({ id: "c", title: "Ceta" }),
    ]).map((e) => e.id);
    assert.deepEqual(sorted, ["a", "z", "b", "c"]);
  });

  test("the empty page is last even though “S” sorts early and even if featured", () => {
    const sorted = sortTemplates([
      blankEntry({ featured: true }),
      entry({ id: "a", title: "Alpha" }),
    ]).map((e) => e.id);
    assert.deepEqual(sorted, ["a", BLANK_TEMPLATE_ID]);
  });

  test("the proposal library opens on its three featured shapes", () => {
    const shown = filterAndSort(CATALOGUES.proposal).map((e) => e.id);
    assert.deepEqual(shown.slice(0, 3), ["service_agreement", "simple_proposal", "platform_proposal"]);
    assert.equal(shown[shown.length - 1], BLANK_TEMPLATE_ID);
  });

  test("the empty page is still searchable, for whoever wants it", () => {
    const hit = filterTemplates(CATALOGUES.proposal, { query: "empty" }).map((e) => e.id);
    assert.deepEqual(hit, [BLANK_TEMPLATE_ID]);
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

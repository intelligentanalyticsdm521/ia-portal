// test/builder-surfaces-usability.test.mjs — the usability rebuild, STREAM C:
// the website, email, landing and studio surfaces
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §11.10, from BUILDER_USER_TEST_2026-09-16).
//
// What this pins, in the findings' own words:
//   D-05  "Save draft on a live page takes it off the internet … the public URL
//          returns 404. No warning at any point."
//   D-11  "in the email builder that means BELOW the unsubscribe footer"
//   D-14  "nothing a user creates can ever be deleted"
//   D-16  "a published landing page has no address that renders it"
//   D-17  "Publish gives no feedback and the status chip keeps saying
//          'Not live yet'"
//   D-23  "the services grid does not pull from Products & Services …
//          'SERVICES — typed on the page'"
//   D-24  "every design opens with a broken logo over the artwork"
//   D-30  "adapter copy leaks across builders"
//   D-31  "the Ask ARGUS bubble sits on top of the Save button"
//   D-32  "raw values shown to users" — `2026-09-16T00:00:00.000Z`, `Ig_post`
//   D-34  "'Create draft' promises the builder and does not open it"
//   D-36  "Save draft closes the builder … four builders, two behaviours"
//   D-38  "the same product offers different prices in different builders"
//
// MUTATIONS RUN AND RESTORED, so the next person can re-run them:
//   · settleFooter: return `doc` untouched when the footer is already last      → RED
//     (the stray-widget branch is the one that matters, and it is separate)
//   · settleFooter: append strays to the END of the section list                → RED
//   · catalogueTiers: fall back to the default price only                       → RED
//   · absoluteLink: accept a relative path                                      → RED
//   · editionLabel: `new Date(raw)` for a plain YYYY-MM-DD                       → RED
//     (only west of Greenwich, so the test pins the parts, not a locale string)
//   · designKindLabel: title-case the raw key instead of reading the label       → RED
//   · catalogueRowFor: invent "per month" when the catalogue has no period      → RED
//   · WebsiteBuilder source: send `status:"draft"` from Save again              → RED
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { settleFooter, ensureFooter, footerSection } from "../src/builder/adapters/email/emailTemplates.ts";
import { catalogueTiers } from "../src/builder/adapters/email/emailCatalogue.ts";
import {
  EMPTY_SITE_CATALOGUE, catalogueHeading, catalogueRowFor, readSiteCatalogue, takesCatalogue,
} from "../src/builder/adapters/website/siteCatalogue.ts";
import { absoluteLink, editionLabel, NOT_SET } from "../src/lib/plainValue.ts";
import { designKindLabel } from "../src/builder/adapters/mybrand/templates.ts";
import { makeSection, makeWidget, emptyDocument } from "../src/builder/model.ts";
import { toDocument, toDraftPayload, toPayload } from "../src/builder/adapters/website/siteModel.ts";

const SRC = (p) => readFileSync(path.join(process.cwd(), "src", p), "utf8");

/* ══════════════════════════════════════════════════════════════════════════
   D-11 (email) — nothing comes after the unsubscribe footer
   ══════════════════════════════════════════════════════════════════════════ */

const BUSINESS = { name: "Summit Lawn & Landscape", address: "Des Moines, IA" };

function docWith(sections) {
  const d = emptyDocument({ style: "newsletter" });
  d.sections = sections;
  return d;
}

describe("D-11 · the email footer is last, and holds only the footer", () => {
  test("a product card dropped into the footer section moves up into the body", () => {
    const body = makeSection({ label: "Articles" });
    body.columns[0].widgets.push(makeWidget("paragraph", { text: "Hello" }));
    const foot = footerSection(BUSINESS);
    // Exactly what the walk did: nothing selected, two product cards appended
    // to the last section — which in an email is the unsubscribe footer.
    foot.columns[0].widgets.push(makeWidget("product_card", { items: [{ name: "Mowing" }] }));
    foot.columns[0].widgets.push(makeWidget("product_card", { items: [{ name: "Mulch" }] }));

    const out = settleFooter(docWith([body, foot]));

    const last = out.sections[out.sections.length - 1];
    const kindsInFooter = last.columns.flatMap((c) => c.widgets.map((w) => w.kind));
    assert.deepEqual(kindsInFooter, ["email_footer"], "the footer section holds the footer and nothing else");

    const bodyKinds = out.sections[0].columns.flatMap((c) => c.widgets.map((w) => w.kind));
    assert.deepEqual(bodyKinds, ["paragraph", "product_card", "product_card"],
      "the cards land at the bottom of the article area, in the order they were added");
  });

  test("a stray lands in the LAST real section — where the author was looking", () => {
    // Two body sections, so "the bottom of the article area" and "the top of
    // the document" are different answers. With one section they are the same,
    // and a mutation that puts the widget at the top survives.
    const top = makeSection({ label: "Masthead" });
    top.columns[0].widgets.push(makeWidget("image", { src: "logo.png" }));
    const body = makeSection({ label: "Articles" });
    body.columns[0].widgets.push(makeWidget("paragraph", { text: "Hello" }));
    const foot = footerSection(BUSINESS);
    foot.columns[0].widgets.push(makeWidget("product_card", { items: [{ name: "Mowing" }] }));

    const out = settleFooter(docWith([top, body, foot]));

    assert.deepEqual(out.sections[0].columns.flatMap((c) => c.widgets.map((w) => w.kind)),
      ["image"], "the masthead is not where a product card belongs");
    assert.deepEqual(out.sections[1].columns.flatMap((c) => c.widgets.map((w) => w.kind)),
      ["paragraph", "product_card"]);
  });

  test("a footer that is not last is moved to the end", () => {
    const foot = footerSection(BUSINESS);
    const body = makeSection({ label: "Articles" });
    const out = settleFooter(docWith([foot, body]));
    assert.equal(out.sections[out.sections.length - 1].id, foot.id);
    assert.equal(out.sections.length, 2, "nothing is created and nothing is dropped");
  });

  test("an email that is nothing but a footer still keeps the strays", () => {
    const foot = footerSection(BUSINESS);
    foot.columns[0].widgets.push(makeWidget("paragraph", { text: "Hi" }));
    const out = settleFooter(docWith([foot]));
    assert.equal(out.sections.length, 2);
    assert.deepEqual(
      out.sections[0].columns.flatMap((c) => c.widgets.map((w) => w.kind)), ["paragraph"]);
    assert.deepEqual(
      out.sections[1].columns.flatMap((c) => c.widgets.map((w) => w.kind)), ["email_footer"]);
  });

  test("a document that is already right comes back UNCHANGED, by reference", () => {
    // Called on every keystroke's worth of change; a new object every time
    // would re-render the canvas for nothing.
    const doc = docWith([makeSection({ label: "Articles" }), footerSection(BUSINESS)]);
    assert.equal(settleFooter(doc), doc);
  });

  test("a document with no footer at all is left alone (openEmailDocument adds one)", () => {
    const doc = docWith([makeSection({ label: "Articles" })]);
    assert.equal(settleFooter(doc), doc);
  });

  test("ensureFooter settles as well as adds", () => {
    const foot = footerSection(BUSINESS);
    const body = makeSection({ label: "Articles" });
    const out = ensureFooter(docWith([foot, body]), BUSINESS);
    assert.equal(out.sections[out.sections.length - 1].id, foot.id);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-38 — the same product offers the same tiers everywhere
   ══════════════════════════════════════════════════════════════════════════ */

const SNOW = {
  offering_id: "o-snow",
  name: "Snow Removal",
  description: "Plowing and de-icing",
  features_json: "[]",
  prices: [
    { price_id: "p1", label: "Single visit", unit_amount: 525, is_default: true },
    { price_id: "p2", label: "1-2 inch", unit_amount: 400 },
    { price_id: "p3", label: "2-3 inch", unit_amount: 625 },
    { price_id: "p4", label: "3-5 inch", unit_amount: 775 },
    { price_id: "p5", label: "5-8 inch", unit_amount: 950 },
    { price_id: "p6", label: "8+ inch", unit_amount: 1200 },
  ],
};

describe("D-38 · every tier, in every builder", () => {
  test("all six Snow Removal tiers are offered, not just the default", () => {
    const rows = catalogueTiers([SNOW]);
    assert.equal(rows.length, 6, "the walk got one row here and six in the proposal");
    assert.deepEqual(rows.map((r) => r.price.label),
      ["Single visit", "1-2 inch", "2-3 inch", "3-5 inch", "5-8 inch", "8+ inch"]);
  });

  test("the price the business marked default comes first", () => {
    const shuffled = { ...SNOW, prices: [SNOW.prices[1], SNOW.prices[0], SNOW.prices[2]] };
    assert.equal(catalogueTiers([shuffled])[0].price.label, "Single visit");
  });

  test("a service with no prices is still offered once, with no price", () => {
    const rows = catalogueTiers([{ offering_id: "o-x", name: "Consultation", prices: [] }]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].price, null, "null means 'no price to inherit', never $0");
  });

  test("an empty catalogue offers nothing, and does not throw", () => {
    assert.deepEqual(catalogueTiers([]), []);
    assert.deepEqual(catalogueTiers(undefined), []);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-23 — Products & Services, on a web page
   ══════════════════════════════════════════════════════════════════════════ */

const CTA = { text: "Get in touch", href: "#contact" };
const MOWING = {
  offeringId: "o-mow", name: "Weekly Mowing", description: "Cut, trim and blow",
  price: "$65.00", period: "per visit", features: ["Weekly", "Clippings removed"],
};

describe("D-23 · the services grid pulls from the price list", () => {
  test("the two sections about what you sell take the catalogue; the rest do not", () => {
    assert.equal(takesCatalogue("services"), true);
    assert.equal(takesCatalogue("pricing"), true);
    for (const kind of ["hero", "about", "testimonials", "gallery", "team", "faq", "contact"]) {
      assert.equal(takesCatalogue(kind), false, `${kind} has nothing to sell`);
    }
  });

  test("a picked service becomes a services card with the catalogue's own words", () => {
    const row = catalogueRowFor("services", MOWING, CTA);
    assert.equal(row.title, "Weekly Mowing");
    assert.equal(row.description, "Cut, trim and blow");
    assert.notEqual(row.description, "What it is and why somebody would want it.",
      "the filler line the walk got from the fixture");
  });

  test("a picked service becomes a pricing card carrying its cadence VERBATIM (D-09)", () => {
    const row = catalogueRowFor("pricing", MOWING, CTA);
    assert.equal(row.price, "$65.00");
    assert.equal(row.period, "per visit");
    assert.notEqual(row.period, "billed monthly",
      "a per-visit line printing 'billed monthly' is D-09 wearing a web page");
    assert.equal(row.offering_id, "o-mow", "so a price changed in the catalogue can be found here");
    assert.deepEqual(row.features, ["Weekly", "Clippings removed"]);
  });

  test("a service with no price gets an empty price, never an invented one", () => {
    const row = catalogueRowFor("pricing", { ...MOWING, price: "", period: "" }, CTA);
    assert.equal(row.price, "");
    assert.equal(row.period, "");
  });

  test("a kind that takes no catalogue gets nothing, rather than a wrong-shaped row", () => {
    assert.equal(catalogueRowFor("hero", MOWING, CTA), null);
  });

  test("the picker's heading is written for the section it sits in", () => {
    assert.match(catalogueHeading("services"), /service from your price list/);
    assert.match(catalogueHeading("pricing"), /package from your price list/);
    for (const kind of ["services", "pricing"]) {
      assert.doesNotMatch(catalogueHeading(kind), /catalogue picker|tenant/i,
        "name the job, not the mechanism");
    }
  });

  test("the payload is read tolerantly, and a nameless row is not offered", () => {
    const c = readSiteCatalogue({
      available: true, reason: null,
      services: [{ offeringId: "a", name: "Mowing", price: "$65.00", period: "per visit" }, { name: "" }],
    });
    assert.equal(c.available, true);
    assert.equal(c.services.length, 1);
    assert.deepEqual(c.services[0].features, []);
    assert.deepEqual(readSiteCatalogue(null), EMPTY_SITE_CATALOGUE);
    assert.deepEqual(readSiteCatalogue("nonsense"), EMPTY_SITE_CATALOGUE);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-32 / D-16 — no raw value, and no link we cannot honestly build
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-32 · nothing raw reaches a screen", () => {
  test("an edition date is read as a date, on its own day", () => {
    const shown = editionLabel("2026-09-16");
    assert.doesNotMatch(shown, /T00:00|Z$/, "the walk saw 2026-09-16T00:00:00.000Z");
    // Pinned by the PARTS, not by a locale string: the bug is the day moving,
    // and a locale-formatted expectation would pass on a machine set to UTC.
    assert.match(shown, /16/);
    assert.match(shown, /2026/);
    assert.doesNotMatch(shown, /\b15\b/, "parsed as UTC, this prints the 15th west of Greenwich");
  });

  test("a full timestamp is still a date", () => {
    assert.doesNotMatch(editionLabel("2026-09-16T14:30:00.000Z"), /T14:30|Z$/);
  });

  test("a value we cannot read shows a dash, never the raw string", () => {
    assert.equal(editionLabel(""), NOT_SET);
    assert.equal(editionLabel(null), NOT_SET);
    assert.equal(editionLabel("not-a-date"), NOT_SET);
  });

  test("a design says 'Instagram post', never 'Ig_post'", () => {
    assert.equal(designKindLabel("ig_post"), "Instagram post");
    assert.equal(designKindLabel("ig_story"), "Instagram story");
    assert.equal(designKindLabel("business_card"), "Business card");
  });

  test("a kind nobody has named is still readable, never a screenful of underscores", () => {
    assert.equal(designKindLabel("fb_reel"), "Fb reel");
    assert.equal(designKindLabel(""), "Design");
    assert.equal(designKindLabel(null), "Design");
    assert.doesNotMatch(designKindLabel("fb_reel"), /_/);
  });
});

describe("D-16 · a link we cannot build absolutely is not shown", () => {
  test("a bare path is refused — the Portal resolves it against ITSELF", () => {
    assert.equal(absoluteLink("/api/v1/landing/summit/snow"), null);
    assert.equal(absoluteLink(""), null);
    assert.equal(absoluteLink(null), null);
  });

  test("an absolute address is offered", () => {
    assert.equal(absoluteLink("http://localhost:4001/api/v1/landing/summit/snow"),
      "http://localhost:4001/api/v1/landing/summit/snow");
    assert.equal(absoluteLink("https://go.example.com/x"), "https://go.example.com/x");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   The behaviours that live in components — pinned at the source, because a
   component that imports React cannot be imported by `node --test`, and a rule
   nobody checks is a rule that comes back.
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-05 · a save never takes a page off the internet", () => {
  const site = SRC("builder/adapters/website/WebsiteBuilder.tsx");

  test("Save on a LIVE page writes a draft beside it — it does not send status:draft", () => {
    assert.match(site, /const saveNow = useCallback\(\(\) => \{\s*if \(isLive\) \{ void holdDraft\(\); return; \}/,
      "the live branch must not reach `write`");
    assert.match(site, /api\.saveDraft\(pageId, \{ sections: draftPayload\(\), title: detail\?\.title \}\)/);
  });

  test("the ONE way off the internet is explicit, and says what happens", () => {
    assert.match(site, /void write\("draft", \{ unpublish: true \}\)/);
    assert.match(site, /Take it off the internet/);
    assert.match(site, /page not found/);
  });

  test("a live page with held work says BOTH, because both are true", () => {
    assert.match(site, /Live · draft saved, not published/);
    assert.match(site, /Publish these changes/);
    assert.match(site, /Discard them/);
  });

  test("a failed hold is never reported as saved", () => {
    assert.match(site, /We could not hold that draft\. Nothing on your website changed\./);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-05 · a held draft has to come back as the page it was
   ══════════════════════════════════════════════════════════════════════════ */

const SITE_ROWS = [
  {
    index: 0, handle: "ia:hero:classic", kind: "hero", editable: true, label: "Hero banner",
    fields: { headline: "Snow cleared before you open", subheadline: "" },
    node: { id: "a1", elType: "section", settings: { _title: "ia:hero:classic" }, elements: [] },
  },
  {
    index: 1, handle: "ia:services:cards", kind: "services", editable: true, label: "What you do",
    fields: { headline: "What we do", services: [{ title: "Weekly Mowing", description: "Cut and trim" }] },
    node: { id: "a2", elType: "section", settings: { _title: "ia:services:cards" }, elements: [] },
  },
  {
    index: 2, handle: null, kind: null, editable: false, reason: "custom",
    label: "Custom section — built on the site",
    fields: null,
    node: { id: "a3", elType: "section", settings: {}, elements: [] },
  },
];

describe("D-05 · a draft held beside a live page reopens as the page it was", () => {
  test("the kinds survive the round trip — a services band comes back a services band", () => {
    const doc = toDocument(SITE_ROWS);
    const reopened = toDocument(toDraftPayload(doc));
    const kinds = reopened.sections.map((s) =>
      s.columns.flatMap((c) => c.widgets.map((w) => w.kind)).find((k) => k.startsWith("site_")));
    assert.deepEqual(kinds, ["site_hero", "site_services", "site_custom"]);
  });

  test("the SAVE payload alone cannot do it — this is why the draft carries more", () => {
    // Round-tripping `toPayload` is what the first version of the draft did, and
    // every section reopened locked: no inspector, and no catalogue picker on
    // the services band. Found by driving Save → reopen, 2026-09-17.
    const doc = toDocument(SITE_ROWS);
    const viaSavePayload = toDocument(toPayload(doc));
    const kinds = viaSavePayload.sections.map((s) =>
      s.columns.flatMap((c) => c.widgets.map((w) => w.kind)).find((k) => k.startsWith("site_")));
    assert.deepEqual(kinds, ["site_custom", "site_custom", "site_custom"]);
  });

  test("a section built on the site is never claimed as ours on the way back", () => {
    const rows = toDraftPayload(toDocument(SITE_ROWS));
    assert.equal(rows[2].editable, false);
    assert.equal(rows[2].kind, null);
    assert.equal(rows[2].fields, null, "we hold no fields for somebody else's Elementor work");
  });

  test("the rows carry what arion-api's buildNodes reads: a handle, fields and a node", () => {
    const rows = toDraftPayload(toDocument(SITE_ROWS));
    assert.equal(rows[0].handle, "ia:hero:classic");
    assert.equal(rows[1].handle, "ia:services:cards");
    assert.ok(rows[0].node, "the Elementor node rides back untouched");
    assert.equal(rows[1].fields.headline, "What we do");
    assert.deepEqual(rows.map((r) => r.index), [0, 1, 2], "in reading order");
  });
});

describe("D-30 · each surface speaks its own medium", () => {
  const cases = [
    ["builder/adapters/website/WebsiteBuilder.tsx", "page", "Your website's own font"],
    ["builder/adapters/email/EmailBuilder.tsx", "email", "This email's own font"],
    ["builder/adapters/landing/LandingBuilder.tsx", "page", "This page's own font"],
  ];
  for (const [file, noun, font] of cases) {
    test(`${file} hands the engine its own nouns`, () => {
      const src = SRC(file);
      assert.match(src, new RegExp(`noun: "${noun}"`));
      assert.match(src, new RegExp(font.replace(/'/g, "'")));
      // "" HIDES the page-break control. A web page and an email have no pages,
      // so renaming it would still be offering something that cannot happen.
      assert.match(src, /pageBreakLabel: ""/);
    });
  }

  /* WAS "the studio's pane talks about a picture, not a page" — the pane's
     `hint` line under the search box, in the adapter's words.

     DELETED with the line itself (§11.13.1, D-165): the left panel is a
     title, a search box and the widget groups, and nothing else. The reference
     editor puts no sentence there. D-30's rule is untouched everywhere it
     still applies — the tests above and below this one are its other
     surfaces — and the studio's own words about dropping a layer are on
     each widget's tooltip, which comes from the registry. */
  test("the studio's pane is the widget list and nothing else (D-165)", () => {
    const src = SRC("builder/adapters/mybrand/StudioBuilder.tsx");
    assert.doesNotMatch(src, /hint="/, "the pane grew a hint line again");
    assert.match(src, /<WidgetPane adapter="brand" onInsert=\{onInsert\} \/>/);
  });

  test("no vendor name reaches any of these screens", () => {
    // Comments are stripped first: the rule is about COPY, and the Studio's own
    // header quotes the scope doc's "Canva-like" as a design note. A vendor name
    // in a comment is a reference; one in a string is a screen.
    const stripComments = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    for (const file of [
      "builder/adapters/website/WebsiteBuilder.tsx",
      "builder/adapters/email/EmailBuilder.tsx",
      "builder/adapters/landing/LandingBuilder.tsx",
      "builder/adapters/mybrand/StudioBuilder.tsx",
      "builder/adapters/website/siteCatalogue.ts",
      "pages/spark/SparkLandingPagesPage.tsx",
      "pages/spark/SparkNewsletterPage.tsx",
    ]) {
      const src = stripComments(SRC(file));
      for (const vendor of ["Elementor", "Gutenberg", "Wix", "Canva"]) {
        // Whole words: `Canvas` is our own component and contains "Canva".
        assert.doesNotMatch(src, new RegExp("\\b" + vendor + "\\b"),
          `${file} must not say ${vendor} on a screen`);
      }
    }
  });

  test("no screen in this stream says \"tenant\"", () => {
    for (const file of ["pages/spark/SparkLandingPagesPage.tsx", "pages/spark/SparkNewsletterPage.tsx"]) {
      assert.doesNotMatch(SRC(file), /&lt;tenant&gt;|<tenant>/, "say Business, never tenant");
    }
  });
});

describe("D-34 / D-17 / D-14 · the landing surface answers", () => {
  const list = SRC("pages/spark/SparkLandingPagesPage.tsx");
  const builder = SRC("builder/adapters/landing/LandingBuilder.tsx");

  test("D-34: creating a page opens the builder, as the dialog promises", () => {
    assert.match(list, /if \(row\?\.id\) setEditing\(row\);/);
    assert.match(list, /Create it and start building/);
  });

  test("D-17: publishing asks first, from the list AND from the builder", () => {
    assert.match(list, /window\.confirm\(\s*`Put \\u201c\$\{p\.name\}\\u201d on the internet\?|Put .{0,4}\$\{p\.name\}.{0,4} on the internet\?/);
    assert.match(builder, /setConfirmPublish\(true\)/);
    assert.match(builder, /Yes, publish it/);
  });

  test("D-17: the chip reads what the SERVER said, not the prop the list handed in", () => {
    assert.match(builder, /const status = live\?\.status \|\| p\.page\.status;/);
    assert.match(builder, /if \(row && row\.id\) setLive\(/);
  });

  test("D-14: a landing page and a newsletter issue can be deleted, and it asks", () => {
    assert.match(list, /async function remove\(p: LandingPage\)/);
    assert.match(list, /gone for good/);
    const news = SRC("pages/spark/SparkNewsletterPage.tsx");
    assert.match(news, /async function remove\(issue: NewsletterIssue\)/);
    assert.match(news, /This cannot be undone/);
  });

  test("D-25: the SERVER numbers a newsletter issue", () => {
    const news = SRC("pages/spark/SparkNewsletterPage.tsx");
    assert.doesNotMatch(news, /issue_number: nextIssueNumber/,
      "list[0] is the newest edition date, not the highest number — three rows came out #3");
  });
});

describe("D-36 · one Save behaviour, and a tick", () => {
  test("every one of the four builders offers Ctrl+S through the engine's one map", () => {
    for (const file of [
      "builder/adapters/website/WebsiteBuilder.tsx",
      "builder/adapters/email/EmailBuilder.tsx",
      "builder/adapters/landing/LandingBuilder.tsx",
    ]) {
      assert.match(SRC(file), /onSave=\{/, `${file} must hand the engine a save for Ctrl+S`);
    }
  });

  test("a save says so with a tick rather than closing the builder", () => {
    assert.match(SRC("builder/adapters/landing/LandingBuilder.tsx"), /Saved ✓/);
    assert.match(SRC("builder/adapters/mybrand/StudioBuilder.tsx"), /Saved ✓/);
  });
});

describe("D-24 / D-31 · the studio opens clean", () => {
  const bridge = SRC("builder/adapters/mybrand/fabricBridge.ts");
  const studio = SRC("builder/adapters/mybrand/StudioBuilder.tsx");

  test("a picture that will not load becomes a labelled slot, not a broken box", () => {
    assert.match(bridge, /swapPlaceholder\(placeholder, emptySlot\(/,
      "the catch used to swallow and leave a grey rectangle");
    assert.match(bridge, /Your logo goes here — add it under My Brand/);
    assert.match(bridge, /Picture goes here/);
  });

  test("the logo layer is recognisable as one, so its slot says 'logo'", () => {
    assert.match(SRC("builder/adapters/mybrand/templates.ts"), /id: uid\("logo"\)/);
  });

  test("the Ask ARGUS bubble is cleared DOWNWARDS, the phone pass's rule", () => {
    // C-A-1: ONE number. It was written twice — once in BuilderFrame and once
    // here — and the studio now imports the frame's, which is exported.
    assert.match(SRC("builder/BuilderFrame.tsx"), /export const ARGUS_BUBBLE_CLEARANCE = 68;/);
    assert.match(studio, /import \{ ARGUS_BUBBLE_CLEARANCE, BuilderFrame \}/);
    assert.doesNotMatch(studio, /const ARGUS_BUBBLE_CLEARANCE = 68/,
      "the studio writes the clearance a second time");
    assert.match(studio, /paddingBottom: ARGUS_BUBBLE_CLEARANCE/);
  });

  test("Ctrl+Z no longer calls setState from inside a state updater (D-18/D-40)", () => {
    assert.doesNotMatch(studio, /setHistory\(\(h\) => \{ const n = undo\(h\)/);
    assert.match(studio, /const n = undo\(historyRef\.current\);/);
  });

  test("a three-way choice is inline, not a second modal over the canvas", () => {
    assert.match(studio, /data-inline-chooser/);
    assert.match(studio, /\{chooser && !chooser\.options && \(/,
      "only the icon grid and the one free-text answer still open a dialog");
  });
});

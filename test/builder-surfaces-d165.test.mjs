// test/builder-surfaces-d165.test.mjs — D-165 §11.13, stream 4's half.
//
// Three promises, and each one is a test rather than a comment:
//
//   1. THE LEFT PANEL IS WIDGETS AND NOTHING ELSE. No adapter of mine puts a
//      group above the widget list any more, and what used to be there has a
//      new home that is named: the page's own settings on the right, or the
//      status beside the button that produced it.
//   2. PAGE SETTINGS ARE WHAT THE RIGHT PANEL SHOWS WHEN NOTHING IS SELECTED,
//      which is Elementor's own rule — looked at in the real editor on
//      2026-09-19 before any of this was written.
//   3. THE STANDARD SET OF §11.13.3 DRAWS on both of my surfaces, email-safe
//      in a mailbox, and Elementor's spelling reaches the kind we store
//      instead of becoming a second widget.
//
// Mutation check (scripts/dev/d165-stream4-mutation-check.mjs): every guard
// here is broken on purpose, seen red, and restored.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { emptyDocument, makeSection, makeWidget } from "../src/builder/model.ts";
import {
  EMAIL_KIND_ALIASES, EMAIL_RENDERED_KINDS, checkEmailSafe, iconGlyph, alertTone,
  makeEmailContext, renderEmailSection, renderEmailText,
} from "../src/builder/adapters/email/emailRender.ts";
import {
  LANDING_KIND_ALIASES, LANDING_RENDERED_KINDS, makeLandingContext, renderLandingSection,
} from "../src/builder/adapters/landing/landingRender.ts";

const SRC = path.join(process.cwd(), "src", "builder", "adapters");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

/** §11.13.3's standard set, as the shared vocabulary spells the kinds. */
const STANDARD_SET = [
  "heading", "paragraph", "image", "button", "divider", "spacer",
  "icon", "list", "icon_box", "image_box", "testimonial", "star_rating",
  "alert", "social_links",
];

/** "Website's list without the menus" — what a hosted page adds on top. */
const LANDING_EXTRAS = [
  "video", "google_maps", "counter", "progress_bar", "tabs", "accordion",
  "toggle", "image_carousel", "gallery", "html", "menu_anchor",
];

const ADAPTERS = [
  ["email/EmailBuilder.tsx", 'data-page-settings="email"'],
  ["website/WebsiteBuilder.tsx", 'data-page-settings="website"'],
  ["landing/LandingBuilder.tsx", 'data-page-settings="landing"'],
];

describe("the left panel is widgets and nothing else (§11.13.1)", () => {
  for (const [file] of ADAPTERS) {
    test(`${file} hands the pane no group of its own`, () => {
      const src = read(file);
      assert.ok(!/\bpaneHeader=/.test(src),
        `${file} still puts something above the widget list; §11.13.1 says the left panel is `
        + "the search box, the groups and the tiles, and nothing else");
    });
  }

  test("the email builder's subject line has left the top bar", () => {
    const src = read("email/EmailBuilder.tsx");
    assert.ok(!/<SubjectBar/.test(src), "the subject bar is still above the canvas");
    assert.ok(/function PageSettings\(/.test(src), "there is no page-settings panel to have moved it to");
  });
});

describe("page settings are the right panel with nothing selected", () => {
  for (const [file, marker] of ADAPTERS) {
    test(`${file} shows them only when nothing is selected`, () => {
      const src = read(file);
      assert.ok(src.includes(marker), `${file} has no page-settings panel`);
      // The panel is handed to `documentExtras`, and the INSPECTOR is what
      // makes it disappear the moment a widget is clicked — the same behaviour
      // Elementor has, where the page's settings are replaced by the element's.
      // A panel shown at all times would be back to a permanent side list,
      // which is exactly what D-165 deletes.
      //
      // The rule lived in three adapters as `documentExtras={selection ? null
      // : …}`, each with its own copy of the selection to do it with. At
      // integration it moved into `Inspector.tsx`, ONCE, so what is asserted
      // here is that the adapter hands its panel over and nothing more.
      assert.match(src, /documentExtras=\{\(/,
        `${file} does not hand its page settings to the inspector`);
    });
  }

  test("ONE rule decides it, and it is the inspector's", () => {
    const src = read("../Inspector.tsx");
    // `documentExtras` is drawn in the no-selection branch and NOWHERE else.
    // MUTATION: put `{p.documentExtras}` back above "Edit <name>" and this
    // goes red — which is the defect it is here for, page settings sitting
    // above a widget's own panel on every click.
    const marker = "{p.documentExtras}";
    assert.equal(src.split(marker).length - 1, 1,
      "the inspector draws documentExtras more than once");
    const at = src.indexOf(marker);
    const branch = src.indexOf('data-inspector="page"');
    const edit = src.indexOf("data-inspector={widget ?");
    assert.ok(branch >= 0 && edit > branch, "the inspector's two branches have moved");
    assert.ok(at > branch && at < edit,
      "page settings are drawn outside the nothing-selected branch");
  });

  test("the email page settings carry the subject, the preview line and the sender", () => {
    const src = read("email/EmailBuilder.tsx");
    for (const words of ["Subject line", "Preview line", "Show it as"]) {
      assert.ok(src.includes(words), `page settings do not offer "${words}"`);
    }
    // The sender is the caller's — a template's "Comes from" — and it arrives
    // through this same panel rather than a second one beside it.
    assert.match(src, /<PageSettings[\s\S]*?\{p\.documentExtras\}[\s\S]*?<\/PageSettings>/,
      "the row's own settings are not inside the page-settings panel");
  });
});

describe("the standard set draws in a mailbox (§11.13.3)", () => {
  const EMAIL_SET = STANDARD_SET;

  test("every standard kind an email carries has a renderer", () => {
    const missing = EMAIL_SET.filter((k) => !EMAIL_RENDERED_KINDS.includes(k));
    assert.deepEqual(missing, [], `no email renderer for: ${missing.join(", ")}`);
  });

  const ctx = () => makeEmailContext(emptyDocument({ style: "newsletter", accent: "#0C4A60" }), {
    mode: "view",
    business: { name: "A business", address: "1 Street", social: [{ label: "Facebook", url: "https://f.test" }] },
    unsubscribeUrl: "https://example.test/u",
  });

  const sectionWith = (kind, props) => {
    const doc = emptyDocument({ style: "newsletter", accent: "#0C4A60" });
    doc.sections = [makeSection({
      id: "s1", label: "Case", padding: 16, layout: 1,
      columns: [{ id: "c1", widgets: [{ ...makeWidget(kind, props), id: "w1" }] }],
    })];
    return doc;
  };

  const PROPS = {
    icon: { icon: "check" },
    icon_box: { icon: "clock", title: "Fast", description: "Within the hour." },
    image_box: { src: "https://cdn.test/a.jpg", alt: "A picture", title: "The crew", description: "Same people." },
    star_rating: { rating: 4.5, scale: 5, title: "Reviews" },
    alert: { type: "warning", title: "Storm watch", text: "Early tomorrow." },
  };

  for (const [kind, props] of Object.entries(PROPS)) {
    test(`${kind} is drawn, and a mail client would accept it`, () => {
      const doc = sectionWith(kind, props);
      const html = renderEmailSection(doc.sections[0], makeEmailContext(doc, { mode: "view", business: { name: "x" }, unsubscribeUrl: "u" }));
      assert.ok(html.trim().length > 0, `${kind} drew nothing`);
      assert.deepEqual(checkEmailSafe(html), [],
        `${kind} produced something a mailbox would render badly`);
      assert.ok(!/display:\s*flex|display:\s*grid/.test(html), `${kind} used flexbox in an email`);
    });
  }

  test("an icon becomes a real character, never the word for one", () => {
    assert.equal(iconGlyph("check"), "✓");
    assert.equal(iconGlyph("fas fa-star"), "★");
    // Not one of ours and plainly a word: a dot, not the word.
    assert.equal(iconGlyph("wombat"), "●");
    // Already a character (what the website templates have always stored).
    assert.equal(iconGlyph("🌿"), "🌿");
    assert.equal(iconGlyph(""), "●");
  });

  test("an alert has Elementor's four types and falls back to information", () => {
    assert.equal(alertTone("danger").edge, "#EF4444");
    assert.equal(alertTone("nonsense"), alertTone("info"));
  });

  test("the text part walks the WHOLE tree, not the top of each column", () => {
    // A box holding a heading: before D-165 the text/plain part of this email
    // held the footer and nothing else, which is the bulk shape that costs us
    // the sending quota.
    const doc = emptyDocument({ style: "newsletter", accent: "#0C4A60" });
    const heading = { ...makeWidget("heading", { text: "Inside the box" }), id: "w2" };
    doc.sections = [makeSection({
      id: "s1", label: "Case", padding: 16, layout: 1,
      columns: [{
        id: "c1",
        widgets: [{ ...makeWidget("container", {}), id: "w1", type: "container", children: [heading] }],
      }],
    })];
    const text = renderEmailText(doc, ctx());
    assert.match(text, /INSIDE THE BOX/, "a heading inside a box never reached the text part");
  });
});

describe("the standard set draws on a hosted page", () => {
  test("every standard kind and every page widget has a renderer", () => {
    const missing = [...STANDARD_SET, ...LANDING_EXTRAS].filter((k) => !LANDING_RENDERED_KINDS.includes(k));
    assert.deepEqual(missing, [], `no landing renderer for: ${missing.join(", ")}`);
  });

  const draw = (kind, props) => {
    const doc = emptyDocument({ style: "landing", accent: "#0C4A60" });
    doc.sections = [makeSection({
      id: "s1", label: "Case", padding: 16, layout: 1,
      columns: [{ id: "c1", widgets: [{ ...makeWidget(kind, props), id: "w1" }] }],
    })];
    return renderLandingSection(doc.sections[0], makeLandingContext(doc, { mode: "view", business: { name: "x" } }));
  };

  test("the tabs, the accordion and the carousel need no script", () => {
    const tabs = draw("tabs", { items: [{ title: "One", body: "First" }, { title: "Two", body: "Second" }] });
    assert.match(tabs, /type="radio"/, "the tabs are not radio buttons");
    const acc = draw("accordion", { items: [{ title: "Q", body: "A" }] });
    assert.match(acc, /<details/, "the accordion is not <details>");
    const car = draw("image_carousel", { images: ["https://cdn.test/1.jpg"] });
    assert.match(car, /lp-carousel/, "the carousel drew nothing");
    for (const html of [tabs, acc, car]) {
      assert.ok(!/<script/i.test(html), "a hosted landing page must ship no script");
    }
  });

  test("a map is the address and a link, never somebody else's iframe", () => {
    const html = draw("google_maps", { address: "1200 Prairie Ave" });
    assert.ok(!/<iframe/i.test(html),
      "an embedded map drops a third party's cookies on a visitor the business answers for — "
      + "the same rule the video widget already follows");
    assert.match(html, /1200 Prairie Ave/);
  });
});

describe("Elementor's spelling reaches the kind we store", () => {
  for (const [name, table, rendered] of [
    ["email", EMAIL_KIND_ALIASES, EMAIL_RENDERED_KINDS],
    ["landing", LANDING_KIND_ALIASES, LANDING_RENDERED_KINDS],
  ]) {
    test(`${name}: an alias points at a kind that draws, and never doubles one`, () => {
      for (const [slug, stored] of Object.entries(table)) {
        assert.ok(rendered.includes(stored), `${name}: ${slug} points at ${stored}, which nothing draws`);
        assert.ok(!rendered.includes(slug),
          `${name}: ${slug} is BOTH an alias and a kind — two answers for one widget`);
      }
    });
  }

  test("the two tables agree wherever they overlap", () => {
    for (const [slug, stored] of Object.entries(EMAIL_KIND_ALIASES)) {
      if (LANDING_KIND_ALIASES[slug]) {
        assert.equal(LANDING_KIND_ALIASES[slug], stored,
          `${slug} means ${stored} in a mailbox and ${LANDING_KIND_ALIASES[slug]} on a page`);
      }
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   A SITE BLOCK'S WORDS REACH THE MAILBOX AND THE PAGE (integration 2026-09-19)
   ══════════════════════════════════════════════════════════════════════════ */

describe("a converted address block keeps the words the author typed", () => {
  /* `address_block` stored them as FLAT props; the record widget keeps a
     retyped field under `overrides.<key>` (§11.12 F.2) and the upgrade moves
     them there. `addressFields` is the ONE reader for the surfaces that have
     no record book — this mailbox, this hosted page, and `freezeOnSend` — and
     it reads both. Before it did, a typed address on a document that had been
     opened once mailed a blank.

     MUTATION: take the `overrides` line out of `addressFields` and both of
     these go red. */
  const sec = (props) => ({
    id: "s1", layout: 1, visibility: "customer",
    columns: [{ id: "c1", widgets: [{ id: "w1", kind: "service_location", props }] }],
  });
  const OVERRIDDEN = {
    overrides: { name: "The other yard", address: "88 Second St", site_contact: "Sam Okafor" },
  };

  test("in the mailbox", () => {
    const d = sec(OVERRIDDEN);
    const doc = { v: 2, settings: {}, sections: [d] };
    const html = renderEmailSection(d, makeEmailContext(doc, { business: { name: "Fixture" } }));
    for (const words of ["The other yard", "88 Second St", "Sam Okafor"]) {
      assert.ok(html.includes(words), `"${words}" never reached the mailbox`);
    }
  });

  test("on a hosted page", () => {
    const d = sec(OVERRIDDEN);
    const doc = { v: 2, settings: {}, sections: [d] };
    const html = renderLandingSection(d, makeLandingContext(doc, { business: { name: "Fixture" } }));
    for (const words of ["The other yard", "88 Second St", "Sam Okafor"]) {
      assert.ok(html.includes(words), `"${words}" never reached the page`);
    }
  });

  test("and a CUSTOMER's billing address is read as its address", () => {
    // The other half of the same widget: a typed block becomes a Customer,
    // whose address key is `billing_address`. One reader, both records.
    const d = {
      id: "s1", layout: 1, visibility: "customer",
      columns: [{ id: "c1", widgets: [{ id: "w1", kind: "customer",
        props: { overrides: { name: "Rolling In It", billing_address: "1200 Prairie Ave" } } }] }],
    };
    const doc = { v: 2, settings: {}, sections: [d] };
    const html = renderEmailSection(d, makeEmailContext(doc, { business: { name: "Fixture" } }));
    assert.ok(html.includes("Rolling In It"));
    assert.ok(html.includes("1200 Prairie Ave"), "a customer's billing address was dropped");
  });
});

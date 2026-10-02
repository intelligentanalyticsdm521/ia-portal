// test/email-builder.test.mjs — the EMAIL adapter of the one builder
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §3.4, §7, step 4).
//
// What this pins, in the scope's words and Brandon's:
//   §7  "Newsletter Studio: full widget drag-and-drop … table-based HTML, the
//        email widget subset … footer with unsubscribe"
//   §7  "Campaigns: keep the composer … add one button, Design this in the
//        builder … no second builder"
//   §7  "Landing pages: build it on the same canvas with the web widget set;
//        publish to our hosted address, and offer copy embed code"
//   Q2  "same canvas, new interface, RESTRICTED widget set"
//
// ── THE MUTATIONS, WRITTEN DOWN SO THE NEXT PERSON CAN RE-RUN THEM ────────
// Every one of these was run on 2026-09-16 and every one went red.
//
//   1. emailRender.emButton → emit `display:flex` on the wrapper
//        → "no mail client is asked to lay out a flex box" RED
//   2. emailRender.renderEmailDocument → raise the shell to max-width:720px
//        → "nothing is wider than 600px" RED
//   3. emailRender.renderEmailDocument → drop the `fallbackFooter` branch
//        → "an email cannot go out without the footer" RED
//   4. model.removeWidget → delete the `isLocked` early return
//        → "the author cannot remove the footer" RED
//   5. model.removeSection → delete the locked check
//        → "deleting the footer's section is refused too" RED
//   6. emailRender.altTextFor → return "" when there is no explicit alt
//        → "every picture says what it is" RED
//   7. merge.TOKEN_RE → put back [a-zA-Z0-9_.]+ (no spaces)
//        → "{{first name}} resolves" RED (15 golden cases red with it)
//   8. emailRender.inlineSafe → allow any href, not just http/https/mailto
//        → "a javascript: link never survives" RED
//   9. landingRender.embedSnippet → drop the <iframe>
//        → "the snippet loads the hosted page" RED
//  10. emailDoc.upgradeEmailBlocks → drop the `columns` branch
//        → "an old two-column block tree becomes a two-column section" RED
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  addWidget, deserialise, duplicateSection, emptyDocument, makeSection, makeWidget,
  removeSection, removeWidget, resetIds, serialise, isLocked, lockedWidgets,
} from "../src/builder/model.ts";
import { fill, tokensIn, unfilledTokens, lookup } from "../src/builder/merge.ts";
import {
  renderEmailDocument, renderEmailSection, renderEmailText, renderEmailWidget,
  makeEmailContext, checkEmailSafe, assertEmailSafe, altTextFor, contrastInk,
  inlineSafe, hasFooter, EMAIL_DRAWN_KINDS, EMAIL_RENDERED_KINDS, EMAIL_UNRENDERED_KINDS, EMAIL_WIDTH,
} from "../src/builder/adapters/email/emailRender.ts";
import {
  EMAIL_TEMPLATES, EMAIL_PREMADE_SECTIONS, emailTemplateByKey, startingEmail,
  withArticleCount, withProductCount, ensureFooter, applyEmailBrand, footerSection,
} from "../src/builder/adapters/email/emailTemplates.ts";
import {
  upgradeEmailBlocks, isLegacyBlockTree, isBuilderDocument, openEmailDocument,
  toEmailWire, htmlToWidgets, inlineToText, articlesFromPosts,
} from "../src/builder/adapters/email/emailDoc.ts";
import {
  renderLandingPage, renderLandingSection, makeLandingContext, embedSnippet, originOf,
  upgradeLandingBlocks, openLandingDocument, defaultFormFields,
  LANDING_DRAWN_KINDS, LANDING_RENDERED_KINDS, LANDING_UNRENDERED_KINDS, LANDING_KIND_ALIASES,
} from "../src/builder/adapters/landing/landingRender.ts";
import {
  LANDING_TEMPLATES, LANDING_PREMADE_SECTIONS, landingTemplateByKey,
} from "../src/builder/adapters/landing/landingTemplates.ts";
import { widgetsFor, widgetDescription, WIDGETS_BY_KIND } from "../src/builder/registry.ts";
import { isDeletedKind } from "../src/builder/upgrade.ts";
import { repeatKeyFor } from "../src/builder/BuilderShell.tsx";

import { FAMILY_RENDERED_KINDS } from "../src/builder/widgets/families/index.ts";

const FIX = (name) => JSON.parse(readFileSync(path.join(process.cwd(), "test", "fixtures", name), "utf8"));
const EMAIL = FIX("email-render-cases.json");
const LANDING = FIX("landing-render-cases.json");

const BUSINESS = EMAIL.context.business;

function emailDoc(widgets, sectionExtra = {}) {
  resetIds();
  const doc = emptyDocument({ style: "newsletter", accent: "#0C4A60" });
  doc.sections = [makeSection({
    label: "Case", padding: 16, ...sectionExtra,
    columns: [{ id: "c1", widgets }], layout: 1,
  })];
  return doc;
}

const view = (doc, extra = {}) => makeEmailContext(doc, { ...EMAIL.context, ...extra });

/* ══════════════════════════════════════════════════════════════════════════
   1. The golden fixtures — one case per widget
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * EVERY KIND A CASE ACTUALLY DRAWS, the whole tree down (D-156).
 *
 * `case.kind` is a LABEL — "styled", "tree", "document" — and reading coverage
 * off it counted a case that draws four widgets as covering one. Since a tree
 * case draws a box holding cards holding nothing, the only honest answer to
 * "is this kind pinned by a golden" is the kinds in the document itself.
 */
/**
 * EVERY KIND IN A DOCUMENT, INCLUDING THE ONES INSIDE A BOX.
 *
 * A box's children are `w.children` — the node's own field, which is what
 * `serialise` writes and what the fixture holds. This read `w.props.children`,
 * found nothing there, and so reported that the five widgets whose only golden
 * cases are NESTED ones had no coverage at all. It is the same defect shape as
 * V-1: a reader looking for a box's contents somewhere a box does not keep
 * them. `props.children` is still accepted because a pre-D-156 fixture case
 * could carry it.
 */
function kindsIn(doc) {
  const out = [];
  const walk = (ws, depth) => {
    if (depth > 12) return;
    for (const w of ws || []) {
      out.push(w.kind);
      const kids = Array.isArray(w.children) ? w.children
        : Array.isArray(w.props && w.props.children) ? w.props.children : null;
      if (kids) walk(kids, depth + 1);
    }
  };
  for (const s of doc.sections || []) for (const c of s.columns || []) walk(c.widgets, 0);
  return out;
}

describe("the renderer draws exactly what the fixture says", () => {
  test("the fixture covers every widget the email builder offers", () => {
    const covered = new Set(EMAIL.cases.flatMap((c) => kindsIn(c.doc)));
    /* `grid` is a LAYOUT PRESET, never a stored kind — the tile inserts a
       `container`, which forty cases cover — so there is nothing for a golden
       case to hold. Named here rather than left out of the comparison, so a
       widget that really has no case still fails. */
    const NO_STORED_FORM = ["grid"];
    const missing = widgetsFor("email").map((w) => w.kind)
      .filter((k) => !covered.has(k) && !EMAIL_UNRENDERED_KINDS.includes(k) && !NO_STORED_FORM.includes(k));
    assert.deepEqual(missing, [], `no golden case for: ${missing.join(", ")}`);
  });

  for (const c of EMAIL.cases) {
    test(`email · ${c.name}`, () => {
      const doc = deserialise(c.doc);
      const ctx = makeEmailContext(doc, EMAIL.context);
      const html = c.kind === "document"
        ? renderEmailDocument(doc, ctx, { subject: EMAIL.subject, preheader: EMAIL.preheader })
        : renderEmailSection(doc.sections[0], ctx);
      assert.equal(html, c.html);
      assert.equal(renderEmailText(doc, ctx), c.text);
    });
  }

  for (const c of LANDING.cases) {
    test(`landing · ${c.name}`, () => {
      const doc = deserialise(c.doc);
      const ctx = makeLandingContext(doc, LANDING.context);
      const html = c.kind === "document"
        ? renderLandingPage(doc, ctx, LANDING.meta)
        : renderLandingSection(doc.sections[0], ctx);
      assert.equal(html, c.html);
    });
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   2. What a mailbox allows
   ══════════════════════════════════════════════════════════════════════════ */

describe("every golden case is safe to put in a mailbox", () => {
  for (const c of EMAIL.cases) {
    test(`${c.name} passes the sanity check`, () => {
      assert.deepEqual(checkEmailSafe(c.html), []);
    });
  }

  test("no mail client is asked to lay out a flex box or a grid — MUTATION 1", () => {
    for (const c of EMAIL.cases) {
      assert.ok(!/display\s*:\s*(flex|grid)/i.test(c.html), `${c.name} uses flex or grid`);
      assert.ok(!/grid-template/i.test(c.html), `${c.name} uses a grid template`);
    }
    // The checker has to be able to FAIL, or every line above proves nothing.
    const problems = checkEmailSafe(`<div style="display:flex"></div>`);
    assert.equal(problems.length, 1);
    assert.match(problems[0].detail, /Outlook/);
  });

  test("nothing is wider than 600px — MUTATION 2", () => {
    const whole = EMAIL.cases.find((c) => c.name === "a whole email");
    assert.match(whole.html, new RegExp(`max-width:${EMAIL_WIDTH}px`));
    for (const m of whole.html.matchAll(/max-width:\s*(\d+)px/g)) {
      assert.ok(Number(m[1]) <= EMAIL_WIDTH, `${m[1]}px is wider than an email may be`);
    }
    assert.equal(checkEmailSafe(`<td style="max-width:720px"></td>`).length, 1);
  });

  test("every style is inline — there is no stylesheet and no class", () => {
    for (const c of EMAIL.cases) {
      assert.ok(!/<style[\s>]/i.test(c.html), `${c.name} carries a stylesheet Gmail will strip`);
      assert.ok(!/\sclass=/.test(c.html), `${c.name} carries a class with nothing behind it`);
    }
  });

  test("every picture says what it is — MUTATION 6", () => {
    let images = 0;
    for (const c of EMAIL.cases) {
      for (const m of c.html.matchAll(/<img\b[^>]*>/gi)) {
        images += 1;
        assert.match(m[0], /\balt="[^"]+"/, `${c.name} has a picture with no description`);
      }
    }
    // Assert the PRESENCE of the thing we want, not only the absence of a
    // failure: a suite that checked zero images would pass the loop above.
    assert.ok(images >= 5, `only ${images} pictures in the fixtures — the rule is not being exercised`);
    assert.equal(checkEmailSafe(`<img src="x.png">`).length, 1);
  });

  test("a picture with no alt borrows the caption, then the file name", () => {
    assert.equal(altTextFor({ alt: "A cleared lot" }), "A cleared lot");
    assert.equal(altTextFor({ caption: "Tuesday, 5am" }), "Tuesday, 5am");
    assert.equal(altTextFor({ src: "https://x.test/snow-plough_at-work.jpg?v=2" }), "snow plough at work");
    assert.equal(altTextFor({}), "Picture");
  });

  test("the editor's own markers never reach the mailbox", () => {
    const doc = emailDoc([makeWidget("heading", { text: "Hello" })]);
    const sent = renderEmailSection(doc.sections[0], view(doc));
    assert.ok(!sent.includes("data-edit"));
    assert.ok(!sent.includes("data-widget"));
    assert.ok(!sent.includes("data-section"));
    // …and they ARE there while editing, or the canvas could not be typed into.
    const editing = renderEmailSection(doc.sections[0], view(doc, { mode: "edit" }));
    assert.match(editing, /data-edit="text"/);
    assert.match(editing, /data-widget=/);
    assert.match(editing, /data-section=/);
  });

  test("a button's colour is on the cell, not the link — Outlook drops the other one", () => {
    const doc = emailDoc([makeWidget("button", { label: "Go", url: "https://x.test", style: "Solid" })]);
    const html = renderEmailSection(doc.sections[0], view(doc));
    assert.match(html, /<td align="center" style="border-radius:6px;background:#0C4A60;">/);
  });

  test("the label on a button is legible on whatever colour it sits on", () => {
    assert.equal(contrastInk("#0C4A60"), "#FFFFFF");
    assert.equal(contrastInk("#FEC82C"), "#111827");
    assert.equal(contrastInk("#FFFFFF"), "#111827");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. The footer the author cannot delete
   ══════════════════════════════════════════════════════════════════════════ */

describe("the unsubscribe footer is not the author's to remove", () => {
  function docWithFooter() {
    resetIds();
    const doc = emptyDocument({ style: "newsletter" });
    doc.sections = [
      makeSection({ id: "s1", label: "Body", columns: [{ id: "c1", widgets: [makeWidget("paragraph", { text: "Hello" })] }] }),
      footerSection(BUSINESS),
    ];
    return doc;
  }

  test("the footer widget is locked when a template places it", () => {
    const doc = docWithFooter();
    const locked = lockedWidgets(doc);
    assert.equal(locked.length, 1);
    assert.equal(locked[0].kind, "email_footer");
    assert.ok(isLocked(locked[0]));
  });

  test("the author cannot remove it — MUTATION 4", () => {
    const doc = docWithFooter();
    const path0 = { sectionId: doc.sections[1].id, columnIndex: 0, widgetIndex: 0 };
    const after = removeWidget(doc, path0);
    assert.equal(after, doc, "removeWidget must hand the document straight back");
    assert.ok(hasFooter(after));
    // The guard is about LOCKED, not about the kind: an ordinary widget still goes.
    const body = { sectionId: doc.sections[0].id, columnIndex: 0, widgetIndex: 0 };
    assert.equal(removeWidget(doc, body).sections[0].columns[0].widgets.length, 0);
  });

  test("deleting the footer's section is refused too — MUTATION 5", () => {
    const doc = docWithFooter();
    assert.equal(removeSection(doc, doc.sections[1].id), doc);
    assert.equal(removeSection(doc, doc.sections[0].id).sections.length, 1);
  });

  test("duplicating it is refused, because it appears exactly once", () => {
    const doc = docWithFooter();
    assert.equal(duplicateSection(doc, doc.sections[1].id), doc);
    assert.equal(duplicateSection(doc, doc.sections[0].id).sections.length, 3);
  });

  test("the lock survives a save and a re-open", () => {
    const back = deserialise(serialise(docWithFooter()));
    assert.equal(lockedWidgets(back).length, 1);
    assert.equal(removeWidget(back, { sectionId: back.sections[1].id, columnIndex: 0, widgetIndex: 0 }), back);
  });

  test("an email cannot go out without it, even if the model never had one — MUTATION 3", () => {
    const doc = emailDoc([makeWidget("paragraph", { text: "No footer here" })]);
    assert.equal(hasFooter(doc), false);
    const html = renderEmailDocument(doc, view(doc), { subject: "x" });
    assert.match(html, /data-email-footer="1"/);
    assert.match(html, new RegExp(EMAIL.context.unsubscribeUrl.replace(/\//g, "\\/")));
    assert.ok(html.includes(BUSINESS.address), "the physical address is missing");
    // The plain-text half carries both as well.
    const text = renderEmailText(doc, view(doc));
    assert.match(text, /Unsubscribe: https:\/\//);
    assert.ok(text.includes(BUSINESS.address));
  });

  test("the footer carries the two things the law asks for, and says who sent it", () => {
    const c = EMAIL.cases.find((x) => x.name === "footer");
    assert.ok(c.html.includes("1200 Prairie Ave, Marshalltown, IA 50158"), "no physical address");
    assert.match(c.html, /Unsubscribe<\/a>/);
    assert.ok(c.html.includes("Rolling In It"));
  });

  test("an address left blank is shown to the AUTHOR as a gap, never silently skipped", () => {
    const doc = emailDoc([makeWidget("email_footer", { businessName: "X", address: "" }, { locked: true })]);
    const editing = renderEmailSection(doc.sections[0], view(doc, { mode: "edit", business: { name: "X" } }));
    assert.match(editing, /the law asks for it on every marketing email/);
    assert.match(editing, /#B45309/, "the gap is not marked as a warning");
  });

  test("ensureFooter gives one to a document that arrived without", () => {
    const doc = emailDoc([makeWidget("paragraph", { text: "x" })]);
    const fixed = ensureFooter(doc, BUSINESS);
    assert.ok(hasFooter(fixed));
    assert.equal(lockedWidgets(fixed).length, 1);
    // And does NOT add a second one.
    assert.equal(ensureFooter(fixed, BUSINESS), fixed);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. Merge tags
   ══════════════════════════════════════════════════════════════════════════ */

describe("merge tags resolve the way the send path resolves them", () => {
  test("{{first name}} — with a space — resolves — MUTATION 7", () => {
    assert.deepEqual(tokensIn("Hi {{first name}}, from {{business name}}"), ["first name", "business name"]);
    assert.equal(fill("Hi {{first name}}", { "first name": "Dana" }), "Hi Dana");
    assert.equal(fill("Hi {{ first name }}", { "first name": "Dana" }), "Hi Dana");
  });

  test("the lookup order matches renderTemplate.js: exact, then underscored, then lower", () => {
    assert.equal(lookup({ "first name": "A" }, "first name"), "A");
    assert.equal(lookup({ first_name: "B" }, "first name"), "B");
    assert.equal(lookup({ "first name": "C" }, "First Name"), "C");
    assert.equal(lookup({}, "first name"), undefined);
  });

  test("a tag with no value NEVER reaches a recipient as {{…}}", () => {
    const doc = emailDoc([makeWidget("personal_note", { greeting: "Hi {{first name}},", text: "{{nothing}}" })]);
    const sent = renderEmailSection(doc.sections[0], view(doc, { merge: {} }));
    assert.ok(!sent.includes("{{"), "an unfilled tag went out literally");
    // …and the author DOES see it, so they can fix it.
    const editing = renderEmailSection(doc.sections[0], view(doc, { mode: "edit", merge: {} }));
    assert.ok(editing.includes("{{first name}}"));
  });

  test("the builder can name what is still blank before a send", () => {
    const blanks = unfilledTokens(["Hi {{first name}}", "{{business name}} · {{plow_rate}}"], { "first name": "Dana" });
    assert.deepEqual(blanks, ["business name", "plow_rate"]);
  });

  test("a previewed email is filled for a REAL contact, not for a placeholder", () => {
    const doc = emailDoc([makeWidget("personal_note", { greeting: "Hi {{first name}},", text: "" })]);
    const html = renderEmailSection(doc.sections[0], view(doc, { merge: { "first name": "Dana" } }));
    assert.ok(html.includes("Hi Dana,"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. The six inline tags, and nothing else
   ══════════════════════════════════════════════════════════════════════════ */

describe("an imported body keeps its links and loses everything else", () => {
  test("a javascript: link never survives — MUTATION 8", () => {
    const escaped = "&lt;a href=&quot;javascript:alert(1)&quot;&gt;click&lt;/a&gt;";
    const out = inlineSafe(escaped);
    // The words may still be READ — they are text now — but there must be no
    // anchor around them, which is the only thing a reader could click.
    assert.ok(!/<a\b/i.test(out), "a javascript: href came back as a real link");
    assert.ok(out.startsWith("&lt;a"), "it should stay escaped text");
  });

  test("http, https and mailto do survive", () => {
    for (const href of ["https://x.test/a", "http://x.test/a", "mailto:hi@x.test"]) {
      const out = inlineSafe(`&lt;a href=&quot;${href}&quot;&gt;go&lt;/a&gt;`);
      assert.ok(out.includes(`<a href="${href}"`), `${href} was dropped`);
    }
  });

  test("bold, italics and a line break survive; a script tag does not", () => {
    assert.equal(inlineSafe("&lt;strong&gt;a&lt;/strong&gt;"), "<strong>a</strong>");
    assert.equal(inlineSafe("&lt;em&gt;a&lt;/em&gt;"), "<em>a</em>");
    assert.equal(inlineSafe("&lt;br /&gt;"), "<br />");
    assert.equal(inlineSafe("&lt;script&gt;x&lt;/script&gt;"), "&lt;script&gt;x&lt;/script&gt;");
    assert.equal(inlineSafe("&lt;img src=x onerror=y&gt;"), "&lt;img src=x onerror=y&gt;");
  });

  test("a rendered paragraph escapes the author's own angle brackets", () => {
    const doc = emailDoc([makeWidget("paragraph", { text: "5 < 6 & 7 > 6" })]);
    const html = renderEmailSection(doc.sections[0], view(doc));
    assert.ok(html.includes("5 &lt; 6 &amp; 7 &gt; 6"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. Old rows still render
   ══════════════════════════════════════════════════════════════════════════ */

describe("everything that was an email before this builder still opens", () => {
  const legacy = {
    settings: { contentWidth: 600, fontFamily: "Georgia, serif", background: "#F4F4F4" },
    blocks: [
      { type: "heading", level: 1, text: "Autumn update", align: "center" },
      { type: "paragraph", text: "Hello there.", align: "left" },
      {
        type: "columns",
        columns: [
          { blocks: [{ type: "image", src: "https://x.test/a.png", alt: "A lorry", width: 260 }] },
          { blocks: [{ type: "paragraph", html: "<p>Beside it, with a <a href=\"https://x.test\">link</a>.</p>" }] },
        ],
      },
      { type: "button", text: "Book", url: "https://x.test/book", background: "#0C4A60", border_radius: 9999, align: "center" },
      { type: "divider" },
      { type: "spacer", height: 32 },
    ],
  };

  test("a legacy block tree is recognised and a builder document is not", () => {
    assert.equal(isLegacyBlockTree(legacy), true);
    assert.equal(isLegacyBlockTree(JSON.stringify(legacy)), true);
    assert.equal(isBuilderDocument(legacy), false);
    assert.equal(isBuilderDocument(emptyDocument()), true);
  });

  test("an old two-column block tree becomes a two-column section — MUTATION 10", () => {
    const doc = upgradeEmailBlocks(legacy);
    const cols = doc.sections.find((s) => s.layout === 2);
    assert.ok(cols, "the columns block did not become a two-column section");
    assert.equal(cols.columns.length, 2);
    assert.equal(cols.columns[0].widgets[0].kind, "image");
    assert.equal(cols.columns[1].widgets[0].kind, "paragraph");
  });

  test("every other block kind survives, in order", () => {
    const kinds = upgradeEmailBlocks(legacy).sections
      .map((s) => s.columns.flatMap((c) => c.widgets.map((w) => w.kind)).join("+"));
    assert.deepEqual(kinds, ["heading", "paragraph", "image+paragraph", "button", "divider", "spacer"]);
  });

  test("the button keeps its colour, its pill and its full-width flag", () => {
    const btn = upgradeEmailBlocks(legacy).sections.find((s) => s.columns[0].widgets[0].kind === "button")
      .columns[0].widgets[0];
    assert.equal(btn.props.colour, "#0C4A60");
    assert.equal(btn.props.radius, 9999);
    assert.equal(btn.props.align, "Centre");
  });

  test("an upgraded tree renders, and what it renders is safe to send", () => {
    const doc = ensureFooter(upgradeEmailBlocks(legacy), BUSINESS);
    const html = renderEmailDocument(doc, view(doc), { subject: "Autumn update" });
    assertEmailSafe(html);
    assert.ok(html.includes("Autumn update"));
    assert.ok(html.includes("Beside it, with a"));
  });

  test("an old newsletter body that is only HTML comes back as widgets", () => {
    const html = `<h1>Issue 12</h1><p>Read the <a href="https://x.test/p">post</a>.</p>`
      + `<ul><li>One</li><li>Two</li></ul><img src="https://x.test/p.jpg" alt="A plough"><hr>`
      + `<blockquote>They were early.</blockquote>`;
    const kinds = htmlToWidgets(html).map((w) => w.kind);
    assert.deepEqual(kinds, ["heading", "paragraph", "list", "image", "divider", "testimonial"]);
  });

  test("an imported paragraph keeps its link", () => {
    const [p] = htmlToWidgets(`<p>Read the <a href="https://x.test/p">post</a>.</p>`);
    assert.equal(p.props.text, 'Read the <a href="https://x.test/p">post</a>.');
    const doc = emailDoc([p]);
    const rendered = renderEmailSection(doc.sections[0], view(doc));
    assert.ok(rendered.includes('<a href="https://x.test/p"'), "the link did not survive the round trip");
  });

  test("a style-only span is flattened to its words", () => {
    assert.equal(inlineToText(`<span style="color:red">Red</span> and <b>bold</b>`), "Red and <strong>bold</strong>");
  });

  test("plain words with no tags at all are kept", () => {
    const [w] = htmlToWidgets("Just some words.");
    assert.equal(w.kind, "paragraph");
    assert.equal(w.props.text, "Just some words.");
  });

  test("openEmailDocument says out loud when it interpreted something", () => {
    assert.equal(openEmailDocument({ document_json: emptyDocument() }, BUSINESS).note, null);
    assert.match(openEmailDocument({ blocks_json: legacy }, BUSINESS).note, /old block editor/);
    assert.match(openEmailDocument({ content_html: "<p>Hi</p>" }, BUSINESS).note, /old editor/);
  });

  test("whatever it opens has its footer", () => {
    for (const row of [{ document_json: emptyDocument() }, { blocks_json: legacy }, { content_html: "<p>Hi</p>" }, null]) {
      assert.ok(hasFooter(openEmailDocument(row, BUSINESS).doc), `no footer for ${JSON.stringify(row)?.slice(0, 30)}`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. Templates — never a blank canvas
   ══════════════════════════════════════════════════════════════════════════ */

describe("the email builder never opens on a blank page", () => {
  test("the four §7 asks for are here, and D-146’s four more beside them", () => {
    assert.deepEqual(EMAIL_TEMPLATES.map((t) => t.key).sort(), [
      "announcement", "event", "monthly_update", "new_service",
      "promo", "review_request", "seasonal_reminder", "winback",
    ]);
  });

  for (const t of EMAIL_TEMPLATES) {
    test(`${t.key} opens with the header pre-placed and the footer locked`, () => {
      const doc = t.build(BUSINESS, "#0C4A60");
      assert.ok(doc.sections.length >= 3, "a template is more than a blank page");
      const first = doc.sections[0].columns[0].widgets[0];
      assert.ok(["image", "heading"].includes(first.kind), "the masthead is not first");
      assert.ok(hasFooter(doc), `${t.key} has no footer`);
      assert.equal(lockedWidgets(doc).length, 1);
      assert.ok(t.subject.trim(), "a template suggests its subject line");
      // It renders, and what it renders is safe to send.
      assertEmailSafe(renderEmailDocument(doc, view(doc), { subject: t.subject, preheader: t.preheader }));
    });
  }

  test("the masthead shows the business's own logo when there is one", () => {
    const doc = emailTemplateByKey("monthly_update").build(BUSINESS, "#0C4A60");
    const logo = doc.sections[0].columns[0].widgets[0];
    assert.equal(logo.kind, "image");
    assert.equal(logo.props.src, BUSINESS.logoUrl);
    assert.match(String(logo.props.alt), /Rolling In It/);
  });

  test("a business with no logo gets its NAME, never an empty box", () => {
    const doc = emailTemplateByKey("monthly_update").build({ name: "Bare Co" }, "#0C4A60");
    const w = doc.sections[0].columns[0].widgets[0];
    assert.equal(w.kind, "heading");
    assert.equal(w.props.text, "Bare Co");
  });

  test('"Blank" is not blank — it is the smallest email it is legal to send', () => {
    const doc = startingEmail(BUSINESS, "#0C4A60");
    assert.equal(doc.sections.length, 3);
    assert.ok(hasFooter(doc));
  });

  test("how many articles? is asked once, and the template obeys the answer", () => {
    const doc = withArticleCount(emailTemplateByKey("monthly_update").build(BUSINESS, "#0C4A60"), 3);
    const cards = doc.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets))
      .find((w) => w.kind === "article_card");
    assert.equal(cards.props.items.length, 3);
    assert.equal(withArticleCount(doc, 5).sections
      .flatMap((s) => s.columns.flatMap((c) => c.widgets))
      .find((w) => w.kind === "article_card").props.items.length, 5);
  });

  test("changing the count keeps what is already typed", () => {
    let doc = withArticleCount(emailTemplateByKey("monthly_update").build(BUSINESS, "#0C4A60"), 3);
    doc = {
      ...doc,
      sections: doc.sections.map((s) => ({
        ...s,
        columns: s.columns.map((c) => ({
          ...c,
          widgets: c.widgets.map((w) => (w.kind === "article_card"
            ? { ...w, props: { ...w.props, items: w.props.items.map((it, i) => ({ ...it, title: `Story ${i + 1}` })) } }
            : w)),
        })),
      })),
    };
    const grown = withArticleCount(doc, 5);
    const items = grown.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets))
      .find((w) => w.kind === "article_card").props.items;
    assert.equal(items.length, 5);
    assert.equal(items[0].title, "Story 1");
    assert.equal(items[2].title, "Story 3");
    assert.equal(items[4].title, "");
  });

  test("how many products? works the same way", () => {
    const doc = withProductCount(emailTemplateByKey("promo").build(BUSINESS, "#0C4A60"), 3);
    assert.equal(doc.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets))
      .find((w) => w.kind === "product_card").props.items.length, 3);
  });

  test("the guided count reaches the shell's own map, or the inspector cannot adjust it", () => {
    assert.equal(repeatKeyFor("article_card"), "items");
    assert.equal(repeatKeyFor("product_card"), "items");
    assert.ok(WIDGETS_BY_KIND.article_card.count);
    assert.match(WIDGETS_BY_KIND.article_card.count.label, /how many articles/i);
    assert.match(WIDGETS_BY_KIND.product_card.count.label, /how many products/i);
  });

  test("the brand kit PRE-FILLS the colour and never overrules one already chosen", () => {
    assert.equal(applyEmailBrand(emptyDocument(), { accent: "#123456" }).settings.accent, "#123456");
    assert.equal(applyEmailBrand(emptyDocument({ accent: "#ABCDEF" }), { accent: "#123456" }).settings.accent, "#ABCDEF");
  });

  test("every pre-made section is a real section with a sentence a business owner could read", () => {
    for (const p of EMAIL_PREMADE_SECTIONS) {
      assert.ok(p.name && p.description.length >= 25 && p.tags.length, `${p.key} is half-defined`);
      const s = p.build();
      assert.ok(s.columns.some((c) => c.widgets.length), `${p.key} builds an empty section`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8. The restricted widget set
   ══════════════════════════════════════════════════════════════════════════ */

describe("the email builder offers a restricted set, and draws all of it", () => {
  test("every widget it offers is a kind the email renderer draws", () => {
    /* `EMAIL_DRAWN_KINDS`, not `EMAIL_RENDERED_KINDS`: the first is what THIS
       FILE's switch draws and the second is that plus every kind a FAMILY
       draws in a mailbox (b168/override item 5b). Reading the narrow one made
       this go red on Blockquote and HTML, which the f1-words family draws
       correctly — the list was stale, not the renderer. */
    const missing = widgetsFor("email").map((w) => w.kind)
      // B-168 C.1 — A FAMILY WIDGET IS DRAWN BY THE FAMILY, in BOTH halves.
      // emailRender.ts's default branch asks renderFamily before it gives up,
      // and renderEmailText's default branch asks it again for the plain-text
      // twin. Both lines arrived with f6-money and both are checked: the golden
      // case for every family widget offered here carries its own html AND its
      // own text, and checkEmailSafe runs over that html like any other.
      .filter((k) => !EMAIL_RENDERED_KINDS.includes(k) && !EMAIL_UNRENDERED_KINDS.includes(k)
        && !FAMILY_RENDERED_KINDS.includes(k));
    assert.deepEqual(missing, [], `offered but not rendered: ${missing.join(", ")}`);
  });

  test("§7's email set is exactly what is offered", () => {
    // WIDENED 2026-09-17 (catalogue F.1 "Where it may be used"). The five
    // D-156 atoms shipped as proposal-only; the mailbox renderer draws all
    // five — `card`, `catalog_card`, `totals`, `address_block`, `key_fact`,
    // each with its own golden case — so the pane offers them. A newsletter
    // with two product cards was unreachable until it did.
    /* D-165 REPLACED §7's list with §11.13.3's, and cut it to what a MAILBOX
       draws. Elementor's names, the mailbox's own ids:
         **Product Cards** = `product_card` · **IA Posts** = `article_card`
         **Unsubscribe Footer** = `email_footer` · **Social Icons** = `social_links`
       — the shared vocabulary's first rule, an id that exists keeps its id and
       takes the new label.
       GONE: `personal_note` and `countdown` (no Elementor name, not on the IA
       list), `card`, `totals`, `address_block` and `key_fact` (the proposal's,
       §11.13.3), `columns` (a Container set to row).
       ADDED AT INTEGRATION 2026-09-19: Icon, Icon Box, Image Box, Star Rating
       and Alert, because `emailRender.ts` now has a TABLE renderer for each —
       the thing they were waiting on. HELD BACK still, for the same reason and
       no other: Reviews and Book Now.
       ADDED BY B-168 f6-money: `price_table` and `price_list`, which the offer
       file puts on the newsletter. They pass the same bar as the five above —
       a TABLE renderer, no flex, no grid, no class, and a plain-text twin —
       and they meet it from the FAMILY folder rather than from this file, now
       that the default branch asks `renderFamily` in both halves. */
    assert.deepEqual(widgetsFor("email").map((w) => w.kind).sort(), [
    /* ADDED BY B-168 WAVE 2: **Video**. It was in the offer file Brandon
       approved all along — `newsletter.elementor` lists `video`, with the note
       *"video shows as a clickable picture"* — and the tile was simply never
       turned on. The f2-pictures family draws it as a real picture that is a
       real link, which is the only thing a video can be in a mailbox. */
    /* ADDED AT LANDING (B-168): **Blockquote** and **HTML** (f1-words),
       **Price Table** and **Price List** (f6-money) and **Book Now** (f8,
       the IA twin of Button) — every one of them on the offer file’s
       `newsletter` list, and every one with a mailbox renderer in its own
       family folder and a golden case in this file’s fixture. */
      "alert", "article_card", "blockquote", "book_now", "button", "container",
      "divider", "email_footer", "grid", "heading", "html", "ia_reviews", "icon",
      "icon_box", "image", "image_box", "list", "paragraph", "price_list",
      "price_table", "product_card", "social_links", "spacer", "star_rating",
      "testimonial", "video",
    ].sort());
  });

  test("what a mailbox cannot render is not offered", () => {
    // `card` LEFT this list on 2026-09-17: a mailbox draws a typed card
    // (`emCard`, with its own golden cases), so it is offered. `catalog_card`
    // is BACK on it, for a different reason from the others: the mailbox can
    // draw one, but nothing in a send can say which product it is, and a card
    // that can be placed and never filled is worse than one that is not
    // offered. A send's products are the newsletter's own `product_card`.
    // `price_line` stays — it is drawn when a converted document carries one
    // and never offered, because money in an email belongs in a Totals block.
    /* Six of the eleven kinds this list named are DELETED by D-165 —
       `map`, `pricing_table` and the rest — so "not offered" is now "not there
       at all". The rule is the same either way, and it is checked the same way:
       nothing a mailbox cannot draw reaches the email panel. */
    /* Icon, Icon Box, Image Box, Star Rating and Alert LEFT this list at
       integration on 2026-09-19: each has a table renderer in this file now,
       with its own golden case, so the rule "nothing a mailbox cannot draw" is
       satisfied by drawing them rather than by hiding them. Reviews and Book
       Now stay on it until they have one too. */
    /* `video` LEFT this list in B-168 wave 2, and for the rule's own reason
       rather than against it: the offer file gives the newsletter Video, and
       the family now draws it as a picture that is a link. No mail client
       plays a video and none is asked to. */
    /* **Book Now** LEFT this list at landing: family f8 wrote its mailbox
       renderer (`emailBookNow`), so the rule is satisfied by drawing it, the
       way Icon and Alert were. Elementor’s own **Reviews** stays — the
       newsletter is offered the IA twin `ia_reviews` instead. */
    for (const kind of ["form", "signature", "price_line", "data_table", "gallery",
      "catalog_card", "reviews"]) {
      const def = WIDGETS_BY_KIND[kind];
      if (!def) continue;
      assert.ok(!def.adapters.includes("email"), `${kind} is offered to the email builder`);
    }
    for (const kind of ["map", "pricing_table", "countdown", "personal_note"]) {
      const def = WIDGETS_BY_KIND[kind];
      assert.ok(!def || def.hidden || !def.adapters.includes("email"), `${kind} is offered to the email builder`);
    }
    // …and the four composites are not "not offered" — they are DELETED
    // (D-156), so there is nothing left to offer.
    for (const kind of ["comparison_cards", "property_block", "key_facts", "priced_line"]) {
      assert.equal(WIDGETS_BY_KIND[kind], undefined, `${kind} is still in the registry`);
    }
  });

  test("every widget button carries a tooltip — SD-010, not optional", () => {
    // N-4: the sentence is per builder, so each builder's own is asserted.
    for (const [adapter, list] of [["email", widgetsFor("email")], ["landing", widgetsFor("landing")]]) {
      for (const w of list) {
        assert.ok(widgetDescription(w, adapter).trim().length >= 25,
          `${w.kind} has no ${adapter} sentence for its tooltip`);
        assert.ok(w.picture.startsWith("data:image/svg+xml,"), `${w.kind} has no picture`);
      }
    }
  });

  test("the landing builder offers §7's web set and draws all of it", () => {
    /* D-165 — §11.13.3: a landing page is *"the website's list without the
       menus"*, which is Elementor's whole free panel plus the IA group. The
       exact list, by NAME and in order, is pinned in
       `test/builder-widget-set.test.mjs`; what this asserts is the thing this
       file is for — that the page renderer draws every one of them. */
    const site = widgetsFor("website").map((w) => w.kind);
    /* D-168 added a third: the offer file lists IA OLIVER Invoice under
       `website.ia` only, because a hosted landing page has no signed-in
       customer to show an invoice to. */
    /* …and the two PAYMENT buttons are website-and-landing BOTH, so they are
       not in here; what IS site-only stays site-only. B-168 f6-money added
       price_table, price_list, paypal_button and stripe_button to both lists,
       which is what the offer file says, so this comparison is unchanged. */
    /* …and at landing the offer file’s `website` list is longer than its
       `landing` list by the site and blog pieces (f7-data-lists) and by four
       more: Login, WordPress Menu, Sidebar and Read More. A hosted landing
       page has no accounts, no theme menu, no sidebar and no rest-of-the-post.
       This list is read out of the offer file, not decided here. */
    const siteOnly = ["ia_mega_menu", "ia_mobile_menu", "ia_oliver_invoice",
      "login", "nav_menu", "sidebar", "read_more", "search", "sitemap",
      "archive_posts", "author_box", "post_comments", "post_info", "post_navigation",
      "theme_site_logo", "theme_site_title", "theme_page_title", "theme_post_title",
      "theme_post_excerpt", "theme_post_featured_image", "theme_archive_title"];
    assert.deepEqual(widgetsFor("landing").map((w) => w.kind),
      site.filter((k) => !siteOnly.includes(k)));
    /* `social_icons` and `basic_gallery` are Elementor's SPELLINGS of
       `social_links` and `gallery`: `LANDING_KIND_ALIASES` resolves them
       before the switch, and the alias table is tested for exactly that in
       builder-surfaces-d165. A slug cannot be both an alias and a rendered
       kind, so the alias table is the third place a kind can be accounted
       for. */
    /* …and B-168 §C.1's TEN FAMILIES are the fourth place a kind is
       accounted for. `landingRender.ts`'s default branch asks `renderFamily`
       before it gives up — the same line `render.ts` has — so a family's
       widget is drawn on a hosted page; it is just not drawn by the switch
       `LANDING_RENDERED_KINDS` describes. */
    const missing = widgetsFor("landing").map((w) => w.kind)

      .filter((k) => !LANDING_DRAWN_KINDS.includes(k)
        && !LANDING_UNRENDERED_KINDS.includes(k)
        && !LANDING_KIND_ALIASES[k]
        && !FAMILY_RENDERED_KINDS.includes(k));
    assert.deepEqual(missing, []);
  });

  test("the proposal builder is untouched by any of this", () => {
    const kinds = widgetsFor("proposal").map((w) => w.kind);
    // priced_line → price_line and property_block → address_block + price_line
    // + totals, both by D-156. The proposal builder still has all of it.
    /* D-165 — `doc_header` is a Container with an Image and a Heading, the
       address block is **Service Location**, and the catalogue picker is
       **Product Line Items**. The proposal still has all of it. */
    /* `clauses` is NOT on this list any more (integration, 2026-09-19): its
       KIND stays and still draws — the snow agreement places it and D-164 pins
       its numbering — but its TILE is hidden, because §11.13.3 names ONE Terms
       door and that is the `terms` picker. Two tiles reading "Terms" in one
       panel is what the section exists to stop. */
    /* D-168 — the Terms tile and the three record blocks are deleted; the
       proposal shows a database fact with **Custom Field** and drops saved
       clauses from the Terms and conditions section template. */
    for (const k of ["totals", "signature", "custom_field", "product_line_items"]) {
      assert.ok(kinds.includes(k), `the proposal builder lost ${k}`);
    }
    for (const k of ["terms", "customer", "service_location"]) {
      assert.equal(kinds.includes(k), false, `${k} is not in the offer, so it is not a tile`);
    }
    /* B-168 LANDED — WHAT KEEPS A STORED ONE DRAWING IS THE UPGRADE, NOT A
       HIDDEN REGISTRY ROW. The two record blocks are converted on the way in
       (`upgrade.ts` DELETED_KINDS → a Container of Custom Fields), so the
       registry is right to have no row for them. `terms` was never a stored
       kind at all — the tile was an ACTION that dropped a Heading and a Text
       Editor, and that action is the Terms and conditions section template
       now. This asserts the door that really exists. */
    for (const k of ["customer", "service_location"]) {
      assert.ok(isDeletedKind({ id: "x", kind: k, props: {} }),
        `a stored ${k} is not converted on open, so it stops drawing`);
    }
    assert.equal(kinds.includes("clauses"), false, "two Terms tiles in one panel");
    assert.ok(WIDGETS_BY_KIND.clauses, "the clauses KIND was deleted, so stored agreements stop drawing");
    /* `social_links` CAME OFF THIS LIST (D-168 item 4). It was here because the
       kind was the mailbox's own Social Icons and a proposal had a different
       widget with the same label; there is one widget now, and the offer file
       gives Social Icons to the proposal builder by name. The other four are
       still email-only shapes and still do not belong on paper. */
    for (const k of ["article_card", "product_card", "email_footer", "hero"]) {
      assert.ok(!kinds.includes(k), `${k} leaked into the proposal builder`);
    }
    assert.ok(kinds.includes("social_links"), "the offer file gives a proposal Social Icons");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   9. What a save writes
   ══════════════════════════════════════════════════════════════════════════ */

describe("a save writes the model and the rendered body together", () => {
  test("one render produces both, so a row can never disagree with itself", () => {
    const doc = ensureFooter(emailTemplateByKey("announcement").build(BUSINESS, "#0C4A60"), BUSINESS);
    const opts = { subject: "Hours are changing", preheader: "From Monday." };
    const wire = toEmailWire(doc, view(doc), opts);
    assert.equal(wire.document_json, doc);
    // "send", not "view" — see the next test for why.
    assert.equal(wire.content_html, renderEmailDocument(doc, view(doc, { mode: "send" }), opts));
    assert.ok(wire.content_text.length > 0, "there is no plain-text half");
    assertEmailSafe(wire.content_html);
  });

  test("the STORED body keeps its tokens, so the list is not all greeted as one person", () => {
    // THE 2026-09-16 WALK DEFECT, in a test. The body is stored once and mailed
    // to many; the server resolves the tokens per recipient. Rendered in "view"
    // mode, the PREVIEW contact's name is baked in and four hundred subscribers
    // are greeted as Dale — which is what came out of the inbox on the walk.
    const doc = emailDoc([makeWidget("personal_note", { greeting: "Hi {{first name}},", text: "" })]);
    const wire = toEmailWire(doc, view(doc, { merge: { "first name": "Dana" } }), { subject: "Hi {{first name}}" });
    assert.ok(wire.content_html.includes("{{first name}}"), "the token was resolved into the stored body");
    assert.ok(!wire.content_html.includes("Dana"), "the preview contact's name was baked into the send");
    assert.ok(wire.content_text.includes("{{first name}}"));
    // And the PREVIEW still shows the real name, or the author is building blind.
    const preview = renderEmailSection(doc.sections[0], view(doc, { merge: { "first name": "Dana" } }));
    assert.ok(preview.includes("Hi Dana,"));
  });

  test("a token with no value still never reaches a customer in a VIEW render", () => {
    const doc = emailDoc([makeWidget("paragraph", { text: "{{nothing}}" })]);
    assert.ok(!renderEmailSection(doc.sections[0], view(doc, { merge: {} })).includes("{{"));
    // …but a SEND render hands it to the server untouched, which is the point.
    assert.ok(renderEmailSection(doc.sections[0], view(doc, { mode: "send", merge: {} })).includes("{{nothing}}"));
  });

  test("the model it writes opens again unchanged", () => {
    const doc = ensureFooter(emailTemplateByKey("promo").build(BUSINESS, "#0C4A60"), BUSINESS);
    assert.equal(serialise(deserialise(serialise(doc))), serialise(doc));
  });

  test("the subject the template suggested reaches the <title> and the preview line", () => {
    const doc = startingEmail(BUSINESS, "#0C4A60");
    const html = renderEmailDocument(doc, view(doc), { subject: "Hello {{first name}}", preheader: "Short." });
    assert.ok(html.includes("<title>Hello {{first name}}</title>"), "the subject is not the title");
    assert.ok(html.includes("Short."), "the preview line is missing");
    assert.match(html, /display:none;max-height:0/, "the preview line is visible in the body");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   10. The website, as a widget source
   ══════════════════════════════════════════════════════════════════════════ */

describe("import from the website fills the article widget", () => {
  test("a WordPress post becomes an article card, tags stripped", () => {
    const [a] = articlesFromPosts([{
      post_id: 7, title: "Season starts", excerpt: "<p>Crews are <b>booked</b>.</p>",
      post_url: "https://site.test/season", published_at: "2026-10-01", image: "https://site.test/s.jpg",
    }]);
    assert.equal(a.title, "Season starts");
    assert.equal(a.excerpt, "Crews are booked.");
    assert.equal(a.url, "https://site.test/season");
    assert.equal(a.image, "https://site.test/s.jpg");
    assert.equal(a.alt, "Season starts", "an imported picture must still say what it is");
  });

  test("a post with no picture leaves alt empty rather than inventing one", () => {
    const [a] = articlesFromPosts([{ post_id: 1, title: "T", post_url: "u" }]);
    assert.equal(a.image, "");
    assert.equal(a.alt, "");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   11. Landing pages
   ══════════════════════════════════════════════════════════════════════════ */

describe("the hosted landing page is built on the same canvas", () => {
  test("the three templates open with a form, because that is what the page is FOR", () => {
    for (const t of LANDING_TEMPLATES) {
      const doc = t.build({ name: "Rolling In It", address: "1200 Prairie Ave" }, "#0C4A60");
      const kinds = doc.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets.map((w) => w.kind)));
      assert.ok(kinds.includes("form"), `${t.key} has no contact form`);
      assert.ok(kinds.includes("hero"), `${t.key} has no headline`);
      assert.ok(doc.sections.length >= 3, `${t.key} is barely a page`);
    }
  });

  test("the footer is pre-filled with the business's own line", () => {
    const doc = landingTemplateByKey("offer").build({ name: "Rolling In It", address: "1200 Prairie Ave", phone: "555-0100" }, "#0C4A60");
    const note = doc.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets)).find((w) => w.kind === "footer_note");
    assert.ok(String(note.props.text).includes("Rolling In It"));
    assert.ok(String(note.props.text).includes("1200 Prairie Ave"));
  });

  test("the form posts where the existing submit endpoint listens", () => {
    const c = LANDING.cases.find((x) => x.name === "form with the default fields");
    assert.ok(c.html.includes(`action="${LANDING.context.formAction}"`));
    for (const field of ["name", "email", "phone", "message"]) {
      assert.match(c.html, new RegExp(`name="${field}"`), `the form lost its ${field} field`);
    }
    assert.ok(c.html.includes('name="p" value="abc123"'), "the postcard code did not ride the form");
    assert.ok(c.html.includes('name="utm_source"'), "the campaign source did not ride the form");
  });

  test("name and email are always asked for; the rest are the author's choice", () => {
    const c = LANDING.cases.find((x) => x.name === "form without the phone");
    assert.ok(!c.html.includes('name="phone"'));
    assert.ok(c.html.includes('name="email"'));
    assert.ok(c.html.includes('name="name"'));
    assert.deepEqual(defaultFormFields(), ["name", "email", "phone", "message"]);
  });

  test("a video is a link, never a third party's player on our page", () => {
    const c = LANDING.cases.find((x) => x.name === "video is a link, not an embed");
    assert.ok(!c.html.includes("<iframe"), "an embed was rendered");
    assert.ok(c.html.includes('rel="noopener noreferrer"'));
  });

  test("the five old block kinds still open, in the order they were in", () => {
    const old = [
      { type: "hero", headline: "H", sub: "S", image: "https://x.test/i.jpg" },
      { type: "text", body: "Words." },
      { type: "bullets", items: ["a", "b"] },
      { type: "cta", label: "Go", href: "#form" },
      { type: "form", heading: "Ask", submitLabel: "Send", phone: true },
    ];
    const doc = upgradeLandingBlocks(old, "#0C4A60");
    assert.deepEqual(doc.sections.map((s) => s.columns[0].widgets[0].kind),
      ["hero", "paragraph", "list", "button", "form"]);
    assert.equal(doc.sections[0].columns[0].widgets[0].props.headline, "H");
    const html = renderLandingPage(doc, makeLandingContext(doc, LANDING.context), LANDING.meta);
    assert.ok(html.includes("<h1"), "an upgraded old page does not render");
    assert.ok(html.includes("Words."));
  });

  test("blocks_json holding a v2 document opens as itself", () => {
    const doc = landingTemplateByKey("offer").build({ name: "X" }, "#0C4A60");
    const back = openLandingDocument(JSON.parse(JSON.stringify(doc)));
    assert.equal(back.sections.length, doc.sections.length);
    assert.equal(back.sections[0].columns[0].widgets[0].kind, "hero");
  });

  test("blocks_json holding the old array still opens", () => {
    const back = openLandingDocument([{ type: "text", body: "Old." }]);
    assert.equal(back.sections[0].columns[0].widgets[0].kind, "paragraph");
  });
});

describe('"Copy embed code" gives a snippet that loads the page', () => {
  const url = "https://api.example.test/api/v1/landing/biz-1/summer";

  test("the snippet loads the hosted page — MUTATION 9", () => {
    const snippet = embedSnippet(url, { title: "Summer promo" });
    assert.match(snippet, /<iframe/);
    assert.ok(snippet.includes(`src="${url}"`), "the snippet does not point at the page");
    assert.match(snippet, /title="Summer promo"/);
    assert.match(snippet, /min-height:900px/);
    assert.match(snippet, /loading="lazy"/);
  });

  test("it listens only to the page's own origin", () => {
    const snippet = embedSnippet(url);
    assert.ok(snippet.includes(JSON.stringify("https://api.example.test")));
    assert.match(snippet, /if \(e\.origin !== origin/);
    assert.equal(originOf(url), "https://api.example.test");
    assert.equal(originOf("not a url"), "");
  });

  test("the hosted page tells its height, and only its height", () => {
    const doc = landingTemplateByKey("offer").build({ name: "X" }, "#0C4A60");
    const html = renderLandingPage(doc, makeLandingContext(doc, LANDING.context), LANDING.meta);
    assert.match(html, /ia-landing-height/);
    assert.match(html, /if \(window\.parent === window\) return;/);
    assert.ok(!/document\.cookie|localStorage|fetch\(/.test(html), "the page's own script does more than measure itself");
  });

  test("a title with a quote in it cannot break out of the attribute", () => {
    const snippet = embedSnippet(url, { title: 'Sum"mer' });
    assert.ok(snippet.includes("Sum&quot;mer"));
  });
});

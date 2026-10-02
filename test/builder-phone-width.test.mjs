// test/builder-phone-width.test.mjs — the phone pass
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §11 "Phone width", closing §12.7's
// "the builder is a desktop and tablet surface … worth a pass of its own").
//
// Two halves, and the first one is the one that costs money:
//
//   A. WHAT THE CUSTOMER SEES at 390px. A proposal is opened to be SIGNED, and
//      it is signed on a phone. A pricing table that pushes the page sideways
//      is a proposal that does not get signed; an email whose two columns stay
//      two columns is an email that gets deleted.
//   B. THE BUILDER ITSELF below 900px: canvas full width, panes as drawers off
//      a bottom bar, and a Desktop / Tablet / Phone toggle that sets the paper
//      width so the author can SEE half A before they send it.
//
// ── THE MUTATIONS, WRITTEN DOWN SO THE NEXT PERSON CAN RE-RUN THEM ────────
// Each was broken on purpose on 2026-09-16 and restored:
//
//   1. render.ts DOCUMENT_CSS → delete `.bx-table td { display: block }` from
//      the ${STACK_QUERY} block
//        → "a pricing table stacks rather than scrolling sideways" RED
//   2. render.ts DOCUMENT_CSS → change `@container` back to `@media`
//        → "the document stacks on a CONTAINER, not on the viewport" RED
//      and → "every renderer asks the same question at the same width" RED
//   3. render.ts pricingTable → drop `data-label` from the rate cell
//        → "every table cell carries its own column heading" RED
//   4. emailRender.fluidRow → emit `<td style="width:48%">` instead of the
//      inline-block div
//        → "two columns stack on a phone" RED, "checkEmailSafe catches a
//           column pinned to a fraction" RED, and the 30 golden cases RED
//   5. responsive.previewPaperWidth → return `base` for every device
//        → "phone preview is 390 for every adapter" RED
//   6. BuilderFrame → put the panes back unconditionally
//        → "below 900px the panes are drawers, not three columns" RED
//
// Mutation 4 is the one written up in the commit: removing the fluid width
// rule turned four assertions red at once, which is what a shared fixture is
// for, and restoring it turned all four green again.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CONTENT_STACK_MAX, CHROME_DRAWER_MAX, PREVIEW_DEVICES, STACK_QUERY,
  CONTAINER_ROOT_CSS, NARROW_MEDIA_QUERY, previewDevice, previewPaperWidth,
  previewNote, isNarrowViewport,
} from "../src/builder/responsive.ts";
import {
  addWidget, emptyDocument, makeSection, makeWidget, resetIds,
} from "../src/builder/model.ts";
import {
  DOCUMENT_CSS, makeContext, renderDocument, renderSection,
} from "../src/builder/render.ts";
import {
  renderEmailDocument, renderEmailSection, makeEmailContext, checkEmailSafe,
  assertEmailSafe, fluidRow, EMAIL_WIDTH, CONTENT_WIDTH,
} from "../src/builder/adapters/email/emailRender.ts";
import { SITE_CSS } from "../src/builder/adapters/website/siteRender.ts";
import { LANDING_CSS } from "../src/builder/adapters/landing/landingRender.ts";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

/**
 * The rules inside a stylesheet's phone block, parsed.
 *
 * Written after a mutation said the obvious assertion was worthless: removing
 * the whole table-stacking rule left `assert.match(css, /\.bx-table[^{]*td[^}]*display: block/)`
 * GREEN, because `.bx-table td[data-label]::before { … display: block; }` two
 * rules further down satisfies the same regex. A regex over a stylesheet
 * matches text; what the test means to ask is "what does this SELECTOR end up
 * with", which is a question about rules, so parse them.
 */
function phoneRules(css) {
  const at = css.indexOf(STACK_QUERY);
  assert.ok(at >= 0, "this stylesheet has no phone block at all");
  const open = css.indexOf("{", at);
  let depth = 0, end = -1;
  for (let j = open; j < css.length; j++) {
    if (css[j] === "{") depth++;
    else if (css[j] === "}") { depth--; if (depth === 0) { end = j; break; } }
  }
  assert.ok(end > open, "the phone block is not closed");
  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  for (const m of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    const decls = {};
    for (const d of m[2].split(";")) {
      const k = d.indexOf(":");
      if (k > 0) decls[d.slice(0, k).trim()] = d.slice(k + 1).trim();
    }
    rules.push({ selectors, decls });
  }
  return rules;
}

/** What `selector` ends up with for `prop` in the phone block. Last wins. */
function phoneDecl(css, selector, prop) {
  let value = null;
  for (const r of phoneRules(css)) {
    if (r.selectors.includes(selector) && r.decls[prop] !== undefined) value = r.decls[prop];
  }
  return value;
}

/** A one-section document holding the widgets given. */
function doc(widgets, section = {}) {
  resetIds();
  let d = emptyDocument({ style: "plain", accent: "#0C4A60" });
  const s = makeSection({ label: "Case", ...section });
  d = { ...d, sections: [...d.sections, s] };
  for (const w of widgets) d = addWidget(d, s.id, w.col ?? 0, makeWidget(w.kind, w.props));
  return d;
}
const view = (d, over = {}) => makeContext(d, { mode: "view", business: { name: "Rolling In It" }, ...over });

/* ══════════════════════════════════════════════════════════════════════════
   0. ONE breakpoint set — the thing four numbers used to be
   ══════════════════════════════════════════════════════════════════════════ */

describe("one breakpoint set, one preview-width state", () => {
  test("the two numbers are named once and are what the scope says", () => {
    assert.equal(CONTENT_STACK_MAX, 720);
    assert.equal(CHROME_DRAWER_MAX, 900);
    assert.equal(STACK_QUERY, "@container (max-width: 720px)");
    assert.equal(NARROW_MEDIA_QUERY, "(max-width: 899px)");
    assert.equal(CONTAINER_ROOT_CSS, "container-type: inline-size;");
  });

  test("every renderer asks the same question at the same width", () => {
    // The defect this ends: DOCUMENT_CSS asked 640, SITE_CSS asked 720, and
    // the customer's phone was between the two — so a proposal folded and the
    // page behind it did not.
    for (const [name, css] of [["document", DOCUMENT_CSS], ["site", SITE_CSS], ["landing", LANDING_CSS]]) {
      assert.ok(css.includes("@container (max-width: 720px)"),
        `${name} stylesheet must fold at the ONE width, on the container`);
      assert.doesNotMatch(css, /@media\s*\(\s*max-width/,
        `${name} stylesheet must not fold on the VIEWPORT — the canvas preview would never fire it`);
    }
  });

  test("three devices, and phone is 390", () => {
    assert.deepEqual(PREVIEW_DEVICES.map((d) => d.key), ["desktop", "tablet", "phone"]);
    assert.equal(previewDevice("phone").width, 390);
    assert.equal(previewDevice("tablet").width, 768);
    assert.equal(previewDevice("desktop").width, null);
    // Every button says what it does. SD-010 — and, from D-172 round 2, it
    // says the reference's own name with the breakpoint in it, because
    // "tablet" is two widths and hiding on one is not hiding on the other.
    for (const d of PREVIEW_DEVICES) assert.ok(d.title.length > 0, `${d.key} has no tooltip`);
    assert.deepEqual(PREVIEW_DEVICES.map((d) => d.title),
      ["Desktop", "Tablet Portrait (up to 1024px)", "Mobile Portrait (up to 767px)"]);
    for (const clipped of ["Tablet", "Phone"]) {
      assert.ok(!PREVIEW_DEVICES.some((d) => d.label === clipped),
        `the clipped device name is back: ${clipped}`);
    }
  });

  test("an unknown device is desktop, not a crash", () => {
    assert.equal(previewDevice(undefined).key, "desktop");
    assert.equal(previewDevice("watch").key, "desktop");
    assert.equal(previewPaperWidth(null, 780), 780);
  });

  test("phone preview is 390 for every adapter — one function, no forks", () => {
    // proposal 780 · email 600 · landing 760 · website "full"
    for (const base of [780, 600, 760, "full"]) {
      assert.equal(previewPaperWidth("phone", base), 390, `${base} did not narrow to a phone`);
    }
  });

  test("desktop is the adapter's own number, untouched", () => {
    assert.equal(previewPaperWidth("desktop", 780), 780, "a proposal's paper stays Letter-ish");
    assert.equal(previewPaperWidth("desktop", "full"), "full");
    assert.equal(previewPaperWidth("desktop", 600), 600);
  });

  test("a device NEVER widens the paper — an email is 600 on a tablet", () => {
    assert.equal(previewPaperWidth("tablet", 600), 600, "600px is the rule, not a default");
    assert.equal(previewPaperWidth("tablet", 780), 768);
    assert.equal(previewPaperWidth("tablet", "full"), 768);
  });

  test("the note above the page says which device and how wide", () => {
    assert.equal(previewNote("phone", 780), "Mobile Portrait · 390px");
    assert.equal(previewNote("desktop", 780), null, "desktop keeps the adapter's own note");
  });

  test("narrow is a function of ONE number, not a re-typed 899", () => {
    assert.equal(isNarrowViewport(899), true);
    assert.equal(isNarrowViewport(900), false);
    assert.equal(isNarrowViewport(390), true);
    assert.equal(isNarrowViewport(1440), false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   A1. The customer's proposal at 390px
   ══════════════════════════════════════════════════════════════════════════ */

describe("A1 · the document a customer signs on a phone", () => {
  test("the document is a CONTAINER, so the canvas preview is not a lie", () => {
    // A media query asks the viewport. The phone preview is a 390px sheet
    // inside a 1600px window, so a media query there is false forever and the
    // author would be shown the desktop layout under a button marked Phone.
    assert.match(DOCUMENT_CSS, /\.bx-doc\s*\{[^}]*container-type:\s*inline-size/);
  });

  test("two- and three-column sections stack", () => {
    assert.equal(phoneDecl(DOCUMENT_CSS, ".bx-cols-2 .bx-grid", "grid-template-columns"), "1fr");
    assert.equal(phoneDecl(DOCUMENT_CSS, ".bx-cols-3 .bx-grid", "grid-template-columns"), "1fr");
  });

  test("a SIGNATURE block stacks — the customer signs on one line, not half of one", () => {
    assert.equal(phoneDecl(DOCUMENT_CSS, ".bx-sign", "grid-template-columns"), "1fr");
  });

  test("comparison cards, callout panels and key facts stack too", () => {
    assert.equal(phoneDecl(DOCUMENT_CSS, ".bx-cards", "grid-template-columns"), "1fr");
    assert.equal(phoneDecl(DOCUMENT_CSS, ".bx-facts", "grid-template-columns"), "1fr");
    assert.equal(phoneDecl(DOCUMENT_CSS, ".bx-panels-2", "grid-template-columns"), "1fr");
  });

  test("a pricing table stacks rather than scrolling sideways", () => {
    // Asked of the SELECTOR, not of the text: a regex over the stylesheet was
    // satisfied by the `::before` rule further down and stayed green with the
    // whole stacking rule deleted (mutation 1, 2026-09-16).
    assert.equal(phoneDecl(DOCUMENT_CSS, ".bx-table td", "display"), "block",
      "table cells must become blocks; a sideways scrollbar on a price is a proposal that is not signed");
    assert.equal(phoneDecl(DOCUMENT_CSS, ".bx-table tr", "display"), "block");
    assert.equal(phoneDecl(DOCUMENT_CSS, ".bx-table thead", "display"), "none");
    assert.equal(phoneDecl(DOCUMENT_CSS, ".bx-table td[data-label]::before", "content"), "attr(data-label)");
    // And the cell keeps no fixed column width to squeeze into.
    assert.equal(phoneDecl(DOCUMENT_CSS, ".bx-table td", "width"), "auto");
  });

  test("the 40px side padding written INTO the HTML is overridden", () => {
    // renderSection writes `padding:Npx 40px` inline, so a stylesheet can only
    // reach it with !important. 80 of 390 is a fifth of the phone.
    const d = doc([{ kind: "heading", props: { text: "Hi" } }]);
    assert.match(renderSection(d.sections[0], view(d)), /padding:\d+px 40px/);
    assert.equal(phoneDecl(DOCUMENT_CSS, ".bx-sec", "padding-left"), "20px !important");
    assert.equal(phoneDecl(DOCUMENT_CSS, ".bx-sec", "padding-right"), "20px !important");
  });

  test("every table cell carries its own column heading", () => {
    /* The phone stylesheet drops the header row, so the heading has to ride IN
       the cell. Emitted on every surface — the canvas, the customer's page and
       a printed copy are one document, not three.

       This was a `pricing_table`, which D-165 deletes (§11.13.3: "the old
       pricing table -> Product Line Items"). The one thing on a document that
       still has columns is the plain **Table**, so it is the one that has to
       carry them. */
    const d = doc([{
      kind: "data_table",
      props: { columns: ["Service", "Basis", "Customer rate"], rows: [["Plowing", "Per push", "$185"]] },
    }]);
    const html = renderSection(d.sections[0], view(d));
    assert.match(html, /<td data-label="Service"/);
    assert.match(html, /data-label="Basis"/);
    assert.match(html, /data-label="Customer rate"/);
  });

  test("a plain table's columns each carry a label", () => {
    /* This was `property_block`, then `pricing_table`, and both are DELETED
       (D-156, then D-165). What is left with columns on a document is the plain
       **Table**, and it is the one that has to name each column above its value
       when the table stacks at 390px. The money that used to be in a rate card
       is priced lines now, and a priced line is not a table at all. */
    const d = doc([{
      kind: "data_table",
      props: { columns: ["Service", "Basis", "Customer rate"], rows: [["Plowing", "per push", "$185.00"]] },
    }]);
    const html = renderSection(d.sections[0], view(d));
    for (const label of ["Service", "Basis", "Customer rate"]) {
      assert.ok(html.includes(`data-label="${label}"`), `the ${label} column has no label to print above its value`);
    }
  });

  test("a data table borrows its own column names", () => {
    const d = doc([{ kind: "data_table", props: { columns: ["Site", "Acres"], rows: [["North lot", "1.4"]] } }]);
    const html = renderSection(d.sections[0], view(d));
    assert.match(html, /<td data-label="Site"/);
    assert.match(html, /<td data-label="Acres"/);
  });

  test("a wide picture is capped by the page, not by its own inline width", () => {
    // `max-width:900px` inline BEATS the stylesheet, so a big picture used to
    // push the whole document sideways on a phone.
    const d = doc([{ kind: "image", props: { src: "https://x.test/a.png", alt: "The yard", width: 900 } }]);
    /* The style attribute carries more than the width since B-168 wave 2 gave
       Image Elementor's whole Style tab, so this asks for the two declarations
       rather than for the exact attribute. The RULE is unchanged and both
       halves of it are still checked. A stored 900 is still read as pixels —
       `widthCss` in families/f2-pictures/styling.ts is the one place that is
       decided, and it says why. */
    const html = renderSection(d.sections[0], view(d));
    assert.match(html, /width:900px;/);
    assert.match(html, /max-width:100%;/);
    assert.doesNotMatch(html, /max-width:900px/);
  });

  test("the whole document still renders, badges and all", () => {
    const d = doc([{ kind: "heading", props: { text: "Snow & ice" } }], { layout: 2 });
    const html = renderDocument(d, view(d));
    assert.match(html, /class="bx-doc/);
    assert.match(html, /bx-cols-2/);
  });

  test("the customer's page and the revision page both ship the stylesheet", () => {
    for (const rel of ["pages/public/PublicProposalPage.tsx", "pages/public/PublicRevisionPage.tsx"]) {
      assert.match(read(rel), /DOCUMENT_CSS/, `${rel} must carry the renderer's own stylesheet`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   A2. The email under 600px
   ══════════════════════════════════════════════════════════════════════════ */

describe("A2 · the email in a phone's mailbox", () => {
  const EMAIL_CTX = {
    mode: "view",
    merge: {},
    accent: "#0C4A60",
    business: { name: "Rolling In It", address: "1200 Prairie Ave, Marshalltown, IA 50158" },
    unsubscribeUrl: "https://x.test/u",
  };
  const ectx = (d, over = {}) => makeEmailContext(d, { ...EMAIL_CTX, ...over });

  test("the shell is 600 wide and 100% of anything narrower", () => {
    const d = doc([{ kind: "paragraph", props: { text: "Hello." } }]);
    const html = renderEmailDocument(d, ectx(d), { subject: "Hi" });
    assert.match(html, new RegExp(`width="${EMAIL_WIDTH}"`), "the width attribute Outlook reads");
    assert.match(html, new RegExp(`style="width:100%;max-width:${EMAIL_WIDTH}px;`), "fluid under 600");
    assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1" \/>/);
  });

  test("every picture is fluid: width 100%, capped, and never fixed", () => {
    const d = doc([{ kind: "image", props: { src: "https://x.test/a.png", alt: "The yard" } }]);
    const html = renderEmailSection(d.sections[0], ectx(d));
    assert.match(html, /style="display:block;width:100%;max-width:\d+px;height:auto;/);
  });

  test("two columns stack on a phone", () => {
    // THE fluid-hybrid pattern: an inline-block div with width:100% and its
    // own max-width sits beside its neighbour while there is room and wraps —
    // stacks — when there is not. No query, because a mailbox has none.
    const d = doc([
      { kind: "paragraph", col: 0, props: { text: "Left." } },
      { kind: "paragraph", col: 1, props: { text: "Right." } },
    ], { layout: 2 });
    const html = renderEmailSection(d.sections[0], ectx(d));
    assert.match(html, /display:inline-block;width:100%;max-width:276px;vertical-align:top;/);
    assert.equal((html.match(/display:inline-block;width:100%;max-width:276px/g) || []).length, 2);
    assert.doesNotMatch(html, /style="[^"]*width:\s*4\d%/, "a percentage column is a column at every width");
  });

  test("Outlook gets a real table, because Word has no inline-block", () => {
    const d = doc([
      { kind: "paragraph", col: 0, props: { text: "Left." } },
      { kind: "paragraph", col: 1, props: { text: "Right." } },
    ], { layout: 2 });
    const html = renderEmailSection(d.sections[0], ectx(d));
    assert.match(html, /<!--\[if mso\]><table role="presentation"[^>]*><tr><td width="276" valign="top"><!\[endif\]-->/);
    assert.match(html, /<!--\[if mso\]><\/td><\/tr><\/table><!\[endif\]-->/);
    // The ghost table opens and closes the same number of cells.
    assert.equal((html.match(/\[if mso\]><td width=/g) || []).length, 1);
    assert.equal((html.match(/\[if mso\]><\/td><!\[endif\]/g) || []).length, 1);
  });

  test("the whitespace between two inline-blocks is not a visible gap", () => {
    const html = fluidRow([{ max: 276, html: "A" }, { max: 276, html: "B" }]);
    assert.match(html, /align="left" style="font-size:0;line-height:0;"/);
    assert.match(html, /max-width:276px;vertical-align:top;box-sizing:border-box;padding:0 8px;font-size:15px;/);
  });

  test("a row of product cards stacks", () => {
    const d = doc([{
      kind: "product_card",
      props: { items: [{ name: "Seasonal" }, { name: "Per push" }] },
    }]);
    const html = renderEmailSection(d.sections[0], ectx(d));
    assert.match(html, new RegExp(`max-width:${Math.floor(CONTENT_WIDTH / 2)}px`));
    assert.doesNotMatch(html, /style="[^"]*width:\s*50%/);
  });

  test("an article beside its picture stacks under it", () => {
    const d = doc([{
      kind: "article_card",
      props: { items: [{ title: "First snow", excerpt: "…", image: "https://x.test/s.jpg", alt: "Snow" }] },
    }]);
    const html = renderEmailSection(d.sections[0], ectx(d));
    assert.match(html, /max-width:180px;vertical-align:top;/, "the picture column");
    assert.match(html, new RegExp(`max-width:${CONTENT_WIDTH - 180}px;vertical-align:top;`), "the words column");
  });

  test("ONE column is left exactly as it was — no ghost table it has no use for", () => {
    const d = doc([{ kind: "paragraph", props: { text: "Hello." } }]);
    const html = renderEmailSection(d.sections[0], ectx(d));
    assert.match(html, /<td valign="top" style="width:100%;">/);
    assert.doesNotMatch(html, /\[if mso\]/);
  });

  test("checkEmailSafe catches a column pinned to a fraction", () => {
    // The checker the BUILDER runs before a send, not one only the tests run.
    const bad = `<table><tr><td style="width:48%;">left</td><td style="width:48%;">right</td></tr></table>`;
    const problems = checkEmailSafe(bad);
    assert.equal(problems.filter((p) => p.rule === "columns stack").length, 2);
    assert.match(problems.find((p) => p.rule === "columns stack").detail, /48%/);
  });

  test("100% is not a column, so a full-width cell is not flagged", () => {
    assert.deepEqual(checkEmailSafe(`<td style="width:100%;">x</td>`), []);
  });

  test("a real email passes every rule, this one included", () => {
    const d = doc([
      { kind: "paragraph", col: 0, props: { text: "Left." } },
      { kind: "paragraph", col: 1, props: { text: "Right." } },
    ], { layout: 2 });
    assertEmailSafe(renderEmailDocument(d, ectx(d), { subject: "Hi" }));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   A3. Website and landing pages at 390px
   ══════════════════════════════════════════════════════════════════════════ */

describe("A3 · a website page and a landing page at 390px", () => {
  test("every row of cards folds to one column", () => {
    for (const sel of [".sw-row-2", ".sw-row-3", ".sw-row-4", ".sw-split", ".sw-grid"]) {
      assert.equal(phoneDecl(SITE_CSS, sel, "grid-template-columns"), "1fr", `${sel} keeps its columns on a phone`);
    }
  });

  test("a band's 36px side padding comes down, and the theme's own bar wraps", () => {
    assert.equal(phoneDecl(SITE_CSS, ".sw-band", "padding"), "28px 20px");
    assert.equal(phoneDecl(SITE_CSS, ".sw-chrome-bar", "flex-wrap"), "wrap");
  });

  test("a landing page is a container and has a gutter at last", () => {
    assert.match(LANDING_CSS, /\.lp-page,\.bx-doc\{container-type:inline-size\}/);
    assert.match(LANDING_CSS, /\.lp-page\{max-width:760px;margin:0 auto;padding:0 20px\}/);
    assert.match(LANDING_CSS, /\.lp-page\{padding:0 16px\}/, "16px each side on a phone, never 0");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   B. The builder chrome under 900px
   ══════════════════════════════════════════════════════════════════════════ */

describe("B · the builder itself on a narrow screen", () => {
  const frame = read("builder/BuilderFrame.tsx");

  test("below 900px the panes are drawers, not three columns", () => {
    assert.match(frame, /data-builder-layout="narrow"/);
    assert.match(frame, /data-builder-drawer="open"/);
    assert.doesNotMatch(frame, /max-width:\s*\d+px["`]/, "no breakpoint may be re-typed here");
  });

  test("the thing that CHOOSES between the two layouts is the viewport width", () => {
    // Pinned as the expression and not merely as "the narrow markup exists":
    // mutation 6 replaced `{narrow ? (` with `{false ? (` — three panes at
    // every width, the drawers dead code — and every assertion above stayed
    // green, because all of them only asked whether the markup was present.
    // There is no DOM under `node --test` (the loader's rule: only PURE
    // modules), so the switch itself is pinned as source.
    assert.match(frame, /\{narrow \? \(\s*\n\s*<div data-builder-layout="narrow"/,
      "the narrow layout must be chosen BY `narrow`");
    assert.match(frame, /\) : \(\s*\n\s*<IadmBuilderPanes/,
      "the wide layout must be the other branch of that same switch");
    assert.match(frame, /window\.matchMedia\(NARROW_MEDIA_QUERY\)/,
      "and `narrow` must come from THE number, not one re-typed here");
    assert.match(frame, /narrow \? null : p\.headerActions/,
      "Save and Send must not appear in the header AND the bar at once");
  });

  test("the drawers render the SAME pane and the SAME inspector", () => {
    // A narrow layout that re-implemented either would be a second builder,
    // which is the duplicate this whole scope exists to delete.
    assert.match(frame, /\{drawer === "pane" \? p\.pane : p\.inspector\}/);
  });

  test("the bottom bar carries Widgets, Settings, History and the adapter's own buttons", () => {
    assert.match(frame, /data-builder-slot="bottombar"/);
    assert.match(frame, />\s*Widgets\s*</);
    assert.match(frame, />\s*Settings\s*</);
    // ABSENT: the Undo / Redo pair. The reference editor's bar has neither
    // (driven 2026-09-19) — undo is Ctrl+Z and the History panel (D-172).
    // PRESENT: History, because a drawer layout still needs a thumb-sized way
    // in to the thing that replaced them.
    assert.doesNotMatch(frame, /\{undoRedo\("bar"\)\}/, "the undo/redo pair is back in the bottom bar");
    assert.match(frame, /\{barHistory\(\)\}/);
    assert.match(frame, /\{p\.headerActions\}<\/div>/, "Save and Send have to be reachable by a thumb");
  });

  test("Undo and Redo are the KEYBOARD, not two buttons in the bar", () => {
    // ABSENT everywhere in the frame: the reference has no undo control at all.
    assert.equal((frame.match(/title="Undo \(Ctrl\+Z\)"/g) || []).length, 0,
      "the Undo button is back in the top bar");
    assert.equal((frame.match(/title="Redo \(Ctrl\+Shift\+Z\)"/g) || []).length, 0,
      "the Redo button is back in the top bar");
    assert.doesNotMatch(frame, /<Undo2\b/, "the undo glyph is back");
    assert.doesNotMatch(frame, /<Redo2\b/, "the redo glyph is back");
    // PRESENT: the chords still reach the stack, which is the whole point —
    // an advertised shortcut that does nothing is the D-18 defect.
    const map = read("builder/shortcuts.ts");
    assert.match(map, /"undo"/);
    assert.match(map, /"redo"/);
    assert.match(frame, /p\.onShortcut\?\.\(action\)/);
  });

  test("every control in the bar is at least 40px — a thumb, not a mouse", () => {
    assert.match(frame, /minHeight: 40/);
    assert.match(frame, /minWidth: 40/);
  });

  test("the wide frame carries no breakpoint of its own any more", () => {
    // Four numbers became one: `max-md:hidden` on the pane and
    // `max-lg:hidden` on the inspector are gone, because hiding a pane is not
    // a narrow layout — it is a builder with the widget list simply missing.
    const modal = read("components/IadmModal.tsx");
    assert.doesNotMatch(modal, /data-builder-slot="pane"[\s\S]{0,300}max-md:hidden/);
    assert.doesNotMatch(modal, /data-builder-slot="inspector"[\s\S]{0,300}max-lg:hidden/);
  });

  test("the preview toggle is in the header, and only where a paper width means something", () => {
    assert.match(frame, /data-builder-preview=\{p\.preview\}/);
    assert.match(frame, /aria-label="Preview width"/);
    assert.match(frame, /PREVIEW_DEVICES\.map/);
    // The pixel studio has no paper width — an artboard is 1080×1080 whatever
    // you are holding — so it passes neither prop and gets no toggle.
    const studio = read("builder/adapters/mybrand/StudioBuilder.tsx");
    assert.doesNotMatch(studio, /\bpreview=\{/);
  });

  test("the shell owns ONE preview state and every adapter goes through it", () => {
    const shell = read("builder/BuilderShell.tsx");
    assert.match(shell, /const \[preview, setPreview\] = useState<PreviewKey>\("desktop"\)/);
    assert.match(shell, /preview=\{preview\}/);
    assert.match(shell, /onPreview=\{setPreview\}/);
    assert.match(shell, /paperWidth=\{previewPaperWidth\(preview, p\.paperWidth \?\? 780\)\}/,
      "the canvas must take the PREVIEWED width, or the toggle is decoration");
    // No adapter may compute one of its own.
    for (const rel of [
      "builder/adapters/email/EmailBuilder.tsx",
      "builder/adapters/website/WebsiteBuilder.tsx",
      "builder/adapters/landing/LandingBuilder.tsx",
      "builder/proposal/ProposalBuilder.tsx",
    ]) {
      assert.doesNotMatch(read(rel), /previewPaperWidth|PREVIEW_DEVICES/, `${rel} must not fork the preview`);
    }
  });
});

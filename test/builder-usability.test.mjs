// test/builder-usability.test.mjs — the usability rebuild
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §11.10, from BUILDER_USER_TEST_2026-09-16).
//
// What this pins, in the findings' own words:
//   D-11  "a widget added with nothing selected goes to the end of the
//          document, off screen, with no scroll-to"
//   D-12  "sections cannot be reordered anywhere … no section chrome on hover"
//   D-18  "the toolbar's tooltip literally reads 'Undo (Ctrl+Z)'. The keystroke
//          does nothing."
//   D-19  "Tab leaves the builder for the page behind"
//   D-02  "Escape closes the builder and throws away everything unsaved"
//   D-20  "error text appears 1,300px from the control that caused it"
//   D-30  "adapter copy leaks across builders"
//   D-35  "the blanks counter is not clickable and does not say which"
//   D-40  "React error on Undo"
//   D-147/D-148 the picker, the outline, the first run, the empty page
//
// MUTATIONS RUN AND RESTORED, so the next person can re-run them:
//   · insertSpotFor: drop the widget branch (insert after the selected widget)   → RED
//   · sectionAtViewport: return boxes[0] always (the nearest-box arithmetic)     → RED
//   · matchShortcut: let Backspace mean "delete"                                 → RED
//   · matchShortcut: drop the isTypingTarget guard on Delete                     → RED
//   · nextTrapIndex: stop wrapping at the end (return count - 1)                 → RED
//   · taskFor: ignore TASK_BY_KIND and answer from the category only             → RED
//   · duplicateWidget: keep the original's id                                    → RED
//   · resolveCopy: use `||` instead of the undefined check                       → RED
//   · Canvas: gate the section toolbar on `selected` again                       → RED
//   · BuilderFrame: call p.onClose() straight from requestClose                  → RED
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  addSection, addWidget, deserialise, duplicateWidget, emptyDocument, makeContainer, makeSection,
  makeWidget, resetIds, serialise, widgetAt,
} from "../src/builder/model.ts";
import { makeContext, renderDocument, renderWidget } from "../src/builder/render.ts";
import {
  FLASH_MS, insertSpotFor, sectionAtViewport, selectionAt,
} from "../src/builder/insertPosition.ts";
import {
  SHORTCUT_HELP, isTypingTarget, matchShortcut, preventsDefault,
} from "../src/builder/shortcuts.ts";
import { FOCUSABLE_SELECTOR, firstTabTarget, nextTrapIndex } from "../src/builder/focusTrap.ts";
import {
  firstWords, hiddenOf, outline, rowLabel, sectionDropIndex, sectionRows,
} from "../src/builder/navigatorModel.ts";
import {
  DEFAULT_TASK, EMPTY_PAGE_CHOICES, TASK_BY_CATEGORY, TASK_GROUPS, flatMatches, groupByTask,
  matchesWidgetQuery, taskFor, unmappedCategories,
} from "../src/builder/widgetTasks.ts";
import {
  FIRST_RUN_STEPS, nextStep, shouldShowFirstRun,
} from "../src/builder/firstRunModel.ts";
import {
  PROBLEMS_CTA, anchorSelector, firstWithFocus, focusSelector, problemsLabel,
} from "../src/builder/problems.ts";
import { DEFAULT_COPY, resolveCopy } from "../src/builder/copy.ts";
import { WIDGETS, widgetsFor, WIDGET_CATEGORIES } from "../src/builder/registry.ts";

const SRC = path.join(process.cwd(), "src");
const readSrc = (rel) => readFileSync(path.join(SRC, rel), "utf8");

/**
 * The file with its comments taken out.
 *
 * Every vendor-name check has to ask about what REACHES A SCREEN, not about
 * what a comment says: "Elementor's answer, which is the one the convention
 * file names" is exactly the sort of sentence that belongs in a header and
 * must never be in a tooltip.
 */
function withoutComments(src) {
  return src
    .replace(/https?:\/\/\S*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/* ══════════════════════════════════════════════════════════════════════════
   1. D-11 — where a new widget lands
   ══════════════════════════════════════════════════════════════════════════ */

function threeSections() {
  resetIds();
  let doc = emptyDocument();
  const a = makeSection({ label: "A" });
  const b = makeSection({ label: "B", layout: 2 });
  const c = makeSection({ label: "C" });
  doc = addSection(doc, a);
  doc = addSection(doc, b);
  doc = addSection(doc, c);
  doc = addWidget(doc, a.id, 0, makeWidget("heading", { text: "One" }));
  doc = addWidget(doc, b.id, 0, makeWidget("paragraph", { text: "Two" }));
  doc = addWidget(doc, b.id, 0, makeWidget("paragraph", { text: "Three" }));
  return { doc, a, b, c };
}

describe("a widget lands where the author is, never at the end (D-11)", () => {
  /* §11.12 (D-156) added `hostId` — THE address of the box a thing lands in,
     which is a column's id at the top level and a container's below it. The
     assertions keep the three old fields AND check the new one, because "after
     the selected widget" and "in the right box" are two different promises and
     a spot that got one right and the other wrong would put a card at the top
     of a column instead of beside its neighbour in a row. */
  test("a selected WIDGET puts the new one directly after it, in its own box", () => {
    const { doc, b } = threeSections();
    const spot = insertSpotFor(doc, { kind: "widget", sectionId: b.id, columnIndex: 0, widgetIndex: 0 });
    assert.deepEqual(spot, { hostId: b.columns[0].id, sectionId: b.id, columnIndex: 0, index: 1 });
  });

  test("a selected widget INSIDE A BOX gets the next one beside it, not at the top of the column", () => {
    const { doc, b } = threeSections();
    const box = makeContainer(undefined, [makeWidget("paragraph", { text: "In a box" })]);
    const withBox = addWidget(doc, b.id, 0, box);
    const inner = box.children[0];
    const spot = insertSpotFor(withBox, {
      kind: "widget", sectionId: b.id, columnIndex: 0, widgetIndex: 0, id: inner.id,
    });
    assert.equal(spot.hostId, box.id, "landed outside the box it was told to land in");
    assert.equal(spot.index, 1);
  });

  test("a selected widget in the SECOND column stays in the second column", () => {
    const { doc, b } = threeSections();
    const spot = insertSpotFor(doc, { kind: "widget", sectionId: b.id, columnIndex: 1, widgetIndex: 0 });
    assert.equal(spot.columnIndex, 1);
    assert.equal(spot.sectionId, b.id);
  });

  test("a stale selection past the end of a column is clamped, not sent to the end of the document", () => {
    // A selection outlives the widget it pointed at (an undo, a delete from
    // the outline). Without the clamp the index runs past the array and the
    // widget quietly reappears at the bottom of the page — D-11 again.
    const { doc, a } = threeSections();
    const spot = insertSpotFor(doc, { kind: "widget", sectionId: a.id, columnIndex: 0, widgetIndex: 40 });
    assert.deepEqual(spot, { hostId: a.columns[0].id, sectionId: a.id, columnIndex: 0, index: 1 });
  });

  test("a selected SECTION appends into its first column", () => {
    const { doc, b } = threeSections();
    const spot = insertSpotFor(doc, { kind: "section", sectionId: b.id });
    assert.deepEqual(spot, { hostId: b.columns[0].id, sectionId: b.id, columnIndex: 0, index: 2 });
  });

  test("with NOTHING selected it goes into the section on screen", () => {
    const { doc, b } = threeSections();
    const spot = insertSpotFor(doc, null, b.id);
    assert.equal(spot.sectionId, b.id, "it went somewhere other than what the author is looking at");
  });

  test("a visible-section id that no longer exists is ignored, not trusted", () => {
    const { doc, c } = threeSections();
    const spot = insertSpotFor(doc, null, "s-deleted");
    assert.equal(spot.sectionId, c.id, "a stale measurement must not choose a section that is gone");
  });

  test("an empty document says so, so the caller makes a section", () => {
    assert.equal(insertSpotFor(emptyDocument(), null, null), null);
  });

  test("what lands is SELECTED, so it can be typed into straight away", () => {
    const { doc, b } = threeSections();
    const spot = insertSpotFor(doc, { kind: "section", sectionId: b.id });
    assert.deepEqual(selectionAt(spot), {
      kind: "widget", sectionId: b.id, columnIndex: 0, widgetIndex: 2,
    });
  });

  test("the glow is long enough to notice and short enough to stop", () => {
    assert.ok(FLASH_MS >= 1000 && FLASH_MS <= 4000, `FLASH_MS is ${FLASH_MS}`);
  });
});

describe("which section the author is looking at", () => {
  const boxes = [
    { id: "s1", top: 0, bottom: 200 },
    { id: "s2", top: 200, bottom: 600 },
    { id: "s3", top: 600, bottom: 900 },
  ];

  test("the one covering the middle of the window", () => {
    assert.equal(sectionAtViewport(boxes, { top: 150, height: 300 }), "s2");
    assert.equal(sectionAtViewport(boxes, { top: 0, height: 100 }), "s1");
    assert.equal(sectionAtViewport(boxes, { top: 700, height: 200 }), "s3");
  });

  test("scrolled past everything, the NEAREST one — never nothing", () => {
    // "I could not tell" and "put it at the end" are the same outcome for the
    // author, and the end is exactly where D-11 put things.
    assert.equal(sectionAtViewport(boxes, { top: 5000, height: 400 }), "s3");
    assert.equal(sectionAtViewport(boxes, { top: -5000, height: 400 }), "s1");
  });

  test("no sections measured is the only null", () => {
    assert.equal(sectionAtViewport([], { top: 0, height: 100 }), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. D-18 — the keyboard actually does what the tooltips say
   ══════════════════════════════════════════════════════════════════════════ */

describe("the keyboard map (D-18)", () => {
  test("Ctrl+Z undoes and Ctrl+Shift+Z redoes, on Windows and on a Mac", () => {
    assert.equal(matchShortcut({ key: "z", ctrlKey: true }), "undo");
    assert.equal(matchShortcut({ key: "z", metaKey: true }), "undo");
    assert.equal(matchShortcut({ key: "Z", ctrlKey: true, shiftKey: true }), "redo");
    assert.equal(matchShortcut({ key: "y", ctrlKey: true }), "redo");
  });

  test("Ctrl+S saves, and its default is suppressed so the browser does not", () => {
    assert.equal(matchShortcut({ key: "s", ctrlKey: true }), "save");
    assert.equal(preventsDefault("save"), true);
  });

  test("Ctrl+Z still undoes WHILE TYPING — the browser's own undo knows nothing about the model", () => {
    const caret = { isContentEditable: true };
    assert.equal(matchShortcut({ key: "z", ctrlKey: true }, caret), "undo");
  });

  test("Delete removes the selection, and never while the caret is in words", () => {
    assert.equal(matchShortcut({ key: "Delete" }), "delete");
    assert.equal(matchShortcut({ key: "Delete" }, { isContentEditable: true }), null);
    assert.equal(matchShortcut({ key: "Delete" }, { tagName: "INPUT" }), null);
    assert.equal(matchShortcut({ key: "Delete" }, { tagName: "TEXTAREA" }), null);
  });

  test("BACKSPACE NEVER DELETES THE SELECTION", () => {
    // On a page whose text is edited in place, "backspace to fix a typo" is
    // one stray click away from "the pricing table is gone".
    assert.equal(matchShortcut({ key: "Backspace" }), null);
    assert.equal(matchShortcut({ key: "Backspace" }, { isContentEditable: true }), null);
  });

  test("ESCAPE ALWAYS MEANS ESCAPE, including with the caret in the words", () => {
    // FOUND BY DRIVING IT: every run of text on this canvas IS a text field,
    // so leaving Escape "to the text field" left it to the text field for
    // ever — the key did nothing anywhere in the builder.
    assert.equal(matchShortcut({ key: "Escape" }), "escape");
    assert.equal(matchShortcut({ key: "Escape" }, { isContentEditable: true }), "escape");
    assert.equal(matchShortcut({ key: "Escape" }, { tagName: "INPUT" }), "escape");
    assert.equal(preventsDefault("escape"), false, "the modal must still be able to hear it if we do not consume it");
  });

  test("Alt is nobody's shortcut here", () => {
    assert.equal(matchShortcut({ key: "z", ctrlKey: true, altKey: true }), null);
    assert.equal(matchShortcut({ key: "Delete", altKey: true }), null);
  });

  test("isTypingTarget knows every place words go", () => {
    assert.equal(isTypingTarget({ isContentEditable: true }), true);
    assert.equal(isTypingTarget({ tagName: "select" }), true);
    assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
    assert.equal(isTypingTarget(null), false);
  });

  test("the help panel lists every shortcut the map answers", () => {
    const listed = SHORTCUT_HELP.map((r) => r.keys.toLowerCase().replace(/\s+/g, ""));
    for (const need of ["ctrl+z", "ctrl+shift+z", "ctrl+s", "delete", "escape"]) {
      assert.ok(listed.includes(need), `the panel never mentions ${need}`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. D-19 — Tab stays inside
   ══════════════════════════════════════════════════════════════════════════ */

describe("the focus trap (D-19)", () => {
  test("Tab wraps at the end and Shift+Tab at the start — that is what makes it a trap", () => {
    assert.equal(nextTrapIndex(4, 0), 1);
    assert.equal(nextTrapIndex(4, 3), 0);
    assert.equal(nextTrapIndex(4, 0, true), 3);
    assert.equal(nextTrapIndex(4, 3, true), 2);
  });

  test("focus that is not in the ring yet lands on the first (or last, going back)", () => {
    assert.equal(nextTrapIndex(4, -1), 0);
    assert.equal(nextTrapIndex(4, -1, true), 3);
    assert.equal(nextTrapIndex(0, -1), -1);
  });

  test("the FIRST Tab lands on the canvas", () => {
    assert.equal(firstTabTarget(false, true), "canvas");
    assert.equal(firstTabTarget(true, true), "ring");
    assert.equal(firstTabTarget(false, false), "ring");
  });

  test("a disabled Send and a tabindex=-1 canvas are not in the ring", () => {
    assert.match(FOCUSABLE_SELECTOR, /button:not\(\[disabled\]\)/);
    assert.match(FOCUSABLE_SELECTOR, /\[tabindex\]:not\(\[tabindex="-1"\]\)/);
    assert.match(FOCUSABLE_SELECTOR, /contenteditable="true"/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. D-12 — the outline
   ══════════════════════════════════════════════════════════════════════════ */

describe("the outline (D-12)", () => {
  test("every section, then its widgets, in reading order", () => {
    const { doc, a, b, c } = threeSections();
    const rows = outline(doc);
    assert.deepEqual(rows.map((r) => r.kind),
      ["section", "widget", "section", "widget", "widget", "section"]);
    assert.deepEqual(sectionRows(doc).map((r) => r.id), [a.id, b.id, c.id]);
  });

  test("a row says what the widget ACTUALLY SAYS, not just its kind", () => {
    // Eleven rows called "Paragraph" is not an outline.
    assert.equal(rowLabel(makeWidget("heading", { text: "Scope of work" })), "Heading · Scope of work");
    assert.equal(rowLabel(makeWidget("paragraph", {})), "Paragraph");
  });

  test("it reaches into a repeat for the first thing in it", () => {
    assert.equal(firstWords({ rows: [{ name: "Snow Removal — 1-2 inch" }] }), "Snow Removal — 1-2 inch");
    assert.equal(firstWords({ items: ["Salt included"] }), "Salt included");
    assert.equal(firstWords({}), "");
  });

  test("long words are clipped, so one row cannot push the eye out of the list", () => {
    const long = "x".repeat(200);
    assert.ok(firstWords({ text: long }).length <= 40);
    assert.match(firstWords({ text: long }), /…$/);
  });

  test("hidden on DESKTOP means hidden everywhere — the cascade says so", () => {
    assert.deepEqual(hiddenOf({ hidden: true }), { desktop: true, tablet: true, phone: true });
    assert.deepEqual(hiddenOf({ phone: { hidden: true } }), { desktop: false, tablet: false, phone: true });
    assert.deepEqual(hiddenOf(undefined), { desktop: false, tablet: false, phone: false });
  });

  test("dropping on a widget row moves the SECTION it belongs to", () => {
    const { doc } = threeSections();
    const rows = outline(doc);
    // row 4 is the second widget of section B — dropping there means "after B".
    assert.equal(sectionDropIndex(rows, 4), 1);
    assert.equal(sectionDropIndex(rows, 0), 0);
    assert.equal(sectionDropIndex(rows, 5), 2);
  });

  test("a locked widget is marked, so the outline explains why it has no delete", () => {
    resetIds();
    let doc = emptyDocument();
    const s = makeSection({ label: "Footer" });
    doc = addSection(doc, s);
    doc = addWidget(doc, s.id, 0, makeWidget("email_footer", {}, { locked: true }));
    const rows = outline(doc);
    assert.equal(rows[1].locked, true);
    assert.equal(rows[0].required, true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. D-147 — the picker's groups and its search
   ══════════════════════════════════════════════════════════════════════════ */

describe("the widget picker groups by the job (D-147)", () => {
  test("the seven groups are the ones a home-services owner would name", () => {
    assert.deepEqual([...TASK_GROUPS], [
      "Customer & property", "Products & services", "Words", "Pictures & media",
      "Signature & terms", "Layout", "More",
    ]);
  });

  test("Brandon's two sentences are answerable in one group each", () => {
    // "I need to be able to call products and services, I need to be able to
    // add sections for service address or property address."
    const property = groupByTask("proposal").find((g) => g.task === "Customer & property");
    const money = groupByTask("proposal").find((g) => g.task === "Products & services");
    assert.ok(property.widgets.some((w) => w.kind === "property_block"),
      "the property block is not under Customer & property");
    assert.ok(money.widgets.some((w) => w.kind === "pricing_table"),
      "the pricing table is not under Products & services");
  });

  test("every widget the pane offers lands in a group — nothing is dropped", () => {
    for (const adapter of ["proposal", "website", "email", "landing", "brand"]) {
      const grouped = groupByTask(adapter).flatMap((g) => g.widgets.map((w) => w.kind)).sort();
      const offered = widgetsFor(adapter).map((w) => w.kind).sort();
      assert.deepEqual(grouped, offered, `${adapter}: the picker and the pane disagree about what exists`);
    }
  });

  test("every category has a job, so nothing falls into More by accident", () => {
    assert.deepEqual(unmappedCategories(), []);
    for (const c of WIDGET_CATEGORIES) assert.ok(TASK_GROUPS.includes(TASK_BY_CATEGORY[c]), c);
  });

  test("a widget's own `task` on its registry entry wins over both maps", () => {
    const fake = { kind: "made_up_thing", label: "x", description: "y", category: "Text", task: "Layout" };
    assert.equal(taskFor(fake), "Layout");
    assert.equal(taskFor({ ...fake, task: "Nonsense" }), "Words", "an unknown task falls back rather than inventing a group");
    assert.equal(taskFor({ kind: "nope", label: "", description: "", category: "Information" }), DEFAULT_TASK);
  });

  test("the search reads the sentence and the group name, not only the label", () => {
    const heading = WIDGETS.find((w) => w.kind === "heading");
    assert.equal(matchesWidgetQuery(heading, "heading"), true);
    assert.equal(matchesWidgetQuery(heading, "words"), true, "the group name has to be searchable");
    assert.equal(matchesWidgetQuery(heading, "zzz"), false);
  });

  test("EVERY word has to match, so two words narrow rather than widen", () => {
    const pricing = WIDGETS.find((w) => w.kind === "pricing_table");
    assert.equal(matchesWidgetQuery(pricing, "price table"), true);
    assert.equal(matchesWidgetQuery(pricing, "price banana"), false);
  });

  test("the picker's first card IS what Enter inserts", () => {
    // FOUND BY DRIVING IT: the grid drew registry order while Enter took the
    // ranked top, so the first card and the thing Enter added were two
    // different widgets.
    const first = groupByTask("proposal", "pri")[0].widgets[0];
    assert.equal(first.kind, flatMatches("proposal", "pri")[0].kind);
  });

  test("a NAME beats a mention — 'property' finds the property widgets, not the merge field", () => {
    // The slash command's Enter takes the first of these, so the order is not
    // cosmetic: getting it wrong inserts the wrong thing without asking.
    const hits = flatMatches("proposal", "property").map((w) => w.kind);
    const merge = hits.indexOf("merge_field");
    assert.match(flatMatches("proposal", "property")[0].label, /^Property/);
    assert.ok(hits.indexOf("property_block") < merge, "the merge field outranked the property block");
    assert.ok(hits.indexOf("property_plan") < merge, "the merge field outranked the property plan");
  });

  test("the empty page's three choices point at three real groups", () => {
    assert.equal(EMPTY_PAGE_CHOICES.length, 3);
    for (const c of EMPTY_PAGE_CHOICES) assert.ok(TASK_GROUPS.includes(c.task), c.key);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. the first run, the problems, the copy
   ══════════════════════════════════════════════════════════════════════════ */

describe("the welcome box shows until the person says stop (D-154)", () => {
  test("three steps, and the last one is the last", () => {
    assert.equal(FIRST_RUN_STEPS.length, 3);
    assert.equal(nextStep(0), 1);
    assert.equal(nextStep(2), null);
  });

  test("it opens on EVERY builder open while Builder tips are on", () => {
    assert.equal(shouldShowFirstRun(true), true);
    // Not loaded yet is not "no": the switch defaults on, so a builder opened
    // in the first half-second behaves like one opened later.
    assert.equal(shouldShowFirstRun(undefined), true);
  });

  test("only an explicit off keeps it away", () => {
    assert.equal(shouldShowFirstRun(false), false);
  });

  test("nothing in this module reads or writes a browser store any more", () => {
    // The once-per-browser key is DELETED, not deprecated. A second mechanism
    // would disagree with the server switch the first time somebody used two
    // computers - which is the defect D-154 was raised about.
    const code = withoutComments(readSrc("builder/firstRunModel.ts"));
    assert.ok(!/localStorage/.test(code), "firstRunModel still touches localStorage");
    assert.ok(!/getItem|setItem/.test(code));
    assert.ok(!/FIRST_RUN_KEY/.test(code));
  });

  test("the steps name no other product", () => {
    const words = FIRST_RUN_STEPS.map((s) => `${s.title} ${s.body}`).join(" ").toLowerCase();
    for (const vendor of ["elementor", "gutenberg", "wix", "squarespace", "wordpress"]) {
      assert.ok(!words.includes(vendor), `the walk-through says "${vendor}" on a screen`);
    }
  });
});

describe("problems point at the page (D-03 / D-20 / D-35)", () => {
  test("a problem addresses the page by the two markers the canvas already edits through", () => {
    assert.equal(focusSelector({ sectionId: "s1", widgetId: "w7", path: "rows.2.value" }),
      '[data-widget="w7"] [data-edit="rows.2.value"]');
    assert.equal(focusSelector({ sectionId: "s1", widgetId: "w7" }), '[data-widget="w7"]');
  });

  test("a refusal finds the button by the name the adapter put on it", () => {
    assert.equal(anchorSelector("send"), '[data-builder-anchor="send"]');
  });

  test("a quote in an id cannot break the selector", () => {
    assert.ok(!focusSelector({ sectionId: "s", widgetId: 'w"x' }).includes('w"x'));
  });

  test("the jump goes to the first problem that knows where it is", () => {
    const list = [
      { id: "a", message: "no total" },
      { id: "b", message: "term missing", focus: { sectionId: "s1", widgetId: "w2", path: "text" } },
    ];
    assert.equal(firstWithFocus(list).id, "b");
    assert.equal(firstWithFocus([]), null);
    assert.equal(firstWithFocus(undefined), null);
  });

  test("the counter is written out, in plain words, singular and plural", () => {
    assert.equal(problemsLabel(1), "1 detail still to fill in");
    assert.equal(problemsLabel(5), "5 details still to fill in");
    assert.equal(problemsLabel(0), "");
    assert.match(PROBLEMS_CTA, /first/i);
  });
});

describe("the engine's own words come from the adapter (D-30)", () => {
  test("the defaults are generic — three of the four builders are not documents", () => {
    assert.equal(DEFAULT_COPY.noun, "page");
    assert.ok(!/document/i.test(DEFAULT_COPY.defaultFontLabel));
  });

  test("an adapter overrides only what it says, and keeps the rest", () => {
    const copy = resolveCopy({ noun: "email", defaultFontLabel: "The email's own font" });
    assert.equal(copy.noun, "email");
    assert.equal(copy.defaultFontLabel, "The email's own font");
    assert.equal(copy.outlineHeading, DEFAULT_COPY.outlineHeading);
  });

  test('"" MEANS EMPTY and undefined means "no opinion"', () => {
    // An email has no pages. `pageBreakLabel: ""` hides the control; leaving it
    // out keeps the default, and `||` would have confused the two.
    assert.equal(resolveCopy({ pageBreakLabel: "" }).pageBreakLabel, "");
    assert.equal(resolveCopy({}).pageBreakLabel, DEFAULT_COPY.pageBreakLabel);
    assert.equal(resolveCopy(null).noun, DEFAULT_COPY.noun);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. duplicate, on the model
   ══════════════════════════════════════════════════════════════════════════ */

describe("a widget can be copied from its own handle (D-12)", () => {
  test("the copy sits directly under the original and shares no id", () => {
    resetIds();
    let doc = emptyDocument();
    const s = makeSection({ label: "A" });
    doc = addSection(doc, s);
    doc = addWidget(doc, s.id, 0, makeWidget("heading", { text: "One" }));
    doc = addWidget(doc, s.id, 0, makeWidget("paragraph", { text: "Two" }), 1);
    const next = duplicateWidget(doc, { sectionId: s.id, columnIndex: 0, widgetIndex: 0 });
    const widgets = next.sections[0].columns[0].widgets;
    assert.equal(widgets.length, 3);
    assert.equal(widgets[1].kind, "heading");
    assert.notEqual(widgets[1].id, widgets[0].id);
    assert.equal(widgets[2].kind, "paragraph");
  });

  test("the copy's props and style are DEEP — restyling one must not follow the other", () => {
    resetIds();
    let doc = emptyDocument();
    const s = makeSection({});
    doc = addSection(doc, s);
    const w = makeWidget("heading", { text: "One" });
    w.style = { typography: { size: 22 } };
    doc = addWidget(doc, s.id, 0, w);
    const next = duplicateWidget(doc, { sectionId: s.id, columnIndex: 0, widgetIndex: 0 });
    const copy = next.sections[0].columns[0].widgets[1];
    copy.style.typography.size = 99;
    assert.equal(widgetAt(next, { sectionId: s.id, columnIndex: 0, widgetIndex: 0 }).style.typography.size, 22);
  });

  test("a locked part exists exactly ONCE, so duplicate refuses it", () => {
    resetIds();
    let doc = emptyDocument();
    const s = makeSection({});
    doc = addSection(doc, s);
    doc = addWidget(doc, s.id, 0, makeWidget("email_footer", {}, { locked: true }));
    assert.equal(duplicateWidget(doc, { sectionId: s.id, columnIndex: 0, widgetIndex: 0 }), doc);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8. THE SURFACES, pinned at the source
   ══════════════════════════════════════════════════════════════════════════ */

describe("the canvas carries the chrome the walk asked for", () => {
  const canvas = readSrc("builder/Canvas.tsx");
  const addbar = readSrc("builder/AddBar.tsx");

  test('a "+" strip sits between every two sections and after the last (D-11)', () => {
    assert.match(canvas, /<AddBar/);
    assert.match(addbar, /data-builder-addbar/);
    assert.match(addbar, /data-builder-add="\+"/);
    // Above the first one as well, or there is nowhere to add a title band.
    assert.match(canvas, /kind: "newSection", index: 0/);
  });

  test("EVERY empty box offers its own spot, a column included (D-11, D-156)", () => {
    // WAS "an empty column". §11.12 made it every box at every depth, and it is
    // ONE loop over `[data-bx-host]` rather than two — a column IS a box, and a
    // second loop for the nested ones is a second place to forget something.
    assert.match(canvas, /data-builder-addhere/);
    assert.match(canvas, /if \(box\.querySelector\("\[data-widget\]"\)\) continue;/);
    assert.match(canvas, /querySelectorAll<HTMLElement>\("\[data-bx-host\]"\)/);
    // And a box that is NOT empty is not a dead end either.
    assert.match(canvas, /data-builder-addin/);
  });

  test("THE SECTION TOOLBAR IS ON HOVER, not only on selection (D-12)", () => {
    // The whole finding: "Hovering a section shows no chrome at all; there are
    // no section handles."
    assert.doesNotMatch(canvas, /\{selected && \(\s*<div className="bxc-toolbar"/,
      "the toolbar is gated on the selection again");
    assert.match(canvas, /\.bxc-sec:hover > \.bxc-toolbar/);
  });

  test("the toolbar is the slim one: drag, up, down, duplicate, delete, settings", () => {
    for (const title of [
      "Drag to move this section", "Move this section up", "Move this section down",
      "Duplicate this section", "Delete this section", "Settings for this section",
    ]) assert.ok(canvas.includes(title), `the toolbar has no "${title}"`);
    // And it carries none of the nine settings buttons any more — they live in
    // the inspector, which is the one home for a setting.
    for (const gone of ["Light or dark text", "Mark as Recommended", "Number this section (01"]) {
      assert.ok(!canvas.includes(gone), `"${gone}" is back on the toolbar as well as in the inspector`);
    }
  });

  test("every widget has a handle with drag, duplicate and delete (D-12)", () => {
    assert.match(canvas, /bxc-wtools/);
    assert.match(canvas, /\[data-widget\]:hover > \.bxc-wtools/);
    assert.match(canvas, /Make a copy of this \$\{noun\}, right underneath/);
    assert.match(canvas, /Remove this from the page/);
    // §11.12 — ONE loop, so a box wears the same handle as everything else and
    // only the words differ.
    assert.match(canvas, /const isBox = el\.dataset\.kind === "container"/);
  });

  test("a locked widget's handle SAYS WHY rather than doing nothing", () => {
    assert.match(canvas, /onRefuse\?\.\(/);
    assert.match(canvas, /you can change the wording, not remove it/);
  });

  test("the new thing is scrolled to and glows (D-11)", () => {
    assert.match(canvas, /scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/);
    assert.match(canvas, /bxc-flash/);
  });

  test("the empty page offers three choices, not a blank sheet (D-148)", () => {
    assert.match(canvas, /data-builder-empty/);
    assert.match(canvas, /emptyChoices/);
  });

  test("the section drag lands on the same strip the drop line uses", () => {
    assert.match(canvas, /dropActive=\{!!dragId/);
    assert.match(addbar, /bxc-addbar-drop/);
  });

  test("the phone still has everything, where dragging never fires", () => {
    // HTML5 drag does not fire on touch. The buttons the phone pass pinned are
    // still on the strip, and the toolbar's up/down are new ones beside them.
    assert.match(canvas, /title="Add a blank section here"/);
    assert.match(canvas, /title="Add a ready-made section here"/);
  });
});

describe("the frame never closes silently, and Tab stays inside (D-02 / D-19)", () => {
  const frame = readSrc("builder/BuilderFrame.tsx");

  test("every route out goes through the one question", () => {
    assert.match(frame, /const requestClose = useCallback\(/);
    assert.match(frame, /if \(p\.dirty\) \{ setConfirmClose\(true\); return; \}/);
    // The modal's own X and backdrop go through it too, not straight to onClose.
    assert.match(frame, /onClose=\{requestClose\}/);
    assert.doesNotMatch(frame, /<IadmModal[\s\S]{0,200}onClose=\{p\.onClose\}/);
  });

  test("the question is asked in plain words, and Keep editing is the safe one", () => {
    assert.match(frame, /Close and discard the changes\?/);
    assert.match(frame, /Keep editing/);
    assert.match(frame, /autoFocus/);
  });

  test("Escape is always stopped, so the modal cannot close the builder behind our back", () => {
    assert.match(frame, /if \(action === "escape"\)/);
    assert.match(frame, /if \(!consumed\) requestClose\(\);/);
  });

  test("Tab is trapped, and the first one lands on the canvas", () => {
    assert.match(frame, /focusablesIn\(root\)/);
    assert.match(frame, /firstTabTarget\(current >= 0, !!canvas\)/);
    assert.match(frame, /nextTrapIndex\(items\.length, current, e\.shiftKey\)/);
  });

  test("ONE keyboard listener, asking ONE map", () => {
    assert.match(frame, /matchShortcut\(e,/);
    assert.equal((frame.match(/document\.addEventListener\("keydown"/g) || []).length, 1,
      "a second keyboard listener is a second set of rules");
  });

  test('the "?" replays the walk-through and lists the shortcuts', () => {
    assert.match(frame, /data-builder-help/);
    assert.match(frame, /data-builder-shortcuts/);
    assert.match(frame, /SHORTCUT_HELP\.map/);
  });
});

describe("the shell wires the rebuild without a second mechanism", () => {
  const shell = readSrc("builder/BuilderShell.tsx");
  const pane = readSrc("builder/WidgetPane.tsx");
  const picker = readSrc("builder/WidgetPicker.tsx");

  test("undo does NOT call the adapter from inside a state updater (D-40)", () => {
    // "Cannot update a component while rendering a different component."
    assert.doesNotMatch(shell, /setHistory\(\(h\) => \{[\s\S]{0,200}p\.onChange/);
    assert.match(shell, /const n = undo\(historyRef\.current\)/);
    assert.match(shell, /const n = redo\(historyRef\.current\)/);
  });

  test("the position of an insert comes from ONE module", () => {
    assert.match(shell, /insertSpotFor\(doc, selection, visibleSectionId\)/);
    // THREE call sites now, not one, and all three are `insertSpotFor`:
    // a widget, a box (§11.12) and the slash command. The rule the original
    // assertion protected is "nobody works the position out by hand", and that
    // is what this says — counting to one was only ever a proxy for it.
    assert.doesNotMatch(shell, /columnIndex: 0, index: 0 \}/,
      "a spot was built by hand instead of asked for");
  });

  test("THE PANE AND THE PICKER SHARE ONE VOCABULARY", () => {
    assert.match(pane, /groupByTask\(adapter, query\)/);
    assert.match(picker, /groupByTask\(p\.adapter, query\)/);
    assert.doesNotMatch(picker, /WIDGETS\.filter/);
  });

  test("the pane, the picker and the slash command build a widget the SAME way", () => {
    assert.match(shell, /const buildWidget = useCallback\(/);
    assert.equal((shell.match(/makeWidget\(def\.kind, props\)/g) || []).length, 1,
      "a second place that decides what a new widget starts with");
  });

  test("the slash command's clear and insert are ONE document operation", () => {
    // Two applies in one tick would compute the second from the stale `doc`
    // prop and the typed "/pricing" would come straight back.
    assert.match(shell, /const cleared = patchWidget\(doc, here, setPropPath\(widget\.props, s\.path, ""\)\)/);
    assert.match(shell, /apply\(insertNode\(cleared, spot\.hostId, spot\.index, made\)\)/);
  });

  test("the counter is a BUTTON that goes somewhere (D-35)", () => {
    const left = readSrc("builder/LeftPane.tsx");
    assert.match(left, /data-builder-problems/);
    assert.match(left, /onClick=\{p\.onJumpToProblem\}/);
    assert.match(shell, /function jumpToProblem\(\)/);
    assert.match(shell, /focusSelector\(problem\.focus!\)/);
  });

  test("a refusal is shown at the control that was pressed (D-20)", () => {
    assert.match(shell, /<AnchoredToast/);
    const toast = readSrc("builder/AnchoredToast.tsx");
    assert.match(toast, /anchorSelector\(p\.anchor\)/);
    assert.match(toast, /getBoundingClientRect\(\)/);
  });

  test("the outline is the pane's second tab, and hiding uses the styling pass's own flag", () => {
    const left = readSrc("builder/LeftPane.tsx");
    assert.match(left, /<Navigator/);
    // M-21 folded the two copies of this into ONE `setHidden`, used by the
    // outline's eye, the widget handle's eye and the right-click menu — three
    // ways in, one writer. The flag is still the styling pass's own.
    assert.match(shell, /withLayer\(w\.style, preview, \{ hidden: hidden \? true : undefined \}\)/);
    assert.match(shell, /withLayer\(sec\.style, preview, \{ hidden: hidden \? true : undefined \}\)/);
    assert.equal((shell.match(/withLayer\([a-z]+\.style, preview, \{ hidden:/g) || []).length, 2,
      "hiding is written in more than one place again");
  });

  test("no drag-and-drop library, and no second picker component", () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const bad of ["react-dnd", "@dnd-kit/core", "react-beautiful-dnd", "sortablejs", "cmdk", "downshift"]) {
      assert.equal(deps[bad], undefined, `${bad} was added; the builder's own events are the one mechanism`);
    }
  });
});

describe("no screen in the rebuild names another product", () => {
  const files = [
    "builder/Canvas.tsx", "builder/AddBar.tsx", "builder/WidgetPicker.tsx", "builder/Navigator.tsx",
    "builder/LeftPane.tsx", "builder/FirstRun.tsx", "builder/AnchoredToast.tsx",
    "builder/BuilderFrame.tsx", "builder/BuilderShell.tsx", "builder/WidgetPane.tsx",
    "builder/widgetTasks.ts", "builder/copy.ts", "builder/problems.ts", "builder/firstRunModel.ts",
    "builder/shortcuts.ts", "builder/navigatorModel.ts", "builder/insertPosition.ts",
  ];
  test("not Elementor, not Gutenberg, not Wix — in anything that renders", () => {
    for (const rel of files) {
      const code = withoutComments(readSrc(rel)).toLowerCase();
      for (const vendor of ["elementor", "gutenberg", "wix", "squarespace", "mailchimp"]) {
        assert.ok(!code.includes(vendor), `${rel} says "${vendor}" outside a comment`);
      }
    }
  });

  test('and nothing says "tenant" to a business owner', () => {
    for (const rel of files) {
      const code = withoutComments(readSrc(rel));
      assert.ok(!/\btenant\b/i.test(code), `${rel} says "tenant"`);
    }
  });
});


/* ══════════════════════════════════════════════════════════════════════════
   9. THE THREE REQUESTS STREAM B WROTE INTO THE HANDOFF
   (REBUILD_HANDOFF_2026-09-16.md — B-A-1, B-A-3, B-A-5)
   ══════════════════════════════════════════════════════════════════════════ */

function cardHtml(mode, price) {
  resetIds();
  const doc = emptyDocument();
  const w = makeWidget("comparison_cards", {
    cards: [{ name: "Standard", price, per: "", list_price: "", features: [""] }],
  });
  return renderWidget(w, makeContext(doc, { mode }));
}

describe("the tier card's price can be clicked (D-01, B-A-1)", () => {
  test("an EMPTY price is a real target, like the two slots beside it", () => {
    // "cards.N.price is 0px wide with no placeholder; unclickable. Tab from the
    // name skips it. Clicking beside it writes into cards.N.per."
    const html = cardHtml("edit", "");
    assert.match(html, /class="bx-now bx-slot bx-now-slot"[^>]*data-edit="cards\.0\.price"/);
    assert.match(html, /data-edit="cards\.0\.price"[^>]*data-placeholder="\$0\.00"/);
  });

  test("the price comes FIRST, so Tab reaches it before the suffix and the strike-through", () => {
    const html = cardHtml("edit", "");
    assert.ok(html.indexOf("cards.0.price") < html.indexOf("cards.0.per"), "Tab still skips the price");
    assert.ok(html.indexOf("cards.0.per") < html.indexOf("cards.0.list_price"));
  });

  test("a price that HAS a figure wears no slot classes", () => {
    const html = cardHtml("edit", "$249.00");
    assert.match(html, /class="bx-now"[^>]*data-edit="cards\.0\.price"/);
  });

  test("the rule the target hangs off exists, and is wider than the small slots", () => {
    const css = readSrc("builder/render.ts");
    assert.match(css, /\.bx-now-slot:empty \{ min-width: 90px; \}/);
  });
});

describe("an unfilled merge field is a slot, not a word (D-03, B-A-5)", () => {
  function prose(mode, merge) {
    resetIds();
    const doc = emptyDocument();
    const w = makeWidget("paragraph", { text: "Service starts {{contract.start_date}} and ends {{contract.end_date}}." });
    return renderWidget(w, makeContext(doc, { mode, merge: merge || {} }));
  }

  test("the author sees a chip they can aim at", () => {
    const html = prose("edit");
    assert.match(html, /<span class="bx-tok" data-token="contract\.start_date"/);
    assert.equal((html.match(/class="bx-tok"/g) || []).length, 2);
  });

  test("the chip carries the token verbatim, so reading the run back is lossless", () => {
    // It lives inside a contentEditable run: innerText has to still say
    // {{contract.start_date}} or typing anywhere in the paragraph would destroy
    // the merge field — which is exactly what the walk did, four times.
    assert.match(prose("edit"), /<span class="bx-tok"[^>]*>\{\{contract\.start_date\}\}<\/span>/);
  });

  test("A FILLED token is not a chip — there is nothing left to fill in", () => {
    const html = prose("edit", { "contract.start_date": "1 November 2026" });
    assert.match(html, /1 November 2026/);
    assert.equal((html.match(/class="bx-tok"/g) || []).length, 1);
  });

  test("BOTH ways text reaches the page are marked, not just prose", () => {
    // A mutation found this: the first version of this block only exercised
    // `paras()`, so deleting the call in `t()` — every heading, every card
    // name, every table cell — stayed green.
    resetIds();
    const doc = emptyDocument();
    const h = renderWidget(makeWidget("heading", { text: "For {{customer.name}}" }),
      makeContext(doc, { mode: "edit", merge: {} }));
    assert.match(h, /<span class="bx-tok" data-token="customer\.name"/);
    assert.doesNotMatch(
      renderWidget(makeWidget("heading", { text: "For {{customer.name}}" }), makeContext(doc, { mode: "view", merge: {} })),
      /bx-tok/);
  });

  test("NOTHING reaches the customer's copy, the PDF or a stored golden", () => {
    for (const mode of ["view", "send"]) {
      assert.doesNotMatch(prose(mode), /bx-tok/, `${mode} mode grew an editor marker`);
    }
  });

  test("the canvas asks about a chip BEFORE it asks which widget was clicked", () => {
    const canvas = readSrc("builder/Canvas.tsx");
    const tok = canvas.indexOf('target.closest<HTMLElement>(".bx-tok")');
    const widget = canvas.indexOf('const widgetEl = target.closest<HTMLElement>("[data-widget]");');
    assert.ok(tok > 0 && tok < widget, "the caret would already be in the words");
    // And with no adapter listening it is an ordinary edit — an engine that
    // refused to edit text because nobody had registered would be worse.
    assert.match(canvas, /onTokenClick \? target\.closest/);
  });
});

describe("a document can carry its own merge values (D-03, B-A-3)", () => {
  test("they survive a round trip", () => {
    const doc = deserialise(JSON.stringify({
      v: 2, sections: [], settings: { style: "plain", merge: { snow_trigger: "2 inches" } },
    }));
    assert.deepEqual(doc.settings.merge, { snow_trigger: "2 inches" });
    assert.equal(JSON.parse(serialise(doc)).settings.merge.snow_trigger, "2 inches");
  });

  test("ABSENT when there is nothing in it — a round trip must not look like an edit", () => {
    const plain = { v: 2, sections: [], settings: { style: "plain" } };
    assert.equal("merge" in deserialise(JSON.stringify(plain)).settings, false);
    assert.equal("merge" in deserialise(JSON.stringify({ ...plain, settings: { style: "plain", merge: {} } })).settings, false);
    // The key ORDER is the model's own (v, settings, sections); what must not
    // change is the content.
    assert.deepEqual(JSON.parse(serialise(deserialise(JSON.stringify(plain)))), plain);
  });

  test("tolerant, like everything else here: rubbish is dropped, not thrown on", () => {
    const doc = deserialise(JSON.stringify({
      v: 2, sections: [],
      settings: { style: "plain", merge: { good: "yes", nested: { a: 1 }, num: 4, "": "blank key" } },
    }));
    assert.deepEqual(doc.settings.merge, { good: "yes", num: "4" });
    assert.equal(deserialise(JSON.stringify({ v: 2, sections: [], settings: { style: "plain", merge: ["a"] } })).settings.merge, undefined);
  });

  test("a whole document still renders with one in place", () => {
    resetIds();
    let doc = emptyDocument();
    const sec = makeSection({ label: "Terms" });
    doc = addSection(doc, sec);
    doc = addWidget(doc, sec.id, 0, makeWidget("paragraph", { text: "Trigger: {{snow_trigger}}." }));
    doc.settings.merge = { snow_trigger: "2 inches" };
    const html = renderDocument(doc, makeContext(doc, { mode: "view", merge: doc.settings.merge }));
    assert.match(html, /Trigger: 2 inches\./);
  });
});

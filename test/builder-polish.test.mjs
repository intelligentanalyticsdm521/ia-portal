// test/builder-polish.test.mjs — the usability POLISH pass (§11.11).
//
// Every describe below names the finding it answers, from
// `overnight-report/BUILDER_USER_TEST_2026-09-17_RERUN.md` §6 (N-1 … N-7) and
// from BUILDER_UX_SPEC_2026-09-16 (M-7, M-8, M-21, M-22, M-23, M-24).
//
// The rule these follow is the platform's: **assert the wanted output
// APPEARS**. "No exception was thrown" is what the send that sent no email
// reported for three weeks.
//
// MUTATION CHECKS — each was made red on purpose and then put back:
//   1. take `data-builder-anchor="send"` off the proposal Send button
//        → "every button that can refuse carries an anchor" red (proposal suite)
//   2. make `writeDetails` keep writing `meta.detailValues`
//        → "the first save MOVES it" red (proposal suite)
//   3. make `travelTo` drop the future instead of keeping it
//        → "the steps after the one you are on stay listed" red
//   4. let `menuFor` put Delete anywhere but last
//        → "Delete is last, separated and destructive" red
//   5. make `setWidgetLocked` unlock a required part
//        → "a required part cannot be unlocked, however it is asked" red
//   6. let `findResults` return a "create" row (and: drop the
//      `createsRecord` filter in findResults, or put `return false` back
//      into createsRecords — both go RED now, neither did before)
//        → "Find never creates a record" red
//   7. put the proposal sentence back on `heading` as a plain string
//        → four "the … pane never reads like a proposal" rows red at once
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  initHistory, push, undo, redo, travelTo, steps, cursor,
  DEFAULT_STEP, FIRST_STEP, HISTORY_LIMIT,
} from "../src/builder/history.ts";
import { menuFor } from "../src/builder/builderMenu.ts";
import { findResults, ALWAYS_ACTIONS, createsRecords, recordMakers, FIND_GROUP_LABEL } from "../src/builder/find.ts";
import {
  makeSection, makeWidget, emptyDocument, serialise, deserialise,
  setWidgetLocked, cloneSection, isRequired, REQUIRED_KINDS,
} from "../src/builder/model.ts";
import { outline } from "../src/builder/navigatorModel.ts";
import { matchShortcut, SHORTCUT_HELP } from "../src/builder/shortcuts.ts";
import { PREMADE_DESIGNS, slotsOverText, textLayerHeight } from "../src/builder/adapters/mybrand/templates.ts";
import { isSavedBlock, savedTemplateEntries, BLOCK_PURPOSE, SAVED_PURPOSE } from "../src/builder/templates.ts";

const SRC = (rel) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");

/** A document with three named sections and something in each. */
function doc3() {
  const d = emptyDocument();
  d.sections = ["Agreement at a glance", "Pricing schedule", "Acceptance"].map((label) => {
    const s = makeSection({ label });
    s.columns[0].widgets = [makeWidget("paragraph", { text: label })];
    return s;
  });
  return d;
}

/* ══════════════════════════════════════════════════════════════════════════
   M-7 — undo is a history you can travel in
   ══════════════════════════════════════════════════════════════════════════ */

describe("M-7 · what you've changed, as named steps you can travel to", () => {
  test("every step carries the words that describe it", () => {
    let h = initHistory("a");
    h = push(h, "b", null, "Added a pricing table");
    h = push(h, "c", null, "Moved “Pricing schedule” up");
    const rows = steps(h);
    assert.deepEqual(rows.map((r) => r.label),
      ["Moved “Pricing schedule” up", "Added a pricing table", FIRST_STEP]);
    assert.equal(rows[0].current, true, "the newest step is not the one we are on");
    assert.equal(rows.filter((r) => r.current).length, 1, "two steps claim to be current");
  });

  test("an unnamed push still says something — never a blank row", () => {
    const h = push(initHistory("a"), "b");
    assert.equal(steps(h)[0].label, DEFAULT_STEP);
    assert.ok(DEFAULT_STEP.trim().length > 0);
  });

  test("one typing burst is ONE step, named for the field and not the keystroke", () => {
    let h = initHistory("");
    for (const v of ["S", "Sn", "Sno", "Snow"]) h = push(h, v, "w1:text", "Typed in the heading");
    assert.equal(h.past.length, 1, "four keystrokes made four steps");
    assert.equal(steps(h)[0].label, "Typed in the heading");
  });

  test("clicking a step travels there, and what came after STAYS listed", () => {
    // MUTATION 3: make travelTo drop `future` and this goes red.
    let h = initHistory("a");
    h = push(h, "b", null, "one");
    h = push(h, "c", null, "two");
    const back = travelTo(h, 0);
    assert.equal(back.present, "a");
    assert.equal(cursor(back), 0);
    const rows = steps(back);
    assert.equal(rows.length, 3, "the steps after the one we travelled to were thrown away");
    assert.deepEqual(rows.filter((r) => r.ahead).map((r) => r.label), ["two", "one"]);
    // …and you can come back.
    assert.equal(travelTo(back, 2).present, "c");
  });

  test("undo and redo ARE travel — one mechanism, not three that can disagree", () => {
    let h = initHistory("a");
    h = push(h, "b", null, "one");
    h = push(h, "c", null, "two");
    assert.deepEqual(undo(h), travelTo(h, 1));
    assert.deepEqual(redo(undo(h)), h);
    assert.equal(undo(initHistory("a")).present, "a", "undo at the bottom moved");
  });

  test("the labels never get out of step with the values", () => {
    let h = initHistory("a");
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = push(h, `v${i}`, null, `step ${i}`);
    assert.equal(h.past.length, h.pastLabels.length);
    assert.equal(steps(h).length, h.past.length + 1 + h.future.length);
    const walked = travelTo(h, 3);
    assert.equal(walked.pastLabels.length, walked.past.length);
    assert.equal(walked.futureLabels.length, walked.future.length);
  });

  test("the panel is a real screen with a way back to each step", () => {
    const panel = SRC("builder/HistoryPanel.tsx");
    assert.match(panel, /data-builder-history="1"/);
    assert.match(panel, /data-history-step=\{s\.index\}/);
    assert.match(panel, /What you&rsquo;ve changed/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   M-8 — right-click anything
   ══════════════════════════════════════════════════════════════════════════ */

describe("M-8 · one menu, wherever it is opened from", () => {
  test("a section's menu carries every verb the spec lists", () => {
    const items = menuFor({ kind: "section", index: 1, total: 3, canPaste: true, canSaveBlock: true });
    const actions = items.map((i) => i.action);
    for (const want of ["edit", "duplicate", "copy", "paste", "moveUp", "moveDown",
      "addAbove", "addBelow", "saveBlock", "showInOutline", "hide", "lock", "delete"]) {
      assert.ok(actions.includes(want), `the menu has no "${want}"`);
    }
  });

  test("a widget is not offered the two things only a section has", () => {
    const actions = menuFor({ kind: "widget" }).map((i) => i.action);
    assert.ok(!actions.includes("addAbove"));
    assert.ok(!actions.includes("addBelow"));
  });

  test("Delete is last, separated and destructive", () => {
    // MUTATION 4: move Delete up one and this goes red.
    const items = menuFor({ kind: "section", index: 0, total: 2 });
    const last = items[items.length - 1];
    assert.equal(last.action, "delete");
    assert.equal(last.danger, true);
    assert.equal(last.separator, true);
    assert.equal(items.filter((i) => i.danger).length, 1, "something else is coloured destructive");
  });

  test("a greyed row carries the REASON, because a grey button explains nothing", () => {
    const locked = menuFor({
      kind: "widget", locked: true,
      lockedReason: "The footer can't be deleted — it has to be on every email you send.",
    });
    for (const a of ["delete", "duplicate"]) {
      const row = locked.find((i) => i.action === a);
      assert.equal(row.disabled, true, `${a} is not greyed on a locked part`);
      assert.match(row.reason, /every email you send/);
    }
    const first = menuFor({ kind: "section", index: 0, total: 3 }).find((i) => i.action === "moveUp");
    assert.equal(first.disabled, true);
    assert.match(first.reason, /already the first/);
    const nothingCopied = menuFor({ kind: "widget", canPaste: false }).find((i) => i.action === "paste");
    assert.match(nothingCopied.reason, /Nothing has been copied/);
  });

  test("the eye and the padlock SAY which state they are in (M-21)", () => {
    const shown = menuFor({ kind: "widget", deviceWord: "on phones" });
    assert.ok(shown.some((i) => i.action === "hide" && /Hide this on phones/.test(i.label)));
    assert.ok(shown.some((i) => i.action === "lock" && /Lock so it can't be deleted/.test(i.label)));
    const hidden = menuFor({ kind: "widget", hidden: true, locked: true, deviceWord: "on phones" });
    assert.ok(hidden.some((i) => i.action === "show" && /Show this on phones again/.test(i.label)));
    assert.ok(hidden.some((i) => i.action === "unlock"));
    assert.ok(!hidden.some((i) => i.action === "hide"), "both halves of the eye are offered at once");
    assert.ok(!hidden.some((i) => i.action === "lock"), "both halves of the padlock are offered at once");
  });

  test("“Save this as my own block” is only offered where it can be saved", () => {
    assert.ok(!menuFor({ kind: "section" }).some((i) => i.action === "saveBlock"),
      "a row that quietly does nothing is worse than a row that is not there");
    assert.ok(menuFor({ kind: "section", canSaveBlock: true }).some((i) => i.action === "saveBlock"));
  });

  test("the page, the widget handle and the outline all open the SAME menu", () => {
    const canvas = SRC("builder/Canvas.tsx");
    const nav = SRC("builder/Navigator.tsx");
    const shell = SRC("builder/BuilderShell.tsx");
    assert.match(canvas, /onContextMenu=\{\(e\) => \{/, "right-click does nothing on the page");
    assert.match(canvas, /setAttribute\("data-widget-more", "1"\)/, "the widget handle has no ⋯");
    assert.match(nav, /data-nav-more="1"/, "the outline row has no more menu");
    // One builder of the items, one runner of them.
    assert.equal((shell.match(/menuFor\(\{/g) || []).length, 1, "the menu is built in two places");
    assert.equal((shell.match(/const runMenuAction = useCallback/g) || []).length, 1);
    assert.match(shell, /<ContextMenu/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   M-21 — lock and hide, visibly
   ══════════════════════════════════════════════════════════════════════════ */

describe("M-21 · lock and hide say which they are", () => {
  test("locking writes the ONE flag the remove operations already refuse on", () => {
    const d = doc3();
    const path = { sectionId: d.sections[0].id, columnIndex: 0, widgetIndex: 0 };
    const locked = setWidgetLocked(d, path, true);
    assert.equal(locked.sections[0].columns[0].widgets[0].locked, true);
    const unlocked = setWidgetLocked(locked, path, false);
    assert.equal("locked" in unlocked.sections[0].columns[0].widgets[0], false,
      "an unlocked widget still carries the key, so a clean document is no longer byte-identical");
    assert.equal(serialise(unlocked), serialise(d));
  });

  test("a required part cannot be unlocked, however it is asked", () => {
    // MUTATION 5: drop the isRequired guard in setWidgetLocked and this is red.
    const d = emptyDocument();
    const s = makeSection({ label: "Footer" });
    s.columns[0].widgets = [makeWidget("email_footer", {}, { locked: true })];
    d.sections = [s];
    const path = { sectionId: s.id, columnIndex: 0, widgetIndex: 0 };
    const after = setWidgetLocked(d, path, false);
    assert.equal(after.sections[0].columns[0].widgets[0].locked, true,
      "the unsubscribe footer was unlocked, which is one click from deleting it");
    assert.ok(REQUIRED_KINDS.has("email_footer"));
    assert.equal(isRequired(makeWidget("paragraph")), false);
  });

  test("the outline row shows the state and can change it", () => {
    const nav = SRC("builder/Navigator.tsx");
    assert.match(nav, /data-nav-locked=\{rowLocked \? "1" : "0"\}/);
    assert.match(nav, /data-nav-locked="required"/, "a required part offers an unlock it cannot honour");
    assert.match(nav, /<LockOpen size=\{11\} \/>/);
  });

  test("the widget handle carries both, with the state in the attribute", () => {
    const canvas = SRC("builder/Canvas.tsx");
    assert.match(canvas, /data-widget-hidden/);
    assert.match(canvas, /data-widget-locked/);
  });

  test("the outline knows which parts the author may not unlock", () => {
    const d = emptyDocument();
    const s = makeSection({ label: "Footer" });
    s.columns[0].widgets = [makeWidget("email_footer", {}, { locked: true }), makeWidget("paragraph")];
    d.sections = [s];
    const rows = outline(d).filter((r) => r.kind === "widget");
    assert.equal(rows[0].required, true);
    assert.equal(rows[1].required, false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   M-22 — Find
   ══════════════════════════════════════════════════════════════════════════ */

describe("M-22 · one box: sections, then things to add, then what to do", () => {
  const input = { doc: doc3(), adapter: "proposal" };

  test("Ctrl+E opens it, and the “?” panel lists the chord", () => {
    assert.equal(matchShortcut({ key: "e", ctrlKey: true }), "find");
    assert.equal(matchShortcut({ key: "E", metaKey: true }), "find");
    assert.ok(SHORTCUT_HELP.some((r) => r.keys === "Ctrl + E"),
      "an advertised shortcut that is not listed is a shortcut nobody finds");
    assert.ok(SHORTCUT_HELP.some((r) => /Ctrl \+ Shift \+ H/.test(r.keys)));
  });

  test("sections come FIRST — somebody typing “pri” means the one they can see", () => {
    const rows = findResults("pricing", input);
    assert.equal(rows[0].kind, "section");
    assert.equal(rows[0].label, "Pricing schedule");
    const kinds = rows.map((r) => r.kind);
    assert.ok(kinds.indexOf("section") < kinds.lastIndexOf("widget") || !kinds.includes("widget"));
    assert.ok(kinds.lastIndexOf("widget") < kinds.indexOf("action") || !kinds.includes("action")
      || kinds.indexOf("action") > kinds.indexOf("widget"));
  });

  test("an empty box offers the ACTIONS, not a wall of everything", () => {
    const rows = findResults("", input);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.kind === "action"));
    assert.ok(rows.some((r) => r.actionId === "outline"));
  });

  test("every word has to match, so two words narrow", () => {
    assert.equal(findResults("pricing acceptance", input).filter((r) => r.kind === "section").length, 0);
  });

  test("an adapter's own actions are offered beside the engine's", () => {
    const rows = findResults("send", {
      ...input,
      actions: [{ id: "send", label: "Send to customer", hint: "Email them a link" }],
    });
    assert.ok(rows.some((r) => r.actionId === "send"));
  });

  test("it FINDS and JUMPS — it never creates a record (D-25)", () => {
    // MUTATION 6: add a "create" row to ALWAYS_ACTIONS and this goes red.
    //
    // `createsRecords` was `return false` until 2026-09-17 — a constant in
    // the shape of a guard, which passed this line on the day somebody added
    // a creating action. It now reads the rows, so the three assertions
    // below are about the real thing.
    assert.equal(createsRecords(), false, "nothing the ENGINE offers makes a row");
    const creator = { id: "new-page", label: "Add a page", createsRecord: true };
    assert.equal(createsRecords([creator]), true,
      "a flagged action has to be SEEN — a guard that cannot go true is not a guard");
    assert.deepEqual(recordMakers([...ALWAYS_ACTIONS, creator]), [creator]);
    // … and Find refuses to offer it, whichever side put it there.
    const offered = findResults("page", { ...input, actions: [creator] });
    assert.equal(offered.some((r) => r.actionId === "new-page"), false,
      "Find must never offer a row that makes a record (D-25)");
    assert.equal(findResults("", { ...input, actions: [creator] })
      .some((r) => r.actionId === "new-page"), false,
      "… including on the empty box, which lists the actions");
    for (const a of ALWAYS_ACTIONS) {
      assert.ok(!/^(new|create|add a page|make)/i.test(a.label),
        `Find offers "${a.label}", which makes a row from inside the editor — that is D-25`);
    }
    const every = findResults("", input).concat(findResults("a", input));
    for (const r of every) {
      assert.ok(r.kind !== "action" || !/create|new page/i.test(r.label));
    }
  });

  test("the box says what each run of rows is", () => {
    assert.deepEqual(Object.keys(FIND_GROUP_LABEL).sort(), ["action", "section", "widget"]);
    const box = SRC("builder/FindBox.tsx");
    assert.match(box, /data-builder-find="1"/);
    assert.match(box, /data-find-result=\{r\.id\}/);
  });

  test("a widget's row reads in THIS builder's words (N-4)", () => {
    const inEmail = findResults("heading", { doc: doc3(), adapter: "email" }).find((r) => r.kind === "widget");
    const inDoc = findResults("heading", input).find((r) => r.kind === "widget");
    assert.ok(inEmail && inDoc);
    assert.notEqual(inEmail.hint, inDoc.hint);
    assert.ok(!/document|scope of work/i.test(inEmail.hint));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   M-23 — save your own block
   ══════════════════════════════════════════════════════════════════════════ */

describe("M-23 · the part you write the same way every time", () => {
  test("a block and a template are ONE store, told apart by their shape", () => {
    assert.equal(isSavedBlock({ document: { sections: [{}] } }), true);
    assert.equal(isSavedBlock({ document: { sections: [{}, {}] } }), false);
    assert.equal(isSavedBlock({}), false);
  });

  test("it is filed under “Your own blocks” in the library", () => {
    const rows = [
      { id: "1", name: "Severe weather clause", description: "Every winter agreement", document: { sections: [{}] } },
      { id: "2", name: "Snow agreement", description: "", document: { sections: [{}, {}] } },
    ];
    const entries = savedTemplateEntries(rows, () => emptyDocument());
    assert.equal(entries[0].purpose, BLOCK_PURPOSE);
    assert.equal(entries[1].purpose, SAVED_PURPOSE);
    assert.match(entries[0].useCase, /Every winter agreement/);
  });

  test("and in the “+” picker, as its own list", () => {
    const gallery = SRC("builder/SectionGallery.tsx");
    assert.match(gallery, /Your own blocks · \$\{blocks\.length\}/);
    assert.match(gallery, /data-saved-block=\{t\.id\}/);
    assert.match(gallery, /onPlaceSavedBlock/);
  });

  test("the name-and-one-line dialog replaces a browser prompt", () => {
    const dlg = SRC("builder/NameBlockDialog.tsx");
    assert.match(dlg, /data-builder-nameblock="1"/);
    assert.match(dlg, /data-block-name/);
    assert.match(dlg, /data-block-note/);
    assert.ok(!/window\.prompt\(/.test(dlg), "the dialog still calls a browser prompt");
  });

  test("dropping the same block twice makes two sections, not two views of one", () => {
    const original = doc3().sections[0];
    const a = cloneSection(original);
    const b = cloneSection(original);
    assert.notEqual(a.id, b.id);
    assert.notEqual(a.columns[0].widgets[0].id, b.columns[0].widgets[0].id);
    assert.notEqual(a.columns[0].widgets[0].id, original.columns[0].widgets[0].id);
  });

  test("the proposal adapter saves it through the store it already has", () => {
    const builder = SRC("builder/proposal/ProposalBuilder.tsx");
    assert.match(builder, /onSaveBlock=\{async \(section, name, note\)/);
    assert.match(builder, /sections: \[section\]/, "a block is saved as one section, which is what makes it a block");
    assert.ok(!/\/proposal-blocks/.test(builder), "a second store was added for blocks");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   N-3 — nothing covers the words in the Design Studio
   ══════════════════════════════════════════════════════════════════════════ */

describe("N-3 · a picture slot never sits over a headline", () => {
  const BRAND = {
    businessName: "Northwind Commercial Services",
    logoUrl: "",
    colours: { primary: "#111111", secondary: "#222222", accent: "#333333", text: "#444444", background: "#555555" },
    fonts: { heading: "Inter", body: "Inter" },
  };

  test("a text layer is measured by what it WRAPS to, not by its one stored line", () => {
    const oneLine = { kind: "text", content: "Hi", size: 40, w: 900, lineHeight: 1.2 };
    const twoLines = { kind: "text", content: "x".repeat(120), size: 40, w: 300, lineHeight: 1.2 };
    assert.ok(textLayerHeight(twoLines) > textLayerHeight(oneLine) * 2,
      "a wrapped headline measures as one line, which is how a slot lands on its second");
  });

  for (const d of PREMADE_DESIGNS) {
    test(`${d.key}: no picture slot covers any words`, () => {
      // MUTATION: move ig_post's logo slot to y:470 and this goes red.
      const bad = slotsOverText(d.build(BRAND, d.count?.default));
      assert.deepEqual(bad, [],
        bad.map((x) => `${x.slot} covers “${x.text}”`).join("; "));
    });
  }

  test("and the check reads the SAME scenes the studio opens", () => {
    assert.ok(PREMADE_DESIGNS.length >= 8, "templates went missing from the gallery");
    for (const d of PREMADE_DESIGNS) {
      const scene = d.build(BRAND, d.count?.default);
      assert.ok(scene.layers.length > 0, `${d.key} opens empty`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   N-5 / N-6 — the landing surface
   ══════════════════════════════════════════════════════════════════════════ */

describe("N-5 · the landing surface asks with the app's own dialog", () => {
  const page = SRC("pages/spark/SparkLandingPagesPage.tsx");

  test("no browser grey box anywhere on it", () => {
    assert.ok(!/(?<!`)window\.confirm\(/.test(page.replace(/^\s*\*.*$/gm, "")),
      "window.confirm is back on the landing surface");
    assert.ok(!/window\.alert\(/.test(page));
  });

  test("it is the SAME component the website's Publish confirm uses", () => {
    assert.match(page, /<IadmModal/);
    assert.match(page, /size="confirm"/);
    assert.match(page, /data-landing-confirm="1"/);
    const website = SRC("builder/adapters/website/WebsiteBuilder.tsx");
    assert.match(website, /size="confirm"/, "the two confirms drifted apart");
  });

  test("both questions name the row and say what happens", () => {
    assert.match(page, /Put “\$\{p\.name\}” on the internet\?/);
    assert.match(page, /Delete “\$\{p\.name\}”\?/);
    assert.match(page, /anybody holding the link will get a “page not found”/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   M-24 — it opens from the document alone
   ══════════════════════════════════════════════════════════════════════════ */

describe("M-24 · nothing waits on the catalogue before the page is on screen", () => {
  test("the canvas carries the marker the open-time measurement reads", () => {
    assert.match(SRC("builder/Canvas.tsx"), /data-builder-canvas=\{doc\.sections\.length\}/);
  });

  test("the pane says “loading your catalogue…” rather than “nothing here”", () => {
    const builder = SRC("builder/proposal/ProposalBuilder.tsx");
    assert.match(builder, /data-catalogue-loading="1"/);
    assert.match(builder, /Loading your catalogue…/);
    // And it stops saying it when the read fails, or it says it for ever.
    assert.match(builder, /\.finally\(\(\) => setCatalogueLoading\(false\)\)/);
  });

  test("the catalogue, the clauses and the templates are read in parallel, after mount", () => {
    const builder = SRC("builder/proposal/ProposalBuilder.tsx");
    assert.ok(!/await api\.get<any>\("\/catalog\/offerings/.test(builder),
      "the catalogue is awaited before the builder renders");
  });
});

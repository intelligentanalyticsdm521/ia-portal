// test/builder-screen-d165.test.mjs — THE BUILDER SCREEN (scope §11.13.1, D-165).
//
// Brandon, 2026-09-19: "Widgets on the side — all the widgets should be on the
// left side. This is the 5th time that I have explained this. You have all this
// random details on the side. I never asked for any of that."
//
// Ground truth: a live Elementor 4.2.4 in WordPress Playground, driven on
// 2026-09-19 (screenshots and the panel dump under
// overnight-report/d165-screens/), plus the machine catalogue
// BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json.
//
// ── WHAT IS EXECUTED HERE, NOT READ ─────────────────────────────────────────
// widgetGroups.ts, shortcuts.ts, AddSection's preset arithmetic and Navigator's
// clamp are PURE, so every one of them is called for real. The React files are
// read as source, because `node --test` has no DOM — the assertions on those
// name the exact expression, so a mutation shows up rather than a shape that
// still matches.
//
// ── THE SIX MUTATIONS (run 2026-09-19, each restored) ───────────────────────
//  1 GROUP_BY_KIND: drop `heading` → "unmappedKinds names every kind" RED.
//  2 PANEL_GROUPS: put "General" before "Basic" → the order test RED.
//  3 openGroups: open only the first group again → "EVERY accordion starts
//    open, searched or not" RED. (Was the other way round until 2026-09-19.)
//  4 matchShortcut: answer "paste" before "pasteStyle" → Ctrl+Shift+V RED.
//  5 matchShortcut: drop the TYPING_PASSES_THROUGH check → "Ctrl+C in a text
//    field is the browser's" RED.
//  6 clampToViewport: return `at` untouched → "the title bar cannot be dragged
//    off screen" RED.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  LAST_GROUP, PANEL_GROUPS, flatPanelMatches, groupFor, openGroups,
  panelGroups, unmappedKinds,
} from "../src/builder/widgetGroups.ts";
import {
  ALL_ACTIONS, SHORTCUT_HELP, TYPING_PASSES_THROUGH, matchShortcut, preventsDefault,
  shortcutHelpGaps,
} from "../src/builder/shortcuts.ts";
import { STRUCTURE_PRESETS, structureSumsTo100 } from "../src/builder/AddSection.tsx";
import { STRUCTURE_SIZE, clampToViewport, defaultStructureAt } from "../src/builder/Navigator.tsx";
import { INSPECTOR_TABS, tabLabel } from "../src/builder/StyleGroups.tsx";
import { PREVIEW_DEVICES, nextPreview } from "../src/builder/responsive.ts";
import { BUILDER_ADAPTERS, WIDGETS_BY_KIND, presetFor, widgetsFor } from "../src/builder/registry.ts";
import { makeContext, renderDocument } from "../src/builder/render.ts";

const SRC = path.join(process.cwd(), "src");
const readSrc = (rel) => readFileSync(path.join(SRC, rel), "utf8");
/** The file with its comments taken out — a rule about CODE, not about prose. */
const noComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/* ══════════════════════════════════════════════════════════════════════════
   1. The left panel is the widgets panel
   ══════════════════════════════════════════════════════════════════════════ */

describe("§11.13.1 item 1 — the left panel holds widgets and nothing else", () => {
  const pane = readSrc("builder/WidgetPane.tsx");
  const shell = readSrc("builder/BuilderShell.tsx");

  test("the groups are the reference editor's four, in its order", () => {
    // Elementor's own panel, read out of the live editor on 2026-09-19:
    // Layout (Container, Grid) · Basic (9) · General (21) · then the plugin
    // groups.
    //
    // There is no "Pro" group (integration, 2026-09-19). No widget carries
    // that category, and a group with nothing behind it is a door onto a wall;
    // the website's Pro rows live in arion's emitter, which shows them and
    // refuses them by name on Lite (§11.12). PANEL_GROUPS is the REGISTRY's
    // own list, so a fifth group cannot be invented in the panel's file.
    assert.deepEqual([...PANEL_GROUPS],
      ["Layout", "Basic", "General", "Intelligent Analytics"]);
  });

  test("every kind every adapter offers is placed — nothing falls in silently", () => {
    // The presence guard. A kind nobody mapped is still SHOWN (losing it off
    // the panel would be worse) and named here, so a new widget cannot arrive
    // in the wrong group without somebody being told.
    assert.deepEqual(unmappedKinds(), []);
  });

  test("the reference's own placements are ours — executed, per adapter", () => {
    // The group is the REGISTRY's own `category`, so this reads the real
    // definitions rather than a second table keyed by kind.
    const at = (kind) => groupFor(WIDGETS_BY_KIND[kind]);
    assert.equal(at("heading"), "Basic");
    assert.equal(at("paragraph"), "Basic");   // "Text Editor"
    assert.equal(at("list"), "General");      // "Icon List"
    assert.equal(at("testimonial"), "General");
    assert.equal(at("container"), "Layout");
    assert.equal(at("catalog_card"), "Intelligent Analytics");
    assert.equal(at("totals"), "Intelligent Analytics");
    // A category the panel cannot draw never throws and never disappears.
    assert.equal(groupFor({ category: "Not A Real Group" }), LAST_GROUP);
  });

  test("a builder's groups come back in PANEL_GROUPS order, never the registry's", () => {
    for (const adapter of BUILDER_ADAPTERS) {
      const order = panelGroups(adapter).map((g) => g.group);
      const want = PANEL_GROUPS.filter((g) => order.includes(g));
      assert.deepEqual(order, [...want], `${adapter} draws its groups out of order`);
      // Every widget the adapter offers is in exactly one group.
      const flat = panelGroups(adapter).flatMap((g) => g.widgets.map((w) => w.kind));
      assert.equal(new Set(flat).size, flat.length, `${adapter} shows a widget twice`);
      assert.equal(flat.length, widgetsFor(adapter).length, `${adapter} lost a widget`);
    }
  });

  test("EVERY accordion starts open, searched or not", () => {
    /* WAS "a search opens what matched; an empty box opens only the first".
       Brandon opened the panel on 2026-09-19 and saw two tiles and three shut
       headings; the reference editor's panel shows them all. The widgets ARE
       the panel, so hiding them behind headings is hiding the panel. */
    const all = panelGroups("proposal");
    assert.ok(all.length > 1, "there is only one group, so this proves nothing");
    assert.deepEqual(openGroups(all, ""), all.map((g) => g.group),
      "an empty search shuts an accordion again");
    const hits = panelGroups("proposal", "heading");
    assert.ok(hits.length > 0, "this test's premise is gone — nothing matches 'heading'");
    assert.deepEqual(openGroups(hits, "heading"), hits.map((g) => g.group));
    assert.deepEqual(openGroups([], ""), []);
    // And the rule is in ONE place: the panel asks for the default rather than
    // deciding for itself which heading is open.
    assert.match(pane, /openGroups\(groups, query\)/);
  });

  test("the search still narrows, and Enter's pick is the first tile drawn", () => {
    const groups = panelGroups("proposal", "heading");
    const firstDrawn = groups[0].widgets[0];
    assert.equal(flatPanelMatches("proposal", "heading")[0].kind, firstDrawn.kind,
      "Enter would insert a different widget from the one at the top of the list");
  });

  test("the panel is a title, a search box and the groups — no injection slot", () => {
    assert.match(pane, /PANE_TITLE/);
    // ABSENT / PRESENT (D-172): the reference editor's own placeholder.
    assert.doesNotMatch(pane, /aria-label="Search widgets"/, "the search box is ours again");
    assert.match(pane, /aria-label=\{PANE_SEARCH_PLACEHOLDER\}/);
    assert.match(pane, /data-pane-group-toggle=\{g\.group\}/);
    for (const gone of [/<Navigator/, /data-builder-problems/, /header\?:/, /hint\?:/]) {
      assert.doesNotMatch(pane, gone, `the left panel grew something again: ${gone}`);
    }
    // The shell must not offer an adapter a way to push anything in either.
    assert.doesNotMatch(noComments(shell), /paneHeader/, "the injection slot is back on the shell");
    assert.match(shell, /pane=\{panel \? \(\s*<WidgetPane/);
  });

  test("a tile is an icon over a name, two across, and a locked one refuses both doors", () => {
    assert.match(pane, /grid-cols-2/);
    assert.match(pane, /<WidgetIcon name=\{w\.icon\}/);
    assert.match(pane, /onClick=\{\(\) => \{ if \(!lock\) onInsert\(w\); \}\}/);
    assert.match(pane, /draggable=\{!!onDragWidget && !lock\}/);
    assert.match(pane, /if \(lock\) \{ e\.preventDefault\(\); return; \}/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. Settings on the right, three tabs
   ══════════════════════════════════════════════════════════════════════════ */

describe("§11.13.1 item 2 — Content / Style / Advanced, on the right", () => {
  const inspector = readSrc("builder/Inspector.tsx");

  test("three tabs, and a container's first one is called Layout", () => {
    // The machine catalogue: every container section is `tab: "layout"`, every
    // widget's first is `tab: "content"`. One list, one `first` argument.
    assert.deepEqual([...INSPECTOR_TABS], ["content", "style", "advanced"]);
    assert.equal(tabLabel("content", "Content"), "Content");
    assert.equal(tabLabel("content", "Layout"), "Layout");
    assert.equal(tabLabel("style", "Layout"), "Style");
    assert.equal(tabLabel("advanced", "Content"), "Advanced");
  });

  test("the panel says “Edit <name>”, and nothing selected is page settings", () => {
    assert.match(inspector, /Edit \{name\}/);
    assert.match(inspector, /data-inspector="page"/);
    assert.match(inspector, /Page settings/);
  });

  test("a widget with no style controls has TWO tabs, not three with one greyed", () => {
    /* WAS "a tab with nothing behind it is GREYED, never removed". Driving it
       showed the worse half of that: pressing the greyed Style tab on a Spacer
       re-rendered the CONTENT section under a Style heading — the same header,
       the same fields. The reference's Spacer has Content and Advanced and
       nothing between them (D-172), so the tab is not drawn at all. */
    assert.ok(!inspector.includes('disabled: InspectorTab[] = hasStyle'),
      "the greyed third tab is back");
    assert.match(inspector, /const tabs: InspectorTab\[\] = hasStyle \? INSPECTOR_TABS : \["content", "advanced"\]/);
    assert.match(inspector, /const shownTab: InspectorTab = tabs\.includes\(tab\) \? tab : "content"/);
    assert.match(readSrc("builder/StyleGroups.tsx"), /const shown = tabs \?\? INSPECTOR_TABS;/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. Structure floats
   ══════════════════════════════════════════════════════════════════════════ */

describe("§11.13.1 item 3 — Structure is a window, not a tab", () => {
  const nav = readSrc("builder/Navigator.tsx");
  const shell = readSrc("builder/BuilderShell.tsx");
  const frame = readSrc("builder/BuilderFrame.tsx");

  test("it is a draggable, closable dialog with the same tree inside it", () => {
    assert.match(nav, /export function StructureWindow/);
    assert.match(nav, /role="dialog"[\s\S]{0,80}aria-label="Structure"/);
    assert.match(nav, /data-structure-grip/);
    assert.match(nav, /data-structure-close/);
    // The SAME Navigator, not a second tree.
    assert.match(nav, /<Navigator \{\.\.\.nav\} collapseAll=\{collapseAll\} \/>/);
    // …and the two things the reference's title bar and footer carry.
    assert.match(nav, /data-structure-collapse/);
    assert.match(nav, /data-structure-resize/);
    assert.equal((shell.match(/<Navigator[ \n]/g) || []).length, 0,
      "the shell renders a second copy of the tree");
  });

  test("three doors, one piece of state: the top bar, Ctrl+I, and the menu", () => {
    assert.match(frame, /data-builder-structurebtn=/);
    assert.match(shell, /onStructure=\{\(\) => setStructure\(\(v\) => !v\)\}/);
    assert.match(shell, /case "structure": setStructure\(\(v\) => !v\); return true;/);
    // The menu's own row is called Structure now, as the reference's is.
    assert.match(shell, /case "structure":[\s\S]{0,260}setStructure\(true\)/);
    assert.equal((shell.match(/useState\(false\);\s*\n\s*\/\*\*\s*\n\s*\* IS THE WIDGETS PANEL/g) || []).length, 1,
      "the structure window grew a second piece of state");
  });

  test("the title bar can never be dragged off screen — executed", () => {
    const vp = { width: 1440, height: 900 };
    // Far right, far down, far left, far up: all four come back reachable.
    for (const at of [{ x: 9000, y: 9000 }, { x: -9000, y: -9000 }, { x: 5, y: -4 }]) {
      const c = clampToViewport(at, vp);
      assert.ok(c.x <= vp.width - 60, `x ${c.x} puts the grip off the right edge`);
      assert.ok(c.y <= vp.height - 28, `y ${c.y} puts the grip below the window`);
      assert.ok(c.x + STRUCTURE_SIZE.width >= 60, `x ${c.x} puts the grip off the left edge`);
      assert.ok(c.y >= 8, `y ${c.y} puts the grip above the window`);
    }
    // A position already on screen is left where it is.
    assert.deepEqual(clampToViewport({ x: 400, y: 200 }, vp), { x: 400, y: 200 });
    // It opens top right, clear of the panel, and that opening spot is legal.
    const open = defaultStructureAt(vp);
    assert.deepEqual(clampToViewport(open, vp), open);
    assert.ok(open.x > vp.width / 2, "it should open on the right");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4 and 5. The top bar, and Add section
   ══════════════════════════════════════════════════════════════════════════ */

describe("§11.13.1 items 4 and 5 — the top bar, and adding a section", () => {
  const frame = readSrc("builder/BuilderFrame.tsx");
  const canvas = readSrc("builder/Canvas.tsx");
  const shell = readSrc("builder/BuilderShell.tsx");
  const add = readSrc("builder/AddSection.tsx");

  test("the top bar carries the panel toggle, the device switcher and structure", () => {
    assert.match(frame, /data-builder-panelbtn=/);
    assert.match(frame, /data-builder-preview=\{p\.preview\}/);
    assert.match(frame, /data-builder-structurebtn=/);
    assert.match(frame, /data-builder-findbtn/);
  });

  test("the add area is IN THE PAGE, and its two round buttons ARE the Blank-or-Template question", () => {
    /* WAS "ONE add button, and it asks Blank or Template first" — a "+ Add"
       pill that opened a pop-up whose first step was a Blank | Template
       choice. Rebuilt on 2026-09-19 as the reference editor's own add area: a
       dashed area in the page with three views, and no pop-up step, because
       the round "+" and the round folder ARE that choice. */
    assert.doesNotMatch(add, /"blank" \| "premade"/, "the two-button shortcut is back");
    assert.doesNotMatch(add, /anchor/, "the add area went back to being a pop-up anchored to a button");
    assert.doesNotMatch(canvas, /data-builder-addsection-btn/, "the + Add pill is back on the page");
    // PRESENT — view 1: the two round buttons, and the words under them.
    assert.match(add, /data-builder-add="container"/);
    assert.match(add, /title="Add New Container"/);
    assert.match(add, /data-builder-add="template"/);
    assert.match(add, /title="Add Template"/);
    assert.match(add, /Drag widget here/);
    // View 2 and view 3, and the "‹" that goes back between them.
    assert.match(add, /Which layout would you like to use\?/);
    assert.match(add, /data-addsection-choice="flex"/);
    assert.match(add, /data-addsection-choice="grid"/);
    assert.match(add, /Select your structure/);
    assert.match(add, /data-structure-preset=\{preset\.key\}/);
    assert.match(add, /data-addsection-back/);
    // The three views are ONE piece of state, named on the area itself.
    assert.match(add, /type View = "buttons" \| "layout" \| "structure"/);
    assert.match(add, /data-builder-addsection=\{view\}/);
    // And the canvas always draws one at the bottom of the page.
    assert.match(canvas, /<AddSection\s+onBlank=\{\(layout, preset\) => props\.onAddBlank\(doc\.sections\.length, layout, preset\)\}/);
  });

  test("the structure presets are real shapes: every one adds to 100", () => {
    // A row of cells that adds to 99 leaves a sliver of background down the
    // side of every page built from it.
    assert.deepEqual(structureSumsTo100(), []);
    assert.ok(STRUCTURE_PRESETS.length >= 8, "fewer presets than the reference's usable set");
    const keys = STRUCTURE_PRESETS.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length, "two presets share a key");
    // The reference's own key for one column, so the two can be compared row
    // by row on the parity sheet.
    assert.ok(keys.includes("c100"));
    assert.deepEqual(STRUCTURE_PRESETS.find((p) => p.key === "c100").cells, [100]);
    assert.deepEqual(STRUCTURE_PRESETS.find((p) => p.key === "50-50").cells, [50, 50]);
  });

  test("Template hands over to the template library, Blank builds the tree", () => {
    // Both doors say WHERE — the index the new section goes in at — and the
    // canvas is the only thing that knows which add area was pressed.
    assert.match(shell, /onAddTemplate=\{\(at: number\) => setGallery\(\{ at \}\)\}/);
    assert.match(shell, /onAddBlank=\{\(at: number, layout: SectionLayout, preset: StructurePreset\) => addStructure\(at, layout, preset\)\}/);
    assert.match(canvas, /onTemplate=\{\(\) => \{ setAddAreaAt\(null\); props\.onAddTemplate\(i\); \}\}/);
    // ONE SHAPE FROM THE ADD AREA (D-172, round 2).
    //
    // ABSENT: the branch that made a ONE-column structure differently from
    // every other one — `if (preset.cells.length > 1)` wrapped the whole tree
    // build, so one column gave a bare section with an empty column and two
    // columns gave a section carrying a container. The author got a different
    // thing to select depending on which tile they pressed, and both panels
    // were titled "Edit Container".
    // PRESENT: every preset makes the same carrier pair — Section, its one
    // column, ONE container — and the cells go INSIDE that container.
    assert.ok(!/if \(preset\.cells\.length > 1\) \{/.test(shell),
      "the one-column structure is special-cased again");
    assert.match(shell, /sec\.columns\[0\]\.widgets = \[box\];/);
    assert.match(shell, /const box = makeContainer\(/);
    // The percentages ride on the SAME key the section ratio picker writes.
    assert.match(shell, /columnWidths: preset\.cells\.map\(\(n\) => n \/ 100\)/);
    // The adapter's veto still runs.
    assert.match(shell, /if \(p\.onAddBlank && p\.onAddBlank\(at\) === false\) return;/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. The keyboard
   ══════════════════════════════════════════════════════════════════════════ */

describe("§11.13.1 item 6 — keyboard parity with the reference editor", () => {
  const shell = readSrc("builder/BuilderShell.tsx");
  const ctrl = (key, extra = {}) => matchShortcut({ key, ctrlKey: true, ...extra });
  const cmd = (key, extra = {}) => matchShortcut({ key, metaKey: true, ...extra });

  test("every chord the scope names answers — executed, on Windows and a Mac", () => {
    const want = [
      ["z", {}, "undo"], ["z", { shiftKey: true }, "redo"], ["y", {}, "redo"],
      ["d", {}, "duplicate"], ["c", {}, "copy"], ["v", {}, "paste"],
      ["v", { shiftKey: true }, "pasteStyle"], ["i", {}, "structure"],
      ["e", {}, "find"], ["p", {}, "togglePanel"], ["m", { shiftKey: true }, "cycleDevice"],
      ["s", {}, "save"],
    ];
    for (const [key, extra, action] of want) {
      assert.equal(ctrl(key, extra), action, `Ctrl+${extra.shiftKey ? "Shift+" : ""}${key}`);
      assert.equal(cmd(key, extra), action, `Cmd+${extra.shiftKey ? "Shift+" : ""}${key}`);
    }
    assert.equal(matchShortcut({ key: "Delete" }), "delete");
    assert.equal(matchShortcut({ key: "Escape" }), "escape");
  });

  test("Ctrl+Shift+V is paste STYLE, and Ctrl+V is still paste", () => {
    // Order matters in the map: answering "paste" first makes paste-style
    // unreachable, which is how an advertised shortcut becomes a lie.
    assert.equal(ctrl("v", { shiftKey: true }), "pasteStyle");
    assert.equal(ctrl("v"), "paste");
    assert.notEqual(ctrl("v", { shiftKey: true }), ctrl("v"));
  });

  test("with the caret in a text field the clipboard chords are the BROWSER'S", () => {
    const typing = { tagName: "INPUT" };
    const editing = { isContentEditable: true };
    for (const t of [typing, editing]) {
      for (const [key, extra] of [["c", {}], ["v", {}], ["v", { shiftKey: true }], ["d", {}]]) {
        assert.equal(matchShortcut({ key, ctrlKey: true, ...extra }, t), null,
          `Ctrl+${key} was stolen from a text field`);
      }
      // ...but Ctrl+Z must still reach the model: the browser's own undo does
      // not know the document exists.
      assert.equal(matchShortcut({ key: "z", ctrlKey: true }, t), "undo");
      assert.equal(matchShortcut({ key: "i", ctrlKey: true }, t), "structure");
      assert.equal(matchShortcut({ key: "Escape" }, t), "escape");
      assert.equal(matchShortcut({ key: "Delete" }, t), null);
    }
    // The list the map reads is the list the test reads.
    assert.deepEqual([...TYPING_PASSES_THROUGH].sort(),
      ["copy", "duplicate", "paste", "pasteStyle"]);
  });

  test("every action the map can return is written down in the help", () => {
    assert.deepEqual(shortcutHelpGaps(), []);
    for (const row of SHORTCUT_HELP) {
      if (row.action) assert.ok(ALL_ACTIONS.includes(row.action), `${row.action} is not an action`);
    }
  });

  test("the browser default is suppressed for every chord but Escape", () => {
    for (const a of ALL_ACTIONS) {
      assert.equal(preventsDefault(a), a !== "escape", a);
    }
  });

  test("the device cycles round, in the toggle's own order — executed", () => {
    const order = PREVIEW_DEVICES.map((d) => d.key);
    let at = order[0];
    const walked = [at];
    for (let i = 0; i < order.length; i++) { at = nextPreview(at); walked.push(at); }
    assert.deepEqual(walked, [...order, order[0]], "the cycle does not come back round");
    assert.equal(nextPreview("nonsense"), order[0]);
  });

  test("copy, paste and duplicate go through the RIGHT-CLICK MENU'S own handler", () => {
    // One mechanism: a keyboard paste and a menu paste must land in the same
    // place, or the two drift and only a customer finds out.
    assert.match(shell, /case "copy": case "paste": case "duplicate": case "pasteStyle":/);
    assert.match(shell, /runMenuAction\(action, target\)/);
    /* AND `pasteStyle` JOINED THEM (integration, 2026-09-19). It had its own
       body in the shortcut switch because the right-click menu did not offer
       the row; the menu offers it now (R-1.7), so there is one handler and the
       chord runs it. MUTATION: give the chord its own `setWidgetStyle` call
       again and the count below goes to two. */
    const menu = readSrc("builder/builderMenu.ts");
    assert.match(menu, /action: "pasteStyle"/, "the right-click menu has no Paste-style row");
    // The reference's own wording, to the character: "Paste style" (D-172).
    // "Paste only the look" was ours.
    assert.ok(!menu.includes("Paste only the look"), "the row is in our words again");
    assert.match(menu, /label: "Paste style"/);
    assert.equal((shell.match(/Pasted the look/g) || []).length, 1,
      "there are two handlers for pasting a look");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §11.13.1 item 2 — Advanced ▸ Attributes, the CSS id and classes
   ══════════════════════════════════════════════════════════════════════════ */

describe("Advanced ▸ Attributes: a name the author gives a part, and it reaches the page", () => {
  const doc = (style) => ({
    v: 2,
    settings: {},
    sections: [{
      id: "s1", layout: 1, visibility: "customer",
      columns: [{ id: "c1", widgets: [{ id: "w1", kind: "heading", props: { text: "Prices" }, style }] }],
    }],
  });
  const draw = (style) => {
    const d = doc(style);
    return renderDocument(d, makeContext(d, { mode: "view" }));
  };

  test("the id and the classes are on the element, not just in the document", () => {
    /* A CONTROL THAT WRITES A FIELD NOTHING READS is worse than a missing one,
       which is why this section waited for the renderers. So the claim is the
       whole round trip: type a name, and it is on the page. */
    const out = draw({ cssId: "prices", cssClasses: "tight two-up" });
    assert.match(out, /id="prices"/, "the author's own name never reached the page");
    assert.match(out, /class="[^"]*\btight\b[^"]*"/, "a styling name never reached the page");
    assert.match(out, /class="[^"]*\btwo-up\b[^"]*"/);
  });

  test("a widget with neither is drawn exactly as it was", () => {
    // Every golden on the line depends on this: nothing is added to a part the
    // author never named.
    const plain = draw(undefined);
    assert.ok(!/ id="/.test(plain), "an unnamed widget grew an id attribute");
    assert.equal(plain, draw({}));
  });

  test("what cannot be an id is not written as one", () => {
    // An id is ONE token: two elements sharing one is a Menu Anchor that jumps
    // to the wrong place, and a quote in an attribute is a broken page.
    const out = draw({ cssId: 'a b" onload=x', cssClasses: "ok <bad>" });
    assert.match(out, /id="a"/, "the id was not reduced to one safe token");
    assert.ok(!out.includes("onload"), "an attribute was injected through the id");
    assert.ok(!out.includes('id="a b'), "the id kept a space, so it is two ids");
    assert.match(out, /class="[^"]*\bok\b/);
    // `<bad>` is not dropped, it is STRIPPED to `bad`: the author typed a word
    // and gets the word, and nothing that could close an attribute survives.
    assert.ok(!out.includes("<bad>"), "a class smuggled markup onto the page");
    assert.match(out, /class="[^"]*\bbad\b/);
  });

  test("the panel offers it, on the Advanced tab", () => {
    const groups = readSrc("builder/StyleGroups.tsx");
    assert.match(groups, /export function AttributesGroup/);
    const inspector = readSrc("builder/Inspector.tsx");
    assert.match(inspector, /<AttributesGroup/);
    // …and it is NOT per device: an id is an id on every screen.
    assert.ok(!/withLayer\([^)]*cssId/.test(inspector), "the id is written per device");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §11.13.1 — "Layout holds exactly Container and Grid, as Elementor's does"
   ══════════════════════════════════════════════════════════════════════════ */

describe("the Layout group offers two tiles, and the Grid tile inserts a box", () => {
  const shell = readSrc("builder/BuilderShell.tsx");
  test("no tile is offered twice", () => {
    /* FOUND BY DRIVING IT, 2026-09-19. The panel held the box PRESETS
       (Box / Row / Grid) above the Layout group's WIDGETS (Container / Grid),
       so "Grid" was two tiles side by side — and the two did different things:
       the preset inserted a real container, the widget inserted a node of kind
       `grid`, which is on UNRENDERED_KINDS because no document ever holds one.
       Pressing it put an invisible thing on the page. */
    for (const adapter of BUILDER_ADAPTERS) {
      const names = panelGroups(adapter).flatMap((g) => g.widgets.map((w) => w.kind));
      assert.equal(new Set(names).size, names.length, `${adapter} offers a tile twice`);
    }
    const pane = readSrc("builder/WidgetPane.tsx");
    assert.ok(!/onPickBox \? boxMatches/.test(pane), "the panel draws the box presets again");
  });

  test("the Grid tile inserts a CONTAINER laid out as a grid, not a kind nothing draws", () => {
    const preset = presetFor("grid");
    assert.ok(preset, "the Grid tile has no preset, so it inserts a widget");
    assert.equal(preset.kind, "container");
    assert.equal(preset.style.direction, "grid");
    // …and the insert seam really asks. MUTATION: take the `presetFor` call out
    // of `insertWidget` and this goes red.
    assert.match(shell, /const preset = presetFor\(def\.kind\);/);
    assert.match(shell, /makeContainer\(preset\.style as ElementStyle, \[\]\)/);
  });

  test("the presets are gone from every SURFACE, and 'row' still finds a tile", () => {
    /* WAS "the picker keeps the presets, because typing '/row' has to reach
       one". Both the pop-up and the slash command that needed it are deleted
       (2026-09-19); the presets are a MODEL fact (`treeOps.CONTAINER_PRESETS`)
       that the ready-made sections build with, not a second list of things to
       press. */
    assert.throws(() => readSrc("builder/WidgetPicker.tsx"), /ENOENT/, "the widget pop-up is back");
    for (const rel of ["builder/BuilderShell.tsx", "builder/WidgetPane.tsx", "builder/Canvas.tsx"]) {
      assert.ok(!/onPickBox|boxMatches/.test(readSrc(rel)), `${rel} offers the box presets as tiles again`);
    }
    // PRESENT: typing "row" in the one panel reaches the Layout group, because
    // the Container tile's own sentence is about rows.
    const hits = panelGroups("proposal", "row");
    assert.ok(hits.some((g) => g.group === "Layout"), "typing 'row' no longer reaches the Layout group");
    assert.ok(hits.flatMap((g) => g.widgets).some((w) => w.kind === "container"),
      "typing 'row' no longer reaches the Container tile");
  });
});

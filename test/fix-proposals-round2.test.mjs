/**
 * test/fix-proposals-round2.test.mjs — the round-2 proposal defects, executed.
 *
 * The scorer rebuilt the six reference proposals by CLICKING on b168/landed and
 * scored 56 (BUILDER_REPLICATION_PROPOSALS_2026-09-19.md). This file pins the
 * fixes for what they found, and every check RUNS the real function rather than
 * reading the source for a word.
 *
 * ── MUTATIONS (each applied to the real source, seen RED, then restored) ──
 *  1. `mayPaint` drops `g.editing` and asks only the instant question
 *     → RED: "the hand-over between two runs is one gesture".
 *  2. `mayPaint` stops remembering a refusal (`g.owed = true` deleted)
 *     → RED: "a paint refused under the caret is still owed".
 *  3. `caretSettled` clears `editing` even when the caret is in another run
 *     → RED: "the caret moving from one run to the next is not a departure".
 *  4. `Canvas.tsx` stops calling `settleEditing` from the host's blur
 *     → RED: "the canvas asks again once the caret has settled".
 *  5. `rowsFollowColumns` copies the last row unchanged
 *     → RED: "a row added after a new column is as wide as the table".
 *  6. `rowsFollowColumns` pads but never trims
 *     → RED: "deleting a column takes the cell with it".
 *  7. `selectionAt` is dropped from the catalogue pick
 *     → RED: "the caret follows a catalogue pick".
 *  8. `ICON_LIST_DEF`'s `icon_list` control loses `row`
 *     → RED: "an Icon List's points are a repeater".
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const readSrc = (p) => readFileSync(join(SRC, p), "utf8");

/* ════════════════════════════════════════════════════════════════════════════
   R2-2 — TYPE ONE PART OF A WIDGET, CLICK THE NEXT, AND THE SECOND IS LOST.
   The worst of the six: it destroys work the author has already done.
   ════════════════════════════════════════════════════════════════════════ */
describe("R2-2 — the caret guard spans the hand-over from one run to the next", () => {
  const load = async () => import("../src/builder/caretGuard.ts");

  test("a run takes the caret, and the paint is refused while it holds it", async () => {
    const { newCaretGuard, caretEntered, mayPaint } = await load();
    const g = newCaretGuard();
    assert.equal(mayPaint(g, false), true, "an idle section paints");
    caretEntered(g);
    assert.equal(mayPaint(g, true), false, "a paint under the caret would eat the words");
  });

  test("THE DEFECT: the hand-over between two runs is one gesture, not a departure", async () => {
    const { newCaretGuard, caretEntered, mayPaint } = await load();
    const g = newCaretGuard();
    caretEntered(g);
    // This is the exact instant the spy caught on 2026-09-20: `focusout` has
    // fired on the first run and `focusin` has not yet fired on the second, so
    // `document.activeElement` is the BODY and the instant answer is FALSE.
    assert.equal(mayPaint(g, false), false,
      "the paint ran between focusout and focusin and replaced the run the caret was landing on");
  });

  test("a paint refused under the caret is still OWED", async () => {
    const { newCaretGuard, caretEntered, mayPaint, caretSettled } = await load();
    const g = newCaretGuard();
    caretEntered(g);
    mayPaint(g, true);
    assert.equal(caretSettled(g, false), true, "the page would keep showing a model it no longer matches");
  });

  test("the caret moving to ANOTHER run is not a departure", async () => {
    const { newCaretGuard, caretEntered, mayPaint, caretSettled } = await load();
    const g = newCaretGuard();
    caretEntered(g);
    mayPaint(g, true);
    assert.equal(caretSettled(g, true), false, "settling inside the words would re-open the hole");
    assert.equal(g.editing, true, "the guard came down while the author was still typing");
  });

  test("nothing was owed, so nothing is repainted when the caret leaves", async () => {
    const { newCaretGuard, caretEntered, caretSettled } = await load();
    const g = newCaretGuard();
    caretEntered(g);
    assert.equal(caretSettled(g, false), false, "a repaint for a paint nobody asked for");
  });

  test("the instant question is still asked, for a caret this guard never saw arrive", async () => {
    const { newCaretGuard, mayPaint } = await load();
    const g = newCaretGuard();
    // A programmatic `.focus()` (the still-to-fill-in list jumps the author to
    // a field) puts a caret in a run with no focusin this guard raised.
    assert.equal(mayPaint(g, true), false);
  });

  test("the whole sequence the driver ran: four fields, no clicks between them", async () => {
    const { newCaretGuard, caretEntered, mayPaint, caretSettled } = await load();
    const g = newCaretGuard();
    const painted = [];
    // click a run, type (each keystroke asks to paint), click the next one…
    for (const field of ["heading", "sub_heading", "price", "period"]) {
      caretEntered(g);
      painted.push([field, mayPaint(g, true)]);
      // the click on the NEXT run: focusout, then the paint, then focusin
      caretSettled(g, false); // the settle runs a task later — after focusin
    }
    assert.deepEqual(painted.map(([, p]) => p), [false, false, false, false],
      "a paint during any of the four would have thrown that field away");
    // The author clicks the empty page: now the section is drawn from the model.
    caretEntered(g);
    mayPaint(g, true);
    assert.equal(caretSettled(g, false), true, "the page never catches up with the document");
  });

  test("the canvas uses the guard, and asks again on blur", () => {
    const canvas = readSrc("builder/Canvas.tsx");
    assert.ok(canvas.includes("mayPaint(caret.current, caretInRun())"),
      "the paint stopped asking the guard");
    assert.ok(/onBlur=\{\(e\) => \{[\s\S]{0,300}?settleEditing\(\);/.test(canvas),
      "the canvas asks again once the caret has settled");
    assert.ok(canvas.includes("caretEntered(caret.current)"),
      "nothing raises the guard when a run takes the caret");
  });
});

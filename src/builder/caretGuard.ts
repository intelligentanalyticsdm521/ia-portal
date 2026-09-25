/**
 * builder/caretGuard.ts — "is the author typing?", asked over the whole
 * gesture instead of at one instant (R2-2, 2026-09-20).
 *
 * ── THE DEFECT THIS EXISTS TO END ─────────────────────────────────────────
 * The canvas paints a section by writing the renderer's HTML into the host
 * with `innerHTML`, and it must never do that under a caret — so it asked
 * `document.activeElement` and skipped while the answer was a run of words.
 *
 * Driven on 2026-09-20: Title / Description / Price / Cadence typed straight
 * through a Price Table left "Essential · $149". The second and the fourth
 * were thrown away, every time, and the spy on the section host says why:
 *
 *     focusin heading · focusout heading · REPAINT active=BODY · focusin price
 *
 * There is no `focusin sub_heading` in that list at all. Clicking the next run
 * moves the caret in the mousedown's DEFAULT ACTION, which dispatches
 * `focusout` on the old run and then `focusin` on the new one. For the instant
 * between them `document.activeElement` is the BODY — so the guard, asked at
 * exactly that instant, said "nobody is typing", the paint ran, and the run the
 * browser was one step from focusing was replaced by a brand new node. The
 * caret landed on a node that is no longer in the document, and every keystroke
 * after it went nowhere.
 *
 * The guard was a presence test asked at the wrong moment. Here it spans the
 * hand-over: raised when a run takes the caret, lowered only once the browser
 * has FINISHED moving it, and a paint refused in between is REMEMBERED rather
 * than dropped, because the thing it was going to draw is still owed.
 *
 * ── WHY IT IS NOT PINNED TO THE POINTER ───────────────────────────────────
 * "Skip the paint while the mouse button is down" would close the same hole
 * for a click and leave it wide open for Tab, which moves the caret from one
 * run to the next with no pointer anywhere near it. The question is about the
 * CARET, so it is asked about the caret.
 *
 * ── WHY IT IS A MODULE ────────────────────────────────────────────────────
 * It is three lines of state and three rules, and it decides whether an
 * author's words survive. In a component those rules can only be checked by
 * clicking; here they are executed by `test/fix-proposals-round2.test.mjs`.
 * The component keeps one of these in a ref and does what it says.
 */

export interface CaretGuard {
  /** A run of words holds the caret, or is one step from holding it. */
  editing: boolean;
  /** A paint was refused while it did, and has not been drawn yet. */
  owed: boolean;
}

export const newCaretGuard = (): CaretGuard => ({ editing: false, owed: false });

/** A run of words took the caret. */
export function caretEntered(g: CaretGuard): void {
  g.editing = true;
}

/**
 * The paint asks permission.
 *
 * `caretInRun` is the instant answer — "is the caret inside an editable run of
 * THIS section right now" — and it is still asked, because the very first
 * gesture of a session raises nothing: a click into a run fires `focusin`
 * before anything repaints, but an author who arrives by any other route
 * (restored focus, a programmatic `.focus()`) has a caret and no `focusin` this
 * guard saw.
 *
 * Returns true when the section may be repainted now. A refusal is remembered.
 */
export function mayPaint(g: CaretGuard, caretInRun: boolean): boolean {
  if (g.editing || caretInRun) {
    g.owed = true;
    return false;
  }
  g.owed = false;
  return true;
}

/**
 * The browser has finished moving the caret; ask again.
 *
 * Returns true when a paint that was refused is now due — which is the half
 * that matters: a guard that only refused would leave the page showing a model
 * it no longer matches the moment the author clicked away.
 */
export function caretSettled(g: CaretGuard, caretInRun: boolean): boolean {
  // Still in the words: the caret moved from one run to another, which is the
  // hand-over this guard exists for and not the end of anything.
  if (caretInRun) return false;
  g.editing = false;
  return g.owed;
}

/**
 * builder/problems.ts — "what is still wrong", and how to get to it.
 *
 * D-03, D-20 and D-35 of BUILDER_USER_TEST_2026-09-16 are one defect wearing
 * three hats:
 *
 *   D-20  the refusal from Send printed 1,300px away from the button pressed
 *   D-35  "5 details still blank" was a `<div>` — not clickable, and it never
 *         said WHICH
 *   D-03  and the things it named had no field anywhere on the screen
 *
 * ── THE ENGINE'S HALF ─────────────────────────────────────────────────────
 * The engine does not know what a blank is. An adapter hands it a list of
 * PROBLEMS, each with a message and — the part that matters — where on the
 * page to go to fix it. The engine then owns the two behaviours no adapter
 * should re-implement:
 *
 *   · the counter is a BUTTON that takes you to the first one
 *   · a refusal appears AT the control that was pressed, and moves the caret
 *     into the first offending field
 *
 * ── HOW A PROBLEM POINTS AT THE PAGE ──────────────────────────────────────
 * By the same two markers the canvas already edits through: the widget's id
 * and the renderer's own `data-edit` prop path. No second addressing scheme —
 * `[data-widget="w7"] [data-edit="rows.2.value"]` is a place the author can be
 * put, and it is the place they would have clicked.
 */

/** Where on the page a problem lives. */
export interface ProblemFocus {
  /** The section holding it, so the engine can select before it scrolls. */
  sectionId: string;
  /** The widget's id, as the renderer stamped it. */
  widgetId: string;
  /** The renderer's own `data-edit` path inside that widget. Optional: some
   *  problems are about the whole widget (an empty pricing table). */
  path?: string;
}

export interface BuilderProblem {
  /** Stable per problem, so React keys and tests are not index-based. */
  id: string;
  /** One sentence, in the client's words. Never a developer token. */
  message: string;
  /** Where to send the author. Absent when there is genuinely nowhere to go. */
  focus?: ProblemFocus;
}

/**
 * How a refusal finds the button that caused it.
 *
 * The adapter puts `data-builder-anchor="send"` on its own button and passes
 * the same name with the refusal; the engine looks it up and puts the message
 * beside it. Declarative rather than a ref, because the buttons are the
 * adapter's own React nodes handed in as a prop — the engine never holds them.
 */
export function anchorSelector(anchor: string): string {
  return `[data-builder-anchor="${cssEscape(anchor)}"]`;
}

/** The element on the page a problem points at. */
export function focusSelector(focus: ProblemFocus): string {
  const widget = `[data-widget="${cssEscape(focus.widgetId)}"]`;
  return focus.path ? `${widget} [data-edit="${cssEscape(focus.path)}"]` : widget;
}

/**
 * Attribute values come from ids we minted and paths the renderer wrote, so
 * this is belt and braces — but a customer-named merge tag could reach a path
 * one day, and a quote in a selector is a thrown exception, not a bad layout.
 */
function cssEscape(v: string): string {
  return String(v).replace(/["\\]/g, "\\$&");
}

/** The first problem worth jumping to — the first that knows where it is. */
export function firstWithFocus(problems: BuilderProblem[] | undefined): BuilderProblem | null {
  return (problems || []).find((p) => !!p.focus) ?? (problems || [])[0] ?? null;
}

/**
 * What the counter says.
 *
 * "still blank" and not "invalid": the author has not done anything wrong, they
 * have not finished. Singular and plural both written out, because "1 details"
 * is the sort of thing that makes a product look unfinished.
 */
export function problemsLabel(count: number): string {
  if (count <= 0) return "";
  return count === 1 ? "1 detail still to fill in" : `${count} details still to fill in`;
}

/** The button's own words: it goes somewhere, so it says so. */
export const PROBLEMS_CTA = "Take me to the first one";

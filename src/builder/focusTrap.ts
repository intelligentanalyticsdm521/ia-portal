/**
 * builder/focusTrap.ts — Tab stays inside the builder.
 *
 * D-19 (BUILDER_USER_TEST_2026-09-16): *"Press Tab inside the builder → focus
 * goes to 'Open ARGUS Agent', then the app header — Search, Location, AI
 * Credits, Dev business. No focus trap."* The builder is `role="dialog"
 * aria-modal="true"`, so a keyboard user tabbing out of it lands on a page they
 * cannot see and cannot get back from.
 *
 * ── THE PURE HALF IS THE WHOLE OF THE BUG SURFACE ─────────────────────────
 * Which element gets focus next is arithmetic on an index and a wrap; finding
 * the elements is a DOM query. They are separated here so the arithmetic is a
 * `node --test` file, and the query is one line nobody has to reason about.
 */

/**
 * Everything a Tab can land on.
 *
 * `:not([disabled])` and `:not([tabindex="-1"])` because a disabled Send and a
 * programmatically-focusable canvas are both in the DOM and neither is in the
 * tab ring. `details`/`summary` and `area` are left out on purpose: the
 * builder has none, and a selector nobody can read is a selector nobody
 * maintains.
 */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * The index Tab moves to.
 *
 * Wraps in both directions, which is what makes it a trap rather than a wall.
 * `current` of -1 means "focus is not in the ring yet" — the fresh-open case —
 * and Tab then lands on the first item, Shift+Tab on the last.
 */
export function nextTrapIndex(count: number, current: number, shift = false): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return shift ? count - 1 : 0;
  return shift ? (current - 1 + count) % count : (current + 1) % count;
}

/**
 * WHERE THE FIRST TAB GOES.
 *
 * Into the canvas, always — "the first Tab lands on the canvas" is the rule,
 * because the first thing an author wants from the keyboard is the page, not
 * the Send button they have not earned yet. Once focus is already somewhere in
 * the ring, the arithmetic above takes over.
 *
 * Returns which of the two the frame should focus.
 */
export function firstTabTarget(focusInRing: boolean, hasCanvas: boolean): "canvas" | "ring" {
  return !focusInRing && hasCanvas ? "canvas" : "ring";
}

/** The focusable elements inside a root, in document order. */
export function focusablesIn(root: { querySelectorAll: (s: string) => ArrayLike<Element> }): HTMLElement[] {
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((el): el is HTMLElement => el instanceof HTMLElement)
    // Hidden things are in the DOM and out of the ring: a closed drawer's
    // buttons would otherwise swallow a dozen Tabs with nothing on screen.
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

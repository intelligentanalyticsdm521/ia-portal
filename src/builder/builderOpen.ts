/**
 * builder/builderOpen.ts — "a builder owns the screen right now", as a signal
 * anything can subscribe to.
 *
 * ── WHY THIS EXISTS (D-172, round 2) ──────────────────────────────────────
 * The reference editor has ONE door to its AI: the button in its top bar.
 * Ours had two, because the platform's floating "Ask ARGUS" pill stayed on
 * screen — `position: fixed`, `z-index: 9000`, bottom-right — for the whole
 * time a builder was open, over the page being edited.
 *
 * Round 1 tried to close that with a guard inside the chatbot's own render:
 *
 *     const builderOpen = !!document.querySelector("[data-builder-canvas]");
 *
 * which is the bug the KB calls "absence-based guards fail open". React had
 * no reason to re-render the chatbot when the builder mounted, so the query
 * ran once, on a page with no builder in it, answered `false`, and the pill
 * was drawn for ever after. Nothing was wrong with the query — it was never
 * asked again.
 *
 * So the signal is PUBLISHED, not sniffed. The shell says "I am open" while it
 * is open; a viewer subscribes and is TOLD. It is a count rather than a
 * boolean because two builders can overlap for a frame while one modal closes
 * and the next opens, and a boolean would let the first one's teardown switch
 * the second one's pill back on.
 *
 * Pure module, no React and no DOM, so `node --test` drives it.
 */

let openCount = 0;
const listeners = new Set<() => void>();

function emit(): void {
  // A copy, so a listener that unsubscribes itself cannot skip the next one.
  for (const fn of [...listeners]) fn();
}

/**
 * A builder is on screen. Returns the function that says it is not any more —
 * the shape `useEffect` wants, so a shell cannot forget to close it.
 */
export function openBuilder(): () => void {
  openCount += 1;
  emit();
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    openCount = Math.max(0, openCount - 1);
    emit();
  };
}

/** Is a builder on screen? */
export function builderIsOpen(): boolean {
  return openCount > 0;
}

/** How many. Exported for the test that proves two overlapping builders count. */
export function openBuilderCount(): number {
  return openCount;
}

/** Be told when that answer changes. Returns the unsubscribe. */
export function subscribeBuilderOpen(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Server render: there is no screen, so nothing owns it. */
export function builderIsOpenOnServer(): boolean {
  return false;
}

export default { openBuilder, builderIsOpen, openBuilderCount, subscribeBuilderOpen };

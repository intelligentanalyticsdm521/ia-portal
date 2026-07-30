// placeTooltip.ts — pick a spot for a coach-mark card that does NOT cover the
// thing it points at.
//
// WHY THIS IS SHARED
// ------------------
// GuidedTour and InteractiveWalkthroughRunner each had their own copy of this
// maths, and each hardcoded an assumed card height (200px and "180; // approx").
// Real cards run taller — two to four sentences of teaching copy, sometimes a
// warning note — so with placement:"top" the card's top was set an assumed
// height above the target and the extra real height hung down OVER it.
//
// In the interactive runner that made the step impossible to complete: the card
// has pointer-events:auto, so it swallowed the click the step was waiting for
// (measured on the contact delete step — the button hit-tested to the card).
// In the tour it silently hides the control being explained, which is the whole
// point of the step.
//
// Fix: callers measure the rendered card and pass its real height, and we treat
// a step's `placement` as a PREFERENCE — trying the other sides when the
// preferred one would go off-screen or cover the target.
export type Placement = "top" | "bottom" | "left" | "right" | "auto" | "center";

export interface PlacedTooltip {
  top: number;
  left: number;
  width: number;
}

export interface PlaceOptions {
  /** The element being pointed at. Null → caller should centre the card. */
  targetRect: DOMRect | null;
  /** Card width (fixed by design). */
  width: number;
  /** MEASURED card height. Pass a fallback only until the first measurement. */
  height: number;
  /** The step author's preference. */
  placement?: Placement;
  /** Gap between card and target. */
  pad?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

/**
 * Returns the card's position, preferring a side that is fully on screen and
 * clear of the target. Falls back to on-screen-but-overlapping only when no
 * side is clean (a target that fills the viewport), because a visible card the
 * user can dismiss beats one positioned off-screen.
 */
export function placeTooltip(opts: PlaceOptions): PlacedTooltip | null {
  const {
    targetRect, width, height, placement, pad = 12,
    viewportWidth = window.innerWidth,
    viewportHeight = window.innerHeight,
  } = opts;

  if (!targetRect || placement === "center") return null; // caller centres it

  const clampL = (l: number) => Math.max(8, Math.min(l, viewportWidth - width - 8));
  const clampT = (t: number) => Math.max(8, Math.min(t, viewportHeight - height - 8));

  const candidates: Record<string, { top: number; left: number }> = {
    bottom: { top: targetRect.bottom + pad, left: clampL(targetRect.left) },
    top: { top: targetRect.top - height - pad, left: clampL(targetRect.left) },
    right: { top: clampT(targetRect.top), left: targetRect.right + pad },
    left: { top: clampT(targetRect.top), left: targetRect.left - width - pad },
  };

  const preferred = placement && placement !== "auto"
    ? placement
    : targetRect.top > viewportHeight / 2 ? "top" : "bottom";
  const order = [preferred, "bottom", "top", "right", "left"]
    .filter((p, i, a) => a.indexOf(p) === i);

  const onScreen = (c: { top: number; left: number }) =>
    c.top >= 8 && c.left >= 8
    && c.top + height <= viewportHeight - 8
    && c.left + width <= viewportWidth - 8;

  const coversTarget = (c: { top: number; left: number }) =>
    !(c.left + width < targetRect.left
      || c.left > targetRect.right
      || c.top + height < targetRect.top
      || c.top > targetRect.bottom);

  for (const p of order) {
    const c = candidates[p];
    if (c && onScreen(c) && !coversTarget(c)) return { ...c, width };
  }
  for (const p of order) {
    const c = candidates[p];
    if (c && onScreen(c)) return { ...c, width };
  }
  const f = candidates[preferred] || candidates.bottom;
  return { top: clampT(f.top), left: clampL(f.left), width };
}

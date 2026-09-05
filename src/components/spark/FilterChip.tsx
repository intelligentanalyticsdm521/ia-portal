// FilterChip — the filter chips above a list, and the row they sit in.
//
// October pull-forward P4.1, 2026-09-07. Small pack 2's phone pass raised
// twelve surfaces to a 40px tap target and left these: the Lead Inbox's ten
// filter chips were 24px, written out as the same Tailwind string in five
// places, so there was no single thing to raise.
//
// ── WHY 40px, AND WHY THE ROW HAD TO CHANGE WITH IT ─────────────────────────
// 40px is the smallest a thumb reliably hits. Ten chips at 40px in a WRAPPING
// row is four rows on a 375px screen — about 170px of an 812px phone spent on
// filters before the first lead. So the row stops wrapping on a phone and
// scrolls sideways instead: one 40px row, ~48px with its scroll gutter, and
// every chip still reachable. A horizontally scrolling chip row is the pattern
// every phone inbox uses, and it is what the item's brief allows.
//
// Desktop is untouched, deliberately and provably: every mobile rule is behind
// Tailwind's `max-md:`, and scripts/dev/measure-tap-targets.mjs asserts a chip
// is still exactly 24px and the row still WRAPS at 1440x900.
//
// ── THE CLASS STRINGS ARE EXPORTED ──────────────────────────────────────────
// Not for reuse — for MEASUREMENT. Tailwind only emits a class it has seen in
// a scanned source file, so the measuring script reads these constants out of
// this file rather than assembling its own copy, and test/tap-targets.test.ts
// fails if a chip site stops importing FilterChip. The chain is: the test says
// the pages use these classes, the script says these classes measure 40px.
import type { ReactNode } from "react";

/**
 * The row. `contents` on desktop, so it is invisible to layout and the
 * surrounding flex container behaves exactly as it did before this component
 * existed — that is what "no desktop pixel moves" is bought with. At `max-md:`
 * it becomes the scrolling row.
 *
 * `-mx-1 px-1` gives the first and last chip's focus ring somewhere to live
 * inside a clipping container; without it the ring is sliced off at the edges.
 */
export const CHIP_ROW =
  "contents max-md:flex max-md:w-full max-md:flex-nowrap max-md:items-center max-md:gap-2 " +
  "max-md:overflow-x-auto max-md:overflow-y-hidden max-md:-mx-1 max-md:px-1 max-md:pb-1";

/**
 * The chip. `shrink-0` matters more than it looks: inside a nowrap scrolling
 * row a flex child WILL be squeezed narrower than its text, and "Failed
 * verification" would ellipsis to "Failed…" rather than scroll into view.
 */
export const CHIP_BASE =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold " +
  "transition-colors max-md:min-h-[40px]";

export const CHIP_ON = "bg-slate-900 text-white";
export const CHIP_OFF = "bg-slate-100 text-slate-700 hover:bg-slate-200";

/** The verified/failed chips are green when on, not slate. Same geometry. */
export const CHIP_ON_EMERALD = "bg-emerald-700 text-white";

/**
 * The TAB STRIP row — the same idea as CHIP_ROW, for a strip that is already a
 * flex row on desktop and must stay one.
 *
 * Added 2026-09-07 by pre-walk pass 2. Measured on the SPARK Lead Inbox at
 * 375x812: the strip was 442px inside a 333px container, clipped by
 * `.spark-page { overflow-x: hidden }` with no scrollbar, so the **Billing**
 * tab sat from x=369 to x=463 — entirely off a 375px screen, untappable and
 * unscrollable. Small pack 2 fixed exactly this shape for the contact and job
 * tab strips (W-SP2-C.4, "a tab exists that cannot be reached") and this strip
 * was not in its list.
 *
 * Why not CHIP_ROW: that one is `contents` on desktop so it disappears from
 * layout. This strip IS the layout — it carries the bottom border the active
 * tab's underline sits on — so only the `max-md:` half applies.
 */
export const TAB_STRIP_ROW =
  "max-md:flex-nowrap max-md:overflow-x-auto max-md:overflow-y-hidden max-md:-mx-1 max-md:px-1";

/** A tab inside TAB_STRIP_ROW. `shrink-0` for the same reason as CHIP_BASE:
 *  inside a nowrap scrolling row a flex child is squeezed narrower than its
 *  text, and "Suppressed Domains" would ellipsis rather than scroll into view. */
export const TAB_STRIP_ITEM = "shrink-0";

export interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** The active colour. Slate unless a surface has its own meaning for it. */
  tone?: "slate" | "emerald";
  title?: string;
}

export function FilterChip({ active, onClick, children, tone = "slate", title }: FilterChipProps) {
  const on = tone === "emerald" ? CHIP_ON_EMERALD : CHIP_ON;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`${CHIP_BASE} ${active ? on : CHIP_OFF}`}
    >
      {children}
    </button>
  );
}

/** The scrolling container. Wrap a run of chips (and their group labels) in it. */
export function FilterChipRow({ children }: { children: ReactNode }) {
  return <div className={CHIP_ROW}>{children}</div>;
}

export default FilterChip;

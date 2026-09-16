/**
 * builder/responsive.ts — ONE breakpoint set, ONE preview-width state.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §12.7 ("The phone … worth a pass of its
 * own") — this is that pass, and this module is the only place the numbers
 * live.
 *
 * ── WHY A MODULE AND NOT FOUR MAGIC NUMBERS ───────────────────────────────
 * The builder already had three different answers to "how narrow is narrow":
 * `max-md:hidden` on the widget pane (768), `max-lg:hidden` on the inspector
 * (1024), `@media (max-width: 640px)` in DOCUMENT_CSS and
 * `@media (max-width: 720px)` in SITE_CSS. Four numbers means a section that
 * stacks in the canvas and not on the customer's phone, which is exactly the
 * class of defect one renderer exists to prevent. So:
 *
 *   CONTENT_STACK_MAX   the width at or below which a DOCUMENT stacks
 *   CHROME_DRAWER_MAX   the width below which the BUILDER becomes drawers
 *   PREVIEW_DEVICES     the three paper widths the preview toggle offers
 *
 * ── THE CONTENT BREAKPOINT IS A CONTAINER QUERY, NOT A MEDIA QUERY ────────
 * A media query asks the VIEWPORT. The builder canvas is a 390px-wide sheet
 * of paper inside a 1600px window, so a media query there is always false —
 * the phone preview would show the desktop layout and lie to the author about
 * the thing this pass exists to fix. `@container` asks the element, so ONE
 * stylesheet is true in both places: the customer's phone (the document is as
 * wide as the phone) and the phone preview (the document is 390px wide).
 * `.bx-doc` / `.lp-page` declare `container-type: inline-size` and everything
 * inside them queries that.
 *
 * Email is the exception, and deliberately: no mail client supports container
 * queries and half of them strip <style> altogether, so emailRender.ts stacks
 * with the fluid-hybrid inline-block pattern instead. One mechanism per
 * medium; the two never mix.
 */

/**
 * At or below this CONTAINER width a document stacks: two- and three-column
 * sections become one column, tables become label/value rows, side-by-side
 * cards go under each other.
 *
 * 720 and not 640: a phone in landscape and a small tablet both land between
 * the two, and a three-column pricing comparison at 700px is unreadable.
 */
export const CONTENT_STACK_MAX = 720;

/**
 * Below this VIEWPORT width the builder chrome stops being three panes side
 * by side: the canvas takes the whole width and the widget pane and the
 * inspector become slide-over drawers opened from a bottom bar.
 *
 * 900 and not 768: three panes are 320 + 320 of furniture, so a 780px window
 * leaves 140px of canvas — technically three panes, practically none.
 */
export const CHROME_DRAWER_MAX = 900;

/** What the preview toggle offers. `width: null` means "the adapter's own". */
export interface PreviewDevice {
  key: PreviewKey;
  label: string;
  /** The paper width this device pins the canvas to, or null for desktop. */
  width: number | null;
  title: string;
}

export type PreviewKey = "desktop" | "tablet" | "phone";

/**
 * Three widths, because three is what an author can hold in their head.
 *
 * 390 is the iPhone 14/15/16 CSS width and the narrowest screen worth
 * designing for; 768 is the iPad portrait width every tablet rounds to.
 */
export const PREVIEW_DEVICES: readonly PreviewDevice[] = [
  { key: "desktop", label: "Desktop", width: null, title: "Full width — how this looks on a computer" },
  { key: "tablet", label: "Tablet", width: 768, title: "768px — how this looks on a tablet" },
  { key: "phone", label: "Phone", width: 390, title: "390px — how this looks on a phone, which is where most customers open it" },
];

/** The device, by key. Unknown keys fall back to desktop rather than throwing. */
export function previewDevice(key: PreviewKey | string | null | undefined): PreviewDevice {
  return PREVIEW_DEVICES.find((d) => d.key === key) ?? PREVIEW_DEVICES[0];
}

/**
 * THE one rule that turns a preview choice into a canvas paper width.
 *
 * Every adapter goes through this, which is what stops a per-adapter fork:
 *
 *   proposal (780)  desktop → 780   tablet → 768   phone → 390
 *   email    (600)  desktop → 600   tablet → 600   phone → 390
 *   landing  (760)  desktop → 760   tablet → 760   phone → 390
 *   website  (full) desktop → full  tablet → 768   phone → 390
 *
 * A device NEVER widens the paper — an email is 600 wide on a tablet because
 * an email is 600 wide, full stop (emailRender's rule 3). Desktop is the
 * adapter's own number untouched, so a proposal's paper is still Letter-ish
 * when nobody has touched the toggle.
 */
export function previewPaperWidth(
  key: PreviewKey | string | null | undefined,
  base: number | "full",
): number | "full" {
  const width = previewDevice(key).width;
  if (width === null) return base;
  if (base === "full") return width;
  return Math.min(base, width);
}

/** The unit shown above the page, so the author knows what they are looking at. */
export function previewNote(key: PreviewKey | string | null | undefined, base: number | "full"): string | null {
  const d = previewDevice(key);
  if (d.width === null) return null;
  const w = previewPaperWidth(key, base);
  return `${d.label} · ${w === "full" ? "full width" : `${w}px`}`;
}

/**
 * Is this viewport narrow enough for drawers?
 *
 * A function and not an inline comparison so the ONE number cannot be
 * re-typed as 899 somewhere, and so a test can ask without a DOM.
 */
export function isNarrowViewport(width: number): boolean {
  return width < CHROME_DRAWER_MAX;
}

/** The media query string the frame listens to. One place, one spelling. */
export const NARROW_MEDIA_QUERY = `(max-width: ${CHROME_DRAWER_MAX - 1}px)`;

/**
 * The container query every document stylesheet opens with.
 *
 * Exported as a string so DOCUMENT_CSS, SITE_CSS and LANDING_CSS cannot drift
 * to three different numbers — the defect this module was written to end.
 */
export const STACK_QUERY = `@container (max-width: ${CONTENT_STACK_MAX}px)`;

/**
 * What a container root declares.
 *
 * `inline-size` and not `size`: a document's HEIGHT is its content's, and
 * `container-type: size` would collapse it to nothing.
 */
export const CONTAINER_ROOT_CSS = "container-type: inline-size;";

/**
 * The query a DEVICE's style overrides are emitted under (§11.8, D-140).
 *
 * The styling pass lets an author say "on a phone, this heading is smaller".
 * That needs a width per device, and the temptation is to type 768 and 390
 * into style.ts — which is the fourth-number defect this module was written to
 * end. So the numbers come from PREVIEW_DEVICES, the same list the preview
 * toggle offers, and a device the author previewed at 390 is the device their
 * phone override applies at.
 *
 * A CONTAINER query, for the same reason as STACK_QUERY: the canvas is a 390px
 * sheet inside a 1600px window and a media query there is false forever.
 *
 * Note the three widths are deliberately NOT the same number as
 * CONTENT_STACK_MAX (720): stacking is about what a LAYOUT can no longer do,
 * and an override is about what the AUTHOR asked for at a width they looked
 * at. 720 sits between tablet and phone, so a document stacks before the phone
 * overrides come in — which is the right order and is pinned by a test.
 */
export function deviceContainerQuery(key: PreviewKey): string {
  const width = previewDevice(key).width;
  if (width === null) return "";
  return `@container (max-width: ${width}px)`;
}

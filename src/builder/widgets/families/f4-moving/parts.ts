/**
 * f4-moving/parts.ts — the small readers the five deepened widgets share.
 *
 * WAVE 2 (b168/f4-moving-deep, 2026-09-19). Wave 1 added one new widget;
 * this wave deepens the five an author reaches for first — Counter, Progress
 * Bar, Rating, Tabs, Accordion — from a handful of controls each to Elementor's
 * own Content AND Style panels. Five renderers that each parse a colour, clamp
 * a number and decide what "on" means is five chances to disagree, so they are
 * read here once.
 *
 * NOTHING IN HERE KNOWS A WIDGET'S NAME. If a helper needs to, it belongs in
 * that widget's own file.
 *
 * `esc` comes from the LEAF module `builder/esc`, never from `builder/render`:
 * importing a value out of render.ts pulls `widgets/families/index.ts` into a
 * family file's own graph and its top-level `const FAMILIES` is then read while
 * the family is still evaluating. See builder/esc.ts for the exact error.
 */
import { esc } from "../../../esc";

/** A value as a string, with null and undefined both meaning "not set". */
export const str = (v: unknown): string => (v == null ? "" : String(v));

/** A number inside a range, or the fallback. Never NaN on a page. */
export function num(v: unknown, dflt: number, lo = -Infinity, hi = Infinity): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * IS A SWITCH ON?
 *
 * Elementor stores a switcher as the string `"yes"` (and Progress Bar's
 * Display Percentage as `"show"`, which is its own quirk and is read by its own
 * file). Our toggle control stores a boolean. A reader that knows only one of
 * the two silently loses the other, so there is one reader and it knows both.
 * `dfltOn` is what an ABSENT value means — copied from the machine file's own
 * default, never guessed, because "absent means off" would flip every stored
 * counter's thousand separator the first time it was republished.
 */
export function on(v: unknown, dfltOn = false): boolean {
  if (v === true || v === "yes" || v === "show") return true;
  if (v === false || v === "" || v === "no" || v === "hide") return false;
  return dfltOn;
}

/**
 * A COLOUR AN AUTHOR TYPED, safe to put inside a `style="…"` attribute.
 *
 * Empty when they have not chosen one, so the caller falls back to the brand
 * accent or to the stylesheet rather than painting an empty string over it.
 */
export const colour = (v: unknown): string => esc(str(v).trim());

/** One CSS declaration, or nothing at all when the author set no value. */
export const decl = (prop: string, value: string): string => (value ? `${prop}:${value};` : "");

/** A pixel length from a control that stores a plain number. */
export function px(v: unknown, lo = 0, hi = 400): string {
  if (v == null || str(v).trim() === "") return "";
  return `${num(v, 0, lo, hi)}px`;
}

/**
 * ELEMENTOR'S THREE ALIGNMENT WORDS, which are not the three we stored.
 *
 * The widgets Elementor rebuilt say `start | center | end`; the ones it has not
 * touched, and every one of ours, say `left | center | right`. Both spellings
 * are read and ONE is written, so a document stored before this wave keeps its
 * alignment and a document stored after it publishes cleanly.
 */
export function startEnd(v: unknown): "start" | "center" | "end" | "" {
  const s = str(v).trim().toLowerCase();
  if (s === "start" || s === "left") return "start";
  if (s === "center" || s === "centre") return "center";
  if (s === "end" || s === "right") return "end";
  return "";
}

/** …and as the CSS the canvas needs for a row of things. */
export const FLEX_OF: Readonly<Record<string, string>> = {
  start: "flex-start", center: "center", end: "flex-end",
};

/** …and for text inside a block. */
export const TEXT_OF: Readonly<Record<string, string>> = {
  start: "left", center: "center", end: "right",
};

/** The HTML tags Elementor lets a title wear, in Elementor's own order. */
export const TITLE_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "p"] as const;

/** The options list for a Title HTML Tag select, in the registry's shape. */
export const TITLE_TAG_OPTIONS = TITLE_TAGS.map((t) => ({
  value: t, label: t === "div" || t === "span" || t === "p" ? t : t.toUpperCase(),
}));

/** A tag we are willing to write, or the widget's own default. */
export function tag(v: unknown, dflt: string): string {
  const s = str(v).trim().toLowerCase();
  return (TITLE_TAGS as readonly string[]).includes(s) ? s : dflt;
}

/** Elementor's font weights, as its own select offers them. */
export const WEIGHT_OPTIONS = [
  { value: "", label: "Default" },
  { value: "300", label: "300 (Light)" },
  { value: "400", label: "400 (Normal)" },
  { value: "500", label: "500 (Medium)" },
  { value: "600", label: "600 (Semi Bold)" },
  { value: "700", label: "700 (Bold)" },
  { value: "800", label: "800 (Extra Bold)" },
];

/**
 * THE ROWS OF A REPEATER, whatever shape reached us.
 *
 * Our stored key is `tabs` and each row is `{ tab_title, tab_content }`.
 * Elementor's nested Accordion calls the list `items` and the title
 * `item_title`, and a page read back off a live site carries those. Both are
 * read here so no stored document loses a panel, and the emitter writes
 * Elementor's spelling once, in one place.
 */
export interface PanelRow { tab_title: string; tab_content: string }

/**
 * HOW MANY PANELS A NEW ONE ARRIVES WITH, and why it is three.
 *
 * Elementor's own default, read off the live capture on 2026-09-19
 * (`_g4_nested_tree.json`): a new nested Tabs is Tab #1, #2, #3 and a new
 * nested Accordion is Item #1, #2, #3.
 *
 * It matters more here than it does there. `BuilderShell`'s `repeatKeyFor` has
 * no case for `tabs` or `accordion`, so nothing on our screen can ADD a row to
 * either one; a widget that arrived empty could never be filled in at all, and
 * the canvas would say "add your first tab in the panel on the right" about a
 * panel that has no such control. Arriving with three rows the author types
 * straight onto the page is what makes the widget usable today. Adding a
 * FOURTH still cannot be done, and that is the shell's gap, written up in the
 * handoff rather than worked around here.
 *
 * The titles are EMPTY, not "Tab #1": Elementor's demo words on a client's
 * page are somebody else's words, and the canvas shows a placeholder instead.
 */
export const STARTING_PANELS: PanelRow[] = [
  { tab_title: "", tab_content: "" },
  { tab_title: "", tab_content: "" },
  { tab_title: "", tab_content: "" },
];

/**
 * THE MAILBOX FONT STACK — and a SEAM GAP, said out loud.
 *
 * A mailbox table with no `font-family` is rendered in Times by Outlook, so
 * every cell the email adapter writes carries one. The adapter computes it
 * from the newsletter's own body font with a private `stack()` over a private
 * `FALLBACK_STACK` (`adapters/email/emailRender.ts`), and a family folder may
 * not import an adapter — so a family that writes a mailbox table has no way
 * to ask for the same string.
 *
 * This is the same rule, written once for the families, and the byte-for-byte
 * golden `test/fixtures/email-render-cases.json` is what proves the two agree.
 * It is a DUPLICATE and it should not stay one: the right fix is for the
 * adapter to hand the stack to the family on the context it already passes,
 * which is one line in a file no family owns. Written up in the handoff under
 * "seam gaps" rather than left for the next family to rediscover.
 */
export const EMAIL_FALLBACK_STACK = "Helvetica, Arial, sans-serif";

export function emailStack(face: unknown): string {
  const first = str(face).trim();
  const rest = EMAIL_FALLBACK_STACK.split(",").map((s) => s.trim())
    .filter((s) => s.toLowerCase() !== first.toLowerCase());
  return [first, ...rest].filter(Boolean).join(", ");
}

export function panelRows(props: Record<string, unknown>): PanelRow[] {
  const raw = Array.isArray((props as any)?.tabs) ? (props as any).tabs
    : Array.isArray((props as any)?.items) ? (props as any).items : [];
  return raw.map((r: any) => ({
    tab_title: str(r?.tab_title ?? r?.item_title ?? r?.title ?? r?.question),
    tab_content: str(r?.tab_content ?? r?.item_content ?? r?.body ?? r?.answer),
  }));
}

/**
 * families/f3-buttons-icons-panels/shared.ts — the three things this family's
 * widgets all need, written once.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 §C.2: F3 is *"buttons, icons and panels…
 * all share the icon picker and the link control"*. Five widgets land in this
 * folder and four of them draw a mark, three of them draw a button, and three
 * of them offer one of Elementor's three-way alignments. Writing that three
 * times is three places for it to drift, which is the defect this whole rebuild
 * is about.
 *
 * NOTHING HERE IS A SECOND MECHANISM. The icon picker is `widgets/glyph.ts`,
 * which already answers "one symbol, on every surface"; the text runs are
 * `widgets/text.ts`, which is render.ts's own escaping and merge-filling under
 * two friendlier names. This file only holds what neither of those has and what
 * only F3 needs.
 */
/* `esc` comes from `builder/esc`, a module that imports nothing, and NEVER
   from `builder/render` — D-168 item 5b. `render.ts` imports the family index,
   so a family folder that reached back into it closed a real cycle and a
   family's own test threw "Cannot access … before initialization". */
import { esc } from "../../../esc";

/** `null` and `undefined` become "", never the word "null" on a page. */
export const str = (v: unknown): string => (v == null ? "" : String(v));

/**
 * ELEMENTOR'S THREE-WAY ALIGNMENT, in the two spellings it actually stores.
 *
 * Call to Action and Flip Box store `start | center | end` (the machine file's
 * own option list for `alignment`, `alignment_a` and `alignment_b`); Share
 * Buttons stores `left | center | right | justify`. Both reach CSS through this
 * one function, so a widget never has to know which dialect it is in.
 */
export function textAlign(v: unknown, fallback = "center"): string {
  const s = str(v).toLowerCase();
  if (s === "start" || s === "left") return "left";
  if (s === "end" || s === "right") return "right";
  if (s === "center" || s === "centre") return "center";
  if (s === "justify") return "justify";
  return fallback;
}

/** …and the same answer as a flex `justify-content`, for a row of buttons. */
export function flexJustify(v: unknown, fallback = "flex-start"): string {
  const a = textAlign(v, "");
  if (a === "center") return "center";
  if (a === "right") return "flex-end";
  if (a === "left") return "flex-start";
  if (a === "justify") return "space-between";
  return fallback;
}

/** Elementor's option list for every `*_tag` select on this family's widgets. */
export const TAG_OPTIONS = [
  { value: "h1", label: "H1" }, { value: "h2", label: "H2" }, { value: "h3", label: "H3" },
  { value: "h4", label: "H4" }, { value: "h5", label: "H5" }, { value: "h6", label: "H6" },
  { value: "div", label: "div" }, { value: "span", label: "span" }, { value: "p", label: "p" },
];

/** The nine tags above, and nothing else, may reach the page as an element. */
const SAFE_TAGS = new Set(TAG_OPTIONS.map((o) => o.value));

/**
 * The HTML element a `*_tag` control asks for, or the widget's own default.
 *
 * An author cannot type here — it is a select — but a STORED document can carry
 * anything, including a document that came back off a published page somebody
 * edited by hand. So the value is checked against the list rather than trusted,
 * because an unchecked tag name is an injected element.
 */
export function safeTag(v: unknown, fallback: string): string {
  const s = str(v).toLowerCase();
  return SAFE_TAGS.has(s) ? s : fallback;
}

/**
 * ONE BUTTON, drawn the way Elementor's own button reads.
 *
 * Three of this family's widgets end in a button (Call to Action, Flip Box, and
 * the no-JS fallbacks of the two Facebook widgets). A button with no words is
 * not drawn at all when a customer is reading, because an empty pill is a
 * broken page; while the author is editing it is drawn with its placeholder, so
 * there is something to click.
 */
export function buttonHtml(opts: {
  text: string;
  href?: string;
  background: string;
  colour: string;
  mode: "view" | "edit";
  /** The `data-edit` path, when the words are typed on the page. */
  editPath?: string;
  placeholder?: string;
}): string {
  const words = opts.text.trim();
  if (!words && opts.mode !== "edit") return "";
  const skin = `display:inline-block;padding:9px 18px;border-radius:6px;`
    + `background:${esc(opts.background)};color:${esc(opts.colour)};`
    + `font-weight:600;font-size:14px;line-height:1.2;text-decoration:none`;
  const inner = opts.editPath
    ? `<span data-edit="${esc(opts.editPath)}" data-placeholder="${esc(opts.placeholder || "Button text")}"${
      words ? "" : ` class="bx-slot"`}>${esc(words)}</span>`
    : esc(words);
  const href = str(opts.href);
  return href
    ? `<a class="bx-f3-btn" href="${esc(href)}" style="${skin}">${inner}</a>`
    : `<span class="bx-f3-btn" style="${skin}">${inner}</span>`;
}

/**
 * THE NO-JS CARD — what a widget draws when its script is not there.
 *
 * Facebook Embed and Facebook Page are the two widgets in this family that need
 * JavaScript on the published page: both are drawn by Facebook's own SDK, which
 * our canvas does not load and which a reader who blocks third-party scripts
 * will not load either. A widget that needs a script and has no fallback is a
 * blank rectangle on a live page, so both draw this instead: a titled card with
 * a real link out. It is the honest version of the widget, not a placeholder —
 * it works when the script never arrives.
 */
export function fallbackCard(opts: {
  title: string;
  line: string;
  href: string;
  linkText: string;
  accent: string;
}): string {
  const href = str(opts.href);
  return `<div class="bx-f3-fallback" style="border:1px solid #E2E8F0;border-radius:8px;padding:14px 16px;background:#F8FAFC">
    <div style="font-weight:600;font-size:14px;line-height:1.3">${esc(opts.title)}</div>
    <div style="font-size:12px;color:#5A7A8A;margin-top:4px">${esc(opts.line)}</div>
    ${href ? `<a href="${esc(href)}" style="display:inline-block;margin-top:10px;font-size:13px;font-weight:600;color:${esc(opts.accent)};text-decoration:underline">${esc(opts.linkText)}</a>` : ""}
  </div>`;
}

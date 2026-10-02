/**
 * builder/emailBox.ts — THE MAILBOX PRIMITIVES, in a module that imports
 * nothing.
 *
 * ── WHY IT EXISTS (B-168 wave 2, f7-data-lists-deep) ──────────────────────
 * D-168 item 5b gave a family a `emailRenderers` door: a family declares how
 * its widget is drawn in a mailbox beside how it is drawn on a page. The first
 * family to walk through that door — IA Posts, `families/f7-data-lists` —
 * found it opened onto a wall.
 *
 * A mailbox renderer cannot be written out of thin air. Two things beside each
 * other in an email is `fluidRow`, and there is exactly one of those on the
 * platform, in `adapters/email/emailRender.ts`. But `emailRender.ts` imports
 * `widgets/families/index.ts` (that is how it asks the families first), and
 * `families/index.ts` builds its tables at module top level. So a family folder
 * that imports `emailRender.ts` closes a real cycle — enter the family first,
 * which is exactly what that family's own test does, and you get
 *
 *     ReferenceError: Cannot access 'F7_DATA_LISTS' before initialization
 *
 * This is the SAME seam, in the same shape, as the one `builder/esc.ts` already
 * closed for the escaper (five families hit that one). A module with no imports
 * cannot be half-built. `emailRender.ts` re-exports every name below, so every
 * caller that already says `import { fluidRow } from "./emailRender"` is
 * unchanged and there is still exactly ONE fluid row on the platform.
 *
 * **A family folder imports these from HERE.** Nothing else moved: the context,
 * the switch, the style cascade and every widget renderer stay in the adapter,
 * because they are the adapter's.
 */

/* ══════════════════════════════════════════════════════════════════════════
   The four rules, as constants
   ══════════════════════════════════════════════════════════════════════════ */

/** The width every mail client has agreed on. Never exceeded. */
export const EMAIL_WIDTH = 600;

/** The font stack, in the order a mail client will find one. */
export const FALLBACK_STACK = "Helvetica, Arial, sans-serif";

/**
 * The gap between two things that sit beside each other. One number.
 *
 * Delivered as PADDING inside each column rather than as a spacer cell,
 * because a spacer cell has to become nothing when the columns stack and a
 * padding already is nothing extra.
 */
export const GUTTER = 16;

/** How wide the words are inside a normal section. The widgets' own assumption. */
export const CONTENT_WIDTH = EMAIL_WIDTH - 48;

/** The chosen face, then the ones every client has. Never the same name twice. */
export function fontStack(face: string): string {
  const first = String(face || "").trim();
  const rest = FALLBACK_STACK.split(",").map((s) => s.trim())
    .filter((s) => s.toLowerCase() !== first.toLowerCase());
  return [first, ...rest].filter(Boolean).join(", ");
}

/* ══════════════════════════════════════════════════════════════════════════
   The fluid-hybrid row
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE fluid-hybrid row — the ONLY way this platform puts two things beside
 * each other in a mailbox.
 *
 *   · each column is an inline-block DIV with `width:100%` and its own
 *     `max-width` in px. Side by side while they fit; wrapped — which is to
 *     say STACKED — as soon as they do not. No query of any kind;
 *   · the wrapping cell is `font-size:0` so the whitespace between two
 *     inline-blocks is not a visible gap, and each div sets its own size back;
 *   · Outlook on Windows ignores inline-block, so a `[if mso]` GHOST TABLE
 *     holds the same columns in a real table for it alone. Every other client
 *     sees the ghost table as a comment.
 *
 * Container queries do not exist in a mailbox and half of them strip `<style>`,
 * so a media query cannot be relied on. This is fluid all the way down with no
 * breakpoint to get wrong, which is why it is the one mechanism.
 */
export interface FluidCell {
  /** How wide this column may get, in px. The sum should be the content width. */
  max: number;
  html: string;
  /** Editor markers (`data-col`), and only in the editor. */
  attrs?: string;
  /** Chrome for the column itself — a card's border, padding and background. */
  cellStyle?: string;
}

export function fluidRow(cells: FluidCell[], opts: { margin?: string; gutter?: number } = {}): string {
  const gutter = opts.gutter ?? GUTTER;
  const pad = Math.round(gutter / 2);
  const margin = opts.margin ?? "";
  const ghostOpen = (c: FluidCell) => `<!--[if mso]><td width="${c.max}" valign="top"><![endif]-->`;
  const body = cells.map((c, i) => {
    const open = i === 0
      ? `<!--[if mso]><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td width="${c.max}" valign="top"><![endif]-->`
      : ghostOpen(c);
    const close = i === cells.length - 1 ? "" : `<!--[if mso]></td><![endif]-->`;
    return open
      + `<div${c.attrs || ""} style="display:inline-block;width:100%;max-width:${c.max}px;vertical-align:top;box-sizing:border-box;padding:0 ${pad}px;font-size:15px;line-height:1.6;text-align:left;">`
      + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td valign="top"${c.cellStyle ? ` style="${c.cellStyle}"` : ""}>${c.html}</td></tr></table>`
      + `</div>`
      + close;
  }).join("");
  // align="left" and not "center": side by side the columns fill the row
  // exactly, so the two are identical there — but a column narrower than the
  // row (an article's 180px picture) is STACKED on a phone, and a picture
  // floating in the middle of a left-aligned email reads as a mistake.
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="${margin}"><tr><td align="left" style="font-size:0;line-height:0;">`
    + body
    + `<!--[if mso]></td></tr></table><![endif]-->`
    + `</td></tr></table>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Words
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Escape everything, then hand back a very short list of inline tags.
 *
 *   <a href="…">  http, https and mailto only — never javascript:
 *   <strong> <b> <em> <i> <br>
 *
 * Everything else — every script, every style, every event handler, every
 * attribute not named above — is already escaped by the time this runs and
 * stays that way.
 */
export function inlineSafe(escaped: string): string {
  return String(escaped)
    .replace(/&lt;(\/?)(strong|b|em|i)&gt;/gi, (_m, slash, tag) => `<${slash}${tag.toLowerCase()}>`)
    .replace(/&lt;br\s*\/?&gt;/gi, "<br />")
    .replace(/&lt;a href=&quot;((?:https?:\/\/|mailto:)[^"&<>\s]*)&quot;&gt;/gi,
      (_m, href) => `<a href="${href}" style="color:inherit;text-decoration:underline;">`)
    .replace(/&lt;\/a&gt;/gi, "</a>");
}

/**
 * What a reader with pictures switched off will be told this picture is.
 *
 * The "every image has alt text" rule has to be checkable on the MODEL as well
 * as on the string — the builder warns before the send, and no renderer ever
 * emits an empty alt.
 */
export function altTextFor(p: any): string {
  const explicit = String(p?.alt ?? "").trim();
  if (explicit) return explicit;
  const caption = String(p?.caption ?? "").trim();
  if (caption) return caption;
  const name = String(p?.src ?? "").split("?")[0].split("/").pop() || "";
  const pretty = name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  return pretty || "Picture";
}

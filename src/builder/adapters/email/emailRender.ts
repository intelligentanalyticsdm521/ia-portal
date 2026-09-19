/**
 * builder/adapters/email/emailRender.ts — THE email renderer.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §3.4 ("Email (newsletter, campaign) →
 * table-based HTML with the email widget subset") and §7.
 *
 * ── ONE RENDERER, THREE PLACES IT IS SEEN ─────────────────────────────────
 * The same function draws:
 *   · the CANVAS, so what the author edits is the email, not a picture of one
 *     (`renderEmailSection`, with `mode: "edit"`, marks the runs of text the
 *     author may type into with `data-edit`, exactly as the document renderer
 *     does — the canvas machinery is shared);
 *   · the TEST SEND and the REAL SEND, which both mail the string this
 *     produces in `mode: "view"`. Nothing re-projects it on the way out: the
 *     newsletter row stores this HTML, the campaign copies that row, and
 *     LUMEN's send path mails what it was given.
 *   · the server's own copy for `lumen.message_template.blocks_json`
 *     (LUMEN-API `src/lib/builderEmailRender.js`), pinned against this module
 *     byte for byte by `test/fixtures/email-render-cases.json` in both repos —
 *     the SEAM-6-A discipline that keeps the three renderTemplate.js copies
 *     honest.
 *
 * ── WHAT A MAILBOX ALLOWS, AS CODE ────────────────────────────────────────
 * Not a style guide; four rules the test suite enforces on every fixture:
 *
 *   1. TABLES, NEVER flex OR grid. Outlook on Windows renders through Word,
 *      which has no flexbox and no grid. `assertEmailSafe()` refuses the
 *      strings, and the mutation test emits one on purpose to prove it.
 *   2. EVERY STYLE INLINE. Gmail strips <style> from the body; a class is a
 *      class with nothing behind it. There is no stylesheet in the output at
 *      all — the canvas's own chrome CSS lives in the canvas, not the email.
 *   3. 600px, NEVER WIDER. The width every client has agreed on since 2005.
 *   4. ALT TEXT ON EVERY PICTURE. Images are blocked by default in Outlook and
 *      often in Gmail; an email whose meaning is in the pictures is an email
 *      most people receive blank.
 *
 * ── THE FOOTER IS NOT THE AUTHOR'S TO DELETE ──────────────────────────────
 * CAN-SPAM wants an unsubscribe route and the sender's physical address on
 * every marketing send. Two guards, because they promise different things:
 *   · `model.removeWidget` / `removeSection` refuse a `locked` widget, so the
 *     button cannot take it off the page;
 *   · `renderEmailDocument` puts the block back if a document reaches it
 *     without one, so an email cannot leave without it even if a row was
 *     hand-edited, imported, or written by an older build.
 * Each is mutation-tested on its own.
 *
 * PURE: strings in, string out. No React, no DOM, no fetch.
 */
import type { BuilderDocument, Section, Widget } from "../../model";
import { fill, type FillMode, type MergeContext } from "../../merge";
// THE TREE, read in ONE place (D-156): render.ts owns what a container is,
// what its layout keys mean and how deep it may go. A mailbox draws it with
// tables instead of flexbox, which is a difference in PAINT, never in model.
import {
  MAX_CONTAINER_DEPTH, boldRuns, childrenOf, containerFlow, containerLayout, isContainer,
  type LocationLite,
} from "../../render";
// ONE catalogue and ONE resolver: the widget's own (stream B), never a second
// lite shape that resolves a price its own way.
import {
  addressFields, cardFields, currencyGlyph, priceWithoutSymbol, resolveCatalogCard,
  snapshotToCardProps, tagOf,
} from "../../widgets";
import type { CatalogOffering } from "../../../components/oliver/ProposalCatalogPicker";
import { money, type DocumentTotals } from "../../totals";
import {
  emailColumnWidths, emailStyleDeclarations, hasStyle, resolveStyle, sidesToCss, typographyDeclarations,
} from "../../style";

/* ══════════════════════════════════════════════════════════════════════════
   The four rules, as constants
   ══════════════════════════════════════════════════════════════════════════ */

/** The width every mail client has agreed on. Never exceeded. */
export const EMAIL_WIDTH = 600;

/** The font stack, in the order a mail client will find one. */
const FALLBACK_STACK = "Helvetica, Arial, sans-serif";

/** Layout properties no mail client can be trusted with. */
export const FORBIDDEN_CSS = ["display:flex", "display:grid", "flex-direction", "grid-template", "position:absolute", "position:fixed"];

/**
 * The gap between two things that sit beside each other. One number.
 *
 * Delivered as PADDING inside each column rather than as a spacer cell,
 * because a spacer cell has to become nothing when the columns stack and a
 * padding already is nothing extra.
 */
const GUTTER = 16;

/**
 * THE fluid-hybrid row — the ONLY way this renderer puts two things beside
 * each other.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §13.1 rule 3 said 600px and never wider;
 * it did not say what happens at 390, and until 2026-09-16 the answer was
 * "nothing". A two-column section, an article beside its picture and a row of
 * product cards were `<td style="width:48%">`, and a percentage of a phone is
 * still a phone: two 150px columns of 14px text, which is the shape of an
 * email most people delete.
 *
 * Container queries do not exist in a mailbox and half of them strip <style>,
 * so a media query cannot be relied on either. The pattern that has worked
 * everywhere since 2015 is this one:
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
 * The result is fluid all the way down with no breakpoint to get wrong, which
 * is why this is the one mechanism and there is no second one.
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

/** How wide the words are inside a normal section. The widgets' own assumption. */
export const CONTENT_WIDTH = EMAIL_WIDTH - 48;

/* ── One escaper. Same rules as the document renderer's. ─────────────────── */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A colour we are about to put in a style attribute, or nothing. */
function colour(v: unknown, fallback: string): string {
  const s = String(v ?? "").trim();
  return /^#[0-9a-fA-F]{3,8}$|^rgb|^hsl/.test(s) ? s : fallback;
}

/* ══════════════════════════════════════════════════════════════════════════
   The context
   ══════════════════════════════════════════════════════════════════════════ */

/** One thing the business sells, as the card shows it. */
export interface EmailBusiness {
  name: string;
  address?: string;
  logoUrl?: string | null;
  website?: string | null;
  social?: Array<{ label: string; url: string }>;
}

export interface EmailRenderContext {
  /**
   * "edit" on the canvas, "view" for a preview of one recipient's copy, and
   * "send" for the body that is STORED and then mailed — see merge.ts. A body
   * stored in "view" mode carries the preview contact's name to everybody.
   */
  mode: FillMode;
  merge: MergeContext;
  /** Any colour and any font, per Q4; the brand kit only pre-filled these. */
  accent: string;
  ink: string;
  paper: string;
  page: string;
  headingFont: string;
  bodyFont: string;
  business: EmailBusiness;
  /**
   * Where "Unsubscribe" points.
   *
   * In the builder and in a test send this is a placeholder, because the real
   * one is per-recipient and LUMEN mints it at send time
   * (`notificationPreferences.getOrIssueToken`). It is never blank: a footer
   * with a dead unsubscribe link is the same failure as no footer.
   */
  unsubscribeUrl: string;
  preferencesUrl?: string;
  /**
   * THE AUTHOR'S TYPOGRAPHY for the widget being drawn, as inline declarations.
   *
   * FOUND BY DRIVING IT (2026-09-17, §11.8): a widget's typography was put on
   * the wrapping cell and INHERITED down — which is exactly what it does on the
   * page, where a CSS rule can also name the children. A mailbox has no
   * stylesheet, and `<h1 style="font-size:26px">` beats anything inherited, so
   * a 27px heading arrived 26px. The declarations therefore travel to the
   * widget's own element and are appended LAST, because the last declaration
   * for a property inside one style attribute is the one that wins.
   *
   * Set by `renderEmailWidget` for the widget it is about to draw, and never
   * set anywhere else — a context carrying somebody else's type would style the
   * wrong words.
   */
  typeCss?: string;
  /**
   * HOW WIDE THE THING BEING DRAWN MAY GET, in px.
   *
   * A mailbox has no percentages that survive Outlook, so every column in the
   * fluid-hybrid row carries its own `max-width` in pixels — which means a box
   * inside a box has to know what is left of the 552. The section sets it and
   * each container narrows it for its children; absent, CONTENT_WIDTH, which
   * is what every widget assumed before boxes existed.
   */
  width?: number;
  /** D-156's three sources, handed in. See the landing adapter for the why. */
  catalogue?: CatalogOffering[];
  locations?: Record<string, LocationLite>;
  totals?: DocumentTotals;
}

export function makeEmailContext(
  doc: BuilderDocument,
  partial: Partial<EmailRenderContext> = {},
): EmailRenderContext {
  return {
    mode: partial.mode ?? "view",
    merge: partial.merge ?? {},
    accent: colour(partial.accent ?? doc.settings.accent, "#0F172A"),
    ink: colour(partial.ink, "#111827"),
    paper: colour(partial.paper, "#FFFFFF"),
    page: colour(partial.page, "#F1F5F9"),
    headingFont: partial.headingFont || doc.settings.headingFont || "Helvetica",
    bodyFont: partial.bodyFont || doc.settings.bodyFont || "Helvetica",
    business: partial.business ?? { name: "" },
    unsubscribeUrl: partial.unsubscribeUrl || "{{unsubscribe_url}}",
    preferencesUrl: partial.preferencesUrl,
    ...(partial.catalogue ? { catalogue: partial.catalogue } : {}),
    ...(partial.locations ? { locations: partial.locations } : {}),
    ...(partial.totals ? { totals: partial.totals } : {}),
  };
}

/** The chosen face, then the ones every client has. Never the same name twice. */
function stack(face: string): string {
  const first = String(face || "").trim();
  const rest = FALLBACK_STACK.split(",").map((s) => s.trim())
    .filter((s) => s.toLowerCase() !== first.toLowerCase());
  return [first, ...rest].filter(Boolean).join(", ");
}
const headStack = (c: EmailRenderContext) => stack(c.headingFont);
const bodyStack = (c: EmailRenderContext) => stack(c.bodyFont);

/**
 * Escape everything, then hand back a very short list of inline tags.
 *
 * ── WHY THERE IS AN ALLOWLIST AT ALL ──────────────────────────────────────
 * A newsletter written in the old editor is a TipTap document: paragraphs with
 * bold runs and LINKS inside them. Escaping the lot would open every past
 * issue with its links turned into visible angle brackets, and retyping them
 * by hand is not a migration. So six tags survive, each with its attributes
 * checked rather than trusted:
 *
 *   <a href="…">  http, https and mailto only — never javascript:
 *   <strong> <b> <em> <i> <br>
 *
 * Everything else — every script, every style, every event handler, every
 * attribute not named above — is already escaped by the time this function
 * runs and stays that way. This is STRICTER than what the platform does
 * today, where a campaign's content_html is stored and mailed verbatim.
 */
export function inlineSafe(escaped: string): string {
  return String(escaped)
    .replace(/&lt;(\/?)(strong|b|em|i)&gt;/gi, (_m, slash, tag) => `<${slash}${tag.toLowerCase()}>`)
    .replace(/&lt;br\s*\/?&gt;/gi, "<br />")
    .replace(/&lt;a href=&quot;((?:https?:\/\/|mailto:)[^"&<>\s]*)&quot;&gt;/gi,
      (_m, href) => `<a href="${href}" style="color:inherit;text-decoration:underline;">`)
    .replace(/&lt;\/a&gt;/gi, "</a>");
}

/** Merge-fill, escape, then re-permit the six inline tags. */
function t(text: unknown, c: EmailRenderContext): string {
  return inlineSafe(esc(fill(String(text ?? ""), c.merge, c.mode)));
}

/** `data-edit="path"`, only while editing — a sent email carries no markers. */
function edit(path: string, c: EmailRenderContext, placeholder?: string): string {
  if (c.mode !== "edit") return "";
  return ` data-edit="${esc(path)}"${placeholder ? ` data-placeholder="${esc(placeholder)}"` : ""}`;
}

/** Paragraph runs from plain text with blank lines between them. */
function paras(text: unknown, c: EmailRenderContext, path: string, style: string): string {
  const filled = fill(String(text ?? ""), c.merge, c.mode);
  if (!filled.trim()) {
    return c.mode === "edit"
      ? `<div style="${style}"${edit(path, c, "Type here…")}></div>`
      : "";
  }
  /* `boldRuns` is the ENGINE's (render.ts), not a second copy: a short answer
     reads "**Service term** 1 November" in a mailbox exactly as it does on the
     page, and `<strong>` is the one tag every mail client on earth draws. */
  const blocks = filled.split(/\n{2,}/).map((p) => boldRuns(inlineSafe(esc(p.trim()))).replace(/\n/g, "<br />"));
  if (c.mode === "edit") {
    return `<div style="${style}${c.typeCss ?? ""}"${edit(path, c)}>${blocks.map((b) => `<p style="margin:0 0 12px 0;">${b}</p>`).join("")}</div>`;
  }
  return blocks.map((b) => `<p style="${style}margin:0 0 12px 0;${c.typeCss ?? ""}">${b}</p>`).join("");
}

/* ══════════════════════════════════════════════════════════════════════════
   Widgets
   ══════════════════════════════════════════════════════════════════════════ */

/** Every kind this renderer draws. The parity test reads this list. */
export const EMAIL_RENDERED_KINDS = [
  "heading", "paragraph", "personal_note", "list", "image", "button",
  "divider", "spacer", "article_card", "product_card", "social_links",
  "email_footer", "countdown", "testimonial",
  // D-156 — the box and the atomic widgets reach the mailbox too.
  // `catalog_card` draws through the same `emCard` as a typed card (see the
  // switch): it was DRAWN and missing from this list, which is the list the
  // suite checks the pane against — so widening the pane found it.
  "container", "card", "catalog_card", "price_line", "address_block", "key_fact", "totals",
  /* D-165 — the two kinds the DOCUMENT renamed, drawn by the same two
     functions as before, because a kind with two spellings is still one kind. */
  "service_location", "customer",
  /* `grid` is a LAYOUT PRESET and never a stored kind: the tile inserts a
     `container` laid out as a grid, which `emBox` already draws as a fluid row.
     Listed so the pane-versus-renderer test can see it is accounted for. */
  "grid",
  // D-165 §11.13.3 — the standard set every builder offers, each one drawn
  // here as a TABLE rather than by the engine (see the switch below).
  "icon", "icon_box", "image_box", "star_rating", "alert",
] as const;

/** Deliberately not drawn: `columns` is the SECTION's column count. */
export const EMAIL_UNRENDERED_KINDS = ["columns"] as const;

const ALIGN = (v: unknown, dflt = "left"): string => {
  const s = String(v ?? "").toLowerCase();
  if (s.startsWith("cent")) return "center";
  if (s.startsWith("right")) return "right";
  if (s.startsWith("left")) return "left";
  return dflt;
};

export function renderEmailWidget(w: Widget, outer: EmailRenderContext, depth = 0): string {
  const p: any = w.props || {};
  // The author's own type, carried to the widget's element (see `typeCss`).
  const type = hasStyle(w.style) ? typographyDeclarations(resolveStyle(w.style, "desktop").typography) : [];
  const c: EmailRenderContext = type.length ? { ...outer, typeCss: `${type.join(";")};` } : outer;
  const body = (() => {
    switch (EMAIL_KIND_ALIASES[w.kind] || w.kind) {
      case "container": return emBox(w, c, depth);
      case "card": return emCard(emCardFields(p, c), c, emWidth(c));
      case "price_line": case "priced_line": return emPriceLine(p, c);
      /* D-165 — the DOCUMENT renamed these two and this surface has not: a
         proposal's address block is `service_location` now and a key fact is a
         line of text, and `upgrade.ts` converts every stored one on the way in,
         including the ones in a stored newsletter. One line each rather than a
         second renderer, exactly as `price_line` / `priced_line` already do —
         a kind with two spellings is still one kind. The full rename is item
         S2 in `overnight-report/D165_HANDOFF_2026-09-19.md`. */
      case "service_location":
      case "address_block": return emAddress(p, c);
      /* A TYPED address block upgrades to `customer` (§11.13.3: "address_block
         -> customer or service_location by its binding"), and a mailbox has to
         keep drawing it. Same fields, same function — `emAddress` reads
         `name` / `address` / `contact` / `notes`, and the Customer widget's
         `billing_address` is read as the address. */
      case "customer": return emAddress(p, c);
      case "key_fact": return emKeyFact(p, c);
      case "totals": return emTotals(p, c);
      case "heading": return emHeading(p, c);
      case "paragraph": return paras(p.text, c, "text", `font-family:${bodyStack(c)};font-size:15px;line-height:1.6;color:${c.ink};text-align:${ALIGN(p.align)};`);
      case "personal_note": return emPersonalNote(p, c);
      case "list": return emList(p, c);
      case "image": return emImage(p, c);
      case "button": return emButton(p, c);
      case "divider": return emDivider(p, c);
      case "spacer": return `<div style="height:${Math.max(1, Number(p.height) || 24)}px;line-height:${Math.max(1, Number(p.height) || 24)}px;font-size:1px;">&nbsp;</div>`;
      case "article_card": return emArticles(p, c);
      // THE COLLISION IS GONE, BY NAMING (integration, 2026-09-17).
      //
      // `product_card` is the NEWSLETTER's composite — a LIST of things to
      // show off (`props.items`) — and it keeps its name because it is on disk
      // in stored email documents and nothing upgrades those. D-156's card
      // bound to ONE catalogue line is `catalog_card`, which is the name the
      // registry, the upgrade, the PDF and the website emitter all use. Two
      // cases, two kinds, no branch on which fields happen to be present.
      case "product_card": return emProducts(p, c);
      case "catalog_card": return emCard(emCatalogCard(p, c), c, emWidth(c));
      case "social_links": return emSocial(p, c, ALIGN(p.align, "center"));
      case "email_footer": return emFooter(p, c);
      case "countdown": return emCountdown(p, c);
      case "testimonial": return emTestimonial(p, c);
      /* D-165 §11.13.3 — the standard set, each one a TABLE.
       *
       * THE ENGINE IS NOT ASKED HERE, and that is the decision. A first cut had
       * the default branch fall back to `renderAtom` so nothing the panel
       * offered could be silently blank; this suite's own guards refused it by
       * name — "no mail client is asked to lay out a flex box or a grid" and
       * "every style is inline; there is no stylesheet and no class". They are
       * right, and the answer is the other one: a hand-written table renderer
       * per kind, which is what these five are. */
      case "icon": return emIcon(p, c);
      case "icon_box": return emIconBox(p, c);
      case "image_box": return emImageBox(p, c);
      case "star_rating": return emStarRating(p, c);
      case "alert": return emAlert(p, c);
      default:
        // Forward compatible, like migration 166's envelope: a widget from a
        // newer editor is INERT in the mailbox and explained on the canvas.
        return c.mode === "edit"
          ? `<div style="border:1px dashed #CBD5E1;border-radius:6px;padding:10px;color:#94A3B8;font-size:11px;font-family:${bodyStack(c)};">This part (“${esc(w.kind)}”) needs a newer version of the builder to show.</div>`
          : "";
    }
  })();
  if (!body && c.mode !== "edit") return "";
  // THE AUTHOR'S STYLING, in what a mailbox understands (§11.8).
  //
  // A margin becomes an outer CELL's padding, because margin on a block is the
  // first thing Outlook drops; alignment becomes `text-align` on that cell;
  // typography becomes inline declarations there, which the widget's own
  // inline font-size beats where it sets one and inherits into everything
  // else. NO shadow and NO radius reach this at all — style.ts refuses to
  // emit either, and the inspector says "not in email" rather than offering a
  // control that quietly does nothing.
  //
  // Absent a style the widget's HTML is exactly what it was, which is what the
  // thirty golden fixtures pin.
  const styled = hasStyle(w.style)
    ? wrapEmailStyle(body, emailStyleDeclarations(w.style, "widget"))
    : body;
  if (c.mode !== "edit") return styled;
  return `<div data-widget="${esc(w.id)}" data-kind="${esc(w.kind)}"${w.locked ? ` data-locked="1"` : ""}>${styled}</div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   D-156 — the box and the atomic widgets, in a mailbox
   ══════════════════════════════════════════════════════════════════════════ */

/** What is left of the 552, for the box being drawn. */
function emWidth(c: EmailRenderContext): number {
  const w = Number(c.width);
  return Number.isFinite(w) && w > 0 ? Math.floor(w) : CONTENT_WIDTH;
}

/**
 * A BOX, as nested tables.
 *
 * A column box is a stack, which in a mailbox is simply the children one after
 * another inside one cell — the gap delivered as a bottom padding per child,
 * because a `gap` is a flexbox word and Outlook renders through Word.
 *
 * A row box is `fluidRow`, the ONE mechanism §13.1 already uses for a
 * multi-column section: inline-block divs with their own `max-width` in px, a
 * font-size:0 wrapper so the whitespace between them is not a gap, and an mso
 * ghost table for Outlook. It stacks by WRAPPING at any width, so a box three
 * deep needs no query and there is no breakpoint to get wrong. A grid box is
 * the same row, taken `columns` at a time.
 */
function emBox(w: Widget, c: EmailRenderContext, depth: number): string {
  if (depth >= MAX_CONTAINER_DEPTH) return "";
  const layout = containerLayout(w);
  const kids = childrenOf(w);
  if (!kids.length) return "";
  const p: any = w.props || {};
  const bg = p.background_color ? colour(p.background_color, "") : "";
  // A mailbox has one gap between two things, not a row gap and a column gap:
  // a stack is spaced by the ROW gap and a row by the COLUMN gap, which is
  // what each of those numbers means.
  const flow = containerFlow(layout);
  const gap = flow === "column" ? layout.gap.row : layout.gap.column;
  const outer = emWidth(c);

  let body: string;
  if (flow === "column") {
    const inner: EmailRenderContext = { ...c, width: outer };
    body = kids.map((k, i) => {
      const html = renderEmailWidget(k, inner, depth + 1);
      if (!html) return "";
      const pad = i < kids.length - 1 ? ` style="padding-bottom:${gap}px;"` : "";
      return `<tr><td valign="top"${pad}>${html}</td></tr>`;
    }).join("");
    body = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${body}</table>`;
  } else {
    const per = flow === "grid" ? layout.columns : kids.length;
    const rows: string[] = [];
    for (let start = 0; start < kids.length; start += per) {
      const slice = kids.slice(start, start + per);
      // The gutter is delivered INSIDE each column (fluidRow's own rule), so
      // the width a child may use is the share minus what the gutter eats.
      const max = Math.max(60, Math.floor(outer / slice.length));
      const inner: EmailRenderContext = { ...c, width: Math.max(40, max - gap) };
      rows.push(fluidRow(
        slice.map((k) => ({ max, html: renderEmailWidget(k, inner, depth + 1) })),
        { gutter: gap, margin: start + per < kids.length ? `margin:0 0 ${gap}px 0;` : "" },
      ));
    }
    body = rows.join("");
  }
  if (!bg) return body;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${bg};"><tr><td>${body}</td></tr></table>`;
}

interface EmCard {
  title: unknown; price: unknown; per: unknown; was: unknown;
  description: unknown; bullets: unknown[]; note: unknown;
  recommended: boolean; tag: string; tagColour: string;
  cta?: { label: string; url: string } | null;
}

/**
 * One card's words — through the WIDGET's OWN reader (`widgets/card.ts`).
 *
 * It used to be a second copy of `cardFields`: the same picks, in the same
 * order, over its own copy of the list of spellings. Two readers is two
 * chances to show a blank card in a mailbox, and it was the copy that would
 * have been forgotten when the card's field names changed. What is left here
 * is the three things a MAILBOX needs and a page does not — the ribbon as a
 * plain string, the "recommended" flag the table layout reads, and the CTA as
 * an object — decorated on top of the one set of words.
 *
 * `tagOf` is likewise the widget's own ribbon reader: a tag object, a plain
 * string, the composite's `badge`, or `show_ribbon` + `ribbon_title`.
 */
function emCardFields(p: any, c: EmailRenderContext): EmCard {
  const f = cardFields(p);
  const ribbon = tagOf(p);
  const tag = ribbon?.text ?? "";
  const glyph = currencyGlyph(p);
  const price = glyph ? `${glyph}${priceWithoutSymbol(f.price, glyph)}` : f.price;
  const label = f.button_text;
  const url = f.link;
  return {
    title: f.heading,
    price,
    per: f.period,
    was: f.sale ? f.original_price : "",
    description: f.description,
    bullets: f.features_list,
    note: f.footer_additional_info,
    recommended: !!tag,
    tag,
    tagColour: colour(ribbon?.colour, c.accent),
    cta: label || url ? { label: String(label || "Choose this"), url: String(url || "#") } : null,
  };
}

/**
 * A catalogue card's words, resolved by the ONE resolver (integration).
 *
 * `resolveCatalogCard` is the widget's own — override, then the live catalogue
 * the caller handed in, then the snapshot stored on the widget — so a card in
 * a mailbox says exactly what the same card says on the canvas and on paper.
 * A second resolution order here is how three surfaces come to disagree about
 * a price.
 */
function emCatalogCard(p: any, c: EmailRenderContext): EmCard {
  const r = resolveCatalogCard(p, c.catalogue);
  // `snapshotToCardProps` is the ONE map from a catalogue snapshot to a card's
  // own field names, so a card in a mailbox is spelled exactly as a card on the
  // canvas is and `cardFields` reads it without a second vocabulary.
  return emCardFields({ ...p, ...snapshotToCardProps(r) }, c);
}

/**
 * A card, in what a mailbox understands.
 *
 * The TAG is a table cell with a background, not a floated pill: a mailbox has
 * no `position:absolute` (it is in FORBIDDEN_CSS), so the pill sits on the
 * card's first row instead of over its edge. Same words, same colour, a layout
 * every client can draw.
 */
function emCard(f: EmCard, c: EmailRenderContext, max: number): string {
  const border = f.recommended ? `2px solid ${f.tagColour}` : "1px solid #E5E7EB";
  const bullets = f.bullets.filter((b) => String(b ?? "").trim());
  const rows: string[] = [];
  if (f.tag) {
    rows.push(`<tr><td style="padding:0 0 8px 0;"><span style="display:inline-block;background:${f.tagColour};color:${contrastInk(f.tagColour)};font-family:${bodyStack(c)};font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-radius:999px;padding:3px 10px;">${esc(f.tag)}</span></td></tr>`);
  }
  rows.push(`<tr><td style="font-family:${headStack(c)};font-size:16px;font-weight:700;color:${c.ink};padding:0 0 4px 0;"${edit("title", c, "What it is called")}>${t(f.title, c)}</td></tr>`);
  const price = [
    f.price ? `<span style="font-family:${headStack(c)};font-size:20px;font-weight:700;color:${c.ink};">${t(f.price, c)}</span>` : "",
    f.per ? `<span style="font-family:${bodyStack(c)};font-size:12px;color:#6B7280;">&nbsp;${t(f.per, c)}</span>` : "",
    f.was ? `<span style="font-family:${bodyStack(c)};font-size:12px;color:#9CA3AF;text-decoration:line-through;">&nbsp;${t(f.was, c)}</span>` : "",
  ].join("");
  if (price) rows.push(`<tr><td style="padding:0 0 6px 0;">${price}</td></tr>`);
  if (f.description) rows.push(`<tr><td style="font-family:${bodyStack(c)};font-size:13px;line-height:1.55;color:#374151;padding:0 0 8px 0;"${edit("description", c)}>${t(f.description, c)}</td></tr>`);
  if (bullets.length) {
    rows.push(`<tr><td style="padding:0 0 8px 0;"><ul style="margin:0;padding-left:18px;font-family:${bodyStack(c)};font-size:13px;line-height:1.6;color:${c.ink};">${
      bullets.map((b) => `<li>${t(b, c)}</li>`).join("")}</ul></td></tr>`);
  }
  if (f.note) rows.push(`<tr><td style="font-family:${bodyStack(c)};font-size:11px;color:#6B7280;padding:0 0 4px 0;">${t(f.note, c)}</td></tr>`);
  if (f.cta) {
    rows.push(`<tr><td style="padding:6px 0 0 0;"><a href="${esc(f.cta.url)}" style="display:inline-block;background:${c.accent};color:${contrastInk(c.accent)};font-family:${bodyStack(c)};font-size:13px;font-weight:600;text-decoration:none;border-radius:6px;padding:9px 16px;">${esc(f.cta.label)}</a></td></tr>`);
  }
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:${Math.max(60, max)}px;border:${border};border-radius:8px;background:${c.paper};"><tr><td style="padding:14px;">`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows.join("")}</table>`
    + `</td></tr></table>`;
}

/** A named line with a figure. `priced_line` is the same widget, older name. */
function emPriceLine(p: any, c: EmailRenderContext): string {
  const qty = Number(p?.quantity) || 1;
  const unit = Number(p?.unit_price) || 0;
  const amount = money(qty * unit) + (p?.cadence ? ` ${String(p.cadence)}` : "");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px 0;"><tr>`
    + `<td valign="top" style="font-family:${bodyStack(c)};font-size:14px;font-weight:700;color:${c.ink};"${edit("name", c, "What it is")}>${t(p?.name, c)}</td>`
    + `<td valign="top" align="right" style="font-family:${bodyStack(c)};font-size:14px;font-weight:700;color:${c.ink};white-space:nowrap;">${esc(amount)}</td>`
    + `</tr>${p?.description ? `<tr><td colspan="2" style="font-family:${bodyStack(c)};font-size:13px;line-height:1.55;color:#374151;padding-top:2px;"${edit("description", c)}>${t(p.description, c)}</td></tr>` : ""}</table>`;
}

function emKeyFact(p: any, c: EmailRenderContext): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-bottom:1px solid #E5E7EB;"><tr>`
    + `<td style="font-family:${bodyStack(c)};font-size:10px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:#6B7280;padding:6px 0;"${edit("label", c, "Label")}>${t(p?.label, c)}</td>`
    + `<td align="right" style="font-family:${bodyStack(c)};font-size:13px;font-weight:600;color:${c.ink};padding:6px 0;"${edit("value", c, "Value")}>${t(p?.value, c)}</td>`
    + `</tr></table>`;
}

/* `emAddressLine` LIVED HERE and is DELETED (integration, 2026-09-19).
   It joined a location's lines with a middot while `locationAddress`
   (widgets/iaData.ts) joined them with a comma, so one address read two
   ways depending on which surface drew it. `addressFields` is the one
   reader and it uses the one formatter. */

/**
 * ONE READER for what a site block holds (integration, 2026-09-19).
 *
 * `addressFields` is the platform's single answer to "what does this widget
 * say", and it reads all three places a value can be: the record widget's
 * `overrides`, an older `address_block`'s flat props, and the location the
 * widget is bound to. This function used to read the flat props only, so a
 * block converted by the upgrade — which writes `overrides` — mailed a blank
 * where the address was.
 */
function emAddress(p: any, c: EmailRenderContext): string {
  const f = addressFields(p, c.locations as any);
  const bound = f.bound;
  const name = f.name;
  const line = f.address;
  const contact = f.contact;
  const access = f.notes;
  if (!name && !line && !contact && !access) return "";
  const meta = (label: string, value: unknown) => value
    ? `<div style="font-family:${bodyStack(c)};font-size:11px;color:#6B7280;margin-top:3px;"><span style="text-transform:uppercase;letter-spacing:.06em;font-weight:700;">${esc(label)}</span> ${t(value, c)}</div>` : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>`
    + `<td style="border-left:3px solid ${c.accent};padding:0 0 0 10px;">`
    + `<div style="font-family:${headStack(c)};font-size:14px;font-weight:700;color:${c.ink};"${bound ? "" : edit("name", c, "Property name")}>${t(name, c)}</div>`
    + (line ? `<div style="font-family:${bodyStack(c)};font-size:13px;color:#6B7280;"${bound ? "" : edit("address", c, "Street, town, postcode")}>${t(line, c)}</div>` : "")
    + meta("Site contact", contact) + meta("Access", access)
    + `</td></tr></table>`;
}

/** THE ONE TOTAL, read from the context. See the landing adapter's `lpTotals`. */
function emTotals(p: any, c: EmailRenderContext): string {
  const tt = c.totals;
  if (!tt) return "";
  const row = (label: string, amount: string, grand = false) =>
    `<tr><td style="font-family:${bodyStack(c)};font-size:${grand ? 15 : 13}px;font-weight:${grand ? 700 : 400};color:${c.ink};padding:6px 0;border-top:${grand ? `2px solid ${c.accent}` : "1px solid #E5E7EB"};">${esc(label)}</td>`
    + `<td align="right" style="font-family:${bodyStack(c)};font-size:${grand ? 15 : 13}px;font-weight:${grand ? 700 : 400};color:${c.ink};padding:6px 0;border-top:${grand ? `2px solid ${c.accent}` : "1px solid #E5E7EB"};">${esc(amount)}</td></tr>`;
  const head = p?.heading
    ? `<tr><td colspan="2" style="font-family:${headStack(c)};font-size:16px;font-weight:700;color:${c.ink};padding:0 0 6px 0;"${edit("heading", c)}>${t(p.heading, c)}</td></tr>` : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${head}`
    + tt.sites.map((x) => row(x.name, money(x.subtotal))).join("")
    + row("Subtotal", money(tt.subtotal))
    + (tt.tax ? row("Tax", money(tt.tax)) : "")
    + (tt.discount ? row("Discount", `\u2212${money(tt.discount)}`) : "")
    + row("Total", money(tt.total), true)
    + `</table>`;
}

/** One more table, only when there is something to say with it. */
function wrapEmailStyle(body: string, decls: string[]): string {
  if (!decls.length) return body;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>`
    + `<td style="${decls.join(";")};">${body}</td></tr></table>`;
}

function emHeading(p: any, c: EmailRenderContext): string {
  const level = p.level === "Page title" || p.level === 1 ? 1 : p.level === "Sub-section" || p.level === 3 ? 3 : 2;
  const size = level === 1 ? 26 : level === 2 ? 20 : 16;
  const tag = `h${level}`;
  const col = colour(p.colour, c.ink);
  return `<${tag} style="margin:0 0 12px 0;font-family:${headStack(c)};font-size:${size}px;line-height:1.25;font-weight:700;color:${col};text-align:${ALIGN(p.align)};${c.typeCss ?? ""}"${edit("text", c, "Your heading")}>${t(p.text, c)}</${tag}>`;
}

/**
 * The personal note.
 *
 * It exists because a newsletter that opens "Dear Customer" is a newsletter
 * nobody reads. The greeting is a merge tag by default, so the thing the
 * author has to remember is nothing.
 */
function emPersonalNote(p: any, c: EmailRenderContext): string {
  const align = ALIGN(p.align);
  const base = `font-family:${bodyStack(c)};font-size:15px;line-height:1.6;color:${c.ink};text-align:${align};${c.typeCss ?? ""}`;
  const greeting = p.greeting || c.mode === "edit"
    ? `<p style="${base}margin:0 0 10px 0;font-weight:600;"${edit("greeting", c, "Hi {{first name}},")}>${t(p.greeting, c)}</p>` : "";
  const sign = p.signoff || c.mode === "edit"
    ? `<p style="${base}margin:12px 0 0 0;"${edit("signoff", c, "— your name")}>${t(p.signoff, c)}</p>` : "";
  return greeting + paras(p.text, c, "text", base) + sign;
}

function emList(p: any, c: EmailRenderContext): string {
  const items: string[] = Array.isArray(p.items) ? p.items : [];
  const shown = c.mode === "edit" ? [...items, ""] : items.filter((x) => String(x ?? "").trim());
  if (!shown.length) return "";
  const li = shown.map((it, i) =>
    `<li style="margin:0 0 6px 0;"${edit(`items.${i}`, c, "add a point…")}>${t(it, c)}</li>`).join("");
  return `<ul style="margin:0 0 12px 0;padding-left:20px;font-family:${bodyStack(c)};font-size:15px;line-height:1.6;color:${c.ink};${c.typeCss ?? ""}">${li}</ul>`;
}

/**
 * A picture.
 *
 * `alt` is not optional and not silently defaulted to "": a missing
 * description becomes the caption, or the file's own name, so that a reader
 * with images off still learns something. The test refuses `alt=""`.
 */
function emImage(p: any, c: EmailRenderContext): string {
  if (!p.src) {
    return c.mode === "edit"
      ? `<div style="border:1px dashed #CBD5E1;border-radius:6px;padding:20px;text-align:center;color:#94A3B8;font-size:12px;font-family:${bodyStack(c)};">Choose a picture in the panel on the right.</div>`
      : "";
  }
  const align = ALIGN(p.align, "center");
  const width = Math.min(EMAIL_WIDTH - 48, Math.max(40, Number(p.width) || EMAIL_WIDTH - 48));
  const alt = esc(altTextFor(p));
  const img = `<img src="${esc(p.src)}" alt="${alt}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;${align === "center" ? "margin:0 auto;" : ""}" />`;
  const wrapped = p.url ? `<a href="${esc(p.url)}" style="text-decoration:none;">${img}</a>` : img;
  const cap = p.caption || c.mode === "edit"
    ? `<div style="font-family:${bodyStack(c)};font-size:12px;color:#6B7280;margin-top:6px;text-align:${align};"${edit("caption", c, "Caption (optional)")}>${t(p.caption, c)}</div>` : "";
  return `<div style="text-align:${align};margin:0 0 16px 0;">${wrapped}${cap}</div>`;
}

/**
 * What a reader with pictures switched off will be told this picture is.
 *
 * Exported because the "every image has alt text" rule has to be checkable on
 * the MODEL as well as on the string — the builder warns before the send, and
 * the renderer never emits an empty alt.
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

/**
 * The button.
 *
 * A bulletproof one: the colour is on a <td>, not on the <a>, because Outlook
 * drops background on an inline element and the reader gets blue underlined
 * text where the author put a button.
 */
function emButton(p: any, c: EmailRenderContext): string {
  const align = ALIGN(p.align, "center");
  const style = String(p.style || "solid").toLowerCase();
  const bg = colour(p.colour, c.accent);
  const radius = Number.isFinite(Number(p.radius)) ? Math.max(0, Number(p.radius)) : 6;
  const url = esc(p.url || "#");
  const label = t(p.label, c) || (c.mode === "edit" ? "" : "");
  const inner = `<span${edit("label", c, "Button text")}>${label}</span>`;
  if (style.startsWith("plain")) {
    return `<div style="text-align:${align};margin:0 0 20px 0;font-family:${bodyStack(c)};font-size:15px;"><a href="${url}" style="color:${bg};font-weight:600;text-decoration:underline;">${inner}</a></div>`;
  }
  const cell = style.startsWith("outline")
    ? `border:2px solid ${bg};border-radius:${radius}px;background:${c.paper};`
    : `border-radius:${radius}px;background:${bg};`;
  const ink = style.startsWith("outline") ? bg : contrastInk(bg);
  const full = String(p.width || "").toLowerCase() === "full";
  return `<table role="presentation" ${full ? 'width="100%" ' : ""}cellspacing="0" cellpadding="0" border="0" align="${align}" style="margin:0 auto 20px auto;${full ? "width:100%;" : ""}">`
    + `<tr><td align="center" style="${cell}${full ? "width:100%;" : ""}">`
    + `<a href="${url}" style="${full ? "display:block;width:100%;box-sizing:border-box;" : "display:inline-block;"}padding:13px 26px;font-family:${bodyStack(c)};font-size:15px;font-weight:600;color:${ink};text-decoration:none;border-radius:${radius}px;${c.typeCss ?? ""}">${inner}</a>`
    + `</td></tr></table>`;
}

/**
 * Black or white on this background, whichever a person can read.
 *
 * The same relative-luminance rule CTAEditorBlock's autoContrastColor uses, so
 * a button built in the composer and the same button built here do not
 * disagree about whether the label is legible.
 */
export function contrastInk(hex: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return "#FFFFFF";
  let h = m[1];
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.42 ? "#111827" : "#FFFFFF";
}

function emDivider(p: any, c: EmailRenderContext): string {
  const style = String(p.style || "line").toLowerCase();
  if (style.startsWith("space")) return `<div style="height:20px;line-height:20px;font-size:1px;">&nbsp;</div>`;
  const kind = style.startsWith("dot") ? "dotted" : "solid";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;"><tr><td style="border-top:1px ${kind} ${colour(p.colour, "#E5E7EB")};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

/** Articles — the shape a newsletter is mostly made of. */
/** How wide an article's picture is when it sits beside the words. */
const ARTICLE_PIC = 180;

function emArticles(p: any, c: EmailRenderContext): string {
  const items: any[] = Array.isArray(p.items) ? p.items : [];
  const stacked = String(p.layout || "").toLowerCase().includes("above");
  const shown = c.mode === "edit" ? items : items.filter((a) => String(a?.title ?? "").trim() || String(a?.excerpt ?? "").trim());
  if (!shown.length) return "";
  return shown.map((a, i) => {
    const title = `<div style="font-family:${headStack(c)};font-size:17px;font-weight:700;line-height:1.3;color:${c.ink};margin:0 0 6px 0;"${edit(`items.${i}.title`, c, "Headline")}>${t(a?.title, c)}</div>`;
    const excerpt = `<div style="font-family:${bodyStack(c)};font-size:14px;line-height:1.6;color:#374151;margin:0 0 8px 0;"${edit(`items.${i}.excerpt`, c, "A line or two about it…")}>${t(a?.excerpt, c)}</div>`;
    const link = a?.url
      ? `<a href="${esc(a.url)}" style="font-family:${bodyStack(c)};font-size:14px;font-weight:600;color:${c.accent};text-decoration:none;">${t(a?.linkLabel || "Read it", c)} &rarr;</a>`
      : "";
    const pic = a?.image
      ? `<img src="${esc(a.image)}" alt="${esc(altTextFor({ alt: a?.alt, caption: a?.title, src: a?.image }))}" width="${stacked ? CONTENT_WIDTH : ARTICLE_PIC}" style="display:block;width:100%;max-width:${stacked ? CONTENT_WIDTH : ARTICLE_PIC}px;height:auto;border:0;border-radius:6px;" />`
      : "";
    const words = `${title}${excerpt}${link}`;
    // Beside the picture on a screen wide enough to hold both, UNDER it on a
    // phone — the same fluid row a two-column section uses, so there is one
    // stacking rule in this file and not two.
    if (!pic || stacked) {
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px 0;">`
        + `<tr><td style="padding:0 0 10px 0;">${pic}</td></tr><tr><td>${words}</td></tr></table>`;
    }
    return fluidRow(
      [{ max: ARTICLE_PIC, html: pic }, { max: CONTENT_WIDTH - ARTICLE_PIC, html: words }],
      { margin: "margin:0 0 22px 0;" },
    );
  }).join("");
}

/**
 * Products and prices, from Products & Services.
 *
 * The CADENCE comes with the price and is printed beside it — "$185 per push",
 * "$1,200 seasonal" — because a number with no basis is the thing a customer
 * reads wrong. It is the catalogue's own word, never one invented here.
 */
function emProducts(p: any, c: EmailRenderContext): string {
  const items: any[] = Array.isArray(p.items) ? p.items : [];
  const shown = c.mode === "edit" ? items : items.filter((x) => String(x?.name ?? "").trim());
  if (!shown.length) return "";
  const sideBySide = !String(p.layout || "").toLowerCase().includes("under") && shown.length > 1;
  const CARD = "padding:14px;border:1px solid #E5E7EB;border-radius:8px;background:" + c.paper + ";";
  const cardBody = (x: any, i: number) => {
    const pic = x?.image
      ? `<img src="${esc(x.image)}" alt="${esc(altTextFor({ alt: x?.alt, caption: x?.name, src: x?.image }))}" width="240" style="display:block;width:100%;max-width:240px;height:auto;border:0;border-radius:6px;margin:0 0 10px 0;" />`
      : "";
    const price = x?.price || c.mode === "edit"
      ? `<div style="font-family:${headStack(c)};font-size:19px;font-weight:700;color:${c.ink};margin:0 0 2px 0;"${edit(`items.${i}.price`, c, "$0.00")}>${t(x?.price, c)}</div>` : "";
    const cad = x?.cadence || c.mode === "edit"
      ? `<div style="font-family:${bodyStack(c)};font-size:12px;color:#6B7280;margin:0 0 8px 0;"${edit(`items.${i}.cadence`, c, "how it is billed")}>${t(x?.cadence, c)}</div>` : "";
    const cta = x?.url
      ? `<a href="${esc(x.url)}" style="display:inline-block;font-family:${bodyStack(c)};font-size:13px;font-weight:600;color:${c.accent};text-decoration:none;">${t(x?.ctaLabel || "See it", c)} &rarr;</a>`
      : "";
    return pic
      + `<div style="font-family:${headStack(c)};font-size:15px;font-weight:700;color:${c.ink};margin:0 0 4px 0;"${edit(`items.${i}.name`, c, "What it is")}>${t(x?.name, c)}</div>`
      + `<div style="font-family:${bodyStack(c)};font-size:13px;line-height:1.55;color:#374151;margin:0 0 8px 0;"${edit(`items.${i}.blurb`, c, "Why it is worth having")}>${t(x?.blurb, c)}</div>`
      + price + cad + cta;
  };
  if (!sideBySide) {
    return shown.map((x, i) =>
      `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 14px 0;"><tr>`
      + `<td valign="top" style="width:100%;${CARD}">${cardBody(x, i)}</td></tr></table>`).join("");
  }
  // Two or three cards beside each other on a screen, one above the other on
  // a phone — three 184px cards of 13px prose is a row nobody reads.
  return fluidRow(
    shown.map((x, i) => ({
      max: Math.floor(CONTENT_WIDTH / shown.length),
      html: cardBody(x, i),
      cellStyle: CARD,
    })),
    { margin: "margin:0 0 16px 0;" },
  );
}

function emSocial(p: any, c: EmailRenderContext, align: string): string {
  const declared: any[] = Array.isArray(p?.links) ? p.links.filter((l: any) => l?.url) : [];
  const links = declared.length ? declared : (c.business.social || []);
  if (!links.length) {
    return c.mode === "edit"
      ? `<div style="text-align:${align};font-family:${bodyStack(c)};font-size:12px;color:#94A3B8;">Add the address of each account you want people to follow, in the panel on the right.</div>`
      : "";
  }
  const cells = links.slice(0, 8).map((l: any) =>
    `<td style="padding:0 8px;"><a href="${esc(l.url)}" style="font-family:${bodyStack(c)};font-size:13px;font-weight:600;color:${c.accent};text-decoration:none;">${esc(l.label || "Follow")}</a></td>`).join("");
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${align}" style="margin:0 auto;"><tr>${cells}</tr></table>`;
}

/**
 * A countdown, told as a DATE.
 *
 * No animation and no third-party image service (there is a standing decision
 * against putting another product's surface in front of a client). The widget's
 * own help line already promised this: "email clients that cannot show a timer
 * see the date instead" — every client is one of those, so every client sees
 * the date, and it is always right.
 */
function emCountdown(p: any, c: EmailRenderContext): string {
  const raw = String(p.ends_at ?? "").trim();
  if (!raw) return c.mode === "edit"
    ? `<div style="text-align:center;font-family:${bodyStack(c)};font-size:12px;color:#94A3B8;">Set the date this counts down to, in the panel on the right.</div>` : "";
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 16px auto;"><tr>`
    + `<td style="padding:10px 18px;border:1px solid ${c.accent};border-radius:8px;font-family:${headStack(c)};font-size:15px;font-weight:700;color:${c.accent};text-align:center;">${esc(raw)}</td>`
    + `</tr></table>`;
}

function emTestimonial(p: any, c: EmailRenderContext): string {
  if (!String(p.quote ?? "").trim() && c.mode !== "edit") return "";
  const stars = Math.max(0, Math.min(5, Number(p.rating) || 0));
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;"><tr>`
    + `<td style="padding:14px 16px;background:#F8FAFC;border-left:3px solid ${c.accent};">`
    + `<div style="font-family:${bodyStack(c)};font-size:15px;line-height:1.6;color:${c.ink};font-style:italic;${c.typeCss ?? ""}"${edit("quote", c, "What they said")}>${t(p.quote, c)}</div>`
    + (stars ? `<div style="font-family:${bodyStack(c)};font-size:13px;letter-spacing:2px;color:${c.accent};margin-top:6px;">${"&#9733;".repeat(stars)}</div>` : "")
    + `<div style="font-family:${bodyStack(c)};font-size:12px;color:#6B7280;margin-top:6px;"${edit("attribution", c, "Who said it")}>${t(p.attribution, c)}</div>`
    + `</td></tr></table>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   D-165 — the standard widget set, in a mailbox (§11.13.3)

   Icon · Icon Box · Image Box · Star Rating · Alert. Testimonial, Icon List
   (`list`) and Social Icons (`social_links`) were already here and keep their
   stored kind ids; the Elementor spellings reach them through ONE alias table
   (`EMAIL_KIND_ALIASES`), the `price_line` / `priced_line` precedent.

   All five are TABLES with inline styles. None of them uses a border radius,
   a shadow, a flex box or a background image, because §"what a mailbox
   allows" is enforced on every one of them by `assertEmailSafe`.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * AN ICON, WHERE THERE IS NO ICON FONT.
 *
 * A mailbox has no Font Awesome and a hosted page should not load one to draw
 * a tick. The website publishes the author's icon NAME as Elementor's own
 * `fas fa-<name>` (arion `elementorWidgets.js`, which already did exactly
 * that for an icon box); here the same name becomes a real Unicode character
 * from a small closed list — the names our own panel offers and nothing else.
 * A value that is already a character (an emoji, which is what the website
 * templates have always put in `icon_name`) is passed straight through, and
 * anything unknown is a filled dot rather than the word "circle".
 *
 * Exported because the landing renderer draws the same widget the same way,
 * and two tables of glyphs is two answers.
 */
export const ICON_GLYPHS: Record<string, string> = {
  check: "✓", star: "★", phone: "☎", envelope: "✉", mail: "✉",
  "map-marker-alt": "⚑", "map-pin": "⚑", clock: "⏱", "shield-alt": "⛨",
  heart: "♥", "arrow-right": "→", bolt: "⚡", leaf: "❦", snowflake: "❄",
  circle: "●", info: "ℹ", "exclamation-triangle": "⚠", times: "✕",
};

export function iconGlyph(name: unknown): string {
  const raw = String(name ?? "").trim();
  if (!raw) return ICON_GLYPHS.circle;
  const key = raw.toLowerCase().replace(/^fa[srbl]?\s+fa-/, "").replace(/^fa-/, "");
  if (ICON_GLYPHS[key]) return ICON_GLYPHS[key];
  // Not one of ours and not an ASCII word: the author typed a character.
  return /^[a-z0-9 _-]+$/i.test(raw) ? ICON_GLYPHS.circle : raw;
}

/** Elementor's four alert types, and the two colours each one draws with. */
export const ALERT_TONES: Record<string, { bg: string; edge: string; ink: string }> = {
  info: { bg: "#EFF6FF", edge: "#3B82F6", ink: "#1E3A8A" },
  success: { bg: "#ECFDF5", edge: "#10B981", ink: "#065F46" },
  warning: { bg: "#FFFBEB", edge: "#F59E0B", ink: "#78350F" },
  danger: { bg: "#FEF2F2", edge: "#EF4444", ink: "#7F1D1D" },
};

export function alertTone(v: unknown): { bg: string; edge: string; ink: string } {
  return ALERT_TONES[String(v ?? "").toLowerCase()] || ALERT_TONES.info;
}

/** One icon, on its own. `view` is Elementor's: default · stacked · framed. */
function emIcon(p: any, c: EmailRenderContext): string {
  const align = ALIGN(p.align, "center");
  const size = Math.max(10, Math.min(96, Number(p.size) || 28));
  const colr = colour(p.colour, c.accent);
  const view = String(p.view || "default").toLowerCase();
  const glyph = esc(iconGlyph(p.icon));
  const pad = view === "default" ? 0 : Math.round(size * 0.45);
  const cell = view === "stacked"
    ? `background:${colr};color:#FFFFFF;`
    : view === "framed" ? `border:2px solid ${colr};color:${colr};` : `color:${colr};`;
  const inner = `<td align="center" valign="middle" style="${cell}padding:${pad}px;font-family:${bodyStack(c)};font-size:${size}px;line-height:1;">${glyph}</td>`;
  const link = p.url
    ? `<a href="${esc(p.url)}" style="text-decoration:none;color:inherit;">${glyph}</a>`
    : null;
  const body = link
    ? inner.replace(`>${glyph}<`, `>${link}<`)
    : inner;
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${align}" style="margin:0 0 12px 0;"><tr>${body}</tr></table>`;
}

/** The words of an icon box or an image box — one shape, two leading parts. */
function emBoxWords(p: any, c: EmailRenderContext, align: string): string {
  const title = p.title || c.mode === "edit"
    ? `<div style="font-family:${headStack(c)};font-size:17px;font-weight:700;line-height:1.3;color:${c.ink};text-align:${align};margin:0 0 6px 0;${c.typeCss ?? ""}"${edit("title", c, "A short heading")}>${t(p.title, c)}</div>`
    : "";
  const desc = p.description || c.mode === "edit"
    ? `<div style="font-family:${bodyStack(c)};font-size:14px;line-height:1.6;color:#374151;text-align:${align};"${edit("description", c, "A line or two about it…")}>${t(p.description, c)}</div>`
    : "";
  const words = `${title}${desc}`;
  return p.url && words ? `<a href="${esc(p.url)}" style="text-decoration:none;color:inherit;">${words}</a>` : words;
}

/**
 * An icon with words. `position` is Elementor's: top · left · right.
 *
 * Top is a two-row table; left and right are a two-cell row with a px width
 * on the icon cell, because a percentage column in Word is a column Word
 * decides the width of.
 */
function emIconBox(p: any, c: EmailRenderContext): string {
  const position = String(p.position || "top").toLowerCase();
  const align = ALIGN(p.align, position === "top" ? "center" : "left");
  const size = Math.max(10, Math.min(96, Number(p.size) || 28));
  const colr = colour(p.colour, c.accent);
  const glyph = `<div style="font-family:${bodyStack(c)};font-size:${size}px;line-height:1;color:${colr};text-align:${position === "top" ? align : "center"};">${esc(iconGlyph(p.icon))}</div>`;
  const words = emBoxWords(p, c, position === "top" ? align : "left");
  const table = (rows: string) =>
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">${rows}</table>`;
  if (position === "top") {
    return table(`<tr><td style="padding:0 0 10px 0;">${glyph}</td></tr><tr><td valign="top">${words}</td></tr>`);
  }
  const iconCell = `<td valign="top" width="${size + 16}" style="width:${size + 16}px;padding:0 12px 0 0;">${glyph}</td>`;
  const wordCell = `<td valign="top">${words}</td>`;
  return table(`<tr>${position === "right" ? `${wordCell}${iconCell}` : `${iconCell}${wordCell}`}</tr>`);
}

/** A picture with words. The same two shapes, with an `<img>` in front. */
function emImageBox(p: any, c: EmailRenderContext): string {
  const position = String(p.position || "top").toLowerCase();
  const align = ALIGN(p.align, position === "top" ? "center" : "left");
  const width = position === "top"
    ? Math.min(emWidth(c), Math.max(40, Number(p.width) || emWidth(c)))
    : Math.max(40, Math.min(240, Number(p.width) || ARTICLE_PIC));
  const pic = p.src
    ? `<img src="${esc(p.src)}" alt="${esc(altTextFor({ alt: p.alt, caption: p.title, src: p.src }))}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;" />`
    : (c.mode === "edit"
      ? `<div style="border:1px dashed #CBD5E1;padding:16px;text-align:center;color:#94A3B8;font-size:12px;font-family:${bodyStack(c)};">Choose a picture in the panel on the right.</div>`
      : "");
  const words = emBoxWords(p, c, position === "top" ? align : "left");
  const table = (rows: string) =>
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">${rows}</table>`;
  if (position === "top") {
    return table(`<tr><td align="${align}" style="padding:0 0 10px 0;">${pic}</td></tr><tr><td valign="top">${words}</td></tr>`);
  }
  const picCell = `<td valign="top" width="${width}" style="width:${width}px;padding:0 12px 0 0;">${pic}</td>`;
  const wordCell = `<td valign="top">${words}</td>`;
  return table(`<tr>${position === "right" ? `${wordCell}${picCell}` : `${picCell}${wordCell}`}</tr>`);
}

/**
 * A star rating.
 *
 * Elementor's control is `rating` out of `rating_scale` (5 or 10), and a half
 * star is a real value there — so a half is drawn as a half, with the same
 * Unicode the canvas uses rather than a picture a blocked-images mailbox
 * would eat.
 */
function emStarRating(p: any, c: EmailRenderContext): string {
  const scale = Number(p.scale) === 10 ? 10 : 5;
  const rating = Math.max(0, Math.min(scale, Number(p.rating ?? scale)));
  const align = ALIGN(p.align, "left");
  const colr = colour(p.colour, c.accent);
  let stars = "";
  for (let i = 1; i <= scale; i += 1) {
    stars += rating >= i ? "&#9733;" : (rating >= i - 0.5 ? "&#11242;" : "&#9734;");
  }
  const title = p.title || c.mode === "edit"
    ? `<span style="font-family:${bodyStack(c)};font-size:14px;color:${c.ink};margin-right:8px;"${edit("title", c, "What this is a rating of")}>${t(p.title, c)}</span>`
    : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px 0;"><tr>`
    + `<td align="${align}" style="font-family:${bodyStack(c)};font-size:18px;line-height:1.2;letter-spacing:2px;color:${colr};">${title}${stars}</td>`
    + `</tr></table>`;
}

/**
 * An alert — what the proposal builder called a call-out (§11.13.3: callout
 * upgrades to it). Elementor's four types, and a dismiss control that a
 * mailbox cannot honour, so it is never drawn here.
 */
function emAlert(p: any, c: EmailRenderContext): string {
  const tone = alertTone(p.type);
  const title = p.title || c.mode === "edit"
    ? `<div style="font-family:${headStack(c)};font-size:15px;font-weight:700;line-height:1.3;color:${tone.ink};margin:0 0 4px 0;${c.typeCss ?? ""}"${edit("title", c, "What this says")}>${t(p.title, c)}</div>`
    : "";
  const body = paras(p.text ?? p.description, c, "text",
    `font-family:${bodyStack(c)};font-size:14px;line-height:1.6;color:${tone.ink};`);
  if (!title && !body) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;"><tr>`
    + `<td style="padding:12px 14px;background:${tone.bg};border-left:4px solid ${tone.edge};">${title}${body}</td>`
    + `</tr></table>`;
}

/**
 * ELEMENTOR'S SPELLING → THE KIND WE STORE (§11.13 shared vocabulary).
 *
 * "Internal kind ids that exist today KEEP their ids … what changes is the
 * LABEL, the GROUP and the icon", and the NEW kinds take Elementor's slug.
 * Three of the standard set already existed under our own name, so the
 * Elementor slug resolves to the stored kind instead of becoming a second
 * widget that draws the same thing.
 */
export const EMAIL_KIND_ALIASES: Record<string, string> = {
  text_editor: "paragraph",
  icon_list: "list",
  social_icons: "social_links",
};

/* ══════════════════════════════════════════════════════════════════════════
   The footer that has to be there
   ══════════════════════════════════════════════════════════════════════════ */

/** The widget the templates place, locked, at the bottom of every email. */
export function makeFooterProps(business: EmailBusiness): Record<string, unknown> {
  return {
    businessName: business.name || "",
    address: business.address || "",
    note: "",
    unsubscribeLabel: "Unsubscribe",
    preferencesLabel: "Update your preferences",
    showSocial: true,
  };
}

/**
 * What a business must say about itself on a marketing email.
 *
 * Shown, not hidden behind a flag: an author who cannot see the address on
 * the page cannot notice that it is last year's.
 */
function emFooter(p: any, c: EmailRenderContext): string {
  const name = String(p.businessName || c.business.name || "").trim();
  const address = String(p.address || c.business.address || "").trim();
  const small = `font-family:${bodyStack(c)};font-size:12px;line-height:1.6;color:#6B7280;text-align:center;`;
  // The footer BORROWS the business's accounts; it has no list of its own and
  // no panel to set one in. So when there are none it says nothing at all —
  // the "add the address of each account" hint belongs on the social widget,
  // where there is actually somewhere to type them.
  const hasSocial = Array.isArray(c.business.social) && c.business.social.length > 0;
  const social = p.showSocial === false || !hasSocial ? "" : emSocial({ links: [] }, c, "center");
  const note = p.note || c.mode === "edit"
    ? `<div style="${small}margin:0 0 6px 0;"${edit("note", c, "Anything else you want to say here")}>${t(p.note, c)}</div>` : "";
  // The address line reads as a gap the author can fill, never as a silent
  // omission: an empty one says so, on the page, in the colour of a warning.
  const addressLine = address
    ? `<div style="${small}margin:0 0 6px 0;"${edit("address", c, "Your postal address")}>${esc(name ? `${name} · ${address}` : address)}</div>`
    : c.mode === "edit"
      ? `<div style="${small}margin:0 0 6px 0;color:#B45309;"${edit("address", c, "Add your postal address — the law asks for it on every marketing email")}></div>`
      : `<div style="${small}margin:0 0 6px 0;">${esc(name)}</div>`;
  const unsub = `<a href="${esc(c.unsubscribeUrl)}" style="color:#6B7280;text-decoration:underline;">${esc(p.unsubscribeLabel || "Unsubscribe")}</a>`;
  const prefs = c.preferencesUrl
    ? ` &nbsp;·&nbsp; <a href="${esc(c.preferencesUrl)}" style="color:#6B7280;text-decoration:underline;">${esc(p.preferencesLabel || "Update your preferences")}</a>` : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" data-email-footer="1" style="margin:8px 0 0 0;border-top:1px solid #E5E7EB;">`
    + `<tr><td style="padding:16px 0 0 0;">`
    + (social ? `<div style="margin:0 0 10px 0;">${social}</div>` : "")
    + note + addressLine
    + `<div style="${small}">${unsub}${prefs}</div>`
    + `</td></tr></table>`;
}

/** Is there a footer widget anywhere in this document? */
export function hasFooter(doc: BuilderDocument): boolean {
  return doc.sections.some((s) => s.columns.some((c) => c.widgets.some((w) => w.kind === "email_footer")));
}

/* ══════════════════════════════════════════════════════════════════════════
   Sections
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * One section, as the row of a table.
 *
 * A section's COLUMNS become <td>s of one <tr>. Under about 480px most clients
 * keep them side by side, which is why two is the practical maximum for real
 * content and three is reserved for short things (a logo, a price, a date) —
 * the templates use it that way and the pane says so.
 */
export function renderEmailSection(s: Section, c: EmailRenderContext): string {
  if (s.visibility !== "customer" && c.mode !== "edit") return "";

  // Per-side padding when the author set one, the single number when they did
  // not — the same rule as the document renderer, so a section does not sit
  // differently in the mailbox than it does on the page.
  const pad = Math.max(0, Number(s.padding) || 0);
  const ownPadding = sidesToCss(resolveStyle(s.style, "desktop").padding);
  const cellPadding = ownPadding || `${pad}px 24px`;
  const bg = s.background ? colour(s.background, "") : "";
  const ink = s.theme === "dark" ? "#FFFFFF" : c.ink;
  const inner: EmailRenderContext = { ...c, ink };

  const contentWidth = s.width === "narrow" ? 420 : s.width === "full" ? EMAIL_WIDTH : CONTENT_WIDTH;
  const cols = s.columns;

  // Editor markers, and only in the editor: a sent email carries no hooks for
  // a canvas that is not there.
  const mark = c.mode === "edit";

  // ONE column is a cell; MORE than one is the fluid-hybrid row, which stacks
  // on a phone by wrapping rather than by any query. A single column is left
  // exactly as it was — most emails are one column and their HTML must not
  // grow a ghost table it has no use for.
  // COLUMN RATIOS become the fluid columns' own max widths (§11.8). Equal by
  // default, so an unstyled section emits exactly the number it always did.
  const each = emailColumnWidths(s.style, cols.length, contentWidth);
  // AND THE WIDTH TRAVELS DOWN (D-156): a box inside a column has to know what
  // is left of the 552 before it can give its own children a max-width in px.
  const drawn = cols.map((col, i) => ({
    i,
    html: col.widgets.map((w) => renderEmailWidget(
      w, { ...inner, width: cols.length > 1 ? each[i] : contentWidth }, 0,
    )).join(""),
  }));
  const body = cols.length > 1
    ? `<tr><td>${fluidRow(drawn.map((d) => ({
        max: each[d.i],
        html: d.html,
        attrs: mark ? ` data-col="${d.i}"` : "",
      })))}</td></tr>`
    : `<tr><td valign="top"${mark ? ` data-col="0"` : ""} style="width:100%;">${drawn[0]?.html ?? ""}</td></tr>`;

  const label = s.numbered && s.label
    ? `<div style="font-family:${bodyStack(c)};font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:${c.accent};margin:0 0 8px 0;">${esc(s.label)}</div>`
    : "";

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"`
    + (mark ? ` data-section="${esc(s.id)}"` : "")
    + ` style="${bg ? `background:${bg};` : ""}"><tr><td align="center" style="padding:${cellPadding};">`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:${contentWidth}px;">`
    + (label ? `<tr><td>${label}</td></tr>` : "")
    + body
    + `</table></td></tr></table>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   The whole email
   ══════════════════════════════════════════════════════════════════════════ */

export interface EmailDocOptions {
  /** The <title>, and the preview line some clients show beside the subject. */
  subject?: string;
  preheader?: string;
}

/**
 * The email, start to finish.
 *
 * THE SECOND GUARD: if the document arrives with no footer widget — a row
 * hand-edited, imported from somewhere, or written before the footer existed —
 * one is appended here. The author cannot delete it (the model refuses) and a
 * document that never had it cannot get past this function without it.
 */
export function renderEmailDocument(
  doc: BuilderDocument,
  c: EmailRenderContext,
  opts: EmailDocOptions = {},
): string {
  const sections = doc.sections.map((s) => renderEmailSection(s, c)).join("");
  const fallbackFooter = hasFooter(doc)
    ? ""
    : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:8px 24px 24px 24px;">`
      + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:${EMAIL_WIDTH - 48}px;">`
      + `<tr><td>${emFooter(makeFooterProps(c.business), { ...c, mode: "view" })}</td></tr></table></td></tr></table>`;

  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${c.page};">${// The preview line follows the body: tokens survive a "send" render and
    // are resolved per recipient, filled in a preview.
    esc(fill(opts.preheader, c.merge, c.mode))}</div>`
    : "";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(opts.subject || "")}</title>
</head>
<body style="margin:0;padding:0;background:${c.page};font-family:${bodyStack(c)};">
${pre}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${c.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="${EMAIL_WIDTH}" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:${EMAIL_WIDTH}px;background:${c.paper};border-radius:8px;">
<tr><td>${sections}${fallbackFooter}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   The plain-text half
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The text/plain part.
 *
 * Not an afterthought: a send with no text part reads as bulk shape to the
 * classifiers, which is the deliverability lesson this platform already paid
 * for once (ACS quota needs under 2% failure; ours was 22.6%).
 */
export function renderEmailText(doc: BuilderDocument, c: EmailRenderContext): string {
  const out: string[] = [];
  const line = (s: unknown) => {
    const v = fill(String(s ?? ""), c.merge, c.mode).trim();
    if (v) out.push(v);
  };
  /**
   * THE WHOLE TREE, not the top of each column (D-156, fixed D-165).
   *
   * The text part walked `section.columns[].widgets[]` only, so an email whose
   * words were inside a box — which is what every D-156 document is — mailed a
   * text/plain part holding the footer and nothing else. An empty text part is
   * exactly the bulk shape `reference_acs_email_reality` says costs us the
   * quota, so this is a send defect, not a tidiness one.
   */
  const eachWidget = (list: Widget[], visit: (w: Widget) => void) => {
    for (const w of list) {
      if (isContainer(w)) { eachWidget(childrenOf(w), visit); continue; }
      visit(w);
    }
  };
  for (const s of doc.sections) {
    if (s.visibility !== "customer") continue;
    for (const col of s.columns) {
      eachWidget(col.widgets, (w) => {
        const p: any = w.props || {};
        switch (EMAIL_KIND_ALIASES[w.kind] || w.kind) {
          case "heading": line(String(p.text ?? "").toUpperCase()); out.push(""); break;
          case "paragraph": line(p.text); out.push(""); break;
          case "personal_note": line(p.greeting); line(p.text); line(p.signoff); out.push(""); break;
          case "list": for (const it of (Array.isArray(p.items) ? p.items : [])) line(`· ${it}`); out.push(""); break;
          case "image": if (altTextFor(p) && p.src) line(`[${altTextFor(p)}]`); break;
          case "button": if (p.label || p.url) line(`${String(p.label || "Open").trim()}: ${p.url || ""}`); out.push(""); break;
          case "divider": out.push("—————————————"); break;
          case "article_card":
            for (const a of (Array.isArray(p.items) ? p.items : [])) {
              line(a?.title); line(a?.excerpt); if (a?.url) line(a.url); out.push("");
            }
            break;
          /* A card's words reach the text part too — it is a box on the page
             and a line of prose in a mailbox that shows no HTML. */
          case "card": case "catalog_card":
            line([p.heading, p.price].filter(Boolean).join(" — "));
            line(p.description); out.push(""); break;
          case "product_card":
            for (const x of (Array.isArray(p.items) ? p.items : [])) {
              line([x?.name, [x?.price, x?.cadence].filter(Boolean).join(" ")].filter(Boolean).join(" — "));
              line(x?.blurb); if (x?.url) line(x.url); out.push("");
            }
            break;
          case "testimonial": line(`"${String(p.quote ?? "")}"`); line(p.attribution); out.push(""); break;
          case "countdown": line(p.ends_at); break;
          case "social_links":
            for (const l of (Array.isArray(p.links) && p.links.length ? p.links : c.business.social || [])) line(`${l.label}: ${l.url}`);
            break;
          case "email_footer": {
            out.push("");
            out.push("—————————————");
            line(p.note);
            line([p.businessName || c.business.name, p.address || c.business.address].filter(Boolean).join(" · "));
            line(`${p.unsubscribeLabel || "Unsubscribe"}: ${c.unsubscribeUrl}`);
            break;
          }
          /* D-165 §11.13.3 — the standard set reads as words too. */
          case "icon": break;
          case "icon_box": case "image_box":
            line(p.title); line(p.description); out.push(""); break;
          case "star_rating":
            line([p.title, `${Number(p.rating ?? 0)} / ${Number(p.scale) === 10 ? 10 : 5}`].filter(Boolean).join(": "));
            break;
          case "alert":
            line(p.title); line(p.text ?? p.description); out.push(""); break;
          default: break;
        }
      });
    }
  }
  if (!hasFooter(doc)) {
    out.push("", "—————————————");
    line([c.business.name, c.business.address].filter(Boolean).join(" · "));
    line(`Unsubscribe: ${c.unsubscribeUrl}`);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ══════════════════════════════════════════════════════════════════════════
   The sanity check a mailbox would apply
   ══════════════════════════════════════════════════════════════════════════ */

export interface EmailSafetyProblem { rule: string; detail: string }

/**
 * Everything a mail client would object to, as a list of sentences.
 *
 * Used by the test suite on every golden fixture AND by the builder before a
 * send, so the author is told the same thing the test would say. A checker
 * only the tests run is a checker that stops being true.
 */
export function checkEmailSafe(html: string): EmailSafetyProblem[] {
  const problems: EmailSafetyProblem[] = [];
  const flat = String(html || "").replace(/\s+/g, "");

  for (const bad of FORBIDDEN_CSS) {
    if (flat.includes(bad.replace(/\s+/g, ""))) {
      problems.push({ rule: "tables only", detail: `the page uses ${bad}, which Outlook renders through Word and cannot lay out` });
    }
  }
  if (/<style[\s>]/i.test(html)) {
    problems.push({ rule: "styles inline", detail: "there is a stylesheet in the page; Gmail strips it and leaves the email unstyled" });
  }
  if (/\sclass=/.test(html)) {
    problems.push({ rule: "styles inline", detail: "there is a class attribute with no stylesheet behind it" });
  }
  for (const m of String(html).matchAll(/max-width:\s*(\d+)px/g)) {
    if (Number(m[1]) > EMAIL_WIDTH) {
      problems.push({ rule: "600px", detail: `something is ${m[1]}px wide; ${EMAIL_WIDTH}px is the widest an email may be` });
    }
  }
  for (const m of String(html).matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt="[^"]+"/i.test(m[0])) {
      problems.push({ rule: "alt text", detail: "a picture has no description, so a reader with images off sees nothing" });
    }
  }
  // RULE 5, added 2026-09-16: COLUMNS STACK.
  //
  // A column pinned to a fraction of the width is a column at every width: 48%
  // of a 390px phone is 187px, and two of those beside each other is the email
  // a customer deletes. `fluidRow` is the one way this renderer puts two
  // things side by side and it never emits a fractional width, so any
  // percentage that is not 100% is something that has gone round it.
  for (const m of String(html).matchAll(/style="[^"]*?width:\s*(\d+)%/g)) {
    if (m[1] !== "100") {
      problems.push({ rule: "columns stack", detail: `a column is pinned at ${m[1]}% of the width, so it stays a column on a phone; use fluidRow` });
    }
  }
  return problems;
}

/** Throw on anything a mailbox would object to. Used by the tests. */
export function assertEmailSafe(html: string): void {
  const problems = checkEmailSafe(html);
  if (problems.length) {
    throw new Error(`email is not safe to send:\n  ${problems.map((p) => `${p.rule}: ${p.detail}`).join("\n  ")}`);
  }
}

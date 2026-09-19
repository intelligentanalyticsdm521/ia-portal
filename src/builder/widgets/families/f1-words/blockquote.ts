/**
 * f1-words/blockquote.ts — Elementor Pro's **Blockquote**.
 *
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json` → `blockquote`: title
 * "Blockquote", group `pro-elements`, icon `eicon-blockquote`. Content tab, ONE
 * section called "Blockquote":
 *
 *   blockquote_skin      select    "Skin"     `border` | quotation | boxed | clean
 *   blockquote_content   textarea  "Content"
 *   author_name          text      "Author"   `John Doe`
 *
 * Style tab, Elementor's own five sections: Content · Button · Border · Box ·
 * Quote.
 *
 * ── THE TWEET BUTTON IS NOT BUILT, AND THAT IS A DECISION ─────────────────
 * Elementor's remaining seven Content controls are all the Tweet button
 * (`tweet_button`, `_view`, `_skin`, `_label`, `user_name`, `url_type`, `url`)
 * and the whole "Button" style section serves it. `feedback_no_third_party_
 * product_surface` forbids putting another company's product on our clients'
 * pages, and `BUILDER_FULL_WIDGET_PLAN_2026-09-19` §A row 5 says the same in
 * one line: *"tweet button dropped — no third-party product surface"*. So the
 * seven controls and the Button section are absent, deliberately, and the
 * handoff says so. A stored document that carries `tweet_button` keeps it; this
 * widget simply never draws one.
 *
 * ── WHERE IT IS OFFERED ───────────────────────────────────────────────────
 * All five. `BUILDER_OFFERS_2026-09-19.json` lists `blockquote` under
 * `website.elementor_pro`, `landing.elementor_pro`, `newsletter.elementor`,
 * `proposal.elementor` and `mybrand.elementor` — so it also has an email half
 * (`LUMEN-API/src/lib/emailFamilies/f1-words.js`) and a printed half
 * (`oliver-api/lib/pdfFamilies/f1-words.js`).
 *
 * No JavaScript, anywhere.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { bar, pictureFrom } from "../../../pictures";
import type { WidgetOption } from "../../../registry";
import { editRun } from "../../text";
import type {
  EmailRenderContext, FamilyWidgetDef, StudioBrandLite, StudioCanvasDoc,
  StudioInsertOptions, StudioInsertResult,
} from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));

export const BLOCKQUOTE_SKINS: WidgetOption[] = [
  { value: "border", label: "Border" },
  { value: "quotation", label: "Quotation" },
  { value: "boxed", label: "Boxed" },
  { value: "clean", label: "Clean" },
];

export const BLOCKQUOTE_ALIGNMENTS: WidgetOption[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

/** Elementor's four skins, and the one this widget draws when asked for a fifth. */
export function blockquoteSkin(v: unknown): string {
  const s = str(v);
  return BLOCKQUOTE_SKINS.some((o) => o.value === s) ? s : "border";
}

/**
 * The three words the widget shows, whatever spelling they were stored under.
 *
 * `blockquote_content` / `author_name` are Elementor's own keys and what this
 * widget writes. `quote` / `attribution` are what the platform's testimonial
 * has always used, and a person who converts one into the other must not watch
 * their words disappear — the same rule `price_line` / `priced_line` follows.
 */
export function blockquoteFields(props: Record<string, unknown> | undefined | null) {
  const p: any = props || {};
  return {
    content: str(p.blockquote_content != null ? p.blockquote_content : p.quote),
    author: str(p.author_name != null ? p.author_name : p.attribution),
  };
}

export function renderBlockquote(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const f = blockquoteFields(p);
  if (!f.content.trim() && !f.author.trim() && ctx.mode !== "edit") return "";
  const skin = blockquoteSkin(p.blockquote_skin);
  const align = str(p.alignment) || "left";
  const ink = str(p.content_text_color) || ctx.ink;
  const authorInk = str(p.author_text_color) || "#64748B";
  const rule = str(p.border_color) || ctx.accent;
  const ruleWidth = Number(p.border_width) > 0 ? Number(p.border_width) : 3;
  const panel = str(p.box_background_color) || "#F8FAFC";
  const pad = Number(p.box_padding) >= 0 && p.box_padding !== "" && p.box_padding != null
    ? Number(p.box_padding) : 16;
  const markInk = str(p.quote_text_color) || rule;
  const markSize = Number(p.quote_size) > 0 ? Number(p.quote_size) : 36;

  const frame =
    skin === "border" ? `border-left:${ruleWidth}px solid ${esc(rule)};padding:2px 0 2px ${pad}px;`
    : skin === "boxed" ? `background:${esc(panel)};border-radius:8px;padding:${pad}px;`
    : skin === "quotation" ? `padding:0;`
    : /* clean */ `padding:0;`;

  const mark = skin === "quotation"
    ? `<div aria-hidden="true" style="font-family:Georgia,serif;font-size:${markSize}px;line-height:1;color:${esc(markInk)}">&ldquo;</div>`
    : "";

  const quote = editRun("blockquote_content", f.content, "bx-bq-content",
    "What they said", ctx, "div");
  const author = editRun("author_name", f.author, "bx-bq-author",
    "Who said it", ctx, "div");

  return `<figure class="bx-blockquote bx-bq-${esc(skin)}" style="margin:0;text-align:${esc(align)};${frame}">`
    + mark
    + `<blockquote style="margin:0;font-size:16px;line-height:1.6;font-style:italic;color:${esc(ink)}">${quote}</blockquote>`
    + (author
      ? `<figcaption style="margin-top:8px;font-size:13px;font-style:normal;color:${esc(authorInk)}">${author}</figcaption>`
      : "")
    + `</figure>`;
}

/** The plain sentence a printed or mailed copy uses. Shared, so it says one thing. */
export function blockquotePlain(props: Record<string, unknown> | undefined | null): string {
  const f = blockquoteFields(props);
  if (!f.content.trim() && !f.author.trim()) return "";
  return f.author.trim() ? `“${f.content.trim()}” — ${f.author.trim()}` : `“${f.content.trim()}”`;
}

export const BLOCKQUOTE_DEF: FamilyWidgetDef = {
  kind: "blockquote",
  label: "Blockquote",
  description: {
    website: "Somebody's words, set apart from the rest of the page, with their name under them.",
    landing: "Somebody's words, set apart from the rest of the page, with their name under them.",
    email: "Somebody's words, set apart from the rest of the email, with their name under them.",
    proposal: "Somebody's words, set apart from the rest of the document, with their name under them.",
    brand: "A short quote on the design, with the name of whoever said it.",
  },
  icon: "Quote",
  picture: pictureFrom(
    `<path d="M10 12v16" stroke="#94A3B8" stroke-width="3"/>`
    + bar(18, 12, 38) + bar(18, 20, 32) + bar(18, 28, 18)),
  /* Elementor's OWN group. `b168/override` item 6 gave the panel Elementor
     Pro's `Pro` group, so this widget stops sitting in General behind a padlock
     — the one difference F1's first wave wrote up under "What I could NOT
     verify" (§12.2) and could not fix, because the group did not exist yet. */
  category: "Pro",
  builders: ["website", "landing", "newsletter", "proposal", "mybrand"],
  tier: "pro",
  defaults: { blockquote_skin: "border", blockquote_content: "", author_name: "" },
  controls: [
    { key: "blockquote_skin", label: "Skin", type: "select", tab: "content", section: "Blockquote", options: BLOCKQUOTE_SKINS },
    { key: "blockquote_content", label: "Content", type: "textarea", tab: "content", section: "Blockquote" },
    { key: "author_name", label: "Author", type: "text", tab: "content", section: "Blockquote" },

    /* Style — Elementor's own sections, minus Button (see the header). */
    { key: "alignment", label: "Alignment", type: "select", tab: "style", section: "Content", options: BLOCKQUOTE_ALIGNMENTS, responsive: true },
    { key: "content_text_color", label: "Text Color", type: "colour", tab: "style", section: "Content" },
    { key: "author_text_color", label: "Text Color", type: "colour", tab: "style", section: "Content" },
    { key: "border_color", label: "Color", type: "colour", tab: "style", section: "Border" },
    { key: "border_width", label: "Width", type: "number", tab: "style", section: "Border" },
    { key: "box_background_color", label: "Background Color", type: "colour", tab: "style", section: "Box" },
    { key: "box_padding", label: "Padding", type: "number", tab: "style", section: "Box", responsive: true },
    { key: "quote_text_color", label: "Color", type: "colour", tab: "style", section: "Quote" },
    { key: "quote_size", label: "Size", type: "number", tab: "style", section: "Quote" },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   THE OTHER TWO SURFACES — wave 2
   ══════════════════════════════════════════════════════════════════════════

   The offer file gives Blockquote to all five builders, and the first wave
   wrote only the page renderer, so the tile sat on the NEWSLETTER panel and
   drew *"this part needs a newer version of the builder"* on the canvas, and
   sat on the MY BRAND panel and put nothing at all on the canvas when pressed.
   `familySurfaceGaps()` (b168/override) names exactly those two, and
   `test/mybrand-studio.test.mjs` "every tool the pane offers actually places
   something" goes red on the second one by EXECUTING the insert.

   LUMEN already SENDS this widget correctly — `emailFamilies/f1-words.js`, both
   halves — so only the Portal's own preview was blank. These two close it. */

/** A mailbox cannot do flex, grid, absolute or a class. A table and a cell can. */
export function emailBlockquote(w: Widget, ctx: EmailRenderContext): string {
  const p: any = w.props || {};
  const f = blockquoteFields(p);
  if (!f.content.trim() && !f.author.trim() && ctx.mode !== "edit") return "";
  const skin = blockquoteSkin(p.blockquote_skin);
  const ink = str(p.content_text_color) || str(ctx.ink) || "#0B1C24";
  const authorInk = str(p.author_text_color) || "#64748B";
  const rule = str(p.border_color) || str(ctx.accent) || "#0C4A60";
  const ruleWidth = Number(p.border_width) > 0 ? Number(p.border_width) : 3;
  const panel = str(p.box_background_color) || "#F8FAFC";
  const pad = Number(p.box_padding) >= 0 && p.box_padding !== "" && p.box_padding != null
    ? Number(p.box_padding) : 16;
  const align = str(p.alignment) || "left";

  const cell = skin === "border"
    ? `border-left:${ruleWidth}px solid ${esc(rule)};padding:2px 0 2px ${pad}px;`
    : skin === "boxed" ? `background:${esc(panel)};padding:${pad}px;` : `padding:0;`;
  const mark = skin === "quotation"
    ? `<div style="font-family:Georgia,serif;font-size:${
      Number(p.quote_size) > 0 ? Number(p.quote_size) : 36}px;line-height:1;color:${
      esc(str(p.quote_text_color) || rule)}">&ldquo;</div>` : "";
  const author = f.author.trim()
    ? `<div style="margin-top:8px;font-size:13px;color:${esc(authorInk)}">${esc(f.author)}</div>` : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
    + `<td style="${cell}text-align:${esc(align)}">${mark}`
    + `<div style="font-size:16px;line-height:1.6;font-style:italic;color:${esc(ink)}">${esc(f.content)}</div>`
    + `${author}</td></tr></table>`;
}

/**
 * MY BRAND places LAYERS, not markup — the canvas is absolute pixels.
 *
 * Two text layers, the quote and the name under it, sized off the canvas the
 * way the studio's own text presets are, so a blockquote dropped on a 1080
 * square and on a 1080×1350 portrait both land in the middle and read.
 * `adapters/mybrand/insert.ts` is not imported: a family folder never reaches
 * into an adapter, so the layers are written as the plain data they are.
 */
export function studioBlockquote(
  doc: StudioCanvasDoc,
  brand: StudioBrandLite,
  _opts: StudioInsertOptions,
): StudioInsertResult {
  const b: any = brand || {};
  const W = Math.max(1, Number(doc?.width) || 1080);
  const H = Math.max(1, Number(doc?.height) || 1080);
  const s = Math.max(0.3, W / 1080);
  const quoteSize = Math.round(46 * s);
  const nameSize = Math.round(24 * s);
  const w = Math.round(W * 0.76);
  const x = Math.round(W / 2 - w / 2);
  const top = Math.round(H / 2 - quoteSize * 1.6);
  const ink = str(b?.colours?.text) || "#0B1C24";
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const quote = {
    id: `bqq-${stamp}`, kind: "text",
    x, y: top, w, h: Math.round(quoteSize * 2.8),
    content: "“What they said”",
    font: str(b?.fonts?.heading) || str(b?.fonts?.body) || undefined,
    size: quoteSize, color: ink, weight: "400", align: "center",
    lineHeight: 1.25, rotation: 0, visible: true,
  };
  const author = {
    id: `bqa-${stamp}`, kind: "text",
    x, y: top + Math.round(quoteSize * 3.1), w, h: Math.round(nameSize * 1.4),
    content: "Who said it",
    font: str(b?.fonts?.body) || undefined,
    size: nameSize, color: ink, weight: "600", align: "center",
    lineHeight: 1.2, rotation: 0, visible: true,
  };
  return { layers: [quote, author], behind: false, selectId: quote.id };
}

/**
 * f1-words/tableOfContents.ts — Elementor Pro's **Table of Contents**.
 *
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json` → `table-of-contents`: title
 * "Table of Contents", group `pro-elements`, icon `eicon-table-of-contents`.
 * Two Content sections, both by Elementor's own names:
 *
 *   [Table of Contents]  title `Table of Contents` · html_tag `h4` ·
 *                        headings_by_tags `["h2","h3","h4","h5","h6"]` ·
 *                        marker_view `numbers` ·
 *                        no_headings_message `No headings were found on this page.`
 *   [Additional Options] word_wrap · minimize_box (on) · minimized_on `tablet` ·
 *                        hierarchical_view (on) · collapse_subitems
 *
 * Style tab: Box · Header · List.
 *
 * ── IT READS THE DOCUMENT, NOT A LIST THE AUTHOR RETYPES ──────────────────
 * That is the whole point of the widget, and it is why the renderer takes the
 * document off the render context (`ctx.doc`, handed in by `makeContext` for
 * exactly this class of widget — the `totals` widget reads the same way). An
 * author who renames a heading sees this list change without touching it. A
 * page with no headings yet shows Elementor's own sentence rather than an empty
 * box, so nobody wonders whether the widget is broken.
 *
 * ── THE JAVASCRIPT, AND THE FALLBACK ──────────────────────────────────────
 * Minimize Box and Collapse Subitems are browser behaviour. With no script the
 * box is simply OPEN and every entry is listed — which is the state a printed
 * copy needs anyway. Nothing here draws a collapse control that would not work.
 *
 * ── WHERE IT IS OFFERED ───────────────────────────────────────────────────
 * `BUILDER_OFFERS_2026-09-19.json`: `website.elementor_pro`,
 * `landing.elementor_pro` and `proposal.elementor`. The printed half is
 * `oliver-api/lib/pdfFamilies/f1-words.js`.
 */
import type { BuilderDocument, Widget } from "../../../model";
import { esc } from "../../../esc";
import { walkDocumentTree } from "../../../walk";
import type { RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import type { WidgetOption } from "../../../registry";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));
const on = (v: unknown): boolean => v === true || v === "yes";

export const TOC_HEADING_TAGS: WidgetOption[] = [
  { value: "h2", label: "H2" }, { value: "h3", label: "H3" }, { value: "h4", label: "H4" },
  { value: "h5", label: "H5" }, { value: "h6", label: "H6" }, { value: "div", label: "div" },
];

export const TOC_MARKER_VIEWS: WidgetOption[] = [
  { value: "numbers", label: "Numbers" },
  { value: "bullets", label: "Bullets" },
];

export const TOC_MINIMIZED_ON: WidgetOption[] = [
  { value: "mobile", label: "Mobile" },
  { value: "tablet", label: "Tablet" },
  { value: "desktop", label: "Desktop" },
];

export const TOC_DEFAULT_TITLE = "Table of Contents";
export const TOC_NO_HEADINGS = "No headings were found on this page.";
export const TOC_DEFAULT_TAGS = ["h2", "h3", "h4", "h5", "h6"];

/**
 * A HEADING WIDGET'S LEVEL, AS AN `h*` TAG.
 *
 * The platform's heading widget has stored three different spellings over its
 * life — the number `2`, Elementor's `h2`, and the plain words "Page title" /
 * "Section" / "Sub-section" that the panel shows. One reader, because a table
 * of contents that understood only one of the three would quietly skip half a
 * document's headings and nothing on screen would say why.
 */
export function headingTagOf(props: Record<string, unknown> | undefined | null): string {
  const p: any = props || {};
  const raw = p.header_size != null ? p.header_size : p.level;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 6) return `h${n}`;
  const s = str(raw).trim().toLowerCase();
  if (/^h[1-6]$/.test(s)) return s;
  if (s === "page title") return "h1";
  if (s === "sub-section" || s === "sub section") return "h3";
  return "h2";
}

/** The words on a heading widget, whichever key they were stored under. */
export function headingTextOf(props: Record<string, unknown> | undefined | null): string {
  const p: any = props || {};
  return str(p.text != null ? p.text : p.title).trim();
}

/** `Scope of work` → `scope-of-work`. The anchor a menu link can jump to. */
export function headingAnchor(text: string, index: number): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || `heading-${index + 1}`;
}

export interface TocEntry { text: string; tag: string; anchor: string; depth: number }

/**
 * Every heading in the document this widget sits in, in document order.
 *
 * `tags` is Elementor's `headings_by_tags`. Depth is the position of a
 * heading's tag within the CHOSEN tags, not within h1–h6, so a document that
 * only uses h2 and h4 nests once rather than three times.
 */
export function tocEntries(doc: BuilderDocument | undefined | null, tags: string[]): TocEntry[] {
  if (!doc) return [];
  const wanted = tags.length ? tags : TOC_DEFAULT_TAGS;
  const order = new Map(wanted.map((t, i) => [t, i]));
  const out: TocEntry[] = [];
  for (const w of walkDocumentTree(doc)) {
    if (w.kind !== "heading") continue;
    const tag = headingTagOf(w.props);
    if (!order.has(tag)) continue;
    const text = headingTextOf(w.props);
    if (!text) continue;
    out.push({ text, tag, anchor: headingAnchor(text, out.length), depth: order.get(tag) || 0 });
  }
  return out;
}

export function renderTableOfContents(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const tags = Array.isArray(p.headings_by_tags)
    ? p.headings_by_tags.map((t: unknown) => str(t).toLowerCase()).filter(Boolean)
    : TOC_DEFAULT_TAGS;
  const entries = tocEntries(ctx.doc, tags);
  const title = str(p.title) || TOC_DEFAULT_TITLE;
  const tag = TOC_HEADING_TAGS.some((o) => o.value === str(p.html_tag)) ? str(p.html_tag) : "h4";
  const numbered = str(p.marker_view) !== "bullets";
  const nested = on(p.hierarchical_view);
  const bg = str(p.background_color) || "#FFFFFF";
  const edge = str(p.border_color) || "#E2E8F0";
  const edgeWidth = Number(p.border_width) > 0 ? Number(p.border_width) : 1;
  const wrap = on(p.word_wrap);

  if (!entries.length) {
    const message = str(p.no_headings_message) || TOC_NO_HEADINGS;
    if (ctx.mode !== "edit") return "";
    return `<div class="bx-toc bx-toc-empty" style="border:${edgeWidth}px solid ${esc(edge)};border-radius:8px;`
      + `background:${esc(bg)};padding:12px 14px;color:#64748B;font-size:12px">`
      + `<${tag} style="margin:0 0 6px 0;font-size:14px" data-edit="title">${esc(title)}</${tag}>`
      + `${esc(message)}</div>`;
  }

  const base = entries.length ? Math.min(...entries.map((e) => e.depth)) : 0;
  const rows = entries.map((e, i) => {
    const indent = nested ? Math.max(0, e.depth - base) * 14 : 0;
    const mark = numbered ? `${i + 1}.` : "&bull;";
    return `<li style="display:flex;gap:8px;padding:3px 0;margin-left:${indent}px">`
      + `<span aria-hidden="true" style="color:#94A3B8;min-width:1.2em">${mark}</span>`
      + `<a href="#${esc(e.anchor)}" style="color:${esc(ctx.accent)};text-decoration:none;`
      + `${wrap ? "overflow-wrap:anywhere" : "white-space:nowrap;overflow:hidden;text-overflow:ellipsis"}">`
      + `${esc(e.text)}</a></li>`;
  }).join("");

  return `<nav class="bx-toc" aria-label="${esc(title)}" style="border:${edgeWidth}px solid ${esc(edge)};`
    + `border-radius:8px;background:${esc(bg)};padding:12px 14px">`
    + `<${tag} style="margin:0 0 8px 0;font-size:14px"${ctx.mode === "edit" ? ` data-edit="title"` : ""}>${esc(title)}</${tag}>`
    + `<ol style="list-style:none;margin:0;padding:0;font-size:13px">${rows}</ol></nav>`;
}

export const TABLE_OF_CONTENTS_DEF: FamilyWidgetDef = {
  kind: "table_of_contents",
  label: "Table of Contents",
  description: {
    website: "A list of this page's own headings, each one a link that jumps to it.",
    landing: "A list of this page's own headings, each one a link that jumps to it.",
    proposal: "A contents list built from the headings in this document, so a long one is easy to skim.",
  },
  icon: "ListTree",
  picture: pictureFrom(box(5, 6, 54, 30) + bar(11, 12, 28) + bar(15, 20, 24) + bar(15, 27, 18)),
  /* Elementor's OWN group. `b168/override` item 6 gave the panel Elementor
     Pro's `Pro` group, so this widget stops sitting in General behind a padlock
     — the one difference F1's first wave wrote up under "What I could NOT
     verify" (§12.2) and could not fix, because the group did not exist yet. */
  category: "Pro",
  builders: ["website", "landing", "proposal"],
  tier: "pro",
  defaults: {
    title: TOC_DEFAULT_TITLE,
    html_tag: "h4",
    headings_by_tags: TOC_DEFAULT_TAGS,
    marker_view: "numbers",
    no_headings_message: TOC_NO_HEADINGS,
    word_wrap: false,
    minimize_box: true,
    minimized_on: "tablet",
    hierarchical_view: true,
    collapse_subitems: false,
  },
  controls: [
    { key: "title", label: "Title", type: "text", tab: "content", section: "Table of Contents" },
    { key: "html_tag", label: "HTML Tag", type: "select", tab: "content", section: "Table of Contents", options: TOC_HEADING_TAGS },
    {
      key: "headings_by_tags", label: "Anchors By Tags", type: "list", tab: "content", section: "Table of Contents",
      help: "Which heading sizes to list, one per line — h2, h3, and so on.",
    },
    { key: "marker_view", label: "Marker View", type: "select", tab: "content", section: "Table of Contents", options: TOC_MARKER_VIEWS },
    { key: "no_headings_message", label: "No Headings Found Message", type: "text", tab: "content", section: "Table of Contents" },

    { key: "word_wrap", label: "Word Wrap", type: "toggle", tab: "content", section: "Additional Options" },
    {
      key: "minimize_box", label: "Minimize Box", type: "toggle", tab: "content", section: "Additional Options",
      help: "Lets a visitor fold the list away on your published page.",
    },
    { key: "minimized_on", label: "Minimized On", type: "select", tab: "content", section: "Additional Options", options: TOC_MINIMIZED_ON },
    { key: "hierarchical_view", label: "Hierarchical View", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "collapse_subitems", label: "Collapse Subitems", type: "toggle", tab: "content", section: "Additional Options" },

    /* Style — Elementor's Box section. */
    { key: "background_color", label: "Background Color", type: "colour", tab: "style", section: "Box" },
    { key: "border_color", label: "Border Color", type: "colour", tab: "style", section: "Box" },
    { key: "border_width", label: "Border Width", type: "number", tab: "style", section: "Box" },
  ],
};

/**
 * f1-words/textEditor.ts — Elementor's **Text Editor**, deepened.
 *
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json` → `text-editor`: title
 * "Text Editor", group `basic`. THREE panel sections:
 *
 *   content  "Text Editor"  editor · drop_cap · text_columns · column_gap
 *   style    "Text Editor"  align · Typography · Text Shadow · paragraph_spacing
 *                           · text_color · link_color · link_hover_color
 *   style    "Drop Cap"     view · primary/secondary colour · size · space ·
 *                           border radius · border width · its own typography
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────
 * The `paragraph` definition in `registry.ts` had ONE control, `text`, and no
 * Style tab. Same kind, so `mergeWidgetDefs` drops the old one; same stored
 * key, so nothing already written moves.
 *
 * ── THE STORED KEY IS `text`, AND ELEMENTOR'S IS `editor` ─────────────────
 * Every proposal, newsletter and page on the estate stores the words under
 * `text`, and `data-edit="text"` is what the canvas writes back. `editor` is
 * READ beside it and is what the arion emitter PUBLISHES, because that is the
 * key Elementor's widget has. Renaming the stored key would have been a
 * migration of every document for nothing a client can see.
 *
 * ── DROP CAP IS `::first-letter`, NOT SURGERY ON THE WORDS ────────────────
 * The obvious implementation — pull the first character out of the text and
 * wrap it — has to guess where the words start inside markup the author may
 * have pasted, and gets it wrong on a quotation mark, an emoji or a merge tag.
 * `::first-letter` is a CSS selector the browser applies to whatever the first
 * letter turns out to be, so the words are never touched, the plain-text twin
 * of an email is unaffected, and a document read back is byte-for-byte the one
 * that was written. It carries Elementor's three views: `default` is a big
 * letter, `stacked` puts it on a block of colour, `framed` outlines it.
 *
 * Font, size, weight, line height, letter spacing and colour of the BODY text
 * belong to the platform's Typography group (see `words.ts`). This widget adds
 * what that group does not have, and the whole Drop Cap section, which has a
 * typography of its own that nothing else offers.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import { fill } from "../../../merge";
import { inlineSafe } from "../../../emailBox";
import { boldRuns, paras } from "../../../runs";
import type { RenderContext } from "../../../render";
import { bar, pictureFrom } from "../../../pictures";
import type { EmailRenderContext, FamilyWidgetDef } from "../types";
import {
  ALIGNMENTS, DECORATIONS, DROP_CAP_VIEWS, FONT_STYLES, TEXT_COLUMNS, TRANSFORMS,
  alignCss, deviceCss, effectsCss, mailboxFontStack, num, ownClass, perDevice, shadowCss, str,
} from "./words";

/** The words, whichever key they were stored under. */
export function editorText(p: Record<string, unknown> | undefined | null): string {
  const props: any = p || {};
  return str(props.text != null && props.text !== "" ? props.text : props.editor);
}

/** Elementor's switcher: `yes`, or anything an older checkbox wrote. */
export function isOn(v: unknown): boolean {
  return v === true || (typeof v === "string" && v !== "" && v !== "no" && v !== "false");
}

/** The wrapper's own declarations for one device. */
function wrapperCss(p: Record<string, unknown>, device: "desktop" | "tablet" | "phone"): string[] {
  const at = (key: string) => (device === "desktop" ? (p as any)[key]
    : device === "tablet" ? (p as any)[`${key}_tablet`] : (p as any)[`${key}_mobile`]);
  const out: string[] = [];
  const align = alignCss(at("align"));
  if (align) out.push(`text-align:${align}`);
  const cols = Number(at("text_columns"));
  if (Number.isFinite(cols) && cols > 1) out.push(`column-count:${Math.min(10, Math.round(cols))}`);
  const gap = num(at("column_gap"));
  if (gap != null) out.push(`column-gap:${gap}px`);
  if (device === "desktop") {
    const colour = str((p as any).text_color);
    if (colour) out.push(`color:${colour}`);
    out.push(...effectsCss(p), ...shadowCss(p));
  }
  return out;
}

/** Elementor's Drop Cap section, as one `::first-letter` rule. */
export function dropCapCss(p: Record<string, unknown>): string[] {
  if (!isOn((p as any).drop_cap)) return [];
  const view = str((p as any).drop_cap_view) || "default";
  const primary = str((p as any).drop_cap_primary_color);
  const secondary = str((p as any).drop_cap_secondary_color);
  const size = num((p as any).drop_cap_size);
  const space = num((p as any).drop_cap_space);
  const radius = num((p as any).drop_cap_border_radius);
  const borderWidth = num((p as any).drop_cap_border_width);
  const out: string[] = ["float:left", "line-height:1"];
  out.push(`font-size:${(size ?? 5) * 1.0}em`);
  out.push(`margin-right:${space ?? 10}px`);
  const transform = str((p as any).drop_cap_typography_text_transform);
  if (transform) out.push(`text-transform:${transform}`);
  const fontStyle = str((p as any).drop_cap_typography_font_style);
  if (fontStyle) out.push(`font-style:${fontStyle}`);
  if (view === "stacked") {
    out.push(`background:${secondary || "#0C4A60"}`);
    out.push(`color:${primary || "#FFFFFF"}`);
    out.push("padding:0.1em 0.2em");
  } else if (view === "framed") {
    out.push(`border:${borderWidth ?? 2}px solid ${secondary || primary || "#0C4A60"}`);
    if (primary) out.push(`color:${primary}`);
    out.push("padding:0.1em 0.2em");
  } else if (primary) {
    out.push(`color:${primary}`);
  }
  if (radius != null) out.push(`border-radius:${radius}%`);
  return out;
}

export function renderTextEditor(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  /* `paras` is the ENGINE's — merge tags filled, escaped, bold runs, the token
     chips an author can see. A second paragraph pipeline in a family folder is
     the one that forgets the chips. */
  const body = paras(editorText(p), ctx, "text");

  const desktop = wrapperCss(p, "desktop");
  const tablet = wrapperCss(p, "tablet");
  const phone = wrapperCss(p, "phone");
  const cap = dropCapCss(p);
  const spacing = num(p.paragraph_spacing);
  const linkColour = str(p.link_color);
  const linkHover = str(p.link_hover_color);
  const linkTransition = num(p.link_hover_color_transition_duration);

  /* NOTHING SET → THE ENGINE'S OWN OUTPUT, UNCHANGED. That is what keeps every
     stored document, every golden fixture and every printed PDF byte-identical
     to the day before this widget grew a Style tab. */
  if (!desktop.length && !tablet.length && !phone.length && !cap.length
    && spacing == null && !linkColour && !linkHover) return body;

  const cls = ownClass("bx-te", w.id);
  const extra: string[] = [];
  if (cap.length) extra.push(`.${cls} p:first-of-type::first-letter{${cap.join(";")}}`);
  if (spacing != null) extra.push(`.${cls} p{margin-bottom:${spacing}px}`);
  if (linkColour) extra.push(`.${cls} a{color:${esc(linkColour)}${linkTransition != null ? `;transition:color ${linkTransition}s` : ""}}`);
  if (linkHover) extra.push(`.${cls} a:hover{color:${esc(linkHover)}}`);

  const block = deviceCss(`.${cls}`, { desktop, tablet, phone });
  const extras = extra.length ? `<style>${extra.join("")}</style>` : "";
  return `${block}${extras}<div class="bx-te ${cls}">${body}</div>`;
}

export const TEXT_EDITOR_DEF: FamilyWidgetDef = {
  kind: "paragraph",
  label: "Text Editor",
  description: {
    proposal: "Ordinary writing — a sentence or a few, with bold and links.",
    website: "Ordinary writing on the page — a sentence or a few, with bold and links.",
    email: "Ordinary writing in the email — a sentence or a few, with bold and links.",
    landing: "Ordinary writing on the page — a sentence or a few, with bold and links.",
    brand: "A block of smaller type under the headline.",
  },
  icon: "AlignLeft",
  picture: pictureFrom(bar(8, 10, 48) + bar(8, 18, 48) + bar(8, 26, 30)),
  category: "Basic",
  builders: ["website", "landing", "newsletter", "proposal", "mybrand"],
  tier: "free",
  defaults: { text: "", drop_cap: "", text_columns: "", column_gap: "" },
  controls: [
    /* Content — Elementor's section is "Text Editor". The words themselves are
       typed on the page (the platform's one editing mechanism); the control is
       declared so the section reads whole and the emitter can see it. */
    /* THE EDITOR BOX, IN THE PANEL (2026-09-20, audit round 4 row 111). The
       reference's Text Editor opens on a WYSIWYG box — the only UNLABELLED
       control on any of its panels — and ours opened on Drop Cap, so the panel
       of a widget whose whole job is words said nothing about the words.
       `panel: true` draws it, unlabelled, as a block (`PanelEditor`), writing
       the SAME stored key `data-edit="text"` writes from the page.

       ITS TOOLBAR IS BOLD AND A PARAGRAPH BREAK, and that is the whole of it.
       What is stored here is PLAIN TEXT, not HTML — `Canvas.commit` writes
       `readEditedText`, which is `innerText` — and the one mark the text
       language has is `**bold**` (`runs.ts boldRuns`, read by the page, the
       PDF, the mailbox and arion alike). An Italic button would write
       asterisks onto a signed proposal. Underline, link and the two list
       kinds are the same story, and giving them meaning is a change to
       `runs.ts` and three server mirrors — a pass of its own, named in the
       handoff, not five controls that lie tonight. */
    { key: "text", label: "Text Editor", type: "richtext", tab: "content", section: "Text Editor", panel: true },
    { key: "drop_cap", label: "Drop Cap", type: "toggle", tab: "content", section: "Text Editor",
      help: "Make the first letter big, the way a magazine does." },
    { key: "text_columns", label: "Columns", type: "select", tab: "content", section: "Text Editor", options: TEXT_COLUMNS, responsive: true },
    { key: "column_gap", label: "Columns Gap", type: "number", tab: "content", section: "Text Editor", responsive: true, units: ["px"], max: 120 },

    /* Style ▸ Text Editor */
    { key: "align", label: "Alignment", type: "select", tab: "style", section: "Text Editor", options: ALIGNMENTS, responsive: true },
    { key: "text_color", label: "Text Color", type: "colour", tab: "style", section: "Text Editor" },
    { key: "typography_text_transform", label: "Transform", type: "select", tab: "style", section: "Text Editor", options: TRANSFORMS },
    { key: "typography_font_style", label: "Style", type: "select", tab: "style", section: "Text Editor", options: FONT_STYLES },
    { key: "typography_text_decoration", label: "Decoration", type: "select", tab: "style", section: "Text Editor", options: DECORATIONS },
    { key: "typography_word_spacing", label: "Word Spacing", type: "number", tab: "style", section: "Text Editor", responsive: true },
    { key: "text_shadow_text_shadow_horizontal", label: "Shadow Horizontal", type: "number", tab: "style", section: "Text Editor" },
    { key: "text_shadow_text_shadow_vertical", label: "Shadow Vertical", type: "number", tab: "style", section: "Text Editor" },
    { key: "text_shadow_text_shadow_blur", label: "Shadow Blur", type: "number", tab: "style", section: "Text Editor" },
    { key: "text_shadow_text_shadow_color", label: "Shadow Color", type: "colour", tab: "style", section: "Text Editor" },
    { key: "paragraph_spacing", label: "Paragraph Spacing", type: "number", tab: "style", section: "Text Editor", responsive: true, units: ["px"], max: 120 },
    { key: "link_color", label: "Link Color", type: "colour", tab: "style", section: "Text Editor" },
    { key: "link_hover_color", label: "Link Hover Color", type: "colour", tab: "style", section: "Text Editor" },
    { key: "link_hover_color_transition_duration", label: "Transition Duration", type: "number", tab: "style", section: "Text Editor",
      help: "Seconds. How long the colour takes to change." },

    /* Style ▸ Drop Cap — Elementor's own second section. */
    { key: "drop_cap_view", label: "View", type: "select", tab: "style", section: "Drop Cap", options: DROP_CAP_VIEWS },
    { key: "drop_cap_primary_color", label: "Primary Color", type: "colour", tab: "style", section: "Drop Cap" },
    { key: "drop_cap_secondary_color", label: "Secondary Color", type: "colour", tab: "style", section: "Drop Cap" },
    { key: "drop_cap_size", label: "Size", type: "number", tab: "style", section: "Drop Cap",
      help: "How many lines tall the letter is." },
    { key: "drop_cap_space", label: "Space", type: "number", tab: "style", section: "Drop Cap" },
    { key: "drop_cap_border_radius", label: "Border Radius", type: "number", tab: "style", section: "Drop Cap" },
    { key: "drop_cap_border_width", label: "Border Width", type: "number", tab: "style", section: "Drop Cap" },
    { key: "drop_cap_typography_text_transform", label: "Transform", type: "select", tab: "style", section: "Drop Cap", options: TRANSFORMS },
    { key: "drop_cap_typography_font_style", label: "Style", type: "select", tab: "style", section: "Drop Cap", options: FONT_STYLES },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   THE MAILBOX HALF
   ══════════════════════════════════════════════════════════════════════════

   Same reason as Heading's. The offer file gives Text Editor to the newsletter,
   wave 2 gave it a Style tab, and driving it showed the adapter's own `paras`
   drawing the canvas — so Alignment, Text Color, Columns and the rest were on
   the panel of a newsletter and changed nothing. With none of the new keys set
   this produces the SAME BYTES `paras` did, which is what keeps every golden
   case unchanged.

   The DROP CAP does not reach a mailbox and that is not an oversight: it is a
   `::first-letter` rule in a stylesheet, and an email has no stylesheet —
   Gmail strips one and Outlook never had one. The columns are the same story.
   Both stay on the panel because the same widget is offered on a page, where
   they work; what a mailbox cannot do, it does not pretend to do. */

/** Merge-fill, escape, then the six inline tags a mailbox accepts. */
function emailInline(value: unknown, ctx: EmailRenderContext): string {
  return inlineSafe(esc(fill(str(value), (ctx as any).merge || {}, str(ctx.mode) as any)));
}

/** Elementor's alignment words and ours, as a mailbox spells them. */
function emailAlign(v: unknown, dflt = "left"): string {
  const s = str(v).toLowerCase();
  if (s.startsWith("cent")) return "center";
  if (s === "right" || s === "end") return "right";
  if (s === "left" || s === "start") return "left";
  if (s === "justify") return "justify";
  return dflt;
}

export function emailTextEditor(w: Widget, ctx: EmailRenderContext): string {
  const p: any = w.props || {};
  const face = mailboxFontStack(ctx.bodyFont);
  const colour = str(p.text_color) || str(ctx.ink) || "#111827";
  const extra = [...effectsCss(p), ...shadowCss(p)];
  const spacing = num(p.paragraph_spacing);
  const base = `font-family:${face};font-size:15px;line-height:1.6;color:${colour};`
    + `text-align:${emailAlign(p.align)};${extra.length ? `${extra.join(";")};` : ""}`;

  const filled = fill(editorText(p), (ctx as any).merge || {}, str(ctx.mode) as any);
  if (!filled.trim()) {
    return ctx.mode === "edit"
      ? `<div style="${base}"${ctx.mode === "edit" ? ` data-edit="text" data-placeholder="Type here…"` : ""}></div>`
      : "";
  }
  const blocks = filled.split(/\n{2,}/)
    .map((b) => boldRuns(inlineSafe(esc(b.trim()))).replace(/\n/g, "<br />"));
  const margin = `margin:0 0 ${spacing == null ? 12 : spacing}px 0;`;
  if (ctx.mode === "edit") {
    return `<div style="${base}${str(ctx.typeCss)}" data-edit="text">`
      + blocks.map((b) => `<p style="${margin}">${b}</p>`).join("")
      + `</div>`;
  }
  return blocks.map((b) => `<p style="${base}${margin}${str(ctx.typeCss)}">${b}</p>`).join("");
}

void emailInline;

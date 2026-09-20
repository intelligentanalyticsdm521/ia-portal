/**
 * f1-words/heading.ts — Elementor's **Heading**, deepened.
 *
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json` → `heading`: title
 * "Heading", group `basic`. TWO panel sections, both called "Heading":
 *
 *   content  title (textarea) · link (url) · size (select) · header_size (select)
 *   style    align · the Typography popover · Text Stroke · Text Shadow ·
 *            Blend Mode · Text Color · Link Color · Transition Duration
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────
 * The `heading` definition in `registry.ts` had THREE controls — `text`,
 * `level` ("Page title" / "Section" / "Sub-section") and a `numbered` toggle —
 * and **no Style tab at all**. This file declares the SAME KIND, so
 * `mergeWidgetDefs` (b168/override) drops the old one from the panel, from
 * `WIDGETS_BY_KIND` and from every stored document read, in its place on the
 * panel, with no id change and no migration.
 *
 * ── THE STORED KEYS DO NOT MOVE, AND THAT IS DELIBERATE ───────────────────
 * The words are stored under `text` and the tag under `level`, which is what
 * every proposal, newsletter, landing page and section template on the estate
 * already holds and what `data-edit="text"` writes back. Elementor's own
 * spellings (`title`, `header_size`) are READ TOO, and are what the arion
 * emitter PUBLISHES, because a settings key Elementor does not have is dropped
 * silently on publish. Renaming the stored key instead would have meant a
 * migration of every document for no gain a client can see.
 *
 * `numbered` is gone as a control. Nothing has ever read a widget-level
 * `numbered`: the numbering an author sees down a proposal is the SECTION's
 * (`model.ts sectionNumbers`, `section.numbered`, set in the Inspector), so
 * the toggle on the widget did nothing at all. A control that changes nothing
 * is a defect. Stored values are left alone and simply not read, as before.
 *
 * ── FONT, SIZE, WEIGHT AND COLOUR ARE THE TYPOGRAPHY GROUP'S ──────────────
 * See `words.ts`. The platform already offers those, per device, on this same
 * Style tab for every kind in `TYPOGRAPHIC_KINDS`, and `heading` has been in
 * that set since §11.8. This widget adds the Elementor Style controls that
 * group does NOT have and nothing it does.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import { fill } from "../../../merge";
import { inlineSafe } from "../../../inlineSafe";
import type { RenderContext } from "../../../render";
import { bar, pictureFrom } from "../../../pictures";
import { fillText } from "../../text";
import type { EmailRenderContext, FamilyWidgetDef } from "../types";
import {
  ALIGNMENTS, BLEND_MODES, DECORATIONS, FONT_STYLES, HEADING_SIZES, HTML_TAGS, TRANSFORMS,
  alignCss, blendCss, deviceCss, effectsCss, headingSizeCss, linked, mailboxFontStack, num,
  ownClass, perDevice, shadowCss, str, strokeCss,
} from "./words";

/** Elementor's nine tags, and the one a heading is when a document says junk. */
const TAGS = HTML_TAGS.map((o) => String(o.value));

/**
 * WHICH ELEMENT THE HEADING IS.
 *
 * `header_size` is Elementor's own key and wins when the author has set it.
 * `level` is what this kind has stored since the first registry — 1/2/3, or
 * the three words the old Size select wrote — and is read so a document saved
 * before this pass opens exactly as it did.
 */
export function headingTag(p: Record<string, unknown> | undefined | null): string {
  const props: any = p || {};
  const tag = str(props.header_size).toLowerCase();
  if (TAGS.indexOf(tag) >= 0) return tag;
  const level = props.level;
  if (level === "Page title" || level === 1 || level === "1") return "h1";
  if (level === "Sub-section" || level === 3 || level === "3") return "h3";
  return "h2";
}

/** The words, whichever key they were stored under. */
export function headingText(p: Record<string, unknown> | undefined | null): string {
  const props: any = p || {};
  return str(props.text != null && props.text !== "" ? props.text : props.title);
}

export function renderHeading(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const tag = headingTag(p);
  const heading = /^h[1-6]$/.test(tag);
  const cls = ownClass("bx-hd", w.id);

  /* The declarations, in the order the engine has always written them, so a
     heading nobody has restyled produces the SAME BYTES as before this file
     existed — which is what `test/builder-styling.test.mjs` asserts. */
  const decls: string[] = [`color:${esc(str(p.title_color) || ctx.accent)}`];
  const size = headingSizeCss(p.size);
  if (size) decls.push(size);
  const align = alignCss(p.align);
  if (align) decls.push(`text-align:${align}`);
  decls.push(...effectsCss(p), ...strokeCss(p), ...shadowCss(p), ...blendCss(p));

  /* Per device and on hover. Both are only written when the author set them,
     so an untouched heading emits no style block at all. */
  const sizes = perDevice(p, "size");
  const aligns = perDevice(p, "align");
  const perScreen = (device: "tablet" | "phone") => {
    const out: string[] = [];
    const s = headingSizeCss((sizes as any)[device]);
    if (s) out.push(s);
    const a = alignCss((aligns as any)[device]);
    if (a) out.push(`text-align:${a}`);
    return out;
  };
  const hover = str(p.title_hover_color);
  const transition = num(p.title_hover_color_transition_duration);
  const hoverRule = hover
    ? `<style>.${cls} a{${transition != null ? `transition:color ${transition}s;` : ""}}`
      + `.${cls} a:hover{color:${esc(hover)}}</style>`
    : "";
  const block = deviceCss(`.${cls}`, { tablet: perScreen("tablet"), phone: perScreen("phone") });

  const body = linked(fillText(headingText(p), ctx), p.link);
  /* The widget's own class is only worn when something actually points at it.
     A heading nobody has restyled per device or on hover emits the SAME BYTES
     it emitted before this file existed, which is what
     `test/builder-styling.test.mjs` asserts and what keeps every stored
     document, golden and printed page unchanged. */
  const scoped = block || hoverRule ? ` ${cls}` : "";
  const classes = `bx-h${heading ? ` bx-h${tag.slice(1)}` : ""}${scoped}`;
  return block + hoverRule
    + `<${tag} class="${classes}" style="${decls.join(";")}" data-edit="text">${body}</${tag}>`;
}

export const HEADING_DEF: FamilyWidgetDef = {
  kind: "heading",
  label: "Heading",
  description: {
    proposal: "A title for the section — the line somebody reads before the words under it.",
    website: "A title for this band of the page — the line somebody skims before they read.",
    email: "A title inside the email — the line that carries the eye down to the next part.",
    landing: "A title for this band of the page — the line a visitor reads first.",
    brand: "A line of big type on the design — the words people read from across the room.",
  },
  icon: "Heading",
  picture: pictureFrom(bar(10, 14, 44, 6) + bar(10, 24, 28)),
  category: "Basic",
  builders: ["website", "landing", "newsletter", "proposal", "mybrand"],
  tier: "free",
  defaults: { text: "", level: 2, header_size: "h2", size: "default", link: "" },
  controls: [
    /* Content — Elementor's section is called "Heading". `title` is a textarea
       in Elementor and is typed ON THE PAGE here, which is the platform's one
       editing mechanism (D-01); it is declared so the section can be read as a
       whole and so the emitter and the tests can see it. */
    { key: "text", label: "Title", type: "textarea", tab: "content", section: "Heading" },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Heading" },
    { key: "size", label: "Size", type: "select", tab: "content", section: "Heading", options: HEADING_SIZES },
    { key: "header_size", label: "HTML Tag", type: "select", tab: "content", section: "Heading", options: HTML_TAGS },

    /* Style — Elementor's section is called "Heading" too. */
    { key: "align", label: "Alignment", type: "select", tab: "style", section: "Heading", options: ALIGNMENTS, responsive: true },
    { key: "title_color", label: "Text Color", type: "colour", tab: "style", section: "Heading" },
    { key: "typography_text_transform", label: "Transform", type: "select", tab: "style", section: "Heading", options: TRANSFORMS },
    { key: "typography_font_style", label: "Style", type: "select", tab: "style", section: "Heading", options: FONT_STYLES },
    { key: "typography_text_decoration", label: "Decoration", type: "select", tab: "style", section: "Heading", options: DECORATIONS },
    { key: "typography_word_spacing", label: "Word Spacing", type: "number", tab: "style", section: "Heading", responsive: true },
    { key: "text_stroke_text_stroke", label: "Text Stroke", type: "number", tab: "style", section: "Heading", responsive: true },
    { key: "text_stroke_stroke_color", label: "Stroke Color", type: "colour", tab: "style", section: "Heading" },
    { key: "text_shadow_text_shadow_horizontal", label: "Shadow Horizontal", type: "number", tab: "style", section: "Heading" },
    { key: "text_shadow_text_shadow_vertical", label: "Shadow Vertical", type: "number", tab: "style", section: "Heading" },
    { key: "text_shadow_text_shadow_blur", label: "Shadow Blur", type: "number", tab: "style", section: "Heading" },
    { key: "text_shadow_text_shadow_color", label: "Shadow Color", type: "colour", tab: "style", section: "Heading" },
    { key: "blend_mode", label: "Blend Mode", type: "select", tab: "style", section: "Heading", options: BLEND_MODES },
    { key: "title_hover_color", label: "Link Color", type: "colour", tab: "style", section: "Heading",
      help: "The colour the words turn when somebody points at the link." },
    { key: "title_hover_color_transition_duration", label: "Transition Duration", type: "number", tab: "style", section: "Heading",
      help: "Seconds. How long the colour takes to change." },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   THE MAILBOX HALF
   ══════════════════════════════════════════════════════════════════════════

   Wave 2 gave Heading a Style tab, and the offer file gives Heading to the
   NEWSLETTER. Driving it on 2026-09-19 showed what that meant: the mailbox
   adapter's own `emHeading` drew the canvas, so Transform, Blend Mode, Size and
   the rest were on the panel of a newsletter and changed nothing at all. A
   control that changes nothing is a defect, not a feature — so the family owns
   this widget in a mailbox too.

   ── IT IS THE ADAPTER'S OWN OUTPUT, EXTENDED, NOT A NEW ONE ──────────────
   With none of the new keys set it produces the SAME BYTES `emHeading` did, so
   every golden case in `test/fixtures/email-render-cases.json` — the fixture
   the Portal and LUMEN-API both read — is unchanged, and that is what proves
   it rather than a promise in a comment. The declarations Elementor adds go on
   the END of the style attribute, where they win, and only when set.

   A mailbox has no `::first-letter` worth trusting, no container queries and no
   stylesheet at all, so the per-device values and the drop cap do not reach it.
   `styleBlockFor` has said the same about device overrides since §11.8, and the
   inspector already says so beside the controls it is true of. */

/** The chosen face, then the ones every client has. `words.ts` owns the rule. */
function emailStack(face: unknown): string {
  return mailboxFontStack(face);
}

/** A colour a mailbox will accept, or the fallback. The adapter's own test. */
function emailColour(v: unknown, fallback: string): string {
  const s = str(v).trim();
  return /^#[0-9a-fA-F]{3,8}$|^rgb|^hsl/.test(s) ? s : fallback;
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

/** `data-edit`, only while editing — a sent email carries no markers. */
function emailEdit(path: string, ctx: EmailRenderContext, placeholder?: string): string {
  if (ctx.mode !== "edit") return "";
  return ` data-edit="${esc(path)}"${placeholder ? ` data-placeholder="${esc(placeholder)}"` : ""}`;
}

/** Merge-fill, escape, then the six inline tags a mailbox accepts. In that order. */
function emailText(value: unknown, ctx: EmailRenderContext): string {
  return inlineSafe(esc(fill(str(value), (ctx as any).merge || {}, str(ctx.mode) as any)));
}

export function emailHeading(w: Widget, ctx: EmailRenderContext): string {
  const p: any = w.props || {};
  /* The adapter's own three sizes, from the stored `level`. Elementor's `size`
     preset overrides it when the author picked one, which is the whole reason
     that control is on the panel. */
  const level = p.level === "Page title" || p.level === 1 ? 1 : p.level === "Sub-section" || p.level === 3 ? 3 : 2;
  const legacySize = level === 1 ? 26 : level === 2 ? 20 : 16;
  const preset = headingSizeCss(p.size);
  const size = preset ? preset.replace("font-size:", "").replace("px", "") : String(legacySize);
  /* `header_size` is Elementor's own tag and wins; `level` is what the stored
     document has. The mailbox has always drawn h1/h2/h3 and nothing else, and a
     `span` or a `div` in a table cell is what Outlook reflows worst, so a tag
     outside h1–h6 stays the heading the adapter already drew. */
  const tag = /^h[1-6]$/.test(str(p.header_size)) ? str(p.header_size) : `h${level}`;
  const col = emailColour(p.title_color != null && p.title_color !== "" ? p.title_color : p.colour, str(ctx.ink) || "#111827");

  const extra: string[] = [];
  extra.push(...effectsCss(p), ...shadowCss(p), ...blendCss(p));
  const strokes = strokeCss(p);
  if (strokes.length) extra.push(strokes[0]);

  const body = linked(emailText(p.text != null && p.text !== "" ? p.text : p.title, ctx), p.link);
  return `<${tag} style="margin:0 0 12px 0;font-family:${emailStack(ctx.headingFont)};font-size:${size}px;`
    + `line-height:1.25;font-weight:700;color:${col};text-align:${emailAlign(p.align)};`
    + `${str(ctx.typeCss)}${extra.length ? `${extra.join(";")};` : ""}"`
    + `${emailEdit("text", ctx, "Your heading")}>${body}</${tag}>`;
}

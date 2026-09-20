/**
 * families/f7-data-lists/themeHeadings.ts — the four widgets that are one
 * heading pulled off the site: **Site Title**, **Page Title**, **Post Title**
 * and **Archive Title**.
 *
 * ── WHY FOUR WIDGETS IN ONE FILE ──────────────────────────────────────────
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json` registers all four with the SAME
 * panel: one content section called "Heading" holding `title`, `link`, `size`
 * and `header_size`, and one style section called "Heading" holding `align` and
 * `title_color`. They differ in exactly two things — Elementor's title for the
 * tile, and which word off the site fills the heading. Four files would be four
 * copies of one panel, and the copies are what drift. This is the same call
 * `widgets/icons.ts` already made and wrote down.
 *
 * ── WHERE THE WORDS COME FROM ─────────────────────────────────────────────
 * Elementor draws the real thing on the published page and a stand-in in the
 * editor, because the editor is not the page. Ours does the same, with ONE
 * difference that is ours to make: **Site Title** really does know its answer —
 * the business's own name is already in the render context — so it shows it
 * rather than a stand-in. The other three name what will fill them, in one
 * plain sentence, and only while editing.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, pictureFrom } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import { HTML_TAG_OPTIONS, SIZE_OPTIONS, fromTheSite, str } from "./shared";

/** Elementor's Size select scales the heading; these are its own steps. */
const FONT_SIZE: Record<string, string> = {
  default: "", small: "font-size:15px;", medium: "font-size:19px;",
  large: "font-size:24px;", xl: "font-size:30px;", xxl: "font-size:38px;",
};

/** One tag out of Elementor's list, never whatever the props happen to hold. */
function tagOf(v: unknown, dflt: string): string {
  const t = str(v).toLowerCase();
  return HTML_TAG_OPTIONS.some((o) => o.value === t) ? t : dflt;
}

/**
 * The one renderer all four share. `words` is what the SITE puts in it.
 *
 * The author may type over it, and does that ON THE HEADING — `editRun` is the
 * engine's one editing mechanism and the `title` control is declared `text`,
 * which is what the panel means by "typed on the page". Empty means "use the
 * real one", so the site's own words are the PLACEHOLDER while editing and the
 * body itself when the page is just being looked at.
 */
function heading(w: Widget, ctx: RenderContext, words: string, sentence: string, dfltTag: string): string {
  const p: any = w.props || {};
  const tag = tagOf(p.header_size, dfltTag);
  const typed = str(p.title).trim();
  const align = str(p.align) || "start";
  const flow = align === "center" ? "center" : align === "end" ? "right" : align === "justify" ? "justify" : "left";
  const skin = `text-align:${flow};${FONT_SIZE[str(p.size)] || ""}color:${esc(str(p.title_color) || ctx.ink)}`;
  const body = ctx.mode === "edit"
    ? editRun("title", p.title, "bx-h", words, ctx, tag)
    : `<${tag} class="bx-h" style="margin:0">${esc(typed || words)}</${tag}>`;
  const link = str(p.link);
  return `<div class="bx-f7-heading" style="${skin}">`
    + (link ? `<a href="${esc(link)}" style="text-decoration:none;color:inherit">${body}</a>` : body)
    + fromTheSite(ctx.mode, sentence)
    + `</div>`;
}

/** The four defs are one shape with four names, so the shape is written once. */
function headingDef(
  kind: string, label: string, icon: string, description: string, dfltTag: string,
): FamilyWidgetDef {
  return {
    kind,
    label,
    description,
    icon,
    picture: pictureFrom(bar(10, 14, 44, 7) + bar(10, 26, 28, 4)),
    category: "General",
    builders: ["website"],
    tier: "pro",
    defaults: { title: "", link: "", size: "default", header_size: dfltTag, align: "", title_color: "" },
    controls: [
      {
        key: "title", label: "Title", type: "text", tab: "content", section: "Heading",
        help: "Leave it empty to use the real one from the site.",
      },
      { key: "link", label: "Link", type: "link", tab: "content", section: "Heading" },
      { key: "size", label: "Size", type: "select", tab: "content", section: "Heading", options: SIZE_OPTIONS },
      { key: "header_size", label: "HTML Tag", type: "select", tab: "content", section: "Heading", options: HTML_TAG_OPTIONS },
      {
        key: "align", label: "Alignment", type: "select", tab: "style", section: "Heading", responsive: true,
        options: [
          { value: "start", label: "Left" }, { value: "center", label: "Centre" },
          { value: "end", label: "Right" }, { value: "justify", label: "Justified" },
        ],
      },
      { key: "title_color", label: "Text Color", type: "colour", tab: "style", section: "Heading" },
    ],
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Site Title — Elementor `theme-site-title`
   ══════════════════════════════════════════════════════════════════════════ */

export const THEME_SITE_TITLE_DEF: FamilyWidgetDef = headingDef(
  "theme_site_title", "Site Title", "Type",
  "The name of your website, as a heading. Change it in one place and every page follows.",
  "h2");

export const renderThemeSiteTitle: FamilyRenderer = (w, ctx) => heading(
  w, ctx, str(ctx.business?.name) || "Your business name",
  "This is your business name. Change it in your business profile and every page follows.", "h2");

/* ══════════════════════════════════════════════════════════════════════════
   Page Title — Elementor `theme-page-title`
   ══════════════════════════════════════════════════════════════════════════ */

export const THEME_PAGE_TITLE_DEF: FamilyWidgetDef = headingDef(
  "theme_page_title", "Page Title", "Heading1",
  "The title of whichever page this is, as a heading.",
  "h1");

export const renderThemePageTitle: FamilyRenderer = (w, ctx) => heading(
  w, ctx, "The page's own title",
  "Each page fills this in with its own title.", "h1");

/* ══════════════════════════════════════════════════════════════════════════
   Post Title — Elementor `theme-post-title`
   ══════════════════════════════════════════════════════════════════════════ */

export const THEME_POST_TITLE_DEF: FamilyWidgetDef = headingDef(
  "theme_post_title", "Post Title", "Heading2",
  "The title of whichever story is being read, as a heading.",
  "h1");

export const renderThemePostTitle: FamilyRenderer = (w, ctx) => heading(
  w, ctx, "The story's own title",
  "Each story fills this in with its own title.", "h1");

/* ══════════════════════════════════════════════════════════════════════════
   Archive Title — Elementor `theme-archive-title`
   ══════════════════════════════════════════════════════════════════════════ */

export const THEME_ARCHIVE_TITLE_DEF: FamilyWidgetDef = headingDef(
  "theme_archive_title", "Archive Title", "Library",
  "The name of the list being looked at — a category, a tag, a month.",
  "h1");

export const renderThemeArchiveTitle: FamilyRenderer = (w, ctx) => heading(
  w, ctx, "The category being looked at",
  "A list page fills this in with the category, tag or month it is showing.", "h1");

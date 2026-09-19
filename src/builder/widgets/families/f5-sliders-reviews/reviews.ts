/**
 * families/f5-sliders-reviews/reviews.ts — Elementor `reviews` (Pro, "Reviews")
 * and its IA database twin, **IA Reviews**.
 *
 * ── THE TWO TILES, AND WHY THERE ARE TWO ──────────────────────────────────
 * `BUILDER_OFFERS_2026-09-19.json` lists BOTH: `reviews` in the page builders'
 * Elementor Pro column, and `ia_reviews` in their IA column, described as
 * *"twin of Reviews: the business's real reviews"*. They are the same panel and
 * the same look. The difference is one sentence: on Reviews the author types
 * the slides, and on IA Reviews the slides are the reviews the business already
 * has, so nobody retypes them and nobody invents one.
 *
 * ── WHICH KIND IS WHICH, AND WHY THIS WAY ROUND ───────────────────────────
 * The kind `reviews` already exists (D-165, `widgets/iaBlocks.ts`) and it was
 * the IA one: "Real reviews of your business". It KEEPS its id, because stored
 * pages carry it, and it becomes the ELEMENTOR widget here, for one reason that
 * decides it: `reviews` is the page engine's own slug, and arion has to publish
 * `widgetType: "reviews"`. A kind whose name is the engine's name and whose
 * meaning is not would be a rename waiting to happen at the one boundary that
 * cannot afford one. Nothing is lost: the renderer reads the old `items` array
 * (`quote` / `author` / `rating`) as well as the engine's `slides`, so a page
 * already carrying reviews draws exactly as it did, and IA Reviews is the new
 * id `ia_reviews` with the same panel.
 *
 * Panel sections, control labels and defaults from
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`. Not seen live: the free
 * Playground editor carries no Pro widget, which the plan's own "what could NOT
 * be verified" says of every Pro row.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyWidgetDef } from "../types";
import { emptyStrip, slideRows, starRow, str, strip, within } from "./carousel";

/** Elementor's own repeater row, and the one this family's other slider shares. */
export interface ReviewSlide {
  image?: unknown;
  name?: unknown;
  title?: unknown;
  rating?: unknown;
  content?: unknown;
  link?: unknown;
  /* What a page written before this family spelled the same three things. */
  quote?: unknown;
  author?: unknown;
}

/** Elementor's "Slides Per View" is a select of 1–10 with an empty "Default". */
const PER_VIEW = [
  { value: "", label: "Default" },
  ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
];

const PAGINATION = [
  { value: "", label: "None" },
  { value: "bullets", label: "Dots" },
  { value: "fraction", label: "Fraction" },
  { value: "progressbar", label: "Progress" },
];

/** Three lorem-free starter slides, so a dropped widget is never an empty box. */
const STARTER: ReviewSlide[] = [
  { name: "", title: "", rating: 5, content: "", image: "" },
  { name: "", title: "", rating: 5, content: "", image: "" },
  { name: "", title: "", rating: 5, content: "", image: "" },
];

/** ONE renderer, two tiles: the words on an empty one are the only difference. */
function drawReviews(w: Widget, ctx: RenderContext, cls: string, whenEmpty: string): string {
  const p: any = w.props || {};
  const rows = slideRows(p) as ReviewSlide[];
  if (!rows.length) return emptyStrip(ctx, whenEmpty);
  const per = within(p.slides_per_view, 1, 10, 3);
  const gap = within(p.space_between, 0, 200, 20);
  const nameColour = str(p.name_color) || ctx.accent;
  const cells = rows.map((r, i) => {
    const content = str(r.content ?? r.quote);
    const name = str(r.name ?? r.author);
    const title = str(r.title);
    const image = str(r.image);
    const bg = str(p.slide_background_color);
    return `<figure class="bx-review" style="margin:0;padding:14px;border:1px solid #E2E8F0;border-radius:${within(p.slide_border_radius, 0, 60, 8)}px${bg ? `;background:${esc(bg)}` : ""}">
      <div class="bx-review-head" style="display:flex;gap:10px;align-items:center">
        ${image ? `<img src="${esc(image)}" alt="" style="width:40px;height:40px;border-radius:999px;object-fit:cover"/>` : ""}
        <div style="min-width:0">
          ${editRun(`slides.${i}.name`, name, "bx-review-n", "Who left it", ctx, "div")}
          ${editRun(`slides.${i}.title`, title, "bx-review-t", "Where they left it", ctx, "div")}
        </div>
      </div>
      ${starRow(r.rating, str(p.stars_color) || ctx.accent)}
      ${editRun(`slides.${i}.content`, content, "bx-review-b", "What they said", ctx, "blockquote")}
    </figure>`;
  });
  return `<div class="${esc(cls)}" style="--bx-review-name:${esc(nameColour)}">${strip(cells, { perView: per, gap, cls: "bx-strip" })}</div>`;
}

export function renderReviews(w: Widget, ctx: RenderContext): string {
  return drawReviews(w, ctx, "bx-reviews", "Add what a customer said in the panel on the right.");
}

export function renderIaReviews(w: Widget, ctx: RenderContext): string {
  return drawReviews(w, ctx, "bx-reviews bx-ia-reviews", "Your reviews appear here once they are brought in.");
}

/** Everything both tiles share: Elementor's Slides and Additional Options. */
function reviewControls(): FamilyWidgetDef["controls"] {
  return [
    { key: "slides_name", label: "Slides Name", type: "text", tab: "content", section: "Slides" },
    { key: "slides", label: "Slides", type: "list", tab: "content", section: "Slides" },
    { key: "slides_per_view", label: "Slides Per View", type: "select", tab: "content", section: "Slides", responsive: true, options: PER_VIEW },
    { key: "slides_to_scroll", label: "Slides to Scroll", type: "select", tab: "content", section: "Slides", responsive: true, options: PER_VIEW },
    { key: "show_arrows", label: "Arrows", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "pagination", label: "Pagination", type: "select", tab: "content", section: "Additional Options", options: PAGINATION },
    { key: "autoplay", label: "Autoplay", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "autoplay_speed", label: "Autoplay Speed", type: "number", tab: "content", section: "Additional Options" },
    { key: "loop", label: "Infinite Loop", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "pause_on_hover", label: "Pause on Hover", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "space_between", label: "Space Between", type: "number", tab: "style", section: "Slides", responsive: true },
    { key: "slide_background_color", label: "Background Color", type: "colour", tab: "style", section: "Slides" },
    { key: "slide_border_radius", label: "Border Radius", type: "number", tab: "style", section: "Slides" },
    { key: "name_color", label: "Color", type: "colour", tab: "style", section: "Text" },
    { key: "content_color", label: "Color", type: "colour", tab: "style", section: "Text" },
    { key: "image_size", label: "Size", type: "number", tab: "style", section: "Image" },
    { key: "stars_color", label: "Color", type: "colour", tab: "style", section: "Rating" },
  ];
}

const REVIEW_DEFAULTS = {
  slides_name: "Slides",
  slides_per_view: "", slides_to_scroll: "",
  show_arrows: "yes", pagination: "bullets", autoplay: "yes", autoplay_speed: 5000,
  loop: "yes", pause_on_hover: "yes",
  space_between: 20, slide_background_color: "", slide_border_radius: 8,
  name_color: "", content_color: "", image_size: 40, stars_color: "",
};

const REVIEW_PICTURE = pictureFrom(box(5, 8, 26, 24) + box(34, 8, 25, 24)
  + bar(9, 13, 18, 3) + bar(9, 20, 13, 3) + bar(38, 13, 17, 3) + bar(38, 20, 12, 3));

export const REVIEWS_DEF: FamilyWidgetDef = {
  kind: "reviews",
  label: "Reviews",
  description: {
    website: "A row of reviews you type in, with stars and who left them.",
    landing: "A row of reviews you type in, with stars and who left them.",
    proposal: "A row of reviews you type in, with stars and who left them.",
  },
  icon: "Stars",
  picture: REVIEW_PICTURE,
  category: "General",
  builders: ["website", "landing", "proposal"],
  tier: "pro",
  defaults: { ...REVIEW_DEFAULTS, slides: STARTER.map((s) => ({ ...s })) },
  controls: reviewControls(),
};

export const IA_REVIEWS_DEF: FamilyWidgetDef = {
  kind: "ia_reviews",
  label: "IA Reviews",
  description: {
    website: "Your business's real reviews, with the stars and who left them.",
    landing: "Your business's real reviews, with the stars and who left them.",
    email: "Your business's real reviews, stacked down the message.",
  },
  icon: "Stars",
  picture: REVIEW_PICTURE,
  category: "Intelligent Analytics",
  builders: ["website", "landing", "newsletter"],
  /* No `tier` and no `requires`. Reviews are the business's own, not a product
     they buy, and every gate ships unset today — Brandon decides the tiers in
     October and that must be a change to DATA. See families/types.ts. */
  defaults: { ...REVIEW_DEFAULTS, slides: [] },
  controls: reviewControls(),
};

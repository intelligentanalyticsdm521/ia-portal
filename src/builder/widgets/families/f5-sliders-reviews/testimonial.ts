/**
 * families/f5-sliders-reviews/testimonial.ts — Elementor `testimonial`,
 * group General, free.
 *
 * MOVED, not rewritten. `testimonial` is a kind that already exists — D-165 put
 * it in `widgets/boxes.ts` — and the shared vocabulary's first rule is that an
 * existing kind keeps its id and therefore its props, because stored documents
 * and three server mirrors read them. So the id, `quote` / `attribution` /
 * `job` / `image` / `align`, is exactly what it was; the file it lives in is
 * this one, beside the four sliders that repeat it. The old copy in `boxes.ts`
 * is deleted in the same pass (replace means delete).
 *
 * ── WHAT CHANGED, AND WHY EACH CHANGE IS ELEMENTOR'S OWN ──────────────────
 * Read off `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json` and confirmed against
 * the live panel photographed on 2026-09-19
 * (`elementor-reference/widgets/testimonial.panel.png`):
 *
 *   · **"Stars" is gone.** Elementor's Testimonial has no rating control — the
 *     panel is Content, Choose Image, Image Resolution, Name, Title, Link,
 *     Image Position, Alignment, and nothing else. Stars are their own widget,
 *     `rating`, which F4 owns. D-168 is absolute about this: a control that is
 *     not Elementor's is one we invented. The RENDERER still draws a rating a
 *     stored document already carries, so nobody's signed proposal loses its
 *     stars overnight; nothing can add one any more.
 *   · **Link and Image Position are added** — both are Elementor's, both were
 *     missing.
 *   · **Alignment defaults to centre**, which is what the live default look is
 *     (`testimonial.default.png`), and it is responsive, which the machine file
 *     marks it.
 *
 * Elementor's own spellings (`testimonial_content`, `testimonial_name`,
 * `testimonial_job`, `testimonial_image`, `testimonial_alignment`) are read as
 * well, for a testimonial that came back out of a published page.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, pictureFrom } from "../../../pictures";
import { editRun, proseRun } from "../../text";
import type { FamilyWidgetDef } from "../types";
import { starRow, str } from "./carousel";

/** Elementor's two image positions, by its own words. */
const IMAGE_POSITIONS = [
  { value: "aside", label: "Aside" },
  { value: "top", label: "Top" },
];

const ALIGNMENTS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
];

export function renderTestimonial(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const quote = str(p.quote ?? p.testimonial_content);
  const name = str(p.attribution ?? p.testimonial_name);
  const job = str(p.job ?? p.testimonial_job);
  if (!quote.trim() && ctx.mode !== "edit") return "";
  const image = str(p.image ?? p.testimonial_image);
  const align = str(p.align ?? p.testimonial_alignment) || "center";
  const aside = str(p.testimonial_image_position ?? "aside") !== "top";
  const size = Number(p.image_size) > 0 ? Number(p.image_size) : 36;
  /* A rating no control can set any more — see the header. Drawn only when a
     document already carries one. */
  const stars = starRow(p.rating, ctx.accent);
  const justify = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const who = `<span class="bx-attrib-who" style="display:${aside ? "inline-block" : "block"};text-align:${esc(align)}">`
    + `${editRun("attribution", name, "bx-attrib-n", "Who said it", ctx, "span")}`
    + `${job || ctx.mode === "edit" ? editRun("job", job, "bx-attrib-j", "Their job or company", ctx, "div") : ""}`
    + `</span>`;
  const colour = str(p.content_content_color);
  return `<blockquote class="bx-quote" style="text-align:${esc(align)}${colour ? `;color:${esc(colour)}` : ""}">
    ${proseRun("quote", quote, "bx-quote-b", "What they said", ctx)}
    ${stars}
    <footer class="bx-attrib" style="display:flex;gap:8px;flex-direction:${aside ? "row" : "column"};align-items:center;justify-content:${justify}">
      ${image ? `<img src="${esc(image)}" alt="" style="width:${size}px;height:${size}px;border-radius:999px;object-fit:cover"/>` : ""}
      ${who}
    </footer>
  </blockquote>`;
}

export const TESTIMONIAL_DEF: FamilyWidgetDef = {
  kind: "testimonial",
  label: "Testimonial",
  description: {
    proposal: "Something a customer said about you, with their name underneath.",
    website: "Something a customer said about you, with their name underneath.",
    landing: "Something a customer said about you, with their name underneath.",
    email: "One customer's words, with their name underneath.",
    brand: "One customer's words, as a graphic.",
  },
  icon: "Quote",
  picture: pictureFrom(`<path d="M12 14c0-3 3-4 5-4v4c-1 0-2 1-2 3h3v7h-6z" fill="#CBD5E1" stroke="none"/>`
    + bar(22, 12, 34) + bar(22, 20, 26) + bar(22, 30, 16, 3)),
  category: "General",
  /* NOT `mybrand`, although the offer file lists it there. The Template Studio
     is an ABSOLUTE-PIXEL canvas — every object carries its own x, y, w and h,
     and `adapters/mybrand`'s `insertWidget` places one layer per kind. A widget
     whose shape is a FLOW has nothing to place, and a tile whose button does
     nothing is the drift the studio's own test exists to catch. Placing it is a
     change to the studio, which this family does not own; it is written up in
     the handoff instead of half-built here. */
  builders: ["website", "landing", "newsletter", "proposal"],
  tier: "free",
  defaults: {
    quote: "", attribution: "", job: "", image: "", link: "",
    align: "center", testimonial_image_position: "aside", image_size: 36,
    content_content_color: "", name_text_color: "", job_text_color: "",
  },
  controls: [
    { key: "quote", label: "Content", type: "textarea", tab: "content", section: "Testimonial" },
    { key: "image", label: "Choose Image", type: "image", tab: "content", section: "Testimonial" },
    { key: "attribution", label: "Name", type: "text", tab: "content", section: "Testimonial" },
    { key: "job", label: "Title", type: "text", tab: "content", section: "Testimonial" },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Testimonial" },
    { key: "testimonial_image_position", label: "Image Position", type: "select", tab: "content", section: "Testimonial", options: IMAGE_POSITIONS },
    { key: "align", label: "Alignment", type: "select", tab: "content", section: "Testimonial", responsive: true, options: ALIGNMENTS },
    { key: "content_content_color", label: "Text Color", type: "colour", tab: "style", section: "Content" },
    { key: "image_size", label: "Image Resolution", type: "number", tab: "style", section: "Image", responsive: true },
    { key: "name_text_color", label: "Text Color", type: "colour", tab: "style", section: "Name" },
    { key: "job_text_color", label: "Text Color", type: "colour", tab: "style", section: "Title" },
  ],
};

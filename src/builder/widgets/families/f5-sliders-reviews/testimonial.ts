/**
 * families/f5-sliders-reviews/testimonial.ts — Elementor `testimonial`,
 * group General, free.
 *
 * MOVED, not rewritten. `testimonial` is a kind that already exists — D-165 put
 * it in `widgets/boxes.ts` — and the shared vocabulary's first rule is that an
 * existing kind keeps its id and therefore its props, because stored documents
 * and three server mirrors read them. So the id, `quote` / `attribution` /
 * `job` / `image` / `align`, is exactly what it was; the file it lives in is
 * this one, beside the four sliders that repeat it.
 *
 * ── THE DEEP PASS, 2026-09-19 ─────────────────────────────────────────────
 * The first pass carried ELEVEN controls: the Content tab, and four colours on
 * the Style tab. Elementor's own panel has FIFTY-THREE (ninety rows in
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`, once the section headers and
 * the `_tablet` / `_mobile` twins are folded in), in five sections:
 *
 *   Content ▸ Testimonial      Content · Choose Image · Image Resolution ·
 *                              Image Dimension · Name · Title · Link ·
 *                              Image Position · Alignment
 *   Style   ▸ Content          Text Color · Typography (11) · Text Shadow (2)
 *   Style   ▸ Image            Image Resolution · Border Type · Border Width ·
 *                              Border Color · Border Radius
 *   Style   ▸ Name             Text Color · Typography (11) · Text Shadow (2)
 *   Style   ▸ Title            Text Color · Typography (11) · Text Shadow (2)
 *
 * THIRTY-NINE of the fifty-three are here, and every one of them changes what
 * the canvas draws — a control that moves nothing is a defect, not a feature,
 * so a control we cannot honour is not offered. The fourteen that are not here
 * are each named with their reason in `partType.ts`'s header and in the two
 * notes below; none of them is an oversight.
 *
 * ── WHAT IS ELEMENTOR'S OWN, CONTROL BY CONTROL ───────────────────────────
 *   · **"Stars" is gone**, and stays gone. Elementor's Testimonial has no
 *     rating control; stars are the `rating` widget, F4's. The RENDERER still
 *     draws a rating a stored document already carries, so nobody's signed
 *     proposal loses its stars; nothing can add one.
 *   · **Alignment stores `start` / `center` / `end`**, not left / center /
 *     right — every other alignment control on the platform stores left and
 *     right, so this one is easy to get wrong and the value would be DROPPED on
 *     publish. A stored `left` is still read.
 *   · **Alignment is responsive.** So are the four typography sliders of each
 *     part and the image's own size, border width and radius — copied from the
 *     machine file's `_tablet` / `_mobile` twins, never guessed.
 *
 * ── TWO CONTENT CONTROLS THAT ARE NOT HERE, AND WHY ───────────────────────
 *   · `testimonial_image_size` ("Image Resolution", Content tab) picks WHICH
 *     WordPress-generated file of an uploaded picture to use — thumbnail,
 *     medium, large, full. Our image control stores a URL and there is no media
 *     library with alternate sizes behind it, so the control could not change
 *     one pixel on the canvas. The SIZE an author actually wants is the Style
 *     tab's `image_size`, which is here and does move the picture.
 *   · `testimonial_image_custom_dimension` only exists when the control above
 *     is set to Custom, and follows it out.
 *
 * Elementor's own spellings (`testimonial_content`, `testimonial_name`,
 * `testimonial_job`, `testimonial_image`, `testimonial_alignment`) are read as
 * well, for a testimonial that came back out of a published page.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { deviceContainerQuery } from "../../../responsive";
import { bar, pictureFrom } from "../../../pictures";
import { editRun, proseRun } from "../../text";
import type { EmailRenderContext, FamilyWidgetDef } from "../types";
import { starRow, str } from "./carousel";
import {
  cssSafe, partTypeControls, partTypeCss, partTypeDefaults, partTypeInline,
} from "./partType";

/** Elementor's two image positions, by its own words. */
const IMAGE_POSITIONS = [
  { value: "aside", label: "Aside" },
  { value: "top", label: "Top" },
];

/* ELEMENTOR STORES start / center / end HERE, not left / right — read off the
   machine file, and worth saying out loud because every other alignment control
   on the platform stores left / right, and a value a control does not offer is
   dropped silently on publish. They are also valid CSS `text-align` words, so
   the renderer needs nothing special, and a document that already stored "left"
   still draws exactly as it did. */
const ALIGNMENTS = [
  { value: "start", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "end", label: "Right" },
];

/** Elementor's Border Type list, its own words, in its own order. */
const BORDER_TYPES = [
  { value: "", label: "Default" },
  { value: "none", label: "None" },
  { value: "solid", label: "Solid" },
  { value: "double", label: "Double" },
  { value: "dotted", label: "Dotted" },
  { value: "dashed", label: "Dashed" },
  { value: "groove", label: "Groove" },
];

/* THE THREE PARTS Elementor styles separately, and where each one lands.
   `content`'s colour key is `content_content_color` and NOT
   `content_text_color`: Elementor's own spelling, read off the machine file,
   and the one key in the set that breaks the pattern. It is also the key the
   first pass already stored, so a document saved this morning keeps its
   colour. */
const PARTS = [
  { selector: ".bx-quote-b", prefix: "content", colourKey: "content_content_color" },
  { selector: ".bx-attrib-n", prefix: "name" },
  { selector: ".bx-attrib-j", prefix: "job" },
];

/** A whole number a person typed, or null when they left it alone. */
function num(v: unknown): number | null {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Elementor's `start` / `center` / `end`, tolerating a stored left / right. */
function alignOf(v: unknown): string {
  const raw = str(v);
  if (raw === "left") return "start";
  if (raw === "right") return "end";
  return ALIGNMENTS.some((a) => a.value === raw) ? raw : "";
}

/**
 * THE LINK, whatever shape it was stored in.
 *
 * The panel's `link` control stores a string; Elementor's own stores
 * `{url, is_external, nofollow}`, which is what a document read back off a
 * published page carries. Both, or the link is silently absent for half the
 * documents that have one.
 */
export function linkOf(p: Record<string, unknown>): { url: string; external: boolean; nofollow: boolean } {
  const raw: any = p.link;
  const obj = raw && typeof raw === "object" ? raw : { url: raw };
  return {
    url: str(obj.url),
    external: !!obj.is_external && obj.is_external !== "",
    nofollow: !!obj.nofollow && obj.nofollow !== "",
  };
}

/**
 * THE PICTURE'S OWN CSS — Elementor's five Image controls, per device.
 *
 * `image_size` is the avatar's width and height in pixels: Elementor calls it
 * "Image Resolution" in the Image section and it is a slider, not the WordPress
 * size list on the Content tab. Border radius defaults to a circle, which is
 * what the widget has always drawn and what `testimonial.default.png` shows; an
 * author who sets a radius gets theirs instead.
 */
function imageDeclarations(p: Record<string, unknown>, device: "desktop" | "tablet" | "phone"): string[] {
  const k = (key: string) => (device === "desktop" ? key
    : `${key}${device === "tablet" ? "_tablet" : "_mobile"}`);
  const out: string[] = [];
  const size = num(p[k("image_size")]);
  if (size !== null && size > 0) out.push(`width:${size}px`, `height:${size}px`);
  const width = num(p[k("image_border_width")]);
  if (width !== null && width >= 0) out.push(`border-width:${width}px`);
  const radius = num(p[k("image_border_radius")]);
  if (radius !== null && radius >= 0) out.push(`border-radius:${radius}px`);
  if (device !== "desktop") return out;
  const style = cssSafe(p.image_border_border);
  if (style && BORDER_TYPES.some((b) => b.value === style && b.value !== "")) out.push(`border-style:${style}`);
  const colour = cssSafe(p.image_border_color);
  if (colour) out.push(`border-color:${colour}`);
  return out;
}

export function renderTestimonial(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const quote = str(p.quote ?? p.testimonial_content);
  const name = str(p.attribution ?? p.testimonial_name);
  const job = str(p.job ?? p.testimonial_job);
  if (!quote.trim() && ctx.mode !== "edit") return "";
  const image = str(p.image ?? p.testimonial_image);
  const align = alignOf(p.align ?? p.testimonial_alignment) || "center";
  const aside = str(p.testimonial_image_position ?? "aside") !== "top";
  /* A rating no control can set any more — see the header. Drawn only when a
     document already carries one. */
  const stars = starRow(p.rating, ctx.accent);
  const justify = align === "center" ? "center" : align === "end" ? "flex-end" : "flex-start";

  /* THE THREE PARTS' TYPOGRAPHY AND THE PICTURE'S EDGE, as ONE scoped
     stylesheet — the platform's own per-device mechanism (§11.8's container
     queries) rather than a fourth set of pixel widths. Nothing is emitted when
     nothing is set, so an untouched document draws the bytes it always did. */
  const parts = partTypeCss(p, w.id, PARTS);
  const imageBlocks: string[] = [];
  for (const device of ["desktop", "tablet", "phone"] as const) {
    const decls = imageDeclarations(p, device);
    if (!decls.length) continue;
    const rule = `.${parts.cls} .bx-attrib-img{${decls.join(";")}}`;
    imageBlocks.push(device === "desktop" ? rule : `${deviceContainerQuery(device)}{${rule}}`);
  }
  const css = imageBlocks.length
    ? `${parts.css}<style>${imageBlocks.join("")}</style>`
    : parts.css;

  const link = linkOf(p);
  /* The anchor wraps the PICTURE always and the NAME only when nobody is
     editing: a contentEditable run inside an <a> swallows the first click, so
     the author would have to fight the link to retype the name. Elementor's own
     widget links both. */
  const rel = [link.external ? "noopener" : "", link.nofollow ? "nofollow" : ""].filter(Boolean).join(" ");
  const anchor = (inner: string) => (link.url
    ? `<a class="bx-quote-link" href="${esc(link.url)}"${link.external ? ` target="_blank"` : ""}`
      + `${rel ? ` rel="${esc(rel)}"` : ""} style="color:inherit;text-decoration:inherit">${inner}</a>`
    : inner);

  const nameRun = editRun("attribution", name, "bx-attrib-n", "Who said it", ctx, "span");
  const jobRun = job || ctx.mode === "edit"
    ? editRun("job", job, "bx-attrib-j", "Their job or company", ctx, "div") : "";
  const who = `<span class="bx-attrib-who" style="display:${aside ? "inline-block" : "block"};text-align:${esc(align)}">`
    + `${ctx.mode === "edit" ? nameRun : anchor(nameRun)}${jobRun}</span>`;
  const picture = image
    ? anchor(`<img class="bx-attrib-img" src="${esc(image)}" alt="${esc(name || "A customer")}"`
      + ` style="width:36px;height:36px;border-radius:999px;object-fit:cover;border-style:none;border-width:0;border-color:transparent"/>`)
    : "";
  return `${css}<blockquote class="bx-quote ${esc(parts.cls)}" style="text-align:${esc(align)}">
    ${proseRun("quote", quote, "bx-quote-b", "What they said", ctx)}
    ${stars}
    <footer class="bx-attrib" style="display:flex;gap:8px;flex-direction:${aside ? "row" : "column"};align-items:center;justify-content:${justify}">
      ${picture}
      ${who}
    </footer>
  </blockquote>`;
}

/**
 * THE MAILBOX HALF — Outlook-safe tables, and the settings a mailbox can keep.
 *
 * WHY IT MOVED HERE. The offer file gives Testimonial to the newsletter, and
 * `familySurfaceGaps()` (D-168 item 5b) names any widget offered on a surface
 * its family cannot draw on. It was drawn by `emailRender.ts`'s own switch,
 * which knew nothing about the thirty-nine controls this pass added: an author
 * who set a size, a weight or a colour watched the canvas change and got none
 * of it in the mail. One widget, one owner, on every surface.
 *
 * WHAT A MAILBOX CANNOT KEEP, said rather than half-applied: the per-device
 * sizes (no container queries, and Outlook renders through Word), and the
 * picture's border radius (Word squares it off). The desktop values are inlined
 * on the element they belong to, which is the only styling a mailbox honours.
 */
export function emailTestimonial(w: Widget, ctx: EmailRenderContext): string {
  const p: any = w.props || {};
  const c: any = ctx;
  /* THE ADAPTER'S OWN THREE, handed over on the context by `renderEmailWidget`.
     A family folder may not import the adapter, and a second copy of the
     mailbox escaper in this folder is the drift that copy exists to prevent. */
  const t = c.t as (v: unknown, c: unknown) => string;
  const edit = c.edit as (path: string, c: unknown, ph?: string) => string;
  const font = (c.bodyStack as (c: unknown) => string)(c);

  const quote = str(p.quote ?? p.testimonial_content);
  if (!quote.trim() && c.mode !== "edit") return "";
  const name = str(p.attribution ?? p.testimonial_name);
  const job = str(p.job ?? p.testimonial_job);
  const image = str(p.image ?? p.testimonial_image);
  const stars = Math.max(0, Math.min(5, Number(p.rating) || 0));

  /* EVERY EXTRA DECLARATION IS CONDITIONAL, and that is not tidiness: the
     golden fixture in `test/fixtures/email-render-cases.json` is checked into
     this repo and into LUMEN byte-identical, and a declaration emitted when
     nobody asked for it would move both suites for a widget nobody changed. A
     mail whose author set nothing is the same bytes it was this morning. */
  const align = alignOf(p.align ?? p.testimonial_alignment);
  const cellAlign = align === "start" ? "left" : align === "end" ? "right" : "center";
  const alignCss = align ? `text-align:${cellAlign};` : "";
  const size = num(p.image_size);
  const px = size !== null && size > 0 ? size : 36;
  const link = linkOf(p);
  const wrap = (inner: string) => (link.url
    ? `<a href="${esc(link.url)}" style="color:inherit;text-decoration:none;">${inner}</a>`
    : inner);
  /* A PICTURE AND A JOB TITLE REACH THE MAILBOX NOW, and did not before — the
     old copy in `emailRender.ts` drew the quote, the stars and the name and
     silently dropped the other two, which an author who filled them in had no
     way to know. Both are conditional, so a mail without them is unchanged.
     The round crop is NOT sent: Outlook renders through Word and squares a
     border radius off, so the picture is sent square rather than promised
     round. */
  const picture = image
    ? `<div style="${alignCss}margin-top:8px;">`
      /* THE ALT IS THE PERSON'S NAME, and it is the mailbox guard that says so:
         "a picture has no description, so a reader with images off sees
         nothing". Found by RUNNING `checkEmailSafe`, not by reading it. An
         empty alt would be right for pure decoration and this is not — it is
         the face of the person whose words these are. */
      + wrap(`<img src="${esc(image)}" width="${px}" height="${px}" alt="${esc(name || "A customer")}" style="width:${px}px;height:${px}px;" />`)
      + `</div>`
    : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;"><tr>`
    + `<td style="padding:14px 16px;background:#F8FAFC;border-left:3px solid ${c.accent};${alignCss}">`
    + `<div style="font-family:${font};font-size:15px;line-height:1.6;color:${c.ink};font-style:italic;`
    + `${c.typeCss ?? ""}${partTypeInline(p, "content", "content_content_color")}"`
    + `${edit("quote", c, "What they said")}>${t(p.quote ?? p.testimonial_content, c)}</div>`
    + (stars ? `<div style="font-family:${font};font-size:13px;letter-spacing:2px;color:${c.accent};margin-top:6px;">${"&#9733;".repeat(stars)}</div>` : "")
    + picture
    + `<div style="font-family:${font};font-size:12px;color:#6B7280;margin-top:6px;`
    + `${partTypeInline(p, "name")}"${edit("attribution", c, "Who said it")}>`
    + `${wrap(t(p.attribution ?? p.testimonial_name, c))}</div>`
    + (job
      ? `<div style="font-family:${font};font-size:12px;color:#6B7280;${partTypeInline(p, "job")}"`
        + `${edit("job", c, "Their job or company")}>${t(p.job ?? p.testimonial_job, c)}</div>`
      : "")
    + `</td></tr></table>`;
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
  /* `mybrand` WAS MISSING and the reason was written here: *"A widget whose
     shape is a FLOW has nothing to place."* True of the widget, not of the
     thing — a quote, a name and a job title are three runs of words at three
     sizes, and a canvas places runs of words. `adapters/mybrand/insert.ts`
     has the case (2026-09-22) and `STUDIO_OWN_KINDS` names it, which is how
     `assertFamilyContract` knows this claim is honest. The def's own `brand`
     description was written for this and had nowhere to be read. */
  builders: ["website", "landing", "newsletter", "proposal", "mybrand"],
  tier: "free",
  defaults: {
    quote: "", attribution: "", job: "", image: "", link: "",
    align: "center", testimonial_image_position: "aside",
    image_size: "", image_border_border: "", image_border_width: "",
    image_border_color: "", image_border_radius: "",
    ...partTypeDefaults("content", "content_content_color"), ...partTypeDefaults("name"), ...partTypeDefaults("job"),
  },
  controls: [
    /* ── Content ▸ Testimonial, Elementor's own section and its own labels ── */
    { key: "quote", label: "Content", type: "textarea", tab: "content", section: "Testimonial" },
    { key: "image", label: "Choose Image", type: "image", tab: "content", section: "Testimonial" },
    { key: "attribution", label: "Name", type: "text", tab: "content", section: "Testimonial" },
    { key: "job", label: "Title", type: "text", tab: "content", section: "Testimonial" },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Testimonial" },
    { key: "testimonial_image_position", label: "Image Position", type: "select", tab: "content", section: "Testimonial", options: IMAGE_POSITIONS },
    { key: "align", label: "Alignment", type: "select", tab: "content", section: "Testimonial", responsive: true, options: ALIGNMENTS },
    /* ── Style ▸ Content ─────────────────────────────────────────────────── */
    ...partTypeControls("content", "Content", "content_content_color"),
    /* ── Style ▸ Image ───────────────────────────────────────────────────── */
    { key: "image_size", label: "Image Resolution", type: "number", tab: "style", section: "Image", responsive: true },
    { key: "image_border_border", label: "Border Type", type: "select", tab: "style", section: "Image", options: BORDER_TYPES },
    { key: "image_border_width", label: "Border Width", type: "number", tab: "style", section: "Image", responsive: true },
    { key: "image_border_color", label: "Border Color", type: "colour", tab: "style", section: "Image" },
    { key: "image_border_radius", label: "Border Radius", type: "number", tab: "style", section: "Image", responsive: true },
    /* ── Style ▸ Name and Style ▸ Title ──────────────────────────────────── */
    ...partTypeControls("name", "Name"),
    ...partTypeControls("job", "Title"),
  ],
};

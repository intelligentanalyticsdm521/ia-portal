/**
 * f1-words/readMore.ts — Elementor's **Read More**.
 *
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json` → `read-more`: title "Read
 * More", group `general`, icon `eicon-post-excerpt`, ONE panel section called
 * "Read More" holding an informational alert (`theme_support`) and one text
 * control, `link_text`, labelled "Read More Text" and defaulting to
 * "Continue reading".
 *
 * ── WHY IT IS HERE AT ALL ─────────────────────────────────────────────────
 * `BUILDER_FULL_WIDGET_PLAN_2026-09-19` §A row 8 marks it `n/a` — "WordPress
 * archive concept; no meaning off WordPress". `BUILDER_OFFERS_2026-09-19.json`
 * lists `read-more` under `website.elementor_free`, and the offer file wins
 * where the two disagree. So it is built, and it is offered on the WEBSITE and
 * nowhere else, because a proposal, an email and a social graphic have no
 * archive listing to be cut off in.
 *
 * ── WHAT IT DRAWS ─────────────────────────────────────────────────────────
 * It is a MARKER, not a button. On the published post it is the point where a
 * blog listing stops and links through; there is nothing to see on the page
 * itself, so the customer's copy draws nothing at all rather than an empty
 * wrapper. On the canvas the author needs to SEE where the cut is, so the
 * editing mode draws a labelled dashed rule — the same choice `menu_anchor`
 * makes for the same reason.
 *
 * No JavaScript, on the canvas or on the published page.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, pictureFrom } from "../../../pictures";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));

/** Elementor's own default, so a dropped widget reads the way Elementor's does. */
export const READ_MORE_DEFAULT_TEXT = "Continue reading";

export function readMoreText(props: Record<string, unknown> | undefined | null): string {
  const p: any = props || {};
  const typed = str(p.link_text).trim();
  return typed || READ_MORE_DEFAULT_TEXT;
}

export function renderReadMore(w: Widget, ctx: RenderContext): string {
  const label = readMoreText(w.props);
  if (ctx.mode !== "edit") {
    /* NOTHING on the customer's page. The published post's own listing draws
       the link; a second one here would be two links doing one job. */
    return "";
  }
  return `<div class="bx-read-more" style="display:flex;align-items:center;gap:10px;color:#64748B;font-size:11px">`
    + `<span style="flex:1;border-top:1px dashed #CBD5E1"></span>`
    + `<span data-edit="link_text" data-placeholder="${esc(READ_MORE_DEFAULT_TEXT)}">${esc(label)}</span>`
    + `<span style="flex:1;border-top:1px dashed #CBD5E1"></span>`
    + `</div>`;
}

export const READ_MORE_DEF: FamilyWidgetDef = {
  kind: "read_more",
  label: "Read More",
  description: "Marks where a blog listing cuts this post off. Everything after it shows only on the full post.",
  icon: "ChevronsDown",
  picture: pictureFrom(bar(8, 10, 48) + bar(8, 18, 34)
    + `<path d="M8 28h48" stroke="#CBD5E1" stroke-dasharray="4 3"/>`),
  category: "General",
  builders: ["website"],
  tier: "free",
  defaults: { link_text: READ_MORE_DEFAULT_TEXT },
  controls: [
    {
      key: "link_text",
      label: "Read More Text",
      type: "text",
      tab: "content",
      section: "Read More",
      /* Elementor's `theme_support` control is an ALERT, not a field: it says
         the widget only does its job on a theme that supports the WordPress
         "more" tag. That is a sentence, so it is a sentence here. */
      help: "Your published site shows this on the blog listing. The full post shows everything.",
    },
  ],
};

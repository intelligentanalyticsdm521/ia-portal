/**
 * f1-words/shortcode.ts — Elementor's **Shortcode**.
 *
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json` → `shortcode`: title
 * "Shortcode", group `general`, ONE control in ONE section:
 *
 *   shortcode  (textarea)  "Enter your shortcode"   section "Shortcode"
 *
 * One of one, with Elementor's own label including the way it phrases it. The
 * definition it replaces lived in `widgets/pageOnly.ts` beside F2's, F3's and
 * F4's atoms, which is why F1's first wave could not move it: deleting one
 * widget out of a file four families share is four merge conflicts. With
 * `mergeWidgetDefs` (b168/override) nothing is deleted — the same kind
 * declared here simply takes the old one's place, and the lander's
 * `shadowedLegacyKinds()` prints the leftover.
 *
 * ── THE CANVAS SHOWS THE CODE, NOT A GUESS AT ITS OUTPUT ──────────────────
 * Only the published site can run a shortcode. Drawing what we think it will
 * produce is a lie the author cannot check, so the canvas shows the shortcode
 * itself with one sentence saying where it runs, and the published page gets
 * the code untouched. Elementor's editor does the same thing.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { box, pictureFrom } from "../../../pictures";
import type { FamilyWidgetDef } from "../types";
import { str } from "./words";

export function shortcodeOf(props: Record<string, unknown> | undefined | null): string {
  return str((props as any)?.shortcode).trim();
}

export function renderShortcode(w: Widget, ctx: RenderContext): string {
  const code = shortcodeOf(w.props);
  if (!code) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Paste a shortcode — it runs on the published page.</div>` : "";
  }
  return ctx.mode === "edit"
    ? `<div class="bx-shortcode" style="font-family:ui-monospace,monospace;font-size:11px;background:#F1F5F9;border-radius:6px;padding:8px 10px;color:#475569">${esc(code)}<div class="bx-card-note">This runs on your published page, not here.</div></div>`
    : code;
}

/**
 * A HOSTED LANDING PAGE DRAWS NOTHING, and that is the honest answer.
 *
 * A shortcode is a WordPress page-engine thing. A landing page LUMEN serves has
 * no page engine to run one, so there is nothing it could become — and without
 * this row the page renderer answers instead and puts `[ia_book_now]` in front
 * of a visitor as literal text, which is worse than an empty space.
 *
 * The tile stays on the landing panel, because the offer file offers it and a
 * landing page can also be published to WordPress, where it runs. This is the
 * hosted copy, kept clean. LUMEN's `landingFamilies/f1-words.js` says the same
 * thing on the server.
 */
export function landingShortcode(): string {
  return "";
}

export const SHORTCODE_DEF: FamilyWidgetDef = {
  kind: "shortcode",
  label: "Shortcode",
  description: "Paste a shortcode from another plugin. It runs on your published page.",
  icon: "Braces",
  picture: pictureFrom(box(6, 10, 52, 20) + `<path d="M20 16l-5 4 5 4M44 16l5 4-5 4" stroke="#94A3B8"/>`),
  category: "General",
  /* The offer file gives it to `website.elementor_free` and
     `landing.elementor_free`, and to nobody else. */
  builders: ["website", "landing"],
  tier: "free",
  defaults: { shortcode: "" },
  controls: [
    { key: "shortcode", label: "Enter your shortcode", type: "textarea", tab: "content", section: "Shortcode" },
  ],
};

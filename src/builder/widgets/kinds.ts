/**
 * builder/widgets/kinds.ts — the NAMES of the widgets that live under
 * `widgets/`, and nothing else.
 *
 * This module imports NOTHING. That is its whole job.
 *
 * `render.ts` needs the list while it is still evaluating (RENDERED_KINDS is a
 * top-level const), and the widget modules import `render.ts` for the escaping
 * and merge-filling pipeline. Read the list from `widgets/index.ts` and that
 * cycle becomes a real one: whichever module is entered first, the other is
 * half-built when the list is read — "Cannot access 'ATOM_KINDS' before
 * initialization", found by running the tests rather than by reading them.
 *
 * A module with no imports cannot be half-built, so both sides read it safely.
 * `widgets/index.ts` asserts the list matches the renderers it actually has, so
 * a name here without a renderer, or a renderer without a name, is a test
 * failure and not a widget that silently draws nothing.
 */
export const ATOM_KINDS = [
  /* ── The money atoms (D-156). `card` is what an author types, `catalog_card`
        is one bound to the catalogue, `price_line` is the money. ────────── */
  "card",
  "catalog_card",
  "price_line",
  "totals",

  /* ── Elementor's standard widgets that declare themselves here (D-165).
        The five text-and-layout ones — heading, paragraph, image, button,
        divider, spacer, list, clauses, signature, page_break, data_table — are
        still drawn by the engine's own switch in render.ts; these are the ones
        this pass ADDED, so they arrive with their definition and their renderer
        in one file, which is the rule. ─────────────────────────────────── */
  "icon",
  "icon_box",
  "image_box",  /* `testimonial` is NOT in this list any more: it MOVED to the
     f5-sliders-reviews family (B-168), and this list is the atoms under
     widgets/. Its kind id is unchanged. */
  "star_rating",
  "alert",
  "social_icons",

  /* ── Website and landing only. ──────────────────────────────────────── */
  "video",
  "google_maps",
  "counter",
  "progress_bar",
  "tabs",
  "accordion",
  "toggle",
  "image_carousel",
  "basic_gallery",
  "html",
  "shortcode",
  "menu_anchor",

  /* ── The Intelligent Analytics group. ───────────────────────────────── */
  /* The three RECORD widgets. Their definitions and their renderer live under
     `src/builder/proposal/`, beside the record book they read, and both are
     spread into this folder's one map and the registry's one list — so they
     are named here like everything else that draws.
     `product_cards`, `product_line_items` and `terms` are NOT here: they are
     panel TILES, never on a page and never drawn. */
  "customer",
  "service_location",
  "business_info",
  "ia_posts",  /* `reviews` MOVED to the f5-sliders-reviews family (B-168). */
  "book_now",
  "ia_form",
  "newsletter_signup",
  "hours_location",
  "ia_mega_menu",
  "ia_mobile_menu",
  "ia_oliver_invoice",
  "ia_social_links",
] as const;

export type AtomKind = (typeof ATOM_KINDS)[number];

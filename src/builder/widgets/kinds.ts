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
  "image_box",
  "testimonial",
  "star_rating",
  "alert",
  /* Elementor calls it Social Icons; the STORED id is `social_links`, which
     is what the templates place and both goldens hold. D-168 item 4. */
  "social_links",

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
  /* THE THREE RECORD WIDGETS WERE HERE and are DELETED (D-167). Customer,
     Service Location and Business Info were blocks of facts; one fact is a
     **Custom Field**, which lives in `widgets/families/ia/` and is named by
     that family rather than by this list — the families are the shape the
     widget plan (section C.1) gives every widget from here on.
     `product_cards` and `product_line_items` are not here either: they are
     panel TILES, never on a page and never drawn. */
  "ia_posts",
  "reviews",
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

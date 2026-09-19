/**
 * builder/widgetGroups.ts — WHICH GROUP A WIDGET SITS IN, on the panel.
 *
 * Scope §11.13.1 (D-165), agreed with Brandon 2026-09-19:
 *
 *   "the four groups as accordions in order — Layout / Basic / General /
 *    Intelligent Analytics"
 *
 * ── WHY THIS FILE AND NOT widgetTasks.ts ──────────────────────────────────
 * `widgetTasks.ts` grouped the panel by the JOB — "Customer & property",
 * "Products & services", "Words". That was D-147's answer and it is not
 * Elementor's. The real editor, looked at on 2026-09-19 (WordPress Playground,
 * Elementor 4.2.4), groups by WHAT KIND OF THING a widget is, and the machine
 * catalogue agrees to the letter: `categories: ["basic"]` on Heading,
 * `["general"]` on Icon Box, Container and Grid under Layout.
 *
 * So the grouping changes and the SEARCH does not. `matchesWidgetQuery` and
 * `rank` stay in widgetTasks.ts and are imported here: one search rule on the
 * platform, two things that can be done with its results. A second copy of the
 * matcher is how the pane and the picker start disagreeing about what "price"
 * finds.
 *
 * ── NOTHING FALLS OFF THE PANEL, AND NOTHING FALLS IN SILENTLY ────────────
 * `GROUP_BY_KIND` names every kind the five adapters offer. A kind nobody
 * mapped is still SHOWN — in the last group, because a widget missing from the
 * panel is a widget the author cannot add — and `unmappedKinds()` names it, so
 * the test goes red instead of the screen going quietly wrong. That is the
 * presence guard the memory rule asks for, not a `|| "General"` that hides the
 * hole.
 *
 * Pure: no React, no lucide. `node --test` drives the lot.
 */
import { BUILDER_ADAPTERS, widgetsFor, type BuilderAdapter, type WidgetDef } from "./registry";
import { matchesWidgetQuery, rank } from "./widgetTasks";

/**
 * The groups, in the order the panel draws them.
 *
 * Elementor's own order is Layout, Basic, Pro, General, Site, then the plugin
 * groups. Ours is Layout, Basic, General, then the one plugin group we have —
 * and Pro, on the website builder only, where §11.12's three-state sentence
 * shows it and refuses it on Lite.
 */
export const PANEL_GROUPS = [
  "Layout",
  "Basic",
  "General",
  "Intelligent Analytics",
  "Pro",
] as const;

export type PanelGroup = (typeof PANEL_GROUPS)[number];

/** Where an unmapped kind goes, so it is never lost off the panel. */
export const LAST_GROUP: PanelGroup = "Intelligent Analytics";

/**
 * KIND → GROUP.
 *
 * Elementor's placement wherever the kind has an Elementor twin (the
 * `categories` field of BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json), and
 * "Intelligent Analytics" for everything that reads our database or prints our
 * paperwork. Internal kind ids are UNCHANGED (§11.13's shared vocabulary): a
 * stored document must not churn because a label did.
 */
export const GROUP_BY_KIND: Record<string, PanelGroup> = {
  /* ── Layout ── Elementor: Container, Grid. */
  container: "Layout",
  columns: "Layout",
  grid: "Layout",

  /* ── Basic ── Elementor's Basic panel, to the letter. */
  heading: "Basic",
  paragraph: "Basic",        // labelled "Text Editor"
  image: "Basic",
  video: "Basic",
  button: "Basic",
  divider: "Basic",
  spacer: "Basic",
  icon: "Basic",
  map: "Basic",              // Elementor: Google Maps
  google_maps: "Basic",

  /* ── General ── Elementor's General panel. */
  list: "General",           // labelled "Icon List"
  icon_box: "General",
  image_box: "General",
  testimonial: "General",
  star_rating: "General",
  callout: "General",        // upgrades to `alert`
  alert: "General",
  social_links: "General",   // labelled "Social Icons"
  social_icons: "General",
  counter: "General",
  progress_bar: "General",
  tabs: "General",
  accordion: "General",
  toggle: "General",
  image_carousel: "General",
  gallery: "General",        // Elementor: Basic Gallery
  basic_gallery: "General",
  html: "General",
  shortcode: "General",
  menu_anchor: "General",
  /* The pixel studio's drawing tools. Elementor has no twin for a rotatable
     square, and "a shape you draw" is a general-purpose thing, not one of
     ours — so General, which is where Elementor puts everything it cannot
     call Basic. */
  shape: "General",
  colour_block: "General",
  background: "General",

  /* ── Intelligent Analytics ── everything that reads our database, or is a
     part of our paperwork. */
  card: "Intelligent Analytics",
  catalog_card: "Intelligent Analytics",     // "Product Card"
  product_card: "Intelligent Analytics",     // the newsletter's older composite
  product_cards: "Intelligent Analytics",    // the catalogue picker tile
  price_line: "Intelligent Analytics",       // "Product Line Item"
  product_line_items: "Intelligent Analytics",
  pricing_table: "Intelligent Analytics",
  totals: "Intelligent Analytics",
  address_block: "Intelligent Analytics",
  customer: "Intelligent Analytics",
  service_location: "Intelligent Analytics",
  business_info: "Intelligent Analytics",
  key_fact: "Intelligent Analytics",
  key_value_table: "Intelligent Analytics",
  data_table: "Intelligent Analytics",
  merge_field: "Intelligent Analytics",
  signature: "Intelligent Analytics",
  terms: "Intelligent Analytics",
  clauses: "Intelligent Analytics",
  page_break: "Intelligent Analytics",
  doc_header: "Intelligent Analytics",
  footer_note: "Intelligent Analytics",
  property_plan: "Intelligent Analytics",
  personal_note: "Intelligent Analytics",
  article_card: "Intelligent Analytics",
  ia_posts: "Intelligent Analytics",
  reviews: "Intelligent Analytics",
  book_now: "Intelligent Analytics",
  unsubscribe_footer: "Intelligent Analytics",
  email_footer: "Intelligent Analytics",
  newsletter_signup: "Intelligent Analytics",
  hours_location: "Intelligent Analytics",
  ia_form: "Intelligent Analytics",
  form: "Intelligent Analytics",
  ia_mega_menu: "Intelligent Analytics",
  ia_mobile_menu: "Intelligent Analytics",
  ia_oliver_invoice: "Intelligent Analytics",
  ia_social_links: "Intelligent Analytics",
  countdown: "Intelligent Analytics",
  hero: "Intelligent Analytics",
  brand_logo: "Intelligent Analytics",
  qr_code: "Intelligent Analytics",
  social_handle: "Intelligent Analytics",
  /* The website adapter's ready-made page bands. They are ours — each one
     fills itself from the business's own record. */
  site_hero: "Intelligent Analytics",
  site_services: "Intelligent Analytics",
  site_about: "Intelligent Analytics",
  site_pricing: "Intelligent Analytics",
  site_testimonials: "Intelligent Analytics",
  site_gallery: "Intelligent Analytics",
  site_team: "Intelligent Analytics",
  site_stats: "Intelligent Analytics",
  site_faq: "Intelligent Analytics",
  site_cta: "Intelligent Analytics",
  site_contact: "Intelligent Analytics",
  site_content: "Intelligent Analytics",
  site_custom: "Intelligent Analytics",
  logo_strip: "Intelligent Analytics",
};

/** The group this widget sits in. */
export function groupFor(w: Pick<WidgetDef, "kind">): PanelGroup {
  return GROUP_BY_KIND[w.kind] ?? LAST_GROUP;
}

/**
 * Every kind an adapter offers that nobody placed.
 *
 * The presence guard. A kind here is still drawn on the panel — losing it
 * would be worse — but the test names it, so a new widget cannot arrive in the
 * wrong group without somebody being told.
 */
export function unmappedKinds(): string[] {
  const out = new Set<string>();
  for (const a of BUILDER_ADAPTERS) {
    for (const w of widgetsFor(a)) if (!GROUP_BY_KIND[w.kind]) out.add(w.kind);
  }
  return [...out].sort();
}

export interface PanelGroupList {
  group: PanelGroup;
  widgets: WidgetDef[];
}

/**
 * The panel's groups for this builder, filtered by the search box.
 *
 * Empty groups are dropped — an accordion with nothing behind it is a door
 * onto a wall. Order is PANEL_GROUPS' order and never the registry's.
 */
export function panelGroups(adapter: BuilderAdapter, query = ""): PanelGroupList[] {
  const pool = widgetsFor(adapter).filter((w) => matchesWidgetQuery(w, query, adapter));
  return PANEL_GROUPS
    .map((group) => ({ group, widgets: byRelevance(pool.filter((w) => groupFor(w) === group), query, adapter) }))
    .filter((g) => g.widgets.length > 0);
}

/** Best first when something was typed; registry order when nothing was. */
function byRelevance(list: WidgetDef[], query: string, adapter?: BuilderAdapter): WidgetDef[] {
  if (!String(query || "").trim()) return list;
  return list
    .map((w, i) => ({ w, i, r: rank(w, query, adapter) }))
    .sort((a, b) => (b.r - a.r) || (a.i - b.i))
    .map((x) => x.w);
}

/**
 * Which accordions start open.
 *
 * Elementor opens the first group and leaves the rest shut. With a search
 * running, every group that matched is open — a person who typed "price" is
 * not then going to click three headings to find out where it went.
 */
export function openGroups(groups: PanelGroupList[], query: string): PanelGroup[] {
  if (String(query || "").trim()) return groups.map((g) => g.group);
  return groups.length ? [groups[0].group] : [];
}

/** Every widget the query matches, best first — what Enter picks. */
export function flatPanelMatches(adapter: BuilderAdapter, query = ""): WidgetDef[] {
  return byRelevance(panelGroups(adapter, query).flatMap((g) => g.widgets), query, adapter);
}

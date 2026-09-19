/**
 * builder/widgets/index.ts — THE WIDGETS THAT DECLARE THEMSELVES, collected.
 *
 * D-156 set the rule and D-165 widened it: each widget under this folder is one
 * file holding everything about it — what it is called, which group it sits in,
 * what it can be set to, and how it draws. This module is the only thing that
 * knows they exist as a SET: `registry.ts` spreads `ATOM_WIDGET_DEFS` into the
 * one vocabulary and `render.ts` asks `renderAtom` before its own switch.
 *
 * ── WHY THE DEFINITION LIVES WITH THE RENDERER ────────────────────────────
 * Before this, a widget was a registry entry in one file and a `case` in a
 * 1500-line switch in another, and the parity test in builder-engine exists
 * because the two drifted. Keeping them in one file is the fix the test was
 * written to ask for; the registry still holds the ONE list, it just does not
 * hold every field of it any more.
 *
 * ── THE ORDER OF THIS LIST IS THE ORDER OF THE PANEL ──────────────────────
 * §11.13.1: the left panel is Elementor's, groups Layout / Basic / General /
 * Intelligent Analytics, and inside a group the tiles are in Elementor's own
 * registration order. `registry.ts` sorts by group; WITHIN a group the order is
 * the order these definitions are spread, so this list is read top to bottom as
 * Basic, then General, then Intelligent Analytics, matching
 * `test/fixtures/elementor-widget-names.json`.
 *
 * ── THE IMPORT CYCLE, DELIBERATELY ────────────────────────────────────────
 * render.ts imports this module and these modules import `esc` / `t` / `paras`
 * from render.ts. That is a cycle, and it is safe because every binding
 * crossing it is a hoisted `function` declaration used at CALL time, never a
 * `const` read while a module is still evaluating. The alternative was a
 * second escaping-and-merge-filling pipeline, which is the thing that goes
 * wrong silently.
 */
import type { Widget } from "../model";
import type { RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { ATOM_KINDS as NAMES } from "./kinds";

import { CARD_DEF, renderCard } from "./card";
import { CATALOG_CARD_DEF, renderCatalogCard } from "./productCard";
import { PRICE_LINE_DEF, renderPriceLine } from "./priceLine";
import { NO_BUSINESS_RATE_SENTENCE, TOTALS_DEF, renderTotals } from "./totals";
import { HTML_DEF, renderHtml } from "./html";
import {
  ICON_BOX_DEF, ICON_DEF, SOCIAL_ICONS_DEF, STAR_RATING_DEF,
  renderIcon, renderIconBox, renderSocialIcons, renderStarRating,
} from "./icons";
import {
  ALERT_DEF, IMAGE_BOX_DEF, TESTIMONIAL_DEF,
  renderAlert, renderImageBox, renderTestimonial,
} from "./boxes";
import {
  ACCORDION_DEF, BASIC_GALLERY_DEF, COUNTER_DEF, GOOGLE_MAPS_DEF, IMAGE_CAROUSEL_DEF,
  MENU_ANCHOR_DEF, PROGRESS_BAR_DEF, SHORTCODE_DEF, TABS_DEF, TOGGLE_DEF, VIDEO_DEF,
  renderAccordion, renderBasicGallery, renderCounter, renderGoogleMaps, renderImageCarousel,
  renderMenuAnchor, renderProgressBar, renderShortcode, renderTabs, renderToggle, renderVideo,
} from "./pageOnly";
import {
  BUSINESS_INFO_DEF, CUSTOMER_DEF, SERVICE_LOCATION_DEF,
  renderBusinessInfo, renderCustomer, renderServiceLocation,
} from "./iaData";
import {
  BOOK_NOW_DEF, HOURS_LOCATION_DEF, IA_FORM_DEF, IA_MEGA_MENU_DEF, IA_MOBILE_MENU_DEF,
  IA_OLIVER_INVOICE_DEF, IA_POSTS_DEF, IA_SOCIAL_LINKS_DEF, NEWSLETTER_SIGNUP_DEF,
  PRODUCT_CARDS_DEF, PRODUCT_LINE_ITEMS_DEF, REVIEWS_DEF,
  renderBookNow, renderHoursLocation, renderIaForm, renderIaMegaMenu, renderIaMobileMenu,
  renderIaOliverInvoice, renderIaPosts, renderIaSocialLinks, renderNewsletterSignup,
  renderProductCards, renderProductLineItems, renderReviews,
} from "./iaBlocks";

/** Every widget declared under this folder, in PANEL ORDER within its group. */
export const ATOM_WIDGET_DEFS: WidgetDef[] = [
  /* Basic — Elementor's registration order for the group, minus the four the
     engine still declares in registry.ts (Heading, Image, Text Editor, Button,
     Divider, Spacer). Video, Google Maps and Icon are the rest of it. */
  VIDEO_DEF, GOOGLE_MAPS_DEF, ICON_DEF,

  /* General — Elementor's registration order, exactly: Image Box, Icon Box,
     Star Rating, Image Carousel, Basic Gallery, [Icon List — the engine's
     `list`], Counter, Progress Bar, Testimonial, Tabs, Accordion, Toggle,
     Social Icons, Alert, Shortcode, HTML, Menu Anchor. */
  IMAGE_BOX_DEF, ICON_BOX_DEF, STAR_RATING_DEF, IMAGE_CAROUSEL_DEF, BASIC_GALLERY_DEF,
  COUNTER_DEF, PROGRESS_BAR_DEF, TESTIMONIAL_DEF, TABS_DEF, ACCORDION_DEF, TOGGLE_DEF,
  SOCIAL_ICONS_DEF, ALERT_DEF, SHORTCODE_DEF, HTML_DEF, MENU_ANCHOR_DEF,

  /* Intelligent Analytics — §11.13.3's own order, per builder. The proposal's
     nine first, then the email's, then the pages'. */
  PRODUCT_CARDS_DEF, PRODUCT_LINE_ITEMS_DEF, TOTALS_DEF, CARD_DEF, CATALOG_CARD_DEF, PRICE_LINE_DEF,
  CUSTOMER_DEF, SERVICE_LOCATION_DEF, BUSINESS_INFO_DEF,
  IA_POSTS_DEF, REVIEWS_DEF, BOOK_NOW_DEF,
  IA_FORM_DEF, NEWSLETTER_SIGNUP_DEF, HOURS_LOCATION_DEF,
  IA_MEGA_MENU_DEF, IA_MOBILE_MENU_DEF, IA_OLIVER_INVOICE_DEF, IA_SOCIAL_LINKS_DEF,
];

type Renderer = (w: Widget, ctx: RenderContext) => string;

const RENDERERS: Record<string, Renderer> = {
  card: renderCard,
  catalog_card: renderCatalogCard,
  price_line: renderPriceLine,
  /* `priced_line` is what `price_line` was called, and §11.12 folds one into
     the other. ONE renderer, two spellings: `upgrade.ts` renames the kind on
     every read path, and this is what draws a line that reached a page without
     passing through it. Not in `ATOM_KINDS`, because it is not a widget
     anything OFFERS any more — only one the renderer still understands. */
  priced_line: renderPriceLine,
  totals: renderTotals,
  html: renderHtml,

  icon: renderIcon,
  icon_box: renderIconBox,
  image_box: renderImageBox,
  testimonial: renderTestimonial,
  star_rating: renderStarRating,
  alert: renderAlert,
  social_icons: renderSocialIcons,

  video: renderVideo,
  google_maps: renderGoogleMaps,
  counter: renderCounter,
  progress_bar: renderProgressBar,
  tabs: renderTabs,
  accordion: renderAccordion,
  toggle: renderToggle,
  image_carousel: renderImageCarousel,
  basic_gallery: renderBasicGallery,
  shortcode: renderShortcode,
  menu_anchor: renderMenuAnchor,

  customer: renderCustomer,
  service_location: renderServiceLocation,
  business_info: renderBusinessInfo,
  product_cards: renderProductCards,
  product_line_items: renderProductLineItems,
  ia_posts: renderIaPosts,
  reviews: renderReviews,
  book_now: renderBookNow,
  ia_form: renderIaForm,
  newsletter_signup: renderNewsletterSignup,
  hours_location: renderHoursLocation,
  ia_mega_menu: renderIaMegaMenu,
  ia_mobile_menu: renderIaMobileMenu,
  ia_oliver_invoice: renderIaOliverInvoice,
  ia_social_links: renderIaSocialLinks,
};

/** The kinds that actually have a renderer here. */
export const RENDERED_ATOM_KINDS: string[] = Object.keys(RENDERERS);

export { ATOM_KINDS, type AtomKind } from "./kinds";

/** Draw one, or null when it is not ours and the engine should try. */
export function renderAtom(w: Widget, ctx: RenderContext): string | null {
  const fn = RENDERERS[w.kind];
  return fn ? fn(w, ctx) : null;
}

/** Every kind this module draws, offered or merely understood. */
export const ATOM_RENDERED_KINDS: readonly string[] = Object.keys(RENDERERS);

/* The names, the renderers and the definitions are three lists of the same
   set, and a widget that is in two of them is a widget that draws nothing or
   is offered nowhere. Asserted rather than assumed — see the test. */
export function atomKindsAgree(): { onlyNamed: string[]; onlyRendered: string[]; onlyDefined: string[] } {
  const named = new Set<string>(NAMES);
  // `priced_line` is understood but never offered — see the map.
  const rendered = new Set(Object.keys(RENDERERS).filter((k) => k !== "priced_line"));
  const defined = new Set(ATOM_WIDGET_DEFS.map((d) => d.kind));
  return {
    onlyNamed: [...named].filter((k) => !rendered.has(k) || !defined.has(k)),
    onlyRendered: [...rendered].filter((k) => !named.has(k)),
    onlyDefined: [...defined].filter((k) => !named.has(k)),
  };
}

export * from "./tag";
export {
  CURRENCY_SYMBOLS, bulletsKey, cardFields, currencyGlyph, featureItem, featurePath,
  featureText, featureTexts, priceWithoutSymbol,
  type CardFields,
} from "./card";
export {
  bindingOf, findInCatalogue, resolveCatalogCard, snapshotFrom, snapshotToCardProps,
  type CatalogBinding, type CatalogSnapshot, type ResolvedCatalogCard,
} from "./productCard";
export { priceLineFields, priceLineUnitNote, priceLinePropsFromCatalogue } from "./priceLine";
/* `addressFields` and `locationAddress` moved from the deleted
   `addressBlock.ts` to `iaData.ts` with the widget itself; the NAMES are kept
   because `proposalDoc.ts` belongs to another stream and reads them. */
export { addressFields, customerFields, locationAddress, type LocationFields } from "./iaData";
export { htmlBody, htmlOf } from "./html";
export { NO_BUSINESS_RATE_SENTENCE } from "./totals";
/* D-165 — the two PANEL TILES and the one function that expands them. */
export {
  PANEL_TILES, expandPanelTile, isPanelTile, type CataloguePick, type PanelTile,
} from "./iaBlocks";
export { ALERT_TYPES } from "./boxes";
export { DEFAULT_ICON, ICON_CHOICES, ICON_OPTIONS, glyphFor, iconValue, type IconValue } from "./glyph";
export { SOCIAL_NETWORKS } from "./icons";
export { videoEmbed } from "./pageOnly";
/* THE SHARED BINDING SECTION (catalogue F.2), for every surface that reads a
   bound widget. One module, re-exported here like every other widget's own. */
export {
  BINDING_CONTROLS, BOUND_KINDS, ON_EMPTY_CHOICES, PUT_IT_BACK, REFRESH_MODES, TYPED_NOT_LIVE,
  bindingDefaults, bindingSettings, freezeOnSend, isBound, isPinned, onEmptyOf,
  overriddenFields, putItBackProps, refreshModeOf, selectionOf, selectionProps,
  type BindingSettings, type IaSelection, type IaSource, type OnEmpty, type RefreshMode,
} from "./binding";

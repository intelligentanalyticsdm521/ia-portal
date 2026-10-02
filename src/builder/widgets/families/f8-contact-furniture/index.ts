/**
 * families/f8-contact-furniture/index.ts - CONTACT AND SITE FURNITURE.
 *
 * Everything that either captures a person's details or sits at the edge of
 * the page. This index is the only thing that knows them as a SET; nothing in
 * here ever opens registry.ts, render.ts or another family's folder, which is
 * what makes ten agents on ten families safe.
 *
 * -- WHAT THIS FOLDER OFFERS ------------------------------------------------
 *   google_maps        Elementor **Google Maps**    website, landing   (free)
 *   form               Elementor **Form**           website, landing   (Pro)
 *   login              Elementor **Login**          website            (Pro)
 *   nav_menu           Elementor **WordPress Menu** website            (Pro)
 *   book_now           IA twin of **Button**        website, landing, newsletter
 *   ia_social_links    IA twin of **Social Icons**  website, landing
 *   ia_mega_menu       IA plugin widget             website
 *   ia_mobile_menu     IA plugin widget             website
 *   ia_oliver_invoice  IA plugin widget             website
 *
 * -- WAVE 1 BUILT THREE; WAVE 2 DEEPENED THE REST --------------------------
 * `login` and `nav_menu` were written on 2026-09-19 from the 2026-09-17 Pro
 * scrape. `form` was written the same day and HELD BACK, because `registry.ts`
 * still declared a legacy `form` and two definitions of one kind broke
 * "kinds are unique" AND left the Inspector drawing the old one.
 *
 * **b168/override settled that, and the hold is over.** `mergeWidgetDefs`
 * de-duplicates `WIDGETS` by kind with the FAMILY winning, in the legacy
 * entry's place, so a family definition REPLACES an older one of the same kind
 * rather than doubling it. `shadowedLegacyKinds()` prints what the lander can
 * then delete, and deleting it changes nothing at run time.
 *
 * That is what unlocked the other six as well. Every one of them existed and
 * was THIN — `google_maps` had three controls and no Style tab, `book_now` had
 * three, and the three IA plugin widgets had `defaults: {}` and `controls: []`,
 * a tile with an empty panel drawing a dashed grey box on the canvas and
 * NOTHING on the published page. Each file below keeps its own `kind`, reads
 * every prop the old definition stored, and carries what Elementor (or, for the
 * three plugin widgets, the plugin's own registration) actually carries.
 *
 * -- THE OLD DECLARATIONS ARE THE LANDER'S TO DELETE -----------------------
 *   src/builder/widgets/pageOnly.ts   GOOGLE_MAPS_DEF, renderGoogleMaps
 *   src/builder/widgets/iaBlocks.ts   BOOK_NOW_DEF, IA_MEGA_MENU_DEF,
 *                                     IA_MOBILE_MENU_DEF, IA_OLIVER_INVOICE_DEF,
 *                                     IA_SOCIAL_LINKS_DEF and their renderers
 *   src/builder/registry.ts           the hidden `form` definition
 * They are SHADOWED today, which means they are already unreachable; the test
 * `f8: which of this family's kinds are still shadowed by an older declaration`
 * names them and stays green until they go.
 *
 * -- WHAT IS STILL NOT HERE, AND WHY ---------------------------------------
 *   ia_form   still in `widgets/iaBlocks.ts`. It is the twin of Elementor's
 *             Form, and its PUBLISHED form is a plugin SHORTCODE whose only
 *             setting is the shortcode string — so a Style tab on it would be
 *             controls that move the canvas and reach no live page. Deepening
 *             it honestly needs the plugin's own shortcode attributes, which
 *             nobody here may invent. In the handoff.
 *   mega-menu Elementor's Pro widget titled "Menu". Both 2026-09-17 scrapes
 *             register it with `sections: []` and `controls: {}`; the Pro
 *             scrape does not carry it at all. Needs one fresh scrape.
 *
 * -- WHAT MAY BE ADDED HERE ------------------------------------------------
 * An ELEMENTOR widget, by Elementor's own name, group, icon, panel sections,
 * control labels and defaults - or an IA widget named in
 * test/fixtures/BUILDER_OFFERS_2026-09-19.json. Nothing else, ever. If you
 * think something is missing, write it in the handoff; do not build it.
 * test/builder-offers.test.mjs fails the build on an extra tile.
 *
 * -- HOW TO ADD ONE --------------------------------------------------------
 *   1. f8-contact-furniture/<widget>.ts exports <WIDGET>_DEF: FamilyWidgetDef and
 *      render<Widget>(w, ctx): string.
 *   2. import both here; the def goes in `defs`, the renderer in `renderers`
 *      under the def's own `kind`.
 *   3. npm test -- test/families-f8-contact-furniture.test.mjs
 */
import type { Family } from "../types";

import { BOOK_NOW_DEF, emailBookNow, renderBookNow } from "./bookNow";
import { FORM_DEF, renderForm } from "./form";
import { GOOGLE_MAPS_DEF, renderGoogleMaps } from "./googleMaps";
import { IA_MEGA_MENU_DEF, renderIaMegaMenu } from "./iaMegaMenu";
import { IA_MOBILE_MENU_DEF, renderIaMobileMenu } from "./iaMobileMenu";
import { IA_OLIVER_INVOICE_DEF, renderIaOliverInvoice } from "./iaOliverInvoice";
import { IA_SOCIAL_LINKS_DEF, renderIaSocialLinks } from "./iaSocialLinks";
import { LOGIN_DEF, renderLogin } from "./login";
import { NAV_MENU_DEF, renderNavMenu } from "./navMenu";

export const FAMILY: Family = {
  /* Elementor's own panel order does the placing now (`registry.panelAt`, which
     reads `elementor-panel.json` BY LABEL), so this list is read order and not
     tile order. Google Maps is Basic; Form, Login and WordPress Menu are Pro;
     the four IA ones are Intelligent Analytics. */
  defs: [
    GOOGLE_MAPS_DEF,
    FORM_DEF, LOGIN_DEF, NAV_MENU_DEF,
    BOOK_NOW_DEF, IA_SOCIAL_LINKS_DEF,
    IA_MEGA_MENU_DEF, IA_MOBILE_MENU_DEF, IA_OLIVER_INVOICE_DEF,
  ],
  renderers: {
    [GOOGLE_MAPS_DEF.kind]: renderGoogleMaps,
    [FORM_DEF.kind]: renderForm,
    [LOGIN_DEF.kind]: renderLogin,
    [NAV_MENU_DEF.kind]: renderNavMenu,
    [BOOK_NOW_DEF.kind]: renderBookNow,
    [IA_SOCIAL_LINKS_DEF.kind]: renderIaSocialLinks,
    [IA_MEGA_MENU_DEF.kind]: renderIaMegaMenu,
    [IA_MOBILE_MENU_DEF.kind]: renderIaMobileMenu,
    [IA_OLIVER_INVOICE_DEF.kind]: renderIaOliverInvoice,
  },
  /* The mailbox half. Only Book Now is offered on a newsletter panel, so it is
     the only one with a table-and-inline-styles renderer; a family that wrote
     one for a widget no newsletter offers would be code nothing reaches. */
  emailRenderers: {
    [BOOK_NOW_DEF.kind]: emailBookNow,
  },
};

export {
  BOOK_NOW_DEF, FORM_DEF, GOOGLE_MAPS_DEF, IA_MEGA_MENU_DEF, IA_MOBILE_MENU_DEF,
  IA_OLIVER_INVOICE_DEF, IA_SOCIAL_LINKS_DEF, LOGIN_DEF, NAV_MENU_DEF,
};
export {
  emailBookNow, renderBookNow, renderForm, renderGoogleMaps, renderIaMegaMenu,
  renderIaMobileMenu, renderIaOliverInvoice, renderIaSocialLinks, renderLogin, renderNavMenu,
};

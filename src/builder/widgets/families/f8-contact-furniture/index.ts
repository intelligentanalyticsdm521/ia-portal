/**
 * families/f8-contact-furniture/index.ts - CONTACT AND SITE FURNITURE.
 *
 * Everything that either captures a person's details or sits at the edge of
 * the page. This index is the only thing that knows them as a SET; nothing in
 * here ever opens registry.ts, render.ts or another family's folder, which is
 * what makes ten agents on ten families safe.
 *
 * -- WHAT THIS FOLDER OFFERS TODAY -----------------------------------------
 *   login      Elementor **Login**           website   (Pro)
 *   nav_menu   Elementor **WordPress Menu**  website   (Pro)
 *
 * -- AND ONE THAT IS BUILT AND HELD BACK, BY ONE DELETE --------------------
 *   form       Elementor **Form**            website, landing   (Pro)
 *
 * `form.ts` is finished — definition, controls, renderer, tests — and its
 * PUBLISHING half is already live in
 * `arion-api/lib/websiteBuilder/families/f8-contact-furniture/emitters.js`.
 * It is deliberately NOT in `defs` below, for a reason that is mechanical and
 * not a preference: **`registry.ts` still declares a legacy `form`**, and
 * `builder-registry.test.mjs`'s "kinds are unique" is a real invariant, not an
 * expectation. Two definitions of one kind also means `WIDGETS_BY_KIND` — built
 * with `Object.fromEntries`, families spread FIRST — resolves to the legacy
 * one, so the Inspector would draw ITS controls (a `list` and a `text`, neither
 * of which the panel draws) and the author would get a Form tile with an empty
 * panel.
 *
 * ONE delete unlocks it: remove the `hidden: true` `form` definition from
 * `registry.ts`, then put `FORM_DEF` in `defs` and `renderForm` in `renderers`
 * here. `test/families-f8-contact-furniture.test.mjs` watches for that delete
 * and goes RED the moment it lands, saying exactly this. It is the first line
 * of "Land: delete these" in D168_HANDOFF_2026-09-19.md.
 *
 * -- WHAT IS NOT IN HERE, AND WHY ------------------------------------------
 * Every other F8 widget the offer lists is already on the panel and already
 * works, declared where D-165 left it:
 *
 *   google_maps                       src/builder/widgets/pageOnly.ts
 *   ia_form, book_now, ia_mega_menu,  src/builder/widgets/iaBlocks.ts
 *   ia_mobile_menu, ia_social_links,
 *   ia_oliver_invoice
 *
 * They are NOT copied in here, for the same mechanical reason as `form` and one
 * worse: their old declarations are VISIBLE, so a family copy would put a
 * second tile on the panel as well as losing the Inspector. A widget moves into
 * a family folder in the same pass its old declaration is deleted, and that
 * delete is the lander's.
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

import { FORM_DEF, renderForm } from "./form";
import { LOGIN_DEF, renderLogin } from "./login";
import { NAV_MENU_DEF, renderNavMenu } from "./navMenu";

export const FAMILY: Family = {
  /* Elementor's own panel order inside a group: Form, Login, WordPress Menu —
     the order the 2026-09-17 registration scrape lists them in. FORM_DEF slots
     in first the day registry.ts's legacy `form` is deleted; see the header. */
  defs: [LOGIN_DEF, NAV_MENU_DEF],
  renderers: {
    [LOGIN_DEF.kind]: renderLogin,
    [NAV_MENU_DEF.kind]: renderNavMenu,
  },
};

export { FORM_DEF, LOGIN_DEF, NAV_MENU_DEF };
export { renderForm, renderLogin, renderNavMenu };

/**
 * families/f3-buttons-icons-panels/index.ts - BUTTONS, ICONS AND PANELS.
 *
 * button, icon, icon-box, icon-list, social-icons, share-buttons,
 * call-to-action, flip-box, alert, divider, spacer, facebook-embed,
 * facebook-page. All share the icon picker and the link control.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 section C.1: one widget, one file in
 * this folder; this index is the only thing that knows them as a SET. Nothing
 * in here ever opens registry.ts, render.ts or another family's folder, which
 * is what makes ten agents on ten families safe.
 *
 * ── WHAT IS HERE, AND WHAT IS STILL IN THE OLD REGISTRY ───────────────────
 * FIVE of the thirteen had nothing at all: Share Buttons, Call to Action, Flip
 * Box, Facebook Embed and Facebook Page. They are the family's whole gap
 * against `BUILDER_OFFERS_2026-09-19.json` and they are what this folder holds.
 *
 * The other eight ALREADY EXIST and are offered today — `button`, `divider`,
 * `spacer` and `list` (Icon List) in `registry.ts`; `icon`, `icon_box` and
 * `social_icons` in `widgets/icons.ts`; `alert` in `widgets/boxes.ts`. They
 * were NOT copied in here. A copy would be a SECOND definition of a kind that
 * already has one, and `test/builder-registry.test.mjs` says in one line why
 * that cannot ship: *"kinds are unique — two widgets share a kind"*. Moving
 * them properly means deleting the old one in the same pass (replace means
 * delete), and both of those files are outside this family's folder. So the
 * move is written up for the lander in `D168_HANDOFF_2026-09-19.md` under
 * "Land: move these", with the file and line of each old copy, rather than
 * half-done here.
 *
 * -- WHAT MAY BE ADDED HERE ------------------------------------------------
 * An ELEMENTOR widget, by Elementor's own name, group, icon, panel sections,
 * control labels and defaults - or an IA widget named in
 * test/fixtures/BUILDER_OFFERS_2026-09-19.json. Nothing else, ever. If you
 * think something is missing, write it in the handoff; do not build it.
 * test/builder-offers.test.mjs fails the build on an extra tile.
 *
 * -- HOW TO ADD ONE --------------------------------------------------------
 *   1. f3-buttons-icons-panels/<widget>.ts exports <WIDGET>_DEF: FamilyWidgetDef and
 *      render<Widget>(w, ctx): string.
 *   2. import both here; the def goes in `defs`, the renderer in `renderers`
 *      under the def's own `kind`.
 *   3. npm test -- test/families-f3-buttons-icons-panels.test.mjs
 */
import type { Family } from "../types";

import { SHARE_BUTTONS_DEF, renderShareButtons } from "./shareButtons";
import { CALL_TO_ACTION_DEF, renderCallToAction } from "./callToAction";
import { FLIP_BOX_DEF, renderFlipBox } from "./flipBox";
import { FACEBOOK_EMBED_DEF, renderFacebookEmbed } from "./facebookEmbed";
import { FACEBOOK_PAGE_DEF, renderFacebookPage } from "./facebookPage";

export const FAMILY: Family = {
  /* Elementor draws its Pro group after Basic and General, and these five are
     all Pro, so this order is the order the panel reads them in. */
  defs: [
    SHARE_BUTTONS_DEF,
    CALL_TO_ACTION_DEF,
    FLIP_BOX_DEF,
    FACEBOOK_EMBED_DEF,
    FACEBOOK_PAGE_DEF,
  ],
  renderers: {
    [SHARE_BUTTONS_DEF.kind]: renderShareButtons,
    [CALL_TO_ACTION_DEF.kind]: renderCallToAction,
    [FLIP_BOX_DEF.kind]: renderFlipBox,
    [FACEBOOK_EMBED_DEF.kind]: renderFacebookEmbed,
    [FACEBOOK_PAGE_DEF.kind]: renderFacebookPage,
  },
};

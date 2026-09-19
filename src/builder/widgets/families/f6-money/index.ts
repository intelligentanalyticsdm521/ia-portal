/**
 * families/f6-money/index.ts - MONEY.
 *
 * price-table, price-list, product cards, product line items, totals, IA
 * OLIVER Invoice. All read the OLIVER catalogue and all touch tax, discount
 * and cadence. Nobody else may.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 section C.1: one widget, one file in
 * this folder; this index is the only thing that knows them as a SET. Nothing
 * in here ever opens registry.ts, render.ts or another family's folder, which
 * is what makes ten agents on ten families safe.
 *
 * -- WHAT MAY BE ADDED HERE ------------------------------------------------
 * An ELEMENTOR widget, by Elementor's own name, group, icon, panel sections,
 * control labels and defaults - or an IA widget named in
 * test/fixtures/BUILDER_OFFERS_2026-09-19.json. Nothing else, ever. If you
 * think something is missing, write it in the handoff; do not build it.
 * test/builder-offers.test.mjs fails the build on an extra tile.
 *
 * -- HOW TO ADD ONE --------------------------------------------------------
 *   1. f6-money/<widget>.ts exports <WIDGET>_DEF: FamilyWidgetDef and
 *      render<Widget>(w, ctx): string.
 *   2. import both here; the def goes in `defs`, the renderer in `renderers`
 *      under the def's own `kind`.
 *   3. npm test -- test/families-f6-money.test.mjs
 */
import { type Family } from "../types";
import { PRICE_TABLE_DEF, renderPriceTable } from "./priceTable";
import { PRICE_LIST_DEF, renderPriceList } from "./priceList";
import { PAYPAL_BUTTON_DEF, STRIPE_BUTTON_DEF, renderPayButton } from "./payButtons";

/**
 * WHAT IS HERE, AND WHAT IS DELIBERATELY NOT.
 *
 * Here: Elementor's four money widgets, by Elementor's own names —
 * **Price Table**, **Price List**, **PayPal Button**, **Stripe Button**.
 *
 * NOT here, and not this agent's to build: the IA twins **Product Cards**,
 * **Product Line Items** and **Totals**. They are database twins of Price
 * Table / Call to Action and Price List, they live in `families/ia`, and the
 * demo agent owns them. They use the SAME Elementor control names these four
 * use, so the twin and the original look and behave alike — which is the whole
 * point of a twin.
 */
export const FAMILY: Family = {
  defs: [PRICE_TABLE_DEF, PRICE_LIST_DEF, PAYPAL_BUTTON_DEF, STRIPE_BUTTON_DEF],
  renderers: {
    [PRICE_TABLE_DEF.kind]: renderPriceTable,
    [PRICE_LIST_DEF.kind]: renderPriceList,
    /* ONE renderer, two kinds — see payButtons.ts. */
    [PAYPAL_BUTTON_DEF.kind]: renderPayButton,
    [STRIPE_BUTTON_DEF.kind]: renderPayButton,
  },
};

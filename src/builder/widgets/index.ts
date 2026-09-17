/**
 * builder/widgets/index.ts — THE ATOMIC WIDGETS, collected.
 *
 * D-156. Each widget under this folder is one file holding everything about
 * it: what it is called, what it can be set to, how it draws and what the
 * inspector adds. This module is the only thing that knows they exist as a
 * SET — `registry.ts` spreads `ATOM_WIDGET_DEFS` into the one vocabulary and
 * `render.ts` asks `renderAtom` before its own switch.
 *
 * ── WHY THE DEFINITION LIVES WITH THE RENDERER ────────────────────────────
 * Before this, a widget was a registry entry in one file and a `case` in a
 * 1500-line switch in another, and the parity test in builder-engine exists
 * because the two drifted. Keeping them in one file is the fix the test was
 * written to ask for; the registry still holds the ONE list, it just does not
 * hold every field of it any more.
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
import { ADDRESS_BLOCK_DEF, renderAddressBlock } from "./addressBlock";
import { KEY_FACT_DEF, renderKeyFact } from "./keyFact";
import { NO_BUSINESS_RATE_SENTENCE, TOTALS_DEF, renderTotals } from "./totals";
import { HTML_DEF, renderHtml } from "./html";

/** Every atomic widget, in the order the Products-and-services group shows. */
export const ATOM_WIDGET_DEFS: WidgetDef[] = [
  CARD_DEF, CATALOG_CARD_DEF, PRICE_LINE_DEF, TOTALS_DEF, ADDRESS_BLOCK_DEF, KEY_FACT_DEF,
  HTML_DEF,
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
  address_block: renderAddressBlock,
  key_fact: renderKeyFact,
  html: renderHtml,
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
export { priceLineFields } from "./priceLine";
export { addressFields, locationAddress } from "./addressBlock";
export { htmlBody, htmlOf } from "./html";
export { NO_BUSINESS_RATE_SENTENCE } from "./totals";
/* THE SHARED BINDING SECTION (catalogue F.2), for every surface that reads a
   bound widget. One module, re-exported here like every other widget's own. */
export {
  BINDING_CONTROLS, BOUND_KINDS, ON_EMPTY_CHOICES, PUT_IT_BACK, REFRESH_MODES, TYPED_NOT_LIVE,
  bindingDefaults, bindingSettings, freezeOnSend, isBound, isPinned, onEmptyOf,
  overriddenFields, putItBackProps, refreshModeOf, selectionOf, selectionProps,
  type BindingSettings, type IaSelection, type IaSource, type OnEmpty, type RefreshMode,
} from "./binding";

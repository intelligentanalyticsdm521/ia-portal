/**
 * families/f1-words/index.ts - WORDS.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 section C.1: one widget, one file in this
 * folder; this index is the only thing that knows them as a SET. Nothing in
 * here ever opens registry.ts, render.ts's switch or another family's folder,
 * which is what makes ten agents on ten families safe.
 *
 * -- WHAT MAY BE ADDED HERE ------------------------------------------------
 * An ELEMENTOR widget, by Elementor's own name, group, icon, panel sections,
 * control labels and defaults - or an IA widget named in
 * test/fixtures/BUILDER_OFFERS_2026-09-19.json. Nothing else, ever. If you
 * think something is missing, write it in the handoff; do not build it.
 * test/builder-offers.test.mjs fails the build on an extra tile.
 *
 * -- THE FAMILY IS TWELVE WIDGETS, AND ALL TWELVE ARE NOW HERE -------------
 * Wave 1 built seven and stopped at five, for a reason that was true then:
 * heading, paragraph, html, shortcode and menu_anchor already existed with
 * their own `kind` in registry.ts and widgets/pageOnly.ts, and declaring one
 * of them here as WELL put the same kind in `WIDGETS` twice - two identical
 * tiles and `builder-registry.test.mjs:86` red.
 *
 * `b168/override` removed that wall. `WIDGETS` is now
 * `mergeWidgetDefs(FAMILY_WIDGET_DEFS, LEGACY_WIDGETS)`: a family definition of
 * an EXISTING kind replaces the legacy one, in the legacy one's place on the
 * panel, and the legacy copy stops existing without anybody deleting it in the
 * same pass. So wave 2 declares the five, each one KEEPING ITS STORED KIND AND
 * ITS STORED PROPS, and `shadowedLegacyKinds()` prints the leftovers for the
 * lander to sweep up mechanically.
 *
 * -- WHICH SURFACE EACH ONE REACHES ----------------------------------------
 * Straight off BUILDER_OFFERS_2026-09-19.json and nowhere else:
 *
 *   Heading, Text Editor   all five builders
 *   HTML                   website, landing, NEWSLETTER (the wave-1 gap)
 *   Shortcode, Menu Anchor website, landing
 *   Blockquote             all five - and it now has the mailbox and My Brand
 *                          halves it was missing
 */
import type { Family } from "../types";

import { ANIMATED_HEADLINE_DEF, renderAnimatedHeadline } from "./animatedHeadline";
import { BLOCKQUOTE_DEF, emailBlockquote, renderBlockquote, studioBlockquote } from "./blockquote";
import { CODE_HIGHLIGHT_DEF, renderCodeHighlight } from "./codeHighlight";
import { HEADING_DEF, renderHeading } from "./heading";
import { HTML_DEF, emailHtml, renderHtml } from "./html";
import { MENU_ANCHOR_DEF, renderMenuAnchor } from "./menuAnchor";
import { READ_MORE_DEF, renderReadMore } from "./readMore";
import { SHORTCODE_DEF, renderShortcode } from "./shortcode";
import { SIDEBAR_DEF, renderSidebar } from "./sidebar";
import { TABLE_OF_CONTENTS_DEF, renderTableOfContents } from "./tableOfContents";
import { TEXT_EDITOR_DEF, renderTextEditor } from "./textEditor";
import { TEXT_PATH_DEF, renderTextPath } from "./textPath";

/**
 * In Elementor's own panel order for the group each one sits in, so the tiles
 * read the way an author who has used Elementor expects them to. The order
 * itself is not typed here: each definition wears Elementor's own title, and
 * `registry.panelAt` reads the position off the machine-cut
 * `elementorPanel.ts` (b168/override item 3).
 */
export const FAMILY: Family = {
  defs: [
    HEADING_DEF,
    TEXT_EDITOR_DEF,
    HTML_DEF,
    SHORTCODE_DEF,
    MENU_ANCHOR_DEF,
    BLOCKQUOTE_DEF,
    ANIMATED_HEADLINE_DEF,
    TEXT_PATH_DEF,
    TABLE_OF_CONTENTS_DEF,
    CODE_HIGHLIGHT_DEF,
    READ_MORE_DEF,
    SIDEBAR_DEF,
  ],
  renderers: {
    [HEADING_DEF.kind]: renderHeading,
    [TEXT_EDITOR_DEF.kind]: renderTextEditor,
    [HTML_DEF.kind]: renderHtml,
    [SHORTCODE_DEF.kind]: renderShortcode,
    [MENU_ANCHOR_DEF.kind]: renderMenuAnchor,
    [BLOCKQUOTE_DEF.kind]: renderBlockquote,
    [ANIMATED_HEADLINE_DEF.kind]: renderAnimatedHeadline,
    [TEXT_PATH_DEF.kind]: renderTextPath,
    [TABLE_OF_CONTENTS_DEF.kind]: renderTableOfContents,
    [CODE_HIGHLIGHT_DEF.kind]: renderCodeHighlight,
    [READ_MORE_DEF.kind]: renderReadMore,
    [SIDEBAR_DEF.kind]: renderSidebar,
  },
  /**
   * THE MAILBOX HALF, for the two the family owns there and the adapter cannot
   * draw. `heading` and `paragraph` are NOT here on purpose: the Portal's
   * mailbox has drawn both since the first newsletter, LUMEN sends them, and
   * every golden case in `test/fixtures/email-render-cases.json` pins the
   * bytes. A family copy would be a SECOND mailbox renderer for one widget,
   * which is the drift this rebuild exists to stop - so the family owns the
   * PANEL and the PAGE for those two, and the mailbox keeps the one renderer it
   * already has.
   */
  emailRenderers: {
    [BLOCKQUOTE_DEF.kind]: emailBlockquote,
    [HTML_DEF.kind]: emailHtml,
  },
  /** My Brand places LAYERS. Same reasoning: only the one the studio lacks. */
  studioInserts: {
    [BLOCKQUOTE_DEF.kind]: studioBlockquote,
  },
};

export {
  ANIMATED_HEADLINE_DEF, BLOCKQUOTE_DEF, CODE_HIGHLIGHT_DEF, HEADING_DEF, HTML_DEF,
  MENU_ANCHOR_DEF, READ_MORE_DEF, SHORTCODE_DEF, SIDEBAR_DEF, TABLE_OF_CONTENTS_DEF,
  TEXT_EDITOR_DEF, TEXT_PATH_DEF,
};
export { blockquoteFields, blockquotePlain, blockquoteSkin } from "./blockquote";
export { highlightedLines } from "./codeHighlight";
export { markerPath, restingWord, rotatingPhrases } from "./animatedHeadline";
export { headingAnchor, headingTagOf, tocEntries } from "./tableOfContents";
export { textPathD } from "./textPath";
export { headingTag, headingText } from "./heading";
export { dropCapCss, editorText, isOn } from "./textEditor";
export { htmlBody, htmlOf } from "./html";
export { shortcodeOf } from "./shortcode";
export { anchorId } from "./menuAnchor";
export * from "./words";

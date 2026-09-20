/**
 * families/f1-words/index.ts - WORDS.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 section C.1: one widget, one file in this
 * folder; this index is the only thing that knows them as a SET. Nothing in
 * here ever opens registry.ts, render.ts or another family's folder, which is
 * what makes ten agents on ten families safe.
 *
 * -- WHAT MAY BE ADDED HERE ------------------------------------------------
 * An ELEMENTOR widget, by Elementor's own name, group, icon, panel sections,
 * control labels and defaults - or an IA widget named in
 * test/fixtures/BUILDER_OFFERS_2026-09-19.json. Nothing else, ever. If you
 * think something is missing, write it in the handoff; do not build it.
 * test/builder-offers.test.mjs fails the build on an extra tile.
 *
 * -- THE FAMILY IS TWELVE WIDGETS. SEVEN OF THEM ARE HERE. -----------------
 * F1 is heading, text-editor, blockquote, animated-headline, text-path,
 * table-of-contents, menu-anchor, code-highlight, html, shortcode, read-more
 * and sidebar. FIVE of the twelve already exist on this branch with their own
 * `kind`, and they are NOT duplicated here:
 *
 *   heading, paragraph (Text Editor)   src/builder/registry.ts
 *   html                               src/builder/widgets/html.ts
 *   shortcode, menu_anchor             src/builder/widgets/pageOnly.ts
 *
 * Declaring one of those five here as well would put the SAME kind in
 * `WIDGETS` twice: two identical tiles on the panel, `WIDGETS_BY_KIND`
 * resolving to whichever copy came last, and
 * `test/builder-registry.test.mjs:86` ("two widgets share a kind") red. A move
 * is only real when the old copy goes in the same pass - `replace means
 * delete` - and the old copies are in files this family may not open. So the
 * move is written out for the lander in `D168_HANDOFF_2026-09-19.md` under
 * "Land: move these into f1-words", with the parity gaps each one still has,
 * and nothing half-moved ships here.
 */
import type { Family } from "../types";

import { ANIMATED_HEADLINE_DEF, renderAnimatedHeadline } from "./animatedHeadline";
import { BLOCKQUOTE_DEF, renderBlockquote } from "./blockquote";
import { CODE_HIGHLIGHT_DEF, renderCodeHighlight } from "./codeHighlight";
import { READ_MORE_DEF, renderReadMore } from "./readMore";
import { SIDEBAR_DEF, renderSidebar } from "./sidebar";
import { TABLE_OF_CONTENTS_DEF, renderTableOfContents } from "./tableOfContents";
import { TEXT_PATH_DEF, renderTextPath } from "./textPath";

/**
 * In Elementor's own panel order for the group each one sits in, so the tiles
 * read the way an author who has used Elementor expects them to.
 */
export const FAMILY: Family = {
  defs: [
    BLOCKQUOTE_DEF,
    ANIMATED_HEADLINE_DEF,
    TEXT_PATH_DEF,
    TABLE_OF_CONTENTS_DEF,
    CODE_HIGHLIGHT_DEF,
    READ_MORE_DEF,
    SIDEBAR_DEF,
  ],
  renderers: {
    [BLOCKQUOTE_DEF.kind]: renderBlockquote,
    [ANIMATED_HEADLINE_DEF.kind]: renderAnimatedHeadline,
    [TEXT_PATH_DEF.kind]: renderTextPath,
    [TABLE_OF_CONTENTS_DEF.kind]: renderTableOfContents,
    [CODE_HIGHLIGHT_DEF.kind]: renderCodeHighlight,
    [READ_MORE_DEF.kind]: renderReadMore,
    [SIDEBAR_DEF.kind]: renderSidebar,
  },
};

export {
  ANIMATED_HEADLINE_DEF, BLOCKQUOTE_DEF, CODE_HIGHLIGHT_DEF, READ_MORE_DEF,
  SIDEBAR_DEF, TABLE_OF_CONTENTS_DEF, TEXT_PATH_DEF,
};
export { blockquoteFields, blockquotePlain, blockquoteSkin } from "./blockquote";
export { highlightedLines } from "./codeHighlight";
export { markerPath, restingWord, rotatingPhrases } from "./animatedHeadline";
export { headingAnchor, headingTagOf, tocEntries } from "./tableOfContents";
export { textPathD } from "./textPath";

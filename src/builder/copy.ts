/**
 * builder/copy.ts — the words the ENGINE says, which the adapter owns.
 *
 * D-30 (BUILDER_USER_TEST_2026-09-16): *"Heading — optionally numbered like
 * '1. Scope of work'" in the website, email, landing and social-graphic
 * builders; "Heading font — the document's own font" in an email; "Start a new
 * page here (when printed or saved as a PDF)" in the website section
 * inspector.* The engine was written for a proposal and every other builder
 * inherited a proposal's vocabulary.
 *
 * ── ONE OBJECT, NOT A PROP PER SENTENCE ───────────────────────────────────
 * Every sentence the engine says about the THING being built comes from here.
 * An adapter hands in the ones that differ and inherits the rest, so adding a
 * sentence to the engine cannot silently start saying "document" inside an
 * email — and a test can read one object rather than grep four components.
 *
 * Only the engine's own copy lives here. A widget's description belongs to the
 * widget (registry.ts) and a template's to the template (templates.ts); this
 * is the frame talking about the thing in it.
 */

export interface BuilderCopy {
  /** What the thing being built is called, lower case, in a sentence. */
  noun: string;
  /** More than one of them. */
  nounPlural: string;
  /** Who reads it when it is finished. */
  audience: string;
  /** Above the widget list. */
  paneHeading: string;
  /** Under the widget list's heading — how to get something onto the page. */
  paneHint: string;
  /** The outline tab's name. */
  outlineHeading: string;
  /** What "no font of its own" is called in the section's Typography group. */
  defaultFontLabel: string;
  /** The Page group's page-break line. Empty hides the control entirely. */
  pageBreakLabel: string;
  /** The line above the canvas: what clicking does here. */
  canvasHint: string;
  /** What the empty-page screen offers to start with. */
  emptyHeading: string;
  emptyHint: string;
}

/**
 * The defaults are DELIBERATELY generic.
 *
 * "this page" and not "this document": the engine serves four builders and
 * three of them are not documents, so the fallback has to be true everywhere.
 * The proposal adapter overrides it back to "document", which is the right way
 * round — the specific surface pays for its own words.
 */
export const DEFAULT_COPY: BuilderCopy = {
  noun: "page",
  nounPlural: "pages",
  audience: "the people who see it",
  paneHeading: "Add to this page",
  paneHint: "Click one to add it where you are, or drag it onto the page.",
  outlineHeading: "Outline",
  defaultFontLabel: "The page's own font",
  pageBreakLabel: "Start a new page here",
  canvasHint: "Click anything on the page to edit it. This is exactly what your reader sees.",
  emptyHeading: "What goes on this page?",
  emptyHint: "Pick one to start. You can add the rest after.",
};

/** The adapter's words over the defaults. Missing keys keep the default. */
export function resolveCopy(partial?: Partial<BuilderCopy> | null): BuilderCopy {
  if (!partial) return DEFAULT_COPY;
  const out = { ...DEFAULT_COPY };
  for (const key of Object.keys(DEFAULT_COPY) as Array<keyof BuilderCopy>) {
    const v = partial[key];
    // An adapter that hands in "" for pageBreakLabel MEANS empty (hide the
    // control); undefined means "I have no opinion". Two different answers, so
    // `||` would be wrong here.
    if (v !== undefined && v !== null) out[key] = v;
  }
  return out;
}

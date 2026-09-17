/**
 * builder/proposal/refusalAnchors.ts — the names a document-builder refusal
 * can be reported AT.
 *
 * D-20 (BUILDER_USER_TEST_2026-09-16): *"Both print red text in the far-left
 * widget pane while the button is top-right. On a 1600px screen a user sees
 * nothing happen."* The engine already puts a refusal beside the control that
 * caused it (`AnchoredToast` + `data-builder-anchor`); what was missing was any
 * way to prove the adapter had wired ALL of them, so three survived in the
 * pane-bottom red line until 2026-09-17.
 *
 * The names live here, in a pure module, so `node --test` can hold the two
 * halves against each other: every name is refused with, and every name is
 * rendered on a control. A name that only one side knows about is a refusal
 * that lands at the top of the window instead of beside its button.
 *
 * `load` is the deliberate exception and is NOT in the table: opening the
 * document failed, so there is no control to stand beside and AnchoredToast's
 * documented fallback — the top centre of the window — is the right place for
 * it. It is listed in ANCHORLESS so the test knows it was meant.
 */

/** Every refusal anchor that MUST exist as a control in the builder. */
export const PROPOSAL_ANCHORS = {
  /** Save draft, and the revision's Save draft. */
  save: "save",
  /** Save and close. */
  saveClose: "save-close",
  /** Send to customer, and Send v2. */
  send: "send",
  /** The header's "Save as template". */
  saveTemplate: "save-template",
  /** "Save these details to the property", in the widget panel. */
  propertySave: "property-save",
} as const;

export type ProposalAnchor = (typeof PROPOSAL_ANCHORS)[keyof typeof PROPOSAL_ANCHORS];

/**
 * Refusals that have NO control to stand beside, and why.
 *
 * Only the document failing to open. Everything else is a press.
 */
export const ANCHORLESS: Record<string, string> = {
  load: "the document could not be opened, so there is no control to stand beside",
};

/**
 * One tick in "What the customer asked for".
 *
 * Per ROW, because the whole point is that the box that un-ticked itself is
 * the box the sentence appears under. Indexed rather than keyed on the text: a
 * request item is free text a customer typed, and a selector is not the place
 * for it.
 */
export function requestItemAnchor(index: number): string {
  return `request-item-${index}`;
}

/** Does this name belong to the per-row family above? */
export function isRequestItemAnchor(anchor: string): boolean {
  return /^request-item-\d+$/.test(anchor);
}

export default PROPOSAL_ANCHORS;

/**
 * Section-list editor state — the pure half.
 * ---------------------------------------------------------------------------
 * Reordering, editing a field, adding and removing a section are all plain
 * data transforms. Keeping them out of the component means they can be tested
 * without a browser, and it means the "is there anything to save?" question
 * has one answer rather than one per button.
 *
 * Two rules hold everywhere in this file:
 *   1. Nothing mutates. Every helper returns a new array/object, so React sees
 *      the change and a failed save leaves the editor exactly as it was.
 *   2. A section we did not author is never touched. Its `node` goes back to
 *      the site byte for byte (SCOPE_ARION_SITE_BUILDER_2026-09-05 §3.3).
 */

import type { ArionPageSection } from '../../lib/arionApi';

/** One section as the editor holds it, plus whether the client changed it. */
export interface EditorSection extends ArionPageSection {
  /** Stable across reorders so React keys and the dirty check survive a drag. */
  uid: string;
  dirty: boolean;
  /** Set on a section the client added but has not saved yet. */
  isNew?: boolean;
  /**
   * Set on a section ARGUS suggested that the client has not approved yet.
   * A proposed row is visible in the list, marked, and is NOT sent on Save —
   * that is what "nothing reaches the site until you approve" means at the
   * level of a whole new section (SCOPE §3.8).
   */
  isProposed?: boolean;
  /**
   * The ARGUS suggestion this section is carrying, so an approved edit can be
   * stamped `applied` by the same request that writes it — never before.
   */
  proposalId?: string | null;
}

let uidSeq = 0;
function nextUid(prefix: string): string {
  uidSeq += 1;
  return `${prefix}-${uidSeq}`;
}

/** Turn what the API returned into editor state. */
export function toEditorSections(sections: ArionPageSection[]): EditorSection[] {
  return (sections || []).map((s, i) => ({
    ...s,
    uid: nextUid(`s${i}`),
    dirty: false,
  }));
}

/**
 * What goes back to the API on Save or Preview.
 *
 * A section still marked `isProposed` is left out. ARGUS suggesting a new
 * section is not the client accepting one, and a Save must never quietly
 * publish a suggestion nobody said yes to.
 */
export function toSavePayload(sections: EditorSection[]) {
  return sections.filter((s) => !s.isProposed).map((s) => ({
    fields: s.editable ? s.fields : null,
    node: s.node,
  }));
}

/** Every ARGUS suggestion this save is carrying. */
export function proposalIdsOf(sections: EditorSection[]): string[] {
  return [...new Set(
    sections.filter((s) => !s.isProposed && s.proposalId).map((s) => String(s.proposalId)),
  )];
}

export function isDirty(sections: EditorSection[], originalOrder: string[]): boolean {
  // A proposed section is not a change yet — it is a suggestion sitting on the
  // screen. Counting it as dirty would light up "Unsaved changes" for
  // something a Save would not write.
  const real = sections.filter((s) => !s.isProposed);
  if (real.some((s) => s.dirty || s.isNew)) return true;
  if (real.length !== originalOrder.length) return true;
  return real.some((s, i) => s.uid !== originalOrder[i]);
}

export function orderOf(sections: EditorSection[]): string[] {
  return sections.map((s) => s.uid);
}

/**
 * Move one section up or down by a single place.
 * Out-of-range moves are a no-op rather than an error — the buttons at the
 * ends of the list stay pressable and simply do nothing.
 */
export function moveSection(sections: EditorSection[], from: number, to: number): EditorSection[] {
  if (from === to) return sections;
  if (from < 0 || from >= sections.length) return sections;
  if (to < 0 || to >= sections.length) return sections;
  const next = sections.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((s, i) => ({ ...s, index: i }));
}

/** Set one top-level field on one section. */
export function setSectionField(
  sections: EditorSection[],
  uid: string,
  key: string,
  value: unknown,
): EditorSection[] {
  return sections.map((s) => {
    if (s.uid !== uid) return s;
    if (!s.editable) return s;
    return { ...s, dirty: true, fields: { ...(s.fields || {}), [key]: value } };
  });
}

/**
 * Set SEVERAL top-level fields at once.
 *
 * A picture is three values that have to move together — its address, its
 * attachment id and its description. Setting them one at a time would leave a
 * render in between where the new url sits beside the old id, which is how
 * Elementor ends up emitting the wrong srcset.
 */
export function setSectionFields(
  sections: EditorSection[],
  uid: string,
  patch: Record<string, unknown>,
): EditorSection[] {
  return sections.map((s) => {
    if (s.uid !== uid) return s;
    if (!s.editable) return s;
    return { ...s, dirty: true, fields: { ...(s.fields || {}), ...patch } };
  });
}

/** Set one field inside one row of a list field (a service, an FAQ, a photo). */
export function setListItemField(
  sections: EditorSection[],
  uid: string,
  listKey: string,
  itemIndex: number,
  key: string,
  value: unknown,
): EditorSection[] {
  return sections.map((s) => {
    if (s.uid !== uid || !s.editable) return s;
    const list = Array.isArray(s.fields?.[listKey]) ? (s.fields as any)[listKey].slice() : [];
    if (itemIndex < 0 || itemIndex >= list.length) return s;
    list[itemIndex] = { ...(list[itemIndex] || {}), [key]: value };
    return { ...s, dirty: true, fields: { ...(s.fields || {}), [listKey]: list } };
  });
}

/** The same, inside one row of a list — a gallery picture and its id. */
export function setListItemFields(
  sections: EditorSection[],
  uid: string,
  listKey: string,
  itemIndex: number,
  patch: Record<string, unknown>,
): EditorSection[] {
  return sections.map((s) => {
    if (s.uid !== uid || !s.editable) return s;
    const list = Array.isArray(s.fields?.[listKey]) ? (s.fields as any)[listKey].slice() : [];
    if (itemIndex < 0 || itemIndex >= list.length) return s;
    list[itemIndex] = { ...(list[itemIndex] || {}), ...patch };
    return { ...s, dirty: true, fields: { ...(s.fields || {}), [listKey]: list } };
  });
}

export function addListItem(
  sections: EditorSection[],
  uid: string,
  listKey: string,
  blank: Record<string, unknown>,
): EditorSection[] {
  return sections.map((s) => {
    if (s.uid !== uid || !s.editable) return s;
    const list = Array.isArray(s.fields?.[listKey]) ? (s.fields as any)[listKey].slice() : [];
    list.push({ ...blank });
    return { ...s, dirty: true, fields: { ...(s.fields || {}), [listKey]: list } };
  });
}

export function removeListItem(
  sections: EditorSection[],
  uid: string,
  listKey: string,
  itemIndex: number,
): EditorSection[] {
  return sections.map((s) => {
    if (s.uid !== uid || !s.editable) return s;
    const list = Array.isArray(s.fields?.[listKey]) ? (s.fields as any)[listKey].slice() : [];
    if (itemIndex < 0 || itemIndex >= list.length) return s;
    list.splice(itemIndex, 1);
    return { ...s, dirty: true, fields: { ...(s.fields || {}), [listKey]: list } };
  });
}

/** A "paragraphs" field is a plain list of strings (the About story). */
export function setParagraph(
  sections: EditorSection[],
  uid: string,
  key: string,
  itemIndex: number,
  value: string,
): EditorSection[] {
  return sections.map((s) => {
    if (s.uid !== uid || !s.editable) return s;
    const list = Array.isArray(s.fields?.[key]) ? (s.fields as any)[key].slice() : [];
    if (itemIndex < 0 || itemIndex >= list.length) return s;
    list[itemIndex] = value;
    return { ...s, dirty: true, fields: { ...(s.fields || {}), [key]: list } };
  });
}

export function addParagraph(sections: EditorSection[], uid: string, key: string): EditorSection[] {
  return sections.map((s) => {
    if (s.uid !== uid || !s.editable) return s;
    const list = Array.isArray(s.fields?.[key]) ? (s.fields as any)[key].slice() : [];
    list.push('');
    return { ...s, dirty: true, fields: { ...(s.fields || {}), [key]: list } };
  });
}

export function removeParagraph(
  sections: EditorSection[], uid: string, key: string, itemIndex: number,
): EditorSection[] {
  return sections.map((s) => {
    if (s.uid !== uid || !s.editable) return s;
    const list = Array.isArray(s.fields?.[key]) ? (s.fields as any)[key].slice() : [];
    if (itemIndex < 0 || itemIndex >= list.length) return s;
    list.splice(itemIndex, 1);
    return { ...s, dirty: true, fields: { ...(s.fields || {}), [key]: list } };
  });
}

export function removeSection(sections: EditorSection[], uid: string): EditorSection[] {
  return sections.filter((s) => s.uid !== uid).map((s, i) => ({ ...s, index: i }));
}

/**
 * Append a section the server just built for us. The server owns the node —
 * the editor never invents Elementor JSON.
 */
export function appendSection(sections: EditorSection[], added: ArionPageSection): EditorSection[] {
  const next = sections.concat([{ ...added, uid: nextUid('new'), dirty: true, isNew: true }]);
  return next.map((s, i) => ({ ...s, index: i }));
}

/**
 * Swap a section's LAYOUT, keeping its words (D-ARION-F).
 *
 * The server built the new node from the chosen curated layout and wrote this
 * section's own field values onto it, so what arrives is the same content in a
 * different shape. It is an UNSAVED edit — `dirty: true` — because nothing has
 * reached the website: it goes out with the next Save like any other change, and
 * Undo covers it exactly the same way.
 *
 * The row keeps its `uid` so the list does not re-mount and its position does
 * not move; the client asked for a different look, not a different page.
 */
export function swapSectionLayout(
  sections: EditorSection[],
  uid: string,
  swapped: ArionPageSection,
): EditorSection[] {
  return sections.map((s) => (
    s.uid === uid
      ? { ...swapped, index: s.index, uid: s.uid, dirty: true, isNew: s.isNew, isProposed: false }
      : s
  ));
}

/** How the row reads in the list: the section's name, then its headline. */
export function sectionSummary(s: EditorSection): string {
  const headline = typeof s.fields?.headline === 'string' ? s.fields.headline.trim() : '';
  if (headline) return headline;
  // A section built on the site has no fields to read a headline out of, so
  // the server sends the first words a visitor sees on it. Without that, four
  // hand-built rows on one page all read "Built on the website itself" and a
  // client cannot tell which one they are looking at.
  if (!s.editable) return s.adoptPreview || 'Built on the website itself';
  return 'No headline yet';
}

/* ── ARGUS suggestions ──────────────────────────────────────────────────── */

/**
 * Put an approved suggestion's wording into a section. It becomes an ordinary
 * unsaved edit from here on — the same Save and Publish buttons stand between
 * it and the website, and Undo covers it once it is published.
 */
export function applyProposal(
  sections: EditorSection[],
  uid: string,
  fields: Record<string, unknown>,
  proposalId: string,
): EditorSection[] {
  return sections.map((s) => {
    if (s.uid !== uid || !s.editable) return s;
    return { ...s, dirty: true, fields: { ...(s.fields || {}), ...fields }, proposalId };
  });
}

/** The page-level equivalent: several sections at once, by their index. */
export function applyPageProposal(
  sections: EditorSection[],
  edits: Array<{ index: number; after: Record<string, unknown> }>,
  proposalId: string,
): EditorSection[] {
  const byIndex = new Map(edits.map((e) => [Number(e.index), e.after]));
  return sections.map((s, i) => {
    const after = byIndex.get(i);
    if (!after || !s.editable) return s;
    return { ...s, dirty: true, fields: { ...(s.fields || {}), ...after }, proposalId };
  });
}

/**
 * Drop a suggested NEW section into the list, marked as a suggestion. It shows
 * in position so the client can see where it would go, and it is skipped by
 * Save until they approve it.
 */
export function insertProposedSection(
  sections: EditorSection[],
  added: ArionPageSection,
  afterIndex: number,
  proposalId: string,
): EditorSection[] {
  const at = Math.max(0, Math.min(afterIndex + 1, sections.length));
  const next = sections.slice();
  next.splice(at, 0, {
    ...added, uid: nextUid('argus'), dirty: false, isNew: true, isProposed: true, proposalId,
  });
  return next.map((s, i) => ({ ...s, index: i }));
}

/** The client said yes to a suggested new section: it becomes an ordinary one. */
export function acceptProposedSections(sections: EditorSection[]): EditorSection[] {
  return sections.map((s) => (s.isProposed ? { ...s, isProposed: false, dirty: true } : s));
}

/** The client said no: every suggested section leaves the list. */
export function dropProposedSections(sections: EditorSection[]): EditorSection[] {
  return sections.filter((s) => !s.isProposed).map((s, i) => ({ ...s, index: i }));
}

/* ── Adoption (Phase 3) ─────────────────────────────────────────────────── */

/**
 * Swap a section that has just been adopted for the editable one the server
 * put on the website in its place.
 *
 * `dirty: false` on purpose. Adoption is not an unsaved edit sitting in the
 * editor — the write has already landed and the cache has already been purged,
 * so marking the row dirty would light up "Unsaved changes" over something
 * that is already live and would invite a Save that writes it a second time.
 */
export function replaceAdoptedSection(
  sections: EditorSection[],
  index: number,
  adopted: ArionPageSection,
): EditorSection[] {
  return sections.map((s, i) => (
    i === index
      ? { ...adopted, index: i, uid: s.uid, dirty: false, isNew: false, isProposed: false }
      : s
  ));
}

/**
 * Put a section back the way it was built, after an "Undo adoption". The row
 * returns to a greyed, read-only "Custom section" exactly as it was before
 * anybody touched it.
 */
export function revertAdoptedSection(
  sections: EditorSection[],
  index: number,
  original: ArionPageSection,
): EditorSection[] {
  return sections.map((s, i) => (
    i === index
      ? { ...original, index: i, uid: s.uid, dirty: false, isNew: false, isProposed: false }
      : s
  ));
}

/**
 * The rows the "Review sections built on the site" list shows: every section
 * the client cannot edit here, with the server's own answer about whether that
 * can change and why not.
 */
export function customSectionRows(sections: EditorSection[]) {
  return sections
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !s.editable && !s.isProposed)
    .map(({ s, i }) => ({
      index: i,
      label: s.label,
      summary: s.adoptPreview || sectionSummary(s),
      adoptable: !!s.adoptable,
      kindLabel: s.adoptKindLabel || null,
      reasonText: s.adoptReasonText || null,
      confidenceLabel: s.adoptConfidenceLabel || null,
    }));
}

/** How many sections on this page were built on the site and are still greyed. */
export function customSectionCount(sections: EditorSection[]): number {
  return sections.filter((s) => !s.editable && !s.isProposed).length;
}

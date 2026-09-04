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

/** What goes back to the API on Save or Preview. */
export function toSavePayload(sections: EditorSection[]) {
  return sections.map((s) => ({
    fields: s.editable ? s.fields : null,
    node: s.node,
  }));
}

export function isDirty(sections: EditorSection[], originalOrder: string[]): boolean {
  if (sections.some((s) => s.dirty || s.isNew)) return true;
  if (sections.length !== originalOrder.length) return true;
  return sections.some((s, i) => s.uid !== originalOrder[i]);
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

/** How the row reads in the list: the section's name, then its headline. */
export function sectionSummary(s: EditorSection): string {
  const headline = typeof s.fields?.headline === 'string' ? s.fields.headline.trim() : '';
  if (headline) return headline;
  if (!s.editable) return 'Built on the website itself';
  return 'No headline yet';
}

/**
 * builder/diff.ts — what changed, section by section.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §11.5 (the revision page on the builder).
 *
 * ── WHY A MODULE AND NOT A COMPARISON IN THE PAGE ─────────────────────────
 * Two surfaces have to agree about this and they are written by different
 * people on different days: the AUTHOR's canvas badges the sections they have
 * changed, and the CUSTOMER's revision page badges the sections that changed
 * since the version they last read. If those two answers ever differ, the
 * customer is told "this is what moved" about something else. So there is one
 * function, it is pure, and it is a `node --test` file.
 *
 * ── WHAT COUNTS AS A CHANGE ───────────────────────────────────────────────
 * A section is matched to its baseline BY ID — the model gives every section a
 * stable id and every operation preserves it, so a section that was edited is
 * the same section and a section that was added is a new one. Within a matched
 * pair the comparison is the section's serialised content with the id removed:
 * its label, layout, styling, visibility and every widget in it. That means
 * moving a section up the page does NOT badge it — the words did not change,
 * and badging a move as a change teaches the reader to ignore badges.
 *
 * Deleted sections cannot be badged (there is nothing on the page to badge), so
 * they are counted and named instead — the summary line says "one section was
 * removed", which is the only honest way to show an absence.
 */
import type { BuilderDocument, Section } from "./model";

/** What happened to one section, from the reader's point of view. */
export type SectionChange = "added" | "changed";

export interface DocumentDiff {
  /** section id → what happened. Only sections PRESENT in the new document. */
  sections: Record<string, SectionChange>;
  added: number;
  changed: number;
  /** Sections that were in the baseline and are not in the new document. */
  removed: number;
  /** Their labels, so the summary can name them rather than count them. */
  removedLabels: string[];
  /** True when nothing at all is different, settings included. */
  identical: boolean;
  /** The page's own styling (accent, fonts, style preset) changed. */
  settingsChanged: boolean;
}

/** A section's content, with the things that are not content taken out. */
function contentOf(s: Section): string {
  // `id` is identity, not content: a duplicated section has different ids all
  // the way down and identical words, and it should read as a change to the
  // page rather than as every widget in it changing.
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === "id") continue;
        out[k] = strip(v);
      }
      return out;
    }
    return value;
  };
  return JSON.stringify(strip(s));
}

const EMPTY: DocumentDiff = {
  sections: {}, added: 0, changed: 0, removed: 0, removedLabels: [],
  identical: true, settingsChanged: false,
};

/**
 * Compare a document against the version it is a revision of.
 *
 * `base` is the document as it was SENT. It must be the frozen copy, never
 * "the proposal's document_json as it stands now" — a baseline that moves when
 * the author saves is not a baseline, and the second revision of a document
 * would show nothing as changed at all.
 */
export function diffDocuments(
  base: BuilderDocument | null | undefined,
  next: BuilderDocument | null | undefined,
): DocumentDiff {
  if (!next) return { ...EMPTY };
  // No baseline means nothing to compare against — NOT "everything is new".
  // Badging every section on a document nobody has revised is noise, and noise
  // is how a badge stops meaning anything.
  if (!base) return { ...EMPTY };

  const baseById = new Map<string, Section>();
  for (const s of base.sections) baseById.set(s.id, s);

  const sections: Record<string, SectionChange> = {};
  let added = 0;
  let changed = 0;
  for (const s of next.sections) {
    const was = baseById.get(s.id);
    if (!was) { sections[s.id] = "added"; added += 1; continue; }
    if (contentOf(was) !== contentOf(s)) { sections[s.id] = "changed"; changed += 1; }
  }

  const nextIds = new Set(next.sections.map((s) => s.id));
  const removedSections = base.sections.filter((s) => !nextIds.has(s.id));
  const settingsChanged = JSON.stringify(base.settings ?? {}) !== JSON.stringify(next.settings ?? {});

  return {
    sections,
    added,
    changed,
    removed: removedSections.length,
    removedLabels: removedSections.map((s, i) => s.label || `Section ${i + 1}`),
    identical: added === 0 && changed === 0 && removedSections.length === 0 && !settingsChanged,
    settingsChanged,
  };
}

/** One line a person can read. Used above the canvas and above the customer's copy. */
export function diffSummary(diff: DocumentDiff): string {
  if (diff.identical) return "Nothing has changed yet.";
  const parts: string[] = [];
  if (diff.changed) parts.push(`${diff.changed} section${diff.changed === 1 ? "" : "s"} changed`);
  if (diff.added) parts.push(`${diff.added} added`);
  if (diff.removed) parts.push(`${diff.removed} removed (${diff.removedLabels.slice(0, 3).join(", ")})`);
  if (!parts.length && diff.settingsChanged) parts.push("the page styling changed");
  else if (diff.settingsChanged) parts.push("page styling");
  return `${parts.join(" · ")}.`;
}

export default { diffDocuments, diffSummary };

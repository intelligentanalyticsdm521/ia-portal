/**
 * builder/builderMenu.ts — THE list of things you can do to a part of the page.
 *
 * BUILDER_UX_SPEC §M-8: *"Right-click on a section, a column or a widget — and
 * the `⋯` on its hover toolbar, and the `⋯` on its Page-map row — all open the
 * SAME menu, ordered by frequency."* A user coming from Elementor or Gutenberg
 * reaches for right-click within the first minute, and on 2026-09-17 nothing
 * happened when they did.
 *
 * ── WHY A MODULE AND NOT A COMPONENT ──────────────────────────────────────
 * The menu's CONTENTS are a fact about the document: what is on the page,
 * whether this part is locked, whether it is the first section, whether
 * anything has been copied. That is arithmetic, so it is a pure function and a
 * `node --test`, and the component below it only draws what this returns.
 *
 * ── ONE SET OF ACTIONS ────────────────────────────────────────────────────
 * Every id here is an action the hover toolbar already performs. The menu does
 * not get its own handlers: `BuilderShell` maps one id to one function, and
 * both surfaces press the same one. Two menus over one set of verbs is how a
 * Duplicate that works on the toolbar and not in the menu happens.
 *
 * A DISABLED row keeps its reason, because "the button is grey" is not an
 * explanation — the spec asks for *"The footer can't be deleted — it has to be
 * on every email you send."*
 */

/** Everything a part of the page can be asked to do. */
export type MenuAction =
  | "edit"
  | "duplicate"
  | "copy"
  | "paste"
  | "moveUp"
  | "moveDown"
  | "addAbove"
  | "addBelow"
  | "saveBlock"
  | "showInOutline"
  | "lock"
  | "unlock"
  | "hide"
  | "show"
  | "delete";

export interface MenuItem {
  action: MenuAction;
  label: string;
  /** Greyed, with the reason on hover. Never hidden: a control that vanishes
   *  teaches nothing, and the author goes looking for it again tomorrow. */
  disabled?: boolean;
  reason?: string;
  /** Destructive colouring, and always last with a rule above it. */
  danger?: boolean;
  /** Draw a divider above this row. */
  separator?: boolean;
}

/** What the menu is being opened on. */
export type MenuTargetKind = "section" | "widget";

/** The facts the menu needs. All of them are already on screen. */
export interface MenuFacts {
  kind: MenuTargetKind;
  /** This part cannot be removed — the law put it there, not the author. */
  locked?: boolean;
  /** This part is hidden on the width being previewed. */
  hidden?: boolean;
  /** Sections only: where it sits, so Move up/down can say why not. */
  index?: number;
  total?: number;
  /** Something is on the builder's clipboard. */
  canPaste?: boolean;
  /** The word this builder uses for a page (copy.ts `noun`). */
  noun?: string;
  /** Why this part is locked, in the client's words. */
  lockedReason?: string;
  /** Saving your own block is offered where the adapter can store one. */
  canSaveBlock?: boolean;
  /** The width the eye refers to: "on phones", "on tablets", or everywhere. */
  deviceWord?: string;
}

const DEFAULT_LOCKED_REASON =
  "This part has to stay — it carries something the law asks for on every send. You can change the wording inside it.";

/**
 * The menu for one part of the page, ordered by how often it is wanted.
 *
 * Delete is last, separated, and destructive-coloured — both Elementor and
 * Gutenberg put it there, and a Delete next to Duplicate is a Delete somebody
 * presses by accident.
 */
export function menuFor(f: MenuFacts): MenuItem[] {
  const isSection = f.kind === "section";
  const thing = isSection ? "section" : "block";
  const lockedReason = f.lockedReason || DEFAULT_LOCKED_REASON;
  const device = f.deviceWord ? ` ${f.deviceWord}` : "";
  const items: MenuItem[] = [];

  items.push({ action: "edit", label: "Edit this" });
  items.push({
    action: "duplicate",
    label: "Make a copy",
    disabled: !!f.locked,
    ...(f.locked ? { reason: lockedReason } : {}),
  });
  items.push({ action: "copy", label: "Copy" });
  items.push({
    action: "paste",
    label: "Paste",
    disabled: !f.canPaste,
    ...(f.canPaste ? {} : { reason: "Nothing has been copied yet." }),
  });

  const first = (f.index ?? 0) <= 0;
  const last = f.total != null && (f.index ?? 0) >= f.total - 1;
  items.push({
    action: "moveUp", label: "Move up", separator: true,
    disabled: isSection && first,
    ...(isSection && first ? { reason: "This is already the first section." } : {}),
  });
  items.push({
    action: "moveDown", label: "Move down",
    disabled: isSection && last,
    ...(isSection && last ? { reason: "This is already the last section." } : {}),
  });

  if (isSection) {
    items.push({ action: "addAbove", label: "Add a section above" });
    items.push({ action: "addBelow", label: "Add a section below" });
  }

  if (isSection && f.canSaveBlock) {
    items.push({ action: "saveBlock", label: "Save this as my own block", separator: true });
  }
  items.push({
    action: "showInOutline", label: `Show it in the outline`,
    ...(isSection && f.canSaveBlock ? {} : { separator: true }),
  });

  items.push(
    f.hidden
      ? { action: "show", label: `Show this${device} again`, separator: true }
      : { action: "hide", label: `Hide this${device}`, separator: true },
  );
  items.push(
    f.locked
      ? { action: "unlock", label: "Let it be deleted again" }
      : { action: "lock", label: "Lock so it can't be deleted" },
  );

  items.push({
    action: "delete", label: `Delete this ${thing}`, separator: true, danger: true,
    disabled: !!f.locked,
    ...(f.locked ? { reason: lockedReason } : {}),
  });

  // The `noun` is the builder's own word for the page, kept so a future row
  // that has to mention it ("Add a section above" on a web page) can. Reading
  // it here rather than importing copy.ts keeps this module pure.
  void f.noun;
  return items;
}

export default { menuFor };

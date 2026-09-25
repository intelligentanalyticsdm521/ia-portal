/**
 * builder/builderMenu.ts — THE right-click menu, copied from the reference editor.
 *
 * ── WHAT THE REAL EDITOR'S MENU IS ────────────────────────────────────────
 * Driven in a live Elementor on 2026-09-19 — right-click a widget, read
 * `.elementor-context-menu-list__item` — and written down in
 * `overnight-report/elementor-reference/widgets/_zz_screen_round1.json`:
 *
 *   Edit Text Editor
 *   Duplicate               Ctrl+D
 *   Copy                    Ctrl+C
 *   Paste                   Ctrl+V          (greyed with nothing copied)
 *   Paste style             Ctrl+Shift+V    (greyed with nothing copied)
 *   Paste interactions                      (greyed)
 *   Paste from other site
 *   Reset style
 *   Save as a global                        (greyed, Pro)
 *   Save as default
 *   Structure               Ctrl+I
 *   Delete                  Del
 *
 * That is the whole menu. Every row prints its chord on the right.
 *
 * ── WHAT WAS OURS, AND IS DELETED (D-172) ─────────────────────────────────
 * Move up · Move down — moving is dragging, or the Structure window.
 * Put this in a box · Take the box away — not in the reference at all, and the
 *   first was greyed with a sentence telling you to hold Shift, which is the
 *   multi-select the canvas no longer has.
 * Lay it out side by side · Stack it top to bottom · Lay it out in even
 *   columns — direction is a SETTING in the panel, not a menu row.
 * Show it in the outline — replaced by the reference's own "Structure" row.
 * Hide this · Lock so it can't be deleted — not in the reference's menu. A part
 *   the LAW locks (an email footer) is still locked; what went is the author's
 *   own switch, which the reference does not offer here.
 * Add a section above · Add a section below — the handle's "+" does that.
 * Save this as my own block — the reference's row is "Save as default".
 *
 * The first row is NOT deleted: the reference really does open with
 * "Edit <Widget>", which one of the audit rows had wrong. It is checked, not
 * remembered.
 *
 * ── WHY A MODULE AND NOT A COMPONENT ──────────────────────────────────────
 * The menu's CONTENTS are a fact about the document: whether anything has been
 * copied, whether this part is locked. That is arithmetic, so it is a pure
 * function and a `node --test`, and the component only draws what this returns.
 *
 * ── ONE SET OF ACTIONS ────────────────────────────────────────────────────
 * Every id here is an action `BuilderShell` already performs, and the keyboard
 * runs the same ones. Two menus over one set of verbs is how a Duplicate that
 * works on the toolbar and not in the menu happens.
 */

/** Everything a part of the page can be asked to do. */
export type MenuAction =
  | "edit"
  | "duplicate"
  | "copy"
  | "paste"
  | "pasteStyle"
  /** The reference's row. Greyed: we carry no interactions to paste. */
  | "pasteInteractions"
  /** The reference's row: paste what was copied in another business's builder. */
  | "pasteFromOtherSite"
  /** Put this element's look back to the default. */
  | "resetStyle"
  /** The reference's Pro row. Ours is tier-gated the same way. */
  | "saveGlobal"
  /** The reference's "Save as default" — our named block, under its name. */
  | "saveDefault"
  /** Open the Structure window on this element. */
  | "structure"
  /** The container menu's third row: put another box beside this one. */
  | "addContainer"
  /** The container menu's own "Save as a template", badged New. */
  | "saveTemplate"
  /** The DOCUMENT menu's rows — right-click the page, not a thing on it. */
  | "copyAll"
  | "deleteAll"
  | "delete";

/**
 * THE CHORDS, PRINTED THE REFERENCE'S OWN WAY (D-172, round 2).
 *
 * Driven on 2026-09-19 — read straight off
 * `.elementor-context-menu-list__item__shortcut` — the reference prints `^+D`,
 * `^+C`, `^+V`, `^+⇧+V`, `^+I` and the delete glyph `⌦`. Ours spelled out
 * "Ctrl+D", "Ctrl+Shift+V", "Del". One object so the menu and its test read
 * the same six strings, and so the SHORTCUTS PANEL can keep spelling them out
 * in words — that panel is a list you read, this is a hint you glance at, and
 * the reference makes the same distinction.
 */
export const CHORD = {
  duplicate: "^+D",
  copy: "^+C",
  paste: "^+V",
  pasteStyle: "^+⇧+V",
  structure: "^+I",
  delete: "⌦",
} as const;

export interface MenuItem {
  action: MenuAction;
  label: string;
  /**
   * The chord, printed right-aligned on the row (D-172).
   *
   * The reference prints one on six of its twelve rows, and a menu that knows
   * the shortcut and does not say it is a menu that teaches nobody anything.
   */
  shortcut?: string;
  /** Greyed, with the reason on hover. Never hidden: a control that vanishes
   *  teaches nothing, and the author goes looking for it again tomorrow. */
  disabled?: boolean;
  reason?: string;
  /** Destructive colouring, and always last with a rule above it. */
  danger?: boolean;
  /** Draw a divider above this row. */
  separator?: boolean;
  /** A small pill on the right of the row — the reference's "New" on Save as a template. */
  badge?: string;
}

/** What the menu is being opened on. */
export type MenuTargetKind = "section" | "widget";

/** The facts the menu needs. All of them are already on screen. */
export interface MenuFacts {
  kind: MenuTargetKind;
  /** This part cannot be removed — the law put it there, not the author. */
  locked?: boolean;
  /** Something is on the builder's clipboard. */
  canPaste?: boolean;
  /** Why this part is locked, in the client's words. */
  lockedReason?: string;
  /** "Save as default" is offered where the adapter can store one. */
  canSaveBlock?: boolean;
  /**
   * WHAT THIS ELEMENT IS CALLED, for the first row.
   *
   * The reference writes "Edit Text Editor", "Edit Container" — the element's
   * own name, which is the same name the settings panel puts at its top. The
   * caller reads it off the registry; this module does not import one, so it
   * stays pure.
   */
  name?: string;
  /** Saving a global is a paid row in the reference and a tier row in ours. */
  canSaveGlobal?: boolean;
}

const DEFAULT_LOCKED_REASON =
  "This part has to stay — it carries something the law asks for on every send. You can change the wording inside it.";

/**
 * The menu for one part of the page, in the reference editor's own order.
 *
 * Delete is last, separated, and destructive-coloured — the reference puts it
 * there, and a Delete next to Duplicate is a Delete somebody presses by
 * accident.
 */
export function menuFor(f: MenuFacts): MenuItem[] {
  const lockedReason = f.lockedReason || DEFAULT_LOCKED_REASON;
  const nothingCopied = "Nothing has been copied yet.";
  const items: MenuItem[] = [];

  items.push({ action: "edit", label: `Edit ${f.name || (f.kind === "section" ? "Container" : "Widget")}` });

  items.push({
    action: "duplicate",
    label: "Duplicate",
    shortcut: CHORD.duplicate,
    disabled: !!f.locked,
    ...(f.locked ? { reason: lockedReason } : {}),
  });
  /* THE CONTAINER'S THIRD ROW (D-172, round 2). Driven on 2026-09-19: a
     container's menu has "Add New Container" between Duplicate and Copy, and a
     widget's does not. Ours gave a container the widget menu, so the one row
     that says "put another box here" was missing from the one thing it
     applies to. */
  if (f.kind === "section") {
    items.push({ action: "addContainer", label: "Add New Container" });
  }
  items.push({ action: "copy", label: "Copy", shortcut: CHORD.copy });
  items.push({
    action: "paste",
    label: "Paste",
    shortcut: CHORD.paste,
    disabled: !f.canPaste,
    ...(f.canPaste ? {} : { reason: nothingCopied }),
  });
  items.push({
    action: "pasteStyle",
    label: "Paste style",
    shortcut: CHORD.pasteStyle,
    disabled: !f.canPaste,
    ...(f.canPaste ? {} : { reason: nothingCopied }),
  });
  /* THE REFERENCE'S ROW, GREYED, AND HONESTLY SO. It has "interactions" —
     hover and click behaviours — and we do not carry any, so the row says what
     it would do and why it cannot. A row that is missing teaches nothing; a row
     that lies is worse. */
  items.push({
    action: "pasteInteractions",
    label: "Paste interactions",
    disabled: true,
    reason: "Nothing on this page has a hover or click behaviour to copy yet.",
  });
  /* PRESSABLE, ALWAYS (D-172, round 2). Driven on 2026-09-19: with an empty
     clipboard the reference greys Paste and Paste style and leaves THIS row
     pressable, because it does not read our clipboard — it reads what was
     copied in another business's builder. Ours greyed it with "Nothing has
     been copied yet.", which is an answer to a different question. */
  items.push({ action: "pasteFromOtherSite", label: "Paste from other site" });

  items.push({ action: "resetStyle", label: "Reset style", separator: true });
  /* "SAVE AS A GLOBAL" IS A WIDGET ROW ONLY (D-172, round 2).
     Driven on 2026-09-19: right-click a container and the reference's
     fourteen rows do not include it at all; right-click a widget and it is
     there, greyed, as the Pro row. Ours handed a container the widget menu, so
     a box offered a greyed row for a thing a box cannot be. */
  if (f.kind !== "section") {
    items.push({
      action: "saveGlobal",
      label: "Save as a global",
      disabled: !f.canSaveGlobal,
      ...(f.canSaveGlobal ? {} : { reason: "Saving something as a global is not on this plan." }),
    });
  }
  /* "SAVE AS A TEMPLATE" IS A CONTAINER ROW (D-172, round 2). Driven on
     2026-09-19: the container menu has it, with a "New" badge on the right,
     between Reset style and Save as default; the widget menu does not. */
  if (f.kind === "section") {
    items.push({
      action: "saveTemplate",
      label: "Save as a template",
      badge: "New",
      disabled: !f.canSaveBlock,
      ...(f.canSaveBlock ? {} : { reason: "This builder has nowhere to keep one." }),
    });
  }
  items.push({
    action: "saveDefault",
    label: "Save as default",
    disabled: !f.canSaveBlock,
    ...(f.canSaveBlock ? {} : { reason: "This builder has nowhere to keep one." }),
  });

  items.push({ action: "structure", label: "Structure", shortcut: CHORD.structure, separator: true });

  items.push({
    action: "delete", label: "Delete", shortcut: CHORD.delete, separator: true, danger: true,
    disabled: !!f.locked,
    ...(f.locked ? { reason: lockedReason } : {}),
  });

  return items;
}

/**
 * THE DOCUMENT MENU — right-click the page itself (D-172, round 2).
 *
 * Driven on 2026-09-19: right-clicking the empty page, or the add area at the
 * foot of it, opens a FIVE-row menu of its own — Paste, Paste from other site,
 * Copy All Content, Delete All Content, Structure. Ours opened the browser's
 * own menu, which is the one place in the editor where the page stopped being
 * the editor.
 */
export function documentMenu(f: { canPaste?: boolean; empty?: boolean }): MenuItem[] {
  const nothingCopied = "Nothing has been copied yet.";
  return [
    {
      action: "paste", label: "Paste", shortcut: CHORD.paste,
      disabled: !f.canPaste, ...(f.canPaste ? {} : { reason: nothingCopied }),
    },
    { action: "pasteFromOtherSite", label: "Paste from other site" },
    {
      action: "copyAll", label: "Copy All Content",
      disabled: !!f.empty, ...(f.empty ? { reason: "There is nothing on the page yet." } : {}),
    },
    {
      action: "deleteAll", label: "Delete All Content", danger: true,
      disabled: !!f.empty, ...(f.empty ? { reason: "There is nothing on the page yet." } : {}),
    },
    { action: "structure", label: "Structure", shortcut: CHORD.structure, separator: true },
  ];
}

export default { menuFor, documentMenu, CHORD };

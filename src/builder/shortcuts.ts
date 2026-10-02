/**
 * builder/shortcuts.ts — THE keyboard map.
 *
 * D-18 (BUILDER_USER_TEST_2026-09-16): *"the toolbar's tooltip literally reads
 * 'Undo (Ctrl+Z)'. The keystroke does nothing."* An advertised shortcut that
 * does nothing is worse than no shortcut: it teaches the author that the
 * builder ignores them.
 *
 * ── ONE MAP, NOT A HANDLER PER SURFACE ────────────────────────────────────
 * The frame listens once and asks this module what a keystroke means. No
 * component writes `e.key === "z" && e.ctrlKey` of its own, so a shortcut
 * cannot work in one builder and not another — and the whole map is a pure
 * function a test can drive without a browser.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────
 * Backspace does NOT delete the selection. On a page whose text is edited in
 * place, the reflex "backspace to fix a typo" is one stray click away from
 * "the pricing table is gone", and an undo the author did not know they needed
 * is not a safety net. Delete deletes; Backspace never does.
 */

/** What a keystroke means to the builder. */
export type BuilderAction =
  /** Undo one step. */
  | "undo"
  /** Redo one step. */
  | "redo"
  /** Save, through the adapter's own save. */
  | "save"
  /** Open Find — one box for sections, things to add, and what to do (M-22). */
  | "find"
  /** Open "What you've changed" — the named history you can travel in (M-7). */
  | "history"
  /** Remove whatever is selected (a locked widget refuses, and says why). */
  | "delete"
  /** Deselect; with nothing selected, ask to close. */
  | "escape"
  /* ── ELEMENTOR PARITY (§11.13.1 item 6, D-165) ──────────────────────────
     Every one of these is a chord the real editor answers, checked against it
     on 2026-09-19. A builder that advertises "works like Elementor" and then
     ignores Ctrl+D is D-18 wearing a different hat. */
  /** Copy what is selected. */
  | "copy"
  /** Paste beside what is selected. */
  | "paste"
  /** Paste only the STYLE onto what is selected. */
  | "pasteStyle"
  /** Duplicate what is selected, in place. */
  | "duplicate"
  /** Open or close the floating Structure window. */
  | "structure"
  /** Show or hide the widgets panel, to give the page the width. */
  | "togglePanel"
  /** Desktop → tablet → phone → desktop. */
  | "cycleDevice"
  /* ── D-172 round 2: three chords the reference's OWN shortcuts panel lists
     and ours answered with nothing. Driven on 2026-09-19 — the panel reads
     "Page Settings Ctrl Shift Y", "Template Library Ctrl Shift L",
     "Keyboard Shortcuts Shift ?" — and an advertised shortcut that does
     nothing is D-18 wearing a different hat, which is why they are here and
     not in a comment.

     ITS "Site Settings Ctrl K" AND "User Preferences Ctrl Shift U" ARE NOT
     HERE, deliberately: we have neither panel, and pointing a chord at a door
     it does not open is the lie this file exists to prevent. Recorded as an
     agreed omission in the handoff. */
  /** Open the document's own settings — the reference's Page Settings. */
  | "pageSettings"
  /** Open the template library. */
  | "templates"
  /** Open the keyboard-shortcuts list itself. */
  | "shortcuts";

/** A keyboard event, reduced to what the map actually reads. */
export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/** The element a keystroke landed on, reduced to what decides "is this typing". */
export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  type?: string;
}

/**
 * Is the author typing rather than driving the builder?
 *
 * The canvas IS a text editor — every run of words on the page is
 * contentEditable — so a map that did not ask this would delete the selected
 * section the first time somebody pressed Delete in the middle of a sentence.
 */
export function isTypingTarget(t: TargetLike | null | undefined): boolean {
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = String(t.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * THE map.
 *
 * `ctrlKey || metaKey` so the same map serves Windows and a Mac; the Portal
 * ships to both and two maps would be two answers.
 *
 * While the author is TYPING, most chord shortcuts still apply — Ctrl+Z inside
 * a paragraph must still undo, because the browser's own undo does not know
 * about the model — and Delete is left to the text field.
 *
 * THE FOUR THAT DO NOT (D-165): Ctrl+C, Ctrl+V, Ctrl+Shift+V and Ctrl+D. The
 * caret is in a sentence; "copy" means those words, not the widget around
 * them, and a builder that duplicated the pricing table because somebody
 * pressed Ctrl+C mid-word would be unusable. `TYPING_PASSES_THROUGH` names
 * them once so the map and the test read the same list.
 */
export const TYPING_PASSES_THROUGH: BuilderAction[] = ["copy", "paste", "pasteStyle", "duplicate"];

export function matchShortcut(e: KeyLike, target?: TargetLike | null): BuilderAction | null {
  const mod = !!(e.ctrlKey || e.metaKey);
  const key = String(e.key || "");
  const lower = key.toLowerCase();
  const typingNow = isTypingTarget(target);

  if (mod && !e.altKey) {
    const chord = modChord(lower, !!e.shiftKey);
    if (chord && typingNow && TYPING_PASSES_THROUGH.includes(chord)) return null;
    return chord;
  }
  if (e.altKey) return null;

  /**
   * ESCAPE ALWAYS MEANS ESCAPE — including with the caret in the words.
   *
   * FOUND BY DRIVING IT (2026-09-17). On this canvas every run of text on the
   * page IS a text field, so a rule that left Escape to the text field left it
   * to the text field permanently: the key did nothing anywhere in the
   * builder, which is D-18 wearing a different hat. The frame stops it from
   * reaching the modal either way, so nothing can close behind the author.
   */
  if (key === "Escape") return "escape";
  if (key === "Delete" && !typingNow) return "delete";
  /* SHIFT+? OPENS THE SHORTCUTS LIST (D-172 round 2, the reference's own row).
     Not while the author is typing: "?" is a character. `key` is already "?"
     on a shifted slash on every layout the browser reports, so the shift flag
     is belt and braces rather than the test. */
  if (key === "?" && !typingNow) return "shortcuts";
  return null;
}

/** The Ctrl/Cmd chords, in one place. `lower` is the key, lower-cased. */
/** The Ctrl/Cmd chords, in one place. `lower` is the key, lower-cased. */
function modChord(lower: string, shift: boolean): BuilderAction | null {
  if (lower === "z") return shift ? "redo" : "undo";
  /* SHIFT FIRST ON `y`, FOUND BY DRIVING IT (D-172, round 2).
     `Ctrl+Y` is the second redo chord and `Ctrl+Shift+Y` is the reference's
     Page Settings — and the plain answer was given first, so pressing
     Ctrl+Shift+Y in our builder REDID the last undone step instead of opening
     the panel. An advertised shortcut that does something else is worse than
     one that does nothing: the row was in our own shortcuts table. Exactly the
     trap `v` already carries a note about, three lines down. */
  if (lower === "y") return shift ? "pageSettings" : "redo";
  if (lower === "s") return "save";
  // M-22. `Ctrl+E` and not `Ctrl+F`: the browser's own Find is a useful thing
  // to leave alone on a page whose whole content is text, and the reference
  // editor's Finder is on this chord for the same reason.
  if (lower === "e") return "find";
  // M-7. `Ctrl+Shift+H`, because Ctrl+H is the browser's history.
  if (lower === "h" && shift) return "history";
  /* ── D-165, the reference editor's own chords ────────────────────────────
     SHIFT IS TESTED BEFORE THE PLAIN CHORD on `v`: `Ctrl+Shift+V` is paste
     style and `Ctrl+V` is paste, and a map that answered "paste" first would
     make paste-style unreachable — which is how an advertised shortcut
     becomes a lie. */
  if (lower === "v") return shift ? "pasteStyle" : "paste";
  if (lower === "c") return "copy";
  if (lower === "d") return "duplicate";
  if (lower === "i") return "structure";
  if (lower === "p") return "togglePanel";
  if (lower === "m" && shift) return "cycleDevice";
  /* D-172 round 2 — the reference's Panels group, driven 2026-09-19.
     Page Settings is answered ABOVE, with the other `y` chord, so the two
     cannot be written in an order where one hides the other. */
  if (lower === "l" && shift) return "templates";
  return null;
}

/** Whether this action's default browser behaviour has to be suppressed. */
export function preventsDefault(action: BuilderAction): boolean {
  // Ctrl+S opens "Save page as…", Ctrl+Z inside the canvas runs the browser's
  // own text undo behind the model's back, Ctrl+D bookmarks the page, Ctrl+P
  // prints it, and Delete scrolls some browsers.
  // Escape does not: the modal's own handler is allowed to see it if the
  // builder does not stop it.
  return action !== "escape";
}

/**
 * What the "?" panel and the tooltips say, so both read the same list.
 *
 * `shortcutHelpGaps` pins that every action the map can return has a row
 * here: an action nobody wrote down is one the author will never find, which
 * is D-18 with the arrow pointing the other way.
 */
/**
 * THE TWO HEADINGS ARE THE REFERENCE'S OWN (D-172, round 2).
 *
 * Driven on 2026-09-19 — `$e.run("shortcuts/open")`, read the modal — the
 * reference's table is split under exactly two words: **Actions** (Undo, Redo,
 * Copy, Paste, Paste Style, Delete, Duplicate, Save) and **Panels** (Finder,
 * Show / Hide Panel, Site Settings, Structure, Page Settings, History, User
 * Preferences, Go To Responsive Mode, Template Library, Keyboard Shortcuts,
 * Quit). Ours was one flat table of sixteen rows.
 */
export type ShortcutGroup = "Actions" | "Panels";

export const SHORTCUT_GROUPS: ShortcutGroup[] = ["Actions", "Panels"];

export const SHORTCUT_HELP: Array<{
  keys: string; what: string; group: ShortcutGroup; action?: BuilderAction;
}> = [
  /* ── Actions, in the reference's own order ──────────────────────────── */
  { keys: "Ctrl + Z", what: "Undo", group: "Actions", action: "undo" },
  { keys: "Ctrl + Shift + Z", what: "Redo", group: "Actions", action: "redo" },
  { keys: "Ctrl + C", what: "Copy", group: "Actions", action: "copy" },
  { keys: "Ctrl + V", what: "Paste", group: "Actions", action: "paste" },
  { keys: "Ctrl + Shift + V", what: "Paste Style", group: "Actions", action: "pasteStyle" },
  { keys: "Delete", what: "Delete", group: "Actions", action: "delete" },
  { keys: "Ctrl + D", what: "Duplicate", group: "Actions", action: "duplicate" },
  { keys: "Ctrl + S", what: "Save", group: "Actions", action: "save" },
  /* ── Panels, in the reference's own order, minus the two panels we do not
        have. Site Settings and User Preferences are an agreed omission. ── */
  { keys: "Ctrl + E", what: "Finder", group: "Panels", action: "find" },
  { keys: "Ctrl + P", what: "Show / Hide Panel", group: "Panels", action: "togglePanel" },
  { keys: "Ctrl + I", what: "Structure", group: "Panels", action: "structure" },
  { keys: "Ctrl + Shift + Y", what: "Page Settings", group: "Panels", action: "pageSettings" },
  { keys: "Ctrl + Shift + H", what: "History", group: "Panels", action: "history" },
  { keys: "Ctrl + Shift + M", what: "Go To Responsive Mode", group: "Panels", action: "cycleDevice" },
  { keys: "Ctrl + Shift + L", what: "Template Library", group: "Panels", action: "templates" },
  { keys: "Shift + ?", what: "Keyboard Shortcuts", group: "Panels", action: "shortcuts" },
  { keys: "Escape", what: "Quit", group: "Panels", action: "escape" },
];

/* TWO ROWS WERE HERE AND ARE DELETED (D-172, round 2), not restyled:
     · "/  — On an empty line, choose something to add". THE SCREEN LAW item 1
       forbids a slash command and the reference has none anywhere in its
       editor; the row advertised a thing that does not exist.
     · "Right-click — Everything you can do to a section or a block". Every
       row in the reference's table is a key chord. Right-click still opens the
       menu; it is not a keyboard shortcut and it is not in this list.
   `matchShortcut` never answered either, so nothing loses a behaviour. */

/** Every action the map can return. The help list is checked against this. */
export const ALL_ACTIONS: BuilderAction[] = [
  "undo", "redo", "save", "find", "history", "delete", "escape",
  "copy", "paste", "pasteStyle", "duplicate", "structure", "togglePanel", "cycleDevice",
  "pageSettings", "templates", "shortcuts",
];

/** The rows of one heading, in order. The panel draws two of these. */
export function shortcutsIn(group: ShortcutGroup): typeof SHORTCUT_HELP {
  return SHORTCUT_HELP.filter((r) => r.group === group);
}

/** Actions with no row in SHORTCUT_HELP. Empty, or the help is a lie. */
export function shortcutHelpGaps(): BuilderAction[] {
  const written = new Set(SHORTCUT_HELP.map((r) => r.action).filter(Boolean));
  return ALL_ACTIONS.filter((a) => !written.has(a));
}

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
  | "cycleDevice";

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
  return null;
}

/** The Ctrl/Cmd chords, in one place. `lower` is the key, lower-cased. */
/** The Ctrl/Cmd chords, in one place. `lower` is the key, lower-cased. */
function modChord(lower: string, shift: boolean): BuilderAction | null {
  if (lower === "z") return shift ? "redo" : "undo";
  if (lower === "y") return "redo";
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
export const SHORTCUT_HELP: Array<{ keys: string; what: string; action?: BuilderAction }> = [
  { keys: "Ctrl + Z", what: "Undo the last change", action: "undo" },
  { keys: "Ctrl + Shift + Z", what: "Redo it", action: "redo" },
  { keys: "Ctrl + S", what: "Save", action: "save" },
  { keys: "Ctrl + C", what: "Copy what is selected", action: "copy" },
  { keys: "Ctrl + V", what: "Paste it beside what is selected", action: "paste" },
  { keys: "Ctrl + Shift + V", what: "Paste only the look of it", action: "pasteStyle" },
  { keys: "Ctrl + D", what: "Make a copy of what is selected, in place", action: "duplicate" },
  { keys: "Ctrl + I", what: "Show or hide the Structure window", action: "structure" },
  { keys: "Ctrl + E", what: "Find a section, something to add, or what to do", action: "find" },
  { keys: "Ctrl + P", what: "Show or hide the widgets panel", action: "togglePanel" },
  { keys: "Ctrl + Shift + M", what: "Computer, tablet, phone — round again", action: "cycleDevice" },
  { keys: "Ctrl + Shift + H", what: "What you've changed — and go back to any of it", action: "history" },
  { keys: "Right-click", what: "Everything you can do to a section or a block" },
  { keys: "Delete", what: "Remove what is selected", action: "delete" },
  { keys: "Escape", what: "Deselect — press it again to close", action: "escape" },
  { keys: "/", what: "On an empty line, choose something to add" },
];

/** Every action the map can return. The help list is checked against this. */
export const ALL_ACTIONS: BuilderAction[] = [
  "undo", "redo", "save", "find", "history", "delete", "escape",
  "copy", "paste", "pasteStyle", "duplicate", "structure", "togglePanel", "cycleDevice",
];

/** Actions with no row in SHORTCUT_HELP. Empty, or the help is a lie. */
export function shortcutHelpGaps(): BuilderAction[] {
  const written = new Set(SHORTCUT_HELP.map((r) => r.action).filter(Boolean));
  return ALL_ACTIONS.filter((a) => !written.has(a));
}

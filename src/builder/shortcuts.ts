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
  | "escape";

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
 * While the author is TYPING, only the chord shortcuts and Escape apply —
 * Ctrl+Z inside a paragraph must still undo, because the browser's own undo
 * does not know about the model — and Delete is left to the text field.
 */
export function matchShortcut(e: KeyLike, target?: TargetLike | null): BuilderAction | null {
  const mod = !!(e.ctrlKey || e.metaKey);
  const key = String(e.key || "");
  const lower = key.toLowerCase();

  if (mod && !e.altKey) {
    if (lower === "z") return e.shiftKey ? "redo" : "undo";
    if (lower === "y") return "redo";
    if (lower === "s") return "save";
    // M-22. `Ctrl+E` and not `Ctrl+F`: the browser's own Find is a useful
    // thing to leave alone on a page whose whole content is text, and
    // Elementor's Finder is on this chord for the same reason.
    if (lower === "e") return "find";
    // M-7. `Ctrl+Shift+H`, because Ctrl+H is the browser's history.
    if (lower === "h" && e.shiftKey) return "history";
    return null;
  }
  if (e.altKey) return null;

  const typing = isTypingTarget(target);
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
  if (key === "Delete" && !typing) return "delete";
  return null;
}

/** Whether this action's default browser behaviour has to be suppressed. */
export function preventsDefault(action: BuilderAction): boolean {
  // Ctrl+S opens "Save page as…", Ctrl+Z inside the canvas runs the browser's
  // own text undo behind the model's back, and Delete scrolls some browsers.
  // Escape does not: the modal's own handler is allowed to see it if the
  // builder does not stop it.
  return action !== "escape";
}

/** What the "?" panel and the tooltips say, so both read the same list. */
export const SHORTCUT_HELP: Array<{ keys: string; what: string }> = [
  { keys: "Ctrl + Z", what: "Undo the last change" },
  { keys: "Ctrl + Shift + Z", what: "Redo it" },
  { keys: "Ctrl + S", what: "Save" },
  { keys: "Ctrl + E", what: "Find a section, something to add, or what to do" },
  { keys: "Ctrl + Shift + H", what: "What you've changed \u2014 and go back to any of it" },
  { keys: "Right-click", what: "Everything you can do to a section or a block" },
  { keys: "Delete", what: "Remove what is selected" },
  { keys: "Escape", what: "Deselect — press it again to close" },
  { keys: "/", what: "On an empty line, choose something to add" },
];

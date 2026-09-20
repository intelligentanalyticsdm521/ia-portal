/**
 * builder/controlCondition.ts — ELEMENTOR'S `condition`, as arithmetic.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * The settings audit's round 4 (BUILDER_SCREEN_PARITY_settings_2026-09-19.md)
 * found ONE missing mechanism behind seven rows: *"Nothing on a widget's
 * Content tab is conditional."* The reference hides Icon's Shape until View is
 * not Default, hides a Divider's HTML Tag and Icon until Add Element is set,
 * hides an Image's url box until Link is Custom URL, its Lightbox until Link is
 * Media File and its Object Fit until a Height is set, and hides a Button's
 * Icon Position and Icon Spacing until Text and Icon are BOTH set. Ours drew
 * every one of them all the time.
 *
 * ── THESE ARE THE REFERENCE'S OWN CONDITIONS, DRIVEN, NOT REMEMBERED ──────
 * Read out of a live Elementor 4.2.4 on 2026-09-20 with Playwright on the
 * installed Chrome — `elementor.widgetsCache[<widget>].controls[<key>]
 * .condition` — by `elementor-reference/scripts/zz-settings-fix-conditions.js`;
 * the capture is `elementor-reference/widgets/_zz_settings_fix_conditions.json`.
 * What it says, to the character:
 *
 *   heading.size        { "size!": "default" }        ← its own default, so it
 *                                                       NEVER fires: the control
 *                                                       is never on the panel
 *   button.size         { "size[value]!": "sm" }      ← the same, never fires
 *   image.link          { "link_to": "custom" }
 *   image.open_lightbox { "link_to": "file" }
 *   image.object-fit    { "height[size]!": "" }
 *   divider.html_tag    { "look": "line_text" }
 *   divider.icon        { "look": "line_icon" }
 *   icon.shape          { "view!": "default" }
 *   button.icon_align   { "text!": "", "selected_icon[value]!": "" }
 *   button.icon_indent  { "text!": "", "selected_icon[value]!": "" }
 *
 * ── WHY THE ARITHMETIC IS HERE AND NOT IN definitionControls.tsx ──────────
 * The same reason `repeater.ts` exists: the panel's own file imports React, and
 * `scripts/test-ts-loader.mjs` says in as many words that only PURE modules
 * belong under `node --test`. So "is this control shown?" is answered once,
 * here, where the tests EXECUTE it, and `definitionControls.tsx` only draws.
 * One mechanism, one answer — a family that writes a condition writes no code.
 */

/**
 * ONE TERM PER ENTRY, and the key may end in `!` for "is not".
 *
 * Elementor's own shape. A value that is an ARRAY means "is one of these",
 * which is how its container controls say `{ container_type: ["flex"] }`.
 */
export type ControlCondition = Record<string, unknown>;

/**
 * WHAT A CONTROL'S STORED VALUE IS, FOR THE PURPOSE OF A CONDITION.
 *
 * Desktop only: Elementor's conditions are not per device, and a control that
 * appeared on a phone and vanished on a tablet would be a panel that changes
 * shape under the author's hand.
 *
 * An icon is the one value stored two ways on this platform — Elementor's
 * `{ value, library }` object and, where the panel offers a plain select, the
 * bare string. `glyphFor` already reads both; so does this, so a condition
 * written `selected_icon!` means the same thing whichever one the document
 * happens to hold.
 */
export function conditionValue(props: Record<string, unknown> | undefined | null, key: string): unknown {
  const raw = (props || {})[key];
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "value" in (raw as object)) {
    return (raw as { value?: unknown }).value;
  }
  return raw;
}

/** `undefined`, `null` and `""` are all "not set". Zero and false are NOT. */
function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

/** One term: does `value` satisfy `want`? An array means "is one of these". */
function termMet(value: unknown, want: unknown): boolean {
  if (Array.isArray(want)) return want.some((w) => termMet(value, w));
  if (isBlank(want)) return isBlank(value);
  return String(value ?? "") === String(want);
}

/**
 * IS EVERY TERM OF THIS CONDITION TRUE?
 *
 * All terms, never any: Elementor's `condition` is an AND, which is why a
 * Button's Icon Position waits for the words AND the icon. (Its `conditions`
 * object, which can say `or`, is a separate control field and is not declared
 * anywhere on this platform yet — when one is, it goes here, not beside here.)
 *
 * An absent or empty condition is "always", so a control that says nothing is
 * drawn exactly as it was before this file existed.
 */
export function conditionMet(
  condition: ControlCondition | undefined | null,
  props: Record<string, unknown> | undefined | null,
): boolean {
  if (!condition || typeof condition !== "object") return true;
  const terms = Object.entries(condition);
  if (!terms.length) return true;
  for (const [rawKey, want] of terms) {
    const negated = rawKey.endsWith("!");
    const key = negated ? rawKey.slice(0, -1) : rawKey;
    const met = termMet(conditionValue(props, key), want);
    if (negated ? met : !met) return false;
  }
  return true;
}

/** The whole question, asked of a control the way the panel asks it. */
export function controlIsShown(
  control: { condition?: ControlCondition } | null | undefined,
  props: Record<string, unknown> | undefined | null,
): boolean {
  return conditionMet(control?.condition, props);
}

export default { conditionMet, conditionValue, controlIsShown };

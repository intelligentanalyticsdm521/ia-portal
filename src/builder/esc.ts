/**
 * builder/esc.ts — THE ONE ESCAPER, in a module that imports nothing.
 *
 * ── WHY IT LEFT render.ts (D-168 item 5, the seam gap five families hit) ──
 * Every widget file needs `esc`, and `esc` lived in `render.ts`. `render.ts`
 * imports `widgets/families/index.ts` for `renderFamily`, and that index builds
 * its tables at module top level. So a family folder that imports `esc` from
 * `render.ts` closes a real cycle: enter the family first — which is exactly
 * what that family's own test does — and `families/index.ts` is asked for
 * `FAMILIES` while the family it is reading is still half-evaluated:
 *
 *     ReferenceError: Cannot access 'F5_SLIDERS_REVIEWS' before initialization
 *
 * Found by RUNNING a family test, not by reading, and reported by f1-words
 * (§6.6) and f5-sliders-reviews (S5) independently. A module with no imports
 * cannot be half-built, which is the same reason `widgets/kinds.ts` exists.
 *
 * `render.ts` re-exports this, so every caller that already says
 * `import { esc } from "./render"` is unchanged and there is still exactly one
 * escaper. **A family folder imports it from HERE.**
 */

/** HTML-escape a value for a text node or a double-quoted attribute. */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

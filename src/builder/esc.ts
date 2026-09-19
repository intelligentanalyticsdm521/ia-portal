/**
 * builder/esc.ts — THE ONE ESCAPER, in a module that imports nothing.
 *
 * It was a `function esc` in `render.ts` and it still is the same four
 * replacements; `render.ts` re-exports it, so every existing caller is
 * unchanged and there is still exactly one of these on the platform (the
 * inventory found three).
 *
 * ── WHY IT MOVED (B-168, f4-moving, 2026-09-19) ───────────────────────────
 * A family widget under `widgets/families/<family>/` has to escape what it
 * draws. Importing `esc` from `render.ts` pulls `render.ts` into the family's
 * own module graph, and `render.ts` imports `widgets/families/index.ts`, whose
 * body is a top-level `const FAMILIES = [ …every family… ]`. Enter the graph at
 * a family folder — which the family's own test does — and that const is read
 * while the family module is still evaluating:
 *
 *     ReferenceError: Cannot access 'F4_MOVING' before initialization
 *
 * Proved by running it, not by reading it. A module with no imports cannot be
 * half-built, so this is the same fix `widgets/kinds.ts` already uses for the
 * same reason, and it is what lets `render.ts` read `FAMILY_RENDERED_KINDS` at
 * the top level at all.
 *
 * **A family widget file imports `esc` from HERE, never from `render`.**
 */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

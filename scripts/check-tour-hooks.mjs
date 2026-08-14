#!/usr/bin/env node
/**
 * check-tour-hooks.mjs — every selector a journey step points at must resolve
 * to a data-tour hook that actually exists in the app.
 *
 * WHY THIS EXISTS
 * ---------------
 * Brandon 2026-07-28: "we got to the start a campaign and then nothing popped
 * up afterwards." A journey step targeted a field that only renders after a
 * channel is picked, so the runner waited, gave up, and (at the time) silently
 * skipped — taking the next two steps with it and ending the walkthrough.
 *
 * The runner no longer fails silently, but a stalled step is still a broken
 * walkthrough. This catches the mismatch at build time instead of on a walk.
 *
 * Run:  node scripts/check-tour-hooks.mjs
 * Exits 1 on any unresolved selector.
 *
 * KNOWN BLIND SPOT: generated families (data-tour={`campaign-channel-${key}`})
 * can only be matched as a pattern, so a wrong suffix inside a real family —
 * "campaign-channel-carrierpigeon" — passes this check and still stalls at
 * runtime. Static analysis can't know the key set. The runner's visible
 * "can't find that control" state is the backstop for those.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(fileURLToPath(new URL("../src", import.meta.url)));

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(entry)) files.push(p);
  }
})(SRC);

// ── What the app actually renders ────────────────────────────────────────────
// Covers the four shapes in this codebase:
//   data-tour="x"            literal
//   data-tour={`x-${key}`}   generated family
//   data-tour={cond ? "x" : undefined}   conditional
//   dataTour="x"             prop forwarded onto a child component
//
// CRITICAL: a `data-tour="x"` inside a CSS selector string — `'button[data-tour=
// "x"]'` — is a CONSUMER, not a hook. Counting those made the first version of
// this script validate selectors against other selector files (interactiveFlows
// .ts vouching for journeys/), so it passed while the walkthrough was broken.
// A hook is a JSX attribute, so it is never preceded by `[`.
const literal = new Set();
const templates = [];
const HOOK = /(.?)data-?[Tt]our=(?:"([^"]+)"|\{((?:[^{}]|\$\{[^}]*\})*)\})/g;
for (const f of files) {
  if (f.includes("journeys") || f.includes("walkthroughs")) continue;
  for (const m of readFileSync(f, "utf8").matchAll(HOOK)) {
    if (m[1] === "[") continue; // selector string, not a rendered attribute
    if (m[2]) { literal.add(m[2]); continue; }
    const expr = m[3];
    for (const s of expr.matchAll(/"([^"]+)"/g)) literal.add(s[1]);   // ternary arms
    for (const s of expr.matchAll(/`([^`]+)`/g)) templates.push(s[1]); // generated
  }
}
const tmplRe = templates.map(
  (t) => new RegExp("^" + t.replace(/\$\{[^}]+\}/g, "[A-Za-z0-9_-]+") + "$"),
);

// ── What the journeys ask for ────────────────────────────────────────────────
const missing = [];
for (const f of files.filter((f) => f.includes("journeys"))) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    const m = line.match(/data-tour="([^"]+)"/);
    if (!m) return;
    const want = m[1];
    if (literal.has(want) || tmplRe.some((r) => r.test(want))) return;
    missing.push(`  ${relative(SRC, f)}:${i + 1}  →  ${want}`);
  });
}

console.log(
  `Tour hooks: ${literal.size} literal, ${templates.length} generated.`,
);
if (missing.length) {
  console.error(
    `\n✗ ${missing.length} journey selector(s) have no matching hook.\n` +
      `  The walkthrough will stall on these steps.\n\n${missing.join("\n")}\n`,
  );
  process.exit(1);
}
console.log("✓ Every journey selector resolves to a real hook.");

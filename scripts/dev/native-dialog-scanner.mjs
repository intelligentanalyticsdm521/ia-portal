// scripts/dev/native-dialog-scanner.mjs — ONE scanner for the browser's grey boxes.
//
// BUILDER_PLATFORM_SCOPE_2026-09-15 §11.11. `confirm` / `prompt` / `alert` are
// the browser's own dialogs: chrome-coloured, "localhost:5174 says", OK/Cancel
// whatever the question was, unstylable, tab-blocking, and on a phone they land
// at the top of the screen miles from the button that raised them.
//
// This module is the single place that decides what counts as one, so the
// guard (test/builder-usability-cleanup.test.mjs) and the ratchet regenerator
// (scripts/dev/regen-native-dialog-ratchet.mjs) can never drift apart.
//
// WHY BOTH SPELLINGS. The first version of the guard matched only
//   /\bwindow\.(confirm|prompt|alert)\s*\(/
// which is one of the two ways to write the same call. A verifier dropped a
// bare `confirm("Are you sure?")` into a swept file on 2026-09-17 and the guard
// stayed green — 211 live calls were sitting under the sweep at the time,
// invisible to it. A guard that cannot fail its own mutation test is not a
// guard.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * A CALL to one of the three, in either spelling, and nothing else.
 *
 *   (?<![.\w$])          not a member access on something else, and not the
 *                        tail of a longer identifier — `dialog.confirm(`,
 *                        `modal.alert(`, `myAlert(` and `reconfirm(` are all
 *                        somebody else's function, not the browser's.
 *   (?:window\s*\.\s*)?  `window.confirm(` and bare `confirm(` are the same
 *                        call; the lookbehind above sits in front of `window`
 *                        in the qualified spelling.
 *   (confirm|prompt|alert)
 *   \s*\(                a CALL. A mention, a type, a prop named `confirm`,
 *                        `onConfirm={…}` — none of those reach the paren.
 */
export const NATIVE_DIALOG_CALL =
  /(?<![.\w$])(?:window\s*\.\s*)?(confirm|prompt|alert)\s*\(/g;

/**
 * Blank out comments, KEEPING the line and column count so a hit still reports
 * the line a human would open the file to.
 *
 * Comments are blanked because the files that dropped a native dialog say so in
 * the comment above the replacement, and a scanner that cannot tell a mention
 * from a call is a scanner that gets deleted the first time it cries wolf.
 *
 * CRLF. The old spelling of the line-comment rule was `/(^|[^:\w])\/\/.*$/`,
 * which never fired once in this repo: every file is CRLF, `.` does not match
 * `\r`, so `.*` stopped short of the `$` and the match failed. Line comments
 * were passing through UNSTRIPPED the whole time. `[^\r\n]*` with no anchor is
 * CR-tolerant and cannot regress that way.
 *
 * `[^:\w]` in front keeps `https://…` inside a string from eating the rest of
 * the line.
 */
export function stripComments(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, " "));
  return noBlock.replace(
    /(^|[^:\w])\/\/[^\r\n]*/gm,
    (m, p1) => p1 + " ".repeat(m.length - p1.length),
  );
}

/** Every native-dialog call in `src`, as `{ kind, line }` — line is 1-based. */
export function nativeDialogSites(src) {
  const code = stripComments(src);
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === "\n") starts.push(i + 1);
  const lineOf = (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const out = [];
  for (const m of code.matchAll(NATIVE_DIALOG_CALL)) {
    out.push({ kind: m[1], line: lineOf(m.index) });
  }
  return out;
}

/** Just the names, in source order — `["confirm", "alert", …]`. */
export function nativeDialogHits(src) {
  return nativeDialogSites(src).map((s) => s.kind);
}

/** Every .ts/.tsx file under `dir`, recursively, absolute paths, sorted. */
export function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Scan one tree. Returns `{ counts, sites }` keyed by the path RELATIVE to
 * `srcRoot`, in posix spelling so the checked-in JSON is the same on Windows
 * and on the build agent.
 */
export function scanTree(srcRoot, relTree) {
  const counts = {};
  const sites = {};
  for (const file of filesUnder(path.join(srcRoot, relTree))) {
    const found = nativeDialogSites(readFileSync(file, "utf8"));
    if (!found.length) continue;
    const rel = path.relative(srcRoot, file).split(path.sep).join("/");
    counts[rel] = found.length;
    sites[rel] = found;
  }
  return { counts, sites };
}

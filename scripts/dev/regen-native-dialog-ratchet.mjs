// scripts/dev/regen-native-dialog-ratchet.mjs — rewrite the SPARK ratchet.
//
//   npm run ratchet:native-dialogs
//
// src/pages/spark still holds a large pile of `alert(…)` / `confirm(…)` calls.
// Sweeping them is scheduled work, not this pass — so the guard holds a
// RATCHET instead of a zero: the count per file is checked in, the test fails
// if the total grows or any file gains one, and nobody can quietly add the
// 211th while the sweep is outstanding.
//
// Run this ONLY after REMOVING dialogs. It writes whatever it finds, so running
// it after adding one launders the regression into the baseline — the printed
// summary says plainly which way the number moved, and the script refuses to
// raise the total unless you pass --allow-increase (which you should not).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanTree } from "./native-dialog-scanner.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_ROOT = path.join(REPO, "src");
const OUT = path.join(REPO, "test", "fixtures", "native-dialog-ratchet.json");
const TREE = "pages/spark";

const allowIncrease = process.argv.includes("--allow-increase");

const { counts } = scanTree(SRC_ROOT, TREE);
const files = Object.keys(counts).sort();
const total = files.reduce((n, f) => n + counts[f], 0);

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
const wasTotal = previous?.total ?? null;

if (previous && total > wasTotal && !allowIncrease) {
  const grew = files.filter((f) => counts[f] > (previous.files?.[f] ?? 0));
  console.error(
    `REFUSING to raise the ratchet: ${wasTotal} → ${total}.\n` +
      `These files gained native dialogs:\n  ${grew
        .map((f) => `${f}  ${previous.files?.[f] ?? 0} → ${counts[f]}`)
        .join("\n  ")}\n` +
      `Replace them with ConfirmDialog / NameBlockDialog, or an inline refusal ` +
      `beside the control. Pass --allow-increase only if you know why.`,
  );
  process.exit(1);
}

const doc = {
  $comment:
    "Native browser dialogs still living under src/pages/spark. A RATCHET, not a " +
    "claim that they are gone: the sweep of these is tracked work. The guard in " +
    "test/builder-usability-cleanup.test.mjs fails if the total grows or any file " +
    "gains one. Regenerate with `npm run ratchet:native-dialogs` AFTER removing some.",
  tree: `src/${TREE}`,
  generatedBy: "scripts/dev/regen-native-dialog-ratchet.mjs",
  total,
  fileCount: files.length,
  files: Object.fromEntries(files.map((f) => [f, counts[f]])),
};

writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, "utf8");

const moved =
  wasTotal === null
    ? "(first write)"
    : total === wasTotal
      ? "(unchanged)"
      : `(${wasTotal} → ${total}, ${wasTotal - total} removed)`;
console.log(`native-dialog ratchet: ${total} calls in ${files.length} files ${moved}`);
console.log(`wrote ${path.relative(REPO, OUT)}`);

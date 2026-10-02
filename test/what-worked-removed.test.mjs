// test/what-worked-removed.test.mjs — the "What Worked" surface is gone.
//
// Brandon, 1 Oct 2026: the monthly "What Worked" report (IL step 8) was never
// scoped. Its LUMEN routes are deleted, so the page, the card on SPARK Overview
// and Insights → Health, the client for the findings routes and the nav entry
// all went with them. A route key or a nav entry left behind would be a menu
// item that opens a page calling routes that no longer exist.
//
// Run:  npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs|cjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("the What Worked files are deleted", () => {
  for (const rel of [
    "pages/spark/SparkWhatWorkedPage.tsx",
    "components/spark/WhatWorkedCard.tsx",
    "lib/ilFindingsApi.ts",
  ]) {
    assert.equal(fs.existsSync(path.join(SRC, rel)), false, `${rel} still exists`);
  }
  assert.equal(fs.existsSync(path.join(ROOT, "test", "il8-findings-ui.test.mjs")), false);
});

test("no route key, no catalogue entry, no nav entry", () => {
  assert.doesNotMatch(read("pages/ServiceRouter.tsx"), /spark_what_worked|SparkWhatWorkedPage/);
  assert.doesNotMatch(read("config/serviceCatalog.ts"), /spark_what_worked/);
  assert.doesNotMatch(read("components/SubNav.tsx"), /spark_what_worked|"What Worked"/);
});

test("nothing under src/ still names the surface or its client", () => {
  const hits = [];
  for (const f of walk(SRC)) {
    const s = fs.readFileSync(f, "utf8");
    if (/what_worked|WhatWorked|ilFindings/.test(s)) hits.push(path.relative(ROOT, f));
  }
  assert.deepEqual(hits, []);
});

test("SPARK Overview and Insights → Health still render, without the card", () => {
  for (const rel of ["pages/spark/SparkOverviewPage.tsx", "pages/spark/SparkIAInsightsHealthPage.tsx"]) {
    const s = read(rel);
    assert.doesNotMatch(s, /WhatWorkedCard/, `${rel} still mounts the card`);
    assert.match(s, /export function/, `${rel} lost its component`);
  }
});

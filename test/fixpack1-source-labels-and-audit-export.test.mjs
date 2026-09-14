// Post-plan fix pack 1 — the browser's half.
//
// TWO THINGS:
//
//   1. NO VENDOR NAME ON A CLIENT SCREEN (platform rule D-90). The label table
//      used to render an unrecognised key RAW, so an engine added on the server
//      and forgotten here put "brave_search" in a client's Source cell. The
//      server's half of the same list is LUMEN-API/src/lib/leadSourceLabels.js
//      and the two are asserted against the same key set.
//
//   2. THE AUDIT LOG EXPORT HAS TO SEND ITS HEADERS. It used to be
//      `window.open("/api/v1/audit-log/export.csv")`, which sends no
//      Authorization header and no business header to an endpoint sitting
//      behind authVerify() + requireHeaders — so it could not work in
//      production, and the code's own comment said so. It now uses the same
//      `download` helper the Lead Inbox export uses.
//
// Source shape is read with \r\n normalised — this is a CRLF checkout.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sourceLabel, sourceFacetKey, sourceFacetLabel, neutralSourceLabel } from "../src/lib/leadSource";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
/** Comments may TALK about window.open — the guard is on the CALL. */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/* ═══════════════════════════════════════════════════════════════════════════
   1. D-90 — no vendor name reaches a client screen
   ═══════════════════════════════════════════════════════════════════════════ */

/** Every source key the server's search orchestrator can emit. Kept in step
 *  with LUMEN-API/src/lib/leadSourceLabels.js and asserted there against the
 *  files in services/leadgen/sources/. */
const PROVIDER_KEYS = [
  "spark_leadgen", "hunter_discover", "data_axle", "data_axle_consumer",
  "brave_search", "you_search", "mojeek_search", "exa_search",
  "google_cse", "company_directory", "pdl", "linkedin", "leadgen",
];

const VENDOR_ON_SCREEN = /(brave|you\.?com|you[_\s]search|mojeek|\bexa\b|\bcse\b|\bpdl\b|people\s*data\s*labs|data\s*axle|\baxle\b|hunter)/i;

test("every provider key the orchestrator can emit reads with no vendor name", () => {
  for (const k of PROVIDER_KEYS) {
    const label = sourceLabel(k);
    assert.ok(label && label !== "—", `${k} produced no label`);
    assert.ok(!VENDOR_ON_SCREEN.test(label),
      `the Source cell for "${k}" names a vendor to a client: "${label}"`);
    assert.notEqual(label, k, `"${k}" is being rendered raw`);
  }
  // The four the lead card was showing before the fix pack.
  for (const k of ["brave_search", "you_search", "exa_search", "google_cse"]) {
    assert.equal(sourceLabel(k), "SPARK Lead Gen");
  }
});

test("an unknown MACHINE key gets a neutral phrase, never the raw key", () => {
  for (const [key, expected] of [
    ["brave_search_v2", "Web search"],
    ["some_new_engine", "Web search"],
    ["acme_directory", "Directory"],
    ["partner_leadform", "Website form"],
    ["shiny_thing", "Other source"],
  ]) {
    assert.equal(sourceLabel(key), expected, key);
  }
  assert.equal(neutralSourceLabel("whatever_search"), "Web search");
});

test("words a PERSON typed are theirs and pass through", () => {
  // All real values in lumen.lead.source on the dev database.
  for (const typed of ["Nextdoor", "Referral", "Home Services Directory", "Yard Sign", "Facebook"]) {
    assert.equal(sourceLabel(typed), typed);
  }
});

test("the Source facet chips read the same as the cells they filter", () => {
  assert.equal(sourceFacetKey({ source: "brave_search" }), "SPARK Lead Gen");
  assert.equal(sourceFacetKey({ source: "some_new_engine" }), "Web search",
    "an unrecognised engine must not become its own chip named after itself");
  assert.equal(sourceFacetKey({ source: "Yard Sign" }), "Yard Sign");
  assert.equal(sourceFacetLabel("SPARK Lead Gen"), "SPARK Lead Gen");
  assert.equal(sourceFacetLabel("unknown"), "Unknown");
});

test("the table itself carries no discovery-vendor name", () => {
  const src = read(path.join(ROOT, "src", "lib", "leadSource.ts"));
  // Only inside the SOURCE_LABELS / CHANNEL_LABELS object literals: the keys
  // are allowed to be vendor keys, the label VALUES are not.
  for (const m of src.matchAll(/^\s{2}[a-z0-9_]+:\s*"([^"]+)",\s*$/gm)) {
    assert.ok(!VENDOR_ON_SCREEN.test(m[1]),
      `a label in leadSource.ts names a discovery vendor: "${m[1]}"`);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. THE AUDIT LOG EXPORT SENDS ITS HEADERS
   ═══════════════════════════════════════════════════════════════════════════ */

const AUDIT_PAGE = path.join(ROOT, "src", "pages", "spark", "SparkAuditLogPage.tsx");

test("Audit Log Export CSV downloads through the authenticated helper", () => {
  const src = read(AUDIT_PAGE);
  assert.match(src, /const \{ get, download, ready \} = useSparkApi\(\);/,
    "the page must take the download helper off the hook");
  assert.match(src, /await download\(\s*`\/api\/v1\/audit-log\/export\.csv\?\$\{params\.toString\(\)\}`/,
    "the export must go through download(), which sends the bearer token and the business header");
});

test("window.open is GONE from the audit page", () => {
  // THE MUTATION THIS GUARD EXISTS FOR: put window.open back and this goes red.
  // /api/v1/audit-log/export.csv sits behind authVerify() + requireHeaders in
  // LUMEN (routes/auditViewer.js). A new tab sends neither header, so the
  // client gets a 401 in a blank tab instead of their file.
  const code = stripComments(read(AUDIT_PAGE));
  assert.ok(!/window\.open/.test(code),
    "window.open cannot authenticate against an endpoint behind authVerify()");
  // And the comment that admitted it could not work is gone with it.
  assert.ok(!/the browser handles auth via cookies/.test(read(AUDIT_PAGE)));
});

test("the export button says what it is doing and cannot be double-pressed", () => {
  const src = read(AUDIT_PAGE);
  assert.match(src, /const \[exporting, setExporting\] = useState\(false\);/);
  assert.match(src, /disabled=\{exporting\}/);
  assert.match(src, /\{exporting \? "Exporting…" : "Export CSV"\}/);
  assert.match(src, /if \(exporting\) return;/);
});

test("no other SPARK page downloads a protected file with window.open", () => {
  // One download mechanism, not two. A page that opens an authenticated
  // endpoint in a tab is the same defect wearing a different name.
  const dir = path.join(ROOT, "src", "pages", "spark");
  const offenders = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".tsx")) continue;
    const code = stripComments(read(path.join(dir, f)));
    if (/window\.open\([^)]*\/api\/v1\//.test(code)) offenders.push(f);
  }
  assert.deepEqual(offenders, [],
    `these pages open an API endpoint in a tab, which sends no auth header: ${offenders.join(", ")}`);
});

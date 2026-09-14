// The Export button on the Lead Inbox toolbar.
//
// Brandon prospects out of the Lead Inbox and needs the list as a file. These
// are the four things about the BUTTON that a client would notice if they were
// wrong, asserted on the source because the page has no render harness here:
//
//   1. It downloads through the shared authenticated helper. The Audit Log's
//      export is a window.open at an endpoint behind an Authorization header —
//      an anchor sends no headers, so that one cannot work. This must not be a
//      second copy of that mistake.
//   2. It sends the SAME filters the list is showing, from the one builder, so
//      the file is the list the client was looking at.
//   3. It is disabled with a REASON when there is nothing to export — a
//      disabled control with no tooltip is a dead end.
//   4. It speaks to a client: no vendor names, no "tenant", no schema words.
//
// Read with \r\n normalised — this repo is a CRLF checkout and a regex written
// for \n silently matches nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");

const PAGE = read("src", "pages", "spark", "SparkLeadInboxPage.tsx");
const API = read("src", "lib", "sparkApi.ts");
const HOOK = read("src", "hooks", "useSparkApi.ts");

/* ── 1. it downloads through the shared authenticated helper ──────────────── */

test("the Export button downloads through the authenticated SPARK helper", () => {
  assert.match(HOOK, /sparkDownload/, "the hook exposes a download");
  assert.match(HOOK, /download,\s*ready: !!account/, "and it is on the object pages destructure");
  assert.match(PAGE, /const \{ get, post, download, ready \} = useSparkApi\(\);/,
    "the Lead Inbox takes the download off the hook");
  assert.match(PAGE, /await download\(\s*`\/api\/v1\/leads\/export\.csv/,
    "Export calls it with the export endpoint");
});

test("the export is not a window.open at an endpoint behind an auth header", () => {
  // The Audit Log's export does exactly that and its own comment admits it
  // cannot work; this page must not grow a second copy of it.
  const exportBlock = PAGE.slice(PAGE.indexOf("const onExport"), PAGE.indexOf("const sourceFacets"));
  assert.ok(!/window\.open/.test(exportBlock), "no window.open in the export path");
  assert.ok(!/createObjectURL/.test(exportBlock),
    "the blob/anchor dance lives in ONE place (sparkApi.sparkDownload), not in the page");
});

test("the download helper sends the same auth and business as every other call", () => {
  assert.match(API, /export async function sparkDownload/);
  assert.match(API, /async function sparkHeaders\(/,
    "the headers are built once and shared");
  // Both the JSON path and the download path go through it — a second copy is
  // how a download lands on the wrong business while the page shows the right one.
  const uses = API.match(/await sparkHeaders\(/g) || [];
  assert.equal(uses.length, 2, "sparkFetch and sparkDownload, and nothing else, build the headers");
  assert.ok(!/Authorization: `Bearer \$\{token\}`/.test(API.slice(API.indexOf("sparkDownload"))),
    "sparkDownload does not hand-roll its own Authorization header");
});

/* ── 2. the file is the list on screen ────────────────────────────────────── */

test("the list and the export build their filters with the same code", () => {
  assert.match(PAGE, /const filterParams = useCallback\(\(\) => \{/,
    "there is one filter-parameter builder");
  const calls = PAGE.match(/filterParams\(\)/g) || [];
  assert.equal(calls.length, 2, "the list uses it and Export uses it, and nobody else");
  // Export adds the search box on top, because the file covers the whole inbox
  // rather than the fifty rows the box was filtering.
  assert.match(PAGE, /if \(search\.trim\(\)\) qs\.set\("q", search\.trim\(\)\);/);
});

/* ── 3. disabled, with a reason ───────────────────────────────────────────── */

test("Export is disabled when there is nothing to export, and says why", () => {
  const btn = PAGE.slice(PAGE.indexOf("onClick={onExport}"), PAGE.indexOf("onClick={onExport}") + 1200);
  assert.match(btn, /disabled=\{exporting \|\| !leads\.length\}/,
    "an empty list disables the button");
  assert.match(btn, /Nothing to export yet/, "and the tooltip says why it is disabled");
  assert.match(btn, /title=\{/, "the button always carries a tooltip");
  assert.match(btn, /Download these leads as a spreadsheet \(CSV\)/,
    "the enabled tooltip says what the button does");
  assert.match(btn, /Exporting…/, "and it says so while it is working");
});

test("the button sits with the filters it exports", () => {
  // It is in the same toolbar row as the chips and the search box, after the
  // search box — not orphaned next to the primary action.
  const searchAt = PAGE.indexOf('placeholder="Search business, domain, email…"');
  const exportAt = PAGE.indexOf("onClick={onExport}");
  const newRunAt = PAGE.indexOf("New B2B Lead Run");
  assert.ok(searchAt > 0 && exportAt > searchAt && exportAt < newRunAt,
    "Export sits after the filters and before the primary action");
});

/* ── 4. it speaks to a client ─────────────────────────────────────────────── */

test("the export wording is client-facing", () => {
  const block = PAGE.slice(PAGE.indexOf("const onExport"), PAGE.indexOf("New B2B Lead Run"));
  // The words the CLIENT reads: the tooltips, the button label, the alert.
  const strings = [...block.matchAll(/"([^"]{4,})"|`([^`]{4,})`/g)]
    .map((m) => m[1] || m[2])
    .filter((s) => !/^[/\w.$?:{}[\]-]+$/.test(s));   // drop paths and class lists

  assert.ok(strings.some((s) => /spreadsheet/i.test(s)), "the tooltip is in a client's words");
  for (const s of strings) {
    assert.ok(!/\btenant\b/i.test(s), `a client is a Business, never a tenant: "${s}"`);
    for (const vendor of ["hunter", "brave", "mojeek", "\\bexa\\b", "data axle", "azure", "sql server", "mssql"]) {
      assert.ok(!new RegExp(vendor, "i").test(s), `a vendor name reached the client: "${s}"`);
    }
  }
});

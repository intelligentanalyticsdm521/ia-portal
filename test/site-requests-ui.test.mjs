// Pins the two halves of "request a change" that the Portal owns.
//
// The client half: WebsiteSupport.tsx used to declare
//   const requestList: any[] = [];   // "No request history endpoint exists yet"
// so a client sent a request and the history below it stayed empty forever.
// The API has shipped; the list must now come from it and must refresh after
// a send.
//
// The founder half: a queue page across every business, behind
// RequireFounderRoute, reachable from the Platform Admin tiles, that PATCHes
// the status with an optional reply.
//
// Source-pinning, like no-dead-app-links.test.mjs — these are wiring facts a
// typecheck cannot see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

const support = read("arion/pages/website/WebsiteSupport.tsx");
const founder = read("pages/admin/SiteRequestsPage.tsx");
const app = read("App.tsx");
const adminHub = read("pages/PlatformAdminPage.tsx");
const api = read("lib/arionApi.ts");

test("the client's history is fetched, not hardcoded empty", () => {
  assert.ok(!/const requestList: any\[\] = \[\];/.test(support), "the hardcoded [] is gone");
  assert.ok(!/No request history endpoint exists yet/.test(support), "and so is the comment excusing it");
  assert.match(support, /arionApi\.listRequests\(activeSiteId\)/, "the list comes from the API");
  assert.match(support, /const requestList: ArionSiteRequest\[\] = data\?\.requests \?\? \[\]/);
});

test("sending a request refreshes the list underneath it", () => {
  assert.match(support, /await arionApi\.submitRequest\(activeSiteId, requestType, notes\);[\s\S]{0,400}?\n\s*refetch\(\);/,
    "otherwise the client sends one and the history still reads empty");
});

test("the client sees a status, both dates and our reply — in plain words", () => {
  for (const [key, label] of [["open", "Received"], ["in_progress", "Being worked on"], ["done", "Done"], ["declined", "Not doing this one"]]) {
    assert.match(support, new RegExp(`${key}: '${label}'`), `${key} reads as "${label}"`);
  }
  assert.match(support, /Sent \{formatDay\(r\.createdAt\)\}/);
  assert.match(support, /r\.resolvedAt \? ` · Finished \$\{formatDay\(r\.resolvedAt\)\}`/);
  assert.match(support, /Our reply: <\/span>\{r\.resolutionNotes\}/);
  assert.match(support, /You have not asked for any changes yet/, "the empty state says something useful");
});

test("neither page says 'tenant' to a human", () => {
  for (const [name, src] of [["WebsiteSupport", support], ["SiteRequestsPage", founder]]) {
    const strings = src.match(/>[^<>{}]*\btenants?\b[^<>{}]*</gi) || [];
    assert.deepEqual(strings, [], `${name} shows "tenant" in visible copy: ${strings.join(" | ")}`);
  }
  assert.match(founder, /<th style=\{head\}>Business<\/th>/, "the founder queue column is Business");
});

test("the founder queue is founder-gated in the router and linked from Platform Admin", () => {
  assert.match(app, /<Route path="admin\/site-requests" element=\{<RequireFounderRoute \/>\}>/);
  assert.match(app, /import\('\.\/pages\/admin\/SiteRequestsPage'\)/);
  assert.match(adminHub, /to="\/app\/admin\/site-requests"/, "the tile exists on the admin hub");
});

test("the founder queue lists every business, filters by status, and PATCHes with a reply", () => {
  assert.match(founder, /listFounderSiteRequests\(\{ baseUrl, bearerToken: token, tenantId, status: filter \|\| undefined \}\)/);
  assert.match(founder, /const STATUSES: SiteRequestStatus\[\] = \["open", "in_progress", "done", "declined"\]/);
  assert.match(founder, /updateFounderSiteRequest\(\{[\s\S]{0,220}?resolutionNotes: reply \|\| undefined,/);
  assert.match(founder, /if \(nextStatus === r\.status && !reply\) return;/, "Save with nothing changed sends nothing");
  assert.match(founder, /ageLabel\(r\.createdAt\)/, "how long it has been waiting is on the row");
});

test("the API client targets the routes arion-api actually serves", () => {
  assert.match(api, /path: `\/arion\/sites\/\$\{encodeURIComponent\(params\.siteId\)\}\/requests`/);
  assert.match(api, /path: `\/admin\/site-requests\$\{qs\}`/);
  assert.match(api, /method: 'PATCH',\s*\n\s*path: `\/admin\/site-requests\/\$\{encodeURIComponent\(params\.siteRequestId\)\}`/);
});

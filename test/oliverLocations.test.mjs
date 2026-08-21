// test/oliverLocations.test.mjs — the pure helpers behind OLIVER multi-location
// (lib/oliverLocations: scoping, selection persistence, group_by rows,
// membership diffs, tier-error detection) PLUS the wire contract the pages
// depend on, pinned against fixtures copied from the oliver-api source
// (feat/oliver-multi-location: routes/locations.js, routes/tenantUsers.js).
// No DOM, no network, no DB.
//
// Run:  npm test   (node --import ./scripts/test-ts-loader.mjs --test test)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as lib from "../src/lib/oliverLocations.ts";

const L = (over) => ({
  location_id: "11111111-1111-1111-1111-111111111111",
  name: "Main",
  address_line1: null, city: null, region: null, postal_code: null, phone: null, timezone: null,
  is_active: true, is_default: false, open_jobs: 0, total_jobs: 0, workers: 0,
  ...over,
});
const MAIN = L({ is_default: true });
const NORTH = L({ location_id: "22222222-2222-2222-2222-222222222222", name: "North Side" });
const OLD = L({ location_id: "33333333-3333-3333-3333-333333333333", name: "Closed branch", is_active: false });

function fakeStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), size: () => m.size };
}

// ── Wire-contract fixtures (copied from the oliver-api branch, after the { data } unwrap) ──
// GET /locations row — routes/locations.js SELECT_LOCATION.
const API_LOCATION_ROW = {
  location_id: "5C1B4E0A-2F0E-4F7B-9C3A-7A1D2B3C4D5E",
  tenant_id: "A0000001-0000-0000-0000-000000000001",
  name: "Main location",
  address_line1: null, address_line2: null, city: null, region: null, postal_code: null, country: null,
  phone: null, timezone: null,
  is_active: true, is_default: true,
  created_at: "2026-08-21T00:00:00.000Z", updated_at: "2026-08-21T00:00:00.000Z",
  open_jobs: 3, total_jobs: 124, workers: 2,
};
// GET /locations/:id/members — routes/locations.js: tenant_user_id = core.tenant_users.tenant_user_id.
const TENANT_USER_ID = "7D3F1C22-AAAA-4B1B-8C0D-111111111111";
const API_MEMBERS_BODY = { location_id: API_LOCATION_ROW.location_id, tenant_user_ids: [TENANT_USER_ID] };
// GET /tenant-users row — routes/tenantUsers.js: `u.user_id AS userId` (core.users), a DIFFERENT guid space.
const API_TENANT_USER_ROW = {
  userId: "0E9A7B61-BBBB-4C2C-9D1E-222222222222",
  email: "owner@example.test", firstName: "Pat", lastName: "Owner", fullName: "Pat Owner",
  joinedAt: "2026-08-01T00:00:00.000Z", role: "admin", isSelf: true,
};

const src = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");

// ── scoping ──────────────────────────────────────────────────────────────────
test("withLocation leaves the path untouched for 'all' / empty (single-location = zero change)", () => {
  assert.equal(lib.withLocation("/jobs?per_page=200", "all"), "/jobs?per_page=200");
  assert.equal(lib.withLocation("/jobs", null), "/jobs");
  assert.equal(lib.withLocation("/jobs", undefined), "/jobs");
  assert.equal(lib.withLocation("/jobs", ""), "/jobs");
});

test("withLocation appends location_id with the right separator", () => {
  assert.equal(lib.withLocation("/jobs", NORTH.location_id), `/jobs?location_id=${NORTH.location_id}`);
  assert.equal(lib.withLocation("/jobs?per_page=200", NORTH.location_id), `/jobs?per_page=200&location_id=${NORTH.location_id}`);
  assert.equal(lib.withLocation("/reports/revenue?", NORTH.location_id), `/reports/revenue?location_id=${NORTH.location_id}`);
});

test("withQuery skips empty values and encodes", () => {
  assert.equal(lib.withQuery("/reports/revenue", { group_by: "location", from: "", to: null }), "/reports/revenue?group_by=location");
  assert.equal(lib.withQuery("/x", {}), "/x");
  assert.equal(lib.withQuery("/x", { q: "a b&c" }), "/x?q=a%20b%26c");
});

// ── list helpers ─────────────────────────────────────────────────────────────
test("isMultiLocation counts ACTIVE locations only", () => {
  assert.equal(lib.isMultiLocation([]), false);
  assert.equal(lib.isMultiLocation([MAIN]), false);
  assert.equal(lib.isMultiLocation([MAIN, OLD]), false);
  assert.equal(lib.isMultiLocation([MAIN, NORTH]), true);
  assert.equal(lib.isMultiLocation(null), false);
});

test("defaultLocationOf prefers is_default, falls back to first active, null when none", () => {
  assert.equal(lib.defaultLocationOf([NORTH, MAIN]).location_id, MAIN.location_id);
  assert.equal(lib.defaultLocationOf([NORTH]).location_id, NORTH.location_id);
  assert.equal(lib.defaultLocationOf([OLD]), null);
  assert.equal(lib.defaultLocationOf([]), null);
});

test("locationById / locationNameOf are case-insensitive with a fallback name", () => {
  assert.equal(lib.locationById(NORTH.location_id.toUpperCase(), [MAIN, NORTH]).name, "North Side");
  assert.equal(lib.locationNameOf("nope", [MAIN], "Joined name"), "Joined name");
  assert.equal(lib.locationNameOf("nope", [MAIN]), null);
});

test("rowLocationId / rowLocationName read snake and camel case", () => {
  assert.equal(lib.rowLocationId({ location_id: "a" }), "a");
  assert.equal(lib.rowLocationId({ locationId: "b" }), "b");
  assert.equal(lib.rowLocationId({}), null);
  assert.equal(lib.rowLocationId(null), null);
  assert.equal(lib.rowLocationName({ locationName: "North" }), "North");
});

test("parseIdList accepts array, JSON string, CSV, empty", () => {
  assert.deepEqual(lib.parseIdList(["a", "b"]), ["a", "b"]);
  assert.deepEqual(lib.parseIdList('["a","b"]'), ["a", "b"]);
  assert.deepEqual(lib.parseIdList("a, b ,"), ["a", "b"]);
  assert.deepEqual(lib.parseIdList(""), []);
  assert.deepEqual(lib.parseIdList(null), []);
});

test("locationAddressLine composes what is filled in", () => {
  assert.equal(lib.locationAddressLine({ address_line1: "1 Main St", city: "Austin", region: "TX", postal_code: "78701" }), "1 Main St, Austin, TX 78701");
  assert.equal(lib.locationAddressLine({ address_line1: null, city: "Austin", region: null, postal_code: null }), "Austin");
  assert.equal(lib.locationAddressLine({ address_line1: null, city: null, region: null, postal_code: null }), null);
});

// ── GET /locations contract: counts ─────────────────────────────────────────
test("GET /locations row carries open_jobs / total_jobs / workers — the reassign gate and copy read those", () => {
  assert.equal("job_count" in API_LOCATION_ROW, false);
  assert.equal("worker_count" in API_LOCATION_ROW, false);
  assert.equal(lib.locationNeedsReassign(API_LOCATION_ROW), true);                       // 3 open jobs, 2 workers
  assert.equal(lib.locationNeedsReassign({ ...API_LOCATION_ROW, open_jobs: 0 }), true);  // workers alone still move
  assert.equal(lib.locationNeedsReassign({ ...API_LOCATION_ROW, open_jobs: 0, workers: 0 }), false);
  assert.equal(lib.locationNeedsReassign({ open_jobs: "2", workers: null }), true);      // driver may stringify
  assert.equal(lib.locationUsageLabel(API_LOCATION_ROW), "3 open jobs and 2 workers");
  assert.equal(lib.locationUsageLabel({ open_jobs: 1, workers: 0 }), "1 open job");
  assert.equal(lib.locationUsageLabel({ open_jobs: 0, workers: 1 }), "1 worker");
  assert.equal(lib.locationUsageLabel({ open_jobs: 0, workers: 0 }), "");
});

// ── selection persistence ───────────────────────────────────────────────────
test("normalizeSelection honours only an ACTIVE location of THIS business", () => {
  const list = [MAIN, NORTH, OLD];
  assert.equal(lib.normalizeSelection(NORTH.location_id, list), NORTH.location_id);
  assert.equal(lib.normalizeSelection(NORTH.location_id.toUpperCase(), list), NORTH.location_id.toUpperCase());
  assert.equal(lib.normalizeSelection(OLD.location_id, list), "all");      // deactivated
  assert.equal(lib.normalizeSelection("garbage", list), "all");
  assert.equal(lib.normalizeSelection(null, list), "all");
  assert.equal(lib.normalizeSelection(MAIN.location_id, [MAIN]), "all");   // single-location → never scoped
});

test("read/writeSelection round-trip per business scope; 'all' clears the slot", () => {
  const store = fakeStore();
  lib.writeSelection(store, "TENANT-A", NORTH.location_id);
  assert.equal(lib.readSelection(store, "tenant-a", [MAIN, NORTH]), NORTH.location_id);
  assert.equal(lib.readSelection(store, "tenant-b", [MAIN, NORTH]), "all"); // other business
  assert.equal(lib.readSelection(store, "tenant-a", [MAIN]), "all");        // became single-location
  lib.writeSelection(store, "tenant-a", "all");
  assert.equal(store.size(), 0);
  assert.equal(lib.readSelection(null, "tenant-a", [MAIN, NORTH]), "all");  // no storage → fail open
  assert.equal(lib.selectionStorageKey("ABC"), "oliver.location.selected.abc");
});

test("isOliverSurface matches OLIVER routes only", () => {
  assert.equal(lib.isOliverSurface("/app/services/oliver_job_board"), true);
  assert.equal(lib.isOliverSurface("/app/services/oliver_locations"), true);
  assert.equal(lib.isOliverSurface("/app/oliver/quotes/templates"), true);
  assert.equal(lib.isOliverSurface("/app/services/spark_campaigns"), false);
  assert.equal(lib.isOliverSurface("/app/overview"), false);
  assert.equal(lib.isOliverSurface(""), false);
});

// ── reports ─────────────────────────────────────────────────────────────────
test("extractLocationRows handles bare arrays and every envelope, drops rows without an id", () => {
  const rows = [{ location_id: MAIN.location_id, location_name: "Main", total_revenue: "120.5" }, { total_revenue: 5 }];
  assert.equal(lib.extractLocationRows(rows).length, 1);
  assert.equal(lib.extractLocationRows({ by_location: rows }).length, 1);
  assert.equal(lib.extractLocationRows({ locations: rows }).length, 1);
  assert.equal(lib.extractLocationRows({ breakdown: rows }).length, 1);
  assert.equal(lib.extractLocationRows({ rows }).length, 1);
  assert.equal(lib.extractLocationRows({ data: rows })[0].location_name, "Main");
  assert.deepEqual(lib.extractLocationRows(null), []);
  assert.deepEqual(lib.extractLocationRows({ total: 3 }), []);
  assert.equal(lib.extractLocationRows([{ locationId: "x" }])[0].location_name, "");
});

test("metricOf takes the first numeric candidate, else 0", () => {
  assert.equal(lib.metricOf({ revenue: "12.5" }, ["total_revenue", "revenue"]), 12.5);
  assert.equal(lib.metricOf({ total_revenue: 0, revenue: 9 }, ["total_revenue", "revenue"]), 0);
  assert.equal(lib.metricOf({ revenue: "abc" }, ["revenue"]), 0);
  assert.equal(lib.metricOf(null, ["revenue"]), 0);
});

// ── team access: /members ↔ /tenant-users id contract ───────────────────────
test("parseMembers reads the /members body with or without joined user_ids; garbage → []", () => {
  assert.deepEqual(lib.parseMembers(API_MEMBERS_BODY), [{ tenant_user_id: TENANT_USER_ID, user_id: null }]);
  assert.deepEqual(
    lib.parseMembers({ ...API_MEMBERS_BODY, user_ids: [API_TENANT_USER_ROW.userId] }),
    [{ tenant_user_id: TENANT_USER_ID, user_id: API_TENANT_USER_ROW.userId }],
  );
  assert.deepEqual(lib.parseMembers(null), []);
  assert.deepEqual(lib.parseMembers({ data: [] }), []);
  assert.deepEqual(lib.parseMembers({ tenant_user_ids: '["a"]' }), [{ tenant_user_id: "a", user_id: null }]);
});

test("a /tenant-users row without tenantUserId cannot be matched to a tenant_user_id-only membership (the original 400 unknown_tenant_user defect, pinned)", () => {
  const members = lib.parseMembers(API_MEMBERS_BODY);
  assert.equal(lib.isMemberOf(members, API_TENANT_USER_ROW), false);
  // ...and the only id the page can send is userId — the API must resolve it or expose tenantUserId.
  assert.equal(lib.memberSendId(API_TENANT_USER_ROW, members), API_TENANT_USER_ROW.userId);
});

test("with tenantUserId on the /tenant-users row the page matches on it and SENDS it (never userId)", () => {
  const row = { ...API_TENANT_USER_ROW, tenantUserId: TENANT_USER_ID.toLowerCase() };
  const members = lib.parseMembers(API_MEMBERS_BODY);
  assert.equal(lib.isMemberOf(members, row), true);
  assert.equal(lib.memberSendId(row, members), TENANT_USER_ID.toLowerCase());
  const membership = { [MAIN.location_id]: [], [NORTH.location_id]: members };
  assert.deepEqual(lib.userLocationIds(membership, row), [NORTH.location_id]);
  const ups = lib.membershipUpdates(membership, row, [MAIN.location_id, NORTH.location_id]);
  assert.equal(ups.length, 1);
  assert.equal(ups[0].location_id, MAIN.location_id);
  assert.deepEqual(ups[0].tenant_user_ids, [TENANT_USER_ID.toLowerCase()]);
  assert.deepEqual(ups[0].members, [{ tenant_user_id: TENANT_USER_ID.toLowerCase(), user_id: row.userId }]);
});

test("with user_ids joined on /members the page matches by userId and still sends the stored tenant_user_id", () => {
  const body = { ...API_MEMBERS_BODY, user_ids: [API_TENANT_USER_ROW.userId.toLowerCase()] };
  const members = lib.parseMembers(body);
  assert.equal(lib.isMemberOf(members, API_TENANT_USER_ROW), true);
  assert.equal(lib.memberSendId(API_TENANT_USER_ROW, members), TENANT_USER_ID);
  // membershipUpdates learns the tenant_user_id from ANY location the user already belongs to.
  const membership = { [MAIN.location_id]: members, [NORTH.location_id]: [] };
  const ups = lib.membershipUpdates(membership, API_TENANT_USER_ROW, [MAIN.location_id, NORTH.location_id]);
  assert.deepEqual(ups.map((u) => [u.location_id, u.tenant_user_ids]), [[NORTH.location_id, [TENANT_USER_ID]]]);
  // removal filters by the joined user_id
  const rm = lib.membershipUpdates(membership, API_TENANT_USER_ROW, []);
  assert.deepEqual(rm, [{ location_id: MAIN.location_id, tenant_user_ids: [], members: [] }]);
});

test("userLocationIds / membershipUpdates: one PUT per location whose list actually changes (case-insensitive)", () => {
  const u1 = { userId: "U1-user", tenantUserId: "U1" };
  const u2 = { userId: "U2-user", tenantUserId: "u2" };
  const u3 = { userId: "U3-user", tenantUserId: "U3" };
  const M = (...ids) => ids.map((tenant_user_id) => ({ tenant_user_id, user_id: null }));
  const membership = { [MAIN.location_id]: M("u1", "U2"), [NORTH.location_id]: M("U2") };
  assert.deepEqual(lib.userLocationIds(membership, u1), [MAIN.location_id]);
  assert.deepEqual(lib.userLocationIds(membership, u2).sort(), [MAIN.location_id, NORTH.location_id].sort());
  assert.deepEqual(lib.userLocationIds(membership, u3), []);
  // u2: Main+North → only North  ⇒ one update (Main loses u2)
  assert.deepEqual(lib.membershipUpdates(membership, u2, [NORTH.location_id]).map((x) => [x.location_id, x.tenant_user_ids]), [[MAIN.location_id, ["u1"]]]);
  // u1: Main → all locations (empty) ⇒ Main loses u1
  assert.deepEqual(lib.membershipUpdates(membership, u1, []).map((x) => [x.location_id, x.tenant_user_ids]), [[MAIN.location_id, ["U2"]]]);
  // u3: nothing → North ⇒ North gains u3 (sends tenantUserId)
  assert.deepEqual(lib.membershipUpdates(membership, u3, [NORTH.location_id.toUpperCase()]).map((x) => [x.location_id, x.tenant_user_ids]), [[NORTH.location_id, ["U2", "U3"]]]);
  // no change ⇒ no updates
  assert.deepEqual(lib.membershipUpdates(membership, u2, [MAIN.location_id, NORTH.location_id]), []);
});

test("membersPutBody (Locations drawer): checked users by the stored id, hidden members kept, de-duplicated", () => {
  const shown = { ...API_TENANT_USER_ROW, tenantUserId: TENANT_USER_ID };
  const other = { userId: "0E9A7B61-CCCC-4C2C-9D1E-333333333333", tenantUserId: "7D3F1C22-DDDD-4B1B-8C0D-444444444444" };
  const hidden = { tenant_user_id: "7D3F1C22-EEEE-4B1B-8C0D-555555555555", user_id: null }; // an inactive user /tenant-users omits
  const members = [...lib.parseMembers(API_MEMBERS_BODY), hidden];
  assert.deepEqual(lib.membersPutBody([shown, other], [shown.userId, other.userId.toLowerCase()], members), {
    tenant_user_ids: [TENANT_USER_ID, other.tenantUserId, hidden.tenant_user_id],
  });
  // unchecking `shown` removes it; `hidden` survives because no listed user owns it
  assert.deepEqual(lib.membersPutBody([shown, other], [], members), { tenant_user_ids: [hidden.tenant_user_id] });
  // no tenantUserId on the row, no join on the body → falls back to userId (API resolves or 400s; never silently drops)
  assert.deepEqual(lib.membersPutBody([API_TENANT_USER_ROW], [API_TENANT_USER_ROW.userId], []), { tenant_user_ids: [API_TENANT_USER_ROW.userId] });
});

// ── wire pins: what the pages actually call ─────────────────────────────────
test("useOliverLocations fetches /locations?include_inactive=1 (deactivated rows must reach the Locations page)", () => {
  assert.match(src("../src/hooks/useOliverLocations.ts"), /get<[^>]*>\("\/locations\?include_inactive=1"\)/);
});

test("Team Performance: the per-worker call is picker-scoped; 'By location' reads { rows, by_location } from ?group_by=location", () => {
  const page = src("../src/pages/oliver/OliverCrewPerformancePage.tsx");
  assert.match(page, /withLocation\(`\/reports\/crew/);
  assert.match(page, /withQuery\(`\/reports\/crew[^`]*`, \{ group_by: "location" \}\)/);
  assert.match(page, /extractLocationRows\(/);
  // On that call the API's envelope is { rows, by_location } — by_location must win over rows.
  const crewEnvelope = { rows: [{ worker_id: "w", total_assignments: 9 }], by_location: [{ location_id: MAIN.location_id, location_name: "Main", total_assignments: 2 }] };
  const rows = lib.extractLocationRows(crewEnvelope);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].location_id, MAIN.location_id);
  assert.equal(lib.metricOf(rows[0], ["total_assignments", "assignments", "assigned"]), 2);
  assert.deepEqual(lib.extractLocationRows({ rows: [{ worker_id: "w" }], by_location: [] }), []);
});

test("Booking config sends no location_id (oliver.booking_page has no such column; the public page offers the pick)", () => {
  assert.doesNotMatch(src("../src/pages/oliver/OliverBookingPage.tsx"), /location_id|useOliverLocations/);
});

test("every OLIVER list page the header picker should scope goes through withLocation()", () => {
  for (const page of [
    "OliverServiceRequestsPage", "OliverJobOffersPage", "OliverTimeTrackingPage", "OliverActivityLogPage", "OliverBillingOverviewPage",
    "OliverJobBoardPage", "OliverDispatchPage", "OliverSchedulePage", "OliverInvoicesPage", "OliverReportsPage", "OliverDashboardPage",
  ]) {
    const s = src(`../src/pages/oliver/${page}.tsx`);
    assert.match(s, /withLocation\(/, `${page} must scope its list fetches`);
    assert.match(s, /loc\.selectedLocationId/, `${page} must re-fetch on picker change`);
  }
});

// ── errors ──────────────────────────────────────────────────────────────────
test("isLocationTierError recognises the 402 and the structured tier_gate", () => {
  assert.equal(lib.isLocationTierError(new Error('OLIVER API 402: {"error":"tier_upgrade_required"}')), true);
  assert.equal(lib.isLocationTierError(new Error("OLIVER API 402: ")), true);
  assert.equal(lib.isLocationTierError({ type: "tier_gate", tierRequired: "business", currentTier: "standard" }), true);
  assert.equal(lib.isLocationTierError(new Error("OLIVER API 500: boom")), false);
  assert.equal(lib.isLocationTierError(null), false);
});

test("locationOptionLabel marks the default", () => {
  assert.equal(lib.locationOptionLabel(MAIN), "Main (default)");
  assert.equal(lib.locationOptionLabel(NORTH), "North Side");
});

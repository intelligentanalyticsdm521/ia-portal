// test/oliverLocations.test.mjs — the pure helpers behind OLIVER multi-location
// (lib/oliverLocations: scoping, selection persistence, group_by rows,
// membership diffs, tier-error detection). No DOM, no network, no DB.
//
// Run:  npm test   (node --import ./scripts/test-ts-loader.mjs --test test)
import { test } from "node:test";
import assert from "node:assert/strict";
import * as lib from "../src/lib/oliverLocations.ts";

const L = (over) => ({
  location_id: "11111111-1111-1111-1111-111111111111",
  name: "Main",
  address_line1: null, city: null, region: null, postal_code: null, phone: null, timezone: null,
  is_active: true, is_default: false, job_count: 0, worker_count: 0,
  ...over,
});
const MAIN = L({ is_default: true });
const NORTH = L({ location_id: "22222222-2222-2222-2222-222222222222", name: "North Side" });
const OLD = L({ location_id: "33333333-3333-3333-3333-333333333333", name: "Closed branch", is_active: false });

function fakeStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), size: () => m.size };
}

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
  assert.equal(lib.withQuery("/reports/crew", { group_by: "location", from: "", to: null }), "/reports/crew?group_by=location");
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

// ── team access ─────────────────────────────────────────────────────────────
test("userLocationIds lists the locations a user is limited to (case-insensitive)", () => {
  const membership = { [MAIN.location_id]: ["U1", "u2"], [NORTH.location_id]: ["u2"] };
  assert.deepEqual(lib.userLocationIds(membership, "u1"), [MAIN.location_id]);
  assert.deepEqual(lib.userLocationIds(membership, "U2").sort(), [MAIN.location_id, NORTH.location_id].sort());
  assert.deepEqual(lib.userLocationIds(membership, "u3"), []);
});

test("membershipUpdates emits one PUT per location whose list actually changes", () => {
  const membership = { [MAIN.location_id]: ["u1", "u2"], [NORTH.location_id]: ["u2"] };
  // u2: Main+North → only North  ⇒ one update (Main loses u2)
  const a = lib.membershipUpdates(membership, "u2", [NORTH.location_id]);
  assert.deepEqual(a, [{ location_id: MAIN.location_id, tenant_user_ids: ["u1"] }]);
  // u1: Main → all locations (empty) ⇒ Main loses u1
  const b = lib.membershipUpdates(membership, "u1", []);
  assert.deepEqual(b, [{ location_id: MAIN.location_id, tenant_user_ids: ["u2"] }]);
  // u3: nothing → North ⇒ North gains u3
  const c = lib.membershipUpdates(membership, "u3", [NORTH.location_id.toUpperCase()]);
  assert.deepEqual(c, [{ location_id: NORTH.location_id, tenant_user_ids: ["u2", "u3"] }]);
  // no change ⇒ no updates
  assert.deepEqual(lib.membershipUpdates(membership, "u2", [MAIN.location_id, NORTH.location_id]), []);
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

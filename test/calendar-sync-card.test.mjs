// OLIVER Booking → Calendar sync, the two-provider card (B4).
//
// The card's job is to be honest about three different states that all used to
// render the same way:
//
//   connected            — busy time is being read right now
//   needs_reconnect      — there IS a connection row, and it stopped working.
//                          The old card showed a green tick for this, which is
//                          how an owner's real meetings quietly came back up
//                          for sale about an hour after they connected Outlook.
//   not available yet    — the one-time Google console step (T-GCP) has not
//                          been done, so pressing Connect can only land on a
//                          Google error page.
//
// Plus one deploy-window case: a new Portal talking to an old oliver-api gets
// no `connections` array, and must not tell an owner with a working Outlook
// connection that they have none.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  toRows, isProviderUnavailable, errorCodeOf, errorMessageOf,
  PROVIDER_ORDER, PROVIDER_LABEL, GOOGLE_NOT_CONFIGURED_FALLBACK,
} from "../src/lib/calendarConnections.ts";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const CARD = readFileSync(path.join(SRC, "pages", "oliver", "CalendarSyncCard.tsx"), "utf8");

const GOOGLE_ROW = {
  provider: "google",
  provider_label: "Google Calendar",
  account_email: "owner@example.com",
  status: "connected",
  last_refreshed_at: "2026-09-06T08:00:00Z",
  last_refresh_error: null,
  calendars: ["owner@example.com", "jobs@group.calendar.google.com"],
  is_configured: true,
};

const MS_ROW = {
  provider: "microsoft365",
  provider_label: "Microsoft 365",
  account_email: "owner@contoso.com",
  status: "connected",
  last_refreshed_at: null,
  last_refresh_error: null,
  calendars: [],
  is_configured: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// ROWS
// ─────────────────────────────────────────────────────────────────────────────
test("both provider rows always render, in a fixed order", () => {
  const rows = toRows({ connections: [] });
  assert.deepEqual(rows.map((r) => r.provider), ["microsoft365", "google"],
    "a business chooses per calendar, not between two options — both rows are always offered");
  assert.deepEqual(rows.map((r) => r.provider_label), ["Microsoft 365", "Google Calendar"]);
  assert.deepEqual(rows.map((r) => r.status), [null, null]);
  assert.deepEqual(PROVIDER_ORDER, ["microsoft365", "google"]);
});

test("a connected Google row keeps its account and its chosen calendars", () => {
  const rows = toRows({ connections: [GOOGLE_ROW] });
  const google = rows.find((r) => r.provider === "google");
  assert.equal(google.status, "connected");
  assert.equal(google.account_email, "owner@example.com");
  assert.deepEqual(google.calendars, ["owner@example.com", "jobs@group.calendar.google.com"]);
  assert.equal(rows.find((r) => r.provider === "microsoft365").status, null,
    "one provider connected must not imply the other is");
});

test("both connected = both rows connected", () => {
  const rows = toRows({ connections: [GOOGLE_ROW, MS_ROW] });
  assert.deepEqual(rows.map((r) => r.status), ["connected", "connected"]);
  assert.deepEqual(rows.map((r) => r.provider), ["microsoft365", "google"],
    "and the order is the card's, not the API's");
});

test("a connection whose renewal failed is never rendered as connected", () => {
  const rows = toRows({
    connections: [{ ...GOOGLE_ROW, status: "needs_reconnect", last_refresh_error: "invalid_grant" }],
  });
  const google = rows.find((r) => r.provider === "google");
  assert.equal(google.status, "needs_reconnect",
    "this is the state the owner has to act on; a green tick over it is the original defect");
  assert.equal(google.last_refresh_error, "invalid_grant");
});

test("an old API's single-connection shape still shows the working Outlook connection", () => {
  // The deploy window: new Portal, oliver-api not yet updated. No
  // `connections` array exists in that response.
  const rows = toRows({
    connected: true,
    status: "connected",
    account_email: "owner@contoso.com",
    last_refreshed_at: "2026-09-06T08:00:00Z",
  });
  const ms = rows.find((r) => r.provider === "microsoft365");
  assert.equal(ms.status, "connected",
    "telling an owner their live connection is gone invites them to reconnect something that is fine");
  assert.equal(ms.account_email, "owner@contoso.com");
  assert.equal(rows.find((r) => r.provider === "google").status, null);
});

test("an old API with nothing connected reads as nothing connected", () => {
  assert.deepEqual(toRows({ connected: false }).map((r) => r.status), [null, null]);
  assert.deepEqual(toRows(null).map((r) => r.status), [null, null]);
});

// ─────────────────────────────────────────────────────────────────────────────
// THE ONE-TIME GOOGLE CONSOLE STEP
// ─────────────────────────────────────────────────────────────────────────────
test("before the console step, Google reads 'not available yet' — not 'not connected'", () => {
  const status = {
    connections: [],
    google_available: false,
    google_unavailable_reason: GOOGLE_NOT_CONFIGURED_FALLBACK,
  };
  const rows = toRows(status);
  const google = rows.find((r) => r.provider === "google");

  assert.equal(google.is_configured, false);
  assert.equal(isProviderUnavailable(google, status), true,
    "offering a Connect button that can only land on a Google error page is worse than saying why");
  assert.equal(isProviderUnavailable(rows.find((r) => r.provider === "microsoft365"), status), false,
    "the Google console step has nothing to do with Microsoft");
});

test("a business already connected to Google stays connected even if the flag flaps", () => {
  const status = { connections: [GOOGLE_ROW], google_available: false };
  const google = toRows(status).find((r) => r.provider === "google");
  assert.equal(isProviderUnavailable(google, status), false,
    "hiding a live connection behind a setup message would read as 'we lost your calendar'");
});

test("with Google configured the row is simply not connected", () => {
  const status = { connections: [], google_available: true };
  const google = toRows(status).find((r) => r.provider === "google");
  assert.equal(google.is_configured, true);
  assert.equal(isProviderUnavailable(google, status), false);
});

test("the not-configured sentence is plain, and blames nobody the owner can see", () => {
  assert.match(GOOGLE_NOT_CONFIGURED_FALLBACK, /one-time step in the Google console/);
  for (const jargon of [/redirect_uri/i, /invalid_scope/i, /oauth/i, /client id/i, /tenant/i]) {
    assert.doesNotMatch(GOOGLE_NOT_CONFIGURED_FALLBACK, jargon,
      "an owner cannot act on an OAuth error string, and the word is Business, never tenant");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ERRORS OFF THE WIRE
// ─────────────────────────────────────────────────────────────────────────────
test("the API's code and sentence survive oliverApi's Error(\"OLIVER API 503: {...}\") wrapper", () => {
  const err = new Error(
    'OLIVER API 503: {"error":"google_client_not_configured","code":"google_client_not_configured",' +
    `"message":"${GOOGLE_NOT_CONFIGURED_FALLBACK}"}`,
  );
  assert.equal(errorCodeOf(err), "google_client_not_configured",
    "the code is the difference between 'try again' and 'this needs a setup step'");
  assert.equal(errorMessageOf(err, "fallback"), GOOGLE_NOT_CONFIGURED_FALLBACK,
    "show the API's own sentence, so support and the owner read the same words");
});

test("an error with no JSON body still produces something to read", () => {
  assert.equal(errorCodeOf(new Error("Failed to fetch")), null);
  assert.equal(errorMessageOf(new Error("Failed to fetch"), "fallback"), "Failed to fetch");
  assert.equal(errorMessageOf(null, "fallback"), "fallback");
  assert.equal(errorCodeOf(undefined), null);
});

test("a malformed body does not throw its way out of the error handler", () => {
  const err = new Error("OLIVER API 500: {not json");
  assert.equal(errorCodeOf(err), null);
  assert.equal(errorMessageOf(err, "fallback"), "OLIVER API 500: {not json");
});

// ─────────────────────────────────────────────────────────────────────────────
// THE CARD ITSELF
// ─────────────────────────────────────────────────────────────────────────────
test("the card offers Connect / Reconnect / Disconnect on each row", () => {
  assert.match(CARD, /"Reconnect"/, "a needs_reconnect row has to offer the fix");
  assert.match(CARD, />\s*Disconnect\s*</, "and every connected row has to be undoable");
  assert.match(CARD, /`Connect \$\{row\.provider_label\}`/,
    "the Connect button names the provider, so the two rows never read the same");
  assert.match(CARD, /Choose calendars/, "Google needs a calendar picker, Microsoft does not");
  assert.match(CARD, /calendar_ids/, "and the picker has to save the choice");
});

test("the card hits the Google routes the API actually exposes", () => {
  for (const route of [
    "/booking/calendar/status",
    "/booking/calendar/google/connect",
    "/booking/calendar/google/calendars",
    "/booking/calendar/google",
    "/booking/calendar/microsoft365/connect",
    "/booking/calendar/microsoft365",
  ]) {
    assert.ok(CARD.includes(route), `missing ${route}`);
  }
});

test("the card never says 'tenant' to a business owner", () => {
  const visible = CARD
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
    .join("\n");
  assert.doesNotMatch(visible, /\btenant\b/i, "the word is Business");
});

test("the card promises read-only, because that is decision O-1", () => {
  assert.match(CARD, /never adds, moves or deletes/,
    "OLIVER reads free/busy and never writes an event — the card has to say so where the owner grants access");
  assert.match(CARD, /free or busy — never what your meetings are/,
    "and it should say what Google is actually being asked for");
});

test("the card strips the OAuth outcome out of the URL after showing it", () => {
  assert.match(CARD, /replaceState/,
    "leaving ?calendar=error in the URL replays a stale failure on every refresh of the page");
  for (const p of ["calendar", "provider", "code", "message"]) {
    assert.ok(CARD.includes(`params.delete("${p}")`), `?${p} must be cleared`);
  }
});

test("the booking page hands the card a memoised api object", () => {
  const page = readFileSync(path.join(SRC, "pages", "oliver", "OliverBookingPage.tsx"), "utf8");
  assert.match(page, /const calendarApi = useMemo\(/,
    "a fresh object literal per render re-fires the card's load effect on every keystroke in the form above it");
  assert.match(page, /<CalendarSyncCard api=\{calendarApi\} \/>/);
  assert.doesNotMatch(page, /calStatus|connectM365|disconnectM365/,
    "the old single-provider card and its state must be gone, not left beside the new one");
});

test("PROVIDER_LABEL is the only place the provider names are spelled", () => {
  assert.deepEqual(PROVIDER_LABEL, { microsoft365: "Microsoft 365", google: "Google Calendar" });
});

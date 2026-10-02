// The bank sends you back — STELLA → Settings → Bank and card accounts.
//
// Banks that sign you in on their own site (Chase, Capital One, Amex, Bank of
// America …) return the person to the Bank page with ?oauth_state_id=… on the
// address. Link only finishes if it is reopened with the SAME link token and
// that address. lib/plaidReturn.ts is the rule; every branch is walked here.
//
// MUTATION CHECKS (each broken on purpose, seen red, restored):
//   · readToken — drop the `age > PLAID_TOKEN_MAX_AGE_MS` test
//        → "a token older than 30 minutes is expired" RED
//   · readReturn — hand back the stripped address instead of `url`
//        → "a fresh token resumes with the address exactly as the bank sent it" RED
//   · StellaBankPage — usePlaidLink({ token, onSuccess, … }) without receivedRedirectUri
//        → "the Bank page passes receivedRedirectUri to Link" RED
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PLAID_TOKEN_KEY, PLAID_TOKEN_MAX_AGE_MS, OAUTH_RETURN_PARAM,
  readReturn, rememberToken, clearToken, readToken, stripReturnParam,
} from "../src/lib/plaidReturn.ts";

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

const BANK = "https://portal.intelligentanalyticsdm.com/app/services/stella_settings_bank";
const RETURNED = `${BANK}?oauth_state_id=abc-123`;
const NOW = Date.UTC(2026, 9, 1, 15, 0, 0);

describe("readReturn — what the Bank page does on load", () => {
  test("a fresh token resumes with the address exactly as the bank sent it", () => {
    const s = memoryStorage();
    rememberToken(s, "link-sandbox-1", NOW - 5 * 60 * 1000);
    const r = readReturn(RETURNED, s, NOW);
    assert.deepEqual(r, { kind: "resume", token: "link-sandbox-1", receivedRedirectUri: RETURNED });
  });

  test("a token older than 30 minutes is expired", () => {
    const s = memoryStorage();
    rememberToken(s, "link-sandbox-1", NOW - PLAID_TOKEN_MAX_AGE_MS - 1);
    assert.deepEqual(readReturn(RETURNED, s, NOW), { kind: "expired" });
  });

  test("a token exactly 30 minutes old is still good", () => {
    const s = memoryStorage();
    rememberToken(s, "link-sandbox-1", NOW - PLAID_TOKEN_MAX_AGE_MS);
    assert.equal(readReturn(RETURNED, s, NOW).kind, "resume");
  });

  test("no token kept at all is expired", () => {
    assert.deepEqual(readReturn(RETURNED, memoryStorage(), NOW), { kind: "expired" });
  });

  test("no storage at all (blocked site data) is expired, never a crash", () => {
    assert.deepEqual(readReturn(RETURNED, null, NOW), { kind: "expired" });
    const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
    assert.deepEqual(readReturn(RETURNED, throwing, NOW), { kind: "expired" });
    assert.doesNotThrow(() => rememberToken(throwing, "t", NOW));
    assert.doesNotThrow(() => clearToken(throwing));
  });

  test("an unreadable or half-written token is expired", () => {
    for (const raw of ["not json", "{}", JSON.stringify({ token: "t" }), JSON.stringify({ savedAt: NOW }), JSON.stringify({ token: "", savedAt: NOW })]) {
      const s = memoryStorage({ [PLAID_TOKEN_KEY]: raw });
      assert.deepEqual(readReturn(RETURNED, s, NOW), { kind: "expired" }, raw);
    }
  });

  test("a token stamped in the future (clock moved) is not trusted", () => {
    const s = memoryStorage();
    rememberToken(s, "t", NOW + 60 * 1000);
    assert.equal(readReturn(RETURNED, s, NOW).kind, "expired");
  });

  test("no oauth_state_id is an ordinary visit, even with a token kept", () => {
    const s = memoryStorage();
    rememberToken(s, "link-sandbox-1", NOW);
    assert.deepEqual(readReturn(BANK, s, NOW), { kind: "none" });
    assert.deepEqual(readReturn(`${BANK}?tab=x`, s, NOW), { kind: "none" });
    assert.deepEqual(readReturn("not a url", s, NOW), { kind: "none" });
  });

  test("readReturn reads and never writes — the page clears the token itself", () => {
    const s = memoryStorage();
    rememberToken(s, "t", NOW - PLAID_TOKEN_MAX_AGE_MS * 2);
    readReturn(RETURNED, s, NOW);
    assert.ok(s._map.has(PLAID_TOKEN_KEY));
  });
});

describe("rememberToken / clearToken", () => {
  test("the token is kept under stella_plaid_link_token with the time", () => {
    const s = memoryStorage();
    rememberToken(s, "link-sandbox-9", NOW);
    assert.equal(PLAID_TOKEN_KEY, "stella_plaid_link_token");
    assert.deepEqual(JSON.parse(s.getItem(PLAID_TOKEN_KEY)), { token: "link-sandbox-9", savedAt: NOW });
    assert.equal(readToken(s, NOW), "link-sandbox-9");
  });

  test("clearToken forgets it", () => {
    const s = memoryStorage();
    rememberToken(s, "t", NOW);
    clearToken(s);
    assert.equal(s.getItem(PLAID_TOKEN_KEY), null);
    assert.equal(readToken(s, NOW), null);
  });

  test("an empty token is not kept", () => {
    const s = memoryStorage();
    rememberToken(s, "", NOW);
    assert.equal(s.getItem(PLAID_TOKEN_KEY), null);
  });
});

describe("stripReturnParam — the address after the connection finishes", () => {
  test("takes oauth_state_id off and leaves no dangling ?", () => {
    assert.equal(OAUTH_RETURN_PARAM, "oauth_state_id");
    assert.equal(stripReturnParam(RETURNED), BANK);
  });

  test("keeps every other parameter and the hash", () => {
    assert.equal(stripReturnParam(`${BANK}?a=1&oauth_state_id=x&b=2#top`), `${BANK}?a=1&b=2#top`);
  });

  test("an address without it comes back unchanged", () => {
    assert.equal(stripReturnParam(`${BANK}?a=1`), `${BANK}?a=1`);
    assert.equal(stripReturnParam("not a url"), "not a url");
  });
});

/* ── The page wiring a typecheck cannot see ─────────────────────────────── */

const bankPage = readFileSync(path.join(process.cwd(), "src/pages/stella/StellaBankPage.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("StellaBankPage uses the rule", () => {
  test("the Bank page passes receivedRedirectUri to Link when the bank sends the person back", () => {
    assert.match(bankPage, /usePlaidLink\(\{ token, receivedRedirectUri, onSuccess/);
    assert.match(bankPage, /readReturn\(window\.location\.href, linkTokenStore\(\), Date\.now\(\)\)/);
    assert.match(bankPage, /setReceivedRedirectUri\(bankReturn\.receivedRedirectUri\)/);
    assert.match(bankPage, /receivedRedirectUri=\{receivedRedirectUri \|\| undefined\}/);
  });

  test("the token is kept when Link first opens, and forgotten on success and on exit", () => {
    assert.match(bankPage, /rememberToken\(linkTokenStore\(\), r\.link_token, Date\.now\(\)\)/);
    const success = bankPage.slice(bankPage.indexOf("const onLinkSuccess"), bankPage.indexOf("const onLinkExit"));
    const exit = bankPage.slice(bankPage.indexOf("const onLinkExit"), bankPage.indexOf("const syncNow"));
    for (const block of [success, exit]) {
      assert.match(block, /clearToken\(linkTokenStore\(\)\)/);
      assert.match(block, /stripReturnFromAddress\(\)/);
    }
    // Success still finishes the ordinary way: exchange, then the list reloads.
    assert.match(success, /post\("\/ledger\/plaid\/exchange"/);
    assert.match(success, /await reload\(\)/);
  });

  test("no usable token says so in one plain line, with the Connect button", () => {
    assert.match(bankPage, /The bank sent you back, but the connection had expired\. Start again\./);
    assert.match(bankPage, /window\.history\.replaceState\(window\.history\.state, "", next\)/);
  });

  test("the not-switched-on state (keys not on this environment) says so in plain words", () => {
    // 2 Oct 2026 review: it read "Plaid keys pending" and "Sandbox keys unlock
    // this — setup guide in the Plaid readiness pack" — words for us, not for
    // an owner. The button stays disabled and the line names the way in.
    assert.doesNotMatch(bankPage, /Plaid keys pending|Sandbox keys|readiness pack|not configured on this environment|Opening Plaid Link/);
    assert.match(bankPage, /<Button variant="primary" disabled title=\{NOT_SWITCHED_ON_TITLE\}>\s*Connect a bank or card\s*<\/Button>/);
    assert.match(bankPage, /\{PLAID_SENTENCES\.notSwitchedOn\}/);
    assert.match(bankPage, /const NOT_SWITCHED_ON_TITLE = "Bank connections aren't switched on here yet";/);
  });
});

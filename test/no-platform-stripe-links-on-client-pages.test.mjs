// Client-facing pages must not link into the PLATFORM's Stripe Connect admin.
//
// OliverPayoutsPage is routed at oliver_payouts with no founder gate — every
// business sees it. Its "Resolve in Stripe" and per-payout links pointed at
// dashboard.stripe.com/connect/accounts/<their account>, which is how the
// PLATFORM views a connected account. A client clicking it lands somewhere they
// have no access to. The account owner uses their own dashboard.
//
// Brandon hit the same confusion from the other side: hunting for the payout
// bank in the Stripe BILLING portal, which is the surface for paying US and has
// no payout bank in it at all. Two Stripe surfaces, opposite directions, and
// the product offered no correct route to either.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "pages", "oliver");

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const f = path.join(dir, e);
    if (statSync(f).isDirectory()) out.push(...walk(f));
    else if (/\.tsx?$/.test(f)) out.push(f);
  }
  return out;
}

test("no client-facing OLIVER page links to the platform's Connect admin view", () => {
  const offenders = [];
  for (const f of walk(ROOT)) {
    const src = readFileSync(f, "utf8");
    // Strip comments so the note explaining the fix is not itself a hit.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    if (/dashboard\.stripe\.com\/connect\/accounts/.test(code)) {
      offenders.push(path.relative(ROOT, f));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these client-facing pages link to dashboard.stripe.com/connect/accounts/... — the ` +
      `PLATFORM's view of a connected account, which the business itself cannot open. ` +
      `Link the owner to their own dashboard (dashboard.stripe.com/settings/payouts for ` +
      `the payout bank) instead: ${offenders.join(", ")}`,
  );
});

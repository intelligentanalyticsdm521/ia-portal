// PRE-WALK 1 (2026-09-07) — nothing outside the auth seam may read
// `useMsal().accounts[0]`.
//
// WHY THIS EXISTS
// ---------------
// Under `VITE_DEV_AUTH=1` there is no MSAL session and never will be, so
// `accounts` is permanently empty and `accounts[0]` is `undefined`. Every
// `if (!account) return` written on top of it turns into a silent dead end:
//
//   * Settings -> Your business called `load()`, which did
//     `if (!account || !tenantId) return;` BEFORE `setLoading(false)` — the
//     page sat on "Loading your business profile…" for ever with no request in
//     the network tab and no error on screen. That is the whole of Foundation
//     B's walk (rows B1-B8) and IL-3's rows R1/R2/R7, unwalkable.
//   * OLIVER Invoices' "Download PDF" and the three "Export CSV" buttons
//     returned early and did nothing at all when pressed.
//   * The Lead Gen term-review modal never fetched its parent-term suggestions.
//
// `useActiveAccount()` (src/auth/useAccessToken.ts) exists precisely for this
// and hands back the dev stand-in; it compiles down to `accounts[0]` in a
// production build, so this is a dev-only difference with no runtime cost.
//
// The seam itself is the one allowed reader.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

// The one module allowed to read the raw array: it IS the seam.
const ALLOWED = [path.join("auth", "useAccessToken.ts")];

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Strip line and block comments so the explanatory notes do not trip the scan. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("no page or component reads useMsal().accounts[0] — they use useActiveAccount()", () => {
  const offenders = [];
  for (const file of sourceFiles(SRC)) {
    const rel = path.relative(SRC, file);
    if (ALLOWED.includes(rel)) continue;
    const src = stripComments(readFileSync(file, "utf8"));
    if (!/\baccounts\s*\[\s*0\s*\]/.test(src)) continue;
    const line = src.slice(0, src.search(/\baccounts\s*\[\s*0\s*\]/)).split("\n").length;
    offenders.push(`${rel}:${line}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `these read accounts[0] directly and are dead under VITE_DEV_AUTH=1 — use useActiveAccount():\n  ${offenders.join("\n  ")}`,
  );
});

test("Your business acquires its token through the shared seam, not acquireTokenSilent", () => {
  const src = readFileSync(path.join(SRC, "pages", "settings", "YourBusinessPage.tsx"), "utf8");
  assert.ok(
    src.includes("acquireApiToken("),
    "YourBusinessPage must call acquireApiToken — a raw acquireTokenSilent throws authority_mismatch on the dev stand-in account, before any fetch, so the devAuth interceptor never gets to strip the header",
  );
  assert.ok(
    !stripComments(src).includes("acquireTokenSilent"),
    "no page calls acquireTokenSilent directly",
  );
  assert.ok(
    src.includes("useActiveAccount()"),
    "and it takes its account from the seam",
  );
});

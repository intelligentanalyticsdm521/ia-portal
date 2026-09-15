// test/dev-business-picker.test.mjs — the DEV-ONLY business picker.
//
// Four properties, and each one is a thing that has actually gone wrong on this
// platform before:
//
//   1. THE HEADER FOLLOWS THE CHOICE. `x-dev-tenant` decides which business the
//      dev stack reads, and a pick the header ignores is the "header says one
//      business, data says another" symptom that read as cross-tenant leakage in
//      July.
//   2. ONE MECHANISM. The choice lives in `lib/actAsSession.ts` — the per-tab key
//      the founder business picker writes and AppGate resolves from. A second
//      store would be a second answer to "which business is this", and the
//      platform already has ten seams that went that way.
//   3. A PRODUCTION BUILD HAS NO PICKER. The dev seam's first lock is that Vite
//      inlines `import.meta.env` at build time, so the picker has to be gated on
//      that literal and on nothing else.
//   4. THE FOUNDER TENANT IS REFUSED. The shared CIAM directory means the founder
//      GUID is every JWT's `tid`; every backend dev seam blocks it and the Portal
//      must not offer a door the backends have bolted.
//
// The rules are imported and exercised for real (lib/devBusinesses.ts is pure on
// purpose). The wiring — inside modules that read `import.meta.env` and so cannot
// be imported by this runner — is asserted against source, with a MUTATION check
// on each grep so a passing assertion means something.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEV_BUSINESSES,
  devBusinessOptions,
  findDevBusiness,
  isSelectableDevBusiness,
  resolveDevTenantId,
} from "../src/lib/devBusinesses.ts";
import { ACT_AS_SESSION_KEY } from "../src/lib/actAsSession.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const read = (...p) => fs.readFileSync(path.join(SRC, ...p), "utf8");

// The PRODUCTION founder tenant. Typed here on purpose: this suite is what proves
// the picker refuses it, and the one-module grep (founder-tenant-one-module.test)
// only walks src/.
const FOUNDER = "8c9527b9-8999-4b31-a306-f3d4ccc39fbd";
const POC = "1a1a1a1a-0000-4000-8000-00000001a1a1";     // IA POC fixture (agency)
const SUMMIT = "a0000001-0000-0000-0000-000000000001";  // Summit Lawn (client)
const HARBOR = "c0000003-0000-0000-0000-000000000003";
const ENV_PIN = SUMMIT;

/** A sessionStorage stand-in — Node has none, and the rules must not care. */
function installSessionStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  const stub = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    clear: () => map.clear(),
  };
  const had = Object.prototype.hasOwnProperty.call(globalThis, "sessionStorage");
  const prior = had ? globalThis.sessionStorage : undefined;
  Object.defineProperty(globalThis, "sessionStorage", { value: stub, configurable: true, writable: true });
  return {
    map,
    restore() {
      if (had) Object.defineProperty(globalThis, "sessionStorage", { value: prior, configurable: true, writable: true });
      else delete globalThis.sessionStorage;
    },
  };
}

// ── 1. the header follows the choice ───────────────────────────────────────

test("with nothing picked, the header is still the env pin", () => {
  assert.equal(resolveDevTenantId({ envPin: ENV_PIN }, FOUNDER), ENV_PIN);
});

test("the header sends the picked business, not the env pin", () => {
  assert.equal(
    resolveDevTenantId({ actAsTenantId: POC, envPin: ENV_PIN }, FOUNDER),
    POC,
    "x-dev-tenant must name the business the picker chose",
  );
});

test("the pick outranks AppState's persisted business, which AppGate rewrites on every boot", () => {
  // THE reason the per-tab key is read above `activeTenantId`: AppGate re-selects
  // and rewrites that one on bootstrap, and DELETES it first for a super user, so
  // a choice read only from there is undone by the reload that applies it — the
  // fault measured on the dev stack 2026-09-14.
  assert.equal(
    resolveDevTenantId({ actAsTenantId: POC, activeTenantId: SUMMIT, envPin: ENV_PIN }, FOUNDER),
    POC,
  );
});

test("a live emergency act-as target still outranks the pick", () => {
  assert.equal(
    resolveDevTenantId(
      { emergencyTarget: HARBOR, actAsTenantId: POC, activeTenantId: SUMMIT, envPin: ENV_PIN },
      FOUNDER,
    ),
    HARBOR,
    "a time-boxed session already in flight is not something a stored pick may hijack",
  );
});

test("the choice survives a reload — per-tab storage, read fresh on every request", () => {
  const s = installSessionStorage({ [ACT_AS_SESSION_KEY]: POC });
  try {
    // A reload is a new module instance reading the same storage: there is no
    // in-memory cache to go stale, which is the point.
    assert.equal(s.map.get(ACT_AS_SESSION_KEY), POC);
    assert.equal(
      resolveDevTenantId({ actAsTenantId: s.map.get(ACT_AS_SESSION_KEY), envPin: ENV_PIN }, FOUNDER),
      POC,
    );
  } finally {
    s.restore();
  }
});

test("a malformed or empty pick falls through instead of poisoning the header", () => {
  assert.equal(resolveDevTenantId({ actAsTenantId: "not-a-guid", envPin: ENV_PIN }, FOUNDER), ENV_PIN);
  assert.equal(resolveDevTenantId({ actAsTenantId: "", envPin: ENV_PIN }, FOUNDER), ENV_PIN);
  assert.equal(resolveDevTenantId({ actAsTenantId: null, envPin: ENV_PIN }, FOUNDER), ENV_PIN);
  assert.equal(
    resolveDevTenantId({ actAsTenantId: `  ${POC.toUpperCase()}  `, envPin: ENV_PIN }, FOUNDER),
    POC,
    "trimmed and lower-cased — the platform spells these ids both ways",
  );
});

test("the ONE place the header is attached reads the pick through the shared rule", () => {
  const devAuth = read("lib", "devAuth.ts");
  assert.match(devAuth, /getActAsTenantId/, "devAuth reads the per-tab key through lib/actAsSession");
  assert.match(devAuth, /resolveDevTenantId\(/, "the precedence is one pure function, not a second copy");
  assert.match(
    devAuth,
    /headers\.set\('x-dev-tenant', devTenant\)/,
    "still exactly one header injection — the picker adds no second path",
  );
  assert.match(
    devAuth,
    /const devTenant = resolveDevTenant\(\)/,
    "the value is resolved per request, so a pick applies without a Vite restart",
  );
});

// ── 2. one mechanism ───────────────────────────────────────────────────────

test("the dev picker stores the choice where the founder picker already does", () => {
  const picker = read("components", "DevBusinessPicker.tsx");
  assert.match(picker, /import \{ setActAsTenantId \} from '\.\.\/lib\/actAsSession'/);
  assert.match(picker, /setActAsTenantId\(tenantId\)/, "the same call FounderTenantPicker.handleSelect makes");

  const founderPicker = read("components", "FounderTenantPicker.tsx");
  assert.match(founderPicker, /setActAsTenantId\(targetTenantId\)/, "and the founder picker still writes it");
});

test("there is no second store for the choice", () => {
  const picker = read("components", "DevBusinessPicker.tsx");
  const lib = read("lib", "devBusinesses.ts");
  // Writing the choice anywhere else would be a second answer to "which business
  // is this dev stack in". Clearing AppGate's own long-term pin is not a store.
  assert.equal(/setItem\(/.test(picker), false, "the picker writes no storage key of its own");
  assert.equal(/localStorage|sessionStorage/.test(lib), false, "and the rules module touches no storage at all");
  assert.match(
    picker,
    /localStorage\.removeItem\('iadm\.portal\.activeTenantId'\)/,
    "it only CLEARS AppGate's stale long-term pin so the reload starts on the new business",
  );
});

test("AppGate's resolution order is the one that was already there", () => {
  const gate = read("app", "AppGate.tsx");
  assert.match(gate, /const sessionActAs = getActAsTenantId\(\);/, "still the per-tab key, read through the one module");
  assert.match(
    gate,
    /tenantToSelect = sessionMatch\?\.tenantId \|\| homeMatch\?\.tenantId \|\| tenants\[0\]\.tenantId;/,
    "the dev picker adds no branch here — it writes the key AppGate already reads first",
  );
  assert.equal(/DevBusinessPicker|devBusinesses/.test(gate), false, "AppGate does not know the dev picker exists");
});

test("AppGate matches the picked business case-INSENSITIVELY", () => {
  // `v.tenants[].tenantId` comes back from SQL upper-cased; allow-lists, dev
  // seams and ids typed in source are lower-case. With exact equality the match
  // failed, AppGate fell through to the HOME business, and the app showed one
  // business while the headers went on naming the picked one. Measured on the
  // dev stack 2026-09-15: picking the POC fixture left the header on POC and the
  // Portal on The Software Company.
  const gate = read("app", "AppGate.tsx");
  assert.match(
    gate,
    /const wanted = \(sessionActAs \|\| ''\)\.toLowerCase\(\);/,
  );
  assert.match(
    gate,
    /tenants\.find\(\(t\) => String\(t\.tenantId\)\.toLowerCase\(\) === wanted\)/,
  );
  // MUTATION: the old exact-equality form must not come back.
  assert.equal(
    /tenants\.find\(\(t\) => t\.tenantId === sessionActAs\)/.test(gate),
    false,
    "exact equality is what silently routed to the home business",
  );
});

// ── 3. a production build has no picker ────────────────────────────────────

test("the picker renders only under the build-time dev flag", () => {
  const header = read("components", "HeaderBar.tsx");
  assert.match(
    header,
    /\{DEV_AUTH && !isSuperUser && \(/,
    "HeaderBar must gate the picker on DEV_AUTH — a literal `false` in a production build, which folds the branch away",
  );
  assert.match(header, /import \{ DEV_AUTH \} from '\.\.\/lib\/devAuth'/);

  const devAuth = read("lib", "devAuth.ts");
  // The SPELLING matters and this is the assertion that keeps it. Wrapped in
  // String(...) the flag is opaque to the bundler, stays a runtime `false`, and
  // everything behind it is still emitted — the picker's markup and labels were
  // in the production bundle, never rendered but there to read (measured
  // 2026-09-15). A direct comparison of the inlined literal folds at build time
  // and rollup drops the guarded component.
  assert.match(
    devAuth,
    /export const DEV_AUTH = import\.meta\.env\.VITE_DEV_AUTH === '1';/,
    "DEV_AUTH must be a DIRECT comparison of the build-time literal — a function call around it ships the picker",
  );
  // The declaration itself, not the comment that explains the history.
  assert.equal(
    /export const DEV_AUTH = String\(/.test(devAuth),
    false,
    "the old String(...) form is what shipped the picker's markup; it must not come back",
  );

  const picker = read("components", "DevBusinessPicker.tsx");
  assert.match(
    picker,
    /if \(!DEV_AUTH\) return null;/,
    "second lock: even if it were rendered, it renders nothing without the dev flag",
  );
});

test("MUTATION: the render-guard grep fails when the guard is removed", () => {
  const guard = /\{DEV_AUTH && !isSuperUser && \(/;
  assert.ok(guard.test("          {DEV_AUTH && !isSuperUser && ("), "passes on the real line");
  assert.ok(!guard.test("          {!isSuperUser && ("), "fails the moment somebody drops the flag");
  assert.ok(
    !guard.test("          {isDev && !isSuperUser && ("),
    "fails if the gate is swapped for a RUNTIME condition, which would ship the picker",
  );
});

test("the picker has exactly ONE import site, and it is the guarded one", () => {
  // An import, not a mention: other modules in the seam name the file in their
  // comments and that is how it should be.
  const IMPORTS_PICKER = /(import[^;]*\bDevBusinessPicker\b[^;]*from|from\s+['"][^'"]*DevBusinessPicker['"])/;
  const importers = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(SRC, dir || "."), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(rel); continue; }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      if (rel === "components/DevBusinessPicker.tsx") continue;
      if (IMPORTS_PICKER.test(fs.readFileSync(path.join(SRC, rel), "utf8"))) importers.push(rel);
    }
  })("");
  assert.deepEqual(importers, ["components/HeaderBar.tsx"],
    "one import site, one guard — a second one is a second way to ship it");

  // MUTATION: the grep tells an import from a comment that mentions the file.
  assert.ok(IMPORTS_PICKER.test("import { DevBusinessPicker } from './DevBusinessPicker';"));
  assert.ok(!IMPORTS_PICKER.test("// see components/DevBusinessPicker.tsx for the guard"));
});

// ── 4. the founder tenant is refused ───────────────────────────────────────

test("the founder business is not on the menu", () => {
  const options = devBusinessOptions(FOUNDER);
  assert.ok(options.length > 0, "the picker is not empty");
  assert.equal(
    options.some((b) => b.tenantId.toLowerCase() === FOUNDER),
    false,
    "the founder tenant must never be offered — every backend dev seam refuses it",
  );
  assert.equal(
    DEV_BUSINESSES.some((b) => b.tenantId.toLowerCase() === FOUNDER),
    false,
    "and it is not in the underlying fixture list either",
  );
});

test("MUTATION: devBusinessOptions really does the filtering", () => {
  // Feed it a founder id that IS in the list and prove the entry disappears.
  const victim = DEV_BUSINESSES[0].tenantId;
  const options = devBusinessOptions(victim.toUpperCase());
  assert.equal(options.length, DEV_BUSINESSES.length - 1);
  assert.equal(options.some((b) => b.tenantId === victim), false, "and the match is case-insensitive");
});

test("the founder tenant is refused on the way OUT of storage too", () => {
  // Hand-edit the key, or a founder picker pointed at the founder's own business:
  // either way the header must not carry it.
  assert.equal(isSelectableDevBusiness(FOUNDER, FOUNDER), false);
  assert.equal(isSelectableDevBusiness(FOUNDER.toUpperCase(), FOUNDER), false, "in either spelling");
  assert.equal(
    resolveDevTenantId({ actAsTenantId: FOUNDER, envPin: ENV_PIN }, FOUNDER),
    ENV_PIN,
    "it falls back to the env pin rather than sending the founder tenant",
  );
  assert.equal(
    resolveDevTenantId({ emergencyTarget: FOUNDER, actAsTenantId: POC, envPin: ENV_PIN }, FOUNDER),
    POC,
    "and the emergency step refuses it as well",
  );
});

test("the picker builds its list with the founder filter, not the raw array", () => {
  const picker = read("components", "DevBusinessPicker.tsx");
  assert.match(picker, /devBusinessOptions\(FOUNDER_TENANT_ID_DEFAULT\)/);
  assert.equal(
    /DEV_BUSINESSES\b/.test(picker),
    false,
    "rendering the unfiltered list would put the founder business on the menu the day one is added",
  );
});

test("a well-formed non-fixture GUID is still accepted from the shared key", () => {
  // Wider than the offered list ON PURPOSE: the founder picker writes the same
  // key for any business in core.tenants, and the header must follow it rather
  // than quietly reading a different business than the app is showing.
  assert.equal(isSelectableDevBusiness("11111111-2222-3333-4444-555555555555", FOUNDER), true);
});

// ── the list itself ────────────────────────────────────────────────────────

test("every offered business is a fixture: well-formed id, a name, and a kind", () => {
  for (const b of DEV_BUSINESSES) {
    assert.match(b.tenantId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      `${b.name}: ids are stored lower-case, exactly as the backend allow-lists spell them`);
    assert.ok(b.name.trim().length > 0);
    assert.ok(b.kind === "agency" || b.kind === "client", `${b.name}: kind is agency or client`);
    assert.ok(b.note.trim().length > 0, `${b.name}: say what the fixture is for`);
  }
  const ids = DEV_BUSINESSES.map((b) => b.tenantId);
  assert.equal(new Set(ids).size, ids.length, "no duplicates");
});

test("both halves of the walk are offered, and labelled the way the walk asks for them", () => {
  const poc = findDevBusiness(POC);
  assert.ok(poc, "the IA POC fixture — the agency business");
  assert.equal(poc.kind, "agency");
  assert.match(poc.name, /Intelligent Analytics/);

  const summit = findDevBusiness(SUMMIT);
  assert.ok(summit, "Summit Lawn — the client business");
  assert.equal(summit.kind, "client");
  assert.match(summit.name, /Summit Lawn/);

  assert.ok(DEV_BUSINESSES.some((b) => b.kind === "agency"), "at least one agency");
  assert.ok(DEV_BUSINESSES.some((b) => b.kind === "client"), "at least one client");
});

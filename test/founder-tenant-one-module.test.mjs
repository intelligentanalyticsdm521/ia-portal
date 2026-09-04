// test/founder-tenant-one-module.test.mjs — SEAM-4 in the Portal.
//
// The founder tenant GUID was pasted into runtime source in six repos. Its
// damage line is one sentence: nobody can change the founder tenant, ever —
// and migration 138's `tenant_kind` model exists precisely so a SECOND agency
// can run this platform.
//
// In the Portal it was in two `src/` files: `lib/currentPlan.ts` (which tenant
// gets founder plan defaults on every Plan & Pricing page) and `lib/devAuth.ts`
// (which tenant the dev seam refuses). It now lives in `lib/founderTenant.ts`.
//
// This suite is a SOURCE grep and imports nothing from src/: `founderTenant.ts`
// reads `import.meta.env`, and the runner's own rule is that anything touching
// `import.meta.env` is a component concern covered by tsc, not by node --test.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const GUID = /8c9527b9-8999-4b31-a306-f3d4ccc39fbd/i;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(SRC, dir || "."), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) { walk(rel, out); continue; }
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) continue;
    out.push(rel);
  }
  return out;
}

test("the founder tenant GUID appears in exactly ONE module under src/", () => {
  const ALLOWED = new Set(["lib/founderTenant.ts"]);
  const hits = walk("").filter(
    (rel) => GUID.test(fs.readFileSync(path.join(SRC, rel), "utf8")) && !ALLOWED.has(rel)
  );
  assert.deepEqual(hits, [],
    `the founder tenant GUID must only appear in src/lib/founderTenant.ts — found in: ${hits.join(", ")}`);
});

test("MUTATION: the grep catches both spellings a paste would produce", () => {
  assert.ok(GUID.test("const F = '8C9527B9-8999-4B31-A306-F3D4CCC39FBD';"));
  assert.ok(GUID.test('tenantId === "8c9527b9-8999-4b31-a306-f3d4ccc39fbd"'));
});

test("the one module is env-overridable, with the literal as the documented default", () => {
  const src = fs.readFileSync(path.join(SRC, "lib", "founderTenant.ts"), "utf8");
  assert.match(src, /VITE_FOUNDER_TENANT_ID/,
    "a browser bundle has no runtime env; VITE_ is the equivalent, and a second agency needs one");
  assert.match(src, /FOUNDER_TENANT_ID_DEFAULT = '8c9527b9-8999-4b31-a306-f3d4ccc39fbd'/,
    "the literal is the DEFAULT, because nothing sets the var today and removing it would break the founder's own plan page");
  assert.match(src, /toLowerCase\(\)/, "comparisons are case-insensitive — the id is spelled both ways across the platform");
});

test("the two former sites read the module, and each reads the RIGHT thing from it", () => {
  const plan = fs.readFileSync(path.join(SRC, "lib", "currentPlan.ts"), "utf8");
  assert.match(plan, /from "\.\/founderTenant"/);
  assert.match(plan, /isFounderTenantId\(tenantId\)/,
    "plan defaults follow the CONFIGURED founder tenant — a second agency gets its own defaults");

  const dev = fs.readFileSync(path.join(SRC, "lib", "devAuth.ts"), "utf8");
  assert.match(dev, /FOUNDER_TENANT_ID_DEFAULT/,
    "the dev seam refuses the PRODUCTION founder tenant specifically");
  assert.ok(!/const FOUNDER_TENANT = founderTenantId\(\)/.test(dev),
    "refusing the configured value would break a dev env pointed at a fixture agency — every backend's devAuth makes the same choice");
});

test("PLATFORM_OWNER_TENANT_ID keeps working — callers import it from currentPlan", () => {
  const plan = fs.readFileSync(path.join(SRC, "lib", "currentPlan.ts"), "utf8");
  assert.match(plan, /export \{ FOUNDER_TENANT_ID_DEFAULT as PLATFORM_OWNER_TENANT_ID \}/);
  // And somebody actually imports it, so the re-export is not decoration.
  const importers = walk("").filter((rel) =>
    /PLATFORM_OWNER_TENANT_ID|isPlatformOwner/.test(fs.readFileSync(path.join(SRC, rel), "utf8"))
    && rel !== "lib/currentPlan.ts");
  assert.ok(importers.length > 0, "nothing reads the plan helpers — check this file is still needed");
});

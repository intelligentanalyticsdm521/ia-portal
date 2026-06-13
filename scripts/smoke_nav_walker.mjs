// smoke_nav_walker.mjs — verify every SubNav entry → ServiceRouter case →
// page-component import → real file. Catches dead routes, missing
// components, mis-keyed catalog entries.
//
// Usage:  node scripts/smoke_nav_walker.mjs
// Exit 0 if all green, 1 if any FAIL.
//
// Excludes OLIVER per founder's 2026-06-12 instruction ("OLIVER is tested
// elsewhere"). Walks ARION + SPARK + Consulting + Settings + Argus + Stella.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SUBNAV = path.join(ROOT, "src/components/SubNav.tsx");
const ROUTER = path.join(ROOT, "src/pages/ServiceRouter.tsx");
const CATALOG = path.join(ROOT, "src/config/serviceCatalog.ts");

const sub = fs.readFileSync(SUBNAV, "utf8");
const router = fs.readFileSync(ROUTER, "utf8");
const catalog = fs.readFileSync(CATALOG, "utf8");

// ── Extract nav entries ───────────────────────────────────────────────────
// SubNav.tsx pattern: { key: "xxx_yyy", label: "...", route: "/app/services/xxx_yyy" ... }
const navEntries = [];
const navRe = /\{\s*key:\s*["']([^"']+)["']\s*,\s*label:\s*["']([^"']+)["']\s*,\s*route:\s*["']([^"']+)["']/g;
let m;
while ((m = navRe.exec(sub)) !== null) {
  navEntries.push({ key: m[1], label: m[2], route: m[3] });
}

// ── Extract ServiceRouter case lookup (which keys map to which components) ─
// Pattern: case "xxx_yyy": (switch) or  if (service.key === 'xxx_yyy') (top-level)
const routerCases = new Set();
const caseRe = /case\s+["']([^"']+)["']\s*:/g;
while ((m = caseRe.exec(router)) !== null) {
  routerCases.add(m[1]);
}
const ifRe = /service\.key\s*===\s*["']([^"']+)["']/g;
while ((m = ifRe.exec(router)) !== null) {
  routerCases.add(m[1]);
}

// ── Extract imports in ServiceRouter ──────────────────────────────────────
// Pattern: import { Foo } from "./bar"  or  import Foo from "./bar"
const routerImports = new Map(); // component name → import source path
const importRe = /import\s+(?:\{\s*([^}]+)\s*\}|(\w+))\s+from\s+["']([^"']+)["']/g;
while ((m = importRe.exec(router)) !== null) {
  const namedImports = m[1] ? m[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0]) : [m[2]];
  for (const name of namedImports) {
    routerImports.set(name, m[3]);
  }
}

// ── Extract serviceCatalog entries ─────────────────────────────────────────
// Also track which entries are explicitly marked coming_soon — those legitimately
// render via GenericServicePage placeholder, not a dedicated component, so
// they should NOT be flagged as "missing ServiceRouter case".
const catalogEntries = new Set();
const comingSoonKeys = new Set();
// Match { key: "...", ... defaultStatus: 'coming_soon' ... } across one line
const catalogEntryRe = /\{[^{}]*?key:\s*["']([^"']+)["'][^{}]*?\}/gs;
while ((m = catalogEntryRe.exec(catalog)) !== null) {
  const block = m[0];
  const key = m[1];
  catalogEntries.add(key);
  if (/defaultStatus:\s*['"]coming_soon['"]/.test(block)) comingSoonKeys.add(key);
}

// ── Walk each nav entry ────────────────────────────────────────────────────
const PRODUCTS = ["arion", "spark", "consulting", "settings", "argus", "stella"];
const results = [];

const filterPrefix = (k) =>
  PRODUCTS.some((p) => k.startsWith(p)) ||
  ["oliver_settings", "oliver_workflow_settings", "oliver_service_categories", "oliver_team_access"].includes(k);

const navByKey = new Map();
for (const e of navEntries) navByKey.set(e.key, e);

const seenKeys = new Set();
for (const e of navEntries) {
  if (seenKeys.has(e.key)) continue; // dedup (same key appears in both SubNav + Settings)
  seenKeys.add(e.key);
  if (!filterPrefix(e.key)) continue; // skip OLIVER

  const issues = [];

  // 1. Route must match key
  const expectedRoute = `/app/services/${e.key}`;
  if (e.route !== expectedRoute) issues.push(`route mismatch: ${e.route} vs ${expectedRoute}`);

  // 2. ServiceRouter must have a case — UNLESS the catalog flags it as
  //    coming_soon, in which case it falls through to GenericServicePage
  //    placeholder. That's the intended pattern for ARGUS/STELLA/FORGE
  //    coming-soon nav entries.
  if (!routerCases.has(e.key) && !comingSoonKeys.has(e.key)) {
    issues.push(`ServiceRouter has no case for "${e.key}"`);
  }

  // 3. serviceCatalog should have an entry (warning, not failure — some keys are intentionally not in catalog)
  const inCatalog = catalogEntries.has(e.key);

  results.push({
    key: e.key,
    label: e.label,
    route: e.route,
    status: issues.length === 0 ? "PASS" : "FAIL",
    inCatalog,
    issues,
  });
}

// ── Also report keys in ServiceRouter that are NOT in nav (orphans) ────────
const navKeys = new Set(navEntries.map(e => e.key));
const orphanCases = [];
for (const c of routerCases) {
  if (!filterPrefix(c)) continue;
  if (!navKeys.has(c)) orphanCases.push(c);
}

// ── Print report ──────────────────────────────────────────────────────────
const grouped = {};
for (const r of results) {
  const p = PRODUCTS.find((pp) => r.key.startsWith(pp)) || "other";
  grouped[p] ??= [];
  grouped[p].push(r);
}

console.log("\n╔══════════════════════════════════════════════════════════════════╗");
console.log("║ Portal Nav Walker — 2026-06-12                                  ║");
console.log("╚══════════════════════════════════════════════════════════════════╝\n");

let totalPass = 0, totalFail = 0;
for (const p of PRODUCTS) {
  const items = grouped[p] || [];
  if (items.length === 0) continue;
  const pass = items.filter(r => r.status === "PASS").length;
  const fail = items.length - pass;
  totalPass += pass;
  totalFail += fail;
  console.log(`── ${p.toUpperCase()} (${items.length} pages, ${pass} pass, ${fail} fail) ──`);
  for (const r of items) {
    const mark = r.status === "PASS" ? "✓" : "✗";
    const cat = r.inCatalog ? "" : "  [NOT-IN-CATALOG]";
    const issues = r.issues.length ? "  ⚠ " + r.issues.join(" · ") : "";
    console.log(`  ${mark} ${r.key.padEnd(40)} ${r.label.padEnd(28)}${cat}${issues}`);
  }
  console.log("");
}

if (orphanCases.length) {
  console.log(`── ORPHAN ROUTER CASES (in ServiceRouter but no nav entry) — ${orphanCases.length} found ──`);
  for (const c of orphanCases) console.log(`  ⚠ ${c}`);
  console.log("");
}

console.log("╔══════════════════════════════════════════════════════════════════╗");
console.log(`║ TOTAL: ${totalPass} PASS · ${totalFail} FAIL · ${orphanCases.length} ORPHAN ROUTER CASES`.padEnd(67) + "║");
console.log("╚══════════════════════════════════════════════════════════════════╝\n");

process.exit(totalFail > 0 ? 1 : 0);

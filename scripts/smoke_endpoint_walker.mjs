// smoke_endpoint_walker.mjs — for every Portal page (ARION/SPARK/Consulting/
// Settings) extract every backend API call, then cross-reference against the
// actual route registrations in arion-api, oliver-api, LUMEN-API.
//
// Catches the class of bug "page calls /foo/bar but backend has no /foo/bar".
//
// Output: per-page PASS/FAIL with list of unmatched endpoints.
//
// Usage:  node scripts/smoke_endpoint_walker.mjs [--verbose]
//         --verbose: print every endpoint found, not just the failures

import fs from "node:fs";
import path from "node:path";

const VERBOSE = process.argv.includes("--verbose");

const PORTAL = path.resolve(import.meta.dirname, "..");
const PAGES_ROOT = path.join(PORTAL, "src/pages");
const ARION_API = path.resolve(PORTAL, "../arion-api");
const OLIVER_API = "C:/dev/oliver-api";
const LUMEN_API = path.resolve(PORTAL, "../lumen-api");

// ── 1) Walk all page files in scope (skip OLIVER per founder) ─────────────
const SCOPES = ["arion", "spark", "consulting"];
const pageFiles = [];
for (const scope of SCOPES) {
  const dir = path.join(PAGES_ROOT, scope);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(".tsx")) pageFiles.push({ scope, file: path.join(dir, f), name: f });
  }
}
// Add ARGUS pages
for (const scope of ["argus", "stella"]) {
  const dir = path.join(PAGES_ROOT, scope);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(".tsx")) pageFiles.push({ scope, file: path.join(dir, f), name: f });
  }
}

// ── 2) Per page, detect which API hook it uses + extract endpoints ────────
//
// Patterns we recognize:
//   useArionApi()  → ARION_API
//   useOliverApi() → OLIVER_API
//   useSparkApi()  → LUMEN_API (the alias)
//   const { get, post, patch, del } = useXxxApi();
//   get("/foo/...")  post("/foo/...", body)  etc.
//
// Also catches the lib/xxxApi.ts standalone helpers like `getArionSite()`
// — those reach the backend via the same fetch path.
function extractEndpoints(src) {
  const out = { hook: null, calls: [] };
  if (/useArionApi/.test(src)) out.hook = "arion";
  else if (/useOliverApi|useConsultingApi/.test(src)) out.hook = "oliver";
  else if (/useSparkApi/.test(src)) out.hook = "lumen";
  else if (/useIadmApi|usePlatformApi/.test(src)) out.hook = "platform";

  // Matches:  .get<T>("/path")   get("/path", body)   get(`/path/${x}`)
  // Allow ${...} inside template literals (they aren't quote chars).
  // ORDER MATTERS: try the ${...} interpolation pattern FIRST so it consumes
  // the whole `${X}` block even when X contains nested quotes. The catch-all
  // `[^`"'\\]` matches `$` and `{` individually, so without prioritization
  // the engine never invokes the interpolation rule.
  const callRe = /\b(?:get|post|patch|put|del|delete)\s*(?:<[^>]+>)?\s*\(\s*[`"']((?:\$\{[^}]*\}|\\.|[^`"'\\])+)[`"']/g;
  let m;
  while ((m = callRe.exec(src)) !== null) {
    let p = m[1];
    // FIRST collapse every ${...} interpolation to a placeholder so the
    // following `?`-strip doesn't get tricked by ternaries inside the
    // interpolations (e.g. `${x ? "?a" : ""}` would otherwise look like a
    // query string). Distinguish PATH params (preceded by `/`) from QUERY
    // suffix interpolations (the rest) — only the latter get stripped.
    p = p.replace(/\$\{[^}]+\}/g, (match, offset, full) => {
      const prevChar = offset > 0 ? full[offset - 1] : "";
      return prevChar === "/" ? "\x00PATH\x00" : "\x00QUERY\x00";
    });
    // NOW drop trailing query string
    const qIdx = p.indexOf("?");
    if (qIdx > 0) p = p.slice(0, qIdx);
    // Strip trailing QUERY placeholder — that was a query-string append
    p = p.replace(/\x00QUERY\x00$/, "");
    // Trailing `/` after the strip → remove (unless URL is just "/")
    if (p.length > 1) p = p.replace(/\/$/, "");
    // Remaining placeholders become `:param` wildcards
    p = p.replace(/\x00PATH\x00/g, ":param");
    p = p.replace(/\x00QUERY\x00/g, ":param");
    if (p.startsWith("/")) out.calls.push(p);
  }
  return out;
}

// ── 3) Extract registered routes from each backend ─────────────────────────
// Pattern: router.METHOD('/route/...', ...)  or  app.use('/prefix', router)
function extractBackendRoutes(rootDir) {
  if (!fs.existsSync(rootDir)) return { routes: new Set(), mounts: [] };

  const routes = new Set();
  const mounts = []; // { prefix, routerFile } — to resolve mounted sub-routers

  function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) {
        if (["node_modules", ".git", "scripts", "test", "tests", "db", "migrations"].includes(f.name)) continue;
        walk(p);
        continue;
      }
      if (!(f.name.endsWith(".js") || f.name.endsWith(".mjs") || f.name.endsWith(".ts"))) continue;
      const src = fs.readFileSync(p, "utf8");
      // router.METHOD('/path', ...)
      const routeRe = /(?:router|app|api|v1)\.(get|post|patch|put|delete|all)\s*\(\s*[`"']([^`"']+)[`"']/g;
      let m;
      while ((m = routeRe.exec(src)) !== null) {
        routes.add(m[2]);
      }
      // app.use('/prefix', xxxRouter)  router.use('/prefix', xxxRouter)
      const mountRe = /\.(?:use)\s*\(\s*[`"']([^`"']+)[`"']\s*,\s*(?:[^,)]+,\s*)*(\w+Router)?\s*\)?/g;
      while ((m = mountRe.exec(src)) !== null) {
        mounts.push({ prefix: m[1], where: path.relative(rootDir, p) });
      }
    }
  }
  walk(rootDir);
  return { routes, mounts };
}

console.error("Indexing backend routes…");
const arionBE = extractBackendRoutes(ARION_API);
const oliverBE = extractBackendRoutes(OLIVER_API);
const lumenBE = extractBackendRoutes(LUMEN_API);
console.error(`  arion-api: ${arionBE.routes.size} routes`);
console.error(`  oliver-api: ${oliverBE.routes.size} routes`);
console.error(`  lumen-api: ${lumenBE.routes.size} routes`);

// ── 4) Per-hook mount-prefix maps (what does each Portal hook prepend?) ────
// useArionApi  → all calls hit arion-api with /arion/* (some hit /plugin/*)
// useOliverApi → all calls hit oliver-api with various prefixes
// useSparkApi  → all calls hit lumen-api at /api/v1/*
const HOOK_PREFIXES = {
  arion: ["/arion/", "/plugin/", "/health"],
  oliver: ["/booking/", "/jobs/", "/customers/", "/services/", "/subscriptions/",
           "/portal/", "/employee/", "/calendar/", "/payments/", "/automations/",
           "/admin/", "/quotes/", "/invoices/", "/messages/", "/notifications/",
           "/team/", "/branding/", "/business-profile/", "/products/", "/categories/",
           "/coupons/", "/workers/", "/me/", "/oliver/", "/consulting/",
           "/consulting-tickets", "/consulting-projects", "/consulting-events",
           "/consulting-overview", "/portal-domains/", "/automation/", "/forms/",
           "/proposals/", "/expenses/", "/lite/", "/dashboard/", "/onboarding/",
           "/billing/", "/projects/", "/setup/", "/connect/", "/templates/",
           "/dispatch/", "/leads/"],
  lumen: ["/api/v1/"],
  platform: ["/api/", "/tenants/", "/me/"],
};

// ── 5) Per-page check: does each extracted endpoint match a backend route? ─
function pathMatches(callPath, routes, mounts) {
  // Build a regex from a backend route pattern (`:foo` → `[^/]+`).
  const toRe = (route) => {
    const r = route.replace(/\/+$/, "");
    const segments = r.split("/").map(seg => {
      if (seg.startsWith(":")) return "[^/]+";
      // Escape regex metachars in literal segments
      return seg.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
    });
    return new RegExp("^" + segments.join("/") + "$");
  };
  // Caller path: convert :param wildcards to a placeholder that matches
  // exactly one path segment so we can test against backend regexes.
  const target = callPath.replace(/\/+$/, "");
  const targetSegs = target.split("/");
  const targetForRegexTest = targetSegs.map(seg =>
    seg === ":param" ? "_param_" : seg
  ).join("/");

  // Try direct match against every registered route
  for (const r of routes) {
    const re = toRe(r);
    if (re.test(targetForRegexTest)) return true;
    // Also test target with `:param` → some literal that matches `[^/]+`
    if (re.test(target.replace(/:param/g, "x"))) return true;
  }
  // Try mounted-prefix + route combinations
  for (const mount of mounts) {
    const prefix = mount.prefix.replace(/\/+$/, "");
    if (!target.startsWith(prefix)) continue;
    const remainder = target.slice(prefix.length) || "/";
    const remainderForRegex = remainder.replace(/:param/g, "x");
    for (const r of routes) {
      const re = toRe(r);
      if (re.test(remainder) || re.test(remainderForRegex)) return true;
    }
  }
  return false;
}

// ── Known walker limits: TypeScript-constrained variables that the static
//    walker can't infer but DO map to real backend routes at runtime. Each
//    entry must include the source-code reference proving the constraint.
const KNOWN_WALKER_LIMITS = new Set([
  // SparkAnomalyAlertsPage.tsx:140 — action: "ack" | "resolve" | "mute".
  //   Backend has POST /anomaly-alerts/:id/{ack,resolve,mute} (anomalyAlerts.js:122-146)
  "/api/v1/anomaly-alerts/:param/:param",
  // SparkApprovalsPage.tsx:86 — action: "approve" | "decline" | "cancel".
  //   Backend has POST /approvals/:id/{approve,decline,cancel} (approvals.js:135-199)
  "/api/v1/approvals/:param/:param",
  // SparkTemplateI18nPage.tsx:114 — base = "email-templates" | "sms-templates".
  //   Backend has DELETE /{email,sms}-templates/:id/translations/:locale (templateI18n.js:76,134)
  "/api/v1/:param/:param/translations/:param",
]);

// ── 6) Run! ────────────────────────────────────────────────────────────────
const report = [];
for (const pf of pageFiles) {
  const src = fs.readFileSync(pf.file, "utf8");
  const { hook, calls } = extractEndpoints(src);
  if (calls.length === 0) {
    report.push({ ...pf, hook, calls: [], unmatched: [], status: "NO_API" });
    continue;
  }

  const be = hook === "arion" ? arionBE
           : hook === "oliver" ? oliverBE
           : hook === "lumen" ? lumenBE
           : null;

  const unmatched = [];
  if (be) {
    const seen = new Set();
    for (const c of calls) {
      if (seen.has(c)) continue;
      seen.add(c);
      if (KNOWN_WALKER_LIMITS.has(c)) continue;
      if (!pathMatches(c, be.routes, be.mounts)) unmatched.push(c);
    }
  }

  report.push({
    ...pf,
    hook,
    calls,
    unmatched,
    status: unmatched.length === 0 ? "PASS" : "FAIL",
  });
}

// ── 7) Print report ────────────────────────────────────────────────────────
const grouped = {};
for (const r of report) {
  grouped[r.scope] ??= [];
  grouped[r.scope].push(r);
}

console.log("\n╔════════════════════════════════════════════════════════════════════════╗");
console.log("║ Portal Endpoint Walker — 2026-06-12                                   ║");
console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

let totalPass = 0, totalFail = 0, totalNoApi = 0;
for (const scope of ["arion", "spark", "consulting", "argus", "stella"]) {
  const items = grouped[scope] || [];
  if (items.length === 0) continue;
  const pass = items.filter(r => r.status === "PASS").length;
  const fail = items.filter(r => r.status === "FAIL").length;
  const noApi = items.filter(r => r.status === "NO_API").length;
  totalPass += pass; totalFail += fail; totalNoApi += noApi;
  console.log(`── ${scope.toUpperCase()} (${items.length} pages · ${pass} pass · ${fail} fail · ${noApi} no-api) ──`);
  for (const r of items) {
    const mark = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "○";
    const calls = r.calls.length ? `${r.calls.length} call(s)` : "no API";
    const hook = r.hook ? `[${r.hook}]` : "[?]";
    console.log(`  ${mark} ${r.name.padEnd(40)} ${hook.padEnd(10)} ${calls}`);
    if (r.status === "FAIL") {
      for (const u of r.unmatched) console.log(`      ✗ unmatched: ${u}`);
    } else if (VERBOSE && r.status === "PASS") {
      for (const c of [...new Set(r.calls)]) console.log(`      · ${c}`);
    }
  }
  console.log("");
}

console.log("╔════════════════════════════════════════════════════════════════════════╗");
console.log(`║ TOTAL: ${totalPass} PASS · ${totalFail} FAIL · ${totalNoApi} NO-API ║`.padEnd(73) + "║");
console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

process.exit(totalFail > 0 ? 1 : 0);

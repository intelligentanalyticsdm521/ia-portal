// lint-dead-links.mjs — internal hrefs that go nowhere.
//
// A dead in-app link is invisible in review and in the build: TypeScript is
// happy, the bundle compiles, and the user lands on "Service not found" or a
// blank route. Three shipped and were only found by reading the code:
//
//   /app/services/spark_settings      the ONLY escape offered to a tenant with
//                                     no sender configured (SparkCampaignComposerModal)
//   /app/services/consulting_requests  "Ask a question" on the plan-locked card
//   /app/settings/billing              "View plans" on the same card
//
// The last two were written the same night the card was built, which is the
// argument for a lint rather than more care.
//
// Two link shapes, two sources of truth:
//   /app/services/<key>  -> must exist in src/config/serviceCatalog.ts
//   /app/<path>          -> must match a <Route path="..."> in src/App.tsx
//
// Template literals (`/app/services/${k}`) are skipped — the target is dynamic.
//
//   node scripts/lint-dead-links.mjs
import fs from "node:fs";
import path from "node:path";

const SRC = "src";
const SKIP = /node_modules|[\\/]\.git|[\\/]dist/;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

// ── the two catalogues of what exists ──────────────────────────────────────
const catalogSrc = fs.readFileSync("src/config/serviceCatalog.ts", "utf8");
const serviceKeys = new Set(
  [...catalogSrc.matchAll(/key:\s*['"]([a-z0-9_]+)['"]/gi)].map((m) => m[1])
);

// Routes NEST: <Route path="admin/consulting"> ... <Route path="clients">
// composes to admin/consulting/clients. Parsing the JSX properly is not worth
// it here — `element={<Page />}` defeats any regex that tries to find the end
// of the opening tag, and a half-parser reported every route as missing.
//
// So: collect every path= value flatly, then accept a link if it IS one, or if
// it splits into a parent route + a child route. That covers the one level of
// nesting App.tsx actually uses and deliberately errs toward silence — a lint
// that cries wolf gets ignored, which is worse than one that misses a case.
const routePaths = new Set();
for (const f of walk(SRC)) {
  const txt = fs.readFileSync(f, "utf8");
  if (!txt.includes("<Route")) continue;
  for (const m of txt.matchAll(/path=["']([^"']+)["']/g)) routePaths.add(m[1].replace(/^\/+/, ""));
}

function segMatch(routeSeg, linkSeg) {
  return routeSeg.startsWith(":") || routeSeg === linkSeg;
}
function matchesRoute(route, link) {
  const r = route.split("/").filter(Boolean);
  const l = link.split("/").filter(Boolean);
  if (r.length !== l.length) return false;
  return r.every((seg, i) => segMatch(seg, l[i]));
}
function routeExists(link) {
  if ([...routePaths].some((r) => matchesRoute(r, link))) return true;
  // parent + child composition
  const parts = link.split("/").filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    const head = parts.slice(0, i).join("/");
    const tail = parts.slice(i).join("/");
    const headOk = [...routePaths].some((r) => matchesRoute(r, head));
    const tailOk = [...routePaths].some((r) => matchesRoute(r, tail));
    if (headOk && tailOk) return true;
  }
  return false;
}


const findings = [];
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, "utf8");
  const lineOf = (i) => src.slice(0, i).split("\n").length;

  for (const m of src.matchAll(/["'`](\/app\/[A-Za-z0-9_\-/]+)["'`]/g)) {
    const href = m[1];
    // Skip anything interpolated — the target isn't knowable statically.
    if (href.includes("${")) continue;
    const rest = href.replace(/^\/app\//, "");

    if (rest.startsWith("services/")) {
      const key = rest.slice("services/".length).split("/")[0];
      if (!key) continue;
      if (!serviceKeys.has(key)) {
        findings.push({ file, line: lineOf(m.index), href, why: `no '${key}' in serviceCatalog.ts` });
      }
      continue;
    }
    if (!routeExists(rest)) {
      findings.push({ file, line: lineOf(m.index), href, why: "no matching <Route> in App.tsx" });
    }
  }
}

console.log(`service keys: ${serviceKeys.size} · routes: ${routePaths.size}\n`);
console.log("=".repeat(72));
console.log(`DEAD INTERNAL LINKS (${findings.length})`);
console.log("=".repeat(72));
for (const f of findings) {
  console.log(`  ${f.href}\n      ${f.file.replace(/\\/g, "/")}:${f.line}  — ${f.why}`);
}
if (!findings.length) console.log("  none");
process.exit(findings.length ? 1 : 0);

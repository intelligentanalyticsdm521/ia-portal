// Every in-app link must point at a route that exists.
//
// 2026-09-01 — the Settings audit deleted two mockup pages
// (/app/settings/notifications and /app/settings/security) and their routes,
// but AccountMenu — the hamburger itself — kept linking to both. The build was
// clean, the typecheck was clean, and the links shipped to production pointing
// at nothing. A dead-end menu entry is not an improvement on a fake page.
//
// TypeScript cannot catch this: `to="/app/settings/security"` is just a string.
// So compare the link strings against the routes actually registered in
// App.tsx.
//
// Deliberately conservative — it only judges STATIC `to="/app/..."` literals.
// Template literals and computed paths are skipped rather than guessed at, so
// this fails on real dead links and not on dynamic navigation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

function tsxFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(full, out);
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

// Collect the route paths registered under the /app shell in App.tsx.
//
// react-router routes NEST, and a child's path is relative to its parent:
//
//   <Route path="consulting" element={<ClientConsultingLayout />}>
//     <Route path="projects" element={...} />     ->  consulting/projects
//   </Route>
//
// A first version of this collected bare segments and reported six real routes
// as dead. Walk the JSX instead, keeping a stack of open (non-self-closing)
// <Route> elements so every child is recorded at its full path.
function registeredAppRoutes() {
  const app = readFileSync(path.join(SRC, "App.tsx"), "utf8");
  const routes = new Set();
  const stack = [];

  // Find each tag's REAL end. A regex cannot: `element={<AppShell />}` contains
  // a ">" and a "/>" of its own, so a non-greedy match ends the tag early, calls
  // an opening tag self-closing, and never pushes it — which corrupts the prefix
  // of every child and makes real routes look dead. Scan forward from "<Route"
  // instead, tracking brace and quote depth, and end at the first ">" outside
  // both.
  for (let i = 0; i < app.length; ) {
    const open = app.indexOf("<Route", i);
    const close = app.indexOf("</Route>", i);

    if (open === -1 && close === -1) break;
    if (close !== -1 && (open === -1 || close < open)) {
      stack.pop();
      i = close + "</Route>".length;
      continue;
    }

    let j = open + "<Route".length;
    let depth = 0;
    let quote = null;
    for (; j < app.length; j++) {
      const c = app[j];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }

    const raw = app.slice(open, j);
    const selfClosing = raw.trimEnd().endsWith("/");
    // Only attributes at depth 0 — a nested element's own path prop is not ours.
    const pathMatch = raw.match(/\bpath="([^"]+)"/);
    // An index route (no path) contributes nothing but still nests.
    const seg = pathMatch ? pathMatch[1].replace(/^\/+/, "") : "";

    const full = [...stack, seg].filter(Boolean).join("/");
    if (full) routes.add(full);
    if (!selfClosing) stack.push(seg);

    i = j + 1;
  }
  return routes;
}

// A link matches if some registered route equals it, is a prefix of it (a
// parent route with nested children), or matches it segment-wise allowing
// `:param` segments to absorb anything.
function isCovered(linkPath, routes) {
  // Compare on the SAME footing as the parser produces: registeredAppRoutes()
  // returns full nested paths that already include the "app" segment
  // ("app/settings/all"), so strip only the leading slash here. An earlier
  // version stripped "/app/" from the link while the routes kept it, so nothing
  // could ever match — and the guard reported a clean sweep over 119 links
  // without actually comparing any of them. Exactly the failure this file is
  // meant to catch, which is why it is mutation-tested below the assertion.
  const link = linkPath.replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/^\/+/, "");
  if (link === "" || link === "app") return true; // /app itself — the shell's index route
  if (routes.has(link)) return true;

  const linkSegs = link.split("/");
  for (const route of routes) {
    // The bare "*" route is react-router's NOT-FOUND fallback (it renders a
    // redirect to "/"). Treating it as coverage made this guard vacuous: it
    // matched all 119 links and reported a clean sweep even with a known dead
    // link present. A page that only resolves because the catch-all caught it
    // is precisely a dead link.
    if (route === "*") continue;

    const routeSegs = route.split("/");
    if (routeSegs.length > linkSegs.length) continue;

    // A trailing splat ("services/forge/:software/*") genuinely covers anything
    // beneath its prefix; a "*" in any other position does not.
    const splat = routeSegs[routeSegs.length - 1] === "*";
    if (!splat && routeSegs.length !== linkSegs.length) continue;

    let ok = true;
    for (let i = 0; i < routeSegs.length; i++) {
      const r = routeSegs[i];
      if (r.startsWith(":") || r === "*") continue;
      if (r !== linkSegs[i]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

test("no component links to an /app route that does not exist", () => {
  const routes = registeredAppRoutes();
  assert.ok(routes.size > 20, `expected to parse App.tsx routes, found ${routes.size}`);

  const dead = [];

  for (const file of tsxFiles(SRC)) {
    if (file.endsWith(path.join("src", "App.tsx"))) continue;
    const src = readFileSync(file, "utf8");

    // Static `to="/app/..."` only — no template literals, no expressions.
    for (const m of src.matchAll(/\bto="(\/app\/[^"{}$]*)"/g)) {
      const link = m[1];
      if (!isCovered(link, routes)) {
        const line = src.slice(0, m.index).split("\n").length;
        dead.push(`${path.relative(SRC, file)}:${line} -> ${link}`);
      }
    }
  }

  assert.deepEqual(
    dead,
    [],
    "these links point at routes that are not registered in App.tsx:\n  " + dead.join("\n  "),
  );
});

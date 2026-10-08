// test/argus-settings.test.mjs — Left rail → Settings → ARGUS is a real page.
//
// Found 2026-10-08 16:15Z by a click on dev (Left rail → Settings → ARGUS):
// the ARGUS group held one "Coming Soon" row (argus_coming) and the page said
// the product "is planned but not available yet in your portal", while ARGUS
// → Your team, ARGUS → Workflows and Settings → ARGUS data plan all worked.
//
// Each block below goes red if Settings → ARGUS falls back to coming soon:
// the nav row, the catalog status, the router dispatch, the old-key redirect
// and the words on the page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SERVICE_CATALOG, resolveServiceStatus } from "../src/config/serviceCatalog.ts";
import {
  ARGUS_SETTINGS_KEY, ARGUS_SETTINGS_OLD_KEY, ARGUS_SETTINGS_ROUTE, ARGUS_DATA_PLAN_ROUTE,
  ARGUS_SETTINGS_LINKS, ARGUS_SETTINGS_TITLE, ARGUS_SETTINGS_INTRO,
} from "../src/lib/argusSettings.ts";
import { ARGUS_PAGES } from "../src/journeys/content/argusPages.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const nav = read("src/components/SubNav.tsx");
const settingsNav = nav.slice(nav.indexOf("const SETTINGS_NAV"), nav.indexOf("export const SETTINGS_KEYS"));
const argusNav = nav.slice(nav.indexOf("const ARGUS_NAV"), nav.indexOf("export const SUB_NAV_CONFIGS"));
const argusGroup = settingsNav.slice(settingsNav.indexOf('label: "ARGUS"'));
// Raw source: the router holds "/*" inside strings, so comment stripping would eat code.
const router = read("src/pages/ServiceRouter.tsx");
const page = read("src/pages/argus/ArgusSettingsPage.tsx");
const app = read("src/App.tsx");

test("Settings → ARGUS lists the real settings page, not a Coming Soon row", () => {
  assert.ok(settingsNav.includes('label: "ARGUS"'), "the Settings nav has an ARGUS group");
  const items = stripComments(argusGroup.slice(0, argusGroup.indexOf("],")));
  assert.match(items, /\{ key: "argus_settings", label: "ARGUS settings", route: "\/app\/services\/argus_settings" \}/);
  assert.doesNotMatch(items, /argus_coming|Coming Soon/i);
  // Settings-only: listed in ARGUS_NAV too, SETTINGS_KEYS would hijack the ARGUS menu.
  assert.doesNotMatch(argusNav, /argus_settings/);
});

test("the catalog row is enabled, so the page never resolves to coming soon", () => {
  const row = SERVICE_CATALOG.find((s) => s.key === ARGUS_SETTINGS_KEY);
  assert.ok(row, "argus_settings is a catalog row");
  assert.equal(row.route, ARGUS_SETTINGS_ROUTE);
  assert.equal(row.section, "ARGUS");
  assert.equal(resolveServiceStatus(row, new Set()), "enabled");
  assert.doesNotMatch(`${row.displayName} ${row.description}`, /coming|planned|\bAI\b|agents?|tenant/i);
  assert.equal(SERVICE_CATALOG.some((s) => s.key === ARGUS_SETTINGS_OLD_KEY), false, "the argus_coming placeholder row is deleted");
});

test("the router renders ArgusSettingsPage for argus_settings, before the generic coming-soon page", () => {
  assert.match(router, /const ArgusSettingsPage = lazyNamed\(\(\) => import\('\.\/argus\/ArgusSettingsPage'\), 'ArgusSettingsPage'\);/);
  const dispatch = router.search(/if \(service\.key === ARGUS_SETTINGS_KEY\) \{\s*return \(\s*<PageErrorBoundary scope=\{`argus\/\$\{service\.key\}`\}>\s*<Suspense fallback=\{<RouteLoading \/>\}><ArgusSettingsPage \/><\/Suspense>/);
  assert.ok(dispatch > 0, "argus_settings is dispatched to ArgusSettingsPage");
  const generic = router.indexOf("return <GenericServicePage service={service} status={status} />;");
  assert.ok(generic > dispatch, "the dispatch sits before the generic fallback");
});

test("the old argus_coming route still works: it redirects to Settings → ARGUS before the catalog lookup", () => {
  const redirect = router.search(/if \(serviceKey === ARGUS_SETTINGS_OLD_KEY\) \{\s*return <Navigate to=\{ARGUS_SETTINGS_ROUTE\} replace \/>;/);
  assert.ok(redirect > 0, "argus_coming redirects to the settings page");
  assert.ok(redirect < router.indexOf(">Service not found</h1>"), "the redirect fires before the not-found answer");
  assert.equal(ARGUS_SETTINGS_OLD_KEY, "argus_coming");
  assert.equal(ARGUS_SETTINGS_ROUTE, "/app/services/argus_settings");
});

test("the page links to Your team, Workflows and the ARGUS data plan, one plain sentence each", () => {
  assert.deepEqual(ARGUS_SETTINGS_LINKS.map((l) => l.label), ["Your team", "Workflows", "ARGUS data plan"]);
  const byLabel = Object.fromEntries(ARGUS_SETTINGS_LINKS.map((l) => [l.label, l]));
  assert.equal(byLabel["Your team"].to, "/app/services/argus_team_web");
  assert.deepEqual(byLabel["Your team"].more.map((m) => m.to),
    ["/app/services/argus_team_web", "/app/services/argus_team_marketer", "/app/services/argus_team_office"]);
  assert.deepEqual(byLabel["Your team"].more.map((m) => m.label), ["The web person", "The marketer", "The office administrator"]);
  assert.equal(byLabel["Workflows"].to, "/app/services/argus_workflows");
  assert.deepEqual(byLabel["Workflows"].more.map((m) => m.label), ["All", "Needs you", "History"]);
  assert.deepEqual(byLabel["Workflows"].more.map((m) => m.to),
    ["/app/services/argus_workflows", "/app/services/argus_workflows?tab=needs-you", "/app/services/argus_workflows?tab=history"]);
  assert.equal(byLabel["ARGUS data plan"].to, ARGUS_DATA_PLAN_ROUTE);
  // Every destination is a route that exists today.
  const catalogRoutes = new Set(SERVICE_CATALOG.map((s) => s.route));
  for (const l of ARGUS_SETTINGS_LINKS) {
    for (const to of [l.to, ...(l.more || []).map((m) => m.to)]) {
      const bare = to.split("?")[0];
      if (bare.startsWith("/app/services/")) assert.ok(catalogRoutes.has(bare), `${to} is a catalog route`);
      else assert.ok(app.includes(`path="${bare.replace(/^\/app\//, "")}"`), `${to} is an App route`);
    }
    const sentences = l.sentence.split(/(?<=[.!?])\s+/).filter(Boolean);
    assert.equal(sentences.length, 1, `${l.label}: one sentence`);
    assert.match(l.sentence, /^[A-Z].*\.$/);
  }
  // The page renders the module's words, not its own.
  assert.match(page, /\{ARGUS_SETTINGS_TITLE\}/);
  assert.match(page, /\{ARGUS_SETTINGS_INTRO\}/);
  assert.match(page, /ARGUS_SETTINGS_LINKS\.map\(/);
  assert.match(page, /<Link to=\{item\.to\}/);
  assert.match(page, /\{item\.sentence\}/);
  assert.match(page, /<Link to=\{m\.to\}/);
});

test("the words checklist: no coming soon, no agent, no AI, no tenant, no vendor", () => {
  const row = SERVICE_CATALOG.find((s) => s.key === ARGUS_SETTINGS_KEY);
  const words = [
    ARGUS_SETTINGS_TITLE, ARGUS_SETTINGS_INTRO,
    ...ARGUS_SETTINGS_LINKS.flatMap((l) => [l.label, l.sentence, ...(l.more || []).map((m) => m.label)]),
    ARGUS_PAGES.argus_settings.title, ARGUS_PAGES.argus_settings.body,
    row.displayName, row.description,
  ];
  assert.ok(words.includes("Your team"), "the checklist sees the page's words");
  const BANNED = /coming soon|planned|not available yet|\bagents?\b|\bAI\b|tenant|guardrails?|anthropic|claude|openai|gpt-|sonnet|haiku|opus/i;
  assert.deepEqual(words.filter((w) => BANNED.test(w)), []);
  assert.equal(ARGUS_PAGES.argus_coming, undefined, "the placeholder's guide copy is gone");
  // The page file carries no screen words of its own beyond the back link.
  const jsxText = [...stripComments(page).matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1].trim()).filter(Boolean);
  assert.deepEqual(jsxText, ["All settings"]);
});

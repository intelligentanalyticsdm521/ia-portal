// Saved lead searches live in the Lead Inbox, and a saved search can be edited
// and run again (Brandon, 2026-10-01).
//
//   "Edit and run"   he saved "Home Services - Des Moines" and expects to open
//                    it later, change it and run it again. The form opens
//                    prefilled — categories with their topics, removed topics
//                    unticked, mode, locations, radius, max leads — headed
//                    "Editing: <name>". "Save" updates THAT search (PATCH, same
//                    row); "Save as new search" creates a new one (POST) and
//                    never touches the original.
//   In the inbox     "The lead inbox should be the only place I have to go to
//                    get a new or saved search": a Saved Searches tab between
//                    Lead Inbox and Suppressed Domains — one row per search
//                    (name, categories, area, last run) with "Run again";
//                    clicking a row opens the search screen filled in from it;
//                    "No saved searches yet" and the New B2B Lead Run button
//                    when there are none.
//   Replace = delete the old Saved Lead Searches page is gone (file, route key,
//                    nav entry); its address sends people to the Saved Searches
//                    tab (?tab=saved).
//
// The mapping is pure (src/lib/leadgenSavedSearch.ts) and imported directly;
// the tab's list is rendered for real; the pages are pinned on their source.
// CRLF checkout: sources are read with \r\n normalised.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as lib from "../src/lib/leadgenSavedSearch.ts";

const ROOT = new URL("../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), "utf8").replace(/\r\n/g, "\n");
const exists = (p) => fs.existsSync(new URL(p, ROOT));

const esbuild = createRequire(new URL("package.json", ROOT))("esbuild");
const built = await esbuild.build({
  stdin: {
    contents: `
      import { createElement } from "react";
      import { renderToStaticMarkup } from "react-dom/server.browser";
      export * from "./src/components/spark/SavedSearchesList.tsx";
      export const render = (C, props) => renderToStaticMarkup(createElement(C, props));
    `,
    resolveDir: fileURLToPath(ROOT), loader: "tsx", sourcefile: "entry.tsx",
  },
  bundle: true, format: "esm", platform: "browser", jsx: "automatic", write: false, logLevel: "silent",
  define: { "process.env.NODE_ENV": '"production"' },
});
const ui = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text, "utf8").toString("base64")}`);

// The shape GET /api/v1/leadgen/profiles returns — several categories, each
// carrying its topics, the way the production searches are being saved.
const HOME = {
  id: "16",
  name: "Home Services - Des Moines",
  customer_category_id: 79,
  customer_category_name: "Electricians",
  category_names: ["Electricians", "Plumbers", "snow removal"],
  search_mode: "focused",
  state: "IA",
  cities: ["Des Moines, IA", "Ankeny, IA", "Urbandale, IA", "Altoona, IA"],
  city_count: 4,
  term_count: 5,
  max_leads: 50,
  include_cold_leads: true,
  last_run_at: "2026-10-01T15:00:00Z",
  last_run_lead_count: 12,
  created_at: "2026-10-01T14:00:00Z",
  categories: [
    { id: 79, name: "Electricians", custom: false, terms: ["commercial electricians", "electrical contractors"] },
    { id: 81, name: "Plumbers", custom: false, terms: ["plumbers"] },
    { id: null, name: "snow removal", custom: true, terms: ["snow removal"] },
  ],
  expanded_terms: ["commercial electricians", "plumbers", "snow removal", "electrical contractors", "gutter guards"],
  city_hits: [
    { id: 501, name: "Des Moines", state: "IA" }, { id: 502, name: "Ankeny", state: "IA" },
    { id: 503, name: "Urbandale", state: "IA" }, { id: 504, name: "Altoona", state: "IA" },
  ],
  zip_codes: ["50309"],
  radius_miles: 15,
  max_results_per_run: 50,
  industry_id: null,
  auto_saved: false,
};

// ── the prefill mapping ─────────────────────────────────────────────────────
test("a saved search opens into the form it was saved from", () => {
  const f = lib.prefillFromSaved(HOME);
  assert.deepEqual(f.categories, [
    { id: 79, name: "Electricians", industry_id: null, custom: false },
    { id: 81, name: "Plumbers", industry_id: null, custom: false },
    { id: 0, name: "snow removal", industry_id: null, custom: true },
  ]);
  assert.deepEqual(f.terms.map((t) => t.term), ["snow removal", "gutter guards"],
    "a custom category's name is its first topic; a typed topic no category claims comes back as typed");
  assert.ok(f.terms.every((t) => t.id < 0), "typed topics keep the form's free-text ids");
  assert.equal(f.searchMode, "focused");
  assert.equal(f.state, "IA");
  assert.deepEqual(f.cities.map((c) => c.id), [501, 502, 503, 504]);
  assert.equal(f.radiusMiles, 15);
  assert.equal(f.zipMode, "specify");
  assert.deepEqual(f.zips, [{ zip: "50309" }]);
  assert.equal(f.includeCold, true);
  assert.equal(f.maxLeads, 50);
});

test("an older or thinner saved search still opens: one legacy category, no ZIPs, Exact radius, unknown mode", () => {
  const f = lib.prefillFromSaved({
    ...HOME, categories: [], zip_codes: [], radius_miles: null, search_mode: "weird",
    max_results_per_run: null, max_leads: null, expanded_terms: ["electricians"],
  });
  assert.deepEqual(f.categories, [{ id: 79, name: "Electricians", industry_id: null, custom: false }]);
  assert.deepEqual(f.terms, [], "its topics belong to its one category");
  assert.equal(f.zipMode, "auto");
  assert.equal(f.radiusMiles, 0, "a 0 (Exact) radius is saved as nothing");
  assert.equal(f.searchMode, "balanced");
  assert.equal(f.maxLeads, 100);
  // typed topics only, stored as one nameless group — not a category
  const typed = lib.prefillFromSaved({
    ...HOME, customer_category_id: null, customer_category_name: null,
    categories: [{ id: null, name: null, custom: true, terms: ["roofing"] }], expanded_terms: ["roofing"],
  });
  assert.deepEqual(typed.categories, []);
  assert.deepEqual(typed.terms.map((t) => t.term), ["roofing"]);
});

test("removed topics come back unticked: what a saved category offers but did not save", () => {
  const preview = [
    { term: "commercial electricians", weight: 1, source: "category", category: "Electricians" },
    { term: "electrical contractors", weight: 1, source: "category", category: "Electricians" },
    { term: "generator installers", weight: 1, source: "category", category: "Electricians" },
    { term: "plumbers", weight: 1, source: "category", category: "Plumbers" },
    { term: "drain cleaning", weight: 1, source: "category", category: "Plumbers" },
    { term: "gutter guards", weight: 1, source: "typed", category: null },
  ];
  const off = lib.excludedFromSaved(preview, lib.savedCategoriesOf(HOME));
  assert.deepEqual([...off].sort(), ["drain cleaning", "generator installers"]);
  assert.ok(!off.has("gutter guards"), "a typed topic is never unticked");
});

// ── Save vs Save as new search ──────────────────────────────────────────────
test("Save on an open saved search is a PATCH to THAT search; Save as new search is a POST", () => {
  assert.deepEqual(lib.saveRequestFor("16", "save"), { method: "patch", path: "/api/v1/leadgen/profiles/16" });
  assert.deepEqual(lib.saveRequestFor("16", "save_as_new"), { method: "post", path: "/api/v1/leadgen/profiles" });
  assert.deepEqual(lib.saveRequestFor(null, "save"), { method: "post", path: "/api/v1/leadgen/profiles" });
  assert.deepEqual(lib.saveRequestFor(null, "save_as_new"), { method: "post", path: "/api/v1/leadgen/profiles" });
});

const NEW_PAGE = read("src/pages/spark/SparkLeadGenNewPage.tsx");
const saveFn = NEW_PAGE.slice(NEW_PAGE.indexOf("async function handleSaveProfile"), NEW_PAGE.indexOf("// ── render"));

test("Save never creates a second row: the only PATCH is to the open search, and it is the save path's only write", () => {
  assert.match(saveFn, /const req = saveRequestFor\(editing \? editing\.id : null, how\);/);
  assert.match(saveFn, /if \(req\.method === "patch"\) \{\s*(?:\/\/[^\n]*\n\s*)*await patch\(req\.path, body\);\s*\} else \{\s*(?:\/\/[^\n]*\n\s*)*await post\(req\.path, body\);/);
  assert.equal((saveFn.match(/await patch\(/g) || []).length, 1);
  assert.equal((saveFn.match(/await post\(/g) || []).length, 1, "one POST, on the other branch");
  assert.ok(!/"\/api\/v1\/leadgen\/profiles"/.test(saveFn), "paths come from saveRequestFor, not typed again here");
  // after a save on an open search, back to the Saved Searches tab where the row shows it
  assert.match(saveFn, /if \(editing\) \{[\s\S]*?navigate\(SAVED_SEARCHES_PATH\);/);
});

test("Save as new search never touches the original: it needs a different name and posts", () => {
  assert.match(NEW_PAGE, /onClick=\{\(\) => handleSaveProfile\("save_as_new"\)\}/);
  assert.match(NEW_PAGE, /onClick=\{\(\) => handleSaveProfile\("save"\)\}/);
  assert.match(NEW_PAGE, /const sameNameAsOpen = !!editing && profileName\.trim\(\)\.toLowerCase\(\) === editing\.name\.trim\(\)\.toLowerCase\(\);/);
  assert.match(NEW_PAGE, /disabled=\{!profileName\.trim\(\) \|\| savingProfile \|\| sameNameAsOpen\}/);
  assert.match(NEW_PAGE, />To save it as a new search, give it a different name\.</);
  assert.match(NEW_PAGE, /Save as new search/);
});

test("the form opened from a saved search says so, and fills from it", () => {
  assert.match(NEW_PAGE, /const editId = searchParams\.get\("edit"\);/);
  assert.match(NEW_PAGE, /title=\{editing \? `Editing: \$\{editing\.name\}` : "New B2B Lead Search"\}/);
  assert.match(NEW_PAGE, /setForm\(\(f\) => \(\{ \.\.\.f, \.\.\.prefillFromSaved\(found, f\.maxLeads\) \}\)\);/);
  assert.match(NEW_PAGE, /setExcludedTerms\(excludedFromSaved\(previewKw, pendingSaved\.current\)\);/);
  assert.match(NEW_PAGE, /That saved search was not found\./);
  // Start Search still runs the form as today
  assert.match(NEW_PAGE, /await post<JobsResp>\("\/api\/v1\/leadgen\/jobs", buildPayload\(\)\);/);
});

// ── the short lines on a row ────────────────────────────────────────────────
test("a row names every category the search asks, in one short line", () => {
  assert.equal(lib.categoriesLine(HOME), "Electricians · Plumbers · snow removal");
  assert.equal(lib.categoriesLine({ ...HOME, category_names: [] }), "Electricians · Plumbers · snow removal",
    "falls back to the categories JSON");
  assert.equal(lib.categoriesLine({ ...HOME, category_names: [], categories: [], customer_category_id: null, expanded_terms: [] }), "No category");
  // A topics-first search names its first topics (Brandon, 2 Oct 2026: the
  // topics live in Search Topics, not in twelve category chips).
  assert.equal(
    lib.categoriesLine({ ...HOME, category_names: [], categories: [], customer_category_id: null, expanded_terms: ["residential electricians", "plumbers", "hvac contractors", "roofers", "painters"] }),
    "residential electricians · plumbers · hvac contractors +2 more topics",
  );
  assert.equal(
    lib.categoriesLine({ ...HOME, category_names: [], categories: [], customer_category_id: null, expanded_terms: ["dentists", "optometrists"] }),
    "dentists · optometrists",
  );
});

test("a row says the area: cities and radius, or ZIP codes", () => {
  assert.equal(lib.areaLine(HOME), "IA · 4 cities · 15 mi radius · 1 ZIP code");
  // One anchor city is NAMED: the row reads as the person saved it (Brandon,
  // 1 Oct 2026: "just put the city as Des Moines and 30 miles").
  assert.equal(lib.areaLine({ ...HOME, cities: ["Des Moines, IA"], radius_miles: null, zip_codes: [] }), "Des Moines, IA · exact");
  assert.equal(lib.areaLine({ ...HOME, cities: ["Des Moines, IA"], radius_miles: 30, zip_codes: [] }), "Des Moines, IA · 30 mi radius");
  assert.equal(lib.areaLine({ ...HOME, cities: [], city_count: 0, zip_codes: ["50309", "50310"] }), "IA · 2 ZIP codes");
  assert.equal(lib.areaLine({ ...HOME, state: null, cities: null, city_count: null, zip_codes: [] }), "No area set");
});

test("a row says when it last ran and how many leads it found", () => {
  assert.match(lib.lastRunLine(HOME, "en-US"), /^Last run Oct 1, 2026 · 12 leads found$/);
  assert.equal(lib.lastRunLine({ ...HOME, last_run_at: null, last_run_lead_count: null }), "Not run yet");
  assert.equal(lib.lastRunLine({ ...HOME, last_run_at: null, last_run_lead_count: 4 }), "4 leads found last time",
    "a run started from the form leaves no date, but its result is known");
  assert.match(lib.lastRunLine({ ...HOME, last_run_lead_count: 1 }, "en-US"), /· 1 lead found$/);
});

// ── the tab's list ──────────────────────────────────────────────────────────
const noop = () => {};
const list = (searches, extra = {}) => ui.render(ui.SavedSearchesList, {
  searches, onOpen: noop, onRunAgain: noop, onDelete: noop, onNewSearch: noop, ...extra,
});

test("the tab lists one row per saved search: name, categories, area, last run, and Run again", () => {
  const second = { ...HOME, id: "17", name: "Commercial Services - Des Moines", category_names: ["Cleaning Services", "Security Services"] };
  const html = list([HOME, second]);
  assert.equal((html.match(/data-testid="saved-search-row"/g) || []).length, 2);
  assert.match(html, />Home Services - Des Moines</);
  assert.match(html, />Electricians · Plumbers · snow removal</);
  assert.match(html, />IA · 4 cities · 15 mi radius · 1 ZIP code</);
  assert.match(html, /12 leads found/);
  assert.match(html, />Commercial Services - Des Moines</);
  assert.match(html, />Cleaning Services · Security Services</);
  assert.equal((html.match(/> Run again</g) || []).length, 2);
  assert.match(html, /> New B2B Lead Run</);
});

test("the row itself is the control that opens the search (one per row, beside Run again)", () => {
  const html = list([HOME]);
  assert.match(html, /<button type="button" title="Open this search to change it, run it or save it"[^>]*>.*Home Services - Des Moines/s);
  const src = read("src/components/spark/SavedSearchesList.tsx");
  assert.match(src, /onClick=\{\(\) => onOpen\(s\)\}/);
  assert.match(src, /onClick=\{\(\) => onRunAgain\(s\)\}/);
});

test("with none: 'No saved searches yet' and the New B2B Lead Run button", () => {
  const html = list([]);
  assert.match(html, />No saved searches yet</);
  assert.match(html, /> New B2B Lead Run</);
  assert.doesNotMatch(html, /saved-search-row/);
});

test("searches run without saving are kept behind one line, named ones first", () => {
  const quick = { ...HOME, id: "1004", name: "Quick search 2026-09-03 12:51:18", auto_saved: true };
  const html = list([quick, HOME]);
  assert.equal((html.match(/data-testid="saved-search-row"/g) || []).length, 1, "only the named search is listed");
  assert.match(html, />Show 1 search you ran without saving</);
  assert.doesNotMatch(html, /Quick search 2026/);
  const onlyQuick = list([quick]);
  assert.match(onlyQuick, />No saved searches yet</);
  assert.match(onlyQuick, /Show 1 search you ran without saving/);
});

test("the list speaks to a customer", () => {
  const src = read("src/components/spark/SavedSearchesList.tsx").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /\btenant\b/i);
  assert.doesNotMatch(src, /\bprofile\b/i, "a saved search, not a profile");
});

// ── the tab in the Lead Inbox ───────────────────────────────────────────────
const INBOX = read("src/pages/spark/SparkLeadInboxPage.tsx");

test("the Lead Inbox has a Saved Searches tab BETWEEN Lead Inbox and Suppressed Domains, same tab pattern", () => {
  assert.match(INBOX, /type TabKey = "inbox" \| "saved" \| "suppressed" \| "territories" \| "billing";/);
  assert.match(INBOX, /const TAB_ORDER: TabKey\[\] = \["inbox", "saved", "suppressed", "territories", "billing"\];/);
  assert.match(INBOX, /saved: "Saved Searches",/);
  assert.match(INBOX, /saved: \{\s*title: "Saved Searches",/, "it has the same (?) explainer as the others");
  assert.match(INBOX, /v === "inbox" \|\| v === "saved" \|\| v === "suppressed"/, "?tab=saved opens it");
  assert.match(INBOX, /\{tab === "saved" && <SavedSearchesTab \/>\}/);
  // only a business that may run a lead search sees it — the same allow-list the search uses
  assert.match(INBOX, /const tabs = TAB_ORDER\.filter\(\(t\) => t !== "saved" \|\| leadgen\.allowed === true\);/);
  assert.match(INBOX, /\{tabs\.map\(\(t\) => \{/);
});

test("the tab lists rows from GET /leadgen/profiles; a row click carries the search's id into the form", () => {
  const sec = INBOX.slice(INBOX.indexOf("function SavedSearchesTab"), INBOX.indexOf("// ── end SavedSearchesTab"));
  assert.ok(sec.length > 0);
  assert.match(sec, /get<\{ data: SavedSearch\[\] \}>\("\/api\/v1\/leadgen\/profiles"\)/);
  assert.match(sec, /onOpen=\{\(s\) => navigate\(editSearchPath\(s\.id\)\)\}/);
  assert.match(sec, /post<RunResp>\(`\/api\/v1\/leadgen\/profiles\/\$\{s\.id\}\/run`, \{\}\)/);
  assert.match(sec, /onNewSearch=\{\(\) => navigate\(NEW_SEARCH_PATH\)\}/);
  assert.doesNotMatch(sec, /\bconfirm\(/, "no native dialog — the delete asks in the platform's own modal");
  assert.equal(lib.editSearchPath("16"), "/app/spark/leadgen/b2b_new?edit=16");
  // ...and the form reads exactly that id back
  assert.match(NEW_PAGE, /const editId = searchParams\.get\("edit"\);/);
  assert.match(NEW_PAGE, /\.find\(\(p\) => String\(p\.id\) === String\(editId\)\)/);
});

// ── the old page is gone ────────────────────────────────────────────────────
test("no file, route key or nav entry for the old Saved Lead Searches page remains", () => {
  assert.equal(exists("src/pages/spark/SparkLeadGenSavedPage.tsx"), false);
  for (const f of ["src/config/serviceCatalog.ts", "src/config/featureFlags.ts", "src/components/SubNav.tsx", "src/pages/ServiceRouter.tsx", "src/App.tsx"]) {
    const s = read(f);
    assert.ok(!s.includes("spark_leadgen_saved"), `${f} has no spark_leadgen_saved`);
    assert.ok(!s.includes("SparkLeadGenSavedPage"), `${f} has no SparkLeadGenSavedPage`);
    assert.ok(!s.includes("Saved Lead Searches"), `${f} has no "Saved Lead Searches"`);
  }
});

test("the old address sends people to the Saved Searches tab, and every link to it now points there", () => {
  assert.match(read("src/App.tsx"), /<Route path="saved" element=\{<Navigate to="\/app\/services\/spark_lead_inbox\?tab=saved" replace \/>\} \/>/);
  assert.equal(lib.SAVED_SEARCHES_PATH, "/app/services/spark_lead_inbox?tab=saved");
  assert.match(NEW_PAGE, /<Link to=\{SAVED_SEARCHES_PATH\}[^>]*>\s*<Save className="h-3\.5 w-3\.5" \/> Saved searches/);
  assert.match(read("src/pages/spark/SparkLeadGenJobPage.tsx"), /navigate\(SAVED_SEARCHES_PATH\)/);
  for (const f of ["src/pages/spark/SparkLeadGenNewPage.tsx", "src/pages/spark/SparkLeadGenJobPage.tsx", "src/components/GuidedTour.tsx", "src/components/consulting/ClientTenantModal.tsx"]) {
    assert.ok(!read(f).includes("leadgen/saved"), `${f} no longer links to the old page`);
  }
});

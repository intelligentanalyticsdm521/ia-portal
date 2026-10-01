// New B2B Lead Search — the category box lists CATEGORIES ONLY, and a picked
// category's search topics sit directly under it (Brandon, 2026-10-01).
//
// He typed "electrician" and the category dropdown offered "electrician
// schools" — a TOPIC from another category, listed under "Search topics that
// match" in the same dropdown, and picking it turned the topic into a custom
// category. Now:
//
//   (a) the category autocomplete lists categories (plus the Top 25 toggle and
//       the custom-category option) and nothing else: no "Search topics that
//       match", no pickTermAsCategory, no second list at all
//   (b) the topics a category brings render UNDER its chip, each with a remove
//       control bound to the SAME excludedTerms the Live Preview reads, so a
//       removal there drops the right pane's count at once
//   (c) the right pane still shows the "Expanded keywords" count, the locations
//       and the cost
//
// Source pins for the page (it has no render harness) and a real render of the
// topics component. CRLF checkout: sources are read with \r\n normalised.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), "utf8").replace(/\r\n/g, "\n");
const PAGE = read("src/pages/spark/SparkLeadGenNewPage.tsx");
const TOPICS_SRC = read("src/components/spark/LeadGenCategoryTopics.tsx");

const esbuild = createRequire(new URL("package.json", ROOT))("esbuild");
const built = await esbuild.build({
  stdin: {
    contents: `
      import { createElement } from "react";
      import { renderToStaticMarkup } from "react-dom/server.browser";
      export * from "./src/components/spark/LeadGenCategoryTopics.tsx";
      export const render = (C, props) => renderToStaticMarkup(createElement(C, props));
    `,
    resolveDir: fileURLToPath(ROOT), loader: "tsx", sourcefile: "entry.tsx",
  },
  bundle: true, format: "esm", platform: "browser", jsx: "automatic", write: false, logLevel: "silent",
  define: { "process.env.NODE_ENV": '"production"' },
});
const ui = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text, "utf8").toString("base64")}`);

// ── (a) categories only ─────────────────────────────────────────────────────
test("(a) the category box has no second list: no 'Search topics that match', no pickTermAsCategory", () => {
  assert.ok(!PAGE.includes("Search topics that match"), "the heading is gone");
  assert.ok(!PAGE.includes("pickTermAsCategory"), "picking a topic as a category is gone");
  assert.ok(!PAGE.includes("catTermSuggestions"), "the topic lookup behind the category box is gone");
  assert.ok(!/secondary[?:=]/.test(PAGE), "the combobox has no secondary list prop at all");
  // the category box no longer asks the TOPIC endpoint anything
  assert.ok(!/terms\/autocomplete\?q=\$\{encodeURIComponent\(debouncedCat\)\}/.test(PAGE));
});

test("(a) the category box keeps the Top 25 toggle and the custom-category option", () => {
  assert.match(PAGE, /Top 25 categories<\/span> only/);
  assert.match(PAGE, /categories\/autocomplete\?q=\$\{encodeURIComponent\(debouncedCat\)\}\$\{curatedParam\}/);
  assert.match(PAGE, /onPickCustom=\{catTop25Only \? undefined : pickCustomCategory\}/);
  assert.match(PAGE, /customLabel=\{\(v\) => `Use "\$\{v\}" as a custom category`\}/);
});

test("(a) the separate Search Topics box stays for people who want to type a topic", () => {
  assert.match(PAGE, /title="Search Topics"/);
  assert.match(PAGE, /onPick=\{addTerm\}/);
});

// ── (b) topics under the category ───────────────────────────────────────────
test("(b) each picked category renders its own topics directly under its chip, bound to excludedTerms", () => {
  const block = PAGE.slice(PAGE.indexOf('data-testid="picked-categories"'), PAGE.indexOf("F-LG.158: Top-25 curated filter toggle"));
  assert.ok(block.length > 0, "the picked-categories block exists above the category box");
  const chip = block.indexOf("<Chip");
  const topics = block.indexOf("<LeadGenCategoryTopics");
  assert.ok(chip > 0 && topics > chip, "the topics come after (under) the category chip");
  assert.match(block, /topics=\{topicsFor\(c\)\}/);
  assert.match(block, /excluded=\{excludedTerms\}/, "the same set the Live Preview reads");
  assert.match(block, /onToggle=\{toggleTerm\}/, "the same toggle the Live Preview uses");
  assert.match(block, /loading=\{previewKwLoading\}/);
  // the topics are the expansion's rows for THIS category — the same previewKw the right pane lists
  assert.match(PAGE, /const topicsFor = \(c: CategoryHit\) => previewKw\.filter\(\(k\) => sameName\(k\.category, c\.name\)\);/);
});

test("(b) the topics render with a remove control each; a removed one can be put back; the count is live", () => {
  const topics = [
    { term: "commercial electricians", weight: 1, source: "category", category: "Electricians" },
    { term: "electrical contractors", weight: 1, source: "category", category: "Electricians" },
    { term: "ev charger installers", weight: 1, source: "category", category: "Electricians" },
  ];
  const html = ui.render(ui.LeadGenCategoryTopics, {
    topics, excluded: new Set(["ev charger installers"]), loading: false, onToggle: () => {},
  });
  assert.match(html, /data-testid="category-topics"/);
  assert.match(html, /Search topics · 2 of 3/);
  assert.match(html, /aria-label="Remove commercial electricians"/);
  assert.match(html, /aria-label="Remove electrical contractors"/);
  assert.match(html, /aria-label="Put back ev charger installers"/);
  assert.equal((html.match(/<button/g) || []).length, 3, "one control per topic");
  assert.match(html, /line-through[^>]*>ev charger installers</, "a removed topic reads as removed");
});

test("(b) a category with no topics says so in plain words", () => {
  const empty = ui.render(ui.LeadGenCategoryTopics, { topics: [], excluded: new Set(), loading: false, onToggle: () => {} });
  assert.match(empty, />No search topics for this category yet</);
  const loading = ui.render(ui.LeadGenCategoryTopics, { topics: [], excluded: new Set(), loading: true, onToggle: () => {} });
  assert.match(loading, />Finding search topics…</);
});

test("(b) the topics wrap at phone width instead of running off the screen", () => {
  assert.match(TOPICS_SRC, /<ul className="flex flex-wrap gap-1\.5">/);
  assert.match(TOPICS_SRC, /max-w-full/);
  assert.match(TOPICS_SRC, /truncate/);
});

// ── (c) the right pane ──────────────────────────────────────────────────────
test("(c) the right pane still shows the Expanded keywords count, the locations and the cost, off the same lists", () => {
  assert.match(PAGE, /<Search className="h-3 w-3" \/> Expanded keywords/);
  assert.match(PAGE, /\{previewKwLoading \? "…" : excludedTerms\.size \? `\$\{activeKw\.length\} of \$\{previewKw\.length\}` : previewKw\.length\}/);
  assert.match(PAGE, /const activeKw = useMemo\(\(\) => previewKw\.filter\(\(k\) => !excludedTerms\.has\(k\.term\)\), \[previewKw, excludedTerms\]\);/);
  assert.match(PAGE, /<MapPin className="h-3 w-3" \/> Locations/);
  assert.match(PAGE, /Est\. cost/);
  // one exclusion state for both views — no second copy for the category list
  assert.equal((PAGE.match(/useState<Set<string>>/g) || []).length, 1, "excludedTerms is the only term-exclusion state");
});

// ── plain words ─────────────────────────────────────────────────────────────
test("the new words on the form speak to a customer", () => {
  for (const src of [TOPICS_SRC]) {
    assert.doesNotMatch(src.replace(/^\s*\/\/.*$/gm, ""), /\btenant\b/i);
    assert.doesNotMatch(src, /Hunter|Brave|Google|OpenAI|Anthropic/);
  }
});

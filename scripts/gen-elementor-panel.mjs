#!/usr/bin/env node
/**
 * scripts/gen-elementor-panel.mjs — MACHINE-CUT THE PANEL.
 *
 * B-168 / D-168. Elementor decides two things about every widget it ships, and
 * both of them are on our screen: **which group its tile is in** and **where in
 * that group it sits**. Until now both were hand-kept — `PANEL_ORDER`, a flat
 * list in `registry.ts` that ten family agents each had to append to, and a
 * `category` typed onto every definition by whoever wrote it. Two hand lists,
 * ten authors, one screen that is supposed to be Elementor's.
 *
 * This script reads the two 2026-09-17 scrapes of a real Elementor install and
 * writes `src/builder/elementorPanel.ts`. Nothing else in the build may hold a
 * second copy of that answer.
 *
 * ── HOW ELEMENTOR'S OWN CATEGORIES BECOME OUR SIX GROUPS ──────────────────
 *   layout                                            → Layout
 *   basic                                             → Basic
 *   pro-elements                                      → Pro
 *   general                                           → General
 *   theme-elements / -single / -archive               → Site
 *   wordpress / link-in-bio / v4-elements             → not offered, skipped
 *   intelligent-analytics                             → OURS, never read here
 *
 * A widget declares several categories; Elementor draws its tile in the first
 * one, so that is the one taken.
 *
 * Run: node scripts/gen-elementor-panel.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPORT = "C:/dev/claude code/overnight-report";
const FREE = path.join(REPORT, "BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json");
const PRO = path.join(REPORT, "BUILDER_WIDGET_CATALOG_2026-09-17.pro.json");

/** Elementor's own category → the group our panel draws. */
const GROUP_OF = {
  layout: "Layout",
  basic: "Basic",
  "pro-elements": "Pro",
  general: "General",
  "theme-elements": "Site",
  "theme-elements-single": "Site",
  "theme-elements-archive": "Site",
};

const read = (f) => JSON.parse(readFileSync(f, "utf8"));

function groupOf(categories, preferPro = false) {
  /* The free scrape tags its two Pro leftovers `["general","pro-elements"]`, so
     reading the first category would draw Menu and Breadcrumbs in General —
     which is the exact difference from Elementor's panel this file removes. */
  if (preferPro && (categories || []).includes("pro-elements")) return "Pro";
  for (const c of categories || []) if (GROUP_OF[c]) return GROUP_OF[c];
  return null;
}

/**
 * THE PRO SCRAPE IS THE PANEL, and the free one only fills two gaps.
 *
 * MEASURED, not assumed. The Pro install's own categories are the panel a
 * person with Pro sees: layout 1, basic 10, general 20, pro-elements 35,
 * theme-elements 13. The FREE scrape's `general` is 111, because that install
 * also had Pro and Pro tags its widgets `general` as well as `pro-elements` —
 * reading it would put Blockquote, Reviews and Price Table in General, which is
 * the very difference from Elementor's panel this pass exists to remove.
 *
 * Two widgets the offer file names are in the free scrape and not the Pro one
 * (`mega-menu`, `breadcrumbs`), both tagged `pro-elements`. They are added
 * after the Pro rows, in the free scrape's own order, and nothing else is.
 */
const OFFERS = read(path.join(REPORT, "BUILDER_OFFERS_2026-09-19.json"));
const OFFERED_SLUGS = new Set(
  Object.values(OFFERS.builders).flatMap((b) =>
    ["elementor_free", "elementor_pro", "elementor"].flatMap((k) => b[k] || [])));

function collect() {
  const rows = [];
  const bySlug = new Set();
  const byTitle = new Set();
  const counters = {};
  const take = (slug, def, preferPro = false) => {
    if (bySlug.has(slug) || def.show_in_panel === false) return;
    const group = groupOf(def.categories, preferPro);
    if (!group) return;
    const title = String(def.title || "").trim();
    /* One TITLE, one tile. Both scrapes carry `tabs` and `nested-tabs`, and
       both are called "Tabs"; the offer file names the nested one and
       Elementor's own panel draws one. First wins, which is the Pro install's
       own registration order. */
    if (!title || byTitle.has(title)) return;
    bySlug.add(slug);
    byTitle.add(title);
    counters[group] = counters[group] ?? 0;
    rows.push({ slug, title, group, order: counters[group]++ });
  };
  for (const [slug, def] of Object.entries(read(PRO).widgets || {})) take(slug, def);
  for (const [slug, def] of Object.entries(read(FREE).widgets || {})) {
    if (OFFERED_SLUGS.has(slug)) take(slug, def, true);
  }
  return rows;
}

const rows = collect();
/* Elementor's Grid tile is the container with a grid layout; the scrape carries
   the container once and the editor draws two tiles. Our panel does the same
   (registry's GRID_PRESET_KIND), so the second tile is named here, beside the
   first, rather than invented in the registry. */
const layout = rows.filter((r) => r.group === "Layout");
if (layout.length === 1 && layout[0].slug === "container") {
  rows.push({ slug: "container:grid", title: "Grid", group: "Layout", order: 1 });
}

const byGroup = {};
for (const r of rows) (byGroup[r.group] ||= []).push(r);
for (const g of Object.keys(byGroup)) byGroup[g].sort((a, b) => a.order - b.order);

const GROUPS = ["Layout", "Basic", "Pro", "General", "Site"];
const lines = [];
for (const g of GROUPS) {
  for (const r of byGroup[g] || []) {
    lines.push(`  ${JSON.stringify(r.title)}: { slug: ${JSON.stringify(r.slug)}, group: "${g}", order: ${r.order} },`);
  }
}

const out = `/**
 * builder/elementorPanel.ts — ELEMENTOR'S OWN PANEL, MACHINE-CUT. DO NOT EDIT.
 *
 * Generated by \`scripts/gen-elementor-panel.mjs\` from
 * \`BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json\` and \`.pro.json\`, two
 * scrapes of a real Elementor ${read(PRO).elementorVersion || ""} install with Pro.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * D-168: a tile is Elementor's widget, by Elementor's own name, GROUP and
 * position, or it is one of the IA widgets the offer file names. Before this,
 * "which group" was typed onto each definition by hand and "where in the group"
 * was \`PANEL_ORDER\`, a flat list in \`registry.ts\` that every family agent had
 * to append to — ten authors, two hand lists, one screen that is meant to be
 * Elementor's. There is one answer now and a machine wrote it.
 *
 * A widget of OURS (the Intelligent Analytics group) is not in here and never
 * will be: Elementor does not ship it, so Elementor cannot say where it goes.
 * Those carry their own \`order\` on their definition.
 *
 * ${rows.length} widgets, in Elementor's own registration order, which is the
 * order its panel draws them in (confirmed against the live editor 2026-09-19).
 */

/** The five groups Elementor draws before a plugin's own. */
export type ElementorGroup = "Layout" | "Basic" | "Pro" | "General" | "Site";

export interface ElementorPanelEntry {
  /** Elementor's own widget slug. */
  slug: string;
  /** The group its tile is in. */
  group: ElementorGroup;
  /** Its position INSIDE that group, from zero. */
  order: number;
}

/** Elementor's own title → where its tile is. The one copy of that answer. */
export const ELEMENTOR_PANEL: Readonly<Record<string, ElementorPanelEntry>> = {
${lines.join("\n")}
};

/** Where Elementor puts the tile with this title, or \`null\` — it is not theirs. */
export function elementorPlace(title: string): ElementorPanelEntry | null {
  return ELEMENTOR_PANEL[String(title || "").trim()] ?? null;
}
`;

const dest = path.join(process.cwd(), "src/builder/elementorPanel.ts");
writeFileSync(dest, out, "utf8");

/**
 * THE SAME ANSWER AS TEST DATA, so the suite has an independent copy.
 *
 * The app reads the `.ts`; the tests read this `.json`. Both are written here,
 * in one run, from the same two scrapes — and `builder-override.test.mjs`
 * asserts they agree, so hand-editing the generated module goes red instead of
 * quietly moving a tile. The two 8 MB catalogues live outside the repo, which is
 * why the tests pin against a fixture rather than reading them.
 */
const fixture = path.join(process.cwd(), "test/fixtures/elementor-panel.json");
writeFileSync(fixture, `${JSON.stringify({
  _about: "Machine-cut by scripts/gen-elementor-panel.mjs. DO NOT EDIT. Elementor's own panel: which group a widget's tile is in, and where in that group it sits.",
  source: "BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json + .pro.json",
  elementor_version: read(PRO).elementorVersion || "",
  groups: GROUPS,
  widgets: Object.fromEntries(GROUPS.flatMap((g) =>
    (byGroup[g] || []).map((r) => [r.title, { slug: r.slug, group: g, order: r.order }]))),
}, null, 1)}\n`, "utf8");

console.log(`${dest}: ${rows.length} widgets`);
console.log(`${fixture}`);
for (const g of GROUPS) console.log(`  ${g}: ${(byGroup[g] || []).length}`);

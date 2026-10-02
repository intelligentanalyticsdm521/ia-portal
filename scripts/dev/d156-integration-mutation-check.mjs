// scripts/dev/d156-integration-mutation-check.mjs — MAKE THE NEW GUARDS FAIL.
//
//   node scripts/dev/d156-integration-mutation-check.mjs
//
// BUILDER_PLATFORM_SCOPE_2026-09-15 §11.12 (D-156, D-157). Four streams built
// D-156 in parallel; this is the integration's own set of guards, and a green
// check proves nothing until it has been made to fail on purpose.
//
// Each mutation is applied to a real file, the named test is run, the file is
// restored whatever happens, and a mutation the test did not notice is
// reported as a HOLE.
//
// Nothing here touches a served checkout or a port.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const MODEL = "src/builder/model.ts";
const UPGRADE = "src/builder/upgrade.ts";
const TOTALS = "src/builder/totals.ts";
const RENDER = "src/builder/render.ts";
const PANE = "src/builder/WidgetPane.tsx";
const GALLERY = "src/builder/SectionGallery.tsx";
const INDEX = "src/builder/widgets/index.ts";

const INTEGRATION = "test/builder-integration.test.mjs";
const TREE = "test/builder-tree.test.mjs";
const ENGINE = "test/builder-engine.test.mjs";

const MUTATIONS = [
  {
    name: "I1 the upgrade on open is switched off again",
    file: MODEL,
    from: "  return upgradeDocument({ v: 2, settings, sections });",
    to: "  return { v: 2, settings, sections };",
    test: INTEGRATION,
    expects: "a stored comparison_cards opens as a tree, not a lump",
  },
  {
    name: "I2 the upgraded catalogue card is the OTHER card's kind",
    file: UPGRADE,
    from: '    return makeWidget("catalog_card", props);',
    to: '    return makeWidget("product_card", props);',
    test: INTEGRATION,
    expects: "an upgraded catalogue card is bound by the catalogue's own two keys",
  },
  {
    name: "I3 a property's items become a rate card, so its money stops counting",
    file: UPGRADE,
    from: '    kids.push(makeWidget("price_line", {\n      name: str(it?.description).trim(),',
    to: '    kids.push(makeWidget("pricing_table", {\n      name: str(it?.description).trim(),',
    test: INTEGRATION,
    expects: "a property's money SURVIVES the upgrade — the items are priced lines",
  },
  {
    name: "I4 the walk stops at the top of a column again",
    file: TOTALS,
    from: "  const { of } = sitesInTree(doc);\n  const out: LineTotal[] = [];",
    to: "  const { of } = sitesInTree(doc);\n  const out: LineTotal[] = [];\n  if (doc) return out;",
    test: INTEGRATION,
    expects: "at one level, and at three",
  },
  {
    name: "I5 a box is no longer a property, whatever address is in it",
    file: TOTALS,
    /* REPOINTED AT INTEGRATION 2026-09-19: a property box is marked by
       `service_location` OR `address_block` now, over two lines, so the
       `find` this used to quote is not one string any more. The refusal
       below is the same guard and it is one line. */
    from: "    if (!address) return;",
    to: "    if (address) return;",
    test: INTEGRATION,
    expects: "a property is the BOX its address is in, and its subtotal is its own",
  },
  {
    name: "I6 the box's layout goes back inline, beside the sheet's copy",
    file: RENDER,
    from: '  const flow = ` bx-box-${containerFlow(containerLayout(c))}`;',
    to: '  const flow = "";',
    test: INTEGRATION,
    expects: "a box's arranging is written ONCE, into the section's own stylesheet",
  },
  {
    name: "I7 a row of options stops saying that cards never sum",
    file: RENDER,
    from: "  return offers >= 2",
    to: "  return offers >= 99",
    test: ENGINE,
    expects: "comparison cards say on the page that they are not in any total",
  },
  {
    name: "I8 priced_line loses the one renderer it folded into",
    file: INDEX,
    from: "  priced_line: renderPriceLine,",
    to: "",
    test: "test/builder-tree-render.test.mjs",
    expects: "price_line and priced_line are ONE renderer, two spellings",
  },
  {
    name: "I9 a locked widget can be dragged after all",
    file: PANE,
    from: "                    draggable={!!onDragWidget && !lock}",
    to: "                    draggable={!!onDragWidget}",
    test: INTEGRATION,
    expects: "a locked widget cannot be dragged either",
  },
  {
    name: "I10 a locked ready-made section can be placed after all",
    file: GALLERY,
    from: "                  disabled={!!s.locked}",
    to: "",
    test: INTEGRATION,
    expects: "a locked ready-made section cannot be placed",
  },
  {
    name: "I11 the composites come back into the vocabulary",
    file: UPGRADE,
    from: 'export const COMPOSITE_KINDS = ["comparison_cards", "property_block", "key_facts", "priced_line"] as const;',
    to: 'export const COMPOSITE_KINDS = [] as const;',
    test: TREE,
    expects: "a document with no composites comes back as THE SAME OBJECT",
  },
];

let holes = 0;
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, "utf8");
  /* THE FILE'S OWN LINE ENDINGS. These repos are CRLF on disk and the
     mutations above are written with \n; comparing them literally would SKIP
     every check and report a guard as stale when the guard is fine. */
  const eol = original.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
  const from = m.from.split("\n").join(eol);
  const to = m.to.split("\n").join(eol);
  if (!original.includes(from)) {
    console.log(`SKIP  ${m.name} — the line it mutates has moved, so this check is stale`);
    holes += 1;
    continue;
  }
  writeFileSync(m.file, original.replace(from, to), "utf8");
  let output = "";
  let failed = false;
  try {
    output = execFileSync(
      process.execPath,
      ["--import", "./scripts/test-ts-loader.mjs", "--test", m.test],
      { encoding: "utf8" },
    );
  } catch (err) {
    failed = true;
    output = `${err.stdout || ""}${err.stderr || ""}`;
  } finally {
    writeFileSync(m.file, original, "utf8");
  }
  const noticed = failed && output.includes(m.expects);
  console.log(`${noticed ? "RED " : "HOLE"}  ${m.name} → "${m.expects}"`);
  if (!noticed) holes += 1;
}

console.log(holes
  ? `\n${holes} mutation(s) went unnoticed — those guards do not guard.`
  : `\nAll ${MUTATIONS.length} mutations were caught, and every file was restored.`);
process.exit(holes ? 1 : 0);

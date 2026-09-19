/**
 * Mutation check for the D-165 INTEGRATION (Portal).
 *
 *   node scripts/dev/d165-integration-mutation-check.mjs
 *
 * A green test proves nothing until you have made it fail on purpose
 * (memory: feedback_mutation_test_your_guards). Every mutation below undoes
 * ONE decision the integration made, by editing the REAL function, runs the
 * test that should notice, and restores the file. A mutation nothing notices
 * is a HOLE and says so.
 *
 * These are the integration's own eight — the streams' own are in
 * `d165-stream4-mutation-check.mjs` here, and in the same file in LUMEN-API
 * and arion-api.
 *
 *   I1  two groupers again: widgetGroups keeps its own kind → group table, so
 *       the panel and the registry can disagree about where a widget lives
 *   I2  the Details counter comes back
 *   I3  a converted address block loses the words the author typed, because
 *       the upgrade writes flat props the record widget never reads
 *   I4  the record widgets stop drawing on the customer's copy, because the
 *       engine has no renderer for them and only the adapter does
 *   I5  a second Terms tile: the `clauses` widget is offered beside the picker
 *   I6  the email panel offers a widget the mailbox cannot draw
 *   I7  a site block reads only its flat props, so a converted address blanks
 *   I8  the author's CSS id is written and never emitted
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const MUTATIONS = [
  {
    name: "I1 widgetGroups keeps a second kind → group table",
    file: "src/builder/widgetGroups.ts",
    from: "  return PANEL_GROUPS.includes(w.category) ? w.category : LAST_GROUP;",
    to: '  return ({ heading: "General" })[(w as any).kind] ?? (PANEL_GROUPS.includes(w.category) ? w.category : LAST_GROUP);',
    test: "test/builder-screen-d165.test.mjs",
    expects: "",
  },
  {
    name: "I2 the Details counter comes back",
    file: "src/builder/problems.ts",
    from: "/* `problemsLabel` LIVED HERE and is DELETED",
    to: 'export function problemsLabel(n: number): string { return `${n} details still to fill in`; }\n/* `problemsLabel` LIVED HERE and is DELETED',
    test: "test/builder-usability.test.mjs",
    expects: "problemsLabel is back",
  },
  {
    name: "I3 a converted address block loses what was typed",
    file: "src/builder/upgrade.ts",
    from: "    if (str(p.name)) overrides.name = str(p.name);",
    to: "    if (false) overrides.name = str(p.name);",
    test: "test/builder-dynamic-fields.test.mjs",
    expects: "",
  },
  {
    name: "I4 the record widgets stop drawing without the adapter",
    file: "src/builder/widgets/index.ts",
    from: "  customer: (w, ctx) => renderRecordBlock(w, ctx, recordBookFromContext(ctx)),",
    to: "",
    test: "test/builder-widget-set.test.mjs",
    expects: "",
  },
  {
    name: "I5 a second Terms tile is offered",
    file: "src/builder/registry.ts",
    from: "    hidden: true,\n    adapters: DOCUMENTS,\n    defaults: { heading: \"\", items: [] },",
    to: "    adapters: DOCUMENTS,\n    defaults: { heading: \"\", items: [] },",
    test: "test/builder-widget-set.test.mjs",
    expects: "",
  },
  {
    name: "I6 the email panel offers what the mailbox cannot draw",
    file: "src/builder/widgets/iaBlocks.ts",
    from: '  adapters: ["website", "landing"],\n  defaults: { items: [] },',
    to: '  adapters: ["website", "landing", "email"],\n  defaults: { items: [] },',
    test: "test/email-builder.test.mjs",
    expects: "",
  },
  {
    name: "I7 a site block reads only its flat props",
    file: "src/builder/widgets/iaData.ts",
    from: "    for (const k of keys) if (str(over[k])) return str(over[k]);",
    to: "    ",
    test: "test/builder-surfaces-d165.test.mjs",
    expects: "never reached the mailbox",
  },
  {
    name: "I8 the author's CSS id is written and never emitted",
    file: "src/builder/render.ts",
    from: '    id: a.id ? ` id="${esc(a.id)}"` : "",',
    to: '    id: "",',
    test: "test/builder-screen-d165.test.mjs",
    expects: "",
  },
];

let holes = 0;
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, "utf8");
  /* THE FILE'S OWN LINE ENDINGS. These repos are CRLF on disk and the
     mutations are written with \n, so a literal compare would SKIP the check
     and report a working guard as stale. */
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
    output = execFileSync(process.execPath,
      ["--import", "./scripts/test-ts-loader.mjs", "--test", m.test], { encoding: "utf8" });
  } catch (err) {
    failed = true;
    output = `${err.stdout || ""}${err.stderr || ""}`;
  } finally {
    writeFileSync(m.file, original, "utf8");
  }
  if (failed && (!m.expects || output.includes(m.expects))) {
    console.log(`RED   ${m.name}${m.expects ? ` → "${m.expects}"` : ""}`);
  } else if (failed) {
    console.log(`RED   ${m.name} — but NOT on the sentence expected ("${m.expects}")`);
    holes += 1;
  } else {
    console.log(`HOLE  ${m.name} — nothing noticed`);
    holes += 1;
  }
}

console.log(holes
  ? `\n${holes} mutation(s) went unnoticed — those guards do not guard.`
  : `\nAll ${MUTATIONS.length} mutations were caught, and every file was restored.`);
process.exit(holes ? 1 : 0);

// scripts/dev/d156-fix-blockers-mutation-check.mjs — REVERT EACH FIX, ONE AT A TIME.
//
//   node scripts/dev/d156-fix-blockers-mutation-check.mjs
//
// BUILDER_PLATFORM_SCOPE_2026-09-15 §11.12 (D-156), blockers V-1, V-2 and V-3
// from the click-driven verification of `d156/integration` on 2026-09-17.
//
// ── WHY THIS HARNESS EXISTS AT ALL ────────────────────────────────────────
// All three blockers were live while 2,294 tests were green, because every
// test that touched them asserted SOURCE TEXT and one of them had pinned the
// DEFECTIVE line as its expected value. So the new tests EXECUTE the real
// functions — and a test that executes the right thing is still worth nothing
// until it has been made to fail on purpose. Each mutation below puts one
// blocker BACK, exactly as the verifier found it, runs the named test and
// expects red. A mutation nothing notices is reported as a HOLE.
//
// Every file is restored whatever happens. Nothing here touches a served
// checkout or a port.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const MODEL = "src/builder/model.ts";
const SHELL = "src/builder/BuilderShell.tsx";
const PROPOSAL = "src/builder/proposal/ProposalBuilder.tsx";
const EMAIL = "src/builder/adapters/email/EmailBuilder.tsx";
const CANVAS = "src/builder/Canvas.tsx";
const PLACE = "src/builder/insertPosition.ts";
const RENDER = "src/builder/render.ts";
const PICKER = "src/builder/WidgetPicker.tsx";

const BLOCKERS = "test/builder-fix-blockers.test.mjs";
const USABILITY = "test/builder-usability.test.mjs";

const MUTATIONS = [
  {
    name: "V1a the words are written to the TOP OF A COLUMN again",
    file: MODEL,
    from: "  const hit = findNode(doc, widgetId);\n  if (!hit || isContainer(hit.node)) return doc;\n  const widget = hit.node as Widget;\n  return patchNode(doc, widgetId, setPropPath(widget.props || {}, propPath, value));",
    to: "  const flat = doc.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets));\n  const widget = flat.find((w) => w.id === widgetId);\n  if (!widget || isContainer(widget)) return doc;\n  return patchNode(doc, widgetId, setPropPath(widget.props || {}, propPath, value));",
    test: BLOCKERS,
    expects: "a heading inside a box keeps what was typed into it",
  },
  {
    name: "V1b onEditText goes back to counting an index",
    file: SHELL,
    from: "    const next = editWidgetText(doc, widgetId, path, value);",
    to: "    const next = doc.sections[0]?.columns[0]?.widgets.some((w) => w.id === widgetId)\n      ? editWidgetText(doc, widgetId, path, value) : doc;",
    test: BLOCKERS,
    expects: "no column scan is left in onEditText",
  },
  {
    name: "V1c the slash command scans a column again",
    file: SHELL,
    from: '    const cleared = editWidgetText(doc, s.widgetId, s.path, "");',
    to: '    const cleared = patchWidget(doc, here, setPropPath(widget.props, s.path, ""));',
    test: USABILITY,
    expects: "the slash command's clear and insert are ONE document operation",
  },
  {
    name: "V2a the proposal panel hand-rolls the walk again",
    file: PROPOSAL,
    from: "  const patch = (props: Record<string, unknown>) => {\n    onChange(patchNode(doc, widget.id, props));\n  };",
    to: "  const patch = (props: Record<string, unknown>) => {\n    onChange({\n      ...doc,\n      sections: doc.sections.map((s) => s.id !== sectionId ? s : {\n        ...s,\n        columns: s.columns.map((c) => ({\n          ...c,\n          widgets: c.widgets.map((w) => (w.id === widget.id ? { ...w, props: { ...w.props, ...props } } : w)),\n        })),\n      }),\n    });\n  };",
    test: BLOCKERS,
    expects: "no hand-rolled walk is left in any adapter",
  },
  {
    name: "V2b the email panel hand-rolls the walk again",
    file: EMAIL,
    from: "  const setProps = (props: Record<string, unknown>) => { onChange(patchNode(doc, widget.id, props)); };",
    to: "  const setProps = (props: Record<string, unknown>) => {\n    onChange({\n      ...doc,\n      sections: doc.sections.map((s) => ({\n        ...s,\n        columns: s.columns.map((c) => ({\n          ...c,\n          widgets: c.widgets.map((w) => (w.id === widget.id ? { ...w, props: { ...w.props, ...props } } : w)),\n        })),\n      })),\n    });\n  };",
    test: BLOCKERS,
    expects: "no hand-rolled walk is left in any adapter",
  },
  {
    name: 'V2c "Use this plan" drops the line at the top of the first column',
    file: MODEL,
    from: "export function insertBeside(\n  doc: BuilderDocument,\n  siblingId: string,\n  node: Node,\n): BuilderDocument {\n  const hit = findNode(doc, siblingId);\n  if (!hit) return doc;\n  return insertNode(doc, hit.parentId, hit.index + 1, node);\n}",
    to: "export function insertBeside(\n  doc: BuilderDocument,\n  siblingId: string,\n  node: Node,\n): BuilderDocument {\n  const hit = findNode(doc, siblingId);\n  if (!hit) return doc;\n  const column = doc.sections.find((s) => s.id === hit.sectionId)?.columns[0];\n  return column ? insertNode(doc, column.id, 0, node) : doc;\n}",
    test: BLOCKERS,
    expects: "puts the priced line BESIDE the card",
  },
  {
    name: "V2d the old priced line is only cleared at the top of a column",
    file: MODEL,
    from: "  let next = doc;\n  for (const { widget } of walkWidgets(doc)) {\n    if (match(widget)) next = removeNode(next, widget.id);\n  }\n  return next;",
    to: "  let next = doc;\n  for (const s of doc.sections) {\n    for (const c of s.columns) {\n      for (const widget of c.widgets) if (match(widget)) next = removeNode(next, widget.id);\n    }\n  }\n  return next;",
    test: BLOCKERS,
    expects: "pressing it twice leaves ONE line",
  },
  {
    name: "V3a every box's + is pinned to the same corner again",
    file: PLACE,
    from: "  return {\n    right: -11 + level * BOX_PLUS_STEP,\n    bottom: -11,\n    zIndex: 6 + level,\n  };",
    to: "  return {\n    right: -11,\n    bottom: -11,\n    zIndex: 6,\n  };",
    test: BLOCKERS,
    expects: "no two boxes in an ancestor chain share a pixel or a layer",
  },
  {
    name: "V3b the step no longer clears the button",
    file: PLACE,
    from: "export const BOX_PLUS_STEP = 26;",
    to: "export const BOX_PLUS_STEP = 8;",
    test: BLOCKERS,
    expects: "no two boxes in an ancestor chain share a pixel or a layer",
  },
  {
    name: "V3c the canvas stops asking how deep the box is",
    file: CANVAS,
    from: "      const place = boxPlusPlacement(level);",
    to: "      const place = boxPlusPlacement(0);",
    test: BLOCKERS,
    expects: "THE CANVAS USES IT",
  },
  {
    name: "V3d the depth limit becomes two numbers again",
    file: RENDER,
    from: "export const MAX_CONTAINER_DEPTH = MAX_DEPTH;",
    to: "export const MAX_CONTAINER_DEPTH = 12;",
    test: BLOCKERS,
    expects: "the renderer's guard is the editor's own limit",
  },
  {
    name: "V3e the slash picker loses its box door",
    file: SHELL,
    from: "              onPickBox={slashCommitBox}",
    to: "",
    test: BLOCKERS,
    expects: "the slash command can ask for a Box, a Row or a Grid",
  },
  {
    name: "V3f the Layout group disappears again when only a box matches",
    file: PICKER,
    /* REPOINTED AT INTEGRATION 2026-09-19: the line moved, the promise did not. */
    from: '    if (!boxes.length || groups.some((g) => g.group === "Layout")) return groups;',
    to: "    if (true) return groups;",
    test: BLOCKERS,
    expects: "a search that matches only a BOX still shows the Layout group",
  },
];

let holes = 0;
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, "utf8");
  /* THE FILE'S OWN LINE ENDINGS. These repos are CRLF on disk and the
     mutations above are written with \n; comparing them literally would SKIP
     every check and report a guard as stale when the guard is fine. A harness
     that cannot find the line it mutates proves nothing, and it says so in the
     same words as a hole. */
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

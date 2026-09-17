// scripts/dev/d156-conformance-mutation-check.mjs — MAKE THE CONFORMANCE
// GUARDS FAIL.
//
//   node scripts/dev/d156-conformance-mutation-check.mjs
//
// D156_CONFORMANCE_AUDIT_2026-09-17.md, the Portal's rows. Every guard this
// pass added is a green check until it has been made to fail on purpose
// (`feedback_mutation_test_your_guards`), so each mutation below breaks ONE
// thing the audit asked for, the named test is run, and the file is restored
// whatever happens. A mutation the test did not notice is reported as a HOLE,
// in the same words as a stale check, because a harness that cannot find the
// line it mutates proves exactly as much as a guard that does not guard.
//
// Nothing here touches a served checkout or a port.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const CARD = "src/builder/widgets/card.ts";
const RIBBON = "src/builder/widgets/ribbon.ts";
const BINDING = "src/builder/widgets/binding.ts";
const PRICE_LINE = "src/builder/widgets/priceLine.ts";
const TREE_OPS = "src/builder/treeOps.ts";
const UPGRADE = "src/builder/upgrade.ts";
const TIER = "src/builder/tier.ts";
const SITE_PLAN = "src/builder/adapters/website/sitePlan.ts";
const INDEX = "src/builder/widgets/index.ts";
const DOC = "src/builder/proposalDoc.ts";

const CONF = "test/builder-conformance.test.mjs";
const GATING = "test/website-plan-gating.test.mjs";

const MUTATIONS = [
  /* ── POINT 3 — the card IS the price table ──────────────────────────── */
  {
    name: "C1 the card goes back to its own spelling for the heading",
    file: CARD,
    from: '    { key: "heading", label: "What this option is called", type: "text", section: "Heading" },',
    to: '    { key: "title", label: "What this option is called", type: "text", section: "Heading" },',
    test: CONF,
    expects: "every control the card declares is a key the price table has",
  },
  {
    name: "C2 a card's controls stop being grouped the way every author knows",
    file: CARD,
    from: '    { key: "show_ribbon", label: "Put a ribbon on this card", type: "toggle", section: "Ribbon", help: "A banner across the top corner" },',
    to: '    { key: "show_ribbon", label: "Put a ribbon on this card", type: "toggle", help: "A banner across the top corner" },',
    test: CONF,
    expects: "the Inspector's sections are the price table's five, in its order",
  },
  {
    name: "C3 an old card with the symbol in its price reads $$525",
    file: CARD,
    from: "export function priceWithoutSymbol(price: string, glyph: string): string {\n  if (!glyph) return price;",
    to: "export function priceWithoutSymbol(price: string, glyph: string): string {\n  if (glyph) return price;\n  if (!glyph) return price;",
    test: CONF,
    expects: "the currency symbol is drawn, and an old card does not read $$525",
  },
  {
    name: "C4 a number behind a switched-off saving is struck through anyway",
    file: CARD,
    from: "  const wasShown = f.sale ? f.original_price : \"\";",
    to: "  const wasShown = f.original_price;",
    test: CONF,
    expects: "the old price is only struck through when the author says it is a saving",
  },
  {
    name: "C5 TWO cards in one row say Recommended",
    file: TREE_OPS,
    from: "  return clearRecommendedSiblings(written, id);",
    to: "  return written;",
    test: CONF,
    expects: "AT MOST ONE RECOMMENDED IN A ROW",
  },
  {
    name: "C6 the ribbon's words are left behind the switch the author turned off",
    file: RIBBON,
    from: '    return { show_ribbon: "", ribbon_title: "", ribbon_preset: "" };',
    to: '    return { show_ribbon: "" };',
    test: CONF,
    expects: "the ribbon's words come off with the ribbon",
  },

  {
    name: "C21 the proposal panel writes props its own way again, missing nested cards",
    file: "src/builder/proposal/ProposalBuilder.tsx",
    from: "    onChange(patchNode(doc, widget.id, props));",
    to: "    onChange({ ...doc, sections: doc.sections.map((s) => (s.id !== sectionId ? s : { ...s, columns: s.columns.map((c) => ({ ...c, widgets: c.widgets.map((w) => (w.id === widget.id ? { ...w, props: { ...w.props, ...props } } : w)) })) })) });",
    test: CONF,
    expects: "THE PANEL WRITES THROUGH THE ONE SEAM",
  },

  /* ── POINT 4 — the Binding section ──────────────────────────────────── */
  {
    name: "C7 the Binding section goes back to being on ONE widget",
    file: PRICE_LINE,
    from: "    // THE SAME Binding section a product card has (F.2). A client who learnt\n    // it on one finds it on the other, which is the whole point of the section.\n    ...BINDING_CONTROLS,",
    to: "",
    test: CONF,
    expects: "all four of them declare the same five controls",
  },
  {
    name: "C8 the third refresh mode disappears, and a sent price can move again",
    file: BINDING,
    from: '  {\n    value: "snapshot_send", label: "Keep this price when sent",',
    to: '  {\n    value: "snapshot_send_removed", label: "Keep this price when sent",',
    test: CONF,
    expects: "THREE refresh modes, and the third is a stored value, not an absence",
  },
  {
    name: "C9 “show the figures it last had” is dropped from on_empty",
    file: BINDING,
    from: '  { value: "last_snapshot", label: "Show the figures it last had" },',
    to: "",
    test: CONF,
    expects: "THREE on-empty values, and each does a different thing",
  },
  {
    name: "C10 freeze-on-send does nothing, so a quoted price moves under the customer",
    file: BINDING,
    from: '  if (mode !== "send") return doc;',
    to: "  if (mode) return doc;",
    test: CONF,
    expects: "FREEZE ON SEND is merge.fill's own mode, and nothing else",
  },
  {
    name: "C11 the proposal's send seam stops asking for the frozen copy",
    file: DOC,
    from: "  const sent = freezeOnSend(doc, ctx.fill ?? \"view\", (w) => proposalSnapshot(w, ctx));",
    to: "  const sent = doc;",
    test: CONF,
    expects: "the proposal's SEND is the seam, and a draft save is not",
  },
  {
    name: "C12 the four loose selection spellings stop being read",
    file: BINDING,
    from: "    offeringId: str(sel.offering_id ?? sel.offeringId ?? p.offeringId ?? p.offering_id),",
    to: "    offeringId: str(sel.offering_id ?? sel.offeringId),",
    test: CONF,
    expects: "`_ia_selection` is the ONE home, and the four loose spellings are read",
  },

  {
    name: "C22 a typed word lands on the card's own field, so the sentence never appears",
    file: "src/builder/widgets/productCard.ts",
    from: '  return renderCardBody(shown, ctx, { extra, readOnlyPrice: true, into: "overrides" });',
    to: "  return renderCardBody(shown, ctx, { extra, readOnlyPrice: true });",
    test: CONF,
    expects: "A TYPED WORD GOES INTO `overrides`",
  },

  /* ── POINT 5 — the tax mode that resolved to nothing ────────────────── */
  {
    name: "C24 the three tax states go back to being a stored word nothing sets",
    file: "src/builder/widgets/totals.ts",
    from: '      key: "tax_mode", label: "Tax", type: "select", section: "Tax",',
    to: '      key: "tax_mode_removed", label: "Tax", type: "select", section: "Tax",',
    test: CONF,
    expects: "the three modes are a control, and the canonical names are what is written",
  },
  {
    name: "C25 a document taxed at the business default with no rate says nothing again",
    file: "src/builder/widgets/totals.ts",
    from: '  const unresolved = s.taxUnresolved && ctx.mode === "edit"',
    to: "  const unresolved = false && ctx.mode === \"edit\"",
    test: CONF,
    expects: "the sentence is the SERVER's own words, and only the author reads it",
  },
  {
    name: "C26 `null` and `0` collapse, so “charges no sales tax” reads as “not set”",
    file: "src/builder/totals.ts",
    from: "    taxUnresolved: mode === \"business\" && rate == null,",
    to: "    taxUnresolved: mode === \"business\" && !rate,",
    test: "test/builder-atomic-widgets.test.mjs",
    expects: "the three tax states, and the one that follows the business",
  },

  /* ── POINT 1 — what a publish has to carry ──────────────────────────── */
  {
    // THE SEAM MOVED ON THE MERGE (2026-09-17). Two passes fixed this bug
    // independently; the surviving addressing is `model.editWidgetText`, which
    // the shell and the four adapter panels all call. So the mutation puts the
    // flat walk back INSIDE that one function — which is the whole point of
    // there being one: break it once and every surface goes red.
    name: "C23 words typed on the page never reach a widget inside a box",
    file: "src/builder/model.ts",
    from: "  return patchNode(doc, widgetId, setPropPath(widget.props || {}, propPath, value));",
    to: "  const flat = doc.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets));\n  return flat.some((w) => w.id === widgetId) ? patchNode(doc, widgetId, setPropPath(widget.props || {}, propPath, value)) : doc;",
    test: CONF,
    expects: "WORDS TYPED ON THE PAGE reach a widget inside a box",
  },
  {
    name: "C13 a duplicated box forgets what it was drawn as",
    file: TREE_OPS,
    from: "      props: JSON.parse(JSON.stringify(n.props || {})),\n      children: n.children.map(cloneNode),",
    to: "      props: {},\n      children: n.children.map(cloneNode),",
    test: CONF,
    expects: "a box's props survive a patch and a duplicate",
  },
  {
    name: "C14 a container's props are refused again, so html_tag cannot be set",
    file: TREE_OPS,
    from: "  const written = editNodeById(doc, id, (n) => ({ ...n, props: { ...n.props, ...props } } as Node));",
    to: "  const written = editNodeById(doc, id, (n) => (isContainer(n) ? n : { ...n, props: { ...n.props, ...props } }) as Node);",
    test: CONF,
    expects: "a box's props survive a patch and a duplicate",
  },

  /* ── POINT 9 — the free HTML box ────────────────────────────────────── */
  {
    name: "C15 nobody can add their own HTML again",
    file: INDEX,
    from: "  CARD_DEF, CATALOG_CARD_DEF, PRICE_LINE_DEF, TOTALS_DEF, ADDRESS_BLOCK_DEF, KEY_FACT_DEF,\n  HTML_DEF,",
    to: "  CARD_DEF, CATALOG_CARD_DEF, PRICE_LINE_DEF, TOTALS_DEF, ADDRESS_BLOCK_DEF, KEY_FACT_DEF,",
    test: CONF,
    expects: "it is a widget, free, on the two surfaces that are HTML pages",
  },
  {
    name: "C16 the author's markup is escaped into text on the page",
    file: "src/builder/widgets/html.ts",
    from: "  return editing ? `<div class=\"bx-html\" data-html-preview=\"1\">${code}</div>` : code;",
    to: "  return editing ? `<div class=\"bx-html\" data-html-preview=\"1\">${code}</div>` : code.replace(/</g, \"&lt;\");",
    test: CONF,
    expects: "the markup goes on the page unchanged, and an empty box draws nothing",
  },

  /* ── POINT 7 — three states, three sentences ────────────────────────── */
  {
    name: "C17 the two refusals collapse back into one bucket",
    file: TIER,
    from: "    : (product ? ownershipSentence(product) : PLAN_SENTENCE);\n  return { reason: product ? \"ownership\" : \"plan\", sentence, tier: gate };",
    to: "    : PLAN_SENTENCE;\n  return { reason: \"plan\", sentence, tier: gate };",
    test: CONF,
    expects: "offered, not on this plan, needs a product",
  },
  {
    name: "C18 silence from the server becomes a refusal",
    file: SITE_PLAN,
    from: "    if (row.available !== false) continue;",
    to: "    if (row.available === true) continue;",
    test: GATING,
    expects: "an older server that says nothing locks NOTHING",
  },

  /* ── POINT (g) — the rename, and the golden ─────────────────────────── */
  {
    name: "C19 a card saved with the old names opens with them still on it",
    file: UPGRADE,
    from: "    default: return renameProps(n);",
    to: "    default: return n;",
    test: CONF,
    expects: "a card saved with the OLD names opens with the new ones",
  },
  {
    name: "C20 the rename rebuilds a document it had nothing to do to (the golden moves)",
    file: UPGRADE,
    from: "  return next ? { ...w, props: next } : w;",
    to: "  return { ...w, props: next || { ...p } };",
    test: CONF,
    expects: "A DOCUMENT THAT NEVER USED THE OLD NAMES IS BYTE-IDENTICAL",
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

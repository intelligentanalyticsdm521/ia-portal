// test/job-lines-editor-recheck.test.mjs — two things the re-click of the
// 1 Oct on-site walk left open in the job window's line editors.
//
//   1. The change-order editor (job window → Line items → New change order →
//      + Add custom line) at an 800px window: the Qty box was 20px and the
//      Unit price box 27px wide, so their values could not be read; the table
//      squeezed instead of scrolling. The boxes now have floors (Qty ≥ 56px,
//      Unit price ≥ 96px; Service stays ≥ 180px) and the table scrolls
//      sideways inside its own box.
//   2. A completed AND invoiced job: "New change order" and "+ Create invoice"
//      were hidden (M8) but the line-item editor above them was still fully
//      editable. It is now read-only, with one plain line saying why.
//
// The picker is RENDERED here (esbuild bundles the real component with the
// API hook stubbed; react-dom/server draws it), so the widths and the
// read-only state are read off the markup a browser gets, not the source.
//
// Mutation-tested 2026-10-01 (each break made on purpose; the catching case named):
//   · drop minWidth from the Qty box           → "the Qty and Unit price boxes have readable floors …"
//   · let jobFinishedAndInvoiced miss "paid"   → "finished and invoiced: …"
//   · pass p.isTerminal back to the editor     → "the job window's line editor is read-only …"
//
// Run:  npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as lib from "../src/lib/onsiteJob.ts";

const ROOT = new URL("../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(`src/${p}`, ROOT), "utf8");
const esbuild = createRequire(new URL("package.json", ROOT))("esbuild");

// The picker reads the price list through useOliverApi (MSAL, import.meta.env);
// a render needs none of that, so the hook is stubbed: not ready, no list.
const stubApi = {
  name: "stub-oliver-api",
  setup(b) {
    b.onResolve({ filter: /hooks\/useOliverApi$/ }, () => ({ path: "useOliverApi", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export function useOliverApi() { return { get: async () => [], ready: false }; }",
      loader: "js",
    }));
  },
};
const built = await esbuild.build({
  stdin: {
    contents: `
      import { createElement } from "react";
      import { renderToStaticMarkup } from "react-dom/server.browser";
      export * from "./src/components/oliver/CatalogLineItemPicker.tsx";
      export const render = (C, props) => renderToStaticMarkup(createElement(C, props));
    `,
    resolveDir: fileURLToPath(ROOT),
    loader: "tsx",
    sourcefile: "entry.tsx",
  },
  bundle: true, format: "esm", platform: "browser", jsx: "automatic", write: false, logLevel: "silent",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [stubApi],
});
const ui = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text, "utf8").toString("base64")}`);

/** The style attribute of the first <input> that carries this aria-label / placeholder. */
function styleOf(html, attr) {
  const tag = html.match(new RegExp(`<input[^>]*${attr}[^>]*>`));
  assert.ok(tag, `no input with ${attr}`);
  return (tag[0].match(/style="([^"]*)"/) || [, ""])[1];
}
const px = (style, prop) => {
  const m = style.match(new RegExp(`(?:^|;)${prop}:(\\d+)px`));
  return m ? Number(m[1]) : null;
};

// What "+ Add custom line" puts in the change-order editor.
const customLine = { description: "", quantity: 1, unit_price: 0, sort_order: 0 };

// ── 1. the change-order editor at 800px ───────────────────────────────────

test("the Qty and Unit price boxes have readable floors (Qty ≥ 56px, Unit price ≥ 96px) and Service keeps ≥ 180px", () => {
  assert.ok(ui.QTY_MIN_WIDTH >= 56);
  assert.ok(ui.UNIT_PRICE_MIN_WIDTH >= 96);
  assert.ok(ui.SERVICE_MIN_WIDTH >= 180);
  const html = ui.render(ui.CatalogLineItemPicker, { items: [customLine], onChange: () => {}, hideDiscount: true });
  assert.equal(px(styleOf(html, 'aria-label="Qty"'), "min-width"), ui.QTY_MIN_WIDTH);
  assert.equal(px(styleOf(html, 'aria-label="Unit price"'), "min-width"), ui.UNIT_PRICE_MIN_WIDTH);
  assert.equal(px(styleOf(html, 'placeholder="Service description"'), "min-width"), ui.SERVICE_MIN_WIDTH);
  // border-box: the floor is the box the value is drawn in, padding included.
  assert.match(styleOf(html, 'aria-label="Qty"'), /box-sizing:border-box/);
  assert.match(styleOf(html, 'aria-label="Unit price"'), /box-sizing:border-box/);
});

test("when the window is narrower than the columns, the table scrolls inside its box instead of squeezing", () => {
  const html = ui.render(ui.CatalogLineItemPicker, { items: [customLine], onChange: () => {}, hideDiscount: true });
  assert.match(html, /<div style="overflow-x:auto" data-testid="line-items-scroll"><table/);
  // The change-order editor has no Discount column (a change line cannot carry one).
  assert.doesNotMatch(html, />Discount</);
  // And the full editor (job lines) keeps the same floors with Discount shown.
  const full = ui.render(ui.CatalogLineItemPicker, { items: [customLine], onChange: () => {} });
  assert.match(full, />Discount</);
  assert.equal(px(styleOf(full, 'aria-label="Qty"'), "min-width"), ui.QTY_MIN_WIDTH);
  assert.equal(px(styleOf(full, 'aria-label="Unit price"'), "min-width"), ui.UNIT_PRICE_MIN_WIDTH);
});

test("the change-order editor is the same picker, with the Discount column left out", () => {
  assert.match(read("components/oliver/customer/ChangeOrdersCard.tsx"), /<CatalogLineItemPicker items=\{adds\} onChange=\{setAdds\} hideDiscount \/>/);
});

// ── 2. a finished, invoiced job's lines ───────────────────────────────────

test("finished and invoiced: completed with a live invoice, or invoiced / paid", () => {
  assert.equal(lib.jobFinishedAndInvoiced({ status: "completed", invoices: [{ status: "draft" }] }), true);
  assert.equal(lib.jobFinishedAndInvoiced({ status: "completed", invoices: [{ status: "sent" }] }), true);
  assert.equal(lib.jobFinishedAndInvoiced({ status: "invoiced", invoices: [] }), true);
  assert.equal(lib.jobFinishedAndInvoiced({ status: "paid", invoices: [{ status: "paid" }] }), true);
  assert.equal(lib.jobFinishedAndInvoiced({ status: "completed", invoices: [] }), false, "completed, not invoiced yet: the lines can still be put right");
  assert.equal(lib.jobFinishedAndInvoiced({ status: "completed", invoices: [{ status: "void" }] }), false, "a void invoice does not count");
  assert.equal(lib.jobFinishedAndInvoiced({ status: "in_progress", invoices: [{ status: "draft" }] }), false, "not finished");
  for (const s of ["scheduled", "dispatched", "assigned", "in_progress", "completed", "invoiced", "paid", "cancelled"]) {
    for (const invoices of [[], [{ status: "draft" }], [{ status: "void" }]]) {
      assert.equal(lib.jobOffersCreateInvoice({ status: s, invoices }), !lib.jobFinishedAndInvoiced({ status: s, invoices }),
        `"+ Create invoice" and the locked editor follow one rule (${s}, ${JSON.stringify(invoices)})`);
    }
  }
});

test("a read-only picker offers nothing to change: every box disabled, no add buttons, no remove", () => {
  const items = [
    { id: "L1", description: "Mulch Installation", quantity: 2, unit_price: 180, service_offering_id: "svc-mulch" },
    { id: "L2", description: "Weekly Mowing", quantity: 1, unit_price: 65 },
  ];
  const html = ui.render(ui.CatalogLineItemPicker, { items, onChange: () => {}, disabled: true });
  const inputs = html.match(/<input[^>]*>/g) || [];
  assert.ok(inputs.length >= 6, "the lines are still shown");
  for (const tag of inputs) assert.match(tag, /\sdisabled=""/, `an editable box on a locked job: ${tag}`);
  for (const tag of html.match(/<select[^>]*>/g) || []) assert.match(tag, /\sdisabled=""/);
  assert.doesNotMatch(html, /\+ Add custom line|\+ Add from catalog/);
  assert.doesNotMatch(html, /title="Remove line"/);
  // The same picker, not locked, offers all three.
  const open = ui.render(ui.CatalogLineItemPicker, { items, onChange: () => {} });
  assert.match(open, /\+ Add custom line/);
  assert.match(open, /title="Remove line"/);
});

test("the job window's line editor is read-only on a finished, invoiced job, and says why in one plain line", () => {
  const panel = read("components/oliver/customer/JobDetailPanel.tsx");
  assert.equal(lib.JOB_LINES_LOCKED_LINE, "This job is finished and invoiced; its lines can't change.");
  assert.match(panel, /const linesLocked = jobFinishedAndInvoiced\(job\);/);
  assert.match(panel, /const linesReadOnly = p\.isTerminal \|\| linesLocked;/);
  assert.match(panel, /<CatalogLineItemPicker items=\{p\.lineItems\} onChange=\{p\.setLineItems\} disabled=\{linesReadOnly\} \/>/);
  assert.match(panel, /\{linesLocked && \(\s*<div data-testid="job-lines-locked"[^>]*>\s*\{JOB_LINES_LOCKED_LINE\}\s*<\/div>/);
  assert.match(panel, /\{p\.lineItemsDirty && !linesReadOnly && \(/, "no Save on a locked job");
  assert.doesNotMatch(panel, /disabled=\{p\.isTerminal\} \/>/, "the editor no longer follows paid / cancelled alone");
  // The buttons beside it keep following the same state.
  assert.match(panel, /\{jobOffersCreateInvoice\(job\) && \(/);
  assert.match(panel, /disabled=\{p\.isTerminal \|\| !jobTakesChangeOrders\(job\)\}/);
  // Plain words on the screen.
  assert.doesNotMatch(lib.JOB_LINES_LOCKED_LINE, /tenant/i);
});

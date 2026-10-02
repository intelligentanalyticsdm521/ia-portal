/**
 * scripts/add-b168-landed-email-cases.mjs — the golden cases landing owes.
 *
 * ONE-SHOT, and kept beside `add-f6-money-email-cases.mjs` so the next family
 * can copy it. `test/fixtures/email-render-cases.json` holds one case per
 * widget the email builder offers, each a document plus the exact HTML and
 * plain text the renderer produces. A widget added to the newsletter panel
 * with no case there fails `test/email-builder.test.mjs` by name, which is how
 * a widget that draws nothing in a mailbox is caught.
 *
 * Run from the repo root:
 *   node --import ./scripts/test-ts-loader.mjs scripts/add-b168-landed-email-cases.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deserialise } from "../src/builder/model.ts";
import {
  makeEmailContext, renderEmailSection, renderEmailText,
} from "../src/builder/adapters/email/emailRender.ts";

const FILE = path.join(process.cwd(), "test", "fixtures", "email-render-cases.json");
const fixture = JSON.parse(readFileSync(FILE, "utf8"));

const section = (id, widget) => ({
  v: 2,
  settings: { style: "newsletter", accent: "#0C4A60" },
  sections: [{
    id: "s1", label: "Case", numbered: false, layout: 1, width: "contained",
    background: "", headingFont: "", padding: 16, theme: "light",
    recommended: false, pageBreakBefore: false, visibility: "customer",
    columns: [{ id: "c1", widgets: [{ id, ...widget }] }],
  }],
});

const NEW = [
  {
    /* BOOK NOW is the IA twin of Button (the offer file's own words) and family
       f8 wrote its mailbox half, so the newsletter offers it. The case uses the
       family's own control keys, with no business name in it. */
    name: "book now",
    kind: "book_now",
    doc: section("w1", {
      kind: "book_now",
      props: {
        text: "Book your visit", link: "https://example.test/book",
        align: "center", size: "md", border_radius: 6,
      },
    }),
  },
];

const have = new Set(fixture.cases.map((c) => c.name));
for (const c of NEW) {
  if (have.has(c.name)) { console.log(`already there: ${c.name}`); continue; }
  const doc = deserialise(c.doc);
  const ctx = makeEmailContext(doc, fixture.context);
  fixture.cases.push({
    name: c.name, kind: c.kind, doc: c.doc,
    html: renderEmailSection(doc.sections[0], ctx),
    text: renderEmailText(doc, ctx),
  });
  console.log(`added: ${c.name}`);
}

writeFileSync(FILE, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
console.log(`${fixture.cases.length} cases`);

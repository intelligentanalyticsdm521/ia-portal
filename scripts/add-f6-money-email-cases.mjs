/**
 * scripts/add-f6-money-email-cases.mjs — add the two f6-money golden cases.
 *
 * ONE-SHOT, and kept so the next family can copy it. `test/fixtures/
 * email-render-cases.json` holds one case per widget the email builder offers,
 * each a document plus the exact HTML and plain text the renderer produces.
 * A widget added to the newsletter panel with no case there fails
 * `test/email-builder.test.mjs` by name, which is how a widget that draws
 * nothing in a mailbox is caught.
 *
 * Run from the repo root:  node scripts/add-f6-money-email-cases.mjs
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
    name: "price table",
    kind: "price_table",
    doc: section("w1", {
      kind: "price_table",
      props: {
        heading: "Seasonal plan", heading_tag: "h3", sub_heading: "Eight visits a season",
        currency_symbol: "dollar", price: "1,250.00", currency_format: ",", period: "per season",
        features_list: [{ item_text: "Spring clean-up" }, { item_text: "Two fertiliser rounds" }],
        button_text: "Choose this plan", link: { url: "https://example.test/plan" },
        footer_additional_info: "Prices hold for 30 days.",
        show_ribbon: "yes", ribbon_title: "Most chosen",
      },
    }),
  },
  {
    name: "price list",
    kind: "price_list",
    doc: section("w1", {
      kind: "price_list",
      props: {
        price_list: [
          { title: "Mowing", price: "$65", item_description: "Weekly, April to October" },
          { title: "Aeration", price: "$180" },
        ],
        title_tag: "span", description_tag: "p", image_size_size: "thumbnail",
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

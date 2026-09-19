// test/families-f6-money.test.mjs — the f6-money family keeps its contract.
//
// B-168 section C.1. This file is the family's OWN test and belongs to the
// agent building the family. What was here from the first commit is the
// contract EVERY family keeps:
//
//   · every def has a renderer and every renderer has a def;
//   · every def names builders, out of the offer file's five;
//   · every def is IN THE OFFER for every builder it claims (D-168);
//   · nothing ships with a `requires` gate — Brandon decides the tiers in
//     October and that must then be a change to DATA, not a rebuild.
//
// What b168/f6-money adds is the FOUR WIDGETS: Price Table, Price List,
// PayPal Button and Stripe Button, Elementor's own four money widgets by
// Elementor's own names, plus the arion emitter each one publishes.
//
// MUTATION CHECKS — RUN, not assumed (2026-09-19, by executing the real
// functions and reading the failure, then restoring):
//   1. a def with kind `sparkle_box` in this family → "NOT in the website
//      offer", naming the folder.  Restored.
//   2. `price_table`'s renderer removed from the family index → "declared with
//      no renderer".  Restored.
//   3. the arion emitter's `features_list` key renamed to `features` → the
//      settings-key assertion below went red naming the key.  Restored.
//   4. the emitter's `paypal-button` widgetType changed to `pay-button` →
//      "not an Elementor widget in WIDGET_SETTINGS_KEYS.json".  Restored.
// ── ONE IMPORT THAT LOOKS UNNECESSARY AND IS NOT (found by running this) ──
// `families/index.ts` builds its `FAMILIES` array at module-evaluation time,
// and `render.ts` imports it. So a module graph entered at a FAMILY FOLDER
// goes f6-money/index → priceTable → render.ts → families/index → f6-money
// (still in flight) and throws *"Cannot access 'F6_MONEY' before
// initialization"*. The app never enters there — registry.ts and render.ts
// load first — and this line makes the test enter the same way the app does.
// It is a seam landmine every one of the ten families will hit; the fix is one
// line in `families/index.ts` (build FAMILIES lazily) and it belongs to the
// lander. Written down in D168_HANDOFF_2026-09-19.md rather than left to be
// rediscovered nine more times.
import "../src/builder/render.ts";

import { test } from "node:test";
import assert from "node:assert/strict";
import { FAMILY } from "../src/builder/widgets/families/f6-money/index.ts";
import { splitPrice, featureRows } from "../src/builder/widgets/families/f6-money/priceTable.ts";
import { priceRows, rowImage, rowLink } from "../src/builder/widgets/families/f6-money/priceList.ts";
import { payNote } from "../src/builder/widgets/families/f6-money/payButtons.ts";
import { EMITTERS } from "../../arion-api-septa-b168f6/lib/websiteBuilder/families/f6-money/emitters.js";
import { assertFamilyContract, assertSettingsKeys, SETTINGS_KEYS } from "./helpers/familyContract.mjs";

const ctx = (mode = "edit") => ({ mode, accent: "#0C4A60", merge: {}, currency: "USD" });

test("f6-money: the family exports the one shape families/index.ts collects", () => {
  assert.ok(Array.isArray(FAMILY.defs), "defs is an array");
  assert.equal(typeof FAMILY.renderers, "object", "renderers is a map");
});

test("f6-money: every widget it declares keeps the contract", () => {
  assertFamilyContract("f6-money", FAMILY);
});

/* ═══════════════════════════════════════════════════════════════════════════
   THE FOUR, AND ONLY THE FOUR
   ═════════════════════════════════════════════════════════════════════════ */

test("f6-money declares Elementor's four money widgets and nothing else", () => {
  assert.deepEqual(FAMILY.defs.map((d) => d.kind).sort(),
    ["paypal_button", "price_list", "price_table", "stripe_button"]);
  // ELEMENTOR'S OWN TITLES. The offer test matches the panel on these, and
  // D-168 is that a tile carries Elementor's name or it does not exist.
  assert.deepEqual(
    Object.fromEntries(FAMILY.defs.map((d) => [d.kind, d.label])),
    {
      price_table: "Price Table",
      price_list: "Price List",
      paypal_button: "PayPal Button",
      stripe_button: "Stripe Button",
    });
});

test("f6-money: the label of each one is the title Elementor's own catalogue gives it", () => {
  const slugOf = {
    price_table: "price-table", price_list: "price-list",
    paypal_button: "paypal-button", stripe_button: "stripe-button",
  };
  for (const d of FAMILY.defs) {
    assert.equal(d.label, SETTINGS_KEYS.widgets[slugOf[d.kind]].title,
      `${d.kind}: the tile must read exactly what Elementor calls it`);
  }
});

test("f6-money: each widget is offered exactly where the offer file puts it", () => {
  const byKind = Object.fromEntries(FAMILY.defs.map((d) => [d.kind, d.builders.slice().sort()]));
  assert.deepEqual(byKind.price_table, ["landing", "newsletter", "proposal", "website"]);
  assert.deepEqual(byKind.price_list, ["landing", "newsletter", "proposal", "website"]);
  // Paper cannot take a payment and a mailbox must not try: the offer gives
  // both payment buttons to website and landing only.
  assert.deepEqual(byKind.paypal_button, ["landing", "website"]);
  assert.deepEqual(byKind.stripe_button, ["landing", "website"]);
});

test("f6-money: all four are Elementor Pro, and none ships a plan gate", () => {
  for (const d of FAMILY.defs) {
    assert.equal(d.tier, "pro", `${d.kind}: price-table, price-list and the two payment `
      + "buttons are all in Elementor's own pro-elements category");
    assert.equal(d.requires, undefined,
      `${d.kind}: Brandon decides the tiers in October and that must be DATA, not a rebuild`);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   THE PANEL SECTIONS ARE ELEMENTOR'S OWN
   ═════════════════════════════════════════════════════════════════════════ */

const sectionsOf = (kind, tab) => {
  const def = FAMILY.defs.find((d) => d.kind === kind);
  const out = [];
  for (const c of def.controls) {
    if ((c.tab ?? "content") !== tab) continue;
    if (!out.includes(c.section)) out.push(c.section);
  }
  return out;
};

test("f6-money: Price Table's Content tab is Elementor's five sections, in order", () => {
  assert.deepEqual(sectionsOf("price_table", "content"),
    ["Header", "Pricing", "Features", "Footer", "Ribbon"]);
  assert.deepEqual(sectionsOf("price_table", "style"),
    ["Header", "Pricing", "Features", "Footer", "Ribbon"]);
});

test("f6-money: Price List's tabs are Elementor's List / Content / Image", () => {
  assert.deepEqual(sectionsOf("price_list", "content"), ["List"]);
  assert.deepEqual(sectionsOf("price_list", "style"), ["List", "Content", "Image"]);
});

test("f6-money: both payment buttons use Elementor's same three sections", () => {
  for (const kind of ["paypal_button", "stripe_button"]) {
    assert.deepEqual(sectionsOf(kind, "content"),
      ["Pricing & Payments", "Button", "Additional Options"], kind);
    assert.deepEqual(sectionsOf(kind, "style"), ["Button"], kind);
  }
});

test("f6-money: no payment widget asks a client to type a token into a page", () => {
  // A credential typed into a builder ends up inside the stored document and
  // inside every copy of it. The business connects its processor in Settings.
  for (const kind of ["paypal_button", "stripe_button"]) {
    const keys = FAMILY.defs.find((d) => d.kind === kind).controls.map((c) => c.key);
    for (const forbidden of ["sdk_token", "sandbox_email", "merchant_account"]) {
      assert.ok(!keys.includes(forbidden), `${kind}: "${forbidden}" must not be a panel control`);
    }
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   THE RENDERERS — assert what APPEARS, not only what does not
   ═════════════════════════════════════════════════════════════════════════ */

const draw = (kind, props, mode = "view") =>
  FAMILY.renderers[kind]({ id: "w1", kind, props }, ctx(mode));

test("f6-money: a Price Table draws its title, its price, its features and its button", () => {
  const html = draw("price_table", {
    heading: "Seasonal plan", heading_tag: "h3", sub_heading: "Eight visits",
    currency_symbol: "dollar", price: "1,250.00", currency_format: ",", period: "per season",
    features_list: [{ item_text: "Spring clean-up" }, { item_text: "Two fertiliser rounds" }],
    button_text: "Choose this plan", footer_additional_info: "Prices hold for 30 days.",
    show_ribbon: "yes", ribbon_title: "Most chosen",
  });
  for (const wanted of [
    "Seasonal plan", "Eight visits", "$", "1,250", "per season",
    "Spring clean-up", "Two fertiliser rounds", "Choose this plan",
    "Prices hold for 30 days.", "Most chosen",
  ]) {
    assert.ok(html.includes(wanted), `the page must show "${wanted}" — it shows: ${html}`);
  }
  // `currency_format: ","` means the pennies are after the dot, and they are
  // drawn as their own smaller run — WITH the separator, so the plain-text
  // twin of this widget reads $1,250.00 and not $1,25000.
  assert.ok(html.includes(">.00<"), "the fractional part is its own run, mark and all");
});

test("f6-money: a Price Table a customer reads shows no placeholders and no empty rows", () => {
  const html = draw("price_table", { heading: "Just a title" });
  assert.ok(html.includes("Just a title"));
  assert.ok(!html.includes("bx-slot"), "no empty editing slots in the customer's copy");
  /* THE WORDS ON THE PAGE, not the mark-up around them. `editRun` carries
     `data-placeholder` on every run it draws, which is the engine's one
     editing mechanism and is invisible to a reader; what must never appear is
     Elementor's starting words as TEXT. */
  const readable = html.replace(/<[^>]*>/g, " ");
  for (const lorem of ["Enter your title", "Enter your description", "This is text element", "Click Here"]) {
    assert.ok(!readable.includes(lorem),
      `"${lorem}" is Elementor's PLACEHOLDER and must never be stored text on a document somebody signs`);
  }
});

test("f6-money: editing a Price Table gives the author an empty feature line to type into", () => {
  const html = draw("price_table", { features_list: [{ item_text: "One" }] }, "edit");
  assert.ok(html.includes('data-edit="features_list.0.item_text"'));
  assert.ok(html.includes('data-edit="features_list.1.item_text"'),
    "one row more than there are, so the list can be added to by typing");
});

test("f6-money: splitPrice finds the pennies, and refuses to invent them", () => {
  assert.deepEqual(splitPrice("1,250.00", ","), { whole: "1,250", fraction: "00" });
  assert.deepEqual(splitPrice("1.250,00", ""), { whole: "1.250", fraction: "00" });
  assert.deepEqual(splitPrice("from 525", ","), { whole: "from 525", fraction: "" });
  assert.deepEqual(splitPrice("1,250", ","), { whole: "1,250", fraction: "" },
    "a thousands mark with three digits after it is not a fractional part");
  assert.deepEqual(featureRows({ features_list: "nonsense" }), []);
});

test("f6-money: a Price List draws a row per item with its price", () => {
  const html = draw("price_list", {
    price_list: [
      { title: "Mowing", price: "$65", item_description: "Weekly, April to October" },
      { title: "Aeration", price: "$180" },
    ],
  });
  for (const wanted of ["Mowing", "$65", "Weekly, April to October", "Aeration", "$180"]) {
    assert.ok(html.includes(wanted), `the page must show "${wanted}"`);
  }
  assert.ok(!html.includes("bx-slot"), "no empty editing slots in the customer's copy");
});

test("f6-money: a Price List never adds itself up", () => {
  // A menu is not a quote. The Totals widget and `documentTotals` are the one
  // place money is summed on this platform.
  const html = draw("price_list", { price_list: [{ title: "A", price: "100" }, { title: "B", price: "200" }] });
  assert.ok(!html.includes("300"), "a price list must not print a total");
  assert.ok(!/total/i.test(html), "and must not say the word either");
});

test("f6-money: a Price List reads both spellings of a row's picture and link", () => {
  assert.equal(rowImage({ image: { url: "https://x/y.png" } }), "https://x/y.png");
  assert.equal(rowImage({ image: "https://x/z.png" }), "https://x/z.png");
  assert.equal(rowLink({ link: { url: "https://x/a" } }), "https://x/a");
  assert.equal(rowLink({ link: "https://x/b" }), "https://x/b");
  assert.deepEqual(priceRows({ price_list: null }), []);
});

test("f6-money: a payment button draws the author's words and NO processor's name", () => {
  for (const kind of ["paypal_button", "stripe_button"]) {
    const html = draw(kind, { text: "Pay the deposit", product_price: "250" });
    assert.ok(html.includes("Pay the deposit"), kind);
    assert.ok(!/paypal/i.test(html), `${kind}: no processor name on the visitor's screen`);
    assert.ok(!/stripe/i.test(html), `${kind}: no processor name on the visitor's screen`);
  }
});

test("f6-money: neither payment button ships a processor's logo as its default", () => {
  for (const kind of ["paypal_button", "stripe_button"]) {
    const def = FAMILY.defs.find((d) => d.kind === kind);
    assert.equal(def.defaults.selected_icon, "",
      `${kind}: Elementor defaults this to the brand glyph; a processor's logo goes on a `
      + "business's page only if the business puts it there");
  }
});

test("f6-money: a payment button with no amount says so to the author, not to the visitor", () => {
  assert.match(payNote({ product_price: "" }), /will not take a payment/);
  assert.equal(payNote({ stripe_product_price: "250", stripe_quantity: 2 }), "250 × 2");
  assert.match(payNote({ donation_type: "any" }), /types the amount/);
  const seen = draw("paypal_button", { text: "Pay", product_price: "" }, "view");
  assert.ok(!/will not take a payment/.test(seen), "the note is for the author only");
});

/* ═══════════════════════════════════════════════════════════════════════════
   THE ARION EMITTERS — the literal widgetType, and keys the engine really has
   ═════════════════════════════════════════════════════════════════════════ */

test("f6-money: one emitter per def, publishing Elementor's own slug", () => {
  assert.deepEqual(Object.keys(EMITTERS).sort(),
    FAMILY.defs.map((d) => d.kind).sort(),
    "a def with no emitter is a widget that cannot be published");
  assert.deepEqual(
    Object.fromEntries(Object.entries(EMITTERS).map(([k, r]) => [k, r.widgetType])),
    {
      price_table: "price-table", price_list: "price-list",
      paypal_button: "paypal-button", stripe_button: "stripe-button",
    });
  for (const [kind, row] of Object.entries(EMITTERS)) {
    assert.equal(row.tier, "pro", kind);
    assert.equal(typeof row.settings, "function", kind);
    assert.equal(typeof row.fallback, "function",
      `${kind}: all four are Pro, so a site without Pro needs a real answer`);
  }
});

test("f6-money: every settings key each emitter produces exists on the widget", () => {
  const props = {
    price_table: {
      heading: "Seasonal plan", sub_heading: "Eight visits", heading_tag: "h3",
      currency_symbol: "custom", currency_symbol_custom: "CA$", price: "1250",
      currency_format: ",", sale: "yes", original_price: "1400", period: "per season",
      features_list: [{ item_text: "Spring clean-up" }],
      button_text: "Choose", link: { url: "https://example.test/plan" },
      footer_additional_info: "Prices hold for 30 days.",
      show_ribbon: "yes", ribbon_title: "Most chosen", ribbon_horizontal_position: "left",
      ribbon_bg_color: "#0C4A60", ribbon_text_color: "#FFFFFF",
      header_bg_color: "#F8FAFC", heading_color: "#0B1C24",
      pricing_element_bg_color: "#FFFFFF", price_color: "#0B1C24",
      features_list_bg_color: "#FFFFFF", features_list_color: "#334155",
      features_list_alignment: "center", footer_bg_color: "#F8FAFC",
      button_background_color: "#0C4A60", button_text_color: "#FFFFFF",
    },
    price_list: {
      price_list: [{ title: "Mowing", price: "$65", item_description: "Weekly", image: { url: "https://x/y.png" }, link: { url: "https://x/a" } }],
      title_tag: "h4", description_tag: "p", image_size_size: "medium",
      heading_color: "#0B1C24", price_color: "#0B1C24", description_color: "#475569",
      separator_style: "dotted", separator_color: "#E2E8F0", vertical_align: "center",
    },
    paypal_button: {
      email: "pay@example.test", type: "checkout", product_name: "Deposit",
      product_sku: "DEP-1", product_price: "250", donation_type: "fixed",
      donation_amount: "25", currency: "USD", billing_cycle: "months",
      auto_renewal: "yes", quantity: 2, shipping_price: 0, tax_type: "percentage",
      tax_rate: "8.25", text: "Pay the deposit", button_css_id: "pay1",
      redirect_after_success: { url: "https://example.test/thanks" },
      sandbox_mode: "no", open_in_new_window: "yes",
      error_message_global: "Something went wrong.",
      align: "center", background_color: "#0C4A60", button_text_color: "#FFFFFF",
    },
    stripe_button: {
      product_name: "Deposit", stripe_product_price: "250", stripe_currency: "USD",
      stripe_quantity: 2, donation_type: "fixed", donation_amount: "25",
      shipping_price: 0, tax_rate: "8.25", text: "Pay the deposit",
      button_css_id: "pay2", redirect_after_success: { url: "https://example.test/thanks" },
      sandbox_mode: "no", open_in_new_window: "yes",
      error_message_global: "Something went wrong.",
      align: "center", background_color: "#0C4A60", button_text_color: "#FFFFFF",
    },
  };
  for (const [kind, row] of Object.entries(EMITTERS)) {
    assertSettingsKeys(row.widgetType, row.settings(props[kind], {}), `f6-money/${kind}: `);
    // …and with NOTHING typed, which is what a freshly dropped widget is.
    assertSettingsKeys(row.widgetType, row.settings({}, {}), `f6-money/${kind} (empty): `);
  }
});

test("f6-money: the emitter refuses a value the page engine's control would ignore", () => {
  const s = EMITTERS.price_table.settings({ heading_tag: "marquee", currency_symbol: "doubloon" }, {});
  assert.equal(s.heading_tag, "h3", "not one of Elementor's h2…h6, so its own default");
  assert.equal(s.currency_symbol, "", "not one of Elementor's symbols, so none");
});

test("f6-money: a Pro-less site gets the real words, and a payment button refuses by name", () => {
  const table = EMITTERS.price_table.fallback(
    { heading: "Seasonal plan", price: "1250", features_list: [{ item_text: "Spring clean-up" }] }, { seed: "s" });
  const flat = JSON.stringify(table);
  assert.ok(flat.includes("Seasonal plan"), "the visitor reads the real offer either way");
  assert.ok(flat.includes("Spring clean-up"));
  assert.ok(!flat.includes("price-table"), "the fallback is built out of FREE widgets");
  assert.equal(EMITTERS.price_table.fallback({}, { seed: "s" }), null,
    "nothing typed is nothing to publish, not an empty box on a live page");

  assert.equal(EMITTERS.paypal_button.fallback({ text: "Pay" }, { seed: "s" }), null,
    "a button that looks like it takes a payment and does nothing is worse than a refusal");
  const paid = EMITTERS.stripe_button.fallback(
    { text: "Pay the deposit", redirect_after_success: { url: "https://example.test/pay" } }, { seed: "s" });
  assert.equal(paid.widgetType, "button");
  assert.equal(paid.settings.link.url, "https://example.test/pay");
});

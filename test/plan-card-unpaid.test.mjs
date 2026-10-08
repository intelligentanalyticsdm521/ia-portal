// Plan & Pricing: a product held by an UNPAID subscription (decision (d),
// billing-core fixer 2026-10-08). The billing API lists it as
// { status: 'unpaid', message, action: 'update_card' }. The card must say the
// payment failed, with Update card, and NEVER "Not subscribed" with
// "Add <PRODUCT> to your account": that button leads to a second Checkout.
import test from "node:test";
import assert from "node:assert/strict";
import { planCardLine, rowForProduct, planCardForViewer, unpaidSentence } from "../src/lib/productAccess.ts";

const API_SENTENCE = "Your last payment didn't go through, so SPARK is paused. Update your card to turn it back on.";
const unpaidRow = { product: "spark", tier: null, status: "unpaid", message: API_SENTENCE, action: "update_card", ended: null };

test("an unpaid row is the product's row, even beside an older ended record", () => {
  const ended = { product: "spark", status: "ended", ended: { at: "2026-09-01T00:00:00Z", tier: "standard" } };
  assert.equal(rowForProduct([ended, unpaidRow], "spark"), unpaidRow);
  assert.equal(rowForProduct([unpaidRow], "spark"), unpaidRow, "never null, which would read 'Not subscribed'");
});

test("the card says the payment failed, with Update card, never 'Add SPARK'", () => {
  const card = planCardLine("spark", rowForProduct([unpaidRow], "spark"));
  assert.equal(card.state, "past_due");
  assert.equal(card.line, API_SENTENCE);
  assert.deepEqual(card.control, { kind: "update_card", label: "Update card" });
  assert.equal(card.canRemove, false);
  assert.doesNotMatch(JSON.stringify(card), /Not subscribed|Add SPARK|Re-subscribe/);
});

test("without the API's sentence the card still says the payment failed", () => {
  const card = planCardLine("oliver", { product: "oliver", status: "unpaid" });
  assert.equal(card.line, unpaidSentence("oliver"));
  assert.equal(card.line, "Your last payment didn't go through, so OLIVER is paused. Update your card to turn it back on.");
  assert.equal(card.control?.kind, "update_card");
});

test("the API's own sentence is the one said, when it sends one", () => {
  const said = "Your last payment didn't go through, so SPARK is paused. Update your card to turn it back on before November 1, 2026.";
  assert.equal(planCardLine("spark", { ...unpaidRow, message: said }).line, said);
});

test("a team member reads the line and 'Ask an admin on your team to update the card.'", () => {
  const { card, note } = planCardForViewer("spark", planCardLine("spark", unpaidRow), "member");
  assert.equal(card.control, null);
  assert.equal(card.line, API_SENTENCE);
  assert.equal(note, "Ask an admin on your team to update the card.");
});

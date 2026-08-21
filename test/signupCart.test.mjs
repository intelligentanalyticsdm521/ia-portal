// test/signupCart.test.mjs — /pricing cart (lib/signupCart) + the signup
// session helper (lib/signupCheckout). Phase B3: STELLA is a platform.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  bundleDiscountPercent, readCart, writeCart, setCartItem, getCartItem, sessionProducts,
} from "../src/lib/signupCart.ts";

// Minimal sessionStorage so the cart helpers run outside a browser.
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
beforeEach(() => { globalThis.window = { sessionStorage: fakeStorage() }; });
afterEach(() => { delete globalThis.window; });

describe("bundleDiscountPercent — 5% on any 2+ platforms, STELLA counts", () => {
  test("empty / single platform → 0", () => {
    assert.equal(bundleDiscountPercent([]), 0);
    assert.equal(bundleDiscountPercent([{ product: "stella", plan: "standard" }]), 0);
  });
  test("STELLA + one other → 5", () => {
    assert.equal(bundleDiscountPercent([
      { product: "oliver", plan: "standard" }, { product: "stella", plan: "pro" },
    ]), 5);
  });
  test("four platforms → still 5 (MP7R retired)", () => {
    assert.equal(bundleDiscountPercent([
      { product: "arion", plan: "standard" }, { product: "oliver", plan: "lite" },
      { product: "spark", volume: "5k" }, { product: "stella", plan: "business" },
    ]), 5);
  });
  test("two rows of the same platform are one platform", () => {
    assert.equal(bundleDiscountPercent([
      { product: "stella", plan: "standard" }, { product: "stella", plan: "pro" },
    ]), 0);
  });
});

describe("readCart — accepts stella rows, drops unknown products", () => {
  test("stella survives a round trip", () => {
    writeCart([{ product: "stella", plan: "pro" }, { product: "oliver", plan: "standard" }]);
    assert.deepEqual(readCart(), [{ product: "stella", plan: "pro" }, { product: "oliver", plan: "standard" }]);
  });
  test("forge / argus / garbage rows are filtered out", () => {
    window.sessionStorage.setItem("iadm.signup.cart.v1", JSON.stringify([
      { product: "forge", plan: "x" }, { product: "stella", plan: "standard" }, null, { plan: "no-product" },
    ]));
    assert.deepEqual(readCart(), [{ product: "stella", plan: "standard" }]);
  });
  test("setCartItem replaces the row for the same platform", () => {
    setCartItem({ product: "stella", plan: "standard" });
    setCartItem({ product: "stella", plan: "business" });
    assert.deepEqual(readCart(), [{ product: "stella", plan: "business" }]);
    assert.deepEqual(getCartItem("stella"), { product: "stella", plan: "business" });
  });
});

describe("sessionProducts — every platform a signup session covers", () => {
  const base = { email: "a@b.c", product: "arion", plan: "standard", billing_cycle: "monthly", status: "paid", tenant_id: null };
  test("single-product session → [product]", () => {
    assert.deepEqual(sessionProducts(base), ["arion"]);
  });
  test("cart_products as CSV is honoured (first product stays first)", () => {
    assert.deepEqual(sessionProducts({ ...base, cart_products: "arion, stella" }), ["arion", "stella"]);
  });
  test("cart_products as array is honoured and de-duplicated", () => {
    assert.deepEqual(sessionProducts({ ...base, cart_products: ["STELLA", "arion"] }), ["arion", "stella"]);
  });
  test("empty / null cart_products falls back to product", () => {
    assert.deepEqual(sessionProducts({ ...base, cart_products: null }), ["arion"]);
    assert.deepEqual(sessionProducts({ ...base, cart_products: "" }), ["arion"]);
  });
});

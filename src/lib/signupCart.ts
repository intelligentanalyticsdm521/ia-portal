// lib/signupCart.ts — multi-product cart for /pricing (F-108).
//
// The cart lives in sessionStorage (not localStorage) so it's per-tab and
// auto-expires when the browser closes — there's no concept of "remembering
// your cart for tomorrow" before checkout, and we don't want stale carts
// surfacing weeks later.
//
// Each cart item is the FULL configured purchase for one platform (product
// + tier/volume/seo/etc.) — not just the platform key. The cart is the
// payload we ship to /signup/checkout-cart on the backend.

export type CartProduct = "oliver" | "spark" | "arion" | "stella";
const CART_PRODUCTS: readonly string[] = ["oliver", "spark", "arion", "stella"];

export interface OliverItem {
  product: "oliver";
  plan: string;                 // lite | standard | pro | business
}
/** STELLA — self-serve from 2026-08-22 (Phase B3). One base plan, no add-ons. */
export interface StellaItem {
  product: "stella";
  plan: string;                 // standard | pro | business
}
export interface SparkItem {
  product: "spark";
  volume: string;               // "5k", "10k", …
  featureAddon?: "" | "pro" | "business";
  leads?: "" | "essentials" | "growth" | "authority";
  leadsSelected?: number;
}
export interface ArionItem {
  product: "arion";
  plan: string;                 // lite | essentials | growth | authority
  seo?: "" | "starter" | "essentials" | "growth" | "authority";
}
export type CartItem = OliverItem | SparkItem | ArionItem | StellaItem;

const STORAGE_KEY = "iadm.signup.cart.v1";
const CYCLE_KEY   = "iadm.signup.cart.cycle.v1";
const EMAIL_KEY   = "iadm.signup.cart.email.v1";
const NAME_KEY    = "iadm.signup.cart.name.v1";

/** Read the cart. Returns [] when sessionStorage is empty or unparseable. */
export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((it) => it && typeof it.product === "string"
      && CART_PRODUCTS.includes(it.product));
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function clearCart(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(CYCLE_KEY);
  // Keep email/name across cart resets — the user doesn't want to retype.
}

/** Set/replace the item for a given product. One row per platform; calling
 *  this twice for the same product replaces the earlier configuration. */
export function setCartItem(item: CartItem): CartItem[] {
  const curr = readCart().filter((it) => it.product !== item.product);
  const next = [...curr, item];
  writeCart(next);
  return next;
}

/** Remove all items for a product. */
export function removeCartItem(product: CartProduct): CartItem[] {
  const next = readCart().filter((it) => it.product !== product);
  writeCart(next);
  return next;
}

export function getCartItem<T extends CartProduct>(product: T): Extract<CartItem, { product: T }> | null {
  const hit = readCart().find((it) => it.product === product);
  return (hit as Extract<CartItem, { product: T }>) || null;
}

/** Persisted billing cycle for the cart (so it survives State 1 ↔ State 2). */
export function readCycle(): "monthly" | "annual" {
  if (typeof window === "undefined") return "monthly";
  return window.sessionStorage.getItem(CYCLE_KEY) === "annual" ? "annual" : "monthly";
}
export function writeCycle(cycle: "monthly" | "annual"): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CYCLE_KEY, cycle);
}

/** Persisted email + name (mirrors a typical Stripe Checkout customer
 *  block). Same key across all visits so a retry doesn't lose the email. */
export function readBuyer(): { email: string; name: string } {
  if (typeof window === "undefined") return { email: "", name: "" };
  return {
    email: window.sessionStorage.getItem(EMAIL_KEY) || "",
    name:  window.sessionStorage.getItem(NAME_KEY)  || "",
  };
}
export function writeBuyer(b: { email?: string; name?: string }): void {
  if (typeof window === "undefined") return;
  if (typeof b.email === "string") window.sessionStorage.setItem(EMAIL_KEY, b.email);
  if (typeof b.name  === "string") window.sessionStorage.setItem(NAME_KEY,  b.name);
}

/** Bundle discount preview — matches the server-side logic in
 *  /signup/checkout-cart: 5% (MP5R) on any 2+ distinct platforms (ARION,
 *  OLIVER, SPARK and STELLA each count as one). The 7% three-platform tier
 *  (MP7R) was retired 2026-08-21 — one bundle rule. */
export function bundleDiscountPercent(items: CartItem[]): number {
  const distinct = new Set(items.map((it) => it.product));
  return distinct.size >= 2 ? 5 : 0;
}

/** Every platform a paid signup session covers (oliver-api /signup/session:
 *  `product` = the cart's first platform, `cart_products` = all of them as
 *  CSV or array when exposed) — lower-cased, de-duplicated, first product
 *  first. Lets the post-checkout pages show a step for each product bought
 *  in one cart (e.g. ARION + STELLA) instead of only the first. */
export function sessionProducts(s: { product: string; cart_products?: string | string[] | null }): string[] {
  const raw = Array.isArray(s.cart_products)
    ? s.cart_products
    : String(s.cart_products || "").split(",");
  const out: string[] = [];
  for (const p of [s.product, ...raw]) {
    const k = String(p || "").trim().toLowerCase();
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

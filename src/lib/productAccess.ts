// lib/productAccess.ts — when a product is OFF, what the owner reads and which
// one control sits beside it.
//
// SCOPE_ACCESS_FOLLOWS_SUBSCRIPTION_2026-10-07 §4.2 and §5. Access now follows
// the subscription: when the paid period ends, oliver-api's sync switches the
// product's core.tenant_services row off and every API refuses. The Portal's
// half is to say so in ONE sentence, with Re-subscribe right there, instead of
// a page of red API errors.
//
// Pure on purpose: no React, no fetch, no import.meta.env, so node --test can
// read every sentence and every state (test/product-access-follows-subscription.test.mjs).
//
// THE RULE THAT DECIDES "OFF" (SEAM-3-B). Only a DECIDED `owned: false` from
// platform-api /me/entitlements closes a product's pages. An answer we could
// not get, or one platform-api itself marks undecided, leaves everything open:
// "we don't know" must never lock a paying business out.

import type { EntitlementPayload } from './entitlements';
import { planDisplayName } from './tierLabels';

export type GatedProduct = 'oliver' | 'spark' | 'arion' | 'stella';

/** The four self-serve products the sync switches on and off (oliver-api
 *  lib/productTier.js SELF_SERVE_PRODUCTS). FORGE, ARGUS and My Brand are not
 *  touched by this build, so they are not gated here either. */
export const OFF_GATED_PRODUCTS: readonly GatedProduct[] = ['oliver', 'spark', 'arion', 'stella'];

export const PRODUCT_NAME: Record<GatedProduct, string> = {
  oliver: 'OLIVER',
  spark: 'SPARK',
  arion: 'ARION',
  stella: 'STELLA',
};

export function isOffGatedProduct(p: string | null | undefined): p is GatedProduct {
  return !!p && (OFF_GATED_PRODUCTS as readonly string[]).includes(String(p).toLowerCase());
}

/**
 * True ONLY when platform-api decided the business does not own the product.
 * Undecided, missing, or a product this build does not gate → false (open).
 */
export function productSwitchedOff(payload: EntitlementPayload | null | undefined, product: string | null | undefined): boolean {
  if (!isOffGatedProduct(product)) return false;
  if (!payload || payload.decided === false) return false;
  const node = payload.products?.[String(product).toLowerCase()];
  if (!node || node.decided !== true) return false;
  return node.owned === false;
}

/**
 * The rail's padlock. The entitlement payload when it is decided (so a
 * mid-session switch-off shows within a minute), otherwise the products the
 * business held at sign-in (AppState.ownedProducts), which is what the rail
 * showed before this build. `null` = neither can say (dev / preview has no
 * sign-in list): the caller keeps its own older fallback.
 */
export function productLockedOnRail(
  payload: EntitlementPayload | null | undefined,
  ownedProducts: ReadonlySet<string>,
  product: string,
): boolean | null {
  const key = String(product || '').toLowerCase();
  const node = payload?.products?.[key];
  if (isOffGatedProduct(key) && payload && payload.decided !== false && node && node.decided === true && typeof node.owned === 'boolean') {
    return !node.owned;
  }
  if (ownedProducts.size === 0) return null;
  return !ownedProducts.has(key);
}

/** Where "Add <PRODUCT>" and a Re-subscribe that cannot open a checkout go. */
export function planPagePath(product: string): string {
  const key = String(product || '').toLowerCase();
  if (key === 'oliver' || key === 'spark' || key === 'arion') return `/app/services/${key}_usage`;
  // STELLA has no self-serve plan page; Plan & Pricing is where its card lives.
  return '/app/settings/plan-pricing';
}

/** A product's own plan page stays open when the product is off — it is
 *  where the owner buys it back. */
export function gateExemptServiceKey(serviceKey: string | null | undefined): boolean {
  const k = String(serviceKey || '').toLowerCase();
  return OFF_GATED_PRODUCTS.some((p) => k === `${p}_usage`);
}

/** "November 1, 2026". `timeZone` is for tests; the screen uses the viewer's own. */
export function formatLongDate(iso: string | null | undefined, timeZone?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', ...(timeZone ? { timeZone } : {}) });
}

/* ══════════════════════════════════════════════════════════════════════════
   The sentences (Brandon, 7 October 2026)
   ══════════════════════════════════════════════════════════════════════════ */

export function endedSentence(product: GatedProduct, endedAt: string | null | undefined, timeZone?: string): string {
  const name = PRODUCT_NAME[product];
  const date = formatLongDate(endedAt, timeZone);
  return date
    ? `Your ${name} subscription ended on ${date}. Re-subscribe to pick up where you left off.`
    : `Your ${name} subscription has ended. Re-subscribe to pick up where you left off.`;
}

export function neverBoughtSentence(product: GatedProduct): string {
  return `${PRODUCT_NAME[product]} isn't part of your plan yet.`;
}

export const ASK_AN_ADMIN_RESUBSCRIBE = 'Ask an admin on your team to re-subscribe.';
export const SWITCH_TO_OWN_BUSINESS = 'Switch to your own business to change billing.';

/** Who is looking: a business admin, a team member without billing rights,
 *  or the founder viewing a client's business. */
export type Viewer = 'admin' | 'member' | 'viewing_client';

export interface OffNotice {
  sentence: string;
  /** The one control. null when this viewer cannot act — the line below says why. */
  action: { kind: 'resubscribe' | 'add'; label: string } | null;
  /** Said in place of the control, never as a disabled button. */
  note: string | null;
}

/**
 * What the product's pages show instead of themselves.
 * `ended` = the latest switch-off the billing API reported (§5 `ended`), or
 * null when the product was never bought (or the date is not known).
 */
export function offNotice(product: GatedProduct, ended: { at: string | null } | null, viewer: Viewer, timeZone?: string): OffNotice {
  const name = PRODUCT_NAME[product];
  const sentence = ended ? endedSentence(product, ended.at, timeZone) : neverBoughtSentence(product);
  if (viewer === 'viewing_client') return { sentence, action: null, note: SWITCH_TO_OWN_BUSINESS };
  if (viewer === 'member') {
    return { sentence, action: null, note: ended ? ASK_AN_ADMIN_RESUBSCRIBE : `Ask an admin on your team to add ${name}.` };
  }
  return { sentence, action: ended ? { kind: 'resubscribe', label: 'Re-subscribe' } : { kind: 'add', label: `Add ${name}` }, note: null };
}

/* ══════════════════════════════════════════════════════════════════════════
   Plan & Pricing: one line under each card's tier (§5)
   ══════════════════════════════════════════════════════════════════════════ */

/** The per-product row of GET /billing/subscriptions, as §5 shapes it. */
export interface PlanRow {
  product: string;
  tier?: string | null;
  status?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  next_change?: { kind: 'tier' | 'ends'; to_tier?: string | null; at?: string | null } | null;
  ended?: { at: string | null; tier?: string | null } | null;
  /** 'entitlement' = the product is on in our records with no paid
   *  subscription behind it (set up by IA, or comped). Nothing to remove. */
  source?: string | null;
}

/** Stripe statuses that still count as paid for (§1.3). */
export const LIVE_STATUSES = ['active', 'trialing', 'past_due'] as const;

export function rowIsLive(row: PlanRow | null | undefined): boolean {
  if (!row) return false;
  // A row from before this build carries no status; it was listed because it
  // was active, so it still reads as live.
  if (!row.status) return !row.ended;
  return (LIVE_STATUSES as readonly string[]).includes(String(row.status).toLowerCase());
}

/** The row for one product: a live one first, else the ended one. */
export function rowForProduct(rows: PlanRow[] | null | undefined, product: string): PlanRow | null {
  const mine = (rows || []).filter((r) => String(r.product || '').toLowerCase() === String(product).toLowerCase());
  return mine.find(rowIsLive) || mine.find((r) => !!r.ended) || null;
}

export type CardState = 'active' | 'downgrade' | 'ending' | 'past_due' | 'ended' | 'never';

export interface CardLine {
  state: CardState;
  /** The sentence under the tier. null = nothing to add (active, no renewal date known). */
  line: string | null;
  control: { kind: 'keep' | 'update_card' | 'resubscribe' | 'add'; label: string } | null;
  /** True when "Remove <PRODUCT>" belongs on this card. */
  canRemove: boolean;
}

export function planCardLine(product: GatedProduct, row: PlanRow | null, timeZone?: string): CardLine {
  const name = PRODUCT_NAME[product];
  if (!row) return { state: 'never', line: 'Not subscribed', control: { kind: 'add', label: `Add ${name} to your account` }, canRemove: false };

  const live = rowIsLive(row);
  if (!live && row.ended) {
    return { state: 'ended', line: endedSentence(product, row.ended.at, timeZone), control: { kind: 'resubscribe', label: 'Re-subscribe' }, canRemove: false };
  }
  if (!live) return { state: 'never', line: 'Not subscribed', control: { kind: 'add', label: `Add ${name} to your account` }, canRemove: false };

  if (String(row.status || '').toLowerCase() === 'past_due') {
    return {
      state: 'past_due',
      line: "Your last payment didn't go through. Update your card to keep your plan.",
      control: { kind: 'update_card', label: 'Update card' },
      canRemove: false,
    };
  }

  // On in our records, with no paid subscription behind it: there is no
  // renewal to show and nothing for Remove to end.
  if (row.source === 'entitlement') return { state: 'active', line: null, control: null, canRemove: false };

  const current = planDisplayName(product, row.tier || null);
  const nc = row.next_change || null;
  const endsAt = nc?.at || row.current_period_end || null;
  if ((nc && nc.kind === 'ends') || row.cancel_at_period_end) {
    const date = formatLongDate(endsAt, timeZone);
    return {
      state: 'ending',
      line: date ? `${current} until ${date}, then it ends` : `${current} until the end of this billing period, then it ends`,
      control: { kind: 'keep', label: `Keep ${name}` },
      canRemove: false,
    };
  }
  if (nc && nc.kind === 'tier' && nc.to_tier) {
    const date = formatLongDate(endsAt, timeZone);
    const next = planDisplayName(product, nc.to_tier).replace(new RegExp(`^${name}\\s*`), '');
    return {
      state: 'downgrade',
      line: date ? `${current} until ${date}, then ${next}` : `${current} until the end of this billing period, then ${next}`,
      control: { kind: 'keep', label: 'Keep my plan' },
      canRemove: true,
    };
  }
  const renews = formatLongDate(row.current_period_end, timeZone);
  return { state: 'active', line: renews ? `Renews ${renews}` : null, control: null, canRemove: true };
}

/** The confirm shown beside "Remove <PRODUCT>" before anything is sent. */
export function removeConfirmSentence(product: GatedProduct, periodEnd: string | null | undefined, timeZone?: string): string {
  const name = PRODUCT_NAME[product];
  const date = formatLongDate(periodEnd, timeZone);
  return date
    ? `${name} stays on until ${date}, then it ends. Your other products are not changed.`
    : `${name} stays on until the end of this billing period, then it ends. Your other products are not changed.`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Errors from the billing API, as sentences
   ══════════════════════════════════════════════════════════════════════════ */

const CODE_ONLY = /^[a-z0-9_.:-]+$/i;

/** The sentence inside a billing API refusal, never a machine code. */
export function billingRefusalSentence(body: unknown, status: number): string {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const candidates: unknown[] = [b.message, b.details];
  const err = b.error;
  if (err && typeof err === 'object') candidates.push((err as Record<string, unknown>).message);
  else candidates.push(err);
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() && !CODE_ONLY.test(c.trim())) return c.trim();
  }
  if (status === 401 || status === 403) return 'You do not have permission to change billing for this business. Ask an admin on your team.';
  return 'That did not go through. Nothing was changed. Try again in a minute.';
}

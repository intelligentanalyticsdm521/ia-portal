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
 * The entitlement answer only counts for the business it was asked about.
 * When the founder switches business, the previous business's answer must
 * never judge the new one while the new answer is on its way: a mismatch is
 * "not known yet" (open), never the other business's "off".
 */
export function payloadForTenant(
  held: { tenantId: string | null; payload: EntitlementPayload | null } | null | undefined,
  activeTenantId: string | null | undefined,
): EntitlementPayload | null {
  if (!held || !held.payload || !held.tenantId || !activeTenantId) return null;
  return String(held.tenantId).toLowerCase() === String(activeTenantId).toLowerCase() ? held.payload : null;
}

/**
 * True when the page at `pathname` is itself replaced by the off notice for
 * `product` (a product page other than its plan page, or one of SPARK's own
 * routes other than its pricing page). The menu banner then stays quiet, so
 * one screen says the sentence once.
 */
export function offNoticeShownByPage(pathname: string | null | undefined, product: string | null | undefined): boolean {
  if (!isOffGatedProduct(product)) return false;
  const path = String(pathname || '');
  const m = path.match(/^\/app\/services\/([^/?#]+)/);
  if (m) {
    const key = decodeURIComponent(m[1]).toLowerCase();
    return key.split('_')[0] === product && !gateExemptServiceKey(key);
  }
  if (product === 'spark') return /^\/app\/spark\/(?!pricing(?:[/?#]|$))[^/?#]+/.test(path);
  return false;
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

/** "November 1, 2026". Billing dates are the billing period's boundaries,
 *  which the billing API words in UTC ("SPARK stays on until November 1,
 *  2026"). The screen uses the SAME zone, so a card line and the sentence
 *  beside it never name two different days for one moment. */
export const BILLING_TIME_ZONE = 'UTC';
export function formatLongDate(iso: string | null | undefined, timeZone: string = BILLING_TIME_ZONE): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone });
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
export const ASK_AN_ADMIN_UPDATE_CARD = 'Ask an admin on your team to update the card.';
export const SWITCH_TO_OWN_BUSINESS = 'Switch to your own business to change billing.';

/** Who is looking: a business admin, a team member without billing rights,
 *  or the founder viewing a client's business. */
export type Viewer = 'admin' | 'member' | 'viewing_client';

export interface OffNotice {
  sentence: string;
  /** The one control. null when this viewer cannot act — the line below says why. */
  action: { kind: 'resubscribe' | 'add' | 'update_card'; label: string } | null;
  /** Said in place of the control, never as a disabled button. */
  note: string | null;
}

/**
 * What the product's pages (ProductGate) and its menu (SubNav) show instead of
 * themselves. `why` = offReasonForRow(product, its billing row): the SAME
 * reading the Plan & Pricing card makes, so a product a subscription still
 * holds says what that state is here too, never "isn't part of your plan yet"
 * with "Add" (decision (d)). null = not known, read as never bought.
 */
export function offNotice(product: GatedProduct, why: OffReason | null, viewer: Viewer, timeZone?: string): OffNotice {
  const name = PRODUCT_NAME[product];
  if (why?.kind === 'held') {
    const sentence = why.sentence;
    // No control: an incomplete first payment and a paused subscription have
    // no screen of ours that fixes them, so the sentence stands alone and the
    // team member is not told to ask an admin for something nobody can do.
    if (why.action !== 'update_card') return { sentence, action: null, note: null };
    if (viewer === 'viewing_client') return { sentence, action: null, note: SWITCH_TO_OWN_BUSINESS };
    if (viewer === 'member') return { sentence, action: null, note: ASK_AN_ADMIN_UPDATE_CARD };
    return { sentence, action: { kind: 'update_card', label: 'Update card' }, note: null };
  }
  const ended = why?.kind === 'ended' ? why : null;
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
  /** The API's own sentence for this row (every held-but-not-paid status
   *  carries one: unpaid, incomplete, paused). */
  message?: string | null;
  /** The one control the API says exists for this row: 'update_card' on an
   *  unpaid row, absent on incomplete and paused (nothing of ours finishes a
   *  first payment or resumes a paused subscription). */
  action?: string | null;
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

/**
 * HELD BUT NOT PAID. A subscription that still holds the product although it
 * is not being paid for, in the order oliver-api answers them
 * (lib/billingCartChange.js HELD_NOT_PAID, and the order
 * GET /billing/subscriptions lists them in, so the card and the refusal always
 * name the same subscription):
 *   unpaid      Stripe gave up retrying the card; the open invoice is there.
 *   incomplete  the FIRST payment still needs a step from the owner.
 *   paused      pause_collection is set (by hand, in the Stripe dashboard).
 * None of the three is "Not subscribed" and none offers "Add <PRODUCT>": a
 * second Checkout would bill the business twice (decision (d), 2026-10-08).
 */
export const HELD_NOT_PAID_STATUSES = ['unpaid', 'incomplete', 'paused'] as const;
export type HeldStatus = typeof HELD_NOT_PAID_STATUSES[number];

export function rowHeldStatus(row: PlanRow | null | undefined): HeldStatus | null {
  const s = String(row?.status || '').toLowerCase();
  return (HELD_NOT_PAID_STATUSES as readonly string[]).includes(s) ? (s as HeldStatus) : null;
}

export function rowIsHeldNotPaid(row: PlanRow | null | undefined): boolean {
  return rowHeldStatus(row) !== null;
}

/** UNPAID alone (the only held state whose badge is the red "Payment failed"). */
export function rowIsUnpaid(row: PlanRow | null | undefined): boolean {
  return rowHeldStatus(row) === 'unpaid';
}

/** The row for one product: a live one first, else a held one, else the ended one. */
export function rowForProduct(rows: PlanRow[] | null | undefined, product: string): PlanRow | null {
  const mine = (rows || []).filter((r) => String(r.product || '').toLowerCase() === String(product).toLowerCase());
  const liveRow = mine.find(rowIsLive);
  if (liveRow) return liveRow;
  // In HELD_NOT_PAID order, so two held subscriptions over one product read
  // the way oliver-api's refusal reads them.
  for (const status of HELD_NOT_PAID_STATUSES) {
    const held = mine.find((r) => rowHeldStatus(r) === status);
    if (held) return held;
  }
  return mine.find((r) => !!r.ended) || null;
}

/** What a held product's card says when the API sent no sentence of its own
 *  (an older oliver-api, or a row we could not read). The API's own wording
 *  always wins; these exist only so the screen is never wordless. */
export const unpaidSentence = (product: GatedProduct): string =>
  `Your last payment didn't go through, so ${PRODUCT_NAME[product]} is paused. Update your card to turn it back on.`;
export const incompleteSentence = (product: GatedProduct): string =>
  `Your first payment for ${PRODUCT_NAME[product]} hasn't gone through yet, so ${PRODUCT_NAME[product]} is switched off. Check your email from us to finish it.`;
export const pausedSentence = (product: GatedProduct): string =>
  `${PRODUCT_NAME[product]} is paused, so it's switched off. Contact us and we'll turn it back on.`;
export function heldSentence(product: GatedProduct, status: HeldStatus): string {
  if (status === 'incomplete') return incompleteSentence(product);
  if (status === 'paused') return pausedSentence(product);
  return unpaidSentence(product);
}

/** The one control a held state offers. Only a failed payment has a screen of
 *  ours that fixes it: nothing we own finishes a first payment or resumes a
 *  paused subscription, so those offer no button rather than one that lies. */
export function heldAction(status: HeldStatus, apiAction?: string | null): 'update_card' | null {
  const said = String(apiAction || '').toLowerCase();
  if (said === 'update_card') return 'update_card';
  if (said) return null;                             // the API named a control we have no screen for
  return status === 'unpaid' ? 'update_card' : null; // an older API sent no action at all

}

/** Why a product is not live, read from its billing row (rowForProduct). */
export type OffReason =
  | { kind: 'held'; status: HeldStatus; sentence: string; action: 'update_card' | null }
  | { kind: 'ended'; at: string | null }
  | { kind: 'never' };

/**
 * THE one reading of a product's billing row when it is not live. The Plan &
 * Pricing card (planCardLine), the off notice on the product's pages and menu
 * (offNotice) and the rail's badge (railLockWords via offReasons) all take
 * their words from here, so the three can never disagree:
 *   held    a subscription still holds the product and is not being paid for
 *           (unpaid, incomplete or paused). The API's sentence, else
 *           heldSentence; the API's control, else heldAction.
 *   ended   a switch-off on record, with its date.
 *   never   no row, or nothing that says it was ever bought.
 */
export function offReasonForRow(product: GatedProduct, row: PlanRow | null | undefined): OffReason {
  const status = rowHeldStatus(row);
  if (row && status) {
    return {
      kind: 'held',
      status,
      sentence: (row.message && String(row.message).trim()) || heldSentence(product, status),
      action: heldAction(status, row.action),
    };
  }
  if (row && !rowIsLive(row) && row.ended) return { kind: 'ended', at: row.ended.at ?? null };
  return { kind: 'never' };
}

// 'past_due' = a payment that failed (a live past-due subscription, or an
// UNPAID one Stripe stopped retrying). 'payment_incomplete' and 'paused' are
// the other two held-but-not-paid states: the product is still there, so
// neither is 'never' and neither offers Add.
export type CardState = 'active' | 'downgrade' | 'ending' | 'past_due' | 'payment_incomplete' | 'paused' | 'ended' | 'never';

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

  if (!rowIsLive(row)) {
    const why = offReasonForRow(product, row);
    if (why.kind === 'held') {
      return {
        state: why.status === 'incomplete' ? 'payment_incomplete' : why.status === 'paused' ? 'paused' : 'past_due',
        line: why.sentence,
        control: why.action === 'update_card' ? { kind: 'update_card', label: 'Update card' } : null,
        canRemove: false,
      };
    }
    if (why.kind === 'ended') {
      return { state: 'ended', line: endedSentence(product, why.at, timeZone), control: { kind: 'resubscribe', label: 'Re-subscribe' }, canRemove: false };
    }
    return { state: 'never', line: 'Not subscribed', control: { kind: 'add', label: `Add ${name} to your account` }, canRemove: false };
  }

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
    // Same tier, fewer items (a SPARK volume cut, an ARION add-on removed):
    // naming the tier again would say nothing changes when something does.
    const sameTier = String(nc.to_tier).toLowerCase() === String(row.tier || '').toLowerCase();
    const next = sameTier
      ? 'a smaller plan'
      : planDisplayName(product, nc.to_tier).replace(new RegExp(`^${name}\\s*`), '');
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

/**
 * The card as THIS viewer sees it. A team member who is not an admin, and the
 * founder viewing a client's business, read the same line with no control at
 * all, and one sentence saying why: never a button that only exists to say no.
 */
export function planCardForViewer(product: GatedProduct, card: CardLine, viewer: Viewer): { card: CardLine; note: string | null } {
  if (viewer === 'admin') return { card, note: null };
  const acts = !!card.control || card.canRemove;
  const bare: CardLine = { ...card, control: null, canRemove: false };
  if (!acts) return { card: bare, note: null };
  if (viewer === 'viewing_client') return { card: bare, note: SWITCH_TO_OWN_BUSINESS };
  const name = PRODUCT_NAME[product];
  const note = card.state === 'ended' ? ASK_AN_ADMIN_RESUBSCRIBE
    : card.state === 'never' ? `Ask an admin on your team to add ${name}.`
    : card.state === 'past_due' ? ASK_AN_ADMIN_UPDATE_CARD
    // payment_incomplete and paused have no control at all (see planCardLine),
    // so they never reach here: nothing to ask an admin for.
    : `Ask an admin on your team to change ${name}'s plan.`;
  return { card: bare, note };
}

/** STELLA has no plan page of its own, so its card offers the plans itself.
 *  Each opens the checkout, which shows the price before they pay. */
export const STELLA_PLAN_CHOICES: ReadonlyArray<{ plan: 'standard' | 'pro' | 'business'; label: string }> = [
  { plan: 'standard', label: 'STELLA Standard' },
  { plan: 'pro', label: 'STELLA Pro' },
  { plan: 'business', label: 'STELLA Business' },
];
export const STELLA_PICK_SENTENCE = "Choose a STELLA plan. You'll see the price before you pay.";

/** What Re-subscribe says when it cannot open a checkout (no url). */
export function resubscribeFallbackSentence(product: GatedProduct, message: string | null | undefined): string {
  return (message && message.trim()) || `Choose a ${PRODUCT_NAME[product]} plan to pick up where you left off.`;
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

/* ══════════════════════════════════════════════════════════════════════════
   The rail: the badge and the tooltip of a locked product
   ══════════════════════════════════════════════════════════════════════════ */

/** The same words the product's off notice uses (offReasonForRow): a product
 *  a subscription still HOLDS says which state that is (and how to fix it,
 *  where we can), an ENDED one says it ended (and how to get it back); only a
 *  product never bought says ADD. */
export function railLockWords(product: string, tagline: string, label: string, why: OffReason | null): { badge: string; title: string } {
  const kind = why?.kind ?? 'never';
  const status = why?.kind === 'held' ? why.status : 'unpaid';
  if (isOffGatedProduct(product)) {
    const name = PRODUCT_NAME[product];
    if (kind === 'held') {
      if (status === 'incomplete') return { badge: 'PENDING', title: `Your first payment for ${name} hasn't gone through yet. Open ${name} to see what to do.` };
      if (status === 'paused') return { badge: 'PAUSED', title: `${name} is paused. Open ${name} to see what to do.` };
      return { badge: 'PAUSED', title: `Your last payment didn't go through, so ${name} is paused. Open ${name} to update your card.` };
    }
    if (kind === 'ended') return { badge: 'ENDED', title: `Your ${name} subscription ended. Open ${name} to re-subscribe.` };
  }
  return { badge: 'ADD', title: `${tagline} is not part of your plan — add ${tagline} to enable ${label}` };
}

/** Why each off-gated product is not live, from GET /billing/subscriptions
 *  rows: only 'held' and 'ended' are listed (a product not listed reads as
 *  never bought). The rail's words come from here, so the badge of a product
 *  whose first payment is unfinished is not the one for a failed payment. */
export function offReasons(rows: PlanRow[] | null | undefined): Map<string, OffReason> {
  const out = new Map<string, OffReason>();
  for (const p of OFF_GATED_PRODUCTS) {
    const row = rowForProduct(rows, p);
    if (!row || rowIsLive(row)) continue;
    const why = offReasonForRow(p, row);
    if (why.kind !== 'never') out.set(p, why);
  }
  return out;
}

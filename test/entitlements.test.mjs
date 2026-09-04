// src/lib/entitlements.ts — the browser's half of the one entitlement answer.
//
// Two things are pinned here and both were real bugs:
//
//  1. SEAM-3-B. The browser used to be told, in useProductTier's own header,
//     to "treat null tier as 'Lite' — i.e. lock business/pro-tier cards". That
//     is the WRONG half of the rule: not knowing must never lock a paying
//     customer out. Every case in the shared fixture is run below against the
//     Portal's copy, and the fixture is byte-identical in five repos.
//
//  2. The ladder. src/lib/tierRank.ts used to DEFINE RANK, hand-copied from
//     LUMEN. It re-exports now, and the test asserts the numbers still match
//     the fixture — so the browser cannot rank tiers differently from the API
//     that will answer the request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RANK, rankOf, tierMeets, mayUseFeature, maySpend,
  productOf, addonOf, tierOf, featureMinTier,
  fetchEntitlements, clearEntitlementCache,
} from '../src/lib/entitlements.ts';
import { RANK as RANK_FROM_TIERRANK, tierMeets as tierMeetsFromTierRank } from '../src/lib/tierRank.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASES = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'entitlement-rule-cases.json'), 'utf8'));

/* ── SEAM-3-B ─────────────────────────────────────────────────────────────── */

test('every SEAM-3-B case in the shared fixture answers the same here as in every API', () => {
  for (const c of CASES.cases) {
    assert.equal(mayUseFeature(c.entry, c.min_tier), c.feature, `FEATURE — ${c.why}`);
    assert.equal(maySpend(c.entry, c.min_tier), c.spend, `SPEND — ${c.why}`);
  }
});

test('the fixture still contains both halves of the rule, so it cannot be gutted', () => {
  const undecided = CASES.cases.filter((c) => c.entry && c.entry.decided === false);
  assert.ok(undecided.length >= 4);
  assert.ok(undecided.every((c) => c.feature === true), 'every undecided case must ALLOW the feature');
  assert.ok(undecided.every((c) => c.spend === false), 'every undecided case must REFUSE the spend');
  assert.ok(CASES.cases.filter((c) => c.entry?.decided === true && c.feature === false).length >= 3);
});

/* ── the ladder is no longer the Portal's own ─────────────────────────────── */

test('tierRank re-exports the one ladder rather than defining a second one', () => {
  assert.deepEqual({ ...RANK }, CASES.rank);
  assert.deepEqual({ ...RANK_FROM_TIERRANK }, CASES.rank);
  assert.equal(RANK_FROM_TIERRANK, RANK, 'the SAME object, so they cannot be edited apart');
  assert.equal(tierMeetsFromTierRank, tierMeets);
  assert.equal(RANK.active, RANK.standard,
    "'paid but the product name carried no tier' must never lock a paying customer out");
});

test('tierRank.ts no longer contains a table of numbers', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'tierRank.ts'), 'utf8');
  const code = src.split('\n')
    .filter((l) => { const x = l.trim(); return !(x.startsWith('//') || x.startsWith('*') || x.startsWith('/*')); })
    .join('\n');
  assert.doesNotMatch(code, /pro:\s*3/, 'the copied ladder is gone');
  assert.doesNotMatch(code, /const RANK/, 'and it is not being redefined under another guise');
  assert.match(code, /export \{ RANK, rankOf, tierMeets \} from '\.\/entitlements'/);
});

test('the hook reads platform-api, never Stripe and never oliver-api', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'hooks', 'useProductTier.ts'), 'utf8');
  const code = src.split('\n')
    .filter((l) => { const x = l.trim(); return !(x.startsWith('//') || x.startsWith('*') || x.startsWith('/*')); })
    .join('\n');
  assert.doesNotMatch(code, /fetchSubscriptions/, 'the per-mount oliver-api call is gone');
  assert.doesNotMatch(code, /billingApi/);
  assert.match(code, /fetchEntitlements/);
  assert.match(code, /VITE_PLATFORM_API_BASE_URL/);
});

/* ── payload readers ──────────────────────────────────────────────────────── */

const payload = {
  tenant_id: 't', resolved_at: '2026-09-06T00:00:00.000Z', decided: true,
  rank: CASES.rank,
  feature_min_tier: { sms: { minTier: 'pro', product: 'spark' } },
  products: {
    spark: { owned: true, tier: 'pro', decided: true },
    arion: { owned: false, tier: null, decided: true },
    oliver: { owned: true, tier: 'standard', decided: false },
  },
  addons: { responder: { active: true, decided: true } },
  limits: {},
};

test('tierOf returns a decided tier and null for anything else', () => {
  assert.equal(tierOf(payload, 'spark'), 'pro');
  assert.equal(tierOf(payload, 'SPARK'), 'pro', 'case does not matter');
  assert.equal(tierOf(payload, 'arion'), null, 'resolved to no tier');
  assert.equal(tierOf(payload, 'oliver'), null, 'UNDECIDED is not a tier, even when one is present');
  assert.equal(tierOf(payload, 'stella'), null, 'a product not in the payload');
  assert.equal(tierOf(null, 'spark'), null);
});

test('an undecided product still allows its features — that is the incident, fixed', () => {
  assert.equal(mayUseFeature(productOf(payload, 'oliver'), 'business'), true);
  assert.equal(maySpend(productOf(payload, 'oliver'), 'business'), false);
  assert.equal(mayUseFeature(productOf(payload, 'spark'), 'business'), false,
    'a DECIDED Pro against a Business floor is a real no');
  assert.equal(mayUseFeature(addonOf(payload, 'responder')), true);
  assert.equal(mayUseFeature(addonOf(payload, 'phone_line')), true, 'absent = undecided = allow');
});

test('the feature minimums come from the payload, not from a local table', () => {
  assert.deepEqual(featureMinTier(payload, 'sms'), { minTier: 'pro', product: 'spark' });
  assert.equal(featureMinTier(payload, 'nothing_declared'), null);
  assert.equal(featureMinTier(null, 'sms'), null);
});

test('rankOf/tierMeets treat an unknown or absent tier as rank 0', () => {
  assert.equal(rankOf(null), 0);
  assert.equal(rankOf('nonsense'), 0);
  assert.equal(rankOf('PRO'), RANK.pro);
  assert.ok(tierMeets('business', 'pro'));
  assert.ok(!tierMeets(null, 'lite'));
});

/* ── the fetch ────────────────────────────────────────────────────────────── */

function fetchReturning(body, { ok = true, status = 200 } = {}) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    return { ok, status, json: async () => body };
  };
  impl.calls = calls;
  return impl;
}

test('one GET, the bearer token, the tenant header, and a stripped trailing slash', async () => {
  clearEntitlementCache();
  const impl = fetchReturning(payload);
  await fetchEntitlements({ baseUrl: 'https://api.test/', token: 'tok', tenantId: 'T1', fetchImpl: impl });
  assert.equal(impl.calls.length, 1);
  assert.equal(impl.calls[0].url, 'https://api.test/me/entitlements');
  assert.equal(impl.calls[0].opts.headers.Authorization, 'Bearer tok');
  assert.equal(impl.calls[0].opts.headers['x-tenant-key'], 'T1');
  clearEntitlementCache();
});

test('several hooks mounting at once share ONE request, and a decided answer is cached', async () => {
  clearEntitlementCache();
  const impl = fetchReturning(payload);
  const [a, b] = await Promise.all([
    fetchEntitlements({ baseUrl: 'https://api.test', token: 'tok', tenantId: 'T1', fetchImpl: impl }),
    fetchEntitlements({ baseUrl: 'https://api.test', token: 'tok', tenantId: 'T1', fetchImpl: impl }),
  ]);
  assert.equal(impl.calls.length, 1, 'N hooks per page must not become N requests — that was the old shape');
  assert.equal(a, b);
  await fetchEntitlements({ baseUrl: 'https://api.test', token: 'tok', tenantId: 'T1', fetchImpl: impl });
  assert.equal(impl.calls.length, 1, 'and the minute of cache holds');
  clearEntitlementCache();
});

test('an UNDECIDED payload is never cached', async () => {
  clearEntitlementCache();
  const impl = fetchReturning({ ...payload, decided: false });
  await fetchEntitlements({ baseUrl: 'https://api.test', token: 'tok', tenantId: 'T2', fetchImpl: impl });
  await fetchEntitlements({ baseUrl: 'https://api.test', token: 'tok', tenantId: 'T2', fetchImpl: impl });
  assert.equal(impl.calls.length, 2);
  clearEntitlementCache();
});

test('a missing base url, a non-200 and a thrown fetch all yield null, and null allows', async () => {
  clearEntitlementCache();
  const impl = fetchReturning(payload);
  assert.equal(await fetchEntitlements({ baseUrl: '', token: 'tok', tenantId: 'T3', fetchImpl: impl }), null);
  assert.equal(impl.calls.length, 0);
  assert.equal(await fetchEntitlements({
    baseUrl: 'https://api.test', token: 'tok', tenantId: 'T3', fetchImpl: fetchReturning(null, { ok: false, status: 500 }),
  }), null);
  clearEntitlementCache();
  assert.equal(await fetchEntitlements({
    baseUrl: 'https://api.test', token: 'tok', tenantId: 'T3',
    fetchImpl: async () => { throw new Error('offline'); },
  }), null);
  assert.equal(mayUseFeature(productOf(null, 'spark'), 'business'), true);
  clearEntitlementCache();
});

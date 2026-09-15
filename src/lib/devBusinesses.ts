/**
 * devBusinesses.ts — the fixture businesses the DEV business picker offers, and
 * the pure rule that decides which one the `x-dev-tenant` seam is pointed at.
 *
 * WHY THIS EXISTS
 * ---------------
 * Switching the dev stack from the agency business to a client business meant
 * editing `VITE_DEV_TENANT` in `Portal/.env.local` and restarting Vite. That is a
 * two-minute round trip for a thing that is asked for on every second walk step,
 * and an edited `.env.local` is the file nobody remembers to put back.
 *
 * ONE MECHANISM, NOT TWO
 * ----------------------
 * The choice itself is NOT stored here. It goes where the founder business
 * picker already puts it — `lib/actAsSession.ts`, the per-tab key
 * `iadm.portal.actAsTenantId.v1` that AppGate reads first when it resolves the
 * active business. This module only supplies:
 *
 *   · the list of fixtures the dev picker may offer, and their kind
 *   · the founder-tenant refusal
 *   · `resolveDevTenantId()`, the precedence the header injection follows
 *
 * So there is exactly one answer to "which business is this dev stack in",
 * whichever picker set it, and AppGate's resolution order is untouched.
 *
 * PURE ON PURPOSE. No React, no storage, no `import.meta.env`, no imports, so
 * `node --test` can exercise the rules directly (scripts/test-ts-loader.mjs —
 * anything reading `import.meta.env` is a component concern covered by tsc).
 * The founder tenant id is a PARAMETER for the same reason, and it lets the test
 * prove the refusal with an id of its own choosing.
 */

/** Agency = it runs the platform or other businesses. Client = it buys from one. */
export type DevBusinessKind = 'agency' | 'client';

export interface DevBusiness {
  /** Lower-case GUID, exactly as the backend dev-auth allow-lists spell it. */
  tenantId: string;
  /** `core.tenants.name` on the dev database, so the picker reads like the app. */
  name: string;
  kind: DevBusinessKind;
  /** One line of "what is this fixture for", shown under the name. */
  note: string;
}

/**
 * The walk fixtures. Every id here is on the DEFAULT_TEST_TENANTS allow-list of
 * all four backends (platform-api/lib/devAuth.js, arion-api/lib/devAuth.js,
 * oliver-api/lib/devAuth.js, LUMEN-API/src/middleware/devAuth.js) — an id that
 * is not on those lists answers 401 on the first Portal call, so adding one here
 * without adding it there is not a picker entry, it is a broken Portal.
 *
 * `kind` is the ROLE the fixture plays in a walk, not a copy of
 * `core.tenants.tenant_kind`: the POC fixture is the agency stand-in for
 * Intelligent Analytics (the production founder tenant is hard-blocked in every
 * dev seam and must stay blocked) and its row is still `tenant_kind = 'direct'`
 * on the dev database. The picker says what it is FOR.
 *
 * `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee` is allow-listed too and is deliberately
 * NOT here: it is the isolation-test tenant, it has no business row to speak of,
 * and picking it in the Portal shows an empty shell.
 */
export const DEV_BUSINESSES: readonly DevBusiness[] = Object.freeze([
  {
    tenantId: '1a1a1a1a-0000-4000-8000-00000001a1a1',
    name: 'Intelligent Analytics (POC fixture)',
    kind: 'agency',
    note: 'The agency stand-in for IA — ARGUS agents, quotes, dunning, win-back',
  },
  {
    tenantId: '0a6e0c00-0000-4000-8000-00000000a6e0',
    name: 'The Software Company',
    kind: 'agency',
    note: 'Fixture agency — its dev user is the super user',
  },
  {
    tenantId: 'a0000001-0000-0000-0000-000000000001',
    name: 'Summit Lawn & Landscape',
    kind: 'client',
    note: 'Business tier — ARION + SPARK + OLIVER, the default dev pin',
  },
  {
    tenantId: 'b0000002-0000-0000-0000-000000000002',
    name: 'Bluebird Dental',
    kind: 'client',
    note: 'Standard tier — OLIVER + SPARK',
  },
  {
    tenantId: 'c0000003-0000-0000-0000-000000000003',
    name: 'Harbor Point Coffee',
    kind: 'client',
    note: 'Lite tier — the thin end of every gate',
  },
  {
    tenantId: 'd0000004-0000-0000-0000-000000000004',
    name: 'Redbird Insurance',
    kind: 'client',
    note: 'SPARK only — the business with no ARION or OLIVER history',
  },
]);

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/**
 * The businesses the picker may OFFER. The founder tenant is never one of them:
 * the shared CIAM directory means its GUID is every JWT's `tid`, so every
 * backend dev seam refuses it outright and a dev box that could select it could
 * authenticate as the real business. The picker must not even show the door.
 */
export function devBusinessOptions(founderTenantId: string): DevBusiness[] {
  const founder = norm(founderTenantId);
  return DEV_BUSINESSES.filter((b) => norm(b.tenantId) !== founder);
}

/** The fixture with this id, or null. Case-insensitive; never throws. */
export function findDevBusiness(tenantId: string | null | undefined): DevBusiness | null {
  const id = norm(tenantId);
  if (!id) return null;
  return DEV_BUSINESSES.find((b) => norm(b.tenantId) === id) || null;
}

/**
 * Is this a business the dev seam may be pointed at? A well-formed GUID that is
 * NOT the founder tenant.
 *
 * Deliberately wider than `DEV_BUSINESSES`: the founder picker writes the same
 * per-tab key for any business in `core.tenants`, and the header must follow
 * whatever is in it rather than silently ignoring an unfamiliar id and reading a
 * different business's data than the app is showing. The backends re-check every
 * id against their own allow-list — this is the ask, not the grant.
 */
export function isSelectableDevBusiness(
  tenantId: string | null | undefined,
  founderTenantId: string,
): boolean {
  const id = norm(tenantId);
  if (!id || !GUID_RE.test(id)) return false;
  return id !== norm(founderTenantId);
}

/** Everything `resolveDevTenantId()` needs, read out of the browser by the caller. */
export interface DevTenantInputs {
  /** A LIVE emergency act-as target (the caller has already checked expiry). */
  emergencyTarget?: string | null;
  /** `lib/actAsSession.ts` — the business THIS TAB was switched to, by either picker. */
  actAsTenantId?: string | null;
  /** AppState's persisted active business. */
  activeTenantId?: string | null;
  /** `VITE_DEV_TENANT` — the last word, and the only one before the pickers. */
  envPin: string;
}

/**
 * WHICH BUSINESS THE `x-dev-tenant` HEADER NAMES. The whole precedence, pure, so
 * it can be proven without a browser — `lib/devAuth.ts` reads the values out of
 * storage and calls this.
 *
 *   1. a live emergency act-as target — a time-boxed session already in flight
 *   2. the per-tab business pick (lib/actAsSession.ts), from either picker
 *   3. AppState's persisted active business
 *   4. the `VITE_DEV_TENANT` env pin
 *
 * Step 2 is above step 3 because AppGate rewrites `activeTenantId` on every
 * bootstrap and, for a super user, DELETES it first — so a choice read only from
 * there does not survive the reload that applies it. That is the same fault the
 * per-tab key was introduced to fix on 2026-09-14 (lib/actAsSession.ts); this
 * makes the dev seam honour it too, so in dev the header switches business when
 * the app does instead of a page load later.
 *
 * The founder tenant is never returned from steps 1-3. The env pin is trusted
 * blindly, exactly as before — and the backends refuse it anyway.
 */
export function resolveDevTenantId(
  inputs: DevTenantInputs,
  founderTenantId: string,
): string {
  const founder = norm(founderTenantId);

  const emergency = norm(inputs.emergencyTarget);
  if (emergency && emergency !== founder) return emergency;

  const actAs = norm(inputs.actAsTenantId);
  if (isSelectableDevBusiness(actAs, founderTenantId)) return actAs;

  const active = norm(inputs.activeTenantId);
  if (active && active !== founder) return active;

  return inputs.envPin;
}

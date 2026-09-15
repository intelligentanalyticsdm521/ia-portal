/**
 * actAsSession.ts — the ONE name for "the business this tab is acting as".
 *
 * AppGate has always resolved a super user's active business in this order:
 *
 *     per-tab session pin  ->  home business  ->  first membership
 *
 * and its own comment says "pins live in sessionStorage (per-tab, ephemeral) ...
 * explicit per-tab swap via super-user picker still works". It did not. AppGate
 * read `iadm.portal.actAsTenantId.v1` and NOTHING ever wrote it, so the key was
 * always absent and the resolver always fell through to the home business.
 *
 * FounderTenantPicker.handleSelect calls /select-tenant, sets AppState, and then
 * hard-navigates to /app/overview on purpose (so no page cache fetched under the
 * old business is shown under the new one). That navigation re-runs AppGate,
 * which deletes the long-term localStorage pin for a super user — correct, it is
 * what stopped a stale pin sticking a founder in a client business across days —
 * and then picks the home business. So the pick was undone by the picker's own
 * navigation, every time, for every business except the one that happened to BE
 * the founder's home.
 *
 * Measured on the dev stack 2026-09-14: acting as the agency fixture and picking
 * "Intelligent Analytics (POC fixture)" produced select-tenant(POC) 200,
 * a reload, then select-tenant(agency) — back where it started. Picking Bluebird
 * Dental "worked" only because the dev seam resolves that business to a user
 * whose home it already is. It is step one of the ARGUS demo walk, and it is the
 * whole point of a business picker.
 *
 * Per-tab and ephemeral by design: a new tab, or a new browser session, is back
 * in your own business.
 */
export const ACT_AS_SESSION_KEY = 'iadm.portal.actAsTenantId.v1';

/** The business this tab is acting as, or null. Never throws. */
export function getActAsTenantId(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const v = (sessionStorage.getItem(ACT_AS_SESSION_KEY) || '').trim();
    return v || null;
  } catch {
    return null;
  }
}

/** Remember an EXPLICIT pick for this tab. Pass null to go back to your own. */
export function setActAsTenantId(tenantId: string | null): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (tenantId) sessionStorage.setItem(ACT_AS_SESSION_KEY, tenantId);
    else sessionStorage.removeItem(ACT_AS_SESSION_KEY);
  } catch {
    /* storage denied — the pick just does not survive the navigation */
  }
}

// lib/founderTenant.ts — the ONE place in the Portal that knows the founder
// tenant's id.
//
// SEAMS AUDIT §4 / §0 item 9. The literal `8c9527b9-…` was pasted into runtime
// source in six repos. Its damage line is one sentence: **nobody can change
// the founder tenant, ever** — and migration 138's `tenant_kind` model exists
// precisely so a SECOND agency can run this platform.
//
// In the Portal it was in two files: `src/lib/currentPlan.ts` (which tenant
// gets founder plan defaults) and `src/lib/devAuth.ts` (which tenant the dev
// seam refuses). Both import from here now, and
// `src/lib/__tests__/founderTenant.test.ts` fails on any other hit in `src/`.
//
// ── WHY A BUILD-TIME ENV VAR AND NOT AN API READ ──────────────────────────
// The backends read `FOUNDER_TENANT_ID` from their App Service settings at
// runtime. A browser bundle has no runtime environment, so the equivalent is
// Vite's build-time `VITE_` namespace — the same mechanism
// `VITE_PLATFORM_API_BASE_URL` already uses, and the reason seams pack 4a left
// that one name alone: renaming a `VITE_` variable needs an Azure DevOps
// variable-group change on the deploy pipeline, which a builder must not make.
// Adding a NEW optional one changes nothing until somebody sets it.
//
// ── WHY THE LITERAL IS STILL THE DEFAULT ──────────────────────────────────
// `FOUNDER_TENANT_ID` is not set in production app settings on the backends,
// and `VITE_FOUNDER_TENANT_ID` is set nowhere. The default is what runs.
// Removing it would not force the config to be right; it would break the
// founder's own plan page on the next deploy.

/** The documented default: Intelligent Analytics, the platform owner today. */
export const FOUNDER_TENANT_ID_DEFAULT = '8c9527b9-8999-4b31-a306-f3d4ccc39fbd';

/** The founder / platform-owner tenant, lower-cased for comparison. */
export function founderTenantId(): string {
  const configured = String(import.meta.env.VITE_FOUNDER_TENANT_ID || '').trim();
  return (configured || FOUNDER_TENANT_ID_DEFAULT).toLowerCase();
}

/** Case-insensitive comparison. Empty and null are never the founder. */
export function isFounderTenantId(tenantId: string | null | undefined): boolean {
  if (!tenantId) return false;
  return String(tenantId).trim().toLowerCase() === founderTenantId();
}

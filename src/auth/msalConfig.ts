/**
 * Auth configuration exports.
 *
 * IMPORTANT: The actual MSAL Configuration object is built inside pca.ts —
 * that is the single source of truth. A duplicate Configuration export used
 * to live here and caused a dual-PCA-instance bug in production that threw
 * hash_empty_error intermittently. DO NOT reintroduce a Configuration export.
 * Only helpers and scope lists live here.
 */

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const authScopes = parseCsv(import.meta.env.VITE_AUTH_SCOPES);

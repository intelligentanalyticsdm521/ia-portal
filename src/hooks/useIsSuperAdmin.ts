/**
 * useIsSuperAdmin — Platform-level admin check.
 *
 * Returns `true` if the signed-in user is a platform administrator (founder,
 * IADM staff). Used to gate the gear icon on the IconRail (which routes to
 * /admin, the platform admin page).
 *
 * Resolution order:
 *   1. `active.roles` contains "super_admin" or "platform_admin" (preferred —
 *      set on the tenant_user record server-side).
 *   2. User email is in the VITE_SUPER_ADMIN_EMAILS allow-list (env-backed
 *      fallback for bootstrapping the founder before a real role exists).
 *
 * Returns `false` while bootstrap is loading so we don't briefly flash the
 * gear icon to non-admins.
 */
import { useMemo } from 'react';
import { useAppState } from '../app/AppState';
import { useAccessToken } from '../auth/useAccessToken';

function envAllowList(): Set<string> {
  const raw = (import.meta.env.VITE_SUPER_ADMIN_EMAILS as string | undefined) || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function useIsSuperAdmin(): boolean {
  const { active } = useAppState();
  const { activeAccount } = useAccessToken();

  return useMemo(() => {
    // Role-based path (preferred long-term).
    const roles = (active?.roles || []).map((r) => String(r).toLowerCase());
    if (roles.includes('super_admin') || roles.includes('platform_admin')) {
      return true;
    }

    // Env-backed allow-list (bootstrap fallback for the founder).
    const email = (activeAccount?.username || '').trim().toLowerCase();
    if (!email) return false;
    return envAllowList().has(email);
  }, [active, activeAccount]);
}

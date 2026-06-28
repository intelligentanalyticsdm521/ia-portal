/**
 * useIsFounder — Founder flag from bootstrap.
 *
 * Per the role-access-model rule: Brandon is Founder, not super-admin. UI
 * checks that need to know "is this the founder?" must use isFounder, NOT
 * useIsSuperAdmin. useIsSuperAdmin gates the platform-admin gear icon and
 * checks tenant-user roles + env allow-list; it returns false for Brandon
 * by design because he has no super_admin role.
 *
 * The backend stamps user.isFounder=true on the bootstrap payload for the
 * founder + IA staff with founder grants. AppShell reads the same flag for
 * SubNav gating.
 *
 * Returns false while bootstrap is loading.
 */
import { useAppState } from '../app/AppState';

export function useIsFounder(): boolean {
  const appState = useAppState();
  return !!appState.bootstrap?.user?.isFounder;
}

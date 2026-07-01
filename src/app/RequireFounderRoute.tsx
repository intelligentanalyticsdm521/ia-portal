/**
 * RequireFounderRoute — route guard for founder-only sections.
 *
 * Used by the /app/admin/consulting/* routes (relocated 2026-06-29).
 * Renders the child route via <Outlet/> when isFounder; otherwise sends
 * the user to /app/overview (clients have no equivalent admin surface).
 *
 * Reads the same isFounder flag that drives the SubNav filter in AppShell —
 * see hooks/useIsFounder.ts and AppShell.tsx (effectiveIsFounder).
 *
 * Also respects the view-as-tenant route prefix (/c/:tid) — while a founder
 * is acting as a client, founder-only routes are hidden too. This mirrors
 * the existing AppShell logic so /admin/* doesn't leak through during a
 * view-as session.
 */
import { Navigate, Outlet } from 'react-router-dom';
import { useIsFounder } from '../hooks/useIsFounder';

// Set by ConsultantWorkspaceEntry on /c/:tid entry; cleared by
// ConsultantModeBanner on exit. Reading the flag (vs URL regex) catches
// view-as state for the whole tab session — not just the /c/:tid landing.
const WORKSPACE_FLAG_KEY = 'iadm.portal.consultantWorkspace.v1';

function isConsultantWorkspace(): boolean {
  try { return sessionStorage.getItem(WORKSPACE_FLAG_KEY) === 'true'; }
  catch { return false; }
}

export function RequireFounderRoute() {
  const isFounder = useIsFounder();
  const actingAsClient = isConsultantWorkspace();
  const effectiveIsFounder = isFounder && !actingAsClient;

  if (!effectiveIsFounder) {
    // Non-founders (and founders acting-as-client) get bounced to overview.
    // Old /app/services/consulting_* paths 404 separately at the router level
    // — this guard only fires once a user lands on /app/admin/consulting/*.
    return <Navigate to="/app/overview" replace />;
  }

  return <Outlet />;
}

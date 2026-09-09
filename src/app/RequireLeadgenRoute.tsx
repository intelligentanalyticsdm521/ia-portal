/**
 * RequireLeadgenRoute — route guard for the Lead Gen SEARCH surfaces.
 *
 * The sibling of RequireFounderRoute, and it exists because Lead Gen stopped
 * being a founder-only surface (SPARK pack 1): the gate is now an allow-list on
 * the server, so the answer comes from GET /api/v1/leadgen/access rather than
 * from the bootstrap payload.
 *
 * WHY IT RENDERS NOTHING WHILE THE ANSWER IS IN FLIGHT, instead of bouncing.
 * Bouncing on an unresolved answer would throw somebody off a page they are
 * allowed to be on every time they arrive by deep link, before the fetch lands.
 * A blank moment and then the page is the honest version of "we are checking".
 *
 * /app/admin/leadgen (the founder's Lead Gen ADMIN — the term-review queue, the
 * block list, the Hunter balance) is NOT this guard's business and keeps
 * RequireFounderRoute: it is internal tooling, not a client surface.
 */
import { Navigate, Outlet } from 'react-router-dom';
import { useLeadgenAccess } from '../hooks/useLeadgenAccess';

export function RequireLeadgenRoute() {
  const { allowed } = useLeadgenAccess();

  // Unresolved: hold the frame. LUMEN refuses the routes anyway, so nothing is
  // reachable during this moment except the shell.
  if (allowed === null) return null;

  if (!allowed) return <Navigate to="/app/overview" replace />;

  return <Outlet />;
}

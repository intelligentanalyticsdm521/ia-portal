/**
 * LegacyForgeRedirect — keeps the old flat FORGE URLs working.
 *
 * FORGE screens moved from /app/services/forge_<screen> to
 * /app/services/forge/<software>/<screen> so the line can host many builds.
 * Those flat URLs were live only briefly, but a bookmark or an emailed link
 * that dead-ends is a support call, and the mapping costs one lookup table.
 *
 * Anything not in the table falls through to the normal service router, so
 * this cannot swallow a genuine service key.
 */
import { Navigate, useParams } from 'react-router-dom';
import { ServiceRouter } from '../ServiceRouter';
import { LEGACY_FORGE_ROUTES } from './forgeSoftware';

export function LegacyForgeRedirect({ withId = false }: { withId?: boolean }) {
  const params = useParams();
  const key = String(params.serviceKey ?? params.legacyForgeKey ?? '');
  const target = LEGACY_FORGE_ROUTES[key];

  if (!target) return <ServiceRouter />;
  const id = withId ? params.id : undefined;
  return <Navigate to={id ? `${target}/${id}` : target} replace />;
}

export default LegacyForgeRedirect;

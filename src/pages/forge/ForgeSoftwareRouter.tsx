/**
 * ForgeSoftwareRouter — everything under /app/services/forge/:software/*.
 *
 * One route handles every screen of every FORGE build. The build's own entry
 * in forgeSoftware.ts says which screens exist; this maps them to components
 * and enforces the entitlement.
 *
 * The entitlement check is the whole reason this is a real component rather
 * than a pile of <Route>s: FORGE holds software written for individual
 * clients, so rendering one to a tenant that does not own it is a disclosure,
 * not a cosmetic slip. The API refuses too — it gates on the same
 * `forge_<slug>` key — but a page that renders and then sits empty looks like
 * a bug rather than a boundary, which is exactly what the IA tenant saw.
 */
import { Navigate, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { ForgeEntityPage } from './ForgeEntityPage';
import { ForgeOverviewPage } from './ForgeOverviewPage';
import { ForgeAttentionPage } from './ForgeAttentionPage';
import { ForgeReceiptsPage } from './ForgeReceiptsPage';
import { ForgeReportsPage } from './ForgeReportsPage';
import { ForgeSetupPage } from './ForgeSetupPage';
import { ForgePage } from './ForgePage';
import { Card, ForgeLayout } from './ForgeLayout';
import { softwareBySlug, softwareRoot, visibleScreens } from './forgeSoftware';

export function ForgeSoftwareRouter() {
  const params = useParams();
  const { ownedProducts } = useAppState();

  const slug = String(params.software ?? '');
  const software = softwareBySlug(slug);

  // Unknown build — send them to the FORGE landing page rather than a 404 the
  // user can do nothing with.
  if (!software) return <Navigate to="/app/services/forge_overview" replace />;

  // `ownedProducts` is empty until bootstrap resolves; refusing then would
  // flash the not-available card on every hard reload.
  const settled = ownedProducts.size > 0;
  if (settled && !ownedProducts.has(software.serviceKey)) {
    return (
      <ForgePage>
        <ForgeLayout
          title={`${software.name} is not part of your plan`}
          subtitle="This is bespoke software built for another organization."
        >
          <Card>
            <p className="text-sm text-slate-600">
              FORGE builds are commissioned by a single organization and are only
              available to that organization. If you think you should have access
              to {software.name}, contact your account manager.
            </p>
          </Card>
        </ForgeLayout>
      </ForgePage>
    );
  }

  // The rest of the path after /forge/:software/ — screen, then optional id.
  const rest = (params['*'] ?? '').split('/').filter(Boolean);
  const [screenPath = '', maybeId] = rest;

  // A record is shown in a MODAL over its list, not on a page of its own —
  // the pattern every other product here uses. Old /<screen>/<id> links
  // (and anything already shared) redirect into that, so there is exactly
  // one record view and nothing that was sent out stops working.
  const visible = visibleScreens(software);
  if (maybeId && visible.some((s) => s.path === screenPath)) {
    return <Navigate to={`${softwareRoot(slug)}/${screenPath}?record=${encodeURIComponent(maybeId)}`} replace />;
  }

  const screen = visible.find((s) => s.path === screenPath);
  if (!screen) return <Navigate to={softwareRoot(slug)} replace />;

  const body = (() => {
    switch (screen.kind) {
      case 'overview': return <ForgeOverviewPage />;
      case 'attention': return <ForgeAttentionPage />;
      case 'reports': return <ForgeReportsPage />;
      case 'receipts': return <ForgeReceiptsPage />;
      case 'setup': return <ForgeSetupPage />;
      /* KEYED BY ENTITY, so moving between screens REMOUNTS the list instead of
         reusing one instance. Without the key, React reconciled Clients and
         Providers into the same component and none of its state was cleared:
         the previous screen's rows kept rendering under the new screen's
         heading and headers, and because those stale <tr>s all keyed on a
         primary key the new entity does not have, React saw duplicate keys and
         orphaned them into the DOM for good — every nav click stacking another
         screen's rows. Search, sort, filters and the page number leaked the
         same way; the rows were only the visible part. */
      case 'entity': return screen.entity ? <ForgeEntityPage key={screen.entity} entity={screen.entity} /> : null;
      default: return null;
    }
  })();

  if (!body) return <Navigate to={softwareRoot(slug)} replace />;
  return <ForgePage>{body}</ForgePage>;
}

export default ForgeSoftwareRouter;

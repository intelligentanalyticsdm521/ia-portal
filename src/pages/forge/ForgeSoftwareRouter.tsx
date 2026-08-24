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
import { ForgeReceiptsPage } from './ForgeReceiptsPage';
import { ForgeReportsPage } from './ForgeReportsPage';
import { ForgeSetupPage } from './ForgeSetupPage';
import { ForgeClientDetailPage } from './ForgeClientDetailPage';
import { ForgeDonationDetailPage } from './ForgeDonationDetailPage';
import { ForgePersonDetailPage } from './ForgePersonDetailPage';
import { ForgePage } from './ForgePage';
import { Card, ForgeLayout } from './ForgeLayout';
import { softwareBySlug, softwareRoot, visibleScreens } from './forgeSoftware';

/** Screens that take a record id: /forge/hestia/clients/42 */
const DETAIL_PAGES: Record<string, () => JSX.Element> = {
  clients: () => <ForgeClientDetailPage />,
  people: () => <ForgePersonDetailPage />,
  donations: () => <ForgeDonationDetailPage />,
};

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

  // Detail pages first: /clients/42 is the clients screen with an id. Gated on
  // the same visibility as the list — otherwise an unreleased screen stays
  // reachable through its detail URL.
  const visible = visibleScreens(software);
  if (maybeId && DETAIL_PAGES[screenPath] && visible.some((s) => s.path === screenPath)) {
    return <ForgePage>{DETAIL_PAGES[screenPath]()}</ForgePage>;
  }

  // visibleScreens, not screens: an unreleased screen must not be reachable
  // by URL either, or the flag only hides the nav link.
  const screen = visible.find((s) => s.path === screenPath);
  if (!screen) return <Navigate to={softwareRoot(slug)} replace />;

  const body = (() => {
    switch (screen.kind) {
      case 'overview': return <ForgeOverviewPage />;
      case 'reports': return <ForgeReportsPage />;
      case 'receipts': return <ForgeReceiptsPage />;
      case 'setup': return <ForgeSetupPage />;
      case 'entity': return screen.entity ? <ForgeEntityPage entity={screen.entity} /> : null;
      default: return null;
    }
  })();

  if (!body) return <Navigate to={softwareRoot(slug)} replace />;
  return <ForgePage>{body}</ForgePage>;
}

export default ForgeSoftwareRouter;

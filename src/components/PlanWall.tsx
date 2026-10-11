// PlanWall — the plan half of "by their subscription" for ONE page.
//
// ServiceRouter carried this inline, so a page mounted on its own route
// (App.tsx /app/spark/contact-scoring) skipped it: a Standard SPARK business
// opened Contact Scoring (Business, matrix 3) by URL. Every page, wherever it
// is mounted, goes through this one wall.
//
// 2026-10-11 (feature catalog): the wall reads platform-api's catalog answer
// for the page's key (features[key] on /me/entitlements, through the shared
// one-minute cache) — the same entry the menu's lock reads and the same entry
// the APIs refuse on. A decided allowed:false, or a feature cut from the
// product (availability "hidden"), shows the "Not in your plan" card with the
// catalog's `needs` ("SPARK Business"). Undecided ALLOWS: a page view is a
// read, and a paying business is never locked out by a hiccup.
import { useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { featureContext, planWallLocks, requirementLabel } from './navVisibility';
import { useProductAccess } from '../hooks/useProductAccess';
import { gateExemptServiceKey } from '../lib/productAccess';
import FeatureLocked from './FeatureLocked';
import { productColor, productOfServiceKey } from '../config/productTheme';
import { SERVICE_CATALOG } from '../config/serviceCatalog';

export function PlanWall({ serviceKey, children }: { serviceKey: string | null | undefined; children: ReactNode }) {
  const product = productOfServiceKey(serviceKey);
  const { pathname } = useLocation();
  const { payload } = useProductAccess(pathname);
  const service = useMemo(
    () => SERVICE_CATALOG.find((s) => s.key === serviceKey) ?? null,
    [serviceKey],
  );
  const ctx = featureContext(payload);
  const locked = !!serviceKey && planWallLocks(serviceKey, ctx, gateExemptServiceKey(serviceKey));

  if (!locked || !service) return <>{children}</>;
  return (
    <FeatureLocked
      name={service.displayName}
      description={service.description}
      requiredPlan={requirementLabel(serviceKey, ctx)}
      accent={productColor(product)}
    >
      {children}
    </FeatureLocked>
  );
}

export default PlanWall;

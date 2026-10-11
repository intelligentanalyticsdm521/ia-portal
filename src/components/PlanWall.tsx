// PlanWall — the tier half of "by their subscription" for ONE page.
//
// ServiceRouter carried this inline, so a page mounted on its own route
// (App.tsx /app/spark/contact-scoring) skipped it: a Standard SPARK business
// opened Contact Scoring (Business, matrix 3) by URL. Every page, wherever it
// is mounted, now goes through the same wall the menu uses
// (navVisibility.isRoutable + SubNav SERVICE_VISIBILITY), so the menu, the
// catalog route and a dedicated route can never judge a plan differently.
//
// Undecided (null tier / null add-ons) ALLOWS: only a positively-resolved
// lower tier or missing add-on shows the "Not in your plan" card.
import { useMemo, type ReactNode } from 'react';
import { SERVICE_VISIBILITY } from './SubNav';
import { isGatedProduct, isRoutable, requirementLabel, wallProductOfServiceKey } from './navVisibility';
import { useNavAddons } from '../hooks/useNavAddons';
import { useProductTier } from '../hooks/useProductTier';
import FeatureLocked from './FeatureLocked';
import { productColor, productOfServiceKey } from '../config/productTheme';
import { SERVICE_CATALOG } from '../config/serviceCatalog';

export function PlanWall({ serviceKey, children }: { serviceKey: string | null | undefined; children: ReactNode }) {
  const product = productOfServiceKey(serviceKey);
  // The wall judges a page where its MENU row lives: my_brand_* pages are in
  // ARION's menu, so they are judged as ARION pages (on the My Brand tier).
  const wallProduct = wallProductOfServiceKey(serviceKey);
  const gatingActive = isGatedProduct(wallProduct);
  // Hooks run unconditionally; non-gated products resolve but are never applied.
  const { tier } = useProductTier(gatingActive ? wallProduct : 'spark');
  const { tier: myBrandTier } = useProductTier('my_brand');
  const { addons, seoAddonTier } = useNavAddons(gatingActive ? wallProduct : undefined);
  const service = useMemo(
    () => SERVICE_CATALOG.find((s) => s.key === serviceKey) ?? null,
    [serviceKey],
  );
  const rules = serviceKey ? SERVICE_VISIBILITY[serviceKey] : undefined;
  const locked = !isRoutable(rules, { tier, addons, seoAddonTier, gatingActive, myBrandTier });

  if (!locked || !service) return <>{children}</>;
  return (
    <FeatureLocked
      name={service.displayName}
      description={service.description}
      requiredPlan={requirementLabel(rules, wallProduct)}
      accent={productColor(product)}
    >
      {children}
    </FeatureLocked>
  );
}

export default PlanWall;

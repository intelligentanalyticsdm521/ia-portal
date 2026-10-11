// useFeatureGate — the catalog answer for the active business, for a gate
// INSIDE a page (a card, a button, a view switch).
//
// 2026-10-11 (feature catalog, SCOPE_FEATURE_CATALOG_2026-10-11 §2.5). The
// menu and the page wall read platform-api's `features[key]` through
// navVisibility; a gate inside a page reads the same entry here. Nothing in
// the page states a tier: it names a catalog key ("my_brand_social_calendar_grid")
// and shows the catalog's `needs` ("My Brand Pro") when the plan refuses it.
//
// Read through useProductAccess, so it shares the one /me/entitlements request
// and its one-minute cache, follows the business being viewed, and is re-asked
// once per navigation. No answer yet = undecided: a read opens (never a
// flash of a lock for a paying business), a send / spend holds.
import { useLocation } from 'react-router-dom';
import { useProductAccess } from './useProductAccess';
import {
  featureAllows, featureNeeds, featuresOf,
  type FeatureEntry, type FeatureIntent, type FeatureMap,
} from '../lib/entitlements';

export interface FeatureGate {
  /** True once the answer (or the absence of one) is known. */
  ready: boolean;
  features: FeatureMap | null;
  /** May this business do `intent` with the feature? (lib/entitlements featureAllows) */
  allows: (key: string, intent?: FeatureIntent) => boolean;
  /** Only a decided "not in your plan": the lock shows. */
  locked: (key: string) => boolean;
  /** What to buy, in the catalog's words; "a higher plan" when it names nothing. */
  needs: (key: string) => string;
  entry: (key: string) => FeatureEntry | null;
}

export function useFeatureGate(): FeatureGate {
  const { pathname } = useLocation();
  const { payload, ready } = useProductAccess(pathname);
  const features = featuresOf(payload);
  return {
    ready,
    features,
    allows: (key, intent = 'read') => featureAllows(features, key, intent),
    locked: (key) => !featureAllows(features, key, 'read'),
    needs: (key) => featureNeeds(features, key) ?? 'a higher plan',
    entry: (key) => features?.[key] ?? null,
  };
}

export default useFeatureGate;

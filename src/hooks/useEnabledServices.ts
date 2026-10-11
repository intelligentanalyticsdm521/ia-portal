// useEnabledServices — the page keys the active business may open.
//
// 2026-10-11 (feature catalog, SCOPE_FEATURE_CATALOG_2026-10-11 §2.5). This
// used to be AppState.enabledServices, built by hand: a list of ARION keys
// when ARION was owned, two OLIVER keys, the HESTIA keys, and nothing at all
// for SPARK (so "has SPARK" read false for every SPARK business). It is now
// the catalog answer: every key platform-api does not refuse (allowed true
// or undecided) whose availability is live (lib/entitlements
// enabledFeatureKeys). Read through useProductAccess, so it shares the one
// /me/entitlements request and its one-minute cache, follows the business
// being viewed (view-as included), and is re-asked once per navigation.
//
// No answer = an empty set. Callers that need "is this product owned" with
// no answer fall back to AppState.ownedProducts (the sign-in list).
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useProductAccess } from './useProductAccess';
import { enabledFeatureKeys, featuresOf, type FeatureMap } from '../lib/entitlements';

export function useEnabledServices(): { enabledServices: Set<string>; features: FeatureMap | null } {
  const { pathname } = useLocation();
  const { payload } = useProductAccess(pathname);
  const features = featuresOf(payload);
  const enabledServices = useMemo(() => enabledFeatureKeys(features), [features]);
  return { enabledServices, features };
}

export default useEnabledServices;

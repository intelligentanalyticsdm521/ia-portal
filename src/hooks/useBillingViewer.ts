// useBillingViewer — who is looking at a billing control: a business admin, a
// team member without billing rights, or the founder viewing a client's
// business. One answer for the off notice, the Plan & Pricing cards and the
// payment-page buttons, so no billing control is shown to someone the billing
// API would refuse (SCOPE_ACCESS_FOLLOWS_SUBSCRIPTION_2026-10-07 §4.2).
import { useAppState } from '../app/AppState';
import { useUserAccess } from '../hooks/useUserAccess';
import { isActingAsClient } from '../lib/actingAsClient';
import type { Viewer } from '../lib/productAccess';

export function useBillingViewer(): Viewer {
  const appState = useAppState();
  const { activeTenantId } = appState;
  const isFounder = !!appState.bootstrap?.user?.isFounder;
  const home = appState.bootstrap?.homeTenantId;
  const { access } = useUserAccess();
  if (isActingAsClient(isFounder, activeTenantId, home)) return 'viewing_client';
  return access && (access.role === 'user' || access.role === 'read_only') ? 'member' : 'admin';
}

export default useBillingViewer;

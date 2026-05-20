import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppStateProvider } from './app/AppState';

import { LandingPage } from './pages/LandingPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';

import { AppGate } from './app/AppGate';
import { AppLayout } from './components/AppLayout';

import { OverviewPage } from './pages/OverviewPage';
import { ServiceRouter } from './pages/ServiceRouter';

import { ProfileViewPage } from './pages/ProfileViewPage';
import { ProfilePage } from './pages/ProfilePage';

import { SettingsViewPage } from './pages/SettingsViewPage';
import { SettingsEditPage } from './pages/SettingsEditPage';
import { TenantSettings } from './pages/settings/TenantSettings';
import { PersonalSettings } from './pages/settings/PersonalSettings';

// NEW: SPARK pricing page route
import { SparkPricingPage } from './pages/spark/SparkPricingPage';

// Platform admin: team access (role + product gating)
import { PlatformTeamAccess } from './pages/settings/PlatformTeamAccess';

// Public pricing / signup flow (was /signup, renamed to /pricing 2026-05-20)
import { SignupPage as PricingPage } from './pages/signup/SignupPage';
import { OnboardingFlow } from './pages/signup/OnboardingFlow';
import { ProvisioningStatus } from './pages/signup/ProvisioningStatus';

// In-app add-site flow
import { AddSiteFlow } from './pages/sites/AddSiteFlow';
import { SiteProvisioningStatus } from './pages/sites/SiteProvisioningStatus';

/** Redirect that preserves the original query string + hash. Used for the
 *  /signup → /pricing 301-style redirects so Stripe Checkout completion
 *  links like /signup/onboarding?session_id=cs_test_… still land on the
 *  onboarding flow with the session_id intact.
 */
function RedirectPreservingSearch({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <AppStateProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          {/* Public pricing / signup flow — unauthenticated end-to-end.
              Renamed from /signup to /pricing on 2026-05-20 per spec
              IA_Portal_GetStarted_PlanManagement_Spec_v1_0. Old /signup
              paths redirect to /pricing for any cached links. */}
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/pricing/onboarding" element={<OnboardingFlow />} />
          <Route path="/pricing/status" element={<ProvisioningStatus />} />

          {/* 301-style redirects from the old /signup URLs.
              RedirectPreservingSearch keeps ?session_id=… so Stripe Checkout
              completion links continue to work. */}
          <Route
            path="/signup"
            element={<RedirectPreservingSearch to="/pricing" />}
          />
          <Route
            path="/signup/onboarding"
            element={<RedirectPreservingSearch to="/pricing/onboarding" />}
          />
          <Route
            path="/signup/status"
            element={<RedirectPreservingSearch to="/pricing/status" />}
          />

          {/* Authenticated app shell */}
          <Route
            path="/app"
            element={
              <AppGate>
                <AppLayout />
              </AppGate>
            }
          >
            {/* Default app route → overview */}
            <Route index element={<Navigate to="overview" replace />} />

            {/* Overview */}
            <Route path="overview" element={<OverviewPage />} />

            {/* Profile */}
            <Route path="profile" element={<ProfileViewPage />} />
            <Route path="profile/edit" element={<ProfilePage />} />

            {/* Settings — tenant-level (icon rail gear) */}
            <Route path="settings" element={<TenantSettings />} />
            <Route path="settings/edit" element={<SettingsEditPage />} />

            {/* Personal account settings (hamburger menu items) */}
            <Route path="account" element={<PersonalSettings />} />

            {/* NEW: SPARK pricing page used by subscribe buttons */}
            <Route path="spark/pricing" element={<SparkPricingPage />} />

            {/* Platform admin: team access */}
            <Route path="team-access" element={<PlatformTeamAccess />} />

            {/* Add-site flow + in-app provisioning status (existing tenants) */}
            <Route path="sites/new" element={<AddSiteFlow />} />
            <Route path="sites/:siteId/provisioning" element={<SiteProvisioningStatus />} />

            {/* All feature-specific pages routed by service key */}
            <Route path="services/:serviceKey" element={<ServiceRouter />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppStateProvider>
    </BrowserRouter>
  );
}
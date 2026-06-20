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
import {
  SettingsHubPage,
  BusinessProfileSettingsPage,
  PlanPricingSettingsPage,
  TeamMembersSettingsPage,
  IntegrationsSettingsPage,
  NotificationsSettingsPage,
  SecuritySettingsPage,
  DataPrivacySettingsPage,
} from './pages/settings/SettingsRoutes';
import { ArgusDataPlanPage } from './pages/settings/ArgusDataPlanPage';
import { PlatformAdminPage } from './pages/PlatformAdminPage';
import { ArionOnboardExistingPage } from './pages/admin/ArionOnboardExistingPage';
import { AdminLeadgenPage } from './pages/admin/AdminLeadgenPage';

// NEW: SPARK pricing page route
import { SparkPricingPage } from './pages/spark/SparkPricingPage';

// Tenant contact-intelligence weight tuning page. Lives at a dedicated
// /app/spark/contact-scoring route (rather than the service-key router)
// because it's a tenant-level settings surface, not a feature page.
import { SparkContactScoringPage } from './pages/spark/SparkContactScoringPage';

// SPARK Lead Gen V1 (F-150/F-163) — dedicated routes because the job page
// takes an :id path param that doesn't fit the service-key router.
import { SparkLeadGenNewPage } from './pages/spark/SparkLeadGenNewPage';
import { SparkLeadGenJobPage } from './pages/spark/SparkLeadGenJobPage';
import { SparkLeadGenSavedPage } from './pages/spark/SparkLeadGenSavedPage';
import SparkCustomerFlowPage from './pages/spark/SparkCustomerFlowPage';
import SparkLifecyclePage from './pages/spark/SparkLifecyclePage';
import SparkSyncIssuesPage from './pages/spark/SparkSyncIssuesPage';
import WalkthroughsPage from './pages/settings/WalkthroughsPage';

// Platform admin: team access (role + product gating)
import { PlatformTeamAccess } from './pages/settings/PlatformTeamAccess';

// Public pricing / signup flow (was /signup, renamed to /pricing 2026-05-20)
import { SignupPage as PricingPage } from './pages/signup/SignupPage';
import { OnboardingFlow } from './pages/signup/OnboardingFlow';
import { ProvisioningStatus } from './pages/signup/ProvisioningStatus';
import { WelcomePage } from './pages/signup/WelcomePage';

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
          <Route path="/welcome" element={<WelcomePage />} />

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

            {/* Settings — tenant-level. 2026-05-25: every setting now has
                its own URL (Phase 1A nav split). The hub page at /app/settings
                lists every setting as a tile; per-setting routes deep-link
                from the hamburger menu. /app/settings/all keeps the original
                tabbed UI reachable for back-compat. */}
            <Route path="settings" element={<SettingsHubPage />} />
            <Route path="settings/all" element={<TenantSettings />} />
            <Route path="settings/edit" element={<SettingsEditPage />} />
            <Route path="settings/business-profile" element={<BusinessProfileSettingsPage />} />
            <Route path="settings/plan-pricing" element={<PlanPricingSettingsPage />} />
            <Route path="settings/team-members" element={<TeamMembersSettingsPage />} />
            <Route path="settings/integrations" element={<IntegrationsSettingsPage />} />
            <Route path="settings/notifications" element={<NotificationsSettingsPage />} />
            <Route path="settings/walkthroughs" element={<WalkthroughsPage />} />
            <Route path="settings/security" element={<SecuritySettingsPage />} />
            <Route path="settings/data-privacy" element={<DataPrivacySettingsPage />} />
            <Route path="settings/argus-data-plan" element={<ArgusDataPlanPage />} />

            {/* Platform admin (SUPER_ADMIN only — gear icon target).
                Stub for now; founder-only UI for cross-tenant ops, dead-tenant
                cleanup, schema migrations, etc. */}
            <Route path="admin" element={<PlatformAdminPage />} />
            <Route path="admin/onboard-arion-existing" element={<ArionOnboardExistingPage />} />
            <Route path="admin/leadgen" element={<AdminLeadgenPage />} />

            {/* Personal account settings (hamburger menu items) */}
            <Route path="account" element={<PersonalSettings />} />

            {/* NEW: SPARK pricing page used by subscribe buttons */}
            <Route path="spark/pricing" element={<SparkPricingPage />} />

            {/* Tenant contact-intelligence weight tuning (6 sliders, sum=100).
                Lives outside the service-key router because it's a tenant-
                level settings surface (like spark/pricing) rather than a
                feature page. Also reachable via the spark_contact_scoring
                service-catalog entry which routes to the same component. */}
            <Route path="spark/contact-scoring" element={<SparkContactScoringPage />} />

            {/* SPARK Lead Gen V1 (F-150/F-163) — search form, job progress,
                saved searches. The job page needs an :id path param so these
                live here instead of the service-key router. */}
            <Route path="spark/leadgen/new" element={<SparkLeadGenNewPage />} />
            <Route path="spark/leadgen/jobs/:id" element={<SparkLeadGenJobPage />} />
            <Route path="spark/leadgen/saved" element={<SparkLeadGenSavedPage />} />
            <Route path="spark/customer-flow" element={<SparkCustomerFlowPage />} />
            <Route path="spark/lifecycle" element={<SparkLifecyclePage />} />
            <Route path="spark/sync-issues" element={<SparkSyncIssuesPage />} />

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
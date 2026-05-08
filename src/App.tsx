import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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

// Public signup flow
import { SignupPage } from './pages/signup/SignupPage';
import { OnboardingFlow } from './pages/signup/OnboardingFlow';
import { ProvisioningStatus } from './pages/signup/ProvisioningStatus';

export function App() {
  return (
    <BrowserRouter>
      <AppStateProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          {/* Public signup flow — unauthenticated end-to-end */}
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/signup/onboarding" element={<OnboardingFlow />} />
          <Route path="/signup/status" element={<ProvisioningStatus />} />

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
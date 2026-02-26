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

// NEW: SPARK pricing page route
import { SparkPricingPage } from './pages/spark/SparkPricingPage';

export function App() {
  return (
    <BrowserRouter>
      <AppStateProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

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

            {/* Settings view/edit */}
            <Route path="settings" element={<SettingsViewPage />} />
            <Route path="settings/edit" element={<SettingsEditPage />} />

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
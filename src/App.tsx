import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppStateProvider } from './app/AppState';
import { AppGate } from './app/AppGate';
import { AppLayout } from './layout/AppLayout';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { LandingPage } from './pages/LandingPage';
import { OverviewPage } from './pages/OverviewPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProfileViewPage } from './pages/ProfileViewPage';
import { ServiceRouter } from './pages/ServiceRouter';
import { SettingsEditPage } from './pages/SettingsEditPage';
import { SettingsViewPage } from './pages/SettingsViewPage';
import { SparkPricingPage } from './pages/spark/SparkPricingPage';

export function App() {
  return (
    <BrowserRouter>
      <AppStateProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          <Route
            path="/app"
            element={
              <AppGate>
                <AppLayout />
              </AppGate>
            }
          >
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="profile" element={<ProfileViewPage />} />
            <Route path="profile/edit" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsViewPage />} />
            <Route path="settings/edit" element={<SettingsEditPage />} />

            {/* SPARK pricing page used by “Subscribe” buttons */}
            <Route path="spark/pricing" element={<SparkPricingPage />} />

            {/* All other feature pages are routed via service keys */}
            <Route path="services/:serviceKey" element={<ServiceRouter />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppStateProvider>
    </BrowserRouter>
  );
}
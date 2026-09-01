// ClientTenantModal — consultant workspace.
//
// XL modal that renders the Portal scoped to a CLIENT tenant Brandon has a
// consultant_grant for. Self-contained: no iframe, no MSAL bounce, no URL
// change in the main tab. The modal mounts AppLayout + the full nested
// route tree inside a MemoryRouter so navigation stays inside the modal.
//
// Access is granted by core.consultant_grant; oliver-api, arion-api, and
// platform-api all honor it as a fallback for tenant_users membership.
//
// Tenant scope is provided by a LOCAL AppStateContext.Provider that
// shadows the global one for the modal subtree only. The founder's main
// tab is untouched.

import { useEffect, useMemo, useState } from "react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAccessToken } from "../../auth/useAccessToken";
import { AppStateContext, useAppState } from "../../app/AppState";
import { IadmModal } from "../IadmModal";
import { AppLayout } from "../AppLayout";
import { selectTenant } from "../../lib/platformApi";
import type { SelectTenantResponse } from "../../lib/platformApi";

// Route components — same set used by App.tsx for /app/*.
import { OverviewPage } from "../../pages/OverviewPage";
import { ServiceRouter } from "../../pages/ServiceRouter";
import { ProfileViewPage } from "../../pages/ProfileViewPage";
import { ProfilePage } from "../../pages/ProfilePage";
import { SettingsEditPage } from "../../pages/SettingsEditPage";
import { TenantSettings } from "../../pages/settings/TenantSettings";
import { PersonalSettings } from "../../pages/settings/PersonalSettings";
import {
  SettingsHubPage,
  BusinessProfileSettingsPage,
  PlanPricingSettingsPage,
  TeamMembersSettingsPage,
  IntegrationsSettingsPage,
  DataPrivacySettingsPage,
} from "../../pages/settings/SettingsRoutes";
import { BrandIdentityPage } from "../../pages/settings/BrandIdentityPage";
import { SenderDomainPage } from "../../pages/settings/SenderDomainPage";
import { ArgusDataPlanPage } from "../../pages/settings/ArgusDataPlanPage";
import { ArgusMarginPage } from "../../pages/admin/ArgusMarginPage";
import { PlatformAdminPage } from "../../pages/PlatformAdminPage";
import { ArionOnboardExistingPage } from "../../pages/admin/ArionOnboardExistingPage";
import { AdminLeadgenPage } from "../../pages/admin/AdminLeadgenPage";
import { SparkPricingPage } from "../../pages/spark/SparkPricingPage";
import { SparkContactScoringPage } from "../../pages/spark/SparkContactScoringPage";
import { SparkLeadGenNewPage } from "../../pages/spark/SparkLeadGenNewPage";
import { SparkLeadGenJobPage } from "../../pages/spark/SparkLeadGenJobPage";
import { SparkLeadGenSavedPage } from "../../pages/spark/SparkLeadGenSavedPage";
import SparkCustomerFlowPage from "../../pages/spark/SparkCustomerFlowPage";
import SparkLifecyclePage from "../../pages/spark/SparkLifecyclePage";
import SparkSyncIssuesPage from "../../pages/spark/SparkSyncIssuesPage";
import WalkthroughsPage from "../../pages/settings/WalkthroughsPage";
import SettingsToursPage from "../../pages/settings/SettingsToursPage";
import { PlatformTeamAccess } from "../../pages/settings/PlatformTeamAccess";
import { AddSiteFlow } from "../../pages/sites/AddSiteFlow";
import { SiteProvisioningStatus } from "../../pages/sites/SiteProvisioningStatus";
import { ConsultingIntakeFormPage } from "../../pages/consulting/ConsultingIntakeFormPage";
import { LEADGEN_ENABLED } from "../../config/featureFlags";
import { FeatureUnavailable } from "../FeatureUnavailable";

const PLATFORM_API_BASE = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string) || "";

interface Props {
  open: boolean;
  tenantId: string | null;
  tenantName?: string;
  onClose: () => void;
}

export function ClientTenantModal({ open, tenantId, tenantName, onClose }: Props) {
  const founderState = useAppState();
  const { getToken } = useAccessToken();
  const [clientActive, setClientActive] = useState<SelectTenantResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !tenantId) {
      setClientActive(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setClientActive(null);
    setLoadError(null);

    (async () => {
      try {
        const auth = await getToken();
        if (cancelled) return;
        const r = await selectTenant({
          baseUrl: PLATFORM_API_BASE,
          bearerToken: auth.accessToken,
          tenantId,
        });
        if (cancelled) return;
        setClientActive(r);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[ClientTenantModal] select-tenant failed:", e);
        setLoadError(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, tenantId, getToken]);

  // Build a SHADOWED AppState value for the modal subtree. activeTenantId
  // and active point at the client tenant; bootstrap stays at the founder's
  // verify payload so isFounder/email/identity flow through. Setters are
  // local — they update the modal's own clientActive state instead of
  // mutating the global founder state.
  const modalAppState = useMemo(() => {
    if (!clientActive || !tenantId) return null;
    const enabled = new Set<string>();
    // Mirror the enabled-services hydration App.tsx does so the sidebar
    // renders the same nav for the client.
    const svcKeys = new Set(
      (clientActive.services || []).map((s) => String(s.serviceKey || "").trim().toLowerCase())
    );
    if (svcKeys.has("arion")) {
      ["arion_dashboard","arion_website_overview","arion_website_content","arion_website_content_seo_overview","arion_website_security_overview","arion_website_security_vulnerabilities","arion_website_security_firewall","arion_website_performance_cache","arion_website_performance_images","arion_website_updates","arion_website_staging","arion_website_support","arion_website_settings","arion_hosting_overview","arion_hosting_domain_dns","arion_hosting_backups","arion_hosting_performance","arion_analytics_overview","arion_analytics_traffic","arion_analytics_audience","arion_analytics_content","arion_analytics_conversions","arion_analytics_pages","arion_analytics_reports","arion_analytics_ia_cross_platform","arion_analytics_ia_cross_channel","arion_analytics_ia_reports","arion_seo_overview","arion_seo_rankings","arion_seo_site_audit","arion_seo_competitors","arion_seo_opportunities","arion_seo_reports","arion_search_performance","arion_search_indexing","arion_search_sitemaps","arion_search_core_web_vitals","arion_search_bing_copilot","arion_search_bing_indexnow","arion_business_overview","arion_business_locations","arion_business_reviews","arion_business_insights","arion_business_posts","arion_business_services","arion_business_bing_overview","arion_business_apple_overview","arion_brand"].forEach((k) => enabled.add(k));
    }
    if (svcKeys.has("oliver")) {
      enabled.add("oliver_operations");
      enabled.add("oliver_portals");
    }
    for (const f of clientActive.features || []) {
      const k = String(f.featureKey || "").trim();
      if (k) enabled.add(k);
    }

    return {
      bootstrap: founderState.bootstrap, // founder's identity (isFounder, etc.)
      setBootstrap: () => {/* read-only in modal */},
      active: clientActive,
      setActive: (v: SelectTenantResponse | null) => { setClientActive(v); },
      activeTenantId: tenantId,
      setActiveTenantId: () => {/* read-only in modal */},
      enabledServices: enabled,
      // 2026-08-06 — the CLIENT's product entitlements (core.tenant_services),
      // so view-as shows exactly the products they bought. Previously the rail
      // ignored this entirely and rendered SPARK/ARGUS for every client — which
      // is how ARION-only tenants (Briarwood, Midwest Ag) appeared to have
      // SPARK. `svcKeys` is already the raw service_key set we need.
      ownedProducts: svcKeys,
    };
  }, [clientActive, tenantId, founderState.bootstrap]);

  if (!open || !tenantId) return null;

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="oliver"
      eyebrow="CONSULTANT WORKSPACE"
      title={`Working in: ${tenantName || "Client"}`}
      subtitle="Intelligent Analytics — Consultant Mode"
      size="xl"
    >
      <div style={{ width: "100%", height: "100%", overflow: "hidden", background: "#f8fafc" }}>
        {loadError ? (
          <div style={{ padding: 32, color: "#b91c1c", fontSize: 13 }}>
            <strong>Could not load {tenantName || "client"} workspace.</strong>
            <pre style={{ marginTop: 12, fontSize: 11, whiteSpace: "pre-wrap" }}>{loadError}</pre>
          </div>
        ) : !modalAppState ? (
          <div style={{ padding: 32, color: "#64748b", fontSize: 13 }}>
            Loading {tenantName || "client"}'s portal…
          </div>
        ) : (
          <AppStateContext.Provider value={modalAppState}>
            <MemoryRouter initialEntries={["/app/overview"]}>
              <Routes>
                <Route path="/app" element={<AppLayout />}>
                  <Route index element={<Navigate to="overview" replace />} />
                  <Route path="overview" element={<OverviewPage />} />
                  <Route path="profile" element={<ProfileViewPage />} />
                  <Route path="profile/edit" element={<ProfilePage />} />
                  <Route path="settings" element={<SettingsHubPage />} />
                  <Route path="settings/all" element={<TenantSettings />} />
                  <Route path="settings/edit" element={<SettingsEditPage />} />
                  <Route path="settings/business-profile" element={<BusinessProfileSettingsPage />} />
                  <Route path="settings/brand-identity" element={<BrandIdentityPage />} />
                  <Route path="settings/sender-domain" element={<SenderDomainPage />} />
                  <Route path="settings/plan-pricing" element={<PlanPricingSettingsPage />} />
                  <Route path="settings/team-members" element={<TeamMembersSettingsPage />} />
                  <Route path="settings/integrations" element={<IntegrationsSettingsPage />} />
                  <Route path="settings/walkthroughs" element={<WalkthroughsPage />} />
                  <Route path="settings/tours" element={<SettingsToursPage />} />
                  <Route path="settings/data-privacy" element={<DataPrivacySettingsPage />} />
                  <Route path="settings/argus-data-plan" element={<ArgusDataPlanPage />} />
                  <Route path="admin/argus-margin" element={<ArgusMarginPage />} />
                  <Route path="admin" element={<PlatformAdminPage />} />
                  <Route path="admin/onboard-arion-existing" element={<ArionOnboardExistingPage />} />
                  <Route path="admin/leadgen" element={LEADGEN_ENABLED ? <AdminLeadgenPage /> : <FeatureUnavailable name="Lead Gen admin" />} />
                  <Route path="account" element={<PersonalSettings />} />
                  <Route path="spark/pricing" element={<SparkPricingPage />} />
                  <Route path="spark/contact-scoring" element={<SparkContactScoringPage />} />
                  <Route path="spark/leadgen/new" element={LEADGEN_ENABLED ? <SparkLeadGenNewPage /> : <FeatureUnavailable name="Lead Gen" />} />
                  <Route path="spark/leadgen/jobs/:id" element={LEADGEN_ENABLED ? <SparkLeadGenJobPage /> : <FeatureUnavailable name="Lead Gen" />} />
                  <Route path="spark/leadgen/saved" element={LEADGEN_ENABLED ? <SparkLeadGenSavedPage /> : <FeatureUnavailable name="Lead Gen" />} />
                  <Route path="spark/customer-flow" element={<SparkCustomerFlowPage />} />
                  <Route path="spark/lifecycle" element={<SparkLifecyclePage />} />
                  <Route path="spark/sync-issues" element={<SparkSyncIssuesPage />} />
                  <Route path="team-access" element={<PlatformTeamAccess />} />
                  <Route path="sites/new" element={<AddSiteFlow />} />
                  <Route path="sites/:siteId/provisioning" element={<SiteProvisioningStatus />} />
                  <Route
                    path="consulting/intake/:submissionId"
                    element={<ConsultingIntakeFormPage />}
                  />
                  <Route path="services/:serviceKey" element={<ServiceRouter />} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AppStateContext.Provider>
        )}
      </div>
    </IadmModal>
  );
}

export default ClientTenantModal;

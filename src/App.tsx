import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppStateProvider } from './app/AppState';
// THE brand kit, one fetch for the whole shell. Inside AppStateProvider
// because it needs the active business; outside Routes so a save in Brand
// Identity repaints every builder on screen without a reload
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §2, step 0).
import { BrandKitProvider } from './brand/BrandKitProvider';
// D-154 — the signed-in person's own switches (Tutorials). One fetch for the
// whole shell, inside AppStateProvider because it needs the active business,
// and outside Routes so turning "Builder tips" on in Settings reaches the next
// builder that opens without a reload.
import { PreferencesProvider } from './prefs/PreferencesProvider';

import { LandingPage } from './pages/LandingPage';
import { DEV_AUTH } from './lib/devAuth';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
// F3 — Scope Change Revisions public surface (no auth, token IS the auth).
import { PublicRevisionPage } from './pages/public/PublicRevisionPage';
import { PublicFormPage } from './pages/public/PublicFormPage';
import { PublicProposalPage } from './pages/public/PublicProposalPage';
import { BusinessCardPublicPage } from './pages/public/BusinessCardPublicPage';

import { AppGate } from './app/AppGate';
import { IdleLogout } from './components/IdleLogout';
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
  DataPrivacySettingsPage,
} from './pages/settings/SettingsRoutes';
import { BrandIdentityPage } from './pages/settings/BrandIdentityPage';
import { YourBusinessPage } from './pages/settings/YourBusinessPage';
import { ResponderSettingsPage } from './pages/settings/ResponderSettingsPage';
// F-79 per-tenant custom email sender domain (task #116).
import { SenderDomainPage } from './pages/settings/SenderDomainPage';
import { ArgusDataPlanPage } from './pages/settings/ArgusDataPlanPage';
// §4.8 — the client's own Phone & texting page, and the carrier form behind it.
import { PhoneTextingSettingsPage } from './pages/settings/PhoneTextingSettingsPage';
import { PhoneRegistrationPage } from './pages/settings/PhoneRegistrationPage';
import { ArgusMarginPage } from './pages/admin/ArgusMarginPage';
import { PlatformAdminPage } from './pages/PlatformAdminPage';
import { ArionOnboardExistingPage } from './pages/admin/ArionOnboardExistingPage';
import { AdminLeadgenPage } from './pages/admin/AdminLeadgenPage';
// G5-S8 (CRITICAL_DEFECTS_SCOPE_2026-06-30) — Founder-only Infra Health snapshot.
// Reads /admin/infra-health/summary from oliver-api. Warns when ADR-001/002
// trigger thresholds are crossed.
import { InfraHealthPage } from './pages/admin/InfraHealthPage';

// NEW: SPARK pricing page route
import { SparkPricingPage } from './pages/spark/SparkPricingPage';

// #77 — Proposal Templates. Explicit route because the desired URL

// Tenant contact-intelligence weight tuning page. Lives at a dedicated
// /app/spark/contact-scoring route (rather than the service-key router)
// because it's a tenant-level settings surface, not a feature page.
import { SparkContactScoringPage } from './pages/spark/SparkContactScoringPage';

// SPARK Lead Gen V1 (F-150/F-163) — dedicated routes because the job page
// takes an :id path param that doesn't fit the service-key router.
import { SparkLeadGenNewPage } from './pages/spark/SparkLeadGenNewPage';
import { SparkLeadGenJobPage } from './pages/spark/SparkLeadGenJobPage';
import SparkLeadGenTermsPage from './pages/spark/SparkLeadGenTermsPage';
import SparkCustomerFlowPage from './pages/spark/SparkCustomerFlowPage';
import SparkLifecyclePage from './pages/spark/SparkLifecyclePage';
import SparkSyncIssuesPage from './pages/spark/SparkSyncIssuesPage';
import SettingsTutorialsPage from './pages/settings/SettingsTutorialsPage';

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

// Task #257 — Tenant Workspace page. Founder lands here after Save & Finish.
// Lives outside the service-key router because it carries a :tenantId path
// param that doesn't fit ServiceRouter's /services/:serviceKey shape.
import { ConsultingTenantWorkspacePage } from './pages/consulting/ConsultingTenantWorkspacePage';

// F4 (Consulting Rework 2026-06-25) — Client-facing intake form player.
// Lives outside the service-key router because it carries a :submissionId
// path param. Client lands here from a SPARK email link after the founder
// hits "Send Intake" on a project.
import { ConsultingIntakeFormPage } from './pages/consulting/ConsultingIntakeFormPage';
import { ForgeSoftwareRouter } from './pages/forge/ForgeSoftwareRouter';
import { LegacyForgeRedirect } from './pages/forge/LegacyForgeRedirect';

// Consultant workspace entry — captures /c/:tid → sessionStorage → /app.
import { ConsultantWorkspaceEntry } from './app/ConsultantWorkspaceEntry';

// 2026-06-29 — Founder-side consulting routes relocated under /app/admin/consulting/*.
// Old /app/services/consulting_{workspace,tickets,projects,onboard_client,documents}
// paths still resolve through ServiceRouter, which 301s founders here and 404s
// non-founders (see ServiceRouter consulting dispatch). RequireFounderRoute
// gates every child so clients who land here directly get bounced to /overview.
import { RequireFounderRoute } from './app/RequireFounderRoute';
// Lead Gen's SEARCH surfaces are gated by the server's allow-list, not by who
// you are (SPARK pack 1). The founder's Lead Gen ADMIN below keeps
// RequireFounderRoute — that one really is internal tooling.
import { RequireLeadgenRoute } from './app/RequireLeadgenRoute';
import { ProductGate } from './components/ProductGate';
import { lazy, Suspense } from 'react';
// Each page file exports a default that matches the named export; using the
// default keeps these lazy() calls minimal and tree-shaker-friendly.
const ConsultingClientsPageAdmin = lazy(() => import('./pages/consulting/ConsultingClientsPage'));
// 2026-07-24 — Service Requests rewired onto consulting.service_request (the
// 7-stage pipeline + OLIVER bridge). ConsultingTicketsBoardPage read the
// abandoned lumen.consulting_ticket fork (0 rows in prod) and is retired.
const ConsultingRequestsBoardPageAdmin = lazy(() => import('./pages/consulting/ConsultingWorkBoardPage'));
// Sept-A F7 — founder-only client-facing error log viewer.
const ErrorLogPageAdmin = lazy(() => import('./pages/admin/ErrorLogPage'));
// Foundation §3A3 — founder queue for ARION website change requests.
const SiteRequestsPageAdmin = lazy(() => import('./pages/admin/SiteRequestsPage'));
// IL-1 — the founder's Intelligence Layer card: can we trust the model yet,
// and what is it costing us. Read-only; LUMEN 403s non-founders on its own.
const IlLearningPageAdmin = lazy(() => import('./pages/admin/IlLearningPage'));
// Agents across businesses — the founder's rollup, and the ONLY surface that
// shows what agent work costs us. LUMEN's /il/admin routes 403 non-founders
// on their own, so the route gate here is belt, not braces.
const AgentsAcrossBusinessesPageAdmin = lazy(() => import('./pages/admin/AgentsAcrossBusinessesPage'));
// Conversations 2 + 3 — every business's phone line, and the buttons that spend
// money on a carrier. Founder-only here AND founder-only in LUMEN, which fails
// closed: hiding the link is not what protects it.
const PhoneLinesPageAdmin = lazy(() => import('./pages/admin/PhoneLinesPage'));
const ConsultingProjectsPageAdmin = lazy(() => import('./pages/consulting/ConsultingProjectsPage'));
const ConsultingOnboardClientPageAdmin = lazy(() => import('./pages/consulting/ConsultingOnboardClientPageV2'));
const ConsultingDocumentLibraryPageAdmin = lazy(() => import('./pages/consulting/ConsultingDocumentLibraryPage'));

// 2026-06-29 — CLIENT-facing consulting surface. Mounts under
// /app/consulting/{projects,deliverables,requests} inside a thin
// ClientConsultingLayout that supplies the three-tab pill nav. No founder
// gating at this layer; each page does its own subscription/upsell checks
// where needed (Service Requests gates on Build Your Brand sub).
import { ClientConsultingLayout } from './components/consulting/ClientConsultingLayout';
import { LEADGEN_ENABLED } from './config/featureFlags';
import { FeatureUnavailable } from './components/FeatureUnavailable';
const ClientConsultingProjectsPage = lazy(() => import('./pages/consulting/ClientConsultingProjectsPage'));
const ClientConsultingDeliverablesPage = lazy(() => import('./pages/consulting/ClientConsultingDeliverablesPage'));
const ClientConsultingServiceRequestsPage = lazy(() => import('./pages/consulting/ClientConsultingServiceRequestsPage'));

function AdminRouteLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#5A7A8A', fontSize: 13 }}>
      Loading…
    </div>
  );
}

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
        <BrandKitProvider>
        <PreferencesProvider>
        <Routes>
          {/* Public routes. Under VITE_DEV_AUTH=1 the bare root goes straight
              into the app — the sign-in landing must never render in local dev
              (there is no CIAM locally; its button redirects to prod CIAM and
              the callback bounces). Build-time constant: prod is unaffected. */}
          <Route path="/" element={DEV_AUTH ? <Navigate to="/app/overview" replace /> : <LandingPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          {/* Public pricing / signup flow — unauthenticated end-to-end.
              Renamed from /signup to /pricing on 2026-05-20 per spec
              IA_Portal_GetStarted_PlanManagement_Spec_v1_0. Old /signup
              paths redirect to /pricing for any cached links. */}
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/pricing/onboarding" element={<OnboardingFlow />} />
          <Route path="/pricing/status" element={<ProvisioningStatus />} />
          <Route path="/welcome" element={<WelcomePage />} />

          {/* F3 — Public revision page.  The token is a URL-safe hex
              string (NVARCHAR(80)) issued by oliver-api when the founder
              creates a draft revision.  No auth needed. */}
          <Route path="/p/revisions/:token" element={<PublicRevisionPage />} />

          {/* The customer's copy of a proposal or agreement. It renders the
              document with src/builder/render.ts — the SAME renderer the author
              edits on — so the page the customer signs is the page that was
              built. blocks_json used to be stored and served with no route
              anywhere in the Portal that read it. */}
          <Route path="/p/proposals/:token" element={<PublicProposalPage />} />

          {/* Public consulting form fill — no auth, public_token IS the auth.
              A prospect who isn't a tenant yet opens the emailed link, fills the
              form, and submits (mirrors /p/proposals). */}
          <Route path="/p/forms/:token" element={<PublicFormPage />} />

          {/* Public Business Card page — no auth. The vCard QR encodes this URL;
              scanning opens the card. Brandon can also "Add to Home Screen" on
              his phone for a one-tap widget. */}
          <Route path="/card/:shortCode" element={<BusinessCardPublicPage />} />

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
                {/* Auto sign-out after 2h idle — authenticated area only. */}
                <IdleLogout />
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
            {/* Foundation B — the ONE record every product and every agent reads. */}
            <Route path="settings/your-business" element={<YourBusinessPage />} />
            <Route path="settings/responder" element={<ResponderSettingsPage />} />
            <Route path="settings/brand-identity" element={<BrandIdentityPage />} />
            <Route path="settings/sender-domain" element={<SenderDomainPage />} />
            <Route path="settings/plan-pricing" element={<PlanPricingSettingsPage />} />
            <Route path="settings/team-members" element={<TeamMembersSettingsPage />} />
            <Route path="settings/integrations" element={<IntegrationsSettingsPage />} />
            <Route path="settings/tutorials" element={<SettingsTutorialsPage />} />
            {/* D-154 — Tours and Walkthroughs were two pages for one job, and a
                third for the switches would have made it three. One page now;
                both old addresses land on it so bookmarks keep working. */}
            <Route path="settings/tours" element={<Navigate to="/app/settings/tutorials" replace />} />
            <Route path="settings/walkthroughs" element={<Navigate to="/app/settings/tutorials" replace />} />
            <Route path="settings/data-privacy" element={<DataPrivacySettingsPage />} />
            <Route path="settings/argus-data-plan" element={<ArgusDataPlanPage />} />
            <Route path="settings/phone-texting" element={<PhoneTextingSettingsPage />} />
            <Route path="settings/phone-texting/registration" element={<PhoneRegistrationPage />} />
            <Route path="admin/argus-margin" element={<ArgusMarginPage />} />

            {/* Platform admin (SUPER_ADMIN only — gear icon target).
                Stub for now; founder-only UI for cross-tenant ops, dead-tenant
                cleanup, schema migrations, etc. */}
            <Route path="admin" element={<PlatformAdminPage />} />
            <Route path="admin/onboard-arion-existing" element={<ArionOnboardExistingPage />} />
            {/* Hotfix B (2026-09-03): Lead Gen is live for the IA tenant ONLY until
                Brandon has verified real searches. RequireFounderRoute bounces
                everyone else to /app/overview; LUMEN 403s the job routes
                independently, so a direct API call can't bypass this. */}
            <Route path="admin/leadgen" element={<RequireFounderRoute />}>
              <Route index element={LEADGEN_ENABLED ? <AdminLeadgenPage /> : <FeatureUnavailable name="Lead Gen admin" />} />
            </Route>
            <Route path="admin/infra-health" element={<InfraHealthPage />} />

            {/* Sept-A F7 — founder-only client-facing error log (every 4xx/5xx
                across all four APIs; backend 403s non-founders independently). */}
            <Route path="admin/error-log" element={<RequireFounderRoute />}>
              <Route
                index
                element={
                  <Suspense fallback={<AdminRouteLoading />}>
                    <ErrorLogPageAdmin />
                  </Suspense>
                }
              />
            </Route>

            {/* Foundation §3A3 — the founder queue for website change requests.
                arion-api /admin/site-requests refuses non-founders on its own
                (middleware/requireFounder), so this guard is the UI half. */}
            <Route path="admin/site-requests" element={<RequireFounderRoute />}>
              <Route
                index
                element={
                  <Suspense fallback={<AdminRouteLoading />}>
                    <SiteRequestsPageAdmin />
                  </Suspense>
                }
              />
            </Route>

            {/* IL-1 — the Intelligence Layer instrument panel. LUMEN's
                /api/v1/il/admin routes 403 non-founders independently, so a
                direct API call can't bypass this either. */}
            <Route path="admin/il-learning" element={<RequireFounderRoute />}>
              <Route
                index
                element={
                  <Suspense fallback={<AdminRouteLoading />}>
                    <IlLearningPageAdmin />
                  </Suspense>
                }
              />
            </Route>

            {/* Agents across businesses. Same shape, same server-side gate:
                /api/v1/il/admin/agents/activity is founder-only and fails
                closed, so hiding the link is not what protects it. */}
            <Route path="admin/agents" element={<RequireFounderRoute />}>
              <Route
                index
                element={
                  <Suspense fallback={<AdminRouteLoading />}>
                    <AgentsAcrossBusinessesPageAdmin />
                  </Suspense>
                }
              />
            </Route>

            {/* Phone lines. The one page on this platform with a button that
                buys a carrier resource, so the same shape again and the same
                fail-closed gate on every endpoint behind it. */}
            <Route path="admin/phone-lines" element={<RequireFounderRoute />}>
              <Route
                index
                element={
                  <Suspense fallback={<AdminRouteLoading />}>
                    <PhoneLinesPageAdmin />
                  </Suspense>
                }
              />
            </Route>

            {/* 2026-06-29 — Founder-side Consulting relocated to /app/admin/consulting/*.
                RequireFounderRoute bounces non-founders to /app/overview. Old
                /app/services/consulting_{workspace,tickets,projects,onboard_client,documents}
                redirect founders here at the ServiceRouter level and 404 non-founders. */}
            <Route path="admin/consulting" element={<RequireFounderRoute />}>
              <Route index element={<Navigate to="clients" replace />} />
              <Route
                path="clients"
                element={
                  <Suspense fallback={<AdminRouteLoading />}>
                    <ConsultingClientsPageAdmin />
                  </Suspense>
                }
              />
              <Route
                path="requests"
                element={
                  <Suspense fallback={<AdminRouteLoading />}>
                    <ConsultingRequestsBoardPageAdmin />
                  </Suspense>
                }
              />
              <Route
                path="projects"
                element={
                  <Suspense fallback={<AdminRouteLoading />}>
                    <ConsultingProjectsPageAdmin />
                  </Suspense>
                }
              />
              <Route
                path="onboard-client"
                element={
                  <Suspense fallback={<AdminRouteLoading />}>
                    <ConsultingOnboardClientPageAdmin />
                  </Suspense>
                }
              />
              <Route
                path="document-library"
                element={
                  <Suspense fallback={<AdminRouteLoading />}>
                    <ConsultingDocumentLibraryPageAdmin />
                  </Suspense>
                }
              />
            </Route>

            {/* Personal account settings (hamburger menu items) */}
            <Route path="account" element={<PersonalSettings />} />

            {/* NEW: SPARK pricing page used by subscribe buttons */}
            <Route path="spark/pricing" element={<SparkPricingPage />} />

            {/* Tenant contact-intelligence weight tuning (6 sliders, sum=100).
                Lives outside the service-key router because it's a tenant-
                level settings surface (like spark/pricing) rather than a
                feature page. Also reachable via the spark_contact_scoring
                service-catalog entry which routes to the same component. */}
            {/* SCOPE_ACCESS_FOLLOWS_SUBSCRIPTION_2026-10-07 §4.2 — SPARK's own routes
                sit behind the same product gate as /app/services/spark_* (only
                spark/pricing, where SPARK is bought, stays open). */}
            <Route path="spark/contact-scoring" element={<ProductGate product="spark"><SparkContactScoringPage /></ProductGate>} />

            {/* SPARK Lead Gen V1 (F-150/F-163) — search form, job progress,
                saved searches. The job page needs an :id path param so these
                live here instead of the service-key router. */}
            {/* Lead Gen LOCKED 2026-07-27 (LEADGEN_ENABLED=false) — taxonomy
                produces garbage keyword expansions. Direct-URL access shows a
                paused notice; nav entries are filtered in serviceCatalog. */}
            {/* SPARK pack 1 (2026-09-08): Hotfix B's "the IA tenant only" became an
                ALLOW-LIST on the server (LEADGEN_TENANT_ALLOWLIST), so one real
                client can run one real paid search while the blast radius stays
                one business. RequireLeadgenRoute asks LUMEN; LUMEN 403s the job
                routes independently, so a direct API call cannot bypass it. */}
            <Route path="spark/leadgen" element={<ProductGate product="spark"><RequireLeadgenRoute /></ProductGate>}>
              {/* 2026-09-04: "new" → "b2b_new" (there will be several lead gens: B2B, inbound, B2C, premium).
                  The old path redirects so bookmarks and the guided tour keep working. */}
              <Route path="new" element={<Navigate to="/app/spark/leadgen/b2b_new" replace />} />
              <Route path="b2b_new" element={LEADGEN_ENABLED ? <SparkLeadGenNewPage /> : <FeatureUnavailable name="Lead Gen" />} />
              <Route path="terms" element={<SparkLeadGenTermsPage />} />
              <Route path="jobs/:id" element={LEADGEN_ENABLED ? <SparkLeadGenJobPage /> : <FeatureUnavailable name="Lead Gen" />} />
              {/* 2026-10-01: saved searches are the Lead Inbox's Saved Searches tab; the old page is gone and its address lands there. */}
              <Route path="saved" element={<Navigate to="/app/services/spark_lead_inbox?tab=saved" replace />} />
            </Route>
            <Route path="spark/customer-flow" element={<ProductGate product="spark"><SparkCustomerFlowPage /></ProductGate>} />
            <Route path="spark/lifecycle" element={<ProductGate product="spark"><SparkLifecyclePage /></ProductGate>} />
            <Route path="spark/sync-issues" element={<ProductGate product="spark"><SparkSyncIssuesPage /></ProductGate>} />

            {/* Platform admin: team access */}
            <Route path="team-access" element={<PlatformTeamAccess />} />

            {/* Add-site flow + in-app provisioning status (existing tenants) */}
            <Route path="sites/new" element={<AddSiteFlow />} />
            <Route path="sites/:siteId/provisioning" element={<SiteProvisioningStatus />} />

            {/* Task #257 — Tenant Workspace (founder lands here after Save &
                Finish on the Path B wizard). Per-product setup status + act-as
                CTAs. Must come BEFORE the catch-all service-key route. */}
            <Route
              path="services/consulting/tenant-workspace/:tenantId"
              element={<ConsultingTenantWorkspacePage />}
            />
            {/* FORGE is a product LINE that can host many bespoke builds, so
                its software lives under a PATH rather than one service key per
                screen: /app/services/forge/<software>/<screen>, with detail
                pages at .../<screen>/<id>. One route serves every screen of
                every build — each build declares its own in forgeSoftware.ts.
                /app/services/forge_overview stays the LINE landing page. */}
            <Route path="services/forge/:software/*" element={<ForgeSoftwareRouter />} />
            {/* The old flat URLs were live only briefly; redirect them rather
                than 404 a bookmark. Non-FORGE keys fall through untouched. */}
            <Route path="services/:legacyForgeKey/:id" element={<LegacyForgeRedirect withId />} />

            {/* F4 (Consulting Rework 2026-06-25) — client-facing intake form
                player. URL: /app/consulting/intake/:submissionId. Outside the
                /services/:serviceKey router because it carries a path param. */}
            <Route
              path="consulting/intake/:submissionId"
              element={<ConsultingIntakeFormPage />}
            />

            {/* F-Client.Consulting (2026-06-29) — CLIENT-facing consulting
                surface. Three tabs (Projects / Deliverables / Service Requests)
                served by ClientConsultingLayout. /app/consulting (no child)
                redirects to /projects as the default landing — matches the
                IconRail "Consulting" target in deriveProduct(). Declared
                BEFORE the /services/:serviceKey catch-all and AFTER the
                /consulting/intake route so each child path resolves first. */}
            <Route path="consulting" element={<ClientConsultingLayout />}>
              <Route index element={<Navigate to="projects" replace />} />
              <Route
                path="projects"
                element={
                  <Suspense fallback={<AdminRouteLoading />}>
                    <ClientConsultingProjectsPage />
                  </Suspense>
                }
              />
              <Route
                path="deliverables"
                element={
                  <Suspense fallback={<AdminRouteLoading />}>
                    <ClientConsultingDeliverablesPage />
                  </Suspense>
                }
              />
              <Route
                path="requests"
                element={
                  <Suspense fallback={<AdminRouteLoading />}>
                    <ClientConsultingServiceRequestsPage />
                  </Suspense>
                }
              />
            </Route>

            {/* All feature-specific pages routed by service key */}
            <Route path="services/:serviceKey" element={<ServiceRouter />} />
          </Route>

          {/* Consultant workspace entry — new-tab passthrough at /c/<tid>.
              Declared BEFORE the catch-all so React Router matches it
              instead of redirecting to "/". The entry component writes the
              tid to sessionStorage and redirects to /app/overview where
              AppGate reads it and bootstraps as the client tenant. */}
          <Route path="/c/:tid" element={<ConsultantWorkspaceEntry />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </PreferencesProvider>
        </BrandKitProvider>
      </AppStateProvider>
    </BrowserRouter>
  );
}
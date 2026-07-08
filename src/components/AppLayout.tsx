import { useLocation } from "react-router-dom";
import { AppShell } from "./AppShell";
import { TenantProvider } from "../lib/tenantContext";
import { useAppState } from "../app/AppState";

// Consultant-workspace flag — written by ConsultantWorkspaceEntry (/c/:tid)
// and read by AppGate + AppShell. sessionStorage = per-tab, so it's ONLY true
// in a tab the founder opened to work inside a client's portal.
const WORKSPACE_FLAG_KEY = "iadm.portal.consultantWorkspace.v1";

/**
 * AppLayout wraps AppShell.
 *
 * 2026-07-05 — view-as tenant scoping fix. When the founder/consultant is
 * inside a client workspace (/c/:tid new-tab flow), AppGate correctly sets
 * activeTenantId to the CLIENT tenant, but that tree mounted no
 * TenantProvider — so the product api-lib hooks (useClientTenantIdOverride)
 * and the fetch layer (getCurrentTenantOverride) fell back to the JWT's own
 * tenant id and every OLIVER/ARION/SPARK/platform call read the founder's
 * OWN tenant. Result: the client portal showed IA's data.
 *
 * Fix: mount the existing TenantProvider (the same mechanism ClientTenantModal
 * uses) around the whole shell, valued at the active (client) tenant while in
 * consultant-workspace mode. It sets BOTH the React context the hooks read AND
 * the module slot the fetch layer reads, so every request is scoped to the
 * client. In normal (non-workspace) sessions value=null → unchanged behavior
 * (hooks/fetch fall back to the caller's own JWT tenant). We do NOT make the
 * hooks subscribe to activeTenantId directly — that caused the earlier
 * acquireTokenSilent → InteractionRequiredAuthError redirect loop
 * (see tenantContext.tsx useClientTenantIdOverride). AppGate only renders this
 * layout after bootstrap, so activeTenantId is already settled and stable
 * per-tab → no override churn.
 */
export function AppLayout() {
  const { activeTenantId } = useAppState();
  const location = useLocation();
  const inConsultantWorkspace = (() => {
    try {
      return sessionStorage.getItem(WORKSPACE_FLAG_KEY) === "true";
    } catch {
      return false;
    }
  })();
  // 2026-07-05 — Founder-admin surfaces (/app/admin/*) ALWAYS operate in the
  // founder's OWN tenant. They must never be scoped to a view-as client, or
  // founder-only endpoints (requireFounder, e.g. GET /consulting/categories)
  // 403 and the page breaks (empty category picker). The view-as tenant
  // override therefore applies to CLIENT surfaces only, not founder-admin routes.
  const isFounderAdminRoute = location.pathname.startsWith("/app/admin/");
  const overrideTenantId =
    inConsultantWorkspace && !isFounderAdminRoute ? activeTenantId : null;

  return (
    <TenantProvider value={overrideTenantId}>
      <AppShell />
    </TenantProvider>
  );
}
// ConsultantWorkspaceEntry — entry route for the new-tab consultant workspace.
//
// Brandon clicks "View as Briarwood" → new tab opens at /c/<tid>. This
// component is the route element for /c/:tid. It captures the tenant id
// from the URL, writes it to sessionStorage where AppGate reads it during
// bootstrap, then redirects to /app/overview. AppGate sees the
// sessionStorage value, calls platform-api /select-tenant for that tid
// (which now accepts consultant_grant access), pins the tab's activeTenantId
// to the client, and ConsultantModeBanner renders the amber strip.
//
// Why this layer is needed: without a Route entry for /c/:tid, React
// Router's catch-all redirects unknown paths to "/" before AppGate ever
// runs — defeating any URL-based detection.

import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";

const CONSULTANT_TARGET_KEY = "iadm.portal.consultantTargetTid.v1";
const WORKSPACE_FLAG_KEY = "iadm.portal.consultantWorkspace.v1";

export function ConsultantWorkspaceEntry() {
  const { tid } = useParams<{ tid: string }>();
  const valid = !!tid && /^[0-9a-f-]{36}$/i.test(tid);

  useEffect(() => {
    if (!valid || !tid) return;
    try {
      sessionStorage.setItem(CONSULTANT_TARGET_KEY, tid);
      sessionStorage.setItem(WORKSPACE_FLAG_KEY, "true");
    } catch {
      /* private mode etc. — best-effort */
    }
  }, [valid, tid]);

  if (!valid) return <Navigate to="/" replace />;
  return <Navigate to="/app/overview" replace />;
}

export default ConsultantWorkspaceEntry;

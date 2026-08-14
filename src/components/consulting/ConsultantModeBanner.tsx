// ConsultantModeBanner — fixed top bar shown in a Consultant Workspace tab.
//
// A founder clicks "View as Briarwood" on the Consulting Clients page →
// Portal opens portal.intelligentanalyticsdm.com/c/<tenant_id> in a NEW
// TAB. The new tab inherits the founder's MSAL session via localStorage
// (same origin), so no re-auth. AppGate detects the /c/:tid URL during
// bootstrap, selects the client tenant via consultant_grant on the
// backend, and writes a sessionStorage flag that THIS banner reads to
// render the "Working in: X" strip on every page in the tab.
//
// Exit closes the tab (or navigates back to the founder's IA home if the
// tab can't close itself — e.g. user opened the link directly).

import { useEffect, useState } from "react";
import { useAppState } from "../../app/AppState";

const WORKSPACE_FLAG_KEY = "iadm.portal.consultantWorkspace.v1";

export function ConsultantModeBanner() {
  const appState = useAppState();
  const [isWorkspace, setIsWorkspace] = useState(false);

  useEffect(() => {
    function check() {
      try {
        setIsWorkspace(sessionStorage.getItem(WORKSPACE_FLAG_KEY) === "true");
      } catch {
        setIsWorkspace(false);
      }
    }
    check();
    window.addEventListener("focus", check);
    window.addEventListener("storage", check);
    const t = window.setInterval(check, 1500);
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", check);
      window.clearInterval(t);
    };
  }, []);

  if (!isWorkspace) return null;

  const tenantName =
    appState.active?.tenant?.tenantFullName ||
    appState.active?.tenant?.tenantName ||
    "Client";

  function exit() {
    try { sessionStorage.removeItem(WORKSPACE_FLAG_KEY); } catch {}
    // 2026-08-06 — tear the workspace down completely. Previously only the
    // banner flag was cleared, so the client's tenant id lingered and the
    // founder's next portal load resumed inside the CLIENT's tenant. Clear the
    // consultant target too, and drop any persisted client tenant so the
    // founder is restored to their own tenant on next load.
    try { sessionStorage.removeItem("iadm.portal.consultantTargetTid.v1"); } catch {}
    try {
      const home = appState.bootstrap?.homeTenantId;
      const stored = localStorage.getItem("iadm.portal.activeTenantId");
      if (stored && home && stored.toLowerCase() !== String(home).toLowerCase()) {
        localStorage.removeItem("iadm.portal.activeTenantId");
      }
    } catch { /* storage unavailable — nothing to clean */ }
    // Try to close the tab. If the browser refuses (because this tab wasn't
    // opened by script), redirect to the founder's home so it's no longer
    // visually a client workspace.
    try { window.close(); } catch {}
    setTimeout(() => {
      if (!window.closed) window.location.href = "/app/overview";
    }, 100);
  }

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        background: "linear-gradient(90deg, #fef3c7 0%, #fde68a 100%)",
        borderBottom: "2px solid #d97706",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        fontSize: 13,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <strong style={{ color: "#78350f", fontSize: 14 }}>
          🟡 Working in: {tenantName}
        </strong>
        <span style={{ marginLeft: 12, color: "#92400e" }}>
          Intelligent Analytics — Consultant Mode · Your edits are attributed to you.
        </span>
      </div>
      <button
        type="button"
        onClick={exit}
        style={{
          background: "#92400e",
          color: "#fff",
          border: 0,
          padding: "6px 14px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Exit workspace
      </button>
    </div>
  );
}

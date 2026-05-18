// ConsultingWorkspacePage — the IA operator client switcher.
//
// Platform admins see every tenant; consultants/PMs see the clients they hold
// an active grant for. "Open workspace" starts an acting-tenant session
// (x-acting-tenant on every product API call; re-validated + audited server
// side). "Exit" returns to the operator's own context.
import { useCallback, useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { authScopes } from "../../auth/msalConfig";
import { useAppState } from "../../app/AppState";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { getConsultingClients, type ConsultingClient } from "../../lib/platformApi";
import {
  getActingTenant, getActingTenantName, setActingTenant, clearActingTenant,
} from "../../lib/consultingSession";
import { Building2, LogIn, LogOut, ShieldCheck } from "lucide-react";

export function ConsultingWorkspacePage() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const { active } = useAppState();
  const [clients, setClients] = useState<ConsultingClient[]>([]);
  const [operatorRole, setOperatorRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const acting = getActingTenant();
  const actingName = getActingTenantName();

  const load = useCallback(async () => {
    if (!account || !active?.tenant?.tenantId) return;
    setLoading(true); setError(null);
    try {
      const r = await instance.acquireTokenSilent({ scopes: authScopes, account });
      const res = await getConsultingClients({
        baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
        bearerToken: r.accessToken,
        tenantId: active.tenant.tenantId,
      });
      setClients(res.clients || []);
      setOperatorRole(res.operatorRole || "");
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [account, active?.tenant?.tenantId, instance]);

  useEffect(() => { load(); }, [load]);

  function openWorkspace(c: ConsultingClient) {
    setActingTenant(c.tenant_id, c.full_name || c.name || c.tenant_id);
    // Hard reload so every api hook picks up the acting header cleanly.
    window.location.href = "/app/services/oliver_billing_overview";
  }
  function exitSession() {
    clearActingTenant();
    window.location.reload();
  }

  const shown = clients.filter((c) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (c.full_name || c.name || "").toLowerCase().includes(q)
      || c.tenant_id.toLowerCase().includes(q);
  });

  return (
    <OliverPageWrapper
      title="Client Workspace"
      subtitle="Switch into a client account to perform consulting work"
      error={error}
      loading={loading}
    >
      {acting && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-900">
            <ShieldCheck className="h-4 w-4" />
            You are working inside <strong>{actingName || acting}</strong> as Intelligent Analytics.
            Every action is attributed and logged.
          </div>
          <button onClick={exitSession}
            className="flex items-center gap-1 text-xs font-semibold text-amber-900 hover:underline">
            <LogOut className="h-3.5 w-3.5" /> Exit session
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Your clients</div>
            <div className="card-sub">
              {operatorRole === "platform_admin"
                ? "Platform admin — all tenants"
                : "Tenants you have an active consulting grant for"}
            </div>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="border border-slate-200 rounded-md px-3 py-1.5 text-sm w-48"
          />
        </div>
        <div className="px-4 pb-4 divide-y divide-slate-100">
          {shown.length === 0 && (
            <div className="py-6 text-sm text-slate-500 text-center">
              No clients available. {operatorRole !== "platform_admin"
                && "You need an active consulting grant — created from a consulting ticket or by a platform admin."}
            </div>
          )}
          {shown.map((c) => {
            const isActing = acting === c.tenant_id;
            return (
              <div key={c.tenant_id} className="py-3 flex items-center gap-3">
                <Building2 className="h-5 w-5 text-slate-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">
                    {c.full_name || c.name || c.tenant_id}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {c.via === "platform_admin" ? "platform admin access" : `grant · scope ${c.scope || "full"}`}
                    {c.expires_at ? ` · expires ${new Date(c.expires_at).toLocaleDateString()}` : ""}
                  </div>
                </div>
                {isActing ? (
                  <span className="text-xs font-semibold text-emerald-600">Active</span>
                ) : (
                  <button onClick={() => openWorkspace(c)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#1A3A4A] hover:bg-[#15303d] text-white text-xs font-semibold">
                    <LogIn className="h-3.5 w-3.5" /> Open workspace
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </OliverPageWrapper>
  );
}

export default ConsultingWorkspacePage;

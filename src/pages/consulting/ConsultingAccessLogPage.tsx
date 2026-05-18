// ConsultingAccessLogPage — client transparency.
//
// Shows whether Intelligent Analytics manages this account, lets a tenant
// admin turn managed consulting on/off (off instantly revokes all active
// grants), and lists every consulting action IA has taken in this tenant
// (sourced from platform.audit_log).
import { useCallback, useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { authScopes } from "../../auth/msalConfig";
import { useAppState } from "../../app/AppState";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  getConsultingManaged, getConsultingAccessLog, setConsultingManaged,
  type ConsultingAccessEntry,
} from "../../lib/platformApi";
import { ShieldCheck, ShieldOff } from "lucide-react";

export function ConsultingAccessLogPage() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const { active } = useAppState();
  const [managed, setManaged] = useState<boolean>(false);
  const [activeGrants, setActiveGrants] = useState<number>(0);
  const [entries, setEntries] = useState<ConsultingAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!account || !active?.tenant?.tenantId) return;
    setLoading(true); setError(null);
    try {
      const r = await instance.acquireTokenSilent({ scopes: authScopes, account });
      const base = import.meta.env.VITE_PLATFORM_API_BASE_URL;
      const tid = active.tenant.tenantId;
      const [m, log] = await Promise.all([
        getConsultingManaged({ baseUrl: base, bearerToken: r.accessToken, tenantId: tid }),
        getConsultingAccessLog({ baseUrl: base, bearerToken: r.accessToken, tenantId: tid })
          .catch(() => ({ entries: [] as ConsultingAccessEntry[] })),
      ]);
      setManaged(m.managed);
      setActiveGrants(m.activeGrants);
      setEntries(log.entries || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [account, active?.tenant?.tenantId, instance]);

  useEffect(() => { load(); }, [load]);

  async function toggle(next: boolean) {
    if (!account || !active?.tenant?.tenantId) return;
    setBusy(true);
    try {
      const r = await instance.acquireTokenSilent({ scopes: authScopes, account });
      await setConsultingManaged({
        baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
        bearerToken: r.accessToken,
        tenantId: active.tenant.tenantId,
        enabled: next,
      });
      await load();
    } catch (err) { setError(err); }
    finally { setBusy(false); }
  }

  return (
    <OliverPageWrapper
      title="Intelligent Analytics Access"
      subtitle="Full transparency on managed consulting for this account"
      error={error}
      loading={loading}
    >
      <div className={`mb-4 rounded-md border px-4 py-3 flex items-center justify-between ${
        managed ? "border-[#1A7DB5]/30 bg-[#1A7DB5]/5" : "border-slate-200 bg-slate-50"}`}>
        <div className="flex items-center gap-2 text-sm">
          {managed
            ? <ShieldCheck className="h-5 w-5 text-[#1A7DB5]" />
            : <ShieldOff className="h-5 w-5 text-slate-400" />}
          <span className="text-slate-800">
            {managed
              ? <>Intelligent Analytics is providing managed consulting on this account
                  {activeGrants > 0 ? ` (${activeGrants} active grant${activeGrants === 1 ? "" : "s"})` : ""}.</>
              : "Managed consulting is off. Intelligent Analytics cannot access this account."}
          </span>
        </div>
        <button
          onClick={() => toggle(!managed)}
          disabled={busy}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-60 ${
            managed
              ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
              : "bg-[#1A3A4A] text-white hover:bg-[#15303d]"}`}
        >
          {busy ? "Working…" : managed ? "Turn off & revoke access" : "Enable managed consulting"}
        </button>
      </div>

      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Access log</div>
            <div className="card-sub">Everything Intelligent Analytics has done in this account</div>
          </div>
        </div>
        <div className="px-4 pb-4 overflow-x-auto">
          {entries.length === 0 ? (
            <div className="py-6 text-sm text-slate-500 text-center">No IA access recorded.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 border-b border-slate-200">
                  <th className="py-2 pr-3 font-semibold">When</th>
                  <th className="py-2 px-3 font-semibold">Who</th>
                  <th className="py-2 px-3 font-semibold">Action</th>
                  <th className="py-2 pl-3 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">
                      {new Date(e.occurred_at).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-slate-700">{e.user_email || "—"}</td>
                    <td className="py-2 px-3">
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {e.action.replace(/^consulting\./, "")}
                      </span>
                    </td>
                    <td className="py-2 pl-3 text-slate-600">{e.summary || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </OliverPageWrapper>
  );
}

export default ConsultingAccessLogPage;

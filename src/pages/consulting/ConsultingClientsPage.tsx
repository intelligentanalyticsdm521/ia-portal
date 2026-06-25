// ConsultingClientsPage — entry point for the Client Tenant Modal in
// CONSULTING mode (workspace for ongoing client work, NOT onboarding).
//
// Brandon picks a client tenant → modal opens scoped to that tenant. SPARK
// campaigns, OLIVER templates, ARION insights — all rendered with the
// client's data via the React-context tenant override. Audit columns still
// stamp Brandon's identity.
//
// Reuses the existing founder-only endpoint
//   GET /admin/onboard-client/in-progress
// which returns every active tenant in the last 90 days. We filter on
// "fully onboarded" (has stripe sub OR onboarding_completed_at) so this
// list is "live clients" — not in-progress onboardings.
import { useEffect, useMemo, useState } from "react";
import { Building2, ExternalLink, Eye, Search } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { ClientTenantModal } from "../../components/consulting/ClientTenantModal";
import { CORE_BLUE } from "../../components/IadmModal";
import { useAppState } from "../../app/AppState";
import { startViewAsTenant } from "../../lib/viewAsTenant";

interface ClientRow {
  tenant_id: string;
  business_name: string;
  contact_email: string;
  status?: string | null;
  signup_product?: string | null;
  stripe_subscription_id?: string | null;
  city?: string | null;
  state_province?: string | null;
  created_at?: string;
  onboarding_completed_at?: string | null;
}

export default function ConsultingClientsPage() {
  const { get } = useOliverApi();
  const appState = useAppState();
  // F-X — View-as entry gated on isFounder (decoupled from isSuperUser per
  // locked rule reference_role_access_model.md). The whole Consulting nav
  // section is already founder-only via AppShell's applyConsultingNavFilter,
  // but we double-gate the action button as defence in depth.
  const isFounder = !!appState.bootstrap?.user?.isFounder;
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [modal, setModal] = useState<{ tenantId: string; tenantName: string } | null>(null);

  function handleViewAs(tenantId: string, tenantName: string) {
    startViewAsTenant(tenantId, tenantName);
    // Reload onto the founder's normal home so every page re-fetches against
    // the client tenant. Same shape the EmergencyActAsBanner uses, minus the
    // /super/select-tenant call (because view-as does NOT swap the session).
    window.location.assign("/app/overview");
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    get<ClientRow[]>("/admin/onboard-client/in-progress")
      .then((r) => { if (!cancelled) setRows(Array.isArray(r) ? r : []); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [get]);

  const live = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows
      .filter((r) => r.onboarding_completed_at || r.stripe_subscription_id)
      .filter((r) => !q || (r.business_name || "").toLowerCase().includes(q) || (r.contact_email || "").toLowerCase().includes(q))
      .sort((a, b) => (a.business_name || "").localeCompare(b.business_name || ""));
  }, [rows, filter]);

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="h-6 w-6" style={{ color: CORE_BLUE }} />
          Clients
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Open a client's workspace to run consulting work — SPARK campaigns, OLIVER templates, ARION insights — scoped to their tenant. Audit logs still attribute everything to you.
        </p>
      </div>

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or email…"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm"
        />
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Loading clients…</div>
      ) : live.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No fully-onboarded clients yet. New onboardings show up here once Save &amp; Finish has run.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Business</th>
                <th className="text-left px-4 py-2 font-semibold">Contact</th>
                <th className="text-left px-4 py-2 font-semibold">Products</th>
                <th className="text-left px-4 py-2 font-semibold">Location</th>
                <th className="text-right px-4 py-2 font-semibold">Workspace</th>
              </tr>
            </thead>
            <tbody>
              {live.map((c) => (
                <tr key={c.tenant_id} className="border-t border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-4 py-3 font-semibold text-slate-900">{c.business_name || "Unnamed tenant"}</td>
                  <td className="px-4 py-3 text-slate-700">{c.contact_email || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{c.signup_product || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{[c.city, c.state_province].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {isFounder ? (
                        <button
                          onClick={() => handleViewAs(c.tenant_id, c.business_name || "Tenant")}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
                          title="See exactly what this client sees in their portal (read-only)"
                        >
                          <Eye className="h-3 w-3" />
                          View as
                        </button>
                      ) : null}
                      <button
                        onClick={() => setModal({ tenantId: c.tenant_id, tenantName: c.business_name || "Tenant" })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
                        style={{ background: CORE_BLUE }}
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ClientTenantModal
        open={!!modal}
        tenantId={modal?.tenantId || null}
        tenantName={modal?.tenantName}
        mode="consulting"
        onClose={() => setModal(null)}
      />
    </div>
  );
}

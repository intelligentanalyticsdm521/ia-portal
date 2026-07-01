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
import { CORE_BLUE } from "../../components/IadmModal";
import { useAppState } from "../../app/AppState";

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
  has_byb_subscription?: boolean;
}

// G3-S7: use ?clients_nav=1 for the 4-branch server-side filter (per SCOPE_WORKING.md Delta 2 Amended). Backend at /admin/consulting/clients-nav-branch.
type ClientsNavRow = {
  tenant_id: string;
  name: string;
  branch_reason: 'active_project' | 'recently_closed' | 'byb_sub' | 'paid_finished_onboarding' | null;
};

export default function ConsultingClientsPage() {
  const { get } = useOliverApi();
  const appState = useAppState();
  // F-X — View-as entry gated on isFounder (decoupled from isSuperUser per
  // locked rule reference_role_access_model.md). The whole Consulting nav
  // section is already founder-only via AppShell's applyConsultingNavFilter,
  // but we double-gate the action button as defence in depth.
  const isFounder = !!appState.bootstrap?.user?.isFounder;
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [clientsNav, setClientsNav] = useState<ClientsNavRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  function openClientWorkspace(tenantId: string, _tenantName: string) {
    // Open the client workspace in a NEW TAB at /c/:tid. The new tab
    // inherits the founder's MSAL session via localStorage (same origin)
    // so there's no re-auth. AppGate detects the /c/:tid URL during
    // bootstrap and bootstraps as the client tenant via consultant_grant.
    // The amber ConsultantModeBanner appears on every page in that tab.
    window.open(`/c/${tenantId}`, "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      get<ClientRow[]>("/admin/onboard-client/in-progress").catch(() => []),
      // G3-S7: use ?clients_nav=1 for the 4-branch server-side filter (per SCOPE_WORKING.md Delta 2 Amended). Backend at /admin/consulting/clients-nav-branch.
      get<{ clients?: ClientsNavRow[] }>("/consulting/projects?clients_nav=1").catch(() => ({ clients: [] as ClientsNavRow[] })),
    ])
      .then(([clients, navResp]) => {
        if (cancelled) return;
        setRows(Array.isArray(clients) ? clients : []);
        const list = Array.isArray((navResp as { clients?: ClientsNavRow[] })?.clients)
          ? ((navResp as { clients: ClientsNavRow[] }).clients)
          : [];
        setClientsNav(list);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [get]);

  // G3-S7: server does the 4-branch filter; client just filters by search.
  // We join with `rows` (from /admin/onboard-client/in-progress) opportunistically
  // to preserve contact/location details when available, but the visible list
  // is driven by the server's clients_nav response.
  const rowsByTenant = useMemo(() => {
    const m = new Map<string, ClientRow>();
    for (const r of rows) {
      const k = (r.tenant_id || "").toLowerCase();
      if (k) m.set(k, r);
    }
    return m;
  }, [rows]);

  const live = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return clientsNav
      .filter((c) => {
        if (!q) return true;
        const extra = rowsByTenant.get((c.tenant_id || "").toLowerCase());
        return (
          (c.name || "").toLowerCase().includes(q) ||
          (extra?.contact_email || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [clientsNav, rowsByTenant, filter]);

  function branchReasonLabel(r: ClientsNavRow['branch_reason']): string {
    switch (r) {
      case 'active_project': return 'Active project';
      case 'recently_closed': return 'Recently closed';
      case 'byb_sub': return 'Build Your Brand';
      case 'paid_finished_onboarding': return 'Paid — finished onboarding';
      default: return '—';
    }
  }

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
                <th className="text-left px-4 py-2 font-semibold">Branch Reason</th>
                <th className="text-right px-4 py-2 font-semibold">Workspace</th>
              </tr>
            </thead>
            <tbody>
              {live.map((c) => (
                <tr key={c.tenant_id} className="border-t border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-4 py-3 font-semibold text-slate-900">{c.name || "Unnamed tenant"}</td>
                  <td className="px-4 py-3 text-slate-600">{branchReasonLabel(c.branch_reason)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {isFounder ? (
                        <button
                          onClick={() => openClientWorkspace(c.tenant_id, c.name || "Tenant")}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
                          title="See exactly what this client sees in their portal (read-only)"
                        >
                          <Eye className="h-3 w-3" />
                          View as
                        </button>
                      ) : null}
                      <button
                        onClick={() => openClientWorkspace(c.tenant_id, c.name || "Tenant")}
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

    </div>
  );
}

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
import { Building2, ExternalLink, Eye, Search, Mail, Phone, User, Folder, CheckCircle2 } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { IadmModal, IadmButton, CORE_BLUE } from "../../components/IadmModal";
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

// F-Founder.1 — Client details modal shape. `/consulting/projects` returns
// the founder-scope project list; we filter to this tenant on the client.
interface ClientProjectRow {
  project_id: string;
  name: string;
  status: string;
  linked_tenant_id?: string | null;
  updated_at?: string;
  current_milestone_name?: string | null;
}

// F-Founder.1 — Richer contact fields come from /admin/tenant-workspace/:tid
// which already backs ConsultingTenantWorkspacePage. Only the fields the
// modal actually renders are typed here.
interface TenantWorkspaceLite {
  business_name?: string | null;
  primary_contact_email?: string | null;
  primary_contact_phone?: string | null;
  saas_stripe_subscription_id?: string | null;
}

export default function ConsultingClientsPage() {
  const { get, getFounder } = useOliverApi();
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

  // F-Founder.1 — Client details modal. Row-click opens; Access Portal
  // button inside then window.opens /c/:tid. This gives us a beat to show
  // contact info + active projects + BYB status before jumping into the
  // client tenant's workspace.
  const [selectedClient, setSelectedClient] = useState<ClientsNavRow | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsTenant, setDetailsTenant] = useState<TenantWorkspaceLite | null>(null);
  const [detailsProjects, setDetailsProjects] = useState<ClientProjectRow[]>([]);

  function openClientWorkspace(tenantId: string) {
    // Open the client workspace in a NEW TAB at /c/:tid. The new tab
    // inherits the founder's MSAL session via localStorage (same origin)
    // so there's no re-auth. AppGate detects the /c/:tid URL during
    // bootstrap and bootstraps as the client tenant via consultant_grant.
    // The amber ConsultantModeBanner appears on every page in that tab.
    window.open(`/c/${tenantId}`, "_blank", "noopener,noreferrer");
  }

  // Load per-client details when a row opens the modal. Two parallel
  // reuses of existing endpoints:
  //   GET /admin/tenant-workspace/:tid  — business_name + primary contact
  //   GET /consulting/projects           — founder-scope project list, we
  //                                        filter to this tenant client-side
  // We deliberately don't add a new endpoint per the scope note.
  useEffect(() => {
    if (!selectedClient) {
      setDetailsTenant(null);
      setDetailsProjects([]);
      return;
    }
    const tid = selectedClient.tenant_id;
    let cancelled = false;
    setDetailsLoading(true);
    setDetailsTenant(null);
    setDetailsProjects([]);
    Promise.all([
      // /admin/tenant-workspace/:tid is founder-gated on the backend; guard
      // the frontend caller too so a non-founder view doesn't reject-log.
      isFounder
        ? getFounder<{ tenant?: TenantWorkspaceLite }>(`/admin/tenant-workspace/${encodeURIComponent(tid)}`).catch(() => null)
        : Promise.resolve(null),
      // F-Founder.1 — server-side filter by linked_tenant_id so we don't
      // pull every founder project just to filter to one. The client-side
      // filter below stays as a safety net.
      get<ClientProjectRow[]>(`/consulting/projects?linked_tenant_id=${encodeURIComponent(tid)}`).catch(() => []),
    ])
      .then(([wsResp, projResp]) => {
        if (cancelled) return;
        setDetailsTenant(wsResp && wsResp.tenant ? wsResp.tenant : null);
        const list = Array.isArray(projResp) ? projResp : [];
        setDetailsProjects(list.filter((p) => (p.linked_tenant_id || "").toLowerCase() === tid.toLowerCase()));
      })
      .finally(() => { if (!cancelled) setDetailsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedClient, get, getFounder, isFounder]);

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
                <tr
                  key={c.tenant_id}
                  className="border-t border-slate-100 hover:bg-slate-50 transition cursor-pointer"
                  onClick={() => setSelectedClient(c)}
                >
                  <td className="px-4 py-3 font-semibold text-slate-900">{c.name || "Unnamed tenant"}</td>
                  <td className="px-4 py-3 text-slate-600">{branchReasonLabel(c.branch_reason)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {isFounder ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); openClientWorkspace(c.tenant_id); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
                          title="See exactly what this client sees in their portal (read-only)"
                        >
                          <Eye className="h-3 w-3" />
                          View as
                        </button>
                      ) : null}
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedClient(c); }}
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

      {/* F-Founder.1 — Client details modal. Opens on row click; Access
          Portal button jumps to /c/:tid in a new tab (same flow as before). */}
      <ClientDetailsModal
        open={!!selectedClient}
        client={selectedClient}
        loading={detailsLoading}
        tenant={detailsTenant}
        projects={detailsProjects}
        rowFromList={selectedClient ? rows.find((r) => (r.tenant_id || "").toLowerCase() === selectedClient.tenant_id.toLowerCase()) || null : null}
        branchLabel={selectedClient ? branchReasonLabel(selectedClient.branch_reason) : ""}
        onClose={() => setSelectedClient(null)}
        onAccessPortal={(tid) => { openClientWorkspace(tid); }}
      />
    </div>
  );
}

// ── F-Founder.1 — Client details modal ─────────────────────────────────
// Extracted as a small internal component so the page component stays
// readable. Renders inside an IadmModal ("info" size) so it inherits the
// standard header/footer chrome.
function ClientDetailsModal({
  open, client, loading, tenant, projects, rowFromList, branchLabel, onClose, onAccessPortal,
}: {
  open: boolean;
  client: ClientsNavRow | null;
  loading: boolean;
  tenant: TenantWorkspaceLite | null;
  projects: ClientProjectRow[];
  rowFromList: ClientRow | null;
  branchLabel: string;
  onClose: () => void;
  onAccessPortal: (tenantId: string) => void;
}) {
  if (!client) return null;
  // Prefer richer tenant-workspace fields; fall back to what the clients-nav
  // + in-progress rows already gave us so the modal still renders even if
  // /admin/tenant-workspace 404s or races.
  const businessName = tenant?.business_name || client.name || rowFromList?.business_name || "Unnamed tenant";
  const email = tenant?.primary_contact_email || rowFromList?.contact_email || null;
  const phone = tenant?.primary_contact_phone || null;
  // BYB status: the clients-nav branch reason is authoritative when it says
  // 'byb_sub'. Otherwise fall back to the in-progress row's flag if we have
  // it (some tenants have both a paid signup AND a BYB subscription).
  const hasBYB = client.branch_reason === 'byb_sub' || !!rowFromList?.has_byb_subscription;

  // Sort projects: open work first (anything not completed/closed/cancelled),
  // then most recently updated. Keeps "what's happening now" at the top.
  const sortedProjects = projects.slice().sort((a, b) => {
    const openA = !['completed', 'closed', 'cancelled'].includes(String(a.status || '').toLowerCase()) ? 0 : 1;
    const openB = !['completed', 'closed', 'cancelled'].includes(String(b.status || '').toLowerCase()) ? 0 : 1;
    if (openA !== openB) return openA - openB;
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  });

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="oliver"
      eyebrow="CLIENT"
      title={businessName}
      subtitle={branchLabel || undefined}
      size="info"
      footer={(
        <>
          <IadmButton variant="ghost" onClick={onClose}>Close</IadmButton>
          <IadmButton
            variant="primary"
            onClick={() => onAccessPortal(client.tenant_id)}
            icon={<ExternalLink className="h-3 w-3" />}
          >
            Access Portal
          </IadmButton>
        </>
      )}
    >
      <div className="px-5 py-4 space-y-5 text-sm">
        {/* Contact block */}
        <section>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Primary Contact</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex items-center gap-2 text-slate-700">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span className="truncate">{businessName}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <User className="h-3.5 w-3.5 text-slate-400" />
              <span className="truncate">{email ? email.split('@')[0] : "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <Mail className="h-3.5 w-3.5 text-slate-400" />
              <span className="truncate">{email || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <Phone className="h-3.5 w-3.5 text-slate-400" />
              <span className="truncate">{phone || "—"}</span>
            </div>
          </div>
        </section>

        {/* Subscriptions block */}
        <section>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Subscriptions</div>
          <div className="flex items-center gap-2">
            {hasBYB ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                <CheckCircle2 className="h-3 w-3" />
                Build Your Brand
              </span>
            ) : (
              <span className="text-xs text-slate-500">No Build Your Brand subscription.</span>
            )}
          </div>
        </section>

        {/* Projects block */}
        <section>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
            <Folder className="h-3 w-3" />
            Projects
          </div>
          {loading ? (
            <div className="text-xs text-slate-500">Loading…</div>
          ) : sortedProjects.length === 0 ? (
            <div className="text-xs text-slate-500 italic">No projects linked to this client yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
              {sortedProjects.map((p) => (
                <li key={p.project_id} className="px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 truncate">{p.name || "(untitled project)"}</div>
                    {p.current_milestone_name ? (
                      <div className="text-[11px] text-slate-500 truncate">{p.current_milestone_name}</div>
                    ) : null}
                  </div>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 flex-shrink-0">
                    {String(p.status || '—').replace(/_/g, ' ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </IadmModal>
  );
}

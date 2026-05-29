// OliverPortalsHubPage — F-114.
//
// Single consolidated admin page that replaces the 3 scattered surfaces:
//   - oliver_portal_designer (white-label / theme)
//   - oliver_portal_domains  (subdomain + custom domain binding)
//   - signup-form portion of oliver_workflow_settings
//
// Layout: two side-by-side cards (Customer Portal + Crew Portal) showing
// status + URL + "Edit portal" button. Clicking Edit opens an info-size
// modal (F-107) with 4 tabs: Design / Signup form / Domain / Workflow.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import {
  Users, Wrench, ExternalLink, Globe, Settings, Brush, FileText,
  AlertTriangle, CheckCircle2, Clock,
} from "lucide-react";

type PortalKind = "customer" | "crew";
type Tab = "design" | "signup" | "domain" | "workflow";

interface PortalStatus {
  subdomain_slug: string | null;
  custom_domain: string | null;
  custom_domain_status: "none" | "pending" | "ready" | "failed";
  is_published: boolean;
  member_count: number;
}

interface HubData {
  customer: PortalStatus;
  crew: PortalStatus;
}

const DEFAULT_CUSTOMER_HOST = "customer.ia-dm.com";
const DEFAULT_CREW_HOST = "crew.ia-dm.com";

function portalUrl(p: PortalStatus, kind: PortalKind): string {
  if (p.custom_domain && p.custom_domain_status === "ready") return `https://${p.custom_domain}`;
  const slug = p.subdomain_slug || "your-tenant-slug";
  return `https://${slug}.${kind === "customer" ? DEFAULT_CUSTOMER_HOST : DEFAULT_CREW_HOST}`;
}

export function OliverPortalsHubPage() {
  const { get, ready } = useOliverApi();
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<{ kind: PortalKind; tab: Tab } | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: HubData }>("/portals/hub");
      setData(r.data || null);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  // Fallback for older deploys where /portals/hub isn't wired yet — show
  // skeleton with no data so the page itself is still usable.
  const customer: PortalStatus = data?.customer || { subdomain_slug: null, custom_domain: null, custom_domain_status: "none", is_published: false, member_count: 0 };
  const crew: PortalStatus = data?.crew || { subdomain_slug: null, custom_domain: null, custom_domain_status: "none", is_published: false, member_count: 0 };

  return (
    <OliverPageWrapper
      title="Customer & Crew Portals"
      subtitle="One place to configure design, signup forms, custom domains, and workflow for both portals."
      error={error}
      loading={loading}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <PortalCard
          kind="customer"
          icon={Users}
          accent="#1A3A4A"
          name="Customer Portal"
          tagline="Self-serve experience for your customers"
          status={customer}
          memberLabel="customers"
          onEdit={(tab) => setEditing({ kind: "customer", tab })}
        />
        <PortalCard
          kind="crew"
          icon={Wrench}
          accent="#FEC82C"
          name="Crew Portal"
          tagline="Field workers' job board + actions"
          status={crew}
          memberLabel="workers"
          onEdit={(tab) => setEditing({ kind: "crew", tab })}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <strong className="text-slate-900">Shared infrastructure:</strong> both portals run on the same
        per-tenant CIAM. Notification rules, branding (logo + colors), and tenant DNS are managed at the
        business-profile level. Per-portal config (signup fields, design, domain, workflow) is here.
      </div>

      {editing && (
        <PortalEditorModal
          portalKind={editing.kind}
          status={editing.kind === "customer" ? customer : crew}
          initialTab={editing.tab}
          onClose={() => setEditing(null)}
          onSaved={() => { load(); }}
        />
      )}
    </OliverPageWrapper>
  );
}

function PortalCard({
  kind, icon: Icon, accent, name, tagline, status, memberLabel, onEdit,
}: {
  kind: PortalKind;
  icon: typeof Users;
  accent: string;
  name: string;
  tagline: string;
  status: PortalStatus;
  memberLabel: string;
  onEdit: (tab: Tab) => void;
}) {
  const url = portalUrl(status, kind);
  const domainBadge = (() => {
    if (status.custom_domain && status.custom_domain_status === "ready")
      return { label: "Custom domain", color: "emerald", icon: CheckCircle2 };
    if (status.custom_domain && status.custom_domain_status === "pending")
      return { label: "Verifying domain", color: "amber", icon: Clock };
    if (status.custom_domain && status.custom_domain_status === "failed")
      return { label: "Domain failed", color: "rose", icon: AlertTriangle };
    return { label: "Default subdomain", color: "slate", icon: Globe };
  })();
  const BadgeIcon = domainBadge.icon;

  return (
    <div className="rounded-xl border-2 bg-white p-5" style={{ borderLeftColor: accent, borderLeftWidth: 4 }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md flex items-center justify-center" style={{ background: `${accent}22` }}>
            <Icon className="h-5 w-5" style={{ color: accent }} />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900">{name}</div>
            <div className="text-xs text-slate-500">{tagline}</div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase border ${
            domainBadge.color === "emerald" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
            domainBadge.color === "amber" ? "bg-amber-50 text-amber-700 border-amber-200" :
            domainBadge.color === "rose" ? "bg-rose-50 text-rose-700 border-rose-200" :
            "bg-slate-100 text-slate-600 border-slate-200"
          }`}
        >
          <BadgeIcon className="h-3 w-3" /> {domainBadge.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-md bg-slate-50 border border-slate-200 p-2">
          <div className="text-[10px] uppercase font-semibold text-slate-500">URL</div>
          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline truncate block">{url.replace(/^https:\/\//, "")}</a>
        </div>
        <div className="rounded-md bg-slate-50 border border-slate-200 p-2">
          <div className="text-[10px] uppercase font-semibold text-slate-500">{memberLabel}</div>
          <div className="text-sm font-semibold text-slate-900 tabular-nums">{status.member_count.toLocaleString()}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ExternalLink className="h-3 w-3" /> Open portal
        </a>
        <button onClick={() => onEdit("design")} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ background: accent, color: accent === "#FEC82C" ? "#1A3A4A" : "#fff" }}>
          <Brush className="h-3 w-3" /> Edit portal
        </button>
      </div>
    </div>
  );
}

// ── Modal with 4 tabs ─────────────────────────────────────────────────────────

function PortalEditorModal({
  portalKind, status, initialTab, onClose, onSaved,
}: {
  portalKind: PortalKind;
  status: PortalStatus;
  initialTab: Tab;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const accent = portalKind === "customer" ? "#1A3A4A" : "#FEC82C";

  const tabs: Array<{ key: Tab; label: string; icon: typeof Brush }> = [
    { key: "design",   label: "Design",      icon: Brush },
    { key: "signup",   label: "Signup form", icon: FileText },
    { key: "domain",   label: "Domain",      icon: Globe },
    { key: "workflow", label: "Workflow",    icon: Settings },
  ];

  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow={`${portalKind === "customer" ? "CUSTOMER" : "CREW"} PORTAL · EDIT`}
      title={`${portalKind === "customer" ? "Customer" : "Crew"} portal settings`}
      subtitle="Design, signup form, domain, and workflow — all per-portal."
      size="info"
      footer={
        <>
          <IadmButton variant="ghost" onClick={onClose}>Done</IadmButton>
        </>
      }
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.key ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /><span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "design" && <DesignTabStub portalKind={portalKind} accent={accent} onSaved={onSaved} />}
          {tab === "signup" && <SignupTabStub portalKind={portalKind} accent={accent} onSaved={onSaved} />}
          {tab === "domain" && <DomainTabStub portalKind={portalKind} status={status} accent={accent} onSaved={onSaved} />}
          {tab === "workflow" && <WorkflowTabStub portalKind={portalKind} accent={accent} onSaved={onSaved} />}
        </div>
      </div>
    </IadmModal>
  );
}

// ── Tab content stubs ─────────────────────────────────────────────────────────
//
// Each tab currently links out to the existing scattered page until F-114
// phase 2 absorbs their content inline. This keeps F-114 phase 1 shippable
// tonight while preserving deep-link safety.

function StubLink({ label, route, icon: Icon }: { label: string; route: string; icon: typeof Brush }) {
  return (
    <a
      href={route}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      <Icon className="h-3 w-3" /> {label}
    </a>
  );
}

function DesignTabStub({ portalKind, accent }: { portalKind: PortalKind; accent: string; onSaved: () => void }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Design</h3>
      <p className="text-xs text-slate-600">
        Button visibility, labels, font, header/footer, custom CSS. Gated on the Client Experience add-on.
      </p>
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="text-[11px] text-slate-500 mb-2">Configure on the standalone designer (will be inlined in a follow-up release):</div>
        <StubLink label={`Open ${portalKind} portal designer`} route="/app/services/oliver_portal_designer" icon={Brush} />
      </div>
      <div className="text-[10px] text-slate-400">Accent color preview: <span className="inline-block w-4 h-4 rounded-full align-middle ml-1" style={{ background: accent }} /></div>
    </div>
  );
}

function SignupTabStub({ portalKind, accent }: { portalKind: PortalKind; accent: string; onSaved: () => void }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Signup form</h3>
      <p className="text-xs text-slate-600">
        Pick which fields you collect at signup. Built-in fields plus your own custom fields, with required toggles and label customization.
      </p>
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="text-[11px] text-slate-500 mb-2">Configure on the signup form builder:</div>
        <StubLink label={`Open ${portalKind} signup form builder`} route="/app/services/oliver_workflow_settings#signup-form" icon={FileText} />
      </div>
      <div className="text-[10px] text-slate-400">Accent: <span className="inline-block w-4 h-4 rounded-full align-middle ml-1" style={{ background: accent }} /></div>
    </div>
  );
}

function DomainTabStub({ portalKind, status, accent }: { portalKind: PortalKind; status: PortalStatus; accent: string; onSaved: () => void }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Domain</h3>
      <p className="text-xs text-slate-600">
        Default subdomain on <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">{portalKind}.ia-dm.com</code>, or bring your own custom domain (Pro+).
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="text-[10px] uppercase font-semibold text-slate-500">Subdomain slug</div>
          <div className="font-mono text-slate-900">{status.subdomain_slug || "(not set)"}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="text-[10px] uppercase font-semibold text-slate-500">Custom domain</div>
          <div className="font-mono text-slate-900">{status.custom_domain || "—"}</div>
          <div className="text-[10px] text-slate-500">Status: {status.custom_domain_status}</div>
        </div>
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="text-[11px] text-slate-500 mb-2">Manage domain binding:</div>
        <StubLink label="Open Portals & Domains" route="/app/services/oliver_portal_domains" icon={Globe} />
      </div>
      <div className="text-[10px] text-slate-400">Accent: <span className="inline-block w-4 h-4 rounded-full align-middle ml-1" style={{ background: accent }} /></div>
    </div>
  );
}

function WorkflowTabStub({ portalKind, accent }: { portalKind: PortalKind; accent: string; onSaved: () => void }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Workflow</h3>
      <p className="text-xs text-slate-600">
        Portal-side workflow: reschedule policy, post-booking actions, and customer-initiated request handling.
      </p>
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="text-[11px] text-slate-500 mb-2">Configure workflow rules:</div>
        <StubLink label="Open Workflow Settings" route="/app/services/oliver_workflow_settings" icon={Settings} />
      </div>
      <div className="text-[10px] text-slate-400">{portalKind} portal · accent <span className="inline-block w-4 h-4 rounded-full align-middle ml-1" style={{ background: accent }} /></div>
    </div>
  );
}

export default OliverPortalsHubPage;

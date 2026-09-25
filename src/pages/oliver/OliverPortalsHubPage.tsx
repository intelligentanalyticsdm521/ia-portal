// OliverPortalsHubPage — F-114.
//
// Single consolidated admin page that replaces the 3 scattered surfaces:
//   - oliver_portal_designer (white-label / theme; the page itself was deleted
//     2026-09-25, its job is the Look tab)
//   - oliver_portal_domains  (subdomain + custom domain binding)
//   - signup-form portion of oliver_workflow_settings
//
// Layout: two side-by-side cards (Customer Portal + Crew Portal) showing
// status + URL + "Edit portal" button. Clicking Edit opens an info-size
// modal (F-107) with the tabs Look (customer portal only) / Signup form /
// Layout / Domain / Workflow.
//
// 2026-09-25 (CUSTOMER_PORTAL_LOOK_SCOPE §5.3 C): the Design tab became Look
// (./look/LookTab.tsx) — five styles, the brand switch, Buttons & functions and
// a live preview of the real customer portal. The Design tab's colour pickers,
// font list, header/footer copy and custom CSS box are gone: they saved to
// portal_design and nothing read them. The crew portal has no look to choose
// (the contract's look is the customer portal's), so its editor opens on
// Signup form.
import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { SignupFormBuilder, type SignupConfig as SignupConfigFull } from "../../components/oliver/SignupFormBuilder";
import { PortalActivationWizard } from "../../components/oliver/PortalActivationWizard";
import { PortalLayoutTab } from "../../components/oliver/PortalLayoutTab";
import { AppLinksCard } from "../../components/oliver/AppLinksCard";
import { LookTab, useLookEditor } from "./look/LookTab";
import { lookPreviewSrc } from "./look/lookModel";
import {
  Users, Wrench, ExternalLink, Globe, Settings, Brush, FileText,
  AlertTriangle, CheckCircle2, Clock, Palette, Layers,
} from "lucide-react";

type PortalKind = "customer" | "crew";
type Tab = "look" | "signup" | "layout" | "domain" | "workflow";

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

/**
 * Q-APPS-PWA — the business is in the PATH now, not the host.
 *
 * `https://customer.ia-dm.com/summit-lawn/`, not
 * `https://summit-lawn.customer.ia-dm.com/`. Azure Static Web Apps binds a
 * handful of custom domains per app, so a subdomain per client ran out at
 * roughly the sixth; three domains for the whole platform does not.
 *
 * The old subdomains stay bound and 301 to this shape (SEAM-5-B), so anything
 * already printed still works — but this is the address we now SHOW, because
 * it is the one that installs as its own app.
 *
 * A business on its own domain is unchanged: they own that whole origin.
 */
function portalUrl(p: PortalStatus, kind: PortalKind): string {
  if (p.custom_domain && p.custom_domain_status === "ready") return `https://${p.custom_domain}`;
  const slug = p.subdomain_slug || "your-tenant-slug";
  return `https://${kind === "customer" ? DEFAULT_CUSTOMER_HOST : DEFAULT_CREW_HOST}/${slug}/`;
}

/**
 * Where the Look tab's live preview loads the customer portal: the address
 * portalUrl() prints, with ?look=preview on it. Local dev runs the customer app
 * on :5175 (dev-stack start-portals-dev.cmd) rather than customer.ia-dm.com, so
 * a dev build swaps the origin and keeps the /<slug>/ path. Build-time constant:
 * a production bundle never carries the localhost branch.
 */
const DEV_CUSTOMER_PORTAL_ORIGIN = "http://localhost:5175";

function customerPreviewSrc(p: PortalStatus): string | null {
  return lookPreviewSrc(portalUrl(p, "customer"), p.subdomain_slug, import.meta.env.DEV ? DEV_CUSTOMER_PORTAL_ORIGIN : null);
}

export function OliverPortalsHubPage() {
  const { get, ready } = useOliverApi();
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<{ kind: PortalKind; tab: Tab } | null>(null);
  // F-127 — first-run activation wizard. Opens automatically the FIRST time
  // a tenant clicks Edit on an un-published portal; can be re-opened later
  // via the Publish button on the card.
  const [activating, setActivating] = useState<PortalKind | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    // `loading` is the FIRST read only (it starts true). A refresh after a tab
    // saves must not flip it back: OliverPageWrapper swaps its children for
    // "Loading…" while it is true, which unmounted the open editor on every
    // save and reopened it on its first tab with the unsaved state gone.
    setError(null);
    try {
      // lib/oliverApi already strips the { data: ... } envelope; reading .data
      // again yielded undefined and this page rendered empty.
      const r = await get<HubData>("/portals/hub");
      setData(r || null);
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
      subtitle="One place for your customer portal's look, both portals' signup forms, custom domains and workflow."
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
          onEdit={(tab) => {
            // F-127 — first-run: bounce to activation wizard before editor.
            if (!customer.is_published) setActivating("customer");
            else setEditing({ kind: "customer", tab });
          }}
        />
        <PortalCard
          kind="crew"
          icon={Wrench}
          accent="#FEC82C"
          name="Crew Portal"
          tagline="Field workers' job board + actions"
          status={crew}
          memberLabel="workers"
          onEdit={(tab) => {
            if (!crew.is_published) setActivating("crew");
            else setEditing({ kind: "crew", tab });
          }}
        />
      </div>

      {/* Q-APPS-PWA / APP-8 — the three app addresses, their QR codes, and the
          install instructions a business owner actually has to give somebody.
          Below the two portal cards because it is about handing the apps OUT,
          not about configuring them. */}
      <div className="mb-4">
        <AppLinksCard slug={customer.subdomain_slug || crew.subdomain_slug} />
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

      {activating && (
        <PortalActivationWizard
          open
          portalKind={activating}
          initialSlug={(activating === "customer" ? customer : crew).subdomain_slug}
          initialPublished={(activating === "customer" ? customer : crew).is_published}
          onClose={() => setActivating(null)}
          onPublished={() => { load(); }}
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
        <button onClick={() => onEdit(kind === "customer" ? "look" : "signup")} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ background: accent, color: accent === "#FEC82C" ? "#1A3A4A" : "#fff" }}>
          <Brush className="h-3 w-3" /> Edit portal
        </button>
      </div>
    </div>
  );
}

// ── The editor modal ──────────────────────────────────────────────────────────

function PortalEditorModal({
  portalKind, status, initialTab, onClose, onSaved,
}: {
  portalKind: PortalKind;
  status: PortalStatus;
  initialTab: Tab;
  onClose: () => void;
  onSaved: () => void;
}) {
  const hasLook = portalKind === "customer";
  const [tab, setTab] = useState<Tab>(initialTab === "look" && !hasLook ? "signup" : initialTab);
  const [confirmClose, setConfirmClose] = useState(false);
  const accent = portalKind === "customer" ? "#1A3A4A" : "#FEC82C";
  // The Look tab's state lives here, not in the tab, so an unsaved choice
  // survives a trip to another tab and the footer can say so.
  const look = useLookEditor(hasLook);

  const tabs: Array<{ key: Tab; label: string; icon: typeof Brush }> = [
    ...(hasLook ? [{ key: "look" as Tab, label: "Look", icon: Palette }] : []),
    { key: "signup",   label: "Signup form", icon: FileText },
    // F-114 Phase 3 — constrained WYSIWYG layout builder.
    { key: "layout",   label: "Layout",      icon: Layers },
    { key: "domain",   label: "Domain",      icon: Globe },
    { key: "workflow", label: "Workflow",    icon: Settings },
  ];

  // Closing with an unsaved look asks first, like the booking page editor.
  function requestClose() {
    if (look.dirty && !look.saving) setConfirmClose(true);
    else onClose();
  }

  const saveBlocked = !look.dirty || look.saving || look.problems.length > 0;

  return (
    <>
    <IadmModal
      open
      onClose={requestClose}
      product="oliver"
      eyebrow={`${portalKind === "customer" ? "CUSTOMER" : "CREW"} PORTAL · EDIT`}
      title={`${portalKind === "customer" ? "Customer" : "Crew"} portal settings`}
      subtitle={hasLook ? "Look, signup form, layout, domain and workflow." : "Signup form, layout, domain and workflow."}
      size="info"
      footer={
        <>
          {tab === "look" ? (
            <>
              <span className="mr-auto text-xs text-slate-500">
                {look.saving ? "Saving…" : look.dirty ? "Unsaved changes" : "All changes saved"}
              </span>
              <button
                type="button"
                onClick={look.discard}
                disabled={!look.dirty || look.saving}
                title="Put back the look as it was last saved"
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => { void look.save(); }}
                disabled={saveBlocked}
                title={look.problems.length > 0 ? "Some colours are too hard to read to save; see the warning above" : "Save this look for your customers"}
                className="rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
              >
                {look.saving ? "Saving…" : "Save look"}
              </button>
            </>
          ) : (
            look.dirty && <span className="mr-auto text-xs text-slate-500">Unsaved changes on the Look tab</span>
          )}
          <IadmButton variant="ghost" onClick={requestClose}>Done</IadmButton>
        </>
      }
    >
      <div className="flex h-full flex-col">
        {/* Scrolls sideways on its own at phone width rather than widening the modal. */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-3 py-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.key ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /><span>{t.label}</span>
                {t.key === "look" && look.dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Unsaved changes" />}
              </button>
            );
          })}
        </div>

        {tab === "look" ? (
          // The Look tab lays out its own two scrolling columns (choices, preview).
          <div className="min-h-0 flex-1 overflow-hidden">
            <LookTab editor={look} previewSrc={customerPreviewSrc(status)} accent={accent} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            {tab === "signup" && <SignupTabStub portalKind={portalKind} accent={accent} onSaved={onSaved} />}
            {tab === "layout" && <PortalLayoutTab portalKind={portalKind} accent={accent} onSaved={onSaved} />}
            {tab === "domain" && <DomainTabStub portalKind={portalKind} status={status} accent={accent} onSaved={onSaved} />}
            {tab === "workflow" && <WorkflowTabStub portalKind={portalKind} accent={accent} onSaved={onSaved} />}
          </div>
        )}
      </div>
    </IadmModal>

    {confirmClose && (
      <IadmModal
        open
        onClose={() => setConfirmClose(false)}
        product="oliver"
        eyebrow="OLIVER · CUSTOMER PORTAL"
        title="Close without saving?"
        subtitle="Your portal's look"
        size="confirm"
        z={60}
        footer={
          <>
            <button type="button" onClick={() => setConfirmClose(false)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              Keep editing
            </button>
            <button type="button" onClick={() => { setConfirmClose(false); onClose(); }}
                    className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800">
              Close without saving
            </button>
          </>
        }
      >
        <div className="p-5 text-sm leading-relaxed text-slate-700">
          You changed your customer portal's look and have not saved it. If you close now, those changes are lost and your customers keep the look you saved before.
        </div>
      </IadmModal>
    )}
    </>
  );
}

// ── Tab content (F-114 Phase 2) ──────────────────────────────────────────────
//
// Signup form, Domain and Workflow are fully inline — no deep-links to legacy
// /portal-* pages. Each loads its own slice on mount, edits in place, and
// PATCHes on Save. (Look is ./look/LookTab.tsx; Layout is PortalLayoutTab.)

// ── SignupTabStub → inline signup form builder (F-114 Phase 2) ────────────
function SignupTabStub({ portalKind, accent, onSaved }: { portalKind: PortalKind; accent: string; onSaved: () => void }) {
  const { get, patch, ready } = useOliverApi();
  const [config, setConfig] = useState<SignupConfigFull | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    get<SignupConfigFull>("/customer-signup/config")
      .then((r) => setConfig(r))
      .catch(() => setConfig(null));
  }, [ready, get]);

  // SignupFormBuilder is a modal that takes over the screen — we always-mount
  // it when this tab is active and let the user save inline.
  if (!config) return <div className="text-xs text-slate-500">Loading signup form…</div>;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Signup form</h3>
        <p className="text-xs text-slate-600">
          {portalKind === "customer"
            ? "Fields a customer fills out to create their portal account."
            : "Fields a worker fills out when invited (customer-portal builder shares this config)."}
        </p>
      </div>

      <SignupFormBuilder
        open={true}
        config={config}
        saving={saving}
        onClose={() => { /* no-op — modal is always-open inside the tab */ }}
        onSave={async (next) => {
          setSaving(true);
          try {
            const saved = await patch<SignupConfigFull>("/customer-signup/config", next);
            setConfig(saved);
            setSavedMsg("Saved.");
            setTimeout(() => setSavedMsg(null), 3000);
            onSaved();
          } finally {
            setSaving(false);
          }
        }}
      />
      {savedMsg && <div className="text-xs text-emerald-700">{savedMsg}</div>}
      <div className="text-[10px] text-slate-400">Accent: <span className="inline-block w-3 h-3 rounded-full align-middle ml-1" style={{ background: accent }} /></div>
    </div>
  );
}

// ── DomainTabStub → inline domain binding (F-114 Phase 2) ─────────────────
interface BindResponse {
  hostname: string;
  portal_kind: string;
  status: string;
  azure_status: string | null;
  requires_manual_dns: boolean;
  instructions: { type?: string; host?: string; target?: string; txt_name?: string; txt_value?: string } | null;
  validation_token: string | null;
  error: string | null;
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => { /* clipboard blocked — silent */ });
      }}
      className="text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

function DomainTabStub({ portalKind, status, accent, onSaved }: { portalKind: PortalKind; status: PortalStatus; accent: string; onSaved: () => void }) {
  const { get, post, del, ready } = useOliverApi();
  const [unbinding, setUnbinding] = useState(false);

  const unbind = async () => {
    if (!status.custom_domain) return;
    if (!window.confirm(`Remove ${status.custom_domain}? This unbinds it from Azure + removes the DNS validation record. Your default subdomain stays bound.`)) {
      return;
    }
    setUnbinding(true);
    try {
      const list = await get<{ data: Array<{ domain_id: string; hostname: string; portal_kind: string }> }>("/portal-domains");
      const rows = (list as { data?: Array<{ domain_id: string; hostname: string; portal_kind: string }> }).data || [];
      const match = rows.find((r) => r.hostname === status.custom_domain && r.portal_kind === portalKind);
      if (!match) {
        window.alert("Couldn't find that domain in the list — it may have already been removed. Refreshing.");
        onSaved();
        return;
      }
      await del(`/portal-domains/${match.domain_id}`);
      onSaved();
    } catch (e) {
      window.alert(`Unbind failed: ${(e as Error).message}`);
    } finally {
      setUnbinding(false);
    }
  };
  const [customDomain, setCustomDomain] = useState(status.custom_domain || "");
  const [binding, setBinding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [bindResult, setBindResult] = useState<BindResponse | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);

  // Poll /portal-domains/status while a bind is in-flight so the user sees
  // the row flip from "validating…" → "ready" without manually refreshing.
  // Azure cert issuance usually takes 1–5 min after DNS is in place; we
  // poll every 20s and stop on terminal state (ready / failed) or after
  // 5 min (15 polls) to avoid burning quota forever.
  useEffect(() => {
    if (!bindResult?.hostname || !ready) return;
    if (bindResult.status === "ready" || bindResult.status === "failed") {
      setLiveStatus(bindResult.status);
      return;
    }
    let polls = 0;
    let cancelled = false;
    const tick = async () => {
      polls += 1;
      try {
        const r = await get<{ data?: { status?: string; ok?: boolean } }>(
          `/portal-domains/status?hostname=${encodeURIComponent(bindResult.hostname)}&portal_kind=${bindResult.portal_kind}`
        );
        const azure = r?.data?.status || null;
        if (cancelled) return;
        if (azure === "Ready") {
          setLiveStatus("ready");
          onSaved();
          return;
        }
        if (azure === "Failed") {
          setLiveStatus("failed");
          onSaved();
          return;
        }
        if (polls < 15) setTimeout(tick, 20_000);
      } catch {
        if (polls < 15 && !cancelled) setTimeout(tick, 20_000);
      }
    };
    const id = setTimeout(tick, 20_000);
    return () => { cancelled = true; clearTimeout(id); };
  }, [bindResult, get, ready, onSaved]);

  const bind = async () => {
    // Permissive hostname regex matches what the backend accepts. Normalize
    // to lowercase before validating so users typing "Portal.Acme.com" work.
    const normalized = customDomain.toLowerCase().trim();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(normalized)) {
      setMsg("Enter a valid hostname like portal.acme.com");
      return;
    }
    if (normalized.endsWith(".ia-dm.com")) {
      setMsg("That's an IA hostname — use the default subdomain card above instead.");
      return;
    }
    setBinding(true); setMsg(null); setBindResult(null);
    try {
      // useOliverApi unwraps — this is already the BindResponse.
      const data = await post<BindResponse>(`/portal-domains/custom`, { portal_kind: portalKind, hostname: normalized });
      setBindResult(data);
      if (data?.error) {
        setMsg(`Error: ${data.error}`);
      } else if (data?.requires_manual_dns) {
        setMsg("Add the DNS records below at your provider, then refresh — Azure will validate within 1–5 min.");
      } else {
        setMsg("Binding submitted — Azure is validating (1–5 min).");
      }
      onSaved();
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBinding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Domain</h3>
        <p className="text-xs text-slate-600">
          Your portal address is <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">{portalKind}.ia-dm.com/your-business/</code>, or bring your own custom domain (Pro+).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        {/* OLD ADDRESS, LABELLED AS OLD (OLIVER pack 1).
            This card used to sit beside the correct one showing
            `{slug}.{kind}.ia-dm.com` under the words "Auto-bound. No DNS
            required." Neither half was true: there is no wildcard binding for
            these hosts, Azure Static Web Apps binds roughly five custom domains
            per app, and an owner reading two addresses for one portal prints the
            one that claims it needs no setup. It stays visible because links in
            that shape were handed out and are 301'd, and it now says which it is. */}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Older address (still redirects)</div>
          <div className="font-mono text-slate-500 text-sm line-through">{status.subdomain_slug || "(not set)"}<span className="text-slate-400">.{portalKind}.ia-dm.com</span></div>
          <div className="text-[10px] text-slate-500 mt-1">
            Links already handed out in this shape keep working, they redirect to the address
            above. Don't print this one on anything new.
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Custom domain status</div>
            {status.custom_domain && (
              <button
                type="button"
                onClick={unbind}
                disabled={unbinding}
                className="text-[10px] font-semibold px-2 py-0.5 rounded border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 disabled:opacity-50"
                title="Remove this custom domain (default subdomain stays bound)"
              >
                {unbinding ? "Removing…" : "Unbind"}
              </button>
            )}
          </div>
          <div className="font-mono text-slate-900 text-sm">{status.custom_domain || "—"}</div>
          <div className="text-[10px] text-slate-500 mt-1">{status.custom_domain_status === "ready" ? "✓ Live" : status.custom_domain_status === "pending" ? "Validating…" : status.custom_domain_status === "failed" ? "Failed — check CNAME" : "Not configured"}</div>
          {status.custom_domain && status.custom_domain_status === "ready" && (
            <a
              href={`https://${status.custom_domain}`}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-1 mt-1"
            >
              Open portal in new tab →
            </a>
          )}
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-3">
        <div className="text-[10px] uppercase font-semibold text-slate-500 mb-2">Bind a custom domain (Pro+)</div>
        <div className="text-[11px] text-slate-600 mb-2">
          Enter the hostname you want to use (e.g. <code className="font-mono bg-slate-100 px-1">portal.acme.com</code>).
          After you click Bind, the exact CNAME + TXT records you need to add at your DNS provider will appear below — with Copy buttons.
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            placeholder={`portal.yourcompany.com`}
            className="flex-1 text-xs px-2 py-1.5 rounded border border-slate-300 font-mono"
            disabled={!ready}
          />
          <button onClick={bind} disabled={binding || !ready || !customDomain} className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" style={{ background: accent, color: accent === "#FEC82C" ? "#1A3A4A" : "#fff" }}>
            {binding ? "Binding…" : "Bind"}
          </button>
        </div>
        {msg && <div className="text-[11px] text-slate-700 mt-2">{msg}</div>}

        {bindResult && (bindResult.instructions || bindResult.validation_token) && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-900">Add these DNS records</div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase border ${
                  liveStatus === "ready" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  liveStatus === "failed" ? "bg-rose-50 text-rose-700 border-rose-200" :
                  "bg-amber-100 text-amber-800 border-amber-300"
                }`}
              >
                {liveStatus === "ready" ? "✓ Live" : liveStatus === "failed" ? "Failed" : "Validating…"}
              </span>
            </div>
            {bindResult.instructions?.host && bindResult.instructions?.target && (
              <div className="grid grid-cols-[60px_1fr_auto] items-center gap-2 text-[11px]">
                <span className="font-semibold text-slate-600">CNAME</span>
                <code className="font-mono bg-white border border-amber-200 rounded px-2 py-1 break-all">{bindResult.instructions.host}</code>
                <CopyButton value={bindResult.instructions.host} />
                <span />
                <code className="font-mono bg-white border border-amber-200 rounded px-2 py-1 break-all">→ {bindResult.instructions.target}</code>
                <CopyButton value={bindResult.instructions.target} />
              </div>
            )}
            {bindResult.instructions?.txt_name && bindResult.instructions?.txt_value && (
              <div className="grid grid-cols-[60px_1fr_auto] items-center gap-2 text-[11px]">
                <span className="font-semibold text-slate-600">TXT</span>
                <code className="font-mono bg-white border border-amber-200 rounded px-2 py-1 break-all">{bindResult.instructions.txt_name}</code>
                <CopyButton value={bindResult.instructions.txt_name} />
                <span />
                <code className="font-mono bg-white border border-amber-200 rounded px-2 py-1 break-all">{bindResult.instructions.txt_value}</code>
                <CopyButton value={bindResult.instructions.txt_value} />
              </div>
            )}
            {bindResult.validation_token && !bindResult.instructions?.txt_value && (
              <div className="grid grid-cols-[60px_1fr_auto] items-center gap-2 text-[11px]">
                <span className="font-semibold text-slate-600">Token</span>
                <code className="font-mono bg-white border border-amber-200 rounded px-2 py-1 break-all">{bindResult.validation_token}</code>
                <CopyButton value={bindResult.validation_token} />
              </div>
            )}
            <div className="text-[10px] text-amber-900/70">DNS propagation typically takes 1–5 min; refresh this page once you've added the records.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── WorkflowTabStub → inline workflow rules (F-114 Phase 2) ───────────────
type WorkflowShape = { reschedule_mode: string; reschedule_advance_notice_hours: number; reschedule_cutoff_hours: number; reschedule_max_count: number; booking_auto_create_invoice: string; booking_auto_send_confirmation: boolean; booking_auto_assign_worker: string };

const WORKFLOW_DEFAULTS: WorkflowShape = {
  reschedule_mode: "admin_approval",
  reschedule_advance_notice_hours: 24,
  reschedule_cutoff_hours: 4,
  reschedule_max_count: 2,
  booking_auto_create_invoice: "on_confirm",
  booking_auto_send_confirmation: true,
  booking_auto_assign_worker: "none",
};

function WorkflowTabStub({ portalKind: _portalKind, accent, onSaved }: { portalKind: PortalKind; accent: string; onSaved: () => void }) {
  const { get, patch, ready } = useOliverApi();
  const [wf, setWf] = useState<WorkflowShape | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    get<WorkflowShape>("/workflow-settings").then((r) => setWf(r)).catch(() => setWf(null));
  }, [ready, get]);

  if (!wf) return <div className="text-xs text-slate-500">Loading workflow…</div>;

  const reset = () => {
    if (!window.confirm("Reset workflow rules to the platform defaults? You'll still need to click Save to persist.")) return;
    setWf({ ...WORKFLOW_DEFAULTS });
  };

  const save = async () => {
    setSaving(true);
    try {
      await patch("/workflow-settings", wf);
      setSavedMsg("Saved.");
      setTimeout(() => setSavedMsg(null), 3000);
      onSaved();
    } catch (e) {
      setSavedMsg(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Workflow rules</h3>
        <p className="text-xs text-slate-600">Customer-initiated reschedules + what happens automatically after a booking confirms.</p>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2">
        <div className="text-[10px] uppercase font-semibold text-slate-500">Reschedule policy</div>
        <label className="flex items-center gap-2 text-xs">
          <span className="w-32">Allow reschedules</span>
          <select value={wf.reschedule_mode} onChange={(e) => setWf({ ...wf, reschedule_mode: e.target.value })} className="flex-1 text-xs px-2 py-1 rounded border border-slate-300 bg-white">
            <option value="disabled">Disabled — admin manages all changes</option>
            <option value="auto_confirm">Auto-confirm — customer picks new time, instantly confirmed</option>
            <option value="admin_approval">Require admin approval — customer requests, you approve</option>
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Advance notice (hr)</span>
            <input type="number" value={wf.reschedule_advance_notice_hours} onChange={(e) => setWf({ ...wf, reschedule_advance_notice_hours: Number(e.target.value) })} className="w-full mt-1 text-xs px-2 py-1 rounded border border-slate-300" />
          </label>
          <label className="block text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cutoff (hr before)</span>
            <input type="number" value={wf.reschedule_cutoff_hours} onChange={(e) => setWf({ ...wf, reschedule_cutoff_hours: Number(e.target.value) })} className="w-full mt-1 text-xs px-2 py-1 rounded border border-slate-300" />
          </label>
          <label className="block text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Max per booking</span>
            <input type="number" value={wf.reschedule_max_count} onChange={(e) => setWf({ ...wf, reschedule_max_count: Number(e.target.value) })} className="w-full mt-1 text-xs px-2 py-1 rounded border border-slate-300" />
          </label>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2">
        <div className="text-[10px] uppercase font-semibold text-slate-500">After booking confirms</div>
        <label className="flex items-center gap-2 text-xs">
          <span className="w-32">Auto-create invoice</span>
          <select value={wf.booking_auto_create_invoice} onChange={(e) => setWf({ ...wf, booking_auto_create_invoice: e.target.value })} className="flex-1 text-xs px-2 py-1 rounded border border-slate-300 bg-white">
            <option value="never">Never — manual invoicing only</option>
            <option value="on_confirm">When booking confirms</option>
            <option value="on_completion">When job marked complete</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={wf.booking_auto_send_confirmation} onChange={(e) => setWf({ ...wf, booking_auto_send_confirmation: e.target.checked })} />
          <span>Send confirmation email + .ics calendar invite</span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="w-32">Auto-assign worker</span>
          <select value={wf.booking_auto_assign_worker} onChange={(e) => setWf({ ...wf, booking_auto_assign_worker: e.target.value })} className="flex-1 text-xs px-2 py-1 rounded border border-slate-300 bg-white">
            <option value="none">Don't auto-assign — admin assigns</option>
            <option value="preferred">Customer's preferred worker if available</option>
            <option value="round_robin">Round-robin across active workers</option>
            <option value="skill_match">Match worker by service category</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
        {savedMsg && <span className="text-xs text-emerald-700">{savedMsg}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title="Revert workflow rules to platform defaults"
          >
            Reset to defaults
          </button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" style={{ background: accent, color: accent === "#FEC82C" ? "#1A3A4A" : "#fff" }}>
            <Settings className="h-3 w-3" /> {saving ? "Saving…" : "Save workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OliverPortalsHubPage;

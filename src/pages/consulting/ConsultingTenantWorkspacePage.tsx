// ConsultingTenantWorkspacePage — Task #257.
//
// Founder's "view-as-this-tenant" control center. After the Path B
// onboarding wizard's Save & Finish, Brandon lands here at
// /app/services/consulting/tenant-workspace/:tenantId. He uses the cards
// to drive remaining per-product setup tasks AS this tenant before the
// welcome email goes out (or, post-welcome, to inspect status).
//
// Why a page and not a modal: the wizard already runs inside one modal,
// and the tenant workspace is meant to be the place Brandon LANDS on —
// not a popup that disappears on Esc. Sub-actions still open the
// ClientTenantModal in `consulting` mode (which uses the in-memory
// ClientTenantContext = the documented act-as mechanism).
//
// Backend: GET /admin/tenant-workspace/:tenantId — founder-gated, returns
// { tenant, products[], pending_actions[] }.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Building2, Mail, Phone, Globe, CheckCircle2, AlertCircle,
  Clock, Send, ExternalLink, Loader2, ChevronRight,
} from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { CORE_BLUE, PRODUCT_ACCENT } from "../../components/IadmModal";
import { ClientTenantModal } from "../../components/consulting/ClientTenantModal";

// ── Types — mirror the backend response in onboardClient.js ─────────────

interface ProductCard {
  key: "arion" | "spark" | "oliver" | "argus" | "consulting";
  name: string;
  in_cart: boolean;
  setupTaskCount: number;
  completedCount: number;
  nextStep: {
    kind: string;
    title: string;
    cta_label: string | null;
    cta_route: string | null;
  } | null;
}

interface PendingAction {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  cta?: { label: string; action: string };
}

interface TenantWorkspaceTenant {
  tenant_id: string;
  business_name: string;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  website_url: string | null;
  logo_url: string | null;
  brand_color: string | null;
  brand_color_secondary: string | null;
  brand_color_accent: string | null;
  signup_product: string | null;
  billing_cycle: string | null;
  status: string | null;
  saas_stripe_customer_id: string | null;
  saas_stripe_subscription_id: string | null;
  city: string | null;
  state_province: string | null;
  created_at: string | null;
  onboarded_by_founder: boolean;
  finished_at: string | null;
  welcome_sent_at: string | null;
  welcome_expires_at: string | null;
  welcome_expired: boolean;
  client_first_login_at: string | null;
  lifecycle_status: "in_progress" | "finished" | "waiting_on_client" | "client_active";
  step_index: number | null;
  section_id: string | null;
  last_saved_at: string | null;
}

interface TenantWorkspaceResp {
  tenant: TenantWorkspaceTenant;
  products: ProductCard[];
  pending_actions: PendingAction[];
}

// ── Per-product setup landing routes (the "Open as this tenant" target) ──
const PRODUCT_SETUP_ROUTE: Record<ProductCard["key"], string> = {
  arion:      "/app/services/arion_onboarding",
  spark:      "/app/services/spark_overview",
  oliver:     "/app/services/oliver_dashboard",
  argus:      "/app/services/argus_health",
  consulting: "/app/services/consulting_overview",
};

export function ConsultingTenantWorkspacePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { getFounder, postFounder } = useOliverApi();

  const [data, setData] = useState<TenantWorkspaceResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [actingAsTenantId, setActingAsTenantId] = useState<string | null>(null);

  // Load workspace data.
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    getFounder<TenantWorkspaceResp>(`/admin/tenant-workspace/${encodeURIComponent(tenantId)}`)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e: Error) => { if (!cancelled) setErr(e.message || "Failed to load tenant workspace"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, getFounder]);

  const tenantHeaderColors = useMemo(() => {
    const primary = data?.tenant.brand_color || CORE_BLUE;
    const secondary = data?.tenant.brand_color_secondary || "#0F172A";
    return { primary, secondary };
  }, [data]);

  // ── Action handlers ───────────────────────────────────────────────
  async function handleResendWelcome() {
    if (!tenantId) return;
    setBusyAction("resend_welcome");
    try {
      const r = await postFounder<{ ok: boolean; welcome?: { sent?: boolean } }>(
        "/admin/onboard-client/finish-onboarding/resend",
        { tenant_id: tenantId }
      );
      const sent = !!(r as { welcome?: { sent?: boolean } })?.welcome?.sent;
      alert(sent ? "Welcome email resent." : "Resend returned without confirmation — check ACS logs.");
      // Reload to pick up new welcome_sent_at / welcome_expires_at.
      const fresh = await getFounder<TenantWorkspaceResp>(`/admin/tenant-workspace/${encodeURIComponent(tenantId)}`);
      setData(fresh);
    } catch (e) {
      alert(`Resend failed: ${(e as Error).message}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleFinishAndSendWelcome() {
    if (!tenantId) return;
    if (!window.confirm("Mark all setup complete and send the welcome email to the client now?")) return;
    setBusyAction("finish");
    try {
      // finish-onboarding is idempotent (F-B.2). If already finished, the
      // call returns { already_finished: true } and does NOT resend the
      // welcome — we then fire the resend endpoint instead so Brandon gets
      // the expected behaviour from this CTA.
      const r = await postFounder<{ ok: boolean; already_finished?: boolean; welcome?: { sent?: boolean } }>(
        "/admin/onboard-client/finish-onboarding",
        { tenant_id: tenantId }
      );
      if (r?.already_finished) {
        const rr = await postFounder<{ ok: boolean; welcome?: { sent?: boolean } }>(
          "/admin/onboard-client/finish-onboarding/resend",
          { tenant_id: tenantId }
        );
        const sent = !!(rr as { welcome?: { sent?: boolean } })?.welcome?.sent;
        alert(sent ? "Already finished — welcome email resent." : "Already finished. Resend returned without confirmation.");
      } else {
        const sent = !!(r as { welcome?: { sent?: boolean } })?.welcome?.sent;
        alert(sent ? "Setup finished. Welcome email sent." : "Setup finished. Welcome status uncertain — check ACS logs.");
      }
      const fresh = await getFounder<TenantWorkspaceResp>(`/admin/tenant-workspace/${encodeURIComponent(tenantId)}`);
      setData(fresh);
    } catch (e) {
      alert(`Finish failed: ${(e as Error).message}`);
    } finally {
      setBusyAction(null);
    }
  }

  function openProductAsTenant(card: ProductCard) {
    // The hard constraint forbids localStorage / global "acting tenant"
    // session — the documented act-as mechanism is the in-memory
    // ClientTenantProvider that wraps ClientTenantModal (consulting mode).
    // Open the modal scoped to this tenant; Brandon can drive setup from
    // inside it. The cta_route from nextStep is the page he'd want — we
    // open the modal so the API calls inside it carry x-tenant-key for
    // the client tenant.
    if (!tenantId) return;
    setActingAsTenantId(tenantId);
    // If the per-product nextStep has a cta_route, prefer following the
    // explicit walkthrough hint by navigating to it AFTER the modal is
    // closed. For now we just open the modal — the route hint is shown
    // in the card itself for Brandon to follow.
    void card; // satisfy linter — card.key may be used later for deep-link routing
  }

  // ── Render ─────────────────────────────────────────────────────────

  if (!tenantId) {
    return (
      <div className="p-6">
        <div className="text-sm text-rose-700">Missing tenant id in URL.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-slate-500 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading tenant workspace…
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate("/app/services/consulting_onboard_client")}
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Onboard Client
        </button>
        <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {err || "No workspace data returned."}
        </div>
      </div>
    );
  }

  const { tenant, products, pending_actions } = data;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Back link */}
      <button
        onClick={() => navigate("/app/services/consulting_onboard_client")}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Onboard Client
      </button>

      {/* ── Tenant header ─────────────────────────────────────────── */}
      <div
        className="rounded-xl p-5 mb-5 text-white shadow-sm"
        style={{
          background: `linear-gradient(135deg, ${tenantHeaderColors.primary} 0%, ${tenantHeaderColors.secondary} 100%)`,
        }}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            {tenant.logo_url ? (
              <img src={tenant.logo_url} alt="" className="h-14 w-14 rounded-lg bg-white object-contain p-1" />
            ) : (
              <div className="h-14 w-14 rounded-lg bg-white/20 flex items-center justify-center">
                <Building2 className="h-7 w-7 text-white" />
              </div>
            )}
            <div>
              <div className="text-xs uppercase tracking-wide opacity-80">Tenant Workspace</div>
              <div className="text-2xl font-bold">{tenant.business_name}</div>
              <div className="mt-1 text-xs opacity-80 flex items-center gap-3 flex-wrap">
                {tenant.primary_contact_email && (
                  <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {tenant.primary_contact_email}</span>
                )}
                {tenant.primary_contact_phone && (
                  <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {tenant.primary_contact_phone}</span>
                )}
                {tenant.website_url && (
                  <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> {tenant.website_url}</span>
                )}
              </div>
            </div>
          </div>
          <LifecyclePill status={tenant.lifecycle_status} />
        </div>

        {/* Sub-row — onboarding state at a glance */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <StatCell
            label="Path"
            value={tenant.onboarded_by_founder ? "B · Founder-onboarded" : "A · Self-serve"}
          />
          <StatCell
            label="Wizard finished"
            value={tenant.finished_at ? new Date(tenant.finished_at).toLocaleString() : "Not yet"}
          />
          <StatCell
            label="Welcome sent"
            value={tenant.welcome_sent_at ? new Date(tenant.welcome_sent_at).toLocaleString() : "Not sent"}
            warn={!!tenant.welcome_sent_at && tenant.welcome_expired && !tenant.client_first_login_at}
          />
          <StatCell
            label="Client first login"
            value={tenant.client_first_login_at ? new Date(tenant.client_first_login_at).toLocaleString() : "Waiting"}
          />
        </div>
      </div>

      {/* ── Pending actions banner ───────────────────────────────── */}
      {pending_actions.length > 0 && (
        <div className="mb-5 space-y-2">
          {pending_actions.map((a) => (
            <PendingActionRow
              key={a.code}
              action={a}
              busy={busyAction}
              onResend={handleResendWelcome}
              onOpenModal={() => setShowOnboardingModal(true)}
            />
          ))}
        </div>
      )}

      {/* ── Product cards ─────────────────────────────────────────── */}
      <div className="mb-3 text-sm font-semibold text-slate-800">Per-product setup</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {products
          .filter((p) => p.in_cart || p.setupTaskCount > 0)
          .map((p) => (
            <ProductSetupCard
              key={p.key}
              card={p}
              onOpenAsTenant={() => openProductAsTenant(p)}
              onNavigateToSetup={() => navigate(PRODUCT_SETUP_ROUTE[p.key])}
            />
          ))}
        {products.filter((p) => p.in_cart || p.setupTaskCount > 0).length === 0 && (
          <div className="text-sm text-slate-500 italic col-span-2">
            No purchased products detected for this tenant. Check the cart in the onboarding wizard.
          </div>
        )}
      </div>

      {/* ── Footer CTA ─────────────────────────────────────────────── */}
      <div className="mt-8 border-t pt-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-slate-500">
          Finishing sends the tenant-branded welcome email to the client. Idempotent — safe to click after re-opening the modal.
        </div>
        <button
          onClick={handleFinishAndSendWelcome}
          disabled={busyAction !== null}
          className="px-5 py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-50 inline-flex items-center gap-2"
          style={{ background: tenant.finished_at ? "#0F766E" : CORE_BLUE }}
        >
          {busyAction === "finish"
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Finishing…</>
            : <><Send className="h-4 w-4" /> {tenant.finished_at ? "Resend welcome email" : "Mark all setup complete and send welcome email"}</>}
        </button>
      </div>

      {/* ── Sub-modal — onboarding (in-memory act-as) ─────────────── */}
      <ClientTenantModal
        open={showOnboardingModal}
        tenantId={showOnboardingModal ? tenantId : null}
        tenantName={tenant.business_name}
        mode="onboarding"
        onClose={() => {
          setShowOnboardingModal(false);
          // Refresh workspace after the modal closes so progress shows.
          void getFounder<TenantWorkspaceResp>(`/admin/tenant-workspace/${encodeURIComponent(tenantId)}`)
            .then((fresh) => setData(fresh))
            .catch(() => { /* non-fatal */ });
        }}
        onFinished={() => {
          // After Save & Finish in the modal, also refresh + stay on this page.
          void getFounder<TenantWorkspaceResp>(`/admin/tenant-workspace/${encodeURIComponent(tenantId)}`)
            .then((fresh) => setData(fresh))
            .catch(() => { /* non-fatal */ });
        }}
      />

      {/* ── Sub-modal — consulting (act-as for ongoing per-product work) ─ */}
      <ClientTenantModal
        open={actingAsTenantId !== null}
        tenantId={actingAsTenantId}
        tenantName={tenant.business_name}
        mode="consulting"
        onClose={() => setActingAsTenantId(null)}
      />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function LifecyclePill({ status }: { status: TenantWorkspaceTenant["lifecycle_status"] }) {
  const map: Record<typeof status, { label: string; bg: string; icon: React.ReactNode }> = {
    in_progress:       { label: "In progress",     bg: "rgba(255,255,255,0.18)", icon: <Clock className="h-3 w-3" /> },
    finished:          { label: "Finished",        bg: "rgba(34,197,94,0.25)",   icon: <CheckCircle2 className="h-3 w-3" /> },
    waiting_on_client: { label: "Waiting on client", bg: "rgba(250,204,21,0.25)", icon: <Clock className="h-3 w-3" /> },
    client_active:     { label: "Client active",   bg: "rgba(34,197,94,0.35)",   icon: <CheckCircle2 className="h-3 w-3" /> },
  };
  const m = map[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white"
      style={{ background: m.bg }}
    >
      {m.icon} {m.label}
    </span>
  );
}

function StatCell({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-white/15 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className={`text-xs font-semibold mt-0.5 ${warn ? "text-amber-200" : ""}`}>{value}</div>
    </div>
  );
}

function PendingActionRow({
  action, busy, onResend, onOpenModal,
}: {
  action: PendingAction;
  busy: string | null;
  onResend: () => void;
  onOpenModal: () => void;
}) {
  const palette = {
    info:  { bg: "bg-blue-50",  border: "border-blue-200",  text: "text-blue-900",  icon: <Clock className="h-4 w-4" /> },
    warn:  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900", icon: <AlertCircle className="h-4 w-4" /> },
    error: { bg: "bg-rose-50",  border: "border-rose-200",  text: "text-rose-900",  icon: <AlertCircle className="h-4 w-4" /> },
  }[action.severity];

  function fireCta() {
    if (!action.cta) return;
    if (action.cta.action === "open_onboarding_modal") onOpenModal();
    else if (action.cta.action === "resend_welcome") onResend();
  }

  return (
    <div className={`px-3 py-2 rounded-lg border ${palette.bg} ${palette.border} ${palette.text} flex items-center justify-between gap-3`}>
      <div className="flex items-start gap-2 text-sm">
        <span className="mt-0.5">{palette.icon}</span>
        <span>{action.message}</span>
      </div>
      {action.cta && (
        <button
          onClick={fireCta}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded-md bg-white border border-current/30 text-xs font-semibold whitespace-nowrap disabled:opacity-50"
        >
          {busy === action.cta.action ? <Loader2 className="h-3 w-3 animate-spin inline" /> : action.cta.label}
        </button>
      )}
    </div>
  );
}

function ProductSetupCard({
  card, onOpenAsTenant, onNavigateToSetup,
}: {
  card: ProductCard;
  onOpenAsTenant: () => void;
  onNavigateToSetup: () => void;
}) {
  const accent = PRODUCT_ACCENT[card.key === "consulting" ? "oliver" : (card.key as "arion" | "spark" | "oliver" | "argus")];
  const pct = card.setupTaskCount > 0
    ? Math.round((card.completedCount / card.setupTaskCount) * 100)
    : 0;
  const complete = card.setupTaskCount > 0 && card.completedCount >= card.setupTaskCount;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: accent }}
            />
            <span className="text-sm font-bold text-slate-800">{card.name}</span>
            {!card.in_cart && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                Not in cart
              </span>
            )}
            {complete && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Complete
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {card.setupTaskCount > 0
              ? `${card.completedCount} of ${card.setupTaskCount} setup tasks complete`
              : "No setup tasks seeded yet"}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: accent }}
        />
      </div>

      {/* Next step hint */}
      {card.nextStep && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Next step</div>
          <div className="font-semibold text-slate-800 mt-0.5">{card.nextStep.title}</div>
          {card.nextStep.cta_route && (
            <div className="text-slate-500 mt-0.5 font-mono text-[10px]">{card.nextStep.cta_route}</div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onOpenAsTenant}
          className="flex-1 px-3 py-1.5 rounded-md text-white text-xs font-semibold inline-flex items-center justify-center gap-1"
          style={{ background: CORE_BLUE }}
        >
          Open as this tenant <ChevronRight className="h-3 w-3" />
        </button>
        <button
          onClick={onNavigateToSetup}
          className="px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 hover:bg-slate-50"
          title="Open the product setup page in your own session (founder tenant)"
        >
          <ExternalLink className="h-3 w-3" /> Founder view
        </button>
      </div>
    </div>
  );
}

export default ConsultingTenantWorkspacePage;

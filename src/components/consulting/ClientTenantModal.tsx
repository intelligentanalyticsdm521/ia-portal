// ClientTenantModal — UNIFIED onboarding + consulting modal.
//
// ONE modal, ONE design, ONE flow. The CONTENT changes per section. The only
// thing that varies visually is the accent color band per section (so OLIVER
// sections feel like OLIVER, ARION like ARION, etc.). Layout, fields,
// buttons, step indicator — all identical across every section.
//
// NO HARD VALIDATION between sections. Save & Continue advances. Save &
// Close pauses. Save & Finish always works — even if some optional fields
// are blank. Skipping a step is a deliberate choice, not an error.
//
// Sections (filtered by what's in cart on the tenant):
//   1.  Business profile         (always)
//   2.  Owner account            (always)
//   3.  ARION setup              (if arion in cart) — domain/questionnaire/branding
//   4.  SPARK setup              (if spark in cart) — sender + contacts + voice
//   5.  OLIVER payments          (if oliver in cart) — Stripe Connect
//   6.  OLIVER templates         (if oliver in cart) — invoice/quote/proposal
//   7.  OLIVER customer portal   (if oliver in cart) — design + features + domain
//   8.  OLIVER employee portal   (if oliver in cart) — same shape, for crew
//   9.  OLIVER catalog           (if oliver in cart) — first offerings
//   10. Consulting kickoff       (if consulting in cart) — engagement + booking
//   11. Finish                   (always) — review + Save & Finish (welcome email)
//
// API scope: every fetch from inside this modal sends x-tenant-key /
// x-tenant-id = the client's tenant_id (via ClientTenantContext). Audit
// columns server-side stamp the founder's identity.
import { useEffect, useMemo, useRef, useState } from "react";
import { IadmModal, CORE_BLUE, PRODUCT_ACCENT } from "../IadmModal";
import { ClientTenantProvider, type ClientTenantValue } from "../../lib/clientTenantContext";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useAccessToken } from "../../auth/useAccessToken";
import { connectGoogle as arionConnectGoogle, createSeoProject as arionCreateSeoProject } from "../../lib/arionApi";
import { InfoTip } from "../InfoTip";
import { LogoPicker } from "../oliver/LogoPicker";
import { PhoneInput } from "../PhoneInput";
import { Building2, CheckCircle2, ExternalLink } from "lucide-react";
import { mergeStrict } from "../../lib/mergeStrict";
import { createRunner } from "../../lib/onboardingRunner/runner";
import { buildArionSteps, type ArionDomainPath } from "../../lib/onboardingRunner/arionSteps";
import type { StepRecord, Runner } from "../../lib/onboardingRunner/types";
import OnboardingRunnerProgress from "../onboarding/OnboardingRunnerProgress";

const ARION_API_BASE_URL = (import.meta.env.VITE_ARION_API_BASE_URL as string)
  || "https://app-arion-api-prod-e6fuc9gzd8f3hqfe.centralus-01.azurewebsites.net";

// ─── Types ───────────────────────────────────────────────────────────────

interface BusinessProfile {
  business_name: string;
  primary_contact_email: string;
  address_street: string;
  address_line2: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  phone: string;
  website: string;
  industry: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
}

interface OwnerAccount {
  first_name: string;
  last_name: string;
  display_name: string;
  title: string;
  mobile: string;
  time_zone: string;
  billing_email: string;
  notif_email: boolean;
  notif_sms: boolean;
}

interface OnboardingState {
  profile: BusinessProfile;
  owner: OwnerAccount;
  arion: {
    // Domain
    domain_choice: "byo" | "purchase" | "subdomain" | "hostinger_existing" | "migrate" | "";
    domain: string;
    has_existing_website: boolean;
    // Questionnaire (drives WP template + AI copy + SE Ranking seeds)
    industry: string;
    description: string;
    services: string[];        // up to 3
    target_audience: string;
    location: string;          // city/region
    // 2026-06-21 — multi-select, max 3, from 12-voice catalog. Was single value.
    // Free-text custom voice can be appended (joined with ',' on save).
    brand_voice: string[];
    brand_voice_custom: string;
    style_preference: "Modern" | "Classic" | "Minimal" | "Bold";
    pages: string[];           // multi-select
    tagline: string;
  };
  spark: {
    sender_domain: string;
    brand_voice: string[];
    brand_voice_custom: string;
    contact_import_method: "csv" | "paste" | "sync" | "later" | "";
    send_time_preference: "morning" | "midday" | "afternoon" | "evening" | "";
    first_campaign_goal: string;
    audience_size_estimate: string;
  };
  oliver: {
    stripe_connect_started: boolean;
    customer_portal: { welcome: string; show_a: boolean; show_b: boolean; logo_override: string; header_color: string; };
    employee_portal: { welcome: string; show_a: boolean; show_b: boolean; logo_override: string; header_color: string; };
    catalog: Array<{ name: string; price: string }>;
  };
  consulting: { engagement_type: string; first_meeting_notes: string };
  lifecycle: {
    preset: "simple" | "moderate" | "detailed";
    qualify_trigger: "manual" | "on_quote_or_meeting" | "every_lead";
    oliver_create_trigger: "eager" | "on_prospect" | "manual";
    past_customer_days: number;
    negotiation_trigger: "manual" | "on_counter_reply" | null;
    confirmed: boolean;
  };
  arion_integrations: {
    gbp_connected: boolean;
    gsc_connected: boolean;
    google_ads_linked: boolean;
    bing_connected: boolean;
    apple_claimed: boolean;
    se_ranking_project_created: boolean;
    skipped: boolean;
  };
  spark_welcome_email: {
    template_choice: "system_default" | "custom" | "skip";
    subject: string;
    preview_text: string;
    body: string;
    sender_name: string;
    sender_email: string;
  };
}

const EMPTY_STATE: OnboardingState = {
  profile: {
    business_name: "", primary_contact_email: "",
    address_street: "", address_line2: "", address_city: "", address_state: "", address_zip: "",
    phone: "", website: "", industry: "", logo_url: "",
    primary_color: "#1A3A4A", secondary_color: "#FEC82C", accent_color: "#1A7DB5",
  },
  owner: {
    first_name: "", last_name: "", display_name: "", title: "", mobile: "",
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago",
    billing_email: "", notif_email: true, notif_sms: false,
  },
  arion: {
    domain_choice: "", domain: "", has_existing_website: false,
    industry: "", description: "", services: ["", "", ""],
    target_audience: "", location: "",
    brand_voice: ["Professional"], brand_voice_custom: "", style_preference: "Modern",
    pages: ["Home", "About", "Services", "Contact"],
    tagline: "",
  },
  spark: {
    sender_domain: "", brand_voice: [], brand_voice_custom: "",
    contact_import_method: "", send_time_preference: "",
    first_campaign_goal: "", audience_size_estimate: "",
  },
  oliver: {
    stripe_connect_started: false,
    customer_portal: { welcome: "", show_a: true, show_b: true, logo_override: "", header_color: "" },
    employee_portal: { welcome: "", show_a: true, show_b: true, logo_override: "", header_color: "" },
    catalog: [{ name: "", price: "" }],
  },
  consulting: { engagement_type: "", first_meeting_notes: "" },
  lifecycle: {
    preset: "simple",
    qualify_trigger: "manual",
    oliver_create_trigger: "on_prospect",
    past_customer_days: 90,
    negotiation_trigger: null,
    confirmed: false,
  },
  arion_integrations: {
    gbp_connected: false,
    gsc_connected: false,
    google_ads_linked: false,
    bing_connected: false,
    apple_claimed: false,
    se_ranking_project_created: false,
    skipped: false,
  },
  spark_welcome_email: {
    template_choice: "system_default",
    subject: "Welcome to {{tenant.business_name}}",
    preview_text: "We're so glad you're here.",
    body: "",
    sender_name: "",
    sender_email: "",
  },
};

// ─── Section model ───────────────────────────────────────────────────────

type ProductKey = "arion" | "spark" | "oliver" | "consulting";
type SectionId =
  | "profile" | "owner" | "lifecycle"
  | "arion" | "arion_integrations"
  | "spark" | "spark_welcome_email"
  | "oliver_payments" | "oliver_templates" | "oliver_customer_portal" | "oliver_employee_portal" | "oliver_catalog"
  | "consulting"
  | "finish";

interface Section {
  id: SectionId;
  title: string;
  product?: ProductKey;
  required?: boolean;
}

function buildSections(cart: ProductKey[]): Section[] {
  const out: Section[] = [
    { id: "profile", title: "Business profile", required: true },
    { id: "owner",   title: "Owner account",    required: true },
  ];
  // Customer Lifecycle step — shown to any tenant whose cart includes SPARK or
  // OLIVER (consulting-only tenants don't have a CRM funnel to configure).
  if (cart.includes("spark") || cart.includes("oliver")) {
    out.push({ id: "lifecycle", title: "Sales workflow", required: true });
  }
  if (cart.includes("arion")) {
    out.push({ id: "arion", title: "ARION setup", product: "arion" });
    out.push({ id: "arion_integrations", title: "ARION · Integrations", product: "arion", required: true });
  }
  if (cart.includes("spark")) {
    out.push({ id: "spark", title: "SPARK setup", product: "spark" });
    out.push({ id: "spark_welcome_email", title: "SPARK · Welcome email", product: "spark", required: true });
  }
  if (cart.includes("oliver")) {
    out.push({ id: "oliver_payments",        title: "OLIVER · Payments",        product: "oliver" });
    out.push({ id: "oliver_templates",       title: "OLIVER · Templates",       product: "oliver" });
    out.push({ id: "oliver_customer_portal", title: "OLIVER · Customer portal", product: "oliver" });
    out.push({ id: "oliver_employee_portal", title: "OLIVER · Employee portal", product: "oliver" });
    out.push({ id: "oliver_catalog",         title: "OLIVER · Catalog",         product: "oliver" });
  }
  if (cart.includes("consulting")) out.push({ id: "consulting", title: "Consulting kickoff", product: "consulting" });
  out.push({ id: "finish", title: "Finish" });
  return out;
}

function accentFor(section: Section): string {
  if (!section.product) return CORE_BLUE;
  return (PRODUCT_ACCENT as Record<string, string>)[section.product] || CORE_BLUE;
}

// ─── Modal shell ─────────────────────────────────────────────────────────

export interface ClientTenantModalProps {
  open: boolean;
  tenantId: string | null;
  tenantName?: string;
  mode: "onboarding" | "consulting";
  /** Products in the cart — drives which sections show. */
  cart?: ProductKey[];
  onClose: () => void;
  onFinished?: () => void;
}

export function ClientTenantModal({ open, tenantId, tenantName, mode, cart, onClose, onFinished }: ClientTenantModalProps) {
  if (!open || !tenantId) return null;
  const ctx: ClientTenantValue = { tenantId, tenantName, mode };
  return (
    <ClientTenantProvider value={ctx}>
      {mode === "onboarding"
        ? <UnifiedOnboarding tenantId={tenantId} tenantName={tenantName} cart={cart} onClose={onClose} onFinished={onFinished} />
        : <ConsultingModeShell tenantId={tenantId} tenantName={tenantName} onClose={onClose} />}
    </ClientTenantProvider>
  );
}

// ─── Unified onboarding ──────────────────────────────────────────────────

function UnifiedOnboarding({ tenantId, tenantName, cart, onClose, onFinished }: {
  tenantId: string; tenantName?: string; cart: ProductKey[] | undefined;
  onClose: () => void; onFinished?: () => void;
}) {
  // get/post/patch are CLIENT-scoped (header = client tenant_id) — used for
  // Stripe Connect, PATCH /settings (business profile), etc.
  // getFounder/postFounder are FOUNDER-scoped — used for /admin/onboard-client/*.
  const { get, post, patch, getFounder, postFounder } = useOliverApi();
  // Cart can come from props (explicit) OR be derived from the prefill payload
  // (core.tenants.signup_product → ["arion"|"spark"|"oliver"|"consulting"]
  // OR all four for multi). Default ["arion","spark","oliver"] is a final
  // fallback only when nothing is known — never the first choice. This is
  // what Brandon complained about: SPARK-only buyers seeing ARION/OLIVER.
  const [effectiveCart, setEffectiveCart] = useState<ProductKey[]>(cart && cart.length ? cart : ["arion","spark","oliver"]);
  const sections = useMemo(() => buildSections(effectiveCart), [effectiveCart]);
  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState<OnboardingState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const current = sections[stepIdx];
  const accent = accentFor(current);
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === sections.length - 1;

  // Hydrate from any saved progress
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // FIX (2026-06-23) — getFounder calls oliverFetch which AUTO-UNWRAPS
    // the {data: ...} envelope at oliverApi.ts:89. The old code typed the
    // response as { data?: {...} } and then tried to read `.data` off it,
    // which discarded the entire prefill payload silently for every tenant.
    // Now type the response as the inner shape and read fields directly.
    getFounder<{ state?: Partial<OnboardingState>; prefill?: Partial<OnboardingState> & { cart?: ProductKey[] }; step?: number }>(`/admin/onboard-client/onboarding-progress?tenant_id=${encodeURIComponent(tenantId)}`)
      .then((data) => {
        if (cancelled) return;
        // Merge order: defaults → prefill (from existing tables) → saved state (wins).
        // Per Brandon's rule: don't make users re-enter data the system has.
        //
        // FIX (2026-06-23) — brand colors kept reverting to the EMPTY_STATE
        // defaults (#1A3A4A / #FEC82C / #1A7DB5) even when prefill had Brandon's
        // real values (#0C4A60 / #EF6C33 / #2D9CDB). Root cause: an older
        // saved_state row from before the prefill-load gate landed had the
        // EMPTY_STATE defaults written into it. Saved state wins over prefill
        // in the merge order, so the stale defaults clobbered the real colors
        // on every reload.
        //
        // Treat saved_state.profile color fields that EXACTLY match the
        // EMPTY_STATE defaults as "user never picked" — strip them before the
        // merge so prefill wins for those fields. Real picks (anything else)
        // still come through.
        const DEFAULT_PRIMARY = EMPTY_STATE.profile.primary_color;
        const DEFAULT_SECONDARY = EMPTY_STATE.profile.secondary_color;
        const DEFAULT_ACCENT = EMPTY_STATE.profile.accent_color;
        let cleanedSavedState = data?.state;
        if (cleanedSavedState?.profile) {
          const savedProfile = cleanedSavedState.profile as Partial<BusinessProfile>;
          // Build a new profile object excluding any color field that matches
          // the EMPTY_STATE default — those came from a stale pre-prefill save
          // and would otherwise clobber the real prefill colors.
          const { primary_color, secondary_color, accent_color, ...restProfile } = savedProfile;
          const nextProfile: Partial<BusinessProfile> = { ...restProfile };
          if (primary_color !== undefined && primary_color !== DEFAULT_PRIMARY) nextProfile.primary_color = primary_color;
          if (secondary_color !== undefined && secondary_color !== DEFAULT_SECONDARY) nextProfile.secondary_color = secondary_color;
          if (accent_color !== undefined && accent_color !== DEFAULT_ACCENT) nextProfile.accent_color = accent_color;
          // Cast: nextProfile is intentionally a Partial<BusinessProfile> after
          // we strip default-matching colors. mergeState → mergeStrict handles
          // missing keys correctly at runtime (treats them as "not provided"
          // and falls back to base/prefill).
          cleanedSavedState = { ...cleanedSavedState, profile: nextProfile as BusinessProfile };
        }
        setState((s) => {
          let merged = s;
          if (data?.prefill) merged = mergeState(merged, data.prefill);
          if (cleanedSavedState) merged = mergeState(merged, cleanedSavedState);
          return merged;
        });
        // Cart override from prefill — backend reads signup_product +
        // canonical-table presence and tells us which products are in scope.
        // Only override if caller didn't pass an explicit cart prop.
        if (!cart || !cart.length) {
          const prefillCart = data?.prefill?.cart;
          if (Array.isArray(prefillCart) && prefillCart.length) {
            setEffectiveCart(prefillCart.filter((p): p is ProductKey =>
              p === "arion" || p === "spark" || p === "oliver" || p === "consulting"));
          }
        }
        if (typeof data?.step === "number" && data.step >= 0 && data.step < sections.length) {
          setStepIdx(data.step);
        }
      })
      .catch(() => { /* fresh start ok */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, getFounder]);

  async function persist(mode: "continue" | "close" | "finish") {
    setSaving(true); setErr(null);
    try {
      // Per-section canonical-table writes (G1 confirmed: save then continue).
      // Best-effort — if a write fails, log + continue so Save & Continue
      // never blocks. The JSON-blob save below is the durable record.
      try { await flushSectionToCanonical(current.id, state, { patch }); }
      catch (e) { console.warn("[onboarding] canonical write failed for", current.id, e); }

      await postFounder("/admin/onboard-client/save-onboarding", {
        tenant_id: tenantId, step: stepIdx, section: current.id, state, mode,
      });
      if (mode === "finish") {
        await postFounder("/admin/onboard-client/finish-onboarding", { tenant_id: tenantId });
        onFinished?.();
        onClose();
      } else if (mode === "close") {
        onClose();
      } else {
        setStepIdx((i) => Math.min(i + 1, sections.length - 1));
      }
    } catch (e) {
      setErr((e as Error).message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <IadmModal
      open
      onClose={onClose}
      product={(current.product === "arion" || current.product === "spark") ? current.product : "oliver"}
      eyebrow={`Client Onboarding · ${tenantName || tenantId}`}
      title={current.title}
      subtitle={`Step ${stepIdx + 1} of ${sections.length}${current.required ? " · required" : " · optional — skip anytime"}`}
      size="info"
      footer={
        // 2026-06-20 — also disable on `loading`. Clicking Save before
        // prefill finished was flushing EMPTY_STATE to PATCH /settings
        // and wiping the tenant's business profile. Gating on both saving
        // AND loading closes the race; the omit-empty payload in
        // flushSectionToCanonical and the empty-string guard in
        // settings.js are the deeper fixes.
        <div className="flex justify-between w-full gap-2">
          {!isFirst ? (
            <button onClick={() => setStepIdx((i) => Math.max(i - 1, 0))} disabled={saving || loading}
              className="px-4 py-2 rounded-lg border border-gray-300 text-slate-700 font-semibold text-sm disabled:opacity-50">
              ← Back
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={() => persist("close")} disabled={saving || loading}
              className="px-4 py-2 rounded-lg border border-gray-300 text-slate-700 font-semibold text-sm disabled:opacity-50"
              title={loading ? "Loading existing data — please wait" : undefined}>
              Save & Close
            </button>
            {isLast ? (
              <button onClick={() => persist("finish")} disabled={saving || loading}
                className="px-4 py-2 rounded-lg text-white font-semibold text-sm disabled:opacity-50"
                style={{ background: "#0F766E" }}
                title={loading ? "Loading existing data — please wait" : undefined}>
                {loading ? "Loading…" : saving ? "Finishing…" : "Save & Finish (send welcome) →"}
              </button>
            ) : (
              <button onClick={() => persist("continue")} disabled={saving || loading}
                className="px-4 py-2 rounded-lg text-white font-semibold text-sm disabled:opacity-50"
                style={{ background: accent }}
                title={loading ? "Loading existing data — please wait" : undefined}>
                {loading ? "Loading…" : saving ? "Saving…" : "Save & Continue →"}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="px-6 py-5">
        <StepStrip current={stepIdx} sections={sections} accent={accent} />
        {err && <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">{err}</div>}
        {loading ? (
          <div className="text-sm text-slate-500">Loading saved progress…</div>
        ) : (
          <SectionBody section={current} state={state} setState={setState} api={{ get, post }} accent={accent} tenantId={tenantId} />
        )}
        <HelpFooter />
      </div>
    </IadmModal>
  );
}

// ─── Step indicator ──────────────────────────────────────────────────────

function StepStrip({ current, sections, accent }: { current: number; sections: Section[]; accent: string }) {
  return (
    <div className="mb-4">
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full transition-all" style={{ background: accent, width: `${((current + 1) / sections.length) * 100}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500">
        {sections.map((s, i) => (
          <span key={s.id} className={`px-1.5 py-0.5 rounded ${i === current ? "font-bold" : ""}`}
            style={i === current ? { color: accent } : {}}>
            {i + 1}. {s.title}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Section dispatcher ──────────────────────────────────────────────────

function SectionBody({ section, state, setState, api, accent, tenantId }: {
  section: Section;
  state: OnboardingState;
  setState: (s: OnboardingState | ((prev: OnboardingState) => OnboardingState)) => void;
  api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T> };
  accent: string;
  tenantId: string;
}) {
  switch (section.id) {
    case "profile":                return <ProfileSection profile={state.profile} setProfile={(p) => setState((s) => ({ ...s, profile: p }))} api={api} />;
    case "owner":                  return <OwnerSection owner={state.owner} setOwner={(o) => setState((s) => ({ ...s, owner: o }))} />;
    case "lifecycle":              return <LifecycleSection v={state.lifecycle} setV={(v) => setState((s) => ({ ...s, lifecycle: v }))} />;
    case "arion":                  return <ArionSection v={state.arion} setV={(v) => setState((s) => ({ ...s, arion: v }))} tenantId={tenantId} profile={state.profile} />;
    // arion_integrations also uses the same ArionSection runner status if
    // a run is in-flight; the integrations section is the natural next-
    // step after the runner finishes, so we keep that separate.
    case "arion_integrations":     return <ArionIntegrationsSection v={state.arion_integrations} setV={(v) => setState((s) => ({ ...s, arion_integrations: v }))} tenantId={tenantId} />;
    case "spark":                  return <SparkSection v={state.spark} setV={(v) => setState((s) => ({ ...s, spark: v }))} />;
    case "spark_welcome_email":    return <SparkWelcomeEmailSection v={state.spark_welcome_email} setV={(v) => setState((s) => ({ ...s, spark_welcome_email: v }))} profile={state.profile} owner={state.owner} />;
    case "oliver_payments":        return <OliverPaymentsSection v={state.oliver} setV={(v) => setState((s) => ({ ...s, oliver: v }))} accent={accent} api={api} />;
    case "oliver_templates":       return <OliverTemplatesSection profile={state.profile} />;
    case "oliver_customer_portal": return <OliverPortalSection title="Customer portal" v={state.oliver.customer_portal} setV={(p) => setState((s) => ({ ...s, oliver: { ...s.oliver, customer_portal: p } }))} fallback={state.profile} />;
    case "oliver_employee_portal": return <OliverPortalSection title="Employee portal" v={state.oliver.employee_portal} setV={(p) => setState((s) => ({ ...s, oliver: { ...s.oliver, employee_portal: p } }))} fallback={state.profile} variant="employee" />;
    case "oliver_catalog":         return <OliverCatalogSection items={state.oliver.catalog} setItems={(it) => setState((s) => ({ ...s, oliver: { ...s.oliver, catalog: it } }))} />;
    case "consulting":             return <ConsultingSection v={state.consulting} setV={(v) => setState((s) => ({ ...s, consulting: v }))} />;
    case "finish":                 return <FinishSection state={state} />;
  }
}

// ─── Section: Business profile ───────────────────────────────────────────

function ProfileSection({ profile, setProfile, api }: { profile: BusinessProfile; setProfile: (p: BusinessProfile) => void; api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T> } }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Shared across every product. Logo + colors land on invoices, portals, ARION WP build, SPARK templates.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Business name" value={profile.business_name} onChange={(v) => setProfile({ ...profile, business_name: v })} />
        <Field label="Primary contact email" type="email" value={profile.primary_contact_email} onChange={(v) => setProfile({ ...profile, primary_contact_email: v })} />
      </div>
      <Field label="Street address" value={profile.address_street} onChange={(v) => setProfile({ ...profile, address_street: v })} />
      <Field label="Suite / unit" value={profile.address_line2} onChange={(v) => setProfile({ ...profile, address_line2: v })} placeholder="optional" />
      <div className="grid grid-cols-3 gap-3">
        <Field label="City" value={profile.address_city} onChange={(v) => setProfile({ ...profile, address_city: v })} />
        <Field label="State" value={profile.address_state} onChange={(v) => setProfile({ ...profile, address_state: v })} placeholder="IA, AZ, CA…" />
        <Field label="ZIP" value={profile.address_zip} onChange={(v) => setProfile({ ...profile, address_zip: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PhoneField label="Phone" value={profile.phone} onChange={(v) => setProfile({ ...profile, phone: v })} />
        <Field label="Website" value={profile.website} onChange={(v) => setProfile({ ...profile, website: v })} placeholder="https://…" />
      </div>
      <Field label="Industry" value={profile.industry} onChange={(v) => setProfile({ ...profile, industry: v })} placeholder="e.g. Roofing, Restaurant, Roller skating rink"
        tip="Drives ARION starter template + AI brand voice. Be specific." />
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Logo</label>
        <LogoPicker value={profile.logo_url || null} onChange={(url) => setProfile({ ...profile, logo_url: url || "" })} api={api} website={profile.website || undefined} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700">Brand colors</label>
        <p className="text-[10px] text-slate-500">Primary = headers/CTAs · Secondary = sub-headers · Accent = links</p>
        <div className="mt-2 space-y-2">
          {([
            ["Primary", "primary_color", "#1A3A4A"],
            ["Secondary", "secondary_color", "#FEC82C"],
            ["Accent", "accent_color", "#1A7DB5"],
          ] as Array<[string, "primary_color" | "secondary_color" | "accent_color", string]>).map(([label, key, fb]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-20 text-xs text-slate-700">{label}</span>
              <input type="color" value={profile[key] || fb}
                onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded border border-gray-300" />
              <input type="text" value={profile[key] || ""}
                onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono"
                placeholder={fb} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Section: Owner account ──────────────────────────────────────────────

// ─── Section: Sales workflow (Customer Lifecycle) ────────────────────────
//
// 4 sub-blocks in one scrollable section (per the unified-modal pattern):
//   1. Pick a preset (Simple / Moderate / Detailed)
//   2. Auto-transitions explainer (read-only; past-customer days slider)
//   3. Configurable transitions (qualify trigger + OLIVER customer trigger
//      + negotiation trigger for Detailed)
//   4. Confirm flow visualization
//
// White-label rule: the tenant never sees "Stripe." Every customer-create
// is framed as "become an OLIVER customer."
function LifecycleSection({ v, setV }: { v: OnboardingState["lifecycle"]; setV: (v: OnboardingState["lifecycle"]) => void }) {
  const isModerate = v.preset === "moderate";
  const isDetailed = v.preset === "detailed";
  const promotionLabel = isModerate || isDetailed ? "Qualified Prospect" : "Prospect";

  function Pick({ id, title, summary, stages }: { id: "simple" | "moderate" | "detailed"; title: string; summary: string; stages: string }) {
    const active = v.preset === id;
    return (
      <button
        type="button"
        onClick={() => setV({ ...v, preset: id, negotiation_trigger: id === "detailed" ? (v.negotiation_trigger || "manual") : null })}
        className={`w-full text-left rounded-lg border-2 p-3 transition ${active ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-400"}`}
      >
        <div className="flex items-start gap-2">
          <span className={`mt-1 inline-block h-3 w-3 rounded-full border-2 ${active ? "bg-slate-900 border-slate-900" : "border-slate-400"}`} />
          <div className="flex-1">
            <div className="font-semibold text-sm">{title}</div>
            <div className="text-xs text-slate-600 mt-0.5">{stages}</div>
            <div className="text-xs text-slate-500 mt-1">{summary}</div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-slate-700 space-y-1">
        <div className="font-semibold text-slate-800">What this controls</div>
        <p>
          Every contact you collect (form fills, manual adds, CSV imports, leads) flows through these stages.
          Your choice here drives <b>which SPARK lists they land in</b>, <b>when they auto-flow into OLIVER for billing</b>,
          and <b>which lifecycle-aware campaigns fire</b> (welcome, nurture, win-back). You can change any of this later
          in Settings → CRM → Lifecycle.
        </p>
      </div>

      {/* Sub-block 1: pick a preset */}
      <div className="space-y-2">
        <div className="text-sm font-semibold text-slate-700">1. Pick the flow that matches your business</div>
        <Pick
          id="simple"
          title="Simple — 5 stages (recommended for most)"
          stages="Lead → Prospect → Active Customer → Past Customer → Repeat Customer"
          summary="Best for: solo operators, service businesses, anyone without a formal sales process."
        />
        <Pick
          id="moderate"
          title="Moderate — 6 stages"
          stages="Lead → Engaged → Qualified → Active → Past → Repeat"
          summary="Best for: B2B with a sales cycle; separates warm leads from qualified prospects."
        />
        <Pick
          id="detailed"
          title="Detailed — 8 stages"
          stages="Lead → Engaged → Qualified → Proposal → Negotiation → Active → Past → Repeat"
          summary="Best for: agencies, consultants, high-touch B2B with formal proposal/negotiation phases."
        />
      </div>

      {/* Sub-block 2: auto transitions explainer */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
        <div className="text-sm font-semibold text-slate-700">2. These happen automatically — no action needed</div>
        <ul className="text-xs text-slate-700 space-y-1.5 list-none pl-0">
          <li>✓ Anyone who fills a form, gets imported, or you add manually starts as a <b>Lead</b>.</li>
          {(isModerate || isDetailed) && (
            <li>✓ When they reply, book a meeting, or open 2+ emails they become an <b>Engaged Prospect</b>.</li>
          )}
          {isDetailed && (
            <li>✓ When you send them a quote or invoice they become <b>Proposal Sent</b>.</li>
          )}
          <li>✓ When they pay for the first time they become an <b>Active Customer</b>.</li>
          <li>
            ✓ When they cancel everything AND go quiet for{" "}
            <b>{v.past_customer_days} days</b> they move to <b>Past Customer</b>.
            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={30}
                max={365}
                step={1}
                value={v.past_customer_days}
                onChange={(e) => setV({ ...v, past_customer_days: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="text-xs text-slate-500 w-20 text-right">{v.past_customer_days} days</span>
            </div>
          </li>
          <li>✓ If a Past Customer pays again, they automatically become a <b>Repeat Customer</b>.</li>
        </ul>
      </div>

      {/* Sub-block 3: configurable transitions */}
      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-700">3. When YOU decide a Lead is ready</div>
        <div className="space-y-1.5">
          {[
            { id: "manual",                label: "I'll click \"Qualify\" myself", sub: "Recommended. You stay in control — review every lead before promoting them to a sales opportunity. Best for low-volume / high-touch businesses." },
            { id: "on_quote_or_meeting",   label: "Auto-qualify when they request a quote or book a meeting", sub: "Action signals intent. Anyone who books a call or asks for pricing gets auto-promoted. Best for service businesses with quote/booking forms." },
            { id: "every_lead",            label: "Every Lead is automatically a Prospect", sub: "Treat every inbound contact as a sales opportunity. Best for high-volume B2C or e-commerce where you don't need to qualify." },
          ].map((opt) => (
            <label key={opt.id} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="qualify_trigger"
                checked={v.qualify_trigger === opt.id}
                onChange={() => setV({ ...v, qualify_trigger: opt.id as OnboardingState["lifecycle"]["qualify_trigger"] })}
                className="mt-1"
              />
              <div className="flex-1">
                <div>{opt.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{opt.sub}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="text-sm font-semibold text-slate-700 pt-2">When should they be added as an OLIVER customer?</div>
        <div className="space-y-1.5">
          {[
            { id: "on_prospect", label: `When they become a ${promotionLabel}  (recommended — keeps your customer list clean, ready to send proposals and invoices)` },
            { id: "eager",       label: "Right away when they're a Lead  (every contact is also an OLIVER customer)" },
            { id: "manual",      label: "Only when I click \"Add to OLIVER\"" },
          ].map((opt) => (
            <label key={opt.id} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="oliver_create_trigger"
                checked={v.oliver_create_trigger === opt.id}
                onChange={() => setV({ ...v, oliver_create_trigger: opt.id as OnboardingState["lifecycle"]["oliver_create_trigger"] })}
                className="mt-1"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Why this matters: Contacts live in SPARK from day one for lead nurture. They only appear in OLIVER (where you send proposals, invoices, and schedule jobs) once they're ready to be billed.
        </p>

        {isDetailed && (
          <>
            <div className="text-sm font-semibold text-slate-700 pt-2">When does a Proposal move to Negotiation?</div>
            <div className="space-y-1.5">
              {[
                { id: "manual",           label: "I'll move it manually  (recommended)" },
                { id: "on_counter_reply", label: "Auto when they reply to the proposal with changes  (Coming soon)" },
              ].map((opt) => (
                <label key={opt.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="negotiation_trigger"
                    checked={(v.negotiation_trigger || "manual") === opt.id}
                    onChange={() => setV({ ...v, negotiation_trigger: opt.id as OnboardingState["lifecycle"]["negotiation_trigger"] })}
                    className="mt-1"
                    disabled={opt.id === "on_counter_reply"}
                  />
                  <span className={opt.id === "on_counter_reply" ? "text-slate-400" : ""}>{opt.label}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Sub-block 4: confirm flow */}
      <div className="rounded-lg border-2 border-slate-300 bg-white p-3 space-y-2">
        <div className="text-sm font-semibold text-slate-700">4. Your flow at a glance</div>
        <div className="font-mono text-xs text-slate-700 whitespace-pre-line leading-5">
{`Lead ──(${v.qualify_trigger === "manual" ? "you qualify manually" : v.qualify_trigger === "on_quote_or_meeting" ? "quote/meeting triggers it" : "every Lead auto-qualifies"})──→ ${promotionLabel}${v.oliver_create_trigger === "on_prospect" ? " [now in OLIVER]" : ""}
     ──(auto on first payment)──→ Active Customer
     ──(subs cancelled + ${v.past_customer_days}d)──→ Past Customer
     ──(auto on next payment)──→ Repeat Customer`}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={v.confirmed} onChange={(e) => setV({ ...v, confirmed: e.target.checked })} />
          Looks good — apply this flow
        </label>
      </div>
    </div>
  );
}

function OwnerSection({ owner, setOwner }: { owner: OwnerAccount; setOwner: (o: OwnerAccount) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Goes to CIAM directory. The owner gets the welcome email at finish.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" value={owner.first_name} onChange={(v) => setOwner({ ...owner, first_name: v })} />
        <Field label="Last name" value={owner.last_name} onChange={(v) => setOwner({ ...owner, last_name: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Display name" value={owner.display_name} onChange={(v) => setOwner({ ...owner, display_name: v })} hint="How they're addressed" />
        <Field label="Title / role" value={owner.title} onChange={(v) => setOwner({ ...owner, title: v })} placeholder="Owner, Founder, GM…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PhoneField label="Mobile phone" value={owner.mobile} onChange={(v) => setOwner({ ...owner, mobile: v })} />
        <Field label="Time zone" value={owner.time_zone} onChange={(v) => setOwner({ ...owner, time_zone: v })} hint="Drives scheduled-send times" />
      </div>
      <Field label="Billing email" type="email" value={owner.billing_email} onChange={(v) => setOwner({ ...owner, billing_email: v })} hint="Leave blank to reuse the primary contact email" />
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={owner.notif_email} onChange={(e) => setOwner({ ...owner, notif_email: e.target.checked })} /> Email notifications</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={owner.notif_sms} onChange={(e) => setOwner({ ...owner, notif_sms: e.target.checked })} /> SMS notifications</label>
      </div>
    </div>
  );
}

// ─── Section: ARION ──────────────────────────────────────────────────────

const ARION_INDUSTRY_OPTIONS: { value: string; label: string }[] = [
  { value: "service_business", label: "Service business (plumber, electrician, HVAC, cleaner, contractor)" },
  { value: "consulting", label: "Consulting / professional services" },
  { value: "healthcare", label: "Healthcare / wellness (dental, chiro, gym, therapy)" },
  { value: "restaurant", label: "Restaurant / food" },
  { value: "tech_saas", label: "Tech / SaaS / software" },
  { value: "retail", label: "Retail / online shop" },
  { value: "real_estate", label: "Real estate" },
  { value: "creative", label: "Creative / agency / portfolio" },
  { value: "other", label: "Other" },
];
// 2026-06-21 — 12-voice catalog with descriptions + 2-sentence examples.
// Used as multi-select (max 3) across ARION + SPARK onboarding sections.
// Powers My Brand voice profile (Q4) when that ships — same shape.
export const BRAND_VOICE_CATALOG: { key: string; description: string; example: string }[] = [
  { key: "Professional", description: "Polished, credible, business-formal. Trust signals dominate.",
    example: "Our team delivers measured solutions backed by ten years of industry results. Every engagement begins with a thorough discovery to define success." },
  { key: "Friendly", description: "Warm and approachable. Reads like a neighbor.",
    example: "Hey there! We're so glad you're here — let's figure out the right fit for what you need. No pressure, just real help." },
  { key: "Knowledgeable", description: "Expert-led and educational. Teaches as it sells.",
    example: "Three factors typically drive the cost difference here: material grade, install complexity, and warranty duration. We'll walk you through each before quoting." },
  { key: "Bold", description: "Confident and direct. Doesn't hedge.",
    example: "Stop guessing. We fix it right the first time, or you don't pay. That's it." },
  { key: "Premium", description: "Refined, exclusive, quality-forward. Luxury-adjacent.",
    example: "Discerning clients trust our atelier for bespoke results that endure. Every detail is considered; nothing is rushed." },
  { key: "Casual", description: "Conversational and informal. Reads like a text message.",
    example: "We get it — life's busy. Tell us what's broken and we'll come fix it. Easy." },
  { key: "Playful", description: "Witty and fun. Doesn't take itself too seriously.",
    example: "Plumbing emergencies always happen at 2 AM on a holiday weekend. Lucky for you, we drink a lot of coffee." },
  { key: "Authoritative", description: "Commanding and decisive. The expert in the room.",
    example: "This is what works, and here's why. Forty years of practice has taught us exactly which approaches save you money and which cost you in the long run." },
  { key: "Warm", description: "Caring and empathetic. Feelings first, then facts.",
    example: "Going through a renovation can be overwhelming — we know. Our promise is that you'll never feel left in the dark, and we'll treat your home like our own." },
  { key: "Witty", description: "Clever wordplay and humor. Smart without being snarky.",
    example: "We've been called the 'WD-40 of accounting' — applies to anything that's squeaking. Numbers, tax forms, that quarterly meeting you've been dreading." },
  { key: "Direct", description: "Plain-spoken and efficient. No fluff, no jargon.",
    example: "Quote in 24 hours. Work starts within a week. Done in three. Pay when satisfied." },
  { key: "Inspirational", description: "Aspirational and visionary. Frames product as part of a bigger story.",
    example: "Your business deserves to be seen. We help small operations punch above their weight by giving you the tools the big guys take for granted." },
];

const ARION_VOICE_OPTIONS = BRAND_VOICE_CATALOG.map(v => v.key);
const ARION_STYLE_OPTIONS = ["Modern", "Classic", "Minimal", "Bold"] as const;
const ARION_PAGE_OPTIONS = ["Home", "About", "Services", "Contact", "Blog", "Shop", "Portfolio", "FAQ"];

/* ──────────────────────────────────────────────────────────────────────
 * Server-side mirror — persist every OnboardingRunner StepRecord into
 * core.onboarding_step_status via the founder oliver-api endpoint. Best
 * effort: a failed POST never blocks the engine. Run id is the same UUID
 * the engine generates so the SQL row is stable across browser refresh.
 * ────────────────────────────────────────────────────────────────────── */
const OLIVER_API_BASE_URL = (import.meta.env.VITE_OLIVER_API_BASE_URL as string)
  || "https://app-oliver-api-prod.azurewebsites.net";

async function persistStepStatus(
  bearer: string,
  tenant_id: string,
  run_id: string | undefined,
  rec: StepRecord,
): Promise<void> {
  if (!bearer || !run_id) return;
  try {
    await fetch(`${OLIVER_API_BASE_URL}/admin/onboarding-runner/upsert-step`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
        "x-tenant-key": tenant_id,
      },
      body: JSON.stringify({
        tenant_id,
        run_id,
        step_id: rec.step_id,
        status: rec.status,
        attempt_count: rec.attempt_count,
        started_at: rec.started_at,
        completed_at: rec.completed_at,
        error: rec.error,
        evidence: rec.evidence,
      }),
    });
  } catch {
    /* never block the engine on a status mirror failure */
  }
}

async function notifyFounderStuck(bearer: string, tenant_id: string, rec: StepRecord): Promise<void> {
  if (!bearer) return;
  try {
    await fetch(`${OLIVER_API_BASE_URL}/admin/onboarding-runner/notify-stuck`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
        "x-tenant-key": tenant_id,
      },
      body: JSON.stringify({
        tenant_id,
        step_id: rec.step_id,
        attempt_count: rec.attempt_count,
        error: rec.error || null,
      }),
    });
  } catch {
    /* notification is fire-and-forget */
  }
}

function ArionSection({ v, setV, tenantId, profile }: { v: OnboardingState["arion"]; setV: (v: OnboardingState["arion"]) => void; tenantId: string; profile: OnboardingState["profile"] }) {
  // 2026-06-21 — skip-if-provisioned. Brandon hit this himself:
  // ARION onboarding shouldn't re-prompt for site setup if arion.site already
  // has a row for this tenant. Probe on mount; if found, render a compact
  // "Already provisioned" panel with an Edit affordance instead of the full
  // questionnaire.
  //
  // FIX (2026-06-23) — the previous `fetch('/api/v1/arion/sites?...')` call
  // was a RELATIVE URL. The Static Web App's staticwebapp.config.json has no
  // rewrite for /api/v1/arion/*, so the request silently fell through to the
  // SPA index.html and returned HTML — not JSON. `res.json()` threw, the
  // catch swallowed it, and the "already provisioned" check never fired.
  // arion.site is at a DIFFERENT Azure App Service (ARION_API_BASE_URL).
  // Switch to the full URL + bearer-token pattern this file already uses
  // for arionConnectGoogle / arionCreateSeoProject.
  const [existingSite, setExistingSite] = useState<{ site_id: string; domain: string | null; seoAddonTier: string | null } | null>(null);
  const [siteCheckLoading, setSiteCheckLoading] = useState(true);
  const [forceEdit, setForceEdit] = useState(false);
  const { getToken: getArionToken } = useAccessToken();

  // OnboardingRunner state — driven by Start ARION Setup button below.
  // The runner is created lazily on first launch so domain_choice +
  // questionnaire state is captured at click time, not mount time.
  const [runnerRecords, setRunnerRecords] = useState<StepRecord[]>([]);
  const [runnerCurrentStep, setRunnerCurrentStep] = useState<string | null>(null);
  const [runnerStarted, setRunnerStarted] = useState(false);
  const [runnerComplete, setRunnerComplete] = useState(false);
  const [runnerError, setRunnerError] = useState<string | null>(null);
  const runnerRef = useRef<Runner | null>(null);
  const stepCapsRef = useRef<Record<string, number>>({});
  const skipAllowedRef = useRef<string[]>([]);
  const fallbackLabelsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getArionToken();
        const res = await fetch(`${ARION_API_BASE_URL}/api/v1/arion/sites?tenant_id=${encodeURIComponent(tenantId)}&primary=1`, {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        });
        const j = await res.json().catch(() => null);
        const site = j?.data?.[0];
        if (!cancelled && site?.site_id) {
          setExistingSite({
            site_id: site.site_id,
            domain: site.domain || site.primary_domain || null,
            seoAddonTier: site.seoAddonTier || site.seo_addon_tier || null,
          });
        }
      } catch { /* fall through to questionnaire */ }
      finally { if (!cancelled) setSiteCheckLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tenantId, getArionToken]);

  // Resolve has_seo_addon — Path A: existing arion.site row already has
  // a seoAddonTier. Path B: tenant just bought; the catalog tier sits on
  // the saved onboarding state where the wizard captured it. Default to
  // true when an existing site has the column populated.
  const hasSeoAddon = !!(existingSite?.seoAddonTier);

  /* ────────────────────────────────────────────────────────────────
   * launchRunner — spawns OnboardingRunner with the resolved step list
   * for the picked domain_path. Wired below the questionnaire form so
   * the user clicks "Start ARION setup" once their answers are stable.
   * ────────────────────────────────────────────────────────────────── */
  async function launchRunner() {
    if (runnerStarted || !v.domain_choice) return;
    setRunnerStarted(true);
    setRunnerError(null);
    setRunnerComplete(false);

    let bearer = "";
    try {
      const t = await getArionToken();
      bearer = t.accessToken;
    } catch (e) {
      setRunnerError(`Could not get auth token: ${(e as Error).message}`);
      setRunnerStarted(false);
      return;
    }

    const steps = buildArionSteps(v.domain_choice as ArionDomainPath, hasSeoAddon);
    // Cache per-step caps + skip-allowed list for the progress UI.
    stepCapsRef.current = Object.fromEntries(steps.map((s) => [s.id, s.max_retries]));
    skipAllowedRef.current = steps.filter((s) => s.on_failure === "skip_allowed").map((s) => s.id);
    fallbackLabelsRef.current = Object.fromEntries(steps.map((s) => [s.id, s.label_user_facing]));

    const businessProfile: Record<string, unknown> = {
      site_id: existingSite?.site_id || null,
      bearer_token: bearer,
      domain: v.domain.trim(),
      domain_path: v.domain_choice,
      // Google + Bing dual-path (Brandon-locked 2026-06-23). The wizard
      // doesn't ask the YES/NO/NOT_SURE question yet — default both to
      // "not_sure" so the probe step routes intelligently based on
      // whether the IA master service account can find the domain. When
      // the wizard UI lands the explicit question these strings flip to
      // the user's answer.
      google_setup_answer: "not_sure",
      bing_setup_answer: "not_sure",
      contact_email: (profile.primary_contact_email || "").trim() || null,
      business_name: (profile.business_name || "").trim() || null,
      questionnaire: {
        businessName: profile.business_name || null,
        industry: v.industry,
        description: v.description,
        services: v.services.filter(Boolean),
        target_audience: v.target_audience,
        location: v.location,
        brand_voice: v.brand_voice,
        brand_voice_custom: v.brand_voice_custom,
        style_preference: v.style_preference,
        pages: v.pages,
        tagline: v.tagline,
        has_existing_website: v.has_existing_website,
      },
    };

    const runner = createRunner(
      {
        tenant_id: tenantId,
        product: "arion",
        cart_items: [{ product: "arion" }],
        business_profile: businessProfile,
        callbacks: {
          on_step_change: (rec) => {
            setRunnerRecords((prev) => {
              const idx = prev.findIndex((r) => r.step_id === rec.step_id);
              if (idx === -1) return [...prev, rec];
              const next = prev.slice();
              next[idx] = rec;
              return next;
            });
            // Drive the "current step" indicator off the latest non-
            // terminal step.
            if (rec.status === "running" || rec.status === "waiting" || rec.status === "verifying") {
              setRunnerCurrentStep(rec.step_id);
            }
            // Persistence side-channel: mirror every status transition
            // into core.onboarding_step_status via the founder-only
            // oliver-api endpoint. Best-effort — never blocks engine.
            void persistStepStatus(bearer, tenantId, runner ? runner.snapshot()[0]?.evidence?.run_id as string | undefined : undefined, rec);
            // Founder notification side-channel: when a step lands in
            // failed_server_busy, ping the ACS-backed notify endpoint so
            // Brandon gets the email Brandon decision #3 promised.
            if (rec.status === "failed_server_busy") {
              void notifyFounderStuck(bearer, tenantId, rec);
            }
          },
          on_run_complete: (records) => {
            const allDone = records.every((r) => r.status === "done" || r.status === "skipped");
            setRunnerComplete(allDone);
            setRunnerCurrentStep(null);
          },
        },
      },
      steps,
    );
    runnerRef.current = runner;
    // Seed initial pending records so the UI renders the timeline
    // immediately (engine emits on transition, so before the first
    // action() there are no records yet).
    setRunnerRecords(steps.map((s) => ({ step_id: s.id, status: "pending" as const, attempt_count: 0 })));

    try {
      await runner.start();
    } catch (e) {
      setRunnerError((e as Error).message || "Runner threw");
    }
  }

  function handleRetry(step_id: string) {
    void runnerRef.current?.retry(step_id);
  }
  function handleSkip(step_id: string) {
    runnerRef.current?.skip(step_id);
  }

  const toggleService = (i: number, val: string) => {
    const next = [...v.services]; next[i] = val; setV({ ...v, services: next });
  };
  const togglePage = (page: string) => {
    const next = v.pages.includes(page) ? v.pages.filter((p) => p !== page) : [...v.pages, page];
    setV({ ...v, pages: next });
  };

  // Show "already provisioned" panel unless user clicks Edit.
  if (!siteCheckLoading && existingSite && !forceEdit) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-emerald-900">ARION site already provisioned</div>
              <div className="text-xs text-emerald-800 mt-1">
                {existingSite.domain ? <>Site for <code className="font-mono">{existingSite.domain}</code> is set up.</> : "A site is set up for this tenant."}
                {" "}Skip the questionnaire and head straight to integrations — Google Business Profile, Search Console, Bing, SE Ranking.
              </div>
              <button
                type="button"
                onClick={() => setForceEdit(true)}
                className="mt-2 text-xs font-semibold text-emerald-900 underline hover:text-emerald-700"
              >
                Edit ARION configuration anyway →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {existingSite && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <b>Heads up:</b> An ARION site is already provisioned for this tenant. Editing here won't re-provision —
          it just updates the brand voice + content seeds used by future AI generation.
          <button type="button" onClick={() => setForceEdit(false)} className="ml-2 underline font-semibold">Back to provisioned view</button>
        </div>
      )}
      <p className="text-xs text-slate-500">Domain + the questionnaire that drives the WP starter template, AI-generated copy, brand voice, and SE Ranking seeds. Skip anything you don't know.</p>

      {/* Domain — 5 options per Brandon 2026-06-23 ask:
            byo               = you already own a domain elsewhere, point DNS at us
            hostinger_existing= you already own a domain on Hostinger (we connect via API, no DNS hop)
            migrate           = you have an existing WordPress site to migrate IN to ARION
            purchase          = buy a brand-new domain through our Hostinger pipeline
            subdomain         = use a free *.ia-dm.com subdomain to get started fast */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-2">Domain</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["byo",                "Use an existing domain (DNS hop)",                "Already own a domain anywhere — we'll give you DNS records."],
            ["hostinger_existing", "Connect a domain on my Hostinger",                "We'll auto-connect a domain already on your Hostinger account."],
            ["migrate",            "Migrate an existing WordPress site",              "Move a live WP site INTO ARION — we'll copy content + redirect."],
            ["purchase",           "Buy a new domain",                                "We'll register a new domain via Hostinger as part of provisioning."],
            ["subdomain",          "Use a free *.ia-dm.com subdomain",                "Get started fast — no registrar, no DNS, no waiting."],
          ] as const).map(([id, label, desc]) => (
            <button key={id} type="button" onClick={() => setV({ ...v, domain_choice: id })}
              className={`p-3 rounded-lg border-2 text-left text-xs ${v.domain_choice === id ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white"}`}>
              <div className="font-semibold">{label}</div>
              <div className="text-[10px] text-slate-500 mt-1 leading-tight">{desc}</div>
            </button>
          ))}
        </div>
        {v.domain_choice && (
          <div className="mt-2">
            <Field label={v.domain_choice === "subdomain" ? "Subdomain prefix" : "Domain"}
              value={v.domain} onChange={(d) => setV({ ...v, domain: d })}
              placeholder={v.domain_choice === "subdomain" ? "rollinginit (becomes rollinginit.ia-dm.com)" : "example.com"} />
            {v.domain_choice === "byo" && (
              <label className="flex items-center gap-2 text-xs mt-2">
                <input type="checkbox" checked={v.has_existing_website}
                  onChange={(e) => setV({ ...v, has_existing_website: e.target.checked })} />
                I already have a working WordPress site at this domain (install the IA Plugin only — don't import a template or copy)
              </label>
            )}
            {v.domain_choice === "hostinger_existing" && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <b>Note:</b> the back-end auto-connect via Hostinger API is queued for build (#246).
                For now this routes through the same provisioning as <code>byo</code> but flagged so we surface the right post-setup instructions.
              </div>
            )}
            {v.domain_choice === "migrate" && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <b>Note:</b> automated WP migration tooling is queued for build. Selecting this flags the tenant for a guided manual migration —
                IA Consulting will reach out within 1 business day to schedule the cutover.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Industry */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Industry</label>
        <select value={v.industry} onChange={(e) => setV({ ...v, industry: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
          <option value="">Select an industry…</option>
          {ARION_INDUSTRY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="text-[10px] text-slate-500 mt-1">Drives WP starter template + keyword seeds.</div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">What does your business do? <span className="text-slate-400">(20+ chars feeds the AI copy generator)</span></label>
        <textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })}
          rows={3} placeholder="Family-owned roller skating rink in Marshalltown, IA. We host private parties, public skate sessions, league nights, and birthdays for kids 5-15."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>

      {/* Top 3 services */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Top 3 services / offerings</label>
        <div className="space-y-1.5">
          {v.services.map((s, i) => (
            <input key={i} value={s} onChange={(e) => toggleService(i, e.target.value)}
              placeholder={`Service ${i + 1}`}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
          ))}
        </div>
      </div>

      <Field label="Target audience" value={v.target_audience} onChange={(a) => setV({ ...v, target_audience: a })}
        placeholder="Families with kids 5-15 within 30 miles, birthday parties, corporate events" />
      <Field label="Primary location / service area" value={v.location} onChange={(l) => setV({ ...v, location: l })}
        placeholder="Marshalltown, IA + surrounding 30 mi" />

      <BrandVoicePicker
        selected={v.brand_voice}
        custom={v.brand_voice_custom}
        onSelectedChange={(arr) => setV({ ...v, brand_voice: arr })}
        onCustomChange={(s) => setV({ ...v, brand_voice_custom: s })}
      />

      {/* Style preference */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Style preference</label>
        <div className="flex flex-wrap gap-1.5">
          {ARION_STYLE_OPTIONS.map((st) => (
            <button key={st} type="button"
              onClick={() => setV({ ...v, style_preference: st })}
              className={`px-3 py-1.5 rounded text-xs font-semibold border ${v.style_preference === st ? "border-sky-500 bg-sky-50 text-sky-900" : "border-slate-300 bg-white text-slate-700"}`}>
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Pages */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Pages you want</label>
        <div className="flex flex-wrap gap-1.5">
          {ARION_PAGE_OPTIONS.map((p) => (
            <button key={p} type="button" onClick={() => togglePage(p)}
              className={`px-3 py-1 rounded-full text-xs border ${v.pages.includes(p) ? "border-sky-500 bg-sky-50 text-sky-900 font-semibold" : "border-slate-300 bg-white text-slate-700"}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <Field label="Tagline (optional)" value={v.tagline} onChange={(t) => setV({ ...v, tagline: t })}
        placeholder="Where Marshalltown rolls together since 1998" hint="Goes in the hero, used by the AI copy generator" />

      {/* ── OnboardingRunner launch panel ─────────────────────────────
            The runner replaces the old "save & hope" handoff with a live
            sequential build that shows the customer exactly what's
            happening. Save & Continue (in the modal footer) only advances
            to the next section AFTER the runner reports complete, OR
            after the user explicitly clicks "Continue without finishing"
            in the busy panel.

            Runner step list depends on:
              • v.domain_choice  (5 paths — purchase / subdomain / byo /
                                  hostinger_existing / migrate)
              • hasSeoAddon      (derived from existing site row OR cart)
            See lib/onboardingRunner/arionSteps.ts for the full matrix. */}
      <div className="mt-4 rounded-lg border-2 border-sky-200 bg-sky-50 p-4">
        <div className="flex items-start gap-3">
          <Building2 className="h-5 w-5 text-sky-700 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-sky-900">Start ARION setup</div>
            <div className="text-xs text-sky-800 mt-1">
              {v.domain_choice === "migrate" && (
                <>We'll log your business details and flag your tenant for a guided migration — consulting reaches out within 1 business day.</>
              )}
              {(v.domain_choice === "byo" || v.domain_choice === "hostinger_existing") && (
                <>We'll install the IA Plugin on your existing WordPress site, set up your account, and connect Google + Bing.</>
              )}
              {(v.domain_choice === "purchase" || v.domain_choice === "subdomain") && (
                <>We'll spin up your WordPress site, install tools, build your homepage with AI{hasSeoAddon ? ", configure SEO" : ""}, and connect Google + Bing.</>
              )}
              {!v.domain_choice && <>Pick a domain option above first, then we'll walk through setup live.</>}
            </div>

            {runnerError && (
              <div className="mt-2 text-xs text-rose-700">Runner error: {runnerError}</div>
            )}

            {!runnerStarted && !runnerComplete && (
              <button
                type="button"
                onClick={launchRunner}
                disabled={!v.domain_choice}
                className="mt-3 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sky-700"
              >
                Start ARION setup →
              </button>
            )}

            {runnerStarted && runnerRecords.length > 0 && (
              <div className="mt-4">
                <OnboardingRunnerProgress
                  steps={runnerRecords}
                  current_step_id={runnerCurrentStep}
                  max_retries_by_step={stepCapsRef.current}
                  skip_allowed_step_ids={skipAllowedRef.current}
                  fallback_labels_by_step={fallbackLabelsRef.current}
                  onRetry={handleRetry}
                  onSkip={handleSkip}
                />
                {runnerComplete && (
                  <div className="mt-3 rounded-md bg-emerald-100 border border-emerald-300 px-3 py-2 text-xs text-emerald-900">
                    All ARION setup steps done. Click Save & Continue below to move to the next section.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section: ARION · Integrations ───────────────────────────────────────
//
// Connect Google Business Profile, Google Search Console, Google Ads, Bing
// Webmaster Tools, Apple Business Connect, and create the SE Ranking project.
// Each is a button that opens a connect flow (OAuth or in-app form). State
// reflects what's already linked so we don't re-prompt for things that are
// done.
//
// API: GET /api/v1/arion/sites?primary=1 → site_id, then
//      GET /api/v1/portal/arion/sites/:site_id/linked-business-profiles for status,
//      POST /api/v1/portal/arion/sites/:site_id/connect-google to start OAuth.
// We use raw fetch for now so we don't have to add to the modal's api shape.
function ArionIntegrationsSection({ v, setV, tenantId }: {
  v: OnboardingState["arion_integrations"];
  setV: (v: OnboardingState["arion_integrations"]) => void;
  tenantId: string;
}) {
  const [siteId, setSiteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const { getToken } = useAccessToken();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // FIX (2026-06-23) — same bug as ArionSection: /api/v1/arion/* is
        // NOT proxied by the Portal SWA, so the relative URL fell through to
        // index.html and returned SPA HTML. siteId stayed null and the
        // section rendered the "No ARION site detected yet" amber error
        // even though arion.site has a row. Switch to the full URL + bearer.
        const token = await getToken();
        const auth = { headers: { Authorization: `Bearer ${token.accessToken}` } };
        const res = await fetch(`${ARION_API_BASE_URL}/api/v1/arion/sites?tenant_id=${encodeURIComponent(tenantId)}&primary=1`, auth);
        const j = await res.json().catch(() => null);
        const id = j?.data?.[0]?.site_id || j?.data?.[0]?.id || null;
        if (!cancelled) setSiteId(id);
        if (id) {
          const statusRes = await fetch(`${ARION_API_BASE_URL}/api/v1/arion/sites/${id}/integrations-status`, auth);
          const status = await statusRes.json().catch(() => null);
          if (!cancelled && status?.data) {
            setV({
              ...v,
              gbp_connected: !!status.data.gbp_connected,
              gsc_connected: !!status.data.gsc_connected,
              google_ads_linked: !!status.data.google_ads_linked,
              bing_connected: !!status.data.bing_connected,
              apple_claimed: !!status.data.apple_claimed,
              se_ranking_project_created: !!status.data.se_ranking_project_created,
            });
          }
        }
      } catch { /* fresh */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function startGoogleOAuth() {
    if (!siteId) return;
    setWorking("google");
    try {
      const returnUrl = window.location.href;
      const token = await getToken();
      const j = await arionConnectGoogle({
        baseUrl: ARION_API_BASE_URL,
        bearerToken: token.accessToken,
        tenantId,
        siteId,
        setupMode: "ARION_AUTO_SETUP",
        returnUrl,
      });
      const url = j?.authUrl;
      if (url) window.location.href = url;
    } catch { /* swallow — preserves old behavior */ }
    finally { setWorking(null); }
  }

  async function createSeProject() {
    if (!siteId) return;
    setWorking("seranking");
    try {
      const token = await getToken();
      await arionCreateSeoProject({
        baseUrl: ARION_API_BASE_URL,
        bearerToken: token.accessToken,
        tenantId,
        siteId,
        body: {},
      });
      setV({ ...v, se_ranking_project_created: true });
    } catch { /* swallow — preserves old behavior */ }
    finally { setWorking(null); }
  }

  const Row = ({ label, desc, connected, onClick, busyKey, cta }: { label: string; desc: string; connected: boolean; onClick?: () => void; busyKey?: string; cta?: string }) => (
    <div className="flex items-center justify-between gap-3 border border-slate-200 rounded-lg p-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          {label}
          {connected && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5"><CheckCircle2 className="h-3 w-3" /> Connected</span>}
        </div>
        <div className="text-xs text-slate-600 mt-0.5">{desc}</div>
      </div>
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          disabled={working === busyKey}
          className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:border-slate-500 disabled:opacity-50 whitespace-nowrap"
        >
          {working === busyKey ? "Working…" : (connected ? "Re-connect" : (cta || "Connect"))}
        </button>
      )}
    </div>
  );

  if (loading) return <div className="text-sm text-slate-500">Loading integration status…</div>;
  if (!siteId) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-900">No ARION site detected yet</div>
          <div className="text-xs text-amber-800 mt-1">
            The site provisioning may still be running, or this tenant hasn't been pushed through ARION setup yet.
            Integrations connect after a site exists in our system.
          </div>
          <div className="text-xs text-amber-800 mt-2">
            Two ways forward:
          </div>
          <ul className="text-xs text-amber-800 mt-1 ml-4 list-disc space-y-0.5">
            <li>Finish the ARION setup section first (you may have skipped it)</li>
            <li>If you just finished setup, refresh this page — provisioning takes ~30s to land in our DB</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Connect the data sources ARION pulls insights from. <b>Each row uses YOUR own Google/Bing/Apple account</b> — you authenticate, we just read.
        You can skip any of these and add them later from <code>ARION → Integrations</code>.
      </p>
      <div className="space-y-2">
        <Row
          label="Google — your account (GBP + GSC + Ads)"
          desc="One OAuth on YOUR Google account covers Business Profile, Search Console, and Ads. Powers Local Presence + Search Performance + Conversion reports."
          connected={v.gbp_connected && v.gsc_connected}
          onClick={startGoogleOAuth}
          busyKey="google"
          cta="Connect my Google"
        />
        <Row
          label="Bing — your Bing Webmaster Tools"
          desc="Bing search performance + indexing from YOUR Bing Webmaster account. Optional but recommended."
          connected={v.bing_connected}
          onClick={() => window.open(`/app/arion/integrations?connect=bing&site_id=${siteId}`, "_blank")}
          cta="Connect my Bing"
        />
        <Row
          label="Apple Business Connect"
          desc="Apple Maps + Spotlight listing from YOUR Apple Business account. Optional for service businesses."
          connected={v.apple_claimed}
          onClick={() => window.open(`/app/arion/integrations?connect=apple&site_id=${siteId}`, "_blank")}
          cta="Connect Apple"
        />
        <Row
          label="SE Ranking Project (we manage this)"
          desc="Keyword rank tracking + competitor analysis on OUR SE Ranking account — no external login needed. We auto-create a project tied to your domain."
          connected={v.se_ranking_project_created}
          onClick={createSeProject}
          busyKey="seranking"
          cta="Create project"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600 pt-2">
        <input type="checkbox" checked={v.skipped} onChange={(e) => setV({ ...v, skipped: e.target.checked })} />
        I'll connect the rest later in <code>ARION → Integrations</code>.
      </label>
    </div>
  );
}

// ─── Section: SPARK · Welcome email ──────────────────────────────────────
//
// First nurture: the email a new contact gets after they sign up / get
// imported. We pre-fill with a system default that pulls the tenant's
// business name + owner name. Tenant can edit, pick "system default" to
// use ours as-is, or skip and write it later.
function SparkWelcomeEmailSection({ v, setV, profile, owner }: {
  v: OnboardingState["spark_welcome_email"];
  setV: (v: OnboardingState["spark_welcome_email"]) => void;
  profile: BusinessProfile;
  owner: OwnerAccount;
}) {
  // Live-fill sender defaults when blank — only on initial mount of section.
  useEffect(() => {
    const senderName = v.sender_name || `${owner.first_name || ""} ${owner.last_name || ""}`.trim() || profile.business_name;
    const senderEmail = v.sender_email || profile.primary_contact_email;
    if (senderName !== v.sender_name || senderEmail !== v.sender_email) {
      setV({ ...v, sender_name: senderName || "", sender_email: senderEmail || "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const businessName = profile.business_name || "your business";
  const ownerFirst = owner.first_name || owner.display_name || "the team";
  // 2026-06-20 — Brandon flagged: the previous default used
  // `\{\{contact.first_name|"there"\}\}` (Handlebars-style fallback), but
  // LUMEN-API's interpolate() at lib/emailSender.js:56 only matches
  // `\{\{\\s*[\w.]+\\s*\}\}` — no pipe syntax — so the whole tag rendered
  // verbatim to the recipient. Switched to the simple `\{\{first_name\}\}`
  // shape; the merge-tag picker (Phase 2) will write this for the user.
  // Fallback "there" is handled in the renderer when first_name is null.
  const defaultBody =
`Hi {{first_name}},

Welcome to ${businessName}! I'm ${ownerFirst}, and I wanted to personally say thanks for connecting with us.

Here's what to expect next:
• A short note from us each month with what we're working on
• First access to anything new we ship
• Zero spam — unsubscribe link in every email

If there's anything specific you'd like help with, just hit reply.

Talk soon,
${ownerFirst}
${businessName}`;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        The email a new contact gets the moment they're added. You can use our system default, customize it now, or skip and write it later in SPARK → Templates.
      </p>

      <div className="grid grid-cols-3 gap-2">
        {([
          { id: "system_default", label: "Use system default", desc: "We've written a friendly one for you." },
          { id: "custom",         label: "Write my own",        desc: "Edit it right here." },
          { id: "skip",           label: "Skip for now",        desc: "I'll do it later in SPARK." },
        ] as const).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setV({ ...v, template_choice: opt.id })}
            className={`text-left rounded-lg border-2 p-2 transition ${v.template_choice === opt.id ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-400"}`}
          >
            <div className="text-sm font-semibold">{opt.label}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
          </button>
        ))}
      </div>

      {v.template_choice !== "skip" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sender name" value={v.sender_name} onChange={(s) => setV({ ...v, sender_name: s })} placeholder="Who it's from" />
            <Field label="Sender email" value={v.sender_email} onChange={(s) => setV({ ...v, sender_email: s })} placeholder="hello@yourdomain.com" />
          </div>
          <Field label="Subject line" value={v.subject} onChange={(s) => setV({ ...v, subject: s })} hint="Use {{business_name}} or {{first_name}} to personalize" />
          <Field label="Preview text" value={v.preview_text} onChange={(s) => setV({ ...v, preview_text: s })} hint="Inbox snippet under the subject line." />
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">Email body</label>
              <MergeTagDropdown
                context="spark_welcome"
                onInsert={(tag) => {
                  const cur = v.template_choice === "system_default" ? defaultBody : (v.body || defaultBody);
                  setV({ ...v, body: cur + tag, template_choice: "custom" });
                }}
              />
            </div>
            <textarea
              value={v.template_choice === "system_default" ? defaultBody : (v.body || defaultBody)}
              onChange={(e) => setV({ ...v, body: e.target.value, template_choice: "custom" })}
              rows={14}
              className="w-full mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
              readOnly={v.template_choice === "system_default"}
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Click <b>Insert merge tag ▾</b> to add fields like first name, business name. Falls back to <em>there</em> when a contact has no first name.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Section: SPARK ──────────────────────────────────────────────────────

function SparkSection({ v, setV }: { v: OnboardingState["spark"]; setV: (v: OnboardingState["spark"]) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Sender setup, contact-import plan, brand voice for AI Writer, and first-campaign goal. Skip what doesn't apply.</p>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-slate-700 space-y-1">
        <div className="font-semibold text-slate-800">What "sender domain" means</div>
        <p>
          Every email SPARK sends on your behalf — marketing campaigns, transactional notices (welcome,
          invoice, appointment reminder, past-due) — leaves from this domain.
          {" "}
          <b>Using your own domain (e.g. <code>send.yourbusiness.com</code>)</b> gets better deliverability
          and shows your brand in the From line.
          {" "}
          <b>Leaving blank</b> falls back to our shared <code>@send.ia-dm.com</code> domain — works fine for
          low volume, lower deliverability for larger sends.
        </p>
      </div>
      <Field label="Sender domain" value={v.sender_domain} onChange={(d) => setV({ ...v, sender_domain: d })}
        placeholder="send.yourbusiness.com" hint="You'll add a DNS record after onboarding to verify it." />

      {/* Contact import method */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">How will you import your contacts?</label>
        <div className="grid grid-cols-2 gap-2">
          {([
            ["csv","Upload a CSV (recommended)"],
            ["paste","Paste a list of emails"],
            ["sync","Sync from OLIVER customers"],
            ["later","I'll add them later"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button"
              onClick={() => setV({ ...v, contact_import_method: id })}
              className={`p-3 rounded-lg border-2 text-left text-xs ${v.contact_import_method === id ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-white"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-slate-500 mt-1">Actual import happens at SPARK · Contacts after you finish.</div>
      </div>

      <Field label="Estimated audience size" value={v.audience_size_estimate} onChange={(s) => setV({ ...v, audience_size_estimate: s })}
        placeholder="e.g. 1,200 customers" hint="Drives volume tier recommendations" />

      {/* Send time preference */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Preferred send time</label>
        <div className="flex flex-wrap gap-1.5">
          {([
            ["morning","Morning (8-10am)"],
            ["midday","Midday (11-1pm)"],
            ["afternoon","Afternoon (2-4pm)"],
            ["evening","Evening (5-7pm)"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button"
              onClick={() => setV({ ...v, send_time_preference: id })}
              className={`px-3 py-1.5 rounded text-xs font-semibold border ${v.send_time_preference === id ? "border-orange-500 bg-orange-50 text-orange-900" : "border-slate-300 bg-white text-slate-700"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-slate-500 mt-1">Used as default for "schedule send" in campaign composer (in your time zone).</div>
      </div>

      <BrandVoicePicker
        selected={v.brand_voice}
        custom={v.brand_voice_custom}
        onSelectedChange={(arr) => setV({ ...v, brand_voice: arr })}
        onCustomChange={(s) => setV({ ...v, brand_voice_custom: s })}
        hint="Used by SPARK's AI campaign writer + STELLA optimizations"
      />

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Goal of your first campaign (optional)</label>
        <textarea value={v.first_campaign_goal} onChange={(e) => setV({ ...v, first_campaign_goal: e.target.value })}
          rows={2} placeholder="Welcome existing customers + announce summer league signups opening April 1."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>
    </div>
  );
}

// ─── Section: OLIVER Payments ────────────────────────────────────────────

function OliverPaymentsSection({ v, setV, accent, api }: {
  v: OnboardingState["oliver"];
  setV: (v: OnboardingState["oliver"]) => void;
  accent: string;
  api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T> };
}) {
  const [busy, setBusy] = useState(false);
  // FIX (2026-06-23) — section was showing "Connect Stripe Express" CTA even
  // for tenants that ALREADY have a Stripe Connect account on file (Brandon
  // hit this on his founder tenant 8C9527B9 — stripe_account_id =
  // acct_1TXNOJRvTIeB5DOS exists in oliver.tenant_settings, but the section
  // only tracked a local stripe_connect_started flag and never queried the
  // backend). Fetch real status on mount; render 3 distinct states.
  const [status, setStatus] = useState<{
    has_account: boolean;
    account_id?: string | null;
    charges_enabled?: boolean;
    details_submitted?: boolean;
    mode?: "express_new" | "standard_existing" | null;
    loading: boolean;
  }>({ has_account: false, loading: true });

  // Brandon-locked 2026-06-23: dual-path picker. Customers who ALREADY have
  // a Stripe account can integrate it via Standard Connect OAuth instead of
  // being forced into a fresh Express account. The picker shows BEFORE any
  // Stripe-side flow starts so the customer doesn't accidentally mint a
  // duplicate Express account.
  const [pickedPath, setPickedPath] = useState<"express_new" | "standard_existing" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get<{ has_account?: boolean; account_id?: string | null; charges_enabled?: boolean; details_submitted?: boolean; mode?: "express_new" | "standard_existing" | null }>("/billing/connect/status");
        if (cancelled) return;
        const has = !!(r?.has_account || r?.account_id);
        setStatus({
          has_account: has,
          account_id: r?.account_id || null,
          charges_enabled: !!r?.charges_enabled,
          details_submitted: !!r?.details_submitted,
          mode: r?.mode || null,
          loading: false,
        });
      } catch {
        if (!cancelled) setStatus({ has_account: false, loading: false });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Launch the Express hosted-onboarding flow (path B — fresh account).
  async function launchExpress() {
    setBusy(true);
    try {
      const r = await api.post<{ url?: string }>("/billing/connect/start", {});
      const url = (r as { url?: string })?.url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        setV({ ...v, stripe_connect_started: true });
      }
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  // Launch the Standard Connect OAuth flow (path A — existing account).
  // The backend mints the oauth URL with our state param + client_id; user
  // authenticates on Stripe and authorizes our platform to manage their
  // existing account.
  async function launchStandardOAuth() {
    setBusy(true);
    try {
      const r = await api.post<{ url?: string }>("/billing/connect/oauth-start", {});
      const url = (r as { url?: string })?.url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        setV({ ...v, stripe_connect_started: true });
      }
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  // Resume — flips off the picked path so the user sees the right CTA copy.
  function launch() {
    if (pickedPath === "standard_existing") return launchStandardOAuth();
    return launchExpress();
  }

  if (status.loading) {
    return <div className="text-xs text-slate-500">Checking Stripe Connect status…</div>;
  }

  // State A — fully connected: account exists + KYC complete + charges enabled.
  if (status.has_account && status.charges_enabled) {
    const modeLabel = status.mode === "standard_existing"
      ? "Linked existing Stripe account (Standard)"
      : status.mode === "express_new"
        ? "Stripe Connect Express account"
        : "Stripe Connect already set up";
    return (
      <div className="space-y-3">
        <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-emerald-900">{modeLabel}</div>
              <div className="text-xs text-emerald-800 mt-1">
                Connected account: <code className="font-mono text-[11px]">{status.account_id}</code>.
                Charges are enabled — you can accept customer payments through OLIVER today.
              </div>
              <div className="text-[11px] text-emerald-700 mt-2">Manage at OLIVER · Settings · Payments.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // State B — account exists but KYC not finished. Tell the truth instead of
  // showing the same "Connect Stripe Express" CTA as a fresh tenant.
  if (status.has_account && !status.charges_enabled) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-start gap-3">
            <ExternalLink className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-amber-900">Stripe Connect account created — finish KYC</div>
              <div className="text-xs text-amber-800 mt-1">
                Your Connect account <code className="font-mono text-[11px]">{status.account_id}</code> is created, but Stripe still needs business + bank verification before you can accept payments.
                {status.details_submitted ? " Details submitted — Stripe is reviewing." : " Click below to finish the hosted onboarding."}
              </div>
            </div>
          </div>
          <button onClick={launch} disabled={busy}
            className="px-4 py-2 rounded-lg text-white font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50"
            style={{ background: accent }}>
            <ExternalLink className="h-3.5 w-3.5" /> {busy ? "Opening…" : "Resume Stripe Connect onboarding"}
          </button>
        </div>
      </div>
    );
  }

  // State C — no account yet. Brandon-locked 2026-06-23 dual-path picker:
  //   Option A — "I already have a Stripe account I want to integrate"
  //              → Standard Connect OAuth, links the EXISTING acct_…
  //   Option B — "Set up new Stripe Connect Express account"
  //              → Express hosted onboarding, mints a fresh acct_…
  // Both paths end with stripe_account_id on oliver.tenant_settings; the
  // difference is just whether action() POSTs to /billing/connect/start
  // (Express) or /billing/connect/oauth-start (Standard OAuth).
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Stripe Connect is required to accept customer payments. Pick the option that matches your situation — you can skip and configure later from OLIVER · Payments.
      </p>

      {!pickedPath && (
        <div className="space-y-2">
          {/* Option A — link existing Stripe account */}
          <button
            type="button"
            onClick={() => setPickedPath("standard_existing")}
            className="w-full text-left rounded-lg border-2 border-slate-200 hover:border-slate-400 bg-white p-4 transition"
          >
            <div className="font-semibold text-sm text-slate-900">I already have a Stripe account I want to integrate</div>
            <div className="text-xs text-slate-600 mt-1">
              You already use Stripe for another business or product. We&apos;ll link your existing account via Stripe&apos;s standard OAuth flow — no new account, no duplicate payouts.
            </div>
          </button>

          {/* Option B — new Express account */}
          <button
            type="button"
            onClick={() => setPickedPath("express_new")}
            className="w-full text-left rounded-lg border-2 border-slate-200 hover:border-slate-400 bg-white p-4 transition"
          >
            <div className="font-semibold text-sm text-slate-900">Set up new Stripe Connect Express account</div>
            <div className="text-xs text-slate-600 mt-1">
              You don&apos;t have a Stripe account yet. We&apos;ll spin up a fresh Stripe Connect Express account in your name using Stripe&apos;s hosted onboarding (business + bank info).
            </div>
          </button>
        </div>
      )}

      {pickedPath && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-sm">
              {pickedPath === "standard_existing"
                ? (v.stripe_connect_started ? "OAuth started in new tab" : "Link my existing Stripe account")
                : (v.stripe_connect_started ? "Connect started in new tab" : "Connect Stripe Express")}
            </div>
            <button
              type="button"
              onClick={() => { setPickedPath(null); setV({ ...v, stripe_connect_started: false }); }}
              className="text-[11px] text-slate-500 underline hover:text-slate-700"
            >
              Change option
            </button>
          </div>
          <div className="text-xs text-slate-600">
            {pickedPath === "standard_existing"
              ? "Opens Stripe's OAuth authorize page in a new tab. Sign in to your existing Stripe account and click \"Connect\" — we'll link it here."
              : "Opens Stripe's hosted onboarding in a new tab. Finish business + bank info there, then come back and Save & Continue."}
          </div>
          <button onClick={launch} disabled={busy}
            className="px-4 py-2 rounded-lg text-white font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50"
            style={{ background: accent }}>
            <ExternalLink className="h-3.5 w-3.5" />
            {busy
              ? "Opening…"
              : v.stripe_connect_started
                ? (pickedPath === "standard_existing" ? "Re-open Stripe OAuth" : "Re-open Stripe Connect")
                : (pickedPath === "standard_existing" ? "Connect my Stripe account" : "Connect Stripe Express")}
          </button>
          {v.stripe_connect_started && <div className="text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Launched. Finish in Stripe, then continue here.</div>}
        </div>
      )}
    </div>
  );
}

// ─── Section: OLIVER Templates ───────────────────────────────────────────

function OliverTemplatesSection({ profile }: { profile: BusinessProfile }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Invoice / quote / proposal branding. By default, all three inherit the business profile's logo + brand colors. Override per-template later in OLIVER · Templates.</p>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
        <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Inherited from your business profile</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500 w-16">Logo:</span>
          {profile.logo_url ? <img src={profile.logo_url} alt="Logo" className="h-8 max-w-[120px] object-contain" /> : <span className="text-slate-400 italic">none uploaded</span>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 w-16">Colors:</span>
          <span className="w-5 h-5 rounded border border-slate-300" style={{ background: profile.primary_color }} />
          <span className="w-5 h-5 rounded border border-slate-300" style={{ background: profile.secondary_color }} />
          <span className="w-5 h-5 rounded border border-slate-300" style={{ background: profile.accent_color }} />
        </div>
      </div>
      <p className="text-xs text-slate-500">All three templates (invoice, quote, proposal) get created automatically when you finish onboarding. Per-template overrides (footer text, payment terms, custom headers) live in OLIVER · Templates after launch.</p>
    </div>
  );
}

// ─── Section: OLIVER Portal (customer + employee) ────────────────────────

function OliverPortalSection({ title, v, setV, fallback, variant = "customer" }: {
  title: string;
  v: OnboardingState["oliver"]["customer_portal"];
  setV: (v: OnboardingState["oliver"]["customer_portal"]) => void;
  fallback: BusinessProfile;
  variant?: "customer" | "employee";
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">{variant === "customer"
        ? "What your CUSTOMERS see when they log in to view jobs, invoices, send messages."
        : "What your EMPLOYEES/CREW see when they log in for schedules, dispatch, time tracking."}</p>
      <Field label="Welcome message" value={v.welcome} onChange={(w) => setV({ ...v, welcome: w })}
        placeholder={variant === "customer" ? "Welcome! Here's your portal." : "Hey team — your shift schedule + active jobs."}
        hint="Shown at the top of the portal home screen" />
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">{title} logo (override)</label>
        <Field label="" value={v.logo_override} onChange={(u) => setV({ ...v, logo_override: u })} placeholder="optional — defaults to business profile logo" />
        {v.logo_override && <img src={v.logo_override} alt="" className="mt-1 h-8 max-w-[120px] object-contain" />}
        {!v.logo_override && fallback.logo_url && <div className="mt-1 text-[10px] text-slate-500">Will use: <img src={fallback.logo_url} className="inline h-5 ml-1 align-middle" /></div>}
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Header color (override)</label>
        <div className="flex items-center gap-2">
          <input type="color" value={v.header_color || fallback.primary_color} onChange={(e) => setV({ ...v, header_color: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-gray-300" />
          <input type="text" value={v.header_color} onChange={(e) => setV({ ...v, header_color: e.target.value })} placeholder={`optional — defaults to ${fallback.primary_color}`} className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono" />
        </div>
      </div>
      <div className="space-y-1 pt-1">
        <div className="text-xs font-semibold text-slate-700 mb-1">Features visible to {variant === "customer" ? "customers" : "employees"}:</div>
        {variant === "customer" ? (
          <>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.show_a} onChange={(e) => setV({ ...v, show_a: e.target.checked })} /> Show "Request work" button</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.show_b} onChange={(e) => setV({ ...v, show_b: e.target.checked })} /> Show messaging thread</label>
          </>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.show_a} onChange={(e) => setV({ ...v, show_a: e.target.checked })} /> Show schedule/calendar</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.show_b} onChange={(e) => setV({ ...v, show_b: e.target.checked })} /> Show dispatch / job-board</label>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Section: OLIVER Catalog ─────────────────────────────────────────────

function OliverCatalogSection({ items, setItems }: { items: Array<{ name: string; price: string }>; setItems: (it: Array<{ name: string; price: string }>) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Your first service offerings — what customers will see in your catalog. Add 3-5 to make the portal feel alive on day one. Optional — skip and add later in OLIVER · Service Catalog.</p>
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[1fr_120px_40px] gap-2 items-end">
          <Field label={i === 0 ? "Offering name" : ""} value={it.name} onChange={(v) => { const copy = [...items]; copy[i] = { ...copy[i], name: v }; setItems(copy); }} placeholder="e.g. Standard lawn cut" />
          <Field label={i === 0 ? "Price" : ""} value={it.price} onChange={(v) => { const copy = [...items]; copy[i] = { ...copy[i], price: v }; setItems(copy); }} placeholder="49.99" />
          <button onClick={() => { setItems(items.filter((_, ii) => ii !== i)); }} className="h-9 rounded border border-gray-300 text-xs text-slate-600 hover:bg-slate-50">✕</button>
        </div>
      ))}
      <button onClick={() => setItems([...items, { name: "", price: "" }])}
        className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs text-slate-700">
        + Add another offering
      </button>
    </div>
  );
}

// ─── Section: Consulting ─────────────────────────────────────────────────

function ConsultingSection({ v, setV }: { v: OnboardingState["consulting"]; setV: (v: OnboardingState["consulting"]) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Kickoff details for your consulting engagement. Optional — skip if you'll set up the engagement separately.</p>
      <Field label="Engagement type" value={v.engagement_type} onChange={(t) => setV({ ...v, engagement_type: t })}
        placeholder="Build Your Brand / Clarity / Engine / Foundation" />
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Kickoff notes</label>
        <textarea value={v.first_meeting_notes} onChange={(e) => setV({ ...v, first_meeting_notes: e.target.value })}
          rows={4} placeholder="Topics to cover, goals, pre-work — whatever sets the first session up for success."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>
    </div>
  );
}

// ─── Section: Finish ─────────────────────────────────────────────────────

function FinishSection({ state }: { state: OnboardingState }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm">
        <div className="font-bold text-emerald-900 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Ready to finish</div>
        <div className="text-xs text-emerald-800 mt-1">
          Save & Finish below will send the CIAM welcome email to <strong>{state.profile.primary_contact_email || "the primary contact"}</strong>. They'll receive a signup link, set their password, and land on a guided walkthrough on first login.
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-1 text-sm">
        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide mb-1">Summary</div>
        <SummaryRow label="Business" value={state.profile.business_name} />
        <SummaryRow label="Contact email" value={state.profile.primary_contact_email} />
        <SummaryRow label="Owner" value={[state.owner.first_name, state.owner.last_name].filter(Boolean).join(" ")} />
        {state.arion.domain_choice && <SummaryRow label="ARION domain" value={`${state.arion.domain_choice}: ${state.arion.domain || "(blank)"}`} />}
        {state.spark.sender_domain && <SummaryRow label="SPARK sender" value={state.spark.sender_domain} />}
        {state.oliver.stripe_connect_started && <SummaryRow label="OLIVER payments" value="Stripe Connect launched" />}
        {state.consulting.engagement_type && <SummaryRow label="Consulting" value={state.consulting.engagement_type} />}
      </div>
      <p className="text-[10px] text-slate-500">
        Blank fields are fine. The client can fill them in from their own portal after signup. Save & Finish always works.
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <span className="text-slate-500 w-32 inline-block">{label}:</span> <strong>{value || <span className="text-slate-400 font-normal italic">not set</span>}</strong>
    </div>
  );
}

// ─── Consulting mode (existing-tenant workspace) ─────────────────────────

function ConsultingModeShell({ tenantId, tenantName, onClose }: { tenantId: string; tenantName?: string; onClose: () => void }) {
  return (
    <IadmModal
      open onClose={onClose} product="oliver"
      eyebrow={`Client Workspace · ${tenantName || tenantId}`}
      title="Skinnied client portal"
      subtitle="SPARK Campaigns / Segments / Automations / Templates · OLIVER Automations / Templates · ARION Insights"
      size="info"
      footer={<div className="flex justify-end w-full"><button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-slate-700 font-semibold text-sm">Close</button></div>}
    >
      <div className="px-6 py-5 space-y-4">
        <div className="rounded-xl bg-sky-50 border border-sky-200 p-4 text-sm">
          <div className="font-bold text-sky-900 flex items-center gap-2"><Building2 className="h-4 w-4" /> Working in client tenant</div>
          <div className="text-xs text-sky-800 mt-1">Tenant ID <code className="text-[10px]">{tenantId}</code>. Coming next: sidebar with the skinnied sections + embedded page components scoped to this tenant.</div>
        </div>
        <HelpFooter />
      </div>
    </IadmModal>
  );
}

// ─── Shared field components ─────────────────────────────────────────────

// 2026-06-21 — Brand voice multi-select picker.
// Max 3 voices from BRAND_VOICE_CATALOG + optional custom free-text.
// Cards show voice name, description, and a 2-sentence example.
function BrandVoicePicker({ selected, custom, onSelectedChange, onCustomChange, hint }: {
  selected: string[];
  custom: string;
  onSelectedChange: (s: string[]) => void;
  onCustomChange: (s: string) => void;
  hint?: string;
}) {
  const MAX = 3;
  function toggle(key: string) {
    if (selected.includes(key)) {
      onSelectedChange(selected.filter((k) => k !== key));
    } else if (selected.length < MAX) {
      onSelectedChange([...selected, key]);
    }
  }
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">
        Brand voice <span className="text-slate-400 font-normal">— pick up to 3</span>
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {BRAND_VOICE_CATALOG.map((v) => {
          const active = selected.includes(v.key);
          const disabled = !active && selected.length >= MAX;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => toggle(v.key)}
              disabled={disabled}
              className={`text-left rounded-lg border-2 p-2.5 transition ${
                active ? "border-sky-500 bg-sky-50" :
                disabled ? "border-slate-200 bg-slate-50 opacity-40 cursor-not-allowed" :
                "border-slate-200 bg-white hover:border-slate-400"
              }`}
            >
              <div className="flex items-start gap-2">
                <input type="checkbox" readOnly checked={active} disabled={disabled} className="mt-1" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900">{v.key}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{v.description}</div>
                  <div className="text-[11px] italic text-slate-500 mt-1 leading-snug">"{v.example}"</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-2">
        <label className="block text-xs font-semibold text-slate-700 mb-1">Custom voice notes (optional)</label>
        <input
          type="text"
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder="e.g. Sign off as 'The Team' not 'Owner Name', avoid exclamation points"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

// 2026-06-21 — Curated, per-context merge-tag picker.
// Triggered by "{{" in an input. Shows friendly field names + descriptions.
// Subscription-gated: only shows fields the tenant has product access to.
export const MERGE_TAG_CATALOG: Record<string, { tag: string; friendly: string; description: string; product?: "spark" | "oliver" | "arion" }[]> = {
  spark_welcome: [
    { tag: "{{first_name}}", friendly: "Contact First Name", description: "Renders 'there' when blank" },
    { tag: "{{last_name}}", friendly: "Contact Last Name", description: "Renders blank when missing" },
    { tag: "{{business_name}}", friendly: "Your Business Name", description: "From your tenant profile" },
    { tag: "{{sender_name}}", friendly: "Sender Name", description: "The 'From' name on this email" },
    { tag: "{{unsubscribe_link}}", friendly: "Unsubscribe Link", description: "Required by law for marketing emails" },
  ],
  oliver_overdue: [
    { tag: "{{customer_name}}", friendly: "Customer Name", description: "Their first name (preferred)", product: "oliver" },
    { tag: "{{balance_due}}", friendly: "Balance Due", description: "Formatted as $X.XX", product: "oliver" },
    { tag: "{{days_overdue}}", friendly: "Days Overdue", description: "Integer", product: "oliver" },
    { tag: "{{pay_link}}", friendly: "Pay Link", description: "Stripe-hosted invoice URL", product: "oliver" },
    { tag: "{{business_name}}", friendly: "Your Business Name", description: "From your tenant profile" },
  ],
  oliver_appointment: [
    { tag: "{{customer_name}}", friendly: "Customer Name", description: "First name", product: "oliver" },
    { tag: "{{appointment_date}}", friendly: "Appointment Date", description: "Friendly format (Mon, Jun 24)", product: "oliver" },
    { tag: "{{appointment_time}}", friendly: "Appointment Time", description: "12-hour clock", product: "oliver" },
    { tag: "{{worker_name}}", friendly: "Worker Name", description: "Tech assigned", product: "oliver" },
    { tag: "{{business_name}}", friendly: "Your Business Name", description: "From your tenant profile" },
  ],
};

// 2026-06-21 — Inline merge-tag dropdown. Opens a panel with curated
// per-context fields. Clicking a field inserts the canonical tag at the
// end of the current value via onInsert.
function MergeTagDropdown({ context, onInsert }: {
  context: keyof typeof MERGE_TAG_CATALOG;
  onInsert: (tag: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const tags = MERGE_TAG_CATALOG[context] || [];
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs font-semibold text-sky-700 hover:text-sky-900"
      >
        Insert merge tag ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-72 rounded-lg border border-slate-200 bg-white shadow-lg z-10">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 px-3 pt-2">Available fields</div>
          <div className="max-h-72 overflow-auto py-1">
            {tags.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => { onInsert(t.tag); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-sky-50"
              >
                <div className="text-xs font-semibold text-slate-900">{t.friendly}</div>
                <div className="text-[10px] text-slate-500">{t.description}</div>
                <code className="text-[10px] text-sky-700">{t.tag}</code>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, hint, tip }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; hint?: string; tip?: string;
}) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          {label}
          {tip && <InfoTip text={tip} />}
        </label>
      )}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function PhoneField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
      <PhoneInput value={value} onChange={onChange}
        placeholder="+1 (555) 555-5555"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
    </div>
  );
}

function HelpFooter() {
  return (
    <div className="mt-6 pt-4 border-t border-slate-200 text-center text-[11px] text-slate-500">
      Need help? <a href="https://book.intelligentanalyticsdm.com" target="_blank" rel="noreferrer"
        className="font-semibold underline" style={{ color: CORE_BLUE }}>
        Book an Intelligent Analytics consultation today →
      </a>
    </div>
  );
}

// flushSectionToCanonical — when a section is saved, ALSO write its data to
// the destination tables/services (not just the JSON blob). Best-effort; the
// blob save in persist() is the durable backstop. Per Brandon's G1 decision:
// Save & Continue = save then continue, not just save the blob.
//
// Section-by-section:
//   profile          → PATCH /settings on oliver-api (owns core.tenants R/W)
//   owner            → JSON blob only (CIAM trigger consumes at finish)
//   arion            → JSON blob only tonight; ARION fan-out is overnight
//                      (needs arion-api site config endpoint mapping)
//   spark            → JSON blob only tonight; LUMEN tenant settings overnight
//   oliver_*         → PATCH /settings for portal config; catalog separately overnight
//   consulting       → JSON blob only
//   finish           → no-op (the finish endpoint handles fan-out + CIAM)
async function flushSectionToCanonical(
  sectionId: SectionId,
  state: OnboardingState,
  api: { patch: <T>(p: string, b: unknown) => Promise<T> }
): Promise<void> {
  if (sectionId === "profile") {
    const p = state.profile;
    // 2026-06-20 — only include populated fields. Sending blank strings
    // for every field used to wipe the entire core.tenants row when the
    // user clicked Save before prefill loaded (initial state EMPTY_STATE
    // has every field as ""). The settings.js PATCH handler now also
    // guards against empty strings as a belt-and-suspenders fix, but this
    // is the source.
    const address = [p.address_street, p.address_line2, [p.address_city, p.address_state, p.address_zip].filter(Boolean).join(" ")]
      .filter(Boolean).join(", ");
    const present = (v: unknown) => typeof v === "string" && v.trim() !== "";
    const payload: Record<string, unknown> = {};
    if (present(p.business_name))         payload.tenantFullName = p.business_name;
    if (present(p.primary_contact_email)) payload.email = p.primary_contact_email;
    if (present(p.website))               payload.website = p.website;
    if (present(p.phone))                 payload.phone = p.phone;
    if (present(address))                 payload.address = address;
    if (present(p.logo_url))              payload.logoUrl = p.logo_url;
    if (present(p.primary_color))         payload.brandColor = p.primary_color;
    if (present(p.secondary_color))       payload.brandColorSecondary = p.secondary_color;
    if (present(p.accent_color))          payload.brandColorAccent = p.accent_color;
    if (Object.keys(payload).length === 0) return; // no-op when nothing to send
    await api.patch("/settings", payload);
    return;
  }
  if (sectionId === "oliver_customer_portal" || sectionId === "oliver_employee_portal") {
    // OLIVER portal config goes to oliver.tenant_settings via PATCH /settings
    // (same endpoint extends with portal_* fields). Backend tonight may not
    // yet accept these keys — the call is wrapped in try/catch in the caller.
    const v = sectionId === "oliver_customer_portal"
      ? state.oliver.customer_portal
      : state.oliver.employee_portal;
    const prefix = sectionId === "oliver_customer_portal" ? "customer" : "employee";
    await api.patch("/settings", {
      [`${prefix}PortalWelcome`]: v.welcome || "",
      [`${prefix}PortalLogo`]: v.logo_override || "",
      [`${prefix}PortalHeaderColor`]: v.header_color || "",
      [`${prefix}PortalShowA`]: v.show_a,
      [`${prefix}PortalShowB`]: v.show_b,
    });
    return;
  }
  if (sectionId === "spark_welcome_email") {
    // POST /api/v1/templates creates a SPARK email template. The system-default
    // path stamps a known name we can find later; custom uses the tenant's
    // typed body. "skip" leaves a placeholder template flagged as needs_review.
    const v = (state as OnboardingState).spark_welcome_email;
    if (v.template_choice === "skip") return;
    const body = v.template_choice === "system_default"
      ? `Hi {{contact.first_name|"there"}},\n\nWelcome to ${state.profile.business_name || "us"}! Thanks for connecting.\n\nTalk soon,\n${state.owner.first_name || state.profile.business_name}`
      : (v.body || "");
    try {
      await api.patch("/api/v1/templates/welcome-email", {
        kind: "email",
        slug: "welcome",
        subject: v.subject,
        preview_text: v.preview_text,
        body_html: body,
        sender_name: v.sender_name,
        sender_email: v.sender_email,
        source: "onboarding_modal",
      });
    } catch (e) { console.warn("[onboarding] welcome email save deferred:", e); }
    return;
  }
  if (sectionId === "arion_integrations") {
    // Nothing to flush — state mutations are written as the OAuth callbacks
    // land. JSON blob save covers the user's current checkbox state.
    return;
  }
  if (sectionId === "lifecycle") {
    // PUT /lifecycle/config writes core.tenant_lifecycle_config for this
    // tenant — preset, qualify_trigger, oliver_create_trigger, past_customer_days,
    // negotiation_trigger. Backend lives on oliver-api at /lifecycle/*.
    const v = state.lifecycle;
    await api.patch("/lifecycle/config", {
      preset: v.preset,
      qualify_trigger: v.qualify_trigger,
      oliver_create_trigger: v.oliver_create_trigger,
      past_customer_days: v.past_customer_days,
      negotiation_trigger: v.negotiation_trigger,
    });
    return;
  }
  // owner / arion / spark / oliver_payments / oliver_templates / oliver_catalog /
  // consulting / finish — JSON blob only tonight; canonical-table fan-out
  // happens at finish-onboarding (or is queued for overnight per SCOPE_WORKING.md).
}

// NOTE: mergeStrict() was extracted to src/lib/mergeStrict.ts so the founder
// wizard (ConsultingOnboardClientPageV2) can share the exact same semantics.
// Don't reintroduce a second copy here.

function mergeState(base: OnboardingState, partial: Partial<OnboardingState>): OnboardingState {
  const oliverPartial = (partial.oliver || {}) as Partial<OnboardingState["oliver"]>;
  return {
    profile:    mergeStrict(base.profile,    partial.profile),
    owner:      mergeStrict(base.owner,      partial.owner),
    arion:      mergeStrict(base.arion,      partial.arion),
    spark:      mergeStrict(base.spark,      partial.spark),
    oliver: {
      ...mergeStrict(base.oliver, oliverPartial),
      customer_portal: mergeStrict(base.oliver.customer_portal, oliverPartial.customer_portal),
      employee_portal: mergeStrict(base.oliver.employee_portal, oliverPartial.employee_portal),
      catalog: (Array.isArray(oliverPartial.catalog) && oliverPartial.catalog.some((r) => r && (r.name || r.price)))
        ? oliverPartial.catalog
        : base.oliver.catalog,
    },
    consulting: mergeStrict(base.consulting, partial.consulting),
    lifecycle:  mergeStrict(base.lifecycle,  partial.lifecycle),
    arion_integrations: mergeStrict(base.arion_integrations, partial.arion_integrations),
    spark_welcome_email: mergeStrict(base.spark_welcome_email, partial.spark_welcome_email),
  };
}

export default ClientTenantModal;

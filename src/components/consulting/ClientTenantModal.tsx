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
import { useEffect, useMemo, useState } from "react";
import { IadmModal, CORE_BLUE, PRODUCT_ACCENT } from "../IadmModal";
import { ClientTenantProvider, type ClientTenantValue } from "../../lib/clientTenantContext";
import { useOliverApi } from "../../hooks/useOliverApi";
import { InfoTip } from "../InfoTip";
import { LogoPicker } from "../oliver/LogoPicker";
import { formatPhone } from "../../lib/formatPhone";
import { Building2, CheckCircle2, ExternalLink } from "lucide-react";

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
    domain_choice: "byo" | "purchase" | "subdomain" | "";
    domain: string;
    services: string;
    audience: string;
    voice: string;
  };
  spark: {
    sender_domain: string;
    contacts_imported: number;
    brand_voice: string;
  };
  oliver: {
    stripe_connect_started: boolean;
    customer_portal: { welcome: string; show_a: boolean; show_b: boolean; logo_override: string; header_color: string; };
    employee_portal: { welcome: string; show_a: boolean; show_b: boolean; logo_override: string; header_color: string; };
    catalog: Array<{ name: string; price: string }>;
  };
  consulting: { engagement_type: string; first_meeting_notes: string };
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
  arion: { domain_choice: "", domain: "", services: "", audience: "", voice: "" },
  spark: { sender_domain: "", contacts_imported: 0, brand_voice: "" },
  oliver: {
    stripe_connect_started: false,
    customer_portal: { welcome: "", show_a: true, show_b: true, logo_override: "", header_color: "" },
    employee_portal: { welcome: "", show_a: true, show_b: true, logo_override: "", header_color: "" },
    catalog: [{ name: "", price: "" }],
  },
  consulting: { engagement_type: "", first_meeting_notes: "" },
};

// ─── Section model ───────────────────────────────────────────────────────

type ProductKey = "arion" | "spark" | "oliver" | "consulting";
type SectionId =
  | "profile" | "owner"
  | "arion"
  | "spark"
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
  if (cart.includes("arion")) out.push({ id: "arion", title: "ARION setup", product: "arion" });
  if (cart.includes("spark")) out.push({ id: "spark", title: "SPARK setup", product: "spark" });
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
        ? <UnifiedOnboarding tenantId={tenantId} tenantName={tenantName} cart={cart || ["arion","spark","oliver"]} onClose={onClose} onFinished={onFinished} />
        : <ConsultingModeShell tenantId={tenantId} tenantName={tenantName} onClose={onClose} />}
    </ClientTenantProvider>
  );
}

// ─── Unified onboarding ──────────────────────────────────────────────────

function UnifiedOnboarding({ tenantId, tenantName, cart, onClose, onFinished }: {
  tenantId: string; tenantName?: string; cart: ProductKey[];
  onClose: () => void; onFinished?: () => void;
}) {
  // get/post are CLIENT-scoped (header = client tenant_id) — used for Stripe Connect etc.
  // getFounder/postFounder are FOUNDER-scoped (header = founder tenant_id) —
  // used for /admin/onboard-client/* endpoints which require requireFounder.
  const { get, post, getFounder, postFounder } = useOliverApi();
  const sections = useMemo(() => buildSections(cart), [cart]);
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
    getFounder<{ data?: { state?: Partial<OnboardingState>; prefill?: Partial<OnboardingState>; step?: number } }>(`/admin/onboard-client/onboarding-progress?tenant_id=${encodeURIComponent(tenantId)}`)
      .then((r) => {
        if (cancelled) return;
        const data = (r as { data?: { state?: Partial<OnboardingState>; prefill?: Partial<OnboardingState>; step?: number } })?.data;
        // Merge order: defaults → prefill (from existing tables) → saved state (wins).
        // Per Brandon's rule: don't make users re-enter data the system has.
        setState((s) => {
          let merged = s;
          if (data?.prefill) merged = mergeState(merged, data.prefill);
          if (data?.state)   merged = mergeState(merged, data.state);
          return merged;
        });
        if (typeof data?.step === "number" && data.step >= 0 && data.step < sections.length) {
          setStepIdx(data.step);
        }
      })
      .catch(() => { /* fresh start ok */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, getFounder, sections.length]);

  async function persist(mode: "continue" | "close" | "finish") {
    setSaving(true); setErr(null);
    try {
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
        <div className="flex justify-between w-full gap-2">
          {!isFirst ? (
            <button onClick={() => setStepIdx((i) => Math.max(i - 1, 0))} disabled={saving}
              className="px-4 py-2 rounded-lg border border-gray-300 text-slate-700 font-semibold text-sm disabled:opacity-50">
              ← Back
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={() => persist("close")} disabled={saving}
              className="px-4 py-2 rounded-lg border border-gray-300 text-slate-700 font-semibold text-sm disabled:opacity-50">
              Save & Close
            </button>
            {isLast ? (
              <button onClick={() => persist("finish")} disabled={saving}
                className="px-4 py-2 rounded-lg text-white font-semibold text-sm disabled:opacity-50"
                style={{ background: "#0F766E" }}>
                {saving ? "Finishing…" : "Save & Finish (send welcome) →"}
              </button>
            ) : (
              <button onClick={() => persist("continue")} disabled={saving}
                className="px-4 py-2 rounded-lg text-white font-semibold text-sm disabled:opacity-50"
                style={{ background: accent }}>
                {saving ? "Saving…" : "Save & Continue →"}
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
          <SectionBody section={current} state={state} setState={setState} api={{ get, post }} accent={accent} />
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

function SectionBody({ section, state, setState, api, accent }: {
  section: Section;
  state: OnboardingState;
  setState: (s: OnboardingState | ((prev: OnboardingState) => OnboardingState)) => void;
  api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T> };
  accent: string;
}) {
  switch (section.id) {
    case "profile":                return <ProfileSection profile={state.profile} setProfile={(p) => setState((s) => ({ ...s, profile: p }))} api={api} />;
    case "owner":                  return <OwnerSection owner={state.owner} setOwner={(o) => setState((s) => ({ ...s, owner: o }))} />;
    case "arion":                  return <ArionSection v={state.arion} setV={(v) => setState((s) => ({ ...s, arion: v }))} />;
    case "spark":                  return <SparkSection v={state.spark} setV={(v) => setState((s) => ({ ...s, spark: v }))} />;
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

function ArionSection({ v, setV }: { v: OnboardingState["arion"]; setV: (v: OnboardingState["arion"]) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Domain + the questionnaire that drives WP starter template + brand voice. Every field optional — skip what you don't know.</p>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-2">Domain</label>
        <div className="grid grid-cols-3 gap-2">
          {([["byo","Use existing domain"],["purchase","Buy a new domain"],["subdomain","Use a free *.ia-dm.com subdomain"]] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setV({ ...v, domain_choice: id })}
              className={`p-3 rounded-lg border-2 text-left text-xs ${v.domain_choice === id ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white"}`}>
              {label}
            </button>
          ))}
        </div>
        {v.domain_choice && (
          <Field label={v.domain_choice === "subdomain" ? "Subdomain prefix" : "Domain"} value={v.domain} onChange={(d) => setV({ ...v, domain: d })}
            placeholder={v.domain_choice === "subdomain" ? "rollinginit (becomes rollinginit.ia-dm.com)" : "example.com"} />
        )}
      </div>
      <Field label="Services offered" value={v.services} onChange={(s) => setV({ ...v, services: s })}
        placeholder="e.g. private parties, public skating, lessons, league nights" hint="Feeds the AI-generated website copy + SE Ranking keyword seeds" />
      <Field label="Target audience" value={v.audience} onChange={(a) => setV({ ...v, audience: a })}
        placeholder="e.g. families with kids 5-15, birthday parties, corporate events" />
      <Field label="Brand voice / tone" value={v.voice} onChange={(t) => setV({ ...v, voice: t })}
        placeholder="e.g. playful, family-friendly, energetic — fun-first not corporate" />
    </div>
  );
}

// ─── Section: SPARK ──────────────────────────────────────────────────────

function SparkSection({ v, setV }: { v: OnboardingState["spark"]; setV: (v: OnboardingState["spark"]) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Sender domain verification, contact import, brand voice for AI Writer. All optional.</p>
      <Field label="Sender domain" value={v.sender_domain} onChange={(d) => setV({ ...v, sender_domain: d })}
        placeholder="send.example.com" hint="If blank, campaigns send from @send.ia-dm.com (shared, lower deliverability)" />
      <Field label="Brand voice for AI Writer" value={v.brand_voice} onChange={(b) => setV({ ...v, brand_voice: b })}
        placeholder="e.g. friendly + concise, never use exclamation points" hint="Used by SPARK's AI campaign writer + STELLA optimisations" />
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        Contact import (CSV upload, paste list, or sync from a connected source) lands after you finish onboarding —
        it lives at SPARK · Contacts and stays the source of truth for segments + automations.
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
  async function launch() {
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
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Stripe Connect Express. Required to accept customer payments — but you can skip and configure later from OLIVER · Payments.</p>
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="font-semibold text-sm">{v.stripe_connect_started ? "Connect started in new tab" : "Connect Stripe Express"}</div>
        <div className="text-xs text-slate-600">Opens Stripe's hosted onboarding in a new tab. Finish it there, then come back and Save & Continue.</div>
        <button onClick={launch} disabled={busy}
          className="px-4 py-2 rounded-lg text-white font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50"
          style={{ background: accent }}>
          <ExternalLink className="h-3.5 w-3.5" /> {busy ? "Opening…" : v.stripe_connect_started ? "Re-open Stripe Connect" : "Connect Stripe"}
        </button>
        {v.stripe_connect_started && <div className="text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Launched. Finish in Stripe, then continue here.</div>}
      </div>
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
      <input type="tel" value={value}
        onChange={(e) => onChange(formatPhone(e.target.value))}
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

// Merge persisted (partial) state into full default state without crashing on missing keys.
function mergeState(base: OnboardingState, partial: Partial<OnboardingState>): OnboardingState {
  return {
    profile: { ...base.profile, ...(partial.profile || {}) },
    owner: { ...base.owner, ...(partial.owner || {}) },
    arion: { ...base.arion, ...(partial.arion || {}) },
    spark: { ...base.spark, ...(partial.spark || {}) },
    oliver: {
      ...base.oliver, ...(partial.oliver || {}),
      customer_portal: { ...base.oliver.customer_portal, ...((partial.oliver as Partial<OnboardingState["oliver"]>)?.customer_portal || {}) },
      employee_portal: { ...base.oliver.employee_portal, ...((partial.oliver as Partial<OnboardingState["oliver"]>)?.employee_portal || {}) },
      catalog: ((partial.oliver as Partial<OnboardingState["oliver"]>)?.catalog) || base.oliver.catalog,
    },
    consulting: { ...base.consulting, ...(partial.consulting || {}) },
  };
}

export default ClientTenantModal;

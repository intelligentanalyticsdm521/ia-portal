// PortalActivationWizard — F-127.
//
// Multi-step setup wizard that walks a tenant through publishing a portal
// (customer or crew) for the first time. Opens automatically from
// OliverPortalsHubPage when the user clicks "Edit portal" and the portal
// is_published === false. Once finished, the tenant has:
//   1. Their subdomain slug confirmed (prefilled from business name)
//   2. Design configured (logo, colors, header/footer)
//   3. Signup form fields chosen
//   4. Workflow rules set
//   5. Portal marked published (subdomain bound + visible to the world)
//
// Re-uses the existing tab components (DesignTab / SignupFormBuilder /
// DomainTab / WorkflowTab) so there's a single source of truth for the
// editors. The wizard just sequences them with Next/Back nav + progress
// bar + a final "Publish" step.

import { useEffect, useState } from "react";
import {
  Sparkles, ArrowRight, ArrowLeft, CheckCircle2, Globe, Brush,
  FileText, Settings, Rocket,
} from "lucide-react";
import { IadmModal, IadmButton } from "../IadmModal";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useAppState } from "../../app/AppState";

type WizStep = "name" | "design" | "signup" | "workflow" | "publish";

interface Props {
  open: boolean;
  portalKind: "customer" | "crew";
  onClose: () => void;
  onPublished: () => void;
  // The hub already knows these; pass them in to prefill / skip duplicate fetches.
  initialSlug: string | null;
  initialPublished: boolean;
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

const STEPS: { key: WizStep; label: string; icon: typeof Brush }[] = [
  { key: "name",     label: "Name",     icon: Globe },
  { key: "design",   label: "Design",   icon: Brush },
  { key: "signup",   label: "Signup",   icon: FileText },
  { key: "workflow", label: "Workflow", icon: Settings },
  { key: "publish",  label: "Publish",  icon: Rocket },
];

export function PortalActivationWizard({
  open, portalKind, onClose, onPublished, initialSlug, initialPublished,
}: Props) {
  const { active } = useAppState();
  const { post, ready } = useOliverApi();
  const [step, setStep] = useState<WizStep>("name");
  const [slug, setSlug] = useState<string>("");
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const accent = portalKind === "customer" ? "#1A3A4A" : "#FEC82C";

  // Prefill slug: use the saved slug if any, else slugify business name.
  useEffect(() => {
    if (initialSlug) { setSlug(initialSlug); return; }
    const biz = active?.tenant?.tenantFullName || active?.tenant?.tenantName;
    if (biz) setSlug(slugify(biz));
  }, [active, initialSlug]);

  if (!open) return null;

  const stepIdx = STEPS.findIndex((s) => s.key === step);
  const canBack = stepIdx > 0;
  const canNext = stepIdx < STEPS.length - 1;

  const publish = async () => {
    setPublishing(true); setPublishMsg(null);
    try {
      // Bind the default subdomain on the right SWA. The oliver-api endpoint
      // (POST /portal-domains/bind-default { portal_kind }) handles both the
      // Azure SWA registration AND the oliver.tenant_portal_domain row.
      const r = await post(`/portal-domains/bind-default`, { portal_kind: portalKind });
      setPublishMsg("Portal published! Azure is issuing the SSL cert (1-5 min). Once it's ready, your portal is live.");
      onPublished();
      setTimeout(() => { onClose(); }, 2500);
      return r;
    } catch (e) {
      setPublishMsg(`Failed: ${(e as Error).message}`);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow={`${portalKind.toUpperCase()} PORTAL · SETUP`}
      title={initialPublished ? `Edit ${portalKind} portal` : `Set up your ${portalKind} portal`}
      subtitle={initialPublished
        ? "Walk through each section to update what your customers see."
        : "5-step setup — name, design, signup form, workflow, then publish."}
      size="info"
      footer={
        <>
          <IadmButton variant="ghost" onClick={onClose}>{step === "publish" ? "Done" : "Cancel"}</IadmButton>
          {canBack && step !== "publish" && (
            <IadmButton variant="ghost" onClick={() => setStep(STEPS[stepIdx - 1].key)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </IadmButton>
          )}
          {canNext && (
            <IadmButton
              variant="primary"
              onClick={() => setStep(STEPS[stepIdx + 1].key)}
            >
              Next <ArrowRight className="h-3.5 w-3.5" />
            </IadmButton>
          )}
          {step === "publish" && !initialPublished && (
            <IadmButton variant="primary" onClick={publish} disabled={publishing || !ready}>
              <Rocket className="h-3.5 w-3.5" /> {publishing ? "Publishing…" : "Publish portal"}
            </IadmButton>
          )}
        </>
      }
    >
      <div className="flex h-full flex-col">
        {/* Progress dots */}
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-4 py-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isDone = i < stepIdx;
            const isCurrent = i === stepIdx;
            return (
              <div key={s.key} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center gap-1.5 flex-1 ${isCurrent ? "" : "opacity-60"}`}>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${
                    isDone ? "bg-emerald-500 text-white" : isCurrent ? "text-white" : "bg-slate-200 text-slate-500"
                  }`} style={isCurrent ? { background: accent, color: accent === "#FEC82C" ? "#1A3A4A" : "#fff" } : {}}>
                    {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </div>
                  <span className={`text-xs ${isCurrent ? "font-bold text-slate-900" : "text-slate-600"}`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`h-px flex-1 ${isDone ? "bg-emerald-500" : "bg-slate-200"}`} />}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === "name" && (
            <NameStep
              portalKind={portalKind}
              slug={slug}
              setSlug={setSlug}
              accent={accent}
            />
          )}

          {step === "design" && (
            <div className="text-center text-xs text-slate-600">
              <p className="mb-3">Branding, colors, logo, and copy live on the <strong>Design</strong> tab of the portal editor.</p>
              <p className="text-[11px] text-slate-500">After publishing, you can re-edit the design any time without re-launching this wizard.</p>
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-left text-[11px]">
                <strong>What you'll set:</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Primary + accent colors</li>
                  <li>Logo URL</li>
                  <li>Button corner radius + font</li>
                  <li>Header / footer copy</li>
                  <li>Custom CSS (Pro+ only)</li>
                </ul>
              </div>
            </div>
          )}

          {step === "signup" && (
            <div className="text-center text-xs text-slate-600">
              <p className="mb-3">Pick which fields customers fill out at signup. Includes 25 starter templates across 8 categories + up to 10 custom fields.</p>
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-left text-[11px]">
                <strong>Common starter fields:</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>First / last name + email (required)</li>
                  <li>Phone (recommended)</li>
                  <li>Service address (FSM)</li>
                  <li>Preferred contact method</li>
                  <li>How did you hear about us?</li>
                  <li>+ your own custom fields</li>
                </ul>
              </div>
              <p className="text-[11px] text-slate-500 mt-3">Edit in the <strong>Signup form</strong> tab of the portal editor after publishing.</p>
            </div>
          )}

          {step === "workflow" && (
            <div className="text-center text-xs text-slate-600">
              <p className="mb-3">Set how customer-initiated reschedules + post-booking actions work.</p>
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-left text-[11px]">
                <strong>What you control:</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Allow customer-initiated reschedules (auto / admin-approval / disabled)</li>
                  <li>Auto-create invoice on booking confirm or job completion</li>
                  <li>Auto-send confirmation email + .ics calendar invite</li>
                  <li>Auto-assign worker (round-robin / preferred / skill-match)</li>
                </ul>
              </div>
              <p className="text-[11px] text-slate-500 mt-3">Edit in the <strong>Workflow</strong> tab of the portal editor after publishing.</p>
            </div>
          )}

          {step === "publish" && (
            <div className="text-center max-w-md mx-auto">
              <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-emerald-50 border border-emerald-200">
                <Rocket className="h-7 w-7 text-emerald-600" />
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-900">
                {initialPublished ? "Already published" : `Ready to publish ${portalKind} portal`}
              </h3>
              <p className="mt-2 text-xs text-slate-600">
                {initialPublished
                  ? `Your ${portalKind} portal is live at ${slug}.${portalKind}.ia-dm.com. Click Done to close.`
                  : `One click publishes your portal at ${slug}.${portalKind}.ia-dm.com. Azure will issue the SSL cert (1-5 min), then your portal is live to the world.`}
              </p>
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-left text-[11px]">
                <div className="flex items-center gap-2">
                  <Globe className="h-3 w-3 text-slate-400" />
                  <code className="font-mono">{`https://${slug || 'your-slug'}.${portalKind}.ia-dm.com`}</code>
                </div>
                <p className="text-slate-500 mt-2">Bringing a custom domain later? Pro+ unlocks that in the Domain tab.</p>
              </div>
              {publishMsg && (
                <div className={`mt-3 rounded-md p-3 text-xs ${publishMsg.startsWith('Failed') ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                  {publishMsg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </IadmModal>
  );
}

function NameStep({ portalKind, slug, setSlug, accent }: { portalKind: "customer" | "crew"; slug: string; setSlug: (s: string) => void; accent: string }) {
  const url = `${slug || 'your-slug'}.${portalKind}.ia-dm.com`;
  const isValid = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug);
  return (
    <div className="max-w-md mx-auto">
      <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full" style={{ background: `${accent}1F`, color: accent }}>
        <Sparkles className="h-6 w-6" />
      </div>
      <h3 className="mt-3 text-base font-bold text-slate-900 text-center">Pick a subdomain</h3>
      <p className="mt-2 text-xs text-slate-600 text-center">This is the URL your {portalKind === 'customer' ? 'customers' : 'crew'} will visit. We prefilled it from your business name — edit if you'd like.</p>

      <div className="mt-4">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Subdomain</label>
        <div className="flex items-center mt-1">
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="acme-services"
            className="flex-1 text-sm px-3 py-2 rounded-l-md border border-slate-300 font-mono"
            maxLength={60}
          />
          <span className="text-sm bg-slate-100 border border-slate-300 border-l-0 px-3 py-2 rounded-r-md text-slate-600">.{portalKind}.ia-dm.com</span>
        </div>
        {!isValid && slug && (
          <p className="text-[11px] text-rose-700 mt-1">Use lowercase letters, numbers, and hyphens only. Must start and end with a letter/number.</p>
        )}
        <p className="text-[11px] text-slate-500 mt-2">Final URL: <code className="font-mono bg-slate-100 px-1">https://{url}</code></p>
      </div>

      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
        <strong>Note:</strong> we can't change your subdomain after publishing without breaking existing customer links. Pick one you're happy with. Custom domains (e.g. portal.yourcompany.com) can be added later on Pro+.
      </div>
    </div>
  );
}

export default PortalActivationWizard;

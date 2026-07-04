// UnifiedSetupCard — the ONE "Finish setup" card on the Command Center.
//
// Replaces three legacy cards (OliverSetupCard, SparkSetupCard, ArionSetupCard)
// per Brandon's 2026-06-17 rule: there is ONE onboarding, ONE design, ONE flow.
// Whatever products the tenant has, this single card opens the unified
// ClientTenantModal in onboarding mode. The modal's section list filters
// itself by what's in cart. Prefill hydrates anything already saved so the
// user never re-enters information.
//
// Hide rule: hide ONLY when the unified onboarding_state.finished_at is set.
// Fail-OPEN otherwise — show the card if status is unknown.
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAppState } from "../../app/AppState";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OnboardingWizardModal } from "../consulting/OnboardingWizardModal";
import { WalkthroughRunner } from "../walkthroughs/WalkthroughRunner";
import { findWalkthrough, Walkthrough } from "../walkthroughs/walkthroughRegistry";

interface OnboardingProgress {
  state?: Record<string, unknown> | null;
  prefill?: { cart?: string[]; signup_product?: string | null } & Record<string, unknown>;
  step?: number;
  section_id?: string | null;
  finished_at?: string | null;
  last_saved_at?: string | null;
}

type ProductKey = "arion" | "spark" | "oliver" | "consulting";

export function UnifiedSetupCard() {
  const { activeTenantId } = useAppState();
  const { getFounder, ready } = useOliverApi();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  // After Finish, auto-fire a queue of walkthroughs the user just unlocked
  // (one per product they bought). Plays them in order; user can skip any.
  const [walkthroughQueue, setWalkthroughQueue] = useState<Walkthrough[]>([]);
  const [activeWalkthrough, setActiveWalkthrough] = useState<Walkthrough | null>(null);

  // Auto-open the modal when we just landed from /welcome (post-CIAM activation)
  // OR when ?welcome=1 / ?onboarding=1 is in the URL. Self-serve buyers see
  // the modal pop the moment they sign in. Founder-onboarded clients who
  // arrive here AFTER their founder already onboarded them must NOT see the
  // modal — finished_at being set is the suppression signal.
  useEffect(() => {
    // PA-3 (2026-07-03) — gate on "have we ATTEMPTED a load", not "progress is
    // non-null". `reachable` starts null and only flips true/false inside
    // reload(), which itself no-ops until `ready && activeTenantId` — so
    // reachable !== null means AppGate finished bootstrapping AND we completed
    // one progress fetch. The old `progress === null` guard permanently
    // swallowed the ?welcome=1 intent for a fresh guest buyer whose tenant has
    // NO onboarding-progress row yet (getFounder returns null → progress stays
    // null → wizard never auto-opened, even on a warm bootstrap). This also
    // covers the cold/slow-bootstrap race (activeTenantId null on first paint):
    // reload re-runs when activeTenantId lands, flips reachable, and this
    // effect re-fires.
    if (reachable === null) return; // haven't completed a load attempt yet
    if (!activeTenantId) return;
    const params = new URLSearchParams(window.location.search);
    const wantsOpen = params.has("welcome") || params.has("onboarding");
    if (!wantsOpen) return;
    if (progress?.finished_at) {
      // Founder already onboarded this tenant — nothing for the client to fill.
      // Strip the param so the URL is clean and we don't keep trying.
      params.delete("welcome");
      params.delete("onboarding");
      const newSearch = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash);
      return;
    }
    setOpen(true);
    params.delete("welcome");
    params.delete("onboarding");
    const newSearch = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash);
  }, [progress, reachable, activeTenantId]);

  const reload = useCallback(async () => {
    if (!ready || !activeTenantId) return;
    try {
      // FIX (2026-06-23) — getFounder calls oliverFetch which AUTO-UNWRAPS
      // the {data: ...} envelope at oliverApi.ts:89. The old code typed the
      // response as { data: ... } and then reached for `.data`, which was
      // already gone — so progress was ALWAYS null and the cart prop sent
      // down to ClientTenantModal was always empty. Now we receive the
      // already-unwrapped OnboardingProgress object directly.
      const r = await getFounder<OnboardingProgress | null>(
        `/admin/onboard-client/onboarding-progress?tenant_id=${encodeURIComponent(activeTenantId)}`
      );
      setProgress(r || null);
      setReachable(true);
    } catch {
      setProgress(null);
      setReachable(false);
    }
  }, [getFounder, ready, activeTenantId]);

  useEffect(() => { reload(); }, [reload]);

  // Hide if finished. Otherwise fail-open.
  if (progress?.finished_at) return null;
  // Don't render until we know what tenant we're acting on.
  if (!activeTenantId) return null;

  const hasResumeState = !!progress?.last_saved_at && !progress?.finished_at;
  const buttonLabel = hasResumeState ? "Continue setup" : "Finish setup";

  return (
    <>
      <div className="iadm-card" style={{ borderLeft: "4px solid #1A3A4A" }}>
        <div className="iadm-card-body p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 mt-0.5" style={{ color: "#1A3A4A" }} />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Finish setup</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {hasResumeState
                    ? "Pick up where you left off — your saved progress and existing settings are already loaded."
                    : "One guided walkthrough — business profile, brand, payments, and per-product setup. Skip anything you don't need."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-xs px-3 py-1.5 rounded font-medium text-white flex-shrink-0"
              style={{ background: "#1A3A4A" }}
            >
              {buttonLabel}
            </button>
          </div>
          {reachable === false && (
            <div className="mt-2 text-[10px] text-amber-700">Could not read setup progress — opening starts a fresh walkthrough.</div>
          )}
        </div>
      </div>
      <OnboardingWizardModal
        open={open}
        tenantId={activeTenantId}
        mode="onboarding"
        cart={
          (Array.isArray(progress?.prefill?.cart) && progress!.prefill!.cart!.length
            ? (progress!.prefill!.cart as string[]).filter(
                (k): k is ProductKey => k === "arion" || k === "spark" || k === "oliver" || k === "consulting"
              )
            : undefined)
        }
        onClose={() => { setOpen(false); reload(); }}
        onFinished={() => {
          setOpen(false);
          reload();
          // Build a walkthrough queue based on what the tenant has access to.
          // We use the same prefill.cart that drove the modal sections, so
          // the user sees walkthroughs for every product they actually bought.
          const cart: string[] = Array.isArray(progress?.prefill?.cart) ? (progress!.prefill!.cart as string[]) : [];
          const queue: Walkthrough[] = [];
          if (cart.includes("arion")) {
            ["arion-site", "arion-integrations", "arion-insights"].forEach((id) => {
              const w = findWalkthrough(id); if (w) queue.push(w);
            });
          }
          if (cart.includes("spark")) {
            // G4-S6: SPARK in cart → fire only spark-basics umbrella walkthrough (per DEFECT_PLAN 2026-06-30). Individual spark-* walkthroughs remain in registry for advanced manual re-trigger.
            ["spark-basics"].forEach((id) => {
              const w = findWalkthrough(id); if (w) queue.push(w);
            });
          }
          if (cart.includes("oliver")) {
            ["oliver-customers", "oliver-jobs", "oliver-invoicing", "oliver-subscriptions"].forEach((id) => {
              const w = findWalkthrough(id); if (w) queue.push(w);
            });
          }
          if (queue.length) {
            setWalkthroughQueue(queue.slice(1));
            setActiveWalkthrough(queue[0]);
          }
        }}
      />
      <WalkthroughRunner
        open={!!activeWalkthrough}
        walkthrough={activeWalkthrough}
        onClose={() => {
          setActiveWalkthrough(null);
          setWalkthroughQueue([]);
        }}
        onComplete={() => {
          // Pop the next walkthrough off the queue (if any) or end.
          const next = walkthroughQueue[0] || null;
          setWalkthroughQueue((q) => q.slice(1));
          setActiveWalkthrough(next);
        }}
      />
    </>
  );
}

export default UnifiedSetupCard;

// ArionDashboardSetupBanner — dashboard-top onboarding banner that replaces
// the removed "Get Started" nav entry (task #173).
//
// Sibling to SparkSetupCard / OliverSetupCard / ArionSetupCard (the Command
// Center variants) but tuned for the ARION Dashboard page surface:
//   - Banner shape (full width, eyebrow + title + CTA + dismiss-X), not card
//   - Eyebrow "ARION GET STARTED" matches the SPARK/OLIVER banner pattern
//   - Title is dynamic from the checklist progress
//   - CTA navigates to /app/services/arion_onboarding (verified to exist in
//     serviceCatalog as the canonical guided-onboarding surface)
//   - Dismiss X persists to localStorage (`arion_setup_banner_dismissed`)
//     so the banner stays hidden across refreshes for that user
//   - Hidden when the ARION onboarding checklist reports all required steps
//     complete (= setup is genuinely done)
//
// ARION accent: #1A7DB5 — verified as the canonical ARION color used by
// ArionSetupCard, GetStartedCard's PRODUCT_COLOR.ARION, and 50+ other ARION
// surfaces. (The brief mentioned #5BC5B6 to verify; the audit shows zero
// usages of that hex anywhere in Portal/src — staying with #1A7DB5.)
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { useAppState } from "../../app/AppState";
import { useAccessToken } from "../../auth/useAccessToken";

const DISMISS_KEY = "arion_setup_banner_dismissed";
const ARION_ACCENT = "#1A7DB5";

interface ChecklistStep {
  key: string;
  label: string;
  required: boolean;
  done: boolean;
  locked?: boolean;
}
interface Checklist {
  steps: ChecklistStep[];
  progress: {
    done: number;
    total: number;
    required_done: number;
    required_total: number;
    percent: number;
  };
}

export function ArionDashboardSetupBanner() {
  const { activeTenantId, enabledServices } = useAppState();
  const { getToken } = useAccessToken();
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
  const hasArion =
    enabledServices.has("arion_dashboard") || enabledServices.has("arion_overview");

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return globalThis.localStorage?.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  const [cl, setCl] = useState<Checklist | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);

  const reload = useCallback(async () => {
    if (!activeTenantId || !apiBaseUrl) return;
    try {
      const t = await getToken();
      const res = await globalThis.fetch(`${apiBaseUrl}/arion/onboarding/checklist`, {
        headers: {
          Authorization: `Bearer ${t.accessToken}`,
          "x-tenant-key": activeTenantId,
        },
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      setCl(body?.data || null);
      setReachable(true);
    } catch {
      // Fail-open: if the checklist endpoint isn't reachable but the
      // tenant has ARION enabled, keep showing the banner so they can
      // still discover the onboarding page. Hide it only if they don't
      // have ARION at all.
      setCl(null);
      setReachable(hasArion ? true : false);
    }
  }, [activeTenantId, apiBaseUrl, getToken, hasArion]);

  useEffect(() => { reload(); }, [reload]);

  function dismiss() {
    setDismissed(true);
    try { globalThis.localStorage?.setItem(DISMISS_KEY, "1"); } catch { /* noop */ }
  }

  // ─ Visibility rules ─────────────────────────────────────────────────────
  // 1) User explicitly dismissed → never show again until they clear
  //    localStorage (matches SPARK/OLIVER banner convention).
  if (dismissed) return null;
  // 2) Tenant doesn't have ARION at all → no banner.
  if (reachable === false && !hasArion) return null;
  if (reachable === null && !hasArion) return null;
  // 3) Setup is genuinely complete (all required steps done) → no banner.
  if (
    cl &&
    cl.progress.required_total > 0 &&
    cl.progress.required_done >= cl.progress.required_total
  ) {
    return null;
  }

  const done = cl?.progress.done ?? 0;
  const total = cl?.progress.total ?? 0;
  const pct = cl?.progress.percent ?? 0;

  // Dynamic title: brand-new tenants see the welcome line; mid-setup
  // tenants see their progress count.
  const title =
    cl && total > 0 && done > 0
      ? `${done} of ${total} steps complete`
      : "Welcome to ARION — let's set up your first site";

  // Pick the next required step (or any unlocked step) for the CTA copy.
  const next = cl?.steps.find((s) => !s.done && !s.locked && s.required)
    || cl?.steps.find((s) => !s.done && !s.locked);

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white mb-4 overflow-hidden"
      style={{ borderLeft: `4px solid ${ARION_ACCENT}` }}
    >
      <div className="flex items-start gap-3 p-4">
        <Sparkles className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: ARION_ACCENT }} />
        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
            style={{ color: ARION_ACCENT }}
          >
            ARION Get Started
          </div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {next
              ? `Next: ${next.label}`
              : "Connect Google Analytics, Search Console, Business Profile, and your hosting integrations."}
          </div>

          {/* Progress bar — only renders when we have a real checklist. */}
          {cl && total > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden max-w-xs">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: ARION_ACCENT }}
                />
              </div>
              <span className="font-semibold tabular-nums">{done}/{total}</span>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 flex-shrink-0">
          <Link
            to="/app/services/arion_onboarding"
            className="text-xs px-3 py-1.5 rounded font-medium text-white inline-flex items-center gap-1"
            style={{ background: ARION_ACCENT }}
          >
            {done > 0 ? "Continue setup" : "Start setup"}
            <ArrowRight className="h-3 w-3" />
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
            aria-label="Dismiss ARION setup banner"
            title="Dismiss — won't show again on this device"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ArionDashboardSetupBanner;

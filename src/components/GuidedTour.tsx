// GuidedTour — F-119.
//
// Self-contained, dependency-free product tour. Each tour is a sequence of
// steps `{ targetSelector, title, body, placement, route? }`. The component
// renders a semi-transparent backdrop, a "spotlight" cut-out around the
// current step's target element, and a floating tooltip beside it.
//
// Why in-house rather than react-joyride / Shepherd?
//   - Zero new runtime dependencies — fits the existing pattern (IadmModal,
//     SetupHints are also in-house).
//   - Matches our visual language (slate colors, accent-coded per product).
//   - We need step-driven routing (jumping between pages mid-tour), which
//     react-joyride doesn't do cleanly without custom callbacks anyway.
//
// Persistence: localStorage["tour:completed:${tourId}"] = "1". A tour that
// has been completed (or skipped) won't auto-launch again, but the user can
// re-launch from the header "?" menu.
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, ChevronRight, ChevronLeft, Play } from "lucide-react";

export interface TourStep {
  targetSelector?: string;             // CSS selector; omit for centered hero step
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  route?: string;                       // navigate here before showing step
  // Optional pre-step delay (ms) — useful when route navigation triggers
  // a lazy chunk to load before the target appears.
  waitMs?: number;
}

export interface TourDef {
  id: string;
  title: string;
  accent?: string;
  steps: TourStep[];
}

function tourCompleted(id: string): boolean {
  try { return localStorage.getItem(`tour:completed:${id}`) === "1"; }
  catch { return false; }
}

function markTourCompleted(id: string) {
  try { localStorage.setItem(`tour:completed:${id}`, "1"); } catch { /* ignore */ }
}

export function resetTour(id: string) {
  try { localStorage.removeItem(`tour:completed:${id}`); } catch { /* ignore */ }
}

interface GuidedTourProps {
  tour: TourDef;
  open: boolean;
  onClose: () => void;
  // When true, completing/skipping marks the tour completed so it doesn't
  // auto-replay. Default true; pass false for "preview" re-runs.
  persistOnFinish?: boolean;
}

export function GuidedTour({ tour, open, onClose, persistOnFinish = true }: GuidedTourProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const accent = tour.accent || "#1A3A4A";

  const step = tour.steps[stepIdx];

  // When a step has a route, navigate first; the layout effect picks up the
  // target element once the new page mounts.
  useEffect(() => {
    if (!open || !step) return;
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
    }
  }, [open, step, location.pathname, navigate]);

  // Find target element + measure. Re-measures on resize/scroll.
  useLayoutEffect(() => {
    if (!open || !step) return;
    setReady(false);

    let cancelled = false;
    let raf = 0;
    const start = performance.now();
    const minWait = step.waitMs ?? (step.route ? 250 : 0);

    function measure() {
      if (cancelled) return;
      // Centered hero step needs no target.
      if (!step.targetSelector || step.placement === "center") {
        setTargetRect(null);
        setReady(true);
        return;
      }
      const el = document.querySelector(step.targetSelector) as HTMLElement | null;
      const elapsed = performance.now() - start;
      if (!el) {
        // Keep trying for up to 4s — lazy-loaded chunks can take a moment.
        if (elapsed < 4000) {
          raf = requestAnimationFrame(measure);
          return;
        }
        setTargetRect(null); // give up, show centered tooltip
        setReady(true);
        return;
      }
      if (elapsed < minWait) {
        raf = requestAnimationFrame(measure);
        return;
      }
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      // Scroll target into view if it's offscreen.
      const inViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
      if (!inViewport) el.scrollIntoView({ behavior: "smooth", block: "center" });
      setReady(true);
    }
    measure();

    function onResize() { measure(); }
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, step, location.pathname]);

  // Reset to first step whenever the tour opens.
  useEffect(() => {
    if (open) setStepIdx(0);
  }, [open, tour.id]);

  const finish = () => {
    if (persistOnFinish) markTourCompleted(tour.id);
    onClose();
  };

  const next = () => {
    if (stepIdx + 1 >= tour.steps.length) finish();
    else setStepIdx((i) => i + 1);
  };
  const prev = () => setStepIdx((i) => Math.max(0, i - 1));

  if (!open || !step) return null;

  // Tooltip position
  const tooltipStyle: React.CSSProperties = (() => {
    const pad = 12;
    const w = 320;
    const h = 180; // approx
    if (!targetRect || step.placement === "center") {
      return { left: `calc(50% - ${w / 2}px)`, top: `calc(50% - ${h / 2}px)`, width: w };
    }
    const placement = step.placement || (targetRect.top > window.innerHeight / 2 ? "top" : "bottom");
    let top = targetRect.top;
    let left = targetRect.left;
    if (placement === "bottom") { top = targetRect.bottom + pad; left = targetRect.left; }
    else if (placement === "top") { top = targetRect.top - h - pad; left = targetRect.left; }
    else if (placement === "right") { top = targetRect.top; left = targetRect.right + pad; }
    else if (placement === "left") { top = targetRect.top; left = targetRect.left - w - pad; }
    // Keep on screen
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    return { top, left, width: w };
  })();

  // Spotlight cut-out via box-shadow (covers entire viewport with a hole).
  const spotlightStyle: React.CSSProperties = targetRect ? {
    position: "fixed",
    top: targetRect.top - 6,
    left: targetRect.left - 6,
    width: targetRect.width + 12,
    height: targetRect.height + 12,
    borderRadius: 8,
    boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
    pointerEvents: "none",
    transition: "all 200ms ease",
    border: `2px solid ${accent}`,
    zIndex: 9998,
  } : {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.55)",
    zIndex: 9998,
  };

  return (
    <div className="fixed inset-0 z-[9997]" role="dialog" aria-modal="true" aria-label={tour.title}>
      <div style={spotlightStyle} />
      {ready && (
        <div
          className="fixed z-[9999] rounded-xl bg-white shadow-2xl border-2"
          style={{ ...tooltipStyle, borderColor: accent }}
        >
          <div
            className="flex items-center justify-between rounded-t-lg px-3 py-2"
            style={{ background: accent, color: accent === "#FEC82C" ? "#1A3A4A" : "#fff" }}
          >
            <div className="flex items-center gap-2">
              <Play className="h-3.5 w-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {tour.title} · {stepIdx + 1} of {tour.steps.length}
              </span>
            </div>
            <button onClick={finish} className="rounded p-0.5 hover:bg-black/10" aria-label="Skip tour">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="p-4">
            <div className="text-sm font-bold text-slate-900 mb-1.5">{step.title}</div>
            <div className="text-xs text-slate-600 leading-relaxed">{step.body}</div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
            <button onClick={finish} className="text-[11px] text-slate-500 hover:text-slate-700">
              Skip tour
            </button>
            <div className="flex items-center gap-1.5">
              {stepIdx > 0 && (
                <button
                  onClick={prev}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-3 w-3" /> Back
                </button>
              )}
              <button
                onClick={next}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white"
                style={{ background: accent, color: accent === "#FEC82C" ? "#1A3A4A" : "#fff" }}
              >
                {stepIdx + 1 === tour.steps.length ? "Finish" : <>Next <ChevronRight className="h-3 w-3" /></>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tour content registry ────────────────────────────────────────────────────
//
// Per-product tours. Add a tour here and surface it from the GuidedTourLauncher
// or wherever you want it auto-launched.

export const OLIVER_QUICK_TOUR: TourDef = {
  id: "oliver_quick_v1",
  title: "OLIVER — Quick Tour",
  accent: "#FEC82C",
  steps: [
    {
      title: "Welcome to OLIVER",
      body: "Your field-service command center. We'll spend ~60 seconds showing you the spots that matter on day one.",
      placement: "center",
      route: "/app/services/oliver_dashboard",
    },
    {
      title: "Today's headline",
      body: "The top of the dashboard always summarizes the most urgent thing — overdue invoices, missing workers, jobs that need attention.",
      targetSelector: ".iadm-page-header, h1, [data-tour='oliver-headline']",
      placement: "bottom",
    },
    {
      title: "Job Board",
      body: "Five buckets: Quotes → Scheduled → In Progress → Completed → Closed. Drag jobs between buckets to advance them.",
      targetSelector: "a[href='/app/services/oliver_job_board']",
      placement: "right",
    },
    {
      title: "Customer & Crew Portals",
      body: "Both portals live behind a single hub. Configure design, signup form, custom domain, and workflow rules here.",
      targetSelector: "a[href='/app/services/oliver_portals_hub']",
      placement: "right",
    },
    {
      title: "Settings live behind the gear",
      body: "Workflow Settings, Business Setup, Team Access — anything that's pure config — lives in the Settings hub via the left IconRail gear.",
      placement: "center",
    },
  ],
};

export const SPARK_QUICK_TOUR: TourDef = {
  id: "spark_quick_v1",
  title: "SPARK — Quick Tour",
  accent: "#EF6C33",
  steps: [
    {
      title: "Welcome to SPARK",
      body: "Marketing + CRM in one. We'll walk through the four sections you'll touch most often.",
      placement: "center",
      route: "/app/services/spark_overview",
    },
    {
      title: "Contacts",
      body: "Your CRM core. Import from CSV, segment by tags, and feed campaigns + automations.",
      targetSelector: "a[href='/app/services/spark_contacts']",
      placement: "right",
    },
    {
      title: "Campaigns",
      body: "Send one-off email or SMS broadcasts. Pick a list, pick a template, send.",
      targetSelector: "a[href='/app/services/spark_campaigns']",
      placement: "right",
    },
    {
      title: "Workflow & Automations",
      body: "Set-and-forget rules — welcome series, lead routing, anomaly alerts. They fire on their own.",
      targetSelector: "a[href='/app/services/spark_automations']",
      placement: "right",
    },
    {
      title: "IA Insights",
      body: "Health → Trends → Intelligence → Cross-Channel. Same pattern across every product, so you always know where to look.",
      targetSelector: "a[href='/app/services/spark_ia_insights_health']",
      placement: "right",
    },
  ],
};

export const ARION_QUICK_TOUR: TourDef = {
  id: "arion_quick_v1",
  title: "ARION — Quick Tour",
  accent: "#38BDF8",
  steps: [
    {
      title: "Welcome to ARION",
      body: "Your website's home base — analytics, SEO, security, business profile. We'll show you the four sections that matter most.",
      placement: "center",
      route: "/app/services/arion_dashboard",
    },
    {
      title: "Search Engine Analytics",
      body: "GA4 + Google Search Console rolled up. Traffic, audience, conversions — all in one place.",
      targetSelector: "a[href='/app/services/arion_analytics_overview']",
      placement: "right",
    },
    {
      title: "SEO",
      body: "Rankings, site audit, AI Search results, Market Monitor. The deeper your SEO tier, the more of this lights up.",
      targetSelector: "a[href='/app/services/arion_seo_overview']",
      placement: "right",
    },
    {
      title: "Business Profile",
      body: "Google Business Profile reviews, posts, and insights. Bing Places + Apple Maps too.",
      targetSelector: "a[href='/app/services/arion_business_overview']",
      placement: "right",
    },
    {
      title: "IA Insights",
      body: "Cross-product intelligence — Health → Trends → Intelligence → Cross-Channel.",
      targetSelector: "a[href='/app/services/arion_ia_insights_health']",
      placement: "right",
    },
  ],
};

export const ALL_TOURS: TourDef[] = [OLIVER_QUICK_TOUR, SPARK_QUICK_TOUR, ARION_QUICK_TOUR];

// Returns the first tour that hasn't been completed for this user — used by
// the auto-launch logic to decide whether to pop a tour on first dashboard
// visit. Returns null if everything's been completed.
export function pickFirstUnseenTour(): TourDef | null {
  for (const t of ALL_TOURS) if (!tourCompleted(t.id)) return t;
  return null;
}

export function hasCompletedTour(id: string): boolean {
  return tourCompleted(id);
}

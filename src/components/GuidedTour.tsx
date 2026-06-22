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
import { useSparkApi } from "../hooks/useSparkApi";

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
  const sparkApi = useSparkApi();
  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const accent = tour.accent || "#1A3A4A";

  const step = tour.steps[stepIdx];

  // Infer a navigation target from `a[href='...']` selectors so steps that
  // highlight a nav item also navigate to that route — which makes the SubNav
  // auto-expand the right section, exposing the link to the spotlight.
  const inferredRoute = (() => {
    if (step?.route) return step.route;
    const m = step?.targetSelector?.match(/a\[href=['"]([^'"]+)['"]\]/);
    return m ? m[1] : undefined;
  })();

  // When a step has a route, navigate first; the layout effect picks up the
  // target element once the new page mounts.
  useEffect(() => {
    if (!open || !step) return;
    if (inferredRoute && location.pathname !== inferredRoute) {
      navigate(inferredRoute);
    }
  }, [open, step, inferredRoute, location.pathname, navigate]);

  // Find target element + measure. Re-measures on resize/scroll/route
  // change. Also re-measures after smooth-scroll so the spotlight tracks
  // the final on-screen position (was a major bug — initial rect was
  // captured before the scroll completed, leaving the spotlight stuck
  // where the element WAS before scrolling).
  useLayoutEffect(() => {
    if (!open || !step) return;
    setReady(false);

    // If the step has an inferred route and we're not yet there, wait
    // for the navigation to land before even starting to look for the
    // target element. Avoids capturing a stale rect from the previous page.
    if (inferredRoute && location.pathname !== inferredRoute) return;

    let cancelled = false;
    let raf = 0;
    let reMeasureTimer = 0;
    const start = performance.now();
    const minWait = step.waitMs ?? (step.route ? 400 : 0);

    function captureRect() {
      if (!step.targetSelector) return null;
      const el = document.querySelector(step.targetSelector) as HTMLElement | null;
      return el?.getBoundingClientRect() || null;
    }

    function measure() {
      if (cancelled) return;
      if (!step.targetSelector || step.placement === "center") {
        setTargetRect(null);
        setReady(true);
        return;
      }
      const el = document.querySelector(step.targetSelector) as HTMLElement | null;
      const elapsed = performance.now() - start;
      if (!el) {
        // Lazy-loaded chunks can take a moment; keep trying up to 4s.
        if (elapsed < 4000) {
          raf = requestAnimationFrame(measure);
          return;
        }
        setTargetRect(null);
        setReady(true);
        return;
      }
      if (elapsed < minWait) {
        raf = requestAnimationFrame(measure);
        return;
      }
      const initialRect = el.getBoundingClientRect();
      setTargetRect(initialRect);
      // Scroll target into view if it's not visible enough.
      const inViewport = initialRect.top >= 0 && initialRect.bottom <= window.innerHeight - 20;
      if (!inViewport) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Smooth scroll takes ~300-500ms; re-measure after to catch the
        // final position. Then one more re-measure ~600ms later as a safety
        // net for slower browsers.
        reMeasureTimer = window.setTimeout(() => {
          if (cancelled) return;
          const r = captureRect();
          if (r) setTargetRect(r);
          reMeasureTimer = window.setTimeout(() => {
            if (cancelled) return;
            const r2 = captureRect();
            if (r2) setTargetRect(r2);
          }, 600);
        }, 350);
      }
      setReady(true);
    }
    measure();

    function onResize() {
      if (cancelled) return;
      const r = captureRect();
      if (r) setTargetRect(r);
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(reMeasureTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, step, location.pathname, inferredRoute]);

  // Reset to first step whenever the tour opens.
  useEffect(() => {
    if (open) setStepIdx(0);
  }, [open, tour.id]);

  const finish = () => {
    if (persistOnFinish) {
      markTourCompleted(tour.id);
      // Walkthrough hook (Onboarding V3 Phase 3, Batch 14+) — close the
      // tenant-wide "Take the product tour" walkthrough task. Fire-and-
      // forget: a LUMEN-API failure must NEVER block the tour close. The
      // by-kind endpoint is idempotent so finishing the tour multiple times
      // (replay path) is harmless.
      if (sparkApi.ready) {
        sparkApi
          .post<unknown>("/api/v1/walkthrough/tasks/by-kind/platform_tour/complete")
          .catch(() => { /* best-effort */ });
      }
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// OLIVER tour — walks the dashboard + every left-nav section. Each step
// either highlights a nav item OR navigates to a sub-page (route field) and
// highlights its main heading. Total ~20 steps, ~2-3 minutes.
// ─────────────────────────────────────────────────────────────────────────────
export const OLIVER_QUICK_TOUR: TourDef = {
  id: "oliver_full_v1",
  title: "OLIVER — Full Tour",
  accent: "#FEC82C",
  steps: [
    {
      title: "Welcome to OLIVER",
      body: "Your field-service command center. We'll walk every section in OLIVER so you know where each tool lives. ~2 minutes; skip anytime.",
      placement: "center",
      route: "/app/services/oliver_dashboard",
    },
    {
      title: "Dashboard headline",
      body: "The top of the dashboard always summarizes the most urgent thing — overdue invoices, missing workers, jobs that need attention.",
      targetSelector: "h1, [data-tour='oliver-headline']",
      placement: "bottom",
    },
    // ── Customers ───────────────────────────────────────────────────────────
    {
      title: "Customers — Contacts",
      body: "Your customer list. The unified Customer Modal opens from here for full job/quote/invoice history per person.",
      targetSelector: "a[href='/app/services/oliver_contacts']",
      placement: "right",
    },
    {
      title: "Customers — Service Requests",
      body: "Inbound requests from your customer portal land here. Convert them into quotes or jobs with one click.",
      targetSelector: "a[href='/app/services/oliver_service_requests']",
      placement: "right",
    },
    {
      title: "Customers — Booking",
      body: "Your public-facing booking page — services offered, slot configuration, and the URL customers visit to book themselves.",
      targetSelector: "a[href='/app/services/oliver_booking']",
      placement: "right",
    },
    // ── Jobs ────────────────────────────────────────────────────────────────
    {
      title: "Jobs — Job Board",
      body: "Five buckets: Quotes → Scheduled → In Progress → Completed → Closed. Drag jobs between buckets to advance them.",
      targetSelector: "a[href='/app/services/oliver_job_board']",
      placement: "right",
    },
    {
      title: "Jobs — Schedule",
      body: "Calendar view of every scheduled job + worker availability. Click a day for the day view.",
      targetSelector: "a[href='/app/services/oliver_schedule']",
      placement: "right",
    },
    {
      title: "Jobs — Archive",
      body: "Closed jobs older than 7 days move here. Searchable for record-keeping; doesn't clutter the active board.",
      targetSelector: "a[href='/app/services/oliver_jobs_archive']",
      placement: "right",
    },
    // ── Products & Services ────────────────────────────────────────────────
    {
      title: "Products & Services — Catalog",
      body: "Define what you sell — name, duration, default price, category. Catalog items drive job creation and pricing.",
      targetSelector: "a[href='/app/services/oliver_catalog']",
      placement: "right",
    },
    {
      title: "Service Categories",
      body: "Worker skill taxonomy (Plumbing, Electrical, etc.) — drives auto-assign and customer worker preferences.",
      targetSelector: "a[href='/app/services/oliver_service_categories']",
      placement: "right",
    },
    {
      title: "Coupons",
      body: "Discount codes you can apply to invoices, quotes, and the booking flow.",
      targetSelector: "a[href='/app/services/oliver_coupons']",
      placement: "right",
    },
    // ── Billing ─────────────────────────────────────────────────────────────
    {
      title: "Billing — Invoices",
      body: "Every invoice, with one-click charge-saved-card and send-pay-link actions. Stripe-backed.",
      targetSelector: "a[href='/app/services/oliver_invoices']",
      placement: "right",
    },
    {
      title: "Billing — Subscriptions",
      body: "Recurring jobs that auto-bill. Picks the right Stripe schedule and auto-creates the first job.",
      targetSelector: "a[href='/app/services/oliver_recurring']",
      placement: "right",
    },
    {
      title: "Billing — Payments",
      body: "Every Stripe charge — successful, refunded, disputed. The audit trail of money in.",
      targetSelector: "a[href='/app/services/oliver_payments']",
      placement: "right",
    },
    {
      title: "Billing — Templates",
      body: "Reusable invoice, quote, and proposal templates with your branding baked in.",
      targetSelector: "a[href='/app/services/oliver_templates']",
      placement: "right",
    },
    // ── Team ────────────────────────────────────────────────────────────────
    {
      title: "Team — Workers",
      body: "Your crew. Invite via email, set roles, regions, skills, and Stripe payout details.",
      targetSelector: "a[href='/app/services/oliver_workers']",
      placement: "right",
    },
    // ── Workflow & Automations ─────────────────────────────────────────────
    {
      title: "Workflow — Automations",
      body: "Pre-built rules: booking confirmations, on-the-way SMS, auto-invoice on completion, auto-assign workers.",
      targetSelector: "a[href='/app/services/oliver_automations']",
      placement: "right",
    },
    {
      title: "Workflow — Customer & Crew Portals",
      body: "Both portals live in one hub: design, signup form, custom domain, and workflow rules — all per-portal.",
      targetSelector: "a[href='/app/services/oliver_portals_hub']",
      placement: "right",
    },
    {
      title: "Workflow — Settings",
      body: "Reschedule policy, post-booking actions, and the customer signup form builder.",
      targetSelector: "a[href='/app/services/oliver_workflow_settings']",
      placement: "right",
    },
    {
      title: "Workflow — Add-ons",
      body: "Stack-on subscriptions — SMS Essentials/Growth/Authority for operational notifications.",
      targetSelector: "a[href='/app/services/oliver_addons']",
      placement: "right",
    },
    // ── IA Insights ─────────────────────────────────────────────────────────
    {
      title: "IA Insights — Health",
      body: "Operational health gauge — utilization, on-time rate, win rate, customer satisfaction. Same shape across every product.",
      targetSelector: "a[href='/app/services/oliver_ia_insights_health']",
      placement: "right",
    },
    {
      title: "IA Insights — Trends + Intelligence",
      body: "Trends shows what's moving WoW/MoM. Intelligence calls out the why with action recommendations.",
      targetSelector: "a[href='/app/services/oliver_ia_insights_trends']",
      placement: "right",
    },
    // ── Reports ─────────────────────────────────────────────────────────────
    {
      title: "Reports",
      body: "Pre-built reports across jobs, revenue, workers, and customers. Export to CSV or schedule by email.",
      targetSelector: "a[href='/app/services/oliver_reports']",
      placement: "right",
    },
    {
      title: "Activity Log",
      body: "Every meaningful action by every user — audit trail for compliance and troubleshooting.",
      targetSelector: "a[href='/app/services/oliver_activity_log']",
      placement: "right",
    },
    {
      title: "Settings hub — the gear",
      body: "Pure-config surfaces (Business Setup, Team Access, Service Categories, Workflow Settings) live behind the gear in the left IconRail.",
      placement: "center",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// SPARK tour — walks every section. ~22 steps.
// ─────────────────────────────────────────────────────────────────────────────
export const SPARK_QUICK_TOUR: TourDef = {
  id: "spark_full_v1",
  title: "SPARK — Full Tour",
  accent: "#EF6C33",
  steps: [
    {
      title: "Welcome to SPARK",
      body: "Marketing + CRM in one. We'll walk every section of SPARK. ~2 minutes; skip anytime.",
      placement: "center",
      route: "/app/services/spark_overview",
    },
    // ── CRM ────────────────────────────────────────────────────────────────
    {
      title: "CRM — Contacts",
      body: "Your CRM core. Import from CSV, search, segment, and open the unified contact modal for full history.",
      targetSelector: "a[href='/app/services/spark_contacts']",
      placement: "right",
    },
    {
      title: "CRM — Import",
      body: "CSV upload with field mapping, dedupe, and per-row error reporting.",
      targetSelector: "a[href='/app/services/spark_contact_import']",
      placement: "right",
    },
    {
      title: "CRM — Companies",
      body: "B2B accounts that group contacts. Roll-up reporting per company.",
      targetSelector: "a[href='/app/services/spark_accounts']",
      placement: "right",
    },
    {
      title: "CRM — Lists, Segments, Tags",
      body: "Three ways to slice your contacts — static lists, dynamic segments, free-form tags. Used by every campaign and automation.",
      targetSelector: "a[href='/app/services/spark_lists']",
      placement: "right",
    },
    {
      title: "CRM — Health Score",
      body: "Per-contact churn / engagement score driven by activity, recency, and email behaviour.",
      targetSelector: "a[href='/app/services/spark_health_score']",
      placement: "right",
    },
    // ── Outreach ────────────────────────────────────────────────────────────
    {
      title: "Outreach — Campaigns",
      body: "One-off broadcasts — email or SMS. Pick a list, pick a template, schedule the send.",
      targetSelector: "a[href='/app/services/spark_campaigns']",
      placement: "right",
    },
    {
      title: "Outreach — Newsletter Studio",
      body: "Long-form recurring newsletter builder with editorial calendar and per-issue analytics.",
      targetSelector: "a[href='/app/services/spark_newsletter']",
      placement: "right",
    },
    {
      title: "Outreach — Social & Calendar",
      body: "Schedule posts across channels; see what's queued and what's already shipped.",
      targetSelector: "a[href='/app/services/spark_social']",
      placement: "right",
    },
    {
      title: "Outreach — SMS Inbox",
      body: "Two-way SMS — see customer replies, respond inline.",
      targetSelector: "a[href='/app/services/spark_sms_inbox']",
      placement: "right",
    },
    {
      title: "Outreach — Deliverability",
      body: "Sender reputation, bounce rates, complaint feedback. Catches problems before they tank your domain.",
      targetSelector: "a[href='/app/services/spark_deliverability']",
      placement: "right",
    },
    // ── Capture ─────────────────────────────────────────────────────────────
    {
      title: "Capture — Forms",
      body: "Lead-capture forms library. Each form has an embed snippet and feeds the contacts table.",
      targetSelector: "a[href='/app/services/spark_forms']",
      placement: "right",
    },
    {
      title: "Capture — Landing Pages",
      body: "Single-page campaigns with branded design + a form. Great for paid traffic.",
      targetSelector: "a[href='/app/services/spark_landing_pages']",
      placement: "right",
    },
    {
      title: "Capture — QR Codes",
      body: "Trackable QR codes for print, vehicle wraps, signage. Each scan creates a touchpoint.",
      targetSelector: "a[href='/app/services/spark_qr_codes']",
      placement: "right",
    },
    // ── Workflow & Automations ─────────────────────────────────────────────
    {
      title: "Workflow — Customer Lifecycle Flow",
      body: "Pick the customer journey your business follows — Quick Sale, Service Pipeline (recommended default), Quote-Driven, Subscription, or Enterprise B2B. Stages drive scoring, automations, and reporting. Stage labels are renameable.",
      targetSelector: "a[href='/app/spark/customer-flow']",
      placement: "right",
    },
    {
      title: "Workflow — Workflows & Automations",
      body: "Unified library of triggers + rules + automations. One 'New workflow' button opens a chooser. JSON-free builders — pick an action, the right fields appear.",
      targetSelector: "a[href='/app/services/spark_workflows_automations']",
      placement: "right",
    },
    {
      title: "Workflow — Journeys",
      body: "Multi-step visual journey builder. Branch on contact properties for personalized paths.",
      targetSelector: "a[href='/app/services/spark_journey_builder']",
      placement: "right",
    },
    {
      title: "Workflow — Rules",
      body: "Always-on rules: scoring, routing, auto-tag. Configured once; runs forever on every new contact.",
      targetSelector: "a[href='/app/services/spark_rules']",
      placement: "right",
    },
    {
      title: "Workflow — Templates",
      body: "Reusable email + SMS message library. Used by campaigns AND automations.",
      targetSelector: "a[href='/app/services/spark_templates']",
      placement: "right",
    },
    // ── Sales ───────────────────────────────────────────────────────────────
    {
      title: "Sales — Lead Inbox",
      body: "B2B leads from forms, ARION, and the new SPARK Lead Generator. Review, accept, or reject — accepted leads become contacts with their lead score seeded into the new contact intelligence score.",
      targetSelector: "a[href='/app/services/spark_leads']",
      placement: "right",
    },
    {
      title: "Sales — Lead Generator (NEW)",
      body: "Search for B2B prospects by category + location + radius. Picks expanded keywords from the IA taxonomy, hits Google Custom Search + Hunter enrichment, scores each lead 4-dimensional, and lands them in your Lead Inbox for review.",
      targetSelector: "a[href='/app/spark/leadgen/new']",
      placement: "right",
    },
    {
      title: "Sales — Saved Searches",
      body: "Re-run a search profile you already built without retyping anything. Each run honors lifetime per-tenant uniqueness so you never get the same domain twice.",
      targetSelector: "a[href='/app/spark/leadgen/saved']",
      placement: "right",
    },
    {
      title: "Sales — Pipelines & Deals",
      body: "Drag opportunities through stages. Pipelines is the config; Deals is the day-to-day view.",
      targetSelector: "a[href='/app/services/spark_pipelines']",
      placement: "right",
    },
    // ── Customer Success ────────────────────────────────────────────────────
    {
      title: "Customer Success — NPS",
      body: "Scheduled NPS surveys with scoring and qualitative feedback drill-down.",
      targetSelector: "a[href='/app/services/spark_nps']",
      placement: "right",
    },
    {
      title: "Customer Success — Reputation Hub",
      body: "Aggregates reviews across channels with AI-assisted response drafts.",
      targetSelector: "a[href='/app/services/spark_reviews']",
      placement: "right",
    },
    // ── IA Insights ─────────────────────────────────────────────────────────
    {
      title: "IA Insights",
      body: "Same Health → Trends → Intelligence → Cross-Platform pattern as the other products. Identifies what's working and what isn't.",
      targetSelector: "a[href='/app/services/spark_ia_insights_health']",
      placement: "right",
    },
    // ── Reporting ───────────────────────────────────────────────────────────
    {
      title: "Reporting",
      body: "Dashboards, Analytics Reports, Real-Time Activity, Usage, and the Audit Log — all here.",
      targetSelector: "a[href='/app/services/spark_dashboards']",
      placement: "right",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// ARION tour — walks every section. ~24 steps.
// ─────────────────────────────────────────────────────────────────────────────
export const ARION_QUICK_TOUR: TourDef = {
  id: "arion_full_v1",
  title: "ARION — Full Tour",
  accent: "#38BDF8",
  steps: [
    {
      title: "Welcome to ARION",
      body: "Your website's home base — content, hosting, security, SEO, business profile, IA Insights. We'll walk every section. ~2 minutes.",
      placement: "center",
      route: "/app/services/arion_dashboard",
    },
    {
      title: "Get Started",
      body: "Guided onboarding — site, GA4, Search Console, Business Profile, Bing, SEO add-on. Re-runnable anytime.",
      targetSelector: "a[href='/app/services/arion_onboarding']",
      placement: "right",
    },
    // ── Website ─────────────────────────────────────────────────────────────
    {
      title: "Website — Overview",
      body: "Health summary: uptime, WordPress version, plugin status, quick actions.",
      targetSelector: "a[href='/app/services/arion_website_overview']",
      placement: "right",
    },
    {
      title: "Website — Content",
      body: "Every page + post inventory with last-modified dates and publish status.",
      targetSelector: "a[href='/app/services/arion_website_content']",
      placement: "right",
    },
    {
      title: "Website — Content SEO",
      body: "Per-page Rank Math scores, focus keywords, schema, and top optimization opportunities.",
      targetSelector: "a[href='/app/services/arion_website_content_seo_overview']",
      placement: "right",
    },
    {
      title: "Website — Staging",
      body: "Staging environment with sync actions and deploy history. Test before pushing live.",
      targetSelector: "a[href='/app/services/arion_website_staging']",
      placement: "right",
    },
    // ── Hosting ─────────────────────────────────────────────────────────────
    {
      title: "Hosting — Overview",
      body: "Server health, plan summary, uptime, resource usage.",
      targetSelector: "a[href='/app/services/arion_hosting_overview']",
      placement: "right",
    },
    {
      title: "Hosting — Domain & DNS",
      body: "Domain registration, DNS records, SSL certificate status, propagation checks.",
      targetSelector: "a[href='/app/services/arion_hosting_domain_dns']",
      placement: "right",
    },
    {
      title: "Hosting — Backups",
      body: "Backup schedule + retention. Restore points and download links right here.",
      targetSelector: "a[href='/app/services/arion_hosting_backups']",
      placement: "right",
    },
    // ── Security & Performance ─────────────────────────────────────────────
    {
      title: "Security — Overview",
      body: "Wordfence scan results, threat level, and security posture at a glance.",
      targetSelector: "a[href='/app/services/arion_website_security_overview']",
      placement: "right",
    },
    {
      title: "Security — Vulnerabilities",
      body: "Known plugin + theme vulnerabilities, severity, and patch status. Action items front and center.",
      targetSelector: "a[href='/app/services/arion_website_security_vulnerabilities']",
      placement: "right",
    },
    {
      title: "Performance — Core Web Vitals",
      body: "LCP, FID, CLS — the metrics Google ranks on. Cache configuration and purge controls.",
      targetSelector: "a[href='/app/services/arion_website_performance_cache']",
      placement: "right",
    },
    {
      title: "Performance — Plugins",
      body: "Pending WordPress core, plugin, and theme updates with compatibility notes before you click update.",
      targetSelector: "a[href='/app/services/arion_website_updates']",
      placement: "right",
    },
    // ── Search Engine Analytics ────────────────────────────────────────────
    {
      title: "Search Analytics — Overview",
      body: "GA4 + Google Search Console rolled up. Traffic, audience, conversions, content — all one click away.",
      targetSelector: "a[href='/app/services/arion_analytics_overview']",
      placement: "right",
    },
    {
      title: "Search Analytics — Traffic",
      body: "Channels, sources, mediums. Where your visitors actually come from.",
      targetSelector: "a[href='/app/services/arion_analytics_traffic']",
      placement: "right",
    },
    {
      title: "Search Analytics — Audience",
      body: "Demographics, location, device, retention. Who's visiting your site.",
      targetSelector: "a[href='/app/services/arion_analytics_audience']",
      placement: "right",
    },
    {
      title: "Search Analytics — Conversions",
      body: "Goal completions, event tracking, attribution. The bottom line of analytics.",
      targetSelector: "a[href='/app/services/arion_analytics_conversions']",
      placement: "right",
    },
    // ── IA Insights ─────────────────────────────────────────────────────────
    {
      title: "IA Insights — Health",
      body: "Same Health → Trends → Intelligence → Cross-Platform pattern as the other products.",
      targetSelector: "a[href='/app/services/arion_ia_insights_health']",
      placement: "right",
    },
    // ── SEO ────────────────────────────────────────────────────────────────
    {
      title: "SEO — Overview",
      body: "Your tier's SEO surface: Rankings, Site Audit, Competitors, AI Search, Market Monitor.",
      targetSelector: "a[href='/app/services/arion_seo_overview']",
      placement: "right",
    },
    {
      title: "SEO — Rankings",
      body: "Tracked keyword positions over time, per device and per region.",
      targetSelector: "a[href='/app/services/arion_seo_rankings']",
      placement: "right",
    },
    {
      title: "SEO — Site Audit",
      body: "Tech-SEO crawl: broken links, redirects, meta issues, schema problems. Re-runs on your tier's cadence.",
      targetSelector: "a[href='/app/services/arion_seo_site_audit']",
      placement: "right",
    },
    {
      title: "SEO — Competitors",
      body: "Watch direct competitors' rankings, content, and backlinks side-by-side with yours.",
      targetSelector: "a[href='/app/services/arion_seo_competitors']",
      placement: "right",
    },
    {
      title: "SEO — AI Search Results",
      body: "How you show up in Google AI Mode, ChatGPT, Gemini, Perplexity. Tier-gated visibility.",
      targetSelector: "a[href='/app/services/arion_seo_ai_search']",
      placement: "right",
    },
    {
      title: "SEO — Market Monitor",
      body: "Tracks competitor + your-own page changes daily so you catch movement before it moves rankings.",
      targetSelector: "a[href='/app/services/arion_seo_market_monitor']",
      placement: "right",
    },
    // ── Search ─────────────────────────────────────────────────────────────
    {
      title: "Search — Performance",
      body: "Google Search Console data: clicks, impressions, queries, pages.",
      targetSelector: "a[href='/app/services/arion_search_performance']",
      placement: "right",
    },
    {
      title: "Search — Indexing",
      body: "Sitemap submission, indexed page count, coverage issues, and IndexNow ping status.",
      targetSelector: "a[href='/app/services/arion_search_indexing']",
      placement: "right",
    },
    {
      title: "Search — Bing & Copilot",
      body: "Bing visibility + Copilot AI presence. Often a faster path to traffic than Google.",
      targetSelector: "a[href='/app/services/arion_search_bing_copilot']",
      placement: "right",
    },
    // ── Business Profile ────────────────────────────────────────────────────
    {
      title: "Business Profile — Overview",
      body: "Google Business Profile insights — views, calls, direction requests.",
      targetSelector: "a[href='/app/services/arion_business_overview']",
      placement: "right",
    },
    {
      title: "Business Profile — Reviews",
      body: "Every review with AI-assisted response drafts. Respond without leaving ARION.",
      targetSelector: "a[href='/app/services/arion_business_reviews']",
      placement: "right",
    },
    {
      title: "Business Profile — Posts",
      body: "Schedule GBP posts — events, updates, offers. Pro+ feature.",
      targetSelector: "a[href='/app/services/arion_business_posts']",
      placement: "right",
    },
    {
      title: "Business Profile — Bing Places + Apple Maps",
      body: "Other map services that drive local traffic. ARION manages them alongside Google.",
      targetSelector: "a[href='/app/services/arion_business_bing_overview']",
      placement: "right",
    },
    // ── Brand / Plugin / Plan ──────────────────────────────────────────────
    {
      title: "My Brand",
      body: "Brand colors and logos that flow through invoices, portals, and emails.",
      targetSelector: "a[href='/app/services/arion_brand']",
      placement: "right",
    },
    {
      title: "Plugin Provisioning",
      body: "One-click installer for the IA plugin. Pushes site data back to ARION for security, performance, and content insights.",
      targetSelector: "a[href='/app/services/arion_plugin_provisioning']",
      placement: "right",
    },
    {
      title: "Plan & Pricing",
      body: "Your current ARION + SEO tier, usage, and upgrade path. Add the SEO package or bump tier any time.",
      targetSelector: "a[href='/app/services/arion_usage']",
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

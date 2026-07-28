// GuidedTourLauncher — the "Learn" menu in the header.
//
// REBUILT 2026-07-27 (Brandon) around the Journey model. Previously this
// listed a hand-written QUICK_TOUR *and* an auto-derived nav-dump tour per
// product (that's the "two guided tours" Brandon spotted), plus a flat list
// of interactive flows with no relationship between them.
//
// Now: ONE journey per platform, offered in two modes —
//   • Guided tour  ("explain")  self-paced; the consultant talks you through
//   • Do it with me ("doIt")    stop at each task, do it yourself, continue
// — generated from the same ordered curriculum, so they can't drift. Every
// step is individually launchable in either mode, which is also how
// engagement alerts and ARGUS deep-link into help.
import { useEffect, useRef, useState } from "react";
import { HelpCircle, Play, CheckCircle2, ChevronDown, ChevronRight, MousePointerClick } from "lucide-react";
import { GuidedTour, hasCompletedTour, resetTour, type TourDef } from "./GuidedTour";
import {
  InteractiveWalkthroughRunner,
  isInteractiveCompleted,
  resetInteractive,
  type InteractiveFlow,
} from "./walkthroughs/InteractiveWalkthroughRunner";
import { INTERACTIVE_FLOWS } from "./walkthroughs/interactiveFlows";
import { onWalkthroughLaunch, type LaunchRequest } from "./walkthroughs/walkthroughLaunchBus";
import {
  ALL_JOURNEYS,
  doableSteps,
  journeyToInteractive,
  journeyToTour,
  type Journey,
  type JourneyStep,
} from "../journeys";

export function GuidedTourLauncher() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<TourDef | null>(null);
  const [activeFlow, setActiveFlow] = useState<InteractiveFlow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function startTour(journey: Journey, fromStepId?: string) {
    const tour = journeyToTour(journey, fromStepId);
    if (hasCompletedTour(tour.id)) resetTour(tour.id);
    setOpen(false);
    setActiveFlow(null);
    setActive(tour);
  }

  function startInteractive(journey: Journey, fromStepId?: string) {
    const flow = journeyToInteractive(journey, fromStepId);
    if (!flow.steps.length) return;
    if (isInteractiveCompleted(flow.id)) resetInteractive(flow.id);
    setOpen(false);
    setActive(null);
    setActiveFlow(flow);
  }

  // Any surface can open help: alerts ("Show me how"), ARGUS chat, insights.
  useEffect(() => {
    function handle(req: LaunchRequest) {
      if (req.journeyStepId) {
        for (const journey of ALL_JOURNEYS) {
          const step = journey.steps.find((s) => s.id === req.journeyStepId);
          if (!step) continue;
          if (req.mode === "doIt" && (step.doIt?.length ?? 0) > 0) startInteractive(journey, step.id);
          else startTour(journey, step.id);
          return;
        }
        return;
      }
      if (req.flowId) {
        const flow = INTERACTIVE_FLOWS.find((f) => f.id === req.flowId);
        if (!flow) return;
        if (isInteractiveCompleted(flow.id)) resetInteractive(flow.id);
        setOpen(false);
        setActive(null);
        setActiveFlow(flow);
      }
    }
    return onWalkthroughLaunch(handle);
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/5 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        aria-label="Open guided tours"
        title="Learn your software"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Learn</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[22rem] rounded-lg border border-slate-200 bg-white shadow-xl z-[10000] overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Learn your software</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Read along, or do it yourself — same steps either way. Jump in anywhere.
            </div>
          </div>

          <ul className="py-1 max-h-[60vh] overflow-y-auto">
            {ALL_JOURNEYS.map((journey) => {
              const expanded = expandedId === journey.product;
              const tourDone = hasCompletedTour(journey.tourId);
              const doable = doableSteps(journey).length;
              const accent = journey.accent;
              return (
                <li key={journey.product}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : journey.product)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
                    aria-expanded={expanded}
                  >
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded flex-shrink-0"
                      style={{ background: `${accent}22`, color: accent }}
                    >
                      {tourDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Play className="h-3 w-3" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">{journey.productLabel}</div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {journey.steps.length} steps · {doable} hands-on{tourDone ? " · tour done" : ""}
                      </div>
                    </div>
                    {expanded
                      ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
                  </button>

                  {expanded && (
                    <div className="bg-slate-50/60 border-t border-slate-100 pb-1">
                      {/* Whole-journey launchers */}
                      <div className="flex gap-1.5 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => startTour(journey)}
                          className="flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold text-white inline-flex items-center justify-center gap-1"
                          style={{ background: accent }}
                        >
                          <Play className="h-3 w-3" /> Guided tour
                        </button>
                        <button
                          type="button"
                          onClick={() => startInteractive(journey)}
                          disabled={!doable}
                          className="flex-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-40 bg-white"
                          style={{ borderColor: accent, color: accent }}
                        >
                          <MousePointerClick className="h-3 w-3" /> Do it with me
                        </button>
                      </div>

                      {/* Individual steps, grouped by curriculum section */}
                      <StepList journey={journey} onExplain={startTour} onDoIt={startInteractive} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {active && <GuidedTour tour={active} open onClose={() => setActive(null)} />}
      {activeFlow && (
        <InteractiveWalkthroughRunner
          flow={activeFlow}
          open
          onClose={() => setActiveFlow(null)}
          accent={ALL_JOURNEYS.find((j) => j.product === activeFlow.product)?.accent || "#1A3A4A"}
        />
      )}
    </div>
  );
}

/** Steps grouped under their curriculum section, each launchable either way. */
function StepList({
  journey,
  onExplain,
  onDoIt,
}: {
  journey: Journey;
  onExplain: (j: Journey, stepId: string) => void;
  onDoIt: (j: Journey, stepId: string) => void;
}) {
  const groups: Array<{ label: string; steps: JourneyStep[] }> = [];
  for (const step of journey.steps) {
    const last = groups[groups.length - 1];
    if (last && last.label === step.sectionLabel) last.steps.push(step);
    else groups.push({ label: step.sectionLabel, steps: [step] });
  }

  return (
    <ul>
      {groups.map((g) => (
        <li key={g.label}>
          <div className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            {g.label}
          </div>
          <ul>
            {g.steps.map((step) => {
              const canDo = (step.doIt?.length ?? 0) > 0;
              return (
                <li key={step.id} className="flex items-center gap-1 pl-3 pr-2 py-0.5 hover:bg-slate-100/70">
                  <span className="flex-1 min-w-0 text-[11px] text-slate-700 truncate">{step.label}</span>
                  <button
                    type="button"
                    onClick={() => onExplain(journey, step.id)}
                    title="Explain this step"
                    aria-label={`Explain: ${step.label}`}
                    className="rounded p-1 text-slate-400 hover:text-slate-900 hover:bg-white flex-shrink-0"
                  >
                    <Play className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => canDo && onDoIt(journey, step.id)}
                    disabled={!canDo}
                    title={canDo ? "Do this one myself" : "No hands-on task for this step"}
                    aria-label={canDo ? `Do it: ${step.label}` : undefined}
                    className="rounded p-1 flex-shrink-0 disabled:opacity-20 text-slate-400 hover:text-slate-900 hover:bg-white"
                  >
                    <MousePointerClick className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export default GuidedTourLauncher;

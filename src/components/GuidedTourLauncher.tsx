// GuidedTourLauncher — F-119 + #256 sub-nav section support + Part 2 interactive walkthroughs.
//
// "?" button in the header that opens a small menu listing all available
// tours AND interactive walkthroughs. Click a tour → GuidedTour overlay.
// Click a walkthrough → InteractiveWalkthroughRunner (click-wait, chain-modal).
// Used from HeaderBar (next to the search button).
//
// #256 nesting: each guided tour expands to show "Full tour" plus one entry
// per sub-nav section. Interactive walkthroughs are listed under their own
// section header at the top of the dropdown.
import { useEffect, useRef, useState } from "react";
import { HelpCircle, Play, CheckCircle2, ChevronDown, ChevronRight, MousePointerClick } from "lucide-react";
import {
  ALL_TOURS,
  GuidedTour,
  filterTourToSection,
  groupTourSections,
  hasCompletedTour,
  resetTour,
  type TourDef,
} from "./GuidedTour";
import { INTERACTIVE_FLOWS } from "./walkthroughs/interactiveFlows";
import {
  InteractiveWalkthroughRunner,
  isInteractiveCompleted,
  resetInteractive,
  type InteractiveFlow,
} from "./walkthroughs/InteractiveWalkthroughRunner";

const PRODUCT_ACCENTS: Record<string, string> = {
  oliver: "#FEC82C",
  spark: "#EF6C33",
  arion: "#2D9CDB",
  consulting: "#8B5CF6",
  platform: "#0B1C24",
};

export function GuidedTourLauncher() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<TourDef | null>(null);
  const [activeFlow, setActiveFlow] = useState<InteractiveFlow | null>(null);
  const [expandedTourId, setExpandedTourId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

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

  function launch(t: TourDef) {
    // If already completed, reset so the start fires cleanly, but
    // persistOnFinish is true → it'll re-mark complete.
    if (hasCompletedTour(t.id)) resetTour(t.id);
    setOpen(false);
    setActive(t);
  }

  function launchFlow(f: InteractiveFlow) {
    if (isInteractiveCompleted(f.id)) resetInteractive(f.id);
    setOpen(false);
    setActiveFlow(f);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/5 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        aria-label="Open guided tours"
        title="Guided tours"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Tours</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 rounded-lg border border-slate-200 bg-white shadow-xl z-[10000] overflow-hidden">
          {/* ── Interactive walkthroughs (click-wait, chain-modal) ── */}
          <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Interactive Walkthroughs</div>
            <div className="text-[11px] text-emerald-700/80">Create your first X — we'll wait while you click.</div>
          </div>
          <ul className="py-1 max-h-[35vh] overflow-y-auto border-b border-slate-200">
            {INTERACTIVE_FLOWS.map((f) => {
              const done = isInteractiveCompleted(f.id);
              const accent = PRODUCT_ACCENTS[f.product] || "#1A3A4A";
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => launchFlow(f)}
                    className="w-full text-left px-3 py-2 hover:bg-emerald-50/60 flex items-center gap-2"
                  >
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded"
                      style={{ background: `${accent}22`, color: accent }}
                    >
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <MousePointerClick className="h-3 w-3" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">{f.title}</div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {f.product.toUpperCase()} · ~{f.estimatedMinutes} min · {f.oneLiner}
                        {done ? " · done" : ""}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Guided tours</div>
            <div className="text-[11px] text-slate-500">Full tour or one section. Skip any time.</div>
          </div>
          <ul className="py-1 max-h-[45vh] overflow-y-auto">
            {ALL_TOURS.map((t) => {
              const done = hasCompletedTour(t.id);
              const expanded = expandedTourId === t.id;
              const sections = groupTourSections(t);
              const accent = t.accent || "#1A3A4A";
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedTourId(expanded ? null : t.id)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
                    aria-expanded={expanded}
                  >
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded"
                      style={{ background: `${accent}22`, color: accent }}
                    >
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Play className="h-3 w-3" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-900">{t.title}</div>
                      <div className="text-[10px] text-slate-500">
                        {t.steps.length} steps · {sections.length} section{sections.length === 1 ? "" : "s"}
                        {done ? " · completed" : ""}
                      </div>
                    </div>
                    {expanded
                      ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                  </button>

                  {expanded && (
                    <ul className="bg-slate-50/60 border-t border-slate-100">
                      {/* Full tour first */}
                      <li>
                        <button
                          type="button"
                          onClick={() => launch(t)}
                          className="w-full text-left pl-11 pr-3 py-1.5 hover:bg-slate-100 flex items-center justify-between"
                        >
                          <span className="text-[11px] font-semibold text-slate-800">Full tour</span>
                          <span className="text-[10px] text-slate-500">{t.steps.length} steps</span>
                        </button>
                      </li>
                      {sections.map((sec) => {
                        const sub = filterTourToSection(t, sec.key);
                        if (!sub) return null;
                        const subDone = hasCompletedTour(sub.id);
                        return (
                          <li key={sec.key}>
                            <button
                              type="button"
                              onClick={() => launch(sub)}
                              className="w-full text-left pl-11 pr-3 py-1.5 hover:bg-slate-100 flex items-center justify-between"
                            >
                              <span className="text-[11px] text-slate-700 flex items-center gap-1.5">
                                {subDone && <CheckCircle2 className="h-3 w-3" style={{ color: accent }} />}
                                {sec.label}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {sec.count} step{sec.count === 1 ? "" : "s"}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {active && (
        <GuidedTour
          tour={active}
          open
          onClose={() => setActive(null)}
        />
      )}
      {activeFlow && (
        <InteractiveWalkthroughRunner
          flow={activeFlow}
          open
          onClose={() => setActiveFlow(null)}
          accent={PRODUCT_ACCENTS[activeFlow.product] || "#1A3A4A"}
        />
      )}
    </div>
  );
}

export default GuidedTourLauncher;

// GuidedTourLauncher — F-119 + #256 sub-nav section support.
//
// "?" button in the header that opens a small menu listing all available
// tours. Click a tour, the dropdown closes and the GuidedTour overlay opens.
// Used from HeaderBar (next to the search button).
//
// #256 nesting: each tour expands to show "Full tour" plus one entry per
// sub-nav section (parsed from step routes/selectors). Picking a section
// runs only that slice of steps and tracks completion under a
// section-scoped persistence key.
import { useEffect, useRef, useState } from "react";
import { HelpCircle, Play, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import {
  ALL_TOURS,
  GuidedTour,
  filterTourToSection,
  groupTourSections,
  hasCompletedTour,
  resetTour,
  type TourDef,
} from "./GuidedTour";

export function GuidedTourLauncher() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<TourDef | null>(null);
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
        <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-slate-200 bg-white shadow-xl z-[10000] overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Guided tours</div>
            <div className="text-[11px] text-slate-500">Full tour or one section. Skip any time.</div>
          </div>
          <ul className="py-1 max-h-[70vh] overflow-y-auto">
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
                                {sec.key}
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
    </div>
  );
}

export default GuidedTourLauncher;

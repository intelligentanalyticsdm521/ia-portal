// GuidedTourLauncher — F-119.
//
// "?" button in the header that opens a small menu listing all available
// tours. Click a tour, the dropdown closes and the GuidedTour overlay opens.
// Used from HeaderBar (next to the search button).
import { useEffect, useRef, useState } from "react";
import { HelpCircle, Play, CheckCircle2 } from "lucide-react";
import { ALL_TOURS, GuidedTour, hasCompletedTour, resetTour, type TourDef } from "./GuidedTour";

export function GuidedTourLauncher() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<TourDef | null>(null);
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
            <div className="text-[11px] text-slate-500">~60 seconds each. Skip any time.</div>
          </div>
          <ul className="py-1">
            {ALL_TOURS.map((t) => {
              const done = hasCompletedTour(t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      // If already completed, reset so the start fires cleanly,
                      // but persistOnFinish is true → it'll re-mark complete.
                      if (done) resetTour(t.id);
                      setOpen(false);
                      setActive(t);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded"
                      style={{ background: `${t.accent || "#1A3A4A"}22`, color: t.accent || "#1A3A4A" }}
                    >
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Play className="h-3 w-3" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-900">{t.title}</div>
                      <div className="text-[10px] text-slate-500">{t.steps.length} steps {done ? "· completed (replay)" : ""}</div>
                    </div>
                  </button>
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

// SetupHints — F-118.
//
// Lightweight, per-product "next action" hints that sit on each dashboard.
// Distinct from OliverSetupCard / SparkSetupCard / ArionSetupCard (which are
// the heavyweight onboarding-wizard launchers): hints are short, contextual
// nudges that appear when the tenant hasn't yet done something high-value
// but optional — connect Stripe, upload a logo, invite a teammate.
//
// Storage model (intentionally client-side):
//   localStorage["hint:dismissed:${id}"] = "1" — when set, the hint is hidden
//   forever for THIS browser/user. This matches the "I get it, stop telling
//   me" UX without needing a backend round-trip. Safe to clear by opening
//   DevTools or signing in on a new device.
//
// Each hint:
//   { id, icon, title, body, cta: { label, to }, show: boolean }
// Caller is responsible for the `show` boolean (data-driven). Hints with
// show=false are excluded; dismissed hints are excluded; remaining are
// rendered as a row of small cards.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X, Sparkles } from "lucide-react";

export interface SetupHint {
  id: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
  cta?: { label: string; to: string };
  show: boolean;
  accent?: string;
}

function isDismissed(id: string): boolean {
  try { return typeof window !== "undefined" && localStorage.getItem(`hint:dismissed:${id}`) === "1"; }
  catch { return false; }
}

function dismiss(id: string) {
  try { localStorage.setItem(`hint:dismissed:${id}`, "1"); } catch { /* ignore */ }
}

export function SetupHints({ hints }: { hints: SetupHint[] }) {
  // Tick state — re-render when an individual hint is dismissed.
  const [tick, setTick] = useState(0);

  // Re-evaluate dismissed status on each render (rare component; cheap).
  const visible = hints.filter((h) => h.show && !isDismissed(h.id));

  // Hooks must run unconditionally — placed before any early return.
  useEffect(() => { /* re-render trigger on tick change */ }, [tick]);

  if (visible.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-amber-500" />
        Suggested next steps
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.map((h) => {
          const Icon = h.icon;
          const accent = h.accent || "#1A3A4A";
          return (
            <div
              key={h.id}
              className="relative rounded-lg border bg-white p-3 shadow-sm"
              style={{ borderColor: `${accent}33` }}
            >
              <button
                type="button"
                onClick={() => { dismiss(h.id); setTick((n) => n + 1); }}
                className="absolute top-1.5 right-1.5 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Dismiss hint"
                title="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-start gap-2.5 pr-5">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded" style={{ background: `${accent}1F` }}>
                  <Icon className="h-4 w-4" style={{ color: accent }} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900">{h.title}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-slate-600">{h.body}</div>
                  {h.cta && (
                    <Link
                      to={h.cta.to}
                      className="mt-1.5 inline-block text-[11px] font-semibold hover:underline"
                      style={{ color: accent }}
                    >
                      {h.cta.label} →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SetupHints;

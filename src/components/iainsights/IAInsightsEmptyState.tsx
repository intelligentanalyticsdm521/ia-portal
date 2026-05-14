// IAInsightsEmptyState — Rich first-run state shown when a Trends page has
// no data yet (v6.6). Replaces the generic "Loading…" spinner with a
// purposeful "here's what you need to start collecting data" panel.
//
// Each variant lists 2-4 concrete onboarding steps that the tenant can
// click through. The page itself can still render with all-zero scores
// underneath — this just sits above the engine cards.
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight, CheckCircle, Circle } from "lucide-react";

interface OnboardingStep {
  label: string;
  description?: string;
  /** Optional route to navigate to when the step is clicked. */
  route?: string;
  /** When this step has already been completed (data is flowing). */
  completed?: boolean;
}

interface Props {
  product: "ARION" | "SPARK" | "OLIVER";
  steps: OnboardingStep[];
  /** Optional sub-line under the title. */
  intro?: string;
  /** Hides the panel once data is flowing in (allCompleted=true). */
  allCompleted?: boolean;
}

const PRODUCT_META: Record<Props["product"], { color: string; tagline: string }> = {
  ARION:  { color: "#1A7DB5", tagline: "Web & Digital Presence" },
  SPARK:  { color: "#EF6C33", tagline: "Growth Platform" },
  OLIVER: { color: "#FEC82C", tagline: "Operations & Portals" },
};

export function IAInsightsEmptyState({ product, steps, intro, allCompleted }: Props) {
  const navigate = useNavigate();
  const meta = PRODUCT_META[product];

  if (allCompleted) return null;

  const completedCount = steps.filter((s) => s.completed).length;
  const pct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div className="rounded-lg border-2 border-dashed bg-white p-4 mb-3" style={{ borderColor: meta.color }}>
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${meta.color}1A`, color: meta.color }}>
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-slate-900 text-base">Get started with {product} IA Insights</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {intro || `Reports populate as data accumulates. Complete the steps below so your ${meta.tagline.toLowerCase()} score reflects reality.`}
          </p>
          {steps.length > 1 && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color }} />
              </div>
              <span className="font-semibold tabular-nums">{completedCount}/{steps.length}</span>
            </div>
          )}
        </div>
      </div>

      <ul className="space-y-1">
        {steps.map((s, i) => {
          const Icon = s.completed ? CheckCircle : Circle;
          const clickable = !!s.route && !s.completed;
          const content = (
            <div className={`flex items-start gap-2 rounded p-2 text-xs ${clickable ? "hover:bg-slate-50 cursor-pointer" : ""}`}>
              <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${s.completed ? "text-emerald-600" : "text-slate-300"}`} />
              <div className="min-w-0 flex-1">
                <div className={`font-semibold ${s.completed ? "text-slate-500 line-through" : "text-slate-900"}`}>
                  {s.label}
                </div>
                {s.description && <div className="text-[10px] text-slate-500 mt-0.5">{s.description}</div>}
              </div>
              {clickable && <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />}
            </div>
          );
          return (
            <li key={i}>
              {clickable
                ? <button onClick={() => navigate(s.route!)} className="w-full text-left">{content}</button>
                : <div>{content}</div>
              }
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default IAInsightsEmptyState;

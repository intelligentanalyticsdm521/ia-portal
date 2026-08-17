// FeatureLocked — what a tenant sees when they open a surface their plan
// doesn't include.
//
// The old version was one line of grey text ("Not available on your plan"),
// which told the customer nothing about what they were missing or how to get
// it. Brandon 2026-08-17: show the UI greyed out with a proper banner naming
// the feature and the plan that unlocks it.
//
// Shape: banner first (what + why + how), then a deliberately inert, greyed
// preview of the surface so the page reads as "this is a real thing you don't
// have yet" rather than "this page is broken". The preview is decorative —
// aria-hidden, no focusable elements, no fake numbers that could be mistaken
// for the tenant's own data.
import { Lock } from "lucide-react";

const ACCENT = "#EF6C33";

export interface FeatureLockedProps {
  /** Human name of the surface, e.g. "Newsletter Studio". */
  name: string;
  /** One-line description of what it does. */
  description?: string;
  /** Plan that unlocks it, already formatted — e.g. "SPARK Pro". */
  requiredPlan: string;
  /** Layout the greyed preview should imitate. */
  preview?: "table" | "cards" | "editor";
}

/** Decorative skeleton. aria-hidden — screen readers get the banner only. */
function Preview({ kind }: { kind: NonNullable<FeatureLockedProps["preview"]> }) {
  const bar = (w: string, h = "h-3") => (
    <div className={`${h} rounded bg-slate-200`} style={{ width: w }} />
  );
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none rounded-xl border border-slate-200 bg-white p-5 opacity-50 grayscale"
    >
      {/* toolbar */}
      <div className="mb-5 flex items-center gap-3">
        {bar("140px", "h-5")}
        <div className="ml-auto flex gap-2">
          {bar("72px", "h-8")}
          {bar("96px", "h-8")}
        </div>
      </div>

      {kind === "table" && (
        <div className="space-y-2">
          <div className="flex gap-3 border-b border-slate-200 pb-2">
            {bar("22%")}{bar("28%")}{bar("18%")}{bar("14%")}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 py-1.5">
              {bar("22%")}{bar("28%")}{bar("18%")}{bar("14%")}
            </div>
          ))}
        </div>
      )}

      {kind === "cards" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 h-8 w-8 rounded-full bg-slate-200" />
              {bar("70%")}
              <div className="mt-2">{bar("45%")}</div>
            </div>
          ))}
        </div>
      )}

      {kind === "editor" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[220px_1fr]">
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i}>{bar("100%")}</div>)}
          </div>
          <div className="min-h-[220px] rounded-lg border border-slate-200 p-4">
            {bar("55%", "h-5")}
            <div className="mt-4 space-y-2">
              {bar("100%")}{bar("92%")}{bar("96%")}{bar("60%")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FeatureLocked({
  name,
  description,
  requiredPlan,
  preview = "table",
}: FeatureLockedProps) {
  return (
    <div className="p-6">
      <div
        className="mb-5 rounded-xl border bg-white p-5"
        style={{ borderColor: `${ACCENT}55` }}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: `${ACCENT}1A`, color: ACCENT }}
          >
            <Lock size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-slate-900">{name}</h1>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
                style={{ background: `${ACCENT}1A`, color: ACCENT }}
              >
                {requiredPlan.toUpperCase()}
              </span>
            </div>
            {description && (
              <p className="mt-1.5 max-w-prose text-sm text-slate-600">{description}</p>
            )}
            <p className="mt-3 text-sm text-slate-700">
              This isn&apos;t included in your current plan. Upgrade to{" "}
              <strong className="font-semibold">{requiredPlan}</strong> to turn it on.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href="/app/settings/billing"
                className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white"
                style={{ background: ACCENT }}
              >
                View plans
              </a>
              <a
                href="/app/services/consulting_requests"
                className="text-sm font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
              >
                Ask a question
              </a>
            </div>
          </div>
        </div>
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        Preview
      </p>
      <Preview kind={preview} />
    </div>
  );
}

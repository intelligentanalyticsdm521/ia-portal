// FeatureLocked — what a tenant sees when they open a surface their plan
// doesn't include.
//
// History, because this has moved twice:
//   1. One line of grey text ("Not available on your plan") — named neither
//      the feature nor the way to get it.
//   2. A fake greyed skeleton. Brandon 2026-08-17: "your preview is not
//      showing anything. It's just supposed to be the regular view of the
//      actual UI with a card or modal over the top."
//   3. (this) The REAL page renders as children, greyed and inert, with an
//      explanation card floating over it.
//
// Rendering the genuine surface is the whole point — the customer should see
// the thing they don't have yet. The API still 403s every call underneath, so
// the page behind may be empty or error-stated; that is fine and expected,
// and it is why the layer below is inert rather than merely dimmed.
//
// Interaction safety: the underlay gets pointer-events:none, inert, and
// aria-hidden, so nothing behind the card is clickable, focusable, or read by
// a screen reader. Only the card is reachable by keyboard.
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { IA_ACCENT } from "../config/productTheme";

export interface FeatureLockedProps {
  /** Human name of the surface, e.g. "Newsletter Studio". */
  name: string;
  /** One-line description of what it does. */
  description?: string;
  /** Plan that unlocks it, already formatted — e.g. "SPARK Pro". */
  requiredPlan: string;
  /** Product brand color for the lock + accents. */
  accent?: string;
  /** The real page. Rendered greyed out behind the card. */
  children?: ReactNode;
}

export default function FeatureLocked({
  name,
  description,
  requiredPlan,
  accent = IA_ACCENT,
  children,
}: FeatureLockedProps) {
  return (
    <div className="relative min-h-[60vh]">
      {/* The real UI, greyed and inert. `inert` needs the string form to
          satisfy React's DOM typing; it removes the subtree from the tab
          order and the accessibility tree in supporting browsers. */}
      <div
        aria-hidden="true"
        // @ts-expect-error - `inert` is not in React's HTML types yet
        inert=""
        className="pointer-events-none select-none opacity-40 grayscale"
      >
        {children}
      </div>

      {/* Scrim keeps the card legible over busy pages without hiding them. */}
      <div
        className="absolute inset-0 z-10 backdrop-blur-[1.5px]"
        style={{ background: "rgba(248,250,252,0.55)" }}
      />

      <div className="absolute inset-x-0 top-0 z-20 flex justify-center px-4 pt-10 sm:pt-16">
        <div
          role="status"
          className="w-full max-w-lg rounded-2xl border bg-white p-6 shadow-xl"
          style={{ borderColor: `${accent}55` }}
        >
          <div className="flex items-start gap-4">
            <div
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full"
              style={{ background: `${accent}1A`, color: accent }}
            >
              <Lock size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{name}</h2>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
                  style={{ background: `${accent}1A`, color: accent }}
                >
                  {requiredPlan.toUpperCase()}
                </span>
              </div>
              {description && (
                <p className="mt-1.5 text-sm text-slate-600">{description}</p>
              )}
              <p className="mt-3 text-sm text-slate-700">
                This isn&apos;t included in your current plan. Upgrade to{" "}
                <strong className="font-semibold">{requiredPlan}</strong> to turn it on.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <a
                  href="/app/settings/billing"
                  className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white"
                  style={{ background: accent }}
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
      </div>
    </div>
  );
}

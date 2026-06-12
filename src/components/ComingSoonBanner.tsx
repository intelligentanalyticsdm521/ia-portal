/**
 * ComingSoonBanner — top-of-page banner for features that are partially
 * built / behind a flag / not yet ready for paying clients. Surfaces
 * honestly that the feature isn't done so the user doesn't trip over
 * half-working UI mid-flow.
 *
 * Founder decision 2026-06-12: any feature surface marked Coming Soon
 * should NOT block the page from rendering — power users (founder) can
 * still poke at it during dev; paying clients see the banner and skip.
 */
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  /**
   * What's not-yet-done. e.g. "SMS campaigns" or "Visitor tracking".
   */
  feature: string;

  /**
   * Optional one-liner explaining what works today vs what's coming.
   */
  detail?: ReactNode;

  /**
   * Optional ETA — e.g. "v1.1 (July 2026)". Hidden if omitted so we
   * don't make promises we don't keep.
   */
  eta?: string;
}

export function ComingSoonBanner({ feature, detail, eta }: Props) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 mb-4 flex items-start gap-3">
      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="text-sm text-amber-900">
        <div className="font-semibold">{feature} — Coming Soon</div>
        <div className="mt-0.5 text-xs text-amber-800">
          {detail || (
            <>
              This feature is partially built and may not work end-to-end yet. We're shipping it
              in a follow-up release.
            </>
          )}
          {eta && <span className="ml-1 text-amber-700">Expected: {eta}.</span>}
        </div>
      </div>
    </div>
  );
}

export default ComingSoonBanner;

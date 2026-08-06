/**
 * FeatureUnavailable — full-page notice for a capability that has been
 * intentionally turned off behind a feature flag (not "coming soon" — paused).
 *
 * Used to hard-lock a route so neither a subscriber nor the founder can reach
 * a known-broken surface via a direct URL. Honest, calm copy: it's paused
 * while we improve it, not an error.
 */
import { Lock } from "lucide-react";

interface Props {
  /** Human name of the paused capability, e.g. "Lead Gen". */
  name: string;
  /** Optional one-liner on why / what to do instead. */
  detail?: string;
}

export function FeatureUnavailable({ name, detail }: Props) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">{name} is temporarily unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">
          {detail || `We've paused ${name} while we make it better. It'll be back soon — nothing you've saved is affected.`}
        </p>
      </div>
    </div>
  );
}

export default FeatureUnavailable;

/**
 * OliverUpgradeGate — Shows a blurred overlay with upgrade CTA
 * when an OLIVER feature requires a higher tier plan.
 */

const TIER_LABELS: Record<string, string> = {
  lite: "Lite",
  standard: "Standard",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
};

interface OliverUpgradeGateProps {
  tierRequired: string;
  currentTier: string;
  featureName: string;
}

export function OliverUpgradeGate({ tierRequired, currentTier, featureName }: OliverUpgradeGateProps) {
  const requiredLabel = TIER_LABELS[tierRequired] || tierRequired;
  const currentLabel = TIER_LABELS[currentTier] || currentTier;

  return (
    <div className="relative">
      {/* Blurred placeholder content behind the overlay */}
      <div className="pointer-events-none select-none blur-sm opacity-40">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-white ring-1 ring-gray-200" />
          ))}
        </div>
        <div className="mt-6 h-64 rounded-xl bg-white ring-1 ring-gray-200" />
      </div>

      {/* Upgrade overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl ring-1 ring-gray-200 text-center">
          {/* Lock icon */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EF6C33]/10">
            <svg className="h-7 w-7 text-[#EF6C33]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>

          <h2 className="mt-4 text-xl font-bold text-gray-900">{featureName}</h2>
          <p className="mt-2 text-sm text-gray-600">
            This feature requires the <span className="font-semibold text-[#0C4A60]">{requiredLabel}</span> plan.
            You are currently on the <span className="font-semibold">{currentLabel}</span> plan.
          </p>

          <div className="mt-6">
            <a
              href="/app/spark/pricing"
              className="inline-flex items-center gap-2 rounded-lg bg-[#EF6C33] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#d95e2b] transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              Upgrade Plan
            </a>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            Upgrading unlocks {featureName.toLowerCase()} and all {requiredLabel}-tier features instantly.
          </p>
        </div>
      </div>
    </div>
  );
}

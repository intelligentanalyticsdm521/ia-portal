/**
 * MyBrandUpgradeGate — Tier-locked overlay for My Brand pages.
 *
 * Wave 3 of the My Brand stack (Brandon 2026-06-22). Mirrors
 * OliverUpgradeGate's blur-+-CTA pattern so the visual language is
 * consistent across products, but reads its required-tier copy from the
 * ServiceCatalog tierGate metadata via the `requiredTier` prop and links
 * to `/pricing?platform=my_brand&required=<tier>` (the My Brand purchase
 * flow). Use it whenever `useMyBrandTier()` reports the active SPARK tier
 * is below the feature's gate.
 *
 * Two usage modes:
 *
 *   1. Full-page lock (no chrome below it):
 *        <MyBrandUpgradeGate featureName="Template Studio" requiredTier="standard" currentTier={tier} />
 *
 *   2. Inline lock for a single section/card — pass `compact` to render a
 *      smaller card without the blurred placeholder grid:
 *        <MyBrandUpgradeGate compact ... />
 */

const TIER_LABELS: Record<string, string> = {
  lite: "Lite",
  standard: "Standard",
  active: "Standard",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
};

export interface MyBrandUpgradeGateProps {
  /** Feature label shown in the headline, e.g. "Template Studio". */
  featureName: string;
  /** Lowercase tier key the feature requires (matches FEATURE_MIN_TIER in LUMEN-API). */
  requiredTier: "lite" | "standard" | "pro" | "business" | string;
  /** Current tier badge to display. May be null (treated as Lite). */
  currentTier?: string | null;
  /** Smaller card, no blurred placeholder grid. Use inside an existing layout. */
  compact?: boolean;
  /** Override the default short description. */
  description?: string;
}

// Build the upgrade CTA URL. We default to the pricing page with both
// platform and required-tier query params so the pricing page can pre-select
// the matching plan card.
function upgradeUrl(requiredTier: string): string {
  const q = new URLSearchParams({ platform: "my_brand", required: requiredTier });
  return `/pricing?${q.toString()}`;
}

export function MyBrandUpgradeGate({
  featureName,
  requiredTier,
  currentTier,
  compact = false,
  description,
}: MyBrandUpgradeGateProps) {
  const requiredKey = String(requiredTier || "standard").toLowerCase();
  const currentKey = String(currentTier || "lite").toLowerCase();
  const requiredLabel = TIER_LABELS[requiredKey] || requiredKey;
  const currentLabel = TIER_LABELS[currentKey] || currentKey;

  const card = (
    <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl ring-1 ring-gray-200 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FEC82C]/20">
        <svg className="h-7 w-7 text-[#1A3A4A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
      </div>

      <h2 className="mt-4 text-xl font-bold text-gray-900">{featureName}</h2>
      <p className="mt-2 text-sm text-gray-600">
        {description || (
          <>
            This feature requires the <span className="font-semibold text-[#1A3A4A]">{requiredLabel}</span> plan.
            You are currently on the <span className="font-semibold">{currentLabel}</span> plan.
          </>
        )}
      </p>

      <div className="mt-6">
        <a
          href={upgradeUrl(requiredKey)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1A3A4A] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0B1C24] transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          Upgrade to {requiredLabel}
        </a>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Upgrading unlocks {featureName.toLowerCase()} and every other {requiredLabel}-tier My Brand feature instantly.
      </p>
    </div>
  );

  if (compact) {
    return <div className="flex items-center justify-center py-6">{card}</div>;
  }

  return (
    <div className="relative">
      {/* Blurred placeholder content behind the overlay — gives the user a
          sense that real content lives here without revealing data they
          haven't paid for. */}
      <div className="pointer-events-none select-none blur-sm opacity-40">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-white ring-1 ring-gray-200" />
          ))}
        </div>
        <div className="mt-6 h-64 rounded-xl bg-white ring-1 ring-gray-200" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center">{card}</div>
    </div>
  );
}

export default MyBrandUpgradeGate;

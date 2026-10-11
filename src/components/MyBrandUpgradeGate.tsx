/**
 * MyBrandUpgradeGate — the "Not in your plan" card for a My Brand page or a
 * section of one.
 *
 * Wave 3 of the My Brand stack (Brandon 2026-06-22), blur-+-CTA like
 * OliverUpgradeGate. 2026-10-11 (feature catalog): the card states no tier of
 * its own. The page names a catalog key, useFeatureGate() reads platform-api's
 * answer for it, and this card shows the catalog's `needs` ("ARION Pro",
 * "ARION Standard or SPARK"), the same words the menu lock and the API's
 * refusal use.
 *
 *   const gate = useFeatureGate();
 *   if (gate.locked("my_brand_templates")) {
 *     return <MyBrandUpgradeGate featureName="Template Studio" needs={gate.needs("my_brand_templates")} />;
 *   }
 *
 * Pass `compact` for an inline lock inside an existing layout.
 */

export interface MyBrandUpgradeGateProps {
  /** Feature label shown in the headline, e.g. "Template Studio". */
  featureName: string;
  /** What to buy, in the catalog's words (useFeatureGate().needs(key)). */
  needs: string;
  /** Smaller card, no blurred placeholder grid. Use inside an existing layout. */
  compact?: boolean;
  /** Override the default short description. */
  description?: string;
}

const UPGRADE_URL = "/pricing?platform=my_brand";

export function MyBrandUpgradeGate({
  featureName,
  needs,
  compact = false,
  description,
}: MyBrandUpgradeGateProps) {
  const needsLabel = String(needs || "").trim() || "a higher plan";

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
            Not in your plan. This needs <span className="font-semibold text-[#1A3A4A]">{needsLabel}</span>.
          </>
        )}
      </p>

      <div className="mt-6">
        <a
          href={UPGRADE_URL}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1A3A4A] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0B1C24] transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          Upgrade to {needsLabel}
        </a>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Upgrading unlocks {featureName.toLowerCase()} right away.
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

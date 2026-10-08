import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

export type FeatureState = "comingSoon" | "upsell" | "live";

interface FeatureGateProps {
  state: FeatureState;
  serviceName: string;
  // currently only "spark" but we can reuse this later for ARION/OLIVER etc.
  subscribeTarget?: "spark";
  children: ReactNode;
}

/**
 * FeatureGate wraps a page and overlays one of:
 * - Coming soon overlay (state === "comingSoon")
 * - Subscribe overlay (state === "upsell")
 * - Nothing (state === "live")
 *
 * Children are always rendered underneath so we can show demo data even for upsell.
 */
export function FeatureGate({
  state,
  serviceName,
  subscribeTarget,
  children,
}: FeatureGateProps) {
  const navigate = useNavigate();

  if (state === "live") {
    return <>{children}</>;
  }

  const handleSubscribeClick = () => {
    if (subscribeTarget === "spark") {
      // Internal pricing page route
      navigate("/app/spark/pricing");
      return;
    }
  };

  const isUpsell = state === "upsell";

  return (
    <div className="relative">
      {/* underlying layout (demo data or skeleton) */}
      <div className={isUpsell ? "pointer-events-none select-none" : "pointer-events-none select-none"}>
        {children}
      </div>

      {/* overlay */}
      <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
        <div className="max-w-md rounded-2xl bg-white px-6 py-5 shadow-lg border border-gray-200 text-center">
          <h2 className="text-lg font-semibold mb-2">
            {isUpsell
              ? `${serviceName} isn't part of this business's plan`
              : "Coming soon"}
          </h2>

          {isUpsell ? (
            <>
              <p className="text-sm text-gray-600 mb-4">
                This is a preview of what you&apos;ll get with SPARK — Growth
                Platform. To unlock live data and full access, add SPARK to your
                subscription.
              </p>
              <button
                type="button"
                onClick={handleSubscribeClick}
                className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                Subscribe to SPARK
              </button>
              <p className="mt-3 text-xs text-gray-500">
                Questions? Email{" "}
                <a
                  href="mailto:info@intelligentanalyticsdm.com"
                  className="underline"
                >
                  info@intelligentanalyticsdm.com
                </a>
                .
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                This feature is on our roadmap and is not yet available in your
                portal. When it launches, it will appear here automatically.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
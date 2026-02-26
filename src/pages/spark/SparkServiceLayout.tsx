import type { PropsWithChildren } from "react";
import { Link } from "react-router-dom";
import type { PortalService, ServiceStatus } from "../../config/serviceCatalog";

type SparkServiceLayoutProps = PropsWithChildren<{
  service: PortalService;
  status: ServiceStatus;
}>;

type UpsellStatus = Extract<ServiceStatus, "coming_soon" | "not_subscribed">;

type UpsellFeatureIcon = "list" | "email" | "sms" | "leads" | "segment" | "report";

interface UpsellFeature {
  icon: UpsellFeatureIcon;
  title: string;
  description: string;
}

export function SparkServiceLayout(props: SparkServiceLayoutProps) {
  const { service, status, children } = props;

  const showOverlay = status === "coming_soon" || status === "not_subscribed";
  const upsellStatus = showOverlay ? (status as UpsellStatus) : undefined;

  return (
    <div className="relative">
      {/* Underlying page content (cards, metrics, etc.) */}
      {children}

      {/* Overlay for "coming soon" or "not subscribed" */}
      {upsellStatus && (
        <SparkUpsellOverlay status={upsellStatus} service={service} />
      )}
    </div>
  );
}

interface SparkUpsellOverlayProps {
  status: UpsellStatus;
  service: PortalService;
}

function SparkUpsellOverlay({ status, service }: SparkUpsellOverlayProps) {
  // Scenario A: feature not in production yet
  if (status === "coming_soon") {
    return (
      <div className="iadm-upsell-backdrop">
        <div className="iadm-upsell-card text-center">
          <h2 className="iadm-upsell-title">
            {service.displayName} is coming soon
          </h2>
          <p className="iadm-upsell-subtitle">
            This section is a placeholder for upcoming SPARK — Growth Platform
            capabilities. Once SPARK is launched for your account you&apos;ll
            see live CRM, campaign, and reporting data here.
          </p>
        </div>
      </div>
    );
  }

  // Scenario B: SPARK is a live product but this customer isn't subscribed yet
  const features: UpsellFeature[] = [
    {
      icon: "list",
      title: "CRM",
      description: "Keep every contact organized and actionable.",
    },
    {
      icon: "email",
      title: "Custom Email Campaigns",
      description: "Design, schedule & track targeted email outreach.",
    },
    {
      icon: "sms",
      title: "Custom SMS Campaigns",
      description: "Reach customers instantly on mobile with SMS.",
    },
    {
      icon: "segment",
      title: "Customer Segmentation",
      description: "Group contacts by behaviour, value, or intent.",
    },
    {
      icon: "leads",
      title: "Lead Generation",
      description: "Capture, qualify & route new leads automatically.",
    },
    {
      icon: "report",
      title: "IADM Reporting",
      description: "Track performance & insights across campaigns.",
    },
  ];

  return (
    <div className="iadm-upsell-backdrop">
      <div className="iadm-upsell-card">
        <h2 className="iadm-upsell-title">
          <span>Scale Smarter, Not Harder—Power Your Success with </span>
          <span className="iadm-upsell-title-highlight">SPARK</span>
        </h2>

        <p className="iadm-upsell-subtitle">
          Build deeper relationships with your audience by delivering the{" "}
          <span className="font-semibold">right message</span> at exactly the{" "}
          <span className="font-semibold">right time</span>. From{" "}
          <span className="font-semibold">automated follow-ups</span> to{" "}
          <span className="font-semibold">precision targeting</span>, SPARK
          gives you the power to turn cold prospects into{" "}
          <span className="font-semibold">
            lifelong brand advocates.
          </span>
        </p>

        <div className="iadm-upsell-divider" />

        <div className="iadm-upsell-feature-grid">
          {features.map((feature) => (
            <div key={feature.title} className="iadm-upsell-feature-row">
              <div className="iadm-upsell-feature-icon">
                <FeatureIcon kind={feature.icon} />
              </div>
              <div>
                <div className="iadm-upsell-feature-title">
                  {feature.title}
                </div>
                <div className="iadm-upsell-feature-text">
                  {feature.description}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="iadm-upsell-cta-wrapper">
          <Link to="/app/spark/pricing" className="iadm-upsell-cta">
            Add SPARK to my account
          </Link>
        </div>
      </div>
    </div>
  );
}

interface FeatureIconProps {
  kind: UpsellFeatureIcon;
}

/**
 * Simple inline SVG icons so we don't introduce a new dependency.
 * These are sized to sit nicely inside the circular icon container.
 */
function FeatureIcon({ kind }: FeatureIconProps) {
  const common = "h-5 w-5";

  switch (kind) {
    case "list":
      return (
        <svg
          className={common}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="4" y="5" width="3" height="3" rx="1" fill="currentColor" />
          <rect x="4" y="10.5" width="3" height="3" rx="1" fill="currentColor" />
          <rect x="4" y="16" width="3" height="3" rx="1" fill="currentColor" />
          <rect x="9" y="5.5" width="11" height="2" rx="1" fill="currentColor" />
          <rect x="9" y="11" width="11" height="2" rx="1" fill="currentColor" />
          <rect x="9" y="16.5" width="9" height="2" rx="1" fill="currentColor" />
        </svg>
      );

    case "email":
      return (
        <svg
          className={common}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <rect
            x="3.5"
            y="5"
            width="17"
            height="14"
            rx="2"
            ry="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M5 7.5L12 12.5L19 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "sms":
      return (
        <svg
          className={common}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <rect
            x="3.5"
            y="4"
            width="17"
            height="13"
            rx="3"
            ry="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M10 18.5L8 20.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="9" cy="10" r="0.9" fill="currentColor" />
          <circle cx="12" cy="10" r="0.9" fill="currentColor" />
          <circle cx="15" cy="10" r="0.9" fill="currentColor" />
        </svg>
      );

    case "segment":
      return (
        <svg
          className={common}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="8" r="3" fill="currentColor" />
          <path
            d="M5.5 19c.8-2.6 3-4.3 6.5-4.3 3.5 0 5.7 1.7 6.5 4.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="5" cy="9.5" r="1.5" fill="currentColor" opacity={0.7} />
          <circle cx="19" cy="9.5" r="1.5" fill="currentColor" opacity={0.7} />
        </svg>
      );

    case "leads":
      return (
        <svg
          className={common}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M5 7h8m0 0L10 4m3 3L10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="5"
            y="12"
            width="14"
            height="7"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      );

    case "report":
    default:
      return (
        <svg
          className={common}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <rect
            x="4"
            y="5"
            width="16"
            height="14"
            rx="2"
            ry="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M8 15V11M12 15V9M16 15v-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
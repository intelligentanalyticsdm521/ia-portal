/**
 * OliverPageWrapper — wraps OLIVER pages in the .arion-page CSS scope so
 * they pick up the shared design system (cards, tables, badges, modals,
 * tabs). Visually consistent with ARION + SPARK.
 *
 * Catches TierGateError from useOliverApi and shows the upgrade overlay.
 */
import { type ReactNode } from "react";
import { isTierGateError, type TierGateError } from "../hooks/useOliverApi";
import { OliverUpgradeGate } from "./OliverUpgradeGate";

interface OliverPageWrapperProps {
  title: string;
  subtitle?: string;
  error: unknown;
  loading: boolean;
  children: ReactNode;
}

export function OliverPageWrapper({ title, subtitle, error, loading, children }: OliverPageWrapperProps) {
  if (isTierGateError(error)) {
    return (
      <div className="arion-page">
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">{title}</div>
              {subtitle && <div className="card-sub">{subtitle}</div>}
            </div>
          </div>
          <OliverUpgradeGate
            tierRequired={(error as TierGateError).tierRequired}
            currentTier={(error as TierGateError).currentTier}
            featureName={title}
          />
        </div>
      </div>
    );
  }

  if (error && !loading) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="arion-page">
        <div className="card">
          <div className="card-ttl" style={{ color: "#dc2626" }}>Failed to load</div>
          <div className="card-sub">{message}</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="arion-page">
        <div className="card" style={{ padding: 24, color: "#5A7A8A" }}>Loading…</div>
      </div>
    );
  }

  return <div className="arion-page">{children}</div>;
}

/**
 * OliverPageWrapper — Wraps any OLIVER page content with automatic
 * tier-gate error handling. Catches TierGateError from useOliverApi
 * and shows the upgrade overlay instead of a generic error.
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
  // Tier gate — show upgrade overlay
  if (isTierGateError(error)) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        <div className="mt-6">
          <OliverUpgradeGate
            tierRequired={(error as TierGateError).tierRequired}
            currentTier={(error as TierGateError).currentTier}
            featureName={title}
          />
        </div>
      </div>
    );
  }

  // Generic error
  if (error && !loading) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        <div className="mt-6 rounded-xl bg-red-50 p-6 text-sm text-red-700">
          <p className="font-medium">Failed to load</p>
          <p className="mt-1">{message}</p>
        </div>
      </div>
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 w-48 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-72 rounded bg-gray-200" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-gray-200" />
            ))}
          </div>
          <div className="mt-6 h-64 rounded-xl bg-gray-200" />
        </div>
      </div>
    );
  }

  // Normal content
  return <>{children}</>;
}

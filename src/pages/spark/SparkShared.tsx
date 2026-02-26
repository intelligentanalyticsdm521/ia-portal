import { ReactNode } from "react";
import { FeatureGate, FeatureState } from "../../components/FeatureGate";
import { useAppState } from "../../app/AppState";

interface SparkFrameProps {
  serviceName: string;
  featureState: FeatureState;
  children: ReactNode;
}

/**
 * Shared wrapper for all SPARK pages: header + "Open SPARK Platform" button
 * + FeatureGate overlay handling.
 */
export function SparkFrame({
  serviceName,
  featureState,
  children,
}: SparkFrameProps) {
  const { active } = useAppState();

  const tenantName =
    active?.tenant?.tenantFullName || active?.tenant?.tenantName || "your tenant";

  const handleOpenSpark = () => {
    const target = import.meta.env.VITE_SPARK_APP_URL;
    if (target) {
      window.location.href = target;
    } else {
      // fallback: no URL configured
      alert(
        "SPARK app URL is not configured (VITE_SPARK_APP_URL). Please contact support."
      );
    }
  };

  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{serviceName}</h1>
          <p className="mt-1 text-sm text-gray-600">
            SPARK — Growth Platform reporting for{" "}
            <span className="font-medium">{tenantName}</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenSpark}
          className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          Open SPARK Platform
        </button>
      </div>

      <FeatureGate
        state={featureState}
        serviceName={serviceName}
        subscribeTarget="spark"
      >
        {children}
      </FeatureGate>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  helper?: string;
}

export function StatCard({ label, value, helper }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
      {helper && (
        <p className="mt-1 text-xs text-gray-500">
          {helper}
        </p>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50">
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}
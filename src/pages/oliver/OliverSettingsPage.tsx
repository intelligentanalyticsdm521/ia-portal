import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";

interface TenantSettings {
  businessName: string;
  stripeConnected: boolean;
  stripeAccountId: string | null;
  timezone: string;
  currency: string;
  [key: string]: unknown;
}

export function OliverSettingsPage() {
  const { get, ready } = useOliverApi();
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await get<TenantSettings>("/settings");
        if (!cancelled) setSettings(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-6 bg-gray-200 rounded mb-3" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-5 text-red-700">{error}</div>
      </div>
    );
  }

  const entries: [string, string][] = [
    ["Business Name", settings?.businessName ?? "—"],
    ["Stripe Connected", settings?.stripeConnected ? "Yes" : "No"],
    ["Stripe Account", settings?.stripeAccountId ?? "—"],
    ["Timezone", settings?.timezone ?? "—"],
    ["Currency", settings?.currency ?? "—"],
  ];

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>

      <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {entries.map(([key, value]) => (
              <tr key={key} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-slate-700 w-48">{key}</td>
                <td className="px-4 py-3 text-slate-600">
                  {key === "Stripe Connected" ? (
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      value === "Yes" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                    }`}>
                      {value}
                    </span>
                  ) : (
                    value
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

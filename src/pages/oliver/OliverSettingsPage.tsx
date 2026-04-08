import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

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
  const [error, setError] = useState<unknown>(null);

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
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  const entries: [string, string][] = [
    ["Business Name", settings?.businessName ?? "—"],
    ["Stripe Connected", settings?.stripeConnected ? "Yes" : "No"],
    ["Stripe Account", settings?.stripeAccountId ?? "—"],
    ["Timezone", settings?.timezone ?? "—"],
    ["Currency", settings?.currency ?? "—"],
  ];

  return (
    <OliverPageWrapper title="Settings" subtitle="Tenant configuration" error={error} loading={loading}>
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
    </OliverPageWrapper>
  );
}

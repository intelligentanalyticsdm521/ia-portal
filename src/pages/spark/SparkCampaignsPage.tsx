import { useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface Campaign {
  id: string;
  name: string;
  channel: "email" | "sms";
  status: string;
  recipientCount: number;
  openRate: number | null;
  sentAt: string | null;
  createdAt: string;
}

export function SparkCampaignsPage() {
  const { get, ready } = useSparkApi();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"email" | "sms">("email");

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const raw = await get<{ data: Campaign[] }>("/api/v1/campaigns");
        if (!cancelled) setCampaigns(raw.data || []);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  const filtered = campaigns.filter((c) => c.channel === tab);

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-600",
      scheduled: "bg-blue-100 text-blue-700",
      sending: "bg-amber-100 text-amber-700",
      sent: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status.toLowerCase()] || "bg-gray-100 text-gray-600"}`}>
        {status}
      </span>
    );
  }

  return (
    <OliverPageWrapper title="Campaigns" subtitle="Email and SMS campaign management" error={error} loading={loading}>
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(["email", "sms"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {t === "email" ? "Email" : "SMS"}
              </button>
            ))}
          </div>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Create Campaign
          </button>
        </div>

        <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Recipients</th>
                <th className="px-4 py-3">Open Rate</th>
                <th className="px-4 py-3">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3">{statusBadge(c.status)}</td>
                  <td className="px-4 py-3 text-slate-600">{c.recipientCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-600">{c.openRate != null ? `${c.openRate}%` : "—"}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{c.sentAt ? new Date(c.sentAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                    No {tab} campaigns yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </OliverPageWrapper>
  );
}

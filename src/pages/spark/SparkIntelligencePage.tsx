import { useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";

interface TierDistribution {
  tier: string;
  count: number;
  avg_score: number;
}

interface IntelligenceSummary {
  distribution: TierDistribution[];
  total_contacts: number;
  scored_contacts: number;
}

interface IntelligenceContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  contact_intelligence_tier: "X" | "Y" | "Z";
  contact_intelligence_score: number;
  contact_intelligence_updated_at: string;
}

export function SparkIntelligencePage() {
  const { get, post, ready } = useSparkApi();
  const [summary, setSummary] = useState<IntelligenceSummary | null>(null);
  const [contacts, setContacts] = useState<IntelligenceContact[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "X" | "Y" | "Z">("all");
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [summaryRaw, contactsRaw] = await Promise.all([
          get<{ data: IntelligenceSummary }>("/api/v1/intelligence/summary"),
          get<{ data: IntelligenceContact[] }>("/api/v1/contacts?limit=50"),
        ]);
        if (!cancelled) {
          setSummary(summaryRaw.data || null);
          setContacts(contactsRaw.data || []);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  async function handleEnrollAll() {
    setEnrolling(true);
    try {
      await post("/api/v1/intelligence/enroll");
    } catch (err) {
      setError(err);
    } finally {
      setEnrolling(false);
    }
  }

  const tierColorMap: Record<string, { color: string; bg: string }> = {
    X: { color: "text-emerald-600", bg: "bg-emerald-50" },
    Y: { color: "text-blue-600", bg: "bg-blue-50" },
    Z: { color: "text-gray-600", bg: "bg-gray-50" },
  };

  const tiers = summary
    ? summary.distribution.map((d) => ({
        label: `${d.tier}-Tier`,
        count: d.count,
        avg: d.avg_score,
        color: tierColorMap[d.tier]?.color || "text-gray-600",
        bg: tierColorMap[d.tier]?.bg || "bg-gray-50",
      }))
    : [];

  const filtered = tab === "all" ? contacts : contacts.filter((c) => c.contact_intelligence_tier === tab);

  return (
    <SparkPageShell title="Contact Intelligence" subtitle="X/Y/Z scoring with cross-platform signals" error={error} loading={loading}>
      <div className="p-6 space-y-6">
        {/* Tier summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {tiers.map((t) => (
            <div key={t.label} className={`rounded-xl ${t.bg} ring-1 ring-gray-200 p-5`}>
              <p className={`text-sm font-medium ${t.color}`}>{t.label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{t.count.toLocaleString()}</p>
              <p className="mt-1 text-xs text-slate-500">Avg score: {t.avg.toFixed(1)}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(["all", "X", "Y", "Z"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {t === "all" ? "All" : `${t}-Tier`}
              </button>
            ))}
          </div>
          <button
            onClick={handleEnrollAll}
            disabled={enrolling}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {enrolling ? "Enrolling..." : "Enroll All"}
          </button>
        </div>

        {/* Contact table */}
        <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => {
                const tierColors: Record<string, string> = {
                  X: "bg-emerald-100 text-emerald-700",
                  Y: "bg-blue-100 text-blue-700",
                  Z: "bg-gray-100 text-gray-600",
                };
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{c.first_name} {c.last_name}</td>
                    <td className="px-4 py-3 text-slate-600">{c.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tierColors[c.contact_intelligence_tier]}`}>
                        {c.contact_intelligence_tier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.contact_intelligence_score}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{c.contact_intelligence_updated_at ? new Date(c.contact_intelligence_updated_at).toLocaleDateString() : "—"}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                    No contacts scored yet. Enroll contacts to begin intelligence analysis.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SparkPageShell>
  );
}

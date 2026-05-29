// SparkLeadsPage — F-124 (lead generator paused for Monday go-live).
//
// Founder decision 2026-05-29: the lead generator is too much work to wire
// up properly before Monday onboarding. Page stays so the nav doesn't
// flicker, but the live data + actions are replaced with a Coming Soon
// surface and a greyed-out preview of what's coming.
//
// The lumen.lead-gen-admin backend is still live for ARION/SPARK product
// configuration. This is strictly a UX pause on the consumer surface
// pending the broader lead-gen rebuild.
import { Sparkles, Target, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { SparkPageShell } from "../../components/spark/SparkPageShell";

export function SparkLeadsPage() {
  return (
    <SparkPageShell
      title="Lead Inbox"
      subtitle="B2B lead discovery — coming soon"
      error={null}
      loading={false}
    >
      <div className="p-6">
        {/* Coming-soon hero */}
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center mb-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 border border-amber-200">
            <Target className="h-7 w-7 text-amber-600" />
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
            SPARK · Coming Soon
          </div>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Lead Generator</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600 leading-relaxed">
            We're rebuilding the lead generator to give you proper B2B discovery
            with Hot/Warm/Cold scoring, source attribution, accept/reject
            workflow, and direct hand-off to SPARK campaigns. Coming this June.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-orange-50 border border-orange-200 px-4 py-1.5 text-xs font-semibold text-orange-800">
            <Sparkles className="h-3.5 w-3.5" />
            Building during June enhancements
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/app/services/spark_forms"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Use Forms instead →
            </Link>
            <Link
              to="/app/services/spark_contacts"
              className="rounded-md bg-[#EF6C33] px-4 py-2 text-sm font-medium text-white hover:bg-[#D85F2A]"
            >
              Go to Contacts
            </Link>
          </div>
        </div>

        {/* Greyed preview of what's coming */}
        <div className="relative rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden pointer-events-none select-none">
          <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
            <div className="rounded-full bg-slate-900/90 text-white px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 shadow-lg">
              <Lock className="h-3 w-3" /> Preview · not yet live
            </div>
          </div>
          <div className="p-6 grayscale opacity-60">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
                {(["All", "Hot", "Warm", "Cold"] as const).map((f) => (
                  <button
                    key={f}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      f === "All" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
                New Search
              </button>
            </div>

            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  { name: "Acme Plumbing Co", score: "Hot", color: "bg-red-100 text-red-700" },
                  { name: "Greenfield Landscaping", score: "Warm", color: "bg-amber-100 text-amber-700" },
                  { name: "Northside HVAC", score: "Cold", color: "bg-blue-100 text-blue-700" },
                ].map((s, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>
                        {s.score}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">hidden@example.com</td>
                    <td className="px-4 py-3 text-slate-600">(555) 000-0000</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">new</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">search</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button className="rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-700">Accept</button>
                        <button className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </SparkPageShell>
  );
}

export default SparkLeadsPage;

import { useState } from "react";
import { useAppState } from "../app/AppState";
import { CommandDashboard } from "./command/CommandDashboard";
import { CommandCalendar } from "./command/CommandCalendar";
import { CommandAlerts } from "./command/CommandAlerts";

type Tab = "dashboard" | "calendar" | "alerts";

export function OverviewPage() {
  const { active } = useAppState();
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    // insights-shell (2026-07-26): home matches the insights surfaces —
    // 80% of the content area, max 1600px, centered.
    <div className="insights-shell space-y-4 px-2 lg:px-0">
      <section className="iadm-card">
        <div className="iadm-card-body flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Command Center</h1>
            <p className="mt-1 text-sm text-gray-600">
              Good morning. Here's what's happening at{" "}
              <span className="font-medium">{active?.tenant?.tenantFullName || active?.tenant?.tenantName || "your business"}</span>.
            </p>
          </div>
          <div className="text-xs text-gray-500">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
        </div>
      </section>

      <nav className="flex border-b border-gray-200">
        {(["dashboard", "calendar", "alerts"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${
              tab === t ? "border-[#EF6C33] text-[#EF6C33]" : "border-transparent text-gray-600 hover:text-gray-900"
            }`}>
            {t}
          </button>
        ))}
      </nav>

      <div>
        {tab === "dashboard" && <CommandDashboard />}
        {tab === "calendar" && <CommandCalendar />}
        {tab === "alerts" && <CommandAlerts />}
      </div>
    </div>
  );
}

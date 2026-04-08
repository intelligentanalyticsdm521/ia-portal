import { useState } from "react";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface Automation {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

const AUTOMATIONS: Automation[] = [
  {
    id: "welcome",
    name: "Welcome Sequence",
    description: "Automatically sends a 3-email welcome series to new contacts. Introduces your business, highlights key services, and includes a call-to-action.",
    active: false,
  },
  {
    id: "reengagement",
    name: "Re-engagement Sequence",
    description: "Targets contacts who have not opened an email in 60+ days. Sends a re-engagement offer followed by a final check-in before marking inactive.",
    active: false,
  },
];

export function SparkAutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>(AUTOMATIONS);

  function toggle(id: string) {
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a))
    );
  }

  return (
    <OliverPageWrapper title="Automations" subtitle="Email sequences that run automatically" error={null} loading={false}>
      <div className="p-6 space-y-4">
        <p className="text-sm text-slate-500">
          Pre-built automation sequences. Toggle them on to activate. Custom automations are coming soon.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {automations.map((a) => (
            <div key={a.id} className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{a.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{a.description}</p>
                </div>
                <button
                  onClick={() => toggle(a.id)}
                  className={`relative ml-4 inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${a.active ? "bg-blue-600" : "bg-gray-300"}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${a.active ? "translate-x-5.5" : "translate-x-0.5"}`} />
                </button>
              </div>
              <div className="mt-3">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${a.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {a.active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </OliverPageWrapper>
  );
}

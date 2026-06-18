// /app/settings/walkthroughs — list of every walkthrough you can re-run.
// Group by product. Show completed checkmark for walkthroughs the user
// has already run (stored in localStorage for now, can graduate to per-user
// in core.user_walkthrough_state later).

import { useEffect, useMemo, useState } from "react";
import { WALKTHROUGHS, Walkthrough, walkthroughsByProduct } from "../../components/walkthroughs/walkthroughRegistry";
import { WalkthroughRunner } from "../../components/walkthroughs/WalkthroughRunner";
import { Play, CheckCircle2, Clock } from "lucide-react";

const STORAGE_KEY = "iadm.completed_walkthroughs";

function loadCompleted(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveCompleted(s: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

const PRODUCT_TITLES: Record<string, string> = {
  arion: "ARION",
  spark: "SPARK",
  oliver: "OLIVER",
  consulting: "Consulting",
  platform: "Platform",
};
const PRODUCT_ACCENTS: Record<string, string> = {
  arion: "#22ABA2",
  spark: "#F69132",
  oliver: "#FEC82C",
  consulting: "#1A7DB5",
  platform: "#1A3A4A",
};

export default function WalkthroughsPage() {
  const [completed, setCompleted] = useState<Set<string>>(() => loadCompleted());
  const [activeWalkthrough, setActiveWalkthrough] = useState<Walkthrough | null>(null);

  useEffect(() => { saveCompleted(completed); }, [completed]);

  const productGroups = useMemo(() => {
    const groups: Array<{ product: string; items: Walkthrough[] }> = [];
    for (const p of ["arion", "spark", "oliver", "consulting", "platform"] as const) {
      const items = walkthroughsByProduct(p);
      if (items.length) groups.push({ product: p, items });
    }
    return groups;
  }, []);

  function run(w: Walkthrough) {
    setActiveWalkthrough(w);
  }
  function complete(id: string) {
    setCompleted((prev) => new Set([...prev, id]));
  }

  const totalCount = WALKTHROUGHS.length;
  const doneCount = completed.size;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Walkthroughs</h1>
        <p className="text-sm text-slate-600">
          Short, plain-English explainers for every major feature. Run them any time — they pick up where you left off and link straight to the page where you create your first one.
        </p>
        <div className="text-xs text-slate-500 pt-1">
          {doneCount} / {totalCount} completed
        </div>
      </header>

      {productGroups.map((g) => (
        <section key={g.product} className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ background: PRODUCT_ACCENTS[g.product] }} />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{PRODUCT_TITLES[g.product]}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {g.items.map((w) => {
              const done = completed.has(w.id);
              return (
                <div key={w.id} className="rounded-lg border border-slate-200 bg-white p-3 flex items-start justify-between gap-3 hover:border-slate-400 transition">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-sm text-slate-900">{w.title}</div>
                      {done && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                          <CheckCircle2 className="h-3 w-3" /> Done
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">{w.oneLiner}</div>
                    <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> ~{w.estimatedMinutes} min · {w.steps.length} steps
                    </div>
                  </div>
                  <button
                    onClick={() => run(w)}
                    className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:border-slate-500 flex items-center gap-1 whitespace-nowrap"
                  >
                    <Play className="h-3 w-3" /> {done ? "Run again" : "Run"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <WalkthroughRunner
        open={!!activeWalkthrough}
        walkthrough={activeWalkthrough}
        onClose={() => setActiveWalkthrough(null)}
        onComplete={complete}
      />
    </div>
  );
}

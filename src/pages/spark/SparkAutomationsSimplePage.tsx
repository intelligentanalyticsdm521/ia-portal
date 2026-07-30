// SparkAutomationsSimplePage — ONE page of prebuilt automations.
//
// Replaces four separate builders (Workflows & Automations, Automation
// Builder, Journey Builder, Workflow Triggers) plus Rules. Brandon
// 2026-07-27: "I honestly don't even know what any of this is for. This is
// one of those do we actually need this moments." His test for the whole
// product: "if I don't understand it, no client will."
//
// A node editor asks the user to design a marketing programme. Almost nobody
// running a lawn-care business wants to. They want the four things that
// actually earn money to be ON. So this page is four switches with plain
// English about what each one does and when it fires — no canvas, no nodes,
// no branch logic.
//
// Each toggle maps to a row in lumen.automation via `template_key`. Turning
// one on creates (or reactivates) that row; turning it off sets is_active=0.
// Nothing is deleted, so flipping back on restores the same automation and
// its history.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Mail, Clock, HeartHandshake, Cake, Check } from "lucide-react";

interface Automation {
  id: number;
  name: string;
  type: string;
  is_active: boolean;
  template_key: string | null;
}

interface Recipe {
  key: string;
  name: string;
  type: string;
  icon: typeof Mail;
  /** What it does, in the user's words. */
  what: string;
  /** When it fires — the bit people actually need to trust it. */
  when: string;
  /** Why it's worth switching on. */
  why: string;
}

/**
 * The four that matter. Deliberately NOT configurable on this page — a
 * "choose your delay" field is the first step back toward a builder. Timing
 * lives in config with a sensible default; if a client genuinely needs
 * different timing we change the default rather than making everyone think
 * about it.
 */
const RECIPES: Recipe[] = [
  {
    key: "welcome",
    name: "Welcome new contacts",
    type: "welcome",
    icon: Mail,
    what: "Sends a short hello the first time someone lands in your CRM.",
    when: "Within an hour of the contact being created — from a form, an import, or by hand.",
    why: "People are most interested in you the day they get in touch. This is the single highest-open email you'll ever send.",
  },
  {
    key: "re_engagement",
    name: "Nudge quiet contacts",
    type: "re_engagement",
    icon: Clock,
    what: "Emails contacts who haven't opened or clicked anything in a while.",
    when: "Once a contact has been quiet for 90 days. Each person gets it once, not on a loop.",
    why: "A list quietly goes stale. This catches people before they forget who you are — and tells you who to stop paying to email.",
  },
  {
    key: "win_back",
    name: "Win back past customers",
    type: "win_back",
    icon: HeartHandshake,
    what: "Reaches out to customers who bought once and haven't come back.",
    when: "180 days after their last job or order.",
    why: "Selling again to someone who already paid you is the cheapest work you'll ever get.",
  },
  {
    key: "birthday",
    name: "Birthday greeting",
    type: "birthday",
    icon: Cake,
    what: "Sends a short note on a contact's birthday, if you have the date.",
    when: "On the day, in the morning. Skips anyone without a birthday on file.",
    why: "Low effort, and it's the one marketing email people actually reply to.",
  },
];

export function SparkAutomationsSimplePage() {
  const { get, post, put, ready } = useSparkApi();
  const [rows, setRows] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: Automation[] }>("/api/v1/automations");
      setRows(r.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  /** template_key → its row, if this tenant has one. */
  const byKey = useMemo(() => {
    const m = new Map<string, Automation>();
    for (const a of rows) if (a.template_key) m.set(a.template_key, a);
    return m;
  }, [rows]);

  async function toggle(recipe: Recipe, on: boolean) {
    setBusy(recipe.key);
    setError(null);
    try {
      const existing = byKey.get(recipe.key);
      if (existing) {
        // Reactivating keeps the original row, so its run history survives
        // being switched off and on again.
        await put(`/api/v1/automations/${existing.id}`, { is_active: on });
      } else {
        await post("/api/v1/automations", {
          name: recipe.name,
          type: recipe.type,
          template_key: recipe.key,
          is_active: on,
          config: { prebuilt: true },
        });
      }
      await load();
    } catch (err) { setError(err); }
    finally { setBusy(null); }
  }

  const activeCount = RECIPES.filter((r) => byKey.get(r.key)?.is_active).length;

  return (
    <SparkPageShell
      title="Automations"
      subtitle={`${activeCount} of ${RECIPES.length} running`}
      help={
        <>
          These run on their own once they're on. Switch one off and it stops
          immediately — nothing is deleted, and turning it back on picks up
          where it left off.
        </>
      }
      loading={loading}
      error={error}
    >
      <div className="space-y-3 p-1">
        {RECIPES.map((r) => {
          const row = byKey.get(r.key);
          const on = !!row?.is_active;
          const Icon = r.icon;
          return (
            <div
              key={r.key}
              data-tour={`automation-${r.key}`}
              className={`rounded-lg border p-4 transition-colors ${
                on ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                    on ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{r.name}</h3>
                    {on && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        <Check className="h-2.5 w-2.5" /> On
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{r.what}</p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                    <span className="font-semibold text-slate-600">When: </span>{r.when}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                    <span className="font-semibold text-slate-600">Why: </span>{r.why}
                  </p>
                </div>

                {/* Plain switch. The whole point is that this page has one
                    control per automation and no second decision to make. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${on ? "Turn off" : "Turn on"} ${r.name}`}
                  disabled={busy === r.key}
                  onClick={() => toggle(r, !on)}
                  className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                    on ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      on ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 px-1 text-[11px] leading-relaxed text-slate-500">
        Want something these don't cover? Tell us what you'd automate — we'd
        rather add a switch everyone understands than a builder most people
        never open.
      </p>
    </SparkPageShell>
  );
}

export default SparkAutomationsSimplePage;

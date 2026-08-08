// ConsultingWorkOverviewPage — AGENCY Overview (2026-08-08).
//
// Brandon's spec, in his words:
//   "Billy has 5 things still in-progress due next week and the time estimate is
//    80 hours of total work. That lets me know I need to check in with Billy or
//    adjust deadlines."
//   "Client A has an outstanding review item for 2 weeks and the project was
//    scheduled to be done 8/14 — you need to review that and follow up."
//
// So this is NOT a metrics page. It surfaces SITUATIONS that need a decision,
// each naming the person or client, the commitment at stake, and what is at odds
// with it. Counts alone were the old page's failure — nobody opens their work
// software to learn their 90-day average cycle time.
//
// Client side untouched: ServiceRouter renders this only for founders; the
// existing shared ConsultingOverviewPage still serves clients unchanged.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { AlertCircle, AlertTriangle, Clock, Users, Inbox, Rocket } from "lucide-react";

const BOARD = "/app/admin/consulting/requests";

interface NeedsYouRow {
  id: string; title: string; stage: string; status: string; origin: string;
  due_at?: string | null; estimate_hours?: number | null; platform?: string | null;
  days_waiting: number; reason: string;
  project_name?: string | null; target_end_date?: string | null;
  client_display_name?: string | null; client_company?: string | null;
  assignee_name?: string | null;
}
interface WaitingRow {
  id: string; title: string; stage: string; status: string; days_waiting: number;
  project_name?: string | null; target_end_date?: string | null; project_overdue: number;
  client_display_name?: string | null; client_company?: string | null;
}
interface PersonRow {
  worker_id: string; display_name: string; hours_per_week: number | null;
  open_count: number; in_progress: number; due_next_7: number;
  hours_due_next_7: number | null; hours_open: number | null; unsized: number; overdue: number;
}
interface ReleaseRow {
  release_id: string; name: string; target_date?: string | null; status: string;
  open_count: number; hours_open: number | null; days_left: number | null;
}
interface OverviewData {
  needs_you: NeedsYouRow[];
  waiting_on_client: WaitingRow[];
  people: PersonRow[];
  unassigned: { n: number; hours: number | null };
  releases: ReleaseRow[];
}

const REASON_LABEL: Record<string, string> = {
  untriaged_client_request: "New client request — not triaged",
  revision_requested: "Client asked for changes",
  overdue: "Overdue",
  other: "Needs attention",
};

// DATE columns carry no timezone; new Date() would shift them a day west of UTC.
function fmtDate(v?: string | null): string {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}` : String(v);
}
const clientOf = (r: { client_display_name?: string | null; client_company?: string | null; project_name?: string | null }) =>
  r.client_display_name || r.client_company || r.project_name || "Internal";

function Band({ icon, title, subtitle, count, tone, children }: {
  icon: React.ReactNode; title: string; subtitle: string; count: number;
  tone: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <span style={{ color: tone }}>{icon}</span>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <p className="text-[11px] text-slate-500">{subtitle}</p>
        </div>
        <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: tone }}>{count}</span>
      </div>
      {children}
    </section>
  );
}

export function ConsultingWorkOverviewPage() {
  const { getFounder, ready } = useOliverApi();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      setData(await getFounder<OverviewData>("/consulting/work-overview"));
      setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [getFounder, ready]);

  useEffect(() => { load(); }, [load]);

  // "80h against a 40h week" is the whole point. NULL capacity must read as
  // unknown — assuming 40 would invent an over-allocation that isn't real.
  const peopleRanked = useMemo(() => {
    if (!data?.people) return [];
    return [...data.people]
      .map((p) => {
        const committed = Number(p.hours_due_next_7 || 0);
        const cap = p.hours_per_week == null ? null : Number(p.hours_per_week);
        return { ...p, committed, cap, ratio: cap ? committed / cap : null };
      })
      .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || b.committed - a.committed);
  }, [data]);

  if (loading) return <div className="mx-auto p-6 text-sm text-slate-500" style={{ maxWidth: "80%" }}>Loading…</div>;

  if (error) {
    return (
      <div className="mx-auto space-y-3" style={{ maxWidth: "80%" }}>
        <h1 className="text-lg font-bold text-slate-900">Consulting Overview</h1>
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />{error}
        </div>
      </div>
    );
  }

  const needsYou = data?.needs_you || [];
  const waiting = data?.waiting_on_client || [];
  const releases = data?.releases || [];
  const unassigned = data?.unassigned;
  const nothingToDo = !needsYou.length && !waiting.length;

  return (
    <div className="mx-auto space-y-4 pb-8" style={{ maxWidth: "80%" }}>
      <div>
        <h1 className="text-lg font-bold text-slate-900">Consulting Overview</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          What needs a decision from you today. Every line opens the work behind it.
        </p>
      </div>

      {nothingToDo && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Nothing is blocked on you and nothing is waiting on a client. Good place to be.
        </div>
      )}

      {/* ── 1. BLOCKED ON YOU ─────────────────────────────────────────────── */}
      {needsYou.length > 0 && (
        <Band icon={<AlertTriangle className="h-4 w-4" />} tone="#dc2626"
          title="Needs you" subtitle="You are the blocker on these" count={needsYou.length}>
          <div className="divide-y divide-slate-100">
            {needsYou.map((r) => (
              <Link key={r.id} to={BOARD} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-slate-800">{r.title}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-600">{clientOf(r)}</span>
                    {" · "}{REASON_LABEL[r.reason] || r.reason}
                    {r.assignee_name && <> · {r.assignee_name}</>}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  {r.reason === "overdue" && r.due_at ? (
                    <span className="text-[11px] font-bold text-red-600">
                      due {new Date(r.due_at).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className={`text-[11px] ${r.days_waiting >= 7 ? "font-bold text-red-600" : "text-slate-500"}`}>
                      {r.days_waiting}d waiting
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </Band>
      )}

      {/* ── 2. WAITING ON CLIENT ──────────────────────────────────────────── */}
      {waiting.length > 0 && (
        <Band icon={<Clock className="h-4 w-4" />} tone="#2563eb"
          title="Waiting on the client" subtitle="Their move — chase the old ones" count={waiting.length}>
          <div className="divide-y divide-slate-100">
            {waiting.map((r) => {
              const stale = r.days_waiting >= 7;
              return (
                <Link key={r.id} to={BOARD} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-slate-800">{r.title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      <span className="font-medium text-slate-600">{clientOf(r)}</span>
                      {/* The schedule this wait is now threatening — the reason
                          the line is actionable rather than merely informative. */}
                      {r.target_end_date && (
                        <> · project due {fmtDate(r.target_end_date)}
                          {r.project_overdue === 1 && <strong className="text-red-600"> — already past</strong>}
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`flex-shrink-0 text-[11px] ${stale ? "font-bold text-red-600" : "text-slate-500"}`}>
                    {r.days_waiting}d
                  </span>
                </Link>
              );
            })}
          </div>
        </Band>
      )}

      {/* ── 3. PEOPLE — load vs capacity ──────────────────────────────────── */}
      {peopleRanked.length > 0 && (
        <Band icon={<Users className="h-4 w-4" />} tone="#0f766e"
          title="Who's loaded" subtitle="Committed hours over the next 7 days against weekly capacity"
          count={peopleRanked.length}>
          <div className="divide-y divide-slate-100">
            {peopleRanked.map((p) => {
              const over = p.ratio != null && p.ratio > 1;
              return (
                <Link key={p.worker_id} to={`${BOARD}?assigned_to=${p.worker_id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-800">{p.display_name}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {p.in_progress} in progress · {p.due_next_7} due in 7 days
                      {p.overdue > 0 && <strong className="text-red-600"> · {p.overdue} overdue</strong>}
                      {p.unsized > 0 && <span className="text-amber-700"> · {p.unsized} unsized</span>}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {p.cap == null ? (
                      <>
                        <div className="text-xs font-bold text-slate-700">{p.committed}h</div>
                        <div className="text-[10px] text-amber-700">capacity not set</div>
                      </>
                    ) : (
                      <>
                        <div className={`text-xs font-bold ${over ? "text-red-600" : "text-slate-700"}`}>
                          {p.committed}h / {p.cap}h
                        </div>
                        <div className={`text-[10px] ${over ? "font-semibold text-red-600" : "text-slate-500"}`}>
                          {over ? `${Math.round((p.ratio || 0) * 100)}% of capacity` : "within capacity"}
                        </div>
                      </>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </Band>
      )}

      {/* ── 4. UNASSIGNED + 5. RELEASES ───────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        {unassigned && unassigned.n > 0 && (
          <Band icon={<Inbox className="h-4 w-4" />} tone="#64748b"
            title="Unassigned" subtitle="Open work nobody owns yet" count={unassigned.n}>
            <Link to={`${BOARD}?assigned_to=unassigned`}
              className="block px-4 py-3 text-xs text-slate-600 hover:bg-slate-50">
              {unassigned.n} item{unassigned.n === 1 ? "" : "s"}
              {unassigned.hours ? <> · {unassigned.hours}h estimated</> : null} — assign or drop
            </Link>
          </Band>
        )}

        {releases.length > 0 && (
          <Band icon={<Rocket className="h-4 w-4" />} tone="#7c3aed"
            title="Releases" subtitle="Open work against target dates" count={releases.length}>
            <div className="divide-y divide-slate-100">
              {releases.map((r) => {
                const late = r.days_left != null && r.days_left < 0;
                const tight = r.days_left != null && r.days_left >= 0 && r.days_left <= 7 && r.open_count > 0;
                return (
                  <Link key={r.release_id} to={`${BOARD}?release_id=${r.release_id}`}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50">
                    <div>
                      <div className="text-xs font-semibold text-slate-800">{r.name}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {r.open_count} open{r.hours_open ? ` · ${r.hours_open}h` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-600">{fmtDate(r.target_date)}</div>
                      {r.days_left != null && (
                        <div className={`text-[10px] ${late ? "font-bold text-red-600" : tight ? "font-semibold text-amber-700" : "text-slate-500"}`}>
                          {late ? `${Math.abs(r.days_left)}d overdue` : `${r.days_left}d left`}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </Band>
        )}
      </div>

      <p className="text-center text-[10px] text-slate-400">
        Founder view · <Link to={BOARD} className="underline hover:text-slate-600">Open the Work board →</Link>
      </p>
    </div>
  );
}

export default ConsultingWorkOverviewPage;

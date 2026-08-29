// WalkthroughPanel — Onboarding V3 Phase 3.
//
// Personalized "do your first X" task list for the active tenant. Backed by
// LUMEN-API /api/v1/walkthrough/tasks (migration 047 — lumen.walkthrough_task).
//
// Design notes:
//   - This is a NEW surface. Per Brandon's 2026-06-19 constraint, F-87 / F-124
//     "Get Started" banners and F-118 SetupHints STAY LIVE on their pages.
//     The walkthrough panel co-exists; do NOT delete the banners.
//   - The panel is a collapsible card. Auto-collapses when 100% of pending
//     tasks are resolved (done OR skipped). User can expand again.
//   - Each task has a "Do it" button (routes to cta_route) and a "Skip"
//     link. Completion happens automatically when the user finishes the
//     real action in the matching product (event hook in LUMEN-API).
//   - The header-level mount auto-dismisses for the rest of the browser
//     session via sessionStorage — that's the "first-time user nudge"
//     vs the dashboard-level mount which is permanent.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, ArrowRight, X } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";

export interface WalkthroughTask {
  task_id: string;
  tenant_id: string;
  user_id: string | null;
  kind: string;
  title: string;
  description: string | null;
  product: "arion" | "spark" | "oliver" | "consulting" | "platform";
  cta_label: string | null;
  cta_route: string | null;
  sort_order: number;
  status: "pending" | "done" | "skipped" | "expired";
  triggered_by: string | null;
  completed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskListResponse {
  data: WalkthroughTask[];
  summary?: {
    pending: number;
    done: number;
    skipped: number;
    expired: number;
    total: number;
    percent_complete: number;
  };
}

interface WalkthroughPanelProps {
  /**
   * "dashboard" — full card, always visible. Auto-collapses when 100% done.
   * "header"    — slim sticky variant for first-time users only. Dismissable
   *               for the rest of the browser session.
   */
  variant?: "dashboard" | "header";
  /**
   * Optional product filter — show only tasks for one product. Useful on
   * the per-product overview pages (ARION / SPARK / OLIVER) so the panel
   * stays focused on the product you're looking at.
   */
  product?: WalkthroughTask["product"];
}

const PRODUCT_ACCENTS: Record<WalkthroughTask["product"], string> = {
  arion: "#22ABA2",
  spark: "#F69132",
  oliver: "#FEC82C",
  consulting: "#1A7DB5",
  platform: "#1A3A4A",
};

const HEADER_DISMISS_KEY = "walkthrough_panel:header_dismissed";

export function WalkthroughPanel({ variant = "dashboard", product }: WalkthroughPanelProps) {
  const { get, post, ready } = useSparkApi();
  const [tasks, setTasks] = useState<WalkthroughTask[] | null>(null);
  const [summary, setSummary] = useState<TaskListResponse["summary"] | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<Record<string, boolean>>({});
  const [headerDismissed, setHeaderDismissed] = useState<boolean>(() => {
    try { return typeof window !== "undefined" && sessionStorage.getItem(HEADER_DISMISS_KEY) === "1"; }
    catch { return false; }
  });

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      const r = await get<TaskListResponse>("/api/v1/walkthrough/tasks?status=pending&include_summary=1");
      // sparkApi returns the full envelope. data + summary are siblings.
      const payload = (r as unknown as TaskListResponse) || { data: [] };
      setTasks(payload.data || []);
      setSummary(payload.summary || null);
      // Auto-collapse the dashboard card when there's nothing left to do.
      if (variant === "dashboard" && (payload.data?.length || 0) === 0) {
        setCollapsed(true);
      }
    } catch (err) {
      // Likely no tasks seeded yet (new tenant pre-onboarding) OR the route
      // hasn't been mounted on this LUMEN-API yet. Either way, fail silent
      // — the panel just doesn't render.
      setError(err instanceof Error ? err.message : "Failed to load tasks");
      setTasks([]);
    }
  }, [ready, get, variant]);

  // ONE auto-fetch per mount, no matter how often `load`'s identity churns.
  // This panel mounts in AppShell (every page), so before the key-based
  // account memo in useAccessToken.ts it re-fetched on every MSAL event —
  // and a session whose tenant key failed auth looped forever (the 3,226
  // /auth/verify 404s of 2026-08-26). The ref is the backstop against any
  // future identity churn; completeTask/skip still call load() directly.
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (!ready || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    load();
  }, [ready, load]);

  const visibleTasks = useMemo(() => {
    const list = (tasks || []).filter((t) => t.status === "pending");
    if (product) return list.filter((t) => t.product === product);
    return list;
  }, [tasks, product]);

  // Hide entirely when there's nothing to show + no error to surface.
  if (variant === "header" && headerDismissed) return null;
  if (!tasks) return null; // initial loading — render nothing rather than a skeleton bar
  if (visibleTasks.length === 0 && variant === "header") return null;
  if (visibleTasks.length === 0 && variant === "dashboard" && (summary?.done || 0) === 0) {
    // Brand-new tenant with no tasks seeded yet — don't render an empty card.
    return null;
  }
  if (error && visibleTasks.length === 0) return null;

  const totalForProgress = (summary?.total ?? visibleTasks.length) || 0;
  const completedForProgress = (summary?.done ?? 0) + (summary?.skipped ?? 0);
  const percent = totalForProgress > 0 ? Math.round((completedForProgress / totalForProgress) * 100) : 0;

  const dismissHeader = () => {
    try { sessionStorage.setItem(HEADER_DISMISS_KEY, "1"); } catch { /* ignore */ }
    setHeaderDismissed(true);
  };

  const completeTask = async (task: WalkthroughTask) => {
    setWorking((w) => ({ ...w, [task.task_id]: true }));
    try {
      await post(`/api/v1/walkthrough/tasks/${task.task_id}/complete`);
      // Optimistically remove from list — the next reload will reconcile.
      setTasks((curr) => (curr || []).map((t) => t.task_id === task.task_id ? { ...t, status: "done" } : t));
      await load();
    } catch {
      // best-effort — leave the row in place
    } finally {
      setWorking((w) => ({ ...w, [task.task_id]: false }));
    }
  };

  const skipTask = async (task: WalkthroughTask) => {
    setWorking((w) => ({ ...w, [task.task_id]: true }));
    try {
      await post(`/api/v1/walkthrough/tasks/${task.task_id}/skip`);
      setTasks((curr) => (curr || []).map((t) => t.task_id === task.task_id ? { ...t, status: "skipped" } : t));
      await load();
    } catch {
      /* best-effort */
    } finally {
      setWorking((w) => ({ ...w, [task.task_id]: false }));
    }
  };

  // ─── Header variant — slim sticky strip ───────────────────────────────────
  if (variant === "header") {
    const next = visibleTasks[0];
    if (!next) return null;
    const accent = PRODUCT_ACCENTS[next.product];
    return (
      <div className="shrink-0 border-b bg-white px-4 py-2">
      <div
        className="flex items-center gap-3 rounded-md border bg-white px-3 py-2 shadow-sm"
        style={{ borderColor: `${accent}55` }}
      >
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full" style={{ background: `${accent}22` }}>
          <Circle className="h-4 w-4" style={{ color: accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-slate-900">{next.title}</div>
          {next.description && (
            <div className="truncate text-[11px] text-slate-600">{next.description}</div>
          )}
        </div>
        {next.cta_route && (
          <Link
            to={next.cta_route}
            onClick={() => completeTask(next)}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-white"
            style={{ background: accent }}
          >
            {next.cta_label || "Do it"} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
        <button
          type="button"
          onClick={dismissHeader}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Dismiss for this session"
          title="Dismiss for this session"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      </div>
    );
  }

  // ─── Dashboard variant — collapsible card ─────────────────────────────────
  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
            <CheckCircle2 className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">Get started</div>
            <div className="text-xs text-slate-600">
              {visibleTasks.length > 0
                ? `${visibleTasks.length} ${visibleTasks.length === 1 ? "task" : "tasks"} to go`
                : "All caught up — great job!"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {totalForProgress > 0 && (
            <div className="hidden items-center gap-2 sm:flex">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-slate-700">
                {completedForProgress}/{totalForProgress}
              </span>
            </div>
          )}
          {collapsed ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
        </div>
      </button>

      {!collapsed && visibleTasks.length > 0 && (
        <ul className="divide-y border-t">
          {visibleTasks.map((task) => {
            const accent = PRODUCT_ACCENTS[task.product];
            const busy = !!working[task.task_id];
            return (
              <li key={task.task_id} className="flex items-start gap-3 px-4 py-3">
                <div
                  className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ background: `${accent}22` }}
                >
                  <Circle className="h-3 w-3" style={{ color: accent }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>
                      {task.product}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{task.title}</span>
                  </div>
                  {task.description && (
                    <p className="mt-0.5 text-xs text-slate-600">{task.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    {task.cta_route ? (
                      <Link
                        to={task.cta_route}
                        onClick={() => completeTask(task)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-white"
                        style={{ background: accent }}
                      >
                        {task.cta_label || "Do it"} <ArrowRight className="h-3 w-3" />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => completeTask(task)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                        style={{ background: accent }}
                      >
                        Mark done
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => skipTask(task)}
                      className="text-[11px] text-slate-500 hover:text-slate-700 hover:underline disabled:opacity-50"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!collapsed && visibleTasks.length === 0 && (
        <div className="border-t px-4 py-6 text-center text-xs text-slate-500">
          No pending tasks. Your dashboard is clear — check out the data!
        </div>
      )}
    </div>
  );
}

export default WalkthroughPanel;

// /app/settings/tours — Settings > Tours hub (built 2026-06-25).
//
// 2-column × 3-row matrix:
//
//   Row     | Guided (auto-advancing spotlight)        | Walkthrough (interactive, you do it)
//   --------|------------------------------------------|----------------------------------------
//   ARION   | arion-guided  → ARION_QUICK_TOUR          | arion-walkthrough  → arion-site
//   OLIVER  | oliver-guided → OLIVER_QUICK_TOUR         | oliver-walkthrough → oliver-customers
//   SPARK   | spark-guided  → SPARK_QUICK_TOUR          | spark-walkthrough  → spark-contacts
//
// Each cell shows: tour title, last-taken date, take count, completed badge.
// Cells render [Launch] (first time) or [Launch] + [Restart] (after first take).
//
// Persistence:
//   - localStorage for legacy compatibility (System A's `tour:completed:${id}`
//     and Settings > Walkthroughs' `iadm.completed_walkthroughs` Set).
//   - Server-side per-tour state via oliver-api /onboarding/tour-state
//     and /onboarding/tour-mark (oliver.user_tour_state, migration 105).
//     This is the source-of-truth for `last_taken_at`.
//
// On Launch:
//   1. Mark "launched" on the server (best-effort, fire-and-forget)
//   2. Open the GuidedTour overlay (System A) or the WalkthroughRunner
//      modal (System B) right here on this page — no URL navigation
//      required. (The task spec mentioned a ?tour=... query-param trigger;
//      we open in-page since both engines already exist in Portal and
//      don't need to be triggered from the destination dashboard.)
//
// SubNav entry: added as a Settings hub tile (SettingsRoutes.tsx
// SETTINGS_TILES) and as an AccountMenu hamburger item.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Play, RotateCcw, CheckCircle2, Clock, Sparkles, MousePointer2 } from "lucide-react";
import {
  ALL_TOURS,
  ARION_QUICK_TOUR,
  OLIVER_QUICK_TOUR,
  SPARK_QUICK_TOUR,
  GuidedTour,
  hasCompletedTour,
  resetTour,
  type TourDef,
} from "../../components/GuidedTour";
import {
  WALKTHROUGHS,
  findWalkthrough,
  type Walkthrough,
} from "../../components/walkthroughs/walkthroughRegistry";
import { WalkthroughRunner } from "../../components/walkthroughs/WalkthroughRunner";
import { useOliverApi } from "../../hooks/useOliverApi";

// ── Product config ────────────────────────────────────────────────────────
// Row order = ARION / OLIVER / SPARK per Brandon's spec. Each row pairs a
// guided tour (System A — TourDef from GuidedTour.tsx) with a flagship
// walkthrough (System B — Walkthrough from walkthroughRegistry.ts).

type ProductKey = "arion" | "oliver" | "spark";

const PRODUCT_META: Record<ProductKey, { label: string; accent: string; tagline: string }> = {
  arion:  { label: "ARION",  accent: "#22ABA2", tagline: "Website, hosting, SEO, business profile" },
  oliver: { label: "OLIVER", accent: "#FEC82C", tagline: "Field service + job lifecycle"           },
  spark:  { label: "SPARK",  accent: "#F69132", tagline: "Marketing + CRM"                         },
};

// Map product → guided TourDef (System A) and flagship walkthrough id
// (System B). The flagship per product is the broadest single explainer in
// walkthroughRegistry.ts — arion-site / oliver-customers / spark-contacts.
const GUIDED_BY_PRODUCT: Record<ProductKey, TourDef> = {
  arion:  ARION_QUICK_TOUR,   // arion_full_v1  (34 steps)
  oliver: OLIVER_QUICK_TOUR,  // oliver_full_v1 (25 steps)
  spark:  SPARK_QUICK_TOUR,   // spark_full_v1  (27 steps)
};

const FLAGSHIP_WALKTHROUGH_ID: Record<ProductKey, string> = {
  arion:  "arion-site",
  oliver: "oliver-customers",
  spark:  "spark-contacts",
};

// tour_key shape that goes to the server. Matches the column variant.
function tourKey(product: ProductKey, variant: "guided" | "walkthrough"): string {
  return `${product}-${variant}`;
}

// ── Server-side state shape ───────────────────────────────────────────────
interface TourStateRow {
  tour_key: string;
  last_taken_at: string | null;
  last_completed_at: string | null;
  take_count: number;
}

interface TourStateResponse {
  data: { items: TourStateRow[] };
}

// Local fallback so the page is still useful if the API hasn't deployed
// yet. localStorage mirrors are kept in sync with server writes so the
// dates survive a refresh either way.
const LOCAL_STATE_KEY = "iadm.tour_state_local";

interface LocalRow { last_taken_at: string | null; last_completed_at: string | null; take_count: number; }

function loadLocalState(): Record<string, LocalRow> {
  try {
    const raw = localStorage.getItem(LOCAL_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LocalRow>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}
function saveLocalState(state: Record<string, LocalRow>) {
  try { localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

// ── Date helpers ──────────────────────────────────────────────────────────
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never taken";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never taken";
  const now = new Date();
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return d.toLocaleDateString(undefined, opts);
}

// ── Walkthrough completion mirror (System B uses its own localStorage set)
// We update it when a walkthrough completes so the existing /app/settings/
// walkthroughs page (which reads `iadm.completed_walkthroughs`) stays in sync.
const WT_STORAGE_KEY = "iadm.completed_walkthroughs";
function addToWalkthroughCompleted(id: string) {
  try {
    const cur = new Set<string>(JSON.parse(localStorage.getItem(WT_STORAGE_KEY) || "[]"));
    cur.add(id);
    localStorage.setItem(WT_STORAGE_KEY, JSON.stringify([...cur]));
  } catch { /* ignore */ }
}

// ── Component ─────────────────────────────────────────────────────────────
export default function SettingsToursPage() {
  const oliverApi = useOliverApi();
  const [serverState, setServerState] = useState<Record<string, TourStateRow>>({});
  const [localState, setLocalState] = useState<Record<string, LocalRow>>(() => loadLocalState());
  const [loadingState, setLoadingState] = useState(true);
  const [stateError, setStateError] = useState<string | null>(null);

  // Active engines — at most one open at a time
  const [activeGuided, setActiveGuided] = useState<{ tour: TourDef; product: ProductKey } | null>(null);
  const [activeWalkthrough, setActiveWalkthrough] = useState<{ wt: Walkthrough; product: ProductKey } | null>(null);

  // Load server state on mount.
  useEffect(() => {
    if (!oliverApi.ready) return;
    let cancelled = false;
    setLoadingState(true);
    oliverApi
      .get<TourStateResponse>("/onboarding/tour-state")
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, TourStateRow> = {};
        for (const row of res?.data?.items || []) {
          map[row.tour_key] = row;
        }
        setServerState(map);
        setStateError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        // The endpoint is new — if it's not deployed yet the page should
        // still work using localStorage only. We surface a subtle hint.
        const msg = String(err?.message || err);
        if (/404|not.?found/i.test(msg)) {
          setStateError("Server tour state unavailable (using local fallback).");
        } else {
          setStateError("Could not load tour history — local state will be used.");
        }
      })
      .finally(() => { if (!cancelled) setLoadingState(false); });
    return () => { cancelled = true; };
  }, [oliverApi]);

  // Persist local mirror whenever it changes.
  useEffect(() => { saveLocalState(localState); }, [localState]);

  // Best-effort server mark + local mirror update.
  const markServer = useCallback(async (key: string, action: "launched" | "completed") => {
    const nowIso = new Date().toISOString();
    setLocalState((prev) => {
      const existing = prev[key] || { last_taken_at: null, last_completed_at: null, take_count: 0 };
      const next: LocalRow = action === "launched"
        ? { ...existing, last_taken_at: nowIso, take_count: existing.take_count + 1 }
        : { ...existing, last_completed_at: nowIso, last_taken_at: existing.last_taken_at || nowIso };
      return { ...prev, [key]: next };
    });
    setServerState((prev) => {
      const existing = prev[key] || { tour_key: key, last_taken_at: null, last_completed_at: null, take_count: 0 };
      const next: TourStateRow = action === "launched"
        ? { ...existing, last_taken_at: nowIso, take_count: existing.take_count + 1 }
        : { ...existing, last_completed_at: nowIso, last_taken_at: existing.last_taken_at || nowIso };
      return { ...prev, [key]: next };
    });
    if (!oliverApi.ready) return;
    try {
      await oliverApi.post<unknown>("/onboarding/tour-mark", { tour_key: key, action });
    } catch (err) {
      // Don't surface — local mirror already updated. We just log so the
      // dev tools show "the server didn't accept this".
      console.warn("[tours] mark failed", key, action, err);
    }
  }, [oliverApi]);

  // ── Launchers ────────────────────────────────────────────────────────────
  const launchGuided = useCallback((product: ProductKey) => {
    const tour = GUIDED_BY_PRODUCT[product];
    const key = tourKey(product, "guided");
    // System A's localStorage flag would otherwise prevent re-running smoothly
    // (it doesn't block a manual launch, but the UI's "completed" badge stays
    // — we reset so the next finish stamps a fresh `tour:completed:` flag).
    if (hasCompletedTour(tour.id)) resetTour(tour.id);
    markServer(key, "launched");
    setActiveGuided({ tour, product });
  }, [markServer]);

  const launchWalkthrough = useCallback((product: ProductKey) => {
    const wt = findWalkthrough(FLAGSHIP_WALKTHROUGH_ID[product]);
    if (!wt) return;
    const key = tourKey(product, "walkthrough");
    markServer(key, "launched");
    setActiveWalkthrough({ wt, product });
  }, [markServer]);

  // ── Engine close handlers ────────────────────────────────────────────────
  const onGuidedClose = useCallback(() => {
    if (!activeGuided) return;
    const key = tourKey(activeGuided.product, "guided");
    // GuidedTour marks `tour:completed:` localStorage on finish (persistOnFinish
    // defaults to true) — we don't distinguish skipped-vs-finished here, but
    // either way the user "saw" the tour. We treat a close as completion only
    // if System A flagged it complete via its own localStorage; otherwise
    // it's a skip and we leave last_completed_at alone.
    if (hasCompletedTour(activeGuided.tour.id)) {
      markServer(key, "completed");
    }
    setActiveGuided(null);
  }, [activeGuided, markServer]);

  const onWalkthroughClose = useCallback(() => {
    setActiveWalkthrough(null);
  }, []);

  const onWalkthroughComplete = useCallback((id: string) => {
    if (!activeWalkthrough) return;
    const key = tourKey(activeWalkthrough.product, "walkthrough");
    addToWalkthroughCompleted(id);
    markServer(key, "completed");
  }, [activeWalkthrough, markServer]);

  // ── Cell state derivation ────────────────────────────────────────────────
  const cellState = useMemo(() => {
    return (key: string) => {
      const s = serverState[key];
      const l = localState[key];
      const last_taken_at = s?.last_taken_at || l?.last_taken_at || null;
      const last_completed_at = s?.last_completed_at || l?.last_completed_at || null;
      const take_count = s?.take_count || l?.take_count || 0;
      return { last_taken_at, last_completed_at, take_count, hasTaken: take_count > 0 || !!last_taken_at };
    };
  }, [serverState, localState]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link
          to="/app/settings"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All settings
        </Link>
      </div>

      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold text-slate-900">Tours &amp; Walkthroughs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Six replayable tours — one Guided and one Walkthrough per product.
          {" "}
          <span className="text-slate-500">
            Guided tours auto-advance and spotlight UI elements; walkthroughs are
            plain-English explainers that send you to the page to do the thing.
          </span>
        </p>
        {stateError && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
            {stateError}
          </div>
        )}
      </section>

      {/* Column headers */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-slate-600" />
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Guided tour</div>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Auto-advancing spotlight overlay that walks every section of the product.
          </div>
        </div>
        <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
          <div className="flex items-center gap-2">
            <MousePointer2 className="h-3.5 w-3.5 text-slate-600" />
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Walkthrough</div>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Interactive explainer modal — read each step, then click through to do it for real.
          </div>
        </div>
      </div>

      {/* Per-product rows */}
      {(["arion", "oliver", "spark"] as ProductKey[]).map((product) => {
        const meta = PRODUCT_META[product];
        const guidedKey = tourKey(product, "guided");
        const walkthroughKey = tourKey(product, "walkthrough");
        const guidedState = cellState(guidedKey);
        const walkthroughState = cellState(walkthroughKey);
        const guidedTour = GUIDED_BY_PRODUCT[product];
        const walkthrough = findWalkthrough(FLAGSHIP_WALKTHROUGH_ID[product]);
        return (
          <section key={product} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: meta.accent }} />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{meta.label}</h2>
              <span className="text-[11px] text-slate-500">— {meta.tagline}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* Guided cell */}
              <TourCell
                title={guidedTour.title}
                subtitle={`${guidedTour.steps.length} steps · ~2–3 min`}
                accent={meta.accent}
                icon={<Sparkles className="h-3.5 w-3.5" />}
                lastTakenAt={guidedState.last_taken_at}
                takeCount={guidedState.take_count}
                completedAt={guidedState.last_completed_at}
                loadingState={loadingState}
                onLaunch={() => launchGuided(product)}
              />
              {/* Walkthrough cell */}
              {walkthrough ? (
                <TourCell
                  title={walkthrough.title}
                  subtitle={`${walkthrough.steps.length} steps · ~${walkthrough.estimatedMinutes} min · ${walkthrough.oneLiner}`}
                  accent={meta.accent}
                  icon={<MousePointer2 className="h-3.5 w-3.5" />}
                  lastTakenAt={walkthroughState.last_taken_at}
                  takeCount={walkthroughState.take_count}
                  completedAt={walkthroughState.last_completed_at}
                  loadingState={loadingState}
                  onLaunch={() => launchWalkthrough(product)}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
                  No flagship walkthrough registered for {meta.label}.
                </div>
              )}
            </div>
          </section>
        );
      })}

      <p className="text-center text-xs text-gray-400">
        Looking for the full list of every walkthrough?{" "}
        <Link to="/app/settings/walkthroughs" className="underline hover:text-gray-600">
          Open all walkthroughs ({WALKTHROUGHS.length})
        </Link>
        {" "}or all tours ({ALL_TOURS.length}) from the "?" menu in the header.
      </p>

      {/* Active engines */}
      {activeGuided && (
        <GuidedTour
          tour={activeGuided.tour}
          open
          onClose={onGuidedClose}
        />
      )}
      <WalkthroughRunner
        open={!!activeWalkthrough}
        walkthrough={activeWalkthrough?.wt || null}
        onClose={onWalkthroughClose}
        onComplete={onWalkthroughComplete}
      />
    </div>
  );
}

// ── Cell component ────────────────────────────────────────────────────────
interface TourCellProps {
  title: string;
  subtitle: string;
  accent: string;
  icon: React.ReactNode;
  lastTakenAt: string | null;
  completedAt: string | null;
  takeCount: number;
  loadingState: boolean;
  onLaunch: () => void;
}

function TourCell({
  title, subtitle, accent, icon, lastTakenAt, completedAt, takeCount, loadingState, onLaunch,
}: TourCellProps) {
  const hasTaken = takeCount > 0 || !!lastTakenAt;
  const isDone = !!completedAt;
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-400 transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded"
              style={{ background: `${accent}22`, color: accent }}
              aria-hidden="true"
            >
              {icon}
            </span>
            <div className="text-sm font-semibold text-slate-900 truncate">{title}</div>
            {isDone && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5">
                <CheckCircle2 className="h-3 w-3" /> Done
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 leading-snug">{subtitle}</div>
          <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {loadingState
              ? "Loading…"
              : hasTaken
                ? `Last taken ${formatDate(lastTakenAt)}${takeCount > 0 ? ` · ${takeCount}×` : ""}`
                : "Never taken"}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-1.5">
        <button
          type="button"
          onClick={onLaunch}
          className="text-xs px-3 py-1.5 rounded-md text-white font-medium flex items-center gap-1 hover:opacity-90"
          style={{ background: accent, color: accent === "#FEC82C" ? "#1A3A4A" : "#fff" }}
        >
          <Play className="h-3 w-3" /> Launch
        </button>
        {hasTaken && (
          <button
            type="button"
            onClick={onLaunch}
            className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:border-slate-500 flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" /> Restart
          </button>
        )}
      </div>
    </div>
  );
}

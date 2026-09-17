// /app/settings/tutorials — Settings > Tutorials. THE one help-and-tutorials page.
//
// ── ONE PAGE, NOT THREE (D-154, 2026-09-17) ──────────────────────────────
// Brandon: "we'll probably need a like tutorials setting somewhere in the
// global settings that they can turn on/off tutorials like our initial
// walkthrough, onboarding if they want to go through onboarding again, or these
// builder tutorials."
//
// There were already TWO pages here and they overlapped: /app/settings/tours
// (this file — six flagship tours, three guided and three walkthroughs, with
// dates) and /app/settings/walkthroughs (the full library, same runner, same
// completed set). The tours page ended in a link to the walkthroughs page,
// which is what two pages for one job always look like. A third page for the
// switches would have made it three.
//
// So this page absorbed the library and WalkthroughsPage.tsx was DELETED. Both
// old URLs redirect here (App.tsx), the settings tile and the account menu say
// "Tutorials", and there is one place a person goes to learn something or to
// stop being taught.
//
// Three sections, in the order somebody actually needs them:
//   1. The switches      welcome walk-through, builder tips, run onboarding again
//   2. Guided tours      the 2 x 3 matrix, with last-taken dates
//   3. Every walkthrough the full library, grouped by product
//
// ── THE 2 x 3 MATRIX (built 2026-06-25, unchanged) ───────────────────────
//   Row     | Guided (auto-advancing spotlight)        | Walkthrough (interactive, you do it)
//   --------|------------------------------------------|----------------------------------------
//   ARION   | arion-guided  -> ARION_QUICK_TOUR         | arion-walkthrough  -> arion-site
//   OLIVER  | oliver-guided -> OLIVER_QUICK_TOUR        | oliver-walkthrough -> oliver-customers
//   SPARK   | spark-guided  -> SPARK_QUICK_TOUR         | spark-walkthrough  -> spark-contacts
//
// Persistence:
//   - The two SWITCHES are per-person and server-side: core.user_preference via
//     platform-api /me/preferences (usePreference). Not localStorage — see
//     lib/userPreferences.ts for why that was the wrong home.
//   - Per-tour dates stay where they were: oliver-api /onboarding/tour-state
//     and /onboarding/tour-mark (oliver.user_tour_state, migration 105), with a
//     localStorage mirror so the page still works if that API is cold.
//
// Access: account-level. Every signed-in member of the business gets here —
// this is not gated on owning a product (reference_account_settings_not_product_gated).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Play, RotateCcw, CheckCircle2, Clock, Sparkles, MousePointer2, GraduationCap } from "lucide-react";
import {
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
  walkthroughsByProduct,
  type Walkthrough,
} from "../../components/walkthroughs/walkthroughRegistry";
import { WalkthroughRunner } from "../../components/walkthroughs/WalkthroughRunner";
import { OnboardingWizardModal } from "../../components/consulting/OnboardingWizardModal";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useAppState } from "../../app/AppState";
import { usePreference } from "../../prefs/preferencesContext";

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

// ── Which walkthroughs this person has finished ───────────────────────────
// ONE reader and ONE writer for the set, shared by the matrix and the library
// below — the two pages this replaced each had their own copy of it.
const WT_STORAGE_KEY = "iadm.completed_walkthroughs";
function loadCompleted(): Set<string> {
  try { return new Set<string>(JSON.parse(localStorage.getItem(WT_STORAGE_KEY) || "[]")); }
  catch { return new Set<string>(); }
}
function saveCompleted(s: Set<string>) {
  try { localStorage.setItem(WT_STORAGE_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

const LIBRARY_PRODUCTS = ["arion", "spark", "oliver", "consulting", "platform"] as const;
const LIBRARY_TITLES: Record<string, string> = {
  arion: "ARION", spark: "SPARK", oliver: "OLIVER", consulting: "Consulting", platform: "Platform",
};
const LIBRARY_ACCENTS: Record<string, string> = {
  arion: "#22ABA2", spark: "#F69132", oliver: "#FEC82C", consulting: "#1A7DB5", platform: "#1A3A4A",
};

// ── Component ─────────────────────────────────────────────────────────────
export default function SettingsTutorialsPage() {
  const oliverApi = useOliverApi();
  const { active } = useAppState();
  const activeTenantId = active?.tenant?.tenantId ?? null;

  const [serverState, setServerState] = useState<Record<string, TourStateRow>>({});
  const [localState, setLocalState] = useState<Record<string, LocalRow>>(() => loadLocalState());
  const [loadingState, setLoadingState] = useState(true);
  const [stateError, setStateError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(() => loadCompleted());

  // Active engines — at most one open at a time
  const [activeGuided, setActiveGuided] = useState<{ tour: TourDef; product: ProductKey } | null>(null);
  const [activeWalkthrough, setActiveWalkthrough] = useState<{ wt: Walkthrough; product: ProductKey | null } | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

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
          setStateError("We could not read when you last took these (using this browser's record instead).");
        } else {
          setStateError("We could not read your tour history — this browser's record is being used.");
        }
      })
      .finally(() => { if (!cancelled) setLoadingState(false); });
    return () => { cancelled = true; };
  }, [oliverApi]);

  // Persist local mirrors whenever they change.
  useEffect(() => { saveLocalState(localState); }, [localState]);
  useEffect(() => { saveCompleted(completed); }, [completed]);

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
      console.warn("[tutorials] mark failed", key, action, err);
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

  /** Anything from the full library — no per-product tour key to stamp. */
  const runFromLibrary = useCallback((wt: Walkthrough) => {
    setActiveWalkthrough({ wt, product: null });
  }, []);

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
    setCompleted((prev) => new Set([...prev, id]));
    if (activeWalkthrough?.product) {
      markServer(tourKey(activeWalkthrough.product, "walkthrough"), "completed");
    }
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

  const libraryGroups = useMemo(() => {
    const groups: Array<{ product: string; items: Walkthrough[] }> = [];
    for (const p of LIBRARY_PRODUCTS) {
      const items = walkthroughsByProduct(p);
      if (items.length) groups.push({ product: p, items });
    }
    return groups;
  }, []);

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
        <h1 className="text-2xl font-semibold text-slate-900">Tutorials</h1>
        <p className="mt-1 text-sm text-slate-600">
          Turn the built-in help on or off, and replay anything you want to see again.
          These settings are yours — they follow you to any computer you sign in on,
          and nobody else in your business is affected.
        </p>
        {stateError && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
            {stateError}
          </div>
        )}
      </section>

      <TutorialSettings
        activeTenantId={activeTenantId}
        onRunOnboarding={() => setOnboardingOpen(true)}
      />

      {/* ── 2. Guided tours and walkthroughs ──────────────────────────── */}
      <div className="space-y-3">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Take a tour
        </h2>

        {/* Column headers */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-slate-600" />
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Guided tour</div>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              It drives: each part of the product is highlighted in turn while you watch.
            </div>
          </div>
          <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <MousePointer2 className="h-3.5 w-3.5 text-slate-600" />
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Walkthrough</div>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              You drive: read a step, then click through and do it for real.
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
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{meta.label}</h3>
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
      </div>

      {/* ── 3. Every walkthrough ───────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Every walkthrough
          </h2>
          <span className="text-[11px] text-slate-500">
            {completed.size} of {WALKTHROUGHS.length} done
          </span>
        </div>
        <p className="px-1 text-xs text-slate-600">
          Short, plain-English explainers for every major feature. Run them any time — each one
          links straight to the page where you do the thing.
        </p>

        {libraryGroups.map((g) => (
          <section key={g.product} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <div className="h-3 w-3 rounded-full" style={{ background: LIBRARY_ACCENTS[g.product] }} />
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{LIBRARY_TITLES[g.product]}</h3>
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
                      type="button"
                      onClick={() => runFromLibrary(w)}
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
      </div>

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
      {activeTenantId && (
        <OnboardingWizardModal
          open={onboardingOpen}
          tenantId={activeTenantId}
          tenantName={active?.tenant?.tenantName || undefined}
          mode="onboarding"
          startAtFirstStep
          onClose={() => setOnboardingOpen(false)}
          onFinished={() => setOnboardingOpen(false)}
        />
      )}
    </div>
  );
}

// ── The switches ──────────────────────────────────────────────────────────
/**
 * The three things Brandon named, in his order: the walk-through that runs on
 * first sign-in, the builder tips, and a way back into setup.
 *
 * Each switch writes straight through to core.user_preference. There is no Save
 * button on purpose — a switch that needs saving is a switch people leave in
 * the wrong position.
 */
function TutorialSettings({
  activeTenantId,
  onRunOnboarding,
}: {
  activeTenantId: string | null;
  onRunOnboarding: () => void;
}) {
  return (
    <section className="rounded-lg border bg-white p-5 space-y-4">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-slate-600" />
        <h2 className="text-sm font-semibold text-slate-900">What you are shown</h2>
      </div>

      <TutorialSwitch
        prefKey="tutorials.welcomeWalkthrough"
        label="Welcome walk-through"
        help="The tour that plays by itself once you finish setup. Turn it off and nothing starts on its own — you can still run any of them from this page."
      />

      <TutorialSwitch
        prefKey="tutorials.builderTips"
        label="Builder tips"
        help="The short welcome box that opens when you start building a page, an email or a proposal."
      />

      <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
        <div>
          <div className="text-sm font-medium text-gray-900">Run onboarding again</div>
          <div className="mt-1 text-xs text-gray-500">
            Walks you back through your setup from the first question. Everything you have already
            entered is filled in for you — nothing is cleared.
          </div>
        </div>
        <button
          type="button"
          onClick={onRunOnboarding}
          disabled={!activeTenantId}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Run onboarding again
        </button>
      </div>
    </section>
  );
}

/** One switch, wired to one preference. Same shape as the switch on /app/account. */
function TutorialSwitch({
  prefKey,
  label,
  help,
}: {
  prefKey: "tutorials.welcomeWalkthrough" | "tutorials.builderTips";
  label: string;
  help: string;
}) {
  const { value, set, available, error } = usePreference(prefKey);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggle = async () => {
    setBusy(true);
    setSaveError(null);
    try {
      await set(!value);
    } catch (e) {
      // NAMED, never a switch that springs back with no explanation.
      setSaveError((e as Error).message || "That did not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <div className="mt-1 text-xs text-gray-500">{help}</div>
        {(saveError || error) && (
          <div className="mt-1 text-xs text-red-600">{saveError || error}</div>
        )}
        {!available && !saveError && (
          <div className="mt-1 text-xs text-amber-700">
            This cannot be saved yet on this environment.
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        data-pref={prefKey}
        disabled={busy}
        onClick={() => void toggle()}
        /* Same switch as /app/account: 24px tall because that is what a switch
           looks like, with a 40px tap target from the ::after. */
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 after:absolute after:-top-2 after:-bottom-2 after:left-0 after:right-0 after:content-[''] ${
          value ? "bg-black" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
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

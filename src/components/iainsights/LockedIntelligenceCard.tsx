// LockedIntelligenceCard / CollectingIntelligenceCard — reusable
// Intelligence-shelf cards that implement the locked + collecting states
// per scope §8.4 (overnight-report doc 64).
//
// Locked   — the plan answer refuses the report's catalog key. Shows the
//            report title, description, "Requires <needs>" badge (the
//            catalog's words, e.g. "SPARK Pro"), the
//            reason it's locked, and a CTA to the pricing page. The
//            report calculator does NOT run — the gauge displays a
//            permanent grey dash. This is the post-rework Standard-tier
//            state for any Pro/Business report (vs. the prior pattern of
//            hiding the card entirely).
//
// Collecting — tenant's tier IS sufficient but the data floor isn't met.
//            Shows the same report title + description, the data floor
//            ("needs 60 days of campaigns"), and a forecasted ready-by
//            date if the caller supplies one. This is the post-rework
//            Pro/Business-tier-with-thin-data state — explicitly NOT the
//            locked state, because the tenant has access and only time
//            stands between them and the score.
//
// Both share the same visual chrome as the existing per-platform cards so
// dropping them in alongside the Live/Partial cards reads as one grid
// rather than two visual languages. 2026-10-11 (feature catalog): the card
// states no tier; the caller passes the catalog's `needs` for the report's key.

import { Lock, Clock, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

interface CommonProps {
  /** Display name of the report ("Churn Risk Model"). */
  name: string;
  /** One-sentence description shown under the title. */
  description: string;
  /** Optional icon — defaults to Lock for locked, Clock for collecting. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Optional click target for the whole card (e.g. opens the detail modal). */
  onOpen?: () => void;
}

interface LockedProps extends CommonProps {
  /** What to buy to unlock this report, in the catalog's words (useFeatureGate().needs(key)). */
  needs: string;
  /** Free-text reason ("Uses advanced time-series modelling"). */
  lockReason: string;
  /** Pricing-page deep link — defaults to /pricing. */
  ctaTarget?: string;
  /** Override the default CTA label. */
  ctaLabel?: string;
}

interface CollectingProps extends CommonProps {
  /**
   * Human-readable ETA string ("Ready by Jul 14, 2026" or
   * "ready in ~30 days"). Caller computes from data-floor + first-event
   * date. Optional — if absent, the card shows just "Collecting data".
   */
  eta?: string;
  /**
   * Optional data-floor description shown above the ETA, e.g.
   * "Needs 60 days of campaign history".
   */
  dataFloor?: string;
}

/**
 * The view of an Intelligence report card when the plan does not include it.
 * Renders the report shell with a "Requires <needs>" badge + CTA.
 */
export function LockedIntelligenceCard({
  name, description, icon: Icon = Lock, needs, lockReason, ctaTarget = "/pricing", ctaLabel, onOpen,
}: LockedProps) {
  const needsLabel = String(needs || "").trim() || "a higher plan";
  const label = ctaLabel || `Upgrade to ${needsLabel}`;
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-lg border-2 border-slate-200 bg-slate-50 p-4 transition-shadow hover:shadow-md w-full"
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-slate-200 text-slate-400">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm text-slate-900">{name}</span>
            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
              Not in your plan
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-slate-300">—</span>
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-500">
            <Lock className="h-3 w-3" />
            Requires {needsLabel}
          </span>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-400" />
      </div>

      <p className="text-xs text-slate-700 leading-snug line-clamp-2">{lockReason}</p>

      <Link
        to={ctaTarget}
        onClick={(e) => e.stopPropagation()}
        className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-violet-700 hover:underline"
      >
        {label} <ArrowRight className="h-3 w-3" />
      </Link>
    </button>
  );
}

/**
 * "Collecting data" state — tier sufficient, data floor not yet met.
 * NOT the same as locked: this card is on its way to going live, the
 * tenant isn't being upsold.
 */
export function CollectingIntelligenceCard({
  name, description, icon: Icon = Clock, eta, dataFloor, onOpen,
}: CollectingProps) {
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-lg border-2 border-slate-200 bg-slate-50 p-4 transition-shadow hover:shadow-md w-full"
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-slate-100 text-slate-500">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm text-slate-900">{name}</span>
            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
              Collecting
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-slate-300">—</span>
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
            <Clock className="h-3 w-3" />
            Collecting data
          </span>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-400" />
      </div>

      {dataFloor && (
        <p className="text-xs text-slate-700 leading-snug line-clamp-2">{dataFloor}</p>
      )}
      {eta && (
        <div className="mt-2 text-[10px] text-slate-500 italic">{eta.startsWith("Ready") ? eta : `Ready by ${eta}`}</div>
      )}
    </button>
  );
}

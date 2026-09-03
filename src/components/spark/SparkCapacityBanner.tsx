// SparkCapacityBanner — ONE banner for every SPARK allowance the client can
// run out of: email sends, contacts, and the Lead Inbox.
//
// LOCKED 2026-09-04 (LEADGEN_POST_CAPTURE_SCOPE §9 "Banners";
// SPARK_LEADS_ADDON_DEFINITION "Banners everywhere"):
//   60% yellow · 75% orange · 90%+ red.
// Below 60% it renders nothing — a bar that is always on screen stops being a
// warning. The thresholds live in ONE place per side: services/leadgen/
// inboxCapacity.bandFor on the server, BAND_AT here.
//
// Every consumer passes the same three things: how much is used, the cap, and
// what the client can DO about it. A banner that says "you're nearly full" and
// nothing else just makes people anxious.

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Info } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";

export type CapacityBand = "warning" | "high" | "critical";

/** The locked thresholds. Shared with the server's bandFor(). */
const BAND_AT: Array<{ at: number; band: CapacityBand }> = [
  { at: 90, band: "critical" },
  { at: 75, band: "high" },
  { at: 60, band: "warning" },
];

export function bandFor(pct: number): CapacityBand | null {
  for (const b of BAND_AT) if (pct >= b.at) return b.band;
  return null;
}

const STYLE: Record<CapacityBand, { wrap: string; icon: string; strong: string }> = {
  // yellow → orange → red, in that order, so the colour alone tells you how bad it is.
  warning:  { wrap: "border-amber-200 bg-amber-50 text-amber-900",   icon: "text-amber-600",  strong: "text-amber-950" },
  high:     { wrap: "border-orange-300 bg-orange-50 text-orange-900", icon: "text-orange-600", strong: "text-orange-950" },
  critical: { wrap: "border-rose-300 bg-rose-50 text-rose-900",       icon: "text-rose-600",   strong: "text-rose-950" },
};

export interface SparkCapacityBannerProps {
  /** What is filling up, in the client's words: "Lead Inbox", "Contacts", "Emails this month". */
  label: string;
  used: number;
  /** null = no limit (a SPARK Leads package, an enterprise contract) → nothing renders. */
  cap: number | null;
  /** True when the allowance genuinely has no ceiling. */
  unlimited?: boolean;
  /** The one thing the client can do about it — a button or a link. */
  action?: ReactNode;
  /**
   * Extra sentence for the full state, e.g. the Lead Inbox's "an inquiry from
   * your own website still comes through" (C7).
   */
  fullNote?: ReactNode;
  /** Force the banner on even below 60% — used when the thing is already full. */
  alwaysShow?: boolean;
  className?: string;
}

export function SparkCapacityBanner({
  label, used, cap, unlimited = false, action, fullNote, alwaysShow = false, className = "",
}: SparkCapacityBannerProps) {
  if (unlimited || cap == null || !Number.isFinite(cap) || cap <= 0) return null;

  const pct = Math.min(100, Math.round((used / cap) * 100));
  const band = bandFor(pct);
  if (!band && !alwaysShow) return null;

  const s = STYLE[band ?? "warning"];
  const remaining = Math.max(0, cap - used);
  const full = remaining <= 0;
  const Icon = full ? AlertTriangle : Info;

  return (
    <div className={`rounded-xl border px-4 py-3 ${s.wrap} ${className}`} role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${s.icon}`} aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm">
              {full ? (
                <>
                  <strong className={s.strong}>{label} is full</strong>
                  {" — "}
                  {used.toLocaleString()} of {cap.toLocaleString()}.
                </>
              ) : (
                <>
                  <strong className={s.strong}>{label} is {pct}% full</strong>
                  {" — "}
                  {used.toLocaleString()} of {cap.toLocaleString()}, {remaining.toLocaleString()} left.
                </>
              )}
            </div>
            {full && fullNote && <div className="mt-1 text-xs opacity-90">{fullNote}</div>}
          </div>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>

      <div className="mt-2.5 h-1.5 w-full rounded-full bg-white/70 overflow-hidden">
        <div
          className={`h-full transition-all ${
            band === "critical" ? "bg-rose-500" : band === "high" ? "bg-orange-500" : "bg-amber-400"
          }`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The two plan allowances that already live on /api/v1/usage: contacts and the
// monthly email send. Same banner, same thresholds — the Lead Inbox feeds its
// own numbers because they come with the inbox list.
// ─────────────────────────────────────────────────────────────────────────────

interface UsageResponse {
  data: {
    usage: { emails_sent: number; contacts_count: number };
    limits: { emails_per_month: number; contacts_max: number };
  };
}

export function SparkUsageCapacityBanner({ metric, className }: { metric: "contacts" | "emails"; className?: string }) {
  const { get, ready } = useSparkApi();
  const [usage, setUsage] = useState<UsageResponse["data"] | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await get<UsageResponse>("/api/v1/usage");
        if (!cancelled) setUsage(r?.data ?? null);
      } catch {
        // No banner is better than a broken page — the Plans + Usage page still
        // shows the full picture.
        if (!cancelled) setUsage(null);
      }
    })();
    return () => { cancelled = true; };
  }, [get, ready]);

  if (!usage) return null;
  const isContacts = metric === "contacts";
  const cap = isContacts ? usage.limits.contacts_max : usage.limits.emails_per_month;
  // Enterprise contracts come back as a bespoke (effectively unlimited) number.
  const unlimited = !Number.isFinite(cap) || cap > 1_000_000_000;

  return (
    <SparkCapacityBanner
      className={className}
      label={isContacts ? "Your contact plan" : "Your email sends this month"}
      used={isContacts ? usage.usage.contacts_count : usage.usage.emails_sent}
      cap={cap}
      unlimited={unlimited}
      action={
        <Link
          to="/app/services/spark_usage"
          className="rounded-lg border border-current/30 bg-white/80 px-3 py-1.5 text-xs font-semibold hover:bg-white"
        >
          See your plan
        </Link>
      }
    />
  );
}

export default SparkCapacityBanner;

import { useEffect, useState } from "react";
import { Users, Megaphone, Globe as GlobeIcon, Zap as ZapIcon } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useLumenApi } from "../../hooks/useLumenApi";
import { useMsal } from "@azure/msal-react";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { findWalkthrough, Walkthrough } from "../../components/walkthroughs/walkthroughRegistry";
import { WalkthroughRunner } from "../../components/walkthroughs/WalkthroughRunner";
// SparkSetupCard removed 2026-06-17 — single onboarding nag lives on
// Command Center (UnifiedSetupCard). Don't add it back here.
// Dashboard widgets (hero stats, charts, funnels, ARGUS box, quick
// actions, recent contacts, engagement signals, IA Insights glance, tier
// usage card) were stripped 2026-06-22 — per Brandon's direction, SPARK
// dashboard widgets aren't useful here. Usage moved to the header chip
// (renders on every Spark*Page via SparkPageShell) and links to the Plans
// + Usage page for the full per-metric detail. Each dashboard concept
// has its own dedicated page already — keeping a parallel "summary"
// layer on Overview was duplication, not value.
import { SetupHints } from "../../components/SetupHints";
import { EngagementAlertCallout } from "../../components/insights/EngagementAlertCallout";

// ─ Types ──────────────────────────────────────────────────────────────────────
interface UsageResponse {
  data: {
    tier: string;
    usage: { emails_sent: number; sms_sent: number; contacts_count: number; leads_issued: number };
    limits: { emails_per_month: number; sms_per_month: number; contacts_max: number };
  };
}
interface GrowthVelocity {
  // Only `active_automations` is consumed now — the rest were used by
  // deleted widgets. Keep the field for the welcome-automation hint.
  active_automations: number;
}

// G4-S8: treat completed OR skipped as "user has been through it" so we
// don't re-fire the umbrella walkthrough on every subsequent visit.
function isSparkBasicsCompleted(status: string | undefined | null): boolean {
  return status === "completed" || status === "skipped";
}

interface WalkthroughProgressRow {
  walkthrough_id?: string;
  status?: string;
}
interface WalkthroughProgressResponse {
  // GET /walkthrough-progress returns { rows: [...] } — NOT a { data } envelope.
  // lumenFetch only auto-unwraps { data }, so the raw { rows } object arrives here.
  rows?: WalkthroughProgressRow[];
}

export function SparkOverviewPage() {
  const { get, ready } = useSparkApi();
  const { get: lumenGet, put: lumenPut, ready: lumenReady } = useLumenApi();
  const { accounts } = useMsal();
  // Per-USER identity (not tenant) for once-only walkthrough gating.
  const walkthroughUserId = accounts[0]?.localAccountId || accounts[0]?.homeAccountId || "anon";
  const walkthroughSeenKey = `iadm.walkthrough.spark-basics.seen.${walkthroughUserId}`;
  // A founder/consultant viewing a client's portal is NOT the client user —
  // never fire the onboarding walkthrough in view-as / consultant-workspace mode.
  const inConsultantWorkspace = (() => {
    try { return sessionStorage.getItem("iadm.portal.consultantWorkspace.v1") === "true"; }
    catch { return false; }
  })();
  const [activeWalkthrough, setActiveWalkthrough] = useState<Walkthrough | null>(null);
  const [usage, setUsage] = useState<UsageResponse["data"] | null>(null);
  const [activeAutomations, setActiveAutomations] = useState<number | null>(null);
  // FIX B3 (2026-06-22) — Real signal for the "verify sender domain" hint.
  // Was hardcoded `show: true` which nagged tenants who had already added
  // and verified a domain. We now count rows from /api/v1/sender-domains
  // and hide the hint when there's at least one configured. `null` while
  // loading so the hint doesn't flicker visible-then-hidden.
  const [senderDomainCount, setSenderDomainCount] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      // best-effort: any endpoint failure degrades gracefully (hint hides)
      const safe = async <T,>(p: Promise<T>): Promise<T | null> => {
        try { return await p; } catch { return null; }
      };
      const [u, g, sd] = await Promise.all([
        safe(get<UsageResponse>("/api/v1/usage")),
        // active_automations comes from growth-velocity — drives the
        // welcome-automation SetupHint.
        safe(get<{ data: GrowthVelocity }>(`/api/v1/insights/growth-velocity?days=30`)),
        // FIX B3 (2026-06-22) — drive the "verify sender domain" SetupHint
        // off the live sender-domains count instead of a hardcoded `true`.
        safe(get<{ data: Array<{ id: number }> }>("/api/v1/sender-domains")),
      ]);
      if (!cancelled) {
        setUsage(u?.data || null);
        setActiveAutomations(g?.data?.active_automations ?? null);
        // FIX B3 — count of configured sender domains. `null` if the
        // request failed so the hint stays hidden (don't nag on errors).
        setSenderDomainCount(sd?.data ? sd.data.length : null);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  // G4-S8: auto-fire spark-basics walkthrough on first visit. Gates on lumen.walkthrough_progress (migration 110). If backend not deployed yet, the fetch 404s and the walkthrough auto-fires — which is the desired first-run behavior anyway.
  useEffect(() => {
    if (!lumenReady) return;
    // (1) Never onboard a founder/consultant working inside a client's portal —
    // they are not the client user. Fixes "fires every time I open a client's SPARK".
    if (inConsultantWorkspace) return;
    // (2) Per-USER once-only gate. Reads the logged-in USER (not the tenant): if
    // this user has already been shown spark-basics, never re-fire. This is the
    // durable gate — the backend lumen.walkthrough_progress is per-tenant and is
    // NOT persisting in prod (0 rows), so the per-user marker is what actually
    // stops the every-login loop.
    try { if (localStorage.getItem(walkthroughSeenKey) === "1") return; } catch { /* ignore */ }
    let cancelled = false;
    (async () => {
      try {
        let row: WalkthroughProgressRow | null = null;
        try {
          const r = await lumenGet<WalkthroughProgressResponse>(
            "/walkthrough-progress?walkthrough_id=spark-basics"
          );
          row = (r?.rows?.[0] ?? null) as WalkthroughProgressRow | null;
        } catch {
          // 404 / not-yet-deployed / transient — fall through to auto-fire.
          row = null;
        }
        if (cancelled) return;
        if (!row || !isSparkBasicsCompleted(row.status)) {
          const w = findWalkthrough("spark-basics");
          if (w) {
            // Mark seen for THIS user so it shows at most once (first login).
            try { localStorage.setItem(walkthroughSeenKey, "1"); } catch { /* ignore */ }
            setActiveWalkthrough(w);
          }
        }
      } catch {
        // Never break the page render if the gate fails.
      }
    })();
    return () => { cancelled = true; };
  }, [lumenGet, lumenReady, inConsultantWorkspace, walkthroughSeenKey]);

  // Persist the walkthrough outcome so it doesn't re-fire on every visit.
  // Root cause of the loop: onComplete/onClose only closed the modal locally
  // and never wrote lumen.walkthrough_progress, so the GET gate always saw
  // "no row" and re-fired spark-basics every login. Best-effort PUT.
  async function persistWalkthrough(id: string, status: "completed" | "skipped") {
    try {
      await lumenPut("/walkthrough-progress", { walkthrough_id: id, status });
    } catch {
      // never block closing the modal on a persistence hiccup
    }
  }

  return (
    <SparkPageShell
      title="SPARK Overview"
      subtitle="Your marketing + sales command center"
      error={error}
      loading={loading}
    >
      <div className="p-6 space-y-6">
        {/* Engagement alerts call-out (2026-07-26) — the platform's open
            alerts lead the dashboard, not just the home Alerts tab. */}
        <EngagementAlertCallout platform="spark" />
        {/* Onboarding nag lives on Command Center only (UnifiedSetupCard). */}

        {/* F-118 — lightweight, dismissable setup hints. This is the ONLY
            content on Overview now — when every hint is dismissed/satisfied
            the page renders as the SparkPageShell chrome with no body, which
            is by design (per Brandon, dashboard widgets aren't needed). */}
        <SetupHints hints={[
          {
            id: "spark_no_contacts",
            icon: Users,
            title: "Import your first contacts",
            body: "Upload a CSV or add contacts manually so campaigns + automations have someone to talk to.",
            cta: { label: "Import contacts", to: "/app/services/spark_contact_import" },
            show: !!usage && usage.usage.contacts_count === 0,
            accent: "#EF6C33",
          },
          {
            id: "spark_no_campaign",
            icon: Megaphone,
            title: "Send a starter campaign",
            body: "Pick a template, choose a list, and you're live — most teams send the first one in under 10 minutes.",
            cta: { label: "Open campaigns", to: "/app/services/spark_campaigns" },
            show: !!usage && usage.usage.emails_sent === 0,
            accent: "#EF6C33",
          },
          {
            id: "spark_sender_domain",
            icon: GlobeIcon,
            title: "Verify your sender domain",
            body: "Deliverability climbs significantly when you send from your own domain instead of the shared sender.",
            cta: { label: "Sender domains", to: "/app/services/spark_sender_domains" },
            // FIX B3 (2026-06-22) — was hardcoded `show: true`. Real count
            // from /api/v1/sender-domains drives this now. `null` =
            // still loading or the request failed; hide in both cases so
            // we don't nag tenants who already verified a domain.
            show: senderDomainCount === 0,
            accent: "#7C3AED",
          },
          {
            id: "spark_automations",
            icon: ZapIcon,
            title: "Set up a welcome automation",
            body: "Send a welcome email the moment someone signs up — set it once, it runs forever.",
            cta: { label: "Open automations", to: "/app/services/spark_automations" },
            // FIX B3 (2026-06-22) — was hardcoded `show: true`. growth
            // velocity already returns active_automations as part of
            // /api/v1/insights/growth-velocity (see GrowthVelocity type)
            // — reuse it instead of a second fetch. Hide while loading
            // (activeAutomations still null) so the hint doesn't flicker
            // visible.
            show: activeAutomations === 0,
            accent: "#16A34A",
          },
        ]} />
      </div>
      {/* G4-S8: umbrella spark-basics walkthrough auto-fires on first visit (see useEffect above). */}
      <WalkthroughRunner
        open={!!activeWalkthrough}
        walkthrough={activeWalkthrough}
        onClose={() => {
          const id = activeWalkthrough?.id;
          setActiveWalkthrough(null);
          if (id) void persistWalkthrough(id, "skipped");
        }}
        onComplete={() => {
          const id = activeWalkthrough?.id;
          setActiveWalkthrough(null);
          if (id) void persistWalkthrough(id, "completed");
        }}
      />
    </SparkPageShell>
  );
}

export default SparkOverviewPage;

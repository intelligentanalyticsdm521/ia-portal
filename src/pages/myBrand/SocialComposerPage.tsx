// SocialComposerPage — My Brand > Composer (wave 2).
//
// Compose-once-publish-everywhere editor that drops a post onto the four
// connected platforms in one click. Power features:
//
//   - Destination picker: checkboxes for each connected platform; greyed
//     out + "Connect first →" link for un-connected ones.
//   - Body composer: shared textarea by default + "Customize per platform"
//     toggle that reveals four tabbed mini-editors with platform-specific
//     char counters (FB 63206 / IG 2200 / X 280 / LI 3000).
//   - Brand voice check chip: debounced POST /voice/score every 2s; green/
//     yellow/red dot with the score.
//   - Asset attachments: pick from the Asset Library (GET /my-brand/assets
//     modal) or upload locally; up to 10 (capped to 4 if X is a destination).
//   - URL preview: first URL in body autodetected; og:image + og:title
//     fetched via the same lumen-api proxy used by Newsletter Studio.
//   - Schedule controls: Publish now / Schedule for later with tenant
//     timezone display.
//   - Right-rail live preview cards per destination (mini FB/IG/X/LI tile).
//   - Submit / Schedule / Submit-for-approval action depending on tenant
//     approval-mode setting.
//
// URL params:
//   ?destination=facebook,instagram   — pre-checks destinations
//   ?asset_ids=<a>,<b>                — pre-attaches assets
//
// Backend:
//   - POST /api/v1/my-brand/social/posts  (compose post)        ← LUMEN-API
//   - POST /api/v1/my-brand/voice/score   (brand-voice check)   ← LUMEN-API
//   - GET  /social-oauth/connections      (destination state)   ← platform-api
//   - GET  /api/v1/my-brand/assets        (asset picker)        ← LUMEN-API
//
// HEADS UP: As of wave-2, LUMEN-API does NOT yet implement
// /api/v1/my-brand/social/posts (only the legacy /social-posts route
// against lumen.social_post exists). The composer POSTs to the new
// my-brand path and surfaces a friendly error if it 404s — wave-3 closes
// the gap on the backend.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Image as ImageIcon, Upload, X as XIcon,
  Clock, CheckCircle2, AlertTriangle, Sparkles, ExternalLink, Loader2,
} from "lucide-react";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import { useLumenApi } from "../../hooks/useLumenApi";
import { emergencyActAsHeaders } from "../../lib/emergencyActAs";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { MyBrandUpgradeGate } from "../../components/MyBrandUpgradeGate";
import { useMyBrandTier } from "../../hooks/useMyBrandTier";

type Platform = "facebook" | "instagram" | "x" | "linkedin";

interface PlatformDef {
  key: Platform;
  name: string;
  brand: string;      // brand color for pills + previews
  initials: string;   // 1-2 char glyph fallback (lucide v1.8 has no brand icons)
  maxChars: number;
  voiceSurface: string;
}

const PLATFORMS: PlatformDef[] = [
  { key: "facebook",  name: "Facebook",  brand: "#1877F2", initials: "f",  maxChars: 63206, voiceSurface: "social_post_facebook"  },
  { key: "instagram", name: "Instagram", brand: "#E4405F", initials: "IG", maxChars: 2200,  voiceSurface: "social_post_instagram" },
  { key: "x",         name: "X",         brand: "#0F1419", initials: "X",  maxChars: 280,   voiceSurface: "social_post_x"         },
  { key: "linkedin",  name: "LinkedIn",  brand: "#0A66C2", initials: "in", maxChars: 3000,  voiceSurface: "social_post_linkedin"  },
];

function PlatformGlyph({ def, size = 16 }: { def: PlatformDef; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded font-bold text-white"
      style={{ background: def.brand, width: size + 6, height: size + 6, fontSize: size * 0.6 }}
      aria-label={def.name}
    >
      {def.initials}
    </span>
  );
}

// X allows ≤ 4 image/video attachments per post (provider limit). When X is
// in the destination list we clamp the asset attachment list to 4.
const X_ASSET_LIMIT = 4;
const DEFAULT_ASSET_LIMIT = 10;

interface SocialConnection {
  connection_id: string;
  platform: Platform | string;
  status: string;
  account_username: string | null;
  display_name: string | null;
}

interface BrandAsset {
  asset_id: string;
  kind: string;
  url: string | null;
  mime_type: string | null;
  width_px: number | null;
  height_px: number | null;
  created_at: string;
}

interface VoiceScore {
  score: number;
  drift_reasons: string[];
  source: string;
  surface: string;
}

interface ComposerStatus {
  state: "idle" | "submitting" | "ok" | "error";
  message?: string;
}

// Detect the first URL in the body so we can render a preview card. Greedy
// match for the common protocols — drops trailing punctuation.
function firstUrl(text: string): string | null {
  const m = text.match(/\bhttps?:\/\/[^\s)]+/i);
  if (!m) return null;
  return m[0].replace(/[.,)\]]+$/, "");
}

function bandForScore(score: number | null): "green" | "yellow" | "red" | "unknown" {
  if (score == null) return "unknown";
  if (score >= 0.8) return "green";
  if (score >= 0.6) return "yellow";
  return "red";
}

function bandColor(b: ReturnType<typeof bandForScore>): string {
  if (b === "green") return "#16a34a";
  if (b === "yellow") return "#d97706";
  if (b === "red") return "#dc2626";
  return "#94a3b8";
}

export function SocialComposerPage() {
  // Wave 3 tier gate — Composer requires Standard (30-day horizon). 90-day
  // and unlimited scheduling are enforced server-side per-post; the page
  // itself is just blocked at Lite.
  const gate = useMyBrandTier();
  if (gate.ready && !gate.meets("social_compose_30d")) {
    return (
      <div className="p-6">
        <MyBrandUpgradeGate
          featureName="Social Composer"
          requiredTier={gate.requiredTier("social_compose_30d")}
          currentTier={gate.tier}
        />
      </div>
    );
  }
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const lumen = useLumenApi();
  const [searchParams] = useSearchParams();

  // ── Connections (drives destination availability) ──────────────────────
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);

  const platformBase = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string || "").replace(/\/$/, "");

  const loadConnections = useCallback(async () => {
    if (!activeTenantId || !platformBase) { setConnectionsLoaded(true); return; }
    try {
      const token = await getToken();
      const res = await fetch(`${platformBase}/social-oauth/connections`, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "x-tenant-key": activeTenantId,
          ...emergencyActAsHeaders(),
        },
      });
      if (res.ok) {
        const body = await res.json();
        setConnections(Array.isArray(body?.data) ? body.data : []);
      }
    } catch { /* surface as "all disconnected" — user can navigate to Channels */ }
    finally { setConnectionsLoaded(true); }
  }, [activeTenantId, getToken, platformBase]);
  useEffect(() => { loadConnections(); }, [loadConnections]);

  // Set of platforms with an active connection.
  const connectedSet = useMemo(() => {
    const s = new Set<Platform>();
    for (const c of connections) {
      if (c.status === "active" && (["facebook", "instagram", "x", "linkedin"] as const).includes(c.platform as Platform)) {
        s.add(c.platform as Platform);
      }
    }
    return s;
  }, [connections]);

  // ── Destinations (initial pre-select from ?destination=) ───────────────
  const [destinations, setDestinations] = useState<Set<Platform>>(() => {
    const raw = (searchParams.get("destination") || "").toLowerCase();
    const initial = new Set<Platform>();
    raw.split(",").map((s) => s.trim()).forEach((s) => {
      if ((["facebook", "instagram", "x", "linkedin"] as const).includes(s as Platform)) initial.add(s as Platform);
    });
    return initial;
  });

  // Once connections load, drop any pre-selected destinations the tenant
  // isn't actually connected to — keeps the "Connect first" affordance honest.
  useEffect(() => {
    if (!connectionsLoaded) return;
    setDestinations((prev) => {
      const next = new Set<Platform>();
      for (const p of prev) if (connectedSet.has(p)) next.add(p);
      return next.size === prev.size ? prev : next;
    });
  }, [connectionsLoaded, connectedSet]);

  function toggleDestination(p: Platform) {
    if (!connectedSet.has(p)) return;
    setDestinations((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  }

  // ── Body composer ──────────────────────────────────────────────────────
  const [bodyDefault, setBodyDefault] = useState("");
  const [perPlatform, setPerPlatform] = useState<Record<Platform, string>>({
    facebook: "", instagram: "", x: "", linkedin: "",
  });
  const [customizePerPlatform, setCustomizePerPlatform] = useState(false);
  const [activeTab, setActiveTab] = useState<Platform>("facebook");

  // The text actually used for a platform — falls back to bodyDefault when
  // per-platform customization is off or the per-platform value is empty.
  const textFor = useCallback((p: Platform): string => {
    if (!customizePerPlatform) return bodyDefault;
    return perPlatform[p] || bodyDefault;
  }, [customizePerPlatform, bodyDefault, perPlatform]);

  // ── Brand voice scoring (debounced per active surface) ─────────────────
  // We score the active platform (or "social_post_default" when per-platform
  // is off). 2s debounce so we don't spam Anthropic/OpenAI on every keystroke.
  const [voiceScores, setVoiceScores] = useState<Record<string, VoiceScore | null>>({});
  const [scoringSurface, setScoringSurface] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const scoringTarget = useMemo<{ surface: string; text: string }>(() => {
    if (customizePerPlatform) {
      return { surface: PLATFORMS.find((d) => d.key === activeTab)!.voiceSurface, text: textFor(activeTab) };
    }
    return { surface: "social_post_default", text: bodyDefault };
  }, [customizePerPlatform, activeTab, textFor, bodyDefault]);

  useEffect(() => {
    if (!lumen.ready) return;
    if (!scoringTarget.text || !scoringTarget.text.trim()) {
      setVoiceScores((prev) => ({ ...prev, [scoringTarget.surface]: null }));
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setScoringSurface(scoringTarget.surface);
      try {
        const res = await lumen.post<{ score: number; drift_reasons: string[]; source: string; check_id?: string }>(
          "/api/v1/my-brand/voice/score",
          { surface: scoringTarget.surface, text: scoringTarget.text },
        );
        setVoiceScores((prev) => ({
          ...prev,
          [scoringTarget.surface]: {
            score: typeof res?.score === "number" ? res.score : 0,
            drift_reasons: Array.isArray(res?.drift_reasons) ? res.drift_reasons : [],
            source: res?.source || "unknown",
            surface: scoringTarget.surface,
          },
        }));
      } catch {
        // Voice scoring is best-effort — never block the composer on it.
        setVoiceScores((prev) => ({ ...prev, [scoringTarget.surface]: null }));
      } finally {
        setScoringSurface(null);
      }
    }, 2000);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [lumen, scoringTarget]);

  // ── Asset library + attachments ────────────────────────────────────────
  const [attachedAssets, setAttachedAssets] = useState<BrandAsset[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerAssets, setPickerAssets] = useState<BrandAsset[]>([]);

  // Effective max attachments — drops to 4 when X is in the destination set.
  const maxAttachments = destinations.has("x") ? X_ASSET_LIMIT : DEFAULT_ASSET_LIMIT;

  // Pre-attach assets from ?asset_ids=… once the picker results are first loaded.
  // We fetch the entire first page (50 assets) so the URL-param join can find
  // metadata for the requested IDs.
  const [preAttachReady, setPreAttachReady] = useState(false);
  useEffect(() => {
    if (preAttachReady || !lumen.ready) return;
    const idsRaw = (searchParams.get("asset_ids") || "").trim();
    if (!idsRaw) { setPreAttachReady(true); return; }
    const wantedIds = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (wantedIds.length === 0) { setPreAttachReady(true); return; }
    (async () => {
      try {
        const out = await lumen.get<{ rows: BrandAsset[]; limit: number; offset: number }>(
          "/api/v1/my-brand/assets?limit=200&offset=0",
        );
        const rows = out?.rows || [];
        const byId = new Map(rows.map((r) => [r.asset_id, r]));
        const matched = wantedIds.map((id) => byId.get(id)).filter((a): a is BrandAsset => !!a);
        if (matched.length) {
          setAttachedAssets((prev) => {
            const seen = new Set(prev.map((a) => a.asset_id));
            const next = [...prev];
            for (const a of matched) {
              if (seen.has(a.asset_id)) continue;
              if (next.length >= maxAttachments) break;
              next.push(a); seen.add(a.asset_id);
            }
            return next;
          });
        }
      } catch { /* swallow — pre-attach is best-effort */ }
      finally { setPreAttachReady(true); }
    })();
  }, [lumen, searchParams, preAttachReady, maxAttachments]);

  // Whenever maxAttachments drops below the current count (e.g. X just got
  // toggled on), trim the attachment list to the new cap. We trim from the
  // tail so the user keeps the assets they added first.
  useEffect(() => {
    setAttachedAssets((prev) => (prev.length > maxAttachments ? prev.slice(0, maxAttachments) : prev));
  }, [maxAttachments]);

  // ── Orientation auto-detect for default destinations ───────────────────
  // Once assets are pre-attached from ?asset_ids=… and connections have
  // loaded, infer a sensible default destination set from the asset
  // orientations:
  //   - all portrait  → Instagram (carousel handled implicitly when >1)
  //   - all landscape → Facebook + LinkedIn
  //   - mixed         → leave empty + show a prompt asking the user to pick
  // Only fires when destinations is empty (user/URL has not already chosen).
  const [orientationPrompt, setOrientationPrompt] = useState<null | "mixed">(null);
  const [orientationAutoApplied, setOrientationAutoApplied] = useState(false);
  useEffect(() => {
    if (orientationAutoApplied) return;
    if (!preAttachReady || !connectionsLoaded) return;
    if (attachedAssets.length === 0) return;
    if (destinations.size > 0) { setOrientationAutoApplied(true); return; }

    let portrait = 0;
    let landscape = 0;
    let unknown = 0;
    for (const a of attachedAssets) {
      const w = a.width_px ?? 0;
      const h = a.height_px ?? 0;
      if (!w || !h) { unknown++; continue; }
      if (h > w) portrait++;
      else if (w > h) landscape++;
      else landscape++; // square treated as landscape (FB/LI render fine)
    }

    // If we can't classify any asset, don't guess.
    if (portrait === 0 && landscape === 0) { setOrientationAutoApplied(true); return; }

    const allPortrait = portrait > 0 && landscape === 0;
    const allLandscape = landscape > 0 && portrait === 0;

    if (allPortrait) {
      setDestinations(() => {
        const next = new Set<Platform>();
        if (connectedSet.has("instagram")) next.add("instagram");
        return next;
      });
    } else if (allLandscape) {
      setDestinations(() => {
        const next = new Set<Platform>();
        if (connectedSet.has("facebook")) next.add("facebook");
        if (connectedSet.has("linkedin")) next.add("linkedin");
        return next;
      });
    } else {
      // mixed orientations — surface a prompt so the user picks intentionally
      setOrientationPrompt("mixed");
    }
    setOrientationAutoApplied(true);
  }, [preAttachReady, connectionsLoaded, attachedAssets, destinations, connectedSet, orientationAutoApplied]);

  function detachAsset(id: string) {
    setAttachedAssets((prev) => prev.filter((a) => a.asset_id !== id));
  }

  async function openPicker() {
    setPickerOpen(true);
    if (pickerAssets.length === 0) {
      setPickerLoading(true);
      try {
        const out = await lumen.get<{ rows: BrandAsset[] }>("/api/v1/my-brand/assets?limit=100&offset=0");
        setPickerAssets(out?.rows || []);
      } catch {
        setPickerAssets([]);
      } finally {
        setPickerLoading(false);
      }
    }
  }

  function attachFromPicker(a: BrandAsset) {
    setAttachedAssets((prev) => {
      if (prev.some((p) => p.asset_id === a.asset_id)) return prev;
      if (prev.length >= maxAttachments) return prev;
      return [...prev, a];
    });
  }

  // Native-file upload — Wave 2 stub. Once the brand_asset upload endpoint
  // ships we'll POST the file here; for now we attach a transient local
  // preview so the user can still see the file in the destination preview.
  const fileInputRef = useRef<HTMLInputElement>(null);
  function onUploadClick() { fileInputRef.current?.click(); }
  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachedAssets((prev) => {
      if (prev.length >= maxAttachments) return prev;
      const previewUrl = URL.createObjectURL(file);
      const placeholder: BrandAsset = {
        asset_id: `local:${file.name}:${file.size}:${Date.now()}`,
        kind: "image",
        url: previewUrl,
        mime_type: file.type || null,
        width_px: null,
        height_px: null,
        created_at: new Date().toISOString(),
      };
      return [...prev, placeholder];
    });
    e.target.value = "";
  }

  // ── URL preview ────────────────────────────────────────────────────────
  // Wave 2: we render a minimal preview card from the detected URL alone.
  // og:image/og:title fetching needs an opengraph-proxy endpoint that
  // doesn't exist yet; the card still gives users confidence the link
  // will publish.
  const detectedUrl = useMemo(() => firstUrl(bodyDefault), [bodyDefault]);

  // ── Schedule controls ──────────────────────────────────────────────────
  const tenantTimezone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  }, []);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  // Convert the local date+time picker values to an ISO string. Browser
  // treats `new Date("2026-06-22T14:30")` as local time, which is what the
  // user just typed — so the resulting ISO carries the local offset
  // implicitly via toISOString().
  const scheduledIso = useMemo(() => {
    if (scheduleMode !== "later") return null;
    if (!scheduleDate || !scheduleTime) return null;
    const d = new Date(`${scheduleDate}T${scheduleTime}`);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString();
  }, [scheduleMode, scheduleDate, scheduleTime]);

  // ── Approval mode (tenant-level) ───────────────────────────────────────
  // The settings endpoint isn't standardised yet; fall back to "off" if
  // the call fails. Once a tenant_settings table ships, swap this for the
  // canonical query.
  const [approvalRequired, setApprovalRequired] = useState(false);
  useEffect(() => {
    if (!lumen.ready) return;
    (async () => {
      try {
        const res = await lumen.get<{ approval_required?: boolean }>("/api/v1/my-brand/social/settings");
        setApprovalRequired(!!res?.approval_required);
      } catch { /* default off */ }
    })();
  }, [lumen]);

  // ── Validation ─────────────────────────────────────────────────────────
  // A destination is "blocking" if its text overflows the platform max.
  const overflowByPlatform = useMemo(() => {
    const o: Partial<Record<Platform, boolean>> = {};
    for (const def of PLATFORMS) {
      const t = textFor(def.key);
      o[def.key] = t.length > def.maxChars;
    }
    return o;
  }, [textFor]);

  const anyOverflow = useMemo(() => {
    for (const p of destinations) if (overflowByPlatform[p]) return true;
    return false;
  }, [destinations, overflowByPlatform]);

  const canSubmit =
    !!activeTenantId &&
    destinations.size > 0 &&
    !!bodyDefault.trim() &&
    !anyOverflow;

  // ── Submit ─────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<ComposerStatus>({ state: "idle" });

  async function submit() {
    if (!canSubmit) return;
    setStatus({ state: "submitting" });
    // Local previews use a synthetic `local:...` id we filter out of the
    // payload — those would 404 server-side. The backend gets only the
    // real asset_ids; uploads will be wired in a follow-up wave.
    const realAssetIds = attachedAssets
      .map((a) => a.asset_id)
      .filter((id) => !id.startsWith("local:"));
    const perPlatformBody: Partial<Record<Platform, string>> = {};
    if (customizePerPlatform) {
      for (const p of destinations) {
        const v = perPlatform[p];
        if (v && v !== bodyDefault) perPlatformBody[p] = v;
      }
    }
    const payload = {
      body_default: bodyDefault,
      per_platform_body: customizePerPlatform ? perPlatformBody : undefined,
      asset_ids: realAssetIds,
      destinations: Array.from(destinations),
      scheduled_for: scheduledIso,
      requires_approval: approvalRequired,
    };
    try {
      await lumen.post("/api/v1/my-brand/social/posts", payload);
      // Reset the composer body but keep destinations + approval-mode so a
      // second post can go out fast.
      setBodyDefault("");
      setPerPlatform({ facebook: "", instagram: "", x: "", linkedin: "" });
      setAttachedAssets([]);
      setScheduleDate(""); setScheduleTime(""); setScheduleMode("now");
      setStatus({
        state: "ok",
        message: approvalRequired
          ? "Submitted for approval. Founders will see it in their approval inbox."
          : scheduledIso
            ? "Scheduled. The post will publish at the requested time."
            : "Published. Check each channel for confirmation.",
      });
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Submit failed";
      // Wave-2 friendly hint for the known backend gap.
      const friendly = /404|Not Found/i.test(msg)
        ? "Composer backend isn't live yet — POST /api/v1/my-brand/social/posts returned 404. Wave-3 will land it."
        : msg;
      setStatus({ state: "error", message: friendly });
    }
  }

  const submitLabel = approvalRequired
    ? "Submit for approval"
    : scheduledIso ? "Schedule" : "Publish";

  return (
    <div className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Composer</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Compose once and publish to every connected channel. Toggle per-platform customization if you want to tweak
          the copy for X's 280-char limit, hashtags on Instagram, or formal tone on LinkedIn.
        </p>
      </header>

      {/* Status banner */}
      {status.state === "ok" && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <div className="flex-1">{status.message}</div>
          <button type="button" onClick={() => setStatus({ state: "idle" })} className="text-xs font-semibold text-emerald-700 hover:underline">Dismiss</button>
        </div>
      )}
      {status.state === "error" && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="flex-1">{status.message}</div>
          <button type="button" onClick={() => setStatus({ state: "idle" })} className="text-xs font-semibold text-rose-700 hover:underline">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main composer column */}
        <div className="flex flex-col gap-4">
          {/* Destination selector */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Destinations</div>
            {orientationPrompt === "mixed" && (
              <div className="mb-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <div className="flex-1">
                  <strong>Mixed orientations.</strong> Your attached assets include both portrait and landscape images. Pick the destinations you want manually — Instagram favors portrait, Facebook + LinkedIn favor landscape.
                  <button
                    type="button"
                    onClick={() => setOrientationPrompt(null)}
                    className="ml-2 underline hover:no-underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {PLATFORMS.map((def) => {
                const connected = connectedSet.has(def.key);
                const checked = destinations.has(def.key);
                return (
                  <label
                    key={def.key}
                    className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${
                      !connected
                        ? "border-dashed border-slate-200 bg-slate-50 text-slate-400"
                        : checked
                          ? "border-[#2563eb] bg-blue-50 text-slate-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    } ${connected ? "cursor-pointer" : "cursor-not-allowed"}`}
                  >
                    <input
                      type="checkbox"
                      disabled={!connected}
                      checked={checked}
                      onChange={() => toggleDestination(def.key)}
                      className="h-4 w-4"
                    />
                    <PlatformGlyph def={def} size={14} />
                    <span className="flex-1 truncate font-medium">{def.name}</span>
                    {!connected && (
                      <Link
                        to="/app/services/my_brand_social_channels"
                        className="text-[10px] font-semibold text-[#2563eb] hover:underline"
                      >
                        Connect →
                      </Link>
                    )}
                  </label>
                );
              })}
            </div>
            {connectionsLoaded && connectedSet.size === 0 && (
              <div className="mt-2 text-[11px] text-amber-700">
                No channels connected yet. <Link to="/app/services/my_brand_social_channels" className="font-semibold hover:underline">Connect a channel →</Link>
              </div>
            )}
          </section>

          {/* Body composer */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Body</div>
              <label className="inline-flex items-center gap-2 text-[12px] text-slate-700">
                <input
                  type="checkbox"
                  checked={customizePerPlatform}
                  onChange={(e) => setCustomizePerPlatform(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Customize per platform
              </label>
            </div>

            {!customizePerPlatform && (
              <BodyEditor
                value={bodyDefault}
                onChange={setBodyDefault}
                placeholder="What do you want to share today?"
                charLimitForMostStrict={destinations.has("x") ? 280 : undefined}
                rows={6}
              />
            )}

            {customizePerPlatform && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-1 border-b border-slate-200">
                  {PLATFORMS.map((def) => {
                    const overflowing = !!overflowByPlatform[def.key] && destinations.has(def.key);
                    const isActive = activeTab === def.key;
                    return (
                      <button
                        key={def.key}
                        type="button"
                        onClick={() => setActiveTab(def.key)}
                        className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-medium ${
                          isActive
                            ? "border-[#2563eb] text-slate-900"
                            : "border-transparent text-slate-500 hover:text-slate-700"
                        } ${overflowing ? "text-rose-700" : ""}`}
                      >
                        <PlatformGlyph def={def} size={12} />
                        {def.name}
                      </button>
                    );
                  })}
                </div>
                {PLATFORMS.filter((d) => d.key === activeTab).map((def) => (
                  <BodyEditor
                    key={def.key}
                    value={perPlatform[def.key] || ""}
                    onChange={(v) => setPerPlatform((prev) => ({ ...prev, [def.key]: v }))}
                    placeholder={`${def.name}-specific copy. Leave blank to use the default body.`}
                    charLimit={def.maxChars}
                    rows={6}
                  />
                ))}
                <div className="text-[11px] text-slate-500">
                  Default body shown when a platform tab is blank: <span className="italic text-slate-400">{bodyDefault || "(empty)"}</span>
                </div>
              </div>
            )}

            {/* Brand-voice chip */}
            <div className="mt-3">
              <VoiceCheckChip
                scoring={scoringSurface === scoringTarget.surface}
                score={voiceScores[scoringTarget.surface]?.score ?? null}
                driftReasons={voiceScores[scoringTarget.surface]?.drift_reasons || []}
                surfaceLabel={customizePerPlatform ? `${PLATFORMS.find((p) => p.key === activeTab)?.name}` : "Default"}
              />
            </div>
          </section>

          {/* Attachments */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Attachments ({attachedAssets.length} / {maxAttachments}{destinations.has("x") ? " — X limit" : ""})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openPicker}
                  disabled={attachedAssets.length >= maxAttachments}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Add from Asset Library
                </button>
                <button
                  type="button"
                  onClick={onUploadClick}
                  disabled={attachedAssets.length >= maxAttachments}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </button>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={onFileSelected} />
              </div>
            </div>

            {attachedAssets.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                No attachments. Add an image, logo, or generated design from your Asset Library.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                {attachedAssets.map((a) => (
                  <div key={a.asset_id} className="group relative aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                    {a.url ? (
                      <img src={a.url} alt={a.kind} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">{a.kind}</div>
                    )}
                    <button
                      type="button"
                      onClick={() => detachAsset(a.asset_id)}
                      className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-slate-700 opacity-0 transition-opacity group-hover:opacity-100"
                      title="Remove"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* URL preview */}
          {detectedUrl && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Link Preview</div>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex h-12 w-12 items-center justify-center rounded bg-white text-slate-400">
                  <ExternalLink className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">{(() => { try { return new URL(detectedUrl).hostname; } catch { return detectedUrl; } })()}</div>
                  <a href={detectedUrl} target="_blank" rel="noopener noreferrer" className="truncate text-[11px] text-slate-500 hover:underline">{detectedUrl}</a>
                </div>
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                Rich preview (og:image, og:title) will populate once the og-proxy ships.
              </div>
            </section>
          )}

          {/* Schedule */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule</div>
            <div className="flex flex-col gap-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="schedule-mode" checked={scheduleMode === "now"} onChange={() => setScheduleMode("now")} />
                <span>Publish now</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="schedule-mode" checked={scheduleMode === "later"} onChange={() => setScheduleMode("later")} />
                <span>Schedule for later</span>
              </label>
              {scheduleMode === "later" && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1"
                  />
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1"
                  />
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                    <Clock className="h-3 w-3" />
                    {tenantTimezone}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Action bar */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs text-slate-500">
              {anyOverflow && <span className="font-semibold text-rose-700">One or more destinations exceed the character limit.</span>}
              {!anyOverflow && approvalRequired && <span>Approval mode is on for this tenant — posts route through the founder approval inbox.</span>}
              {!anyOverflow && !approvalRequired && scheduledIso && <span>Will publish at {new Date(scheduledIso).toLocaleString()} ({tenantTimezone}).</span>}
              {!anyOverflow && !approvalRequired && !scheduledIso && <span>Publishing immediately to {destinations.size} channel{destinations.size === 1 ? "" : "s"}.</span>}
            </div>
            <button
              type="button"
              disabled={!canSubmit || status.state === "submitting"}
              onClick={submit}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#2563eb] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              {status.state === "submitting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {status.state === "submitting" ? "Submitting…" : submitLabel}
            </button>
          </div>
        </div>

        {/* Right rail — live previews */}
        <aside className="flex flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live Previews</div>
          {PLATFORMS.map((def) => {
            const active = destinations.has(def.key);
            return (
              <PreviewCard
                key={def.key}
                def={def}
                text={textFor(def.key)}
                connected={connectedSet.has(def.key)}
                selected={active}
                attachments={attachedAssets}
                overflow={!!overflowByPlatform[def.key] && active}
              />
            );
          })}
        </aside>
      </div>

      {/* Asset library picker modal */}
      <IadmModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        product="spark"
        eyebrow="My Brand"
        title="Add from Asset Library"
        subtitle="Pick images, logos, or generated designs to attach to this post."
        size="info"
        footer={
          <>
            <IadmButton variant="ghost" onClick={() => setPickerOpen(false)}>Done</IadmButton>
          </>
        }
      >
        <div className="p-5">
          {pickerLoading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading library…</div>
          ) : pickerAssets.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              Your Asset Library is empty. Generate images in the Image Studio or upload files to get started.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
              {pickerAssets.map((a) => {
                const attached = attachedAssets.some((x) => x.asset_id === a.asset_id);
                const atLimit = attachedAssets.length >= maxAttachments && !attached;
                return (
                  <button
                    key={a.asset_id}
                    type="button"
                    onClick={() => attachFromPicker(a)}
                    disabled={attached || atLimit}
                    title={attached ? "Already attached" : atLimit ? `Attachment limit (${maxAttachments}) reached` : undefined}
                    className={`group relative aspect-square overflow-hidden rounded-md border ${
                      attached ? "border-emerald-500 ring-2 ring-emerald-200" : "border-slate-200 hover:border-slate-400"
                    } bg-slate-100 transition-all disabled:opacity-50`}
                  >
                    {a.url ? (
                      <img src={a.url} alt={a.kind} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">{a.kind}</div>
                    )}
                    {attached && (
                      <div className="absolute right-1 top-1 rounded-full bg-emerald-500 p-0.5 text-white">
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </IadmModal>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

interface BodyEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  charLimit?: number;
  charLimitForMostStrict?: number;
  rows?: number;
}
function BodyEditor({ value, onChange, placeholder, charLimit, charLimitForMostStrict, rows = 5 }: BodyEditorProps) {
  const len = value.length;
  const limit = charLimit ?? charLimitForMostStrict ?? null;
  const overflow = limit != null && len > limit;
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full resize-y rounded-lg border bg-white p-3 text-sm leading-relaxed text-slate-900 outline-none focus:ring-2 focus:ring-[#2563eb] ${
          overflow ? "border-rose-300 focus:ring-rose-300" : "border-slate-300"
        }`}
      />
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>{placeholder.includes("default") ? "Used when a platform tab is blank." : ""}</span>
        {limit != null && (
          <span className={overflow ? "font-semibold text-rose-700" : ""}>
            {len.toLocaleString()} / {limit.toLocaleString()}
            {charLimitForMostStrict && !charLimit && <span className="ml-1 text-slate-400">(X limit)</span>}
          </span>
        )}
      </div>
    </div>
  );
}

interface VoiceCheckChipProps {
  scoring: boolean;
  score: number | null;
  driftReasons: string[];
  surfaceLabel: string;
}
function VoiceCheckChip({ scoring, score, driftReasons, surfaceLabel }: VoiceCheckChipProps) {
  const band = bandForScore(score);
  const dot = bandColor(band);
  const label =
    band === "green" ? "On-brand" :
    band === "yellow" ? "Some drift" :
    band === "red" ? "Off-brand" :
    "Not scored";
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />
      <span className="font-semibold text-slate-700">Brand Voice — {surfaceLabel}:</span>
      <span className="text-slate-700">{label}{score != null ? ` (${score.toFixed(2)})` : ""}</span>
      {scoring && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
      {driftReasons.length > 0 && (
        <span className="truncate text-slate-500" title={driftReasons.join(" · ")}>
          · {driftReasons.slice(0, 2).join(" · ")}
        </span>
      )}
    </div>
  );
}

interface PreviewCardProps {
  def: PlatformDef;
  text: string;
  connected: boolean;
  selected: boolean;
  attachments: BrandAsset[];
  overflow: boolean;
}
function PreviewCard({ def, text, connected, selected, attachments, overflow }: PreviewCardProps) {
  const visibleText = text.length > 200 ? `${text.slice(0, 200)}…` : text;
  return (
    <div className={`rounded-xl border bg-white p-3 ${selected ? "border-slate-300" : "border-dashed border-slate-200 opacity-70"}`}>
      <div className="mb-2 flex items-center gap-2">
        <PlatformGlyph def={def} size={12} />
        <div className="flex-1 text-xs font-semibold text-slate-700">{def.name}</div>
        {!connected && <span className="text-[10px] text-slate-400">Not connected</span>}
        {overflow && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">Too long</span>}
      </div>
      {attachments[0]?.url && (
        <div className="mb-2 aspect-video w-full overflow-hidden rounded-md bg-slate-100">
          <img src={attachments[0].url} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <p className="whitespace-pre-wrap text-[12px] leading-snug text-slate-700">{visibleText || <span className="italic text-slate-400">Start typing to see a preview…</span>}</p>
    </div>
  );
}

export default SocialComposerPage;

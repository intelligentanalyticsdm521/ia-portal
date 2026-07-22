// SocialComposerModal — My Brand social composer as a centered IadmModal.
//
// Extracted from the old full-page SocialComposerPage (wave 2) per the
// platform rule that all create/edit flows live in centered IadmModals
// (F-107 "info" 1200×80vh is THE STANDARD for anything view-or-edit).
// Launched from SocialCalendarPage ("+ New post", empty-state CTA, and the
// post-detail "Edit in composer" path); the /my_brand_compose route renders
// the calendar with this modal pre-opened so deep links keep working.
//
// Feature set is unchanged from the page version:
//   - Destination picker: checkboxes per connected platform; greyed out +
//     "Connect →" link for un-connected ones.
//   - Body composer: shared textarea + "Customize per platform" tabbed
//     mini-editors with platform char counters (FB 63206 / IG 2200 / X 280 /
//     LI 3000).
//   - Brand voice check chip: debounced POST /voice/score every 2s.
//   - Asset attachments: Asset Library picker (nested IadmModal — nested
//     modals are canonical) or local upload stub; ≤10, capped to 4 with X.
//   - URL preview, schedule controls, approval-mode-aware submit label.
//
// Contract: { open, onClose, onChanged? } + prefill props. There is no
// postId-based edit: LUMEN-API's social surface has no GET-by-id and no
// body PATCH (only /:id/reschedule and DELETE), so "Edit in composer"
// passes the already-loaded post via `initialPost` and saving POSTs a NEW
// post — the original stays until cancelled (surfaced in the subtitle).
//
// Backend:
//   - POST /api/v1/my-brand/social/posts  (compose post)        ← LUMEN-API
//   - POST /api/v1/my-brand/voice/score   (brand-voice check)   ← LUMEN-API
//   - GET  /social-oauth/connections      (destination state)   ← platform-api
//   - GET  /api/v1/my-brand/assets        (asset picker)        ← LUMEN-API
//
// Data access is unified on useSparkApi so TierGateError flows through the
// shared gate machinery. sparkApi does NOT auto-unwrap the LUMEN
// { data: ... } envelope the way lumenApi did, so `unwrap()` below mirrors
// that behavior for the my-brand endpoints. The platform-api connections
// fetch stays a raw fetch() — the one documented exception (different API
// host + x-tenant-key header) — but its failure is surfaced as a "channels
// unavailable" notice instead of being silently swallowed.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Image as ImageIcon, Upload, X as XIcon,
  Clock, CheckCircle2, AlertTriangle, Sparkles, ExternalLink, Loader2,
} from "lucide-react";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import { useSparkApi } from "../../hooks/useSparkApi";
import { isTierGateError, type TierGateError } from "../../hooks/useOliverApi";
import { emergencyActAsHeaders } from "../../lib/emergencyActAs";
import { IadmModal, IadmButton } from "../IadmModal";

export type Platform = "facebook" | "instagram" | "x" | "linkedin";

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

const VALID_PLATFORMS: readonly Platform[] = ["facebook", "instagram", "x", "linkedin"];

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

/** Prefill shape for the "Edit in composer" path from the calendar. */
export interface ComposerPrefillPost {
  id: number;
  body: string;
  platforms: string[];
  scheduled_for: string | null;
}

// sparkApi returns the raw body; the LUMEN my-brand routes wrap success in
// { data: <result> }. Mirror lumenApi's auto-unwrap so callers type the
// inner shape directly (no-op for non-envelope responses).
function unwrap<T>(r: unknown): T {
  return (r && typeof r === "object" && "data" in (r as Record<string, unknown>)
    ? (r as { data: T }).data
    : (r as T));
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

// datetime seed for the schedule pickers when prefilled from a future post.
function scheduleSeed(sf: string | null | undefined): { date: string; time: string } | null {
  if (!sf) return null;
  const d = new Date(sf);
  if (!Number.isFinite(d.getTime()) || d.getTime() <= Date.now()) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

interface SocialComposerModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful submit so the parent calendar reloads. */
  onChanged?: () => void;
  /** Pre-check destinations (deep-link ?destination= support). */
  initialDestinations?: Platform[];
  /** Pre-attach assets by id (deep-link ?asset_ids= support). */
  initialAssetIds?: string[];
  /** Prefill from an existing post ("Edit in composer"). See contract note
   *  in the file docblock — saving creates a NEW post. */
  initialPost?: ComposerPrefillPost | null;
}

export function SocialComposerModal({
  open, onClose, onChanged, initialDestinations, initialAssetIds, initialPost,
}: SocialComposerModalProps) {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const spark = useSparkApi();

  // ── Connections (drives destination availability) ──────────────────────
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const [connectionsError, setConnectionsError] = useState(false);

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
        setConnectionsError(false);
      } else {
        setConnectionsError(true);
      }
    } catch {
      // Channel service unreachable — surface the notice below instead of
      // silently rendering everything as "disconnected".
      setConnectionsError(true);
    }
    finally { setConnectionsLoaded(true); }
  }, [activeTenantId, getToken, platformBase]);
  useEffect(() => { if (open) loadConnections(); }, [open, loadConnections]);

  // Set of platforms with an active connection.
  const connectedSet = useMemo(() => {
    const s = new Set<Platform>();
    for (const c of connections) {
      if (c.status === "active" && VALID_PLATFORMS.includes(c.platform as Platform)) {
        s.add(c.platform as Platform);
      }
    }
    return s;
  }, [connections]);

  // ── Destinations (seeded from initialPost > initialDestinations) ───────
  const [destinations, setDestinations] = useState<Set<Platform>>(() => {
    const seed = initialPost
      ? (initialPost.platforms || []).filter((p): p is Platform => VALID_PLATFORMS.includes(p as Platform))
      : (initialDestinations || []);
    return new Set<Platform>(seed);
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

  // ── Content type (re-cut §7, 2026-07-22): post / story / reel ─────────
  // Platform ground truth: FB + IG publish stories/reels via API; LinkedIn
  // (Stories killed 2021) and X are FEED-ONLY. Switching to story/reel
  // drops feed-only platforms from the selection and greys their checkboxes.
  type ContentType = "post" | "story" | "reel";
  const STORY_REEL_PLATFORMS: Platform[] = ["facebook", "instagram"];
  const [contentType, setContentType] = useState<ContentType>(
    ((initialPost as { content_type?: string } | null | undefined)?.content_type as ContentType) || "post"
  );
  const platformAllowsContentType = useCallback(
    (p: Platform) => contentType === "post" || STORY_REEL_PLATFORMS.includes(p),
    [contentType]
  );
  function changeContentType(ct: ContentType) {
    setContentType(ct);
    if (ct !== "post") {
      setDestinations((prev) => {
        const next = new Set<Platform>();
        for (const p of prev) if (STORY_REEL_PLATFORMS.includes(p)) next.add(p);
        return next.size === prev.size ? prev : next;
      });
    }
  }

  // ── Body composer ──────────────────────────────────────────────────────
  const [bodyDefault, setBodyDefault] = useState(initialPost?.body || "");
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
    if (!open || !spark.ready) return;
    if (!scoringTarget.text || !scoringTarget.text.trim()) {
      setVoiceScores((prev) => ({ ...prev, [scoringTarget.surface]: null }));
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setScoringSurface(scoringTarget.surface);
      try {
        const res = unwrap<{ score: number; drift_reasons: string[]; source: string; check_id?: string }>(
          await spark.post(
            "/api/v1/my-brand/voice/score",
            { surface: scoringTarget.surface, text: scoringTarget.text },
          ),
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
  }, [open, spark, scoringTarget]);

  // ── Asset library + attachments ────────────────────────────────────────
  const [attachedAssets, setAttachedAssets] = useState<BrandAsset[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerAssets, setPickerAssets] = useState<BrandAsset[]>([]);

  // Effective max attachments — drops to 4 when X is in the destination set.
  const maxAttachments = destinations.has("x") ? X_ASSET_LIMIT : DEFAULT_ASSET_LIMIT;

  // Pre-attach assets from initialAssetIds (deep-link ?asset_ids=…). We fetch
  // the first 200 assets so the id join can find metadata for the requested IDs.
  const [preAttachReady, setPreAttachReady] = useState(false);
  useEffect(() => {
    if (preAttachReady || !spark.ready) return;
    const wantedIds = (initialAssetIds || []).map((s) => s.trim()).filter(Boolean);
    if (wantedIds.length === 0) { setPreAttachReady(true); return; }
    (async () => {
      try {
        const out = unwrap<{ rows: BrandAsset[]; limit: number; offset: number }>(
          await spark.get("/api/v1/my-brand/assets?limit=200&offset=0"),
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
  }, [spark, initialAssetIds, preAttachReady, maxAttachments]);

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
        const out = unwrap<{ rows: BrandAsset[] }>(
          await spark.get("/api/v1/my-brand/assets?limit=100&offset=0"),
        );
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
  // We render a minimal preview card from the detected URL alone.
  // og:image/og:title fetching needs an opengraph-proxy endpoint that
  // doesn't exist yet; the card still gives users confidence the link
  // will publish.
  const detectedUrl = useMemo(() => firstUrl(bodyDefault), [bodyDefault]);

  // ── Schedule controls ──────────────────────────────────────────────────
  const tenantTimezone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  }, []);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">(
    () => (scheduleSeed(initialPost?.scheduled_for) ? "later" : "now"),
  );
  const [scheduleDate, setScheduleDate] = useState(() => scheduleSeed(initialPost?.scheduled_for)?.date || "");
  const [scheduleTime, setScheduleTime] = useState(() => scheduleSeed(initialPost?.scheduled_for)?.time || "");

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
    if (!open || !spark.ready) return;
    (async () => {
      try {
        const res = unwrap<{ approval_required?: boolean }>(
          await spark.get("/api/v1/my-brand/social/settings"),
        );
        setApprovalRequired(!!res?.approval_required);
      } catch { /* default off */ }
    })();
  }, [open, spark]);

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
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
    // CONTRACT FIX (2026-07-22): the backend requires connection_ids —
    // it maps `d.connection_id ?? d` and filters to 36-char UUIDs, so the
    // platform strings this modal used to send were silently dropped and
    // every publish attempt 400'd destinations_missing_connection_ids.
    // Map each selected platform to its ACTIVE connection.
    const destinationPayload = Array.from(destinations)
      .map((p) => {
        const conn = connections.find((c) => c.platform === p && c.status === "active");
        return conn ? { connection_id: conn.connection_id, platform: p } : null;
      })
      .filter((d): d is { connection_id: string; platform: Platform } => d != null);
    const payload = {
      body_default: bodyDefault,
      per_platform_body: customizePerPlatform ? perPlatformBody : undefined,
      asset_ids: realAssetIds,
      destinations: destinationPayload,
      scheduled_for: scheduledIso,
      requires_approval: approvalRequired,
      content_type: contentType,
    };
    try {
      await spark.post("/api/v1/my-brand/social/posts", payload);
      // Canonical CRUD contract: parent closes the modal + reloads the
      // calendar, where the new post appears with its status chip.
      onChanged?.();
      onClose();
    } catch (err: unknown) {
      if (isTierGateError(err)) {
        const g = err as TierGateError;
        setError(`This action requires the ${g.tierRequired} plan (you're on ${g.currentTier}).`);
      } else {
        const msg = (err as Error)?.message || "Submit failed";
        // Friendly hint for the known wave-2 backend gap.
        const friendly = /404|Not Found/i.test(msg)
          ? "Composer backend isn't live yet — POST /api/v1/my-brand/social/posts returned 404. Wave-3 will land it."
          : msg;
        setError(friendly);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel = approvalRequired
    ? "Submit for approval"
    : scheduledIso ? "Schedule" : "Publish";

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="MY BRAND · SOCIAL POST"
      title={initialPost ? `Edit · Post #${initialPost.id}` : "New post"}
      subtitle={initialPost
        ? "Saves as a new post — the original stays on the calendar until you cancel it."
        : "Compose once and publish to every connected channel."}
      size="info"
      footer={
        <>
          <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
          <IadmButton
            variant="accent"
            product="spark"
            onClick={submit}
            disabled={!canSubmit || submitting}
            icon={submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          >
            {submitting ? "Submitting…" : submitLabel}
          </IadmButton>
        </>
      }
    >
      <div className="p-5">
        {/* Inline error banner (canon AlertTriangle treatment) */}
        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main composer column */}
          <div className="flex flex-col gap-5">
            {/* Content type — Post / Story / Reel (re-cut §7). Stories +
                reels are FB+IG only; switching drops feed-only platforms. */}
            <section>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Content type</div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {(["post", "story", "reel"] as const).map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => changeContentType(ct)}
                    className={`rounded-md px-3.5 py-1.5 text-[12px] font-medium capitalize transition-colors ${
                      contentType === ct ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {ct}
                  </button>
                ))}
              </div>
              {contentType !== "post" && (
                <div className="mt-1.5 text-[11px] text-slate-500">
                  {contentType === "story" ? "Stories" : "Reels"} publish to Facebook and Instagram only — LinkedIn and X are feed-post platforms.
                </div>
              )}
            </section>

            {/* Destination selector */}
            <section>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Destinations</div>
              {connectionsError && (
                <div className="mb-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <div className="flex-1">
                    Channel connections are unavailable right now — connection status may be out of date. Reload the page to retry.
                  </div>
                </div>
              )}
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
                  const typeAllowed = platformAllowsContentType(def.key);
                  const selectable = connected && typeAllowed;
                  const checked = destinations.has(def.key);
                  return (
                    <label
                      key={def.key}
                      className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${
                        !selectable
                          ? "border-dashed border-slate-200 bg-slate-50 text-slate-400"
                          : checked
                            ? "border-[#2563eb] bg-blue-50 text-slate-900"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      } ${selectable ? "cursor-pointer" : "cursor-not-allowed"}`}
                    >
                      <input
                        type="checkbox"
                        disabled={!selectable}
                        checked={checked}
                        onChange={() => toggleDestination(def.key)}
                        className="h-4 w-4"
                      />
                      <PlatformGlyph def={def} size={14} />
                      <span className="flex-1 truncate font-medium">{def.name}</span>
                      {!connected ? (
                        <Link
                          to="/app/services/my_brand_social_channels"
                          className="text-[10px] font-semibold text-[#2563eb] hover:underline"
                        >
                          Connect →
                        </Link>
                      ) : !typeAllowed ? (
                        <span className="text-[10px] font-medium text-slate-400">Feed posts only</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
              {connectionsLoaded && connectedSet.size === 0 && !connectionsError && (
                <div className="mt-2 text-[11px] text-amber-700">
                  No channels connected yet. <Link to="/app/services/my_brand_social_channels" className="font-semibold hover:underline">Connect a channel →</Link>
                </div>
              )}
            </section>

            {/* Body composer */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Body</div>
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
            <section>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
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
              <section>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Link Preview</div>
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
            <section>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Schedule</div>
              <div className="flex flex-col gap-2 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="composer-schedule-mode" checked={scheduleMode === "now"} onChange={() => setScheduleMode("now")} />
                  <span>Publish now</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="composer-schedule-mode" checked={scheduleMode === "later"} onChange={() => setScheduleMode("later")} />
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
              {/* Submit context line — the action itself lives in the modal footer. */}
              <div className="mt-3 text-xs text-slate-500">
                {anyOverflow && <span className="font-semibold text-rose-700">One or more destinations exceed the character limit.</span>}
                {!anyOverflow && approvalRequired && <span>Approval mode is on for this business — posts route through the founder approval inbox.</span>}
                {!anyOverflow && !approvalRequired && scheduledIso && <span>Will publish at {new Date(scheduledIso).toLocaleString()} ({tenantTimezone}).</span>}
                {!anyOverflow && !approvalRequired && !scheduledIso && <span>Publishing immediately to {destinations.size} channel{destinations.size === 1 ? "" : "s"}.</span>}
              </div>
            </section>
          </div>

          {/* Right rail — live previews */}
          <aside className="flex flex-col gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Live Previews
              {contentType !== "post" && (
                <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold normal-case text-violet-700">
                  {contentType === "story" ? "Story · 9:16" : "Reel · 9:16"}
                </span>
              )}
            </div>
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
      </div>

      {/* Asset library picker — nested IadmModal (canonical, see
          SparkTemplateEditorModal's CTA sub-modal). */}
      <IadmModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        product="spark"
        eyebrow="MY BRAND · ASSET LIBRARY"
        title="Add from Asset Library"
        subtitle="Pick images, logos, or generated designs to attach to this post."
        size="info"
        footer={
          <IadmButton variant="ghost" onClick={() => setPickerOpen(false)}>Done</IadmButton>
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
    </IadmModal>
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

export default SocialComposerModal;

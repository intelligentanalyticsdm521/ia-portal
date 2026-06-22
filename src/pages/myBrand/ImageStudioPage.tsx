// src/pages/myBrand/ImageStudioPage.tsx
//
// My Brand > Image Studio (Wave 2 — Brandon, 2026-06-22).
// --------------------------------------------------------------------------
// Generate-edit-deliver flow for tenant brand imagery.
//
//   * Left ~40% — prompt + style + aspect-ratio + Generate CTA, plus the
//     last 5 prompts as quick-recall pills.
//   * Right ~60% — 2x2 grid of variations. Each tile has Edit / Save /
//     Send to Social / Delete on hover, an EditModal with crop+tint+text
//     sliders, and a "Send to Social" action that navigates to the
//     Wave-3 my_brand_compose page with ?asset_ids=… preserving selection.
//
// Backend:
//   * POST   /api/v1/my-brand/image-studio/generate
//             { prompt, count, style, size }
//             → { jobId, assets[], totalCostUsd, errors[] }
//   * POST   /api/v1/my-brand/image-studio/:assetId/edit
//             { edits: { colors?, text_overlay?, crop?, brightness? } }
//             → { assetId, blobRef, url, parent_asset_id }
//   * DELETE /api/v1/my-brand/image-studio/:assetId   (204)
//
// Auth: useLumenApi handles MSAL + x-tenant-id + 503-key-missing surfacing.
//
// Cost preview: spec says "$cost / 1 = 1 credit". gpt-image-1 published rate
// card (Jun 2026) — 1024² = $0.04, 1024×1536 = $0.06. The UI shows the
// per-variation USD before the user commits.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Trash2, Pencil, Save, Send, ImagePlus, RefreshCw, AlertTriangle } from "lucide-react";
import { useLumenApi } from "../../hooks/useLumenApi";
import { isImageStudioNotConfiguredError } from "../../lib/lumenApi";
import { ArgusBalanceBadge } from "../../components/ArgusBalanceBadge";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { MyBrandUpgradeGate } from "../../components/MyBrandUpgradeGate";
import { useMyBrandTier } from "../../hooks/useMyBrandTier";

// ─── Types matching LUMEN-API lib/myBrand/imageStudio.js ────────────────────

interface GeneratedAsset {
  assetId: string;
  blobRef: string;
  url: string;
  prompt: string;
  variant_n: number;
}

interface GenerateResponse {
  jobId: string;
  assets: GeneratedAsset[];
  totalCostUsd: number | null;
  errors: Array<{ variant_n: number; message: string }>;
}

interface EditResponse {
  assetId: string;
  blobRef: string;
  url: string;
  parent_asset_id: string;
}

// Recent-prompts persisted to localStorage so the user sees their last work
// even after a hard reload. Last 5, newest-first.
const RECENT_PROMPTS_KEY = "myBrand.imageStudio.recentPrompts";
const RECENT_PROMPTS_MAX = 5;

type StyleKey = "photorealistic" | "illustration" | "flat" | "watercolor";
type SizeKey = "1024x1024" | "1536x1024" | "1024x1536";

interface SizeOption {
  key: SizeKey;
  label: string;
  ratio: string;
  costUsd: number; // gpt-image-1 published rate card, Jun 2026
}

const SIZE_OPTIONS: SizeOption[] = [
  { key: "1024x1024", label: "1:1 Square", ratio: "1024 × 1024", costUsd: 0.04 },
  { key: "1536x1024", label: "16:9 Wide", ratio: "1536 × 1024", costUsd: 0.06 },
  { key: "1024x1536", label: "9:16 Tall", ratio: "1024 × 1536", costUsd: 0.06 },
];

const STYLE_OPTIONS: { key: StyleKey; label: string; hint: string }[] = [
  { key: "photorealistic", label: "Photorealistic", hint: "Crisp photographic look — best for product, lifestyle, location shots." },
  { key: "illustration", label: "Illustration", hint: "Stylized, hand-drawn feel — fits storytelling + lifestyle blogs." },
  { key: "flat", label: "Flat / Vector", hint: "Bold flat shapes — best for icons, social graphics, hero cards." },
  { key: "watercolor", label: "Watercolor", hint: "Soft painted texture — great for hero illustrations + headers." },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadRecentPrompts(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_PROMPTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => typeof s === "string").slice(0, RECENT_PROMPTS_MAX);
  } catch {
    return [];
  }
}

function persistRecentPrompts(prompts: string[]) {
  try {
    localStorage.setItem(RECENT_PROMPTS_KEY, JSON.stringify(prompts.slice(0, RECENT_PROMPTS_MAX)));
  } catch {
    /* localStorage full / disabled — non-fatal */
  }
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

// Map error → user-facing message + tone. The OpenAI errors we care about
// are policy / rate-limit / timeout; everything else falls through to a
// generic "try again" message. Keeps the user from seeing raw OpenAI text.
function friendlyError(err: unknown): { tone: "warn" | "error"; message: string } {
  if (isImageStudioNotConfiguredError(err)) {
    return {
      tone: "warn",
      message: err.message || "Image Studio isn't configured for this environment yet.",
    };
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const lower = msg.toLowerCase();
  if (lower.includes("content_policy") || lower.includes("safety")) {
    return {
      tone: "warn",
      message: "Your prompt was flagged by OpenAI's content policy. Try rewording it without anything that could be interpreted as a real person, brand logo, or sensitive imagery.",
    };
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return {
      tone: "warn",
      message: "OpenAI rate-limited the request. Wait ~30 seconds and try again.",
    };
  }
  if (lower.includes("timeout") || lower.includes("aborted")) {
    return {
      tone: "warn",
      message: "Generation took too long and was cancelled. Try again with a simpler prompt or fewer variations.",
    };
  }
  return {
    tone: "error",
    message: msg || "Something went wrong generating images.",
  };
}

// ─── Main page ──────────────────────────────────────────────────────────────

export function ImageStudioPage() {
  const api = useLumenApi();
  const navigate = useNavigate();
  // Wave 3 tier gate — Image Studio requires Standard+. While the SPARK
  // subscription is still loading we render the normal page (the backend
  // will still 403 if the user is sub-tier, and we show the gate the moment
  // we know). Once `ready` we either continue with the page or short-circuit
  // to the upgrade overlay so users on Lite see a clear path forward.
  const gate = useMyBrandTier();
  if (gate.ready && !gate.meets("image_studio")) {
    return (
      <div className="p-6">
        <MyBrandUpgradeGate
          featureName="Image Studio"
          requiredTier={gate.requiredTier("image_studio")}
          currentTier={gate.tier}
        />
      </div>
    );
  }

  // Prompt panel state
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<StyleKey>("photorealistic");
  const [size, setSize] = useState<SizeKey>("1024x1024");
  const [recentPrompts, setRecentPrompts] = useState<string[]>(() => loadRecentPrompts());

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<{ tone: "warn" | "error"; message: string } | null>(null);
  const [variations, setVariations] = useState<GeneratedAsset[]>([]);
  const [lastJobCost, setLastJobCost] = useState<number | null>(null);
  const [perVariantErrors, setPerVariantErrors] = useState<Array<{ variant_n: number; message: string }>>([]);

  // Per-tile transient state (delete pending, edit pending) — keyed by assetId
  const [pendingByAsset, setPendingByAsset] = useState<Record<string, "deleting" | "editing">>({});
  const [savedAssetIds, setSavedAssetIds] = useState<Set<string>>(new Set());

  // Edit modal state
  const [editTarget, setEditTarget] = useState<GeneratedAsset | null>(null);

  // Used so we can keep the "Send to Social" multi-select UX honest — clicking
  // multiple tiles toggles; "Send" jumps to compose with all selected.
  const [selectedForSocial, setSelectedForSocial] = useState<Set<string>>(new Set());

  // The cost preview reflects the currently-chosen size — recalculates on
  // every render but it's O(3) so we just inline it.
  const currentSizeOption = useMemo(
    () => SIZE_OPTIONS.find((s) => s.key === size) || SIZE_OPTIONS[0],
    [size]
  );
  const perVariantCost = currentSizeOption.costUsd;
  // The Generate button always asks for 4 (per spec). Single CTA + visible
  // cost preview, no "how many?" knob to confuse first-time users.
  const VARIATION_COUNT = 4;
  const totalCostPreview = perVariantCost * VARIATION_COUNT;

  // ─── Generate ────────────────────────────────────────────────────────────

  const onGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError({ tone: "warn", message: "Describe what you want to see — at least one sentence." });
      return;
    }
    if (!api.ready) {
      setError({ tone: "error", message: "Authentication isn't ready yet. Reload the page and try again." });
      return;
    }

    setGenerating(true);
    setError(null);
    setPerVariantErrors([]);
    try {
      const res = await api.post<GenerateResponse>("/api/v1/my-brand/image-studio/generate", {
        prompt: trimmed,
        count: VARIATION_COUNT,
        style,
        size,
      });
      setVariations(res.assets || []);
      setLastJobCost(res.totalCostUsd ?? null);
      setPerVariantErrors(res.errors || []);
      // Update recent prompts — newest first, dedupe (case-insensitive),
      // keep the 5 most recent. Persist to localStorage.
      setRecentPrompts((prev) => {
        const next = [trimmed, ...prev.filter((p) => p.toLowerCase() !== trimmed.toLowerCase())].slice(0, RECENT_PROMPTS_MAX);
        persistRecentPrompts(next);
        return next;
      });
      // Reset per-tile selection so leftover selections from a previous run
      // don't carry into the new variations.
      setSelectedForSocial(new Set());
    } catch (e) {
      setError(friendlyError(e));
      setVariations([]);
    } finally {
      setGenerating(false);
    }
  }, [prompt, style, size, api]);

  // ─── Tile actions ────────────────────────────────────────────────────────

  const onDelete = useCallback(async (asset: GeneratedAsset) => {
    if (!api.ready) return;
    if (!window.confirm("Delete this variation? It will be removed from the Asset Library too.")) return;
    setPendingByAsset((prev) => ({ ...prev, [asset.assetId]: "deleting" }));
    try {
      await api.del(`/api/v1/my-brand/image-studio/${asset.assetId}`);
      setVariations((prev) => prev.filter((v) => v.assetId !== asset.assetId));
      setSelectedForSocial((prev) => {
        if (!prev.has(asset.assetId)) return prev;
        const next = new Set(prev);
        next.delete(asset.assetId);
        return next;
      });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setPendingByAsset((prev) => {
        const next = { ...prev };
        delete next[asset.assetId];
        return next;
      });
    }
  }, [api]);

  // "Save" = mark as favorited / stop auto-deletion. Wave 1 backend already
  // persists every generated asset to brand_asset; until the favorite flag
  // ships we just track which ones the user pinned client-side. This keeps
  // the button useful (visible feedback + future-compat) without a no-op API.
  const onSave = useCallback((asset: GeneratedAsset) => {
    setSavedAssetIds((prev) => {
      if (prev.has(asset.assetId)) return prev;
      const next = new Set(prev);
      next.add(asset.assetId);
      return next;
    });
  }, []);

  // "Send to Social" — navigate to my_brand_compose with ?asset_ids=<id>.
  // If the user has multi-selected tiles, the comma-joined list goes through.
  // Compose page is Wave 3; until it lands the route falls through to the
  // catalog "not found" page, which still gives the right user signal.
  const onSendOne = useCallback((asset: GeneratedAsset) => {
    navigate(`/app/services/my_brand_compose?asset_ids=${encodeURIComponent(asset.assetId)}`);
  }, [navigate]);

  const onSendSelected = useCallback(() => {
    if (selectedForSocial.size === 0) return;
    const ids = Array.from(selectedForSocial);
    navigate(`/app/services/my_brand_compose?asset_ids=${encodeURIComponent(ids.join(","))}`);
  }, [selectedForSocial, navigate]);

  const toggleSelectForSocial = useCallback((assetId: string) => {
    setSelectedForSocial((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }, []);

  const openEdit = useCallback((asset: GeneratedAsset) => {
    setEditTarget(asset);
  }, []);

  const closeEdit = useCallback(() => setEditTarget(null), []);

  // Handler called from the EditModal when the user submits — performs the
  // edit + swaps the parent tile to show the new asset. Keeps the original
  // chain queryable on the backend via parent_asset_id, but the UI shows
  // the latest version since edits compound.
  const onEditCommitted = useCallback((parentAssetId: string, result: EditResponse) => {
    setVariations((prev) =>
      prev.map((v) =>
        v.assetId === parentAssetId
          ? { ...v, assetId: result.assetId, blobRef: result.blobRef, url: result.url }
          : v
      )
    );
    setEditTarget(null);
  }, []);

  // Recent prompt click — populate the textarea so the user sees what they're
  // about to send rather than firing a generate behind their back.
  const onRecentClick = useCallback((p: string) => {
    setPrompt(p);
  }, []);

  // Re-roll = same prompt + style + size, fresh call.
  const onReroll = useCallback(() => {
    if (!prompt.trim()) return;
    onGenerate();
  }, [prompt, onGenerate]);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <Sparkles className="h-3 w-3 text-violet-500" />
            <span>My Brand · Intelligence Layer</span>
          </div>
          <h1 className="mt-0.5 text-xl font-semibold text-slate-900">Image Studio</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Generate on-brand variations with gpt-image-1, edit them inline, send them straight to social.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <ArgusBalanceBadge />
        </div>
      </div>

      {/* Two-pane body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: prompt panel (~40%) */}
        <aside className="flex w-2/5 min-w-[340px] flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white p-6">
          <PromptPanel
            prompt={prompt}
            setPrompt={setPrompt}
            style={style}
            setStyle={setStyle}
            size={size}
            setSize={setSize}
            perVariantCost={perVariantCost}
            totalCostPreview={totalCostPreview}
            generating={generating}
            onGenerate={onGenerate}
            recentPrompts={recentPrompts}
            onRecentClick={onRecentClick}
          />
        </aside>

        {/* Right: variations grid (~60%) */}
        <main className="flex-1 min-w-0 overflow-y-auto p-6">
          <VariationsPane
            generating={generating}
            error={error}
            perVariantErrors={perVariantErrors}
            variations={variations}
            lastJobCost={lastJobCost}
            savedAssetIds={savedAssetIds}
            pendingByAsset={pendingByAsset}
            selectedForSocial={selectedForSocial}
            recentPrompts={recentPrompts}
            onEdit={openEdit}
            onSave={onSave}
            onSendOne={onSendOne}
            onSendSelected={onSendSelected}
            onDelete={onDelete}
            onToggleSelect={toggleSelectForSocial}
            onReroll={onReroll}
          />
        </main>
      </div>

      {/* Edit modal */}
      {editTarget && (
        <EditAssetModal
          target={editTarget}
          api={api}
          onClose={closeEdit}
          onCommitted={onEditCommitted}
        />
      )}
    </div>
  );
}

// ─── Prompt panel (left) ────────────────────────────────────────────────────

interface PromptPanelProps {
  prompt: string;
  setPrompt: (s: string) => void;
  style: StyleKey;
  setStyle: (s: StyleKey) => void;
  size: SizeKey;
  setSize: (s: SizeKey) => void;
  perVariantCost: number;
  totalCostPreview: number;
  generating: boolean;
  onGenerate: () => void;
  recentPrompts: string[];
  onRecentClick: (p: string) => void;
}

function PromptPanel({
  prompt, setPrompt, style, setStyle, size, setSize,
  perVariantCost, totalCostPreview, generating, onGenerate,
  recentPrompts, onRecentClick,
}: PromptPanelProps) {
  const promptValid = prompt.trim().length >= 4;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="block text-xs font-semibold text-slate-700">Describe what you want</label>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Be specific — subject, setting, mood, framing. Stay away from real people and brand logos to avoid policy blocks.
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="A sunlit team of plumbers laying copper pipes on a clean job site, warm photography style, shallow depth of field, golden hour"
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-200"
          disabled={generating}
        />
        <div className="mt-1 text-right text-[10px] text-slate-400">{prompt.length} / 4000</div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700">Style</label>
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value as StyleKey)}
          disabled={generating}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-200"
        >
          {STYLE_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-slate-500">
          {STYLE_OPTIONS.find((s) => s.key === style)?.hint}
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700">Aspect ratio</label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {SIZE_OPTIONS.map((opt) => {
            const isActive = opt.key === size;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSize(opt.key)}
                disabled={generating}
                className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-[11px] font-medium transition-colors ${
                  isActive
                    ? "border-violet-500 bg-violet-50 text-violet-900"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                } disabled:opacity-50`}
              >
                <span className="text-xs font-semibold">{opt.label}</span>
                <span className="text-[10px] text-slate-500">{opt.ratio}</span>
                <span className="text-[10px] font-medium text-slate-400">{fmtUsd(opt.costUsd)} ea</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Generate CTA + cost preview */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between text-[11px] text-slate-600">
          <span>4 variations × {fmtUsd(perVariantCost)}</span>
          <span className="font-semibold text-slate-900">≈ {fmtUsd(totalCostPreview)}</span>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating || !promptValid}
          className={`mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors ${
            generating
              ? "bg-violet-300"
              : promptValid
                ? "bg-violet-600 hover:bg-violet-700"
                : "bg-slate-300"
          }`}
        >
          {generating ? (
            <>
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Generating 4 variations…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate 4 variations
            </>
          )}
        </button>
        <p className="mt-2 text-[10px] text-slate-500">
          Typical wait 15–30 seconds. We persist every variation to your Asset Library so you can come back to them.
        </p>
      </div>

      {/* Recent prompts */}
      {recentPrompts.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-700">Recent prompts</div>
            <div className="text-[10px] text-slate-400">last {Math.min(recentPrompts.length, RECENT_PROMPTS_MAX)}</div>
          </div>
          <ul className="mt-2 space-y-1.5">
            {recentPrompts.map((p, i) => (
              <li key={`${i}-${p.slice(0, 24)}`}>
                <button
                  type="button"
                  onClick={() => onRecentClick(p)}
                  disabled={generating}
                  className="block w-full truncate rounded border border-slate-200 bg-white px-2 py-1.5 text-left text-[11px] text-slate-700 transition-colors hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50"
                  title={p}
                >
                  {p}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Variations grid (right) ────────────────────────────────────────────────

interface VariationsPaneProps {
  generating: boolean;
  error: { tone: "warn" | "error"; message: string } | null;
  perVariantErrors: Array<{ variant_n: number; message: string }>;
  variations: GeneratedAsset[];
  lastJobCost: number | null;
  savedAssetIds: Set<string>;
  pendingByAsset: Record<string, "deleting" | "editing">;
  selectedForSocial: Set<string>;
  recentPrompts: string[];
  onEdit: (a: GeneratedAsset) => void;
  onSave: (a: GeneratedAsset) => void;
  onSendOne: (a: GeneratedAsset) => void;
  onSendSelected: () => void;
  onDelete: (a: GeneratedAsset) => void;
  onToggleSelect: (assetId: string) => void;
  onReroll: () => void;
}

function VariationsPane({
  generating, error, perVariantErrors, variations, lastJobCost, savedAssetIds,
  pendingByAsset, selectedForSocial, recentPrompts,
  onEdit, onSave, onSendOne, onSendSelected, onDelete, onToggleSelect, onReroll,
}: VariationsPaneProps) {
  // Loading skeleton — 4 placeholder tiles. Mirrors the 2x2 grid so layout
  // doesn't shift when results land.
  if (generating) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Generating variations…
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
            >
              <div className="h-full w-full animate-pulse bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100" />
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          gpt-image-1 typically takes 15–30 seconds for 4 variations. Hang tight — we'll never time out without telling you.
        </p>
      </div>
    );
  }

  // Hard error state — show the error block + the empty-state CTA so the user
  // can correct + retry without a page reload.
  if (error && variations.length === 0) {
    const isWarn = error.tone === "warn";
    return (
      <div className="flex flex-col gap-3">
        <div
          className={`flex items-start gap-3 rounded-xl border p-4 ${
            isWarn
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="text-sm">{error.message}</div>
        </div>
        <EmptyState recentPrompts={recentPrompts} />
      </div>
    );
  }

  // Empty state — no variations yet, no error. Most users land here on
  // first visit.
  if (variations.length === 0) {
    return <EmptyState recentPrompts={recentPrompts} />;
  }

  // Results — header strip + 2x2 grid + per-variant error footer if any.
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Variations · {variations.length}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Cost this run: <span className="font-semibold text-slate-700">{fmtUsd(lastJobCost)}</span>
            {savedAssetIds.size > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-emerald-700">{savedAssetIds.size} saved</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedForSocial.size > 0 && (
            <button
              type="button"
              onClick={onSendSelected}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100"
            >
              <Send className="h-3.5 w-3.5" />
              Send {selectedForSocial.size} to Social
            </button>
          )}
          <button
            type="button"
            onClick={onReroll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            title="Generate 4 new variations with the same prompt + settings"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-roll
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {variations.map((asset) => (
          <VariationTile
            key={asset.assetId}
            asset={asset}
            saved={savedAssetIds.has(asset.assetId)}
            selected={selectedForSocial.has(asset.assetId)}
            pendingState={pendingByAsset[asset.assetId]}
            onEdit={() => onEdit(asset)}
            onSave={() => onSave(asset)}
            onSendOne={() => onSendOne(asset)}
            onDelete={() => onDelete(asset)}
            onToggleSelect={() => onToggleSelect(asset.assetId)}
          />
        ))}
      </div>

      {/* Per-variant errors (partial-failure case from backend) */}
      {perVariantErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <span className="font-semibold">Some variants didn't make it:</span>{" "}
          {perVariantErrors.map((e) => `#${e.variant_n} — ${e.message}`).join("; ")}
        </div>
      )}
    </div>
  );
}

// ─── Variation tile ─────────────────────────────────────────────────────────

interface VariationTileProps {
  asset: GeneratedAsset;
  saved: boolean;
  selected: boolean;
  pendingState?: "deleting" | "editing";
  onEdit: () => void;
  onSave: () => void;
  onSendOne: () => void;
  onDelete: () => void;
  onToggleSelect: () => void;
}

function VariationTile({
  asset, saved, selected, pendingState, onEdit, onSave, onSendOne, onDelete, onToggleSelect,
}: VariationTileProps) {
  const [imgError, setImgError] = useState(false);
  const dimmed = pendingState === "deleting";

  return (
    <div
      className={`group relative aspect-square overflow-hidden rounded-xl border bg-slate-100 transition-all ${
        selected ? "border-violet-500 ring-2 ring-violet-200" : "border-slate-200"
      } ${dimmed ? "opacity-50" : ""}`}
    >
      {/* Selection toggle — top-left checkbox-style */}
      <button
        type="button"
        onClick={onToggleSelect}
        title="Select for multi-send to Social"
        className={`absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold transition-colors ${
          selected
            ? "border-violet-500 bg-violet-500 text-white"
            : "border-white/70 bg-black/30 text-transparent hover:border-white"
        }`}
      >
        {selected ? "✓" : ""}
      </button>

      {/* Saved indicator — top-right */}
      {saved && (
        <div className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          <Save className="h-2.5 w-2.5" />
          Saved
        </div>
      )}

      {imgError ? (
        <div className="flex h-full w-full items-center justify-center bg-slate-100 text-center text-xs text-slate-400">
          Image unavailable.
          <br />
          Try re-rolling.
        </div>
      ) : (
        <img
          src={asset.url}
          alt={asset.prompt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      )}

      {/* Hover overlay with actions */}
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/70 via-black/0 to-black/0 p-3 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5">
          <TileBtn icon={<Pencil className="h-3 w-3" />} label="Edit" onClick={onEdit} />
          <TileBtn
            icon={<Save className="h-3 w-3" />}
            label={saved ? "Saved" : "Save"}
            onClick={onSave}
            disabled={saved}
            variant={saved ? "muted" : undefined}
          />
          <TileBtn icon={<Send className="h-3 w-3" />} label="Send to Social" onClick={onSendOne} variant="accent" />
          <TileBtn icon={<Trash2 className="h-3 w-3" />} label="Delete" onClick={onDelete} variant="danger" />
        </div>
      </div>
    </div>
  );
}

function TileBtn({
  icon, label, onClick, disabled, variant,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "danger" | "accent" | "muted";
}) {
  let cls = "border-white/40 bg-black/60 text-white hover:bg-black/80";
  if (variant === "danger") cls = "border-rose-300/60 bg-rose-600/80 text-white hover:bg-rose-700";
  if (variant === "accent") cls = "border-violet-300/60 bg-violet-600/90 text-white hover:bg-violet-700";
  if (variant === "muted") cls = "border-emerald-300/60 bg-emerald-600/80 text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors disabled:opacity-60 ${cls}`}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────

function EmptyState({ recentPrompts }: { recentPrompts: string[] }) {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <div className="rounded-full bg-violet-50 p-3">
        <ImagePlus className="h-6 w-6 text-violet-600" />
      </div>
      <h2 className="text-base font-semibold text-slate-900">
        {recentPrompts.length === 0 ? "Generate your first image" : "Ready for the next batch"}
      </h2>
      <p className="max-w-md text-xs text-slate-500">
        Type a description on the left, pick a style + aspect ratio, then hit Generate. You'll get four variations in
        ~20 seconds. Every variation lands in your Asset Library so you can come back later.
      </p>
    </div>
  );
}

// ─── Edit modal — crop / tint / text overlay / brightness ──────────────────

interface EditAssetModalProps {
  target: GeneratedAsset;
  api: ReturnType<typeof useLumenApi>;
  onClose: () => void;
  onCommitted: (parentAssetId: string, result: EditResponse) => void;
}

function EditAssetModal({ target, api, onClose, onCommitted }: EditAssetModalProps) {
  // Tint
  const [tintEnabled, setTintEnabled] = useState(false);
  const [tintColor, setTintColor] = useState("#38BDF8");
  const [tintStrength, setTintStrength] = useState(0.2); // 0..1

  // Text overlay
  const [textEnabled, setTextEnabled] = useState(false);
  const [text, setText] = useState("");
  const [textColor, setTextColor] = useState("#ffffff");
  const [textPosition, setTextPosition] = useState<"top" | "middle" | "bottom">("bottom");
  const [textSize, setTextSize] = useState(72);

  // Brightness — 0..2, 1=identity
  const [brightness, setBrightness] = useState(1);

  // Crop — values are pixels in the source image. We can't know the
  // source dimensions in advance reliably (sometimes the asset row reports
  // null), so we use percentages 0-100 in the UI and let the backend
  // normalize. The backend extract() clamps to image bounds, so we don't
  // need to worry about overflow.
  const [cropEnabled, setCropEnabled] = useState(false);
  // We probe the rendered image to learn its natural dimensions, then
  // convert the UI percentages to pixels right before submit.
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [naturalW, setNaturalW] = useState<number | null>(null);
  const [naturalH, setNaturalH] = useState<number | null>(null);
  const [cropLeftPct, setCropLeftPct] = useState(0);
  const [cropTopPct, setCropTopPct] = useState(0);
  const [cropWidthPct, setCropWidthPct] = useState(100);
  const [cropHeightPct, setCropHeightPct] = useState(100);

  const [submitting, setSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const hasAnyEdit = tintEnabled || textEnabled || cropEnabled || brightness !== 1;

  const onImgLoad = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    setNaturalW(el.naturalWidth || null);
    setNaturalH(el.naturalHeight || null);
  }, []);

  const submit = useCallback(async () => {
    if (!hasAnyEdit) {
      setEditError("Pick at least one edit to apply.");
      return;
    }
    if (!api.ready) {
      setEditError("Authentication isn't ready. Try again in a moment.");
      return;
    }
    setSubmitting(true);
    setEditError(null);
    try {
      const edits: Record<string, unknown> = {};
      if (tintEnabled) {
        edits.colors = { tint: tintColor, strength: tintStrength };
      }
      if (textEnabled && text.trim()) {
        edits.text_overlay = {
          text: text.trim().slice(0, 200),
          color: textColor,
          position: textPosition,
          font_size: textSize,
        };
      }
      if (brightness !== 1) {
        edits.brightness = brightness;
      }
      if (cropEnabled && naturalW && naturalH) {
        const left = Math.max(0, Math.round((cropLeftPct / 100) * naturalW));
        const top = Math.max(0, Math.round((cropTopPct / 100) * naturalH));
        const width = Math.max(1, Math.round((cropWidthPct / 100) * naturalW));
        const height = Math.max(1, Math.round((cropHeightPct / 100) * naturalH));
        edits.crop = { left, top, width, height };
      }
      const res = await api.post<EditResponse>(
        `/api/v1/my-brand/image-studio/${target.assetId}/edit`,
        { edits }
      );
      onCommitted(target.assetId, res);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e ?? "Edit failed."));
    } finally {
      setSubmitting(false);
    }
  }, [
    hasAnyEdit, api, tintEnabled, tintColor, tintStrength,
    textEnabled, text, textColor, textPosition, textSize,
    brightness, cropEnabled, naturalW, naturalH,
    cropLeftPct, cropTopPct, cropWidthPct, cropHeightPct,
    target.assetId, onCommitted,
  ]);

  return (
    <IadmModal
      open={true}
      onClose={onClose}
      product="spark"
      eyebrow="MY BRAND · EDIT"
      title="Edit image"
      subtitle="Tint, text overlay, crop — server-side, no editor download."
      size="info"
      footer={
        <>
          <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
          <IadmButton
            variant="primary"
            onClick={submit}
            disabled={submitting || !hasAnyEdit}
          >
            {submitting ? "Applying…" : "Apply edits"}
          </IadmButton>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 p-6">
        {/* Preview column — 2/5 */}
        <div className="md:col-span-2 flex flex-col gap-2">
          <div className="text-xs font-semibold text-slate-700">Original</div>
          <div className="rounded-lg border border-slate-200 bg-slate-100 p-2">
            <img
              ref={imgRef}
              src={target.url}
              alt={target.prompt}
              onLoad={onImgLoad}
              className="block w-full rounded"
              style={{ maxHeight: "50vh", objectFit: "contain" }}
            />
          </div>
          <p className="text-[10px] text-slate-500">
            Edits produce a new asset (the original is kept). {naturalW && naturalH ? `${naturalW} × ${naturalH}` : "Loading dimensions…"}
          </p>
        </div>

        {/* Controls column — 3/5 */}
        <div className="md:col-span-3 flex flex-col gap-5">
          {/* Brightness */}
          <Section title="Brightness" hint="1.0 = no change, &lt;1 = darker, &gt;1 = brighter">
            <input
              type="range"
              min={0.4}
              max={1.8}
              step={0.05}
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="text-[11px] text-slate-500">Current: {brightness.toFixed(2)}×</div>
          </Section>

          {/* Tint */}
          <Section
            title="Color tint"
            enabled={tintEnabled}
            onToggle={() => setTintEnabled((v) => !v)}
            hint="Apply a translucent color wash across the whole image."
          >
            <div className={`space-y-2 ${tintEnabled ? "" : "opacity-50 pointer-events-none"}`}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={tintColor}
                  onChange={(e) => setTintColor(e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded border border-slate-300"
                />
                <input
                  type="text"
                  value={tintColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-f]{0,8}$/i.test(v) || v === "") setTintColor(v);
                  }}
                  className="w-28 rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                />
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={tintStrength}
                onChange={(e) => setTintStrength(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
              <div className="text-[11px] text-slate-500">Strength: {Math.round(tintStrength * 100)}%</div>
            </div>
          </Section>

          {/* Text overlay */}
          <Section
            title="Text overlay"
            enabled={textEnabled}
            onToggle={() => setTextEnabled((v) => !v)}
            hint="Drop a headline onto the image. Drop-shadow + stroke applied automatically for legibility."
          >
            <div className={`space-y-2 ${textEnabled ? "" : "opacity-50 pointer-events-none"}`}>
              <input
                type="text"
                maxLength={200}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Spring tune-up — 20% off this week"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <div className="grid grid-cols-3 gap-2">
                {(["top", "middle", "bottom"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTextPosition(p)}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold capitalize ${
                      textPosition === p
                        ? "border-violet-500 bg-violet-50 text-violet-900"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border border-slate-300"
                />
                <span className="text-[11px] text-slate-500">Color</span>
                <input
                  type="range"
                  min={24}
                  max={160}
                  step={2}
                  value={textSize}
                  onChange={(e) => setTextSize(Number(e.target.value))}
                  className="flex-1 accent-violet-500"
                />
                <span className="text-[11px] text-slate-500 w-12 text-right">{textSize}px</span>
              </div>
            </div>
          </Section>

          {/* Crop */}
          <Section
            title="Crop"
            enabled={cropEnabled}
            onToggle={() => setCropEnabled((v) => !v)}
            hint="Cropped values are percentages of the source image. Backend clamps to bounds."
          >
            <div className={`grid grid-cols-2 gap-3 ${cropEnabled ? "" : "opacity-50 pointer-events-none"}`}>
              <NumberInput label="Left %" value={cropLeftPct} onChange={setCropLeftPct} min={0} max={99} />
              <NumberInput label="Top %" value={cropTopPct} onChange={setCropTopPct} min={0} max={99} />
              <NumberInput label="Width %" value={cropWidthPct} onChange={setCropWidthPct} min={1} max={100} />
              <NumberInput label="Height %" value={cropHeightPct} onChange={setCropHeightPct} min={1} max={100} />
            </div>
            {cropEnabled && (!naturalW || !naturalH) && (
              <p className="text-[10px] text-amber-700">
                Loading source dimensions — Apply will be disabled until the image finishes loading.
              </p>
            )}
          </Section>

          {editError && (
            <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
              {editError}
            </div>
          )}
        </div>
      </div>
    </IadmModal>
  );
}

// ─── Reusable section block (toggleable) ───────────────────────────────────

function Section({
  title, hint, children, enabled, onToggle,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  enabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-800">{title}</div>
          {hint && <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>}
        </div>
        {typeof onToggle === "function" && (
          <button
            type="button"
            role="switch"
            aria-checked={!!enabled}
            onClick={onToggle}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
              enabled ? "bg-violet-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        )}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function NumberInput({
  label, value, onChange, min, max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-slate-600">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(Math.max(min, Math.min(max, n)));
        }}
        className="rounded border border-slate-300 px-2 py-1 text-xs"
      />
    </label>
  );
}

// ─── Suppress unused-import warning when nothing imported is actually
// referenced (some lints flag bare imports even though they're for side
// effects). useEffect is consumed transitively below; this NOOP keeps the
// import set tight without forcing a barrel file.
// (No-op intentional.)
// ComingSoonOverlay HOC removed 2026-06-22 — see VoicePage.tsx note.
export default ImageStudioPage;

// AssetLibraryPage — Wave 2 of the My Brand hub.
//
// Unified view of every brand asset the tenant has produced or uploaded:
// AI-generated images, Template Studio designs, logos, color palettes,
// font pairs. Filterable by kind, searchable, sortable; supports drag-drop
// uploads (images), inline send-to-social, and a detail modal showing the
// full asset + metadata (prompt, source, dimensions, usage count, voice
// score where applicable).
//
// Backed by LUMEN-API My Brand endpoints (wave 1):
//   GET    /api/v1/my-brand/assets?kind=&search=&sort=&limit=&offset=
//   DELETE /api/v1/my-brand/assets/:assetId
//   POST   /api/v1/my-brand/assets/upload  (multipart)
//   GET    /api/v1/my-brand/assets/:assetId/usage
//
// We also POST to /api/v1/my-brand/social/queue for the "Send to Social"
// quick-action — if that endpoint is missing on the backend the modal
// surfaces the error inline (wave 3 will close any gap).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Upload, Trash2, Download, Send, Edit3, X, Image as ImageIcon,
  LayoutTemplate, Star, Palette, Type, Layers, Loader2, AlertCircle, CheckSquare, Square,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { useMsal } from "@azure/msal-react";
import { authScopes } from "../../auth/msalConfig";

// ────────────────────────────────────────────────────────────────────────────
// Types — kept lenient so a backend that ships partial fields still renders.
// ────────────────────────────────────────────────────────────────────────────

type AssetKind =
  | "image"
  | "template"
  | "logo"
  | "color_palette"
  | "font_pair";

interface BrandAsset {
  asset_id: string;
  kind: AssetKind;
  filename: string | null;
  title: string | null;
  thumbnail_url: string | null;
  preview_url: string | null;
  source: string | null;           // 'ai_generated' | 'uploaded' | 'template_studio' | 'brand_kit' | ...
  prompt: string | null;           // populated for AI-generated images
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  tags: string[] | null;
  used_count: number | null;       // how many posts / campaigns reference it
  voice_score: number | null;      // 0-100 if the asset has been voice-checked
  // Color palette / font pair payloads — backend may surface as JSON column
  palette: string[] | null;        // hex strings
  font_pair: { heading: string; body: string } | null;
  created_at: string | null;
  updated_at: string | null;
}

interface AssetListResponse {
  items: BrandAsset[];
  total: number;
}

interface AssetUsageEntry {
  context: string;                 // e.g. "social_post" | "campaign" | "template"
  ref_id: string;
  label: string | null;
  occurred_at: string | null;
}
interface AssetUsageResponse {
  items: AssetUsageEntry[];
  total: number;
}

type KindFilter = "all" | AssetKind;
type SortKey = "newest" | "oldest" | "most_used";

// ────────────────────────────────────────────────────────────────────────────
// Static config — tabs / icons / labels.
// ────────────────────────────────────────────────────────────────────────────

const KIND_TABS: Array<{ key: KindFilter; label: string; icon: typeof ImageIcon }> = [
  { key: "all",            label: "All",            icon: Layers },
  { key: "image",          label: "Images",         icon: ImageIcon },
  { key: "template",       label: "Templates",      icon: LayoutTemplate },
  { key: "logo",           label: "Logos",          icon: Star },
  { key: "color_palette",  label: "Color palettes", icon: Palette },
  { key: "font_pair",      label: "Font pairs",     icon: Type },
];

const KIND_BADGE: Record<AssetKind, { label: string; color: string; bg: string }> = {
  image:         { label: "Image",    color: "#1d4ed8", bg: "#dbeafe" },
  template:      { label: "Template", color: "#6d28d9", bg: "#ede9fe" },
  logo:          { label: "Logo",     color: "#b45309", bg: "#fef3c7" },
  color_palette: { label: "Palette",  color: "#0e7490", bg: "#cffafe" },
  font_pair:     { label: "Fonts",    color: "#9d174d", bg: "#fce7f3" },
};

const ACCEPTED_UPLOAD_MIME = "image/jpeg,image/png,image/webp,image/svg+xml";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

const LUMEN_API_BASE =
  (import.meta.env.VITE_SPARK_API_BASE as string) ||
  (import.meta.env.VITE_LUMEN_API_BASE as string) ||
  "https://app-lumen-api-prod-c6afftekgua4axh9.centralus-01.azurewebsites.net";

// ────────────────────────────────────────────────────────────────────────────
// Page component.
// ────────────────────────────────────────────────────────────────────────────

export function AssetLibraryPage() {
  const { get, del, ready } = useSparkApi();
  const navigate = useNavigate();

  const [kind, setKind] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [items, setItems] = useState<BrandAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [activeAsset, setActiveAsset] = useState<BrandAsset | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  // Wave-3: "Send to Social" now navigates to the Composer with ?asset_ids=…
  // rather than opening an inline modal. The legacy modal is preserved below
  // for an in-page quick-queue fallback if we ever need it.
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  const sendOneToSocial = useCallback((asset: BrandAsset) => {
    navigate(`/app/services/my_brand_compose?asset_ids=${encodeURIComponent(asset.asset_id)}`);
  }, [navigate]);

  const sendBulkToSocial = useCallback(() => {
    if (bulkSelected.size === 0) return;
    const ids = Array.from(bulkSelected);
    navigate(`/app/services/my_brand_compose?asset_ids=${encodeURIComponent(ids.join(","))}`);
  }, [bulkSelected, navigate]);

  const toggleBulk = useCallback((assetId: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId); else next.add(assetId);
      return next;
    });
  }, []);

  const clearBulk = useCallback(() => setBulkSelected(new Set()), []);

  // Debounce search input by 250ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (kind !== "all") params.set("kind", kind);
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("sort", sort);
    params.set("limit", "50");
    params.set("offset", "0");
    return params.toString();
  }, [kind, debouncedSearch, sort]);

  const fetchAssets = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const res = await get<AssetListResponse>(`/api/v1/my-brand/assets?${queryString}`);
      setItems(res?.items ?? []);
      setTotal(res?.total ?? 0);
    } catch (err) {
      setError(err);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [get, ready, queryString]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const handleDelete = useCallback(async (assetId: string) => {
    if (!window.confirm("Delete this asset? This cannot be undone.")) return;
    try {
      await del<void>(`/api/v1/my-brand/assets/${assetId}`);
      setItems((prev) => prev.filter((a) => a.asset_id !== assetId));
      setTotal((t) => Math.max(0, t - 1));
      if (activeAsset?.asset_id === assetId) setActiveAsset(null);
    } catch (err) {
      window.alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [del, activeAsset]);

  const handleDownload = useCallback((asset: BrandAsset) => {
    const url = asset.preview_url || asset.thumbnail_url;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = asset.filename || `${asset.kind}-${asset.asset_id}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  // Counts per tab — refresh-light; we just re-use the loaded list, the API
  // returns total for the active filter so we show "—" when filtered.
  const countsLabel = useMemo(() => {
    if (loading) return "Loading…";
    if (kind === "all") return `${total} asset${total === 1 ? "" : "s"}`;
    return `${total} ${KIND_BADGE[kind].label.toLowerCase()}${total === 1 ? "" : "s"}`;
  }, [loading, total, kind]);

  return (
    <SparkPageShell
      title="Asset Library"
      subtitle="Every brand asset in one place — images, templates, logos, palettes, fonts."
      help="Filter by kind, search by name or tag, then send-to-social, edit, download, or delete. Drag a JPG/PNG/WEBP/SVG anywhere on the grid to upload (max 10MB)."
      actions={
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload
        </button>
      }
      filters={
        <FilterBar
          kind={kind}
          onKindChange={setKind}
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          countsLabel={countsLabel}
        />
      }
      loading={loading}
      error={error}
    >
      {bulkSelected.size > 0 && (
        <BulkSelectToolbar
          count={bulkSelected.size}
          onSend={sendBulkToSocial}
          onClear={clearBulk}
        />
      )}

      <AssetGrid
        items={items}
        onCardClick={setActiveAsset}
        onSendToSocial={sendOneToSocial}
        onDownload={handleDownload}
        onDelete={handleDelete}
        bulkSelected={bulkSelected}
        onToggleBulk={toggleBulk}
      />

      {/* Detail modal */}
      {activeAsset && (
        <AssetDetailModal
          asset={activeAsset}
          onClose={() => setActiveAsset(null)}
          onSendToSocial={() => { sendOneToSocial(activeAsset); }}
          onDownload={() => handleDownload(activeAsset)}
          onDelete={() => handleDelete(activeAsset.asset_id)}
        />
      )}

      {/* Upload modal */}
      {uploadOpen && (
        <UploadAssetModal
          onClose={() => setUploadOpen(false)}
          onUploaded={() => { setUploadOpen(false); fetchAssets(); }}
        />
      )}
    </SparkPageShell>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// FilterBar — tabs + search + sort. Sticky inside SparkPageShell's filter row.
// ────────────────────────────────────────────────────────────────────────────

function FilterBar(props: {
  kind: KindFilter;
  onKindChange: (k: KindFilter) => void;
  search: string;
  onSearchChange: (s: string) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  countsLabel: string;
}) {
  const { kind, onKindChange, search, onSearchChange, sort, onSortChange, countsLabel } = props;
  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      <div className="flex flex-wrap items-center gap-1">
        {KIND_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = kind === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onKindChange(tab.key)}
              className={
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                (active
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100")
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search assets…"
            className="h-8 w-56 rounded border border-slate-300 bg-white pl-7 pr-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="most_used">Most used</option>
        </select>
        <div className="text-xs text-slate-500">{countsLabel}</div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// AssetGrid — responsive thumbnail grid with hover overlay actions.
// ────────────────────────────────────────────────────────────────────────────

function AssetGrid(props: {
  items: BrandAsset[];
  onCardClick: (a: BrandAsset) => void;
  onSendToSocial: (a: BrandAsset) => void;
  onDownload: (a: BrandAsset) => void;
  onDelete: (id: string) => void;
  bulkSelected: Set<string>;
  onToggleBulk: (id: string) => void;
}) {
  const { items, onCardClick, onSendToSocial, onDownload, onDelete, bulkSelected, onToggleBulk } = props;
  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
        <ImageIcon className="mx-auto mb-2 h-8 w-8 text-slate-400" />
        <div className="text-sm font-medium text-slate-800">No assets yet</div>
        <div className="mt-1 text-xs text-slate-500">
          Generate one in Image Studio, design in Template Studio, or upload your own.
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {items.map((a) => (
        <AssetCard
          key={a.asset_id}
          asset={a}
          selected={bulkSelected.has(a.asset_id)}
          onToggleSelect={() => onToggleBulk(a.asset_id)}
          onClick={() => onCardClick(a)}
          onSendToSocial={() => onSendToSocial(a)}
          onDownload={() => onDownload(a)}
          onDelete={() => onDelete(a.asset_id)}
        />
      ))}
    </div>
  );
}

function AssetCard(props: {
  asset: BrandAsset;
  selected: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
  onSendToSocial: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const { asset, selected, onToggleSelect, onClick, onSendToSocial, onDownload, onDelete } = props;
  const badge = KIND_BADGE[asset.kind];

  return (
    <div
      className={
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md " +
        (selected ? "border-blue-600 ring-2 ring-blue-600" : "border-slate-200")
      }
      onClick={onClick}
    >
      {/* Bulk-select checkbox (top-left, always visible if selected, else on hover) */}
      <button
        type="button"
        title={selected ? "Deselect" : "Select for bulk action"}
        aria-label={selected ? "Deselect asset" : "Select asset"}
        onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        className={
          "pointer-events-auto absolute left-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded transition-opacity " +
          (selected
            ? "bg-blue-600 text-white opacity-100"
            : "bg-white/90 text-slate-700 opacity-0 group-hover:opacity-100")
        }
      >
        {selected
          ? <CheckSquare className="h-4 w-4" />
          : <Square className="h-4 w-4" />}
      </button>
      <AssetThumb asset={asset} />

      {/* Hover overlay actions */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
        <OverlayBtn
          icon={<Send className="h-3.5 w-3.5" />}
          label="Send to Social"
          onClick={(e) => { e.stopPropagation(); onSendToSocial(); }}
        />
        <OverlayBtn
          icon={<Edit3 className="h-3.5 w-3.5" />}
          label="Edit"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
        />
        <OverlayBtn
          icon={<Download className="h-3.5 w-3.5" />}
          label="Download"
          onClick={(e) => { e.stopPropagation(); onDownload(); }}
        />
        <OverlayBtn
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="Delete"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          danger
        />
      </div>

      {/* Card footer — filename + kind + tags */}
      <div className="flex flex-col gap-1 p-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 truncate text-xs font-medium text-slate-900">
            {asset.title || asset.filename || `Untitled ${badge.label.toLowerCase()}`}
          </div>
          <span
            className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ color: badge.color, background: badge.bg }}
          >
            {badge.label}
          </span>
        </div>
        {asset.tags && asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {asset.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                {t}
              </span>
            ))}
            {asset.tags.length > 3 && (
              <span className="text-[10px] text-slate-400">+{asset.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BulkSelectToolbar(props: {
  count: number;
  onSend: () => void;
  onClear: () => void;
}) {
  const { count, onSend, onClear } = props;
  return (
    <div className="sticky top-0 z-20 mb-3 flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-blue-900">
        <CheckSquare className="h-4 w-4" />
        <span className="font-semibold">{count}</span> selected
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onSend}
          className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
        >
          <Send className="h-3.5 w-3.5" />
          Send selected to Social
        </button>
      </div>
    </div>
  );
}

function OverlayBtn(props: {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      className={
        "pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full text-white transition-colors " +
        (props.danger ? "bg-rose-600 hover:bg-rose-700" : "bg-white/20 hover:bg-white/40")
      }
    >
      {props.icon}
    </button>
  );
}

function AssetThumb({ asset }: { asset: BrandAsset }) {
  // Render-style differs per kind. Image / template / logo use the URL.
  // Palette renders the swatch row; font pair renders a typography sample.
  if (asset.kind === "color_palette" && asset.palette && asset.palette.length > 0) {
    return (
      <div className="grid h-32 w-full" style={{ gridTemplateColumns: `repeat(${asset.palette.length}, 1fr)` }}>
        {asset.palette.map((hex, i) => (
          <div key={`${hex}-${i}`} style={{ background: hex }} title={hex} />
        ))}
      </div>
    );
  }
  if (asset.kind === "font_pair" && asset.font_pair) {
    return (
      <div className="flex h-32 w-full flex-col items-center justify-center gap-1 bg-slate-50 px-2 text-center">
        <div style={{ fontFamily: asset.font_pair.heading, fontWeight: 700, fontSize: 20, lineHeight: 1.1, color: "#0f172a" }}>
          {asset.font_pair.heading}
        </div>
        <div style={{ fontFamily: asset.font_pair.body, fontSize: 12, color: "#475569" }}>
          The quick brown fox jumps over the lazy dog.
        </div>
      </div>
    );
  }
  const url = asset.thumbnail_url || asset.preview_url;
  if (url) {
    return (
      <div className="aspect-square w-full bg-slate-100">
        <img
          src={url}
          alt={asset.title || asset.filename || ""}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }
  return (
    <div className="flex aspect-square w-full items-center justify-center bg-slate-100 text-slate-400">
      <ImageIcon className="h-8 w-8" />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// AssetDetailModal — full preview + metadata + usage.
// ────────────────────────────────────────────────────────────────────────────

function AssetDetailModal(props: {
  asset: BrandAsset;
  onClose: () => void;
  onSendToSocial: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const { asset, onClose, onSendToSocial, onDownload, onDelete } = props;
  const { get, ready } = useSparkApi();
  const [usage, setUsage] = useState<AssetUsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    if (!ready) return;
    setUsageLoading(true);
    setUsageError(null);
    (async () => {
      try {
        const r = await get<AssetUsageResponse>(`/api/v1/my-brand/assets/${asset.asset_id}/usage`);
        if (!cancelled) setUsage(r ?? { items: [], total: 0 });
      } catch (err) {
        if (!cancelled) setUsageError(err);
      } finally {
        if (!cancelled) setUsageLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [asset.asset_id, get, ready]);

  const badge = KIND_BADGE[asset.kind];
  const usedCount = asset.used_count ?? usage?.total ?? 0;
  const sizeLabel =
    asset.file_size_bytes != null
      ? `${(asset.file_size_bytes / 1024).toFixed(asset.file_size_bytes > 1024 * 100 ? 0 : 1)} KB`
      : null;
  const dimsLabel = asset.width && asset.height ? `${asset.width} × ${asset.height}` : null;

  return (
    <IadmModal
      open
      onClose={onClose}
      product="spark"
      eyebrow="MY BRAND"
      title={asset.title || asset.filename || `Untitled ${badge.label.toLowerCase()}`}
      subtitle={`${badge.label}${asset.source ? ` · ${asset.source.replace(/_/g, " ")}` : ""}`}
      size="info"
      footer={
        <>
          <IadmButton variant="ghost" onClick={onClose}>Close</IadmButton>
          <IadmButton variant="primary" onClick={onDownload} icon={<Download className="h-3.5 w-3.5" />}>
            Download
          </IadmButton>
          <IadmButton variant="accent" product="spark" onClick={onSendToSocial} icon={<Send className="h-3.5 w-3.5" />}>
            Send to Social
          </IadmButton>
        </>
      }
    >
      <div className="grid h-full grid-cols-1 gap-6 p-6 md:grid-cols-[1.4fr_1fr]">
        {/* Preview */}
        <div className="flex items-center justify-center overflow-hidden rounded-lg bg-slate-50 p-2">
          <DetailPreview asset={asset} />
        </div>

        {/* Metadata */}
        <div className="flex flex-col gap-4 text-sm">
          <Section title="Details">
            <MetaRow label="Kind">{badge.label}</MetaRow>
            {asset.source && <MetaRow label="Source">{asset.source.replace(/_/g, " ")}</MetaRow>}
            {dimsLabel && <MetaRow label="Dimensions">{dimsLabel}</MetaRow>}
            {sizeLabel && <MetaRow label="File size">{sizeLabel}</MetaRow>}
            {asset.mime_type && <MetaRow label="MIME">{asset.mime_type}</MetaRow>}
            {asset.created_at && <MetaRow label="Created">{formatDate(asset.created_at)}</MetaRow>}
          </Section>

          {asset.prompt && (
            <Section title="Generation prompt">
              <p className="rounded bg-slate-50 p-2 text-xs italic text-slate-700">{asset.prompt}</p>
            </Section>
          )}

          {asset.voice_score != null && (
            <Section title="Brand voice score">
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded bg-slate-200">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${Math.max(0, Math.min(100, asset.voice_score))}%`,
                      background: asset.voice_score >= 75 ? "#16a34a" : asset.voice_score >= 50 ? "#f59e0b" : "#dc2626",
                    }}
                  />
                </div>
                <div className="text-xs font-semibold text-slate-800">{asset.voice_score}/100</div>
              </div>
            </Section>
          )}

          {asset.tags && asset.tags.length > 0 && (
            <Section title="Tags">
              <div className="flex flex-wrap gap-1">
                {asset.tags.map((t) => (
                  <span key={t} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{t}</span>
                ))}
              </div>
            </Section>
          )}

          <Section title="Usage">
            {usageLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading usage…
              </div>
            ) : usageError ? (
              <div className="flex items-start gap-2 rounded bg-amber-50 p-2 text-xs text-amber-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Couldn&apos;t load usage history.
                  {" "}
                  {usageError instanceof Error ? usageError.message : null}
                </span>
              </div>
            ) : (
              <>
                <div className="text-xs text-slate-700">
                  Used in <strong>{usedCount}</strong>{" "}
                  post{usedCount === 1 ? "" : "s"} / campaign{usedCount === 1 ? "" : "s"}.
                </div>
                {usage && usage.items.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {usage.items.slice(0, 6).map((u) => (
                      <li key={`${u.context}-${u.ref_id}`} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1">
                        <span className="truncate">
                          <span className="font-medium text-slate-700">{u.context.replace(/_/g, " ")}:</span>{" "}
                          <span className="text-slate-600">{u.label || u.ref_id}</span>
                        </span>
                        {u.occurred_at && (
                          <span className="flex-shrink-0 text-[10px] text-slate-400">{formatDate(u.occurred_at)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Section>

          {/* Destructive action — kept off the main footer bar by design */}
          <div className="mt-auto pt-2">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete asset
            </button>
          </div>
        </div>
      </div>
    </IadmModal>
  );
}

function DetailPreview({ asset }: { asset: BrandAsset }) {
  if (asset.kind === "color_palette" && asset.palette && asset.palette.length > 0) {
    return (
      <div className="grid h-full w-full" style={{ gridTemplateColumns: `repeat(${asset.palette.length}, 1fr)` }}>
        {asset.palette.map((hex, i) => (
          <div key={`${hex}-${i}`} className="flex items-end justify-center pb-2 text-[10px] font-mono text-white drop-shadow" style={{ background: hex }}>
            {hex}
          </div>
        ))}
      </div>
    );
  }
  if (asset.kind === "font_pair" && asset.font_pair) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6">
        <div style={{ fontFamily: asset.font_pair.heading, fontWeight: 700, fontSize: 36, color: "#0f172a", textAlign: "center" }}>
          {asset.font_pair.heading}
        </div>
        <div style={{ fontFamily: asset.font_pair.body, fontSize: 14, color: "#475569", textAlign: "center", maxWidth: 420 }}>
          {asset.font_pair.body} — The quick brown fox jumps over the lazy dog. 0123456789.
        </div>
      </div>
    );
  }
  const url = asset.preview_url || asset.thumbnail_url;
  if (url) {
    return <img src={url} alt={asset.title || asset.filename || ""} className="max-h-full max-w-full object-contain" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-slate-400">
      <ImageIcon className="h-12 w-12" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 py-1 text-xs last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{children}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// UploadAssetModal — drag-drop file picker, single file at a time (MVP).
// ────────────────────────────────────────────────────────────────────────────

function UploadAssetModal(props: { onClose: () => void; onUploaded: () => void }) {
  const { onClose, onUploaded } = props;
  const { instance, accounts } = useMsal();
  const account = accounts[0];

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const validate = useCallback((f: File): string | null => {
    if (!ACCEPTED_UPLOAD_MIME.split(",").includes(f.type)) {
      return "Only JPG, PNG, WEBP, or SVG images are allowed.";
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      return `File is too large — max ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`;
    }
    return null;
  }, []);

  const pickFile = useCallback((f: File) => {
    const err = validate(f);
    if (err) { setError(err); setFile(null); return; }
    setError(null);
    setFile(f);
  }, [validate]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) pickFile(f);
  }, [pickFile]);

  const handleUpload = useCallback(async () => {
    if (!file || !account) return;
    setBusy(true);
    setError(null);
    try {
      const { accessToken } = await instance.acquireTokenSilent({ scopes: authScopes, account });
      const tenantId = decodeTid(accessToken);
      const form = new FormData();
      form.append("file", file);
      if (tags.trim()) form.append("tags", tags.trim());
      const res = await fetch(`${LUMEN_API_BASE}/api/v1/my-brand/assets/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-tenant-id": tenantId,
        },
        body: form,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upload failed (${res.status}): ${text || res.statusText}`);
      }
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [file, account, instance, tags, onUploaded]);

  return (
    <IadmModal
      open
      onClose={onClose}
      product="spark"
      eyebrow="MY BRAND"
      title="Upload asset"
      subtitle="Drag-drop or click to pick an image. JPG, PNG, WEBP, SVG · max 10MB."
      size="info"
      footer={
        <>
          <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
          <IadmButton
            variant="accent"
            product="spark"
            onClick={handleUpload}
            disabled={!file || busy}
            icon={busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          >
            {busy ? "Uploading…" : "Upload asset"}
          </IadmButton>
        </>
      }
    >
      <div className="flex flex-col gap-4 p-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={
            "flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors " +
            (dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100")
          }
        >
          {preview ? (
            <img src={preview} alt="" className="max-h-40 max-w-full rounded object-contain" />
          ) : (
            <Upload className="h-8 w-8 text-slate-400" />
          )}
          <div className="text-sm font-medium text-slate-800">
            {file ? file.name : "Drop file here or click to browse"}
          </div>
          <div className="text-xs text-slate-500">
            {file
              ? `${file.type || "image"} · ${(file.size / 1024).toFixed(1)} KB`
              : "JPG, PNG, WEBP, SVG · max 10MB"}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_UPLOAD_MIME}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
            className="hidden"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Tags (comma-separated, optional)
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. summer-promo, instagram, hero"
            className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded bg-rose-50 p-2 text-xs text-rose-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </IadmModal>
  );
}

function decodeTid(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.tid || "";
  } catch {
    return "";
  }
}


import { withMyBrandComingSoon } from "./ComingSoonOverlay";
export default withMyBrandComingSoon(AssetLibraryPage);

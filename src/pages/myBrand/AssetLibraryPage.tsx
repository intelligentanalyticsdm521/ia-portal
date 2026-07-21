// AssetLibraryPage — Wave 2 of the My Brand hub.
//
// Unified view of every brand asset the tenant has produced or uploaded:
// AI-generated images, Template Studio designs, logos, color palettes,
// font pairs. Filterable by kind, searchable, sortable (all client-side over
// one fetch); supports uploads (images, drag-drop inside the Upload modal),
// send-to-social, and a detail modal showing the full asset + metadata
// (prompt, source, dimensions, usage count, voice score where applicable).
//
// Backed by LUMEN-API My Brand endpoints (wave 1):
//   GET    /api/v1/my-brand/assets?limit=&offset=
//   DELETE /api/v1/my-brand/assets/:assetId
//   POST   /api/v1/my-brand/assets/upload  (multipart)
//   GET    /api/v1/my-brand/assets/:assetId/usage
//
// "Send to Social" navigates to the Composer with ?asset_ids=…
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, Trash2, Download, Send, ArrowRight, Image as ImageIcon,
  Loader2, AlertCircle, CheckSquare, Square,
} from "lucide-react";
import { useMsal } from "@azure/msal-react";
import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { acquireApiToken } from "../../lib/msalToken";
import { emergencyActAsHeaders } from "../../lib/emergencyActAs";
import { getCurrentTenantOverride, useClientTenantIdOverride } from "../../lib/tenantContext";
import { useActiveAccount } from "../../auth/useAccessToken";

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
// Static config — tabs / labels.
// ────────────────────────────────────────────────────────────────────────────

const KIND_TABS: Array<{ key: KindFilter; label: string }> = [
  { key: "all",            label: "All" },
  { key: "image",          label: "Images" },
  { key: "template",       label: "Templates" },
  { key: "logo",           label: "Logos" },
  { key: "color_palette",  label: "Color palettes" },
  { key: "font_pair",      label: "Font pairs" },
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

// Mirrors the private SPARK_API_BASE in src/lib/sparkApi.ts (not exported —
// keeping the shared client untouched, so the fallback chain is repeated here).
const LUMEN_API_BASE =
  (import.meta.env.VITE_SPARK_API_BASE as string) ||
  (import.meta.env.VITE_LUMEN_API_BASE as string) ||
  "https://app-lumen-api-prod-c6afftekgua4axh9.centralus-01.azurewebsites.net";

// ────────────────────────────────────────────────────────────────────────────
// Upload helper — same auth + tenant seams as the shared sparkFetch client
// (token via acquireApiToken, tenant precedence: explicit override > view-as
// override > AppState activeTenantId > JWT tid last-resort), but multipart
// FormData, so it must NOT set the JSON Content-Type sparkFetch hardcodes
// (the browser supplies the multipart boundary). sparkApi.ts keeps its fetch
// core private, so this lives page-locally instead of forking shared code.
// ────────────────────────────────────────────────────────────────────────────

async function uploadBrandAsset(
  msal: IPublicClientApplication,
  account: AccountInfo,
  form: FormData,
  tenantOverride: string | null
): Promise<void> {
  const token = await acquireApiToken(msal, account);
  const viewAsTid = getCurrentTenantOverride();
  const tenantId =
    (tenantOverride && tenantOverride.trim()) ||
    (viewAsTid && viewAsTid.trim()) ||
    readActiveTenantId() ||
    decodeTid(token);

  const res = await fetch(`${LUMEN_API_BASE}/api/v1/my-brand/assets/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-id": tenantId,
      ...emergencyActAsHeaders(),
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text || res.statusText}`);
  }
}

// The user's REAL active IADM tenant (AppState → STORAGE_KEYS.activeTenantId).
// Same read the shared API clients use (sparkApi.ts readActiveTenantId). The
// shared CIAM JWT `tid` resolves to the FOUNDER tenant for every user, so it
// is only the last-resort fallback below — never the primary scope.
function readActiveTenantId(): string {
  try {
    return (localStorage.getItem("iadm.portal.activeTenantId") || "").trim();
  } catch {
    return "";
  }
}

function decodeTid(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.tid || "";
  } catch {
    return "";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Page component.
// ────────────────────────────────────────────────────────────────────────────

export function AssetLibraryPage() {
  const { get, del, ready } = useSparkApi();
  const navigate = useNavigate();

  const [kind, setKind] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [items, setItems] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [activeAsset, setActiveAsset] = useState<BrandAsset | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BrandAsset | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  // Fetch ONCE, gated on `ready` — kind/search/sort are applied client-side
  // in the useMemo below (canonical SparkTemplatesPage pattern; no
  // render-driven refetch per facet change).
  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const res = await get<AssetListResponse>("/api/v1/my-brand/assets?limit=200&offset=0");
      setItems(res?.items ?? []);
    } catch (err) {
      setError(err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  // All filtering + sorting client-side over the one fetched list.
  const rows = useMemo(() => {
    let list = items;
    if (kind !== "all") list = list.filter((a) => a.kind === kind);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) =>
        (a.title || "").toLowerCase().includes(q) ||
        (a.filename || "").toLowerCase().includes(q) ||
        (a.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    const sorted = [...list];
    if (sort === "newest") {
      sorted.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    } else if (sort === "oldest") {
      sorted.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
    } else {
      sorted.sort((a, b) => (b.used_count ?? 0) - (a.used_count ?? 0));
    }
    return sorted;
  }, [items, kind, search, sort]);

  // Delete flow — confirm via IadmModal size="confirm" (window.confirm is
  // forbidden); errors surface inline in the confirm modal.
  const requestDelete = useCallback((asset: BrandAsset) => {
    setDeleteError(null);
    setConfirmDelete(asset);
  }, []);

  const performDelete = useCallback(async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.asset_id;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await del<void>(`/api/v1/my-brand/assets/${id}`);
      setItems((prev) => prev.filter((a) => a.asset_id !== id));
      setBulkSelected((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (activeAsset?.asset_id === id) setActiveAsset(null);
      setConfirmDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteBusy(false);
    }
  }, [confirmDelete, del, activeAsset]);

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

  const countsLabel = useMemo(() => {
    if (loading) return "Loading…";
    if (kind === "all" && !search.trim()) {
      return `${rows.length} asset${rows.length === 1 ? "" : "s"}`;
    }
    return `${rows.length} of ${items.length} asset${items.length === 1 ? "" : "s"}`;
  }, [loading, rows.length, items.length, kind, search]);

  return (
    <SparkPageShell
      title="Asset Library"
      subtitle="Every brand asset in one place — images, templates, logos, palettes, fonts."
      help="Filter by kind, search by name or tag, then open any asset to send it to social, download, or delete it. Click Upload to add your own JPG, PNG, WEBP, or SVG images (max 10MB — drag-drop inside the upload window)."
      actions={
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25]"
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
        items={rows}
        onCardOpen={setActiveAsset}
        onUpload={() => setUploadOpen(true)}
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
          onDelete={() => requestDelete(activeAsset)}
        />
      )}

      {/* Upload modal */}
      {uploadOpen && (
        <UploadAssetModal
          onClose={() => setUploadOpen(false)}
          onUploaded={() => { setUploadOpen(false); load(); }}
        />
      )}

      {/* Delete confirm — rendered last so it stacks above the detail modal. */}
      {confirmDelete && (
        <IadmModal
          open
          onClose={() => { if (!deleteBusy) setConfirmDelete(null); }}
          product="spark"
          eyebrow="MY BRAND · ASSET"
          title="Delete asset?"
          size="confirm"
          footer={
            <>
              <IadmButton variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deleteBusy}>
                Cancel
              </IadmButton>
              <button
                type="button"
                onClick={performDelete}
                disabled={deleteBusy}
                className="inline-flex items-center gap-1 rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteBusy
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />}
                Delete asset
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-3 p-5 text-sm text-slate-700">
            <p>
              <strong>
                {confirmDelete.title || confirmDelete.filename || `This ${KIND_BADGE[confirmDelete.kind].label.toLowerCase()}`}
              </strong>{" "}
              will be permanently deleted. This cannot be undone.
            </p>
            {deleteError && (
              <div className="flex items-start gap-2 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}
          </div>
        </IadmModal>
      )}
    </SparkPageShell>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// FilterBar — canonical segmented control + sort + search, in the shell's
// `filters` slot (class recipes from SparkTemplatesPage).
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
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {KIND_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onKindChange(tab.key)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              kind === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="most_used">Most used</option>
        </select>
        <input
          type="search"
          placeholder="Search assets"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="text-xs border border-slate-300 rounded-md px-2 py-1 w-44"
        />
        <div className="text-xs text-slate-500">{countsLabel}</div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// AssetGrid — library-item cards: the whole card is a <button> opening the
// detail modal (canonical library card). Per-card actions live in the modal.
// ────────────────────────────────────────────────────────────────────────────

function AssetGrid(props: {
  items: BrandAsset[];
  onCardOpen: (a: BrandAsset) => void;
  onUpload: () => void;
  bulkSelected: Set<string>;
  onToggleBulk: (id: string) => void;
}) {
  const { items, onCardOpen, onUpload, bulkSelected, onToggleBulk } = props;
  if (!items.length) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <ImageIcon className="h-7 w-7 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">No assets yet</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Generate one in Image Studio, design in Template Studio, or upload your own.
        </p>
        <button
          type="button"
          onClick={onUpload}
          className="mt-4 inline-flex items-center gap-1 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25]"
        >
          <Upload className="h-3.5 w-3.5" /> Upload asset
        </button>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {items.map((a) => (
        <AssetCard
          key={a.asset_id}
          asset={a}
          selected={bulkSelected.has(a.asset_id)}
          selectionActive={bulkSelected.size > 0}
          onToggleSelect={() => onToggleBulk(a.asset_id)}
          onOpen={() => onCardOpen(a)}
        />
      ))}
    </div>
  );
}

function AssetCard(props: {
  asset: BrandAsset;
  selected: boolean;
  selectionActive: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const { asset, selected, selectionActive, onToggleSelect, onOpen } = props;
  const badge = KIND_BADGE[asset.kind];

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className={
          "flex w-full flex-col overflow-hidden rounded-lg border bg-white text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5 " +
          (selected ? "border-[#EF6C33] ring-2 ring-[#EF6C33]" : "border-slate-200")
        }
      >
        <AssetThumb asset={asset} />

        {/* Card footer — filename + kind + tags + meta row */}
        <div className="flex w-full flex-col gap-1 p-2">
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
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            {asset.created_at && <span>{formatDate(asset.created_at)}</span>}
            {asset.used_count != null && (
              <span className="inline-flex items-center gap-0.5">
                <Send className="h-2.5 w-2.5" /> {asset.used_count}
              </span>
            )}
            <ArrowRight className="ml-auto h-3 w-3 text-[#EF6C33] opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </div>
      </button>

      {/* Bulk-select checkbox — a SIBLING of the card button (buttons can't
          nest). Always visible once a selection is active so touch users can
          keep adding; hover/focus reveal otherwise. */}
      <button
        type="button"
        title={selected ? "Deselect" : "Select for bulk send"}
        aria-label={selected ? "Deselect asset" : "Select asset"}
        onClick={onToggleSelect}
        className={
          "absolute left-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded transition-opacity " +
          (selected
            ? "bg-[#EF6C33] text-white opacity-100"
            : selectionActive
              ? "bg-white/90 text-slate-700 opacity-100"
              : "bg-white/90 text-slate-700 opacity-0 focus-visible:opacity-100 group-hover:opacity-100")
        }
      >
        {selected
          ? <CheckSquare className="h-4 w-4" />
          : <Square className="h-4 w-4" />}
      </button>
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
    <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[#EF6C33]/40 bg-[#EF6C33]/10 px-3 py-2">
      <div className="flex items-center gap-2 text-sm text-slate-800">
        <CheckSquare className="h-4 w-4 text-[#EF6C33]" />
        <span className="font-semibold">{count}</span> selected
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onSend}
          className="inline-flex items-center gap-1 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25]"
        >
          <Send className="h-3.5 w-3.5" />
          Send selected to Social
        </button>
      </div>
    </div>
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
      eyebrow="MY BRAND · ASSET"
      title={asset.title || asset.filename || `Untitled ${badge.label.toLowerCase()}`}
      subtitle={`${badge.label}${asset.source ? ` · ${asset.source.replace(/_/g, " ")}` : ""}`}
      size="info"
      footer={
        <>
          <button
            type="button"
            onClick={onDelete}
            className="mr-auto inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
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
// Auth goes through the shared token seam (acquireApiToken) + the standard
// tenant precedence via uploadBrandAsset — never the raw JWT `tid`.
// ────────────────────────────────────────────────────────────────────────────

function UploadAssetModal(props: { onClose: () => void; onUploaded: () => void }) {
  const { onClose, onUploaded } = props;
  const { instance } = useMsal();
  const account = useActiveAccount();
  const tenantOverride = useClientTenantIdOverride();

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
      const form = new FormData();
      form.append("file", file);
      if (tags.trim()) form.append("tags", tags.trim());
      await uploadBrandAsset(instance, account, form, tenantOverride);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [file, account, instance, tags, tenantOverride, onUploaded]);

  return (
    <IadmModal
      open
      onClose={onClose}
      product="spark"
      eyebrow="MY BRAND · ASSET"
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
            disabled={!file || busy || !account}
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
            (dragOver ? "border-[#EF6C33] bg-[#EF6C33]/10" : "border-slate-300 bg-slate-50 hover:bg-slate-100")
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
            className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </IadmModal>
  );
}

export default AssetLibraryPage;

// customerFiles.ts — the decisions the "Files and measurements" card makes,
// in one place.
//
// D-136, CUSTOMER_MODEL_MULTISITE_2026-09-15 §12.4.2. The card renders on a
// LOCATION (the site map, the snow-relocation plan, the photos) and on the
// customer record ("Files for the whole account"). Two screens asking the same
// four questions — what may be uploaded, how big is too big, which icon, how
// the size reads — is four places for them to start disagreeing, which is the
// lesson lib/customerModel.ts was written for.
//
// The server (oliver-api lib/customerFiles.js) is the boundary and refuses
// anything these functions would have let through. These exist so the person
// finds out before a 20 MB upload rather than after.

export const FILE_KINDS = ["site_map", "plan", "measurement", "photo", "document"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const KIND_LABEL: Record<FileKind, string> = {
  site_map: "Site map",
  plan: "Plan",
  measurement: "Measurement",
  photo: "Photo",
  document: "Document",
};

/** What each kind is FOR, in the words a dispatcher would use. */
export const KIND_HELP: Record<FileKind, string> = {
  site_map: "The plan of the property the crew reads before they drive there.",
  plan: "Snow relocation, landscape beds, irrigation zones — where things go.",
  measurement: "Square footage, linear feet, the sheet the estimate was built from.",
  photo: "What the site looks like. Damage, access, before and after.",
  document: "Contracts, insurance certificates, anything signed.",
};

/** Mirrors oliver-api lib/customerFiles.js — images and PDF, and nothing else. */
export const ACCEPTED_TYPES = [
  "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf",
] as const;

/** The `accept` attribute for the file input, from the one list. */
export const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");

/** 20 MB — the same ceiling the crew's job photos have. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export interface CustomerFile {
  customer_file_id: string;
  kind: FileKind;
  kind_label: string;
  title: string;
  content_type: string | null;
  size_bytes: number | null;
  notes: string | null;
  is_image: boolean;
  service_location_id: string | null;
  customer_account_id: number | null;
  customer_contact_id: number | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  /** The ONLY way to the bytes — an API path, behind the tenant guard. */
  content_path: string;
}

/** `kind` for display, tolerant of a value the server later adds. */
export function kindLabel(kind: string): string {
  return (KIND_LABEL as Record<string, string>)[kind] || "Document";
}

/**
 * Why this file cannot be uploaded, or null.
 *
 * An ALLOW list, exactly as the server has. A deny list ("not .exe") fails open
 * the moment somebody invents an extension, and a browser is about to be asked
 * to render whatever comes back.
 */
export function fileProblem(file: { type?: string; name?: string; size?: number } | null): string | null {
  if (!file) return "Choose a file.";
  const type = String(file.type || "").split(";")[0].trim().toLowerCase();
  if (!type || !(ACCEPTED_TYPES as readonly string[]).includes(type)) {
    return "Site maps, plans and photos are PNG, JPG, WEBP, GIF or PDF.";
  }
  const size = Number(file.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) return "That file is empty.";
  if (size > MAX_FILE_BYTES) {
    return `That file is ${formatBytes(size)}. The limit is 20 MB — the same as a job photo.`;
  }
  return null;
}

/**
 * A size a person reads, not a number of bytes.
 *
 * `null` is "we do not know", which is NOT "0 bytes": a row written before the
 * size column existed would otherwise read as an empty file.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(Number(bytes))) return "—";
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = n / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/** The date under a file, short. Invalid input reads "—", never "Invalid Date". */
export function formatFileDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** "Brandon Dean · 16 Sep 2026", or just the date when nobody is recorded. */
export function uploaderLine(file: Pick<CustomerFile, "uploaded_by_name" | "created_at">): string {
  const who = (file.uploaded_by_name || "").trim();
  const when = formatFileDate(file.created_at);
  return who ? `${who} · ${when}` : when;
}

/**
 * Whether to draw a thumbnail for this row.
 *
 * Trusts `is_image` when the server sent it and falls back to the content type,
 * so a row is never rendered as a picture on the STRENGTH of its filename —
 * "map.png" that is really a PDF would be a broken image on the crew's page.
 */
export function showsThumbnail(file: Pick<CustomerFile, "is_image" | "content_type">): boolean {
  if (typeof file.is_image === "boolean") return file.is_image;
  return String(file.content_type || "").toLowerCase().startsWith("image/");
}

/**
 * The files in the order the card shows them: site maps and plans first —
 * the two a dispatcher opens at 4am — then measurements, then everything else,
 * newest first inside each group.
 */
export function orderFiles(files: readonly CustomerFile[]): CustomerFile[] {
  const rank = (k: string) => {
    const i = (FILE_KINDS as readonly string[]).indexOf(k);
    return i === -1 ? FILE_KINDS.length : i;
  };
  return [...files].sort((a, b) => {
    const byKind = rank(a.kind) - rank(b.kind);
    if (byKind !== 0) return byKind;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/**
 * A default title from the filename: the name without its extension, so
 * "Ankeny site map.pdf" offers "Ankeny site map" rather than making somebody
 * retype it. Empty in, empty out — the form keeps Upload disabled.
 */
export function titleFromFileName(name: string | null | undefined): string {
  const base = String(name || "").split(/[\\/]/).pop() || "";
  return base.replace(/\.[a-z0-9]+$/i, "").trim();
}

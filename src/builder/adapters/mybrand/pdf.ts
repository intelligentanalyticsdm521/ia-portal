/**
 * builder/adapters/mybrand/pdf.ts — the artboard as a one-page PDF.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §14.6 listed PDF export as the one thing
 * the studio did NOT get: *"a PDF needs a new dependency, and half a PDF button
 * is worse than none"*. That was true of a PDF that lays out text, tables and
 * page breaks — which is why oliver-api carries PDFKit for proposals and
 * invoices (`lib/proposalPdf.js`). It is NOT true of this one.
 *
 * ── WHAT A DESIGN'S PDF ACTUALLY IS ───────────────────────────────────────
 * A design is already one flat picture. There is no text to reflow, no page to
 * break, no font to embed: the artboard IS the page. So the PDF is the smallest
 * useful PDF there is — one page, one image, drawn edge to edge — and that is
 * roughly forty lines of structure, not a library:
 *
 *     catalog → pages → page (MediaBox = the artboard, in points)
 *                        └ /Im0, the scene's pixels, FlateDecode'd
 *
 * The pixels come from the SAME `toDataURL("png")` the PNG download uses, so
 * "the PDF looks like the PNG" is true by construction rather than by care:
 * same fonts, same images, same layers, same brand colours, same 1:1 render.
 * Flate compression is `CompressionStream("deflate")`, which is the zlib
 * wrapper /FlateDecode expects, and is in every browser we support and in Node
 * — so the whole thing runs under `node --test` with no DOM at all.
 *
 * ── THE ONE THING THAT IS NOT OBVIOUS: HOW BIG IS THE PAGE ────────────────
 * A PDF page is measured in POINTS (1/72 in), an artboard in pixels. CSS says a
 * pixel is 1/96 in, so 1080 px → 810 pt → 11.25 in, and a screen-sized design
 * prints at 96 dpi. Two of the presets are not screens though — "Flyer
 * (Letter)" is 1275×1650 because that is 8.5×11 in at 150 dpi, and a business
 * card is 1050×600 because that is 3.5×2 in at 300 dpi. Handing a print shop a
 * 13.3-inch-wide "Letter flyer" is the defect this rule exists to avoid, so
 * `pdfPageSize()` reads the physical size off the preset (scene.ts
 * `PRINT_INCHES`, one place) and falls back to 96 dpi for everything else.
 *
 * ── NO NEW DEPENDENCY, AND NO SERVER ROUND TRIP ───────────────────────────
 * Nothing here is imported that package.json did not already have; nothing here
 * calls the network. The Media Library export still renders server-side, and
 * still produces a PNG — this is the local download, beside PNG, JPG and SVG,
 * through the SAME download helper in StudioBuilder.
 */
import { SIZE_PRESETS, PRINT_INCHES, type CanvasDoc } from "./scene";

/** One PDF point is 1/72 in; one CSS pixel is 1/96 in. The only two constants. */
const PT_PER_INCH = 72;
const CSS_DPI = 96;

/** What a download is, so the Blob and the filename cannot disagree. */
export const PDF_MIME = "application/pdf";

export interface PdfPageSize {
  /** MediaBox width, in points. */
  widthPt: number;
  /** MediaBox height, in points. */
  heightPt: number;
  /** What the artboard's pixels work out to once the page is that size. */
  dpi: number;
  /** Plain words for the export menu — "8.5 × 11 in (Letter)". */
  label: string;
}

/**
 * Artboard pixels → PDF page size. Pure, and the only place the conversion
 * happens.
 */
export function pdfPageSize(doc: Pick<CanvasDoc, "width" | "height">): PdfPageSize {
  const w = Math.max(1, Math.round(Number(doc.width) || 0));
  const h = Math.max(1, Math.round(Number(doc.height) || 0));

  const preset = SIZE_PRESETS.find((p) => p.w === w && p.h === h);
  const physical = preset ? PRINT_INCHES[preset.key] : undefined;

  const inW = physical ? physical.inches[0] : w / CSS_DPI;
  const inH = physical ? physical.inches[1] : h / CSS_DPI;

  return {
    widthPt: round2(inW * PT_PER_INCH),
    heightPt: round2(inH * PT_PER_INCH),
    dpi: Math.round(w / inW),
    // Shown to a person, so the inches are rounded to two places: A4 is 210 ×
    // 297 MILLIMETRES and its true inch figures run to four, which on a menu
    // reads as a mistake rather than as precision. The PAGE is still cut from
    // the full figures above — only the sentence is rounded.
    label: physical
      ? `${trim(round2(inW))} × ${trim(round2(inH))} in (${physical.label})`
      : `${trim(round2(inW))} × ${trim(round2(inH))} in`,
  };
}

export interface ImagePdfInput {
  /**
   * Straight RGB, three bytes a pixel, top row first. No alpha: paper is white.
   * Backed by a plain ArrayBuffer — a shared one cannot be handed to a stream.
   */
  rgb: Uint8Array<ArrayBuffer>;
  pixelWidth: number;
  pixelHeight: number;
  pageWidthPt: number;
  pageHeightPt: number;
  /** Shown in the reader's title bar. Optional. */
  title?: string;
  /** Only ever passed by the tests, so a PDF is reproducible byte for byte. */
  createdAt?: Date;
}

/** One side of a design, ready to be written as one PDF page. */
export interface ImagePdfPage {
  rgb: Uint8Array<ArrayBuffer>;
  pixelWidth: number;
  pixelHeight: number;
  pageWidthPt: number;
  pageHeightPt: number;
}

/**
 * A complete PDF, as bytes — ONE PAGE PER SIDE OF THE DESIGN (G-09).
 *
 * Round 1 delivered design 05 as two separate files because a design had one
 * artboard. A card's front and back belong in one file, and so do the two
 * sides of a flyer.
 *
 * Objects are numbered 1 (the catalog), 2 (the page tree), then THREE PER PAGE
 * — the page, its image and its content stream — and the document info last.
 * The arithmetic is three named functions rather than a running counter,
 * because an xref table that is one object out produces a file that opens in
 * one reader and not in another, and that is the worst way to find out.
 *
 * Pure: give it pixels and page sizes and it gives you a file, in a browser or
 * under `node --test`.
 */
export async function buildImagePdfPages(
  pages: ImagePdfPage[],
  opts: { title?: string; createdAt?: Date } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  if (!pages.length) throw new Error("there are no pages to print");

  const prepared = await Promise.all(pages.map(async (page, i) => {
    const px = whole(page.pixelWidth);
    const py = whole(page.pixelHeight);
    if (!px || !py) throw new Error(`page ${i + 1} has no size to print`);
    const needed = px * py * 3;
    if (page.rgb.length !== needed) {
      // Never write a PDF from a buffer that is not the picture: a short one
      // produces a file that opens, shows a torn image, and blames the printer.
      throw new Error(`the picture is ${page.rgb.length} bytes where a ${px}×${py} page needs ${needed}`);
    }
    const pageW = round2(page.pageWidthPt);
    const pageH = round2(page.pageHeightPt);
    if (!(pageW > 0) || !(pageH > 0)) throw new Error(`page ${i + 1} has no page size`);
    return { px, py, pageW, pageH, image: await flate(page.rgb) };
  }));

  const n = prepared.length;
  /** Page i's three objects. Page one's are 3, 4, 5; page two's are 6, 7, 8. */
  const pageObj = (i: number) => 3 + i * 3;
  const imageObj = (i: number) => 4 + i * 3;
  const contentObj = (i: number) => 5 + i * 3;
  const infoObj = 3 + n * 3;
  const lastObj = infoObj;

  const parts: Uint8Array[] = [];
  let at = 0;
  const put = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === "string" ? latin1(chunk) : chunk;
    parts.push(bytes);
    at += bytes.length;
  };
  /** Byte offset of every object, for the xref table. 1-based, like the ids. */
  const offsets: number[] = [];
  const startObject = (id: number) => { offsets[id] = at; };

  put("%PDF-1.4\n");
  put("%\xE2\xE3\xCF\xD3\n"); // four high bytes: "this file is binary, do not translate newlines"

  startObject(1);
  put("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  startObject(2);
  const kids = prepared.map((_, i) => `${pageObj(i)} 0 R`).join(" ");
  put(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`);

  prepared.forEach((page, i) => {
    startObject(pageObj(i));
    put(`${pageObj(i)} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.pageW} ${page.pageH}]`
      + ` /Resources << /XObject << /Im0 ${imageObj(i)} 0 R >> >> /Contents ${contentObj(i)} 0 R >>\nendobj\n`);

    startObject(imageObj(i));
    put(`${imageObj(i)} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.px} /Height ${page.py}`
      + ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`
      + ` /Length ${page.image.length} >>\nstream\n`);
    put(page.image);
    put("\nendstream\nendobj\n");

    // The whole page: scale the unit image square up to the MediaBox and draw it.
    const content = `q\n${page.pageW} 0 0 ${page.pageH} 0 0 cm\n/Im0 Do\nQ\n`;
    startObject(contentObj(i));
    put(`${contentObj(i)} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);
  });

  startObject(infoObj);
  put(`${infoObj} 0 obj\n<< /Title (${pdfText(opts.title || "Design")})`
    + ` /Producer (Intelligent Analytics My Brand Design Studio)`
    + ` /CreationDate (${pdfDate(opts.createdAt || new Date())}) >>\nendobj\n`);

  const xrefAt = at;
  let xref = `xref\n0 ${lastObj + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= lastObj; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  put(xref);
  put(`trailer\n<< /Size ${lastObj + 1} /Root 1 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(at);
  let cursor = 0;
  for (const p of parts) { out.set(p, cursor); cursor += p.length; }
  return out;
}

/**
 * One page. KEPT under its own name because it is what every existing caller
 * asks for and because a one-sided design is still the common case: this is
 * the multi-page writer handed a list of one.
 */
export async function buildImagePdf(input: ImagePdfInput): Promise<Uint8Array<ArrayBuffer>> {
  return buildImagePdfPages([{
    rgb: input.rgb,
    pixelWidth: input.pixelWidth,
    pixelHeight: input.pixelHeight,
    pageWidthPt: input.pageWidthPt,
    pageHeightPt: input.pageHeightPt,
  }], { title: input.title, createdAt: input.createdAt });
}


/* ══════════════════════════════════════════════════════════════════════════
   The browser half — the only DOM in this file
   ──────────────────────────────────────────────────────────────────────────
   Reads back the very PNG the PNG download hands the browser and turns it into
   the bytes above. Deliberately NOT a second way of asking the canvas for its
   pixels: PixelCanvas's `toDataURL` at 1:1 is the one mechanism for that, so
   the PDF cannot drift from the PNG the walk already checks.
   ══════════════════════════════════════════════════════════════════════════ */

/** The PNG data URI the canvas just produced → a one-page PDF of it. */
export async function imagePdfFromPngDataUrl(
  dataUrl: string,
  page: PdfPageSize,
  title?: string,
): Promise<Uint8Array<ArrayBuffer>> {
  return imagePdfFromPngDataUrls([dataUrl], page, title);
}

/**
 * EVERY SIDE OF THE DESIGN, IN ONE FILE (G-09).
 *
 * The caller draws each page in turn and hands the pictures over in order;
 * every page is the same size, because every page of a design is the same
 * artboard. One `PdfPageSize` for all of them says so rather than leaving it
 * to a caller to keep consistent.
 */
export async function imagePdfFromPngDataUrls(
  dataUrls: string[],
  page: PdfPageSize,
  title?: string,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!dataUrls.length) throw new Error("there are no pages to print");
  const pages: ImagePdfPage[] = [];
  for (const url of dataUrls) {
    const { rgb, width, height } = await rasterise(url);
    pages.push({
      rgb, pixelWidth: width, pixelHeight: height,
      pageWidthPt: page.widthPt, pageHeightPt: page.heightPt,
    });
  }
  return buildImagePdfPages(pages, { title });
}

async function rasterise(dataUrl: string): Promise<{ rgb: Uint8Array<ArrayBuffer>; width: number; height: number }> {
  const img = await loadImage(dataUrl);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) throw new Error("the design came back with no size");

  const el = document.createElement("canvas");
  el.width = width;
  el.height = height;
  const ctx = el.getContext("2d");
  if (!ctx) throw new Error("this browser could not open a drawing surface");

  // A PDF page is paper. A see-through design goes onto white here for the same
  // reason the JPG export does it — the alternative is black.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0);

  const { data } = ctx.getImageData(0, 0, width, height);
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return { rgb, width, height };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("the picture of the design could not be read back"));
    img.src = src;
  });
}

/* ── Plumbing ───────────────────────────────────────────────────────────── */

/**
 * zlib-wrapped deflate — exactly what /FlateDecode reads. One path: a browser
 * without CompressionStream says so in words rather than quietly shipping a
 * 3 MB uncompressed page.
 */
async function flate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof CompressionStream !== "function") {
    throw new Error("this browser cannot make a PDF — download the PNG instead");
  }
  const source = new ReadableStream<BufferSource>({
    start(c) { c.enqueue(bytes); c.close(); },
  });
  const packed = source.pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(packed).arrayBuffer());
}

function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** A PDF literal string: ASCII only, with the three characters that end one escaped. */
function pdfText(s: string): string {
  return String(s)
    .replace(/[\\()]/g, (c) => `\\${c}`)
    .replace(/[^\x20-\x7E]/g, " ")
    .slice(0, 120)
    .trim() || "Design";
}

function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`
    + `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function whole(n: number): number {
  const v = Math.round(Number(n) || 0);
  return v > 0 && Number.isFinite(v) ? v : 0;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** 8.5 → "8.5", 11 → "11". Nobody wants "11.00 in". */
function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}

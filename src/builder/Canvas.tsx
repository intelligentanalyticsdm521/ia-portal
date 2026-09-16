/**
 * builder/Canvas.tsx — the page, edited in place.
 *
 * SD-010: "sections on a canvas, add a widget into a section, see the REAL
 * result live, edit in place, tooltips on every button."
 *
 * ── HOW "EDIT IN PLACE" IS ACTUALLY DONE ──────────────────────────────────
 * The canvas renders the document with the ONE renderer (render.ts) — the
 * same HTML the customer will read — and then makes the runs of text the
 * renderer marked `data-edit="<prop path>"` editable. Typing writes straight
 * back into the model at that path (model.setPropPath).
 *
 * That is why there is no second "editor view" of a widget: there is nothing
 * to keep in step. The old proposal editor had a form per block and a preview
 * beside it, and the two disagreed the day a block gained a field — which is
 * the P2 FAIL this replaces.
 *
 * The one thing React must not do is re-write the HTML under a cursor, so the
 * effect that sets innerHTML skips while the focus is inside that section and
 * runs again on blur. Everything structural (adding, moving, deleting,
 * layout, colour) goes through the toolbar and the inspector, which cause a
 * normal re-render because nothing is focused.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy, GripVertical, Layers, Palette, PanelsTopLeft, Plus, Square, Star, Sun, Trash2, Type,
} from "lucide-react";
import type { BuilderDocument, Section, Selection, WidgetPath } from "./model";
import { renderSection, type RenderContext, DOCUMENT_CSS } from "./render";

/**
 * WHERE A DROP WOULD LAND — the indicator line's own coordinates (§11.8).
 *
 * Computed from the DOM and not from the model, because the canvas paints the
 * renderer's HTML with `innerHTML` and there are no React nodes inside it to
 * hang a drop zone on. That is a feature: one renderer means the author drops
 * a widget onto the CUSTOMER's document, not onto an editor's shadow copy of
 * it.
 */
export interface DropSpot {
  sectionId: string;
  columnIndex: number;
  /** Where in that column's widget list the drop inserts. */
  index: number;
  /** Relative to the section host, for the line. */
  top: number;
  left: number;
  width: number;
}

/** What is in the air: a NEW widget from the pane, or one already on the page. */
export type CanvasDrag =
  | { kind: "new"; label: string }
  | { kind: "move"; path: WidgetPath }
  | null;

export interface CanvasProps {
  doc: BuilderDocument;
  ctx: RenderContext;
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** A run of text was typed into. `mergeKey` coalesces the undo step. */
  onEditText: (sectionId: string, widgetId: string, path: string, value: string, mergeKey: string) => void;
  onPatchSection: (sectionId: string, patch: Partial<Section>) => void;
  onDuplicateSection: (sectionId: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onMoveSection: (sectionId: string, toIndex: number) => void;
  onAddSection: (atIndex: number, how: "blank" | "premade") => void;
  /**
   * DRAG TO POSITION. What is being dragged, and where it was let go.
   *
   * The shell owns the payload because the widget PANE starts half of these
   * drags and the pane is not inside the canvas. The canvas owns the geometry,
   * because it is the only thing that knows where the columns ended up.
   */
  drag?: CanvasDrag;
  onDragWidget?: (drag: CanvasDrag) => void;
  onDropWidget?: (spot: { sectionId: string; columnIndex: number; index: number }) => void;
  /** Shown under the page: what the template puts next. */
  nextUp?: string | null;
  /**
   * How a section becomes HTML.
   *
   * The canvas does not know what it is drawing — that is the whole point of
   * one engine. A proposal and a website page hand it the document renderer;
   * the email adapter hands it the table-based email renderer, so what the
   * author types into IS the email, not a web-shaped approximation of one
   * that looks different in the mailbox. Defaults to the document renderer.
   */
  renderSection?: (s: Section, ctx: RenderContext) => string;
  /**
   * How wide the page is. A document is Letter-ish (780), an email is 600
   * because that is as wide as email gets, and a WEBSITE page is as wide as
   * the canvas will give it — a hero that is 780px here and full-bleed on
   * the site is a preview that lies.
   */
  paperWidth?: number | "full";
  /** What the page sits on. The email adapter passes the brand background. */
  paper?: string;
  /**
   * The stylesheet the RENDERER needs, replacing the document one. Email
   * passes "" — its styles are inline, because a mailbox strips a <style>.
   */
  canvasCss?: string;
  /** The adapter's own stylesheet, appended after the engine's. */
  extraCss?: string;
  /** The sentence above the page on the LEFT: what clicking does here. */
  canvasHint?: string;
  /** The unit above the page on the RIGHT. "Letter", "600px wide", a URL. */
  paperNote?: string;
  /**
   * The site's own header and footer, drawn as HTML above and below the page
   * and NOT part of the document. They come from the theme, they are the same
   * on every page, and pretending they are page sections would be a lie the
   * first time somebody tried to delete one.
   */
  chromeTop?: string;
  chromeBottom?: string;
  /** What the chrome is, in the client's words. Shown as its tooltip. */
  chromeNote?: string;
}

const TOOL: React.CSSProperties = {
  width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center",
  borderRadius: 4, color: "#334155", border: "none", background: "transparent", cursor: "pointer",
};
const TOOL_ON: React.CSSProperties = { ...TOOL, background: "#0C4A60", color: "#FFFFFF" };

export function Canvas(props: CanvasProps) {
  const { doc, ctx, selection, onSelect } = props;
  const [dragId, setDragId] = useState<string | null>(null);
  // `maxWidth: "100%"` on the fixed case as well as the full one: a 780px
  // sheet inside a 374px canvas used to hang off BOTH edges, so the author on
  // a phone saw the middle of a document with no way to see either margin.
  // Capped, the sheet is as wide as the canvas — and because the renderer's
  // stylesheet asks the CONTAINER and not the viewport (responsive.ts), the
  // document then folds exactly as it will for the customer.
  const paper: React.CSSProperties = props.paperWidth === "full"
    ? { width: "100%", maxWidth: 1100 }
    : { width: props.paperWidth ?? 780, maxWidth: "100%" };

  return (
    <div style={{ background: "#E6ECF1", minHeight: "100%", padding: "20px 24px 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <style>{props.canvasCss ?? DOCUMENT_CSS}{CANVAS_CSS}{props.extraCss || ""}</style>

      <div style={{ ...paper, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: "#5A7A8A", gap: 12 }}>
        <span>{props.canvasHint ?? "Click anything on the page to edit it. Everything here is what the customer receives."}</span>
        <span style={{ whiteSpace: "nowrap" }}>
          {doc.sections.length} section{doc.sections.length === 1 ? "" : "s"}{props.paperNote ? ` · ${props.paperNote}` : " · Letter"}
        </span>
      </div>

      <div
        style={{ ...paper, background: props.paper ?? "#FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}
      >
        {props.chromeTop && (
          <div className="bxc-chrome" title={props.chromeNote || "From your website's theme"}
            dangerouslySetInnerHTML={{ __html: props.chromeTop }} />
        )}
        {doc.sections.map((s, i) => (
          <SectionHost
            key={s.id}
            section={s}
            index={i}
            total={doc.sections.length}
            selected={selection?.kind === "section" && selection.sectionId === s.id}
            selectedWidgetId={selection?.kind === "widget"
              ? doc.sections.find((x) => x.id === selection.sectionId)?.columns[selection.columnIndex]?.widgets[selection.widgetIndex]?.id ?? null
              : null}
            dragging={dragId === s.id}
            onDragStart={() => setDragId(s.id)}
            onDragEnd={() => setDragId(null)}
            onDropAt={(idx) => { if (dragId) props.onMoveSection(dragId, idx); setDragId(null); }}
            {...props}
            ctx={ctx}
          />
        ))}

        {/* "Add a section: Blank | Pre-made…" — the strip from the design. */}
        <div className="bxc-add">
          <Plus size={14} />
          <span style={{ fontWeight: 600 }}>Add a section</span>
          <button type="button" className="bxc-btn" title="Start from an empty section and add widgets yourself"
            onClick={() => props.onAddSection(doc.sections.length, "blank")}>Blank</button>
          <button type="button" className="bxc-btn" title="Choose a ready-made section — a title page, terms, a pricing schedule — then change anything on it"
            onClick={() => props.onAddSection(doc.sections.length, "premade")}>Pre-made…</button>
          {props.nextUp && <span style={{ color: "#5A7A8A" }}>Next up in this template: {props.nextUp}</span>}
        </div>

        {props.chromeBottom && (
          <div className="bxc-chrome" title={props.chromeNote || "From your website's theme"}
            dangerouslySetInnerHTML={{ __html: props.chromeBottom }} />
        )}
      </div>
    </div>
  );
}

/* ── One section: its HTML, its toolbar, its editable runs ────────────────── */

function SectionHost({
  section, index, total, ctx, selected, selectedWidgetId, dragging,
  onSelect, onEditText, onPatchSection, onDuplicateSection, onDeleteSection,
  onAddSection, onDragStart, onDragEnd, onDropAt, renderSection: renderOne,
  drag, onDragWidget, onDropWidget,
}: CanvasProps & {
  section: Section; index: number; total: number; selected: boolean; selectedWidgetId: string | null;
  dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onDropAt: (i: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  /** Where the line is drawn right now. Null when nothing is over this section. */
  const [spot, setSpot] = useState<DropSpot | null>(null);
  const html = (renderOne || renderSection)(section, ctx);
  /** True when this section holds a part the law puts there. See model.ts. */
  const required = section.columns.some((c) => c.widgets.some((w) => w.locked));

  // Paint the section. SKIPPED while the caret is inside it — see the header.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (host.contains(document.activeElement)) return;
    host.innerHTML = html;
    for (const el of Array.from(host.querySelectorAll<HTMLElement>("[data-edit]"))) {
      el.contentEditable = "true";
      el.spellcheck = true;
      el.dataset.bxEditable = "1";
      el.title = "Click and type. This is exactly what the customer reads.";
    }
    // Show which widget is selected, without a second render path.
    for (const el of Array.from(host.querySelectorAll<HTMLElement>("[data-widget]"))) {
      const isSel = el.dataset.widget === selectedWidgetId;
      el.classList.toggle("bxc-widget-sel", isSel);
      if (!isSel) continue;
      // A GRIP, not a draggable wrapper. Making the widget itself draggable
      // fights the contentEditable runs inside it — the author would lose the
      // ability to select a word with the mouse, which is the thing "edit in
      // place" is for. One handle, on the selected widget only, so the page is
      // not covered in furniture.
      const grip = document.createElement("span");
      grip.className = "bxc-grip";
      grip.setAttribute("draggable", "true");
      grip.title = "Drag to move this anywhere on the page — another column, another section";
      grip.setAttribute("aria-label", "Drag to move");
      grip.textContent = "\u2237";
      grip.addEventListener("dragstart", (e) => {
        const ev = e as DragEvent;
        ev.dataTransfer?.setData("text/plain", "widget");
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
        const col = Number(el.closest<HTMLElement>("[data-col]")?.dataset.col ?? 0);
        const idx = section.columns[col]?.widgets.findIndex((w) => w.id === el.dataset.widget) ?? -1;
        if (idx >= 0) onDragWidget?.({ kind: "move", path: { sectionId: section.id, columnIndex: col, widgetIndex: idx } });
      });
      grip.addEventListener("dragend", () => onDragWidget?.(null));
      el.appendChild(grip);
    }
  }, [html, selectedWidgetId, onDragWidget, section]);

  /**
   * THE INDEX MATHS, which is the whole of the bug surface.
   *
   * The column under the pointer, then the first widget in it whose MIDDLE is
   * below the pointer — that is where the line goes and where the drop
   * inserts. Past the last middle, the end. An empty column is index 0 and the
   * line is drawn across the top of it, which is the only way an empty column
   * can say "you can put something here".
   */
  const findSpot = useCallback((clientX: number, clientY: number): DropSpot | null => {
    const host = hostRef.current;
    const wrap = wrapRef.current;
    if (!host || !wrap) return null;
    const cols = Array.from(host.querySelectorAll<HTMLElement>("[data-col]"));
    if (!cols.length) return null;
    // The column the pointer is over, or the nearest one — never nothing, so a
    // drop just outside a column still lands somewhere the author can see.
    let col = cols.find((c) => {
      const r = c.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right;
    });
    if (!col) {
      col = cols.reduce((best, c) => {
        const d = (x: HTMLElement) => {
          const r = x.getBoundingClientRect();
          return clientX < r.left ? r.left - clientX : clientX - r.right;
        };
        return d(c) < d(best) ? c : best;
      }, cols[0]);
    }
    const colRect = col.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const widgets = Array.from(col.children).filter((el): el is HTMLElement =>
      el instanceof HTMLElement && el.hasAttribute("data-widget"));
    let index = widgets.length;
    let top = widgets.length ? widgets[widgets.length - 1].getBoundingClientRect().bottom : colRect.top;
    for (let i = 0; i < widgets.length; i++) {
      const r = widgets[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) { index = i; top = r.top; break; }
    }
    return {
      sectionId: section.id,
      columnIndex: Number(col.dataset.col ?? 0),
      index,
      top: top - wrapRect.top,
      left: colRect.left - wrapRect.left,
      width: colRect.width,
    };
  }, [section.id]);

  const draggingWidget = drag?.kind === "new" || drag?.kind === "move";

  const commit = useCallback((el: HTMLElement) => {
    const path = el.dataset.edit;
    const widgetEl = el.closest<HTMLElement>("[data-widget]");
    if (!path || !widgetEl?.dataset.widget) return;
    const text = el.innerText.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trimEnd();
    onEditText(section.id, widgetEl.dataset.widget, path, text, `${widgetEl.dataset.widget}:${path}`);
  }, [onEditText, section.id]);

  return (
    <div
      ref={wrapRef}
      className={`bxc-sec${selected ? " bxc-sel" : ""}${dragging ? " bxc-dragging" : ""}`}
      data-section-host={section.id}
      onDragOver={(e) => {
        e.preventDefault();
        // A WIDGET drag draws the line; a SECTION drag is the reorder that was
        // already here. One handler, two payloads, and the payload decides —
        // never a guess from where the pointer happens to be.
        if (draggingWidget) setSpot(findSpot(e.clientX, e.clientY));
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setSpot(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (draggingWidget) {
          const at = spot ?? findSpot(e.clientX, e.clientY);
          setSpot(null);
          if (at) onDropWidget?.({ sectionId: at.sectionId, columnIndex: at.columnIndex, index: at.index });
          return;
        }
        onDropAt(index);
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        const widgetEl = target.closest<HTMLElement>("[data-widget]");
        if (widgetEl && hostRef.current?.contains(widgetEl)) {
          const col = Number(widgetEl.closest<HTMLElement>("[data-col]")?.dataset.col ?? 0);
          const idx = section.columns[col]?.widgets.findIndex((w) => w.id === widgetEl.dataset.widget) ?? -1;
          if (idx >= 0) { onSelect({ kind: "widget", sectionId: section.id, columnIndex: col, widgetIndex: idx }); return; }
        }
        onSelect({ kind: "section", sectionId: section.id });
      }}
    >
      {selected && (
        <div className="bxc-toolbar" role="toolbar" aria-label={`Section: ${section.label || "untitled"}`}>
          <span
            style={{ ...TOOL, cursor: "grab" }}
            title="Drag to move this section"
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          ><GripVertical size={14} /></span>
          <span style={{ fontWeight: 600, padding: "0 6px", fontSize: 11 }}>{section.label || "Section"}</span>
          <span className="bxc-div" />
          {[1, 2, 3].map((n) => (
            <button key={n} type="button" style={section.layout === n ? TOOL_ON : TOOL}
              title={`${n === 1 ? "One column" : n === 2 ? "Two columns" : "Three columns"}`}
              onClick={(e) => { e.stopPropagation(); onPatchSection(section.id, { layout: n as 1 | 2 | 3 }); }}>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{n}</span>
            </button>
          ))}
          <span className="bxc-div" />
          <button type="button" style={TOOL} title="Width: full, boxed or narrow"
            onClick={(e) => { e.stopPropagation(); onPatchSection(section.id, { width: section.width === "full" ? "contained" : section.width === "contained" ? "narrow" : "full" }); }}>
            <PanelsTopLeft size={14} />
          </button>
          <label style={{ ...TOOL, position: "relative", cursor: "pointer" }} title="Background colour">
            <Palette size={14} />
            <input type="color" value={section.background || "#ffffff"} aria-label="Background colour"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onPatchSection(section.id, { background: e.target.value })}
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
          </label>
          <button type="button" style={TOOL} title="Padding — more or less room around this section"
            onClick={(e) => { e.stopPropagation(); onPatchSection(section.id, { padding: section.padding >= 48 ? 8 : section.padding + 8 }); }}>
            <Square size={14} />
          </button>
          <button type="button" style={section.theme === "dark" ? TOOL_ON : TOOL} title="Light or dark text"
            onClick={(e) => { e.stopPropagation(); onPatchSection(section.id, { theme: section.theme === "dark" ? "light" : "dark" }); }}>
            <Sun size={14} />
          </button>
          <button type="button" style={section.numbered ? TOOL_ON : TOOL} title="Number this section (01, 02, 03…)"
            onClick={(e) => { e.stopPropagation(); onPatchSection(section.id, { numbered: !section.numbered }); }}>
            <Type size={14} />
          </button>
          <button type="button" style={section.recommended ? TOOL_ON : TOOL} title="Mark as Recommended"
            onClick={(e) => { e.stopPropagation(); onPatchSection(section.id, { recommended: !section.recommended }); }}>
            <Star size={14} />
          </button>
          <button type="button" style={section.visibility === "internal" ? TOOL_ON : TOOL}
            title="Internal note — your crew sees it, the customer never does"
            onClick={(e) => { e.stopPropagation(); onPatchSection(section.id, { visibility: section.visibility === "internal" ? "customer" : "internal" }); }}>
            <Layers size={14} />
          </button>
          <span className="bxc-div" />
          {/* A section holding a required part is not the author's to copy or
              delete — the model refuses either way (model.removeSection), and a
              button that silently does nothing is worse than one that says why. */}
          <button type="button" style={{ ...TOOL, opacity: required ? 0.35 : 1 }} disabled={required}
            title={required ? "This part has to appear exactly once, so it cannot be copied" : "Duplicate this section"}
            onClick={(e) => { e.stopPropagation(); onDuplicateSection(section.id); }}><Copy size={14} /></button>
          <button type="button" style={{ ...TOOL, color: "#B91C1C", opacity: required ? 0.35 : 1 }} disabled={required}
            title={required ? "The footer carries your unsubscribe link and address — the law asks for both, so it stays" : "Delete this section"}
            onClick={(e) => { e.stopPropagation(); onDeleteSection(section.id); }}><Trash2 size={14} /></button>
        </div>
      )}

      <div
        ref={hostRef}
        className="bx-doc"
        style={{ ["--bx-accent" as any]: ctx.accent, ["--bx-head" as any]: ctx.headingFont, ["--bx-body" as any]: ctx.bodyFont }}
        onInput={(e) => {
          const el = (e.target as HTMLElement).closest<HTMLElement>("[data-edit]");
          if (el) commit(el);
        }}
        onBlur={(e) => {
          const el = (e.target as HTMLElement).closest<HTMLElement>("[data-edit]");
          if (el) commit(el);
        }}
      />

      {/* WHERE IT WOULD LAND. One line, drawn over the page rather than
          inserted into it, so the document's own HTML is untouched by a drag
          that may never finish. */}
      {spot && draggingWidget && (
        <div
          className="bxc-dropline"
          data-drop-index={spot.index}
          data-drop-col={spot.columnIndex}
          style={{ top: spot.top, left: spot.left, width: spot.width }}
          aria-hidden="true"
        />
      )}

      {/* Between-sections insert, so a section can be added in the middle
          rather than only at the end. */}
      <div className="bxc-between">
        <button type="button" className="bxc-tiny" title="Add a blank section here"
          onClick={(e) => { e.stopPropagation(); onAddSection(index + 1, "blank"); }}>+ blank</button>
        <button type="button" className="bxc-tiny" title="Add a ready-made section here"
          onClick={(e) => { e.stopPropagation(); onAddSection(index + 1, "premade"); }}>+ pre-made</button>
        <span style={{ fontSize: 10, color: "#94A3B8" }}>{index + 1} of {total}</span>
      </div>
    </div>
  );
}

const CANVAS_CSS = `
.bxc-sec { position: relative; }
.bxc-sec.bxc-sel { outline: 2px solid #2D9CDB; outline-offset: -2px; background: #FBFDFF; }
.bxc-sec.bxc-dragging { opacity: .45; }
.bxc-toolbar { position: absolute; top: -17px; left: 24px; z-index: 5; display: flex; align-items: center; gap: 2px;
  background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 6px; padding: 3px 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08); font-size: 11px; color: #334155; }
.bxc-div { width: 1px; height: 18px; background: #E2E8F0; }
.bxc-add { margin: 8px 24px 24px; border: 1px dashed #A8CDD8; border-radius: 8px; padding: 12px;
  display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 12px; color: #0C4A60; background: #F8FBFD; }
.bxc-btn { border: 1px solid #CBD5E1; background: #fff; color: #334155; border-radius: 4px; padding: 5px 10px;
  font-size: 12px; font-weight: 600; cursor: pointer; }
.bxc-btn:hover { border-color: #0C4A60; }
.bxc-between { display: flex; align-items: center; justify-content: center; gap: 8px; opacity: 0; height: 0; overflow: hidden; transition: opacity .1s; }
.bxc-sec:hover .bxc-between { opacity: 1; height: auto; padding: 4px 0; }
.bxc-tiny { border: 1px dashed #CBD5E1; background: #fff; color: #0C4A60; border-radius: 999px; padding: 2px 10px; font-size: 10px; cursor: pointer; }
.bxc-widget-sel { outline: 1px dashed #2D9CDB; outline-offset: 3px; border-radius: 3px; position: relative; }
/* THE GRIP on the selected widget. Small, and outside the text, so dragging
   the widget and selecting a word in it are two different gestures. */
.bxc-grip { position: absolute; top: -9px; left: -9px; z-index: 6; width: 18px; height: 18px;
  display: inline-flex; align-items: center; justify-content: center; cursor: grab;
  background: #2D9CDB; color: #fff; border-radius: 4px; font-size: 11px; line-height: 1;
  letter-spacing: 1px; user-select: none; }
.bxc-grip:active { cursor: grabbing; }
/* WHERE IT WOULD LAND. */
.bxc-dropline { position: absolute; z-index: 7; height: 3px; margin-top: -1px; border-radius: 2px;
  background: #2D9CDB; box-shadow: 0 0 0 1px rgba(45,156,219,.35); pointer-events: none; }
.bxc-dropline::before { content: ""; position: absolute; left: -4px; top: -3px; width: 9px; height: 9px;
  border-radius: 50%; background: #2D9CDB; }
[data-bx-editable]:focus { outline: 2px solid #2D9CDB; outline-offset: 2px; border-radius: 2px; background: #FFFFFF; }
[data-bx-editable]:hover { background: rgba(45,156,219,.06); }
.bxc-chrome { position: relative; opacity: .78; pointer-events: none; user-select: none; }
.bxc-chrome::after { content: "from your theme — the same on every page"; position: absolute; top: 4px; right: 8px;
  font-size: 9px; letter-spacing: .06em; text-transform: uppercase; color: #64748B; background: #F1F5F9;
  border-radius: 999px; padding: 1px 8px; }
`;

export default Canvas;

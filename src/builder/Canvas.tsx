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
 *
 * ── THE USABILITY REBUILD (D-147 / D-148, 2026-09-17) ─────────────────────
 * Four findings from driving the real Portal as a customer
 * (BUILDER_USER_TEST_2026-09-16) are answered here, BY DESIGN rather than by
 * a message telling the author what went wrong:
 *
 *   D-11  a "+" on the page, in every gap, so a new thing lands where it was
 *         asked for — never at the end of the document, off screen
 *   D-12  chrome on HOVER: a slim toolbar on a section's edge and a handle on
 *         a widget, with the section drag landing on the same "+" strip
 *   D-35  the still-to-fill-in list jumps the author to the field
 *   D-148 an empty page offers three things to start with, not a blank sheet
 *
 * The section toolbar lost its nine settings buttons in the same pass. They
 * are all in the inspector — the one place a setting lives — and a toolbar
 * carrying both was two answers to "where do I change the background?".
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Settings2, Trash2 } from "lucide-react";
import type { BuilderDocument, Section, Selection, WidgetPath } from "./model";
import { renderSection, type RenderContext, DOCUMENT_CSS } from "./render";
import { AddBar, ADDBAR_CSS } from "./AddBar";
import { FLASH_MS, sectionAtViewport, type InsertSpot, type SectionBox } from "./insertPosition";
import { DEFAULT_COPY, type BuilderCopy } from "./copy";

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

/** Where a "+" would put whatever the picker offers. */
export type PickerTarget =
  /** A new section at this index, holding the chosen widget. */
  | { kind: "newSection"; index: number }
  /** An exact place inside an existing column. */
  | { kind: "spot"; spot: InsertSpot };

/** The slash command, mid-flight. See `onSlash` below. */
export interface SlashState {
  sectionId: string;
  widgetId: string;
  path: string;
  /** What has been typed after the "/". */
  query: string;
  /** Where the caret is, so the picker can appear beside it. */
  rect: { top: number; left: number };
}

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
  /** A widget's own hover handle (D-12). */
  onDuplicateWidget?: (path: WidgetPath) => void;
  onDeleteWidget?: (path: WidgetPath) => void;
  /**
   * A "+" was pressed, or an empty column's "Add here".
   *
   * The canvas says WHERE; the shell opens the one picker and does the insert,
   * so a widget added from a "+" and one added from the pane go through the
   * same code and get the same defaults.
   */
  onOpenPicker?: (target: PickerTarget, rect: DOMRect) => void;
  /**
   * The widget that just landed. Scrolled to, and glowing for two seconds.
   *
   * D-11's other half: landing in the right place is no use if the author is
   * looking at a different part of the document when it happens.
   */
  flashWidgetId?: string | null;
  /**
   * Which section is on screen right now.
   *
   * D-11 rule 3: with nothing selected, a widget from the pane belongs where
   * the author is LOOKING. The canvas is the only thing that can measure that;
   * `insertPosition.ts` decides what to do with it.
   */
  onVisibleSection?: (sectionId: string | null) => void;
  /** Typing "/" on an empty line. Reported as it is typed; null when it ends. */
  slash?: SlashState | null;
  onSlash?: (s: SlashState | null) => void;
  onSlashCommit?: () => void;
  /** The three choices an empty page offers (D-148). The adapter supplies them. */
  emptyChoices?: Array<{ key: string; title: string; hint: string; onPick: () => void }>;
  /** Something was refused — a locked widget, usually. Shown by the frame. */
  onRefuse?: (message: string) => void;
  /**
   * A MERGE FIELD WAS CLICKED (D-03, handoff B-A-5).
   *
   * `{{contract.start_date}}` on the page is a slot the document fills in when
   * it is sent, not a word to be typed over — and the 2026-09-16 walk destroyed
   * four of them doing exactly that, because there was nothing else to do. The
   * renderer marks each one `.bx-tok` in edit mode; a click on one is handed to
   * the ADAPTER, which is the only thing that knows where that value is kept.
   *
   * Absent, the click is an ordinary edit and nothing changes — an engine that
   * refused to edit text because no adapter had registered a handler would be
   * worse than the defect.
   */
  onTokenClick?: (token: string) => void;
  /** The words this builder uses for the thing being built. See copy.ts. */
  copy?: BuilderCopy;
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
  width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center",
  borderRadius: 4, color: "#334155", border: "none", background: "transparent", cursor: "pointer",
};

export function Canvas(props: CanvasProps) {
  const { doc, ctx, selection, onSelect } = props;
  const [dragId, setDragId] = useState<string | null>(null);
  /** Which "+" strip a section drag is hovering. The strip IS the drop line. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const copy = props.copy ?? DEFAULT_COPY;
  // `maxWidth: "100%"` on the fixed case as well as the full one: a 780px
  // sheet inside a 374px canvas used to hang off BOTH edges, so the author on
  // a phone saw the middle of a document with no way to see either margin.
  // Capped, the sheet is as wide as the canvas — and because the renderer's
  // stylesheet asks the CONTAINER and not the viewport (responsive.ts), the
  // document then folds exactly as it will for the customer.
  const paper: React.CSSProperties = props.paperWidth === "full"
    ? { width: "100%", maxWidth: 1100 }
    : { width: props.paperWidth ?? 780, maxWidth: "100%" };

  /**
   * WHAT THE AUTHOR IS LOOKING AT (D-11 rule 3).
   *
   * Measured off the scrolling ancestor the FRAME owns, found once rather than
   * passed down: the canvas sits inside `[data-builder-slot="canvas"]` in both
   * the three-pane layout and the narrow one, and a prop threaded through two
   * components to say "my parent scrolls" is a prop that goes stale.
   *
   * Throttled to one measurement per animation frame. A scroll handler that
   * reads `getBoundingClientRect` on every event is the thing that makes a
   * builder feel heavy while somebody flicks a trackpad.
   */
  const onVisible = props.onVisibleSection;
  useEffect(() => {
    if (!onVisible) return;
    const root = rootRef.current;
    const scroller = root?.closest<HTMLElement>('[data-builder-slot="canvas"]') ?? null;
    if (!root) return;
    let queued = false;
    const measure = () => {
      queued = false;
      const view = scroller ? scroller.getBoundingClientRect() : { top: 0, height: window.innerHeight };
      const boxes: SectionBox[] = Array.from(root.querySelectorAll<HTMLElement>("[data-section-host]"))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { id: el.dataset.sectionHost || "", top: r.top, bottom: r.bottom };
        })
        .filter((b) => b.id);
      onVisible(sectionAtViewport(boxes, { top: view.top, height: view.height }));
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(measure); } };
    measure();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [onVisible, doc.sections.length]);

  /** Nothing on the page at all — the three choices, not a blank sheet. */
  const isEmpty = doc.sections.every((s) => s.columns.every((c) => !c.widgets.length));

  return (
    <div ref={rootRef} style={{ background: "#E6ECF1", minHeight: "100%", padding: "20px 24px 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <style>{props.canvasCss ?? DOCUMENT_CSS}{CANVAS_CSS}{ADDBAR_CSS}{props.extraCss || ""}</style>

      <div style={{ ...paper, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: "#5A7A8A", gap: 12 }}>
        <span>{props.canvasHint ?? copy.canvasHint}</span>
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

        {/* D-148. A blank sheet is the one screen nobody knows what to do with. */}
        {isEmpty && props.emptyChoices?.length ? (
          <div className="bxc-empty" data-builder-empty={String(props.emptyChoices.length)}>
            <div className="bxc-empty-head">{copy.emptyHeading}</div>
            <div className="bxc-empty-hint">{copy.emptyHint}</div>
            <div className="bxc-empty-grid">
              {props.emptyChoices.map((c) => (
                <button key={c.key} type="button" className="bxc-empty-card" title={c.hint}
                  onClick={(e) => { e.stopPropagation(); c.onPick(); }}>
                  <span className="bxc-empty-plus"><Plus size={16} /></span>
                  <span className="bxc-empty-title">{c.title}</span>
                  <span className="bxc-empty-sub">{c.hint}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {doc.sections.map((s, i) => (
          <div key={s.id}>
            {/* The strip ABOVE the first section as well, so there is a place
                to add something before a title band. */}
            {i === 0 && (
              <AddBar
                label={`Add something at the top of this ${copy.noun}`}
                dropActive={!!dragId && dropIndex === 0}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropIndex(0); } }}
                onDrop={(e) => { if (!dragId) return; e.preventDefault(); props.onMoveSection(dragId, 0); setDragId(null); setDropIndex(null); }}
                onAdd={(rect) => props.onOpenPicker?.({ kind: "newSection", index: 0 }, rect)}
              />
            )}
            <SectionHost
              section={s}
              index={i}
              total={doc.sections.length}
              selected={selection?.kind === "section" && selection.sectionId === s.id}
              selectedWidgetId={selection?.kind === "widget"
                ? doc.sections.find((x) => x.id === selection.sectionId)?.columns[selection.columnIndex]?.widgets[selection.widgetIndex]?.id ?? null
                : null}
              dragging={dragId === s.id}
              onDragStart={() => setDragId(s.id)}
              onDragEnd={() => { setDragId(null); setDropIndex(null); }}
              {...props}
              ctx={ctx}
            />
            <AddBar
              always={i === doc.sections.length - 1}
              label={`Add something here in this ${copy.noun}`}
              dropActive={!!dragId && dropIndex === i + 1}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropIndex(i + 1); } }}
              onDrop={(e) => {
                if (!dragId) return;
                e.preventDefault();
                // Dropping below section i means index i when the section came
                // from above it (it has already been lifted out) and i+1 when
                // it came from below. `moveSection` clamps; this is the honest
                // arithmetic rather than a clamp doing the thinking.
                const from = doc.sections.findIndex((x) => x.id === dragId);
                props.onMoveSection(dragId, from <= i ? i : i + 1);
                setDragId(null); setDropIndex(null);
              }}
              onAdd={(rect) => props.onOpenPicker?.({ kind: "newSection", index: i + 1 }, rect)}
              note={i === doc.sections.length - 1 && props.nextUp
                ? <span style={{ fontSize: 10, color: "#5A7A8A", flex: "0 0 auto" }}>Next up in this template: {props.nextUp}</span>
                : null}
            >
              {i === doc.sections.length - 1 && (
                <>
                  <button type="button" className="bxc-tiny" title="Add a blank section here"
                    onClick={(e) => { e.stopPropagation(); props.onAddSection(i + 1, "blank"); }}>Blank section</button>
                  <button type="button" className="bxc-tiny" title="Add a ready-made section here"
                    onClick={(e) => { e.stopPropagation(); props.onAddSection(i + 1, "premade"); }}>Ready-made section…</button>
                </>
              )}
            </AddBar>
          </div>
        ))}

        {/* No sections at all: one strip is the whole page. */}
        {!doc.sections.length && (
          <AddBar always label={`Add the first thing to this ${copy.noun}`}
            onAdd={(rect) => props.onOpenPicker?.({ kind: "newSection", index: 0 }, rect)}>
            <button type="button" className="bxc-tiny" title="Add a blank section here"
              onClick={(e) => { e.stopPropagation(); props.onAddSection(0, "blank"); }}>Blank section</button>
            <button type="button" className="bxc-tiny" title="Add a ready-made section here"
              onClick={(e) => { e.stopPropagation(); props.onAddSection(0, "premade"); }}>Ready-made section…</button>
          </AddBar>
        )}

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
  onMoveSection, onDragStart, onDragEnd, renderSection: renderOne,
  drag, onDragWidget, onDropWidget, onOpenPicker, onDuplicateWidget, onDeleteWidget,
  flashWidgetId, slash, onSlash, onSlashCommit, onRefuse, onTokenClick,
}: CanvasProps & {
  section: Section; index: number; total: number; selected: boolean; selectedWidgetId: string | null;
  dragging: boolean; onDragStart: () => void; onDragEnd: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  /** Where the line is drawn right now. Null when nothing is over this section. */
  const [spot, setSpot] = useState<DropSpot | null>(null);
  const html = (renderOne || renderSection)(section, ctx);
  /** True when this section holds a part the law puts there. See model.ts. */
  const required = section.columns.some((c) => c.widgets.some((w) => w.locked));
  const flashedRef = useRef<string | null>(null);

  /** Where a widget on the page lives, read off the DOM it was painted into. */
  const pathOf = useCallback((el: HTMLElement): WidgetPath | null => {
    const col = Number(el.closest<HTMLElement>("[data-col]")?.dataset.col ?? 0);
    const idx = section.columns[col]?.widgets.findIndex((w) => w.id === el.dataset.widget) ?? -1;
    return idx >= 0 ? { sectionId: section.id, columnIndex: col, widgetIndex: idx } : null;
  }, [section]);

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

    /* ── EVERY WIDGET GETS A HANDLE ON HOVER (D-12) ────────────────────────
       Built into the painted HTML rather than rendered by React, because the
       widgets ARE painted HTML — there is no React node to hang a wrapper on
       without going back to an editor's shadow copy of the document, which is
       the thing one renderer exists to delete. Kept off the text: the handle
       sits at the corner, outside the editable runs, so dragging a widget and
       selecting a word in it stay two different gestures. */
    for (const el of Array.from(host.querySelectorAll<HTMLElement>("[data-widget]"))) {
      const isSel = el.dataset.widget === selectedWidgetId;
      el.classList.toggle("bxc-widget-sel", isSel);

      const tools = document.createElement("span");
      tools.className = "bxc-wtools";
      tools.setAttribute("contenteditable", "false");

      const path = pathOf(el);
      const locked = path
        ? !!section.columns[path.columnIndex]?.widgets[path.widgetIndex]?.locked
        : false;

      const grip = document.createElement("span");
      grip.className = "bxc-grip";
      grip.setAttribute("draggable", "true");
      grip.title = "Drag to move this anywhere on the page — another column, another section";
      grip.setAttribute("aria-label", "Drag to move");
      grip.textContent = "∷";
      grip.addEventListener("dragstart", (e) => {
        const ev = e as DragEvent;
        ev.dataTransfer?.setData("text/plain", "widget");
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
        if (path) onDragWidget?.({ kind: "move", path });
      });
      grip.addEventListener("dragend", () => onDragWidget?.(null));
      tools.appendChild(grip);

      const button = (glyph: string, title: string, run: () => void, danger = false) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `bxc-wtool${danger ? " bxc-wtool-danger" : ""}`;
        b.title = title;
        b.setAttribute("aria-label", title);
        b.textContent = glyph;
        b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); run(); });
        tools.appendChild(b);
      };
      if (!locked) {
        button("⧉", "Make a copy of this, right underneath", () => { if (path) onDuplicateWidget?.(path); });
        button("✕", "Remove this from the page", () => { if (path) onDeleteWidget?.(path); }, true);
      } else {
        button("\u{1F512}", "This has to stay on the page — you can change the wording, not remove it",
          () => onRefuse?.("This part has to stay: it carries your unsubscribe link and postal address. You can change the wording."));
      }
      el.appendChild(tools);
    }

    /* ── AN EMPTY COLUMN SAYS SO, AND OFFERS THE "+" ───────────────────────
       An empty column used to render as nothing at all: two columns looked
       like one, and there was no way to put anything in the second. */
    for (const col of Array.from(host.querySelectorAll<HTMLElement>("[data-col]"))) {
      if (col.querySelector("[data-widget]")) continue;
      const columnIndex = Number(col.dataset.col ?? 0);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bxc-addhere";
      b.setAttribute("data-builder-addhere", String(columnIndex));
      b.title = "Add something in this column";
      b.textContent = "+ Add here";
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        onOpenPicker?.(
          { kind: "spot", spot: { sectionId: section.id, columnIndex, index: 0 } },
          (e.currentTarget as HTMLElement).getBoundingClientRect(),
        );
      });
      col.appendChild(b);
    }
  }, [html, selectedWidgetId, onDragWidget, onDuplicateWidget, onDeleteWidget, onOpenPicker, onRefuse, pathOf, section]);

  /**
   * THE NEW THING IS BROUGHT TO THE AUTHOR, not the other way round.
   *
   * After the paint, because the paint replaces the element this is looking
   * for. Scrolled to once per insert (`flashedRef`) — re-scrolling on every
   * keystroke while the glow is still on would fight the author's own
   * scrolling.
   */
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !flashWidgetId) return;
    const el = host.querySelector<HTMLElement>(`[data-widget="${flashWidgetId}"]`);
    if (!el) return;
    el.classList.add("bxc-flash");
    if (flashedRef.current !== flashWidgetId) {
      flashedRef.current = flashWidgetId;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    const t = setTimeout(() => el.classList.remove("bxc-flash"), FLASH_MS);
    return () => clearTimeout(t);
  }, [flashWidgetId, html]);

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
    const text = el.innerText.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trimEnd();
    onEditText(section.id, widgetEl.dataset.widget, path, text, `${widgetEl.dataset.widget}:${path}`);
  }, [onEditText, section.id]);

  /**
   * THE SLASH COMMAND.
   *
   * On an EMPTY run of text, "/" opens the same picker, filtered as you type.
   * Only on an empty one: "and/or" in the middle of a paragraph must not open
   * a menu. The canvas reports what has been typed; the shell owns the picker,
   * because the shell is what does the insert.
   */
  const watchSlash = useCallback((el: HTMLElement) => {
    if (!onSlash) return;
    const text = el.innerText.replace(/ /g, " ");
    const widgetEl = el.closest<HTMLElement>("[data-widget]");
    if (!widgetEl?.dataset.widget || !el.dataset.edit) return;
    if (!text.startsWith("/")) { if (slash) onSlash(null); return; }
    const r = el.getBoundingClientRect();
    onSlash({
      sectionId: section.id,
      widgetId: widgetEl.dataset.widget,
      path: el.dataset.edit,
      query: text.slice(1).trim(),
      rect: { top: r.bottom + 6, left: r.left },
    });
  }, [onSlash, slash, section.id]);

  return (
    <div
      ref={wrapRef}
      className={`bxc-sec${selected ? " bxc-sel" : ""}${dragging ? " bxc-dragging" : ""}`}
      data-section-host={section.id}
      onDragOver={(e) => {
        e.preventDefault();
        // A WIDGET drag draws the line; a SECTION drag lands on the "+" strips
        // between the sections. One handler, two payloads, and the payload
        // decides — never a guess from where the pointer happens to be.
        if (draggingWidget) setSpot(findSpot(e.clientX, e.clientY));
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setSpot(null);
      }}
      onDrop={(e) => {
        if (!draggingWidget) return;
        e.preventDefault();
        const at = spot ?? findSpot(e.clientX, e.clientY);
        setSpot(null);
        if (at) onDropWidget?.({ sectionId: at.sectionId, columnIndex: at.columnIndex, index: at.index });
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        // A merge field first: it sits INSIDE an editable run, so asking after
        // the widget lookup would already have put the caret in the words.
        const tok = onTokenClick ? target.closest<HTMLElement>(".bx-tok") : null;
        if (tok?.dataset.token) {
          e.preventDefault();
          onTokenClick!(tok.dataset.token);
          return;
        }
        const widgetEl = target.closest<HTMLElement>("[data-widget]");
        if (widgetEl && hostRef.current?.contains(widgetEl)) {
          const path = pathOf(widgetEl);
          if (path) { onSelect({ kind: "widget", ...path }); return; }
        }
        onSelect({ kind: "section", sectionId: section.id });
      }}
    >
      {/* THE SLIM TOOLBAR (D-12). Shown on HOVER as well as when selected, so
          a section says what can be done to it before it is clicked. Nine
          settings buttons used to live here; every one of them is in the
          inspector, and two homes for one setting is one too many. */}
      <div className="bxc-toolbar" role="toolbar" aria-label={`Section: ${section.label || "untitled"}`}>
        <span
          style={{ ...TOOL, cursor: "grab" }}
          title="Drag to move this section"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        ><GripVertical size={14} /></span>
        {/* THE NAME, typed here. The outline reads off it (Navigator), and a
            document of twelve sections all called "Section" is an outline
            nobody can use. One writer: `changeSection` in the shell. */}
        <input
          className="bxc-secname"
          value={section.label || ""}
          placeholder="Name this section"
          aria-label="Section name"
          title="What this section is called. It shows in the outline, and on the page when the section is numbered."
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onPatchSection(section.id, { label: e.target.value })}
        />
        <span className="bxc-div" />
        <button type="button" style={{ ...TOOL, opacity: index === 0 ? 0.35 : 1 }} disabled={index === 0}
          title="Move this section up" aria-label="Move this section up"
          onClick={(e) => { e.stopPropagation(); onMoveSection(section.id, index - 1); }}><ArrowUp size={14} /></button>
        <button type="button" style={{ ...TOOL, opacity: index === total - 1 ? 0.35 : 1 }} disabled={index === total - 1}
          title="Move this section down" aria-label="Move this section down"
          onClick={(e) => { e.stopPropagation(); onMoveSection(section.id, index + 1); }}><ArrowDown size={14} /></button>
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
        <span className="bxc-div" />
        <button type="button" style={TOOL} title="Settings for this section — columns, colours, spacing"
          aria-label="Settings for this section"
          onClick={(e) => { e.stopPropagation(); onSelect({ kind: "section", sectionId: section.id }); }}>
          <Settings2 size={14} />
        </button>
      </div>

      <div
        ref={hostRef}
        className="bx-doc"
        style={{ ["--bx-accent" as any]: ctx.accent, ["--bx-head" as any]: ctx.headingFont, ["--bx-body" as any]: ctx.bodyFont }}
        onInput={(e) => {
          const el = (e.target as HTMLElement).closest<HTMLElement>("[data-edit]");
          if (!el) return;
          commit(el);
          watchSlash(el);
        }}
        onKeyDown={(e) => {
          if (!slash) return;
          if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onSlashCommit?.(); return; }
          if (e.key === "Escape") { e.stopPropagation(); onSlash?.(null); }
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
    </div>
  );
}

const CANVAS_CSS = `
.bxc-sec { position: relative; }
.bxc-sec.bxc-sel { outline: 2px solid #2D9CDB; outline-offset: -2px; background: #FBFDFF; }
.bxc-sec.bxc-dragging { opacity: .45; }
/* THE SLIM TOOLBAR, on hover as well as on selection (D-12). */
.bxc-toolbar { position: absolute; top: -17px; left: 24px; z-index: 5; display: flex; align-items: center; gap: 2px;
  background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 6px; padding: 3px 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08); font-size: 11px; color: #334155;
  opacity: 0; pointer-events: none; transition: opacity .1s; }
.bxc-sec:hover > .bxc-toolbar, .bxc-sec.bxc-sel > .bxc-toolbar,
.bxc-toolbar:focus-within { opacity: 1; pointer-events: auto; }
.bxc-div { width: 1px; height: 18px; background: #E2E8F0; }
.bxc-secname { border: none; outline: none; background: transparent; font-size: 11px; font-weight: 600;
  color: #334155; width: 120px; padding: 0 4px; }
.bxc-secname:focus { background: #F1F5F9; border-radius: 3px; }
.bxc-tiny { border: 1px dashed #CBD5E1; background: #fff; color: #0C4A60; border-radius: 999px; padding: 3px 10px;
  font-size: 10px; font-weight: 600; cursor: pointer; flex: 0 0 auto; }
.bxc-tiny:hover { border-color: #0C4A60; }
.bxc-widget-sel { outline: 1px dashed #2D9CDB; outline-offset: 3px; border-radius: 3px; }
[data-widget] { position: relative; }
/* THE WIDGET'S OWN HANDLE — on hover, at the corner, outside the words. */
.bxc-wtools { position: absolute; top: -11px; left: -9px; z-index: 6; display: inline-flex; gap: 2px;
  opacity: 0; transition: opacity .1s; }
[data-widget]:hover > .bxc-wtools, .bxc-widget-sel > .bxc-wtools { opacity: 1; }
.bxc-grip, .bxc-wtool { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center;
  background: #2D9CDB; color: #fff; border: none; border-radius: 4px; font-size: 11px; line-height: 1;
  user-select: none; cursor: pointer; padding: 0; }
.bxc-grip { cursor: grab; letter-spacing: 1px; }
.bxc-grip:active { cursor: grabbing; }
.bxc-wtool-danger { background: #B91C1C; }
/* THE NEW THING, for two seconds. */
.bxc-flash { outline: 2px solid #EF6C33; outline-offset: 4px; border-radius: 3px;
  animation: bxc-flash-fade 2s ease-out; }
@keyframes bxc-flash-fade { 0% { background: rgba(239,108,51,.22); } 100% { background: transparent; } }
/* AN EMPTY COLUMN SAYS SO. */
.bxc-addhere { display: block; width: 100%; border: 1px dashed #A8CDD8; background: #F8FBFD; color: #0C4A60;
  border-radius: 6px; padding: 14px 8px; font-size: 11px; font-weight: 600; cursor: pointer; }
.bxc-addhere:hover { border-color: #0C4A60; background: #EEF6FA; }
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
/* THE EMPTY PAGE (D-148) — three things to start with, not a blank sheet. */
.bxc-empty { padding: 36px 28px; text-align: center; }
.bxc-empty-head { font-size: 17px; font-weight: 700; color: #0B1C24; }
.bxc-empty-hint { font-size: 12px; color: #5A7A8A; margin-top: 4px; }
/* auto-fit rather than a breakpoint: the empty page is drawn on the PAPER,
   which is 780px on a desktop and 390 in the phone preview, and a third
   number would be the drift responsive.ts exists to end. */
.bxc-empty-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 20px; }
.bxc-empty-card { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center;
  border: 1px solid #A8CDD8; background: #F8FBFD; border-radius: 10px; padding: 18px 12px; cursor: pointer; }
.bxc-empty-card:hover { border-color: #0C4A60; background: #EEF6FA; }
.bxc-empty-plus { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
  border-radius: 999px; background: #0C4A60; color: #fff; }
.bxc-empty-title { font-size: 13px; font-weight: 700; color: #0B1C24; }
.bxc-empty-sub { font-size: 11px; line-height: 1.35; color: #5A7A8A; }
`;

export default Canvas;

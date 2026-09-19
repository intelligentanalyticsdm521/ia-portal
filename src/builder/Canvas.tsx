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
import { GripVertical, Plus, X } from "lucide-react";
import type { BuilderDocument, Section, Selection, WidgetPath } from "./model";
import { findNode, isContainer, nodeIdAt } from "./treeOps";
import { extendSelection } from "./model";
import type { ContainerPreset } from "./treeOps";
import { renderSection, type RenderContext, DOCUMENT_CSS } from "./render";
import { readEditedText } from "./editedText";
import { AddBar, ADDBAR_CSS } from "./AddBar";
import { AddSection, ADDSECTION_CSS, type SectionLayout, type StructurePreset } from "./AddSection";
import {
  FLASH_MS, sectionAtViewport,
  type InsertSpot, type SectionBox,
} from "./insertPosition";
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
  /**
   * THE BOX it lands in — a column's id, or a container's, at any depth.
   *
   * §11.12. The old spot could only name a column, so a drop into a row of
   * cards had nowhere to go; the placement rule below now finds the DEEPEST box
   * under the pointer and this carries it. The section and column ride along
   * for the surfaces that still speak in sections, derived and never typed.
   */
  hostId: string;
  sectionId: string;
  columnIndex: number;
  /** Where among that box's children the drop inserts. */
  index: number;
  /** Relative to the section host, for the line. */
  top: number;
  left: number;
  width: number;
  /** A row's line is a tall thin one; a column's is a wide flat one. */
  height?: number;
}

/** What is in the air: a NEW widget from the pane, or one already on the page. */
export type CanvasDrag =
  /**
   * Something from the pane. `box` is set when what is in the air is a BOX
   * rather than a widget (§11.12) — one payload with one optional field, not a
   * third variant, because the drop handler asks the same two questions of it
   * either way and a third case is a third place to forget something.
   */
  | { kind: "new"; label: string; box?: ContainerPreset }
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
  /**
   * THE ADD AREA (Elementor's, copied 2026-09-19). See AddSection.tsx.
   *
   * "+" -> Flexbox or Grid -> a structure: `onAddBlank`. The folder: the
   * template library, `onAddTemplate`. Both say WHERE — the index the new
   * section goes in at. There is no list of widgets on the page; widgets are in
   * the left panel and nowhere else.
   */
  onAddBlank: (atIndex: number, layout: SectionLayout, preset: StructurePreset) => void;
  onAddTemplate: (atIndex: number) => void;
  /**
   * "DRAG WIDGET HERE". Whatever is in the air (`drag`) was let go on the add
   * area: it lands in a NEW section at this index. The shell owns the payload.
   */
  onDropOnAddArea?: (atIndex: number) => void;
  /** A widget's own hover handle (D-12). */
  onDeleteWidget?: (path: WidgetPath) => void;
  /**
   * RIGHT-CLICK ANYTHING (M-8).
   *
   * The canvas says WHAT was right-clicked and WHERE the pointer was; the shell
   * builds the menu (`builderMenu.ts`) and runs the actions — the same
   * functions the hover toolbar presses. Two menus over one set of verbs is how
   * a Duplicate that works on the toolbar and not in the menu happens.
   */
  onContextMenu?: (
    target: { kind: "section"; sectionId: string } | { kind: "widget"; path: WidgetPath },
    at: { x: number; y: number },
  ) => void;
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
  onDropWidget?: (spot: InsertSpot) => void;
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
  width: 24, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center",
  color: "#fff", border: "none", background: "transparent", cursor: "pointer", padding: 0,
};

export function Canvas(props: CanvasProps) {
  const { doc, ctx, selection, onSelect } = props;
  const [dragId, setDragId] = useState<string | null>(null);
  /** Which "+" strip a section drag is hovering. The strip IS the drop line. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  /** The add area a container's "+" opened, ABOVE the section at this index. */
  const [addAreaAt, setAddAreaAt] = useState<number | null>(null);
  /** Which add area a dragged widget is over: a section index, or null. */
  const [areaDrop, setAreaDrop] = useState<number | null>(null);
  const widgetInAir = !!props.drag && !dragId;
  const areaDropProps = (at: number) => (props.onDropOnAddArea ? {
    dropActive: widgetInAir && areaDrop === at,
    onDragOver: (e: React.DragEvent) => { if (widgetInAir) { e.preventDefault(); setAreaDrop(at); } },
    onDragLeave: () => setAreaDrop(null),
    onDrop: (e: React.DragEvent) => {
      if (!widgetInAir) return;
      e.preventDefault();
      setAreaDrop(null);
      props.onDropOnAddArea?.(at);
    },
  } : {});
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

  return (
    <div ref={rootRef}
      /* M-24 — the one marker the open-time measurement reads. It carries how
         many sections have been painted, so "the canvas is on screen" and "the
         canvas has the page on it" are two different, measurable things and a
         builder cannot report a fast open by showing an empty grey sheet. */
      data-builder-canvas={doc.sections.length}
      style={{ background: "#E6ECF1", minHeight: "100%", padding: "20px 24px 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <style>{props.canvasCss ?? DOCUMENT_CSS}{CANVAS_CSS}{ADDBAR_CSS}{ADDSECTION_CSS}{props.extraCss || ""}</style>

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

        {doc.sections.map((s, i) => (
          <div key={s.id}>
            {/* The "+" on this section's handle opens an add area ABOVE it. */}
            {addAreaAt === i && (
              <AddSection
                onClose={() => setAddAreaAt(null)}
                onBlank={(layout, preset) => { setAddAreaAt(null); props.onAddBlank(i, layout, preset); }}
                onTemplate={() => { setAddAreaAt(null); props.onAddTemplate(i); }}
                {...areaDropProps(i)}
              />
            )}
            {i === 0 && (
              <AddBar
                dropActive={!!dragId && dropIndex === 0}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropIndex(0); } }}
                onDrop={(e) => { if (!dragId) return; e.preventDefault(); props.onMoveSection(dragId, 0); setDragId(null); setDropIndex(null); }}
              />
            )}
            <SectionHost
              section={s}
              index={i}
              total={doc.sections.length}
              selected={selection?.kind === "section" && selection.sectionId === s.id}
              selectedWidgetId={selection?.kind === "widget" ? nodeIdAt(doc, selection) : null}
              alsoSelectedIds={selection?.kind === "widget" ? (selection.also || []) : []}
              dragging={dragId === s.id}
              onDragStart={() => setDragId(s.id)}
              onDragEnd={() => { setDragId(null); setDropIndex(null); }}
              onAddAbove={() => setAddAreaAt(i)}
              {...props}
              ctx={ctx}
            />
            <AddBar
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
            />
          </div>
        ))}

        {/* THE ADD AREA AT THE BOTTOM OF THE PAGE — always there, as in the
            reference. On an empty page it is the whole page. */}
        <AddSection
          onBlank={(layout, preset) => props.onAddBlank(doc.sections.length, layout, preset)}
          onTemplate={() => props.onAddTemplate(doc.sections.length)}
          {...areaDropProps(doc.sections.length)}
          note={props.nextUp
            ? <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 8 }}>Next up in this template: {props.nextUp}</div>
            : null}
        />

        {props.chromeBottom && (
          <div className="bxc-chrome" title={props.chromeNote || "From your website's theme"}
            dangerouslySetInnerHTML={{ __html: props.chromeBottom }} />
        )}
      </div>
    </div>
  );
}

/* ── One section: its HTML, its toolbar, its editable runs ────────────────── */

/**
 * A section on its own, as a document, so `findNode` can be asked about it.
 *
 * The canvas paints and measures ONE section at a time — that is what makes the
 * caret survive a repaint — so the tree lookups here are scoped to the section
 * in hand. One helper rather than the same literal in four callbacks.
 */
function oneSection(section: Section): BuilderDocument {
  return { v: 2, settings: { style: "plain" }, sections: [section] };
}

function SectionHost({
  section, index, total, ctx, selected, selectedWidgetId, alsoSelectedIds, selection, dragging,
  onSelect, onEditText, onPatchSection, onDuplicateSection, onDeleteSection,
  onMoveSection, onDragStart, onDragEnd, renderSection: renderOne,
  drag, onDragWidget, onDropWidget, onDeleteWidget, onAddAbove,
  onContextMenu,
  flashWidgetId, onTokenClick,
}: CanvasProps & {
  section: Section; index: number; total: number; selected: boolean; selectedWidgetId: string | null;
  alsoSelectedIds: string[];
  dragging: boolean; onDragStart: () => void; onDragEnd: () => void;
  /** The "+" on this section's handle: open an add area above it. */
  onAddAbove: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  /** Where the line is drawn right now. Null when nothing is over this section. */
  const [spot, setSpot] = useState<DropSpot | null>(null);
  const html = (renderOne || renderSection)(section, ctx);
  /** True when this section holds a part the law puts there. See model.ts. */
  const required = section.columns.some((c) => c.widgets.some((w) => w.locked));
  const flashedRef = useRef<string | null>(null);
  /** The shift-clicked ids as ONE string, so an effect can depend on them. */
  const alsoKey = alsoSelectedIds.join(",");

  /**
   * WHERE A THING ON THE PAGE LIVES, read off the DOM it was painted into.
   *
   * §11.12: the DOM carries the ID and the model answers everything else, so
   * this reaches a card inside a row inside a box. The old version counted
   * indexes in `section.columns[n].widgets`, which by construction could only
   * ever find something at the top of a column.
   */
  const pathOf = useCallback((el: HTMLElement): WidgetPath | null => {
    const id = el.dataset.widget;
    if (!id) return null;
    const hit = findNode(oneSection(section), id);
    if (!hit) return null;
    return { sectionId: section.id, columnIndex: hit.columnIndex, widgetIndex: hit.index, id };
  }, [section]);

  // Paint the section. SKIPPED while the caret is inside THE WORDS — see the
  // header.
  //
  // FOUND BY DRIVING IT (2026-09-17, M-21): the test was "is the focus anywhere
  // inside this section", and a widget's own handle is inside it — so pressing
  // the padlock focused the button, the repaint was skipped, and the handle
  // went on showing an open padlock over a widget the model had just locked.
  // The page said one thing and the document said another.
  //
  // The rule protects the CARET, so it asks about the caret: an editable run,
  // not any descendant. A button is not somewhere text is being typed.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && host.contains(active) && active.closest("[data-bx-editable]")) return;
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
      const id = el.dataset.widget || "";
      const isSel = id === selectedWidgetId;
      el.classList.toggle("bxc-widget-sel", isSel);
      // SHIFT-CLICKED AS WELL (§11.12). A second mark rather than the same one,
      // because "the one the inspector is bound to" and "also going into the
      // box" are two different facts and the author has to be able to see which
      // is which.
      el.classList.toggle("bxc-widget-also", !isSel && alsoSelectedIds.includes(id));

      const tools = document.createElement("span");
      tools.className = el.dataset.kind === "container" ? "bxc-wtools bxc-wtools-box" : "bxc-wtools";
      tools.setAttribute("contenteditable", "false");

      const path = pathOf(el);
      const locked = path
        ? !!section.columns[path.columnIndex]?.widgets[path.widgetIndex]?.locked
        : false;

      /* A BOX WEARS THE SAME HANDLE AS EVERYTHING ELSE (§11.12).
         "Every element behaves like every other element" is the whole rule, so
         there is no second loop and no second set of buttons here — a container
         carries `data-widget` in edit mode exactly as a widget does, and this
         loop finds it. Only the WORDS change, because "another column, another
         section" is not what a box does. */
      const isBox = el.dataset.kind === "container";
      const noun = isBox ? "box" : "block";
      const grip = document.createElement("span");
      grip.className = "bxc-grip";
      grip.setAttribute("draggable", "true");
      grip.title = isBox
        ? "Drag to move this box, and everything in it, anywhere on the page"
        : "Drag to move this anywhere on the page — another box, another column, another section";
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

      /* THE HANDLE IS ELEMENTOR'S (2026-09-19). A container: drag and "x". A
         widget: the one handle, which is also how it is dragged. Duplicate,
         copy, paste, lock, hide and the rest are on RIGHT-CLICK, where the
         reference keeps them — six coloured squares on every box was ours, and
         Brandon's word for it was "confusing". */
      if (isBox && !locked) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "bxc-wtool";
        b.title = "Delete Container";
        b.setAttribute("aria-label", "Delete Container");
        b.textContent = "\u2715";
        b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); if (path) onDeleteWidget?.(path); });
        tools.appendChild(b);
      }
      el.appendChild(tools);
    }

    /* ── AN EMPTY CONTAINER SHOWS A "+" IN THE MIDDLE (Elementor's) ────────
       Pressing it does what the reference does: it SELECTS this container, and
       the left panel is where the widgets are. A tile pressed with a container
       selected lands INSIDE it (insertPosition.ts), and a tile dragged lands
       where it is dropped. No list of widgets opens on the page. */
    for (const box of Array.from(host.querySelectorAll<HTMLElement>("[data-bx-host]"))) {
      if (box.querySelector("[data-widget]")) continue;
      const columnIndex = Number(box.closest<HTMLElement>("[data-col]")?.dataset.col ?? 0);
      const hostId = box.dataset.bxHost || "";
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bxc-addhere";
      b.setAttribute("data-builder-addhere", String(columnIndex));
      b.setAttribute("data-addhere-host", hostId);
      b.title = "Drag a widget here, or press and then choose one on the left";
      b.setAttribute("aria-label", b.title);
      b.textContent = "+";
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const owner = box.closest<HTMLElement>("[data-widget]");
        const path = owner && owner.dataset.widget === hostId ? pathOf(owner) : null;
        if (path) onSelect({ kind: "widget", ...path });
        // An empty COLUMN is not a node; name the column, and the insert rule
        // keeps the new thing in it (insertPosition: "the column it named").
        else onSelect({ kind: "widget", sectionId: section.id, columnIndex, widgetIndex: -1 });
        document.querySelector<HTMLInputElement>('[data-builder-slot="pane"] input')?.focus();
      });
      box.appendChild(b);
    }
  }, [html, selectedWidgetId, alsoSelectedIds, onDragWidget, onDeleteWidget, onSelect, pathOf, section]);

  /**
   * THE SELECTION MARKS, WITHOUT A REPAINT.
   *
   * FOUND BY DRIVING IT (2026-09-17, D-156). Shift-clicking a second widget
   * changed the document and changed nothing on the page: the paint above is
   * deliberately SKIPPED while the caret is inside a run of text, and on this
   * canvas clicking any words puts the caret inside a run of text. So the
   * marks could never be drawn by the gesture that sets them, and "select two
   * things and put them in a box" had no way to show you what was selected.
   *
   * The guard exists to stop React rewriting the HTML under the cursor. This
   * writes no HTML: it toggles two classes on wrappers the paint already made.
   * That is why it is a second effect rather than a hole in the first one.
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    for (const el of Array.from(host.querySelectorAll<HTMLElement>("[data-widget]"))) {
      const id = el.dataset.widget || "";
      const isSel = id === selectedWidgetId;
      el.classList.toggle("bxc-widget-sel", isSel);
      el.classList.toggle("bxc-widget-also", !isSel && alsoKey.split(",").includes(id));
    }
  }, [selectedWidgetId, alsoKey, html]);

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

    // EVERY BOX, at every depth, columns included — they are boxes too. This is
    // the one line that makes the rule the same all the way down: the candidate
    // list is "things you can drop into", not "columns".
    const boxes = Array.from(host.querySelectorAll<HTMLElement>("[data-bx-host]"));
    if (!boxes.length) return null;

    const covers = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    };
    // THE DEEPEST ONE THE POINTER IS ACTUALLY IN.
    //
    // A box inside a column is inside the column's rectangle too, so "the first
    // match" would always be the column and a card could never be dropped into
    // a row. Depth decides, and `querySelectorAll` returns document order, so
    // the deepest covering box is simply the LAST covering box.
    let box = boxes.filter(covers).pop() || null;
    if (!box) {
      // Nothing covers it — the nearest box by distance, so a drop just outside
      // still lands somewhere the author can see. Columns only: falling into a
      // random nested box the pointer was never over is worse than the end of
      // the nearest column.
      const cols = boxes.filter((b) => b.hasAttribute("data-col"));
      const pool = cols.length ? cols : boxes;
      const distance = (x: HTMLElement) => {
        const r = x.getBoundingClientRect();
        const dx = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
        const dy = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
        return dx + dy;
      };
      box = pool.reduce((best, b) => (distance(b) < distance(best) ? b : best), pool[0]);
    }

    const boxRect = box.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    // Its OWN children only — `children`, never a query — so a card two boxes
    // down is not mistaken for a sibling of the box it is in.
    const kids = Array.from(box.children).filter((el): el is HTMLElement =>
      el instanceof HTMLElement && el.hasAttribute("data-widget"));

    // A ROW measures across, a column measures down. The same sentence either
    // way: the first child whose MIDDLE is past the pointer is where the line
    // goes. A row that measured vertically would draw the line above a card the
    // pointer was to the left of, which is the drop nobody meant.
    const across = getComputedStyle(box).flexDirection === "row";
    let index = kids.length;
    let before: HTMLElement | null = null;
    for (let i = 0; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect();
      const past = across ? clientX < r.left + r.width / 2 : clientY < r.top + r.height / 2;
      if (past) { index = i; before = kids[i]; break; }
    }

    const last = kids.length ? kids[kids.length - 1].getBoundingClientRect() : null;
    const line = before ? before.getBoundingClientRect() : null;
    const column = Number(box.closest<HTMLElement>("[data-col]")?.dataset.col ?? 0);
    return {
      hostId: box.dataset.bxHost || "",
      sectionId: section.id,
      columnIndex: column,
      index,
      // The line is drawn ACROSS a column and DOWN a row, which is the only way
      // it can say "between these two" in either direction.
      top: (across ? boxRect.top : (line ? line.top : (last ? last.bottom : boxRect.top))) - wrapRect.top,
      left: (across ? (line ? line.left : (last ? last.right : boxRect.left)) : boxRect.left) - wrapRect.left,
      width: across ? 3 : boxRect.width,
      height: across ? boxRect.height : 3,
    };
  }, [section.id]);

  const draggingWidget = drag?.kind === "new" || drag?.kind === "move";

  /**
   * WHAT THE AUTHOR TYPED GOES BACK IN — in the case they typed it.
   *
   * `readEditedText` and never `el.innerText`: innerText is the RENDERING, so
   * a run styled `text-transform: uppercase` — a property-plan row label, a
   * pricing table's column heading — used to write its own capitals into the
   * document the moment the caret left it, and the signed PDF printed them
   * (found by driving it, 2026-09-18). editedText.ts is the one reader.
   */
  const commit = useCallback((el: HTMLElement) => {
    const path = el.dataset.edit;
    const widgetEl = el.closest<HTMLElement>("[data-widget]");
    if (!path || !widgetEl?.dataset.widget) return;
    const text = readEditedText(el).replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trimEnd();
    onEditText(section.id, widgetEl.dataset.widget, path, text, `${widgetEl.dataset.widget}:${path}`);
  }, [onEditText, section.id]);

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
        if (at) {
          onDropWidget?.({
            hostId: at.hostId, sectionId: at.sectionId, columnIndex: at.columnIndex, index: at.index,
          });
        }
      }}
      /* M-8 — right-click is the same menu as the ⋯ on the handle and the ⋯ in
         the Outline. It asks the WIDGET first and falls back to the section, in
         the same order the click handler below does, so what you right-clicked
         and what you selected are never two different things. */
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        const el = (e.target as HTMLElement).closest<HTMLElement>("[data-widget]");
        const path = el && hostRef.current?.contains(el) ? pathOf(el) : null;
        if (path) {
          /* A RIGHT-CLICK ON SOMETHING ALREADY SELECTED KEEPS THE SELECTION.
             FOUND BY DRIVING IT (D-156): shift-clicking two widgets and then
             right-clicking one of them re-selected THAT one on the way to the
             menu, so "Put these in a box" was greyed out with "hold Shift and
             click a second thing" beside it — while two things were selected.
             The gesture that opens the menu cannot be the gesture that undoes
             what the menu is for. */
          const already = alsoKey.split(",").includes(path.id || "") || path.id === selectedWidgetId;
          if (!already) onSelect({ kind: "widget", ...path });
          onContextMenu({ kind: "widget", path }, { x: e.clientX, y: e.clientY });
          return;
        }
        onSelect({ kind: "section", sectionId: section.id });
        onContextMenu({ kind: "section", sectionId: section.id }, { x: e.clientX, y: e.clientY });
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
          if (path) {
            // SHIFT ADDS TO THE SELECTION (§11.12), which is what "select two
            // cards and put them in a box" is made of. The rule is in the model
            // so it is a test rather than three lines in a click handler.
            onSelect(e.shiftKey ? extendSelection(selection, path) : { kind: "widget", ...path });
            return;
          }
        }
        onSelect({ kind: "section", sectionId: section.id });
      }}
    >
      {/* THE HANDLE — Elementor's three, top centre: "+" opens an add area
          above this, the grip drags it (and a press selects it), "x" deletes
          it. Everything else is on right-click and in the panel on the right. */}
      <div className="bxc-toolbar" role="toolbar" aria-label={`Container: ${section.label || "untitled"}`}>
        <button type="button" style={TOOL} title="Add Container" aria-label="Add Container"
          onClick={(e) => { e.stopPropagation(); onAddAbove(); }}><Plus size={13} /></button>
        <span
          style={{ ...TOOL, cursor: "grab" }}
          title="Edit Container — drag to move it"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onClick={(e) => { e.stopPropagation(); onSelect({ kind: "section", sectionId: section.id }); }}
        ><GripVertical size={13} /></span>
        <button type="button" style={{ ...TOOL, opacity: required ? 0.35 : 1 }} disabled={required}
          title={required ? "The footer carries your unsubscribe link and address — the law asks for both, so it stays" : "Delete Container"}
          aria-label="Delete Container"
          onClick={(e) => { e.stopPropagation(); onDeleteSection(section.id); }}><X size={13} /></button>
      </div>

      <div
        ref={hostRef}
        className="bx-doc"
        style={{ ["--bx-accent" as any]: ctx.accent, ["--bx-head" as any]: ctx.headingFont, ["--bx-body" as any]: ctx.bodyFont }}
        onInput={(e) => {
          const el = (e.target as HTMLElement).closest<HTMLElement>("[data-edit]");
          if (!el) return;
          commit(el);
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
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height ?? 3 }}
          data-drop-host={spot.hostId}
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
/* THE HANDLE — a small tab, top centre, as in the reference. */
.bxc-toolbar { position: absolute; top: -22px; left: 50%; transform: translateX(-50%); z-index: 5;
  display: flex; align-items: center; background: #0C4A60; border-radius: 5px 5px 0 0; padding: 0 2px;
  opacity: 0; pointer-events: none; transition: opacity .1s; }
.bxc-toolbar > *:hover { background: rgba(255,255,255,.16); }
.bxc-sec:hover > .bxc-toolbar, .bxc-sec.bxc-sel > .bxc-toolbar,
.bxc-toolbar:focus-within { opacity: 1; pointer-events: auto; }
.bxc-widget-sel { outline: 1px dashed #2D9CDB; outline-offset: 3px; border-radius: 3px; }
[data-widget] { position: relative; }
/* THE WIDGET'S OWN HANDLE — on hover, at the corner, outside the words. */
/* A HANDLE THAT CANNOT BE SEEN CANNOT BE PRESSED (landed 2026-09-17).

   FOUND BY DRIVING IT: pressing the ✕ on a card inside a row inside a box
   deleted THE BOX AND EVERYTHING IN IT. The handles were hidden with
   opacity: 0 alone, and an element at opacity 0 is invisible but still
   takes the click — so the ancestors' ✕, painted later in the DOM at the
   same corner and the same z, swallowed every press meant for the child.
   Absence-based hiding, failing open, on the one control that destroys
   work: V-3's defect on the tool row rather than on the "+".

   pointer-events travels with opacity in all three rules below, so
   "stepped back" means "not pressable" everywhere and there is one
   answer to "can this handle be pressed". */
.bxc-wtools { position: absolute; top: -11px; left: -9px; z-index: 6; display: inline-flex; gap: 2px;
  opacity: 0; pointer-events: none; transition: opacity .1s; }
[data-widget]:hover > .bxc-wtools, .bxc-widget-sel > .bxc-wtools { opacity: 1; pointer-events: auto; }
/* ALSO SELECTED (§11.12) — shift-clicked, going into the box with the other
   one. A dotted ring rather than the solid selection ring, because the author
   has to be able to tell which one the inspector on the right is about. */
.bxc-widget-also { outline: 2px dotted #2D9CDB; outline-offset: 2px; border-radius: 3px; }
/* A BOX'S OWN HANDLE STEPS BACK while the pointer is on something INSIDE it.
   Without this, hovering a card in a row in a box shows three handles stacked
   in the same corner and the author cannot tell which one they are about to
   press — which is the nesting equivalent of the section toolbar that used to
   sit on top of the first widget. */
.bx-box:has(> [data-widget]:hover) > .bxc-wtools { opacity: 0; pointer-events: none; }
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
/* AN EMPTY CONTAINER: a "+" in the middle of a dashed box, as in the reference. */
.bxc-addhere { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 84px;
  border: 1px dashed #D5D8DC; background: transparent; color: #9DA5AE; border-radius: 3px;
  font-size: 22px; font-weight: 300; line-height: 1; cursor: pointer; }
.bxc-addhere:hover { color: #515962; border-color: #9DA5AE; }
/* A container that is the ONLY thing in its section wears the section's handle,
   not a second one of its own — one container, one handle. */
[data-col] > .bx-box:only-child > .bxc-wtools-box { display: none; }
/* A BOX ON THE PAGE, in the editor only: a hairline so the author can see the
   thing they are dropping into. Never in the customer's copy — this class is
   on the canvas wrapper, not in DOCUMENT_CSS. */
.bxc-sec .bx-box { outline: 1px dashed rgba(12,74,96,.16); outline-offset: 2px; border-radius: 4px; }
.bxc-sec .bx-box:hover { outline-color: rgba(12,74,96,.42); }
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

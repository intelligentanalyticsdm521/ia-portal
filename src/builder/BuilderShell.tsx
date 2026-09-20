/**
 * builder/BuilderShell.tsx — ONE builder. Every surface opens this.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §5 step 2. It owns the things that are the
 * same for a proposal, a website page, a newsletter and a landing page:
 *
 *   · the full-viewport surface and the three panes — through BuilderFrame,
 *     which My Brand's pixel canvas opens as well (§5 step 5)
 *   · the widget pane from the registry, grouped, searchable, tooltips
 *   · selection, the section toolbar, the inspector bound to the selection
 *   · undo / redo, with typing coalesced into one step per field
 *   · "Add a section → Blank | Pre-made…" and the gallery behind it
 *
 * What it does NOT know: what a proposal is. Products & Services, the clause
 * library, customers, locations, sending and signing all arrive as props from
 * the adapter (proposal/ProposalBuilder.tsx), which is how the website and
 * email adapters will reuse this without a second shell.
 *
 * ── THE USABILITY REBUILD (§11.10, D-147 / D-148) ─────────────────────────
 * The shell is where the findings that are about BEHAVIOUR rather than about
 * pixels are answered:
 *
 *   D-11  a widget lands where the author is — after the selected widget, in
 *         the selected section, or in the section on screen (insertPosition.ts)
 *         — then is scrolled to and glows for two seconds
 *   D-18  Ctrl+Z / Ctrl+Y / Ctrl+S / Delete actually do what the tooltips say
 *         (shortcuts.ts; the frame listens, this decides)
 *   D-35  the still-to-fill-in list is a button that jumps to the first field
 *   D-40  undo no longer calls the adapter's setState from inside a state
 *         updater — see `setHist` below
 *   D-148 an empty page offers three things to start with
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BuilderFrame } from "./BuilderFrame";
import { WidgetPane } from "./WidgetPane";
import { StructureWindow } from "./Navigator";
import { STRUCTURE_PRESETS, type SectionLayout, type StructurePreset } from "./AddSection";

/** One column — what the menu's "Add New Container" makes, as the reference does. */
const ONE_COLUMN: StructurePreset = STRUCTURE_PRESETS[0];
import { Canvas, type CanvasDrag } from "./Canvas";
import { Inspector, type InspectorSlots } from "./Inspector";
import { SectionGallery, type SavedTemplate } from "./SectionGallery";
import { FirstRun } from "./FirstRun";
import { AnchoredToast } from "./AnchoredToast";
import { ContextMenu } from "./ContextMenu";
import { FindBox } from "./FindBox";
import { HistoryPanel } from "./HistoryPanel";
import { NameBlockDialog } from "./NameBlockDialog";
import { documentMenu, menuFor, type MenuAction } from "./builderMenu";
import { openBuilder } from "./builderOpen";
import { type FindAction, type FindResult } from "./find";
import {
  addSection, addWidget, duplicateSection, duplicateWidget, makeSection, makeWidget, moveSection,
  moveWidget, moveWidgetTo, patchSection, patchWidget, removeSection, removeWidget, setLayout,
  setPropPath, setWidgetStyle, widgetAt, extendSelection, selectedIds, holdsLocked,
  insertNode, moveNode, groupNodes, ungroupNode, setDirection, makePreset, findNode, makeContainer,
  isContainer, directionOf, hostDepth, subtreeHeight, MAX_DEPTH, nodeIdAt,
  editWidgetText, widgetById, pathOfNode,
  setWidgetLocked, cloneSection,
  carrierContainer, carrierPath, findSection, isCarrierPair, resolveSelection,
  type BuilderDocument, type Section, type Selection, type Widget, type WidgetPath,
} from "./model";
import { layerFor, withLayer, type ElementStyle } from "./style";
import { canRedo, canUndo, initHistory, push, redo, steps, travelTo, undo, type History } from "./history";
import { nextPreview, previewNote, previewPaperWidth, type PreviewKey } from "./responsive";
import { WIDGETS_BY_KIND, presetFor, type BuilderAdapter, type WidgetDef } from "./registry";
import type { WidgetLock } from "./tier";
import type { RenderContext } from "./render";
import type { PremadeSection } from "./templates";
import { FLASH_MS, insertSpotFor, firstSpotIn, type InsertSpot } from "./insertPosition";
/* ONE ANSWER TO "WHAT IS A BLANK ROW" (G-1, 2026-09-19). `blankRepeat` lived
   here and only the INSERT could reach it, so the panel's new repeater control
   would have needed a second copy — and a second copy is how a table whose rows
   are lines of cells gains a row that is a bare string. Replace means delete. */
import { blankRow } from "./repeater";
// `patchNode` is the ONE writer of a widget's props, at any depth, and it
// carries the model's own rules (at most one Recommended in a row) with it.
import { patchNode, type ContainerPreset } from "./treeOps";
import type { OutlineDrop } from "./navigatorModel";
import { resolveCopy, type BuilderCopy } from "./copy";
import { PROBLEMS_CTA, firstWithFocus, focusSelector, type BuilderProblem } from "./problems";
import { builderTipsAfterClose, shouldShowFirstRun } from "./firstRunModel";
// D-154 — the welcome box is a PERSON's switch, kept server-side, so it is the
// same answer on every computer they sign in on. There is no localStorage key
// behind it any more.
import { usePreference } from "../prefs/preferencesContext";
import type { BuilderAction } from "./shortcuts";

/** What a menu, a lock or a hide is being applied to (M-8 / M-21). */
export type MenuTarget =
  | { kind: "section"; sectionId: string }
  | { kind: "widget"; path: WidgetPath }
  /* THE PAGE ITSELF (D-172, round 2) — right-clicking the sheet, not a thing
     on it. The reference answers that with its own five-row document menu;
     ours let the browser answer it. */
  | { kind: "document" };

/** Which array a counted widget repeats. One map, so "how many?" works once. */
export function repeatKeyFor(kind: string): string | null {
  switch (kind) {
    case "key_value_table": case "property_plan": case "pricing_table": return "rows";
    case "clauses": case "list": case "gallery": return "items";
    case "article_card": case "product_card": return "items";
    case "callout": return "panels";
    case "data_table": return "columns";
    case "testimonial": return "items";
    default: return null;
  }
}

/* `blankRepeat` LIVED HERE and is DELETED (G-1, 2026-09-19).
   It was a switch on the widget's KIND, reachable only from the insert, and it
   held the row shapes four of whose widgets D-165 had already deleted. The shape
   of one row is the CONTROL's own fact, so it is declared on the control (`row`
   / `cellsFrom` in registry.ts) and read by `repeater.ts blankRow` — which the
   insert below and the panel's repeater both call. One answer, one place. */

export interface BuilderShellProps extends InspectorSlots {
  open: boolean;
  onClose: () => void;
  adapter: BuilderAdapter;
  /** Modal chrome. */
  title: ReactNode;
  /**
   * OUR COUNTERPART OF THE REFERENCE'S Angie, in the bar (D-172).
   *
   * It used to be drawn in the settings panel's header as well, and the
   * platform's floating bubble made a third. One door.
   */
  askArgus?: ReactNode;
  /**
   * THE ADD AREA'S THIRD ROUND BUTTON (D-172, round 2).
   *
   * The reference's add area has three: "+", the folder, and a pink "Build
   * with AI". `askArgus` above is the BAR's node, which the adapter draws
   * itself; this is the ACTION the round button runs, because the add area
   * draws its own three buttons and cannot take a node. Optional.
   */
  onAskArgus?: () => void;
  /** Show the document as its reader will get it. The eye in the top bar. */
  onPreviewDoc?: () => void;
  /** Buttons on the right of the header: Preview, Save, Send. */
  headerActions?: ReactNode;
  footer?: ReactNode;
  /** The document and how to render it — the adapter owns both. */
  doc: BuilderDocument;
  onChange: (next: BuilderDocument) => void;
  /** Bump this when the adapter replaces the document; the history restarts. */
  resetKey: string | number;
  ctx: RenderContext;
  swatches: string[];
  fonts: string[];
  /** What an empty font choice is called. See Inspector. */
  defaultFontLabel?: string;
  savedTemplates?: SavedTemplate[];
  onOpenTemplate?: (t: SavedTemplate) => void;
  /* `paneHeader` WAS HERE AND IS DELETED (§11.13.1, D-165).

     It was the slot an adapter injected its own left-pane groups through, and
     the proposal builder pushed a "Details" group of typed boxes through it —
     invented on 2026-09-16, never scope, and the thing Brandon named on the
     19th. The LEFT PANEL IS THE WIDGETS PANEL AND NOTHING ELSE, so the door is
     gone rather than the one thing that came through it. Anything an adapter
     needs to say about the document goes in `documentExtras`, which the
     inspector shows as Page settings. */
  /**
   * THE WORDS THIS BUILDER USES (D-30).
   *
   * "Heading font — the document's own font" in an email, and "Start a new
   * page here (when printed)" on a website, were the engine talking about a
   * proposal in four builders. An adapter hands in the nouns that differ and
   * inherits the rest — see copy.ts.
   */
  copy?: Partial<BuilderCopy>;
  /**
   * WIDGETS THIS CLIENT'S PLAN CANNOT HAVE — kind → the sentence they read.
   *
   * Handoff request R-D1. The website adapter already refuses at its own
   * insert seam, which is the door a shortcut, a pressed tile and a drag all
   * reach; this is what makes the PANEL say so before the press, so "not on
   * your plan" never arrives looking like a bug. The shell only
   * carries it — WHAT is locked is the adapter's answer, read from the server
   * (adapters/website/sitePlan.ts), and no tier table lives in the engine.
   */
  lockedKinds?: Record<string, WidgetLock>;
  /**
   * WHAT IS STILL MISSING, from the adapter (D-03 / D-35).
   *
   * The engine does not know what a blank is; it owns the two behaviours no
   * adapter should re-implement — the counter is a button that goes to the
   * first one, and a refusal appears at the control that was pressed.
   */
  problems?: BuilderProblem[];
  /**
   * A control refused, and where it is (D-20).
   *
   * The adapter puts `data-builder-anchor="send"` on the button and reports
   * the same name here; the toast appears beside it and the caret moves to the
   * first offending field. Cleared through `onDismissRefusal`.
   */
  refusal?: { anchor: string; message: string } | null;
  onDismissRefusal?: () => void;
  /**
   * The engine has just jumped to a problem — the adapter's half.
   *
   * The engine selects the widget and scrolls the page to it, because that is
   * the same for every builder. Some blanks are typed in the ADAPTER'S OWN
   * panel rather than on the page (the proposal's Details group), and only the
   * adapter can put the caret in a box the engine has never heard of. Optional:
   * absent, the jump is the scroll, which is what it has always been.
   */
  onFocusProblem?: (problem: BuilderProblem) => void;
  /** Ctrl+S. Absent, the shortcut does nothing rather than pretending. */
  onSave?: () => void;
  /**
   * A merge field on the page was clicked (D-03, handoff B-A-5).
   *
   * The engine marks them and catches the click; only the adapter knows where
   * that value is kept. Absent, a click is an ordinary edit.
   */
  onTokenClick?: (token: string) => void;
  /**
   * How this builder draws a section, and what the canvas looks like around
   * it. The shell knows nothing about proposals, emails or pages; an adapter
   * hands it a renderer and the canvas shows THAT. Omitted, everything falls
   * back to the document renderer, so the proposal adapter passes none of it.
   */
  renderSection?: (s: Section, ctx: RenderContext) => string;
  /** Canvas shape — a document is Letter-ish, an email 600, a web page full. */
  paperWidth?: number | "full";
  /** What the page sits on, and the two lines above it. See Canvas. */
  paper?: string;
  /** The renderer's own stylesheet, and the adapter's on top. See Canvas. */
  canvasCss?: string;
  extraCss?: string;
  /** The site's own header and footer, drawn around the page. See Canvas. */
  chromeTop?: string;
  chromeBottom?: string;
  chromeNote?: string;
  canvasBackground?: string;
  /**
   * Adding a section is the adapter's job when the SERVER builds it — the
   * website adapter asks arion-api for a real Elementor node rather than
   * inventing one. Returning false means "I handled it"; the default is the
   * engine's own blank section.
   */
  onAddBlank?: (atIndex: number) => boolean;
  /**
   * The adapter's own insert. The website adapter needs it because a SECTION
   * widget there is a whole new section whose Elementor node the SERVER
   * builds — the Portal never invents Elementor JSON. Return false for "I
   * handled it"; anything else falls through to the engine's own insert.
   */
  onInsertWidget?: (def: WidgetDef, count?: number) => boolean;
  /**
   * The adapter's own "place a pre-made section".
   *
   * The website adapter needs it for the same reason as `onInsertWidget`: a
   * website section's Elementor node is built by the SERVER from the business's
   * own details, so the gallery cannot hand back a section the engine made up.
   * Return false for "I handled it".
   */
  onPlaceSection?: (premade: PremadeSection, atIndex: number) => boolean;
  /** The adapter's pre-made sections for the gallery. */
  premade?: PremadeSection[];
  premadeTags?: string[];
  premadeThumb?: (key: string) => ReactNode;
  /**
   * What is selected, told to the adapter.
   *
   * The website adapter needs it because a content block has to land in the
   * section the author is looking at — a paragraph has nowhere to live inside
   * a hero, and guessing is how a widget ends up on the wrong band.
   */
  onSelectionChange?: (selection: Selection) => void;
  /**
   * SAVE YOUR OWN BLOCK (M-23).
   *
   * Right-click a section → name it and say in one line what it is for → it is
   * the adapter's to keep, because only the adapter knows where this business's
   * things are stored. Absent, the row is not offered at all rather than
   * offered and quietly doing nothing.
   *
   * For a snow contractor with one severe-weather clause they use on every
   * agreement, this is the difference between the builder saving them time and
   * costing them time.
   */
  onSaveBlock?: (section: Section, name: string, note: string) => void | Promise<void>;
  /** This builder's own rows in Find — Send to customer, Publish (M-22). */
  findActions?: FindAction[];
  /** One of them was picked. The engine's own rows it handles itself. */
  onFindAction?: (id: string) => void;
}

export function BuilderShell(p: BuilderShellProps) {
  /**
   * THE HISTORY, held in a ref as well as in state — and this is D-40's fix.
   *
   * Undo used to be `setHistory(h => { …; p.onChange(n.present); return n; })`.
   * React may run a state updater during ANOTHER component's render, and
   * calling the adapter's setState from inside one is exactly the "Cannot
   * update a component while rendering a different component" warning the walk
   * found. Every write now computes the next history from the ref and sets
   * both — no updater function anywhere, so nothing of ours runs during a
   * render.
   */
  const [history, setHistory] = useState<History>(() => initHistory(p.doc));
  const historyRef = useRef<History>(history);
  const setHist = useCallback((h: History) => { historyRef.current = h; setHistory(h); }, []);

  const [selection, setSelection] = useState<Selection>(null);
  const [gallery, setGallery] = useState<{ at: number } | null>(null);
  /**
   * THE preview-width state — ONE for every adapter.
   *
   * It lives here and not in each adapter because "phone" has to mean the same
   * 390px in a proposal, an email, a landing page and a website page; the
   * arithmetic that turns it into a paper width is `previewPaperWidth`, which
   * is the only place that knows an email is 600 wide and a website is not.
   */
  const [preview, setPreview] = useState<PreviewKey>("desktop");
  /**
   * WHAT IS IN THE AIR (§11.8).
   *
   * The widget PANE starts half of these drags and the CANVAS finishes them,
   * and neither contains the other — so the one piece of state between them
   * lives here, exactly like the preview width above. Cleared on `dragend`
   * whatever the outcome, so a drag abandoned over the widget list cannot
   * leave a drop line stranded on the page.
   */
  const [drag, setDrag] = useState<CanvasDrag>(null);
  /** What just landed: scrolled to, and glowing (D-11). */
  const [flashId, setFlashId] = useState<string | null>(null);
  /** The section on screen, so a pane click lands where the author is looking. */
  const [visibleSectionId, setVisibleSectionId] = useState<string | null>(null);
  /** A refusal, shown AT the control that caused it (D-20). */
  const [toast, setToast] = useState<{ anchor: string; message: string; action?: () => void; actionLabel?: string } | null>(null);
  const [firstRun, setFirstRun] = useState(false);
  /** The right-click menu: what it is on, and where the pointer was (M-8). */
  const [menu, setMenu] = useState<{ target: MenuTarget; x: number; y: number } | null>(null);
  /**
   * THE CLIPBOARD (M-8's Copy / Paste).
   *
   * One widget or one section, held in the builder rather than in the system
   * clipboard: a section is a tree with ids in it, and putting that on the OS
   * clipboard would either paste JSON into somebody's email or need a second
   * serialiser. Copy here, paste here — and `duplicateWidget`/`duplicateSection`
   * mint the fresh ids, so pasting twice cannot make two things with one id.
   */
  const [clip, setClip] = useState<{ kind: "widget"; widget: Widget } | { kind: "section"; section: Section } | null>(null);
  /** Ctrl+E (M-22) and Ctrl+Shift+H (M-7). */
  const [find, setFind] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  /** Naming a block the author is keeping (M-23). */
  const [naming, setNaming] = useState<Section | null>(null);
  /**
   * THE FLOATING STRUCTURE WINDOW (§11.13.1 item 3, D-165).
   *
   * It left the left panel. Open it from the top bar, from Ctrl+I, or from
   * "Show it in the outline" on the right-click menu — three doors, one piece
   * of state, and nothing that has to be "brought forward" any more.
   */
  const [structure, setStructure] = useState(false);
  /**
   * IS THE WIDGETS PANEL SHOWING? Ctrl+P, as the reference editor has it: on a
   * laptop the page is the thing you are trying to look at.
   */
  const [panel, setPanel] = useState(true);
  const doc = p.doc;
  /* The document as it is RIGHT NOW, for the callbacks that must not change
     identity when it changes — `select` is one, and a `select` that was a new
     function on every keystroke would restart every effect that holds one. */
  const docRef = useRef(doc);
  docRef.current = doc;
  const copy = useMemo(() => resolveCopy(p.copy), [p.copy]);

  const select = useCallback((s: Selection) => {
    /* ONE SELECTABLE BOX PER BOX ON THE PAGE (D-172, round 2).
       A carrier section and the container it carries were two selectable
       levels for one visible box, and the panel titled BOTH of them "Edit
       Container" — so clicking the same box twice in slightly different
       places gave two different panels with the same heading. `select` is the
       one door into the selection, so the collapse is applied here and
       nowhere else: everything downstream (the panel, the ring, the menu, the
       Structure row) reads `selection` and therefore agrees by construction. */
    const resolved = resolveSelection(docRef.current, s);
    setSelection(resolved);
    p.onSelectionChange?.(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.onSelectionChange]);

  // The adapter owns the document; the shell owns the history OF it. When the
  // adapter swaps the document wholesale — a template applied, a saved
  // proposal loaded — it bumps `resetKey` and the history starts again, so
  // undo can never walk backwards into a different document.
  useEffect(() => {
    setHist(initHistory(p.doc));
    select(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.resetKey]);

  /**
   * TELL THE REST OF THE APP A BUILDER OWNS THE SCREEN (D-172, round 2).
   *
   * The platform's floating Ask ARGUS pill used to sniff the DOM during its
   * own render to decide whether to step aside, which never re-ran when a
   * builder mounted, so the pill sat over the canvas the whole time. The shell
   * publishes the fact instead; see `builderOpen.ts`.
   */
  useEffect(() => {
    if (!p.open) return undefined;
    return openBuilder();
  }, [p.open]);

  /**
   * The three sentences, on EVERY open while this person wants the tips
   * (D-154). Replayed from the "?" in the header whatever the switch says.
   */
  const { value: builderTipsOn, set: setBuilderTips } = usePreference("tutorials.builderTips");
  useEffect(() => {
    if (!p.open) return;
    if (shouldShowFirstRun(builderTipsOn)) setFirstRun(true);
  }, [p.open, builderTipsOn]);

  /**
   * Closed. `dontShowAgain` is the checkbox on the box: ticked, it turns the
   * person's "Builder tips" switch off — server-side, so the next builder on
   * any computer they sign in on opens straight onto the canvas. A save we
   * could not make is logged and NOT pretended away; the box simply opens
   * again next time, which is the honest outcome.
   */
  const closeFirstRun = useCallback((dontShowAgain: boolean) => {
    setFirstRun(false);
    const next = builderTipsAfterClose(dontShowAgain);
    if (next === null) return;
    void setBuilderTips(next).catch((err) => {
      console.warn("[builder] could not turn Builder tips off", err);
    });
  }, [setBuilderTips]);

  /**
   * The adapter's refusal becomes the engine's toast, at its own control.
   *
   * M-25: the popover says what is wrong AND carries a button that fixes it,
   * so the answer to "I pressed Send and nothing happened" is one more press
   * rather than a hunt. The button is only offered when there is somewhere to
   * go — a refusal with no problems behind it ("pick a customer first") gets
   * the sentence alone.
   */
  useEffect(() => {
    if (!p.refusal) return;
    const problem = firstWithFocus(p.problems);
    setToast({
      anchor: p.refusal.anchor,
      message: p.refusal.message,
      ...(problem ? { actionLabel: PROBLEMS_CTA, action: jumpToProblem } : {}),
    });
    jumpToProblem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.refusal]);

  /**
   * Write a new document, and NAME the step (M-7).
   *
   * The label is the whole of the history panel: it has to be said at the
   * moment the change happens, because afterwards there are only two documents
   * and a diff, and a diff cannot tell a move from a delete-and-an-add. A
   * caller that says nothing gets "Changed the page", which is honest.
   */
  const apply = useCallback((next: BuilderDocument, mergeKey: string | null = null, label?: string) => {
    setHist(push(historyRef.current, next, mergeKey, label));
    p.onChange(next);
  }, [p, setHist]);

  const doUndo = useCallback(() => {
    const n = undo(historyRef.current);
    if (n === historyRef.current) return;
    setHist(n);
    p.onChange(n.present);
  }, [p, setHist]);
  const doRedo = useCallback(() => {
    const n = redo(historyRef.current);
    if (n === historyRef.current) return;
    setHist(n);
    p.onChange(n.present);
  }, [p, setHist]);

  /**
   * GO TO A STEP (M-7). The same mechanism undo and redo are: undo is travel
   * one back, redo is travel one on, and the panel is travel to anywhere.
   */
  const doTravel = useCallback((index: number) => {
    const n = travelTo(historyRef.current, index);
    if (n === historyRef.current) return;
    setHist(n);
    select(null);
    p.onChange(n.present);
  }, [p, select, setHist]);

  /** Show the new thing: select it, and let the canvas scroll and glow. */
  /* A REFUSAL, said beside the control that was pressed (D-20/D-35). Declared
     HERE, above everything that refuses, because an insert and a drop both do
     and a `const` used before its line is a blank screen at runtime. */
  const refuse = useCallback((message: string) => setToast({ anchor: "", message }), []);

  const landed = useCallback((sectionId: string, columnIndex: number, index: number, widgetId: string) => {
    // `id` as well as the three indices (§11.12): the indices reach the top of
    // a column and the id reaches a card three boxes down, and a thing that
    // lands somewhere the inspector cannot bind to is a thing that landed
    // invisibly — which is D-11 wearing a new hat.
    select({ kind: "widget", sectionId, columnIndex, widgetIndex: index, id: widgetId });
    setFlashId(widgetId);
    setTimeout(() => setFlashId((cur) => (cur === widgetId ? null : cur)), FLASH_MS);
  }, [select]);

  /**
   * A widget, built from its definition.
   *
   * Pulled out because THREE things create one — a tile pressed in the pane, a
   * tile dragged onto the page, and a drop on the add area — and a second copy
   * of "what a new comparison-cards widget starts with" is how one of them ends
   * up without the Recommended badge.
   */
  const buildWidget = useCallback((def: WidgetDef) => {
    const props: Record<string, unknown> = JSON.parse(JSON.stringify(def.defaults || {}));
    const repeatKey = repeatKeyFor(def.kind);
    /* THE "HOW MANY?" QUESTION IS DELETED (D-156, item 4).
       `def.count.default` is no longer a question, it is how many blank rows
       the thing arrives with — four clauses, two panels — and the author adds or
       removes them where they can see them, with the same duplicate and delete
       as everything else. Asking before the thing is on the page asked for a
       number nobody can answer yet, and it only existed because a composite's
       cards could not be changed afterwards. */
    if (repeatKey && def.count) {
      const n = def.count.default;
      const existing = Array.isArray(props[repeatKey]) ? (props[repeatKey] as unknown[]) : [];
      // The CONTROL says what a row is; a key with no control of its own is a
      // list of plain words, which is what `blankRow` answers for one.
      const control = (def.controls || []).find((c) => c.key === repeatKey) ?? {};
      props[repeatKey] = Array.from({ length: n }, (_, i) => existing[i] ?? blankRow(control, props, repeatKey));
    }
    return makeWidget(def.kind, props);
  }, []);

  /**
   * PUT A WIDGET ON THE PAGE — D-11's answer.
   *
   * `at` is where a DRAG dropped it or where a "+" was pressed. Absent, the
   * position comes from `insertPosition.ts`: after the selected widget, into
   * the selected section, or into the section the author is LOOKING at — never
   * "the end of the document", which is where every un-anchored insert used to
   * go, off screen and unselected.
   *
   * ONE insert either way: a drag or a "+" that went through its own code path
   * would be a second set of rules about what a new widget's props are.
   */
  const insertWidget = useCallback((def: WidgetDef, count?: number, at?: InsertSpot, from?: BuilderDocument) => {
    if (p.onInsertWidget && p.onInsertWidget(def, count) === false) return;
    let next = from ?? doc;
    let spot = at ?? insertSpotFor(doc, selection, visibleSectionId);
    if (!spot) {
      const made = makeSection({ label: "Container" });
      next = addSection(next, made);
      spot = firstSpotIn(next, made.id);
    }
    if (!spot) return;
    // "Columns" is a layout choice, not a thing on the page.
    if (def.kind === "columns") {
      apply(setLayout(next, spot.sectionId, count === 3 ? 3 : 2), null, `Split a section into ${count === 3 ? 3 : 2} columns`);
      select({ kind: "section", sectionId: spot.sectionId });
      return;
    }
    /* A LAYOUT TILE INSERTS A BOX, NOT A WIDGET (§11.13.1).
       Elementor's Layout group offers Container and Grid and both insert a
       container — one laid out as flex, one as grid. `registry.presetFor` is
       the ONE reader of that, and until integration nothing called it: the
       Grid tile inserted a widget of kind `grid`, which is on
       `UNRENDERED_KINDS` because no document ever holds one, so pressing it
       put an invisible thing on the page. Found by driving it, 2026-09-19. */
    const preset = presetFor(def.kind);
    if (preset) {
      /* A preset may bring CHILDREN with it (B-168, F0): Inner Section is a
         row holding two boxes, which is what an inner section is once the
         legacy section/column dialect is gone. Container and Grid bring none,
         so this is the same one-node insert it always was for them. */
      const box = makeContainer(
        preset.style as ElementStyle,
        (preset.children ?? []).map((s) => makeContainer(s as ElementStyle, [])),
      );
      apply(insertNode(next, spot.hostId, spot.index, box), null, `Added ${def.label}`);
      landed(spot.sectionId, spot.columnIndex, spot.index, box.id);
      return;
    }
    const widget = buildWidget(def);
    // ONE INSERT, INTO A BOX (§11.12). `spot.hostId` is a column's id or a
    // container's, and `insertNode` does not care which — which is the whole
    // point of one placement rule at every depth.
    apply(insertNode(next, spot.hostId, spot.index, widget), null, `Added ${def.label}`);
    landed(spot.sectionId, spot.columnIndex, spot.index, widget.id);
  }, [apply, buildWidget, doc, landed, p, select, selection, visibleSectionId]);

  /**
   * PUT A BOX ON THE PAGE (§11.12, D-156).
   *
   * Brandon's sentence starts here: *"Header, drag that into this box"* — there
   * has to be a box before anything can go in one. Beside `insertWidget` and
   * not inside it, because a container is not a widget: it has no definition,
   * no adapter decides whether to offer it, and it is built by `makePreset`.
   * It lands and is SELECTED, so the inspector's Layout group is already open
   * on the thing that was just made.
   */
  const insertBox = useCallback((preset: ContainerPreset, at?: InsertSpot, from?: BuilderDocument) => {
    let next = from ?? doc;
    let spot = at ?? insertSpotFor(next, selection, visibleSectionId);
    if (!spot) {
      const made = makeSection({ label: "Container" });
      next = addSection(next, made);
      spot = firstSpotIn(next, made.id);
    }
    if (!spot) return;
    const box = makePreset(preset.key);
    const after = insertNode(next, spot.hostId, spot.index, box);
    // REFUSED rather than silently dropped: `insertNode` returns the same
    // document when the box would go deeper than boxes go, and saying nothing
    // at that moment is the defect, not the refusal.
    if (after === next) {
      refuse(`This is already as deep as boxes go (${MAX_DEPTH} levels). Add it further out.`);
      return;
    }
    apply(after, null, `Added a ${preset.label.toLowerCase()}`);
    landed(spot.sectionId, spot.columnIndex, spot.index, box.id);
  }, [apply, doc, landed, refuse, select, selection, visibleSectionId]);

  /**
   * A DROP. Either a new widget from the pane or one already on the page.
   *
   * The index maths for a move is `model.dropIndexFor`, not a subtraction
   * written here: lift-then-insert shifts the target down by one when the
   * widget came from the same column above it, and that arithmetic belongs
   * with the operation it belongs to.
   */
  const dropWidget = useCallback((spot: InsertSpot) => {
    const payload = drag;
    setDrag(null);
    if (!payload) return;
    if (payload.kind === "move") {
      const id = nodeIdAt(doc, payload.path);
      if (!id) return;
      const after = moveNode(doc, id, spot.hostId, spot.index);
      // `moveNode` REFUSES a drop into the box's own child, and a drop that
      // would go deeper than boxes go. Both come back as the same document, and
      // a drag that appears to do nothing needs a sentence rather than silence.
      if (after === doc) {
        refuse("That box cannot go inside itself. Drop it somewhere outside it.");
        return;
      }
      apply(after);
      select({
        kind: "widget", sectionId: spot.sectionId, columnIndex: spot.columnIndex,
        widgetIndex: spot.index, id,
      });
      return;
    }
    // A BOX FROM THE PANE, dropped where the line was drawn.
    if (payload.kind === "new" && payload.box) { insertBox(payload.box, spot); return; }
    const def = WIDGETS_BY_KIND[payload.label];
    if (def) insertWidget(def, undefined, spot);
  }, [apply, doc, drag, insertBox, insertWidget, refuse, select]);

  /**
   * "DRAG WIDGET HERE" — a drop on the add area (the reference editor's words).
   *
   * A new section goes in at that index and the thing lands in it, as ONE undo
   * step: the section and the insert are computed from the same document, the
   * way every other two-part operation here is.
   */
  const dropOnAddArea = useCallback((at: number) => {
    const payload = drag;
    setDrag(null);
    if (!payload) return;
    if (p.onAddBlank && p.onAddBlank(at) === false) return;
    /* THE SAME ONE SHAPE (D-172, round 2) — Section → its column → ONE
       container, with the dropped thing INSIDE the container. This used to
       make a bare section and put the widget straight in the column, so a
       widget dragged onto "Drag widget here" produced a different structure
       from the identical widget dragged into a container made by the "+"
       beside it. One shape from the add area, both ways in. */
    const sec = makeSection({ label: "Container" });
    const box = makeContainer();
    sec.columns[0].widgets = [box];
    const next = addSection(doc, sec, at);
    /* Asked for, never built by hand: `firstSpotIn` is carrier-aware, so "the
       first place in this section" is INSIDE the container and there is one
       module that knows it. */
    const spot = firstSpotIn(next, sec.id);
    if (!spot) return;
    if (payload.kind === "move") {
      const id = nodeIdAt(doc, payload.path);
      if (!id) return;
      const after = moveNode(next, id, spot.hostId, 0);
      if (after === next) return;
      apply(after, null, "Moved it into a new container");
      select({ kind: "widget", sectionId: sec.id, columnIndex: 0, widgetIndex: 0, id });
      return;
    }
    const def = WIDGETS_BY_KIND[payload.label];
    if (def) insertWidget(def, undefined, spot, next);
  }, [apply, doc, drag, insertBox, insertWidget, p, select]);

  /** D-35: take me to the first thing that is still blank. */
  function jumpToProblem() {
    const problem = firstWithFocus(p.problems);
    if (!problem) return;
    // The adapter's half first: its own panel is already on screen, so the box
    // takes the caret before the canvas scrolls under it.
    p.onFocusProblem?.(problem);
    if (!problem.focus) return;
    const { widgetId } = problem.focus;
    // BY NODE ID (V-1): a still-blank price inside a box is exactly the thing
    // "take me to it" is for, and the column scan this replaces could not
    // select one, so the jump landed on nothing and said nothing.
    const at = pathOfNode(doc, widgetId);
    if (at) select({ kind: "widget", ...at });
    // After the canvas has painted the selection: the element is inside HTML
    // the canvas writes with innerHTML, so it does not exist until then.
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(focusSelector(problem.focus!));
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus?.();
    }, 60);
  }

  /**
   * "SELECT YOUR STRUCTURE" LANDS ON THE PAGE (§11.13.1 item 5, D-165).
   *
   * A preset is a SHAPE — how many cells, how wide each one is. One cell
   * is a plain section and nothing is nested, because a box holding one box
   * is a level the author has to get out of for no reason. Two or more cells
   * become a section holding ONE row container with one box per cell, which is
   * what §11.12 says a columns section is.
   *
   * The percentages ride on the row's `columnWidths`, the same key the section
   * ratio picker writes, so one renderer reads one fact. Nothing new is
   * invented here: `makeSection`, `makeContainer` and `withLayer` already
   * existed and this arranges them.
   */
  const addStructure = useCallback((at: number, layout: SectionLayout, preset: StructurePreset) => {
    if (p.onAddBlank && p.onAddBlank(at) === false) return;
    /* ONE SHAPE FROM THE ADD AREA (D-172, round 2).
       EVERY preset now makes a CARRIER PAIR — Section → its one column → ONE
       container — including the one-column preset, which used to make a
       section with an empty column and nothing else. That was the whole
       inconsistency: a two-column structure gave the author a Container to
       select and a one-column structure gave them a Section, and the two were
       titled the same thing in the panel. The Section is a plain carrier: no
       padding, no background, no label of its own. See `isCarrierPair` in
       model.ts for what the screen does with the pair. */
    const sec = makeSection({ label: "Container" });
    const cells = preset.cells.length > 1 ? preset.cells.map(() => makeContainer()) : [];
    const box = makeContainer(
      preset.cells.length > 1
        ? withLayer(
          layout === "grid"
            ? { direction: "grid", columns: preset.cells.length, gap: 16 }
            : { direction: "row", gap: 16 },
          "desktop",
          { columnWidths: preset.cells.map((n) => n / 100) },
        )
        : (layout === "grid" ? { direction: "grid", columns: 1, gap: 16 } : undefined),
      cells,
    );
    sec.columns[0].widgets = [box];
    apply(addSection(doc, sec, at), null, `Added a container — ${preset.label.toLowerCase()}`);
    /* The pair is ONE thing, so what gets selected is the CONTAINER. `select`
       resolves a carrier section to it anyway; naming it here keeps the two
       from having to agree by accident. */
    select({ kind: "widget", sectionId: sec.id, columnIndex: 0, widgetIndex: 0, id: box.id });
  }, [apply, doc, p, select]);

  const placeSection = useCallback((premade: PremadeSection, at: number) => {
    if (p.onPlaceSection && p.onPlaceSection(premade, at) === false) return;
    const s = premade.build();
    apply(addSection(doc, s, at), null, `Added “${premade.name}”`);
    select({ kind: "section", sectionId: s.id });
  }, [apply, doc, p, select]);

  /**

   * WORDS TYPED ON THE CANVAS, AT ANY DEPTH (V-1, §11.12).
   *
   * FOUND BY DRIVING IT (verifier, 2026-09-17): this scanned
   * `section.columns[c].widgets` for the widget's id and patched a
   * `WidgetPath`, which is the address of the TOP of a column. Everything the
   * author typed into a card inside a row inside a box hit the `continue`, the
   * loop fell out of the bottom, and the function returned having changed
   * nothing — the characters stayed on screen only until the next repaint, and
   * Save wrote the document that was never edited.
   *
   * Typing into any card in the row that *Choose your plan* places — which is
 * every card an author meets first — was discarded on blur. Two passes found
 * this independently (the verifier's V-1 and the conformance drive); there is
 * ONE fix below, not two.
 *
 * ONE ADDRESS, the node id, through `editWidgetText` — the same function the
   * four adapter panels now call, so there is one implementation of "put this
   * word in that widget" and it works wherever the widget is. The `sectionId`
   * the canvas passes is no longer an ingredient of the address; it stays in
   * the signature because the canvas has it and the history label may want it.
   */
  const onEditText = useCallback((_sectionId: string, widgetId: string, path: string, value: string, mergeKey: string) => {
    const widget = widgetById(doc, widgetId);
    if (!widget) return;
    const next = editWidgetText(doc, widgetId, path, value);
    if (next === doc) return;
    // One typing burst is one step, and the step is named for the thing being
    // typed into rather than for the first letter (M-7).
    const def = WIDGETS_BY_KIND[widget.kind];
    apply(next, mergeKey, `Typed in the ${(def ? def.label : widget.kind).toLowerCase()}`);
  }, [apply, doc]);

  /**
   * THE one way a section is changed — and the one place `layout` is honoured.
   *
   * FOUND BY DRIVING IT (2026-09-17, §11.8): the inspector's Columns select and
   * the canvas toolbar's 1 / 2 / 3 buttons both went straight to
   * `patchSection`, which writes `layout: 2` and leaves `columns` one long. The
   * stylesheet then drew two tracks over one column, so "two columns" was a
   * section that looked half empty with nowhere to put anything — and the ratio
   * control this pass adds would have been sharing a width between a column
   * that existed and one that did not. `setLayout` is the operation that MOVES
   * the widgets rather than dropping them (model.ts); routing every caller
   * through here is why there is one answer instead of three.
   */
  const changeSection = useCallback((id: string, patch: Partial<Section>) => {
    const { layout, ...rest } = patch;
    let next = doc;
    if (layout != null) next = setLayout(next, id, layout);
    if (Object.keys(rest).length) next = patchSection(next, id, rest);
    // A section's NAME is typed letter by letter, so it coalesces like any
    // other typing; everything else about a section is one step.
    const renaming = "label" in rest && Object.keys(rest).length === 1;
    apply(next, renaming ? `section:${id}:label` : null,
      renaming ? "Renamed a section" : "Changed a section");
  }, [apply, doc]);

  const patchSelectedWidget = useCallback((props: Record<string, unknown>) => {
    if (selection?.kind !== "widget") return;
    const w = widgetAt(doc, selection);
    const def = w ? WIDGETS_BY_KIND[w.kind] : null;
    apply(patchWidget(doc, selection, props), null, `Changed the ${(def?.label || "block").toLowerCase()}`);
  }, [apply, doc, selection]);

  /** A locked part refuses, and SAYS SO — a button that silently does nothing
   *  is the thing this whole pass exists to delete. */

  const deleteWidget = useCallback((path: WidgetPath) => {
    const w = widgetAt(doc, path);
    if (!w) return;
    if (w.locked) {
      refuse("This part has to stay on the page: it carries your unsubscribe link and postal address. You can change the wording.");
      return;
    }
    /* DELETING A CARRIER'S CONTAINER DELETES THE PAIR (D-172, round 2).
       The pair is one box on the screen, so "Delete Container" has to remove
       one box — not leave the carrier behind as an empty section with no
       handle, no outline and a row in Structure that the author cannot
       explain. `deleteSection` carries the law's refusal, so this is the same
       one answer to "may this go?". */
    const sec = findSection(doc, path.sectionId);
    if (sec && carrierContainer(sec)?.id === nodeIdAt(doc, path)) {
      deleteSectionRef.current?.(sec.id);
      return;
    }
    apply(removeWidget(doc, path), null, "Deleted a block");
    select({ kind: "section", sectionId: path.sectionId });
  }, [apply, doc, refuse, select]);

  /** So `deleteWidget` can hand a carrier pair to the section's own delete. */
  const deleteSectionRef = useRef<((id: string) => void) | null>(null);

  const deleteSection = useCallback((id: string) => {
    const s = doc.sections.find((x) => x.id === id);
    if (s?.columns.some((c) => c.widgets.some((w) => w.locked))) {
      refuse("This section holds a part the law puts on every send, so it stays. You can change the wording inside it.");
      return;
    }
    apply(removeSection(doc, id), null, `Deleted ${named(s?.label)}`);
    select(null);
  }, [apply, doc, refuse, select]);
  deleteSectionRef.current = deleteSection;

  /* ═══════════════════════════════════════════════════════════════════
     M-8 / M-21 / M-23 — ONE set of verbs, three ways in
     ═══════════════════════════════════════════════════════════════════

     The hover toolbar, the right-click menu, the ⋯ on a widget's handle and
     Find all press the functions below. The MENU'S CONTENTS are
     `builderMenu.menuFor`, which is arithmetic over the document and therefore
     a `node --test`; this is only what each verb does. */

  /** Is this part hidden at the width the canvas is previewing? */
  const isHidden = useCallback(
    (style: ElementStyle | undefined) => !!layerFor(style, preview).hidden,
    [preview],
  );
  const widgetHidden = useCallback(
    (path: WidgetPath) => isHidden(widgetAt(doc, path)?.style),
    [doc, isHidden],
  );

  /** "on phones" / "on tablets" / "" — nothing is ever hidden silently (M-21). */
  const hideDeviceWord = preview === "phone" ? "on phones" : preview === "tablet" ? "on tablets" : "";

  const setHidden = useCallback((
    target: MenuTarget,
    hidden: boolean,
  ) => {
    const word = hidden ? "Hid" : "Showed";
    const where = hideDeviceWord ? ` ${hideDeviceWord}` : "";
    if (target.kind === "widget") {
      const w = widgetAt(doc, target.path);
      if (!w) return;
      apply(
        setWidgetStyle(doc, target.path, withLayer(w.style, preview, { hidden: hidden ? true : undefined })),
        null,
        `${word} a block${where}`,
      );
      return;
    }
    /* The page itself cannot be hidden — the document menu has no such row. */
    if (target.kind !== "section") return;
    const sec = doc.sections.find((x) => x.id === target.sectionId);
    if (!sec) return;
    apply(
      patchSection(doc, target.sectionId, {
        style: withLayer(sec.style, preview, { hidden: hidden ? true : undefined }),
      } as Partial<Section>),
      null,
      `${word} ${named(sec.label)}${where}`,
    );
  }, [apply, doc, hideDeviceWord, preview]);

  /**
   * LOCK (M-21). A locked part cannot be deleted and says so on its handle; the
   * words in it are still the author's. `setWidgetLocked` writes the ONE flag
   * `removeWidget` and `removeSection` already refuse on — there is no second
   * idea of "protected" that only this menu knows about.
   */
  const setLocked = useCallback((target: MenuTarget, locked: boolean) => {
    const word = locked ? "Locked" : "Unlocked";
    if (target.kind === "widget") {
      apply(setWidgetLocked(doc, target.path, locked), null, `${word} a block`);
      return;
    }
    /* The page itself cannot be locked — the document menu has no such row. */
    if (target.kind !== "section") return;
    const sec = doc.sections.find((x) => x.id === target.sectionId);
    if (!sec) return;
    // A section is locked by locking what is in it: one flag, on the widget,
    // read by both remove operations.
    let next = doc;
    sec.columns.forEach((col, columnIndex) => {
      col.widgets.forEach((_, widgetIndex) => {
        next = setWidgetLocked(next, { sectionId: sec.id, columnIndex, widgetIndex }, locked);
      });
    });
    apply(next, null, `${word} ${named(sec.label)}`);
  }, [apply, doc]);

  /**
   * A section's name for a history step, in quotes — or the words "a section"
   * when it has none, because “a section” in quotation marks reads like
   * somebody called their section "a section".
   */
  const named = useCallback((label?: string) => (label?.trim() ? `“${label.trim()}”` : "a section"), []);

  /** Every verb the menu can name, in one place. */
  /** So one row can run another's body rather than keeping a second copy. */
  const runMenuActionRef = useRef<((a: MenuAction, t: MenuTarget) => void) | null>(null);
  const runMenuAction = useCallback((action: MenuAction, target: MenuTarget) => {
    /* THE DOCUMENT MENU'S OWN FIVE (D-172, round 2). Answered first, because
       none of the rows below have a section to act on. Every one of them is
       an action the shell already performs — Paste is the same paste, Delete
       All Content is `emptyDocument` through the same `apply`, so undo picks
       them up like anything else. */
    if (target.kind === "document") {
      switch (action) {
        case "paste": {
          if (!clip) return;
          if (clip.kind === "section") {
            const fresh = cloneSection(clip.section);
            apply(addSection(doc, fresh, doc.sections.length), null, `Pasted ${named(fresh.label)}`);
            select({ kind: "section", sectionId: fresh.id });
          }
          return;
        }
        case "pasteFromOtherSite": runMenuActionRef.current?.("paste", target); return;
        case "copyAll":
          if (!doc.sections.length) return;
          setClip({ kind: "section", section: doc.sections[0] });
          refuse("Copied the page. Right-click where you want it and press Paste.");
          return;
        case "deleteAll":
          if (!doc.sections.length) return;
          apply({ ...doc, sections: [] }, null, "Deleted everything on the page");
          select(null);
          return;
        case "structure": setStructure(true); return;
        default: return;
      }
    }
    const sectionId = target.kind === "section" ? target.sectionId : target.path.sectionId;
    const index = doc.sections.findIndex((x) => x.id === sectionId);
    const sec = doc.sections[index];
    const name = named(sec?.label);

    switch (action) {
      case "edit":
        select(target.kind === "widget" ? { kind: "widget", ...target.path } : { kind: "section", sectionId });
        return;
      case "duplicate":
        if (target.kind === "widget") { apply(duplicateWidget(doc, target.path), null, "Copied a block"); return; }
        apply(duplicateSection(doc, sectionId), null, `Copied ${name}`);
        return;
      case "copy": {
        if (target.kind === "widget") {
          const w = widgetAt(doc, target.path);
          if (w) { setClip({ kind: "widget", widget: w }); refuse("Copied. Right-click where you want it and press Paste."); }
          return;
        }
        if (sec) { setClip({ kind: "section", section: sec }); refuse("Copied. Right-click where you want it and press Paste."); }
        return;
      }
      case "paste": {
        if (!clip) return;
        if (clip.kind === "section") {
          const fresh = cloneSection(clip.section);
          apply(addSection(doc, fresh, index < 0 ? doc.sections.length : index + 1), null,
            `Pasted ${named(fresh.label)}`);
          select({ kind: "section", sectionId: fresh.id });
          return;
        }
        const at = target.kind === "widget"
          ? { sectionId, columnIndex: target.path.columnIndex, index: target.path.widgetIndex + 1 }
          : { sectionId, columnIndex: 0, index: sec?.columns[0]?.widgets.length ?? 0 };
        const made = makeWidget(clip.widget.kind, JSON.parse(JSON.stringify(clip.widget.props || {})));
        if (clip.widget.style) made.style = JSON.parse(JSON.stringify(clip.widget.style));
        apply(addWidget(doc, at.sectionId, at.columnIndex, made, at.index), null, "Pasted a block");
        landed(at.sectionId, at.columnIndex, at.index, made.id);
        return;
      }
      case "pasteStyle": {
        /* THE LOOK, NOT THE THING. `clip` is whatever Copy put there; this
           takes its `style` and nothing else, so the words, the prices and the
           bindings on what was right-clicked are untouched. ONE handler: the
           Ctrl+Shift+V chord runs this same case. */
        if (!clip) { refuse("Copy something first, then this puts its look on what you right-clicked."); return; }
        if (target.kind !== "widget") { refuse("Right-click the thing you want to look the same."); return; }
        const look = clip.kind === "widget" ? clip.widget.style : clip.section.style;
        apply(setWidgetStyle(doc, { kind: "widget", ...target.path } as any,
          look ? JSON.parse(JSON.stringify(look)) : undefined), null, "Pasted the look");
        return;
      }
      /* ── THE ROWS THE REFERENCE DOES NOT HAVE ARE GONE (D-172) ──────
         Move up / Move down (moving is a drag, or the Structure window), the
         five box verbs (direction is a SETTING, not a menu row; there is no
         multi-select to group), Show it in the outline (the reference's own
         row is "Structure"), Hide / Lock (the author's own switches are not in
         the reference's menu; a part the LAW locks is still locked), and Add a
         section above / below (the handle's "+" does that). Deleted here as
         well as in builderMenu.ts — a handler with no row is how a row comes
         back. */
      case "resetStyle": {
        /* THE REFERENCE'S ROW. It puts the element back to its default LOOK and
           leaves its words alone, which is why it clears `style` and touches no
           prop. */
        if (target.kind === "widget") {
          apply(setWidgetStyle(doc, { kind: "widget", ...target.path } as any, undefined), null, "Put the look back");
          return;
        }
        apply(patchSection(doc, sectionId, { style: undefined } as Partial<Section>), null, "Put the look back");
        return;
      }
      case "saveDefault": if (sec) setNaming(sec); return;
      /* THE CONTAINER MENU'S OWN TWO (D-172, round 2). "Add New Container"
         is the reference's third row and opens the same add area the handle's
         "+" does; "Save as a template" is its badged row and reaches the same
         template store `onSaveBlock` already owns. Neither is a new
         mechanism. */
      case "addContainer":
        /* The reference adds one straight away — it does not open the layout
           chooser, which is what the handle's "+" is for. One column, right
           after the box that was right-clicked. */
        addStructure(index < 0 ? doc.sections.length : index + 1, "flex", ONE_COLUMN);
        return;
      case "saveTemplate": if (sec) setNaming(sec); return;
      case "structure":
        select(target.kind === "widget" ? { kind: "widget", ...target.path } : { kind: "section", sectionId });
        setStructure(true);
        return;
      case "pasteFromOtherSite":
        /* The reference reads another site's clipboard payload. Ours reads the
           SAME clipboard the Copy row writes, which is what "from other site"
           means here: a block copied in another business's builder in this
           browser. One clipboard, so there is no second paste to keep in step. */
        runMenuActionRef.current?.("paste", target);
        return;
      case "pasteInteractions":
      case "saveGlobal":
        /* Both are greyed in the menu and both say why on hover. They are
           listed so the screen matches, and they do nothing until there is
           something for them to do. */
        return;
      case "delete":
        if (target.kind === "widget") { deleteWidget(target.path); return; }
        deleteSection(sectionId);
        return;
      default: return;
    }
  }, [addStructure, apply, clip, deleteSection, deleteWidget, doc, landed, refuse, select]);
  runMenuActionRef.current = runMenuAction;

  /** What the open menu should contain, from the document as it is right now. */
  const menuItems = useMemo(() => {
    if (!menu) return [];
    const t = menu.target;
    if (t.kind === "document") return documentMenu({ canPaste: !!clip, empty: !doc.sections.length });
    const index = doc.sections.findIndex((x) => x.id === (t.kind === "section" ? t.sectionId : t.path.sectionId));
    const sec = doc.sections[index];
    const locked = t.kind === "widget"
      ? !!widgetAt(doc, t.path)?.locked
      : !!sec?.columns.some((c) => c.widgets.some(holdsLocked));
    const hidden = t.kind === "widget" ? widgetHidden(t.path) : isHidden(sec?.style);
    // §11.12: whether this IS a box, which way it runs, how many things are
    // selected, and whether one more level would be one too many. All four are
    // read off the document, so the menu cannot offer a verb that would refuse.
    const node = t.kind === "widget" ? widgetAt(doc, t.path) : null;
    const box = isContainer(node);
    const hit = t.kind === "widget" ? findNode(doc, nodeIdAt(doc, t.path) || "") : null;
    const depth = hit ? hostDepth(doc, hit.parentId) : 0;
    return menuFor({
      kind: t.kind,
      locked,
      /* THE ELEMENT'S OWN NAME, for the first row — "Edit Heading", "Edit
         Container", the same words the settings panel puts at its top. */
      name: t.kind === "widget"
        ? (box ? (directionOf(node) === "grid" ? "Grid" : "Container")
          : (node ? (WIDGETS_BY_KIND[node.kind]?.label || node.kind) : "Widget"))
        : "Container",
      canPaste: !!clip,
      canSaveBlock: !!p.onSaveBlock,
      lockedReason: copy.lockedReason,
    });
  }, [clip, copy.noun, doc, hideDeviceWord, isHidden, menu, p.onSaveBlock, selection, widgetHidden]);

  /**
   * THE KEYBOARD. The frame listens; this decides what each action means.
   *
   * Returns TRUE when the action was consumed, which is how Escape knows the
   * difference between "deselect" and "the author wants out of here" — the
   * frame only offers to close when nothing was selected to let go of.
   */
  const onShortcut = useCallback((action: BuilderAction): boolean => {
    /* The selection, as the right-click menu's own target. Copy, Paste and
       Duplicate go through `runMenuAction` and not through a second copy of
       those three bodies: one mechanism, so a keyboard paste and a menu paste
       cannot land in two different places (§11.13.1 item 6). */
    const target: MenuTarget | null = selection?.kind === "widget"
      ? { kind: "widget", path: selection }
      : selection?.kind === "section"
        ? { kind: "section", sectionId: selection.sectionId }
        : null;

    switch (action) {
      case "undo": doUndo(); return true;
      case "redo": doRedo(); return true;
      case "save": if (p.onSave) { p.onSave(); return true; } return false;
      case "find": setFind(true); return true;
      case "history": setHistoryOpen(true); return true;
      case "structure": setStructure((v) => !v); return true;
      case "togglePanel": setPanel((v) => !v); return true;
      case "cycleDevice": setPreview(nextPreview(preview)); return true;
      /* FOUR CHORDS, ONE HANDLER. Every one of these runs the right-click
         menu's own case rather than a second copy of it — the rule D-165 set
         for Copy, Paste and Duplicate, and `pasteStyle` joined them at
         integration when the menu grew the row (R-1.7). */
      case "copy": case "paste": case "duplicate": case "pasteStyle":
        if (!target) return false;
        runMenuAction(action, target);
        return true;
      case "delete":
        if (selection?.kind === "widget") { deleteWidget(selection); return true; }
        if (selection?.kind === "section") { deleteSection(selection.sectionId); return true; }
        return false;
      /* THE REFERENCE'S OWN TWO PANEL CHORDS (D-172, round 2). Both are
         listed in its shortcuts panel and both did nothing here; each points
         at the door the top bar already has, never at a second one. */
      case "pageSettings": select(null); return true;
      case "templates": setGallery({ at: doc.sections.length }); return true;
      case "escape":
        /* WHAT ESCAPE CLOSES, IN THE ORDER IT IS STACKED (D-172, round 2).
           FIND AND HISTORY WERE MISSING FROM THIS LIST, and the consequence
           was the worst defect on the round-2 sheet: with the finder open,
           Escape fell through to `return false`, the frame took that as "the
           builder did not want it", and `requestClose()` shut the WHOLE
           builder and put the author back on the proposals list — with no
           "discard?" question. The reference closes the finder and leaves the
           editor exactly where it was.

           The frame already swallows Escape for its own four (the menu, the
           help panel, the confirm and a drawer); these are the shell's, and
           they have to be answered here because the shell is what owns them. */
        if (menu) { setMenu(null); return true; }
        if (find) { setFind(false); return true; }
        if (historyOpen) { setHistoryOpen(false); return true; }
        if (structure) { setStructure(false); return true; }
        if (selection) { select(null); return true; }
        return false;
      default: return false;
    }
  }, [apply, clip, deleteSection, deleteWidget, doc, doRedo, doUndo, find, historyOpen, menu, p,
      preview, refuse, runMenuAction, select, selection, structure]);

  return (
    <BuilderFrame
      open={p.open}
      onClose={p.onClose}
      product="oliver"
      title={p.title}
      headerActions={p.headerActions}
      footer={p.footer}
      canUndo={canUndo(history)}
      canRedo={canRedo(history)}
      onUndo={doUndo}
      onRedo={doRedo}
      /* D-02: with something unsaved on the page, the builder asks before it
         goes. `canUndo` is the honest test — the author has changed something
         since this document was opened or last replaced. */
      dirty={canUndo(history)}
      onShortcut={onShortcut}
      onFind={() => setFind(true)}
      onHistory={() => setHistoryOpen(true)}
      onReplayHelp={() => setFirstRun(true)}
      /* PAGE SETTINGS (D-172) — the reference's own top-bar button and the
         chevron beside the page's name. Deselecting IS page settings here:
         the panel on the right shows the document's own settings when
         nothing is selected (Inspector, the no-selection branch). */
      onPageSettings={() => select(null)}
      /* PREVIEW CHANGES — the eye in the right-hand group. Only drawn for a
         builder that HAS a preview to show; an eye that opens nothing is
         worse than no eye. */
      {...(p.onPreviewDoc ? { onPreviewDoc: p.onPreviewDoc } : {})}
      /* ONE DOOR TO THE AI (D-172): the bar's. The gold button that used to
         sit in the settings panel's header is gone, and the floating bubble
         steps aside while a builder is open (ArgusChatbot). */
      askArgus={p.askArgus}
      canvasBackground={p.canvasBackground}
      preview={preview}
      onPreview={setPreview}
      /* THE LEFT PANEL IS THE WIDGETS PANEL (§11.13.1 item 1, D-165).
         No tabs, no header slot, no outline, no counter. Ctrl+P hides it and
         gives the page the width. */
      pane={panel ? (
        <WidgetPane
          adapter={p.adapter}
          onInsert={(def) => insertWidget(def)}
          onDragWidget={(w) => setDrag(w ? { kind: "new", label: w.kind } : null)}
          /* THE EDGE HANDLE (D-172): the reference's chevron tab on the
             panel's right border folds it away, and the top bar's Add
             Element brings it back. One state, two doors. */
          onCollapse={() => setPanel(false)}
          /* The panel's Layout group is Elementor's two widgets, and the Grid
             tile inserts a grid container through `registry.presetFor`. */
          {...(p.lockedKinds ? { lockedKinds: p.lockedKinds } : {})}
        />
      ) : null}
      onStructure={() => setStructure((v) => !v)}
      structureOpen={structure}
      onTogglePanel={() => setPanel((v) => !v)}
      panelOpen={panel}
      inspector={
        <Inspector
          doc={doc}
          selection={selection}
          swatches={p.swatches}
          fonts={p.fonts}
          defaultFontLabel={p.defaultFontLabel ?? copy.defaultFontLabel}
          pageBreakLabel={copy.pageBreakLabel}
          adapter={p.adapter}
          /* ONE device state (§11.8): the inspector edits the width the canvas
             is showing, so "I set it on phone and nothing happened" cannot
             happen. Switching it here moves the paper too. */
          device={preview}
          onDevice={setPreview}
          onSetSectionStyle={(id, style, mergeKey) =>
            apply(patchSection(doc, id, { style } as Partial<Section>), mergeKey ?? null)}
          onSetWidgetStyle={(style: ElementStyle | undefined, mergeKey) => {
            if (selection?.kind !== "widget") return;
            apply(setWidgetStyle(doc, selection, style), mergeKey ?? null);
          }}
          widgetExtras={p.widgetExtras}
          documentExtras={p.documentExtras}
          onPatchSection={changeSection}
          onPatchWidget={patchSelectedWidget}
        />
      }
      overlays={
        <>
          <SectionGallery
            open={!!gallery}
            adapter={p.adapter}
            savedTemplates={p.savedTemplates}
            premade={p.premade}
            tags={p.premadeTags}
            thumb={p.premadeThumb}
            onOpenTemplate={p.onOpenTemplate}
            onClose={() => setGallery(null)}
            onPlaceSection={(s) => placeSection(s, gallery?.at ?? doc.sections.length)}
            /* M-23 — one of the author's own blocks, dropped at the "+" that
               was pressed. Cloned, so two copies of one block are two sections
               with their own ids and not two views of the same one. */
            onPlaceSavedBlock={(t) => {
              if (!t.section) return;
              const fresh = cloneSection(t.section);
              apply(addSection(doc, fresh, gallery?.at ?? doc.sections.length), null, `Added “${t.name}”`);
              select({ kind: "section", sectionId: fresh.id });
            }}
          />
          {toast && (
            <AnchoredToast
              anchor={toast.anchor}
              message={toast.message}
              actionLabel={toast.actionLabel}
              onAction={toast.action}
              ms={toast.anchor ? 0 : 6000}
              onClose={() => { setToast(null); p.onDismissRefusal?.(); }}
            />
          )}
          {firstRun && <FirstRun noun={copy.noun} onDone={closeFirstRun} />}

          {/* STRUCTURE — the tree, floating (§11.13.1 item 3, D-165). Same
              rows, same handlers; it simply is not in the left panel. */}
          {structure && (
            <StructureWindow
              doc={doc}
              selection={selection}
              onSelect={select}
              onClose={() => setStructure(false)}
              onMoveSection={(id, to) => apply(moveSection(doc, id, to), null,
                `Moved ${named(doc.sections.find((x) => x.id === id)?.label)}`)}
              device={preview}
              heading={`Everything in this ${copy.noun}, in order.`}
              onHideSection={(id, hidden) => setHidden({ kind: "section", sectionId: id }, hidden)}
              onHideWidget={(path, hidden) => setHidden({ kind: "widget", path }, hidden)}
              /* M-21 — the padlock shows the state and changes it. M-8 — the
                 ⋯ is the same menu as right-clicking the page. */
              onLockSection={(id, locked) => setLocked({ kind: "section", sectionId: id }, locked)}
              onLockWidget={(path, locked) => setLocked({ kind: "widget", path }, locked)}
              isSectionLocked={(id) => {
                const sec = doc.sections.find((x) => x.id === id);
                return !!sec?.columns.length && sec.columns.every((c) => c.widgets.every(holdsLocked))
                  && sec.columns.some((c) => c.widgets.length > 0);
              }}
              onRowMenu={(target, at) => setMenu({ target, x: at.x, y: at.y })}
              /* MOVE BETWEEN LEVELS (§11.12). The nesting is on screen here and
                 the target is a whole row rather than a few pixels of gap, so
                 this is the easy way OUT of a deep box — through the same
                 `moveNode` the canvas drag uses, refusals and all. */
              onMoveNode={(id, to) => {
                if (!to) return;
                const after = moveNode(doc, id, to.hostId, to.index);
                if (after === doc) {
                  refuse("That box cannot go inside itself. Drop it on a row outside it.");
                  return;
                }
                apply(after, null, "Moved it");
              }}
            />
          )}

          {/* M-8 — right-click, the ⋯ on a handle and the ⋯ in the Outline all
              open THIS, with the rows `builderMenu.menuFor` worked out. */}
          {menu && (
            <ContextMenu
              x={menu.x}
              y={menu.y}
              items={menuItems}
              onPick={(action) => runMenuAction(action, menu.target)}
              onClose={() => setMenu(null)}
            />
          )}

          {/* M-22 — one box: sections in this document, then things to add,
              then what to do. It finds and jumps; it never creates a record. */}
          {find && (
            <FindBox
              doc={doc}
              adapter={p.adapter}
              actions={p.findActions}
              onClose={() => setFind(false)}
              onPick={(r: FindResult) => {
                if (r.kind === "section" && r.sectionId) {
                  select({ kind: "section", sectionId: r.sectionId });
                  setTimeout(() => {
                    document.querySelector(`[data-section-host="${r.sectionId}"]`)
                      ?.scrollIntoView({ block: "center", behavior: "smooth" });
                  }, 30);
                  return;
                }
                if (r.kind === "widget" && r.widget) { insertWidget(r.widget, r.widget.count?.default); return; }
                if (r.actionId === "outline") { setStructure(true); return; }
                if (r.actionId === "history") { setHistoryOpen(true); return; }
                if (r.actionId === "templates") { setGallery({ at: doc.sections.length }); return; }
                if (r.actionId === "preview") { setPreview(preview === "desktop" ? "phone" : "desktop"); return; }
                if (r.actionId) p.onFindAction?.(r.actionId);
              }}
            />
          )}

          {/* M-7 — the steps by name, and you can walk back into any of them. */}
          {historyOpen && (
            <HistoryPanel
              steps={steps(history)}
              onTravel={doTravel}
              onClose={() => setHistoryOpen(false)}
            />
          )}

          {/* M-23 — name it, and one line about when to use it. */}
          {naming && p.onSaveBlock && (
            <NameBlockDialog
              title="Save this as your own block"
              intro={`It goes in your template library under “Your own blocks”, so you can drop it into any ${copy.noun} without building it again.`}
              defaultName={naming.label || ""}
              onClose={() => setNaming(null)}
              onSave={(name, note) => { const sec = naming; setNaming(null); void p.onSaveBlock?.(sec, name, note); }}
            />
          )}
        </>
      }
    >
      <Canvas
        doc={doc}
        ctx={p.ctx}
        selection={selection}
        copy={copy}
        renderSection={p.renderSection}
        /* The adapter says how wide its paper is; the preview toggle narrows
           it and never widens it. One function, no per-adapter fork. */
        paperWidth={previewPaperWidth(preview, p.paperWidth ?? 780)}
        paper={p.paper}
        canvasCss={p.canvasCss}
        extraCss={p.extraCss}
        chromeTop={p.chromeTop}
        chromeBottom={p.chromeBottom}
        chromeNote={p.chromeNote}
        drag={drag}
        onDragWidget={setDrag}
        onDropWidget={dropWidget}
        onSelect={select}
        onEditText={onEditText}
        flashWidgetId={flashId}
        onVisibleSection={setVisibleSectionId}
        onTokenClick={p.onTokenClick}
        onDeleteWidget={deleteWidget}
        /* M-21 and M-8, on the page itself. */
        onContextMenu={(target, at) => setMenu({ target, x: at.x, y: at.y })}
        onDocumentMenu={(at) => setMenu({ target: { kind: "document" }, x: at.x, y: at.y })}
        onPatchSection={changeSection}
        onDuplicateSection={(id) => apply(duplicateSection(doc, id), null,
          `Copied ${named(doc.sections.find((x) => x.id === id)?.label)}`)}
        onDeleteSection={deleteSection}
        onMoveSection={(id, to) => apply(moveSection(doc, id, to), null,
          `Moved ${named(doc.sections.find((x) => x.id === id)?.label)}`)}
        /* THE ADD AREA (Elementor's): "+" -> Flexbox or Grid -> a structure,
           or the folder -> the template library. `onAddBlank` is still the
           adapter's veto — it runs inside `addStructure`. */
        onAddBlank={(at: number, layout: SectionLayout, preset: StructurePreset) => addStructure(at, layout, preset)}
        onAddTemplate={(at: number) => setGallery({ at })}
        {...(p.onAskArgus ? { onAskArgus: p.onAskArgus } : {})}
        onDropOnAddArea={dropOnAddArea}
      />
    </BuilderFrame>
  );
}

export default BuilderShell;

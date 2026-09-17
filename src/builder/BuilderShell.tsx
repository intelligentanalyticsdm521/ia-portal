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
import { LeftPane } from "./LeftPane";
import { Canvas, type CanvasDrag, type PickerTarget, type SlashState } from "./Canvas";
import { Inspector, type InspectorSlots } from "./Inspector";
import { SectionGallery, type SavedTemplate } from "./SectionGallery";
import { WidgetPicker, topMatch } from "./WidgetPicker";
import { FirstRun } from "./FirstRun";
import { AnchoredToast } from "./AnchoredToast";
import {
  addSection, addWidget, duplicateSection, duplicateWidget, makeSection, makeWidget, moveSection,
  moveWidget, moveWidgetTo, patchSection, patchWidget, removeSection, removeWidget, setLayout,
  setPropPath, setWidgetStyle, widgetAt,
  type BuilderDocument, type Section, type Selection, type WidgetPath,
} from "./model";
import { withLayer, type ElementStyle } from "./style";
import { canRedo, canUndo, initHistory, push, redo, undo, type History } from "./history";
import { previewNote, previewPaperWidth, type PreviewKey } from "./responsive";
import { WIDGETS_BY_KIND, type BuilderAdapter, type WidgetDef } from "./registry";
import type { RenderContext } from "./render";
import type { PremadeSection } from "./templates";
import { FLASH_MS, insertSpotFor, type InsertSpot } from "./insertPosition";
import { resolveCopy, type BuilderCopy } from "./copy";
import { firstWithFocus, focusSelector, type BuilderProblem } from "./problems";
import { markFirstRunSeen, readFirstRun, shouldShowFirstRun } from "./firstRunModel";
import { EMPTY_PAGE_CHOICES, type WidgetTask } from "./widgetTasks";
import type { BuilderAction } from "./shortcuts";

/** Which array a counted widget repeats. One map, so "how many?" works once. */
export function repeatKeyFor(kind: string): string | null {
  switch (kind) {
    case "comparison_cards": return "cards";
    case "key_facts": case "key_value_table": case "property_plan": case "pricing_table": return "rows";
    case "clauses": case "list": case "gallery": case "property_block": return "items";
    case "article_card": case "product_card": return "items";
    case "callout": return "panels";
    case "data_table": return "columns";
    case "testimonial": return "items";
    default: return null;
  }
}

/** One empty repeat, shaped for the widget it belongs to. */
function blankRepeat(kind: string): unknown {
  switch (kind) {
    case "comparison_cards": return { name: "", pitch: "", price: "", per: "", features: ["", "", ""] };
    case "key_facts": case "key_value_table": case "property_plan": return { label: "", value: "" };
    case "pricing_table": return { name: "", basis: "", rate: "" };
    case "clauses": return { title: "", body: "" };
    case "callout": return { title: "", tone: "accent", body: "" };
    case "property_block": return { description: "", quantity: 1, unit_price: 0 };
    case "article_card": return { title: "", excerpt: "", image: "", alt: "", url: "", linkLabel: "Read it" };
    case "product_card": return { name: "", blurb: "", price: "", cadence: "", image: "", alt: "", url: "", ctaLabel: "" };
    default: return "";
  }
}

export interface BuilderShellProps extends InspectorSlots {
  open: boolean;
  onClose: () => void;
  adapter: BuilderAdapter;
  /** Modal chrome. */
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons on the right of the header: Ask ARGUS, Preview, Save, Send. */
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
  nextUp?: string | null;
  /** Rendered above the widget list in the pane. */
  paneHeader?: ReactNode;
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
   * The three choices an empty page offers (D-148). The ENGINE draws them;
   * the adapter says what they do. Absent, each opens the picker already
   * filtered to that job, which is the right default for every builder.
   */
  emptyChoices?: Array<{ key: string; title: string; hint: string; onPick: () => void }>;
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
  paperNote?: string;
  canvasHint?: string;
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
  /** The picker, open at a "+" or on a slash. See WidgetPicker.tsx. */
  const [picker, setPicker] = useState<
    { target: PickerTarget; anchor: { top: number; left: number } | null; task: WidgetTask | null; slash: boolean } | null>(null);
  /** What just landed: scrolled to, and glowing (D-11). */
  const [flashId, setFlashId] = useState<string | null>(null);
  /** The section on screen, so a pane click lands where the author is looking. */
  const [visibleSectionId, setVisibleSectionId] = useState<string | null>(null);
  const [slash, setSlash] = useState<SlashState | null>(null);
  /** A refusal, shown AT the control that caused it (D-20). */
  const [toast, setToast] = useState<{ anchor: string; message: string; action?: () => void; actionLabel?: string } | null>(null);
  const [firstRun, setFirstRun] = useState(false);
  const doc = p.doc;
  const copy = useMemo(() => resolveCopy(p.copy), [p.copy]);

  const select = useCallback((s: Selection) => {
    setSelection(s);
    p.onSelectionChange?.(s);
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

  /** The three sentences, once per browser. Replayed from the "?" in the header. */
  useEffect(() => {
    if (!p.open) return;
    if (shouldShowFirstRun(readFirstRun())) setFirstRun(true);
  }, [p.open]);

  const closeFirstRun = useCallback(() => { markFirstRunSeen(); setFirstRun(false); }, []);

  /** The adapter's refusal becomes the engine's toast, at its own control. */
  useEffect(() => {
    if (!p.refusal) return;
    setToast({ anchor: p.refusal.anchor, message: p.refusal.message });
    jumpToProblem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.refusal]);

  const apply = useCallback((next: BuilderDocument, mergeKey: string | null = null) => {
    setHist(push(historyRef.current, next, mergeKey));
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

  /** Show the new thing: select it, and let the canvas scroll and glow. */
  const landed = useCallback((sectionId: string, columnIndex: number, index: number, widgetId: string) => {
    select({ kind: "widget", sectionId, columnIndex, widgetIndex: index });
    setFlashId(widgetId);
    setTimeout(() => setFlashId((cur) => (cur === widgetId ? null : cur)), FLASH_MS);
  }, [select]);

  /**
   * A widget, built from its definition.
   *
   * Pulled out because THREE things now create one — the pane, the picker and
   * the slash command — and a second copy of "what a new comparison-cards
   * widget starts with" is how one of them ends up without the Recommended
   * badge.
   */
  const buildWidget = useCallback((def: WidgetDef, count?: number) => {
    const props: Record<string, unknown> = JSON.parse(JSON.stringify(def.defaults || {}));
    const repeatKey = repeatKeyFor(def.kind);
    if (repeatKey && def.count) {
      const n = Math.max(def.count.min, Math.min(def.count.max, count ?? def.count.default));
      const existing = Array.isArray(props[repeatKey]) ? (props[repeatKey] as unknown[]) : [];
      props[repeatKey] = Array.from({ length: n }, (_, i) => existing[i] ?? blankRepeat(def.kind));
      // The mock's rule: one card is Recommended out of the box, so the badge
      // is discovered rather than hunted for.
      if (def.kind === "comparison_cards" && n >= 2) {
        (props[repeatKey] as any[])[Math.min(1, n - 1)].recommended = true;
      }
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
  const insertWidget = useCallback((def: WidgetDef, count?: number, at?: InsertSpot) => {
    if (p.onInsertWidget && p.onInsertWidget(def, count) === false) return;
    let next = doc;
    let spot = at ?? insertSpotFor(doc, selection, visibleSectionId);
    if (!spot) {
      const s = makeSection({ label: "Section" });
      next = addSection(next, s);
      spot = { sectionId: s.id, columnIndex: 0, index: 0 };
    }
    // "Columns" is a layout choice, not a thing on the page.
    if (def.kind === "columns") {
      apply(setLayout(next, spot.sectionId, count === 3 ? 3 : 2));
      select({ kind: "section", sectionId: spot.sectionId });
      return;
    }
    const widget = buildWidget(def, count);
    apply(addWidget(next, spot.sectionId, spot.columnIndex, widget, spot.index));
    landed(spot.sectionId, spot.columnIndex, spot.index, widget.id);
  }, [apply, buildWidget, doc, landed, p, select, selection, visibleSectionId]);

  /** A "+" on the page: a NEW section holding whatever is chosen. */
  const insertInNewSection = useCallback((def: WidgetDef, count: number | undefined, index: number) => {
    if (p.onInsertWidget && p.onInsertWidget(def, count) === false) return;
    if (def.kind === "columns") { p.onAddBlank?.(index); return; }
    const s = makeSection({ label: def.label });
    const widget = buildWidget(def, count);
    const next = addWidget(addSection(doc, s, index), s.id, 0, widget, 0);
    apply(next);
    landed(s.id, 0, 0, widget.id);
  }, [apply, buildWidget, doc, landed, p]);

  /**
   * A DROP. Either a new widget from the pane or one already on the page.
   *
   * The index maths for a move is `model.dropIndexFor`, not a subtraction
   * written here: lift-then-insert shifts the target down by one when the
   * widget came from the same column above it, and that arithmetic belongs
   * with the operation it belongs to.
   */
  const dropWidget = useCallback((spot: { sectionId: string; columnIndex: number; index: number }) => {
    const payload = drag;
    setDrag(null);
    if (!payload) return;
    if (payload.kind === "move") {
      apply(moveWidgetTo(doc, payload.path, spot));
      select({ kind: "widget", sectionId: spot.sectionId, columnIndex: spot.columnIndex, widgetIndex: spot.index });
      return;
    }
    const def = WIDGETS_BY_KIND[payload.label];
    if (def) insertWidget(def, def.count?.default, spot);
  }, [apply, doc, drag, insertWidget, select]);

  /** The "+" and the empty column both open the ONE picker, anchored there. */
  const openPicker = useCallback((target: PickerTarget, rect: DOMRect) => {
    setSlash(null);
    setPicker({ target, anchor: { top: rect.bottom + 6, left: rect.left }, task: null, slash: false });
  }, []);

  const pickFromPicker = useCallback((def: WidgetDef, count?: number) => {
    const state = picker;
    setPicker(null);
    if (!state) return;
    if (state.target.kind === "newSection") insertInNewSection(def, count, state.target.index);
    else insertWidget(def, count, state.target.spot);
  }, [insertInNewSection, insertWidget, picker]);

  /**
   * THE SLASH COMMAND. "/" on an empty line, then Enter.
   *
   * The clear and the insert are ONE document operation on purpose: applying
   * them separately would compute the second from the `doc` prop, which React
   * has not re-rendered yet, and the cleared "/pricing" would come straight
   * back.
   */
  const slashCommit = useCallback(() => {
    const s = slash;
    setSlash(null);
    if (!s) return;
    /**
     * LET GO OF THE CARET FIRST.
     *
     * FOUND BY DRIVING IT (2026-09-17): the canvas deliberately skips its
     * repaint while the focus is inside a section (otherwise React rewrites
     * the HTML under the cursor), so the "/pri" the author typed stayed on
     * screen and the widget that had just been added was invisible until they
     * clicked elsewhere. The model was right and the page was a lie.
     */
    (document.activeElement as HTMLElement | null)?.blur?.();
    const def = topMatch(p.adapter, s.query);
    const section = doc.sections.find((x) => x.id === s.sectionId);
    if (!section) return;
    let path: WidgetPath | null = null;
    section.columns.forEach((col, columnIndex) => {
      const widgetIndex = col.widgets.findIndex((w) => w.id === s.widgetId);
      if (widgetIndex >= 0) path = { sectionId: section.id, columnIndex, widgetIndex };
    });
    if (!path) return;
    const here = path as WidgetPath;
    const widget = widgetAt(doc, here);
    if (!widget) return;
    const cleared = patchWidget(doc, here, setPropPath(widget.props, s.path, ""));
    if (!def) { apply(cleared, `${s.widgetId}:${s.path}`); return; }
    if (p.onInsertWidget && p.onInsertWidget(def, def.count?.default) === false) {
      apply(cleared, `${s.widgetId}:${s.path}`);
      return;
    }
    const made = buildWidget(def, def.count?.default);
    const index = here.widgetIndex + 1;
    apply(addWidget(cleared, here.sectionId, here.columnIndex, made, index));
    landed(here.sectionId, here.columnIndex, index, made.id);
  }, [apply, buildWidget, doc, landed, p, slash]);

  /** D-35: take me to the first thing that is still blank. */
  function jumpToProblem() {
    const problem = firstWithFocus(p.problems);
    if (!problem?.focus) return;
    const { sectionId, widgetId } = problem.focus;
    const section = doc.sections.find((s) => s.id === sectionId);
    section?.columns.forEach((col, columnIndex) => {
      const widgetIndex = col.widgets.findIndex((w) => w.id === widgetId);
      if (widgetIndex >= 0) select({ kind: "widget", sectionId, columnIndex, widgetIndex });
    });
    // After the canvas has painted the selection: the element is inside HTML
    // the canvas writes with innerHTML, so it does not exist until then.
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(focusSelector(problem.focus!));
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus?.();
    }, 60);
  }

  const placeSection = useCallback((premade: PremadeSection, at: number) => {
    if (p.onPlaceSection && p.onPlaceSection(premade, at) === false) return;
    const s = premade.build();
    apply(addSection(doc, s, at));
    select({ kind: "section", sectionId: s.id });
  }, [apply, doc, p, select]);

  const onEditText = useCallback((sectionId: string, widgetId: string, path: string, value: string, mergeKey: string) => {
    const section = doc.sections.find((s) => s.id === sectionId);
    if (!section) return;
    for (let c = 0; c < section.columns.length; c++) {
      const idx = section.columns[c].widgets.findIndex((w) => w.id === widgetId);
      if (idx < 0) continue;
      const widget = section.columns[c].widgets[idx];
      const nextProps = setPropPath(widget.props, path, value);
      apply(patchWidget(doc, { sectionId, columnIndex: c, widgetIndex: idx }, nextProps), mergeKey);
      return;
    }
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
    apply(next);
  }, [apply, doc]);

  const patchSelectedWidget = useCallback((props: Record<string, unknown>) => {
    if (selection?.kind !== "widget") return;
    apply(patchWidget(doc, selection, props));
  }, [apply, doc, selection]);

  const setCount = useCallback((n: number) => {
    if (selection?.kind !== "widget") return;
    const section = doc.sections.find((s) => s.id === selection.sectionId);
    const w = section?.columns[selection.columnIndex]?.widgets[selection.widgetIndex];
    if (!w) return;
    const key = repeatKeyFor(w.kind);
    if (!key) return;
    const current = Array.isArray((w.props as any)[key]) ? [...((w.props as any)[key] as unknown[])] : [];
    const next = Array.from({ length: n }, (_, i) => current[i] ?? blankRepeat(w.kind));
    apply(patchWidget(doc, selection, { [key]: next }));
  }, [apply, doc, selection]);

  /** A locked part refuses, and SAYS SO — a button that silently does nothing
   *  is the thing this whole pass exists to delete. */
  const refuse = useCallback((message: string) => setToast({ anchor: "", message }), []);

  const deleteWidget = useCallback((path: WidgetPath) => {
    const w = widgetAt(doc, path);
    if (!w) return;
    if (w.locked) {
      refuse("This part has to stay on the page: it carries your unsubscribe link and postal address. You can change the wording.");
      return;
    }
    apply(removeWidget(doc, path));
    select({ kind: "section", sectionId: path.sectionId });
  }, [apply, doc, refuse, select]);

  const deleteSection = useCallback((id: string) => {
    const s = doc.sections.find((x) => x.id === id);
    if (s?.columns.some((c) => c.widgets.some((w) => w.locked))) {
      refuse("This section holds a part the law puts on every send, so it stays. You can change the wording inside it.");
      return;
    }
    apply(removeSection(doc, id));
    select(null);
  }, [apply, doc, refuse, select]);

  /**
   * THE KEYBOARD. The frame listens; this decides what each action means.
   *
   * Returns TRUE when the action was consumed, which is how Escape knows the
   * difference between "deselect" and "the author wants out of here" — the
   * frame only offers to close when nothing was selected to let go of.
   */
  const onShortcut = useCallback((action: BuilderAction): boolean => {
    switch (action) {
      case "undo": doUndo(); return true;
      case "redo": doRedo(); return true;
      case "save": if (p.onSave) { p.onSave(); return true; } return false;
      case "delete":
        if (selection?.kind === "widget") { deleteWidget(selection); return true; }
        if (selection?.kind === "section") { deleteSection(selection.sectionId); return true; }
        return false;
      case "escape":
        if (picker) { setPicker(null); return true; }
        if (slash) { setSlash(null); return true; }
        if (selection) { select(null); return true; }
        return false;
      default: return false;
    }
  }, [deleteSection, deleteWidget, doRedo, doUndo, p, picker, select, selection, slash]);

  /** The empty page's three choices — the engine's default (D-148). */
  const emptyChoices = useMemo(() => p.emptyChoices ?? EMPTY_PAGE_CHOICES.map((c) => ({
    key: c.key,
    title: c.title,
    hint: c.hint,
    onPick: () => setPicker({
      target: { kind: "newSection", index: doc.sections.length },
      anchor: null,
      task: c.task,
      slash: false,
    }),
  })), [doc.sections.length, p.emptyChoices]);

  return (
    <BuilderFrame
      open={p.open}
      onClose={p.onClose}
      product="oliver"
      eyebrow={p.eyebrow}
      title={p.title}
      subtitle={p.subtitle}
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
      onReplayHelp={() => setFirstRun(true)}
      canvasBackground={p.canvasBackground}
      preview={preview}
      onPreview={setPreview}
      pane={
        <LeftPane
          copy={copy}
          header={p.paneHeader}
          problems={p.problems}
          onJumpToProblem={jumpToProblem}
          pane={{
            adapter: p.adapter,
            onInsert: (def, count) => insertWidget(def, count),
            hint: copy.paneHint,
            onDragWidget: (w) => setDrag(w ? { kind: "new", label: w.kind } : null),
          }}
          navigator={{
            doc,
            selection,
            onSelect: select,
            onMoveSection: (id, to) => apply(moveSection(doc, id, to)),
            device: preview,
            heading: `Everything in this ${copy.noun}, in order.`,
            onHideSection: (id, hidden) => {
              const s = doc.sections.find((x) => x.id === id);
              if (!s) return;
              apply(patchSection(doc, id, {
                style: withLayer(s.style, preview, { hidden: hidden ? true : undefined }),
              } as Partial<Section>));
            },
            onHideWidget: (path, hidden) => {
              const w = widgetAt(doc, path);
              if (!w) return;
              apply(setWidgetStyle(doc, path, withLayer(w.style, preview, { hidden: hidden ? true : undefined })));
            },
          }}
        />
      }
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
          askArgus={p.askArgus}
          widgetExtras={p.widgetExtras}
          documentExtras={p.documentExtras}
          onPatchSection={changeSection}
          onPatchWidget={patchSelectedWidget}
          onDeleteWidget={() => { if (selection?.kind === "widget") deleteWidget(selection); }}
          onMoveWidget={(d) => { if (selection?.kind === "widget") { apply(moveWidget(doc, selection, d)); select({ ...selection, widgetIndex: selection.widgetIndex + d }); } }}
          onSetCount={setCount}
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
            onPlaceWidget={(w, c) => insertWidget(w, c)}
          />
          {/* THE ONE PICKER: every "+", every empty column, every slash. */}
          {picker && (
            <WidgetPicker
              adapter={p.adapter}
              anchor={picker.anchor}
              task={picker.task}
              heading={copy.paneHeading}
              onPick={pickFromPicker}
              onClose={() => setPicker(null)}
            />
          )}
          {slash && (
            <WidgetPicker
              adapter={p.adapter}
              anchor={slash.rect}
              query={slash.query}
              heading="Type to find it, then press Enter"
              onPick={() => slashCommit()}
              onClose={() => setSlash(null)}
            />
          )}
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
        </>
      }
    >
      <Canvas
        doc={doc}
        ctx={p.ctx}
        selection={selection}
        nextUp={p.nextUp}
        copy={copy}
        renderSection={p.renderSection}
        /* The adapter says how wide its paper is; the preview toggle narrows
           it and never widens it. One function, no per-adapter fork. */
        paperWidth={previewPaperWidth(preview, p.paperWidth ?? 780)}
        paper={p.paper}
        paperNote={previewNote(preview, p.paperWidth ?? 780) ?? p.paperNote}
        canvasHint={p.canvasHint}
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
        onOpenPicker={openPicker}
        flashWidgetId={flashId}
        onVisibleSection={setVisibleSectionId}
        slash={slash}
        onSlash={setSlash}
        onSlashCommit={slashCommit}
        emptyChoices={emptyChoices}
        onRefuse={refuse}
        onTokenClick={p.onTokenClick}
        onDuplicateWidget={(path) => apply(duplicateWidget(doc, path))}
        onDeleteWidget={deleteWidget}
        onPatchSection={changeSection}
        onDuplicateSection={(id) => apply(duplicateSection(doc, id))}
        onDeleteSection={deleteSection}
        onMoveSection={(id, to) => apply(moveSection(doc, id, to))}
        onAddSection={(at, how) => {
          if (how === "premade") { setGallery({ at }); return; }
          if (p.onAddBlank && p.onAddBlank(at) === false) return;
          const s = makeSection({ label: "Section" });
          apply(addSection(doc, s, at));
          select({ kind: "section", sectionId: s.id });
        }}
      />
    </BuilderFrame>
  );
}

export default BuilderShell;

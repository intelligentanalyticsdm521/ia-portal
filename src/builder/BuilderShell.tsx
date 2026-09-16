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
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BuilderFrame } from "./BuilderFrame";
import { WidgetPane } from "./WidgetPane";
import { Canvas } from "./Canvas";
import { Inspector, type InspectorSlots } from "./Inspector";
import { SectionGallery, type SavedTemplate } from "./SectionGallery";
import {
  addSection, addWidget, duplicateSection, makeSection, makeWidget, moveSection, moveWidget,
  patchSection, patchWidget, removeSection, removeWidget, setLayout, setPropPath,
  type BuilderDocument, type Section, type Selection,
} from "./model";
import { canRedo, canUndo, initHistory, push, redo, undo, type History } from "./history";
import type { BuilderAdapter, WidgetDef } from "./registry";
import type { RenderContext } from "./render";
import type { PremadeSection } from "./templates";

/** Which array a counted widget repeats. One map, so "how many?" works once. */
export function repeatKeyFor(kind: string): string | null {
  switch (kind) {
    case "comparison_cards": return "cards";
    case "key_facts": case "key_value_table": case "property_plan": case "pricing_table": return "rows";
    case "clauses": case "list": case "gallery": case "property_block": return "items";
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
  savedTemplates?: SavedTemplate[];
  onOpenTemplate?: (t: SavedTemplate) => void;
  nextUp?: string | null;
  /** Rendered above the widget list in the pane. */
  paneHeader?: ReactNode;
}

export function BuilderShell(p: BuilderShellProps) {
  const [history, setHistory] = useState<History>(() => initHistory(p.doc));
  const [selection, setSelection] = useState<Selection>(null);
  const [gallery, setGallery] = useState<{ at: number } | null>(null);
  const doc = p.doc;

  // The adapter owns the document; the shell owns the history OF it. When the
  // adapter swaps the document wholesale — a template applied, a saved
  // proposal loaded — it bumps `resetKey` and the history starts again, so
  // undo can never walk backwards into a different document.
  useEffect(() => {
    setHistory(initHistory(p.doc));
    setSelection(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.resetKey]);

  const apply = useCallback((next: BuilderDocument, mergeKey: string | null = null) => {
    setHistory((h) => push(h, next, mergeKey));
    p.onChange(next);
  }, [p]);

  const doUndo = useCallback(() => {
    setHistory((h) => { const n = undo(h); p.onChange(n.present); return n; });
  }, [p]);
  const doRedo = useCallback(() => {
    setHistory((h) => { const n = redo(h); p.onChange(n.present); return n; });
  }, [p]);

  /** Where a new widget lands: the selected section, else the last one. */
  const targetSection = useMemo<Section | null>(() => {
    if (selection) return doc.sections.find((s) => s.id === selection.sectionId) || null;
    return doc.sections[doc.sections.length - 1] || null;
  }, [doc.sections, selection]);

  const insertWidget = useCallback((def: WidgetDef, count?: number) => {
    let next = doc;
    let section = targetSection;
    if (!section) {
      section = makeSection({ label: "Section" });
      next = addSection(next, section);
    }
    // "Columns" is a layout choice, not a thing on the page.
    if (def.kind === "columns") {
      apply(setLayout(next, section.id, (count === 3 ? 3 : 2)));
      setSelection({ kind: "section", sectionId: section.id });
      return;
    }
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
    const widget = makeWidget(def.kind, props);
    const col = selection?.kind === "widget" ? selection.columnIndex : 0;
    apply(addWidget(next, section.id, col, widget));
    const placed = section.columns[col]?.widgets.length ?? 0;
    setSelection({ kind: "widget", sectionId: section.id, columnIndex: col, widgetIndex: placed });
  }, [apply, doc, selection, targetSection]);

  const placeSection = useCallback((premade: PremadeSection, at: number) => {
    const s = premade.build();
    apply(addSection(doc, s, at));
    setSelection({ kind: "section", sectionId: s.id });
  }, [apply, doc]);

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
      pane={<WidgetPane adapter={p.adapter} onInsert={insertWidget} header={p.paneHeader} />}
      inspector={
        <Inspector
          doc={doc}
          selection={selection}
          swatches={p.swatches}
          fonts={p.fonts}
          askArgus={p.askArgus}
          widgetExtras={p.widgetExtras}
          onPatchSection={(id, patch) => apply(patchSection(doc, id, patch))}
          onPatchWidget={patchSelectedWidget}
          onDeleteWidget={() => { if (selection?.kind === "widget") { apply(removeWidget(doc, selection)); setSelection({ kind: "section", sectionId: selection.sectionId }); } }}
          onMoveWidget={(d) => { if (selection?.kind === "widget") { apply(moveWidget(doc, selection, d)); setSelection({ ...selection, widgetIndex: selection.widgetIndex + d }); } }}
          onSetCount={setCount}
        />
      }
      overlays={
        <SectionGallery
          open={!!gallery}
          adapter={p.adapter}
          savedTemplates={p.savedTemplates}
          onOpenTemplate={p.onOpenTemplate}
          onClose={() => setGallery(null)}
          onPlaceSection={(s) => placeSection(s, gallery?.at ?? doc.sections.length)}
          onPlaceWidget={(w, c) => insertWidget(w, c)}
        />
      }
    >
      <Canvas
        doc={doc}
        ctx={p.ctx}
        selection={selection}
        nextUp={p.nextUp}
        onSelect={setSelection}
        onEditText={onEditText}
        onPatchSection={(id, patch) => apply(patchSection(doc, id, patch))}
        onDuplicateSection={(id) => apply(duplicateSection(doc, id))}
        onDeleteSection={(id) => { apply(removeSection(doc, id)); setSelection(null); }}
        onMoveSection={(id, to) => apply(moveSection(doc, id, to))}
        onAddSection={(at, how) => {
          if (how === "premade") { setGallery({ at }); return; }
          const s = makeSection({ label: "Section" });
          apply(addSection(doc, s, at));
          setSelection({ kind: "section", sectionId: s.id });
        }}
      />
    </BuilderFrame>
  );
}

export default BuilderShell;

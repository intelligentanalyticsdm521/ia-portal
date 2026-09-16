/**
 * builder/Inspector.tsx — the panel for whatever is selected.
 *
 * SD-010 and the design canvas: the inspector is bound to the SELECTION and
 * nothing else. Select a section and it shows the section's properties; select
 * a widget and it shows that widget's — the count it was asked once, its
 * Recommended flag, where its rows come from, its colours.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
 * It does not edit the words. Text is typed on the page (Canvas.tsx), because
 * "raw field lists are a FAIL" — a panel of inputs beside a preview is the
 * interface this whole rebuild exists to delete. What lives here is everything
 * that has no place on the page itself: how many, which source, what colour.
 *
 * Adapter-specific pickers (the product catalogue, the clause library, the
 * customer's locations) are passed IN as slots, so the engine stays free of
 * OLIVER and the same inspector serves the website and email builders later.
 */
import type { ReactNode } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import type { BuilderDocument, Section, Selection, Widget } from "./model";
import { WIDGETS_BY_KIND } from "./registry";

export interface InspectorSlots {
  /** Rendered inside the selected widget's panel, above the standard controls. */
  widgetExtras?: (w: Widget, sectionId: string) => ReactNode;
  /** Rendered at the top of the panel — the gold Ask ARGUS button. */
  askArgus?: ReactNode;
}

export interface InspectorProps extends InspectorSlots {
  doc: BuilderDocument;
  selection: Selection;
  onPatchSection: (sectionId: string, patch: Partial<Section>) => void;
  onPatchWidget: (props: Record<string, unknown>) => void;
  onDeleteWidget: () => void;
  onMoveWidget: (delta: -1 | 1) => void;
  onSetCount: (n: number) => void;
  /** Any colour, any font — the brand kit only supplies the swatches. */
  swatches: string[];
  fonts: string[];
  /** What "no font of its own" is called here. The website says "your website's". */
  defaultFontLabel?: string;
}

const L: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5A7A8A",
};
const INPUT: React.CSSProperties = {
  border: "1px solid #CBD5E1", borderRadius: 4, padding: "6px 8px", fontSize: 12, background: "#fff",
  color: "#0B1C24", width: "100%",
};
const FIELD: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

export function Inspector(p: InspectorProps) {
  const { doc, selection } = p;
  if (!selection) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "#5A7A8A" }}>
        <div style={L}>Nothing selected</div>
        <p style={{ marginTop: 8, lineHeight: 1.5 }}>
          Click a section or anything on the page to change it here. Words are typed straight on the page.
        </p>
      </div>
    );
  }

  const section = doc.sections.find((s) => s.id === selection.sectionId);
  if (!section) return null;

  const widget = selection.kind === "widget"
    ? section.columns[selection.columnIndex]?.widgets[selection.widgetIndex] ?? null
    : null;
  const def = widget ? WIDGETS_BY_KIND[widget.kind] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={L}>Selected</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{widget ? (def?.label || widget.kind) : (section.label || "Section")}</div>
        </div>
        {p.askArgus}
      </div>

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        {widget && (
          <>
            {def?.description && (
              <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.45 }}>{def.description}</div>
            )}

            {p.widgetExtras?.(widget, section.id)}

            {/* The guided count, asked once on insert and adjustable here —
                "Add or remove a card any time." */}
            {def?.count && (
              <div style={FIELD}>
                <span style={L}>{def.count.label}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {Array.from({ length: def.count.max - def.count.min + 1 }, (_, i) => def.count!.min + i).map((n) => (
                    <button key={n} type="button" title={`${n}`}
                      onClick={() => p.onSetCount(n)}
                      style={{
                        width: 30, height: 30, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        border: "1px solid " + (countOf(widget) === n ? "#0C4A60" : "#CBD5E1"),
                        background: countOf(widget) === n ? "#0C4A60" : "#fff",
                        color: countOf(widget) === n ? "#fff" : "#334155",
                      }}>{n}</button>
                  ))}
                </div>
                <span style={{ fontSize: 10, color: "#94A3B8" }}>Asked once. Add or remove any time.</span>
              </div>
            )}

            {/* Standard controls that are NOT words: toggles, selects, colours. */}
            {(def?.controls || []).filter((c) => c.type === "toggle" || c.type === "select" || c.type === "colour" || c.type === "number" || c.type === "image" || c.type === "link").map((c) => (
              <div key={c.key} style={FIELD}>
                <span style={L}>{c.label}</span>
                {c.type === "toggle" && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <input type="checkbox" checked={!!(widget.props as any)[c.key]}
                      onChange={(e) => p.onPatchWidget({ [c.key]: e.target.checked })} />
                    {c.help || "On"}
                  </label>
                )}
                {c.type === "select" && (c.options?.length ? (
                  <select style={INPUT} value={String((widget.props as any)[c.key] ?? "")}
                    onChange={(e) => p.onPatchWidget({ [c.key]: optionValue(c.options!, e.target.value) })}>
                    {c.options.map((o) => <option key={o} value={optionKey(o)}>{o}</option>)}
                  </select>
                ) : null)}
                {c.type === "number" && (
                  <input type="number" style={INPUT} value={Number((widget.props as any)[c.key] ?? 0)}
                    onChange={(e) => p.onPatchWidget({ [c.key]: Number(e.target.value) })} />
                )}
                {c.type === "colour" && (
                  <Swatches value={String((widget.props as any)[c.key] ?? "")} swatches={p.swatches}
                    onPick={(v) => p.onPatchWidget({ [c.key]: v })} />
                )}
                {(c.type === "image" || c.type === "link") && (
                  <input style={INPUT} placeholder={c.type === "image" ? "Paste an image address" : "https://"}
                    value={String((widget.props as any)[c.key] ?? "")}
                    onChange={(e) => p.onPatchWidget({ [c.key]: e.target.value })} />
                )}
                {c.help && c.type !== "toggle" && <span style={{ fontSize: 10, color: "#94A3B8" }}>{c.help}</span>}
              </div>
            ))}

            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" style={miniBtn} title="Move this up inside its column" onClick={() => p.onMoveWidget(-1)}>↑ Up</button>
              <button type="button" style={miniBtn} title="Move this down inside its column" onClick={() => p.onMoveWidget(1)}>↓ Down</button>
              {/* A locked widget is a part the law puts on the page, not the
                  author. model.removeWidget refuses it too — this is the half
                  that explains WHY, which a disabled button with no tooltip
                  never does. */}
              <button
                type="button"
                disabled={!!widget.locked}
                style={{ ...miniBtn, color: widget.locked ? "#94A3B8" : "#B91C1C", marginLeft: "auto", cursor: widget.locked ? "default" : "pointer" }}
                title={widget.locked
                  ? "This has to be on every email you send — it carries the unsubscribe link and your postal address. You can change the wording; you cannot remove it."
                  : "Remove this from the page"}
                onClick={p.onDeleteWidget}><Trash2 size={12} /> Remove</button>
            </div>
            {widget.locked && (
              <div style={{ fontSize: 10, color: "#B45309", lineHeight: 1.45 }}>
                Required on every marketing email. Edit the wording on the page; it stays where it is.
              </div>
            )}
          </>
        )}

        {/* The section's own properties, always available under the widget's. */}
        <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={L}>This section</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={FIELD}>
              <span style={{ ...L, textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#5A7A8A" }}>Label</span>
              <input style={INPUT} value={section.label || ""} title="Shown in the toolbar, and on the page when the section is numbered"
                onChange={(e) => p.onPatchSection(section.id, { label: e.target.value })} />
            </div>
            <div style={FIELD}>
              <span style={{ ...L, textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#5A7A8A" }}>Padding</span>
              <input type="number" style={INPUT} value={section.padding} title="Room around the section, in pixels"
                onChange={(e) => p.onPatchSection(section.id, { padding: Number(e.target.value) })} />
            </div>
            <div style={FIELD}>
              <span style={{ ...L, textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#5A7A8A" }}>Width</span>
              <select style={INPUT} value={section.width} title="How wide the content runs"
                onChange={(e) => p.onPatchSection(section.id, { width: e.target.value as Section["width"] })}>
                <option value="full">Full</option><option value="contained">Boxed</option><option value="narrow">Narrow</option>
              </select>
            </div>
            <div style={FIELD}>
              <span style={{ ...L, textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#5A7A8A" }}>Columns</span>
              <select style={INPUT} value={section.layout} title="One, two or three columns"
                onChange={(e) => p.onPatchSection(section.id, { layout: Number(e.target.value) as 1 | 2 | 3 })}>
                <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
              </select>
            </div>
          </div>
          <div style={FIELD}>
            <span style={{ ...L, textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#5A7A8A" }}>Background</span>
            <Swatches value={section.background || ""} swatches={p.swatches}
              onPick={(v) => p.onPatchSection(section.id, { background: v })} />
          </div>
          {/* THE SECTION'S OWN TYPE. Any font we carry, the brand kit's first
              — Q4 — and empty means "whatever the document or the site uses",
              which is the right default and the one most sections keep. */}
          {p.fonts.length > 0 && (
            <div style={FIELD}>
              <span style={{ ...L, textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#5A7A8A" }}>Heading font</span>
              <select
                style={INPUT}
                value={section.headingFont || ""}
                title="The font the headings in this section are set in. Any font we carry."
                onChange={(e) => p.onPatchSection(section.id, { headingFont: e.target.value })}
              >
                <option value="">{p.defaultFontLabel || "The document's own font"}</option>
                {p.fonts.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          )}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
            title="Start a new page here when the document is printed or saved as a PDF">
            <input type="checkbox" checked={!!section.pageBreakBefore}
              onChange={(e) => p.onPatchSection(section.id, { pageBreakBefore: e.target.checked })} />
            Start a new page here
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
            title="Your crew sees this; the customer never does, and it is left out of the PDF">
            <input type="checkbox" checked={section.visibility === "internal"}
              onChange={(e) => p.onPatchSection(section.id, { visibility: e.target.checked ? "internal" : "customer" })} />
            Internal note only
          </label>
        </div>
      </div>

      <div style={{ marginTop: "auto", padding: "10px 16px", borderTop: "1px solid #E2E8F0", fontSize: 11, color: "#5A7A8A" }}>
        Changes show on the page as you make them.
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid #CBD5E1", background: "#fff",
  borderRadius: 4, padding: "5px 9px", fontSize: 11, fontWeight: 600, color: "#334155", cursor: "pointer",
};

/** Brand swatches first, any colour after — Q4, in one control. */
function Swatches({ value, swatches, onPick }: { value: string; swatches: string[]; onPick: (v: string) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {swatches.map((c) => (
        <button key={c} type="button" title={`Use ${c}`} onClick={() => onPick(c)}
          style={{
            width: 20, height: 20, borderRadius: 4, background: c, cursor: "pointer",
            border: value.toLowerCase() === c.toLowerCase() ? "2px solid #0B1C24" : "1px solid #CBD5E1",
          }} />
      ))}
      <label title="Any colour you like" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#0C4A60", cursor: "pointer" }}>
        <input type="color" value={value || "#ffffff"} onChange={(e) => onPick(e.target.value)}
          style={{ width: 20, height: 20, padding: 0, border: "1px dashed #CBD5E1", borderRadius: 4, background: "transparent" }} />
        Any colour
      </label>
      {value && (
        <button type="button" title="Back to the page's own background" onClick={() => onPick("")}
          style={{ ...miniBtn, padding: "2px 6px", fontSize: 10 }}>Clear</button>
      )}
    </div>
  );
}

/** How many repeats a counted widget currently has. */
function countOf(w: Widget): number {
  const p: any = w.props || {};
  for (const key of ["cards", "items", "rows", "panels", "columns", "features"]) {
    if (Array.isArray(p[key])) return p[key].length;
  }
  return 0;
}

/** Human option → stored value. "Dark band" → "dark_band". */
function optionKey(option: string): string {
  return option.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
function optionValue(options: string[], chosen: string): string {
  return options.map(optionKey).includes(chosen) ? chosen : optionKey(chosen);
}

export { Sparkles };
export default Inspector;

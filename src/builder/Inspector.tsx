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
 *
 * ── THE GROUPS (§11.8, D-140) ─────────────────────────────────────────────
 * Elementor's shape, because that is the one every author on this platform has
 * already used:
 *
 *   a WIDGET   Content · Typography · Spacing · Advanced
 *   a SECTION  Layout · Spacing · Style · Typography · Page
 *
 * Collapsible, each with a reset, every control with a tooltip in plain words.
 * The controls themselves are in StyleGroups.tsx and the maths is in style.ts —
 * this file decides WHICH groups a selection gets, and nothing else.
 *
 * The Desktop / Tablet / Phone segment inside Spacing and Typography edits the
 * override for the device the CANVAS is previewing. ONE state, handed down from
 * BuilderShell: two would let an author edit the phone and watch the desktop.
 */
import type { ReactNode } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import type { BuilderDocument, Section, Selection, Widget } from "./model";
import { WIDGETS_BY_KIND } from "./registry";
import {
  isTypographic, layerFor, resetKeys, seedFromPadding, withLayer,
  type Device, type ElementStyle, type StyleLayer,
} from "./style";
import {
  AdvancedGroup, DeviceSegment, Group, RatioPicker, SpacingGroup, TypographyGroup,
  FIELD, INPUT, L,
} from "./StyleGroups";

export interface InspectorSlots {
  /** Rendered inside the selected widget's panel, above the standard controls. */
  widgetExtras?: (w: Widget, sectionId: string) => ReactNode;
  /** Rendered at the top of the panel — the gold Ask ARGUS button. */
  askArgus?: ReactNode;
  /**
   * The DOCUMENT's own settings, shown whatever is selected — including when
   * nothing is.
   *
   * Not every fact about a thing being built belongs to a section or a widget.
   * A SPARK template has a category, a from address and whether it is active;
   * none of those is on the page, none of them changes when the selection
   * does, and a panel that only appeared once a widget happened to be clicked
   * would hide them.
   */
  documentExtras?: ReactNode;
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

  /* ── §11.8 ─────────────────────────────────────────────────────────────── */
  /** The device being previewed AND edited. One state, from BuilderShell. */
  device: Device;
  onDevice: (d: Device) => void;
  /** Write the selected section's / widget's style. `mergeKey` coalesces undo. */
  onSetSectionStyle: (sectionId: string, style: ElementStyle | undefined, mergeKey?: string | null) => void;
  onSetWidgetStyle: (style: ElementStyle | undefined, mergeKey?: string | null) => void;
  /**
   * Which builder this is, so a control can say what it cannot promise.
   *
   * A shadow and a rounded corner do not survive Outlook, which renders through
   * Word. The email renderer refuses to emit either (style.ts), and this says
   * so beside the control rather than leaving the author to find out in their
   * own inbox.
   */
  adapter?: string;
  /**
   * The Page group's page-break line, in the adapter's words (copy.ts, D-30).
   *
   * "Start a new page here (when printed or saved as a PDF)" was showing in
   * the WEBSITE section inspector, where there are no pages and nothing is
   * printed. An adapter that has no such thing passes "" and the control is
   * not offered at all — a control that cannot do anything is worse than a
   * missing one.
   */
  pageBreakLabel?: string;
}

export function Inspector(p: InspectorProps) {
  const { doc, selection } = p;
  if (!selection) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflowY: "auto" }}>
        {p.documentExtras}
        <div style={{ padding: 16, fontSize: 12, color: "#5A7A8A" }}>
          <div style={L}>Nothing selected</div>
          <p style={{ marginTop: 8, lineHeight: 1.5 }}>
            Click a section or anything on the page to change it here. Words are typed straight on the page.
          </p>
        </div>
      </div>
    );
  }

  const section = doc.sections.find((s) => s.id === selection.sectionId);
  if (!section) return null;

  const widget = selection.kind === "widget"
    ? section.columns[selection.columnIndex]?.widgets[selection.widgetIndex] ?? null
    : null;
  const def = widget ? WIDGETS_BY_KIND[widget.kind] : null;
  const isEmail = p.adapter === "email";

  /* The layer being EDITED — not the resolved one. An empty box means "this
     device says nothing about it", which is a different thing from zero. */
  const widgetLayer: StyleLayer = layerFor(widget?.style, p.device);
  const sectionLayer: StyleLayer = layerFor(section.style, p.device);

  const patchWidgetStyle = (patch: Partial<StyleLayer>, mergeKey: string) => {
    if (!widget) return;
    p.onSetWidgetStyle(withLayer(widget.style, p.device, patch), `${widget.id}:${mergeKey}:${p.device}`);
  };
  const patchSectionStyle = (patch: Partial<StyleLayer>, mergeKey: string) => {
    p.onSetSectionStyle(section.id, withLayer(section.style, p.device, patch), `${section.id}:${mergeKey}:${p.device}`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {p.documentExtras}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={L}>Selected</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{widget ? (def?.label || widget.kind) : (section.label || "Section")}</div>
        </div>
        {p.askArgus}
      </div>

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
        {widget && (
          <>
            {/* ── CONTENT — everything that was here before ─────────────── */}
            <Group title="Content" hint="What this shows, and where it comes from" defaultOpen>
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
                {/* The keyboard path, kept (§11.8): HTML5 drag does not fire
                    on touch at all, so a phone has to be able to do everything
                    a mouse can. Dragging is the other half, not the only one. */}
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
            </Group>

            {/* ── TYPOGRAPHY — only where there are words to set ────────── */}
            {isTypographic(widget.kind) && (
              <TypographyGroup
                device={p.device}
                onDevice={p.onDevice}
                layer={widgetLayer}
                fonts={p.fonts}
                onPatch={patchWidgetStyle}
                onReset={() => p.onSetWidgetStyle(resetKeys(widget.style, ["typography"]))}
              />
            )}

            {/* ── SPACING ───────────────────────────────────────────────── */}
            <SpacingGroup
              device={p.device}
              onDevice={p.onDevice}
              layer={widgetLayer}
              what="widget"
              onPatch={patchWidgetStyle}
              onReset={() => p.onSetWidgetStyle(resetKeys(widget.style, ["padding", "margin"]))}
            />

            {/* ── ADVANCED ──────────────────────────────────────────────── */}
            <AdvancedGroup
              layer={widgetLayer}
              hiddenOn={{
                tablet: !!widget.style?.tablet?.hidden,
                phone: !!widget.style?.phone?.hidden,
              }}
              onPatch={patchWidgetStyle}
              onHide={(device, hidden) =>
                p.onSetWidgetStyle(withLayer(widget.style, device, { hidden: hidden ? true : undefined }))}
              onReset={() => p.onSetWidgetStyle(resetKeys(widget.style, ["align", "hidden"]))}
            />
          </>
        )}

        {/* ══ THE SECTION, always available under the widget's ══════════ */}
        <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={L}>This section</div>

          {/* ── LAYOUT ────────────────────────────────────────────────── */}
          <Group title="Layout" hint="How many columns, how they split, how wide they run" defaultOpen={!widget}
            onReset={() => p.onSetSectionStyle(section.id, resetKeys(section.style, ["columnWidths", "gap"]))}>
            <div style={FIELD}>
              <span style={L}>Label</span>
              <input style={INPUT} value={section.label || ""} title="Shown in the toolbar, and on the page when the section is numbered"
                onChange={(e) => p.onPatchSection(section.id, { label: e.target.value })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={FIELD}>
                <span style={L}>Columns</span>
                <select style={INPUT} value={section.layout} title="One, two or three columns side by side"
                  onChange={(e) => p.onPatchSection(section.id, { layout: Number(e.target.value) as 1 | 2 | 3 })}>
                  <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
                </select>
              </div>
              <div style={FIELD}>
                <span style={L}>Width</span>
                <select style={INPUT} value={section.width} title="How wide the content runs inside the page"
                  onChange={(e) => p.onPatchSection(section.id, { width: e.target.value as Section["width"] })}>
                  <option value="full">Full</option><option value="contained">Boxed</option><option value="narrow">Narrow</option>
                </select>
              </div>
            </div>
            <div style={FIELD}>
              <span style={L}>Split</span>
              <RatioPicker
                layout={section.layout}
                widths={sectionResolvedWidths(section)}
                onPick={(widths) =>
                  p.onSetSectionStyle(section.id, withLayer(section.style, "desktop", { columnWidths: widths }))}
              />
              <span style={{ fontSize: 10, color: "#94A3B8" }}>
                How the width is shared between the columns. On a phone they go under each other whatever you pick.
              </span>
            </div>
            <div style={FIELD}>
              <span style={L}>Gap between columns</span>
              <input type="number" style={INPUT} data-style-gap value={sectionLayer.gap ?? ""} placeholder="24"
                title="Space between the columns, in pixels."
                onChange={(e) => patchSectionStyle(
                  { gap: e.target.value === "" ? undefined : Number(e.target.value) }, "gap")} />
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
              title="Number this section on the page — 01, 02, 03. The numbers are worked out from the order, so moving a section renumbers both.">
              <input type="checkbox" data-section-numbered checked={!!section.numbered}
                onChange={(e) => p.onPatchSection(section.id, { numbered: e.target.checked })} />
              Number this section (01, 02, 03…)
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
              title="Put a Recommended badge on this section, so the reader knows which one you suggest">
              <input type="checkbox" data-section-recommended checked={!!section.recommended}
                onChange={(e) => p.onPatchSection(section.id, { recommended: e.target.checked })} />
              Mark as Recommended
            </label>
          </Group>

          {/* ── SPACING ───────────────────────────────────────────────── */}
          <SpacingGroup
            device={p.device}
            onDevice={p.onDevice}
            layer={sectionLayer}
            what="section"
            seedPadding={seedFromPadding(section.padding)}
            onPatch={patchSectionStyle}
            onReset={() => p.onSetSectionStyle(section.id, resetKeys(section.style, ["padding", "margin"]))}
          />

          {/* ── STYLE ─────────────────────────────────────────────────── */}
          <Group title="Style" hint="Background, edge, corners and shadow"
            onReset={() => p.onSetSectionStyle(section.id, resetKeys(section.style, ["border", "radius", "shadow", "minHeight"]))}>
            <div style={FIELD}>
              <span style={L}>Background</span>
              <Swatches value={section.background || ""} swatches={p.swatches}
                onPick={(v) => p.onPatchSection(section.id, { background: v })} />
            </div>
            {/* MOVED OFF THE CANVAS TOOLBAR (D-12, §11.10). The hover toolbar
                is now drag · up · down · duplicate · delete · settings, and
                every setting it used to carry lives here — one home each. */}
            <div style={FIELD}>
              <span style={L}>Text colour</span>
              <select style={INPUT} data-section-theme value={section.theme}
                title="Dark text on a light background, or light text on a dark one"
                onChange={(e) => p.onPatchSection(section.id, { theme: e.target.value as Section["theme"] })}>
                <option value="light">Dark text on light</option>
                <option value="dark">Light text on dark</option>
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={FIELD}>
                <span style={L}>Edge width</span>
                <input type="number" style={INPUT} data-style-border="width" value={sectionLayer.border?.width ?? ""} placeholder="none"
                  title="A line drawn around this section, in pixels. Empty means no line."
                  onChange={(e) => patchSectionStyle(
                    { border: { ...sectionLayer.border, width: e.target.value === "" ? undefined : Number(e.target.value) } }, "border")} />
              </div>
              <div style={FIELD}>
                <span style={L}>Edge style</span>
                <select style={INPUT} data-style-border="style" value={sectionLayer.border?.style ?? "solid"}
                  title="A solid line, a dashed one or a dotted one."
                  onChange={(e) => patchSectionStyle(
                    { border: { ...sectionLayer.border, style: e.target.value as any } }, "border")}>
                  <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
                </select>
              </div>
            </div>
            <div style={FIELD}>
              <span style={L}>Edge colour</span>
              <Swatches value={sectionLayer.border?.color || ""} swatches={p.swatches}
                onPick={(v) => patchSectionStyle({ border: { ...sectionLayer.border, color: v || undefined } }, "border")} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={FIELD}>
                <span style={L}>Rounded corners</span>
                <input type="number" style={INPUT} data-style-radius value={sectionLayer.radius ?? ""} placeholder="0"
                  title={isEmail
                    ? "Not in email — Outlook renders through Word and squares the corners off, so this is left out rather than promised."
                    : "How rounded the corners are, in pixels."}
                  disabled={isEmail}
                  onChange={(e) => patchSectionStyle({ radius: e.target.value === "" ? undefined : Number(e.target.value) }, "radius")} />
              </div>
              <div style={FIELD}>
                <span style={L}>Shadow</span>
                <select style={INPUT} data-style-shadow value={sectionLayer.shadow ?? "none"}
                  disabled={isEmail}
                  title={isEmail
                    ? "Not in email — a mailbox drops a shadow, so this is left out rather than promised."
                    : "A soft shadow lifts the section off the page."}
                  onChange={(e) => patchSectionStyle({ shadow: e.target.value === "none" ? undefined : e.target.value as any }, "shadow")}>
                  <option value="none">None</option><option value="soft">Soft</option><option value="strong">Strong</option>
                </select>
              </div>
            </div>
            {isEmail && (
              <div style={{ fontSize: 10, color: "#B45309", lineHeight: 1.45 }}>
                Rounded corners and shadows are <strong>not in email</strong>. Outlook renders through Word and drops
                both, so we leave them out rather than show you something your reader will not get.
              </div>
            )}
            <div style={FIELD}>
              <span style={L}>Least height</span>
              <input type="number" style={INPUT} data-style-minheight value={sectionLayer.minHeight ?? ""} placeholder="as tall as it needs"
                title="The shortest this section may be, in pixels. Useful for a band with a background picture."
                onChange={(e) => patchSectionStyle({ minHeight: e.target.value === "" ? undefined : Number(e.target.value) }, "minHeight")} />
            </div>
          </Group>

          {/* ── TYPOGRAPHY — the section's own heading font ────────────── */}
          {p.fonts.length > 0 && (
            <Group title="Typography" hint="The font the headings in this section are set in"
              onReset={() => p.onPatchSection(section.id, { headingFont: "" })}
              resetTitle="Back to the font the rest of the document uses">
              <div style={FIELD}>
                <span style={L}>Heading font</span>
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
            </Group>
          )}

          {/* ── PAGE ──────────────────────────────────────────────────── */}
          {/* Content has no reset on purpose: "back to the default" there means
              throwing away the words the author typed, and a single click with
              no confirmation is not how that should happen. Every group that
              owns STYLING resets; the one that owns content does not. */}
          <Group title="Page" hint="Where this sits when the document is printed, and who sees it"
            onReset={() => p.onPatchSection(section.id, { pageBreakBefore: false, visibility: "customer" })}
            resetTitle="Back to: no page break, and the customer sees it">
            {/* Only where there ARE pages. An email and a web page have none,
                and a control that cannot do anything is worse than a missing
                one — D-30. The adapter's own words, through copy.ts. */}
            {p.pageBreakLabel !== "" && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
                title="Start a new page here when this is printed or saved as a PDF">
                <input type="checkbox" checked={!!section.pageBreakBefore}
                  onChange={(e) => p.onPatchSection(section.id, { pageBreakBefore: e.target.checked })} />
                {p.pageBreakLabel || "Start a new page here"}
              </label>
            )}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
              title="Your crew sees this; the customer never does, and it is left out of the PDF">
              <input type="checkbox" checked={section.visibility === "internal"}
                onChange={(e) => p.onPatchSection(section.id, { visibility: e.target.checked ? "internal" : "customer" })} />
              Internal note only
            </label>
          </Group>
        </div>
      </div>

      <div style={{ marginTop: "auto", padding: "10px 16px", borderTop: "1px solid #E2E8F0", fontSize: 11, color: "#5A7A8A" }}>
        Changes show on the page as you make them.
      </div>
    </div>
  );
}

/**
 * The split a section is actually showing.
 *
 * Read from the DESKTOP layer, because a split is a layout decision and the
 * tablet and phone stack anyway — offering a per-device ratio would be a
 * control that does nothing on the two devices it names.
 */
function sectionResolvedWidths(section: Section): number[] | undefined {
  return layerFor(section.style, "desktop").columnWidths;
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

export { Sparkles, DeviceSegment };
export default Inspector;

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
 * ── THREE TABS (§11.13.1, D-165) ──────────────────────────────────────────
 * Brandon, 2026-09-19: *"I am fine with the settings on the right."* So the
 * panel stays where it is and takes the reference editor's own shape — the
 * three tabs it puts over EVERY element, with collapsible sections inside them
 * named as it names them:
 *
 *   a WIDGET     Content   · Style (Typography) · Advanced (Layout, Responsive)
 *   a BOX        Layout    · Style (edge)       · Advanced (Layout, Responsive)
 *   a SECTION    Layout    · Style, Typography  · Advanced (Layout, Page)
 *
 * A container's first tab is LAYOUT and not Content, because that is what the
 * reference calls it and the machine catalogue agrees to the letter: every
 * container section is `tab: "layout"`, every `common` advanced section is
 * `tab: "advanced"` with `_section_style` labelled "Layout".
 *
 * ── WHAT THE TABS REPLACED ────────────────────────────────────────────────
 * One scrolling column of every group at once, with the SECTION's five groups
 * repeated under the widget's four. Selecting a widget now shows that widget;
 * the section is reached by selecting the section — from its handle on the
 * page, or from the Structure window. That is the reference's rule and it is
 * why the panel no longer has two "Layout" groups arguing in one scroll.
 *
 * The controls themselves are in StyleGroups.tsx and the maths is in style.ts —
 * this file decides WHICH groups a selection gets, in WHICH tab, and nothing
 * else.
 *
 * The Desktop / Tablet / Phone segment inside Layout and Typography edits the
 * override for the device the CANVAS is previewing. ONE state, handed down from
 * BuilderShell: two would let an author edit the phone and watch the desktop.
 */
import { useState, type ReactNode } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import type { BuilderDocument, Node, Section, Selection, Widget } from "./model";
import { widgetAt } from "./model";
import { directionOf, isContainer } from "./treeOps";
import {
  WIDGETS_BY_KIND, controlOptions, controlSections, optionValue,
  widgetDescription, widgetLabel,
  type BuilderAdapter, type WidgetControl,
} from "./registry";
import {
  isTypographic, layerFor, resetKeys, seedFromPadding, withLayer,
  type Device, type ElementStyle, type ItemsSpec, type JustifySpec, type StyleLayer,
} from "./style";
import {
  AttributesGroup, DeviceSegment, Group, InspectorTabs, RatioPicker, ResponsiveGroup, SpacingGroup, TypographyGroup,
  FIELD, INPUT, L, type InspectorTab,
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
  adapter?: BuilderAdapter;
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

/**
 * What a box is CALLED at the top of the inspector.
 *
 * "Row", "Grid", "Box" — the same three words the outline uses, from the same
 * `directionOf`, because a thing called one name in the outline and another in
 * the inspector is two things as far as the author is concerned.
 */
function boxName(n: Node | null): string {
  const d = directionOf(n);
  return d === "row" ? "Row" : d === "grid" ? "Grid" : "Box";
}

export function Inspector(p: InspectorProps) {
  const { doc, selection } = p;
  /**
   * WHICH TAB.
   *
   * Kept across selections on purpose — the reference editor does the same,
   * and an author who is setting spacing on six things in a row should not be
   * put back on Content after every click. A tab with nothing behind it for
   * the new selection falls back to Content, which `shownTab` decides.
   */
  const [tab, setTab] = useState<InspectorTab>("content");

  if (!selection) {
    /* NOTHING SELECTED = PAGE SETTINGS (§11.13.1 item 2). The reference shows
       the document's own settings here rather than an empty panel, and the
       adapter's `documentExtras` is exactly that. */
    return (
      <div data-inspector="page" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflowY: "auto" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Page settings</div>
        </div>
        {p.documentExtras}
        <div style={{ padding: 16, fontSize: 12, color: "#5A7A8A" }}>
          <p style={{ lineHeight: 1.5 }}>
            Click anything on the page to change it here. Words are typed straight on the page.
          </p>
        </div>
      </div>
    );
  }

  const section = doc.sections.find((s) => s.id === selection.sectionId);
  if (!section) return null;

  // §11.12: by ID, so the inspector binds to a card inside a row inside a box.
  // Counting indexes into `columns[n].widgets` could only ever reach the top of
  // a column, which is where every selection used to be.
  const widget = selection.kind === "widget" ? widgetAt(doc, selection) : null;
  const box = isContainer(widget);
  const def = widget && !box ? WIDGETS_BY_KIND[widget.kind] : null;
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

  /** The name on the panel — "Edit <Widget name>", as the reference writes it. */
  const name = widget
    ? (box ? boxName(widget) : def ? widgetLabel(def, p.adapter) : widget.kind)
    : (section.label || "Section");

  /**
   * WHICH TABS HAVE ANYTHING BEHIND THEM.
   *
   * A box has no Typography of its own — it holds things, it does not say
   * anything — so its Style tab carries only its edge, which it does have.
   * A widget with no words has no Style tab at all, and the tab is GREYED
   * rather than removed: a row that changes width as the selection moves is a
   * row nobody can aim at.
   */
  const hasStyle = box || !widget || isTypographic(widget.kind);
  const disabled: InspectorTab[] = hasStyle ? [] : ["style"];
  const shownTab: InspectorTab = disabled.includes(tab) ? "content" : tab;

  return (
    <div data-inspector={widget ? (box ? "box" : "widget") : "section"}
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* `documentExtras` IS NOT DRAWN HERE (integration, 2026-09-19).
          It is PAGE settings, and page settings belong in the no-selection
          branch above — §11.13.1 item 2. Drawing it in both branches is why
          three adapters each wrote `documentExtras={selection ? null : …}` and
          kept a copy of the selection to do it with: one rule, written four
          times. The rule lives here now, once. */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }} data-inspector-title>Edit {name}</div>
        {p.askArgus}
      </div>

      <InspectorTabs tab={shownTab} onTab={setTab} first={widget && !box ? "Content" : "Layout"} disabled={disabled} />

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
        {widget && (
          <>
            {/* A BOX (§11.12, D-156) — its LAYOUT tab.

                A box has no Content and no Typography: it holds things, it does
                not say anything. What it HAS is a layout, and that is the whole
                of its first tab, because it is the reason the author put it
                there.

                Everything in the Advanced tab is the same for a box and for a
                widget and is written ONCE. Two padding controls for one padding
                is exactly the drift this file exists to stop. */}
            {box && shownTab === "content" && (
              <Group title="Layout" hint="Which way what is inside this box runs, and how far apart" defaultOpen
                onReset={() => p.onSetWidgetStyle(
                  resetKeys(widget.style, ["direction", "justify", "alignItems", "wrap", "columns", "gap", "minHeight"]))}>
                <DeviceSegment device={p.device} onDevice={p.onDevice} />
                <div style={FIELD}>
                  <span style={L}>Which way things run</span>
                  <select
                    style={INPUT}
                    data-box-direction
                    title="Top to bottom, side by side, or in even columns. You can say something different for phones."
                    value={widgetLayer.direction || "column"}
                    onChange={(e) => {
                      const v = e.target.value as "row" | "column" | "grid";
                      patchWidgetStyle({
                        direction: v === "column" ? undefined : v,
                        columns: v === "grid" ? (widgetLayer.columns ?? 3) : undefined,
                      }, "direction");
                    }}
                  >
                    <option value="column">Stacked, top to bottom</option>
                    <option value="row">Side by side</option>
                    <option value="grid">Even columns</option>
                  </select>
                </div>

                {widgetLayer.direction === "grid" && (
                  <div style={FIELD}>
                    <span style={L}>How many columns</span>
                    <input
                      style={INPUT} type="number" min={1} max={12} data-box-columns
                      title="How many even columns the things inside sit in"
                      value={widgetLayer.columns ?? 3}
                      onChange={(e) => patchWidgetStyle(
                        { columns: Math.max(1, Math.min(12, Number(e.target.value) || 1)) }, "columns")}
                    />
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={FIELD}>
                    <span style={L}>Along that way</span>
                    <select style={INPUT} data-box-justify value={widgetLayer.justify || "start"}
                      title="Where the things sit along the direction they run in"
                      onChange={(e) => patchWidgetStyle(
                        { justify: e.target.value === "start" ? undefined : e.target.value as JustifySpec }, "justify")}>
                      <option value="start">At the start</option>
                      <option value="center">In the middle</option>
                      <option value="end">At the end</option>
                      <option value="between">Spread out</option>
                    </select>
                  </div>
                  <div style={FIELD}>
                    <span style={L}>Across it</span>
                    <select style={INPUT} data-box-align value={widgetLayer.alignItems || "stretch"}
                      title="Whether the things fill the box across, or line up at one edge"
                      onChange={(e) => patchWidgetStyle(
                        { alignItems: e.target.value === "stretch" ? undefined : e.target.value as ItemsSpec }, "alignItems")}>
                      <option value="stretch">Fill the box</option>
                      <option value="start">At the top or left</option>
                      <option value="center">In the middle</option>
                      <option value="end">At the bottom or right</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={FIELD}>
                    <span style={L}>Space between them</span>
                    <input style={INPUT} type="number" min={0} data-box-gap
                      title="The gap between the things inside this box, in pixels"
                      value={widgetLayer.gap ?? ""} placeholder="0"
                      onChange={(e) => patchWidgetStyle(
                        { gap: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) }, "gap")} />
                  </div>
                  <div style={FIELD}>
                    <span style={L}>Least height</span>
                    <input style={INPUT} type="number" min={0} data-box-minheight
                      title="The box is at least this tall, whatever is in it"
                      value={widgetLayer.minHeight ?? ""} placeholder="auto"
                      onChange={(e) => patchWidgetStyle(
                        { minHeight: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) }, "minHeight")} />
                  </div>
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
                  title="When there is not enough room, let them carry on to a second line rather than squeezing">
                  <input type="checkbox" data-box-wrap checked={!!widgetLayer.wrap}
                    onChange={(e) => patchWidgetStyle({ wrap: e.target.checked ? true : undefined }, "wrap")} />
                  Let them wrap onto a second line
                </label>

                {/* WHAT THE BOX IS DRAWN AS — `props.html_tag` (conformance,
                    2026-09-17).

                    The renderer has honoured this since stream C and NOTHING
                    could set it, so the only way to have a page's main region
                    be a `<main>` was to hand-edit the document. It is on the
                    box's props rather than its style because it is the same on
                    every device: a `<header>` does not become a `<div>` on a
                    phone. That is also the ONE Elementor-spelled key the
                    engine reads, and it keeps that name so the publish is a
                    pass-through. */}
                <div style={FIELD}>
                  <span style={L}>What this box is, to a screen reader</span>
                  <select style={INPUT} data-box-html-tag
                    title="Most boxes are just boxes. Say what this one is and a screen reader, and search, can tell."
                    value={String((widget.props as any)?.html_tag ?? "")}
                    onChange={(e) => p.onPatchWidget({ html_tag: e.target.value })}>
                    <option value="">Just a box</option>
                    <option value="header">The top of the page</option>
                    <option value="main">The main part of the page</option>
                    <option value="section">A section of the page</option>
                    <option value="article">A whole article</option>
                    <option value="aside">Something to one side</option>
                    <option value="footer">The bottom of the page</option>
                  </select>
                </div>
              </Group>
            )}

            {/* THE BOX'S OWN EDGE — the same three controls a section wears,
                reading and writing the same keys through the same style.ts.
                The reference calls this section Border and puts it on Style. */}
            {box && shownTab === "style" && (
              <Group title="Border" hint="The edge round this box, and its corners" defaultOpen
                onReset={() => p.onSetWidgetStyle(resetKeys(widget.style, ["border", "radius", "shadow"]))}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={FIELD}>
                    <span style={L}>Edge</span>
                    <input style={INPUT} type="number" min={0} data-box-border
                      title="How thick the line round this box is, in pixels"
                      value={widgetLayer.border?.width ?? ""} placeholder="none"
                      onChange={(e) => patchWidgetStyle({
                        border: e.target.value === ""
                          ? undefined
                          : { ...(widgetLayer.border || {}), width: Math.max(0, Number(e.target.value) || 0) },
                      }, "border")} />
                  </div>
                  <div style={FIELD}>
                    <span style={L}>Rounded corners</span>
                    <input style={INPUT} type="number" min={0} data-box-radius
                      title="How round the corners of this box are, in pixels"
                      value={widgetLayer.radius ?? ""} placeholder="0"
                      onChange={(e) => patchWidgetStyle(
                        { radius: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) }, "radius")} />
                  </div>
                </div>
              </Group>
            )}

            {/* ── CONTENT — everything that was here before ─────────────── */}
            {!box && shownTab === "content" && (
            <Group title="Content" hint="What this shows, and where it comes from" defaultOpen>
              {def && widgetDescription(def, p.adapter) && (
                <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.45 }}>{widgetDescription(def, p.adapter)}</div>
              )}

              {p.widgetExtras?.(widget, section.id)}

              {/* THE COUNT CONTROL WAS HERE AND IS DELETED (D-156, item 4).

                  It had THREE homes — the pane, the picker and this — and this
                  one was found by DRIVING the builder rather than by reading
                  it: a Key facts widget dropped into a row still showed "HOW
                  MANY FACTS? 2 3 4 5 6 7 8 9 10" on the right.

                  Nothing is lost. The list control below already adds and
                  removes a row where the author can see it, which is the whole
                  point of the change: a number typed into a panel before the
                  thing exists is not something anybody can answer, and it only
                  existed because a composite's cards could not be changed
                  afterwards. They can. */}

              {/* Standard controls that are NOT words: toggles, selects, colours,
                  and the code box. Grouped into the widget's own PANEL SECTIONS
                  (registry `controlSections`) — the catalogue names a price
                  table's five Heading · Pricing · Features · Footer · Ribbon,
                  and an author who has built a pricing card anywhere expects
                  those five in that order.

                  A section whose controls are all WORDS draws no heading,
                  because words are typed on the page: that is the engine's one
                  editing mechanism and a panel field beside it would be a
                  second one. `hidden` controls draw nothing at all — they are
                  declared so the Binding section can be read as a whole. */}
              {controlSections(def?.controls || []).map((grp) => {
                const shown = grp.controls.filter((c) => PANEL_CONTROL_TYPES.has(c.type));
                if (!shown.length) return null;
                return (
                  <div key={grp.section ?? "_"} data-control-section={grp.section ?? ""}>
                    {grp.section && (
                      <div style={{ ...L, marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
                        {grp.section}
                      </div>
                    )}
                    {shown.map((c) => (
                <div key={c.key} style={FIELD}>
                  <span style={L}>{c.label}</span>
                  {c.type === "toggle" && (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <input type="checkbox" checked={isOn((widget.props as any)[c.key])}
                        onChange={(e) => p.onPatchWidget({ [c.key]: e.target.checked })} />
                      {c.help || "On"}
                    </label>
                  )}
                  {c.type === "select" && (controlOptions(c).length ? (
                    <select style={INPUT} value={String((widget.props as any)[c.key] ?? "")}
                      onChange={(e) => p.onPatchWidget({ [c.key]: optionValue(c, e.target.value) })}>
                      {controlOptions(c).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                  {/* A CODE BOX WITH A LIVE PREVIEW. The box is monospace and
                      does not wrap words in the middle of a tag; the preview
                      under it is the same markup the page will carry, drawn
                      here so the author sees what they pasted before anybody
                      else does. */}
                  {c.type === "code" && (
                    <>
                      <textarea
                        style={{ ...INPUT, minHeight: 120, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, whiteSpace: "pre", overflowWrap: "normal" }}
                        data-code-box={c.key}
                        spellCheck={false}
                        placeholder="<div>Paste your own HTML here</div>"
                        value={String((widget.props as any)[c.key] ?? "")}
                        onChange={(e) => p.onPatchWidget({ [c.key]: e.target.value })} />
                      <span style={{ fontSize: 10, color: "#5A7A8A" }}>What it looks like</span>
                      <div
                        data-code-preview={c.key}
                        style={{ border: "1px solid #E2E8F0", borderRadius: 4, padding: 8, background: "#fff", overflow: "auto", maxHeight: 220 }}
                        dangerouslySetInnerHTML={{ __html: String((widget.props as any)[c.key] ?? "") }} />
                    </>
                  )}
                  {c.help && c.type !== "toggle" && <span style={{ fontSize: 10, color: "#94A3B8" }}>{c.help}</span>}
                </div>
                    ))}
                  </div>
                );
              })}

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
            )}

            {/* ── STYLE ▸ TYPOGRAPHY — only where there are words to set ── */}
            {!box && shownTab === "style" && isTypographic(widget.kind) && (
              <TypographyGroup
                device={p.device}
                onDevice={p.onDevice}
                layer={widgetLayer}
                fonts={p.fonts}
                onPatch={patchWidgetStyle}
                onReset={() => p.onSetWidgetStyle(resetKeys(widget.style, ["typography"]))}
              />
            )}

            {/* ── ADVANCED ▸ LAYOUT and RESPONSIVE ─────────────────────── */}
            {shownTab === "advanced" && (
              <>
                <SpacingGroup
                  device={p.device}
                  onDevice={p.onDevice}
                  layer={widgetLayer}
                  what="widget"
                  align={!box}
                  onPatch={patchWidgetStyle}
                  onReset={() => p.onSetWidgetStyle(resetKeys(widget.style, ["padding", "margin", "align"]))}
                />
                <ResponsiveGroup
                  hiddenOn={{
                    tablet: !!widget.style?.tablet?.hidden,
                    phone: !!widget.style?.phone?.hidden,
                  }}
                  onHide={(device, hidden) =>
                    p.onSetWidgetStyle(withLayer(widget.style, device, { hidden: hidden ? true : undefined }))}
                  onReset={() => p.onSetWidgetStyle(resetKeys(widget.style, ["hidden"]))}
                />
                {/* §11.13.1's third Advanced section. NOT per device — an id is
                    an id on every screen — so it is written on the element's own
                    style and never through `withLayer`. */}
                <AttributesGroup
                  cssId={String(widget.style?.cssId ?? "")}
                  cssClasses={String(widget.style?.cssClasses ?? "")}
                  onPatch={(patch) => p.onSetWidgetStyle({ ...(widget.style || {}), ...patch })}
                  onReset={() => {
                    /* NOT `resetKeys`: that one clears a key on every DEVICE
                       layer, and these two are not per device. Cleared where
                       they actually live, on the element's own style. */
                    const { cssId: _a, cssClasses: _b, ...rest } = widget.style || {};
                    p.onSetWidgetStyle(Object.keys(rest).length ? rest : undefined);
                  }}
                />
              </>
            )}
          </>
        )}

        {/* ══ THE SECTION — only when the SECTION is what is selected ═════
            §11.13.1: the reference shows the element you clicked and nothing
            else. Repeating the section's five groups under every widget's
            four is what made this panel a scroll rather than a panel, and it
            put two groups called "Layout" in one column. The section is
            reached from its own handle on the page, or from Structure. */}
        {!widget && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* ── LAYOUT ────────────────────────────────────────────────── */}
          {shownTab === "content" && (
          <Group title="Layout" hint="How many columns, how they split, how wide they run" defaultOpen
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
          )}

          {/* ── ADVANCED ▸ LAYOUT ─────────────────────────────────────── */}
          {shownTab === "advanced" && (
          <SpacingGroup
            device={p.device}
            onDevice={p.onDevice}
            layer={sectionLayer}
            what="section"
            seedPadding={seedFromPadding(section.padding)}
            onPatch={patchSectionStyle}
            onReset={() => p.onSetSectionStyle(section.id, resetKeys(section.style, ["padding", "margin"]))}
          />
          )}

          {/* ── STYLE ─────────────────────────────────────────────────── */}
          {shownTab === "style" && (
          <Group title="Background" hint="Background, edge, corners and shadow" defaultOpen
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
          )}

          {/* ── TYPOGRAPHY — the section's own heading font ────────────── */}
          {shownTab === "style" && p.fonts.length > 0 && (
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
          {shownTab === "advanced" && (
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
          )}
        </div>
        )}
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

/* `optionKey` and `optionValue` LIVED HERE and are now `registry.ts`'s, beside
   the controls that declare the options. Two copies of "what got saved" is two
   answers, and the registry is the one a test can pin against the machine
   files without rendering a panel. */

/**
 * The control types the PANEL draws.
 *
 * Everything else is either typed on the page (`text`, `textarea`, `richtext`,
 * `list`, `money`, `merge` - the engine's one editing mechanism) or carried by
 * the widget and never typed at all (`hidden`).
 */
const PANEL_CONTROL_TYPES: ReadonlySet<WidgetControl["type"]> = new Set([
  "toggle", "select", "colour", "number", "image", "link", "code",
]);

/**
 * Is a switch ON? Elementor's switcher stores the string "yes"; a checkbox
 * writes a boolean. ONE reader, because "yes" is truthy and `false` is not,
 * and a control that reads only one of the two silently loses the other.
 */
function isOn(v: unknown): boolean {
  return v === true || v === "yes";
}

export { Sparkles, DeviceSegment };
export default Inspector;

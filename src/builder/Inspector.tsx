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
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignHorizontalSpaceBetween, AlignStartHorizontal, AlignStartVertical, ArrowDown,
  ArrowRight, LayoutGrid, MoveHorizontal, Sparkles, StretchHorizontal, WrapText,
} from "lucide-react";
import type { BuilderDocument, Node, Section, Selection, Widget } from "./model";
import { widgetAt } from "./model";
import { directionOf, isContainer } from "./treeOps";
import {
  WIDGETS_BY_KIND, controlOptions, controlSections, controlTab, optionValue,
  widgetDescription, widgetLabel,
  type BuilderAdapter, type ControlTab, type WidgetControl,
} from "./registry";
/* THE PANEL, DRAWN FROM THE DEFINITION ALONE — B-168 §C.1. */
import { DefinitionControls } from "./definitionControls";
import {
  isTypographic, layerFor, resetKeys, seedFromPadding, withLayer,
  type Device, type ElementStyle, type ItemsSpec, type JustifySpec, type StyleLayer,
} from "./style";
import {
  AttributesGroup, ContainerAdvancedGroups, ContainerStyleGroups,
  DeviceSegment, Group, IconChoice, INSPECTOR_TABS, InspectorTabs, RatioPicker,
  ResponsiveGroup, SpacingGroup, TypographyGroup,
  Swatches, miniBtn,
  FIELD, INPUT, L, ROW, type InspectorTab,
} from "./StyleGroups";

export interface InspectorSlots {
  /** Rendered inside the selected widget's panel, above the standard controls. */
  widgetExtras?: (w: Widget, sectionId: string) => ReactNode;
  /* THE GOLD Ask ARGUS BUTTON IN THIS HEADER IS DELETED (D-172). The
     reference editor has ONE door to its AI, in the top bar; we had three.
     The bar's is the one that stays, so the slot is gone rather than
     emptied — an empty slot is how the second button comes back. */
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
 * What a box is CALLED at the top of the inspector: **Container**.
 *
 * "Container" or "Grid" — Elementor's two words, the same ones the outline uses, from the same
 * `directionOf`, because a thing called one name in the outline and another in
 * the inspector is two things as far as the author is concerned.
 */
function boxName(n: Node | null): string {
  const d = directionOf(n);
  return d === "grid" ? "Grid" : "Container";
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
        {/* THE COACHING SENTENCE IS DELETED (D-172). The reference panels
            carry no such line. */}
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
  /* A TOP-LEVEL SECTION IS A CONTAINER ON THE SCREEN (D-172).
     The reference has ONE kind of box and calls it Container; the panel over a
     section used to read "Edit Scope of work" or, with no label, "Edit
     Section" — a word the reference never puts in front of a client. The
     STORED model is untouched: what the author is editing is still
     `doc.sections[n]`, and the PDF, the email and the publisher all still read
     it as a section. Only the name on the panel changes. */
  const name = widget
    ? (box ? boxName(widget) : def ? widgetLabel(def, p.adapter) : widget.kind)
    : "Container";

  /**
   * WHICH TABS HAVE ANYTHING BEHIND THEM.
   *
   * A box has no Typography of its own — it holds things, it does not say
   * anything — so its Style tab carries only its edge, which it does have.
   * A widget with no words has no Style tab at all, and the tab is GREYED
   * rather than removed: a row that changes width as the selection moves is a
   * row nobody can aim at.
   */
  /* …and a widget whose DEFINITION puts controls on the Style tab has one
     too (B-168 §C.1). Before this, `isTypographic` was the only way a Style
     tab could exist, so a family widget with a Style section and no words
     would have declared controls nobody could reach. */
  const hasDefTab = (t: ControlTab) => (def?.controls || []).some((c) => controlTab(c) === t);
  const hasStyle = box || !widget || isTypographic(widget.kind) || hasDefTab("style");
  /* A WIDGET WITH NO STYLE CONTROLS HAS NO STYLE TAB (D-172).
     The reference's Spacer has Content and Advanced and nothing between them;
     ours drew a greyed third tab, and pressing it re-rendered the Content
     section under a Style heading — the same header, the same fields. A greyed
     tab was the old answer ("a row that changes width is a row nobody can aim
     at"); driving it showed the worse half, which is a tab that lies about what
     is behind it. */
  const tabs: InspectorTab[] = hasStyle ? INSPECTOR_TABS : ["content", "advanced"];
  const shownTab: InspectorTab = tabs.includes(tab) ? tab : "content";

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
      </div>

      <InspectorTabs tab={shownTab} onTab={setTab} first={widget && !box ? "Content" : "Layout"} tabs={tabs} />

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
            {/* A BOX'S LAYOUT TAB — the reference's Container · Items ·
                Additional Options, drawn from the container family's own
                control table (`widgets/families/container/controls.ts`).
                This block USED TO BE WRITTEN OUT HERE with five of the
                reference's fifteen controls; it is `ContainerLayoutGroup` in
                StyleGroups.tsx now and the other ten came with it. Moved, not
                copied — replace means delete. */}
            {box && shownTab === "content" && (
              <Group title="Container" hint="Which way what is inside this box runs, and how far apart" defaultOpen
                onReset={() => p.onSetWidgetStyle(
                  resetKeys(widget.style, ["direction", "justify", "alignItems", "wrap", "columns", "gap", "minHeight"]))}>
                {/* THE BARE DEVICE ROW IS DELETED (D-172, round 2). The
                    Container section's FIRST row was three unlabelled device
                    glyphs attached to no control — a switcher floating above
                    six settings, only two of which are responsive at all. The
                    reference has no such row anywhere in its panel: the
                    switcher belongs ON the label of the control being set,
                    which is where Gaps and Min Height already carry it. */}
                {/* DIRECTION — the reference's four icon buttons (D-172).
                    Ours was a select reading "Stacked, top to bottom" / "Side
                    by side" / "Even columns" under a label reading WHICH WAY
                    THINGS RUN. The reference's row-reverse and column-reverse
                    are not offered because the renderer does not emit them;
                    the three that ARE offered wear its glyphs and its name. */}
                <div style={ROW}>
                  <span style={L}>Direction</span>
                  <IconChoice
                    name="Direction"
                    testAttr="data-box-direction"
                    value={(widgetLayer.direction || "column") as "row" | "column" | "grid"}
                    onPick={(v) => {
                      const next = v || "column";
                      patchWidgetStyle({
                        direction: next === "column" ? undefined : next,
                        columns: next === "grid" ? (widgetLayer.columns ?? 3) : undefined,
                      }, "direction");
                    }}
                    options={[
                      { v: "column" as const, title: "Column", icon: <ArrowDown size={13} /> },
                      { v: "row" as const, title: "Row", icon: <ArrowRight size={13} /> },
                      { v: "grid" as const, title: "Grid", icon: <LayoutGrid size={13} /> },
                    ]}
                  />
                </div>

                {widgetLayer.direction === "grid" && (
                  <div style={ROW}>
                    <span style={L}>Columns</span>
                    <input
                      style={INPUT} type="number" min={1} max={12} data-box-columns
                      title="How many even columns the things inside sit in"
                      value={widgetLayer.columns ?? 3}
                      onChange={(e) => patchWidgetStyle(
                        { columns: Math.max(1, Math.min(12, Number(e.target.value) || 1)) }, "columns")}
                    />
                  </div>
                )}

                {/* JUSTIFY CONTENT — the reference's five, including the three
                    spacing ones ours had no answer for at all. */}
                <div style={ROW}>
                  <span style={L}>Justify Content</span>
                  <IconChoice
                    name="Justify Content"
                    testAttr="data-box-justify"
                    value={(widgetLayer.justify || "start") as JustifySpec}
                    onPick={(v) => patchWidgetStyle(
                      { justify: !v || v === "start" ? undefined : v }, "justify")}
                    options={[
                      { v: "start" as JustifySpec, title: "Start", icon: <AlignStartVertical size={13} /> },
                      { v: "center" as JustifySpec, title: "Center", icon: <AlignCenterVertical size={13} /> },
                      { v: "end" as JustifySpec, title: "End", icon: <AlignEndVertical size={13} /> },
                      { v: "between" as JustifySpec, title: "Space Between", icon: <AlignHorizontalSpaceBetween size={13} /> },
                    ]}
                  />
                </div>

                <div style={ROW}>
                  <span style={L}>Align Items</span>
                  <IconChoice
                    name="Align Items"
                    testAttr="data-box-align"
                    value={(widgetLayer.alignItems || "stretch") as ItemsSpec}
                    onPick={(v) => patchWidgetStyle(
                      { alignItems: !v || v === "stretch" ? undefined : v }, "alignItems")}
                    options={[
                      { v: "start" as ItemsSpec, title: "Start", icon: <AlignStartHorizontal size={13} /> },
                      { v: "center" as ItemsSpec, title: "Center", icon: <AlignCenterHorizontal size={13} /> },
                      { v: "end" as ItemsSpec, title: "End", icon: <AlignEndHorizontal size={13} /> },
                      { v: "stretch" as ItemsSpec, title: "Stretch", icon: <StretchHorizontal size={13} /> },
                    ]}
                  />
                </div>

                {/* GAPS and MIN HEIGHT — the reference's names, and the device
                    switcher on the control rather than in a row above it. */}
                <div style={ROW}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={L}>Gaps</span>
                    <DeviceSegment device={p.device} onDevice={p.onDevice} />
                  </span>
                  <input style={INPUT} type="number" min={0} data-box-gap
                    title="The gap between the things inside this box, in pixels"
                    value={widgetLayer.gap ?? ""} placeholder="0"
                    onChange={(e) => patchWidgetStyle(
                      { gap: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) }, "gap")} />
                </div>
                <div style={ROW}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={L}>Min Height</span>
                    <DeviceSegment device={p.device} onDevice={p.onDevice} />
                  </span>
                  <input style={INPUT} type="number" min={0} data-box-minheight
                    title="The box is at least this tall, whatever is in it"
                    value={widgetLayer.minHeight ?? ""} placeholder="auto"
                    onChange={(e) => patchWidgetStyle(
                      { minHeight: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) }, "minHeight")} />
                </div>

                {/* WRAP — the reference's two icon buttons, not a checkbox with
                    a sentence for a label. */}
                <div style={ROW}>
                  <span style={L}>Wrap</span>
                  <IconChoice
                    name="Wrap"
                    testAttr="data-box-wrap"
                    value={widgetLayer.wrap ? "wrap" : "nowrap"}
                    onPick={(v) => patchWidgetStyle({ wrap: v === "wrap" ? true : undefined }, "wrap")}
                    options={[
                      { v: "nowrap" as const, title: "No Wrap", icon: <MoveHorizontal size={13} /> },
                      { v: "wrap" as const, title: "Wrap", icon: <WrapText size={13} /> },
                    ]}
                  />
                </div>

              </Group>
            )}

            {/* HTML TAG, IN ITS OWN SECTION (D-172).

                The reference's container Layout tab ends with a section called
                "Additional Options" holding HTML Tag -- measured in the live
                editor on 2026-09-19. Ours had a seven-option select inside
                Layout labelled "WHAT THIS BOX IS, TO A SCREEN READER", which is
                our own control, with our own words, in the wrong section. Same
                prop, same renderer, the reference's name and place. */}
            {box && shownTab === "content" && (
              <Group title="Additional Options" hint="What this box is drawn as in the page's HTML">
                <div style={ROW}>
                  <span style={L}>HTML Tag</span>
                  <select style={INPUT} data-box-html-tag
                    title="Most boxes are a div. Say what this one is and a screen reader, and search, can tell."
                    value={String((widget.props as any)?.html_tag ?? "")}
                    onChange={(e) => p.onPatchWidget({ html_tag: e.target.value })}>
                    <option value="">div</option>
                    <option value="header">header</option>
                    <option value="main">main</option>
                    <option value="section">section</option>
                    <option value="article">article</option>
                    <option value="aside">aside</option>
                    <option value="footer">footer</option>
                  </select>
                </div>
              </Group>
            )}

            {/* THE BOX'S STYLE TAB — Background · Background Overlay · Border ·
                Shape Divider, the reference's own four sections. The Border
                group was here with two of its five controls; it moved into
                `ContainerStyleGroups` with the other three and the three
                sections that were missing entirely. */}
            {box && shownTab === "style" && (
              <ContainerStyleGroups
                device={p.device}
                onDevice={p.onDevice}
                layer={widgetLayer}
                swatches={p.swatches}
                isEmail={isEmail}
                onPatch={patchWidgetStyle}
                onReset={(keys) => p.onSetWidgetStyle(resetKeys(widget.style, keys))}
              />
            )}

            {/* ── CONTENT — everything that was here before ─────────────── */}
            {/* NAMED AFTER THE WIDGET (D-172). The reference calls a widget's
                first section by the widget's own name — Heading, Image, Button,
                Divider, Spacer, Icon — not "Content"; "Content" is the TAB. */}
            {!box && shownTab === "content" && (
            <Group title={def ? widgetLabel(def, p.adapter) : "Content"}
              hint="What this shows, and where it comes from" defaultOpen>
              {/* THE WIDGET'S DESCRIPTION IS NOT DRAWN HERE (D-172). No
                  descriptive paragraph appears anywhere in the reference's
                  panel; the sentence is the TILE'S TOOLTIP in the left panel,
                  which is where a description belongs and where it already is
                  (WidgetPane, `widgetTooltip`). The registry keeps the text --
                  this stops the panel printing it under every section header. */}

              {p.widgetExtras?.(widget, section.id)}

              {/* THE COUNT CONTROL WAS HERE AND IS DELETED (D-156, item 4).

                  It had THREE homes — the pane, the old pop-up and this — and this
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
              {/* THE DEFINITION DRAWS THE PANEL (B-168 §C.1). This block used
                  to be written out here; it is `definitionControls.tsx` now,
                  called on all three tabs, so a family that adds a widget adds
                  no line to this file. */}
              <DefinitionControls def={def} tab="content" props={widget.props as any}
                device={p.device} swatches={p.swatches} onPatch={p.onPatchWidget} />

              {/* UP / DOWN / REMOVE WERE HERE AND ARE DELETED (D-172).
                  Nothing like that row is in the reference panel: order is a
                  drag or the Structure window, and deleting is right-click.
                  Keeping them here was a second home for verbs the menu
                  already owns. What stays is the ONE thing the panel has to
                  say, which is WHY a locked part cannot be removed. */}
              {widget.locked && (
                <div style={{ fontSize: 10, color: "#B45309", lineHeight: 1.45 }}>
                  Required on every marketing email. Edit the wording on the page; it stays where it is.
                </div>
              )}
            </Group>
            )}

            {/* ── STYLE and ADVANCED, FROM THE DEFINITION (B-168 §C.1) ────
                The machine file says which tab every Elementor control is on,
                a family copies that onto its def, and this draws it there. No
                per-widget code, and nothing a family adds needs a line here. */}
            {!box && shownTab !== "content" && (
              <DefinitionControls def={def} tab={shownTab} props={widget.props as any}
                device={p.device} swatches={p.swatches} onPatch={p.onPatchWidget} />
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
                  /* A BOX gets the other five the reference puts in this same
                     Advanced ▸ Layout section — Size, Align Self, Order,
                     Position, Z-Index — inside this group and not beside it. */
                  box={box}
                  onPatch={patchWidgetStyle}
                  onReset={() => p.onSetWidgetStyle(resetKeys(widget.style,
                    ["padding", "margin", "align", "selfWidth", "alignSelf", "order", "position", "zIndex"]))}
                />
                {/* MOTION EFFECTS SITS HERE, between Layout and Responsive,
                    because that is the reference editor's own order on this
                    tab: Layout · Motion Effects · Transform · Responsive ·
                    Attributes · Custom CSS. */}
                {box && (
                  <ContainerAdvancedGroups style={widget.style} onStyle={p.onSetWidgetStyle} only="motion" />
                )}
                <ResponsiveGroup
                  hiddenOn={{
                    desktop: !!widget.style?.hidden,
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
                {/* …and CUSTOM CSS last, which is where the reference puts it
                    and where an author expects the escape hatch to be. Neither
                    it nor Sticky is per device, so neither goes through
                    `withLayer`. */}
                {box && (
                  <ContainerAdvancedGroups style={widget.style} onStyle={p.onSetWidgetStyle} only="css" />
                )}
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
          <Group title="Container" hint="How wide the content runs inside the page" defaultOpen
            onReset={() => p.onSetSectionStyle(section.id, resetKeys(section.style, ["columnWidths", "gap"]))}>
            {/* LABEL, COLUMNS, SPLIT and GAP BETWEEN COLUMNS WERE HERE AND ARE
                DELETED (D-172).

                The reference's container has Direction, Justify Content, Align
                Items and Gaps — and NO column count, because a column IS a
                child container. It has no name field on the canvas either, so
                a LABEL text box holding the word "Section" was ours twice over:
                our own control for our own word.

                WIDTH stays: the reference's Content Width is the same idea. */}
            <div style={ROW}>
              <span style={L}>Width</span>
              <select style={INPUT} value={section.width} title="How wide the content runs inside the page"
                onChange={(e) => p.onPatchSection(section.id, { width: e.target.value as Section["width"] })}>
                <option value="full">Full</option><option value="contained">Boxed</option><option value="narrow">Narrow</option>
              </select>
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
            <div style={ROW}>
              {/* "Min Height", the reference's name (D-172). "Least height" was
                  ours, and the same control on a container already says it. */}
              <span style={L}>Min Height</span>
              <input type="number" style={INPUT} data-style-minheight value={sectionLayer.minHeight ?? ""} placeholder="auto"
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

      {/* THE FOOTER SENTENCE — "Changes show on the page as you make them."
          — IS DELETED (D-172). No footer sentence in the reference panel. */}
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

/* `miniBtn` and `Swatches` LIVED HERE and are now `StyleGroups.tsx`'s (B-168).
   `definitionControls.tsx` draws a family's `colour` control and needs the same
   swatch row this panel uses; two copies would be two answers to "what colours
   may I pick". Moved, not copied — replace means delete. */

/* `optionKey` and `optionValue` LIVED HERE and are now `registry.ts`'s, beside
   the controls that declare the options. Two copies of "what got saved" is two
   answers, and the registry is the one a test can pin against the machine
   files without rendering a panel. */

/* `PANEL_CONTROL_TYPES` and `isOn` LIVED HERE and are now
   `definitionControls.tsx`'s, beside the only code that draws a control from a
   definition. Moved, not copied (B-168). */

export { Sparkles, DeviceSegment };
export default Inspector;

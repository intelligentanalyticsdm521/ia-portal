/**
 * builder/StyleGroups.tsx — the inspector's Elementor-shaped groups.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §11.8 (D-140).
 *
 * ── WHY THESE ARE NOT IN Inspector.tsx ────────────────────────────────────
 * The inspector's job is "bind to the selection". These are the CONTROLS a
 * style group is made of — a four-box spacing pad with a link toggle, a device
 * segment, a collapsible group with a reset. Both a widget and a section use
 * every one of them, and a second copy of the spacing pad (one for sections,
 * one for widgets) is exactly the duplication this scope exists to delete.
 *
 * Every control carries a tooltip in plain words. Not decoration: SD-010 says
 * so, and "Letter spacing" means nothing to somebody who sells snow removal.
 *
 * The maths is NOT here. `setSide`, `sidesAreLinked`, `withLayer`, `resetKeys`
 * and the ratio presets all live in style.ts, pure, so `node --test` drives
 * them without a DOM.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ChevronDown, ChevronRight, Contrast, Link2,
  Monitor, Pencil, Settings2, Smartphone, Tablet, Unlink,
} from "lucide-react";
import {
  RATIO_PRESETS, SHAPE_DIVIDERS, normaliseRatios, setSide, sidesAreLinked, unitsOffered,
  type BackgroundSpec, type BoxSides, type Device, type ElementStyle,
  type OverlaySpec, type ShapeDividerSpec, type SizeUnit, type StyleLayer, type UnitLabel,
} from "./style";
import { PREVIEW_DEVICES } from "./responsive";
import {
  CONTAINER_LAYOUT_CONTROLS, CONTAINER_STYLE_CONTROLS, CONTAINER_ADVANCED_CONTROLS,
} from "./widgets/families/container";

/**
 * A CONTROL'S LABEL (D-172).
 *
 * Measured in the reference: 12px, sentence case, `text-transform: none`. Ours
 * was 10px UPPERCASE with letter-spacing, which is a heading's treatment on
 * every field in the panel.
 */
const L: React.CSSProperties = {
  fontSize: 12, fontWeight: 400, color: "#515962",
};

/**
 * A CONTROL ROW: label LEFT, control RIGHT (D-172).
 *
 * `elementor-label-inline` on the reference's selects and icon-button groups.
 * Ours stacked the label above a full-width control, which is twice the height
 * for every row in a 300px panel. A slider stays stacked, because the
 * reference marks those `elementor-label-block`.
 */
const ROW: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.25fr)",
  alignItems: "center", columnGap: 8, rowGap: 4,
};
const INPUT: React.CSSProperties = {
  border: "1px solid #CBD5E1", borderRadius: 4, padding: "6px 8px", fontSize: 12, background: "#fff",
  color: "#0B1C24", width: "100%",
};
const FIELD: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

/* ══════════════════════════════════════════════════════════════════════════
   The three tabs (§11.13.1, D-165)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Content / Style / Advanced — the three the reference editor puts over every
 * element's settings, looked at on 2026-09-19 and confirmed against the
 * machine catalogue (`BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`, where
 * every control carries `tab: "content" | "style" | "advanced"`).
 *
 * A CONTAINER's first tab is called LAYOUT and not Content, because that is
 * what the reference calls it — a box holds things, it does not say anything,
 * and the catalogue's container sections are `tab: "layout"` to the letter.
 * One list, one `first` argument, rather than two tab bars.
 */
export type InspectorTab = "content" | "style" | "advanced";

export const INSPECTOR_TABS: InspectorTab[] = ["content", "style", "advanced"];

/** What each tab is called. The first one changes; the other two never do. */
export function tabLabel(tab: InspectorTab, first: "Content" | "Layout" | "Settings"): string {
  return tab === "content" ? first : tab === "style" ? "Style" : "Advanced";
}

/**
 * THE GLYPH OVER EACH TAB (D-172, round 3).
 *
 * Driven in the reference on 2026-09-19: every tab is 57px tall and carries an
 * eicons glyph on `span::before` — `display: block`, 16px — ABOVE the word,
 * which is 13px at weight 400. Ours was the word alone on one line. The three
 * glyphs are its own: a pencil over Content, a contrast circle over Style, a
 * gear over Advanced.
 */
const TAB_ICON: Record<InspectorTab, typeof Pencil> = {
  content: Pencil, style: Contrast, advanced: Settings2,
};

export function InspectorTabs({ tab, onTab, first, tabs }: {
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  /* "Settings" is the PAGE panel's own first word — the reference titles
     its page-settings tab that, and its element panels Content or Layout. */
  first: "Content" | "Layout" | "Settings";
  /**
   * WHICH TABS THIS SELECTION ACTUALLY HAS (D-172).
   *
   * A list, not a disabled set. The reference's Spacer shows Content and
   * Advanced — two tabs, not three with one greyed — and a greyed tab that
   * re-renders the Content section behind it is a tab that lies.
   */
  tabs?: InspectorTab[];
}) {
  const shown = tabs ?? INSPECTOR_TABS;
  return (
    <div role="tablist" aria-label="Settings" data-inspector-tab={tab}
      style={{ display: "flex", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
      {shown.map((t) => {
        const on = tab === t;
        const Icon = TAB_ICON[t];
        return (
          /* NO TOOLTIP ON A TAB (D-172, round 3). Driven: `title`,
             `aria-label` and `data-tooltip` are all null on all three of the
             reference's tabs. Ours read "Content settings", "Style settings",
             "Advanced settings" — the word under the cursor, said again. */
          <button
            key={t}
            type="button"
            role="tab"
            data-inspector-tabbtn={t}
            aria-selected={on}
            onClick={() => onTab(t)}
            style={{
              flex: 1, border: "none", borderBottom: `2px solid ${on ? "#0B1C24" : "transparent"}`,
              background: "transparent", height: 57, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13,
              fontWeight: on ? 700 : 400, color: on ? "#0B1C24" : "#64748B", cursor: "pointer",
            }}
          >
            <Icon size={16} aria-hidden />
            <span>{tabLabel(t, first)}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   A group
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ONE SECTION OPEN AT A TIME (D-172, round 3).
 *
 * DRIVEN in the reference on 2026-09-19, on a Heading's Advanced tab: Layout
 * starts open with twelve controls laid out; clicking Motion Effects leaves
 * Layout with NONE and Motion Effects with five; clicking Transform empties
 * Motion Effects in turn. A panel is an accordion there, and ours let every
 * section stand open at once, so a 300px column became a scroll of everything.
 *
 * `null` means nobody has pressed anything yet, so the section that asked for
 * `defaultOpen` is the open one; `""` means the author shut that one and wants
 * none. A Group with no Accordion round it keeps its own open/shut, which is
 * what a lone group outside the panel does.
 */
const AccordionCtx = createContext<{
  open: string | null;
  /** The band says whether IT is open — the provider cannot know which band
   *  asked for `defaultOpen`, and a first press on the open one must SHUT it.
   *  Found by driving our own panel: pressing the open Layout band left it
   *  open, because "nothing pressed yet" and "Layout is open" were the same
   *  state to the toggle. */
  toggle: (title: string, isOpen: boolean) => void;
} | null>(null);

export function Accordion({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <AccordionCtx.Provider value={{ open, toggle: (t, isOpen) => setOpen(isOpen ? "" : t) }}>
      {/* THE SEPARATOR, MEASURED: every band after the first carries
          `border-top: 2px solid rgb(230, 232, 234)` on its heading. It is a
          sibling rule, which an inline style cannot say, so it is said once
          here rather than by handing every Group its own index. */}
      {/* ON THE BAND, NOT ITS HEADING (found by driving ours): the heading is
          a <button> whose inline `border: none` beats any stylesheet rule, so
          the first version of this drew no line at all. The band sits directly
          above its heading, so the line lands in the same place. */}
      <style>{".bx-pband + .bx-pband { border-top: 2px solid #E6E8EA; }"}</style>
      {children}
    </AccordionCtx.Provider>
  );
}

/* A SECTION IS A FULL-BLEED BAND, NOT A CARD (D-172, round 3).
   Measured in the reference: the section box is x=0, width 300 — the whole
   panel — `background: transparent`, `border: 0 none`, `border-radius: 0`, and
   its heading is 48px tall with `padding: 0 20px` and the caret on the LEFT.
   Ours was a rounded card with a 1px #E2E8F0 edge and a grey header fill,
   inset 16px from the panel's edge, so the panel read as a stack of cards.

   THE HEADER'S TOOLTIP IS DELETED with it. Driven: `title`, `aria-label` and
   `data-tooltip` are null on every one of the reference's section headings.
   Ours carried a sentence on each — "What this shows, and where it comes
   from", "Room inside and around this, and how it lines up" — so the `hint`
   prop is gone from the component and from all fourteen call sites. */
export function Group({
  title, defaultOpen = false, onReset, resetTitle, children,
}: {
  title: string;
  defaultOpen?: boolean;
  onReset?: () => void;
  resetTitle?: string;
  children: ReactNode;
}) {
  const acc = useContext(AccordionCtx);
  const [solo, setSolo] = useState(defaultOpen);
  const open = acc ? (acc.open === null ? defaultOpen : acc.open === title) : solo;
  return (
    <div className="bx-pband" data-style-group={title} style={{ background: "transparent" }}>
      <button
        type="button"
        className="bx-pband-head"
        onClick={() => (acc ? acc.toggle(title, open) : setSolo((o) => !o))}
        aria-expanded={open}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8, border: "none",
          background: "transparent", height: 48, padding: "0 20px", cursor: "pointer", textAlign: "left",
        }}
      >
        {open ? <ChevronDown size={13} color="#5A7A8A" /> : <ChevronRight size={13} color="#5A7A8A" />}
        {/* TITLE CASE, 13px (D-172): measured 13.3333px, weight 700,
            `letter-spacing: normal`, `text-transform: none`. */}
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0C0D0E" }}>{title}</span>
      </button>
      {/* THE PER-SECTION ERASER IS DELETED (D-172). The reference has a reset
          on a POPOVER control — Typography, Text Stroke, Text Shadow — and
          nowhere else; ours put one titled "Put layout back to the default on
          every screen size" in EVERY section header, which is a destructive
          button on every row of the panel. `onReset` stays on the props
          because the popover controls will want it; nothing draws it here. */}
      {open && (
        <div style={{ padding: "0 20px 14px", display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Desktop / Tablet / Phone
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE device segment — and it drives the SAME state as the preview toggle.
 *
 * One state, not two (§11.8). An author who picks Phone here sees the canvas
 * become 390px wide, so what they are editing and what they are looking at
 * cannot disagree. Two independent states is how "I set it on phone and
 * nothing happened" arrives.
 */
export function DeviceSegment({ device, onDevice }: { device: Device; onDevice: (d: Device) => void }) {
  /* THE "EDITING FOR Desktop / Tablet / Phone" ROW IS DELETED (D-172).
     The reference has no such row and no such sentence. Responsiveness there is
     a small device ICON beside the label of the one control being set, so this
     is now exactly that: three glyphs, on the control, saying which width the
     number next to them belongs to. Same state, same `onDevice` — a per-control
     switcher that owned its own state would let an author edit the phone while
     the canvas showed the desktop. */
  return (
    <span role="group" aria-label="Screen size being edited" data-style-device={device}
      style={{ display: "inline-flex", alignItems: "center", gap: 1, flex: "0 0 auto" }}>
      {PREVIEW_DEVICES.map((d) => {
        const Icon = d.key === "desktop" ? Monitor : d.key === "tablet" ? Tablet : Smartphone;
        const on = device === d.key;
        return (
          <button
            key={d.key}
            type="button"
            aria-pressed={on}
            title={d.label}
            aria-label={d.label}
            onClick={() => onDevice(d.key)}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 18, height: 16, border: "none", background: "transparent", cursor: "pointer",
              color: on ? "#0C4A60" : "#BFC7CE", padding: 0,
            }}
          ><Icon size={11} /></button>
        );
      })}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The two control shapes the reference uses everywhere
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A SWITCHER — the reference's pill (D-172).
 *
 * Ours was a native checkbox with a sentence for a label, which is a form
 * field; the reference's on/off is a pill you slide. Same state, one shape,
 * used everywhere an on/off is asked for.
 */
export function Switcher({ on, onChange, name, testId }: {
  on: boolean; onChange: (v: boolean) => void; name: string; testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={name}
      title={name}
      {...(testId ? { "data-style-switch": testId } : {})}
      onClick={() => onChange(!on)}
      style={{
        width: 34, height: 18, borderRadius: 999, padding: 2, cursor: "pointer",
        border: "1px solid " + (on ? "#0C4A60" : "#CBD5E1"),
        background: on ? "#0C4A60" : "#EEF2F6",
        display: "inline-flex", justifyContent: on ? "flex-end" : "flex-start",
      }}
    >
      <span style={{ width: 12, height: 12, borderRadius: 999, background: "#fff" }} />
    </button>
  );
}

/**
 * A ROW OF ICON BUTTONS — the reference's `choose` control (D-172).
 *
 * Alignment, Direction, Justify Content, Align Items and Wrap are all this
 * shape in the reference; ours were text selects, or three buttons reading
 * Left / Middle / Right. One component, so there is one answer to what a
 * chooser looks like.
 */
export function IconChoice<T extends string>({ value, options, onPick, name, testAttr }: {
  value: T | undefined;
  options: Array<{ v: T; title: string; icon: ReactNode }>;
  onPick: (v: T | undefined) => void;
  name: string;
  testAttr?: string;
}) {
  return (
    <div role="group" aria-label={name}
      style={{ display: "inline-flex", border: "1px solid #D5D8DC", borderRadius: 3, overflow: "hidden" }}>
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            aria-pressed={on}
            title={o.title}
            aria-label={o.title}
            {...(testAttr ? { [testAttr]: o.v } : {})}
            onClick={() => onPick(on ? undefined : o.v)}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 24, border: "none", cursor: "pointer",
              background: on ? "#0C4A60" : "#fff",
              color: on ? "#fff" : "#515962",
            }}
          >{o.icon}</button>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   A SIZE — a slider, a number box and a unit switcher (D-172, round 3)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE SHAPE EVERY SIZE IN THE REFERENCE WEARS.
 *
 * Driven on 2026-09-19: Width, Min Height, Columns, Rows, Space, Size, Weight,
 * Gap, Opacity, Rotate, Paragraph Spacing and Columns Gap are all a slider with
 * a number box beside it, the label ABOVE (`elementor-label-block`), the device
 * switcher on the label row, and a unit switcher on the right of it. Ours had
 * no `input type="range"` anywhere in the panel and no unit switcher anywhere
 * at all — every size was a bare pixel number, so "as tall as the screen" could
 * not be said.
 *
 * The slider and the box are ONE value: dragging writes the same key typing
 * does, and the box is there because a slider alone cannot be given 137.
 */
/* GENERIC IN ITS UNIT so a caller keeps the narrow one it passed: the
   container stores a `SizeUnit` on the style layer, while a widget size only
   STATES its unit and may say `deg`. One component, two promises kept. */
export function Slider<U extends UnitLabel = UnitLabel>({
  label, head, value, unit, units, onChange, onUnit, testAttr, max, placeholder, adapter,
}: {
  label: string;
  /**
   * THE LABEL ROW ITSELF, handed in by the panel.
   *
   * The label and its device switcher stay written where THE SCREEN LAW pins
   * them — in Inspector.tsx, beside the control they belong to — and the slider
   * is built round them. A component that swallowed the label would have moved
   * the one thing that file is pinned on, to add a slider under it.
   */
  head: ReactNode;
  value: number | undefined;
  unit: U | undefined;
  /** Which units this size may be in. The reference's list, per control. */
  units: ReadonlyArray<U>;
  onChange: (v: number | undefined) => void;
  onUnit: (u: U | undefined) => void;
  testAttr?: string;
  /** The slider's far end. A number box may go past it; the slider may not. */
  max?: number;
  placeholder?: string;
  /**
   * WHICH BUILDER THIS IS, so a size cannot be set in a unit that builder's
   * emitter throws away on publish. The rule is `style.unitsOffered` — ONE
   * rule, read here, rather than an `if` at every size control.
   */
  adapter?: string;
}) {
  const offered = unitsOffered(adapter, units);
  const shownUnit = unit ?? offered[0] ?? "px";
  const top = max ?? (shownUnit === "px" ? 800 : 100);
  return (
    <div style={FIELD}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {head}
        <span role="group" aria-label={`${label} unit`} data-style-units={label.toLowerCase()}
          style={{ marginLeft: "auto", display: "inline-flex", gap: 2 }}>
          {offered.map((u) => {
            const on = shownUnit === u;
            return (
              <button
                key={u}
                type="button"
                aria-pressed={on}
                title={u}
                onClick={() => onUnit(u === (offered[0] ?? "px") ? undefined : u)}
                style={{
                  border: "none", background: "transparent", cursor: "pointer", padding: "0 2px",
                  fontSize: 10, fontWeight: on ? 700 : 400, color: on ? "#0C4A60" : "#BFC7CE",
                }}
              >{u}</button>
            );
          })}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 64px", gap: 8, alignItems: "center" }}>
        <input
          type="range"
          min={0}
          max={top}
          aria-label={label}
          {...(testAttr ? { [testAttr]: "range" } : {})}
          value={value ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: "100%" }}
        />
        <input
          type="number"
          min={0}
          aria-label={`${label} value`}
          {...(testAttr ? { [`${testAttr}-box`]: "number" } : {})}
          value={value ?? ""}
          placeholder={placeholder ?? "0"}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0))}
          style={{ ...INPUT, padding: "4px 6px", textAlign: "center" }}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Spacing
   ══════════════════════════════════════════════════════════════════════════ */

const SIDE_KEYS: Array<keyof BoxSides> = ["top", "right", "bottom", "left"];
const SIDE_LABEL: Record<string, string> = { top: "Top", right: "Right", bottom: "Bottom", left: "Left" };

function SidesPad({
  label, hint, value, seed, onChange, device, onDevice,
}: {
  label: string;
  hint: string;
  /** The width this number belongs to, switched on the control itself. */
  device?: Device;
  onDevice?: (d: Device) => void;
  value: BoxSides | undefined;
  /** What the boxes show before the author has set anything. */
  seed?: BoxSides;
  onChange: (next: BoxSides | undefined, mergeKey: string) => void;
}) {
  const shown = value ?? seed;
  // FOUND BY DRIVING IT (2026-09-17): the chain started ON over a seed of
  // 24 / 40 / 24 / 40, so the first number an author typed flattened the
  // renderer's own 40px sides to whatever they typed. The chain reflects what
  // is IN THE BOXES, which is the only thing the author can see.
  const [linked, setLinked] = useState(() => sidesAreLinked(value ?? seed));
  return (
    <div style={FIELD}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={L}>{label}</span>
        {device && onDevice && <DeviceSegment device={device} onDevice={onDevice} />}
        <button
          type="button"
          onClick={() => setLinked((x) => !x)}
          aria-pressed={linked}
          title={linked
            ? "All four sides move together. Click to set each side on its own."
            : "Each side is on its own. Click to move all four together."}
          style={{
            marginLeft: "auto", border: "1px solid " + (linked ? "#0C4A60" : "#CBD5E1"),
            background: linked ? "#0C4A60" : "#fff", color: linked ? "#fff" : "#64748B",
            borderRadius: 4, padding: "2px 5px", cursor: "pointer", display: "inline-flex", alignItems: "center",
          }}
        >{linked ? <Link2 size={11} /> : <Unlink size={11} />}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 4 }}>
        {SIDE_KEYS.map((side) => (
          <label key={side} style={{ display: "flex", flexDirection: "column", gap: 2 }}
            title={`${SIDE_LABEL[side]} — ${hint}`}>
            <span style={{ fontSize: 9, color: "#94A3B8", textAlign: "center" }}>{SIDE_LABEL[side]}</span>
            <input
              type="number"
              aria-label={`${label} ${SIDE_LABEL[side]}`}
              data-style-side={`${label.toLowerCase()}-${side}`}
              value={shown?.[side] ?? ""}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value;
                const n = raw === "" ? undefined : Number(raw);
                const base = value ?? seed;
                onChange(setSide(base, side, Number.isFinite(n as number) ? (n as number) : undefined, linked),
                  `${label}:${linked ? "all" : side}`);
              }}
              style={{ ...INPUT, padding: "4px 4px", textAlign: "center" }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * ADVANCED ▸ LAYOUT — margin, padding and alignment.
 *
 * Named "Layout" and not "Spacing" because that is what the reference editor
 * calls this section of the Advanced tab: the machine catalogue's `common`
 * element declares `_section_style` with `label: "Layout"`, `tab: "advanced"`,
 * and it is where margin, padding, width and position live. Ours has no width
 * or position to offer, so it has margin, padding and align.
 *
 * `seedPadding` is the section's OLD single padding number spread to four
 * sides, so the first click on a box does not shift the page sideways: 40 left
 * and right is what the renderer has always written into the HTML.
 */
export function SpacingGroup({
  device, onDevice, layer, seedPadding, onPatch, onReset, what, align, box,
  cssId, cssClasses, onPatchNames,
}: {
  device: Device;
  onDevice: (d: Device) => void;
  layer: StyleLayer;
  seedPadding?: BoxSides;
  onPatch: (patch: Partial<StyleLayer>, mergeKey: string) => void;
  onReset: () => void;
  what: "section" | "widget";
  /** Offer the align row. A section has nothing to align itself against. */
  align?: boolean;
  /**
   * A BOX gets the other five the reference puts in this same section.
   *
   * Advanced ▸ Layout is one section in the reference editor and it holds
   * Margin, Padding, Size, Align Self, Order, Position and Z-Index. A second
   * group beside this one, also called Layout, would be two headings arguing
   * in one column — which is the thing §11.13.1 deleted from this panel once
   * already. So they are drawn INSIDE this group, for a box only.
   */
  box?: boolean;
  /**
   * CSS ID AND CSS CLASSES LIVE IN LAYOUT (D-172, round 3).
   *
   * Driven on a Heading's Advanced tab: the Layout section is Margin, Padding,
   * Width, Align Self, Order, Size, Position, Z-Index, CSS ID, CSS Classes,
   * Cache Settings. Ours kept the two in an "Attributes" section of their own,
   * which is a section the reference does have — and it holds a Pro promo, not
   * these. They are NOT per device, so they are written on the element's own
   * style and never through `withLayer`.
   */
  cssId?: string;
  cssClasses?: string;
  onPatchNames?: (patch: { cssId?: string; cssClasses?: string }) => void;
}) {
  return (
    <Group title="Layout" defaultOpen onReset={onReset}>
      {/* MARGIN FIRST, THEN PADDING (D-172) — the reference's own order in
          Advanced > Layout. Ours was the other way round. */}
      <SidesPad
        label="Margin"
        device={device}
        onDevice={onDevice}
        hint={what === "section"
          ? "Room OUTSIDE, between this section and the one above or below. Pixels."
          : "Room OUTSIDE, between this and whatever is next to it. Pixels."}
        value={layer.margin}
        onChange={(next, key) => onPatch({ margin: next }, key)}
      />
      <SidesPad
        label="Padding"
        device={device}
        onDevice={onDevice}
        hint="Room INSIDE, between the edge and what is in it. Pixels."
        value={layer.padding}
        seed={device === "desktop" ? seedPadding : undefined}
        onChange={(next, key) => onPatch({ padding: next }, key)}
      />
      {/* ALIGN IS NOT IN ADVANCED (D-172). There is no alignment control in the
          reference's Advanced tab: alignment is a STYLE control on the widget
          that has something to align. `align` stays on the props so the widget
          style sections can ask for it; Advanced no longer draws it. */}
      {void align}
      {box && <BoxSelfRows layer={layer} onPatch={onPatch} />}
      {onPatchNames && (
        <>
          <div style={ROW}>
            <span style={L} title="The id attribute on this element, with no # in front of it.">CSS ID</span>
            <input
              style={{ ...INPUT, borderRadius: 6 }}
              data-style-css-id
              value={cssId ?? ""}
              placeholder="e.g. prices"
              onChange={(e) => onPatchNames({ cssId: e.target.value })}
            />
          </div>
          <div style={ROW}>
            <span style={L} title="Class names on this element, separated by a space.">CSS Classes</span>
            <input
              style={{ ...INPUT, borderRadius: 6 }}
              data-style-css-classes
              value={cssClasses ?? ""}
              placeholder="e.g. tight two-up"
              onChange={(e) => onPatchNames({ cssClasses: e.target.value })}
            />
          </div>
        </>
      )}
    </Group>
  );
}

/**
 * HOW THIS BOX SITS IN THE BOX THAT HOLDS IT — the reference's Size, Align
 * Self, Order, Position and Z-Index, in its own Advanced ▸ Layout section.
 */
function BoxSelfRows({ layer, onPatch }: {
  layer: StyleLayer;
  onPatch: (patch: Partial<StyleLayer>, mergeKey: string) => void;
}) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <NumberField
          label="Width" attr="box-self-width" value={layer.selfWidth} placeholder="as needed"
          
          onChange={(v) => onPatch({ selfWidth: v === undefined ? undefined : Math.min(100, Math.max(0, v)) }, "selfWidth")}
        />
        <SelectField
          label="Align self" attr="box-align-self" value={layer.alignSelf ?? ""}
          
          options={[
            ["", "As the row says"], ["start", "At the top or left"], ["center", "In the middle"],
            ["end", "At the bottom or right"], ["stretch", "Fill the row"],
          ]}
          onChange={(v) => onPatch({ alignSelf: (v || undefined) as StyleLayer["alignSelf"] }, "alignSelf")}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <NumberField
          label="Order" attr="box-order" value={layer.order} placeholder="as placed"
          
          onChange={(v) => onPatch({ order: v }, "order")}
        />
        <NumberField
          label="Z-index" attr="box-zindex" value={layer.zIndex} placeholder="auto"
          
          onChange={(v) => onPatch({ zIndex: v }, "zIndex")}
        />
      </div>
      <SelectField
        label="Position" attr="box-position" value={layer.position ?? ""}
        
        options={[["", "In the flow"], ["absolute", "Pinned to this page area"], ["fixed", "Pinned to the screen"]]}
        onChange={(v) => onPatch({ position: (v || undefined) as StyleLayer["position"] }, "position")}
      />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The four small fields every container group is made of
   ══════════════════════════════════════════════════════════════════════════
   One number box, one picker, one switch, one text box. Written once here
   rather than forty times across the container's three tabs — the same reason
   `SidesPad` exists.

   THEY WEAR THE ROUND-3 LOOK (B-168 land, the b168/demo merge). Each was a
   label STACKED over a full-width control carrying a sentence in its `title`.
   The reference's row is the label LEFT and the control RIGHT (`ROW`), its
   on/off is the Switcher pill and never a native checkbox, and nothing in the
   panel explains itself in a sentence. The deeper controls these draw —
   Background, Overlay, Shape Divider, Position, Auto Flow — are the same
   controls; they are drawn the way the rest of the panel is drawn, rather
   than in an older style beside it. */

function NumberField({ label, attr, value, placeholder, min, max, step, onChange }: {
  label: string;
  attr: string;
  value: number | undefined;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div style={ROW}>
      <span style={L}>{label}</span>
      <input
        type="number" style={INPUT} data-box-field={attr}
        min={min} max={max} step={step}
        value={value ?? ""} placeholder={placeholder ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") { onChange(undefined); return; }
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : undefined);
        }}
      />
    </div>
  );
}

function SelectField({ label, attr, value, options, onChange }: {
  label: string;
  attr: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (v: string) => void;
}) {
  return (
    <div style={ROW}>
      <span style={L}>{label}</span>
      <select style={INPUT} data-box-field={attr} value={value}
        onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function SwitchField({ label, attr, checked, onChange }: {
  label: string;
  attr: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div style={ROW} data-box-field={attr}>
      <span style={L}>{label}</span>
      <Switcher on={checked} onChange={onChange} name={label} testId={attr} />
    </div>
  );
}

function TextField({ label, attr, value, placeholder, onChange }: {
  label: string;
  attr: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={ROW}>
      <span style={L}>{label}</span>
      <input style={INPUT} data-box-field={attr} value={value} placeholder={placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/**
 * ALIGNMENT — the reference's icon group, in a widget's STYLE section (D-172).
 *
 * It used to be three text buttons reading Left / Middle / Right at the foot
 * of Advanced > Layout. The reference has no alignment control in Advanced at
 * all: it is the FIRST control of a widget's own style section, and it is
 * icons. Exported, so the widget style sections can put it where it belongs.
 */
export function AlignRow({ layer, onPatch }: {
  layer: StyleLayer;
  onPatch: (patch: Partial<StyleLayer>, mergeKey: string) => void;
}) {
  return (
    <div style={ROW}>
      <span style={L}>Alignment</span>
      <IconChoice
        name="Alignment"
        testAttr="data-style-align"
        value={layer.align}
        onPick={(v) => onPatch({ align: v }, "align")}
        options={[
          { v: "left" as const, title: "Left", icon: <AlignLeft size={13} /> },
          { v: "center" as const, title: "Center", icon: <AlignCenter size={13} /> },
          { v: "right" as const, title: "Right", icon: <AlignRight size={13} /> },
        ]}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Typography
   ══════════════════════════════════════════════════════════════════════════ */

const WEIGHTS = [
  { v: 300, label: "Light" }, { v: 400, label: "Normal" }, { v: 500, label: "Medium" },
  { v: 600, label: "Semi-bold" }, { v: 700, label: "Bold" }, { v: 800, label: "Heavy" },
];

export function TypographyGroup({
  device, onDevice, layer, fonts, onPatch, onReset, colour = true,
}: {
  device: Device;
  onDevice: (d: Device) => void;
  layer: StyleLayer;
  fonts: string[];
  onPatch: (patch: Partial<StyleLayer>, mergeKey: string) => void;
  onReset: () => void;
  /**
   * DRAW THE TEXT COLOUR — unless the widget already has one (2026-09-20).
   *
   * Audit round 4, row 51, one of the nine extras: a Heading's Style tab had
   * "Text Color" at the top AND "Text colour" inside the Typography band — two
   * controls, two stored keys, one thing, and whichever was set last won. The
   * reference keeps colour OUT of typography, so the band's copy goes wherever
   * the widget's own definition declares a colour on its Style tab.
   *
   * It is NOT deleted outright: this group is drawn over every kind in
   * `TYPOGRAPHIC_KINDS`, and plenty of them — a Quote, a Callout, a Key fact —
   * declare no colour control at all, so deleting it would take their only way
   * of colouring words. One home each, and the definition decides which.
   */
  colour?: boolean;
}) {
  const t = layer.typography ?? {};
  const set = (patch: Record<string, unknown>, key: string) =>
    onPatch({ typography: { ...t, ...patch } as any }, key);
  return (
    <Group title="Typography" onReset={onReset}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={FIELD}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={L}>Size</span>
            <DeviceSegment device={device} onDevice={onDevice} />
          </span>
          <input type="number" style={INPUT} data-style-type="size" value={t.size ?? ""} placeholder="as set"
            title="How big the words are, in pixels. Leave empty to use the normal size."
            onChange={(e) => set({ size: e.target.value === "" ? undefined : Number(e.target.value) }, "type:size")} />
        </div>
        <div style={FIELD}>
          <span style={L}>Weight</span>
          <select style={INPUT} data-style-type="weight" value={t.weight ?? ""}
            title="How heavy the letters look — light, normal, bold."
            onChange={(e) => set({ weight: e.target.value === "" ? undefined : Number(e.target.value) }, "type:weight")}>
            <option value="">As set</option>
            {WEIGHTS.map((w) => <option key={w.v} value={w.v}>{w.label}</option>)}
          </select>
        </div>
        <div style={FIELD}>
          <span style={L}>Line height</span>
          <input type="number" step="0.05" style={INPUT} data-style-type="lineHeight" value={t.lineHeight ?? ""} placeholder="as set"
            title="How far apart the lines sit. 1.6 is comfortable; 1.2 is tight."
            onChange={(e) => set({ lineHeight: e.target.value === "" ? undefined : Number(e.target.value) }, "type:lh")} />
        </div>
        <div style={FIELD}>
          <span style={L}>Letter spacing</span>
          <input type="number" step="0.1" style={INPUT} data-style-type="letterSpacing" value={t.letterSpacing ?? ""} placeholder="as set"
            title="How far apart the letters sit, in pixels. A small positive number suits a heading in capitals."
            onChange={(e) => set({ letterSpacing: e.target.value === "" ? undefined : Number(e.target.value) }, "type:ls")} />
        </div>
      </div>
      {fonts.length > 0 && (
        <div style={FIELD}>
          <span style={L}>Font</span>
          <select style={INPUT} data-style-type="font" value={t.font ?? ""}
            title="The font these words are set in. Empty means the one the rest of the page uses."
            onChange={(e) => set({ font: e.target.value || undefined }, "type:font")}>
            <option value="">The page's own font</option>
            {fonts.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      )}
      {colour && (
      <div style={FIELD}>
        <span style={L}>Text colour</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="color" value={t.color || "#0B1C24"} aria-label="Text colour" data-style-type="color"
            title="Any colour you like."
            onChange={(e) => set({ color: e.target.value }, "type:color")}
            style={{ width: 26, height: 26, padding: 0, border: "1px solid #CBD5E1", borderRadius: 4, background: "transparent" }} />
          {t.color && (
            <button type="button" title="Back to the page's own text colour"
              onClick={() => set({ color: undefined }, "type:color")}
              style={{ border: "1px solid #CBD5E1", background: "#fff", borderRadius: 4, padding: "2px 6px", fontSize: 10, cursor: "pointer" }}>
              Clear
            </button>
          )}
        </div>
      </div>
      )}
    </Group>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Advanced ▸ Responsive — "not on a phone"
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Renamed from AdvancedGroup (§11.13.1, D-165).
 *
 * "Advanced" is the TAB now, so a group inside it called Advanced said
 * nothing. The reference editor's name for the two checkboxes is Responsive
 * (`_section_responsive`, `tab: "advanced"`), and Align went up into the
 * Layout group above, where the reference keeps it.
 */
export function ResponsiveGroup({
  hiddenOn, onHide, onReset, visibilityHeading,
}: {
  /**
   * THREE SWITCHES, not two (B-168, F0).
   *
   * The reference has `hide_desktop`, `hide_tablet` and `hide_mobile` and they
   * are independent: a band that is only for phones is hidden on a computer
   * and shown on a phone. Ours had two, so "only on a phone" could not be
   * said at all. `styleBlockFor` puts the box back on the two smaller screens
   * when only the desktop is hidden — the half that makes the third switch
   * mean what its label says.
   */
  hiddenOn: { desktop: boolean; tablet: boolean; phone: boolean };
  onHide: (device: Device, hidden: boolean) => void;
  onReset: () => void;
  /** A container's Responsive section carries a "Visibility" sub-heading; a
   *  widget's does not. The reference's own split. */
  visibilityHeading?: boolean;
}) {
  return (
    /* THREE SWITCHERS, IN THE REFERENCE'S FULL NAMES (D-172, round 2):
       "Hide On Desktop", "Hide On Tablet Portrait", "Hide On Mobile Portrait".
       Round 1 got the three rows and clipped the breakpoint out of two of
       them, which is the same defect as calling the device button "Phone":
       the reference names the BREAKPOINT, because "tablet" and "tablet
       portrait" are different widths and hiding on one is not hiding on the
       other. */
    <Group title="Responsive" onReset={onReset}>
      {visibilityHeading && (
        <div data-control-subheading="Visibility" style={{ ...L, marginTop: 4, fontWeight: 600, color: "#0B1C24" }}>
          Visibility
        </div>
      )}
      {([
        ["desktop", "Hide On Desktop"],
        ["tablet", "Hide On Tablet Portrait"],
        ["phone", "Hide On Mobile Portrait"],
      ] as const)
        .map(([key, label]) => (
          <div key={key} style={ROW}>
            <span style={L}>{label}</span>
            <Switcher
              on={hiddenOn[key]}
              onChange={(v) => onHide(key, v)}
              name={label}
              testId={key}
            />
          </div>
        ))}
    </Group>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE CONTAINER'S OWN THREE TABS (B-168, family F0)
   ══════════════════════════════════════════════════════════════════════════

   Every group below is one of the reference editor's own panel sections, by
   its own heading, holding its own controls, in its own order — read off a
   live Elementor 4.2.4 on 2026-09-19 and off the machine catalogue's
   `elements.container`. The table those facts live in is
   `widgets/families/container/controls.ts`; these components draw it.

   They are HERE and not in Inspector.tsx for the reason this file exists: the
   Inspector's job is "bind to the selection", and a box's Layout tab is a set
   of controls that a section will want next. */

/* THE LAYOUT TAB IS NOT HERE. `ContainerLayoutGroup` drew the reference's
   Container · Items · Additional Options and was exported and rendered by
   nobody: the panel the author actually sees is written out in Inspector.tsx,
   where THE SCREEN LAW (test/builder-elementor-screen.test.mjs, laws 10, 11 and
   17) pins every row of it by name. Two copies of one panel is two answers to
   "what does a box offer", so the dead one is DELETED rather than left beside
   the live one — and the fifteen keys it wrote are all written by the live one.
   B-168 land, the b168/demo merge. */

/** The reference's Style tab: Background · Background Overlay · Border · Shape Divider. */
export function ContainerStyleGroups({
  device, onDevice, layer, swatches, isEmail, onPatch, onReset,
}: {
  device: Device;
  onDevice: (d: Device) => void;
  layer: StyleLayer;
  swatches: string[];
  /** A mailbox drops a shadow and squares a corner. Say so beside the control. */
  isEmail?: boolean;
  onPatch: (patch: Partial<StyleLayer>, mergeKey: string) => void;
  onReset: (keys: Array<keyof StyleLayer>) => void;
}) {
  const bg: BackgroundSpec = layer.background ?? {};
  const ov: OverlaySpec = layer.overlay ?? {};
  const setBg = (patch: Partial<BackgroundSpec>, key: string) =>
    onPatch({ background: { ...bg, ...patch } }, `bg:${key}`);
  const setOv = (patch: Partial<OverlaySpec>, key: string) =>
    onPatch({ overlay: { ...ov, ...patch } }, `overlay:${key}`);
  /* `device` / `onDevice` ARE STILL TAKEN AND NOT DRAWN (2026-09-20). The four
     bare device rows below them are deleted (row 26); the pair stays on the
     props because Border Radius is responsive in the reference and this is the
     band that will carry it. Said out loud, the way `SpacingGroup` says it of
     `align`, rather than left as a prop a reader has to search for. */
  void device; void onDevice;
  return (
    <>
      <Group title="Background" defaultOpen
        onReset={() => onReset(["background"])}>
        {/* THE BARE DEVICE ROW IS DELETED (2026-09-20, audit round 4 row 26).
            Each of these four Style bands opened on three unlabelled device
            glyphs attached to no control. The reference has no such row
            anywhere in its panel — its switcher sits ON the label of the
            control being set, which is what the Container section already
            does with Gaps and Min Height. Nothing is lost: the band writes
            the layer for whatever device the page is showing, and that is
            switched from the top bar and from every responsive control. */}
        <SelectField
          label="Background type" attr="bg-type" value={bg.type ?? ""}
          
          options={[
            ["", "None"], ["classic", "Colour or picture"], ["gradient", "Two colours blending"],
            ["video", "A film"], ["slideshow", "Pictures that change"],
          ]}
          onChange={(v) => onPatch(
            { background: v ? { ...bg, type: v as BackgroundSpec["type"] } : undefined }, "bg:type")}
        />
        {(bg.type === "classic" || bg.type === "gradient") && (
          <div style={FIELD}>
            <span style={L}>{bg.type === "gradient" ? "First colour" : "Colour"}</span>
            <Swatches value={bg.color || ""} swatches={swatches} onPick={(v) => setBg({ color: v || undefined }, "color")} />
          </div>
        )}
        {bg.type === "gradient" && (
          <>
            <div style={FIELD}>
              <span style={L}>Second colour</span>
              <Swatches value={bg.colorB || ""} swatches={swatches} onPick={(v) => setBg({ colorB: v || undefined }, "colorB")} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <SelectField
                label="Type" attr="bg-gradient" value={bg.gradient ?? "linear"}
                
                options={[["linear", "Straight"], ["radial", "From the middle"]]}
                onChange={(v) => setBg({ gradient: v === "radial" ? "radial" : undefined }, "gradient")}
              />
              <NumberField
                label="Angle" attr="bg-angle" value={bg.angle} placeholder="180"
                
                onChange={(v) => setBg({ angle: v }, "angle")}
              />
            </div>
          </>
        )}
        {bg.type === "classic" && (
          <>
            <TextField
              label="Image" attr="bg-image" value={bg.image ?? ""} placeholder="Paste an image address"
              
              onChange={(v) => setBg({ image: v || undefined }, "image")}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <SelectField
                label="Position" attr="bg-position" value={bg.position ?? ""}
                
                options={[
                  ["", "Middle"], ["center center", "Middle"], ["top center", "Top"], ["bottom center", "Bottom"],
                  ["center left", "Left"], ["center right", "Right"],
                ]}
                onChange={(v) => setBg({ position: v || undefined }, "position")}
              />
              <SelectField
                label="Size" attr="bg-size" value={bg.size ?? ""}
                
                options={[["", "Cover the box"], ["cover", "Cover the box"], ["contain", "Show all of it"], ["auto", "Its own size"]]}
                onChange={(v) => setBg({ size: v || undefined }, "size")}
              />
            </div>
            <SelectField
              label="Repeat" attr="bg-repeat" value={bg.repeat ?? ""}
              
              options={[["", "Once"], ["no-repeat", "Once"], ["repeat", "Tile it"], ["repeat-x", "Tile across"], ["repeat-y", "Tile down"]]}
              onChange={(v) => setBg({ repeat: v || undefined }, "repeat")}
            />
          </>
        )}
        {bg.type === "video" && (
          <>
            <TextField
              label="Video link" attr="bg-video" value={bg.videoUrl ?? ""} placeholder="https://"
              
              onChange={(v) => setBg({ videoUrl: v || undefined }, "videoUrl")}
            />
            <TextField
              label="Still picture" attr="bg-video-poster" value={bg.image ?? ""} placeholder="Paste an image address"
              
              onChange={(v) => setBg({ image: v || undefined }, "image")}
            />
            <div style={{ fontSize: 10, color: "#B45309", lineHeight: 1.45 }}>
              A film plays on your website. In an email or a printed copy the still picture, or the colour, is what a
              reader gets.
            </div>
          </>
        )}
        {bg.type === "slideshow" && (
          <>
            <TextField
              label="Pictures" attr="bg-slideshow" value={(bg.images ?? []).join(", ")}
              placeholder="Paste image addresses, separated by commas"
              
              onChange={(v) => setBg({ images: v.split(",").map((s) => s.trim()).filter(Boolean) }, "images")}
            />
            <div style={{ fontSize: 10, color: "#B45309", lineHeight: 1.45 }}>
              The pictures change on your website. Everywhere else — an email, a printed copy — the first one is what a
              reader gets.
            </div>
          </>
        )}
      </Group>

      <Group title="Background Overlay" 
        onReset={() => onReset(["overlay"])}>
        <SelectField
          label="Background type" attr="overlay-type" value={ov.type ?? ""}
          
          options={[["", "None"], ["classic", "Colour or picture"], ["gradient", "Two colours blending"]]}
          onChange={(v) => onPatch({ overlay: v ? { ...ov, type: v as OverlaySpec["type"] } : undefined }, "overlay:type")}
        />
        {ov.type && (
          <>
            <div style={FIELD}>
              <span style={L}>{ov.type === "gradient" ? "First colour" : "Colour"}</span>
              <Swatches value={ov.color || ""} swatches={swatches} onPick={(v) => setOv({ color: v || undefined }, "color")} />
            </div>
            {ov.type === "gradient" && (
              <div style={FIELD}>
                <span style={L}>Second colour</span>
                <Swatches value={ov.colorB || ""} swatches={swatches} onPick={(v) => setOv({ colorB: v || undefined }, "colorB")} />
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <NumberField
                label="Opacity" attr="overlay-opacity" value={ov.opacity} min={0} max={1} step={0.05} placeholder="0.5"
                
                onChange={(v) => setOv({ opacity: v }, "opacity")}
              />
              <SelectField
                label="Blend mode" attr="overlay-blend" value={ov.blend ?? ""}
                
                options={[
                  ["", "Normal"], ["multiply", "Multiply"], ["screen", "Screen"], ["overlay", "Overlay"],
                  ["darken", "Darken"], ["lighten", "Lighten"], ["color-dodge", "Colour dodge"],
                  ["saturation", "Saturation"], ["color", "Colour"], ["luminosity", "Luminosity"],
                ]}
                onChange={(v) => setOv({ blend: v || undefined }, "blend")}
              />
            </div>
          </>
        )}
      </Group>

      {/* ONE BAND OPEN ON ARRIVAL (2026-09-20, audit round 4 row 19). Driven:
          a Container's Style tab opened with Background AND Border laid out,
          because two Groups asked for `defaultOpen` and the Accordion's "nobody
          has pressed anything yet" state honours every one that asks. The
          reference opens the FIRST section of a tab and only that one. */}
      <Group title="Border"
        onReset={() => onReset(["border", "radius", "shadow"])}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <SelectField
            label="Border type" attr="border-style" value={layer.border?.style ?? ""}
            
            options={[["", "None"], ["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]}
            onChange={(v) => onPatch({
              border: v ? { ...(layer.border || {}), style: v as "solid" | "dashed" | "dotted" } : undefined,
            }, "border")}
          />
          <NumberField
            label="Border width" attr="border-width" value={layer.border?.width} min={0} placeholder="none"
            
            onChange={(v) => onPatch({
              border: v === undefined && !layer.border?.color && !layer.border?.style
                ? undefined
                : { ...(layer.border || {}), width: v },
            }, "border")}
          />
        </div>
        <div style={FIELD}>
          <span style={L}>Border colour</span>
          <Swatches value={layer.border?.color || ""} swatches={swatches}
            onPick={(v) => onPatch({ border: { ...(layer.border || {}), color: v || undefined } }, "border")} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <NumberField
            label="Border radius" attr="radius" value={layer.radius} min={0} placeholder="0"
            
            onChange={(v) => onPatch({ radius: v }, "radius")}
          />
          <SelectField
            label="Box shadow" attr="shadow" value={layer.shadow ?? "none"}
            
            options={[["none", "None"], ["soft", "Soft"], ["strong", "Strong"]]}
            onChange={(v) => onPatch({ shadow: v === "none" ? undefined : v as StyleLayer["shadow"] }, "shadow")}
          />
        </div>
        {isEmail && (
          <div style={{ fontSize: 10, color: "#B45309", lineHeight: 1.45 }}>
            Rounded corners and shadows are <strong>not in email</strong>. Outlook renders through Word and drops both.
          </div>
        )}
      </Group>

      <Group title="Shape Divider" 
        onReset={() => onReset(["shapeTop", "shapeBottom"])}>
        <ShapeRows edge="top" spec={layer.shapeTop} swatches={swatches}
          onPatch={(s) => onPatch({ shapeTop: s }, "shapeTop")} />
        <ShapeRows edge="bottom" spec={layer.shapeBottom} swatches={swatches}
          onPatch={(s) => onPatch({ shapeBottom: s }, "shapeBottom")} />
        {/* THE GREY SENTENCE IS DELETED (2026-09-20, audit round 4 row 23).
            "A shaped edge shows on a web page. An email and a printed copy
            leave it out." The reference puts no explanation paragraph anywhere
            in its panel, and the rule that a shaped edge is a web-page thing
            is already enforced by the renderers that leave it out. */}
      </Group>
    </>
  );
}

/** One end's worth of shape divider — the reference has the same six twice. */
function ShapeRows({ edge, spec, swatches, onPatch }: {
  edge: "top" | "bottom";
  spec: ShapeDividerSpec | undefined;
  swatches: string[];
  onPatch: (next: ShapeDividerSpec | undefined) => void;
}) {
  const s: ShapeDividerSpec = spec ?? {};
  const set = (patch: Partial<ShapeDividerSpec>) => onPatch({ ...s, ...patch });
  const where = edge === "top" ? "Top" : "Bottom";
  return (
    <div data-shape-edge={edge} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <SelectField
        label={`${where} shape`} attr={`shape-${edge}`} value={s.shape ?? ""}
        
        options={[["", "None"], ...SHAPE_DIVIDERS.map((n) => [n, sentence(n)] as const)]}
        onChange={(v) => onPatch(v ? { ...s, shape: v as ShapeDividerSpec["shape"] } : undefined)}
      />
      {s.shape && (
        <>
          <div style={FIELD}>
            <span style={L}>Colour</span>
            <Swatches value={s.color || ""} swatches={swatches} onPick={(v) => set({ color: v || undefined })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <NumberField label="Height" attr={`shape-${edge}-height`} value={s.height} min={0} placeholder="60"
              onChange={(v) => set({ height: v })} />
            <NumberField label="Width (%)" attr={`shape-${edge}-width`} value={s.width} min={100} placeholder="100"
              
              onChange={(v) => set({ width: v })} />
          </div>
          <SwitchField label="Flip" attr={`shape-${edge}-flip`} checked={!!s.flip}
            onChange={(on) => set({ flip: on || undefined })} />
          <SwitchField label="Invert" attr={`shape-${edge}-invert`} checked={!!s.invert}
            onChange={(on) => set({ invert: on || undefined })} />
          <SwitchField label="Bring to front" attr={`shape-${edge}-front`} checked={!!s.aboveContent}
            
            onChange={(on) => set({ aboveContent: on || undefined })} />
        </>
      )}
    </div>
  );
}

/** `opacity-tilt` → `Opacity tilt`. The reference's own names, readable. */
function sentence(name: string): string {
  const words = name.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * ADVANCED ▸ MOTION EFFECTS ▸ STICKY and ADVANCED ▸ CUSTOM CSS.
 *
 * The two element-level sections a box has that a widget's Advanced tab does
 * not already carry. Margin, Padding, Size, Align Self, Order, Position and
 * Z-Index are in `SpacingGroup` (`box`), the three Hide switches are in
 * `ResponsiveGroup`, and the CSS ID and classes are in `AttributesGroup` —
 * each already built, each extended rather than copied.
 */
export function ContainerAdvancedGroups({ style, onStyle, only }: {
  style: ElementStyle | undefined;
  onStyle: (next: ElementStyle | undefined) => void;
  /**
   * WHICH OF THE TWO, so the Advanced tab reads in the reference's own order.
   *
   * It is Layout · Motion Effects · Transform · Responsive · Attributes ·
   * Custom CSS there, and Motion Effects therefore sits BETWEEN the Layout
   * group and the Responsive one — which is why this draws one at a time
   * rather than both in a lump at the bottom. Found by driving the builder,
   * 2026-09-19: the two were after Attributes, in our order and not theirs.
   */
  only?: "motion" | "css";
}) {
  const s: ElementStyle = style ?? {};
  const set = (patch: Partial<ElementStyle>) => {
    const next: Record<string, unknown> = { ...s, ...patch };
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
    onStyle(Object.keys(next).length ? next as ElementStyle : undefined);
  };
  const on = s.stickyOn ?? ["desktop", "tablet", "phone"];
  return (
    <>
      {only !== "css" && (
      <Group title="Motion Effects" 
        onReset={() => set({ sticky: undefined, stickyOn: undefined, stickyOffset: undefined })}>
        <SelectField
          label="Sticky" attr="sticky" value={s.sticky ?? ""}
          
          options={[["", "No"], ["top", "Stick to the top"], ["bottom", "Stick to the bottom"]]}
          onChange={(v) => set({ sticky: (v || undefined) as ElementStyle["sticky"] })}
        />
        {s.sticky && (
          <>
            <NumberField
              label="Sticky offset" attr="sticky-offset" value={s.stickyOffset} min={0} placeholder="0"
              
              onChange={(v) => set({ stickyOffset: v })}
            />
            <div style={FIELD}>
              <span style={L}>Sticky on</span>
              {PREVIEW_DEVICES.map((d) => (
                <SwitchField
                  key={d.key} label={`On a ${d.label.toLowerCase()}`} attr={`sticky-on-${d.key}`}
                  checked={on.includes(d.key)}
                  
                  onChange={(checked) => {
                    const next = checked ? [...new Set([...on, d.key])] : on.filter((x) => x !== d.key);
                    set({ stickyOn: next.length && next.length < 3 ? next : (next.length ? undefined : []) });
                  }}
                />
              ))}
            </div>
          </>
        )}
      </Group>
      )}

      {only !== "motion" && (
      <Group title="Custom CSS" 
        onReset={() => set({ customCss: undefined })}>
        <textarea
          data-box-field="custom-css"
          spellCheck={false}
          placeholder={"selector {\n  box-shadow: 0 0 0 3px #0C4A60;\n}"}
          value={s.customCss ?? ""}
          onChange={(e) => set({ customCss: e.target.value || undefined })}
          style={{
            ...INPUT, minHeight: 110, whiteSpace: "pre", overflowWrap: "normal",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11,
          }}
        />
        {/* THE GREY SENTENCE IS DELETED (2026-09-20, audit round 4 row 23).
            "The word selector means this box…" — the reference has no
            explanation paragraph in its panel, and the placeholder in the box
            already shows `selector { … }`, which is the same thing said where
            an author is looking. */}
      </Group>
      )}
    </>
  );
}

/* The three control tables are re-exported so a test can assert the panel and
   the table agree without importing two modules. */
export { CONTAINER_LAYOUT_CONTROLS, CONTAINER_STYLE_CONTROLS, CONTAINER_ADVANCED_CONTROLS };


/* THE "ATTRIBUTES" SECTION IS DELETED (D-172, round 3).

   The reference DOES have a section by that name on the Advanced tab — and
   what is in it is a Pro promo, not these two fields. CSS ID and CSS Classes
   are inside LAYOUT there, which is where ours are now (see SpacingGroup).
   The component is gone rather than emptied: an unused export is how a second
   home for the same two fields comes back. */

/* ══════════════════════════════════════════════════════════════════════════
   A section's Layout — columns, the split, the gap
   ══════════════════════════════════════════════════════════════════════════ */

export function RatioPicker({
  layout, widths, onPick,
}: {
  layout: number;
  widths: number[] | undefined;
  onPick: (widths: number[] | undefined) => void;
}) {
  const presets = RATIO_PRESETS[layout] || [];
  if (!presets.length) {
    return <span style={{ fontSize: 10, color: "#94A3B8" }}>One column runs the whole width.</span>;
  }
  const current = normaliseRatios(widths, layout);
  const matches = (w: number[]) => !!current && current.every((x, i) => Math.abs(x - w[i]) < 0.005);
  const custom = !!current && !presets.some((p) => matches(p.widths));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {presets.map((p) => (
        <button key={p.key} type="button" data-ratio={p.key}
          aria-pressed={matches(p.widths)}
          title={`Make the columns ${p.label.replace(/ \/ /g, " and ")} of the width`}
          onClick={() => onPick(p.widths)}
          style={{
            borderRadius: 4, padding: "4px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer",
            border: "1px solid " + (matches(p.widths) ? "#0C4A60" : "#CBD5E1"),
            background: matches(p.widths) ? "#0C4A60" : "#fff",
            color: matches(p.widths) ? "#fff" : "#334155",
          }}
        >{p.label}</button>
      ))}
      <button type="button" data-ratio="custom" disabled={!current}
        title="Back to columns of the same width"
        onClick={() => onPick(undefined)}
        style={{
          borderRadius: 4, padding: "4px 8px", fontSize: 11, fontWeight: 600,
          border: "1px dashed #CBD5E1", background: "#fff", color: current ? "#0C4A60" : "#CBD5E1",
          cursor: current ? "pointer" : "default",
        }}
      >{custom ? "Custom — clear" : "Equal"}</button>
    </div>
  );
}

/**
 * THE SMALL BUTTON, and THE COLOUR CONTROL — moved here, not copied (B-168).
 *
 * Both lived privately in `Inspector.tsx`. `definitionControls.tsx` draws a
 * `colour` control from a family's definition and needs the same one the rest
 * of the panel uses, and a second swatch row would be a second answer to "what
 * colours may I pick". So they live where `L`, `INPUT` and `FIELD` already
 * live — the module both panels import — and the Inspector imports them back.
 */
export const miniBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid #CBD5E1", background: "#fff",
  borderRadius: 4, padding: "5px 9px", fontSize: 11, fontWeight: 600, color: "#334155", cursor: "pointer",
};

/** Brand swatches first, any colour after — Q4, in one control. */
export function Swatches({ value, swatches, onPick }: { value: string; swatches?: string[]; onPick: (v: string) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {(swatches || []).map((c) => (
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

export { L, INPUT, FIELD, ROW };
export default Group;

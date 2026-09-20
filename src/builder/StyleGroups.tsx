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
import { useState, type ReactNode } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ChevronDown, ChevronRight, Link2,
  Monitor, Smartphone, Tablet, Unlink,
} from "lucide-react";
import {
  RATIO_PRESETS, normaliseRatios, setSide, sidesAreLinked,
  type BoxSides, type Device, type StyleLayer,
} from "./style";
import { PREVIEW_DEVICES } from "./responsive";

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
        const off = false;
        const on = tab === t;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            data-inspector-tabbtn={t}
            aria-selected={on}
            disabled={off}
            title={off ? `Nothing to set here for this` : `${tabLabel(t, first)} settings`}
            onClick={() => onTab(t)}
            style={{
              flex: 1, border: "none", borderBottom: `2px solid ${on ? "#0B1C24" : "transparent"}`,
              background: "transparent", padding: "9px 6px", fontSize: 11.5,
              fontWeight: on ? 700 : 600, color: off ? "#CBD5E1" : on ? "#0B1C24" : "#64748B",
              cursor: off ? "default" : "pointer",
            }}
          >{tabLabel(t, first)}</button>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   A group
   ══════════════════════════════════════════════════════════════════════════ */

/* THE HINT SENTENCE UNDER A SECTION HEADER IS DELETED (D-172). No
   descriptive paragraph appears anywhere in the reference's panel; `hint`
   is the header's TOOLTIP, which is where a sentence belongs. */
export function Group({
  title, hint, defaultOpen = false, onReset, resetTitle, children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  onReset?: () => void;
  resetTitle?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div data-style-group={title} style={{ border: "1px solid #E2E8F0", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", background: "#F8FAFC" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title={hint || `Show or hide ${title.toLowerCase()}`}
          aria-expanded={open}
          style={{
            flex: 1, display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent",
            padding: "8px 10px", cursor: "pointer", textAlign: "left",
          }}
        >
          {open ? <ChevronDown size={13} color="#5A7A8A" /> : <ChevronRight size={13} color="#5A7A8A" />}
          {/* TITLE CASE (D-172): the reference's headings are "Container",
              "Additional Options", measured `text-transform: none`. */}
          <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{title}</span>
        </button>
        {/* THE PER-SECTION ERASER IS DELETED (D-172). The reference has a reset
            on a POPOVER control — Typography, Text Stroke, Text Shadow — and
            nowhere else; ours put one titled "Put layout back to the default on
            every screen size" in EVERY section header, which is a destructive
            button on every row of the panel. `onReset` stays on the props
            because the popover controls will want it; nothing draws it here. */}
      </div>
      {open && (
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
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
  device, onDevice, layer, seedPadding, onPatch, onReset, what, align,
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
}) {
  return (
    <Group title="Layout" hint="Room inside and around this, and how it lines up" defaultOpen onReset={onReset}>
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
    </Group>
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
  device, onDevice, layer, fonts, onPatch, onReset,
}: {
  device: Device;
  onDevice: (d: Device) => void;
  layer: StyleLayer;
  fonts: string[];
  onPatch: (patch: Partial<StyleLayer>, mergeKey: string) => void;
  onReset: () => void;
}) {
  const t = layer.typography ?? {};
  const set = (patch: Record<string, unknown>, key: string) =>
    onPatch({ typography: { ...t, ...patch } as any }, key);
  return (
    <Group title="Typography" hint="How the words in this are set" onReset={onReset}>
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
    <Group title="Responsive" hint="Leaving this out on smaller screens" onReset={onReset}>
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


/* ═══════════════════════════════════════════════════════════════════════════
   Advanced ▸ Attributes — the CSS id and classes (§11.13.1)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The reference editor's Advanced tab ends with CSS ID and CSS Classes, and
 * they are the third of §11.13.1's three Advanced sections. The other two
 * shipped with the screen; this one waited for somewhere to PUT the values and
 * somebody to READ them — a control that writes a field nothing reads is worse
 * than a missing one. `ElementStyle` carries them now and all three renderers
 * emit them, so here it is.
 *
 * PLAIN WORDS on screen, not "CSS ID": the label says what it is FOR, and the
 * hint says what it does, because a business owner reading "CSS ID" learns
 * nothing. The catalogue's own name is in the tooltip for anybody who wants it.
 */
export function AttributesGroup({
  cssId, cssClasses, onPatch, onReset,
}: {
  cssId: string;
  cssClasses: string;
  onPatch: (patch: { cssId?: string; cssClasses?: string }) => void;
  onReset: () => void;
}) {
  /* THE REFERENCE'S OWN TWO NAMES, IN LAYOUT (D-172, round 2).
     Two things changed here and both were ours:

       · THE TWO EXPLANATION PARAGRAPHS ARE DELETED. "A Menu Anchor and a link
         like #prices jump to this name. Use it once on a page." and "Separate
         them with a space. Your own stylesheet can then style every part with
         the same name." The reference's Advanced tab has no prose in it at
         all. What each field is for is in its tooltip.
       · THE LABELS ARE "CSS ID" AND "CSS CLASSES". Ours read "Its own name"
         and "Styling names", invented on the argument that a business owner
         learns nothing from "CSS ID" — which is true, and is why the sentence
         that explains it is the tooltip. A NAME that appears nowhere else in
         the world is worse than a technical one: somebody who searches for how
         to use it finds every answer written about CSS ID.

     The group is rendered inside the Layout section now — the reference keeps
     both of these there, not in an Attributes section of their own. */
  const field: React.CSSProperties = {
    ...INPUT, borderRadius: 6,
  };
  return (
    <Group title="Attributes" hint="A name for this part, so a link or your own styling can find it" onReset={onReset}>
      <div style={ROW}>
        <span style={L} title="The id attribute on this element, with no # in front of it.">CSS ID</span>
        <input
          style={field}
          data-style-css-id
          value={cssId}
          placeholder="e.g. prices"
          onChange={(e) => onPatch({ cssId: e.target.value })}
        />
      </div>
      <div style={ROW}>
        <span style={L} title="Class names on this element, separated by a space.">CSS Classes</span>
        <input
          style={field}
          data-style-css-classes
          value={cssClasses}
          placeholder="e.g. tight two-up"
          onChange={(e) => onPatch({ cssClasses: e.target.value })}
        />
      </div>
    </Group>
  );
}

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

export { L, INPUT, FIELD, ROW };
export default Group;

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
import { ChevronDown, ChevronRight, Link2, Unlink, RotateCcw } from "lucide-react";
import {
  RATIO_PRESETS, SHAPE_DIVIDERS, normaliseRatios, setSide, sidesAreLinked,
  type BackgroundSpec, type BoxSides, type Device, type ElementStyle,
  type OverlaySpec, type ShapeDividerSpec, type StyleLayer,
} from "./style";
import { PREVIEW_DEVICES } from "./responsive";
import {
  CONTAINER_LAYOUT_CONTROLS, CONTAINER_STYLE_CONTROLS, CONTAINER_ADVANCED_CONTROLS,
} from "./widgets/families/container";

const L: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5A7A8A",
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
export function tabLabel(tab: InspectorTab, first: "Content" | "Layout"): string {
  return tab === "content" ? first : tab === "style" ? "Style" : "Advanced";
}

export function InspectorTabs({ tab, onTab, first, disabled }: {
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  first: "Content" | "Layout";
  /** Tabs with nothing behind them. Shown, greyed — never hidden, so the row
   *  does not change width as the selection moves from a widget to a box. */
  disabled?: InspectorTab[];
}) {
  return (
    <div role="tablist" aria-label="Settings" data-inspector-tab={tab}
      style={{ display: "flex", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
      {INSPECTOR_TABS.map((t) => {
        const off = !!disabled?.includes(t);
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
          <span style={{ ...L, color: "#334155" }}>{title}</span>
        </button>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            title={resetTitle || `Put ${title.toLowerCase()} back to the default on every screen size`}
            aria-label={`Reset ${title}`}
            style={{
              border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8",
              padding: "8px 10px", display: "inline-flex", alignItems: "center",
            }}
          ><RotateCcw size={12} /></button>
        )}
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
  return (
    <div style={FIELD}>
      <span style={L}>Editing for</span>
      <div role="group" aria-label="Screen size being edited" data-style-device={device}
        style={{ display: "flex", gap: 2, background: "#EEF2F6", borderRadius: 5, padding: 2 }}>
        {PREVIEW_DEVICES.map((d) => (
          <button
            key={d.key}
            type="button"
            aria-pressed={device === d.key}
            title={d.key === "desktop"
              ? "The normal setting. Tablet and phone start from whatever you put here."
              : `Change this only for a ${d.label.toLowerCase()}. Anything you leave alone stays as it is on a computer.`}
            onClick={() => onDevice(d.key)}
            style={{
              flex: 1, border: "none", borderRadius: 4, padding: "4px 6px", fontSize: 11, fontWeight: 600,
              cursor: "pointer",
              background: device === d.key ? "#0C4A60" : "transparent",
              color: device === d.key ? "#fff" : "#475569",
            }}
          >{d.label}</button>
        ))}
      </div>
      <span style={{ fontSize: 10, color: "#94A3B8" }}>
        {device === "desktop"
          ? "These settings apply everywhere unless you change them for a tablet or a phone."
          : `Only on a ${device}. The page above is showing that width.`}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Spacing
   ══════════════════════════════════════════════════════════════════════════ */

const SIDE_KEYS: Array<keyof BoxSides> = ["top", "right", "bottom", "left"];
const SIDE_LABEL: Record<string, string> = { top: "Top", right: "Right", bottom: "Bottom", left: "Left" };

function SidesPad({
  label, hint, value, seed, onChange,
}: {
  label: string;
  hint: string;
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
      <span style={{ fontSize: 10, color: "#94A3B8" }}>{hint}</span>
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
}) {
  return (
    <Group title="Layout" hint="Room inside and around this, and how it lines up" defaultOpen onReset={onReset}>
      <DeviceSegment device={device} onDevice={onDevice} />
      <SidesPad
        label="Padding"
        hint="Room INSIDE, between the edge and what is in it. Pixels."
        value={layer.padding}
        seed={device === "desktop" ? seedPadding : undefined}
        onChange={(next, key) => onPatch({ padding: next }, key)}
      />
      <SidesPad
        label="Margin"
        hint={what === "section"
          ? "Room OUTSIDE, between this section and the one above or below. Pixels."
          : "Room OUTSIDE, between this and whatever is next to it. Pixels."}
        value={layer.margin}
        onChange={(next, key) => onPatch({ margin: next }, key)}
      />
      {align && <AlignRow layer={layer} onPatch={onPatch} />}
      {box && <BoxSelfRows layer={layer} onPatch={onPatch} />}
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
          hint="How much of the row this box takes, out of 100."
          onChange={(v) => onPatch({ selfWidth: v === undefined ? undefined : Math.min(100, Math.max(0, v)) }, "selfWidth")}
        />
        <SelectField
          label="Align self" attr="box-align-self" value={layer.alignSelf ?? ""}
          hint="Where this box sits across the row that holds it."
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
          hint="A lower number comes first. Useful to put a picture above the words on a phone."
          onChange={(v) => onPatch({ order: v }, "order")}
        />
        <NumberField
          label="Z-index" attr="box-zindex" value={layer.zIndex} placeholder="auto"
          hint="Which box is on top when two overlap. Higher wins."
          onChange={(v) => onPatch({ zIndex: v }, "zIndex")}
        />
      </div>
      <SelectField
        label="Position" attr="box-position" value={layer.position ?? ""}
        hint="Normally a box sits in the flow. Pinned takes it out of the flow."
        options={[["", "In the flow"], ["absolute", "Pinned to this page area"], ["fixed", "Pinned to the screen"]]}
        onChange={(v) => onPatch({ position: (v || undefined) as StyleLayer["position"] }, "position")}
      />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The three small fields every container group is made of
   ══════════════════════════════════════════════════════════════════════════
   One number box, one picker, one switch. Written once here rather than forty
   times across the container's three tabs — the same reason `SidesPad` exists.
   Each carries a plain-words tooltip, SD-010, not optional. */

function NumberField({ label, attr, value, placeholder, hint, min, max, step, onChange }: {
  label: string;
  attr: string;
  value: number | undefined;
  placeholder?: string;
  hint: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div style={FIELD}>
      <span style={L}>{label}</span>
      <input
        type="number" style={INPUT} data-box-field={attr} title={hint}
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

function SelectField({ label, attr, value, hint, options, onChange }: {
  label: string;
  attr: string;
  value: string;
  hint: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (v: string) => void;
}) {
  return (
    <div style={FIELD}>
      <span style={L}>{label}</span>
      <select style={INPUT} data-box-field={attr} title={hint} value={value}
        onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function SwitchField({ label, attr, checked, hint, onChange }: {
  label: string;
  attr: string;
  checked: boolean;
  hint: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }} title={hint}>
      <input type="checkbox" data-box-field={attr} checked={checked}
        onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function TextField({ label, attr, value, placeholder, hint, onChange }: {
  label: string;
  attr: string;
  value: string;
  placeholder?: string;
  hint: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={FIELD}>
      <span style={L}>{label}</span>
      <input style={INPUT} data-box-field={attr} title={hint} value={value} placeholder={placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Left / middle / right. Shared by the Layout group and nothing else. */
function AlignRow({ layer, onPatch }: {
  layer: StyleLayer;
  onPatch: (patch: Partial<StyleLayer>, mergeKey: string) => void;
}) {
  return (
    <div style={FIELD}>
      <span style={L}>Align</span>
      <div style={{ display: "flex", gap: 4 }}>
        {(["left", "center", "right"] as const).map((a) => (
          <button key={a} type="button" data-style-align={a}
            aria-pressed={layer.align === a}
            title={`Line this up on the ${a === "center" ? "middle" : a}`}
            onClick={() => onPatch({ align: layer.align === a ? undefined : a }, "align")}
            style={{
              flex: 1, borderRadius: 4, padding: "5px 6px", fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: "1px solid " + (layer.align === a ? "#0C4A60" : "#CBD5E1"),
              background: layer.align === a ? "#0C4A60" : "#fff",
              color: layer.align === a ? "#fff" : "#334155",
            }}
          >{a === "left" ? "Left" : a === "center" ? "Middle" : "Right"}</button>
        ))}
      </div>
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
      <DeviceSegment device={device} onDevice={onDevice} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={FIELD}>
          <span style={L}>Text size</span>
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
  hiddenOn, onHide, onReset,
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
}) {
  return (
    <Group title="Responsive" hint="Leaving this out on some screen sizes" onReset={onReset}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
        title="Leave this out on a computer. It still shows on a tablet and a phone — which is how you make something phone-only.">
        <input type="checkbox" data-style-hide="desktop" checked={hiddenOn.desktop}
          onChange={(e) => onHide("desktop", e.target.checked)} />
        Hide on a computer
      </label>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
        title="Leave this out when somebody is reading on a tablet. It still shows on a computer.">
        <input type="checkbox" data-style-hide="tablet" checked={hiddenOn.tablet}
          onChange={(e) => onHide("tablet", e.target.checked)} />
        Hide on a tablet
      </label>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
        title="Leave this out when somebody is reading on a phone — which is where most customers open it.">
        <input type="checkbox" data-style-hide="phone" checked={hiddenOn.phone}
          onChange={(e) => onHide("phone", e.target.checked)} />
        Hide on a phone
      </label>
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

/** The reference's Layout tab: Container · Items · Additional Options. */
export function ContainerLayoutGroup({
  device, onDevice, layer, htmlTag, onPatch, onPatchProps, onReset,
}: {
  device: Device;
  onDevice: (d: Device) => void;
  layer: StyleLayer;
  htmlTag: string;
  onPatch: (patch: Partial<StyleLayer>, mergeKey: string) => void;
  onPatchProps: (patch: Record<string, unknown>) => void;
  onReset: () => void;
}) {
  const grid = layer.direction === "grid";
  // THE CHAIN IS ON WHEN NOBODY HAS SET A ROW GAP — which is exactly what the
  // one stored key means. No second "isLinked" field to fall out of step with
  // the numbers the author can see (the lesson SidesPad learned on 09-17).
  const linkedGaps = layer.rowGap === undefined;
  return (
    <>
      <Group title="Container" hint="What this box is and how wide it runs" defaultOpen onReset={onReset}>
        <DeviceSegment device={device} onDevice={onDevice} />
        <SelectField
          label="Container layout" attr="container-type" value={grid ? "grid" : "flex"}
          hint="Flexbox puts things in a line — across or down. Grid puts them in even cells."
          options={[["flex", "Flexbox"], ["grid", "Grid"]]}
          onChange={(v) => onPatch(v === "grid"
            ? { direction: "grid", columns: layer.columns ?? 3 }
            : { direction: layer.direction === "grid" ? undefined : layer.direction, columns: undefined },
          "container-type")}
        />
        <SelectField
          label="Content width" attr="content-width" value={layer.contentWidth ?? "boxed"}
          hint="Boxed keeps what is inside within the page width. Full runs edge to edge."
          options={[["boxed", "Boxed"], ["full", "Full width"]]}
          onChange={(v) => onPatch({ contentWidth: v === "full" ? "full" : undefined }, "contentWidth")}
        />
        <NumberField
          label={layer.contentWidth === "full" ? "Width (%)" : "Width (px)"}
          attr="width" value={layer.width} min={0}
          placeholder={layer.contentWidth === "full" ? "100" : "1140"}
          hint="How wide this box runs. Leave it empty for the page's own width."
          onChange={(v) => onPatch({ width: v }, "width")}
        />
        <NumberField
          label="Min height" attr="min-height" value={layer.minHeight} min={0} placeholder="as tall as it needs"
          hint="The box is at least this tall, whatever is in it. Pixels."
          onChange={(v) => onPatch({ minHeight: v }, "minHeight")}
        />
      </Group>

      <Group title="Items" hint="How the things inside this box are arranged" defaultOpen
        onReset={() => onPatch({
          direction: grid ? "grid" : undefined, justify: undefined, alignItems: undefined,
          wrap: undefined, gap: undefined, rowGap: undefined, rows: undefined, autoFlow: undefined,
        }, "items")}>
        <DeviceSegment device={device} onDevice={onDevice} />
        {!grid && (
          <SelectField
            label="Direction" attr="direction" value={layer.direction ?? "column"}
            hint="Which way the things inside run. The reverse pair puts the last one first."
            options={[
              ["column", "Down the page"], ["row", "Across, left to right"],
              ["column-reverse", "Up the page (reversed)"], ["row-reverse", "Across, right to left"],
            ]}
            onChange={(v) => onPatch({ direction: v === "column" ? undefined : v as StyleLayer["direction"] }, "direction")}
          />
        )}
        {grid && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <NumberField
              label="Columns" attr="grid-columns" value={layer.columns ?? 3} min={1} max={12}
              hint="How many even columns the things inside sit in."
              onChange={(v) => onPatch({ columns: v === undefined ? undefined : Math.min(12, Math.max(1, v)) }, "columns")}
            />
            <NumberField
              label="Rows" attr="grid-rows" value={layer.rows} min={1} max={12} placeholder="as many as needed"
              hint="How many rows the grid has. Leave it empty and it makes as many as it needs."
              onChange={(v) => onPatch({ rows: v === undefined ? undefined : Math.min(12, Math.max(1, v)) }, "rows")}
            />
          </div>
        )}
        {grid && (
          <SelectField
            label="Auto flow" attr="grid-auto-flow" value={layer.autoFlow ?? "row"}
            hint="Which way a new cell is added — along a row, or down a column."
            options={[["row", "Fill rows first"], ["column", "Fill columns first"]]}
            onChange={(v) => onPatch({ autoFlow: v === "row" ? undefined : "column" }, "autoFlow")}
          />
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <SelectField
            label="Justify content" attr="justify" value={layer.justify ?? ""}
            hint="Where the things sit along the direction they run in."
            options={[
              ["", "At the start"], ["center", "In the middle"], ["end", "At the end"],
              ["between", "Spread out, edge to edge"], ["around", "Spread out, with room at the ends"],
              ["evenly", "Spread out evenly"],
            ]}
            onChange={(v) => onPatch({ justify: (v || undefined) as StyleLayer["justify"] }, "justify")}
          />
          <SelectField
            label="Align items" attr="align-items" value={layer.alignItems ?? ""}
            hint="Whether the things fill the box across, or line up at one edge."
            options={[
              ["", "Fill the box"], ["start", "At the top or left"], ["center", "In the middle"],
              ["end", "At the bottom or right"], ["stretch", "Fill the box"],
            ]}
            onChange={(v) => onPatch({ alignItems: (v || undefined) as StyleLayer["alignItems"] }, "alignItems")}
          />
        </div>

        {/* GAPS — two numbers and a chain, the reference's own control. */}
        <div style={FIELD}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={L}>Gaps</span>
            <button
              type="button" data-box-field="gaps-link" aria-pressed={linkedGaps}
              title={linkedGaps
                ? "The gap across and the gap down are the same. Click to set each on its own."
                : "Each gap is on its own. Click to make them the same."}
              onClick={() => onPatch({ rowGap: linkedGaps ? (layer.gap ?? 0) : undefined }, "gaps-link")}
              style={{
                marginLeft: "auto", border: "1px solid " + (linkedGaps ? "#0C4A60" : "#CBD5E1"),
                background: linkedGaps ? "#0C4A60" : "#fff", color: linkedGaps ? "#fff" : "#64748B",
                borderRadius: 4, padding: "2px 5px", cursor: "pointer", display: "inline-flex", alignItems: "center",
              }}
            >{linkedGaps ? <Link2 size={11} /> : <Unlink size={11} />}</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 2 }}
              title="The gap BETWEEN columns, in pixels.">
              <span style={{ fontSize: 9, color: "#94A3B8", textAlign: "center" }}>Column</span>
              <input type="number" min={0} style={{ ...INPUT, padding: "4px", textAlign: "center" }}
                data-box-field="gap-column" aria-label="Gap between columns"
                value={layer.gap ?? ""} placeholder="0"
                onChange={(e) => {
                  const n = e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0);
                  onPatch(linkedGaps ? { gap: n } : { gap: n }, "gap");
                }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 2 }}
              title="The gap BETWEEN rows, in pixels.">
              <span style={{ fontSize: 9, color: "#94A3B8", textAlign: "center" }}>Row</span>
              <input type="number" min={0} style={{ ...INPUT, padding: "4px", textAlign: "center" }}
                data-box-field="gap-row" aria-label="Gap between rows" disabled={linkedGaps}
                value={(linkedGaps ? layer.gap : layer.rowGap) ?? ""} placeholder="0"
                onChange={(e) => onPatch(
                  { rowGap: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) }, "rowGap")} />
            </label>
          </div>
        </div>

        {!grid && (
          <SwitchField
            label="Wrap onto a second line" attr="wrap" checked={!!layer.wrap}
            hint="When there is not enough room, let them carry on to a second line rather than squeezing."
            onChange={(on) => onPatch({ wrap: on ? true : undefined }, "wrap")}
          />
        )}
      </Group>

      <Group title="Additional Options" hint="What this box is, and what it does when things do not fit">
        <SelectField
          label="HTML tag" attr="html-tag" value={htmlTag}
          hint="Most boxes are just boxes. Say what this one is and a screen reader, and search, can tell."
          options={[
            ["", "Just a box"], ["header", "The top of the page"], ["main", "The main part of the page"],
            ["section", "A section of the page"], ["article", "A whole article"],
            ["aside", "Something to one side"], ["footer", "The bottom of the page"],
          ]}
          onChange={(v) => onPatchProps({ html_tag: v })}
        />
        <SelectField
          label="Overflow" attr="overflow" value={layer.overflow ?? ""}
          hint="What happens when what is inside is bigger than the box."
          options={[["", "Let it show"], ["hidden", "Cut it off"], ["auto", "Give it a scrollbar"]]}
          onChange={(v) => onPatch({ overflow: (v || undefined) as StyleLayer["overflow"] }, "overflow")}
        />
      </Group>
    </>
  );
}

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
  return (
    <>
      <Group title="Background" hint="What is behind this box" defaultOpen
        onReset={() => onReset(["background"])}>
        <DeviceSegment device={device} onDevice={onDevice} />
        <SelectField
          label="Background type" attr="bg-type" value={bg.type ?? ""}
          hint="A colour or a picture, two colours blending, a film, or pictures that change."
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
                hint="A straight blend, or one that spreads out from the middle."
                options={[["linear", "Straight"], ["radial", "From the middle"]]}
                onChange={(v) => setBg({ gradient: v === "radial" ? "radial" : undefined }, "gradient")}
              />
              <NumberField
                label="Angle" attr="bg-angle" value={bg.angle} placeholder="180"
                hint="Which way the blend runs, in degrees. 180 is top to bottom."
                onChange={(v) => setBg({ angle: v }, "angle")}
              />
            </div>
          </>
        )}
        {bg.type === "classic" && (
          <>
            <TextField
              label="Image" attr="bg-image" value={bg.image ?? ""} placeholder="Paste an image address"
              hint="A picture behind the box. Leave it empty for a plain colour."
              onChange={(v) => setBg({ image: v || undefined }, "image")}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <SelectField
                label="Position" attr="bg-position" value={bg.position ?? ""}
                hint="Which part of the picture stays in view."
                options={[
                  ["", "Middle"], ["center center", "Middle"], ["top center", "Top"], ["bottom center", "Bottom"],
                  ["center left", "Left"], ["center right", "Right"],
                ]}
                onChange={(v) => setBg({ position: v || undefined }, "position")}
              />
              <SelectField
                label="Size" attr="bg-size" value={bg.size ?? ""}
                hint="Cover fills the box and crops. Contain shows all of it."
                options={[["", "Cover the box"], ["cover", "Cover the box"], ["contain", "Show all of it"], ["auto", "Its own size"]]}
                onChange={(v) => setBg({ size: v || undefined }, "size")}
              />
            </div>
            <SelectField
              label="Repeat" attr="bg-repeat" value={bg.repeat ?? ""}
              hint="Whether the picture tiles across the box."
              options={[["", "Once"], ["no-repeat", "Once"], ["repeat", "Tile it"], ["repeat-x", "Tile across"], ["repeat-y", "Tile down"]]}
              onChange={(v) => setBg({ repeat: v || undefined }, "repeat")}
            />
          </>
        )}
        {bg.type === "video" && (
          <>
            <TextField
              label="Video link" attr="bg-video" value={bg.videoUrl ?? ""} placeholder="https://"
              hint="A film that plays behind the box on your website."
              onChange={(v) => setBg({ videoUrl: v || undefined }, "videoUrl")}
            />
            <TextField
              label="Still picture" attr="bg-video-poster" value={bg.image ?? ""} placeholder="Paste an image address"
              hint="What shows before the film starts — and everywhere a film cannot play, like an email."
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
              hint="The pictures the box cycles through on your website."
              onChange={(v) => setBg({ images: v.split(",").map((s) => s.trim()).filter(Boolean) }, "images")}
            />
            <div style={{ fontSize: 10, color: "#B45309", lineHeight: 1.45 }}>
              The pictures change on your website. Everywhere else — an email, a printed copy — the first one is what a
              reader gets.
            </div>
          </>
        )}
      </Group>

      <Group title="Background Overlay" hint="A wash of colour over the background"
        onReset={() => onReset(["overlay"])}>
        <DeviceSegment device={device} onDevice={onDevice} />
        <SelectField
          label="Background type" attr="overlay-type" value={ov.type ?? ""}
          hint="A wash over the background, so words on top of a picture can be read."
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
                hint="How strong the wash is, from 0 (invisible) to 1 (solid)."
                onChange={(v) => setOv({ opacity: v }, "opacity")}
              />
              <SelectField
                label="Blend mode" attr="overlay-blend" value={ov.blend ?? ""}
                hint="How the wash mixes with what is behind it."
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

      <Group title="Border" hint="The edge round this box, and its corners" defaultOpen
        onReset={() => onReset(["border", "radius", "shadow"])}>
        <DeviceSegment device={device} onDevice={onDevice} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <SelectField
            label="Border type" attr="border-style" value={layer.border?.style ?? ""}
            hint="A solid line, a dashed one or a dotted one."
            options={[["", "None"], ["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]}
            onChange={(v) => onPatch({
              border: v ? { ...(layer.border || {}), style: v as "solid" | "dashed" | "dotted" } : undefined,
            }, "border")}
          />
          <NumberField
            label="Border width" attr="border-width" value={layer.border?.width} min={0} placeholder="none"
            hint="How thick the line round this box is, in pixels."
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
            hint={isEmail
              ? "Not in email — Outlook renders through Word and squares the corners off, so this is left out rather than promised."
              : "How round the corners of this box are, in pixels."}
            onChange={(v) => onPatch({ radius: v }, "radius")}
          />
          <SelectField
            label="Box shadow" attr="shadow" value={layer.shadow ?? "none"}
            hint={isEmail
              ? "Not in email — a mailbox drops a shadow, so this is left out rather than promised."
              : "A soft shadow lifts the box off the page."}
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

      <Group title="Shape Divider" hint="A shaped edge at the top or the bottom of this box"
        onReset={() => onReset(["shapeTop", "shapeBottom"])}>
        <DeviceSegment device={device} onDevice={onDevice} />
        <ShapeRows edge="top" spec={layer.shapeTop} swatches={swatches}
          onPatch={(s) => onPatch({ shapeTop: s }, "shapeTop")} />
        <ShapeRows edge="bottom" spec={layer.shapeBottom} swatches={swatches}
          onPatch={(s) => onPatch({ shapeBottom: s }, "shapeBottom")} />
        <div style={{ fontSize: 10, color: "#94A3B8", lineHeight: 1.45 }}>
          A shaped edge shows on a web page. An email and a printed copy leave it out.
        </div>
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
        hint={`The shape cut into the ${edge} edge of this box.`}
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
              hint="How tall the shape is, in pixels." onChange={(v) => set({ height: v })} />
            <NumberField label="Width (%)" attr={`shape-${edge}-width`} value={s.width} min={100} placeholder="100"
              hint="How wide the shape is, out of 100. Over 100 makes it bolder."
              onChange={(v) => set({ width: v })} />
          </div>
          <SwitchField label="Flip" attr={`shape-${edge}-flip`} checked={!!s.flip}
            hint="Mirror the shape left to right." onChange={(on) => set({ flip: on || undefined })} />
          <SwitchField label="Invert" attr={`shape-${edge}-invert`} checked={!!s.invert}
            hint="Turn the shape over, so the cut goes the other way." onChange={(on) => set({ invert: on || undefined })} />
          <SwitchField label="Bring to front" attr={`shape-${edge}-front`} checked={!!s.aboveContent}
            hint="Draw the shape over what is in the box rather than behind it."
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
      <Group title="Motion Effects" hint="Keeping this box in view as the reader scrolls"
        onReset={() => set({ sticky: undefined, stickyOn: undefined, stickyOffset: undefined })}>
        <SelectField
          label="Sticky" attr="sticky" value={s.sticky ?? ""}
          hint="Keep this box in view as the reader scrolls past it."
          options={[["", "No"], ["top", "Stick to the top"], ["bottom", "Stick to the bottom"]]}
          onChange={(v) => set({ sticky: (v || undefined) as ElementStyle["sticky"] })}
        />
        {s.sticky && (
          <>
            <NumberField
              label="Sticky offset" attr="sticky-offset" value={s.stickyOffset} min={0} placeholder="0"
              hint="How far from the edge it stops, in pixels."
              onChange={(v) => set({ stickyOffset: v })}
            />
            <div style={FIELD}>
              <span style={L}>Sticky on</span>
              {PREVIEW_DEVICES.map((d) => (
                <SwitchField
                  key={d.key} label={`On a ${d.label.toLowerCase()}`} attr={`sticky-on-${d.key}`}
                  checked={on.includes(d.key)}
                  hint={`Stick this box on a ${d.label.toLowerCase()}.`}
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
      <Group title="Custom CSS" hint="Your own styling for this box, for anything the controls do not cover"
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
        <div style={{ fontSize: 10, color: "#94A3B8", lineHeight: 1.45 }}>
          The word <code>selector</code> means this box. Three declarations with no <code>selector</code> around them
          are wrapped in one for you.
        </div>
      </Group>
      )}
    </>
  );
}

/* The three control tables are re-exported so a test can assert the panel and
   the table agree without importing two modules. */
export { CONTAINER_LAYOUT_CONTROLS, CONTAINER_STYLE_CONTROLS, CONTAINER_ADVANCED_CONTROLS };


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
  const field: React.CSSProperties = {
    width: "100%", fontSize: 12, padding: "6px 8px",
    border: "1px solid #CBD5E1", borderRadius: 6,
  };
  return (
    <Group title="Attributes" hint="A name for this part, so a link or your own styling can find it" onReset={onReset}>
      <label style={{ fontSize: 11, color: "#5A7A8A" }} title="Elementor calls this the CSS ID.">
        Its own name
        <input
          style={field}
          data-style-css-id
          value={cssId}
          placeholder="e.g. prices"
          onChange={(e) => onPatch({ cssId: e.target.value })}
        />
      </label>
      <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: -4 }}>
        A Menu Anchor and a link like <code>#prices</code> jump to this name. Use it once on a page.
      </div>
      <label style={{ fontSize: 11, color: "#5A7A8A" }} title="Elementor calls these the CSS Classes.">
        Styling names
        <input
          style={field}
          data-style-css-classes
          value={cssClasses}
          placeholder="e.g. tight two-up"
          onChange={(e) => onPatch({ cssClasses: e.target.value })}
        />
      </label>
      <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: -4 }}>
        Separate them with a space. Your own stylesheet can then style every part with the same name.
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

export { L, INPUT, FIELD };
export default Group;

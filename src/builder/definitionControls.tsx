/**
 * builder/definitionControls.tsx — THE PANEL, DRAWN FROM THE DEFINITION ALONE.
 *
 * B-168 §C.1: *"the Inspector renders family controls from the definition alone
 * (tab content|style|advanced + section, per device where the machine file says
 * responsive) with no per-widget code."* Ten agents are about to add well over
 * a hundred widgets. If each one needs a hand-written panel, the Inspector
 * becomes the third 60 KB file every agent conflicts in, and the panel drifts
 * from the definition exactly the way the registry and the renderer did before
 * D-156 put them in one file.
 *
 * So: a family writes controls, and this draws them. Nothing here knows the
 * name of a single widget, and nothing a family adds needs a line in here.
 *
 * ── WHAT MOVED, AND WHY IT MOVED RATHER THAN BEING COPIED ─────────────────
 * This is the block that lived inside `Inspector.tsx`'s Content group, lifted
 * out whole. It is not a second copy: the Inspector now calls this on all three
 * tabs and has no control-drawing code of its own left. Replace means delete.
 * The one change on the way out is that it filters by TAB — the same block drew
 * a widget's Style and Advanced controls on the Content tab before, because it
 * was only ever mounted there.
 *
 * ── PER DEVICE, THE WAY ELEMENTOR ALREADY SPELLS IT ───────────────────────
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json` marks a control
 * `responsive: true` and stores the twins beside the desktop key as
 * `<key>_tablet` and `<key>_mobile` — the machine file literally contains
 * `tabs_justify_horizontal_tablet`. We store them the same way, and `deviceKey`
 * below is the only place that spelling is written on the whole platform, so
 * the panel, the renderer and the arion emitter cannot each invent one.
 *
 * A control the machine file does NOT mark responsive has one value for every
 * screen and no device row, because a device switcher over a control that does
 * not vary is a switch that does nothing.
 */
import React from "react";
import {
  type WidgetControl, type WidgetDef, type ControlTab,
  controlOptions, controlSections, controlTab, optionValue,
} from "./registry";
import type { PreviewKey } from "./responsive";
import { FIELD, INPUT, L, Swatches } from "./StyleGroups";

/**
 * The control types the PANEL draws.
 *
 * Everything else is either typed on the page (`text`, `textarea`, `richtext`,
 * `list`, `money`, `merge` — the engine's one editing mechanism) or carried by
 * the widget and never typed at all (`hidden`).
 */
export const PANEL_CONTROL_TYPES: ReadonlySet<WidgetControl["type"]> = new Set([
  "toggle", "select", "colour", "number", "image", "link", "code",
]);

/**
 * Is a switch ON? Elementor's switcher stores the string "yes"; a checkbox
 * writes a boolean. ONE reader, because "yes" is truthy and `false` is not,
 * and a control that reads only one of the two silently loses the other.
 */
export function isOn(v: unknown): boolean {
  return v === true || v === "yes";
}

/**
 * WHERE A CONTROL'S VALUE IS STORED FOR THIS SCREEN.
 *
 * Desktop is the bare key — the value everything falls back to. Tablet and
 * phone are Elementor's own suffixes, and `phone` is spelled `_mobile` because
 * that is what the machine file, the page engine and every stored Elementor
 * document call it; our own device is named `phone` and the translation happens
 * here, once.
 *
 * A control that is not responsive is the bare key on every screen.
 */
export function deviceKey(control: WidgetControl, device: PreviewKey): string {
  if (!control.responsive || device === "desktop") return control.key;
  return device === "tablet" ? `${control.key}_tablet` : `${control.key}_mobile`;
}

export interface DefinitionControlsProps {
  /** The selected widget's definition. Nothing is drawn without one. */
  def: WidgetDef | null | undefined;
  /** Which of the three tabs is showing. Only its controls are drawn. */
  tab: ControlTab;
  /** The widget's stored properties. */
  props: Record<string, unknown>;
  /** The device being previewed AND edited. One state, from BuilderShell. */
  device: PreviewKey;
  /** The brand kit's colours, for a colour control. */
  swatches?: string[];
  /** Write one property. The key is already resolved for the device. */
  onPatch: (patch: Record<string, unknown>) => void;
}

/** Every control of `def` that belongs on `tab`, in its own panel sections. */
export function DefinitionControls(p: DefinitionControlsProps) {
  const props = p.props || {};
  const onTab = (p.def?.controls || []).filter((c) => controlTab(c) === p.tab);
  const valueOf = (c: WidgetControl) => (props as any)[deviceKey(c, p.device)];
  const patch = (c: WidgetControl, v: unknown) => p.onPatch({ [deviceKey(c, p.device)]: v });

  return (
    <>
      {controlSections(onTab).map((grp) => {
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
              <div key={c.key} style={FIELD} data-control={c.key}
                data-control-key={deviceKey(c, p.device)}
                data-control-responsive={c.responsive ? "yes" : undefined}>
                <span style={L}>{c.label}</span>
                {c.type === "toggle" && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <input type="checkbox" checked={isOn(valueOf(c))}
                      onChange={(e) => patch(c, e.target.checked)} />
                    {c.help || "On"}
                  </label>
                )}
                {c.type === "select" && (controlOptions(c).length ? (
                  <select style={INPUT} value={String(valueOf(c) ?? "")}
                    onChange={(e) => patch(c, optionValue(c, e.target.value))}>
                    {controlOptions(c).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : null)}
                {c.type === "number" && (
                  <input type="number" style={INPUT} value={Number(valueOf(c) ?? 0)}
                    onChange={(e) => patch(c, Number(e.target.value))} />
                )}
                {c.type === "colour" && (
                  <Swatches value={String(valueOf(c) ?? "")} swatches={p.swatches}
                    onPick={(v) => patch(c, v)} />
                )}
                {(c.type === "image" || c.type === "link") && (
                  <input style={INPUT} placeholder={c.type === "image" ? "Paste an image address" : "https://"}
                    value={String(valueOf(c) ?? "")}
                    onChange={(e) => patch(c, e.target.value)} />
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
                      value={String(valueOf(c) ?? "")}
                      onChange={(e) => patch(c, e.target.value)} />
                    <span style={{ fontSize: 10, color: "#5A7A8A" }}>What it looks like</span>
                    <div
                      data-code-preview={c.key}
                      style={{ border: "1px solid #E2E8F0", borderRadius: 4, padding: 8, background: "#fff", overflow: "auto", maxHeight: 220 }}
                      dangerouslySetInnerHTML={{ __html: String(valueOf(c) ?? "") }} />
                  </>
                )}
                {c.help && c.type !== "toggle" && <span style={{ fontSize: 10, color: "#94A3B8" }}>{c.help}</span>}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

export default DefinitionControls;

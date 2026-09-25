/**
 * builder/widgets/glyph.ts — ONE symbol, on every surface.
 *
 * D-165. Five of Elementor's standard widgets draw a symbol: Icon, Icon Box,
 * Icon List, Social Icons and Star Rating. Elementor stores the choice in its
 * `icons` control as `{ value: "fas fa-check", library: "fa-solid" }` and draws
 * it with a webfont.
 *
 * ── WHY A CHARACTER AND NOT A FONT ────────────────────────────────────────
 * The same widget has to draw on four surfaces and one of them is a MAILBOX.
 * A webfont reaches a web page and an author's canvas; it does not reach
 * Outlook, and it does not reach the PDF painter, which has fourteen built-in
 * faces and no way to load a fifth. A font on three surfaces and a blank
 * rectangle on the fourth is not one widget, it is three widgets and a defect.
 *
 * So the STORED value is Elementor's own (`value` + `library`, so a page
 * published to a real Elementor carries the author's actual choice), and what
 * WE draw is a plain character from the table below. A name we do not know
 * falls back to a filled bullet rather than to nothing, because a list whose
 * markers vanished reads as a broken page and a list of bullets reads as a
 * list.
 */

/** Elementor's `icons` control, as it is stored. */
export interface IconValue {
  /** Elementor's own class, e.g. `fas fa-check`. */
  value: string;
  /** Elementor's own library name, e.g. `fa-solid`. */
  library: string;
}

export const DEFAULT_ICON: IconValue = { value: "fas fa-check", library: "fa-solid" };

/**
 * The symbols an author can pick, in the order the picker offers them.
 *
 * Deliberately short. Elementor ships two thousand Font Awesome names; a
 * business owner picking the mark beside "Salt included" needs a tick, not a
 * search box over two thousand. Anything else a page really needs is an Image.
 */
export const ICON_CHOICES: ReadonlyArray<{ value: string; label: string; glyph: string }> = [
  { value: "fas fa-check", label: "Tick", glyph: "✓" },
  { value: "fas fa-times", label: "Cross", glyph: "✕" },
  { value: "fas fa-star", label: "Star", glyph: "★" },
  { value: "fas fa-heart", label: "Heart", glyph: "♥" },
  { value: "fas fa-circle", label: "Dot", glyph: "●" },
  { value: "fas fa-arrow-right", label: "Arrow", glyph: "→" },
  { value: "fas fa-phone", label: "Phone", glyph: "☎" },
  { value: "fas fa-envelope", label: "Envelope", glyph: "✉" },
  { value: "fas fa-map-marker-alt", label: "Map pin", glyph: "▼" },
  { value: "fas fa-clock", label: "Clock", glyph: "◷" },
  { value: "fas fa-info-circle", label: "Information", glyph: "ℹ" },
  { value: "fas fa-exclamation-triangle", label: "Warning", glyph: "⚠" },
  { value: "fas fa-shield-alt", label: "Shield", glyph: "⚑" },
  { value: "fas fa-truck", label: "Truck", glyph: "⚑" },
  { value: "fas fa-snowflake", label: "Snowflake", glyph: "❄" },
  { value: "fas fa-leaf", label: "Leaf", glyph: "❀" },
];

/** What is DRAWN for a stored icon. A bullet when we do not know the name. */
export function glyphFor(icon: unknown): string {
  const value = typeof icon === "string" ? icon : String((icon as any)?.value ?? "");
  const hit = ICON_CHOICES.find((c) => c.value === value);
  return hit ? hit.glyph : "●";
}

/** The stored shape, from whatever the author's control handed back. */
export function iconValue(v: unknown): IconValue {
  if (v && typeof v === "object" && typeof (v as any).value === "string") {
    return { value: (v as any).value, library: String((v as any).library || "fa-solid") };
  }
  if (typeof v === "string" && v) return { value: v, library: "fa-solid" };
  return { ...DEFAULT_ICON };
}

/** The options an `icon` select offers, in the registry's own shape. */
export const ICON_OPTIONS = ICON_CHOICES.map((c) => ({ value: c.value, label: c.label }));

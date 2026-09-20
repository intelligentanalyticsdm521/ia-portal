/**
 * f4-moving/counter.ts — Elementor's **Counter**, by its own name, group,
 * panel sections, control labels and defaults.
 *
 * WAVE 2. This kind already existed, in `widgets/pageOnly.ts`, with six
 * controls and no Style tab at all. It is one of the five an author reaches for
 * first, so it is now Elementor's own panel: Content › Counter, and Style ›
 * Counter / Number / Title.
 *
 * THE KIND ID IS UNCHANGED — `counter`. A family definition of the same kind
 * REPLACES the legacy one through `mergeWidgetDefs` (b168/override), in the
 * legacy one's own place on the panel, and every prop the old definition stored
 * is still read here. A page saved last week opens and draws.
 *
 * ── MACHINE TRUTH, AND THE LIVE PANEL ─────────────────────────────────────
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json` `widgets.counter`: title
 * *Counter*, category `general`, sections `section_counter` (Content, "Counter"),
 * `section_counter_style` (Style, "Counter"), `section_number` (Style, "Number")
 * and `section_title` (Style, "Title"). Checked against the real editor on
 * 2026-09-19 — `elementor-reference/widgets/_g4_f4_panels.json` and
 * `counter.panel.png`: Starting Number, Ending Number, Number Prefix, Number
 * Suffix, Animation Duration (ms), Thousand Separator, Separator, Title, Title
 * HTML Tag, in that order. `show_in_panel` is true, so this is a tile a person
 * really is offered.
 *
 * ── WHO OFFERS IT ─────────────────────────────────────────────────────────
 * `BUILDER_OFFERS_2026-09-19.json`: `website.elementor_free`,
 * `landing.elementor_free` and `proposal.elementor`. The legacy definition was
 * website + landing only, so the PROPOSAL panel gains it here, which is what
 * the offer file has said since 12:58. The newsletter does not offer it and the
 * offer file says why: a mailbox cannot run the script that counts.
 *
 * ── THE CANVAS IS STILL, AND SAYS SO ──────────────────────────────────────
 * On a published page the number counts from Starting Number to Ending Number
 * over Animation Duration. A canvas that animated would be a page the author
 * cannot read while they edit it, so the canvas draws the number AT REST — the
 * ending number, which is what Elementor's own editor shows once its animation
 * has finished. Starting Number and Animation Duration are still honoured, and
 * honoured VISIBLY: in edit mode a line under the number says what will happen
 * and changes when either control changes. Neither control is dead, and the
 * visitor never reads the note. Same shape as Progress Tracker's own note.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { bar, pictureFrom } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyWidgetDef } from "../types";
import {
  TEXT_OF, TITLE_TAG_OPTIONS, WEIGHT_OPTIONS, colour, decl, num, on, px, startEnd, str, tag,
} from "./parts";

/** Elementor's own Separator choices, values and all. */
export const SEPARATOR_CHARS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Default" },
  { value: ".", label: "Dot" },
  { value: " ", label: "Space" },
  { value: "_", label: "Underline" },
  { value: "'", label: "Apostrophe" },
];

/**
 * THE NUMBER AS A VISITOR READS IT.
 *
 * Exported because the arion emitter's test, the PDF half and this file's own
 * test all have to agree about one thing: what "1250 with the separator off"
 * looks like. Elementor's default separator is the comma, and ABSENT means ON,
 * so a stored counter does not change the day it is republished.
 */
export function counterNumber(props: Record<string, unknown>): string {
  const p: any = props || {};
  const end = num(p.ending_number == null ? p.value : p.ending_number, 0, -1e12, 1e12);
  if (!on(p.thousand_separator, true)) return String(end);
  const char = str(p.thousand_separator_char);
  const grouped = Math.trunc(Math.abs(end)).toLocaleString("en-US");
  const body = char ? grouped.replace(/,/g, char) : grouped;
  const frac = String(Math.abs(end)).includes(".") ? String(Math.abs(end)).split(".")[1] : "";
  return `${end < 0 ? "-" : ""}${body}${frac ? `.${frac}` : ""}`;
}

/** The edit-mode sentence that makes Starting Number and Duration real. */
export function counterNote(props: Record<string, unknown>): string {
  const p: any = props || {};
  const from = num(p.starting_number, 0, -1e12, 1e12);
  const seconds = num(p.duration, 2000, 0, 600000) / 1000;
  return `Counts up from ${from} over ${seconds} seconds when a visitor scrolls to it.`;
}

export function renderCounter(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};

  /* ── Style › Counter — where the title sits relative to the number ────── */
  const titlePos = str(p.title_position) === "before" ? "before" : "after";
  const across = startEnd(p.title_horizontal_alignment) || "center";
  const numAcross = startEnd(p.number_alignment) || across;
  const gap = px(p.title_gap, 0, 200);

  /* ── Style › Number ──────────────────────────────────────────────────── */
  const numberStyle = [
    decl("color", colour(p.number_color) || esc(ctx.accent)),
    decl("font-size", px(p.typography_number_font_size, 8, 400) || "36px"),
    decl("font-weight", esc(str(p.typography_number_font_weight)) || "700"),
    "line-height:1.1;",
    decl("text-align", TEXT_OF[numAcross] || "center"),
  ].join("");

  /* ── Style › Title ───────────────────────────────────────────────────── */
  const titleStyle = [
    decl("color", colour(p.title_color)),
    decl("font-size", px(p.typography_title_font_size, 8, 200)),
    decl("font-weight", esc(str(p.typography_title_font_weight))),
    decl("text-align", TEXT_OF[across] || "center"),
  ].join("");

  const number = `<div class="bx-counter-n" style="${numberStyle}">${
    esc(str(p.prefix)) ? `<span class="bx-counter-pre" data-edit="prefix">${esc(str(p.prefix))}</span>` : ""
  }${esc(counterNumber(p))}${
    esc(str(p.suffix)) ? `<span class="bx-counter-suf" data-edit="suffix">${esc(str(p.suffix))}</span>` : ""
  }</div>`;

  /* Elementor's Title HTML Tag really does change the element, so ours does. */
  const title = editRun("title", p.title, "bx-counter-t", "What is being counted?", ctx,
    tag(p.title_tag, "div"));
  const titled = title ? `<div style="${titleStyle}">${title}</div>` : "";

  const note = ctx.mode === "edit"
    ? `<div class="bx-card-note">${esc(counterNote(p))}</div>` : "";

  return `<div class="bx-counter" style="${decl("gap", gap)}display:flex;flex-direction:column;align-items:${
    { start: "flex-start", center: "center", end: "flex-end" }[across]}">${
    titlePos === "before" ? titled + number : number + titled}${note}</div>`;
}

export const COUNTER_DEF: FamilyWidgetDef = {
  kind: "counter",
  /* ELEMENTOR'S OWN TITLE. */
  label: "Counter",
  description: "One big number that counts up as the visitor reaches it — years in business, jobs done.",
  icon: "Hash",
  picture: pictureFrom(bar(20, 10, 24, 12) + bar(16, 28, 32)),
  /* Elementor's own group, read off the machine file's `categories`. */
  category: "General",
  builders: ["website", "landing", "proposal"],
  /* The machine file's own defaults, copied. `thousand_separator` is "yes"
     there, so it is on here — absent must not mean off or every stored counter
     changes the first time it is saved again. */
  defaults: {
    starting_number: 0,
    ending_number: 100,
    prefix: "",
    suffix: "",
    duration: 2000,
    thousand_separator: true,
    thousand_separator_char: "",
    title: "",
    title_tag: "div",
  },
  controls: [
    /* ── Content › Counter — Elementor's own section, labels and order ──── */
    { key: "starting_number", label: "Starting Number", type: "number", tab: "content", section: "Counter" },
    { key: "ending_number", label: "Ending Number", type: "number", tab: "content", section: "Counter" },
    { key: "prefix", label: "Number Prefix", type: "text", tab: "content", section: "Counter" },
    { key: "suffix", label: "Number Suffix", type: "text", tab: "content", section: "Counter" },
    { key: "duration", label: "Animation Duration (ms)", type: "number", tab: "content", section: "Counter" },
    { key: "thousand_separator", label: "Thousand Separator", type: "toggle", tab: "content", section: "Counter" },
    { key: "thousand_separator_char", label: "Separator", type: "select", tab: "content", section: "Counter",
      options: SEPARATOR_CHARS as { value: string; label: string }[] },
    { key: "title", label: "Title", type: "text", tab: "content", section: "Counter" },
    { key: "title_tag", label: "Title HTML Tag", type: "select", tab: "content", section: "Counter",
      options: TITLE_TAG_OPTIONS },

    /* ── Style › Counter ─────────────────────────────────────────────────
       `responsive` is copied from the machine file, never guessed: it marks
       these three, and Elementor stores the twins as `_tablet` / `_mobile`. */
    { key: "title_position", label: "Title Position", type: "select", tab: "style", section: "Counter",
      responsive: true,
      options: [{ value: "before", label: "Before" }, { value: "after", label: "After" }] },
    { key: "title_horizontal_alignment", label: "Title Horizontal Alignment", type: "select", tab: "style",
      section: "Counter", responsive: true,
      options: [{ value: "start", label: "Start" }, { value: "center", label: "Center" }, { value: "end", label: "End" }] },
    { key: "number_alignment", label: "Number Alignment", type: "select", tab: "style", section: "Counter",
      responsive: true,
      options: [{ value: "start", label: "Start" }, { value: "center", label: "Center" }, { value: "end", label: "End" }] },
    { key: "title_gap", label: "Title Gap", type: "number", tab: "style", section: "Counter", responsive: true },

    /* ── Style › Number ──────────────────────────────────────────────────── */
    { key: "number_color", label: "Text Color", type: "colour", tab: "style", section: "Number" },
    { key: "typography_number_font_size", label: "Size", type: "number", tab: "style", section: "Number",
      responsive: true },
    { key: "typography_number_font_weight", label: "Weight", type: "select", tab: "style", section: "Number",
      options: WEIGHT_OPTIONS },

    /* ── Style › Title ───────────────────────────────────────────────────── */
    { key: "title_color", label: "Text Color", type: "colour", tab: "style", section: "Title" },
    { key: "typography_title_font_size", label: "Size", type: "number", tab: "style", section: "Title",
      responsive: true },
    { key: "typography_title_font_weight", label: "Weight", type: "select", tab: "style", section: "Title",
      options: WEIGHT_OPTIONS },
  ],
};

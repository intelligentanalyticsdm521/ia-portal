/**
 * builder/registry.ts — ONE widget registry for every builder.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §3.2, step 0. DEFINITIONS ONLY: no
 * renderers yet. What this file settles is the vocabulary — one name, one
 * picture and one plain sentence per widget — so the four builders stop
 * inventing their own.
 *
 * ── WHAT IT REPLACES ──────────────────────────────────────────────────────
 * The inventory found FIVE form-field vocabularies, THREE spellings of "a
 * heading" (four counting the proposal), and exactly one registry anywhere on
 * the platform that bothered to say what a thing is FOR: SparkFormBuilderPage's
 * FIELD_TYPE_META (label + icon + one-line description). That shape is the
 * pattern here, widened with the two things SD-010 asks for and it lacks — a
 * picture, and which builders may use the widget.
 *
 * ── SD-010, IN FIELDS ─────────────────────────────────────────────────────
 *   "A side pane of widgets/blocks with a picture and one line of what each is
 *    for … tooltips on every button … guided counts ('how many cards?', 2–6)."
 *
 *   picture      a tiny inline SVG, drawn as the SHAPE the widget makes on the
 *                page. Not an icon of a concept: a comparison-card widget shows
 *                three cards, because a business owner recognises the layout
 *                long before they recognise the word.
 *   description  ONE line, in a business owner's words. The acceptance row for
 *                every builder walk is "could a client build this without
 *                reading anything?", and this sentence is where that is won or
 *                lost. No jargon: not "a flex container with N children" but
 *                "Two to six plans side by side, with one marked Recommended".
 *   count        the guided question, where a widget has one. `{ min, max,
 *                label }` is what the pane asks BEFORE inserting.
 *   adapters     which builders may offer it. A countdown is an email trick and
 *                a gallery is a website one; offering either in a proposal
 *                would be offering something the output cannot render.
 *
 * ── PURE ON PURPOSE ───────────────────────────────────────────────────────
 * No React, no lucide import: `icon` is the lucide NAME and WidgetPane maps it.
 * That keeps this module importable by `node --test` (scripts/test-ts-loader
 * only takes pure modules), which is how test/builder-registry.test.mjs can
 * check that every widget really has a label, a description, a picture and an
 * adapter.
 */

/** The output adapters of §3.4. A widget declares which ones can render it. */
export type BuilderAdapter =
  /** Customer documents: proposals, agreements, quotes. The document renderer + PDF. */
  | "proposal"
  /** The ARION website builder, through elementorAdapter.js to Elementor. */
  | "website"
  /** SPARK campaigns, templates and newsletters. Table-based email HTML. */
  | "email"
  /** SPARK hosted landing pages. */
  | "landing"
  /** My Brand's Template Studio — a pixel canvas, so only widgets that make
   *  sense as a placed object. */
  | "brand";

export const BUILDER_ADAPTERS: BuilderAdapter[] = ["proposal", "website", "email", "landing", "brand"];

/**
 * THE LEFT PANEL'S GROUPS — Elementor's own, in Elementor's own order.
 *
 * §11.13.1: *"groups Layout / Basic / General / Intelligent Analytics, tiles two
 * across with Elementor's own names"*. Looked at in the live editor on
 * 2026-09-19: Layout holds Container and Grid, Basic holds nine, General holds
 * the rest, and everything after that is a plugin's own group — which is what
 * Intelligent Analytics is.
 *
 * WHAT THIS REPLACES. Nine invented groups — Sections, Document, Text, Media,
 * Layout, Money, Information, Capture, Trust — and, on top of them, a SECOND
 * grouping by "job" in `widgetTasks.ts`. Two vocabularies for one panel. There
 * is one now, and `widgetTasks` reads it.
 */
export type WidgetCategory =
  /** The box everything else goes in: Container, and Grid. */
  | "Layout"
  /** Elementor's Basic: Inner Section, heading, image, text, video, button… */
  | "Basic"
  /** Elementor Pro's own group: Posts, Form, Price Table, Reviews, Slides… */
  | "Pro"
  /** Elementor's General: the boxes, the lists, the panels, the embeds. */
  | "General"
  /** Elementor's theme pieces: Site Logo, Site Title, Page Title, Post Title… */
  | "Site"
  /** Ours. A plugin's own group, exactly as Elementor draws one. */
  | "Intelligent Analytics";

/**
 * THE GROUPS, IN ELEMENTOR PRO'S OWN ORDER — CHANGED 2026-09-19 (D-168, item 6).
 *
 * Read off `elementorPanel.ts`, machine-cut from a real Pro install: Layout,
 * Basic, Pro, General, Site, then a plugin's own group, which is ours.
 *
 * WHAT THIS REPLACES. Four groups, with Elementor's 37 Pro widgets sitting in
 * **General** behind a padlock and its 13 theme widgets with nowhere to go.
 * That was a difference a person sees the second they open the panel beside the
 * real editor, and the reason given for it — "no widget carries that category
 * yet" — stopped being true the moment the families landed. A group with
 * nothing offered for THIS builder is still not drawn: `widgetGroups.panelGroups`
 * drops an empty one, so a proposal panel has no Site group and never did.
 */
export const WIDGET_CATEGORIES: WidgetCategory[] = [
  "Layout", "Basic", "Pro", "General", "Site", "Intelligent Analytics",
];

/**
 * ONE OPTION OF A SELECT — the value that is STORED, and the words a person
 * reads.
 *
 * The catalogue's own controls are exactly this pair (`h3` = "H3",
 * `space-between` = "Space Between"), and a control whose stored value has to
 * be the catalogue's cannot have it derived from an English label: "Biggest"
 * does not slugify to `h2`, and "I type it with the price" does not slugify to
 * the empty string. So a select may declare its options either way and ONE
 * normaliser answers for both — `controlOptions` below.
 */
export interface WidgetOption {
  value: string;
  label: string;
}

/**
 * The PANEL SECTION a control belongs to.
 *
 * The catalogue groups a widget's controls into named sections — the price
 * table's Content tab is Heading · Pricing · Features · Footer · Ribbon — and
 * an author who has built a pricing card anywhere expects those five, in that
 * order. A control with no section sits in the panel's own body, which is
 * where every control on the platform sat before this.
 */
export type ControlSection = string;

/** Elementor's three panel tabs, and ours. */
export type ControlTab = "content" | "style" | "advanced";

/* WHEN A CONTROL IS DRAWN AT ALL — Elementor's `condition`, whose arithmetic
   is `controlCondition.ts` (pure, so `node --test` executes it) and whose only
   trace here is the field on `WidgetControl` below. Re-exported so a family
   file types a condition without importing a second module. */
export type { ControlCondition } from "./controlCondition";
import type { ControlCondition } from "./controlCondition";
/* …and what a SIZE control says it is measured in. Type-only, so this adds no
   import at runtime and no cycle: `style.ts` is the one place a unit is named. */
import type { UnitLabel } from "./style";

export const CONTROL_TABS: ControlTab[] = ["content", "style", "advanced"];

/** Which tab this control is on. `content` unless it says otherwise. */
export function controlTab(control: WidgetControl): ControlTab {
  return control.tab ?? "content";
}

/** One editable property of a widget. Renderers come later; this is the shape. */
export interface WidgetControl {
  key: string;
  label: string;
  /**
   * The control's kind. Eleven of these are the engine's own; two are the
   * catalogue's own names for shapes the engine did not have:
   *
   *   `code`    a box of markup, drawn with a LIVE PREVIEW under it and the
   *             plain sentence that it goes on the page exactly as typed.
   *             Elementor's `Controls_Manager::CODE` (A.1).
   *   `hidden`  a value the widget carries and no author types — the Binding
   *             section's `_ia_source` / `_ia_selection` / `overrides`. It is
   *             declared so the section can be READ as a whole, and the
   *             Inspector draws no field for it. Elementor's
   *             `Controls_Manager::HIDDEN` (A.1).
   */
  type: "text" | "textarea" | "richtext" | "number" | "money" | "colour" | "select" | "toggle"
      | "image" | "link" | "list" | "merge" | "code" | "hidden";
  /**
   * WHICH TAB of the right-hand panel it is drawn on (D-165, §11.13.1).
   *
   * Elementor's three, and the machine file says which one every control is on
   * — `heading`'s `title` is `content`, its `title_color` is `style`, and the
   * whole Advanced stack is `advanced`. Absent means `content`, which is where
   * every control on the platform sat before this field existed, so nothing
   * already declared moves.
   */
  tab?: ControlTab;
  /**
   * SET SEPARATELY ON PHONE AND TABLET (B-168 §C.1).
   *
   * `true` only where the machine file
   * (`BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`) marks the control
   * `responsive: true` — copied, never guessed. Elementor stores the twins as
   * `<key>_tablet` and `<key>_mobile` beside the desktop key, and so do we:
   * `deviceKey()` in `definitionControls.tsx` is the only place that spelling
   * is written, so the panel, the renderer and the emitter cannot each invent
   * one. Absent means one value for every screen, which is what every control
   * declared before this field existed.
   */
  responsive?: boolean;
  /** One line under the field, when the label alone is not enough. */
  help?: string;
  options?: string[] | WidgetOption[];
  /** Which named group of the panel it is drawn in. See ControlSection. */
  section?: ControlSection;
  /**
   * ONE BLANK ROW of a `list` control — Elementor's `repeater_fields`, said as
   * a value. Declaring it is what turns the control into a REPEATER in the
   * panel, with Elementor's add, duplicate and delete (`repeater.ts`). A `list`
   * that declares neither this nor `cellsFrom` is typed on the page, exactly as
   * it is today.
   */
  row?: unknown;
  /** A `list` whose rows are lines of cells, one per entry of this control. */
  cellsFrom?: string;
  /**
   * DRAWN ONLY WHEN ANOTHER CONTROL SAYS SO — Elementor's `condition`
   * (2026-09-20, the settings audit's round 4).
   *
   * `{ look: "line_text" }` is "only when Add Element is Text"; a key ending in
   * `!` is "is not", so `{ "view!": "default" }` is "only when View is not
   * Default" and `{ "text!": "" }` is "only once there are words". Every term
   * must hold. The arithmetic — and the reference's own driven conditions, key
   * by key — is `controlCondition.ts`; declaring one here is all a family does.
   */
  condition?: ControlCondition;
  /**
   * A SIZE, AND WHAT IT IS MEASURED IN (2026-09-20, audit round 4 row 36).
   *
   * Driven: every size in the reference's panel — Space, Width, Weight, Gap,
   * Size, Rotate, Paragraph Spacing, Columns Gap — is a slider with a number
   * box and a unit beside it, and ours were bare pixel boxes. A `number`
   * control that declares this is drawn as the SAME `Slider` the container
   * already uses, so there is one size control on the platform and not two.
   *
   * ONE unit per control, on purpose. A widget size is a bare number its own
   * renderer writes the unit after — a Divider's Weight is `border-top:Npx`, an
   * Icon's Rotate is `rotate(Ndeg)` — so the list says what the page will get.
   * Offering a second before the renderer, the mailbox, the PDF and arion can
   * all carry it would be a control that changes nothing, which is the defect
   * this whole pass is about.
   */
  units?: ReadonlyArray<UnitLabel>;
  /** The far end of that slider. The number box may go past it; the slider may not. */
  max?: number;
  /**
   * DRAW THIS ONE IN THE PANEL TOO (2026-09-20).
   *
   * Words are typed ON THE PAGE here — D-01, the platform's one editing
   * mechanism — so a `text` or `textarea` control is declared (the emitter and
   * the tests read it) and the panel draws nothing for it. That is right for
   * the words INSIDE a widget, and wrong for the one control the reference
   * puts at the top of a Heading's Content tab: an author who lands on an
   * empty page and presses Heading sees a blank line, and the panel that is
   * supposed to say what a Heading has says nothing about its words.
   *
   * A presence test on the CONTROL, exactly like `row` above, and for the same
   * reason: the widget that wants a box says so, rather than every `textarea`
   * on the estate growing one because a type was added to a set. It is the
   * SAME stored key the canvas writes, so there is one place the words live
   * and two doors to it — which is what the reference does.
   */
  panel?: boolean;
}

/**
 * A label → the value it is stored as.
 *
 * Lifted out of the Inspector, where it was a private function, because the
 * registry is what declares the options and a second copy of this rule is a
 * second answer to "what got saved". Pure, so the tests can pin a control's
 * values against the machine files without rendering anything.
 */
export function optionKey(option: string): string {
  return option.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** Every option of a select, in the one shape the Inspector draws. */
export function controlOptions(control: WidgetControl): WidgetOption[] {
  const raw = control.options || [];
  return (raw as Array<string | WidgetOption>).map((o) =>
    (typeof o === "string" ? { value: optionKey(o), label: o } : o));
}

/** The value to store for what the author just chose in a select. */
export function optionValue(control: WidgetControl, chosen: string): string {
  const opts = controlOptions(control);
  return opts.some((o) => o.value === chosen) ? chosen : optionKey(chosen);
}

/** Controls grouped into their panel sections, in declaration order. */
export function controlSections(
  controls: WidgetControl[],
): Array<{ section: ControlSection | null; controls: WidgetControl[] }> {
  const out: Array<{ section: ControlSection | null; controls: WidgetControl[] }> = [];
  for (const c of controls) {
    const section = c.section ?? null;
    const last = out[out.length - 1];
    if (last && last.section === section) last.controls.push(c);
    else out.push({ section, controls: [c] });
  }
  return out;
}

/** The guided question SD-010 asks before inserting a widget that repeats. */
export interface WidgetCount {
  min: number;
  max: number;
  /** Asked once, in words: "How many cards?" */
  label: string;
  default: number;
}

/**
 * A sentence, or a sentence PER BUILDER (D-30, C-A-2 / N-4).
 *
 * One string served five adapters, so *"A title for the section, optionally
 * numbered like “1. Scope of work”"* read that way in the email, the website,
 * the landing page and the social-graphic pane. BUILDER_UX_SPEC §M-26: a widget
 * offered in four builders has four lines, or it is not offered in all four.
 *
 * A plain string still means "the same in every builder", which is correct for
 * a widget whose job does not change with the medium. The map form is resolved
 * against the adapter the pane is already being drawn for, and falls back to
 * the `proposal` wording only when the map has nothing for that adapter — a
 * missing sentence must never blank the line under a widget's name.
 */
export type AdapterText = string | Partial<Record<BuilderAdapter, string>>;

export interface WidgetDef {
  kind: string;
  label: string;
  /** Where a medium calls this something else. Rare; `label` is the default. */
  labels?: Partial<Record<BuilderAdapter, string>>;
  /** ONE line, in a business owner's words, per medium. See the header. */
  description: AdapterText;
  /* `task` LIVED HERE and is DELETED (D-165). A widget's group is its
     `category` — Elementor's own four — and a second field naming a second
     grouping is exactly how the pane and the picker came to show two different
     lists. See widgetTasks.ts. */
  /** lucide-react icon NAME. WidgetPane maps it; this module stays pure. */
  icon: string;
  /** A small inline SVG data URI showing the SHAPE this widget makes. */
  picture: string;
  category: WidgetCategory;
  /**
   * WHERE THIS TILE SITS INSIDE ITS GROUP, from zero. B-168 / D-168 item 3.
   *
   * For an Elementor widget it is the position Elementor's own panel gives it,
   * read from `elementorPanel.ts` — a family need not even write it: `panelAt`
   * below looks the label up when the definition is silent. For one of OURS it
   * is the position in the Intelligent Analytics group, which Elementor cannot
   * answer for, so an IA widget declares it.
   *
   * WHAT THIS REPLACES: `PANEL_ORDER`, one flat list in this file that every
   * one of the ten family agents had to append its kinds to — ten conflicts in
   * one line, and a widget that sorted LAST in its group whenever somebody
   * forgot. `PANEL_ORDER` is still read, for the widgets that were here before
   * the families and do not carry an `order`, and `panelAt` is the one place
   * the two are reconciled.
   */
  order?: number;
  /** Which builders may offer it. Never empty. */
  adapters: BuilderAdapter[];
  /**
   * WHICH GATE applies to this widget — `free`, `pro`, or `ia:<product>`.
   *
   * Absent means `free`, which is what every widget on the platform was until
   * this field existed. It is a fact about the WIDGET (a price table is a paid
   * page widget wherever it lands; a product card needs a catalogue to read),
   * never a fact about a business — WHETHER a business passes the gate is the
   * server's answer and stays there, `adapters/website/sitePlan.ts`. See
   * `builder/tier.ts` for why the two are separate questions.
   */
  tier?: WidgetTier;
  /** The starting content when it is dropped on the canvas. */
  defaults: Record<string, unknown>;
  controls: WidgetControl[];
  /** Present when the pane must ask "how many?" first. */
  count?: WidgetCount;
  /**
   * In the vocabulary, but never offered in the pane or the gallery.
   *
   * One case today: the website adapter's "Custom section (kept as is)", which
   * is what a section somebody built on the site itself becomes on the canvas.
   * It has to be a first-class widget so the canvas can draw it and the save
   * can carry it back byte for byte — and it must never be something a client
   * can ADD, because there is nothing to add.
   */
  hidden?: boolean;
}

/* ══════════════════════════════════════════════════════════════════════════
   Pictures — moved to ./pictures (D-156 stream B)
   ===================================================================== */

/* A widget now declares itself in its own module under `widgets/`, and this
   file collects those declarations. A widget module reaching back in here for
   `pictureFrom` would make the two files import each other at evaluation time,
   so the three picture helpers live in `./pictures`, which neither side owns.
   `pictureFrom` is re-exported here, so every existing caller is unchanged. */
export { pictureFrom } from "./pictures";
import { pictureFrom, bar, box, solid } from "./pictures";
import type { WidgetTier } from "./tier";
export type { WidgetTier } from "./tier";
/* D-156 — the atomic widgets, each declared in its own file beside the
   function that draws it. Spread into WIDGETS below: one vocabulary, still. */
import { ATOM_WIDGET_DEFS } from "./widgets";
/* B-168 §C.1 — THE TEN FAMILIES. One import, one spread (see WIDGETS below).
   Ten agents add widgets in ten folders under `widgets/families/` and none of
   them ever opens this file again. */
import { FAMILY_WIDGET_DEFS } from "./widgets/families";
/* D-168 item 3 and item 6 — ELEMENTOR'S OWN PANEL, machine-cut from the two
   2026-09-17 scrapes by `scripts/gen-elementor-panel.mjs`. Which group a tile
   is in and where in that group it sits are Elementor's answers, not ours. */
import { elementorPlace } from "./elementorPanel";
export { ELEMENTOR_PANEL, elementorPlace } from "./elementorPanel";
export type { ElementorGroup } from "./elementorPanel";
/* The one name for the one node that holds children. `treeOps` owns it; the
   panel's Container tile is that node and must not spell it a second time. */
import { CONTAINER_KIND } from "./treeOps";

/**
 * THE GRID TILE'S KIND — a preset, never a stored kind.
 *
 * Elementor's Layout group offers Container and Grid as two tiles, and both
 * insert a container: one laid out as flex, one as grid. So this string exists
 * only between the tile being clicked and `LAYOUT_PRESETS` turning it into a
 * container, and `presetFor` is the only reader.
 */
export const GRID_PRESET_KIND = "grid";

/**
 * INNER SECTION — the reference's own legacy two-column section, as a preset.
 *
 * Elementor still lists Inner Section under Basic and the offer file offers it
 * on the website and the landing page, so the tile exists. What it inserts is
 * NOT a legacy `section`/`column` node: it is a Container running as a row
 * with two Containers in it, which is what an inner section IS once the legacy
 * dialect is gone (plan §A row 2: *"legacy dialect; Container replaces it"*).
 * A second node type would be a second thing the three server mirrors, the
 * Elementor writer and every stored document had to learn, for a shape the
 * author can already pull apart.
 */
export const INNER_SECTION_PRESET_KIND = "inner-section";

export interface LayoutPreset {
  kind: string;
  style: Record<string, unknown>;
  /** One child container per entry, with its own style. Usually none. */
  children?: Array<Record<string, unknown>>;
}

/**
 * WHAT A LAYOUT TILE ACTUALLY INSERTS.
 *
 * `kind` is always the container; `style` and `children` are the difference.
 * One place, so the pane, the picker and the ready-made sections cannot each
 * decide what a Grid or an Inner Section is.
 */
export const LAYOUT_PRESETS: Readonly<Record<string, LayoutPreset>> = {
  [CONTAINER_KIND]: { kind: CONTAINER_KIND, style: {} },
  [GRID_PRESET_KIND]: { kind: CONTAINER_KIND, style: { direction: "grid", columns: 3, gap: 16 } },
  [INNER_SECTION_PRESET_KIND]: {
    kind: CONTAINER_KIND,
    style: { direction: "row", gap: 20 },
    children: [{}, {}],
  },
};

/** The node a clicked tile inserts, when the tile is a layout preset. */
export function presetFor(kind: string): LayoutPreset | null {
  return LAYOUT_PRESETS[kind] ?? null;
}
/* 11.13.2 (stream 3). See the spread in WIDGETS below for why this is here. */
/* B-168 LANDED: the two lines marked `b168/demo TEMP` are DELETED.
   The IA family is reached through the ONE family index, like every
   other family. */
import { CATALOGUE_TILE_DEFS } from "./proposal/catalogueTiles";


/* ══════════════════════════════════════════════════════════════════════════
   THE registry — §3.2's union, as definitions
   ══════════════════════════════════════════════════════════════════════════ */

const ALL: BuilderAdapter[] = ["proposal", "website", "email", "landing", "brand"];
/**
 * Every builder whose page is a FLOW: sections stack, a widget takes the width
 * it is given, and "space between things" is a property. My Brand's canvas is
 * absolute pixels, so the three widgets that only mean something in a flow
 * (columns, spacer) and the two that are really small tables (key facts, data
 * table) are offered to these four and not to the studio. Everything else on
 * ALL genuinely has a pixel meaning — a heading is a text layer, a divider is a
 * line, a button is a rounded block with a label on it.
 */
const FLOWS: BuilderAdapter[] = ["proposal", "website", "email", "landing"];
/** My Brand's Template Studio only. A logo, a QR code and a colour block are
 *  placed objects, not page furniture. */
const CANVAS: BuilderAdapter[] = ["brand"];
/**
 * The two small tables — a details list and a plain table. Three separate
 * decisions, taken on three branches, each took a builder away, and what is
 * left is the document:
 *   · not the pixel canvas — a table has no meaning at absolute x/y (§5 step 5)
 *   · not a website — that job is a whole section the SERVER builds,
 *     `site_stats` for a details list and `content` for a plain table
 *     (§4 step 3, WEBSITE_USES_A_SECTION_INSTEAD below)
 *   · not an email or a landing page — a details grid is two columns of text,
 *     and a data table inside an email's own layout tables is the thing
 *     Outlook reflows worst (§7, THE EMAIL SUBSET below)
 *
 * Kept as its own name rather than folded into DOCUMENTS so the three reasons
 * have one place to live, and so the next builder that wants a table has to
 * come here and say why. All three exclusions are asserted — the website half
 * by website-builder.test.mjs, the other two by builder-registry.test.mjs.
 */
const SMALL_TABLES: BuilderAdapter[] = ["proposal"];
const DOCUMENTS: BuilderAdapter[] = ["proposal"];
const PAGES: BuilderAdapter[] = ["website", "landing"];
const SENDS: BuilderAdapter[] = ["email"];

/* `WEBSITE_USES_A_SECTION_INSTEAD` LIVED HERE and is DELETED (D-165).
   It was a map of nine widgets the website pane withheld because an ARION
   SECTION did that job — pricing_table → site_pricing, testimonial →
   site_testimonials, and so on. §11.13.1 moves the twelve whole-page sections
   off the widget panel altogether ("Add section → Blank or Template"), and six
   of the nine widgets it named are deleted outright. What is left is one rule
   with one enforcement: the website pane offers §11.13.3's list, in order, and
   `test/builder-widget-set.test.mjs` pins it by name. A map of exceptions to a
   list that is itself pinned is a second answer to the same question. */

/* ── THE EMAIL SUBSET, 2026-09-16 ───────────────────────────────────────────
   Q2, answered by Brandon: "same canvas, new interface, RESTRICTED widget
   set". §7 names the set: heading, text, image, button, divider, spacer,
   columns, article card, product/pricing card, social links, footer with the
   unsubscribe, plus a personal note that takes merge tags. A bullet list joins
   them because a list is three <li> in a table cell and every newsletter has
   one.

   Everything else lost its "email" adapter in the same pass, and each for a
   reason a mailbox enforces rather than a preference:
     pricing_table     a rate card is a document, not a send
     key_value_table
     data_table        a table inside a layout table, in Outlook
     callout           a tinted panel is what a coloured section already is
     countdown         a live timer is an animated GIF from a third party, and
                       §"no third-party product surface" says no
     testimonial       it is a paragraph with a name under it; the newsletter
                       templates place one
     logo_strip        images side by side is what a 2/3-column section does
     merge_field       every run of text takes merge tags; a widget whose whole
                       job is one token is a fourth way to do one thing
     footer_note       email_footer carries the small print AND the two things
                       the law requires

   The landing set is trimmed the same way, to §7's "hero, text, image, form,
   button, columns, spacer, divider, footer" plus the headings, lists, reviews
   and social row a real page needs. A hosted landing page is "a headline, some
   copy, a picture, a button and a way to be contacted" — anything past that is
   a website, and that is the website builder's job. ─────────────────────── */

/**
 * THE WIDGETS THAT WERE HERE BEFORE THE FAMILIES.
 *
 * Not the list the panel reads — `WIDGETS` below is, and a family definition of
 * the same `kind` REPLACES the entry here. See `mergeWidgetDefs`.
 */
const LEGACY_WIDGETS: WidgetDef[] = [
  /* ══════════════════════════════════════════════════════════════════════
     LAYOUT — Elementor's first group, and it holds exactly two things.
     ══════════════════════════════════════════════════════════════════════
     Both are the SAME node, `container`. Grid is that box with
     `style.direction = "grid"`, which is why it is a PRESET and not a second
     kind — §11.13.1: *"columns are a Container set to row, or Grid"*. A second
     node type would be a second thing the three server mirrors, the Elementor
     writer and every stored document had to learn, for a switch the Inspector
     already has. `LAYOUT_PRESETS` below says what is actually inserted, and a
     test asserts nothing is ever STORED with kind `grid`. */
  {
    kind: CONTAINER_KIND,
    label: "Container",
    description: "A box you drop things into. Set it to a row for columns, or a column for a stack.",
    icon: "Square",
    picture: pictureFrom(box(6, 6, 52, 28) + bar(12, 14, 18) + bar(12, 24, 28)),
    category: "Layout",
    /* NOT the studio (D-165). A Container arranges things in a FLOW —
       direction, gap, wrap — and My Brand's canvas is absolute pixels, where
       every layer already carries its own x, y, w and h. The studio's own test
       catches a tile whose button does nothing, and it is right to. */
    adapters: FLOWS,
    defaults: {},
    controls: [
      { key: "html_tag", label: "HTML Tag", type: "select", tab: "advanced", section: "Layout",
        options: ["div", "header", "footer", "main", "article", "section", "aside"] },
    ],
  },
  {
    kind: GRID_PRESET_KIND,
    label: "Grid",
    description: "A box laid out in even columns — three cards across, six pictures in a grid.",
    icon: "Grid3x3",
    picture: pictureFrom(box(6, 6, 24, 12) + box(34, 6, 24, 12) + box(6, 22, 24, 12) + box(34, 22, 24, 12)),
    category: "Layout",
    /* NOT the studio (D-165). A Container arranges things in a FLOW —
       direction, gap, wrap — and My Brand's canvas is absolute pixels, where
       every layer already carries its own x, y, w and h. The studio's own test
       catches a tile whose button does nothing, and it is right to. */
    adapters: FLOWS,
    defaults: {},
    controls: [
      { key: "columns", label: "Columns", type: "number", tab: "content", section: "Layout" },
    ],
  },
  /* INNER SECTION — Elementor's own tile, under Basic, where Elementor puts
     it. It is on the website and the landing page because the offer file
     offers it there and on neither of the other three: an inner section is a
     page shape, and a proposal's boxes and My Brand's canvas have their own.
     `INNER_SECTION_PRESET_KIND` above says what it inserts — a row Container
     holding two Containers, which the author can pull apart. */
  {
    kind: INNER_SECTION_PRESET_KIND,
    label: "Inner Section",
    description: "Two boxes side by side inside this one — a picture beside some words, or two columns of text.",
    icon: "Columns2",
    picture: pictureFrom(box(6, 8, 24, 24) + box(34, 8, 24, 24)),
    category: "Basic",
    adapters: PAGES,
    defaults: {},
    controls: [],
  },

  /* D-165 — THE WIDGETS THAT DECLARE THEMSELVES. Each one is a file under
     `widgets/` holding its definition, its controls and the function that
     draws it, and the list is spread in here so there is still exactly ONE
     vocabulary. See widgets/index.ts. */
  ...ATOM_WIDGET_DEFS,

  /* THE THREE RECORD WIDGETS LIVED HERE and are DELETED (D-167, b168/demo).
     Customer, Service Location and Business Info were blocks of facts - one
     special-purpose widget each - and one fact is a **Custom Field**, which
     the IA family spreads in on the next line. A stored block unpacks into a
     Container of Custom Fields on open (`upgrade.ts`, mirrored by oliver-api
     `lib/deletedKinds.js` on the server door). */
  /* …and the two TILES that load products. Neither is ever on a page: the
     adapter's `onInsertWidget` opens the one catalogue picker and drops
     `catalog_card` / `price_line` per pick (proposal/catalogueTiles.ts). */
  ...CATALOGUE_TILE_DEFS,
  /* ── Text ──────────────────────────────────────────────────────────── */
  {
    kind: "heading",
    label: "Heading",
    description: {
      proposal: "A title for the section, optionally numbered like “1. Scope of work”.",
      website: "A title for this band of the page — the line somebody skims before they read.",
      email: "A title inside the email — the line that carries the eye down to the next part.",
      landing: "A title for this band of the page — the line a visitor reads first.",
      brand: "A line of big type on the design — the words people read from across the room.",
    },
    icon: "Heading",
    picture: pictureFrom(bar(10, 14, 44, 6) + bar(10, 24, 28)),
    category: "Basic",
    adapters: ALL,
    defaults: { text: "", level: 2, numbered: false },
    controls: [
      { key: "text", label: "Heading", type: "text" },
      { key: "level", label: "Size", type: "select", options: ["Page title", "Section", "Sub-section"] },
      { key: "numbered", label: "Number this section", type: "toggle", help: "Adds 1., 2., 3. automatically down the page." },
    ],
  },
  {
    kind: "paragraph",
    label: "Text Editor",
    description: {
      proposal: "Ordinary writing — a sentence or a few, with bold and links.",
      website: "Ordinary writing on the page — a sentence or a few, with bold and links.",
      email: "Ordinary writing in the email — a sentence or a few, with bold and links.",
      landing: "Ordinary writing on the page — a sentence or a few, with bold and links.",
      brand: "A block of smaller type under the headline.",
    },
    icon: "AlignLeft",
    picture: pictureFrom(bar(8, 10, 48) + bar(8, 18, 48) + bar(8, 26, 30)),
    category: "Basic",
    adapters: ALL,
    defaults: { text: "" },
    controls: [{ key: "text", label: "Text", type: "richtext" }],
  },
  {
    kind: "list",
    label: "Icon List",
    description: {
      proposal: "A list of short points, one per line.",
      website: "A list of short points a visitor can skim, one per line.",
      email: "A list of short points, one per line — the part people actually read.",
      landing: "A list of short points a visitor can skim, one per line.",
      brand: "A short list on the design, one point per line.",
    },
    icon: "List",
    picture: pictureFrom(
      `<circle cx="11" cy="12" r="2" fill="#94A3B8" stroke="none"/>` + bar(18, 10, 38) +
      `<circle cx="11" cy="22" r="2" fill="#94A3B8" stroke="none"/>` + bar(18, 20, 30) +
      `<circle cx="11" cy="32" r="2" fill="#94A3B8" stroke="none"/>` + bar(18, 30, 34)),
    category: "General",
    /* NOT My Brand (D-168). The offer file's `mybrand` list is ten Elementor
       widgets and Icon List is not one of them: a social graphic is a headline,
       a picture and a line of type, not a bulleted list. FLOWS, not ALL. */
    adapters: FLOWS,
    defaults: { items: ["", "", ""] },
    controls: [{ key: "items", label: "Points", type: "list" }],
  },

  /* ── Media ─────────────────────────────────────────────────────────── */
  {
    kind: "image",
    label: "Image",
    description: {
      proposal: "One photo or graphic, with an optional caption.",
      website: "One photo or graphic on the page, with an optional caption.",
      email: "One photo or graphic in the email, with an optional caption.",
      landing: "One photo or graphic on the page, with an optional caption.",
      brand: "A photo or graphic placed on the design — drag its corners to size it.",
    },
    icon: "Image",
    picture: pictureFrom(box(8, 8, 48, 24) + `<circle cx="20" cy="17" r="3" fill="#CBD5E1" stroke="none"/><path d="M12 30l12-10 10 8 8-6 10 8" stroke="#94A3B8"/>`),
    category: "Basic",
    adapters: ALL,
    defaults: { src: "", alt: "", caption: "" },
    controls: [
      { key: "src", label: "Image", type: "image" },
      { key: "alt", label: "Describe it", type: "text", help: "Read aloud by screen readers and shown if the picture fails to load." },
      { key: "caption", label: "Caption", type: "text" },
    ],
  },
  {
    kind: "gallery",
    label: "Photo gallery",
    description: {
      landing: "Several photos in a grid — a portfolio, before-and-afters, a product range.",
      brand: "Several photos laid out in a grid on the design.",
    },
    icon: "Images",
    picture: pictureFrom(solid(8, 8, 14, 12) + solid(25, 8, 14, 12) + solid(42, 8, 14, 12) + solid(8, 23, 14, 10) + solid(25, 23, 14, 10) + solid(42, 23, 14, 10)),
    category: "Basic",
    hidden: true,
    /* `brand` CAME OFF THIS LIST on 2026-09-22. The offer file's name for My
       Brand's grid is `photo_grid` (canvas_pieces), which is its own def
       below; `adapters/mybrand/insert.ts` has no `gallery` case any more, so
       claiming the studio here said the studio could place something it
       could not. */
    adapters: ["landing"],
    defaults: { items: [] },
    controls: [{ key: "items", label: "Photos", type: "list" }],
    count: { min: 2, max: 12, label: "How many photos?", default: 6 },
  },
  {
    kind: "logo_strip",
    label: "Logo row",
    description: {
      email: "A row of logos — brands you carry, or clients you have worked with.",
      landing: "A row of logos — brands you carry, or clients you have worked with.",
    },
    icon: "Building2",
    picture: pictureFrom(solid(6, 16, 12, 8) + solid(22, 16, 12, 8) + solid(38, 16, 12, 8) + solid(54, 16, 4, 8)),
    category: "Basic",
    // Offered by NOBODY, and drawn by nobody. A website answers this job with
    // site_gallery (WEBSITE_USES_A_SECTION_INSTEAD) and an email or a landing
    // page answers it with a two- or three-column section (THE EMAIL SUBSET),
    // so both decisions together leave it homeless. Kept in the vocabulary,
    // hidden like site_custom, rather than deleted: §3.2 scopes the kind, and
    // un-scoping one is not a merge's decision to make.
    adapters: ["landing", "email"],
    hidden: true,
    defaults: { items: [] },
    controls: [{ key: "items", label: "Logos", type: "list" }],
    count: { min: 2, max: 10, label: "How many logos?", default: 5 },
  },

  /* ── Layout ────────────────────────────────────────────────────────── */
  {
    kind: "divider",
    label: "Divider",
    description: {
      proposal: "A line across the section, to separate one idea from the next.",
      website: "A line across the section, to separate one idea from the next.",
      email: "A line across the email, to separate one idea from the next.",
      landing: "A line across the section, to separate one idea from the next.",
      brand: "A straight rule you place on the design, at any length and weight.",
    },
    icon: "Minus",
    picture: pictureFrom(bar(8, 19, 48, 2)),
    category: "Basic",
    adapters: ALL,
    defaults: { style: "line" },
    controls: [{ key: "style", label: "Style", type: "select", options: ["Line", "Dotted", "Space only"] }],
  },
  {
    kind: "spacer",
    label: "Spacer",
    description: {
      proposal: "Empty space, when two things are sitting too close together.",
      website: "Empty space, when two things on the page are sitting too close together.",
      email: "Empty space, when two things in the email are sitting too close together.",
      landing: "Empty space, when two things on the page are sitting too close together.",
    },
    icon: "MoveVertical",
    picture: pictureFrom(bar(8, 8, 48) + `<path d="M32 16v10" stroke="#CBD5E1"/>` + bar(8, 30, 48)),
    category: "Basic",
    adapters: FLOWS,
    defaults: { height: 24 },
    controls: [{ key: "height", label: "How much space", type: "number" }],
  },
  {
    kind: "button",
    label: "Button",
    description: {
      proposal: "The thing you want them to press — Accept, Book a call, Ask a question.",
      website: "The thing you want a visitor to click — Book a call, Get a quote.",
      email: "The thing you want the reader to click — Book a call, See the offer.",
      landing: "The thing you want a visitor to click — Get a quote, Claim the offer.",
      brand: "A rounded block with a few words on it, for a call to action.",
    },
    icon: "MousePointerClick",
    picture: pictureFrom(`<rect x="16" y="14" width="32" height="13" rx="6" fill="#94A3B8" stroke="none"/>` + bar(23, 19, 18, 3)),
    category: "Basic",
    adapters: ALL,
    defaults: { label: "", url: "", style: "solid" },
    controls: [
      { key: "label", label: "Button text", type: "text" },
      { key: "url", label: "Where it goes", type: "link" },
      { key: "style", label: "Style", type: "select", options: ["Solid", "Outline", "Plain link"] },
      { key: "colour", label: "Colour", type: "colour", help: "Starts as your brand accent. Any colour you like." },
    ],
  },
  {
    kind: "data_table",
    label: "Table",
    description: "A plain table with a header row. Nothing is added up — it is a table, not a bill.",
    icon: "Table2",
    picture: pictureFrom(`<rect x="6" y="8" width="52" height="8" rx="2" fill="#CBD5E1" stroke="none"/>` + box(6, 8, 52, 26) + `<path d="M6 24h52M24 16v18M41 16v18" stroke="#CBD5E1"/>`),
    /* AN IA WIDGET, AND THE OFFER FILE SAYS SO (b168/demo). Elementor has no
       table widget, free or Pro - the only matches in both machine catalogues
       are `price-table` and `table-of-contents` - so this one is ours, it sits
       in our own group, and the proposal panel offers it. It was `hidden` and
       reachable only from a shipped template, which is a widget an author
       cannot add a second of. */
    category: "Intelligent Analytics",
    adapters: SMALL_TABLES,
    /* A TABLE ARRIVES AS A TABLE (G-1, 2026-09-19). It used to arrive with
       three header cells and an empty body, which is not a table and could not
       become one. `count` fills the three headings; these three blank lines are
       the body, and the Rows repeater adds, copies, moves and deletes them. */
    defaults: { columns: [], rows: [["", "", ""], ["", "", ""], ["", "", ""]] },
    /* THE TWO REPEATERS THAT MAKE A TABLE A TABLE (G-1, 2026-09-19).
       `row: ""` says a column heading is one string; `cellsFrom: "columns"`
       says a row is a line of cells, one per heading. Without them the Content
       tab was empty and the body could never gain a line — the single biggest
       loss in the round-1 replication score, hit by all six targets. */
    controls: [
      { key: "columns", label: "Columns", type: "list", row: "" },
      { key: "rows", label: "Rows", type: "list", cellsFrom: "columns" },
    ],
    count: { min: 2, max: 8, label: "How many columns?", default: 3 },
  },
  {
    kind: "countdown",
    label: "Countdown",
    description: "A timer counting down to a deadline — an offer ending, an event starting.",
    icon: "Timer",
    picture: pictureFrom(box(8, 12, 12, 16) + box(26, 12, 12, 16) + box(44, 12, 12, 16) + `<path d="M23 20h0M41 20h0" stroke="#94A3B8" stroke-width="3"/>`),
    category: "General",
    hidden: true,
    adapters: SENDS,
    defaults: { ends_at: "" },
    controls: [{ key: "ends_at", label: "Counts down to", type: "text", help: "Email clients that cannot show a timer see the date instead." }],
  },
  /* `social_links` LIVED HERE and is DELETED (D-168 item 4).
     Two definitions wore the label "Social Icons": this one, email-only, with a
     `links` list, and the Elementor-spelled one in `widgets/icons.ts`. One tile
     means one definition, and the one that survives keeps THIS one's stored
     `kind` — see the header over `SOCIAL_ICONS_DEF`. Replace means delete. */

  /* ── Capture ───────────────────────────────────────────────────────── */
  {
    kind: "form",
    label: "Contact form",
    description: "Fields a visitor fills in — every submission lands in your inbox and your contacts.",
    icon: "ClipboardList",
    picture: pictureFrom(box(10, 6, 44, 10) + box(10, 19, 44, 10) + `<rect x="10" y="32" width="20" height="6" rx="3" fill="#94A3B8" stroke="none"/>`),
    category: "Intelligent Analytics",
    hidden: true,
    adapters: ["landing"],
    defaults: { fields: [], submit_label: "Send" },
    controls: [
      { key: "fields", label: "Fields", type: "list" },
      { key: "submit_label", label: "Button text", type: "text" },
    ],
  },
  {
    kind: "signature",
    label: "Signature",
    description: "Where each side signs and dates it. Turns the document into something to accept.",
    icon: "PenLine",
    picture: pictureFrom(`<path d="M10 26c6-8 10 4 16-2s10 2 16-4" stroke="#94A3B8"/>` + `<path d="M8 32h22M34 32h22" stroke="#CBD5E1"/>`),
    category: "Intelligent Analytics",
    adapters: DOCUMENTS,
    defaults: {
      heading: "Acceptance", body: "", customerLabel: "Customer signature",
      businessLabel: "", consent: "", required: true,
    },
    controls: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "body", label: "What they are agreeing to", type: "textarea" },
      { key: "customerLabel", label: "Customer line", type: "text" },
      { key: "businessLabel", label: "Your line", type: "text" },
      /* D-174 - THE SWITCH THAT WAS ALREADY IN THE DEFAULTS.
         `required: true` has been on this widget since it existed and nothing
         read it: the server refused every acceptance without a typed name, for
         every document. It is real now - the server asks the DOCUMENT
         (`signatureRequired` in oliver's lib/documentModel.js) and the
         customer's copy is told the answer. Off means the customer presses
         Approve and the acceptance is still recorded, with their name on file.
         One control, on the widget's own Content tab, drawn by the one control
         mechanism - nothing new anywhere on the builder screen. */
      { key: "required", label: "Required to accept", type: "toggle",
        help: "On: they type their name on this block before they can accept. Off: one Approve button." },
      { key: "consent", label: "Consent statement", type: "textarea", help: "Stored word for word on the signing record." },
    ],
  },
  {
    kind: "clauses",
    label: "Terms",
    description: "Terms as numbered paragraphs, dropped in from the clauses you have saved.",
    icon: "ListOrdered",
    picture: pictureFrom(`<path d="M8 12h2M8 22h2M8 32h2" stroke="#64748B" stroke-width="3"/>` + bar(16, 10, 40) + bar(16, 20, 34) + bar(16, 30, 38)),
    category: "Intelligent Analytics",
    /* NO TILE, since integration 2026-09-19 — and the kind stays.
       §11.13.3 names ONE Terms door: the panel TILE in
       `proposal/catalogueTiles.ts`, which opens the saved clauses and drops
       them as "plain text once placed" (a Heading and a Text Editor). This
       widget was the second door with the same label, and two tiles reading
       Terms in one panel is the thing the section exists to stop.
       The KIND is not deleted: the Commercial snow & ice agreement places it,
       D-164 says its clauses and its numbering do not change, and a stored
       agreement must keep drawing exactly as it was signed. Renderer,
       Inspector list and clause-pack filling are all untouched. */
    hidden: true,
    adapters: DOCUMENTS,
    defaults: { heading: "", items: [] },
    controls: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "items", label: "Clauses", type: "list", row: { title: "", body: "" }, help: "Pick from your clause library, or write one and save it back." },
    ],
    count: { min: 1, max: 20, label: "How many clauses?", default: 4 },
  },
  {
    kind: "page_break",
    label: "Page Break",
    description: "Start a new page here when the document is printed or saved as a PDF.",
    icon: "Scissors",
    picture: pictureFrom(`<path d="M6 20h52" stroke="#94A3B8" stroke-dasharray="4 3"/>` + bar(10, 8, 30) + bar(10, 28, 24)),
    category: "Intelligent Analytics",
    adapters: DOCUMENTS,
    defaults: {},
    controls: [],
  },

  /* ── My Brand's canvas ──────────────────────────────────────
     §5 step 5. Seven things you place on a square, not on a page. Each one is
     an OBJECT with a position, which is why none of them belongs to a builder
     whose model is sections in a flow. The other eight the studio offers
     (heading, text, bullet list, image, photo grid, divider, button, callout)
     are the ones already in the registry — the studio draws them as layers
     rather than re-declaring them, which is the whole point of one registry. */
  {
    kind: "brand_logo",
    label: "Your logo",
    description: "Your business logo, placed at a sensible size and kept sharp.",
    icon: "Stamp",
    picture: pictureFrom(`<circle cx="20" cy="20" r="9" fill="#94A3B8" stroke="none"/>` + bar(34, 15, 22, 5) + bar(34, 24, 14, 4)),
    category: "Basic",
    adapters: CANVAS,
    defaults: { source: "brand", url: "" },
    controls: [
      { key: "source", label: "Which logo", type: "select", options: ["Your brand logo", "A different picture"], help: "Your brand logo comes from Brand Identity — change it there and every design catches up." },
      { key: "url", label: "Picture", type: "image" },
    ],
  },
  {
    kind: "shape",
    label: "Shape",
    description: "A rectangle, circle or line — the block a headline sits on.",
    icon: "Shapes",
    picture: pictureFrom(`<rect x="8" y="10" width="20" height="20" rx="3" fill="#94A3B8" stroke="none"/>` + `<circle cx="45" cy="20" r="10" fill="#CBD5E1" stroke="none"/>`),
    category: "Basic",
    adapters: CANVAS,
    defaults: { shape: "rect", fill: "", radius: 0 },
    controls: [
      { key: "shape", label: "Which shape", type: "select", options: ["Rectangle", "Circle", "Line"] },
      { key: "fill", label: "Colour", type: "colour", help: "Starts as one of your brand colours. Any colour you like." },
      { key: "radius", label: "Rounded corners", type: "number" },
    ],
  },
  {
    kind: "colour_block",
    /* D-168 — NOT IN THE OFFER Brandon approved, so it is not a tile.
       `hidden` is the registry's own way to keep a kind in the vocabulary so a
       document already carrying it still draws; deleting the renderer would
       blank a page a customer has. See test/builder-offers.test.mjs. */
    hidden: true,
    label: "Brand colour block",
    description: "A band of one of your brand colours — the fastest way to look designed.",
    icon: "PaintBucket",
    picture: pictureFrom(solid(6, 8, 24, 24) + `<rect x="34" y="8" width="11" height="24" rx="2" fill="#CBD5E1" stroke="none"/>` + `<rect x="48" y="8" width="10" height="24" rx="2" fill="#E2E8F0" stroke="none"/>`),
    category: "General",
    adapters: CANVAS,
    defaults: { slot: "primary", band: "left" },
    controls: [
      { key: "slot", label: "Which colour", type: "select", options: ["Primary", "Secondary", "Accent", "Text", "Background"] },
      { key: "band", label: "Where", type: "select", options: ["Left third", "Right third", "Top band", "Bottom band", "Middle"] },
    ],
  },
  {
    kind: "background",
    /* D-168 — NOT IN THE OFFER Brandon approved, so it is not a tile.
       `hidden` is the registry's own way to keep a kind in the vocabulary so a
       document already carrying it still draws; deleting the renderer would
       blank a page a customer has. See test/builder-offers.test.mjs. */
    hidden: true,
    label: "Background",
    description: "Fills the whole square behind everything — a colour, a fade or a photo.",
    icon: "Frame",
    picture: pictureFrom(`<rect x="4" y="4" width="56" height="32" rx="3" fill="#CBD5E1" stroke="none"/>` + bar(16, 16, 32, 8)),
    category: "General",
    adapters: CANVAS,
    defaults: { fill: "gradient" },
    controls: [
      { key: "fill", label: "Fill", type: "select", options: ["Brand colour", "Fade between two brand colours", "A photo"] },
    ],
  },
  {
    /* PHOTO GALLERY — `photo_grid`, one of the five `canvas_pieces` the offer
       file gives My Brand. Its own def and not `gallery`'s second adapter,
       because the two are different things: a landing page's gallery is a
       FLOW of pictures the page lays out, and this is a set of absolute-pixel
       slots with a gutter and a corner radius the author drags. */
    kind: "photo_grid",
    label: "Photo gallery",
    description: { brand: "Several photos laid out in a grid, each one a slot you fill." },
    icon: "Images",
    picture: pictureFrom(solid(8, 8, 14, 12) + solid(25, 8, 14, 12) + solid(42, 8, 14, 12) + solid(8, 23, 14, 10) + solid(25, 23, 14, 10) + solid(42, 23, 14, 10)),
    category: "Basic",
    adapters: CANVAS,
    defaults: { gutter: 16, radius: 0 },
    controls: [
      { key: "gutter", label: "Gap", type: "number", help: "The space between the pictures." },
      { key: "radius", label: "Rounded corners", type: "number" },
    ],
    count: { min: 2, max: 12, label: "How many photos?", default: 4 },
  },
  {
    /* LINE. It was the third option inside Shape's "Which shape?" question,
       which is why every parity round listed it as "present as a capability
       with no tile". The offer file lists `line` beside `shape` in
       `canvas_pieces`, so it is a tile, and Shape's question is down to two. */
    kind: "line",
    label: "Line",
    description: { brand: "A straight rule — under a title, or between two things." },
    icon: "Minus",
    picture: pictureFrom(`<rect x="6" y="19" width="52" height="3" rx="1.5" fill="#94A3B8" stroke="none"/>`),
    category: "Basic",
    adapters: CANVAS,
    defaults: { colour: "", thickness: 6 },
    controls: [
      { key: "colour", label: "Colour", type: "colour", help: "Starts as one of your brand colours." },
      { key: "thickness", label: "Thickness", type: "number" },
    ],
  },
  {
    /* FRAME — a picture cut to a shape, placed EMPTY. The capability is
       `ImageLayer.mask` / `frameStroke` / `frameFill` and has been there since
       round 1, but only as a control on a Picture that already existed, which
       is why the parity sheet called it "a crop on a Picture" rather than a
       tile. A frame is what a person reaches for first: lay the circle out,
       put the photograph in later. */
    kind: "frame",
    label: "Frame",
    description: { brand: "A shaped hole for a photo — lay it out now, fill it later." },
    icon: "Circle",
    picture: pictureFrom(`<circle cx="32" cy="20" r="13" fill="#CBD5E1" stroke="#64748B"/>`
      + `<circle cx="32" cy="20" r="7" fill="#94A3B8" stroke="none"/>`),
    category: "Basic",
    adapters: CANVAS,
    defaults: { mask: "circle", ring: "" },
    controls: [
      { key: "mask", label: "Shape", type: "select", options: ["Circle", "Rounded", "Arch", "Hexagon"] },
      { key: "ring", label: "Ring colour", type: "colour" },
    ],
  },
  {
    /* IA REVIEW — ONE real review of the business, as a graphic.
       Its own kind and not `ia_reviews` with a fifth builder: the offer file
       names `ia_review`, SINGULAR, for My Brand, and the two are different
       things. `ia_reviews` is a ROW of slides a page or a mailbox lays out;
       this is one review, placed as star shapes and two runs of words on an
       absolute-pixel canvas. Declared here rather than in the f5 family for
       the same reason `shape` and `qr_code` are here: it exists on ONE
       adapter's canvas and nowhere else. */
    kind: "ia_review",
    label: "IA Review",
    description: { brand: "One of your real reviews, with its stars and who left it." },
    icon: "Stars",
    picture: pictureFrom(`<path d="M12 12l1.6 4 4 .4-3.2 2.8 1.2 4-3.6-2.4-3.6 2.4 1.2-4L6.4 16.4l4-.4z" fill="#94A3B8" stroke="none"/>`
      + `<path d="M26 12l1.6 4 4 .4-3.2 2.8 1.2 4-3.6-2.4-3.6 2.4 1.2-4-3.2-2.8 4-.4z" fill="#94A3B8" stroke="none"/>`
      + bar(8, 26, 48, 4) + bar(8, 33, 30, 3)),
    category: "Intelligent Analytics",
    adapters: CANVAS,
    defaults: { review_id: "", quote: "", author: "", rating: 5 },
    controls: [
      { key: "quote", label: "What they said", type: "text" },
      { key: "author", label: "Who left it", type: "text" },
      { key: "rating", label: "Stars", type: "number" },
    ],
  },
  {
    kind: "qr_code",
    label: "QR code",
    description: "A square people scan with a phone to open your link.",
    icon: "QrCode",
    picture: pictureFrom(`<rect x="20" y="6" width="26" height="26" rx="2" fill="none" stroke="#64748B"/>` + `<rect x="24" y="10" width="7" height="7" fill="#94A3B8" stroke="none"/>` + `<rect x="35" y="10" width="7" height="7" fill="#94A3B8" stroke="none"/>` + `<rect x="24" y="21" width="7" height="7" fill="#94A3B8" stroke="none"/>` + `<rect x="36" y="23" width="4" height="4" fill="#94A3B8" stroke="none"/>`),
    category: "General",
    adapters: CANVAS,
    defaults: { url: "" },
    controls: [
      { key: "url", label: "Where it goes", type: "link", help: "Paste any link — your website, a booking page, a review page." },
    ],
  },
  {
    kind: "social_handle",
    /* D-168 — NOT IN THE OFFER Brandon approved, so it is not a tile.
       `hidden` is the registry's own way to keep a kind in the vocabulary so a
       document already carrying it still draws; deleting the renderer would
       blank a page a customer has. See test/builder-offers.test.mjs. */
    hidden: true,
    label: "Social handle",
    description: "Your @name with its platform symbol, so people know where to find you.",
    icon: "AtSign",
    picture: pictureFrom(`<circle cx="16" cy="20" r="8" fill="#94A3B8" stroke="none"/>` + bar(29, 14, 27, 5) + bar(29, 23, 18, 4)),
    category: "General",
    adapters: CANVAS,
    defaults: { platform: "instagram", handle: "" },
    controls: [
      { key: "platform", label: "Where", type: "select", options: ["Instagram", "Facebook", "LinkedIn", "Website", "Phone", "Email"] },
      { key: "handle", label: "Your name there", type: "text" },
    ],
  },

  /* ── Sections — the website adapter's whole bands of a page ──────────────
     Each of these is ONE ARION section kind (arion-api's sectionSchema.js
     SECTION_KINDS), so what the pane offers and what the site can actually
     render are the same list. Nothing here is invented: the labels and the
     one-liners are the schema's own `label` and `blurb`, pinned against it by
     test/fixtures/website-section-kinds.json in BOTH repos.

     A "how many?" on one of these is the guided count SD-010 asks for: how
     many services, how many reviews, how many people. It is asked once, in
     words, before the section is added. ──────────────────────────────────── */
  {
    kind: "site_hero",
    label: "Hero banner",
    description: "The big banner at the top of a page — one headline, one line of support, one button.",
    icon: "PanelTop",
    picture: pictureFrom(solid(4, 4, 56, 32) + bar(14, 13, 36, 6) + bar(20, 23, 24, 3) + `<rect x="24" y="29" width="16" height="5" rx="2" fill="#F1F5F9" stroke="none"/>`),
    category: "General",
    hidden: true,
    adapters: ["website"],
    defaults: {},
    controls: [],
  },
  {
    kind: "site_services",
    label: "What you do",
    description: "A row of cards, one per service, each with a short description.",
    icon: "LayoutGrid",
    picture: pictureFrom(bar(20, 5, 24, 5) + box(5, 14, 16, 21) + box(24, 14, 16, 21) + box(43, 14, 16, 21) + bar(9, 19, 8, 3) + bar(28, 19, 8, 3) + bar(47, 19, 8, 3)),
    category: "General",
    hidden: true,
    adapters: ["website"],
    defaults: {},
    controls: [],
    count: { min: 1, max: 8, label: "How many services?", default: 3 },
  },
  {
    kind: "site_about",
    label: "About the business",
    description: "Your story beside a picture, then the things you stand for.",
    icon: "BookOpen",
    picture: pictureFrom(solid(5, 7, 24, 26) + bar(33, 9, 26, 5) + bar(33, 18, 26) + bar(33, 25, 20) + bar(33, 31, 24)),
    category: "General",
    hidden: true,
    adapters: ["website"],
    defaults: {},
    controls: [],
  },
  {
    kind: "site_pricing",
    label: "What it costs",
    description: "Your prices, one card per package, with what each one includes.",
    icon: "Tags",
    picture: pictureFrom(bar(22, 4, 20, 4) + box(5, 11, 16, 24) + `<rect x="24" y="8" width="16" height="27" rx="3" fill="#F1F5F9" stroke="#64748B"/>` + box(43, 11, 16, 24) + bar(28, 12, 8, 3) + bar(28, 19, 8, 5)),
    category: "General",
    hidden: true,
    adapters: ["website"],
    defaults: {},
    controls: [],
    count: { min: 1, max: 6, label: "How many packages?", default: 3 },
  },
  {
    kind: "site_testimonials",
    label: "What customers say",
    description: "Quotes from real customers, with who said them.",
    icon: "Quote",
    picture: pictureFrom(bar(20, 4, 24, 4) + box(5, 12, 26, 23) + box(34, 12, 25, 23) + bar(9, 17, 18, 3) + bar(9, 23, 14, 3) + bar(38, 17, 17, 3) + bar(38, 23, 12, 3)),
    category: "General",
    hidden: true,
    adapters: ["website"],
    defaults: {},
    controls: [],
    count: { min: 1, max: 8, label: "How many reviews?", default: 3 },
  },
  {
    kind: "site_gallery",
    label: "Picture gallery",
    description: "A grid of photographs of your work.",
    icon: "Images",
    picture: pictureFrom(bar(22, 4, 20, 4) + solid(5, 12, 16, 10) + solid(24, 12, 16, 10) + solid(43, 12, 16, 10) + solid(5, 25, 16, 10) + solid(24, 25, 16, 10) + solid(43, 25, 16, 10)),
    category: "General",
    hidden: true,
    adapters: ["website"],
    defaults: {},
    controls: [],
    count: { min: 1, max: 24, label: "How many pictures?", default: 6 },
  },
  {
    kind: "site_team",
    label: "The people",
    description: "Who works here, with a photograph and what they do.",
    icon: "Users",
    picture: pictureFrom(bar(22, 4, 20, 4) + `<circle cx="16" cy="19" r="6" fill="#94A3B8" stroke="none"/><circle cx="32" cy="19" r="6" fill="#94A3B8" stroke="none"/><circle cx="48" cy="19" r="6" fill="#94A3B8" stroke="none"/>` + bar(10, 29, 12, 3) + bar(26, 29, 12, 3) + bar(42, 29, 12, 3)),
    category: "General",
    hidden: true,
    adapters: ["website"],
    defaults: {},
    controls: [],
    count: { min: 1, max: 12, label: "How many people?", default: 3 },
  },
  {
    kind: "site_stats",
    label: "Numbers that matter",
    description: "A band of figures — years in business, jobs done, how fast you answer.",
    icon: "Hash",
    picture: pictureFrom(`<rect x="3" y="9" width="58" height="22" rx="3" fill="#F1F5F9" stroke="#94A3B8"/>` + bar(9, 14, 12, 7) + bar(26, 14, 12, 7) + bar(43, 14, 12, 7) + bar(11, 25, 8, 3) + bar(28, 25, 8, 3) + bar(45, 25, 8, 3)),
    category: "General",
    hidden: true,
    adapters: ["website"],
    defaults: {},
    controls: [],
    count: { min: 1, max: 6, label: "How many numbers?", default: 3 },
  },
  {
    kind: "site_faq",
    label: "Questions and answers",
    description: "The questions customers keep asking, with your answers.",
    icon: "MessageCircleQuestion",
    picture: pictureFrom(bar(20, 4, 24, 4) + box(5, 11, 54, 8) + box(5, 21, 54, 8) + box(5, 31, 54, 6) + bar(9, 14, 22, 3) + bar(9, 24, 26, 3)),
    category: "General",
    hidden: true,
    adapters: ["website"],
    defaults: {},
    controls: [],
    count: { min: 1, max: 20, label: "How many questions?", default: 4 },
  },
  {
    kind: "site_cta",
    label: "Call to action",
    description: "A wide band with a headline and one or two buttons.",
    icon: "Megaphone",
    picture: pictureFrom(solid(3, 8, 58, 24) + bar(16, 13, 32, 5) + `<rect x="18" y="22" width="12" height="6" rx="3" fill="#F1F5F9" stroke="none"/><rect x="34" y="22" width="12" height="6" rx="3" fill="#CBD5E1" stroke="none"/>`),
    category: "General",
    hidden: true,
    adapters: ["website"],
    defaults: {},
    controls: [],
  },
  {
    kind: "site_contact",
    label: "Contact and form",
    description: "How to reach you, next to a form that sends straight to your inbox.",
    icon: "Mail",
    picture: pictureFrom(bar(20, 4, 24, 4) + `<circle cx="9" cy="15" r="2" fill="#94A3B8" stroke="none"/>` + bar(15, 13, 14, 3) + `<circle cx="9" cy="23" r="2" fill="#94A3B8" stroke="none"/>` + bar(15, 21, 12, 3) + box(34, 11, 25, 8) + box(34, 21, 25, 8) + `<rect x="34" y="31" width="12" height="5" rx="2" fill="#94A3B8" stroke="none"/>`),
    category: "General",
    hidden: true,
    adapters: ["website"],
    defaults: {},
    controls: [],
  },
  {
    kind: "site_content",
    label: "Words and pictures",
    description: "A free section: headings, paragraphs, pictures, buttons and video, in one to three columns.",
    icon: "Type",
    picture: pictureFrom(bar(5, 6, 26, 5) + bar(5, 15, 26) + bar(5, 22, 22) + bar(5, 29, 26) + solid(35, 6, 24, 29)),
    category: "General",
    hidden: true,
    adapters: ["website"],
    defaults: { layout: 1, blocks: [] },
    controls: [],
    count: { min: 1, max: 3, label: "How many columns?", default: 1 },
  },
  {
    kind: "site_custom",
    label: "Kept exactly as it is",
    description: "A section the website sent us that we could not read at all. It stays exactly as it is.",
    icon: "Lock",
    picture: pictureFrom(box(5, 6, 54, 29) + `<path d="M12 13l40 20M52 13L12 33" stroke="#CBD5E1"/>`),
    category: "General",
    adapters: ["website"],
    /* THE LAST RESORT, and nothing routinely reaches it any more (B-168,
       2026-09-22). Every section arion-api sends is now `editable: true` —
       ours and the client's alike — so this is what draws a section the server
       could not read at all. It is KEPT rather than deleted because it is the
       thing that carries the client's own Elementor bytes back untouched; a
       section that fell through with nowhere to go would be a section dropped
       off somebody's live page. Never offered: it is what a page ALREADY has,
       not something anybody can add. */
    hidden: true,
    defaults: {},
    controls: [],
  },
  {
    kind: "opaque",
    label: "Built in WordPress",
    description: "A part of this page that was built on the website itself. It is kept exactly as it is.",
    icon: "Lock",
    picture: pictureFrom(box(5, 6, 54, 29) + `<path d="M12 13l40 20M52 13L12 33" stroke="#CBD5E1"/>`),
    category: "General",
    adapters: ["website"],
    /* ONE WIDGET ON THE CLIENT'S PAGE THAT WE HAVE NO ROW FOR (B-168).
       The page opens, everything around it is editable, and this one draws a
       placeholder saying what it is and where to change it. It is written back
       to the website byte for byte, so nothing on a live page is ever lost to
       a vocabulary gap. Hidden: nobody adds one, a page already has it. */
    hidden: true,
    defaults: {},
    controls: [],
  },
  /* ── The email set, 2026-09-16 (§7, the email adapter) ──────────────────
     Four widgets an email has and a document does not, plus the one a hosted
     landing page opens with. Everything else the email builder offers already
     existed — that is the point of one registry. ─────────────────────────── */
  {
    kind: "personal_note",
    label: "Personal note",
    description: "A short note that greets each person by name and signs off from you.",
    icon: "PenTool",
    picture: pictureFrom(bar(8, 8, 26) + bar(8, 17, 48) + bar(8, 26, 40) + bar(8, 34, 16, 3)),
    category: "Basic",
    hidden: true,
    adapters: SENDS,
    defaults: { greeting: "Hi {{first name}},", text: "", signoff: "", align: "left" },
    controls: [
      { key: "greeting", label: "Greeting", type: "text", help: "Uses the recipient's own name. Pick the name from the tag list." },
      { key: "text", label: "The note", type: "textarea" },
      { key: "signoff", label: "Sign off", type: "text" },
      { key: "align", label: "Line up", type: "select", options: ["Left", "Centre"] },
    ],
  },
  {
    kind: "article_card",
    label: "IA Posts",
    description: "Your stories, each with a picture, a few lines and a link to read the rest.",
    icon: "Newspaper",
    picture: pictureFrom(solid(8, 8, 18, 24) + bar(30, 10, 26, 5) + bar(30, 20, 26) + bar(30, 28, 16)),
    category: "Intelligent Analytics",
    adapters: SENDS,
    defaults: { items: [] },
    controls: [
      { key: "items", label: "Articles", type: "list", help: "Type them here, or bring them in from your website with “From the website”.",
        row: { title: "", excerpt: "", image: "", alt: "", url: "", linkLabel: "Read it" } },
      { key: "layout", label: "Shape", type: "select", options: ["Picture beside the words", "Picture above the words"] },
    ],
    count: { min: 1, max: 8, label: "How many articles?", default: 3 },
  },
  {
    kind: "product_card",
    label: "Product Cards",
    /* THE STUDIO CALLS IT WHAT IT PLACES THERE. In a mailbox this tile drops a
       ROW of cards; on the My Brand canvas the offer file asks for "one promo
       card with a real product name and price", singular, and a tile whose
       name says Cards and whose press places one card is a tile that lied. */
    labels: { brand: "Product card" },
    description: {
      email: "What you sell, with the price and how it is billed, straight from your catalogue.",
      brand: "One thing you sell, with its real name and price, as a promo card.",
    },
    icon: "ShoppingBag",
    picture: pictureFrom(solid(8, 8, 16, 14) + bar(8, 25, 16) + bar(8, 32, 10, 3)
      + solid(28, 8, 16, 14) + bar(28, 25, 16) + bar(28, 32, 10, 3)
      + solid(48, 8, 8, 14) + bar(48, 25, 8)),
    category: "Intelligent Analytics",
    /* `brand` ADDED 2026-09-22 — the offer file's `builders.mybrand.ia` lists
       `product_card`. Both surfaces read the SAME catalogue
       (`/catalog/offerings?include_prices=1`); there is no second one. */
    adapters: ["email", "brand"],
    defaults: { items: [], layout: "cards" },
    controls: [
      { key: "items", label: "What is on offer", type: "list", help: "Pick from Products & Services and the price and cadence come with it.",
        row: { name: "", blurb: "", price: "", cadence: "", image: "", alt: "", url: "", ctaLabel: "" } },
      { key: "layout", label: "Shape", type: "select", options: ["Cards side by side", "One under the other"] },
    ],
    count: { min: 1, max: 4, label: "How many products?", default: 2 },
  },
  {
    kind: "email_footer",
    label: "Unsubscribe Footer",
    description: "Who sent this, where you are, and the unsubscribe link. Required on every send.",
    icon: "PanelBottom",
    picture: pictureFrom(`<rect x="6" y="6" width="52" height="16" rx="3" fill="#F1F5F9" stroke="none"/>`
      + `<rect x="6" y="25" width="52" height="10" rx="2" fill="#CBD5E1" stroke="none"/>`
      + bar(16, 28, 14, 4) + bar(34, 28, 14, 4)),
    category: "Intelligent Analytics",
    adapters: SENDS,
    defaults: {
      businessName: "", address: "", note: "",
      unsubscribeLabel: "Unsubscribe", preferencesLabel: "Update your preferences",
      showSocial: true,
    },
    controls: [
      { key: "address", label: "Your postal address", type: "text", help: "The law asks for a real address on every marketing email. Comes from your business profile." },
      { key: "note", label: "Anything else", type: "textarea", help: "A line about why they are hearing from you, for example." },
      { key: "unsubscribeLabel", label: "Unsubscribe wording", type: "text" },
      { key: "showSocial", label: "Show your social links", type: "toggle" },
    ],
  },
  {
    kind: "hero",
    label: "Headline & picture",
    description: "The top of the page — the one line that says what you do, over a picture.",
    icon: "Sparkle",
    picture: pictureFrom(solid(6, 5, 52, 14) + bar(14, 23, 36, 6) + bar(20, 33, 24)),
    category: "Layout",
    hidden: true,
    // Landing only for now. The website adapter brings its own opening
    // section from the ARION library (§11 "what remains").
    adapters: ["landing"],
    defaults: { headline: "", sub: "", image: "", alt: "", align: "center" },
    controls: [
      { key: "image", label: "Picture", type: "image" },
      { key: "alt", label: "Describe the picture", type: "text", help: "Read aloud by screen readers and shown if the picture fails to load." },
      { key: "align", label: "Line up", type: "select", options: ["Centre", "Left"] },
    ],
  },
];

/**
 * ONE LIST, DE-DUPLICATED BY KIND, AND THE FAMILY WINS. B-168 / D-168 item 1.
 *
 * ── THE PROBLEM THIS SOLVES, MEASURED ─────────────────────────────────────
 * The seams commit spread `...FAMILY_WIDGET_DEFS` in front of the list above,
 * which is fine for a kind that is NEW and useless for a kind that already
 * exists — and deepening an existing widget to Elementor's own controls is most
 * of what D-168 asks for. The first family to finish (f2-pictures) could not
 * touch Image, Image Box, Image Carousel, Basic Gallery or Video: a second
 * definition of a kind fails `builder-registry.test.mjs` "kinds are unique",
 * and the only way to remove the first was to open `registry.ts` or a shared
 * atom file, which the family contract forbids. Every one of the ten would have
 * hit it.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 * A family definition REPLACES the legacy definition of the same kind, in the
 * legacy one's own place, and the legacy one is **dropped from the result**.
 * It is not deleted from this FILE — that is the lander's mechanical pass, once
 * the families have landed — so nothing here has to be timed against ten
 * branches. `kinds are unique` now asks THIS list, which is the one the panel,
 * the renderer and every stored document read.
 *
 * Two families claiming one kind is still a throw, and it throws earlier, in
 * `families/index.ts`. This function only reconciles family with legacy.
 */
export function mergeWidgetDefs(family: WidgetDef[], legacy: WidgetDef[]): WidgetDef[] {
  const byKind = new Map<string, WidgetDef>();
  for (const d of family) byKind.set(d.kind, d);
  const out: WidgetDef[] = [];
  const placed = new Set<string>();
  /* The legacy entry's POSITION is kept, because the array's own order is what
     `widgetsFor` falls back to for a widget with no place of its own, and a
     replacement that jumped to the front would move a tile nobody touched. */
  for (const d of legacy) {
    const won = byKind.get(d.kind);
    out.push(won ?? d);
    if (won) placed.add(d.kind);
  }
  /* …and a family's NEW kinds go first, which is where the seam put them. */
  const fresh = family.filter((d) => !placed.has(d.kind));
  return [...fresh, ...out];
}

/** Which kinds a family took over from the list above. Read by the tests. */
export function shadowedLegacyKinds(): string[] {
  const family = new Set(FAMILY_WIDGET_DEFS.map((d) => d.kind));
  return LEGACY_WIDGETS.filter((d) => family.has(d.kind)).map((d) => d.kind);
}

/**
 * EVERY WIDGET THE PLATFORM HAS — the families' and the ones that predate them.
 *
 * B-168 §C.1: the ten folders under `widgets/families/` each declare their own
 * widgets and `families/index.ts` collects them. This is the whole of their
 * footprint in this file.
 */
export const WIDGETS: WidgetDef[] = mergeWidgetDefs(FAMILY_WIDGET_DEFS, LEGACY_WIDGETS);

/* ══════════════════════════════════════════════════════════════════════════
   Reading the registry
   ══════════════════════════════════════════════════════════════════════════ */

export const WIDGETS_BY_KIND: Record<string, WidgetDef> = Object.fromEntries(
  WIDGETS.map((w) => [w.kind, w]),
);

/** Every widget a given builder may offer, in registry order. */
/**
 * THE ONE RESOLVER for a per-medium string (N-4).
 *
 * A plain string is the same everywhere. A map answers for the adapter the
 * pane is being drawn for; when it has nothing for that adapter it falls back
 * to the proposal wording and then to the first sentence it has, because a
 * widget with a blank line under its name looks unfinished and tells the
 * author nothing.
 */
export function adapterText(value: AdapterText, adapter?: BuilderAdapter): string {
  if (typeof value === "string") return value;
  if (!value) return "";
  const own = adapter ? value[adapter] : undefined;
  if (own) return own;
  return value.proposal || Object.values(value).find((v) => !!v) || "";
}

/** The sentence under this widget's name, in this builder's words. */
export function widgetDescription(def: WidgetDef, adapter?: BuilderAdapter): string {
  return adapterText(def.description, adapter);
}

/** What this builder calls this widget. `label` unless the medium renames it. */
export function widgetLabel(def: WidgetDef, adapter?: BuilderAdapter): string {
  return (adapter && def.labels?.[adapter]) || def.label;
}

/**
 * THE PANEL'S ORDER, group by group, exactly as Elementor's own panel reads.
 *
 * Pinned by `test/fixtures/elementor-widget-names.json`, which is machine-cut
 * from `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`: inside a group,
 * Elementor's panel order IS its registration order, and the live Playground
 * editor on 2026-09-19 agreed. An explicit list rather than the array's own
 * order, because the array is two lists spread together and two lists cannot be
 * interleaved by sitting next to each other.
 *
 * A kind missing from here still appears — last, in registry order — rather
 * than vanishing, because a widget nobody can add is worse than one in the
 * wrong place. A test names every offered kind that is missing.
 */
export const PANEL_ORDER: string[] = [
  // Layout
  CONTAINER_KIND, GRID_PRESET_KIND,
  /* Basic — and Inner Section is FIRST, because that is where Elementor
     registers it: the machine catalogue's `basic` category reads
     `inner-section, heading, image, text-editor, video, button, divider,
     spacer, google_maps, icon`, in that order. */
  INNER_SECTION_PRESET_KIND,
  "heading", "image", "paragraph", "video", "button", "divider", "spacer", "google_maps", "icon",
  // ...and the studio's placed objects, which no other builder offers.
  "brand_logo", "shape", "photo_grid", "line", "frame",
  // General
  "image_box", "icon_box", "star_rating", "image_carousel", "basic_gallery", "list",
  "counter", "progress_bar", "progress_tracker", "testimonial", "tabs", "accordion", "toggle",
  "social_icons", "social_links", "alert", "shortcode", "html", "menu_anchor",
  /* B-168 F8 — Elementor's Login and WordPress Menu. THE ONLY LINE F8 ADDS TO
     THIS FILE, and it is here because `PANEL_ORDER` is a hand-written list with
     no family hook: a family's new kind has nowhere to say where it sits, and
     `unorderedKinds()` — which `builder-widget-set.test.mjs` asserts is empty —
     goes red without it. Every one of the ten families hits this. The real fix
     is for PANEL_ORDER to be cut from `test/fixtures/elementor-widget-names.json`,
     which is where its own comment says the order comes from; it is written up
     in D168_HANDOFF_2026-09-19.md. Until then this is two strings, appended, so
     ten families conflict on one line instead of ten. */
  "login", "nav_menu",
  "colour_block", "background", "qr_code", "social_handle",
  /* B-168 f2-pictures — the five picture widgets the panel did not have. THE
     ONE LINE A FAMILY CANNOT AVOID IN THIS FILE: `unorderedKinds()` above is
     asserted EMPTY by test/builder-widget-set.test.mjs, so a new tile with no
     place here fails the suite, and PANEL_ORDER is the only place a place can
     be given. Flagged for the lander in D168_HANDOFF_2026-09-19.md: every one
     of the ten families needs a line like this one, and the tidy end of it is
     for a def to declare its own position so nobody opens this file at all. */
  "pro_gallery", "video_playlist", "audio", "lottie", "hotspot",
  // Intelligent Analytics — §11.13.3's own order, proposals first
  "product_cards", "product_line_items", "totals", "card", "catalog_card", "price_line",
  "custom_field", "data_table", "clauses", "signature", "page_break",
  /* The email's three, by the ids the mailbox already draws. They sit where
     §11.13.3 puts them in the email's own IA column. */
  "product_card", "article_card", "email_footer",
  "ia_posts", "reviews", "ia_review", "book_now",
  "ia_form", "newsletter_signup", "hours_location",
  "ia_mega_menu", "ia_mobile_menu", "ia_oliver_invoice", "ia_social_links",
];

const PANEL_INDEX: Record<string, number> = Object.fromEntries(PANEL_ORDER.map((k, i) => [k, i]));

/**
 * WHERE A TILE SITS, in one function. B-168 / D-168 item 3.
 *
 * Three answers, asked in this order, and the FIRST one that speaks wins:
 *
 *   1. the definition's own `order` — what a family writes;
 *   2. Elementor's own panel, by the widget's LABEL (`elementorPanel.ts`,
 *      machine-cut) — so a family that writes Elementor's title, which D-168
 *      requires, gets Elementor's position for nothing and never touches this
 *      file;
 *   3. `PANEL_ORDER`, for the widgets that were here before the families.
 *      Its flat list is read as a per-GROUP position, which is what it always
 *      described: it is written group by group and its own header says so.
 *
 * `null` means nowhere — the tile still draws, LAST in its group, and
 * `unorderedKinds()` names it so a test goes red instead of the screen going
 * quietly wrong.
 */
export function panelAt(w: WidgetDef): number | null {
  if (typeof w.order === "number") return w.order;
  const place = elementorPlace(w.label);
  if (place && place.group === w.category) return place.order;
  const flat = PANEL_INDEX[w.kind];
  return flat === undefined ? null : LEGACY_WITHIN_GROUP[w.kind] ?? flat;
}

/**
 * `PANEL_ORDER`'s flat position, read as a position INSIDE the widget's group.
 *
 * The list is written group by group (its header says so), so walking it once
 * and counting per category turns one flat list into the five per-group lists
 * it already was. Computed, never typed twice.
 */
const LEGACY_WITHIN_GROUP: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  const seen: Record<string, number> = {};
  const byKind = new Map(LEGACY_WIDGETS.map((d) => [d.kind, d] as const));
  for (const kind of PANEL_ORDER) {
    const group = byKind.get(kind)?.category ?? "General";
    seen[group] = seen[group] ?? 0;
    out[kind] = seen[group]++;
  }
  return out;
})();

/** Every widget a given builder may offer, in the PANEL's order. */
export function widgetsFor(adapter: BuilderAdapter): WidgetDef[] {
  const list = WIDGETS.filter((w) => w.adapters.includes(adapter) && !w.hidden);
  /* GROUP first, then position inside it. `panelGroups` draws the groups in
     `WIDGET_CATEGORIES` order, and this list has to read the same way for the
     flat one — the slash command's Enter and the pane's first tile were two
     different widgets the last time these two orders disagreed. */
  const rank = (w: WidgetDef) => {
    const group = WIDGET_CATEGORIES.indexOf(w.category);
    const within = panelAt(w);
    return (group < 0 ? WIDGET_CATEGORIES.length : group) * 10_000
      + (within ?? 5_000 + list.indexOf(w));
  };
  return list.sort((a, b) => rank(a) - rank(b));
}

/** Offered somewhere and with no place of its own. Empty, and a test says so. */
export function unorderedKinds(): string[] {
  return WIDGETS
    .filter((w) => !w.hidden && panelAt(w) === null)
    .map((w) => w.kind);
}

/** Including the ones nothing offers — what the RENDERER has to cover. */
export function allWidgetsFor(adapter: BuilderAdapter): WidgetDef[] {
  return WIDGETS.filter((w) => w.adapters.includes(adapter));
}

/** The website adapter's whole-page sections, in the order the pane shows them. */
export const SITE_SECTION_KINDS = [
  "site_hero", "site_services", "site_about", "site_pricing", "site_testimonials",
  "site_gallery", "site_team", "site_stats", "site_faq", "site_cta", "site_contact",
  "site_content",
] as const;

/** `site_hero` ⇄ `hero` — the ARION section kind arion-api speaks. */
export function arionKindOf(widgetKind: string): string | null {
  if (widgetKind === "site_content") return "content";
  return widgetKind.startsWith("site_") && widgetKind !== "site_custom"
    ? widgetKind.slice(5)
    : null;
}
export function siteWidgetKindFor(arionKind: string): string {
  return arionKind === "content" ? "site_content" : `site_${arionKind}`;
}

/* `groupForPane` LIVED HERE and is DELETED (D-165).
   It grouped by category; `widgetTasks.groupByTask` grouped the same widgets by
   "job"; the two were maintained beside each other and the pane and the picker
   drew different lists. There is ONE grouping now — Elementor's four groups,
   declared once on each entry as `category`, read by `widgetGroups.panelGroups`
   (which is itself the merge of the two modules the streams each wrote; see
   its header). Replace means delete. */

/** The tooltip text for a widget's button. Label plus the sentence, always,
 *  and both in THIS builder's words (N-4). */
export function widgetTooltip(w: WidgetDef, adapter?: BuilderAdapter): string {
  return `${widgetLabel(w, adapter)} — ${widgetDescription(w, adapter)}`;
}

/**
 * Facebook Page — Elementor `facebook-page`, group Pro.
 *
 * Elementor's own title, its own panel section ("Page") and its own control
 * labels ("Link", "Layout", "Small Header", "Cover Photo", "Profile Photos",
 * "Custom CTA Button", "Height"), read off
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`. NOT seen live — the Playground
 * sandbox is free Elementor only.
 *
 * Offered on website and landing, which is where
 * `BUILDER_OFFERS_2026-09-19.json` lists `facebook-page` and nowhere else.
 *
 * Needs Facebook's SDK on the published page, so it draws the same honest no-JS
 * card as Facebook Embed: the page's name and a real link to it. See
 * `shared.fallbackCard`.
 */
import type { Widget } from "../../../model";
/* `esc` from `builder/esc`, a module that imports nothing — NEVER from
   `builder/render`, which pulls the family index back in while it is still
   evaluating (D-168 item 5b; wave one had it wrong and the family test threw). */
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom, bar, box, solid } from "../../../pictures";
import type { FamilyWidgetDef } from "../types";
import { fallbackCard, str } from "./shared";

/** Elementor's `tabs` select2. Stored as a list; the first choice is the one. */
export function pageLayout(v: unknown): string {
  const first = Array.isArray(v) ? v[0] : v;
  const s = str(first).toLowerCase();
  return s === "events" || s === "messages" ? s : "timeline";
}

/** What each layout is called on the card, in plain words. */
const LAYOUT_LINE: Readonly<Record<string, string>> = {
  timeline: "Your latest posts, straight from Facebook.",
  events: "Your upcoming events, straight from Facebook.",
  messages: "A Send message button that opens Facebook Messenger.",
};

/** "facebook.com/summit-lawn" → "summit-lawn", for the card's title. */
export function pageName(url: string): string {
  const cleaned = url.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  const last = cleaned.split("/").filter(Boolean).pop() || "";
  return last.includes(".") ? "" : last.replace(/[-_]+/g, " ").trim();
}

export function renderFacebookPage(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const url = str(p.url).trim();
  if (!url && ctx.mode !== "edit") return "";
  if (!url) {
    return `<div class="bx-f3-fbpage bx-f3-fbpage-empty" style="border:1px dashed #CBD5E1;border-radius:8px;padding:16px;text-align:center;color:#94A3B8;font-size:12px">Paste the address of your Facebook page in the panel on the right.</div>`;
  }
  const layout = pageLayout(p.tabs);
  const name = pageName(url);
  /* Elementor's own Height control, in the units it stores it in. The card is
     not the real widget, so the height is a MINIMUM here rather than a fixed
     box: a card forced to 500px with two lines in it is a hole in the page. */
  const height = Math.max(120, Math.min(1200, Number((p as any).height) || 500));
  return `<div class="bx-f3-fbpage" style="min-height:${height}px;display:block">${fallbackCard({
    title: name ? `${name} on Facebook` : "Our Facebook page",
    line: LAYOUT_LINE[layout],
    href: url,
    linkText: "Open the page on Facebook",
    accent: ctx.accent,
  })}</div>`;
}

export const FACEBOOK_PAGE_DEF: FamilyWidgetDef = {
  kind: "facebook_page",
  label: "Facebook Page",
  description: {
    website: "Your Facebook page on the page — posts, events, or a message button.",
    landing: "Your Facebook page on the page — posts, events, or a message button.",
  },
  icon: "Facebook",
  picture: pictureFrom(box(8, 6, 48, 28) + solid(8, 6, 48, 9) + bar(14, 20, 34) + bar(14, 27, 24)),
  /* ELEMENTOR PRO'S OWN GROUP (D-168 item 6, fixed in wave 2). This widget is
     `pro-elements` in BUILDER_WIDGET_CATALOG_2026-09-17.pro.json. Wave one put
     it in General, because at the time General was where every Pro widget sat;
     the override seam gave Elementor Pro's six groups their real names and the
     panel test caught it. */
  category: "Pro",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    url: "",
    tabs: "timeline",
    small_header: "",
    show_cover: "yes",
    show_facepile: "yes",
    show_cta: "yes",
    height: 500,
  },
  controls: [
    { key: "url", label: "Link", type: "link", tab: "content", section: "Page",
      help: "The address of your Facebook page." },
    { key: "tabs", label: "Layout", type: "select", tab: "content", section: "Page", options: [
      { value: "timeline", label: "Timeline" }, { value: "events", label: "Events" },
      { value: "messages", label: "Messages" }] },
    { key: "small_header", label: "Small Header", type: "toggle", tab: "content", section: "Page",
      help: "Use the short header" },
    { key: "show_cover", label: "Cover Photo", type: "toggle", tab: "content", section: "Page",
      help: "Show the page's cover photo" },
    { key: "show_facepile", label: "Profile Photos", type: "toggle", tab: "content", section: "Page",
      help: "Show the faces of people who follow you" },
    { key: "show_cta", label: "Custom CTA Button", type: "toggle", tab: "content", section: "Page",
      help: "Show the button set up on your Facebook page" },
    { key: "height", label: "Height", type: "number", tab: "content", section: "Page" },
  ],
  /* NO STYLE TAB — the machine file gives this widget one section, "Page", on
     the Content tab, and no style controls. What is drawn is Facebook's card. */
};

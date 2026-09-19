/**
 * families/f2-pictures/videoPlaylist.ts — Elementor PRO's **Video Playlist**.
 *
 * A player with a list of videos beside it. Offer file: `website.elementor_pro`
 * and `landing.elementor_pro`. Not the newsletter (a mailbox runs no player)
 * and not a proposal (paper has nothing to click).
 *
 * Titles, panel sections, control labels and defaults from
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`, widget `video-playlist`.
 *
 * ── WHAT THE CANVAS DRAWS, AND WHAT A VISITOR WITHOUT JAVASCRIPT GETS ─────
 * The live widget needs JavaScript. Ours draws the STATIC shape of it — the
 * first video's picture, the playlist name, and every item as a row with its
 * title and duration — and every row is a real link to the video. So the same
 * markup is both the editor's picture of the page AND the no-JavaScript
 * fallback: a visitor whose browser runs nothing still sees the list and can
 * still open any video. Nothing here needs a script to be visible, which is
 * also what makes the widget editable in place.
 */
import { esc } from "../../../render";
import { bar, box, pictureFrom, solid } from "../../../pictures";
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import type { FamilyWidgetDef } from "../types";
import { emptyDrop, img, isOn, mediaUrl, rows, str } from "./media";

/** Elementor's own HTML tags for the playlist name. */
const TITLE_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "div", "span"]
  .map((v) => ({ value: v, label: v.toUpperCase() }));

/** The address of one playlist row, whichever kind of video it is. */
function itemUrl(row: any): string {
  if (!row || typeof row !== "object") return "";
  return str(row.youtube_url || row.vimeo_url || row.hosted_url || row.external_url || row.url);
}

/** A tag we will actually put in the page. Anything else becomes h2. */
function titleTag(v: unknown): string {
  const t = str(v).toLowerCase();
  return TITLE_TAGS.some((o) => o.value === t) ? t : "h2";
}

export function renderVideoPlaylist(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const items = rows(p.tabs).filter((it) => itemUrl(it) || str(it && it.title));
  if (!items.length) {
    return emptyDrop(ctx.mode, "Add the videos for this playlist in the panel on the right.");
  }
  const tag = titleTag(p.playlist_title_tag);
  const name = str(p.playlist_title) || "Playlist";
  const poster = mediaUrl(p.image_overlay) || mediaUrl(items[0] && items[0].thumbnail);
  const showCount = isOn(p.show_video_count);
  const showDuration = isOn(p.show_duration);
  const showThumbs = isOn(p.show_thumbnail);

  const stage = poster
    ? `<div class="bx-vpl-stage" style="position:relative;border-radius:8px;overflow:hidden;background:#0F172A">
        ${img(poster, name, "width:100%;display:block;object-fit:cover;aspect-ratio:16/9;opacity:.85")}
        <span aria-hidden="true" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:999px;background:rgba(255,255,255,.9);display:block"></span>
      </div>`
    : `<div class="bx-vpl-stage" style="border-radius:8px;background:#0F172A;aspect-ratio:16/9"></div>`;

  const list = items.map((it) => {
    const url = itemUrl(it);
    const title = str(it && it.title) || "Untitled video";
    const dur = showDuration ? str(it && it.duration) : "";
    const thumb = showThumbs ? mediaUrl(it && it.thumbnail) : "";
    const inner = `${thumb ? img(thumb, "", "width:64px;height:36px;object-fit:cover;border-radius:4px;flex:0 0 auto") : ""}
      <span style="flex:1 1 auto;min-width:0">${esc(title)}</span>
      ${dur ? `<span style="color:#64748B;font-size:12px">${esc(dur)}</span>` : ""}`;
    const style = "display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid #E2E8F0;color:inherit;text-decoration:none";
    return url
      ? `<a class="bx-vpl-item" href="${esc(url)}" style="${style}">${inner}</a>`
      : `<div class="bx-vpl-item" style="${style}">${inner}</div>`;
  }).join("");

  return `<div class="bx-vpl">
    <div class="bx-vpl-top" style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding-bottom:6px">
      <${tag} class="bx-vpl-name" style="margin:0;font-size:16px">${esc(name)}</${tag}>
      ${showCount ? `<span style="color:#64748B;font-size:12px">${items.length} videos</span>` : ""}
    </div>
    ${stage}
    <div class="bx-vpl-list" style="border:1px solid #E2E8F0;border-bottom:none;border-radius:8px;overflow:hidden;margin-top:8px">${list}</div>
  </div>`;
}

export const VIDEO_PLAYLIST_DEF: FamilyWidgetDef = {
  kind: "video_playlist",
  label: "Video Playlist",
  description: {
    website: "A video player with the rest of your videos listed beside it.",
    landing: "A video player with the rest of your videos listed beside it.",
  },
  icon: "ListVideo",
  picture: pictureFrom(solid(6, 8, 32, 22) + box(42, 8, 16, 6) + box(42, 16, 16, 6) + box(42, 24, 16, 6)
    + `<path d="M19 15l7 4-7 4z" fill="#FFFFFF" stroke="none"/>` + bar(6, 34, 20, 2)),
  category: "General",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    playlist_title: "Playlist",
    playlist_title_tag: "h2",
    tabs: [],
    show_image_overlay: "",
    image_overlay: "",
    autoplay_on_load: "",
    autoplay_next: "",
    show_video_count: "yes",
    show_duration: "yes",
    show_thumbnail: "yes",
  },
  controls: [
    /* Content → Playlist. */
    { key: "playlist_title", label: "Playlist Name", type: "text", tab: "content", section: "Playlist" },
    { key: "playlist_title_tag", label: "HTML Tag", type: "select", tab: "content", section: "Playlist", options: TITLE_TAGS },
    { key: "tabs", label: "Playlist Items", type: "list", tab: "content", section: "Playlist",
      help: "One video per row: its title, its address and how long it runs." },
    /* Content → Image Overlay. */
    { key: "show_image_overlay", label: "Image Overlay", type: "toggle", tab: "content", section: "Image Overlay" },
    { key: "image_overlay", label: "Choose Image", type: "image", tab: "content", section: "Image Overlay" },
    /* Content → Additional Options. */
    { key: "autoplay_on_load", label: "On Load", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "autoplay_next", label: "Next Up", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "show_video_count", label: "Video Count", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "show_duration", label: "Duration", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "show_thumbnail", label: "Thumbnails", type: "toggle", tab: "content", section: "Additional Options" },
    /* Style → Layout, Top Bar, Videos. Elementor's own section names. */
    { key: "tabs_alignment", label: "Video Position", type: "select", tab: "style", section: "Layout", options: [
      { value: "start", label: "Start" }, { value: "end", label: "End" }] },
    { key: "playlist_name_color", label: "Color", type: "colour", tab: "style", section: "Top Bar" },
    { key: "playlist_name_background", label: "Background", type: "colour", tab: "style", section: "Top Bar" },
    { key: "normal_color", label: "Color", type: "colour", tab: "style", section: "Videos" },
    { key: "normal_background", label: "Background", type: "colour", tab: "style", section: "Videos" },
  ],
};

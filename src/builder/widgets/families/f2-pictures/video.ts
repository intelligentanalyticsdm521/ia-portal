/**
 * families/f2-pictures/video.ts — Elementor's **Video** (`video`, group Basic).
 *
 * Offer file `BUILDER_OFFERS_2026-09-19.json`: `website`, `landing` **and the
 * newsletter**, with the offer file's own note *"video shows as a clickable
 * picture"*. The newsletter half was written and tested on the first wave of
 * this family and has been waiting on one thing: the tile. It has it now.
 *
 * Not a proposal — the offer file's `not_offered_because_paper_cannot_do_them`
 * names it, and paper cannot play anything.
 *
 * This REPLACES the legacy `video` (four controls of Elementor's fifty-seven,
 * no Image Overlay, no Lightbox, no Source). Every property it stored is still
 * read: `url` is the Portal's own key and is read beside Elementor's
 * `youtube_url` / `vimeo_url`, and `autoplay`, `mute` and `controls` are
 * Elementor's own keys already.
 *
 * ── WHAT A STILL CANVAS CAN AND CANNOT SHOW ───────────────────────────────
 * Every one of this widget's player switches — Start Time, End Time, Autoplay,
 * Mute, Loop, Player Controls, Privacy Mode, Controls Color — is a QUERY
 * PARAMETER on the embed address, which is exactly how YouTube and Vimeo
 * themselves take them. So each one changes the `src` the canvas draws, which
 * is a change a test can see and a change the author can check. Nothing here
 * needed a settings envelope.
 *
 * Sections, labels, options, defaults and `responsive` flags from
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`, widget `video`.
 */
import { esc } from "../../../esc";
import { box, pictureFrom } from "../../../pictures";
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import type { FamilyWidgetDef, EmailRenderContext, LandingRenderContext } from "../types";
import { emptyDrop, isOn, mediaUrl, str } from "./media";
import { num } from "./styling";

/** Elementor's own five sources. `videopress` is not offered — see the handoff. */
const SOURCES = [
  { value: "youtube", label: "YouTube" },
  { value: "vimeo", label: "Vimeo" },
  { value: "dailymotion", label: "Dailymotion" },
  { value: "hosted", label: "Self Hosted" },
];

/** Elementor's own Aspect Ratio values — its own spelling, its own words. */
const ASPECT_RATIOS = [
  { value: "11", label: "1:1" },
  { value: "32", label: "3:2" },
  { value: "43", label: "4:3" },
  { value: "169", label: "16:9" },
  { value: "219", label: "21:9" },
  { value: "916", label: "9:16" },
];

/** `169` → the CSS padding that holds a 16:9 box open. */
export function aspectPadding(v: unknown): number {
  const raw = str(v) || "169";
  const m = raw.match(/^(\d)(\d)$/) || raw.match(/^(\d{2})(\d)$/) || raw.match(/^(\d)(\d{2})$/);
  if (!m) return 56.25;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return 56.25;
  return Math.round((h / w) * 10000) / 100;
}

/** Which source the author chose, falling back to what the address looks like. */
export function sourceOf(p: any): string {
  const declared = str(p.video_type).trim();
  if (declared) return declared;
  const u = rawUrl(p);
  if (/vimeo\.com/i.test(u)) return "vimeo";
  if (/dailymotion\.com|dai\.ly/i.test(u)) return "dailymotion";
  if (mediaUrl(p.hosted_url)) return "hosted";
  return "youtube";
}

/** The address the author typed, in whichever key holds it. */
export function rawUrl(p: any): string {
  return str(p.youtube_url) || str(p.vimeo_url) || str(p.dailymotion_url)
    || mediaUrl(p.external_url) || str(p.url);
}

/**
 * THE EMBED ADDRESS, with every player switch on it.
 *
 * Returns "" when there is nothing to play — an address we cannot recognise is
 * never guessed at, because a frame pointed at a page that is not a player is
 * a broken box on a customer's website.
 */
export function videoEmbed(p: any): string {
  const source = sourceOf(p);
  const u = rawUrl(p);
  const q = new URLSearchParams();
  const start = num(p.start);
  const end = num(p.end);

  if (source === "vimeo") {
    const m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (!m) return "";
    if (isOn(p.autoplay)) q.set("autoplay", "1");
    if (isOn(p.mute)) q.set("muted", "1");
    if (isOn(p.loop)) q.set("loop", "1");
    if (p.controls !== undefined && !isOn(p.controls)) q.set("controls", "0");
    const colour = str(p.color).replace(/^#/, "");
    if (/^[0-9a-fA-F]{3,8}$/.test(colour)) q.set("color", colour);
    if (start != null) q.set("#t", String(start));
    const s = q.toString();
    return `https://player.vimeo.com/video/${m[1]}${s ? `?${s}` : ""}`;
  }
  if (source === "dailymotion") {
    const m = u.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([A-Za-z0-9]+)/);
    if (!m) return "";
    if (isOn(p.autoplay)) q.set("autoplay", "1");
    if (isOn(p.mute)) q.set("mute", "1");
    if (p.controls !== undefined && !isOn(p.controls)) q.set("controls", "0");
    if (start != null) q.set("start", String(start));
    const s = q.toString();
    return `https://www.dailymotion.com/embed/video/${m[1]}${s ? `?${s}` : ""}`;
  }
  if (source === "hosted") return mediaUrl(p.hosted_url) || mediaUrl(p.external_url);

  const m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (!m) return "";
  if (isOn(p.autoplay)) q.set("autoplay", "1");
  if (isOn(p.mute)) q.set("mute", "1");
  if (isOn(p.loop)) { q.set("loop", "1"); q.set("playlist", m[1]); }
  if (p.controls !== undefined && !isOn(p.controls)) q.set("controls", "0");
  if (start != null) q.set("start", String(start));
  if (end != null) q.set("end", String(end));
  const host = isOn(p.yt_privacy) ? "www.youtube-nocookie.com" : "www.youtube.com";
  const s = q.toString();
  return `https://${host}/embed/${m[1]}${s ? `?${s}` : ""}`;
}

/** The picture the author chose to sit over the player. */
export function overlayPicture(p: any): string {
  return mediaUrl(p.image_overlay) || mediaUrl(p.poster) || mediaUrl(p.thumbnail);
}

/** The play triangle, at the author's own size and colour. */
function playIcon(p: any): string {
  const size = num(p.play_icon_size) ?? 48;
  const colour = str(p.play_icon_color) || "#FFFFFF";
  return `<span class="bx-video-play" aria-hidden="true" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${size}px;height:${size}px;line-height:${size}px;text-align:center;font-size:${Math.round(size * 0.55)}px;color:${esc(colour)};text-shadow:0 1px 3px rgba(0,0,0,.45)">▶</span>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PAGE
   ══════════════════════════════════════════════════════════════════════════ */

export function renderVideo(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const src = videoEmbed(p);
  if (!src) return emptyDrop(ctx.mode, "Paste the address of a YouTube, Vimeo or Dailymotion video in the panel on the right.");

  const pad = aspectPadding(p.aspect_ratio);
  const frame = `position:relative;padding-top:${pad}%`;

  /* IMAGE OVERLAY. Elementor draws the picture and holds the player back until
     it is pressed; on the canvas that is the honest thing to draw too, because
     it is what the visitor sees first. */
  if (isOn(p.show_image_overlay) && overlayPicture(p)) {
    const lightbox = isOn(p.lightbox) ? ` data-elementor-open-lightbox="yes"` : "";
    const cover = `<img src="${esc(overlayPicture(p))}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:8px"/>`;
    return `<div class="bx-video bx-video-overlay" style="${frame}"${lightbox} data-video="${esc(src)}">
      ${cover}${p.show_play_icon === undefined || isOn(p.show_play_icon) ? playIcon(p) : ""}
    </div>`;
  }

  if (sourceOf(p) === "hosted") {
    const flags = [
      isOn(p.autoplay) ? " autoplay" : "",
      isOn(p.mute) ? " muted" : "",
      isOn(p.loop) ? " loop" : "",
      p.controls === undefined || isOn(p.controls) ? " controls" : "",
    ].join("");
    const poster = overlayPicture(p) ? ` poster="${esc(overlayPicture(p))}"` : "";
    return `<div class="bx-video" style="${frame}">
      <video src="${esc(src)}"${poster}${flags} style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:8px"></video>
    </div>`;
  }

  return `<div class="bx-video" style="${frame}">
    <iframe src="${esc(src)}" title="Video" loading="lazy" allowfullscreen
      style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:8px"></iframe>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE MAILBOX — a real picture that is a real link. No mailbox plays one.

   THE BYTES HERE ARE LUMEN'S. `LUMEN-API/src/lib/emailFamilies/f2-pictures.js`
   is the copy that actually SENDS, it was written and tested in wave 1 of this
   family, and `test/fixtures/email-render-cases.json` is checked into both
   repos byte-identical — one character apart and both suites go red. So this
   function is that one, element for element, and the reason each choice was
   made is written there: a table rather than a div because Word lays out
   tables and nothing else, the play mark as a text character rather than a
   second picture so it cannot be the one image that fails to load, and the
   author's own words as the alt so a reader with pictures off still gets
   something to press.
   ══════════════════════════════════════════════════════════════════════════ */

/** The widest a picture may be inside a newsletter's own padding. */
const EMAIL_PICTURE = 552;

/** YouTube gives every video a still, so a poster is not the author's job. */
export function youtubeStill(url: string): string {
  const m = str(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : "";
}

/** What the link says, and what a reader with pictures off is told it is. */
export function videoTitle(p: any): string {
  return str(p.title) || str(p.caption) || "Watch the video";
}

export function emailVideo(w: Widget, ctx: EmailRenderContext): string {
  const p: any = w.props || {};
  const url = rawUrl(p);
  const title = videoTitle(p);
  if (!url) {
    return ctx.mode === "edit"
      ? `<div style="border:1px dashed #CBD5E1;border-radius:6px;padding:20px;text-align:center;color:#94A3B8;font-size:12px;">`
        + `Paste the address of a YouTube or Vimeo video in the panel on the right.</div>`
      : "";
  }
  const still = overlayPicture(p) || youtubeStill(url);
  const inner = still
    ? `<img src="${esc(still)}" alt="${esc(title)}" width="${EMAIL_PICTURE}" `
      + `style="display:block;width:100%;max-width:${EMAIL_PICTURE}px;height:auto;border:0;outline:none;text-decoration:none;margin:0 auto;" />`
    : `<span style="display:inline-block;padding:12px 18px;border:1px solid #CBD5E1;border-radius:6px;color:#0F172A;">${esc(title)}</span>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">`
    + `<tr><td align="center" style="padding:0 0 6px 0;">`
    + `<a href="${esc(url)}" style="text-decoration:none;color:inherit;">${inner}</a>`
    + `</td></tr>`
    + `<tr><td align="center" style="font-size:13px;color:#475569;padding:0 0 16px 0;">`
    + `<a href="${esc(url)}" style="color:#475569;">&#9654;&nbsp;${esc(title)}</a>`
    + `</td></tr></table>`;
}

/** The plain-text twin. LUMEN's words, for the same reason. */
export function emailVideoText(p: any): string | null {
  const url = rawUrl(p);
  return url ? `${videoTitle(p)}: ${url}` : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE HOSTED LANDING PAGE
   ══════════════════════════════════════════════════════════════════════════ */

export function landingVideo(w: Widget, ctx: LandingRenderContext): string {
  const inner = renderVideo(w, ctx as unknown as RenderContext);
  if (!inner) return "";
  return inner.replace('class="bx-video"', 'class="bx-video lp-video"');
}

/* ══════════════════════════════════════════════════════════════════════════
   THE DEFINITION
   ══════════════════════════════════════════════════════════════════════════ */

export const VIDEO_DEF: FamilyWidgetDef = {
  kind: "video",
  label: "Video",
  description: {
    website: "A video from YouTube, Vimeo or Dailymotion, playing on the page.",
    landing: "A video from YouTube, Vimeo or Dailymotion, playing on the page.",
    email: "A picture of your video that opens it when the reader presses it — no mailbox can play one.",
  },
  icon: "Play",
  picture: pictureFrom(box(8, 8, 48, 24) + `<path d="M28 15l10 5-10 5z" fill="#94A3B8" stroke="none"/>`),
  category: "Basic",
  builders: ["website", "landing", "newsletter"],
  tier: "free",
  defaults: {
    video_type: "youtube",
    youtube_url: "",
    vimeo_url: "",
    autoplay: "",
    mute: "",
    loop: "",
    controls: "yes",
    yt_privacy: "",
    show_image_overlay: "",
    image_overlay: "",
    show_play_icon: "yes",
    lightbox: "",
    aspect_ratio: "169",
  },
  controls: [
    /* ── Content ▸ Video ─────────────────────────────────────────────── */
    { key: "video_type", label: "Source", type: "select", tab: "content", section: "Video", options: SOURCES },
    { key: "youtube_url", label: "Link", type: "link", tab: "content", section: "Video",
      help: "Paste the address from YouTube." },
    { key: "vimeo_url", label: "Vimeo Link", type: "link", tab: "content", section: "Video",
      help: "Paste the address from Vimeo." },
    { key: "hosted_url", label: "Choose Video File", type: "image", tab: "content", section: "Video",
      help: "Paste the address of a video file you host yourself." },
    { key: "start", label: "Start Time", type: "number", tab: "content", section: "Video",
      help: "Seconds from the beginning." },
    { key: "end", label: "End Time", type: "number", tab: "content", section: "Video" },
    { key: "autoplay", label: "Autoplay", type: "toggle", tab: "content", section: "Video" },
    { key: "mute", label: "Mute", type: "toggle", tab: "content", section: "Video" },
    { key: "loop", label: "Loop", type: "toggle", tab: "content", section: "Video" },
    { key: "controls", label: "Player Controls", type: "toggle", tab: "content", section: "Video" },
    { key: "yt_privacy", label: "Privacy Mode", type: "toggle", tab: "content", section: "Video" },
    { key: "color", label: "Controls Color", type: "colour", tab: "content", section: "Video" },
    /* ── Content ▸ Image Overlay ─────────────────────────────────────── */
    { key: "show_image_overlay", label: "Image Overlay", type: "toggle", tab: "content", section: "Image Overlay" },
    { key: "image_overlay", label: "Choose Image", type: "image", tab: "content", section: "Image Overlay" },
    { key: "show_play_icon", label: "Play Icon", type: "toggle", tab: "content", section: "Image Overlay" },
    { key: "lightbox", label: "Lightbox", type: "toggle", tab: "content", section: "Image Overlay" },
    /* ── Style ▸ Video ───────────────────────────────────────────────── */
    { key: "aspect_ratio", label: "Aspect Ratio", type: "select", tab: "style", section: "Video", options: ASPECT_RATIOS },
    /* ── Style ▸ Image Overlay ───────────────────────────────────────── */
    { key: "play_icon_color", label: "Play Icon Color", type: "colour", tab: "style", section: "Image Overlay" },
    { key: "play_icon_size", label: "Play Icon Size", type: "number", tab: "style", section: "Image Overlay", responsive: true },
  ],
};

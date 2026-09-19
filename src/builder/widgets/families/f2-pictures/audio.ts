/**
 * families/f2-pictures/audio.ts — Elementor's **SoundCloud** (slug `audio`).
 *
 * A player for a track the business already has on SoundCloud. Offer file
 * `BUILDER_OFFERS_2026-09-19.json`: `website.elementor_free` and
 * `landing.elementor_free`. Not the newsletter and not a proposal.
 *
 * ── WHY IT IS HERE WHEN THE PLAN SAID "DROPPED" ───────────────────────────
 * `BUILDER_FULL_WIDGET_PLAN_2026-09-19` row 21 marks this one `n/a — third
 * party product surface; dropped`. The OFFER FILE Brandon approved at 12:58 on
 * 2026-09-19 lists `audio` for both page builders, and the standing instruction
 * is that where the plan and the offer file disagree, THE OFFER FILE WINS. It
 * is also the same shape as Video, which nobody calls a third-party surface: an
 * address the business pastes in, played in a frame. `feedback_no_third_party_
 * product_surface` is about building someone else's product INTO ours, not
 * about a client embedding their own media. The disagreement is written in the
 * handoff so the main session can overrule it in one line if it wants to.
 *
 * Title, group, section, control labels and defaults from
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`, widget `audio` — read in
 * the live Playground editor too, where the widget is called SoundCloud and
 * sits in General.
 *
 * Elementor gives this widget NO Style tab. Neither do we: a Style tab with
 * controls Elementor does not have is exactly the inventing this pass exists to
 * stop. The player's one colour is Controls Color, on the Content tab, where
 * Elementor puts it.
 */
import { esc } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import type { FamilyWidgetDef } from "../types";
import { emptyDrop, isOn, str } from "./media";

/** Elementor's switcher values, as the SoundCloud player's own query wants. */
const flag = (v: unknown): string => (isOn(v) ? "true" : "false");

/** Is this really a SoundCloud address? We only ever frame one of those. */
export function soundcloudUrl(v: unknown): string {
  const u = str(v && typeof v === "object" ? (v as any).url : v).trim();
  return /^https?:\/\/([a-z0-9-]+\.)?soundcloud\.com\//i.test(u) ? u : "";
}

/** The player address for a track, with the author's switches on it. */
export function soundcloudPlayer(p: any): string {
  const track = soundcloudUrl(p.link);
  if (!track) return "";
  const q = new URLSearchParams({
    url: track,
    visual: flag(p.visual === "yes" || p.visual === true),
    auto_play: flag(p.sc_auto_play),
    buying: flag(p.sc_buying),
    liking: flag(p.sc_liking),
    download: flag(p.sc_download),
    show_artwork: flag(p.sc_show_artwork),
    sharing: flag(p.sc_sharing),
    show_comments: flag(p.sc_show_comments),
    show_playcount: flag(p.sc_show_playcount),
    show_user: flag(p.sc_show_user),
  });
  const colour = str(p.sc_color).replace(/^#/, "");
  if (/^[0-9a-fA-F]{3,8}$/.test(colour)) q.set("color", `#${colour}`);
  return `https://w.soundcloud.com/player/?${q.toString()}`;
}

export function renderAudio(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const src = soundcloudPlayer(p);
  if (!src) {
    return emptyDrop(ctx.mode, "Paste the address of a SoundCloud track in the panel on the right.");
  }
  const tall = p.visual === "yes" || p.visual === true;
  /* A frame needs no JavaScript to play, and the link under it is what a
     reader gets if the frame is blocked — so the widget is never a blank band. */
  return `<div class="bx-audio">
    <iframe src="${esc(src)}" title="Audio player" loading="lazy" scrolling="no" frameborder="no"
      style="width:100%;height:${tall ? 300 : 120}px;border:0;border-radius:8px"></iframe>
    <noscript><a href="${esc(soundcloudUrl(p.link))}">Listen to this track</a></noscript>
  </div>`;
}

export const AUDIO_DEF: FamilyWidgetDef = {
  kind: "audio",
  /* ELEMENTOR'S OWN TITLE for the slug `audio`. Not "Audio". */
  label: "SoundCloud",
  description: {
    website: "A track of yours from SoundCloud, played on the page.",
    landing: "A track of yours from SoundCloud, played on the page.",
  },
  icon: "Music",
  picture: pictureFrom(box(6, 10, 52, 20) + bar(12, 18, 6, 6) + bar(21, 15, 6, 12)
    + bar(30, 13, 6, 16) + bar(39, 17, 6, 8) + bar(48, 19, 4, 4)),
  category: "General",
  builders: ["website", "landing"],
  tier: "free",
  defaults: {
    link: "",
    visual: "no",
    sc_auto_play: "",
    sc_buying: "yes",
    sc_liking: "yes",
    sc_download: "yes",
    sc_show_artwork: "yes",
    sc_sharing: "yes",
    sc_show_comments: "yes",
    sc_show_playcount: "yes",
    sc_show_user: "yes",
    sc_color: "",
  },
  controls: [
    { key: "link", label: "Link", type: "link", tab: "content", section: "SoundCloud",
      help: "Paste the address of the track from SoundCloud." },
    { key: "visual", label: "Visual Player", type: "select", tab: "content", section: "SoundCloud", options: [
      { value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
    { key: "sc_auto_play", label: "Autoplay", type: "toggle", tab: "content", section: "SoundCloud" },
    { key: "sc_buying", label: "Buy Button", type: "toggle", tab: "content", section: "SoundCloud" },
    { key: "sc_liking", label: "Like Button", type: "toggle", tab: "content", section: "SoundCloud" },
    { key: "sc_download", label: "Download Button", type: "toggle", tab: "content", section: "SoundCloud" },
    { key: "sc_show_artwork", label: "Artwork", type: "toggle", tab: "content", section: "SoundCloud" },
    { key: "sc_sharing", label: "Share Button", type: "toggle", tab: "content", section: "SoundCloud" },
    { key: "sc_show_comments", label: "Comments", type: "toggle", tab: "content", section: "SoundCloud" },
    { key: "sc_show_playcount", label: "Play Counts", type: "toggle", tab: "content", section: "SoundCloud" },
    { key: "sc_show_user", label: "Username", type: "toggle", tab: "content", section: "SoundCloud" },
    { key: "sc_color", label: "Controls Color", type: "colour", tab: "content", section: "SoundCloud" },
  ],
};

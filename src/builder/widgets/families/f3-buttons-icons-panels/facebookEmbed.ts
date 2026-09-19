/**
 * Facebook Embed — Elementor `facebook-embed`, group Pro.
 *
 * Elementor's own title, its own panel section ("Embed") and its own control
 * labels ("Type", "URL", "Full Post", "Parent Comment", "Allow Full Screen",
 * "Autoplay", "Captions"), read off
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json` — the registry scraped from a
 * real Elementor 4.1.1 Pro editor. NOT seen live: the WordPress Playground
 * sandbox the free widgets were photographed in has no Pro licence, so nobody
 * watched this one render. Said plainly in the handoff rather than guessed at.
 *
 * ── OFFERED ON: website, landing ──────────────────────────────────────────
 * `BUILDER_OFFERS_2026-09-19.json` lists `facebook-embed` under
 * `website.elementor_pro` and `landing.elementor_pro` and nowhere else. The
 * 2026-09-19 widget plan's table marks this row "dropped"; the offer file is
 * the contract Brandon approved and the instruction is explicit that where the
 * two disagree the offer file wins, so it is built, for those two builders.
 *
 * ── IT NEEDS JAVASCRIPT, SO IT HAS A FALLBACK ─────────────────────────────
 * On a published page this is drawn by Facebook's own SDK. Our canvas does not
 * load that SDK and a reader who blocks third-party scripts never will, so what
 * this renderer draws is the no-JS version: a card naming what is embedded with
 * a real link to it. That is a working page element, not a placeholder — the
 * post is one click away whether or not the script arrives.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { pictureFrom, bar, box } from "../../../pictures";
import type { FamilyWidgetDef } from "../types";
import { fallbackCard, str } from "./shared";

/** Elementor's `type` select, and the URL control each choice reads. */
const URL_KEY_OF: Readonly<Record<string, string>> = {
  post: "post_url",
  video: "video_url",
  comment: "comment_url",
};

/** What the card calls each kind, in a business owner's words. */
const NOUN_OF: Readonly<Record<string, string>> = {
  post: "a Facebook post",
  video: "a Facebook video",
  comment: "a comment on Facebook",
};

/** The address this widget is pointed at, for whichever Type is chosen. */
export function embedUrl(props: Record<string, unknown>): string {
  const type = str(props.type) || "post";
  return str(props[URL_KEY_OF[type] || "post_url"]).trim();
}

export function renderFacebookEmbed(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const type = str(p.type) || "post";
  const url = embedUrl(p);
  if (!url && ctx.mode !== "edit") return "";
  if (!url) {
    return `<div class="bx-f3-fbembed bx-f3-fbembed-empty" style="border:1px dashed #CBD5E1;border-radius:8px;padding:16px;text-align:center;color:#94A3B8;font-size:12px">Paste the address of ${esc(NOUN_OF[type] || NOUN_OF.post)} in the panel on the right.</div>`;
  }
  return `<div class="bx-f3-fbembed">${fallbackCard({
    title: "From Facebook",
    line: `This shows ${NOUN_OF[type] || NOUN_OF.post} on the page.`,
    href: url,
    linkText: "Open it on Facebook",
    accent: ctx.accent,
  })}</div>`;
}

export const FACEBOOK_EMBED_DEF: FamilyWidgetDef = {
  kind: "facebook_embed",
  label: "Facebook Embed",
  description: {
    website: "A post, video or comment from your Facebook page, shown on the page.",
    landing: "A post, video or comment from your Facebook page, shown on the page.",
  },
  icon: "Facebook",
  picture: pictureFrom(box(8, 8, 48, 24) + bar(14, 14, 20, 4) + bar(14, 22, 34) + bar(14, 28, 26)),
  category: "General",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    type: "post",
    post_url: "",
    video_url: "",
    comment_url: "",
    show_text: "",
    include_parent: "",
    video_allowfullscreen: "",
    video_autoplay: "",
    video_show_captions: "",
  },
  controls: [
    { key: "type", label: "Type", type: "select", tab: "content", section: "Embed", options: [
      { value: "post", label: "Post" }, { value: "video", label: "Video" }, { value: "comment", label: "Comment" }] },
    { key: "post_url", label: "URL", type: "link", tab: "content", section: "Embed",
      help: "The address of the post. Only used when Type is Post." },
    { key: "video_url", label: "URL", type: "link", tab: "content", section: "Embed",
      help: "The address of the video. Only used when Type is Video." },
    { key: "comment_url", label: "URL", type: "link", tab: "content", section: "Embed",
      help: "The address of the comment. Only used when Type is Comment." },
    { key: "show_text", label: "Full Post", type: "toggle", tab: "content", section: "Embed",
      help: "Show the whole post, not just the first few lines" },
    { key: "include_parent", label: "Parent Comment", type: "toggle", tab: "content", section: "Embed",
      help: "Show the comment this one replied to" },
    { key: "video_allowfullscreen", label: "Allow Full Screen", type: "toggle", tab: "content", section: "Embed",
      help: "Let people watch it full screen" },
    { key: "video_autoplay", label: "Autoplay", type: "toggle", tab: "content", section: "Embed",
      help: "Start playing on its own" },
    { key: "video_show_captions", label: "Captions", type: "toggle", tab: "content", section: "Embed",
      help: "Show subtitles" },
  ],
  /* NO STYLE TAB, and that is Elementor's answer, not a shortcut: the machine
     file gives this widget exactly one panel section — `section_content`,
     "Embed", on the Content tab — and no style controls at all, because what
     is drawn is Facebook's own card. */
};

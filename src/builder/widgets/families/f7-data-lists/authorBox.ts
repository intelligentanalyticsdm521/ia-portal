/**
 * families/f7-data-lists/authorBox.ts — **Author Box**, Elementor `author-box`.
 *
 * One content section called "Author Info". Elementor's own shape: either the
 * story's own author or one you type in (`source`), then a switch per part —
 * picture, name, biography, archive button — with the typed-in value beside
 * each switch, and `layout` / `alignment` at the bottom. Three style sections,
 * Image, Author and Button.
 *
 * ── THE TYPED-IN VALUES ARE TYPED ON THE PAGE ─────────────────────────────
 * `author_name` and `author_bio` are `text` and `textarea`, which is the
 * engine's way of saying the author types them into the widget itself rather
 * than into a box on the right. So the renderer puts them through `editRun`,
 * the same as every other typed widget on the platform.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, pictureFrom } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import { fromTheSite, num, on, str } from "./shared";

export const AUTHOR_BOX_DEF: FamilyWidgetDef = {
  kind: "author_box",
  label: "Author Box",
  description: "Who wrote it — their picture, their name and a line or two about them.",
  icon: "UserCircle",
  picture: pictureFrom(`<circle cx="16" cy="20" r="9" fill="#94A3B8" stroke="none"/>`
    + bar(32, 12, 24, 5) + bar(32, 22, 26) + bar(32, 30, 16)),
  category: "General",
  builders: ["website"],
  tier: "pro",
  defaults: {
    source: "current", show_avatar: "yes", avatar_size: 300, author_avatar: "",
    show_name: "yes", author_name: "", author_name_tag: "h4",
    show_biography: "yes", author_bio: "", show_link: "no", link_text: "All Posts", posts_url: "",
    layout: "left", alignment: "left",
    image_size: 80, name_color: "", bio_color: "", button_text_color: "", button_background_color: "",
  },
  controls: [
    { key: "source", label: "Source", type: "select", tab: "content", section: "Author Info", options: [
      { value: "current", label: "Current Author" }, { value: "custom", label: "Custom" }] },
    { key: "show_avatar", label: "Profile Picture", type: "toggle", tab: "content", section: "Author Info", help: "Show the picture" },
    { key: "author_avatar", label: "Profile Picture", type: "image", tab: "content", section: "Author Info" },
    { key: "show_name", label: "Display Name", type: "toggle", tab: "content", section: "Author Info", help: "Show the name" },
    { key: "author_name", label: "Name", type: "text", tab: "content", section: "Author Info" },
    { key: "author_name_tag", label: "HTML Tag", type: "select", tab: "content", section: "Author Info", options: [
      "h1", "h2", "h3", "h4", "h5", "h6", "div", "span"].map((v) => ({ value: v, label: v.toUpperCase() })) },
    { key: "show_biography", label: "Biography", type: "toggle", tab: "content", section: "Author Info", help: "Show the few lines about them" },
    { key: "author_bio", label: "Biography", type: "textarea", tab: "content", section: "Author Info" },
    { key: "show_link", label: "Archive Button", type: "toggle", tab: "content", section: "Author Info", help: "Show a button to everything they wrote" },
    { key: "link_text", label: "Archive Text", type: "text", tab: "content", section: "Author Info" },
    { key: "posts_url", label: "Archive Button", type: "link", tab: "content", section: "Author Info" },
    { key: "layout", label: "Layout", type: "select", tab: "content", section: "Author Info", options: [
      { value: "left", label: "Picture on the left" }, { value: "above", label: "Picture above" },
      { value: "right", label: "Picture on the right" }] },
    { key: "alignment", label: "Alignment", type: "select", tab: "content", section: "Author Info", options: [
      { value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }] },
    { key: "image_size", label: "Image Size", type: "number", tab: "style", section: "Image", responsive: true },
    { key: "name_color", label: "Color", type: "colour", tab: "style", section: "Author" },
    { key: "bio_color", label: "Color", type: "colour", tab: "style", section: "Author" },
    { key: "button_text_color", label: "Text Color", type: "colour", tab: "style", section: "Button" },
    { key: "button_background_color", label: "Background Color", type: "colour", tab: "style", section: "Button" },
  ],
};

export const renderAuthorBox: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  const layout = str(p.layout) || "left";
  const align = str(p.alignment) || "left";
  const size = num(p.image_size, 80);
  const avatar = on(p.show_avatar)
    ? (str(p.author_avatar)
      ? `<img src="${esc(str(p.author_avatar))}" alt="The author" style="width:${size}px;height:${size}px;border-radius:999px;object-fit:cover;flex:0 0 auto"/>`
      : `<span style="width:${size}px;height:${size}px;border-radius:999px;background:#E2E8F0;flex:0 0 auto;display:inline-block"></span>`)
    : "";
  const nameTag = str(p.author_name_tag) || "h4";
  const body = `<div style="flex:1 1 auto;min-width:0;text-align:${esc(align)};color:${esc(str(p.name_color) || ctx.ink)}">`
    + (on(p.show_name) ? editRun("author_name", p.author_name, "bx-h", "The author's name", ctx, nameTag) : "")
    + (on(p.show_biography)
      ? `<div style="color:${esc(str(p.bio_color) || "#5A7A8A")}">${
        editRun("author_bio", p.author_bio, "bx-p", "A line or two about them", ctx, "p")}</div>`
      : "")
    + (on(p.show_link)
      ? `<a class="bx-button" href="${esc(str(p.posts_url) || "#")}" style="margin-top:8px;display:inline-block;`
        + `background:${esc(str(p.button_background_color) || ctx.accent)};color:${esc(str(p.button_text_color) || "#FFFFFF")};text-decoration:none">`
        + `${esc(str(p.link_text) || "All Posts")}</a>`
      : "")
    + `</div>`;
  const row = layout === "above" ? "column" : layout === "right" ? "row-reverse" : "row";
  return `<div class="bx-f7-author" style="display:flex;flex-direction:${row};gap:14px;align-items:${layout === "above" ? "flex-start" : "center"}">`
    + avatar + body + `</div>`
    + fromTheSite(ctx.mode, str(p.source) === "custom"
      ? "These are the words you typed, on every story that shows this box."
      : "Each story fills this in with its own author.");
};

// test/families-f2-pictures.test.mjs — the f2-pictures family keeps its contract.
//
// B-168 section C.1. This file is the family's OWN test and belongs to the
// agent building the family. What was here from the first commit is the
// contract EVERY family keeps:
//
//   · every def has a renderer and every renderer has a def;
//   · every def names builders, out of the offer file's five;
//   · every def is IN THE OFFER for every builder it claims (D-168);
//   · nothing ships with a `requires` gate — Brandon decides the tiers in
//     October and that must then be a change to DATA, not a rebuild.
//
// Added by the f2-pictures build, one block per widget: the def says what
// Elementor says, the renderer DRAWS THE THING (presence, not absence), and an
// empty widget helps the author in the editor and prints nothing on the page.
//
// ── MUTATION CHECKS (run, then restored — see the handoff) ────────────────
//   1. a def with a kind and label the offer file does not carry  → red,
//      naming the folder and the builder;
//   2. a def with no renderer                                     → red;
//   3. `renderAudio` made to accept any address (the soundcloud.com test
//      removed)                                                   → red on the
//      "only a SoundCloud address is framed" case;
//   4. `renderHotspot` made to print the dots and NOT the list    → red on the
//      no-JavaScript fallback case.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
/* THE ONE INDEX FIRST, and it matters. A widget module imports `esc` from
   render.ts, render.ts imports families/index.ts, and families/index.ts
   imports this folder — the same deliberate cycle every D-156 atom sits in
   (widgets/index.ts explains it). It is safe because everything crossing it is
   a hoisted function used at CALL time, but only if evaluation STARTS outside
   the folder: entering at f2-pictures/index.ts leaves families/index.ts
   reading `F2_PICTURES` while this folder is still initialising. The app always
   enters through registry.ts, so this line is what makes the TEST match the
   app rather than a rearrangement of it. */
import "../src/builder/widgets/families/index.ts";
import {
  FAMILY, AUDIO_DEF, BASIC_GALLERY_DEF, HOTSPOT_DEF, IMAGE_BOX_DEF, IMAGE_CAROUSEL_DEF,
  IMAGE_DEF, LOTTIE_DEF, PRO_GALLERY_DEF, VIDEO_DEF, VIDEO_PLAYLIST_DEF,
  renderAudio, renderBasicGallery, renderHotspot, renderImage, renderImageBox,
  renderImageCarousel, renderLottie, renderProGallery, renderVideo, renderVideoPlaylist,
  emailImage, emailImageBox, emailVideo, emailImageText, emailVideoText,
  landingBasicGallery, landingImage, galleryForPrint, videoEmbed, aspectPadding,
  pictureOf, boxTitle, carouselSlides,
  soundcloudPlayer,
} from "../src/builder/widgets/families/f2-pictures/index.ts";
import { assertFamilyContract, SETTINGS_KEYS } from "./helpers/familyContract.mjs";

/** A RenderContext with only what a picture widget reads. */
const CTX = (mode) => ({ mode, accent: "#2563EB", ink: "#0F172A", merge: {}, numbers: {} });
const W = (kind, props) => ({ id: "w1", kind, props });

test("f2-pictures: the family exports the one shape families/index.ts collects", () => {
  assert.ok(Array.isArray(FAMILY.defs), "defs is an array");
  assert.equal(typeof FAMILY.renderers, "object", "renderers is a map");
});

test("f2-pictures: every widget it declares keeps the contract", () => {
  assertFamilyContract("f2-pictures", FAMILY);
});

/* ═══════════════════════════════════════════════════════════════════════════
   THE NAMES ARE ELEMENTOR'S. Checked against the 2026-09-17 machine files, not
   against what we happen to have called things.
   ═════════════════════════════════════════════════════════════════════════ */

describe("f2-pictures: every label is Elementor's own title", () => {
  const PAIRS = [
    [PRO_GALLERY_DEF, "gallery"],
    [VIDEO_PLAYLIST_DEF, "video-playlist"],
    [AUDIO_DEF, "audio"],
    [LOTTIE_DEF, "lottie"],
    [HOTSPOT_DEF, "hotspot"],
    /* Wave 2: the five the panel already had and which were thin. */
    [IMAGE_DEF, "image"],
    [IMAGE_BOX_DEF, "image-box"],
    [IMAGE_CAROUSEL_DEF, "image-carousel"],
    [BASIC_GALLERY_DEF, "image-gallery"],
    [VIDEO_DEF, "video"],
  ];

  /**
   * THE ONLY CONTROL KEYS IN THIS FAMILY THAT ELEMENTOR DOES NOT HAVE.
   *
   * Two, both the same thing: ALT TEXT. WordPress keeps a picture's alt on the
   * MEDIA RECORD and Elementor's widget reads it from there, so Elementor has
   * no control for it. We have no media library — an address is pasted in — so
   * without these two a picture in a newsletter has no alt text at all, which
   * is what `adapters/email`'s own pre-send check warns about and what a screen
   * reader needs. `image_alt` is the key the D-165 Image Box already used.
   *
   * The list is written HERE, by name, so it cannot grow quietly: anything else
   * a family adds that Elementor does not have fails the build.
   */
  const NOT_ELEMENTORS = { image: ["alt"], "image-box": ["image_alt"] };
  for (const [def, slug] of PAIRS) {
    test(`${def.kind} is "${SETTINGS_KEYS.widgets[slug].title}"`, () => {
      assert.equal(def.label, SETTINGS_KEYS.widgets[slug].title,
        `the panel must call it what Elementor calls it (slug ${slug})`);
    });
    test(`${def.kind}: tier matches Elementor's own pro-elements group`, () => {
      assert.equal(def.tier, SETTINGS_KEYS.widgets[slug].pro ? "pro" : "free");
    });
    test(`${def.kind}: every control key is a real key on ${slug}`, () => {
      // A control whose key the page engine does not have is a setting the
      // author changes and the live page ignores.
      const legal = new Set(SETTINGS_KEYS.widgets[slug].keys);
      const allowed = NOT_ELEMENTORS[slug] || [];
      const bad = def.controls.map((c) => c.key).filter((k) => !legal.has(k) && !allowed.includes(k));
      assert.deepEqual(bad, [], `${slug}: not controls Elementor has`);
    });
    test(`${def.kind}: responsive is copied from the machine file, never guessed`, () => {
      const keys = new Set(SETTINGS_KEYS.widgets[slug].keys);
      for (const c of def.controls) {
        if (!c.responsive) continue;
        assert.ok(keys.has(`${c.key}_tablet`) || keys.has(`${c.key}_mobile`),
          `${slug}.${c.key} is marked responsive and Elementor has no device twin for it`);
      }
    });
  }

  test("the family is whole: all ten of F2, and no eleventh", () => {
    // Wave 1 added the five the panel did not have; wave 2 took over the five
    // it did. A sixth name here that is not one of the ten is the invention
    // D-168 exists to stop, and the offer test fails on it too.
    assert.deepEqual(FAMILY.defs.map((d) => d.kind).sort(), [
      "audio", "basic_gallery", "hotspot", "image", "image_box", "image_carousel",
      "lottie", "pro_gallery", "video", "video_playlist",
    ]);
  });

  test("each widget is offered exactly where the offer file gives it", () => {
    // Belt and braces over assertFamilyContract, which checks that a claimed
    // builder IS in the offer. This checks the other direction as well: the
    // whole list, per widget, read off BUILDER_OFFERS_2026-09-19.json by hand.
    const OFFERED = {
      image: ["landing", "mybrand", "newsletter", "proposal", "website"],
      image_box: ["landing", "newsletter", "proposal", "website"],
      image_carousel: ["landing", "website"],
      basic_gallery: ["landing", "proposal", "website"],
      video: ["landing", "newsletter", "website"],
      pro_gallery: ["landing", "website"],
      video_playlist: ["landing", "website"],
      audio: ["landing", "website"],
      lottie: ["landing", "website"],
      hotspot: ["landing", "website"],
    };
    for (const def of FAMILY.defs) {
      assert.deepEqual([...def.builders].sort(), OFFERED[def.kind], def.kind);
    }
  });

  test("the family draws the surfaces the adapters do NOT already draw, and no more", () => {
    /* A row in `emailRenderers` or `landingRenderers` TAKES THE KIND OVER from
       the adapter's own switch. For Image and Image Box that switch has drawn
       them for months, in tables, with the newsletter's own type, and forty
       golden cases hold those bytes — so a row here would have restyled every
       newsletter already written just to reach a property name. The property
       name was the whole problem, so the property name is what was fixed:
       `emailRender.ts` and `landingRender.ts` now read a picture through THIS
       family's readers. One reader per question, one look per surface.
       What the family DOES own is what those switches could not draw at all:
       Video in a mailbox (no case; it drew "needs a newer version") and Basic
       Gallery on a hosted page (aliased to the legacy Photo gallery, which
       reads a property this widget has never written). */
    assert.deepEqual(Object.keys(FAMILY.emailRenderers || {}), ["video"]);
    assert.deepEqual(Object.keys(FAMILY.landingRenderers || {}), ["basic_gallery"]);
  });

  test("the readers the adapters were given are exported, and read BOTH spellings", () => {
    /* The seam this family hands the two adapters. If one of these stops
       reading the older spelling, a newsletter written in July loses its
       picture — quietly, which is the failure mode that matters. */
    assert.equal(pictureOf({ src: "https://example.test/old.jpg" }), "https://example.test/old.jpg");
    assert.equal(pictureOf({ image: { url: "https://example.test/new.jpg" } }), "https://example.test/new.jpg");
    assert.equal(boxTitle({ title: "Older" }), "Older");
    assert.equal(boxTitle({ title_text: "Newer" }), "Newer");
    assert.equal(carouselSlides({ images: ["https://example.test/i.jpg"] }).length, 1);
    assert.equal(carouselSlides({ carousel: ["https://example.test/c.jpg"] }).length, 1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   THE RENDERERS DRAW THE THING. Presence, every time.
   ═════════════════════════════════════════════════════════════════════════ */

describe("f2-pictures: an empty widget helps the author and prints nothing", () => {
  const EMPTY = [
    ["pro_gallery", renderProGallery, {}],
    ["video_playlist", renderVideoPlaylist, {}],
    ["audio", renderAudio, {}],
    ["lottie", renderLottie, {}],
    ["hotspot", renderHotspot, {}],
    ["image", renderImage, {}],
    ["image_carousel", renderImageCarousel, {}],
    ["basic_gallery", renderBasicGallery, {}],
    ["video", renderVideo, {}],
  ];

  /* IMAGE BOX IS NOT IN THAT LIST, and it is the one exception with a reason.
     Elementor's Image Box is a picture AND two lines of words, so an empty one
     in the editor must still offer both lines to click into — a single "choose
     a picture" box would be a widget an author cannot start typing in. It
     prints nothing on the page, which is the half of the rule that matters to
     a customer, and `builder-widget-set.test.mjs` pins the other half. */
  test("image_box: the editor offers the picture AND both lines to type into", () => {
    const html = renderImageBox(W("image_box", {}), CTX("edit"));
    assert.match(html, /bx-imgdrop/, "the picture drop");
    assert.match(html, /data-edit="title_text"/);
    assert.match(html, /data-edit="description_text"/);
  });
  test("image_box: nothing at all on the page", () => {
    assert.equal(renderImageBox(W("image_box", {}), CTX("view")), "");
  });
  for (const [kind, render, props] of EMPTY) {
    test(`${kind}: one plain sentence in the editor`, () => {
      const html = render(W(kind, props), CTX("edit"));
      assert.match(html, /bx-imgdrop/, "the canvas's own empty box");
      assert.match(html, /panel on the right/, "and it says what to do next");
    });
    test(`${kind}: nothing at all on the page`, () => {
      assert.equal(render(W(kind, props), CTX("view")), "");
    });
  }
});

describe("pro_gallery draws the pictures", () => {
  const props = {
    gallery: [
      { url: "https://example.test/one.jpg", title: "Front lawn", alt: "A lawn" },
      { url: "https://example.test/two.jpg", title: "Back lawn" },
    ],
    columns: 3, gap: 12, aspect_ratio: "16:9",
    overlay_background: "yes", overlay_title: "title",
  };
  const html = renderProGallery(W("pro_gallery", props), CTX("view"));

  test("every picture is on the page", () => {
    assert.match(html, /one\.jpg/);
    assert.match(html, /two\.jpg/);
  });
  test("the columns, the spacing and the aspect ratio are the author's", () => {
    assert.match(html, /repeat\(3,minmax\(0,1fr\)\)/);
    assert.match(html, /gap:12px/);
    assert.match(html, /aspect-ratio:16\/9/);
  });
  test("the overlay writes the field the author chose", () => {
    assert.match(html, /Front lawn/);
    assert.match(html, /Back lawn/);
  });
  test("the overlay is off when the author turns the background off", () => {
    const off = renderProGallery(W("pro_gallery", { ...props, overlay_background: "" }), CTX("view"));
    assert.equal(/Front lawn/.test(off), false);
    assert.match(off, /one\.jpg/, "the pictures are still there");
  });
});

describe("video_playlist is readable with no JavaScript at all", () => {
  const props = {
    playlist_title: "How we do it", playlist_title_tag: "h3",
    show_video_count: "yes", show_duration: "yes", show_thumbnail: "yes",
    tabs: [
      { title: "Spring clean-up", youtube_url: "https://youtu.be/aaaaaa", duration: "2:10" },
      { title: "Aeration", youtube_url: "https://youtu.be/bbbbbb", duration: "1:40" },
    ],
  };
  const html = renderVideoPlaylist(W("video_playlist", props), CTX("view"));

  test("the playlist name is drawn with the tag the author chose", () => {
    assert.match(html, /<h3[^>]*>How we do it<\/h3>/);
  });
  test("every video is a real link, so a reader with no script can still open it", () => {
    assert.match(html, /href="https:\/\/youtu\.be\/aaaaaa"/);
    assert.match(html, /href="https:\/\/youtu\.be\/bbbbbb"/);
  });
  test("the titles, the durations and the count are all printed", () => {
    assert.match(html, /Spring clean-up/);
    assert.match(html, /2:10/);
    assert.match(html, /2 videos/);
  });
  test("nothing in it is a script", () => {
    assert.equal(/<script/i.test(html), false);
  });
});

describe("audio frames a SoundCloud track and nothing else", () => {
  const good = { link: "https://soundcloud.com/a-business/a-track", visual: "no", sc_show_artwork: "yes" };

  test("the player carries the track and the author's switches", () => {
    const src = soundcloudPlayer(good);
    assert.match(src, /^https:\/\/w\.soundcloud\.com\/player\/\?/);
    assert.match(src, /show_artwork=true/);
    assert.match(src, /auto_play=false/);
  });
  test("the frame is on the page, with a plain link under it", () => {
    const html = renderAudio(W("audio", good), CTX("view"));
    assert.match(html, /<iframe/);
    assert.match(html, /<noscript><a href="https:\/\/soundcloud\.com\/a-business\/a-track"/);
  });
  test("only a SoundCloud address is framed", () => {
    // An address from anywhere else is not a SoundCloud track, and framing
    // whatever was pasted is how a page ends up embedding something nobody
    // chose. It reads as empty instead, which the author can see and fix.
    const html = renderAudio(W("audio", { link: "https://example.test/evil" }), CTX("edit"));
    assert.match(html, /bx-imgdrop/);
    assert.equal(/<iframe/.test(html), false);
  });
  test("Elementor gives SoundCloud no Style tab, and neither do we", () => {
    assert.deepEqual(AUDIO_DEF.controls.filter((c) => c.tab === "style"), []);
  });
});

describe("lottie draws a still frame, which is also the no-JavaScript fallback", () => {
  const props = {
    source: "external_url", source_external_url: { url: "https://example.test/a.json" },
    caption_source: "custom", caption: "Watch it grow", align: "left",
  };
  const html = renderLottie(W("lottie", props), CTX("view"));

  test("the caption the author typed is on the page", () => {
    assert.match(html, /Watch it grow/);
  });
  test("the alignment is the author's", () => {
    assert.match(html, /text-align:left/);
  });
  test("nothing in it is a script", () => {
    assert.equal(/<script/i.test(html), false);
  });
  test("a media-file source is read from the file, not from the external address", () => {
    const empty = renderLottie(W("lottie", { source: "media_file", source_external_url: { url: "https://example.test/a.json" } }), CTX("view"));
    assert.equal(empty, "", "nothing chosen yet means nothing printed");
  });
});

describe("hotspot prints every label, not only the dots", () => {
  const props = {
    image: "https://example.test/yard.jpg",
    hotspot: [
      { hotspot_label: "Edging", hotspot_tooltip_content: "Cut along every bed", hotspot_offset_x: 20, hotspot_offset_y: 30 },
      { hotspot_label: "Mulch", hotspot_tooltip_content: "Two inches, no more", hotspot_offset_x: 70, hotspot_offset_y: 60 },
    ],
  };
  const html = renderHotspot(W("hotspot", props), CTX("view"));

  test("the picture is there", () => {
    assert.match(html, /yard\.jpg/);
  });
  test("the dots sit where the author put them", () => {
    assert.match(html, /left:20%;top:30%/);
    assert.match(html, /left:70%;top:60%/);
  });
  test("every tooltip is also printed as words, for a reader with no script", () => {
    assert.match(html, /Cut along every bed/);
    assert.match(html, /Two inches, no more/);
  });
  test("nothing in it is a script", () => {
    assert.equal(/<script/i.test(html), false);
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
   WAVE 2 — the five everyday widgets, deepened.

   One block each, and the SAME three questions of every one of them:

     1. does a STORED DOCUMENT from before this change still draw? A family
        that replaces a kind keeps the kind, and that is worth nothing unless
        the properties the old definition wrote are still read;
     2. does every control the panel offers CHANGE THE CANVAS? The brief:
        "a control that changes nothing on the canvas is a defect, not a
        feature". The sweep below is mechanical — it sets each control to a
        value of its own type, renders, and fails BY NAME on any control whose
        output is byte-identical to the default;
     3. is the OFFER kept on every surface the widget claims?
   ═════════════════════════════════════════════════════════════════════════ */

/**
 * EVERY VALUE THIS CONTROL CAN HOLD, for the "does it change anything" sweep.
 *
 * For a select that is every one of Elementor's own options except the one the
 * widget already defaults to — trying only the first would let a control pass
 * or fail on the accident of which option happens to be listed second.
 */
function probes(control, def, now) {
  if (control.type === "select") {
    /* The value the widget is ALREADY at — which is the base's, not the
       definition's, wherever the base turned a partner on. Reading the
       definition here would offer a select its own current value as the only
       candidate and call a live control dead. */
    const current = String(now[control.key] ?? "");
    return (control.options || [])
      .map((o) => (typeof o === "string" ? o : o.value))
      .filter((v) => String(v) !== current);
  }
  if (control.type === "colour") return ["#AA3311"];
  if (control.type === "number") return [37, 3];
  if (control.type === "toggle") return ["yes", ""];
  if (control.type === "image" || control.type === "link") return ["https://example.test/probe.png"];
  if (control.type === "text" || control.type === "textarea") return ["A probe"];
  return [];
}

/**
 * EVERY CONTROL CHANGES SOMETHING. Executed, not read.
 *
 * The widget is rendered at its defaults over `base`, then once per candidate
 * value of each control. A control passes when ANY value it can hold changes
 * the drawn output, and fails BY NAME when none of them does.
 *
 * `base` turns on a control's PARTNER where it has one — a caption's colour
 * cannot show without a caption, and a Lightbox cannot show without a link —
 * because skipping those would be the same as not testing them.
 *
 * `skip` is what is left: a control that belongs to a branch this base is not
 * in, with the case that does drive it named. Written out by hand, so a control
 * quietly doing nothing cannot hide in it.
 */
function assertEveryControlDraws(def, render, base, skip = {}) {
  const now = { ...def.defaults, ...base };
  const at = (extra) => render(W(def.kind, { ...now, ...extra }), CTX("view"));
  const before = at({});
  const dead = [];
  for (const c of def.controls) {
    if (skip[c.key]) continue;
    const values = probes(c, def, now);
    if (!values.length) continue;
    if (!values.some((v) => at({ [c.key]: v }) !== before)) dead.push(c.key);
  }
  assert.deepEqual(dead, [],
    `${def.kind}: these controls are on the panel and change nothing on the canvas`);
}

describe("Image — Elementor's own Content and Style tabs", () => {
  const props = {
    image: "https://example.test/lawn.jpg", alt: "A finished lawn",
    caption_source: "custom", caption: "Edged and cut",
    align: "start", width: 60, image_border_border: "solid",
    image_border_width: 3, image_border_color: "#112233", image_border_radius: 8,
    text_color: "#445566", caption_typography_font_size: 15,
  };
  const html = renderImage(W("image", props), CTX("view"));

  test("the picture, its description and its caption are all on the page", () => {
    assert.match(html, /lawn\.jpg/);
    assert.match(html, /alt="A finished lawn"/);
    assert.match(html, /Edged and cut/);
  });
  test("the Style tab is really applied", () => {
    assert.match(html, /text-align:left/, "Alignment");
    assert.match(html, /width:60%/, "Width");
    assert.match(html, /border-style:solid/, "Border Type");
    assert.match(html, /border-width:3px/, "Border Width");
    assert.match(html, /border-color:#112233/, "Border Color");
    assert.match(html, /border-radius:8px/, "Border Radius");
    assert.match(html, /color:#445566/, "Caption Text Color");
    assert.match(html, /font-size:15px/, "Caption Size");
  });
  test("Caption: None prints no caption at all", () => {
    const none = renderImage(W("image", { ...props, caption_source: "none" }), CTX("view"));
    assert.equal(/Edged and cut/.test(none), false);
    assert.match(none, /lawn\.jpg/, "the picture is still there");
  });
  test("Link and Lightbox turn it into Elementor's own anchor", () => {
    const linked = renderImage(W("image", { ...props, link_to: "file", open_lightbox: "yes" }), CTX("view"));
    assert.match(linked, /<a href="https:\/\/example\.test\/lawn\.jpg" data-elementor-open-lightbox="yes">/);
  });
  test("Image Resolution caps how wide it is drawn", () => {
    const thumb = renderImage(W("image", { ...props, image_size: "thumbnail" }), CTX("view"));
    assert.match(thumb, /max-width:150px/);
  });

  test("A DOCUMENT SAVED BEFORE THIS CHANGE STILL DRAWS", () => {
    // What the D-165 definition wrote: `src`, `alt`, `caption`.
    const old = renderImage(W("image", { src: "https://example.test/old.jpg", alt: "Old", caption: "From July" }), CTX("view"));
    assert.match(old, /old\.jpg/);
    assert.match(old, /alt="Old"/);
    assert.match(old, /From July/);
  });

  test("every control on the panel changes the canvas", () => {
    assertEveryControlDraws(IMAGE_DEF, renderImage, {
      image: "https://example.test/lawn.jpg",
      // The partners, so the caption's own style and the lightbox are reachable.
      caption_source: "custom", caption: "Edged and cut",
      link_to: "custom", link: "https://example.test/go",
      image_border_border: "solid",
    });
  });

  test("the mailbox half draws a real picture with alt text, and a plain-text twin", () => {
    const mail = emailImage(W("image", props), { mode: "view", accent: "#2563EB" });
    assert.match(mail, /<img /);
    assert.match(mail, /alt="A finished lawn"/);
    assert.equal(/class=|display:flex|display:grid/.test(mail), false, "a mailbox takes none of those");
    assert.equal(emailImageText(props), "[A finished lawn] Edged and cut");
  });
  test("the hosted landing page keeps its own class so the stylesheet still holds it", () => {
    assert.match(landingImage(W("image", props), { mode: "view" }), /class="bx-figure lp-fig"/);
  });
});

describe("Image Box — Elementor's Content tab and its three Style sections", () => {
  const props = {
    image: "https://example.test/crew.jpg", image_alt: "The crew",
    title_text: "Weekly mowing", description_text: "Every Tuesday, April to October",
    title_size: "h2", position: "left", text_align: "start", image_space: 20,
    title_color: "#101820", description_color: "#556677", image_size: 40,
    image_border_border: "solid", image_border_width: 2, image_border_color: "#99AABB",
  };
  const html = renderImageBox(W("image_box", props), CTX("view"));

  test("the picture, the title and the line under it are all on the page", () => {
    assert.match(html, /crew\.jpg/);
    assert.match(html, /Weekly mowing/);
    assert.match(html, /Every Tuesday, April to October/);
  });
  test("the Title HTML Tag is the author's", () => {
    assert.match(html, /<h2[^>]*>Weekly mowing<\/h2>/);
  });
  test("Style ▸ Box puts the picture where the author asked", () => {
    assert.match(html, /flex-direction:row/, "Image Position: Left");
    assert.match(html, /gap:20px/, "Image Spacing");
    assert.match(html, /text-align:left/, "Alignment");
  });
  test("Style ▸ Image and Style ▸ Content are really applied", () => {
    assert.match(html, /border-color:#99AABB/);
    assert.match(html, /color:#101820/, "Title Color");
    assert.match(html, /color:#556677/, "Description Color");
    assert.match(html, /40%/, "Width");
  });
  test("Image Position: Right turns the row round", () => {
    const right = renderImageBox(W("image_box", { ...props, position: "right" }), CTX("view"));
    assert.match(right, /flex-direction:row-reverse/);
  });

  test("A DOCUMENT SAVED BEFORE THIS CHANGE STILL DRAWS", () => {
    // Both older spellings: the D-165 definition's keys, and the `src` / `title`
    // the mailbox renderer has been reading since before that.
    const old = renderImageBox(W("image_box", { src: "https://example.test/o.jpg", title: "Older", description: "Words" }), CTX("view"));
    assert.match(old, /o\.jpg/);
    assert.match(old, /Older/);
    assert.match(old, /Words/);
  });

  test("every control on the panel changes the canvas", () => {
    assertEveryControlDraws(IMAGE_BOX_DEF, renderImageBox, {
      image: "https://example.test/crew.jpg", title_text: "T", description_text: "D",
      // Beside the words, so Vertical Alignment has something to align.
      position: "left", image_border_border: "solid",
      link: "https://example.test/mowing",
    });
  });
  test("a Link wraps the picture", () => {
    const linked = renderImageBox(W("image_box", { ...props, link: "https://example.test/mowing" }), CTX("view"));
    assert.match(linked, /<a href="https:\/\/example\.test\/mowing"/);
  });

  test("the mailbox half is a table with no class and no flex", () => {
    const mail = emailImageBox(W("image_box", props), { mode: "view", accent: "#2563EB" });
    assert.match(mail, /<table role="presentation"/);
    assert.match(mail, /Weekly mowing/);
    assert.equal(/class=|display:flex|display:grid/.test(mail), false);
  });
});

describe("Image Carousel — what is drawn, and what rides in the settings", () => {
  const props = {
    carousel: [
      { url: "https://example.test/1.jpg", title: "One" },
      { url: "https://example.test/2.jpg", title: "Two" },
      { url: "https://example.test/3.jpg", title: "Three" },
    ],
    slides_to_show: "2", navigation: "both", caption_type: "title",
    image_spacing: "custom", image_spacing_custom: 24,
    arrows_color: "#123456", dots_color: "#654321", dots_size: 10,
    autoplay: "", infinite: "", speed: 900, effect: "slide",
  };
  const html = renderImageCarousel(W("image_carousel", props), CTX("view"));

  test("Slides to Show really limits what is drawn", () => {
    assert.match(html, /1\.jpg/);
    assert.match(html, /2\.jpg/);
    assert.equal(/3\.jpg/.test(html), false, "the third is off the first frame");
  });
  test("the caption the author chose is under each picture", () => {
    assert.match(html, />One</);
    assert.match(html, />Two</);
  });
  test("the spacing, the arrows and the dots are the author's", () => {
    assert.match(html, /gap:24px/);
    assert.match(html, /color:#123456/);
    assert.match(html, /background:#654321/);
    assert.match(html, /width:10px;height:10px/);
  });
  test("Effect: Fade shows one picture whatever Slides to Show says", () => {
    const fade = renderImageCarousel(W("image_carousel", { ...props, effect: "fade" }), CTX("view"));
    assert.equal(/2\.jpg/.test(fade), false);
    assert.match(fade, /1\.jpg/);
  });
  test("Direction: Right starts from the other end", () => {
    const rtl = renderImageCarousel(W("image_carousel", { ...props, direction: "rtl" }), CTX("view"));
    assert.match(rtl, /3\.jpg/);
    assert.equal(/1\.jpg/.test(rtl), false);
  });
  test("the controls about TIME are in the output, the way Elementor prints them", () => {
    // Elementor's own frontend reads these off `data-settings`. A still canvas
    // cannot show a picture sliding; a switch reaching nothing at all would be
    // the defect.
    assert.match(html, /data-settings=/);
    assert.match(html, /speed&quot;:900/);
  });

  test("A DOCUMENT SAVED BEFORE THIS CHANGE STILL DRAWS", () => {
    const old = renderImageCarousel(W("image_carousel", {
      carousel: ["https://example.test/old1.jpg", "https://example.test/old2.jpg"], slides_to_show: 2,
    }), CTX("view"));
    assert.match(old, /old1\.jpg/);
    assert.match(old, /old2\.jpg/);
  });
  test("the older `images` spelling arion has always accepted is read too", () => {
    const alt = renderImageCarousel(W("image_carousel", { images: [{ url: "https://example.test/alt.jpg" }] }), CTX("view"));
    assert.match(alt, /alt\.jpg/);
  });

  test("every control on the panel changes the canvas", () => {
    assertEveryControlDraws(IMAGE_CAROUSEL_DEF, renderImageCarousel, {
      carousel: [
        { url: "https://example.test/1.jpg", title: "One", caption: "Cap", description: "Desc" },
        { url: "https://example.test/2.jpg", title: "Two", caption: "Cap2", description: "Desc2" },
        { url: "https://example.test/3.jpg", title: "Three", caption: "Cap3", description: "Desc3" },
      ],
      // The partners: a caption to style, a custom link, a custom gap, a border.
      caption_type: "title", link_to: "custom", link: "https://example.test/go",
      image_spacing: "custom", image_spacing_custom: 24, image_border_border: "solid",
    });
  });
  test("Link: Custom URL and a custom spacing take effect once their partner is set", () => {
    const linked = renderImageCarousel(W("image_carousel", {
      ...props, link_to: "custom", link: "https://example.test/go",
    }), CTX("view"));
    assert.match(linked, /href="https:\/\/example\.test\/go"/);
    const spaced = renderImageCarousel(W("image_carousel", {
      ...props, image_spacing: "custom", image_spacing_custom: 41,
    }), CTX("view"));
    assert.match(spaced, /gap:41px/);
  });
});

describe("Basic Gallery — and the proposal builder it was always offered to", () => {
  const props = {
    wp_gallery: [
      { url: "https://example.test/a.jpg", caption: "Before" },
      { url: "https://example.test/b.jpg", caption: "After" },
    ],
    gallery_columns: "2", image_spacing: "custom", image_spacing_custom: 18,
    image_border_border: "solid", image_border_color: "#334455", image_border_radius: 6,
    text_color: "#778899", typography_font_size: 13,
  };
  const html = renderBasicGallery(W("basic_gallery", props), CTX("view"));

  test("every photograph and every caption is on the page", () => {
    assert.match(html, /a\.jpg/);
    assert.match(html, /b\.jpg/);
    assert.match(html, /Before/);
    assert.match(html, /After/);
  });
  test("the columns, the gap and the borders are the author's", () => {
    assert.match(html, /repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(html, /gap:18px/);
    assert.match(html, /border-color:#334455/);
    assert.match(html, /border-radius:6px/);
  });
  test("Caption: None prints the photographs and no words", () => {
    // The word still appears in the picture's `alt`, which is right — a reader
    // with pictures off must still be told what it is. What goes is the caption
    // ELEMENT under the photograph.
    const none = renderBasicGallery(W("basic_gallery", { ...props, gallery_display_caption: "none" }), CTX("view"));
    assert.equal(/bx-gallery-cap/.test(none), false);
    assert.match(none, /a\.jpg/);
  });
  test("Link: None means the photographs are not links", () => {
    const flat = renderBasicGallery(W("basic_gallery", { ...props, gallery_link: "none" }), CTX("view"));
    assert.equal(/<a href/.test(flat), false);
  });

  test("IT IS OFFERED TO PROPOSALS, which the offer file always gave it", () => {
    assert.ok(BASIC_GALLERY_DEF.builders.includes("proposal"));
  });
  test("the printed half hands over every photograph, with its caption", () => {
    assert.deepEqual(galleryForPrint(props), [
      { src: "https://example.test/a.jpg", alt: "Before", caption: "Before" },
      { src: "https://example.test/b.jpg", alt: "After", caption: "After" },
    ]);
  });

  test("A DOCUMENT SAVED BEFORE THIS CHANGE STILL DRAWS", () => {
    const old = renderBasicGallery(W("basic_gallery", {
      wp_gallery: ["https://example.test/old.jpg"], gallery_columns: 3,
    }), CTX("view"));
    assert.match(old, /old\.jpg/);
    assert.match(old, /repeat\(3,minmax\(0,1fr\)\)/);
  });
  test("the hosted landing page draws the photographs — it drew an empty band before", () => {
    // `LANDING_KIND_ALIASES` sent `basic_gallery` to the legacy Photo gallery,
    // whose renderer reads `p.items`; this widget stores `wp_gallery`.
    const lp = landingBasicGallery(W("basic_gallery", props), { mode: "view" });
    assert.match(lp, /a\.jpg/);
    assert.match(lp, /class="bx-gallery lp-gal"/);
  });

  test("every control on the panel changes the canvas", () => {
    assertEveryControlDraws(BASIC_GALLERY_DEF, renderBasicGallery, {
      wp_gallery: [
        { url: "https://example.test/a.jpg", caption: "Cap", title: "Ti" },
        { url: "https://example.test/b.jpg", caption: "Cap2", title: "Ti2" },
      ],
      image_spacing: "custom", image_spacing_custom: 18, image_border_border: "solid",
    });
  });
});

describe("Video — every player switch is really on the address", () => {
  const props = {
    video_type: "youtube", youtube_url: "https://www.youtube.com/watch?v=abc123xyz",
    start: 30, mute: "yes", controls: "", yt_privacy: "yes", aspect_ratio: "43",
  };
  const html = renderVideo(W("video", props), CTX("view"));

  test("the frame plays the video the author pasted", () => {
    assert.match(html, /youtube-nocookie\.com\/embed\/abc123xyz/, "Privacy Mode");
    assert.match(html, /mute=1/);
    assert.match(html, /controls=0/);
    assert.match(html, /start=30/);
  });
  test("the Aspect Ratio really changes the shape of the box", () => {
    assert.equal(aspectPadding("43"), 75);
    assert.equal(aspectPadding("169"), 56.25);
    assert.match(html, /padding-top:75%/);
  });
  test("Vimeo is a Vimeo player, with the author's Controls Color", () => {
    const src = videoEmbed({ video_type: "vimeo", vimeo_url: "https://vimeo.com/235215203", color: "#FF8800" });
    assert.match(src, /^https:\/\/player\.vimeo\.com\/video\/235215203/);
    assert.match(src, /color=FF8800/);
  });
  test("an address we cannot recognise is never guessed at", () => {
    const bad = renderVideo(W("video", { youtube_url: "https://example.test/not-a-video" }), CTX("edit"));
    assert.match(bad, /bx-imgdrop/);
    assert.equal(/<iframe/.test(bad), false);
  });
  test("an Image Overlay draws the picture and the play icon, at the author's size", () => {
    const over = renderVideo(W("video", {
      ...props, show_image_overlay: "yes", image_overlay: "https://example.test/still.jpg",
      play_icon_color: "#00FF88", play_icon_size: 72,
    }), CTX("view"));
    assert.match(over, /still\.jpg/);
    assert.match(over, /color:#00FF88/);
    assert.match(over, /width:72px/);
    assert.equal(/<iframe/.test(over), false, "the player is held back until it is pressed");
  });
  test("Self Hosted is a real <video> element", () => {
    const hosted = renderVideo(W("video", { video_type: "hosted", hosted_url: "https://example.test/clip.mp4", controls: "yes" }), CTX("view"));
    assert.match(hosted, /<video src="https:\/\/example\.test\/clip\.mp4"/);
    assert.match(hosted, / controls/);
  });

  test("A DOCUMENT SAVED BEFORE THIS CHANGE STILL DRAWS", () => {
    // The D-165 definition stored the address under `url`.
    const old = renderVideo(W("video", { url: "https://youtu.be/oldvideo1", controls: true }), CTX("view"));
    assert.match(old, /youtube\.com\/embed\/oldvideo1/);
  });

  test("every control on the panel changes the canvas", () => {
    assertEveryControlDraws(VIDEO_DEF, renderVideo, {
      youtube_url: "https://www.youtube.com/watch?v=abc123xyz",
      // The partner: the overlay on, so its four controls are reachable.
      show_image_overlay: "yes", image_overlay: "https://example.test/still.jpg",
    }, {
      vimeo_url: "belongs to Source: Vimeo — the Vimeo case above",
      hosted_url: "belongs to Source: Self Hosted — the Self Hosted case above",
      color: "Vimeo's own controls colour; YouTube has none — the Vimeo case above",
    });
  });
  test("Lightbox marks the overlay with Elementor's own attribute", () => {
    const lb = renderVideo(W("video", {
      ...props, show_image_overlay: "yes", image_overlay: "https://example.test/still.jpg", lightbox: "yes",
    }), CTX("view"));
    assert.match(lb, /data-elementor-open-lightbox="yes"/);
  });

  test("IT IS OFFERED TO THE NEWSLETTER, which the offer file always gave it", () => {
    assert.ok(VIDEO_DEF.builders.includes("newsletter"));
  });
  test("the mailbox half is a clickable picture, because no mailbox plays a video", () => {
    const mail = emailVideo(W("video", { ...props, image_overlay: "https://example.test/still.jpg" }), { mode: "view", accent: "#2563EB" });
    assert.match(mail, /<a href="https:\/\/www\.youtube\.com\/watch\?v=abc123xyz"/);
    assert.match(mail, /still\.jpg/);
    assert.match(mail, /<table role="presentation"/, "Word lays out tables and nothing else");
    assert.equal(/<iframe|<video/.test(mail), false, "a mailbox runs neither");
    assert.equal(/class=|display:flex|display:grid/.test(mail), false);
    assert.match(emailVideoText(props), /Watch the video: https:\/\/www\.youtube\.com\/watch\?v=abc123xyz/);
  });

  test("with no picture of its own it uses YouTube's still, then a plain button", () => {
    /* LUMEN's copy is the one that SENDS and the two are byte-identical, which
       `email-render-cases.json` pins in both repos. YouTube gives every video a
       still, so a poster is not the author's job. */
    const auto = emailVideo(W("video", props), { mode: "view" });
    assert.match(auto, /img\.youtube\.com\/vi\/abc123xyz\/hqdefault\.jpg/);
    const vimeo = emailVideo(W("video", { video_type: "vimeo", vimeo_url: "https://vimeo.com/235215203" }), { mode: "view" });
    assert.equal(/<img /.test(vimeo), false, "Vimeo publishes no guessable still");
    assert.match(vimeo, /Watch the video/);
  });
});

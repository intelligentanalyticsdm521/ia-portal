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
  FAMILY, AUDIO_DEF, HOTSPOT_DEF, LOTTIE_DEF, PRO_GALLERY_DEF, VIDEO_PLAYLIST_DEF,
  renderAudio, renderHotspot, renderLottie, renderProGallery, renderVideoPlaylist,
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
  ];
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
      const bad = def.controls.map((c) => c.key).filter((k) => !legal.has(k));
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

  test("the five are the five the panel did not have; the other five are not re-declared", () => {
    assert.deepEqual(FAMILY.defs.map((d) => d.kind).sort(),
      ["audio", "hotspot", "lottie", "pro_gallery", "video_playlist"]);
  });

  test("no picture widget is offered where the offer file does not give it", () => {
    // Belt and braces over assertFamilyContract: these five are page widgets,
    // and a mailbox or a printed page cannot run any of them.
    for (const def of FAMILY.defs) {
      assert.deepEqual([...def.builders].sort(), ["landing", "website"], def.kind);
    }
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
  ];
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

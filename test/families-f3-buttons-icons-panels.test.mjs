// test/families-f3-buttons-icons-panels.test.mjs — the f3-buttons-icons-panels family keeps its contract.
//
// B-168 section C.1. This file is the family's OWN test and belongs to the
// agent building the family: add a case per widget as you add it. What is here
// from the first commit is the contract EVERY family keeps, which is the thing
// that has to be true before a single widget is written:
//
//   · every def has a renderer and every renderer has a def;
//   · every def names builders, out of the offer file's five;
//   · every def is IN THE OFFER for every builder it claims (D-168);
//   · nothing ships with a `requires` gate — Brandon decides the tiers in
//     October and that must then be a change to DATA, not a rebuild.
//
// ── WHY THE ONE INDEX IS IMPORTED FIRST, one line up from the family ──────
// `render.ts` imports `families/index.ts` (one line, §C.1) and this family's
// widgets import `esc` and the text pipeline from `render.ts` — the same cycle
// D-156's atoms already live in, and it is safe because every binding crossing
// it is a hoisted `function`. What is NOT safe is ENTERING that cycle at a
// family folder: `families/index.ts` builds its `FAMILIES` array while this
// folder is still evaluating and reads a `const` that does not exist yet. The
// app never enters there — `families/index.ts` is the only importer of a family
// folder — so the fix is to enter where the app does. One import, and the
// reason written down, rather than a second escaper to dodge the cycle.
import "../src/builder/widgets/families/index.ts";

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FAMILY } from "../src/builder/widgets/families/f3-buttons-icons-panels/index.ts";
import { assertFamilyContract } from "./helpers/familyContract.mjs";
import { makeContext } from "../src/builder/render.ts";
import { emptyDocument } from "../src/builder/model.ts";
import { controlTab, controlSections } from "../src/builder/registry.ts";

/** Elementor's own titles for the five, from the 2026-09-17 machine files. */
const ELEMENTOR_TITLES = {
  share_buttons: "Share Buttons",
  call_to_action: "Call to Action",
  flip_box: "Flip Box",
  facebook_embed: "Facebook Embed",
  facebook_page: "Facebook Page",
};

/** Elementor's Content-tab section names, per widget, from the same files. */
const CONTENT_SECTIONS = {
  share_buttons: ["Share Buttons"],
  call_to_action: ["Image", "Content", "Ribbon"],
  flip_box: ["Front", "Back", "Settings"],
  facebook_embed: ["Embed"],
  facebook_page: ["Page"],
};

const DEF = Object.fromEntries(FAMILY.defs.map((d) => [d.kind, d]));

function ctx(mode = "edit") {
  return makeContext(emptyDocument(), { mode, accent: "#0C4A60" });
}

function draw(kind, props, mode = "edit") {
  return FAMILY.renderers[kind]({ id: `w-${kind}`, kind, props }, ctx(mode));
}

test("f3-buttons-icons-panels: the family exports the one shape families/index.ts collects", () => {
  assert.ok(Array.isArray(FAMILY.defs), "defs is an array");
  assert.equal(typeof FAMILY.renderers, "object", "renderers is a map");
});

test("f3-buttons-icons-panels: every widget it declares keeps the contract", () => {
  assertFamilyContract("f3-buttons-icons-panels", FAMILY);
});

/* ═══════════════════════════════════════════════════════════════════════════
   1. THE FIVE, AND NOTHING ELSE
   ═════════════════════════════════════════════════════════════════════════ */

describe("the family is the five Elementor Pro widgets F3 had nothing for", () => {
  test("exactly those five kinds, by Elementor's own title", () => {
    assert.deepEqual(FAMILY.defs.map((d) => d.kind).sort(), Object.keys(ELEMENTOR_TITLES).sort());
    for (const d of FAMILY.defs) {
      assert.equal(d.label, ELEMENTOR_TITLES[d.kind],
        `${d.kind}: the tile must read Elementor's own title, not ours`);
    }
  });

  test("the eight that already exist are NOT declared a second time here", () => {
    /* `button`, `divider`, `spacer`, `list` (Icon List), `icon`, `icon_box`,
       `social_icons` and `alert` are offered today, from registry.ts and
       widgets/. A copy here would be a second definition of a live kind and
       `builder-registry.test.mjs` fails the build on it ("kinds are unique").
       The move, with the file and line of each old copy, is written up for the
       lander. */
    const live = ["button", "divider", "spacer", "list", "icon", "icon_box", "social_icons", "alert"];
    for (const kind of live) {
      assert.equal(DEF[kind], undefined,
        `${kind} already has a definition outside this folder — two is one too many`);
    }
  });

  test("all five are Pro, in Elementor's General group, and none carries a gate", () => {
    for (const d of FAMILY.defs) {
      assert.equal(d.tier, "pro", `${d.kind}: the machine file has it in \`pro-elements\``);
      assert.equal(d.category, "General", d.kind);
      assert.equal(d.requires, undefined,
        `${d.kind}: Brandon decides the plans in October, and that must be DATA`);
    }
  });

  test("each is offered exactly where the offer file lists it, and nowhere else", () => {
    /* Read straight off BUILDER_OFFERS_2026-09-19.json: `share-buttons`,
       `flip-box`, `facebook-embed` and `facebook-page` are in the website and
       landing Pro lists; `call-to-action` is in those two AND in the proposal
       list. `assertFamilyContract` already refuses a builder that does NOT
       offer a widget; this is the other direction — a builder quietly dropped. */
    assert.deepEqual(DEF.share_buttons.builders, ["website", "landing"]);
    assert.deepEqual(DEF.flip_box.builders, ["website", "landing"]);
    assert.deepEqual(DEF.facebook_embed.builders, ["website", "landing"]);
    assert.deepEqual(DEF.facebook_page.builders, ["website", "landing"]);
    assert.deepEqual(DEF.call_to_action.builders, ["website", "landing", "proposal"]);
  });

  test("every builder a widget claims gets its own plain sentence", () => {
    for (const d of FAMILY.defs) {
      for (const b of d.builders) {
        const adapter = b === "newsletter" ? "email" : b === "mybrand" ? "brand" : b;
        const line = typeof d.description === "string" ? d.description : d.description[adapter];
        assert.ok(line && line.trim().length >= 25,
          `${d.kind} has no sentence for the ${b} pane's tooltip`);
        assert.doesNotMatch(line, /widget|flex|container|CSS|API/i,
          `${d.kind}'s ${b} sentence is written for us, not for a business owner`);
      }
    }
    for (const d of FAMILY.defs) {
      assert.ok(d.picture.startsWith("data:image/svg+xml,"), `${d.kind} has no picture`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. THE PANEL IS ELEMENTOR'S PANEL
   ═════════════════════════════════════════════════════════════════════════ */

describe("the right-hand panel reads as Elementor's", () => {
  for (const [kind, sections] of Object.entries(CONTENT_SECTIONS)) {
    test(`${kind}: the Content tab's sections are Elementor's own, in Elementor's order`, () => {
      const onContent = DEF[kind].controls.filter((c) => controlTab(c) === "content");
      assert.deepEqual(controlSections(onContent).map((g) => g.section), sections);
    });
  }

  test("a control is on one of Elementor's three tabs, never nowhere", () => {
    for (const d of FAMILY.defs) {
      for (const c of d.controls) {
        assert.ok(["content", "style", "advanced"].includes(controlTab(c)), `${d.kind}.${c.key}`);
        assert.ok(c.label && c.label.trim(), `${d.kind}.${c.key} has no label`);
        assert.ok(c.section && String(c.section).trim(),
          `${d.kind}.${c.key} is in no panel section, so it floats above the first heading`);
      }
    }
  });

  test("every control a widget declares has a default, so nothing opens undefined", () => {
    for (const d of FAMILY.defs) {
      for (const c of d.controls) {
        assert.ok(Object.prototype.hasOwnProperty.call(d.defaults, c.key),
          `${d.kind}.${c.key} has a control and no default`);
      }
    }
  });

  test("the two Facebook widgets have no Style tab, which is Elementor's answer", () => {
    // The machine file gives each of them ONE section, on Content, and no style
    // controls at all: what is drawn is Facebook's own card. An invented Style
    // tab would be controls that change nothing on the published page.
    for (const kind of ["facebook_embed", "facebook_page"]) {
      assert.equal(DEF[kind].controls.filter((c) => controlTab(c) === "style").length, 0, kind);
    }
  });

  test("the three that do have one put real controls on it", () => {
    for (const kind of ["share_buttons", "call_to_action", "flip_box"]) {
      assert.ok(DEF[kind].controls.filter((c) => controlTab(c) === "style").length >= 5, kind);
    }
  });

  test("Flip Box's Style tab says WHICH 'Text Color' each one is", () => {
    /* Elementor's "Front" section holds four sub-headings — Icon, Image, Title,
       Description — and five of its controls are labelled "Color" or "Text
       Color". Our `section` is one string, so the sub-heading goes in it; the
       LABELS stay exactly Elementor's words. Without this the panel reads
       "Color, Text Color, Text Color" and nothing says which is which. */
    const style = DEF.flip_box.controls.filter((c) => controlTab(c) === "style");
    const named = style.filter((c) => c.label === "Text Color").map((c) => c.section);
    assert.equal(new Set(named).size, named.length,
      "two controls read 'Text Color' in the same section");
    assert.ok(named.length >= 4, "Elementor has four of them; we should still have them");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. WHAT LANDS ON THE PAGE
   ═════════════════════════════════════════════════════════════════════════ */

describe("Share Buttons", () => {
  const FULL = {
    share_buttons: [{ button: "facebook" }, { button: "linkedin" }],
    view: "icon-text", show_label: "yes", skin: "gradient", shape: "circle",
    share_url_type: "custom", share_url: "https://example.test/spring-tidy",
  };

  test("a real share link per network, and no script needed to make one work", () => {
    const html = draw("share_buttons", FULL, "view");
    assert.match(html, /href="https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=https%3A%2F%2Fexample\.test%2Fspring-tidy"/);
    assert.match(html, /href="https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?url=/);
    assert.doesNotMatch(html, /<script/, "a share link is a link; nothing here needs JavaScript");
    assert.match(html, /Facebook/, "the label is the network's name");
  });

  test("a network the picker does not have is dropped, never drawn dead", () => {
    const html = draw("share_buttons", { ...FULL, share_buttons: [{ button: "myspace" }] }, "view");
    assert.equal(html, "", "a row of dead buttons is worse than no row");
  });

  test("with the target left on Current Page the buttons carry no address, and say so", () => {
    const edit = draw("share_buttons", { ...FULL, share_url_type: "current_page" }, "edit");
    assert.doesNotMatch(edit, /href="https:\/\/www\.facebook\.com\/sharer/,
      "nothing on the canvas knows this page's address, so nothing may invent one");
    assert.match(edit, /address of this page is used when it is published/);
  });
});

describe("Call to Action", () => {
  const FULL = {
    title: "Book your spring tidy", description: "Two of us, half a day.",
    button: "Get a price", link: "https://example.test/quote", link_click: "button",
    bg_image: "https://cdn.example.test/yard.jpg", ribbon_title: "Popular",
    ribbon_horizontal_position: "right", graphic_element: "icon",
  };

  test("the words, the picture, the button and the ribbon all reach the page", () => {
    const html = draw("call_to_action", FULL, "view");
    assert.match(html, /Book your spring tidy/);
    assert.match(html, /Two of us, half a day\./);
    assert.match(html, /Get a price/);
    assert.match(html, /href="https:\/\/example\.test\/quote"/);
    assert.match(html, /cdn\.example\.test\/yard\.jpg/);
    assert.match(html, /Popular/);
  });

  test("Apply Link On = Whole Box gives ONE anchor, never an anchor inside an anchor", () => {
    const html = draw("call_to_action", { ...FULL, link_click: "box" }, "view");
    assert.equal((html.match(/<a /g) || []).length, 1,
      "two nested anchors is markup no browser agrees on");
    assert.match(html, /class="bx-f3-cta-boxlink"/);
  });

  test("the Title HTML Tag is the element the title is drawn as", () => {
    assert.match(draw("call_to_action", { ...FULL, title_tag: "h3" }, "view"), /<h3 [^>]*bx-f3-cta-title/);
    assert.match(draw("call_to_action", { ...FULL, title_tag: "h1" }, "view"), /<h1 [^>]*bx-f3-cta-title/);
  });

  test("a tag a select could never produce is refused, not printed as an element", () => {
    // A stored document can carry anything — including one that came back off a
    // page somebody edited by hand. An unchecked tag name is an injected element.
    const html = draw("call_to_action", { ...FULL, title_tag: "script src=x" }, "view");
    assert.doesNotMatch(html, /<script/);
    assert.match(html, /<h2 [^>]*bx-f3-cta-title/, "it falls back to Elementor's own default");
  });

  test("an empty one draws nothing for a customer and something to click for the author", () => {
    assert.equal(draw("call_to_action", {}, "view"), "");
    assert.match(draw("call_to_action", {}, "edit"), /What you want them to do/);
  });
});

describe("Flip Box", () => {
  const FULL = {
    title_text_a: "Weekly mowing", description_text_a: "Every Tuesday.",
    title_text_b: "From $45 a visit", description_text_b: "Clippings taken.",
    button_text: "See the plan", link: "https://example.test/mowing",
    flip_effect: "flip", flip_direction: "up",
  };

  test("BOTH faces are in the page, so a phone is not shown half the widget", () => {
    const html = draw("flip_box", FULL, "view");
    assert.match(html, /Weekly mowing/);
    assert.match(html, /From \$45 a visit/, "the back face must exist without a hover");
    assert.match(html, /See the plan/);
  });

  test("the flip is CSS, scoped to this widget, and asks for no JavaScript", () => {
    const html = draw("flip_box", FULL, "view");
    assert.doesNotMatch(html, /<script/);
    assert.match(html, /@media \(hover: hover\)/,
      "a hover-only back face is a back face a touch screen never reaches");
    assert.match(html, /#bxflip-w-flip_box\b/, "the rules must not escape this widget");
  });

  test("two flip boxes on one page do not share a rule", () => {
    const a = FAMILY.renderers.flip_box({ id: "one", kind: "flip_box", props: FULL }, ctx("view"));
    const b = FAMILY.renderers.flip_box({ id: "two", kind: "flip_box", props: FULL }, ctx("view"));
    assert.match(a, /#bxflip-one\b/);
    assert.match(b, /#bxflip-two\b/);
    assert.doesNotMatch(a, /#bxflip-two\b/);
  });

  test("Apply Link On = Whole Box links the back face once", () => {
    const html = draw("flip_box", { ...FULL, link_click: "box" }, "view");
    assert.equal((html.match(/<a /g) || []).length, 1);
  });
});

describe("the two Facebook widgets", () => {
  test("Facebook Embed reads the URL control its Type chose, and links to it", () => {
    const post = draw("facebook_embed", { type: "post", post_url: "https://www.facebook.com/x/posts/1" }, "view");
    assert.match(post, /href="https:\/\/www\.facebook\.com\/x\/posts\/1"/);
    assert.match(post, /a Facebook post/);
    const video = draw("facebook_embed", {
      type: "video", post_url: "https://www.facebook.com/x/posts/1",
      video_url: "https://www.facebook.com/x/videos/2",
    }, "view");
    assert.match(video, /href="https:\/\/www\.facebook\.com\/x\/videos\/2"/,
      "Type = Video must read the Video URL, not the post's");
  });

  test("both draw a working card with no script — that IS the fallback", () => {
    for (const [kind, props] of [
      ["facebook_embed", { type: "post", post_url: "https://www.facebook.com/x/posts/1" }],
      ["facebook_page", { url: "https://www.facebook.com/summit-example", tabs: "events" }],
    ]) {
      const html = draw(kind, props, "view");
      assert.doesNotMatch(html, /<script/, `${kind} must not need Facebook's SDK to say anything`);
      assert.match(html, /<a href="https:\/\/www\.facebook\.com/, `${kind} has no way through to Facebook`);
    }
  });

  test("Facebook Page names the page and says what the Layout will show", () => {
    const html = draw("facebook_page", { url: "https://www.facebook.com/summit-example", tabs: "events" }, "view");
    assert.match(html, /summit example on Facebook/);
    assert.match(html, /upcoming events/);
  });

  test("with no address, a customer sees nothing and the author is told what to paste", () => {
    for (const kind of ["facebook_embed", "facebook_page"]) {
      assert.equal(draw(kind, {}, "view"), "", kind);
      assert.match(draw(kind, {}, "edit"), /Paste the address/, kind);
    }
  });
});

describe("nothing this family draws can carry an author's typing into the markup", () => {
  test("an author's angle bracket arrives as text, never as an element", () => {
    /* ASSERT PRESENCE AS WELL AS ABSENCE. `&lt;img` proves the payload went
       THROUGH the one escaper rather than being dropped on the floor, and no
       `<img` proves nothing got out. Checking for the string "onerror" alone
       would be no check at all: correctly escaped text contains it too, which
       is how the first version of this test failed on safe output. */
    const nasty = '"><img src=x onerror=alert(1)>';
    const cases = [
      ["share_buttons", { share_buttons: [{ button: "facebook" }], share_url_type: "custom", share_url: nasty }],
      ["call_to_action", { title: nasty, button: nasty, link: nasty, ribbon_title: nasty }],
      ["flip_box", { title_text_a: nasty, title_text_b: nasty, button_text: nasty, link: nasty }],
      ["facebook_embed", { type: "post", post_url: nasty }],
      ["facebook_page", { url: nasty }],
    ];
    for (const [kind, props] of cases) {
      const html = draw(kind, props, "view");
      assert.doesNotMatch(html, /<img|<script|<svg/i, `${kind} let an element through`);
      assert.doesNotMatch(html, /href="[^"]*"[^<>]*onerror/i, `${kind} let an attribute through`);
      /* Escaped, or percent-encoded where it is going into a URL Facebook or
         X will read back — both are "it went through a rule"; what would be
         wrong is the value silently disappearing. */
      assert.match(html, /&lt;img|&quot;|%3Cimg|%22/, `${kind} dropped the value instead of escaping it`);
    }
  });
});

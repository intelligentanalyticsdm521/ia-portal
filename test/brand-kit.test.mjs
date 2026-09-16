// test/brand-kit.test.mjs — THE brand kit in the Portal
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §2, step 0).
//
// Three things, in the scope doc's own words: "kit resolves from core.tenants;
// fonts round-trip; every former literal is gone (a grep test that fails if
// #1A3A4A or #EF6C33 reappears outside the one default)".
//
// The resolve-and-round-trip halves are pinned in platform-api's own suite
// (test/brand-kit.test.mjs there) because that is where the resolver lives.
// What THIS file pins is the Portal's half: one neutral, declared once; no
// brand-consuming file carrying a colour of its own; and every consumer
// actually reading the hook rather than fetching a brand for itself.
//
// Mutation check: put `#1A3A4A` back as a value in CTAEditorBlock and the
// literal scan goes red; delete the useBrandKit import from DocumentBrandFrame
// and the wiring test goes red.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NEUTRAL_BRAND_KIT, fontStack, readableOn } from "../src/lib/brandKit.ts";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

/**
 * The surfaces that resolve a BUSINESS's brand. These are the files the scope
 * doc names, plus the kit itself. A colour literal in one of them is the bug;
 * a colour literal in a chart palette or a nav chip is not, which is why this
 * is a list and not the whole tree.
 */
const BRAND_CONSUMERS = [
  "lib/brandKit.ts",
  "brand/BrandKitProvider.tsx",
  "components/oliver/DocumentBrandFrame.tsx",
  "components/spark/CTAEditorBlock.tsx",
  "components/spark/SparkCampaignComposerModal.tsx",
  "components/spark/SparkTemplateEditorModal.tsx",
  "components/myBrand/TemplateStudioEditorModal.tsx",
  "pages/spark/SparkLandingPagesPage.tsx",
  "pages/settings/BrandIdentityPage.tsx",
  "builder/registry.ts",
  "builder/WidgetPane.tsx",
];

describe("the neutral default exists exactly once", () => {
  function walk(dir, out = []) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
  }

  test("NEUTRAL_BRAND_KIT is declared in one file and one file only", () => {
    const declared = walk(SRC)
      .filter((f) => /export const NEUTRAL_BRAND_KIT/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f).split(path.sep).join("/"));
    assert.deepEqual(declared, ["lib/brandKit.ts"]);
  });

  test("it is slate — never IA navy, gold or the retired orange", () => {
    const ours = ["#1A3A4A", "#FEC82C", "#EF6C33", "#1A7DB5"];
    for (const [slot, value] of Object.entries(NEUTRAL_BRAND_KIT.colours)) {
      assert.ok(!ours.includes(value.toUpperCase()), `${slot} is ${value}, which is one of OUR colours`);
    }
  });

  test("it is byte-identical to the four API copies", () => {
    // platform-api lib/brandKit.js NEUTRAL_BRAND_KIT, and NEUTRAL_BRAND_COLOURS
    // in oliver-api, arion-api and LUMEN-API. Each repo pins the same five
    // values, so a change in one shows up as a failure in the others.
    assert.deepEqual(NEUTRAL_BRAND_KIT.colours, {
      primary: "#0F172A",
      secondary: "#475569",
      accent: "#334155",
      text: "#111827",
      background: "#FFFFFF",
    });
  });

  test("it is a COMPLETE kit, so no consumer needs a shape of its own", () => {
    assert.equal(typeof NEUTRAL_BRAND_KIT.fonts.heading, "string");
    assert.equal(typeof NEUTRAL_BRAND_KIT.fonts.body, "string");
    assert.ok(Array.isArray(NEUTRAL_BRAND_KIT.fonts.catalog));
    assert.equal(NEUTRAL_BRAND_KIT.logo_url, null);
  });
});

describe("the grep: no former literal in a brand-consuming file", () => {
  // As a VALUE — "#1A3A4A" in quotes, or a bare hex in a style object. A
  // Tailwind arbitrary class (bg-[#1A3A4A]) is the Portal's OWN control chrome
  // — a selected chip, a focus ring — and is not a business's brand. That
  // distinction is the whole rule: the bug was a CLIENT's colour defaulting to
  // ours, never the colour of our own buttons.
  const AS_VALUE = /["'`]#(1A3A4A|FEC82C|EF6C33|1A7DB5)["'`]/i;
  const stripComments = (t) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  for (const rel of BRAND_CONSUMERS) {
    test(`${rel} carries no brand colour of its own`, () => {
      const code = stripComments(read(rel));
      const hit = AS_VALUE.exec(code);
      assert.equal(hit, null, hit ? `${rel} still hardcodes ${hit[0]} — read it from the kit` : "");
    });
  }

  test("every listed consumer still exists (a stale list proves nothing)", () => {
    for (const rel of BRAND_CONSUMERS) {
      assert.ok(read(rel).length > 0, `${rel} is listed but empty or missing`);
    }
  });
});

describe("every consumer reads the ONE hook", () => {
  const MUST_USE_HOOK = [
    "components/oliver/DocumentBrandFrame.tsx",
    "components/spark/CTAEditorBlock.tsx",
    "components/spark/SparkCampaignComposerModal.tsx",
    "components/spark/SparkTemplateEditorModal.tsx",
    "components/myBrand/TemplateStudioEditorModal.tsx",
    "pages/spark/SparkLandingPagesPage.tsx",
    "pages/settings/BrandIdentityPage.tsx",
  ];

  for (const rel of MUST_USE_HOOK) {
    test(`${rel} imports useBrandKit`, () => {
      assert.match(read(rel), /useBrandKit/, `${rel} must read the kit, not a brand of its own`);
    });
  }

  test("the provider is mounted inside the app shell", () => {
    const app = read("App.tsx");
    assert.match(app, /<BrandKitProvider>/);
    // Inside AppStateProvider: the kit needs the ACTIVE business.
    assert.ok(app.indexOf("<AppStateProvider>") < app.indexOf("<BrandKitProvider>"));
  });

  test("Brand Identity WRITES through the kit and no longer through two products", () => {
    const page = read("pages/settings/BrandIdentityPage.tsx");
    assert.match(page, /saveKit\(\{\s*colours:/s, "colours must save through the kit");
    assert.match(page, /saveKit\(\{\s*fonts:/s, "fonts must save through the kit");
    // The two old writers for THESE fields are gone. Voice and tagline still
    // ride the tone_attributes envelope on purpose — they are SPARK facts.
    assert.doesNotMatch(page, /patch<OrgProfile>\("\/settings", \{\s*brandColor/s);
    assert.doesNotMatch(page, /heading_font:\s*typographyDraft/);
  });

  test("the composers no longer fetch a brand of their own from oliver /settings", () => {
    for (const rel of ["components/spark/SparkCampaignComposerModal.tsx", "components/spark/SparkTemplateEditorModal.tsx"]) {
      assert.doesNotMatch(read(rel), /setBrandColors/, `${rel} still fetches its own brand colours`);
    }
  });
});

describe("the helpers", () => {
  test("fontStack uses the catalog the API sent, and degrades sanely", () => {
    const kit = {
      ...NEUTRAL_BRAND_KIT,
      fonts: {
        heading: "Lora",
        body: "Inter",
        catalog: [{ value: "Lora", label: "Lora — soft serif", stack: "Lora, Georgia, serif", export_safe: true }],
      },
    };
    assert.equal(fontStack(kit, "heading"), "Lora, Georgia, serif");
    // Not in the catalog (an older API build): still a usable stack.
    assert.match(fontStack(kit, "body"), /^Inter, system-ui/);
  });

  test("readableOn returns the kit's own ink and paper, not a literal", () => {
    const kit = {
      ...NEUTRAL_BRAND_KIT,
      colours: { ...NEUTRAL_BRAND_KIT.colours, text: "#202020", background: "#FEFEFE" },
    };
    assert.equal(readableOn("#FFEB3B", kit), "#202020", "dark ink on a pale accent");
    assert.equal(readableOn("#0D47A1", kit), "#FEFEFE", "light ink on a dark accent");
    assert.equal(readableOn("not a colour", kit), "#FEFEFE", "junk falls back, it does not throw");
  });
});

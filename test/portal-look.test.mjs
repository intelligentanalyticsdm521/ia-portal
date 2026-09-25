// test/portal-look.test.mjs — the customer portal Look tab, the Portal's half.
//
// CUSTOMER_PORTAL_LOOK_SCOPE_2026-09-25 §5 (build contract), builder C:
//   - the five presets, in the contract's shape, with the research's values;
//   - the contrast arithmetic the warning uses (WCAG 2, 4.5:1), which must agree
//     with oliver-api's save guard;
//   - the Buttons & functions rule (missing = on, except Documents; My visits
//     and Account always on);
//   - the preview's resolved look and the postMessage protocol (§5.2);
//   - the presets file is byte-identical to the customer portal's;
//   - what was deleted stays deleted (Portal Designer page, Welcome HTML
//     scaffold, custom CSS).
//
// Mutation checks: set grounded's border to #DDE3D7 and the contract-example
// test goes red; make normalizeFeatures default documents to true and the
// feature-rule test goes red; put `case 'oliver_portal_designer'` back in
// ServiceRouter and the deletion test goes red.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FEATURE_INFO,
  PRESETS,
  PRESET_INFO,
  PRESET_KEYS,
  contrastRatio,
  relativeLuminance,
} from "../src/pages/oliver/look/presets.ts";
import {
  FEATURES,
  FEATURE_KEYS,
  LOOK_MESSAGE,
  LOOK_READY_MESSAGE,
  MIN_CONTRAST,
  allowancesFromSaved,
  brandFromSaved,
  buttonTextOn,
  choiceFromSaved,
  googleFontHref,
  isLookReady,
  lookMessage,
  lookPreviewSrc,
  lookProblems,
  normalizeFeatures,
  resolvePreviewLook,
  sameChoice,
} from "../src/pages/oliver/look/lookModel.ts";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const HEX = /^#[0-9A-F]{6}$/;

// ── Presets ────────────────────────────────────────────────────────────────

describe("the five presets", () => {
  test("five keys, in the order a business sees them", () => {
    assert.deepEqual(PRESET_KEYS, ["fresh", "friendly", "sturdy", "grounded", "polished"]);
    assert.deepEqual(Object.keys(PRESETS).sort(), [...PRESET_KEYS].sort());
  });

  test("every preset has the contract's token shape, and plain words for its card", () => {
    for (const key of PRESET_KEYS) {
      const p = PRESETS[key];
      assert.deepEqual(Object.keys(p).sort(), ["colors", "fonts", "shape"], key);
      assert.deepEqual(
        Object.keys(p.colors).sort(),
        ["accent", "accent_text", "background", "border", "muted", "primary", "primary_text", "surface", "text"],
        `${key}.colors`,
      );
      for (const [slot, hex] of Object.entries(p.colors)) assert.match(hex, HEX, `${key}.colors.${slot}`);
      assert.deepEqual(Object.keys(p.fonts).sort(), ["body", "heading"], `${key}.fonts`);
      assert.deepEqual(Object.keys(p.shape).sort(), ["card", "density", "radius"], `${key}.shape`);
      assert.equal(typeof p.shape.radius, "number");
      assert.ok(["outlined", "elevated", "flat"].includes(p.shape.card), `${key}.shape.card`);
      assert.ok(["compact", "comfortable", "roomy"].includes(p.shape.density), `${key}.shape.density`);
      const info = PRESET_INFO[key];
      for (const w of ["name", "feel", "suits"]) assert.ok(typeof info[w] === "string" && info[w].length > 0, `${key}.${w}`);
    }
  });

  test("grounded is the contract's example, value for value", () => {
    assert.deepEqual(PRESETS.grounded.colors, {
      primary: "#2F6B3A", primary_text: "#FFFFFF", accent: "#A16207", accent_text: "#FFFFFF",
      text: "#1C2B1E", muted: "#5B6B5E", background: "#F4F6EE", surface: "#FFFFFF", border: "#DDE3D6",
    });
    assert.deepEqual(PRESETS.grounded.fonts, { heading: "Bitter", body: "Source Sans 3" });
    assert.deepEqual(PRESETS.grounded.shape, { radius: 10, card: "elevated", density: "comfortable" });
  });

  test("the research's tokens, unchanged (cp_presets.json)", () => {
    const research = {
      fresh:    { background: "#F7F9FB", surface: "#FFFFFF", primary: "#0F766E", accent: "#0369A1", text: "#0F172A", heading: "Inter", body: "Inter", radius: 12, card: "outlined", density: "comfortable" },
      friendly: { background: "#FFF8F0", surface: "#FFFFFF", primary: "#C2410C", accent: "#FFB703", text: "#3B2A20", heading: "Nunito", body: "Nunito", radius: 20, card: "elevated", density: "comfortable" },
      sturdy:   { background: "#F3F4F6", surface: "#FFFFFF", primary: "#1F2937", accent: "#F59E0B", text: "#111827", heading: "Barlow Condensed", body: "Barlow", radius: 4, card: "flat", density: "compact" },
      grounded: { background: "#F4F6EE", surface: "#FFFFFF", primary: "#2F6B3A", accent: "#A16207", text: "#1C2B1E", heading: "Bitter", body: "Source Sans 3", radius: 10, card: "elevated", density: "comfortable" },
      polished: { background: "#F8F6F1", surface: "#FFFFFF", primary: "#1E293B", accent: "#8A6A3D", text: "#1E293B", heading: "Playfair Display", body: "Inter", radius: 6, card: "outlined", density: "roomy" },
    };
    for (const [key, r] of Object.entries(research)) {
      const p = PRESETS[key];
      for (const slot of ["background", "surface", "primary", "accent", "text"]) assert.equal(p.colors[slot], r[slot], `${key}.${slot}`);
      assert.equal(p.fonts.heading, r.heading, `${key} heading font`);
      assert.equal(p.fonts.body, r.body, `${key} body font`);
      assert.equal(p.shape.radius, r.radius, `${key} radius`);
      assert.equal(p.shape.card, r.card, `${key} card`);
      assert.equal(p.shape.density, r.density, `${key} density`);
    }
  });

  test("every preset passes the contrast guard it will be saved through", () => {
    for (const key of PRESET_KEYS) {
      const c = PRESETS[key].colors;
      const pairs = [
        ["primary on surface", c.primary, c.surface],
        ["text on background", c.text, c.background],
        ["primary_text on primary", c.primary_text, c.primary],
        ["accent_text on accent", c.accent_text, c.accent],
        ["muted on background", c.muted, c.background],
        ["muted on surface", c.muted, c.surface],
      ];
      for (const [name, fg, bg] of pairs) {
        const r = contrastRatio(fg, bg);
        assert.ok(r >= MIN_CONTRAST, `${key}: ${name} is ${r?.toFixed(2)}:1`);
      }
      assert.deepEqual(lookProblems(c), [], `${key} would be refused on save`);
    }
  });
});

// ── Contrast ───────────────────────────────────────────────────────────────

describe("contrast arithmetic (WCAG 2 relative luminance)", () => {
  test("the fixed points", () => {
    assert.equal(relativeLuminance("#FFFFFF"), 1);
    assert.equal(relativeLuminance("#000000"), 0);
    assert.equal(contrastRatio("#FFFFFF", "#000000"), 21);
    assert.equal(contrastRatio("#000000", "#FFFFFF"), 21, "order does not matter");
    assert.equal(contrastRatio("#777777", "#777777"), 1);
    assert.equal(contrastRatio("#FFF", "#000"), 21, "#RGB is a colour too");
  });

  test("the research's own figures come out of the same sum", () => {
    const close = (a, b) => Math.abs(a - b) < 0.05;
    assert.ok(close(contrastRatio("#0F766E", "#FFFFFF"), 5.47));   // fresh "5.5:1"
    assert.ok(close(contrastRatio("#A16207", "#FFFFFF"), 4.92));   // grounded "4.9:1"
    assert.ok(close(contrastRatio("#FFB703", "#3B2A20"), 7.82));   // friendly "7.8:1"
    assert.ok(close(contrastRatio("#1C2B1E", "#F4F6EE"), 13.63));  // grounded "13.6:1"
  });

  test("a colour that cannot be read can only fail the check, never pass it", () => {
    const junk = { ...PRESETS.fresh.colors, primary: "teal" };
    const probs = lookProblems(junk);
    assert.deepEqual(probs.map((p) => p.pair), ["primary_on_surface"]);
    assert.equal(probs[0].ratio, 1);
  });

  test("button words follow oliver-api's rule: white first, then the look's own ink, then black", () => {
    assert.equal(buttonTextOn("#0F766E", "#0F172A"), "#FFFFFF");
    assert.equal(buttonTextOn("#FFB703", "#3B2A20"), "#3B2A20", "friendly's sunflower reads in its warm brown");
    assert.equal(buttonTextOn("#F59E0B", "#111827"), "#111827", "sturdy's amber reads in its charcoal");
    assert.equal(buttonTextOn("#FFD60A", "#9CA3AF"), "#000000", "an ink that fails falls back to black");
    assert.equal(buttonTextOn("#FFFFFF", "#000000"), "#000000");
  });

  test("lookProblems names the pair, both colours and the ratio", () => {
    const pale = { ...PRESETS.fresh.colors, primary: "#FFE08A" };
    const probs = lookProblems(pale);
    assert.equal(probs.length, 1);
    assert.equal(probs[0].pair, "primary_on_surface");
    assert.equal(
      probs[0].message,
      `The main colour (#FFE08A) on the card background (#FFFFFF) is too hard to read: ${probs[0].ratio} to 1, and it needs at least 4.5 to 1.`,
      "the same sentence oliver-api's 400 look_unreadable carries",
    );
    assert.equal(probs[0].ratio, Math.floor(contrastRatio("#FFE08A", "#FFFFFF") * 10) / 10);

    const grey = { ...PRESETS.fresh.colors, text: "#B0B0B0", background: "#FFFFFF" };
    assert.deepEqual(lookProblems(grey).map((p) => p.pair), ["text_on_background"]);

    const both = { ...pale, text: "#EEEEEE" };
    assert.deepEqual(lookProblems(both).map((p) => p.pair), ["primary_on_surface", "text_on_background"]);
  });
});

// ── Buttons & functions ────────────────────────────────────────────────────

describe("buttons and functions (D-CP8)", () => {
  test("the ten keys, in the contract's nav order, each with a label and a line", () => {
    assert.deepEqual([...FEATURE_KEYS], ["book", "request", "visits", "invoices", "quotes", "messages", "reschedule", "documents", "photos", "account"]);
    assert.deepEqual(FEATURES.map((f) => f.key), [...FEATURE_KEYS]);
    for (const f of FEATURES) {
      assert.equal(f.label, FEATURE_INFO[f.key].label, `${f.key}: the picker uses the shared words`);
      assert.equal(f.what, FEATURE_INFO[f.key].help);
      assert.ok(f.label && !/_/.test(f.label), `${f.key} needs a customer-facing label`);
      assert.ok(f.what && f.what.endsWith("."), `${f.key} needs a one-line "what it does"`);
    }
    assert.deepEqual(FEATURES.filter((f) => f.locked).map((f) => f.key), ["visits", "account"]);
  });

  test("a missing key means on, except Documents, which means off", () => {
    const n = normalizeFeatures({});
    for (const k of FEATURE_KEYS) assert.equal(n[k], k !== "documents", k);
    assert.deepEqual(normalizeFeatures(null), n);
    assert.deepEqual(normalizeFeatures("nonsense"), n);
  });

  test("what was saved is kept, and My visits / Account cannot be switched off", () => {
    const n = normalizeFeatures({ messages: false, documents: true, visits: false, account: false, book: "yes" });
    assert.equal(n.messages, false);
    assert.equal(n.documents, true);
    assert.equal(n.visits, true, "visits is always on");
    assert.equal(n.account, true, "account is always on");
    assert.equal(n.book, true, "a non-boolean is treated as missing");
  });
});

// ── The saved choice ───────────────────────────────────────────────────────

describe("the saved choice (portal_design.customer)", () => {
  test("an empty or old row reads as the defaults; custom CSS is not part of it", () => {
    const c = choiceFromSaved({ primary_color: "#123456", custom_css: ".x{}", header_text: "Hi" });
    assert.deepEqual(Object.keys(c).sort(), ["features", "preset", "use_brand"]);
    assert.equal(c.preset, "fresh");
    assert.equal(c.use_brand, true);
    assert.deepEqual(c.features, normalizeFeatures({}));
    assert.deepEqual(choiceFromSaved(undefined), c);
  });

  test("a saved choice is read back as saved; an unknown preset falls back", () => {
    const c = choiceFromSaved({ preset: "sturdy", use_brand: false, features: { quotes: false } });
    assert.equal(c.preset, "sturdy");
    assert.equal(c.use_brand, false);
    assert.equal(c.features.quotes, false);
    assert.equal(choiceFromSaved({ preset: "neon" }).preset, "fresh");
  });

  test("sameChoice drives 'Unsaved changes'", () => {
    const a = choiceFromSaved({ preset: "friendly" });
    assert.ok(sameChoice(a, choiceFromSaved({ preset: "friendly" })));
    assert.ok(!sameChoice(a, { ...a, preset: "polished" }));
    assert.ok(!sameChoice(a, { ...a, use_brand: false }));
    assert.ok(!sameChoice(a, { ...a, features: { ...a.features, messages: false } }));
    assert.ok(!sameChoice(a, null));
  });
});

// ── The resolved look (preview) ────────────────────────────────────────────

describe("resolvePreviewLook — what the preview is painted with (oliver-api resolveLook's rules)", () => {
  const brand = {
    colours: { primary: "#7C3AED", secondary: "#FFD60A", text: "#1F1147", background: "#FAF7FF" },
    fonts: { heading: "Lora", body: "Montserrat" },
    sources: { primary: "tenant", secondary: "tenant", text: "tenant", background: "tenant", heading_font: "tenant", body_font: "tenant" },
  };
  const on = { brandAllowed: true, removePoweredBy: false };

  test("the preset alone: its tokens, in the §5.1 shape", () => {
    const look = resolvePreviewLook(choiceFromSaved({ preset: "grounded", use_brand: false }), brand, on);
    assert.deepEqual(Object.keys(look).sort(), ["colors", "features", "fonts", "powered_by", "preset", "shape", "use_brand"]);
    assert.deepEqual(look.colors, PRESETS.grounded.colors);
    assert.deepEqual(look.fonts, PRESETS.grounded.fonts);
    assert.deepEqual(look.shape, PRESETS.grounded.shape);
    assert.equal(look.use_brand, false);
    assert.equal(look.powered_by, true);
  });

  test("every preset alone keeps its colours and passes the guard", () => {
    for (const key of PRESET_KEYS) {
      const look = resolvePreviewLook(choiceFromSaved({ preset: key, use_brand: false }), null, on);
      for (const slot of ["primary", "accent", "text", "muted", "background", "surface", "border"]) {
        assert.equal(look.colors[slot], PRESETS[key].colors[slot], `${key}.${slot}`);
      }
      assert.ok(contrastRatio(look.colors.primary_text, look.colors.primary) >= MIN_CONTRAST, `${key} primary button words`);
      assert.ok(contrastRatio(look.colors.accent_text, look.colors.accent) >= MIN_CONTRAST, `${key} accent button words`);
      assert.deepEqual(lookProblems(look.colors), []);
    }
  });

  test("brand on and allowed: the chosen colours and fonts over the preset, readable words on them", () => {
    const look = resolvePreviewLook(choiceFromSaved({ preset: "grounded", use_brand: true }), brand, on);
    assert.equal(look.colors.primary, "#7C3AED");
    assert.equal(look.colors.primary_text, "#FFFFFF");
    assert.equal(look.colors.accent, "#FFD60A", "secondary becomes the accent");
    assert.equal(look.colors.accent_text, "#1F1147", "a pale accent takes the brand's own ink");
    assert.equal(look.colors.text, "#1F1147");
    assert.equal(look.colors.background, "#FAF7FF");
    assert.equal(look.colors.surface, PRESETS.grounded.colors.surface, "the preset keeps its cards");
    assert.deepEqual(look.fonts, { heading: "Lora", body: "Montserrat" });
    assert.deepEqual(look.shape, PRESETS.grounded.shape, "corners, cards and spacing stay the preset's");
    assert.equal(look.use_brand, true);
  });

  test("a brand text or background gets its own muted and border, readable on page and card", () => {
    const look = resolvePreviewLook(choiceFromSaved({ preset: "fresh" }), brand, on);
    assert.notEqual(look.colors.muted, PRESETS.fresh.colors.muted);
    assert.ok(contrastRatio(look.colors.muted, look.colors.background) >= MIN_CONTRAST);
    assert.ok(contrastRatio(look.colors.muted, look.colors.surface) >= MIN_CONTRAST);
    assert.notEqual(look.colors.border, PRESETS.fresh.colors.border);
  });

  test("below Standard the brand is not applied, whatever was stored", () => {
    const look = resolvePreviewLook(choiceFromSaved({ preset: "fresh", use_brand: true }), brand, { brandAllowed: false, removePoweredBy: false });
    assert.equal(look.colors.primary, PRESETS.fresh.colors.primary);
    assert.deepEqual(look.fonts, PRESETS.fresh.fonts);
    assert.equal(look.use_brand, false);
  });

  test("only the slots the business chose: 'default' stays the preset's, the older voice-profile font counts", () => {
    const partial = { ...brand, sources: { ...brand.sources, secondary: "default", text: "default", background: "default", heading_font: "legacy_voice_profile", body_font: "default" } };
    const look = resolvePreviewLook(choiceFromSaved({ preset: "friendly" }), partial, on);
    assert.equal(look.colors.primary, "#7C3AED");
    assert.equal(look.colors.accent, PRESETS.friendly.colors.accent);
    assert.equal(look.colors.muted, PRESETS.friendly.colors.muted, "no brand text/background, so the preset's muted stays");
    assert.equal(look.fonts.heading, "Lora");
    assert.equal(look.fonts.body, PRESETS.friendly.fonts.body);
  });

  test("no brand, or a brand without sources: the preset, not a guess", () => {
    for (const b of [null, { colours: brand.colours, fonts: brand.fonts, sources: {} }]) {
      const look = resolvePreviewLook(choiceFromSaved({ preset: "polished" }), b, on);
      assert.equal(look.colors.primary, PRESETS.polished.colors.primary);
      assert.deepEqual(look.fonts, PRESETS.polished.fonts);
    }
  });

  test("an unreadable brand colour shows up in the warning the save would refuse on", () => {
    const pale = { ...brand, colours: { ...brand.colours, primary: "#FFF3B0" } };
    const look = resolvePreviewLook(choiceFromSaved({ preset: "fresh" }), pale, on);
    assert.deepEqual(lookProblems(look.colors).map((p) => p.pair), ["primary_on_surface"]);
  });

  test("features and powered_by ride along, normalised", () => {
    const look = resolvePreviewLook(choiceFromSaved({ features: { messages: false, visits: false } }), null, { brandAllowed: true, removePoweredBy: true });
    assert.equal(look.features.messages, false);
    assert.equal(look.features.visits, true);
    assert.equal(look.features.documents, false);
    assert.equal(look.powered_by, false);
  });
});

describe("the GET/PATCH answer beside the choice", () => {
  test("allowances: what the server says, and open when it says nothing", () => {
    assert.deepEqual(allowancesFromSaved({ allowances: { brand: false, remove_powered_by: true } }), { brand: false, remove_powered_by: true });
    assert.deepEqual(allowancesFromSaved({}), { brand: true, remove_powered_by: false });
    assert.deepEqual(allowancesFromSaved(null), { brand: true, remove_powered_by: false });
  });

  test("brand: the kit the server merges from, or null", () => {
    const b = brandFromSaved({ brand: { colours: { primary: "#123456" }, fonts: { heading: "Lora", body: null }, sources: { primary: "tenant" } } });
    assert.deepEqual(b, { colours: { primary: "#123456" }, fonts: { heading: "Lora", body: null }, sources: { primary: "tenant" } });
    assert.equal(brandFromSaved({ preset: "fresh" }), null);
    assert.equal(brandFromSaved(null), null);
  });
});

// ── Preview protocol (§5.2) ────────────────────────────────────────────────

describe("the preview protocol", () => {
  test("the two message types, exactly", () => {
    assert.equal(LOOK_MESSAGE, "oliver-look");
    assert.equal(LOOK_READY_MESSAGE, "oliver-look-ready");
    const look = resolvePreviewLook(choiceFromSaved({}), null, { brandAllowed: true, removePoweredBy: false });
    assert.deepEqual(lookMessage(look), { type: "oliver-look", look });
    assert.equal(isLookReady({ type: "oliver-look-ready" }), true);
    assert.equal(isLookReady({ type: "oliver-look" }), false);
    assert.equal(isLookReady("oliver-look-ready"), false);
    assert.equal(isLookReady(null), false);
  });

  test("the preview address: dev on :5175, otherwise the business's own portal address", () => {
    assert.equal(
      lookPreviewSrc("https://customer.ia-dm.com/summit-lawn/", "summit-lawn", "http://localhost:5175"),
      "http://localhost:5175/summit-lawn/?look=preview",
    );
    assert.equal(
      lookPreviewSrc("https://customer.ia-dm.com/summit-lawn/", "summit-lawn", null),
      "https://customer.ia-dm.com/summit-lawn/?look=preview",
    );
    assert.equal(lookPreviewSrc("https://portal.acme.com", "acme", null), "https://portal.acme.com/?look=preview");
    assert.equal(lookPreviewSrc("https://customer.ia-dm.com/x/", null, null), null, "no address, no preview");
  });

  test("the Look tab only listens to its own frame, from the portal's origin, and posts to that origin", () => {
    const tab = read("src/pages/oliver/look/LookTab.tsx");
    assert.match(tab, /e\.origin !== childOrigin/);
    assert.match(tab, /e\.source !== frameRef\.current\?\.contentWindow/);
    assert.match(tab, /postMessage\(lookMessage\(lookRef\.current\), childOrigin\)/);
    assert.match(tab, /phone: \{ w: 390, h: 780 \}/);
    assert.match(tab, /desktop: \{ w: 1024,/);
  });

  test("Google Fonts: one stylesheet per family, by name", () => {
    assert.equal(
      googleFontHref("Source Sans 3"),
      "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;700&display=swap",
    );
    assert.match(googleFontHref("Playfair Display"), /family=Playfair\+Display:/);
  });
});

// ── Save path and editor behaviour ─────────────────────────────────────────

describe("the Look tab's save and the editor around it", () => {
  test("Save look writes the choice, and only the choice, through PATCH /portals/design", () => {
    const tab = read("src/pages/oliver/look/LookTab.tsx");
    assert.match(tab, /const DESIGN_PATH = "\/portals\/design\?kind=customer";/);
    assert.match(tab, /patch<unknown>\(DESIGN_PATH, body\)/);
    assert.match(tab, /const body: LookChoice = \{\s*preset: draft\.preset,[\s\S]*?use_brand:[\s\S]*?features: normalizeFeatures\(draft\.features\),\s*\};/);
  });

  test("the editor says 'Unsaved changes' and asks before closing, like the booking editor", () => {
    const hub = read("src/pages/oliver/OliverPortalsHubPage.tsx");
    assert.match(hub, /look\.dirty \? "Unsaved changes" : "All changes saved"/);
    assert.match(hub, /Save look/);
    assert.match(hub, />\s*Discard\s*</);
    assert.match(hub, /size="confirm"/);
    assert.match(hub, /Close without saving/);
    assert.match(hub, /onClose=\{requestClose\}/);
  });

  test("a save no longer unmounts the open editor (the hub's refresh is quiet)", () => {
    const hub = read("src/pages/oliver/OliverPortalsHubPage.tsx");
    const load = hub.slice(hub.indexOf("const load = useCallback"), hub.indexOf("useEffect(() => { load(); }, [load]);"));
    assert.doesNotMatch(load, /setLoading\(true\)/);
  });
});

// ── Deleted, and staying deleted ───────────────────────────────────────────

describe("the Portal Designer, the Welcome HTML scaffold and custom CSS are gone", () => {
  test("the two page files are deleted", () => {
    assert.equal(existsSync(path.join(ROOT, "src/pages/oliver/OliverPortalDesignerPage.tsx")), false);
    assert.equal(existsSync(path.join(ROOT, "src/pages/oliver/PortalCustomizationPage.tsx")), false);
  });

  test("no route, catalog entry, nav match or link points at them", () => {
    for (const rel of ["src/pages/ServiceRouter.tsx", "src/config/serviceCatalog.ts", "src/components/SubNav.tsx", "src/pages/oliver/OliverClientExperiencePage.tsx"]) {
      const src = read(rel);
      assert.doesNotMatch(src, /oliver_portal_designer/, `${rel} still reaches the Portal Designer`);
      assert.doesNotMatch(src, /oliver_portal_customization|PortalCustomizationPage/, `${rel} still reaches the Welcome HTML scaffold`);
      assert.doesNotMatch(src, /OliverPortalDesignerPage/, `${rel} still imports the Portal Designer`);
    }
  });

  test("no custom CSS field anywhere in the Portal", () => {
    const offenders = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && /custom_css|customCss/.test(readFileSync(p, "utf8"))) offenders.push(path.relative(ROOT, p));
      }
    };
    walk(path.join(ROOT, "src"));
    assert.deepEqual(offenders, []);
  });

  test("the Design tab's old fields are not in the portal editor", () => {
    const hub = read("src/pages/oliver/OliverPortalsHubPage.tsx");
    for (const gone of ["DesignTabStub", "DesignLivePreview", "button_radius", "font_family", "header_text", "Custom CSS"]) {
      assert.ok(!hub.includes(gone), `${gone} is back in the portal editor`);
    }
    assert.match(hub, /<LookTab /);
  });
});

// ── One presets file, two homes ────────────────────────────────────────────

describe("the presets file is the customer portal's, byte for byte", () => {
  // The customer portal owns src/look/presets.ts; this repo keeps a copy. The
  // checkouts are paired by their suffix (Portal-septa-cplook ↔
  // oliver-customer-portal-septa-cplook), or CUSTOMER_PORTAL_DIR names the other
  // checkout outright. The pipeline builds one repo at a time, so when the other
  // checkout is not on disk this skips and says so rather than passing quietly.
  // Line endings are compared as LF: .gitattributes pins this file to LF, but a
  // core.autocrlf checkout of the other repo may not carry the same pin.
  const here = path.basename(ROOT);
  const suffix = here.replace(/^Portal/i, "");
  const devRoot = path.resolve(ROOT, "..", "..");
  const candidates = [
    process.env.CUSTOMER_PORTAL_DIR,
    path.join(devRoot, `oliver-customer-portal${suffix}`),
    path.join(devRoot, "oliver-customer-portal-septa"),
    path.join(devRoot, "oliver-customer-portal"),
  ].filter(Boolean).map((d) => path.join(d, "src", "look", "presets.ts"));
  const other = candidates.find((f) => existsSync(f));

  test("identical to the customer portal's copy", { skip: other ? false : `no customer portal presets.ts found (looked in: ${candidates.join(", ")})` }, () => {
    const lf = (s) => s.replace(/\r\n/g, "\n");
    const mine = lf(read("src/pages/oliver/look/presets.ts"));
    const theirs = lf(readFileSync(other, "utf8"));
    assert.equal(mine, theirs, `src/pages/oliver/look/presets.ts differs from ${other}; copy the customer portal's file over this one`);
  });
});

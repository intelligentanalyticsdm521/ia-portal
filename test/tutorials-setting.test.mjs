// test/tutorials-setting.test.mjs — D-154, Settings > Tutorials and the box
// that now asks before it stops.
//
// Brandon, 2026-09-17: "lets keep it unless they mark don't show me this again.
// Like add a little checkbox with that. Then we'll probably need a like
// tutorials setting somewhere in the global settings that they can turn on/off
// tutorials like our initial walkthrough, onboarding if they want to go through
// onboarding again, or these builder tutorials."
//
// Three things have to stay true and each is a one-line regression away:
//
//   1. THE SERVER WINS. A preference is a fact about a PERSON, so the cache is
//      a cache. The moment localStorage outranks the server, a person who
//      turned the tips back on from another computer is told no by a stale
//      note in this browser — the exact defect this replaced.
//   2. TICKING THE BOX WRITES FALSE, AND NOTHING ELSE WRITES ANYTHING.
//      Skip and "Start building" are not requests to stop being taught.
//   3. THE SWITCHES ARE THE ONLY SURFACE. One page, one set of keys, shared
//      letter for letter with platform-api — a key spelt differently on one
//      side saves nothing, quietly, forever.
//
// MUTATION CHECKS (each must turn this file red):
//   · make the box read localStorage again        -> "no browser store" (builder-usability) + "the gate is the person's switch"
//   · make the checkbox write true                -> "ticking the box turns the tips OFF"
//   · let the endpoint take a user id from the request -> platform-api's own suite
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PREFERENCE_DEFAULTS,
  PREFERENCE_KEYS,
  PREFERENCE_CACHE_KEY,
  isPreferenceKey,
  readPreferenceCache,
  resolvePreference,
  sanitisePreferences,
  writePreferenceCache,
} from "../src/lib/userPreferences.ts";
import { builderTipsAfterClose, shouldShowFirstRun } from "../src/builder/firstRunModel.ts";

const SRC = path.join(process.cwd(), "src");
const readSrc = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const withoutComments = (src) => src
  .replace(/https?:\/\/\S*/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** A localStorage that works. */
function fakeStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   1. resolution — server, then cache, then the built-in default
   ══════════════════════════════════════════════════════════════════════════ */

describe("a preference resolves server first", () => {
  test("the server's answer wins over anything this browser remembers", () => {
    const value = resolvePreference(
      "tutorials.builderTips",
      { "tutorials.builderTips": true },
      { "tutorials.builderTips": false },
    );
    assert.equal(value, true,
      "they turned the tips back on from another computer; a stale note in this "
      + "browser must not out-vote that");
  });

  test("a server false wins too — it is not 'falsy means unset'", () => {
    assert.equal(
      resolvePreference("tutorials.builderTips", { "tutorials.builderTips": false }, { "tutorials.builderTips": true }),
      false);
  });

  test("the cache stands in only until the server has answered", () => {
    assert.equal(resolvePreference("tutorials.builderTips", {}, { "tutorials.builderTips": false }), false);
    assert.equal(resolvePreference("tutorials.builderTips", null, { "tutorials.builderTips": false }), false);
  });

  test("nobody has ever said → the built-in default, and both default ON", () => {
    assert.equal(resolvePreference("tutorials.builderTips", {}, {}), true);
    assert.equal(resolvePreference("tutorials.welcomeWalkthrough", null, null), true);
    assert.deepEqual([...PREFERENCE_KEYS].sort(), [
      "tutorials.builderTips",
      "tutorials.welcomeWalkthrough",
    ]);
    for (const k of PREFERENCE_KEYS) assert.equal(PREFERENCE_DEFAULTS[k], true);
  });

  test("rubbish in the cache cannot poison a switch", () => {
    assert.deepEqual(sanitisePreferences({ "tutorials.builderTips": "false" }), {},
      "a string is not a switch");
    assert.deepEqual(sanitisePreferences({ "tutorials.madeUp": false }), {},
      "and an unknown key is not one either");
    assert.deepEqual(sanitisePreferences(null), {});
    assert.equal(isPreferenceKey("tutorials.builderTips"), true);
    assert.equal(isPreferenceKey("hasOwnProperty"), false);
  });
});

describe("the cache is a cache", () => {
  test("it round-trips through one versioned key", () => {
    const store = fakeStore();
    writePreferenceCache({ "tutorials.builderTips": false }, store);
    assert.match(PREFERENCE_CACHE_KEY, /\.v\d+$/);
    assert.deepEqual(readPreferenceCache(store), { "tutorials.builderTips": false });
  });

  test("a private window throws and the app still works", () => {
    const hostile = {
      getItem() { throw new Error("SecurityError"); },
      setItem() { throw new Error("SecurityError"); },
    };
    assert.deepEqual(readPreferenceCache(hostile), {});
    writePreferenceCache({ "tutorials.builderTips": false }, hostile); // must not throw
    assert.equal(resolvePreference("tutorials.builderTips", {}, readPreferenceCache(hostile)), true);
  });

  test("a switch turned on in Settings round-trips to the next reader", () => {
    // What the provider does on a save, in the two lines that matter: the
    // server map is updated and the cache is written from it. Anything reading
    // afterwards — the builder that opens next — sees the new answer.
    const store = fakeStore();
    let server = {};
    const save = (key, value) => { server = { ...server, [key]: value }; writePreferenceCache(server, store); };

    save("tutorials.builderTips", false);
    assert.equal(resolvePreference("tutorials.builderTips", server, readPreferenceCache(store)), false);
    assert.equal(shouldShowFirstRun(resolvePreference("tutorials.builderTips", server, readPreferenceCache(store))), false);

    save("tutorials.builderTips", true);
    assert.equal(resolvePreference("tutorials.builderTips", server, readPreferenceCache(store)), true);
    assert.equal(shouldShowFirstRun(resolvePreference("tutorials.builderTips", server, readPreferenceCache(store))), true,
      "turn Builder tips back on and the next builder opens with the box");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. the box, and the checkbox on it
   ══════════════════════════════════════════════════════════════════════════ */

describe("the welcome box shows while the tips are on", () => {
  test("on → every open; off → never on its own", () => {
    assert.equal(shouldShowFirstRun(true), true);
    assert.equal(shouldShowFirstRun(undefined), true, "not loaded yet is not 'no'");
    assert.equal(shouldShowFirstRun(false), false);
  });

  test("ticking the box turns the tips OFF", () => {
    assert.equal(builderTipsAfterClose(true), false,
      "the checkbox says 'Don't show me this again' — it cannot write true");
  });

  test("Skip and Start building on their own change nothing", () => {
    assert.equal(builderTipsAfterClose(false), null,
      "reading the box is not a request to stop being shown it");
  });

  test("the gate is the person's switch, and there is no browser store behind it", () => {
    const shell = withoutComments(readSrc("builder/BuilderShell.tsx"));
    assert.match(shell, /usePreference\("tutorials\.builderTips"\)/,
      "the shell asks the ONE preference store");
    assert.match(shell, /shouldShowFirstRun\(builderTipsOn\)/);
    assert.ok(!/firstrun/i.test(shell) || !/localStorage/.test(shell),
      "the once-per-browser key is gone, not moved");
    assert.match(shell, /builderTipsAfterClose\(dontShowAgain\)/,
      "and what the checkbox means is the tested function, not two lines here");
  });

  test("the ? still replays the box whatever the switch says", () => {
    const shell = withoutComments(readSrc("builder/BuilderShell.tsx"));
    assert.match(shell, /onReplayHelp=\{\(\) => setFirstRun\(true\)\}/,
      "asking for help is not a preference — the replay must not consult one");
  });

  test("the box carries an unticked checkbox and hands its state back", () => {
    const src = readSrc("builder/FirstRun.tsx");
    const code = withoutComments(src);
    assert.match(code, /useState\(false\)/, "unticked by default");
    assert.match(src, /Don't show me this again/);
    assert.match(code, /type="checkbox"/);
    assert.match(code, /const close = \(\) => onDone\(dontShowAgain\);/,
      "Skip, the x and Start building all leave through one door, carrying the answer");
    // Skip, the x, and the last Next all go through `close`, so none of them
    // can forget the checkbox.
    assert.equal((code.match(/onClick=\{close\}/g) || []).length, 2);
    assert.match(code, /if \(n === null\) close\(\);/);
  });

  test("the box still names no other product", () => {
    const words = withoutComments(readSrc("builder/FirstRun.tsx")).toLowerCase();
    for (const vendor of ["elementor", "gutenberg", "wix", "squarespace", "wordpress"]) {
      assert.ok(!words.includes(vendor), `the box says "${vendor}" on a screen`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. Settings > Tutorials — one page, two switches, one way back into setup
   ══════════════════════════════════════════════════════════════════════════ */

describe("Settings > Tutorials is ONE page", () => {
  const page = () => withoutComments(readSrc("pages/settings/SettingsTutorialsPage.tsx"));

  test("both switches are wired to the two real keys", () => {
    const src = page();
    for (const key of PREFERENCE_KEYS) {
      assert.ok(src.includes(`prefKey="${key}"`), `no switch for ${key}`);
    }
    assert.match(src, /usePreference\(prefKey\)/);
    assert.match(src, /role="switch"/);
    assert.match(src, /aria-checked=\{value\}/);
  });

  test("each switch says in plain words what it does", () => {
    const src = readSrc("pages/settings/SettingsTutorialsPage.tsx");
    assert.match(src, /label="Welcome walk-through"/);
    assert.match(src, /help="The tour that plays by itself once you finish setup\./);
    assert.match(src, /label="Builder tips"/);
    assert.match(src, /help="The short welcome box that opens when you start building/);
  });

  test("the Welcome walk-through switch gates the ONE thing that starts a tour on its own", () => {
    // Nothing on this platform auto-runs a tour on sign-in; what does run by
    // itself is the walkthrough queue UnifiedSetupCard fires when setup
    // finishes. A switch that gates nothing is a switch that lies, so that
    // queue is what it turns off.
    const card = withoutComments(readSrc("components/command/UnifiedSetupCard.tsx"));
    assert.match(card, /usePreference\("tutorials\.welcomeWalkthrough"\)/);
    assert.match(card, /if \(!welcomeWalkthroughOn\) return;/,
      "with the switch off, finishing setup must not start a tour");
  });

  test("a save that is refused is SAID, not swallowed", () => {
    const src = page();
    assert.match(src, /catch \(e\) \{[\s\S]{0,200}?setSaveError/,
      "a switch that springs back with no explanation is the bug, not the fix");
    assert.ok(!/catch \(e\) \{\s*\}/.test(src));
  });

  test("Run onboarding again reopens the EXISTING wizard, at the first question", () => {
    const src = page();
    assert.match(src, /Run onboarding again/);
    assert.match(src, /<OnboardingWizardModal/, "the existing entry point, not a second wizard");
    assert.match(src, /startAtFirstStep/);
    // Read RAW: that file's comments do not survive a naive block-comment
    // stripper, and this is a line of code either way.
    const wizard = readSrc("components/consulting/OnboardingWizardModal.tsx");
    assert.match(wizard, /if \(!startAtFirstStep[\s\S]{0,40}?typeof data\?\.step === "number"/,
      "only the saved POSITION is ignored — the saved answers are still loaded");
  });

  test("it says Business, never 'tenant'", () => {
    const src = readSrc("pages/settings/SettingsTutorialsPage.tsx");
    // Comments and prop names may say tenantId or tenantName; what reaches a screen may not.
    const rendered = withoutComments(src)
      .replace(/\b(activeTenantId|tenantId|tenantName|tenant_id|ClientTenant)\b/g, "")
      .replace(/\?\.tenant\b/g, "");
    assert.ok(!/tenant/i.test(rendered), "no 'tenant' in anything a customer reads");
  });
});

describe("the two pages it replaced are GONE", () => {
  test("WalkthroughsPage.tsx is deleted, not left behind", () => {
    assert.throws(() => readSrc("pages/settings/WalkthroughsPage.tsx"),
      "replace means delete — a second walkthroughs page would drift from this one");
  });

  test("both old addresses land on the new page", () => {
    const app = withoutComments(readSrc("App.tsx"));
    assert.match(app, /path="settings\/tutorials" element=\{<SettingsTutorialsPage \/>\}/);
    for (const old of ["settings/tours", "settings/walkthroughs"]) {
      assert.ok(
        new RegExp(`path="${old.replace("/", "\\/")}" element=\\{<Navigate to="\\/app\\/settings\\/tutorials" replace \\/>\\}`).test(app),
        `${old} does not redirect`);
    }
    assert.ok(!/WalkthroughsPage/.test(app));
  });

  test("the settings hub offers one tile and the account menu one item", () => {
    const tiles = withoutComments(readSrc("pages/settings/SettingsRoutes.tsx"));
    assert.match(tiles, /to: '\/app\/settings\/tutorials', label: 'Tutorials'/);
    assert.ok(!/All Walkthroughs/.test(tiles));
    assert.ok(!/Tours & Walkthroughs/.test(tiles));
    const menu = withoutComments(readSrc("components/AccountMenu.tsx"));
    assert.match(menu, /to="\/app\/settings\/tutorials"[\s\S]{0,200}?label="Tutorials"/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. one list, two repos
   ══════════════════════════════════════════════════════════════════════════ */

describe("the Portal and platform-api agree on the keys", () => {
  test("same two keys, same two defaults", () => {
    // The API repo sits beside this one. If it is not checked out here there is
    // nothing to compare and the parity is asserted by platform-api's own suite.
    const candidates = [
      path.join(process.cwd(), "..", "platform-api-septa-tutorials", "lib", "userPreferences.js"),
      path.join(process.cwd(), "..", "platform-api-septa", "lib", "userPreferences.js"),
      path.join(process.cwd(), "..", "platform-api", "lib", "userPreferences.js"),
    ];
    let api = null;
    for (const c of candidates) {
      try { api = readFileSync(c, "utf8"); break; } catch { /* next */ }
    }
    if (!api) return; // nothing to compare against on this machine
    for (const key of PREFERENCE_KEYS) {
      assert.ok(api.includes(`"${key}": true`),
        `platform-api does not default ${key} to true — a key spelt differently `
        + "on one side saves nothing, quietly, forever");
    }
    const apiKeys = [...api.matchAll(/"(tutorials\.[A-Za-z]+)":/g)].map((m) => m[1]).sort();
    assert.deepEqual(apiKeys, [...PREFERENCE_KEYS].sort());
  });
});

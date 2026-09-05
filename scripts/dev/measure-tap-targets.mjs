#!/usr/bin/env node
/**
 * measure-tap-targets.mjs — measure the Portal's filter chips and the
 * "Explain this page" control in a REAL Chromium at 375x812, and at 1440x900
 * to prove the desktop did not move.
 *
 * WHY A HARNESS AND NOT THE PAGE ITSELF
 * The Lead Inbox needs a signed-in session and a live LUMEN behind it. Two
 * other builders were running their own stacks on this machine when this was
 * written, and driving somebody else's Portal to measure my CSS is not a
 * measurement, it is a collision. So this loads the REAL app (which pulls in
 * the REAL compiled stylesheet, Tailwind JIT included) and then renders the
 * class strings the components EXPORT — not a copy of them typed here.
 *
 *   · CHIP_BASE / CHIP_ON / CHIP_OFF come from
 *     src/components/spark/FilterChip.tsx
 *   · HELP_BUTTON_CLASS comes from src/components/PageHelpButton.tsx
 *
 * and test/tap-targets.test.ts fails if any chip site stops using FilterChip
 * or if PageHelpButton stops using its own exported constant. The two together
 * are the chain: the test says the pages use these classes, this says the
 * classes measure 40px.
 *
 * Tailwind only emits a class it has SEEN in a scanned source file, which is
 * exactly why the constants have to live in .tsx and be imported here rather
 * than assembled at run time.
 *
 *   node scripts/dev/measure-tap-targets.mjs            (starts its own vite)
 *   node scripts/dev/measure-tap-targets.mjs --port 5177 (attach to a running one)
 */
import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, "..", "..");
// playwright is not a Portal dependency; the backends carry it.
const { chromium } = createRequire("C:/dev/iadm/LUMEN-API-septa-octpull/package.json")("playwright");

const argPort = (() => {
  const i = process.argv.indexOf("--port");
  return i === -1 ? null : Number(process.argv[i + 1]);
})();
const PORT = argPort || 5178;
const MIN_TAP = 40;

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(true));
    s.once("listening", () => s.close(() => resolve(false)));
    s.listen(port, "127.0.0.1");
  });
}

/**
 * The class strings, read out of the components' own source. A regex rather
 * than an import because these are .tsx and this is a plain node script; the
 * test suite imports them properly and asserts the same names exist.
 */
function constFrom(file, name) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
  // These constants are written as several quoted segments joined with `+`, so
  // that a long Tailwind string stays readable. Taking only the FIRST segment
  // is exactly the bug this harness found in its own first run: it measured a
  // chip with no `max-md:min-h-[40px]` on it, reported 24px, and would have
  // reported 24px however good the component was.
  const decl = src.match(new RegExp(`(?:export )?const ${name}\\s*=\\s*([\\s\\S]*?);\\n`));
  if (!decl) throw new Error(`${name} not found in ${file} — the harness and the component have drifted`);
  const parts = [...decl[1].matchAll(/"([^"]*)"|\`([^\`]*)\`/g)].map((m) => m[1] ?? m[2]);
  if (!parts.length) throw new Error(`${name} in ${file} is not a plain string constant`);
  return parts.join("").replace(/\s+/g, " ").trim();
}

/** Every class the harness renders must actually exist in the stylesheet. */
function assertHasMaxMd(name, value) {
  if (!/max-md:/.test(value)) {
    throw new Error(`${name} carries no max-md: utility — the phone rules are not in it`);
  }
}

/**
 * The class strings as they were on the release/sept-a-2026 tip, before this
 * pack. Rendered ALONGSIDE the current ones so "no desktop pixel moves" is a
 * measured comparison rather than a claim: at 1440x900 the new chip and the
 * old chip must come out the same size, to the pixel.
 *
 * Every utility in these two strings is still used elsewhere in the app, so
 * Tailwind still emits them; the harness asserts they measured non-zero, which
 * is what catches a silent pass if that ever stops being true.
 */
const LEGACY_CHIP =
  "rounded-full px-3 py-1 text-xs font-semibold transition-colors bg-slate-900 text-white";
const LEGACY_HELP =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 " +
  "text-[12px] font-medium text-slate-600 transition-colors " +
  "hover:border-slate-400 hover:text-slate-900";

const CHIP_BASE = constFrom("src/components/spark/FilterChip.tsx", "CHIP_BASE");
const CHIP_ON = constFrom("src/components/spark/FilterChip.tsx", "CHIP_ON");
const CHIP_OFF = constFrom("src/components/spark/FilterChip.tsx", "CHIP_OFF");
const CHIP_ROW = constFrom("src/components/spark/FilterChip.tsx", "CHIP_ROW");
const HELP_BUTTON_CLASS = constFrom("src/components/PageHelpButton.tsx", "HELP_BUTTON_CLASS");

assertHasMaxMd("CHIP_BASE", CHIP_BASE);
assertHasMaxMd("CHIP_ROW", CHIP_ROW);
assertHasMaxMd("HELP_BUTTON_CLASS", HELP_BUTTON_CLASS);

let vite = null;
async function startVite() {
  if (await portInUse(PORT)) {
    if (argPort) return true;                    // attach to the one the caller named
    console.error(`refusing: port ${PORT} is in use and --port was not given.`);
    process.exit(3);
  }
  vite = spawn(process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  vite.stdout.on("data", () => {});
  vite.stderr.on("data", () => {});
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await portInUse(PORT)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

const HARNESS = `
  <div id="probe" style="padding:8px">
    <!-- The container SparkLeadInboxPage puts the chips in. It matters: with
         CHIP_ROW at display:contents on desktop, THIS is what lays the chips
         out and wraps them, and a harness with a different parent would be
         measuring itself. -->
    <div class="flex flex-wrap items-center gap-2" id="chipparent">
    <div class="${CHIP_ROW}" id="chiprow">
      <button class="${CHIP_BASE} ${CHIP_ON}" data-probe="chip-on">All (128)</button>
      <button class="${CHIP_BASE} ${CHIP_OFF}" data-probe="chip-off">Hot (12)</button>
      <button class="${CHIP_BASE} ${CHIP_OFF}">Warm (40)</button>
      <button class="${CHIP_BASE} ${CHIP_OFF}">Cold (76)</button>
      <span class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Show:</span>
      <button class="${CHIP_BASE} ${CHIP_OFF}">All</button>
      <button class="${CHIP_BASE} ${CHIP_OFF}">Verified only</button>
      <button class="${CHIP_BASE} ${CHIP_OFF}">Failed verification</button>
      <span class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Source:</span>
      <button class="${CHIP_BASE} ${CHIP_OFF}">All sources</button>
      <button class="${CHIP_BASE} ${CHIP_OFF}">Website form (18)</button>
    </div>
    </div>
    <button class="${HELP_BUTTON_CLASS}" data-probe="help">Explain this page</button>
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
      <button class="${LEGACY_CHIP}" data-probe="legacy-chip">All (128)</button>
      <button class="${LEGACY_HELP}" data-probe="legacy-help">Explain this page</button>
    </div>
  </div>`;

let exitCode = 1;
let browser = null;
try {
  const up = await startVite();
  check(`vite is serving the Portal on 127.0.0.1:${PORT}`, up);
  if (!up) throw new Error("vite did not start");

  browser = await chromium.launch({ headless: true });

  async function measure(width, height) {
    const page = await browser.newPage({ viewport: { width, height } });
    // The real app, for the real stylesheet. It will not finish signing in and
    // does not need to — the CSS is loaded by then, and the harness replaces
    // the body afterwards.
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(
      () => [...document.styleSheets].some((s) => {
        try { return [...s.cssRules].some((r) => /spark-pill|arion-page/.test(r.cssText || "")); }
        catch { return false; }
      }),
      { timeout: 30_000 }
    );
    await page.setContent(
      `<html><head>${await page.evaluate(() => document.head.innerHTML)}</head>` +
      `<body>${HARNESS}</body></html>`,
      { waitUntil: "load" }
    );
    await page.waitForTimeout(300);
    const out = await page.evaluate(() => {
      const r = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { w: Math.round(b.width), h: Math.round(b.height) };
      };
      const row = document.getElementById("chiprow");
      const rb = row.getBoundingClientRect();
      const cs = getComputedStyle(row);
      return {
        chipOn: r('[data-probe="chip-on"]'),
        chipOff: r('[data-probe="chip-off"]'),
        help: r('[data-probe="help"]'),
        legacyChip: r('[data-probe="legacy-chip"]'),
        legacyHelp: r('[data-probe="legacy-help"]'),
        row: { h: Math.round(rb.height), overflowX: cs.overflowX, flexWrap: cs.flexWrap,
               display: cs.display, scrollW: row.scrollWidth, clientW: row.clientWidth },
        // With display:contents the row has no box of its own, so "do the
        // chips wrap?" has to be asked of the CHIPS: how many distinct top
        // offsets do they sit at.
        chipRowLines: new Set([...document.querySelectorAll(`[data-probe^="chip-"], #chiprow > button`)]
          .map((el) => Math.round(el.getBoundingClientRect().top))).size,
        chipsWrapOnDesktop: new Set([...document.querySelectorAll("#chiprow > button")]
          .map((el) => Math.round(el.getBoundingClientRect().top))).size > 1,
        docScrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      };
    });
    await page.close();
    return out;
  }

  console.log("");
  console.log("── 375 x 812 (the phone) ──");
  const m = await measure(375, 812);
  console.log(JSON.stringify(m, null, 1));
  check(`an active filter chip is at least ${MIN_TAP}px tall`, m.chipOn.h >= MIN_TAP, `${m.chipOn.h}px`);
  check(`an inactive filter chip is at least ${MIN_TAP}px tall`, m.chipOff.h >= MIN_TAP, `${m.chipOff.h}px`);
  check(`"Explain this page" is at least ${MIN_TAP}px tall`, m.help.h >= MIN_TAP, `${m.help.h}px`);

  // The budget. Ten chips at 40px WRAPPED would be four rows and ~170px of a
  // 812px screen before the first lead. One scrolling row is 40px plus its own
  // scrollbar gutter.
  check("the chip row costs no more than 48px of vertical space",
    m.row.h <= 48, `${m.row.h}px`);
  check("because it scrolls sideways instead of wrapping",
    m.row.overflowX === "auto" && m.row.flexWrap === "nowrap" && m.row.display === "flex",
    `display: ${m.row.display}, overflow-x: ${m.row.overflowX}, flex-wrap: ${m.row.flexWrap}`);
  check("every chip is on ONE line", m.chipRowLines === 1, `${m.chipRowLines} line(s)`);
  check("and there really is more chip than row, so the scroll is doing work",
    m.row.scrollW > m.row.clientW, `${m.row.scrollW} > ${m.row.clientW}`);
  check("the PAGE itself does not scroll sideways",
    m.docScrollW <= m.clientW, `${m.docScrollW} vs ${m.clientW}`);

  console.log("");
  console.log("── 1440 x 900 (the desktop, which must not move) ──");
  const d = await measure(1440, 900);
  console.log(JSON.stringify(d, null, 1));
  // The baseline classes must have rendered at all — otherwise "they match"
  // would be two zeroes agreeing with each other.
  check("the pre-pack classes still render (Tailwind still emits them)",
    d.legacyChip.h > 0 && d.legacyHelp.h > 0,
    `chip ${d.legacyChip.h}px, help ${d.legacyHelp.h}px`);
  check("a desktop chip is EXACTLY the size it was before this pack",
    d.chipOn.h === d.legacyChip.h, `${d.chipOn.h}px vs ${d.legacyChip.h}px`);
  check('desktop "Explain this page" is EXACTLY the size it was before',
    d.help.h === d.legacyHelp.h, `${d.help.h}px vs ${d.legacyHelp.h}px`);
  // `display: contents` is what buys that: the row is invisible to layout on
  // desktop, so the container around it behaves as it did with no wrapper.
  check("the desktop chip row is display:contents, not a flex container",
    d.row.display === "contents", `display: ${d.row.display}`);
  check("at 1440 the chips fit on one line, as they did before",
    d.chipRowLines === 1, `${d.chipRowLines} line(s)`);

  // 800px is still DESKTOP (above the 768 breakpoint) and is narrower than the
  // ten chips, so this is where "the parent still wraps them" is answerable.
  // Without it, `display: contents` could have been quietly breaking wrapping
  // on every laptop and the 1440 check would not have noticed.
  console.log("");
  console.log("── 800 x 900 (a narrow desktop — the chips must still wrap) ──");
  const n = await measure(800, 900);
  check("the chips WRAP onto more than one line, exactly as they always did",
    n.chipRowLines > 1, `${n.chipRowLines} line(s)`);
  check("and they are still 24px there — max-md: has not leaked above 768",
    n.chipOn.h === 24, `${n.chipOn.h}px`);
  check("the page does not scroll sideways at 800 either",
    n.docScrollW <= n.clientW, `${n.docScrollW} vs ${n.clientW}`);

  exitCode = checks.every((c) => c.ok) ? 0 : 1;
} finally {
  if (browser) await browser.close();
  if (vite) {
    // On Windows npx spawns through a shell, so child.kill() kills the SHELL
    // and leaves vite holding the port. /T takes the tree.
    if (process.platform === "win32") {
      try {
        const { execFileSync } = await import("node:child_process");
        execFileSync("taskkill", ["/PID", String(vite.pid), "/T", "/F"], { stdio: "ignore" });
      } catch { /* already gone */ }
    } else {
      vite.kill();
    }
    await new Promise((r) => setTimeout(r, 1200));
    check(`port ${PORT} is free again`, !(await portInUse(PORT)));
  }
}

const passed = checks.filter((c) => c.ok).length;
console.log("");
console.log(`${passed}/${checks.length} checks passed`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);

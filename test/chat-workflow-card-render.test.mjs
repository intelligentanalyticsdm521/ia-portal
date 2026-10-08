// Chat workflow card — RENDERED and clicked, not read as source text
// (contract CONTRACT_ARGUS_CHAT_PLAYBOOKS_2026-10-07 §F.1, the verifier's
// second-run findings of 7-8 Oct 2026).
//
// esbuild bundles the real ChatWorkflowCard and ChatVisitorEmailsSwitch with
// the API hook replaced by a recorder; React draws them into jsdom; the test
// types, clicks and picks like an owner, then reads what the card says and
// which requests it sent. The workflow rows are LUMEN's own output
// (test/fixtures/lumen-chat-links.json, produced by LUMEN's resolveVars, tree
// and linksOf over its example workflow).
//
// What this file proves:
//   L  the Links section: one row per link the workflow declares, a Save that
//      writes PUT /chat/playbooks/:id/links, the sentence beside the field, the
//      amber lines pointing at Links and gone once the address is set, a
//      hidden button explained in words, a refusal said in that row.
//   Z  the time zone is saved only on the websites that have none (the
//      binding the verifier's V3 mutation broke while every test stayed green).
//   E  the visitor-emails switch says what it did beside the switch, never at
//      the top of the page, and a refusal code reads as a sentence.
//
// Mutations that turn this file red: node scripts/dev/chat-workflows-mutation-check.mjs G
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = new URL("../", import.meta.url);
const esbuild = createRequire(new URL("package.json", ROOT))("esbuild");
const LUMEN = JSON.parse(fs.readFileSync(new URL("test/fixtures/lumen-chat-links.json", ROOT), "utf8"));

// ── a browser ───────────────────────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/app" });
for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "Node", "Event", "MouseEvent", "KeyboardEvent"]) {
  if (globalThis[k] === undefined) globalThis[k] = k === "window" ? dom.window : dom.window[k];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// React's act() in a browser bundle queues its work on a new MessageChannel
// each time and never closes it; Node's ports then keep the run alive after
// the last test. The same queue on setImmediate, for this file only.
const NodeMessageChannel = globalThis.MessageChannel;
globalThis.MessageChannel = class {
  constructor() {
    const port1 = { onmessage: null, close() {} };
    this.port1 = port1;
    this.port2 = { postMessage: (data) => setImmediate(() => port1.onmessage?.({ data })), close() {} };
  }
};

// ── the API, recorded ───────────────────────────────────────────────────────
// Every call is kept; each answer comes from `answer(method, path, body)`.
const api = { calls: [], answer: async () => ({}) };
globalThis.__chatApi = api;

const stubApi = {
  name: "stub-spark-api",
  setup(b) {
    b.onResolve({ filter: /hooks\/useSparkApi$/ }, () => ({ path: "useSparkApi", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `
        const call = (method) => async (path, body) => {
          const api = globalThis.__chatApi;
          api.calls.push({ method, path, body });
          return api.answer(method, path, body);
        };
        const fns = { get: call("GET"), post: call("POST"), put: call("PUT"), patch: call("PATCH"), del: call("DELETE"), ready: true };
        export function useSparkApi() { return fns; }`,
      loader: "js",
    }));
  },
};

let ui;
before(async () => {
  const built = await esbuild.build({
    stdin: {
      contents: `
        import { createElement, act } from "react";
        import { createRoot } from "react-dom/client";
        import { MemoryRouter } from "react-router-dom";
        import { ChatWorkflowCard, ChatVisitorEmailsSwitch } from "./src/components/spark/ChatWorkflowCard.tsx";
        export { act };
        const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };
        export function mount(C, props) {
          const host = document.createElement("div");
          document.body.appendChild(host);
          const root = createRoot(host);
          act(() => { root.render(createElement(MemoryRouter, { future: FUTURE }, createElement(C, props))); });
          return { host, rerender: (p) => act(() => { root.render(createElement(MemoryRouter, { future: FUTURE }, createElement(C, p))); }), unmount: () => act(() => root.unmount()) };
        }
        export { ChatWorkflowCard, ChatVisitorEmailsSwitch };
      `,
      resolveDir: fileURLToPath(ROOT), loader: "tsx", sourcefile: "entry.tsx",
    },
    bundle: true, format: "esm", platform: "browser", jsx: "automatic", write: false, logLevel: "silent",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [stubApi],
  });
  // A file, not a data: URL, so a React warning's stack stays one short line.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-card-render-"));
  const file = path.join(dir, "bundle.mjs");
  fs.writeFileSync(file, built.outputFiles[0].text);
  try { ui = await import(pathToFileURL(file).href); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// jsdom's window, closed when the file is done.
after(() => { dom.window.close(); globalThis.MessageChannel = NodeMessageChannel; });

// ── an owner's hands ────────────────────────────────────────────────────────
const tick = () => new Promise((r) => setTimeout(r, 0));
const ticks = async () => { for (let i = 0; i < 6; i += 1) await tick(); };
/** A click, and every answer it waits on, inside one act(). */
async function click(el) { await ui.act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await ticks(); }); }
async function type(input, value) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await ui.act(async () => { set.call(input, value); input.dispatchEvent(new window.Event("input", { bubbles: true })); });
}
async function pick(select, value) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  await ui.act(async () => { set.call(select, value); select.dispatchEvent(new window.Event("change", { bubbles: true })); await ticks(); });
}
/** What a person reads: each piece of text, a space between pieces. */
function text(el) {
  if (!el) return "";
  const walk = el.ownerDocument.createTreeWalker(el, 4 /* text */);
  const parts = [];
  while (walk.nextNode()) parts.push(walk.currentNode.nodeValue);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
const buttonIn = (el, words) => [...el.querySelectorAll("button")].find((b) => text(b) === words);
const apiErr = (status, body) => new Error(`SPARK API ${status}: ${JSON.stringify(body)}`);

const PLAYBOOK_ID = "8f0c2a5e-0000-4000-8000-00000000c0de";
function playbookRow(which = "no_links", extra = {}) {
  const w = LUMEN[which];
  return {
    playbook_id: PLAYBOOK_ID, name: "Website chat", site_id: null, site_label: null,
    status: "live", mode: "automatic", live_version: 1, draft_version: null, owner_display: "Avery",
    needs_you_count: 0, allowed: true, allowed_words: null,
    tree: w.tree, warnings: w.warnings, links: w.links, ...extra,
  };
}

/** A card on the page, with the page's own state handling (onChanged keeps the row). */
function mountCard({ row = playbookRow(), sites = [{ site_id: "S1", timezone: "America/Chicago", name: "Main site" }] } = {}) {
  const state = { row, changed: [], zones: [] };
  let view;
  const props = () => ({
    playbook: state.row, businessName: "Fixture Landscaping", sites,
    onChanged: (r) => { state.row = r; state.changed.push(r); view.rerender(props()); },
    onZoneSaved: (ids, tz) => state.zones.push({ ids, tz }),
  });
  view = ui.mount(ui.ChatWorkflowCard, props());
  return { ...view, state };
}
/** The amber lines under the card header: every one, whatever it says. */
const amberLines = (host) => [...host.querySelectorAll("li.text-amber-900")].map(text);
const linkRow = (host, key) => host.querySelector(`[data-link="${key}"]`);

describe("L: Links on the card", () => {
  test("one row per link the workflow declares, each with its label, its state in words, a field and a Save", () => {
    api.calls = [];
    const { host, unmount } = mountCard();
    const section = host.querySelector("[data-chat-links]");
    assert.ok(section, "the card has a Links section");
    assert.match(text(section), /^Links The web pages your chat’s buttons open\. A button with no address is hidden from visitors\./);
    const rows = [...section.querySelectorAll("[data-link]")];
    assert.deepEqual(rows.map((r) => r.getAttribute("data-link")), LUMEN.no_links.links.map((l) => l.key));
    const booking = linkRow(host, "booking_url");
    assert.match(text(booking), /^Booking page for a demo or a look at your numbers/);
    assert.match(text(booking), /No address yet, so the 'See a 10-minute demo' and 'Book it' buttons are hidden from visitors\./,
      "a hidden link button is explained in plain words, naming the buttons it opens");
    assert.ok(booking.querySelector('input[inputmode="url"][type="text"]'), "a text field with the web-address keyboard");
    assert.equal(buttonIn(booking, "Save").disabled, true, "nothing typed, nothing to save");
    unmount();
  });

  test("the amber lines point at Links on this card — never the server's 'under Links to show it.'", () => {
    const { host, unmount } = mountCard();
    const lines = amberLines(host);
    assert.equal(lines.length, 5, "one line per hidden button");
    assert.ok(lines.every((l) => /under Links, below\.$/.test(l)), lines.join("\n"));
    assert.equal(lines.some((l) => /under Links to show it/.test(l)), false, "the server's sentence is not said as well");
    assert.ok(lines.includes("The 'Book it' button is hidden from visitors because it has no web address yet. Add the address of your booking page for a demo or a look at your numbers under Links, below."));
    unmount();
  });

  test("Save writes the address to the workflow, says so beside the field, and the amber lines for it go", async () => {
    api.calls = [];
    const fresh = playbookRow("booking_set");
    api.answer = async (method, path, body) => {
      if (method === "PUT" && path.endsWith("/links")) {
        return { data: { playbook_id: PLAYBOOK_ID, links: LUMEN.no_links.links.map((l) => (l.key in body.links ? { ...l, url: body.links[l.key] || null } : l)) } };
      }
      if (method === "GET") return { data: [fresh] };
      return {};
    };
    const { host, state, unmount } = mountCard();
    const booking = linkRow(host, "booking_url");
    await type(booking.querySelector("input"), "book.example.com/demo");
    assert.equal(buttonIn(booking, "Save").disabled, false);
    await click(buttonIn(booking, "Save"));

    const put = api.calls.find((c) => c.method === "PUT");
    assert.equal(put.path, `/api/v1/chat/playbooks/${PLAYBOOK_ID}/links`);
    assert.deepEqual(put.body, { links: { booking_url: "https://book.example.com/demo" } }, "a bare address gets https:// in front");
    // the card asks again so the tree shows the button now
    assert.ok(api.calls.some((c) => c.method === "GET" && c.path === "/api/v1/chat/playbooks"));

    const row = linkRow(host, "booking_url");
    const said = row.querySelector('[role="status"]');
    assert.ok(said, "the confirmation is inside the link's own row");
    assert.equal(text(said), "Saved. Visitors see the 'See a 10-minute demo' and 'Book it' buttons from the next page they open.");
    assert.equal(row.querySelector("input").value, "https://book.example.com/demo");
    assert.match(text(row), /Visitors see the 'See a 10-minute demo' and 'Book it' buttons, and they open this page\./,
      "the row still names its buttons after the server stops listing them as hidden");

    const lines = amberLines(host);
    assert.equal(lines.some((l) => /'See a 10-minute demo'|'Book it'/.test(l)), false, "its amber lines are gone");
    assert.equal(lines.length, 3, "the other three hidden buttons are still said");
    assert.equal(state.row.links.find((l) => l.key === "booking_url").url, "https://book.example.com/demo");
    // nothing about it at any other row
    assert.equal(linkRow(host, "trial_url").querySelector('[role="status"]'), null);
    unmount();
  });

  test("the amber line goes on screen even when the server's answer does not refresh the tree", async () => {
    api.calls = [];
    api.answer = async (method, path, body) => {
      if (method === "PUT") return { data: { playbook_id: PLAYBOOK_ID, links: LUMEN.no_links.links.map((l) => (l.key in body.links ? { ...l, url: body.links[l.key] } : l)) } };
      throw apiErr(500, { error: "chat_workflows_failed", message: "Something went wrong on our side." });
    };
    const { host, unmount } = mountCard();
    const trial = linkRow(host, "trial_url");
    await type(trial.querySelector("input"), "https://trial.example.com");
    await click(buttonIn(trial, "Save"));
    assert.equal(amberLines(host).some((l) => /'Start a trial'/.test(l)), false);
    assert.equal(text(linkRow(host, "trial_url").querySelector('[role="status"]')), "Saved. Visitors see the 'Start a trial' button from the next page they open.");
    unmount();
  });

  test("a refused address is said in rose in that row, and nothing is said as saved", async () => {
    api.calls = [];
    api.answer = async (method) => {
      if (method === "PUT") throw apiErr(400, { error: "bad_url", message: 'The address for "Start-a-trial page" must be a full web address that starts with https://.' });
      return { data: [] };
    };
    const { host, unmount } = mountCard();
    const trial = linkRow(host, "trial_url");
    await type(trial.querySelector("input"), "http://trial.example.com");
    await click(buttonIn(trial, "Save"));
    const row = linkRow(host, "trial_url");
    assert.equal(text(row.querySelector('[role="alert"]')), 'The address for "Start-a-trial page" must be a full web address that starts with https://.');
    assert.equal(row.querySelector('[role="status"]'), null);
    assert.ok(amberLines(host).some((l) => /'Start a trial'/.test(l)), "still hidden, still said");
    unmount();
  });

  test("an emptied field clears the address and the row says its buttons are hidden again", async () => {
    api.calls = [];
    api.answer = async (method, path, body) => {
      if (method === "PUT") return { data: { playbook_id: PLAYBOOK_ID, links: LUMEN.booking_set.links.map((l) => (l.key in body.links ? { ...l, url: body.links[l.key] || null } : l)) } };
      return { data: [playbookRow("no_links")] };
    };
    const { host, unmount } = mountCard({ row: playbookRow("booking_set") });
    const booking = linkRow(host, "booking_url");
    assert.equal(booking.querySelector("input").value, "https://book.example.com/demo");
    await type(booking.querySelector("input"), "");
    await click(buttonIn(booking, "Save"));
    assert.deepEqual(api.calls.find((c) => c.method === "PUT").body, { links: { booking_url: "" } });
    const row = linkRow(host, "booking_url");
    assert.match(text(row.querySelector('[role="status"]')), /^Cleared\. .*hidden from visitors until you add an address\.$/);
    assert.match(text(row), /No address yet, so the .*hidden from visitors\./);
    unmount();
  });
});

describe("the card's own switches say what they did right under the header", () => {
  test("switching the workflow off writes it and says so on the card", async () => {
    api.calls = [];
    api.answer = async (method, path, body) => ({ data: { playbook_id: PLAYBOOK_ID, status: body.status } });
    const { host, unmount } = mountCard();
    const live = host.querySelector('input[role="switch"][aria-label^="Live on"]');
    assert.equal(live.checked, true);
    await click(live);
    assert.deepEqual(api.calls.map((c) => [c.method, c.path, c.body]), [["PUT", `/api/v1/chat/playbooks/${PLAYBOOK_ID}`, { status: "off" }]]);
    const card = host.querySelector("[data-chat-workflow]");
    const said = [...card.children].find((el) => el.getAttribute("role") === "status");
    assert.ok(said, "the sentence sits on the card itself, beside the header");
    assert.equal(text(said), "Website chat is off. Visitors get the usual chat until you switch it back on.");
    unmount();
  });
});

describe("Z: the time zone is saved only where none is set", () => {
  test("picking a zone writes it to the website without one, never over the one that has its own", async () => {
    api.calls = [];
    api.answer = async () => ({ data: {} });
    const tz = "Pick your time zone so the chat knows when you're closed.";
    const row = playbookRow("no_links", { warnings: [...LUMEN.no_links.warnings, tz] });
    const sites = [
      { site_id: "S-HAS", timezone: "America/Denver", name: "Has a zone" },
      { site_id: "S-NONE", timezone: null, name: "No zone yet" },
    ];
    const { host, state, unmount } = mountCard({ row, sites });
    const select = host.querySelector("select");
    assert.ok(select, "the picker shows while a website has no zone");
    await pick(select, "America/New_York");
    const puts = api.calls.filter((c) => c.method === "PUT");
    assert.deepEqual(puts.map((c) => [c.path, c.body]), [["/api/v1/chat/sites/S-NONE", { timezone: "America/New_York" }]],
      "only the website with no zone is written");
    assert.deepEqual(state.zones, [{ ids: ["S-NONE"], tz: "America/New_York" }]);
    assert.equal(text(host.querySelector('[role="status"]')), "Saved. ARGUS now reads your opening hours in America/New York time.");
    unmount();
  });

  test("a failed save names the website and gives one instruction", async () => {
    api.calls = [];
    api.answer = async () => { throw apiErr(404, { error: "no_such_site" }); };
    const tz = "Pick your time zone so the chat knows when you're closed.";
    const { host, unmount } = mountCard({ row: playbookRow("no_links", { warnings: [tz] }), sites: [{ site_id: "S-NONE", timezone: null, name: "No zone yet" }] });
    await pick(host.querySelector("select"), "America/Chicago");
    assert.equal(text(host.querySelector('[role="alert"]')),
      "Not saved on No zone yet. That website isn't on your account any more. Reload the page to see your websites.");
    unmount();
  });
});

describe("E: Email visitors what they asked for, said beside the switch", () => {
  function mountSwitch(site) {
    const saved = [];
    const view = ui.mount(ui.ChatVisitorEmailsSwitch, { site, name: site.label || "Your website", onSaved: (on) => saved.push(on) });
    return { ...view, saved };
  }

  test("switching it off saves on that website and says so under the switch", async () => {
    api.calls = [];
    api.answer = async () => ({ data: {} });
    const { host, saved, unmount } = mountSwitch({ site_id: "S1", label: "Main site", visitor_emails_enabled: true });
    const sw = host.querySelector('input[role="switch"]');
    assert.equal(sw.checked, true, "on unless the business says no");
    await click(sw);
    assert.deepEqual(api.calls.map((c) => [c.method, c.path, c.body]), [["PUT", "/api/v1/chat/sites/S1", { visitor_emails_enabled: false }]]);
    assert.deepEqual(saved, [false]);
    const box = host.querySelector("[data-visitor-emails]");
    assert.equal(text(box.querySelector('[role="status"]')), "Saved. Visitors on Main site won't get emails from the chat.");
    unmount();
  });

  test("a refusal reads as a sentence, beside the switch, never the code", async () => {
    api.calls = [];
    api.answer = async () => { throw apiErr(500, { error: "chat_site_save_failed", details: "Timeout: Request failed to complete in 15000ms" }); };
    const { host, unmount } = mountSwitch({ site_id: "S1", label: "Main site" });
    await click(host.querySelector('input[role="switch"]'));
    const alert = text(host.querySelector('[role="alert"]'));
    assert.equal(alert, "That didn't save, so the switch shows what is saved now. Something went wrong on our side. Please try again in a minute.");
    assert.equal(/_|chat site save failed|Timeout/.test(alert), false);
    assert.equal(host.querySelector('[role="status"]'), null);
    unmount();
  });
});

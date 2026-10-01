// Conversations 4 — the three Portal surfaces. Source-pinned, like
// responder-ui and il3-rules-suggestions-ui: these are wiring and wording facts
// a typecheck cannot see.
//
// What has to stay true:
//   • the Conversation panel is ONE tab on the existing lead modal, not a rebuild
//   • it calls the routes LUMEN actually serves
//   • the transcript says WHO said each thing — them, the business, the agent
//   • replying says, in words, that it marks the lead contacted
//   • the drafted chat reply lives on the RESPONDER tab and nowhere else:
//     two Approve buttons for one draft is two ways to send it
//   • Lead sources separates Inbound (your own website, a switch) from Intake
//     (a platform you connect, a key) — the §9 naming, locked
//   • the acknowledgement preview is READ from the API, never retyped here
//   • D2 by absence: no chat surface offers to text anybody
//   • the engine is "ARGUS AI"; the model vendor is named nowhere
//   • neither surface says "tenant" to a human (feedback_no_tenant_in_ui)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

const panel = read("components/spark/LeadChatPanel.tsx");
const modal = read("components/spark/SparkLeadModal.tsx");
const responder = read("components/spark/LeadResponderPanel.tsx");
const sources = read("pages/spark/SparkLeadSourcesPage.tsx");
const leadSource = read("lib/leadSource.ts");

/** Everything a person can read: JSX text and quoted copy, minus the code. */
function visibleText(src) {
  return src
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/className="[^"]*"/g, " ")
    .replace(/import[^;]*;/g, " ");
}

test("the Conversation panel is one tab bolted onto the existing lead modal", () => {
  assert.match(modal, /import \{ LeadChatPanel \} from "\.\/LeadChatPanel"/);
  assert.match(modal, /\{ key: "conversation", label: "Conversation", icon: MessageSquare \}/);
  // After a reply the modal reloads the lead (Overview shows Contacted at once,
  // 71ee0f8) and then tells the inbox.
  assert.match(modal, /\{tab === "conversation" && lead && \(\s*<LeadChatPanel leadId=\{lead\.id\} onChanged=\{\(\) => \{ void load\(\); onChanged\?\.\(\); \}\} \/>/);
  // Beside the Responder tab, not instead of it.
  assert.match(modal, /\{ key: "responder", label: "Responder", icon: Sparkles \}/);
});

test("the panel talks to the routes LUMEN serves", () => {
  assert.match(panel, /`\/api\/v1\/leads\/\$\{leadId\}\/chat`/);
  assert.match(panel, /`\/api\/v1\/leads\/\$\{leadId\}\/chat\/reply`/);
  assert.match(panel, /`\/api\/v1\/leads\/\$\{leadId\}\/chat\/close`/);
});

test("every message in the transcript says who said it", () => {
  assert.match(panel, /m\.direction === "visitor"/);
  assert.match(panel, /ARGUS Responder/);
  // A retried or double-clicked reply is one message, decided by the server.
  assert.match(panel, /client_message_id/);
});

test("replying tells the owner it marks the lead contacted", () => {
  const text = visibleText(panel);
  assert.match(text, /marked as contacted/);
  assert.match(text, /Sending marks this lead as contacted/);
});

test("the drafted reply is not duplicated onto this tab", () => {
  // One draft, one Approve button, on the Responder tab. This panel points at
  // it rather than growing a second gate.
  // The only Approve on this tab is the sentence pointing at the other one.
  const buttons = [...panel.matchAll(/<button[\s\S]*?<\/button>/g)].map((m) => m[0]).join("\n");
  assert.equal(/Approve/.test(buttons), false, "the Conversation tab must not offer its own Approve button");
  assert.match(panel, /Responder tab with Approve &amp; send/);
  assert.match(responder, /"Approve & send to the chat"/);
  assert.match(responder, /kind: "reply" \| "quote" \| "chat_reply"/);
});

test("a chat draft is editable words, and its subject is never sent", () => {
  assert.match(responder, /function isWords\(d: ResponderDraft\)/);
  assert.match(responder, /d\.kind === "reply" \|\| d\.kind === "chat_reply"/);
  assert.match(visibleText(responder), /your summary — not sent/);
});

test("Lead sources separates Inbound from Intake, in the locked words", () => {
  const text = visibleText(sources);
  assert.match(text, /Inbound — your own website/);
  assert.match(text, /Intake — platforms you connect/);
  // SPARK pack 2 (2026-09-09): "No key, nothing to paste" was TRUE only for a
  // website we host, and web chat existed only for those — a business whose
  // site we do not host had no site row, so no key, so nothing to switch on.
  // There IS something to paste now, for exactly those businesses, so the
  // sentence changed rather than becoming a lie.
  assert.match(text, /A website we host needs nothing pasted/);
  assert.match(text, /Add a website we do not host/);
  assert.match(sources, /`\/api\/v1\/chat\/sites\/\$\{site\.site_id\}`/);
  assert.match(sources, /get<\{ data: ChatSiteRow\[\]; meta: ChatMeta \}>\("\/api\/v1\/chat\/sites"\)/);
});

test("the acknowledgement preview is read from the API, not retyped in the Portal", () => {
  // Retyping it here is how a preview and the thing it previews drift apart.
  assert.match(sources, /chatMeta\?\.ack_preview/);
  assert.match(sources, /chatMeta\?\.hours_line/);
  assert.equal(/We usually reply within/.test(sources), false,
    "the Portal must not carry its own copy of the acknowledgement wording");
});

test("a web chat lead reads 'Website chat · via <the site>'", () => {
  assert.match(leadSource, /web_chat: "Website chat"/);
  // rowSourceAndChannel joins source_label and channel; services/chat writes
  // the site's own domain into channel.
  assert.match(leadSource, /export function rowSourceAndChannel/);
});

test("no chat surface offers to text anybody (D2)", () => {
  for (const [name, src] of [["LeadChatPanel", panel], ["Lead sources", sources]]) {
    const code = src.replace(/^\s*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    assert.equal(/\bsms\b|text message|send a text/i.test(code), false,
      `${name} must not offer to text a visitor`);
  }
});

test("the engine is ARGUS AI and the vendor is named nowhere", () => {
  assert.match(panel, /ARGUS AI/);
  for (const [name, src] of [["LeadChatPanel", panel], ["Lead sources", sources]]) {
    assert.equal(/anthropic|claude|openai|gpt-/i.test(src), false, `${name} must not name the model vendor`);
  }
});

test("neither surface says 'tenant' to a human", () => {
  for (const [name, src] of [["LeadChatPanel", panel], ["Lead sources", sources]]) {
    assert.equal(/>\s*[^<]*\btenant\b/i.test(visibleText(src)), false,
      `${name} must say "business", never "tenant"`);
  }
});

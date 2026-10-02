// A new proposal opened from a consulting project starts addressed to the
// project's primary person (verifier finding, 2 Oct 2026: the customer search
// opened over the panel because nothing was picked). Source pins: the effect
// runs only for a brand-new proposal with no customer, prefers the primary
// person's contact, and leaves "change" in place.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = fs.readFileSync(path.join(ROOT, "src/builder/proposal/ProposalBuilder.tsx"), "utf8").replace(/\r\n/g, "\n");

const effect = (() => {
  const start = SRC.indexOf("A NEW proposal for a project starts addressed to its primary person");
  assert.ok(start > -1, "the prefill effect is missing");
  const end = SRC.indexOf("What this document changes, measured against what the customer read.", start);
  return SRC.slice(start, end);
})();

test("the prefill asks the project for its people only for a new, customer-less proposal", () => {
  assert.match(effect, /if \(!projectId \|\| proposalId \|\| revision \|\| contactId\) return;/);
  assert.match(effect, /`\/consulting\/projects\/\$\{projectId\}\/people`/);
});

test("the primary person's contact wins; any contact person is the fallback; a project of portal users prefills nobody", () => {
  assert.match(effect, /people\.find\(\(p\) => \(p\.is_primary === true \|\| p\.is_primary === 1\) && p\.contact_uuid\)/);
  assert.match(effect, /\|\| people\.find\(\(p\) => p\.person_kind === "contact" && p\.contact_uuid\)/);
  assert.match(effect, /if \(!primary\?\.contact_uuid\) return;/);
});

test("the pick is remembered the way an opened proposal's customer is, so searching again keeps the name", () => {
  assert.match(effect, /setContactId\(primary\.contact_uuid\);/);
  assert.match(effect, /setPickedContact\(\{\s*contact_id: primary\.contact_uuid,/);
  assert.match(effect, /company_name: primary\.company \|\| undefined,/);
});

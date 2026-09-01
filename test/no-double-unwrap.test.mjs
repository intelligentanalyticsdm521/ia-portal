// The envelope double-unwrap — the portal's most repeated bug.
//
// lib/oliverApi.ts unwraps for you:
//
//     return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
//
// so `get<T>(...)` hands back the CONTENTS of `data`, not the envelope.
// lumenApi and stellaApi do the same; useConsultingApi is built on oliverGet so
// it inherits it. sparkApi deliberately does NOT — it returns the envelope, and
// reading `.data` there is correct.
//
// Declaring the envelope as the generic on an unwrapping client is always the
// bug in progress:
//
//     const r = await get<{ data: Thing[] }>("/things");
//     setThings(r.data);          // undefined — forever, with no error
//
// The page then renders empty or "Loading…" permanently and nothing throws, so
// it survives review and ships. It has produced: a dead Command Center feed, an
// empty consulting overview, a blank portal-customization page, and a Stripe
// payouts page that could not work in ANY state (the API sent `note` as a
// sibling of `data`, so the unwrap discarded the one field that explained the
// empty screen).
//
// This flags the declaration rather than the read: a `data:` field in the type
// argument of an unwrapping client's call is unambiguous and cheap to spot,
// whereas tracking the variable to its `.data` access would need a type checker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

// Clients that strip the envelope. sparkApi is deliberately absent.
const UNWRAPPING_HOOKS = ["useOliverApi", "useConsultingApi", "useLumenApi", "useStellaApi"];

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

test("no call on an unwrapping API client declares the { data: ... } envelope", () => {
  const offenders = [];

  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, "utf8");

    // Only inspect files that actually take one of the unwrapping clients —
    // otherwise a bare `get<{data:...}>` from sparkApi would be flagged wrongly.
    if (!UNWRAPPING_HOOKS.some((h) => src.includes(h))) continue;
    // A file that also pulls in sparkApi mixes both conventions; the method
    // name alone can no longer tell them apart, so leave it to review.
    if (/\buseSparkApi\b|from ["'].*sparkApi["']/.test(src)) continue;

    // `await get<{ ... data ... }>(` / `.get<{ ... data ... }>(` and the other verbs.
    const re = /\b(?:await\s+)?(?:\w+\.)?(get|post|put|patch)\s*<\s*(\{[^;]*?\})\s*>\s*\(/g;
    for (const m of src.matchAll(re)) {
      const typeArg = m[2];
      if (!/(^|[{;,\s])data\s*[?:]/.test(typeArg)) continue;
      const line = src.slice(0, m.index).split("\n").length;
      offenders.push(
        `${path.relative(SRC, file)}:${line}  ${m[1]}<${typeArg.replace(/\s+/g, " ").slice(0, 60)}…>`,
      );
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "these calls declare the envelope on a client that already strips it, so " +
      "reading `.data` on the result yields undefined with no error:\n  " +
      offenders.join("\n  "),
  );
});

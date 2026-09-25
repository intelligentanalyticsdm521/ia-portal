// scripts/dev/d164-mutation-check.mjs — MAKE THE D-164 GUARDS FAIL.
//
//   node scripts/dev/d164-mutation-check.mjs
//
// A green check proves nothing until it has been made to fail on purpose
// (feedback_mutation_test_your_guards). This is the D-164 set: the four guards
// the commercial snow & ice agreement landed with, plus the two defects the
// 2026-09-18 click-through found on top of them.
//
//   D-164 as it shipped
//     1  the per-event rule that keeps a total off a document that has none
//     2  the same rule's MARKER, which the pane and the list read
//     3  a catalogue pick resetting "How many" to 1
//     4  no client of ours named anywhere in a shipped template
//     5  the agreement is TEN numbered sections
//
//   2026-09-18, found by driving it
//     6  an edited run is read with its text-transform NEUTRALISED …
//     7  … and the inline style it found is put back
//     8  … and the canvas reads through that one helper, not innerText
//     9  Send counts a blank merge tag AT ANY DEPTH — the cover's key facts
//        are a box, and both service-term dates went out empty
//    10  both Send buttons refuse in ONE sentence, written in one place
//
// Each mutation is applied to a real file, the named test is run, the file is
// restored whatever happens, and a mutation the test did not notice is
// reported as a HOLE. Exit code is non-zero if any mutation stayed green.
//
// Nothing here touches a served checkout or a port.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// THE ONE HOME FOR THE SPELLINGS. A client's name is not typed into this file;
// it is imported from the denylist, which is the whole point of the denylist.
import { CLIENT_NAMES } from "../../test/client-names.mjs";

const TEMPLATES = "src/builder/templates.ts";
const PRICELINE = "src/builder/widgets/priceLine.ts";
const SNOW = "src/builder/snowAgreement.ts";
const EDITED = "src/builder/editedText.ts";
const CANVAS = "src/builder/Canvas.tsx";
const DETAILS = "src/builder/proposal/documentDetails.ts";
const BUILDER = "src/builder/proposal/ProposalBuilder.tsx";

const SNOWTEST = "test/snow-agreement-template.test.mjs";
const ENGINE = "test/builder-engine.test.mjs";
const USABILITY = "test/proposal-usability.test.mjs";

/** Whichever name is first — the list is the one home, and this reads it. */
const A_CLIENT = CLIENT_NAMES[0];

const MUTATIONS = [
  {
    name: "D1 every document totals again, however its lines are charged",
    file: TEMPLATES,
    from: "  return bases.size <= 1;",
    to: "  return true;",
    test: SNOWTEST,
    expects: "the snow & ice agreement is per event, and every other template is not",
  },
  {
    name: "D2 the per-event MARKER is dropped, so the pane and the list never hear",
    file: TEMPLATES,
    from: "  return pricedOnOneBasis(doc) ? null : PER_EVENT_BASIS;",
    to: "  return null;",
    test: SNOWTEST,
    expects: "the snow & ice agreement is per event, and every other template is not",
  },
  {
    name: "D3 a catalogue pick keeps the quantity from the last line",
    file: PRICELINE,
    from: "    unit_label: str(parts.label).trim(),\n    quantity: 1,\n  };",
    to: "    unit_label: str(parts.label).trim(),\n  };",
    test: SNOWTEST,
    expects: "loading a catalogue price RESETS How many to 1",
  },
  {
    name: "D4 a client of ours is named on the shipped cover",
    file: SNOW,
    /* REPOINTED AT INTEGRATION 2026-09-19. `doc_header` is deleted (§11.13.3)
       and the cover is a row Container with an Image and a Heading, so the
       subtitle it used to mutate is a Text Editor's `text` now. Same promise,
       same guard, the line that carries it today. */
    from: 'text: "A clear, dependable plan for winter weather.',
    to: `text: "Prepared for ${A_CLIENT}. A clear, dependable plan for winter weather.`,
    test: SNOWTEST,
    expects: "none of the names appears in the entry or in the built document",
  },
  {
    name: "D5 the agreement ships with nine sections, not ten",
    file: SNOW,
    from: "    billingAndPayment(),\n    generalTerms(),",
    to: "    generalTerms(),",
    test: SNOWTEST,
    expects: "all ten are there, in order, and each is numbered",
  },
  {
    name: "D6 the edit is read through the CSS transform again",
    file: EDITED,
    from: '    style.textTransform = "none";',
    to: '    style.textTransform = typeof had === "string" ? had : "";',
    test: ENGINE,
    expects: "a run styled UPPERCASE reads back in the case it was typed in",
  },
  {
    name: "D7 the read leaves its own override on the element",
    file: EDITED,
    from: '    style.textTransform = typeof had === "string" ? had : "";',
    to: '    style.textTransform = "none";',
    test: ENGINE,
    expects: "the inline style it found is put back",
  },
  {
    name: "D8 the canvas commits from innerText again",
    file: CANVAS,
    from: "    const text = readEditedText(el).replace(",
    to: "    const text = el.innerText.replace(",
    test: ENGINE,
    expects: "the CANVAS commits through it",
  },
  {
    name: "D9 Send goes back to reading the top of each column",
    file: DETAILS,
    from: "export function blankTokens(doc: BuilderDocument, merge: MergeContext): string[] {\n"
      + "  return tokensUsedBy(doc).filter((token) => lookup(merge, token) == null);\n}",
    to: "export function blankTokens(doc: BuilderDocument, merge: MergeContext): string[] {\n"
      + "  const out: string[] = [];\n"
      + "  for (const s of doc.sections) {\n"
      + '    if (s.visibility !== "customer") continue;\n'
      + "    for (const c of s.columns) for (const w of c.widgets) {\n"
      + "      for (const t of tokensIn(JSON.stringify((w as any).props ?? {}))) {\n"
      + "        if (lookup(merge, t) == null && !out.includes(t)) out.push(t);\n"
      + "      }\n"
      + "    }\n"
      + "  }\n"
      + "  return out;\n}",
    test: SNOWTEST,
    expects: "with the term dates empty the guard NAMES them and the send is refused",
  },
  {
    name: "D10 one Send button writes its own refusal again",
    file: BUILDER,
    from: "      refuse(anchor, blanksRefusal(blanks, detailLabels));",
    to: '      refuse(anchor, "Some details are still blank.");',
    test: SNOWTEST,
    expects: "both Send buttons refuse in the SAME sentence",
  },
];

let holes = 0;
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, "utf8");
  /* THE FILE'S OWN LINE ENDINGS. These repos are CRLF on disk and the
     mutations above are written with \n; comparing them literally would SKIP
     every check and report a guard as stale when the guard is fine. */
  const eol = original.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
  const from = m.from.split("\n").join(eol);
  const to = m.to.split("\n").join(eol);
  if (!original.includes(from)) {
    console.log(`SKIP  ${m.name} — the line it mutates has moved, so this check is stale`);
    holes += 1;
    continue;
  }
  writeFileSync(m.file, original.replace(from, to), "utf8");
  let output = "";
  let failed = false;
  try {
    output = execFileSync(
      process.execPath,
      ["--import", "./scripts/test-ts-loader.mjs", "--test", m.test],
      { encoding: "utf8" },
    );
  } catch (err) {
    failed = true;
    output = `${err.stdout || ""}${err.stderr || ""}`;
  } finally {
    writeFileSync(m.file, original, "utf8");
  }
  /* RESTORED, and SAID SO. A mutation check that leaves a file mutated is
     worse than no check at all, so the restore is asserted rather than
     assumed — the write above can fail on a file something else has open. */
  const restored = readFileSync(m.file, "utf8") === original;
  if (!restored) {
    console.log(`STOP  ${m.file} was NOT restored — put it back before doing anything else`);
    process.exit(2);
  }
  const noticed = failed && output.includes(m.expects);
  console.log(`${noticed ? "RED " : "HOLE"}  ${m.name} → "${m.expects}"`);
  if (!noticed) holes += 1;
}

console.log(holes
  ? `\n${holes} mutation(s) went unnoticed — those guards do not guard.`
  : `\nAll ${MUTATIONS.length} mutations were caught, and every file was restored.`);
process.exit(holes ? 1 : 0);

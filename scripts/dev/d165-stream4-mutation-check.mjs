/**
 * Mutation check for D-165 stream 4 (Portal).
 *
 *   node scripts/dev/d165-stream4-mutation-check.mjs
 *
 * A green test proves nothing until you have made it fail on purpose
 * (memory: feedback_mutation_test_your_guards). Each mutation puts ONE of this
 * pass's promises back the way it was, runs the test that should notice, and
 * restores the file. A mutation nothing notices is a HOLE and says so.
 *
 *   M1  a group comes back above the widget list
 *   M2  page settings are shown whatever is selected, so they are a side list
 *       again by another name
 *   M3  the text part goes back to the top of each column
 *   M4  an icon prints the WORD for an icon
 *   M5  a hosted page embeds somebody else's map
 *   M6  the accordion needs a script
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const EMAIL_BUILDER = 'src/builder/adapters/email/EmailBuilder.tsx';
const EMAIL_RENDER = 'src/builder/adapters/email/emailRender.ts';
const LANDING_RENDER = 'src/builder/adapters/landing/landingRender.ts';
const INSPECTOR = 'src/builder/Inspector.tsx';
const TEST = 'test/builder-surfaces-d165.test.mjs';

const MUTATIONS = [
  {
    /* REPOINTED AT INTEGRATION 2026-09-19. The adapters no longer keep a
       `selected` flag, so the line this used to mutate is gone; the promise
       is the same and this is the line that carries it now. */
    name: 'M1 a group comes back above the widget list',
    file: EMAIL_BUILDER,
    from: '      documentExtras={(',
    to: '      paneHeader={<div />}\n      documentExtras={(',
    test: TEST,
    expects: 'still puts something above the widget list',
  },
  {
    /* REPOINTED AT INTEGRATION 2026-09-19, and at the RIGHT file. Three
       adapters each wrote `documentExtras={selection ? null : ...}`; the rule
       moved into the Inspector, ONCE, so the mutation that matters is drawing
       page settings in the selected branch too - a permanent side list by
       another name, sitting above the widget's own panel. */
    name: 'M2 page settings are shown whatever is selected',
    file: INSPECTOR,
    from: '        <div style={{ fontSize: 14, fontWeight: 600 }} data-inspector-title>Edit {name}</div>',
    to: '        {p.documentExtras}\n        <div style={{ fontSize: 14, fontWeight: 600 }} data-inspector-title>Edit {name}</div>',
    test: TEST,
    expects: 'draws documentExtras more than once',
  },
  {
    name: 'M3 the text part goes back to the top of each column',
    file: EMAIL_RENDER,
    from: '      if (isContainer(w)) { eachWidget(childrenOf(w), visit); continue; }',
    to: '      if (isContainer(w)) { continue; }',
    test: TEST,
    expects: 'never reached the text part',
  },
  {
    name: 'M4 an icon prints the WORD for an icon',
    file: EMAIL_RENDER,
    from: '  return /^[a-z0-9 _-]+$/i.test(raw) ? ICON_GLYPHS.circle : raw;',
    to: '  return raw;',
    test: TEST,
    expects: 'a real character, never the word for one',
  },
  {
    name: "M5 a hosted page embeds somebody else's map",
    file: LANDING_RENDER,
    from: '  return `<p class="lp-map"><span${edit("address", c, "Where you are")}>${t(p.address, c)}</span> `',
    to: '  return `<div class="lp-map"><iframe src="https://maps.google.com/maps?output=embed"></iframe></div>` + `<p class="lp-map"><span${edit("address", c, "Where you are")}>${t(p.address, c)}</span> `',
    test: TEST,
    expects: "drops a third party's cookies on a visitor",
  },
  {
    name: 'M6 the tabs need a script',
    file: LANDING_RENDER,
    from: '  return `<div class="lp-tabs" style="--accent:${esc(c.accent)}">${heads}${panels}</div>`;',
    to: '  return `<div class="lp-tabs" style="--accent:${esc(c.accent)}">${heads}${panels}</div><script>/* tabs */</script>`;',
    test: TEST,
    expects: 'must ship no script',
  },
];

let holes = 0;
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, 'utf8');
  /* THE FILE'S OWN LINE ENDINGS — these repos are CRLF on disk and the
     mutations are written with \n, so a literal compare would SKIP the check
     and report a working guard as stale. */
  const eol = original.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const from = m.from.split('\n').join(eol);
  const to = m.to.split('\n').join(eol);
  if (!original.includes(from)) {
    console.log(`SKIP  ${m.name} — the line it mutates has moved, so this check is stale`);
    holes += 1;
    continue;
  }
  writeFileSync(m.file, original.replace(from, to), 'utf8');
  let output = '';
  let failed = false;
  try {
    output = execFileSync(process.execPath,
      ['--import', './scripts/test-ts-loader.mjs', '--test', m.test], { encoding: 'utf8' });
  } catch (err) {
    failed = true;
    output = `${err.stdout || ''}${err.stderr || ''}`;
  } finally {
    writeFileSync(m.file, original, 'utf8');
  }
  const noticed = failed && output.includes(m.expects);
  console.log(`${noticed ? 'RED ' : 'HOLE'}  ${m.name} → "${m.expects}"`);
  if (!noticed) holes += 1;
}

console.log(holes === 0
  ? `\nAll ${MUTATIONS.length} mutations were caught, and every file was restored.`
  : `\n${holes} mutation(s) went unnoticed — those guards do not guard.`);
process.exit(holes === 0 ? 0 : 1);

/**
 * Mutation check for D-156 stream D in the Portal (the plan gate).
 *
 *   node scripts/dev/d156-stream-d-mutation-check.mjs
 *
 * A green check proves nothing until you make it fail on purpose
 * (memory: feedback_mutation_test_your_guards). Each mutation breaks ONE
 * guard, runs the test that should notice, and restores the file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PLAN = 'src/builder/adapters/website/sitePlan.ts';
const BUILDER = 'src/builder/adapters/website/WebsiteBuilder.tsx';
const TEST = 'test/website-plan-gating.test.mjs';

const MUTATIONS = [
  {
    name: 'P1 the plan ignores what the server locked',
    file: PLAN,
    from: '    if (row.available === false) locked[row.kind] = row.unavailableReason || DEFAULT_LOCK;',
    to: '    if (false) locked[row.kind] = DEFAULT_LOCK;',
    expects: 'a Lite business gets the locked kind and the sentence the server sent',
  },
  {
    name: 'P2 nothing is ever locked',
    file: PLAN,
    from: '  return plan.locked[kind] ?? null;',
    to: '  return null;',
    expects: 'the section the plan does not carry is refused, with the sentence',
  },
  {
    name: 'P3 the insert stops asking the plan',
    file: BUILDER,
    from: '    const locked = lockFor(plan, kind);\n    if (locked) { setErr(locked); return false; }',
    to: '    const locked = null;',
    expects: "the pane's insert asks the plan before anything is built",
  },
  {
    name: 'P4 the lock names the vendor',
    file: PLAN,
    from: 'export const DEFAULT_LOCK = "Available on ARION Standard and above.";',
    to: 'export const DEFAULT_LOCK = "Elementor Pro is not on this plan.";',
    expects: 'no vendor name reaches a client sentence',
  },
];

let holes = 0;
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, 'utf8');
  /* THE FILE'S OWN LINE ENDINGS. These repos are CRLF on disk and the
     mutations above are written with \n, so comparing them literally
     SKIPPED a check and reported a guard as stale when the guard was fine.
     Found by running this harness after the integration. */
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
      ['--import', './scripts/test-ts-loader.mjs', '--test', TEST], { encoding: 'utf8' });
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

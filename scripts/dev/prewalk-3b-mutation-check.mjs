#!/usr/bin/env node
/**
 * prewalk-3b-mutation-check.mjs — DEV ONLY. Break each pre-walk-3b guard on
 * purpose, watch the test go RED, put the file back.
 *
 * A green check proves nothing until you have made it fail
 * (memory: feedback_mutation_test_your_guards). Every edit below reinstates
 * the exact defect the walk found, so a guard that does not go red is a guard
 * that would not have caught it either.
 *
 *   node scripts/dev/prewalk-3b-mutation-check.mjs
 *
 * Writes nothing but the file it is mutating, and restores it in a `finally`
 * so an interrupt cannot leave the tree edited.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const TEST = 'test/prewalk-3b.test.mjs';

const MUTATIONS = [
  {
    name: 'the STELLA palette goes back into StellaShell (the import cycle returns)',
    file: 'src/pages/stella/SplitEditor.tsx',
    from: 'from "./stellaTheme";',
    to: 'from "./StellaShell";',
  },
  {
    name: 'RecordTransactionModal reaches back into StellaShell for a value',
    file: 'src/pages/stella/RecordTransactionModal.tsx',
    from: 'from "./stellaTheme";',
    to: 'from "./StellaShell";',
  },
  {
    name: 'stellaTheme stops being a leaf',
    file: 'src/pages/stella/stellaTheme.ts',
    from: 'export const STELLA_INDIGO',
    to: 'import "./StellaShell";\nexport const STELLA_INDIGO',
  },
  {
    name: 'the Website → Settings menu entry is taken out again',
    file: 'src/components/SubNav.tsx',
    from: '{ key: "arion_website_settings", label: "Settings", route: "/app/services/arion_website_settings" },',
    to: '',
  },
  {
    name: 'a menu entry points at a page that does not exist',
    file: 'src/components/SubNav.tsx',
    from: '{ key: "arion_website_menus", label: "Menus"',
    to: '{ key: "arion_website_menus_typo", label: "Menus"',
  },
  {
    name: 'the theme vendor name goes back on the Brand & layout card',
    file: 'src/arion/pages/website/WebsiteDesign.tsx',
    from: "subtitle={chrome ? 'Set through your website’s design.' : undefined}",
    to: 'subtitle={chrome ? `Set through your website’s design (${chrome.theme}).` : undefined}',
  },
  {
    name: 'a vendor name appears in the Settings page copy',
    file: 'src/arion/pages/website/WebsiteSettings.tsx',
    from: 'The people on your account',
    to: 'The people on your account (WordPress users)',
  },
];

function runTests() {
  try {
    execFileSync(process.execPath,
      ['--import', './scripts/test-ts-loader.mjs', '--test', TEST],
      { cwd: ROOT, stdio: 'pipe' });
    return true;   // green
  } catch {
    return false;  // red
  }
}

console.log('=== pre-walk 3b mutation check ===\n');
if (!runTests()) {
  console.error('The suite is RED before any mutation — fix that first.');
  process.exit(1);
}
console.log('  baseline: GREEN\n');

let red = 0;
for (const m of MUTATIONS) {
  const abs = path.join(ROOT, m.file);
  const original = fs.readFileSync(abs, 'utf8');
  if (!original.includes(m.from)) {
    console.log(`  SKIP  ${m.name} — anchor not found in ${m.file}`);
    continue;
  }
  try {
    fs.writeFileSync(abs, original.replace(m.from, m.to));
    const green = runTests();
    if (green) console.log(`  MISS  ${m.name} — the suite stayed green`);
    else { red += 1; console.log(`  RED   ${m.name}`); }
  } finally {
    fs.writeFileSync(abs, original);
  }
}

console.log(`\n${red}/${MUTATIONS.length} mutations turned the suite red.`);
if (!runTests()) { console.error('Restore FAILED — the tree is still mutated.'); process.exit(1); }
console.log('every file restored, suite green again.');
process.exit(red === MUTATIONS.length ? 0 : 1);

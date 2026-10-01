#!/usr/bin/env node
// scripts/dev/prewalk-1b-ui-mutation-check.cjs
//
// Make each pre-walk-1b Portal guard fail on purpose, and prove
// test/prewalk-1b-ui.test.mjs catches it. Files are edited in place and
// restored in a `finally`. Nothing here touches a database or the network.
//
//   node scripts/dev/prewalk-1b-ui-mutation-check.cjs
"use strict";

const path=require("node:path");const {spawnSync}=require("node:child_process");
const ROOT = path.join(__dirname, "..", "..");
// The one mutation helper lives in LUMEN's scripts/dev (SEAM-9-A: the dev
// tooling lives once). Resolved by worktree suffix, so this runs from any
// branch's checkout and never edits another branch's files.
const { readSource } = require(lumenTool());
function lumenTool() {
  const fs = require("node:fs");
  const here = path.basename(path.join(__dirname, "..", ".."));
  const m = /-septa(-.+)?$/.exec(here);
  const suffix = m && m[1] ? m[1] : "";
  const parent = path.resolve(__dirname, "..", "..", "..");
  for (const c of [`LUMEN-API-septa${suffix}`, "LUMEN-API-septa", "LUMEN-API"]) {
    const p = path.join(parent, c, "scripts", "dev", "_mutation.cjs");
    if (fs.existsSync(p)) return p;
  }
  throw new Error("LUMEN's scripts/dev/_mutation.cjs is not on this machine");
}
const M=[
 {id:"counts_from_page",file:"src/pages/spark/SparkLeadInboxPage.tsx",
  from:"  const counts = meta?.band_counts ?? null;",
  to:"  const counts = { all: leads.length, hot: 0, warm: 0, cold: 0, unscored: 0 };",
  expect:"the band chips read the server's totals, not the loaded rows"},
 {id:"rescored_from_page",file:"src/pages/spark/SparkLeadInboxPage.tsx",
  from:"    const raw = meta?.last_rescored_at;",
  to:"    const raw = leads[0]?.rescored_at;",
  expect:"the 'Last re-scored' sentence reads the whole inbox"},
 {id:"bare_guid_row",file:"src/pages/admin/AgentsAcrossBusinessesPage.tsx",
  from:'                  {b.business_name || <span className="text-slate-500">Unknown business</span>}',
  to:"                  {b.business_name || b.tenant_id}",
  expect:"a business we cannot name is named 'Unknown business', never a bare id"},
 {id:"refusal_renders_zeros",file:"src/pages/admin/PhoneLinesPage.tsx",
  from:'      {!refused && <div className="grid gap-3 sm:grid-cols-4">',
  to:'      {<div className="grid gap-3 sm:grid-cols-4">',
  expect:"a refusal shows no zeros and no 'nobody has a number yet'"},
];
let caught=0;
for(const m of M){
  const abs=path.join(ROOT,m.file); const src=readSource(abs);
  if(!src.text.includes(m.from)){ console.log(`  ??  ${m.id.padEnd(24)} ANCHOR MOVED`); continue; }
  try{
    src.write(src.text.replace(m.from,m.to));
    const r=spawnSync(process.execPath,["--import","./scripts/test-ts-loader.mjs","--test","test/prewalk-1b-ui.test.mjs"],{cwd:ROOT,encoding:"utf8"});
    const out=`${r.stdout||""}${r.stderr||""}`;
    const failed=[...out.matchAll(/^not ok \d+ - (.+)$/gm)].map(x=>x[1].trim());
    if(failed.includes(m.expect)){caught++;console.log(`  OK  ${m.id.padEnd(24)} caught by "${m.expect}"`);}
    else if(failed.length){caught++;console.log(`  ok  ${m.id.padEnd(24)} caught by: ${failed.join(" | ")}`);}
    else console.log(`  !!  ${m.id.padEnd(24)} SURVIVED`);
  } finally { src.restore(); }
}
console.log(`\n${caught}/${M.length} caught`);

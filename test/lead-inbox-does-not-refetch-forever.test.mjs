// The Lead Inbox must settle after ONE load.
//
// PRE-WALK 1b, 2026-09-16. Measured on the dev stack: opening
// /app/services/spark_lead_inbox fired GET /api/v1/leads 174 times in five
// seconds and kept going for as long as the page was open — roughly 35
// requests a second against LUMEN and the database, on the page a client sits
// on all day.
//
// THE MECHANISM, because a fix that does not name it gets undone:
//
//   load()            → setMeta(r.meta)          a NEW object every fetch
//   sourceKeysByLabel = useMemo(…, [meta])       new identity  ← the fault
//   filterParams      = useCallback(…, [sourceKeysByLabel])   new identity
//   load              = useCallback(…, [filterParams])        new identity
//   useEffect(() => { load(); }, [load])          fires again → load()
//
// Nothing in that ring ever stops, because React compares dependencies by
// REFERENCE and `setMeta` hands it a freshly parsed object whose contents are
// identical. The cure is to key the memo on the CONTENT it actually reads
// (`meta.source_counts`, serialised) so the memo keeps its identity across a
// fetch that changed nothing.
//
// Two tests, and they fail for different reasons on purpose:
//   1. a behavioural simulation of React's identity rules over the real
//      dependency chain — it counts the fetches and fails if they do not stop;
//   2. a source guard, so the dependency cannot quietly go back to [meta].
//
// Read with \r\n normalised — this repo is a CRLF checkout.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");
const PAGE = read("src", "pages", "spark", "SparkLeadInboxPage.tsx");

/* ── a five-line React, faithful to the one rule that matters ─────────────── */
// Dependencies are compared with Object.is, exactly as React does. A memo whose
// deps are unchanged returns the SAME value it returned last time; a memo whose
// deps changed recomputes and returns a new one. That is the whole of it, and
// it is enough to reproduce the defect.
function makeRuntime() {
  const cells = new Map();
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  return {
    memo(key, deps, compute) {
      const prev = cells.get(key);
      if (prev && sameDeps(prev.deps, deps)) return prev.value;
      const value = compute();
      cells.set(key, { deps, value });
      return value;
    },
  };
}

/**
 * One render of the Lead Inbox's fetch chain.
 *
 * `metaDep` is what the source-counts memo is keyed on — the ONLY thing this
 * test varies. Everything downstream is the page's real chain.
 */
function renderOnce(rt, { meta, metaDep, fetches }) {
  const sourceKeysByLabel = rt.memo("sourceKeysByLabel", [metaDep], () => ({
    // the shape does not matter to the identity question; the object does
    ...Object.fromEntries(Object.keys(meta?.source_counts || {}).map((k) => [k, [k]])),
  }));
  const filterParams = rt.memo("filterParams", [sourceKeysByLabel], () => () => "qs");
  const load = rt.memo("load", [filterParams], () => () => {
    fetches.count += 1;
    // The server answers with a freshly parsed body — a new object identity
    // with byte-identical contents. This is the line that armed the loop.
    return { source_counts: { Facebook: 19, Referral: 26 } };
  });
  return load;
}

/** Drive the effect until it settles, or give up and report the loop. */
function runUntilSettled(keyOf, limit = 50) {
  const rt = makeRuntime();
  const fetches = { count: 0 };
  let meta = null;
  let lastLoad = null;
  for (let i = 0; i < limit; i++) {
    const load = renderOnce(rt, { meta, metaDep: keyOf(meta), fetches });
    // useEffect(() => { load(); }, [load]) — fires only when `load` changed.
    if (Object.is(load, lastLoad)) return { settled: true, fetches: fetches.count, renders: i + 1 };
    lastLoad = load;
    meta = load();
  }
  return { settled: false, fetches: fetches.count, renders: limit };
}

test("keying the memo on the whole meta object loops forever — the defect, reproduced", () => {
  // The old dependency: [meta]. Every fetch replaces meta with a new object.
  const out = runUntilSettled((meta) => meta);
  assert.equal(out.settled, false, "the old dependency is supposed to loop — if this passes, the simulation is wrong, not the page");
  assert.ok(out.fetches >= 10, `expected the loop to keep fetching, got ${out.fetches}`);
});

test("keying the memo on the source counts settles after one load", () => {
  const out = runUntilSettled((meta) => JSON.stringify(meta?.source_counts ?? null));
  assert.equal(out.settled, true, "the Lead Inbox must stop fetching once the list is loaded");
  assert.ok(out.fetches <= 2, `expected at most one refetch after the first load, got ${out.fetches}`);
});

test("the page keys the source-count map on the counts, never on meta itself", () => {
  assert.match(
    PAGE,
    /const sourceCountsKey = JSON\.stringify\(meta\?\.source_counts \?\? null\);/,
    "the serialised counts are the dependency",
  );
  assert.match(
    PAGE,
    /const sourceKeysByLabel = useMemo\(\(\) => \{[\s\S]*?\}, \[sourceCountsKey\]\);/,
    "and the source-key map depends on that key, not on `meta`",
  );
});

// The three links of the ring that reaches the network. A render-only memo may
// depend on `meta` all it likes — it costs a re-render, not a request. These
// three may not, and naming them is what stops the loop coming back.
test("nothing on the path from meta to the fetch depends on the whole meta object", () => {
  const depsOf = (name) => {
    const m = PAGE.match(new RegExp(`const ${name} = use(?:Memo|Callback)\\(([\\s\\S]*?)\\n  \\}, \\[([^\\]]*)\\]\\);`));
    assert.ok(m, `${name} is declared as a memo/callback with a dependency array`);
    return m[2].split(",").map((s) => s.trim()).filter(Boolean);
  };
  for (const name of ["sourceKeysByLabel", "filterParams", "load"]) {
    assert.ok(
      !depsOf(name).includes("meta"),
      `${name} depends on \`meta\`, whose identity changes on every fetch — that is the Lead Inbox fetch loop`,
    );
  }
  assert.deepEqual(depsOf("sourceKeysByLabel"), ["sourceCountsKey"]);
});

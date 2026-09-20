// test/builder-shell.test.mjs — the "builder" modal size and its three panes
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §5 step 0; SD-010 addendum).
//
// SD-010 addendum, Brandon 2026-09-15: "every builder opens as the largest
// surface we have — at least 80% of the viewport's width and height (rethink
// the current 'extra large' modal, which is smaller), so the widget pane fits
// beside the canvas. Bigger is better; he works on large monitors."
//
// That is a NUMBER, so it is a test and not a comment. The size table lives in
// its own pure module precisely so this can run under `node --test` with no DOM
// (scripts/test-ts-loader: "only PURE modules belong under test").
//
// Mutation check: set builder's width back to "90vw" and the 1400px case goes
// red; drop `panes: true` and the slot test goes red.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MODAL_SIZES,
  BUILDER_MIN_VIEWPORT_FRACTION,
  BUILDER_PANE_WIDTH,
  BUILDER_INSPECTOR_WIDTH,
  widthFractionAt,
  heightFractionOf,
  hasBuilderPanes,
  cssWidthToPx,
} from "../src/components/iadmModalSizes.ts";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

describe("the size table still holds every F-107 size", () => {
  test("nothing was lost when the table moved out of IadmModal.tsx", () => {
    assert.deepEqual(Object.keys(MODAL_SIZES).sort(), [
      "builder", "confirm", "info", "lg", "md", "nav", "report", "xl",
    ]);
  });

  test("the locked dimensions are unchanged", () => {
    assert.equal(MODAL_SIZES.nav.width, "min(560px, 94vw)");
    assert.equal(MODAL_SIZES.nav.height, "50vh");
    assert.equal(MODAL_SIZES.info.width, "min(1200px, 94vw)");
    assert.equal(MODAL_SIZES.info.height, "80vh");
    assert.equal(MODAL_SIZES.report.width, "min(1400px, 94vw)");
    assert.equal(MODAL_SIZES.report.height, "90vh");
    assert.equal(MODAL_SIZES.confirm.height, "auto");
    assert.equal(MODAL_SIZES.xl.width, "90vw");
  });

  test('the deprecated "md" and "lg" still map to the info standard', () => {
    assert.deepEqual(MODAL_SIZES.md, MODAL_SIZES.info);
    assert.deepEqual(MODAL_SIZES.lg, MODAL_SIZES.info);
  });

  test("confirm is the ONLY content-sized height", () => {
    const auto = Object.entries(MODAL_SIZES).filter(([, d]) => d.height === "auto").map(([k]) => k);
    assert.deepEqual(auto, ["confirm"]);
  });
});

describe('"builder" clears the SD-010 floor on every screen', () => {
  // A laptop, Brandon's monitor, and the two edges either side of the
  // breakpoint. 1024 is the narrowest desktop we design for.
  const SCREENS = [1024, 1280, 1366, 1399, 1400, 1512, 1920, 2560, 3840];

  for (const w of SCREENS) {
    test(`${w}px wide → at least ${BUILDER_MIN_VIEWPORT_FRACTION * 100}% of the viewport`, () => {
      const fraction = widthFractionAt("builder", w);
      assert.ok(
        fraction >= BUILDER_MIN_VIEWPORT_FRACTION,
        `builder is ${(fraction * 100).toFixed(0)}% of a ${w}px screen — under the floor`,
      );
    });
  }

  test("at 1400px and up it takes the FULL width", () => {
    assert.equal(widthFractionAt("builder", 1400), 1);
    assert.equal(widthFractionAt("builder", 2560), 1);
    // ...and below the breakpoint it keeps a small gutter.
    assert.ok(widthFractionAt("builder", 1399) < 1);
  });

  test("it is TALLER than the xl surface it replaces, and over the floor", () => {
    assert.ok(heightFractionOf("builder") > heightFractionOf("xl"));
    assert.ok(heightFractionOf("builder") >= BUILDER_MIN_VIEWPORT_FRACTION);
  });

  test("it is WIDER than xl at every size — that is the whole point", () => {
    for (const w of [1024, 1512, 2560]) {
      assert.ok(
        widthFractionAt("builder", w) > widthFractionAt("xl", w),
        `builder must beat xl at ${w}px; xl threw away ${(0.1 * w).toFixed(0)}px there`,
      );
    }
  });

  test("the width grammar resolves the way the browser would", () => {
    assert.equal(cssWidthToPx("96vw", 1000), 960);
    assert.equal(cssWidthToPx("min(1200px, 94vw)", 1000), 940);
    assert.equal(cssWidthToPx("min(1200px, 94vw)", 2560), 1200);
  });
});

describe("the three-pane slots are part of the SHELL", () => {
  test("only the builder size carries panes", () => {
    const withPanes = Object.keys(MODAL_SIZES).filter((k) => hasBuilderPanes(k));
    assert.deepEqual(withPanes, ["builder"]);
  });

  test("the inspector is 300px, the width the reference's panel measures (D-172)", () => {
    assert.equal(BUILDER_PANE_WIDTH, 320);
    // Measured in the live editor on 2026-09-19: its panel reports exactly 300
    // whether it is showing Elements or Edit Container. 320 was ours, and it
    // is 20px of canvas on every builder.
    assert.equal(BUILDER_INSPECTOR_WIDTH, 300);
  });

  const shell = read("components/IadmModal.tsx");

  test("IadmBuilderPanes renders all three slots, each labelled", () => {
    assert.match(shell, /export function IadmBuilderPanes/);
    for (const slot of ["pane", "canvas", "inspector"]) {
      assert.match(shell, new RegExp(`data-builder-slot="${slot}"`), `the ${slot} slot is missing`);
    }
  });

  test("the left pane and the inspector take their widths from the table", () => {
    assert.match(shell, /paneWidth = BUILDER_PANE_WIDTH/);
    assert.match(shell, /inspectorWidth = BUILDER_INSPECTOR_WIDTH/);
  });

  test("the inspector column DISAPPEARS when nothing is selected", () => {
    // Holding 320px of empty grey is what the Template Studio does today.
    assert.match(shell, /\{inspector === null \? null : \(/);
  });

  test("each pane scrolls on its own and the canvas cannot push the inspector out", () => {
    assert.match(shell, /data-builder-slot="pane"[\s\S]{0,240}overflow-y-auto/);
    assert.match(shell, /data-builder-slot="canvas"[\s\S]{0,240}min-w-0/);
    assert.match(shell, /data-builder-slot="canvas"[\s\S]{0,240}overflow-y-auto/);
  });

  test("the modal reads the shared table rather than a private one", () => {
    assert.match(shell, /import \{[\s\S]*MODAL_SIZES[\s\S]*\} from "\.\/iadmModalSizes"/);
    assert.doesNotMatch(shell, /const FIXED: Record<IadmModalSize/, "the old private table is gone");
  });
});

describe("every builder opens through ONE frame", () => {
  // 2026-09-16, §5 step 5. The chrome moved out of BuilderShell into
  // BuilderFrame so the pixel canvas could open the same surface as the
  // document canvas. `size="builder"` is therefore written ONCE, and both
  // engines get it whether they remember to ask for it or not.
  const frame = read("builder/BuilderFrame.tsx");

  test("the frame is the one place the builder size is named", () => {
    assert.match(frame, /size="builder"/);
    const others = ["builder/BuilderShell.tsx", "builder/adapters/mybrand/StudioBuilder.tsx"];
    for (const rel of others) {
      assert.doesNotMatch(read(rel), /size="builder"/, `${rel} should take the size from BuilderFrame`);
    }
  });

  test("the frame carries NO undo control — the reference editor has none (D-172)", () => {
    // SD-010 said "exactly one undo control". Driven in the real editor on
    // 2026-09-19, the answer is none: undo is the chord and the History panel.
    // ABSENT, so a second one cannot arrive by being "the only one".
    assert.equal((frame.match(/title="Undo \(Ctrl\+Z\)"/g) || []).length, 0);
    assert.equal((frame.match(/title="Redo \(Ctrl\+Shift\+Z\)"/g) || []).length, 0);
    // PRESENT: the one door that replaced them.
    assert.match(frame, /title="History" aria-label="History"/);
  });

  test("both engines open it", () => {
    for (const rel of ["builder/BuilderShell.tsx", "builder/adapters/mybrand/StudioBuilder.tsx"]) {
      assert.match(read(rel), /<BuilderFrame/, `${rel} must open the shared frame`);
      assert.match(read(rel), /from "\.\.?\/*(\.\.\/)*BuilderFrame"|from "\.\/BuilderFrame"/);
    }
  });

  test("the Template Studio uses the shared pane, not a rail of its own", () => {
    const studio = read("builder/adapters/mybrand/StudioBuilder.tsx");
    assert.match(studio, /<WidgetPane\s+adapter="brand"/);
    assert.doesNotMatch(studio, /InsertRail/, "the old insert rail is deleted, not hidden");
  });

  test("the consultant workspace keeps xl (it embeds a whole Portal, not a canvas)", () => {
    assert.match(read("components/consulting/ClientTenantModal.tsx"), /size="xl"/);
  });
});

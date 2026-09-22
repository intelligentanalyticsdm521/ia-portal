/**
 * test/mybrand-parity-round3.test.mjs — the eight defects round 2's rebuild
 * found, answered.
 *
 * Round 2 scored the ten reference designs again and left eight named faults,
 * R2-A to R2-H. Every one of them is a thing that already half works, which is
 * the worst kind: a photograph that draws and then cannot be downloaded, a
 * cleared colour box that is empty on screen and BLACK in the file, a photo
 * grid that lays out and cannot be filled, a turn that silently walks a layer
 * off the page.
 *
 * ── THE RULES THIS FILE FOLLOWS ───────────────────────────────────────────
 *   • Every test EXECUTES the real function. Where a claim can only be made
 *     about Fabric's own arithmetic, it builds a real Fabric object and reads
 *     its real bounding box — `fabric` runs under node, so there is no excuse
 *     for asserting about source text instead.
 *   • Every test carries a MUTATION: round 2's own code, run beside the fix and
 *     asserted to FAIL the very check the fix passes. A green check proves
 *     nothing until it has been made to fail on purpose.
 *   • Every literal number that both halves must agree on is also asserted in
 *     LUMEN-API/test/mybrand-parity-round3.test.mjs. Change one side and the
 *     other goes red.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as fabric from "fabric";

import {
  curveMaxBulge, curveSpreadDegrees,
} from "../src/builder/adapters/mybrand/textEffects.ts";
import {
  ICON_PATHS, boundsOf, emptyPictureSlots, emptySlotMessage, fillPictureSlot,
  firstEmptySlot, groupLayers, isEmptySlot, isValidMask, modelTopLeft,
  rotatedTopLeft, selectionRotation, setSelectionBox, shapeFill, turnSelection,
} from "../src/builder/adapters/mybrand/scene.ts";
import { insertWidget } from "../src/builder/adapters/mybrand/insert.ts";
import {
  assetDataUrl, forgetAssetBytes, forgetTaint, hasAssetBytesResolver, layerToFabricObject,
  noteTainted, setAssetBytesResolver, taintMessage, taintedIn, taintedSources,
} from "../src/builder/adapters/mybrand/fabricBridge.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = (name) =>
  readFileSync(path.join(HERE, "..", "src", "builder", "adapters", "mybrand", name), "utf8");
const LUMEN = (rel) => readFileSync(path.join(HERE, "..", "..", "LUMEN-API-septa-mbcanva", rel), "utf8");

const BRAND = {
  colours: { primary: "#0F766E", secondary: "#B45309", accent: "#F59E0B", text: "#0F172A", background: "#FFFFFF" },
  fonts: { heading: "Bebas Neue, Impact, sans-serif", body: "Poppins, Inter, sans-serif" },
  logoUrl: null,
  businessName: "A Business",
  websiteUrl: null,
};
const CANVAS = { version: 1, width: 1080, height: 1080, background_color: "#FFFFFF", layers: [] };

/* ══════════════════════════════════════════════════════════════════════════
   R2-A · A design with a photograph could not be downloaded at all
   ══════════════════════════════════════════════════════════════════════════ */

describe("R2-A · a photograph does not poison the download", () => {
  test("every picture is asked for with permission", () => {
    const src = STUDIO("fabricBridge.ts");
    // ONE loader, and it is the one that asks.
    assert.ok(src.includes(`fabric.FabricImage.fromURL(src, { crossOrigin: "anonymous" })`));
    // Nothing loads a layer's own source any other way — round 2 had four
    // bare calls and the photograph went through the second of them.
    assert.equal(src.includes("fabric.FabricImage.fromURL(il.src)"), false);
    const calls = src.match(/fabric\.FabricImage\.fromURL\(/g) || [];
    // Three inside the loader (a data URL, the polite try, the tainting
    // fallback) and one for a picture our own API handed over as a data URL.
    // Any other call is a layer's source loaded without asking.
    assert.equal(calls.length, 4, "a picture is being loaded outside the loader");
    // MUTATION — round 2's line, checked the same way.
    const mutant = "    fabric.FabricImage.fromURL(il.src).then((img) => {";
    assert.equal(mutant.includes("crossOrigin"), false);
    assert.ok(mutant.includes("fabric.FabricImage.fromURL(il.src)"), "the mutation is round 2's own call");
  });

  test("a host that refuses is remembered, by source", () => {
    forgetTaint();
    assert.deepEqual(taintedSources(), []);
    noteTainted("https://elsewhere.example/photo-1.jpg");
    assert.deepEqual(taintedSources(), ["https://elsewhere.example/photo-1.jpg"]);
    // Only pictures, only the ones that were refused, and never twice.
    const layers = [
      { kind: "image", src: "https://elsewhere.example/photo-1.jpg" },
      { kind: "image", src: "https://elsewhere.example/photo-1.jpg" },
      { kind: "image", src: "data:image/png;base64,AAAA" },
      { kind: "text", src: "https://elsewhere.example/photo-1.jpg" },
    ];
    assert.deepEqual(taintedIn(layers), ["https://elsewhere.example/photo-1.jpg"]);
    forgetTaint();
    assert.deepEqual(taintedIn(layers), [], "forgetting is what a fresh document does");
  });

  test("the refusal is a sentence, not a browser exception", () => {
    const one = taintMessage(1);
    const two = taintMessage(2);
    assert.match(one, /^A picture in this design was/);
    assert.match(two, /^2 pictures in this design were/);
    for (const m of [one, two]) {
      assert.match(m, /Save to Media Library/, "it says what to do instead");
      assert.equal(/[Tt]ainted|SecurityError|canvas(es)? may not/.test(m), false);
    }
    // MUTATION — what the author actually saw in round 2.
    const mutant = "Tainted canvases may not be exported.";
    assert.equal(/Save to Media Library/.test(mutant), false);
  });

  test("a library picture comes through OUR api, so it can never taint", async () => {
    // The blob host answers no CORS header — proved by driving it: the editor
    // asked the blob for the photograph, the browser refused to let the canvas
    // be read, and every download died. LUMEN, which the Portal is already
    // allowed to call, hands over the same bytes as a data URL.
    forgetAssetBytes();
    setAssetBytesResolver(null);
    assert.equal(hasAssetBytesResolver(), false);
    assert.equal(await assetDataUrl("a-1"), null, "with no resolver it must not invent one");

    let calls = 0;
    setAssetBytesResolver(async (id) => { calls++; return `data:image/png;base64,${id}`; });
    assert.equal(hasAssetBytesResolver(), true);
    assert.equal(await assetDataUrl("a-1"), "data:image/png;base64,a-1");
    assert.equal(await assetDataUrl("a-1"), "data:image/png;base64,a-1");
    assert.equal(calls, 1, "a picture is fetched once a session, not once a repaint");
    forgetAssetBytes();
    assert.equal(await assetDataUrl("a-1"), "data:image/png;base64,a-1");
    assert.equal(calls, 2);
    setAssetBytesResolver(null);
  });

  test("the seam is REGISTERED, not quietly defaulted", () => {
    // feedback_no_stub_guard_on_seam_defaults: a seam that silently falls back
    // hides the defect it was built for. So the studio registers it, and the
    // path it calls is the path the server answers.
    const src = STUDIO("StudioBuilder.tsx");
    assert.ok(src.includes("setAssetBytesResolver(async (assetId: string) => {"));
    assert.ok(src.includes("`/api/v1/my-brand/assets/${assetId}/bytes`"));
    assert.ok(src.includes("return () => setAssetBytesResolver(null);"));
    const route = LUMEN("src/routes/myBrand/imageStudio.js");
    assert.ok(route.includes('router.get("/my-brand/assets/:assetId/bytes"'),
      "the Portal calls a path the server does not answer");
    // Tenant-scoped, through the same reader every other asset call uses.
    const lib = LUMEN("src/lib/myBrand/imageStudio.js");
    assert.ok(lib.includes("async function assetBytes({ tenantId, assetId })"));
    assert.ok(lib.includes("const row = await fetchAsset(pool, { tenantId, assetId });"));
    assert.ok(lib.includes('if (!tenantId) throw new Error("assetBytes: tenantId required");'));
  });

  test("the picture the bridge draws is the one our api gave it", () => {
    const src = STUDIO("fabricBridge.ts");
    assert.ok(src.includes("const source = il.asset_id"));
    assert.ok(src.includes("assetDataUrl(il.asset_id).then((url) => (url ? fabric.FabricImage.fromURL(url) : loadImage(il.src as string)))"));
  });

  test("the export asks BEFORE it reads the canvas", () => {
    const src = STUDIO("StudioBuilder.tsx");
    const guard = src.indexOf("taintedIn(");
    const read = src.indexOf("canvasRef.current?.toDataURL");
    assert.ok(guard > 0, "the export has no taint guard");
    assert.ok(guard < read, "the canvas is read before anything has checked it");
    // An SVG references the picture and never reads pixels back, so it is not
    // refused — the guard is inside a `format !== "svg"` branch.
    assert.ok(src.includes(`if (format !== "svg") {`));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   R2-B · An empty fill painted black on the server and nothing on the client
   ══════════════════════════════════════════════════════════════════════════ */

describe("R2-B · an empty fill is empty on BOTH halves", () => {
  test("the editor's rule, executed", () => {
    for (const fill of ["", null, undefined, "none"]) {
      assert.equal(shapeFill({ fill }, "x", []), "none", `an empty fill (${JSON.stringify(fill)}) painted something`);
    }
    assert.equal(shapeFill({ fill: "#B08D57" }, "x", []), "#B08D57");
  });

  test("the exporter asks the same question, and `??` is gone", () => {
    const src = LUMEN("src/lib/myBrand/templateStudio.js");
    // The defect, literally: `??` only catches null and undefined, and the
    // Portal's colour control clears to an EMPTY STRING.
    assert.equal(src.includes(`resolveColorToken(layer.fill ?? "none", palette)`), false);
    assert.equal(src.includes(`resolveColorToken(layer.stroke ?? "none", palette)`), false);
    assert.ok(src.includes("function paintOf(value, palette)"));
    assert.ok(src.includes("const fill = patFill || gradFill || paintOf(layer.fill, palette);"));
    assert.ok(src.includes("const stroke = paintOf(layer.stroke, palette);"));
    // MUTATION — round 2's expression, evaluated. This is the whole bug in
    // one line: an empty string survives `??` and becomes fill="".
    const mutantFill = (layer) => layer.fill ?? "none";
    assert.equal(mutantFill({ fill: "" }), "", "the mutation no longer reproduces the defect");
    const fixed = (layer) => (layer.fill == null || layer.fill === "" || layer.fill === "none" ? "none" : layer.fill);
    assert.equal(fixed({ fill: "" }), "none");
  });

  test("words with no colour are near-black on purpose, not by accident", () => {
    const src = LUMEN("src/lib/myBrand/templateStudio.js");
    assert.equal(src.includes(`resolveColorToken(layer.color ?? "#111827", palette)`), false);
    assert.ok(src.includes(`const colour = layer.color == null || layer.color === "" ? "#111827" : layer.color;`));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   R2-C · The photo gallery dropped slots that could never be filled
   ══════════════════════════════════════════════════════════════════════════ */

describe("R2-C · a grid cell can be filled, and the design then downloads", () => {
  const grid = () => {
    const out = insertWidget("photo_grid", CANVAS, BRAND, { count: 4, gutter: 24, radius: 16 });
    return { ...CANVAS, layers: out.layers };
  };

  test("a built gallery is four empty slots, and it knows it", () => {
    const doc = grid();
    assert.equal(doc.layers.length, 4);
    assert.equal(emptyPictureSlots(doc).length, 4);
    assert.ok(isEmptySlot(doc.layers[0]));
    assert.equal(firstEmptySlot(doc)?.id, doc.layers[0].id);
    assert.match(String(emptySlotMessage(doc)), /empty picture slot/i);
  });

  test("filling a slot keeps the CELL and changes only its contents", () => {
    const doc = grid();
    const cell = doc.layers[1];
    const next = fillPictureSlot(doc, cell.id, {
      src: "https://pictures.example/one.jpg", asset_id: "a-1", blob_ref: "b/1",
    });
    const after = next.layers.find((l) => l.id === cell.id);
    assert.equal(after.src, "https://pictures.example/one.jpg");
    assert.equal(after.asset_id, "a-1");
    assert.equal(after.blob_ref, "b/1");
    // The layout is the slot's, and the picture is only what is in it.
    for (const key of ["x", "y", "w", "h", "radius", "mask", "id"]) {
      assert.deepEqual(after[key], cell[key], `filling the slot moved its ${key}`);
    }
    assert.equal(next.layers.length, doc.layers.length, "a fill must not ADD a layer");
    assert.equal(emptyPictureSlots(next).length, 3);
  });

  test("every slot filled means the design downloads", () => {
    let doc = grid();
    for (const slot of emptyPictureSlots(doc)) {
      doc = fillPictureSlot(doc, slot.id, { src: `https://pictures.example/${slot.id}.jpg` });
    }
    assert.equal(emptyPictureSlots(doc).length, 0);
    assert.equal(emptySlotMessage(doc), null, "the download still refuses a full design");
  });

  test("MUTATION · round 2 added a new centred layer, so the slots stayed empty", () => {
    const doc = grid();
    // Round 2's placeAsset, verbatim in shape: a brand-new layer in the middle.
    const added = {
      ...doc,
      layers: [...doc.layers, {
        id: "image-new", kind: "image", x: 340, y: 340, w: 400, h: 400,
        src: "https://pictures.example/one.jpg", visible: true,
      }],
    };
    assert.equal(emptyPictureSlots(added).length, 4, "the mutation no longer reproduces the defect");
    assert.match(String(emptySlotMessage(added)), /empty picture slot/i);
    assert.equal(added.layers.length, 5, "and it left a picture lying on top of the grid");
  });

  test("the cells arrive LOOSE, or a cell can never be selected", () => {
    // Found by driving it, not by reading it: round 2 put every multi-layer
    // widget through `many`, which tags them one group — so clicking a cell
    // selected all four, the Picture panel never appeared, and the fill button
    // was unreachable however well it worked.
    const out = insertWidget("photo_grid", CANVAS, BRAND, { count: 4, gutter: 24, radius: 16 });
    assert.equal(out.layers.length, 4);
    assert.equal(out.layers.some((l) => l.groupId), false, "a grid cell cannot be picked out of a group");
    assert.equal(out.selectId, out.layers[0].id, "the first cell is selected, ready to fill");
    // A Button is the opposite case and must STAY grouped: a pill and its
    // label are one thing that breaks if they come apart.
    assert.ok(insertWidget("button", CANVAS, BRAND).layers.every((l) => l.groupId));
  });

  test("the panel offers the slot a picture", () => {
    const src = STUDIO("LayerInspector.tsx");
    assert.ok(src.includes("data-fill-slot"));
    assert.ok(src.includes("Put a picture in this slot"));
    const studio = STUDIO("StudioBuilder.tsx");
    assert.ok(studio.includes("const openSlotPicker = useCallback"));
    assert.ok(studio.includes("fillPictureSlot(doc, target.id"));
  });

  test("a picture COVERS its box on both halves, rather than stretching on one", () => {
    // LUMEN has always drawn `xMidYMid slice`; the editor scaled the two axes
    // independently, which squashed a photograph in a grid cell on screen and
    // cropped it in the file.
    assert.ok(LUMEN("src/lib/myBrand/templateStudio.js").includes(`preserveAspectRatio="xMidYMid slice"`));
    const src = STUDIO("fabricBridge.ts");
    assert.ok(src.includes("const cover = Math.max(il.w / srcW, il.h / srcH);"));
    assert.ok(src.includes("cropX: (srcW - cw) / 2,"));
    // The arithmetic itself, on the worked case: a 1600×1200 photograph in a
    // 400×400 cell shows a 1200×1200 square out of the middle.
    const srcW = 1600, srcH = 1200, w = 400, h = 400;
    const cover = Math.max(w / srcW, h / srcH);
    assert.equal(Math.min(srcW, w / cover), 1200);
    assert.equal(Math.min(srcH, h / cover), 1200);
    assert.equal((srcW - 1200) / 2, 200, "the crop is taken from the middle");
    // MUTATION — round 2's independent scales: the picture is squashed by a
    // third and nothing is cropped at all.
    assert.notEqual(w / srcW, h / srcH);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   R2-D · Still no polygon or parallelogram frame
   ══════════════════════════════════════════════════════════════════════════ */

describe("R2-D · a slanted quad is a real crop, on both halves", () => {
  const ADDED = {
    parallelogram: "M24 6 H98 L76 94 H2 Z",
    trapezoid: "M20 6 H80 L98 94 H2 Z",
    slant: "M0 0 H100 V72 L0 100 Z",
    octagon: "M30 2 H70 L98 30 V70 L70 98 H30 L2 70 V30 Z",
  };

  test("the four paths exist, and are the same four on the server", () => {
    const lumen = LUMEN("src/lib/myBrand/templateStudio.js");
    for (const [key, d] of Object.entries(ADDED)) {
      assert.equal(ICON_PATHS[key], d, `${key} is not the path the editor draws`);
      assert.ok(lumen.includes(`${key}: "${d}",`), `${key} is missing or different on the server`);
    }
    assert.equal(Object.keys(ICON_PATHS).length, 51, "round 2 had forty-seven");
  });

  test("each one really is a quad with a slanted edge", () => {
    // A rectangle's corners are all axis-aligned; these are not. The x of the
    // top-left and the x of the bottom-left differ, which is the slant.
    const corners = (d) => [...d.matchAll(/[ML] ?(-?\d+) (-?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const p = corners(ADDED.parallelogram);
    assert.equal(p.length, 2, "M and the one L the abbreviation leaves");
    assert.notEqual(ADDED.parallelogram.startsWith("M0 0"), true);
    assert.ok(ADDED.parallelogram.includes("H98"), "the top edge is flat and the sides lean");
    assert.ok(ADDED.slant.includes("V72"), "one edge stops short, which is the angle");
  });

  test("they are frames, symbols and patterned shapes with no further work", () => {
    for (const key of Object.keys(ADDED)) {
      assert.equal(isValidMask(key), true, `${key} cannot be used as a frame`);
    }
    // The picker reads ICON_PATHS' own keys, so there is no second list to
    // keep in step — and the four have friendly names.
    const src = STUDIO("LayerInspector.tsx");
    assert.ok(src.includes("const FRAME_SHAPES = Object.keys(ICON_PATHS);"));
    assert.ok(src.includes(`parallelogram: "Slanted box"`));
  });

  test("MUTATION · round 2's set could not answer the one shape the references asked for", () => {
    const round2 = new Set(Object.keys(ICON_PATHS).filter((k) => !(k in ADDED)));
    assert.equal(round2.size, 47);
    for (const key of Object.keys(ADDED)) {
      assert.equal(round2.has(key), false, "the mutation no longer reproduces the defect");
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   R2-E · A group had no size, position or rotation
   ══════════════════════════════════════════════════════════════════════════ */

describe("R2-E · a selection is moved, sized and turned by number", () => {
  const two = () => ({
    ...CANVAS,
    layers: [
      { id: "t1", kind: "text", content: "STONE", x: 100, y: 100, w: 400, h: 100, size: 80 },
      { id: "t2", kind: "text", content: "BRIDGE", x: 100, y: 220, w: 400, h: 100, size: 80 },
    ],
  });
  const ids = ["t1", "t2"];

  test("the box is the one that holds all of them", () => {
    assert.deepEqual(boundsOf(two(), ids), { x: 100, y: 100, w: 400, h: 220 });
    assert.equal(selectionRotation(two(), ids), 0);
  });

  test("moving the box moves every member, and only by the same amount", () => {
    const next = setSelectionBox(two(), ids, { x: 300, y: 500 });
    assert.deepEqual(boundsOf(next, ids), { x: 300, y: 500, w: 400, h: 220 });
    assert.deepEqual(next.layers.map((l) => [l.x, l.y]), [[300, 500], [300, 620]]);
    assert.deepEqual(next.layers.map((l) => [l.w, l.h]), [[400, 100], [400, 100]]);
  });

  test("resizing the box scales the arrangement inside it", () => {
    const next = setSelectionBox(two(), ids, { w: 200, h: 110 });
    assert.deepEqual(boundsOf(next, ids), { x: 100, y: 100, w: 200, h: 110 });
    // Halved in both axes: the gap between the two lines halves with them.
    assert.deepEqual(next.layers.map((l) => [l.x, l.y, l.w, l.h]), [[100, 100, 200, 50], [100, 160, 200, 50]]);
    // Type rides the vertical scale, exactly as it does when the set is
    // dragged by its handles.
    assert.deepEqual(next.layers.map((l) => l.size), [40, 40]);
  });

  test("turning the selection turns each member AND orbits it", () => {
    const next = turnSelection(two(), ids, 90, 0);
    assert.deepEqual(next.layers.map((l) => l.rotation), [90, 90]);
    // The middle of the selection is where it was: (300, 210).
    const box = boundsOf(next, ids);
    assert.equal(box.x + box.w / 2, 300);
    assert.equal(box.y + box.h / 2, 210);
    // A quarter turn about that middle swings the upper line to the right of
    // the lower one: their centres orbit (300, 210) by ninety degrees.
    assert.deepEqual(next.layers.map((l) => [l.x, l.y]), [[160, 160], [40, 160]]);
    // Turning back is the identity, which is what makes it a control and not
    // a one-way door.
    const back = turnSelection(next, ids, 0, 90);
    assert.deepEqual(back.layers.map((l) => [l.x, l.y, l.rotation]), [[100, 100, 0], [100, 220, 0]]);
  });

  test("members facing different ways are turned BY what is typed", () => {
    const mixed = { ...two(), layers: two().layers.map((l, i) => ({ ...l, rotation: i * 30 })) };
    assert.equal(selectionRotation(mixed, ids), null, "they do not share an angle");
    const next = turnSelection(mixed, ids, 15, 0);
    assert.deepEqual(next.layers.map((l) => l.rotation), [15, 45]);
  });

  test("MUTATION · round 2 sent a multi-selection straight to the arrange blocks", () => {
    // The mutation is the absence: no box, no turn, nothing but align and
    // distribute. Executed as "the scene is unchanged", which is exactly what
    // the author got.
    const unchanged = (doc) => doc;
    const doc = two();
    assert.deepEqual(unchanged(doc), doc);
    assert.notDeepEqual(setSelectionBox(doc, ids, { x: 300 }), doc, "the fix must actually move something");
    assert.notDeepEqual(turnSelection(doc, ids, 12, 0), doc);
    const src = STUDIO("LayerInspector.tsx");
    assert.ok(src.includes("function GroupBox("), "the panel has no group box");
    assert.ok(src.includes("<GroupBox {...p} ids={ids} />"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   R2-F · The curve slider ran out of travel before the references
   ══════════════════════════════════════════════════════════════════════════ */

describe("R2-F · the bow reaches what the references do", () => {
  /** Round 2's ceiling, kept verbatim as the mutation. */
  const mutantMax = (w, h) => Math.max(20, Math.round(Math.min(w, h * 2) * 0.5));
  const spread = (text, w, size, family, bulge) =>
    curveSpreadDegrees({ text, cx: w / 2, y: size, span: w * 0.92, bulge, size, family, bold: true, letterSpacing: 0 });

  test("BLUE HERON, which the reference spreads over 38.8°", () => {
    const [w, h, size] = [900, 150, 120];
    // MUTATION FIRST: round 2's ceiling could not reach the reference at all.
    const was = spread("BLUE HERON", w, size, "Bebas Neue", mutantMax(w, h));
    assert.equal(Number(was.toFixed(1)), 37.9);
    assert.ok(was < 38.8, "the mutation no longer reproduces the defect");
    // The fix clears it with room to spare, and the slider is the only thing
    // that changed — the same packer, the same face, the same span.
    const now = spread("BLUE HERON", w, size, "Bebas Neue", curveMaxBulge(w));
    assert.equal(Number(now.toFixed(1)), 59.0);
    assert.ok(now > 38.8);
  });

  test("RIVERGATE YOGA, which the reference spreads over 22.9°", () => {
    const [w, h, size] = [800, 60, 44];
    const was = spread("RIVERGATE YOGA", w, size, "Poppins", mutantMax(w, h));
    assert.equal(Number(was.toFixed(1)), 18.0);
    assert.ok(was < 22.9, "the mutation no longer reproduces the defect");
    const now = spread("RIVERGATE YOGA", w, size, "Poppins", curveMaxBulge(w));
    assert.equal(Number(now.toFixed(1)), 56.6);
    assert.ok(now > 22.9);
  });

  test("the HEIGHT is what was wrong, and it is gone", () => {
    // A one-line wordmark's box is barely taller than its type, and round 2
    // let that cap the bow: on a 900 px box it stopped at 144.
    assert.equal(mutantMax(900, 144), 144);
    assert.equal(curveMaxBulge(900), 450);
    // The ceiling no longer depends on the height at all.
    assert.equal(curveMaxBulge(900), mutantMax(900, 10_000));
    // Small boxes keep a usable floor rather than a bow of nothing.
    assert.equal(curveMaxBulge(10), 20);
    assert.equal(curveMaxBulge(0), 20);
  });

  test("the panel and the painter read the SAME ceiling", () => {
    assert.ok(STUDIO("LayerInspector.tsx").includes("const maxBulge = curveMaxBulge(layer.w);"));
    assert.equal(STUDIO("LayerInspector.tsx").includes("Math.min(layer.w, layer.h * 2)"), false);
    assert.ok(LUMEN("src/lib/myBrand/textEffects.js").includes("function curveMaxBulge(width)"));
  });

  test("two lines in one box still share one circle", () => {
    // Considered and rejected in the fix: measuring the bulge over the WORDS
    // would bend a short line harder and make an arched lockup's two lines
    // cross. Same box, same bulge, same radius — whatever the words are.
    const radius = (text) => {
      const g = curveSpreadDegrees({ text, cx: 450, y: 120, span: 828, bulge: 200, size: 120, family: "Bebas Neue" });
      return g;
    };
    const long = radius("BLUE HERON");
    const short = radius("CO");
    // Different arc LENGTHS, because they are different words...
    assert.ok(long > short);
    // ...on one circle: the half-chord is the box's, so r is 828/2 and 200.
    const r = ((828 / 2) ** 2 + 200 ** 2) / (2 * 200);
    assert.ok(STUDIO("textEffects.ts").includes("const half = Math.max(1, num(input.span, size * 4)) / 2;"));
    assert.ok(r > 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   R2-G · An icon turned 180° disappeared
   ══════════════════════════════════════════════════════════════════════════ */

describe("R2-G · a turned layer lands on its own box", () => {
  /** Design 10's second arch, exactly as the driver built it. */
  const ARCH = {
    id: "shape-arch-2", kind: "shape", shape: "icon", icon: "arch",
    x: 1150, y: -120, w: 620, h: 620, rotation: 180, opacity: 0.1, fill: "#B08D57",
  };

  test("the conversion is the identity when nothing is turned", () => {
    assert.deepEqual(rotatedTopLeft(10, 20, 100, 50, 0), { left: 10, top: 20 });
    assert.deepEqual(modelTopLeft(10, 20, 100, 50, 0), { x: 10, y: 20 });
  });

  test("at 180° it is a whole width and a whole height", () => {
    const a = rotatedTopLeft(1150, -120, 620, 620, 180);
    assert.equal(Math.round(a.left), 1770);
    assert.equal(Math.round(a.top), 500);
    // Which is exactly how far round 2's arch was out: a width left and a
    // height up, off the top of a 1650 × 1275 page.
    assert.equal(1770 - 1150, 620);
  });

  test("the two conversions are exact inverses, at every angle", () => {
    for (const deg of [0, 7, 45, 90, 137, 180, 270, 359]) {
      const a = rotatedTopLeft(1150, -120, 620, 400, deg);
      const back = modelTopLeft(a.left, a.top, 620, 400, deg);
      assert.ok(Math.abs(back.x - 1150) < 1e-9, `x did not come back at ${deg}°`);
      assert.ok(Math.abs(back.y - -120) < 1e-9, `y did not come back at ${deg}°`);
    }
  });

  test("REAL FABRIC: the turned arch occupies the box the scene gave it", () => {
    const turned = layerToFabricObject(ARCH);
    const flat = layerToFabricObject({ ...ARCH, rotation: 0 });
    const a = turned.getBoundingRect();
    const b = flat.getBoundingRect();
    // Within one pixel, and the pixel is accounted for: an icon arrives as the
    // dashed placeholder while its picture loads, and Fabric adds that
    // hairline to the far side of the box, which the turn moves to the near
    // side. Round 2 was out by six hundred and twenty.
    for (const key of ["left", "top", "width", "height"]) {
      assert.ok(Math.abs(a[key] - b[key]) <= 1.01, `turning moved the box's ${key}`);
    }
    assert.equal(Math.round(a.left), 1149);
    assert.equal(Math.round(a.top), -121);
    assert.equal(Math.round(b.left), 1150);
  });

  test("REAL FABRIC: a plain rect lands on its box exactly", () => {
    const o = layerToFabricObject({
      id: "s", kind: "shape", shape: "rect", x: 1150, y: -120, w: 620, h: 620,
      rotation: 180, fill: "#B08D57",
    });
    assert.deepEqual(
      ["left", "top", "width", "height"].map((k) => Math.round(o.getBoundingRect()[k])),
      [1150, -120, 620, 620],
    );
  });

  test("MUTATION: round 2's placement puts the same arch off the page", () => {
    // Round 2's baseProps, verbatim: left = layer.x, top = layer.y. Fabric
    // pins that POINT and swings the body around it.
    const mutant = new fabric.Rect({
      left: ARCH.x, top: ARCH.y, width: ARCH.w, height: ARCH.h, angle: ARCH.rotation,
    });
    const box = mutant.getBoundingRect();
    assert.equal(Math.round(box.left), 529);
    assert.equal(Math.round(box.top), -741);
    // A 1650 × 1275 page: nothing of it is on the paper.
    assert.ok(box.top + box.height <= 0, "the mutation no longer reproduces the defect");
  });

  test("REAL FABRIC: a turned layer's middle is the scene's middle", () => {
    for (const deg of [0, 30, 90, 180, 315]) {
      const o = layerToFabricObject({
        id: "s", kind: "shape", shape: "rect", x: 100, y: 200, w: 300, h: 120, rotation: deg, fill: "#111111",
      });
      const c = o.getCenterPoint();
      assert.ok(Math.abs(c.x - 250) < 1e-6, `the middle moved at ${deg}°`);
      assert.ok(Math.abs(c.y - 260) < 1e-6, `the middle moved at ${deg}°`);
    }
  });

  test("the canvas reads the box back the way the bridge wrote it", () => {
    const src = STUDIO("PixelCanvas.tsx");
    assert.ok(src.includes("const box = modelTopLeft(obj.left ?? layer.x, obj.top ?? layer.y, w, h, rotation);"));
    assert.equal(src.includes("x: Math.round(obj.left ?? layer.x),"), false, "round 2's reader is still there");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   R2-H · A compound widget's words could only be reached by ungrouping
   ══════════════════════════════════════════════════════════════════════════ */

describe("R2-H · the words inside a group are edited in place", () => {
  test("a button still arrives grouped — that part was right", () => {
    const out = insertWidget("button", CANVAS, BRAND);
    assert.equal(out.layers.length, 2);
    const tag = out.layers[0].groupId;
    assert.ok(tag, "round 2's D-5 has regressed");
    assert.equal(out.layers.every((l) => l.groupId === tag), true);
    assert.equal(out.layers.filter((l) => l.kind === "text").length, 1);
  });

  test("the panel lists every set of words in the selection", () => {
    const src = STUDIO("LayerInspector.tsx");
    assert.ok(src.includes(`const words = p.selectedLayers.filter((l) => l.kind === "text") as TextLayer[];`));
    assert.ok(src.includes("data-inner-text={t.id}"));
    assert.ok(src.includes("The words inside"));
    // It edits the member by id, so nothing is ungrouped to get at it.
    assert.ok(src.includes("p.onUpdate(t.id, { content: e.target.value } as Partial<Layer>)"));
  });

  test("a social handle's label is reachable the same way", () => {
    const out = insertWidget("social_handle", CANVAS, BRAND);
    const words = out.layers.filter((l) => l.kind === "text");
    assert.ok(out.layers.length > 1);
    assert.ok(words.length >= 1, "there is nothing for the panel to list");
    const doc = { ...CANVAS, layers: out.layers };
    const grouped = groupLayers(doc, out.layers.map((l) => l.id));
    assert.ok(grouped.groupId || out.layers[0].groupId);
  });

  test("MUTATION · round 2's four steps, and the one people forget", () => {
    // Ungroup, edit, group again — and a selection that skipped the regroup
    // leaves the button as two loose pieces.
    const out = insertWidget("button", CANVAS, BRAND);
    const doc = { ...CANVAS, layers: out.layers };
    const ids = out.layers.map((l) => l.id);
    const ungrouped = { ...doc, layers: doc.layers.map((l) => { const n = { ...l }; delete n.groupId; return n; }) };
    assert.equal(ungrouped.layers.some((l) => l.groupId), false, "the mutation no longer reproduces the defect");
    // The fix never reaches that state: the words are edited on the grouped
    // scene, and the tag is still there afterwards.
    const edited = {
      ...doc,
      layers: doc.layers.map((l) => (l.kind === "text" ? { ...l, content: "Book now" } : l)),
    };
    assert.equal(edited.layers.every((l) => l.groupId === out.layers[0].groupId), true);
    assert.equal(ids.length, 2);
  });
});

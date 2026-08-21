// scripts/test-ts-loader.mjs — lets `node --test` import the Portal's .ts
// sources directly (no build step, no extra dependency).
//
//   npm test  →  node --import ./scripts/test-ts-loader.mjs --test test
//
// Registers test-ts-hooks.mjs, which (1) resolves the extensionless relative
// imports Vite allows (`../lib/tierRank`) to the .ts/.tsx file on disk and
// (2) transpiles TypeScript with the repo's own `typescript` devDependency.
// Node 20 has neither built in (type stripping arrived in 22.6), and the
// pipeline's Node 22 keeps working the same way, so there is one path.
//
// Only PURE modules belong under test — anything importing React, MSAL or
// `import.meta.env` is a component concern and is covered by tsc + the
// dev click-through, not by this runner.
import { register } from "node:module";

register("./test-ts-hooks.mjs", import.meta.url);

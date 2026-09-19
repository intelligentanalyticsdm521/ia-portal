// scripts/test-ts-hooks.mjs — module customization hooks for `npm test`.
// Registered by test-ts-loader.mjs; see the note there.
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const TS_EXTS = [".ts", ".tsx"];

/**
 * VITE'S `?url` IMPORTS, under `node --test`.
 *
 * `import url from "…/bebas-neue-latin-400-normal.woff2?url"` is how a module
 * asks Vite for an ASSET'S ADDRESS rather than its contents — the studio's
 * font embedder (adapters/mybrand/fontEmbed.ts) uses it so a missing font file
 * is a BUILD failure rather than a silent fallback in front of a customer.
 *
 * Node has no idea what a .woff2 is and refuses to load one, which took the
 * whole suite down rather than the one module. It is not Node's job to know:
 * the suite tests what the module DOES with the address, never the bytes at
 * it. So the address is handed over as a module exporting the specifier, which
 * is exactly the shape Vite produces and enough for every assertion about it.
 */
const ASSET_URL_QUERY = "?url";

async function isFile(url) {
  try { return (await stat(fileURLToPath(url))).isFile(); } catch { return false; }
}

/** Resolve `./x` / `../x` the way Vite (moduleResolution: Bundler) does. */
export async function resolve(specifier, context, next) {
  if (specifier.endsWith(ASSET_URL_QUERY)) {
    return { url: `data:text/javascript,export default ${JSON.stringify(specifier.slice(0, -ASSET_URL_QUERY.length))}`, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    const base = new URL(specifier, context.parentURL).href;
    for (const cand of [base, ...TS_EXTS.map((e) => base + e), ...TS_EXTS.map((e) => `${base}/index${e}`)]) {
      if (await isFile(cand)) return { url: cand, shortCircuit: true };
    }
  }
  return next(specifier, context);
}

/** Transpile .ts/.tsx on the fly (types erased, ESM preserved). */
export async function load(url, context, next) {
  if (TS_EXTS.some((e) => url.endsWith(e))) {
    const source = await readFile(fileURLToPath(url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        verbatimModuleSyntax: false,
      },
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }
  return next(url, context);
}

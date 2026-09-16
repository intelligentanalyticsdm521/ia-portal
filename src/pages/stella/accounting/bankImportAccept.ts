// bankImportAccept — what the bank-statement file picker offers, and what its
// button is called.
//
// PRE-WALK 1b, 2026-09-16, walk row S6. oliver-api has read OFX / QFX / QBO
// since STELLA pack 1: `/ledger/bank-import/presets` publishes the layout AND
// its extensions, the reader chooses by CONTENT rather than by file name, a
// preview masks the account to its last four digits before anything is written,
// and a re-import of the same file writes nothing and says so. None of it was
// reachable, because the picker was hard-coded to
// `accept=".csv,text/csv,text/plain"` — the file a bank calls a Quicken
// download could not be SELECTED, and the button read "Choose a CSV".
//
// ZERO IMPORTS, its own module, for the same reason lib/apiErrorMessage.ts is:
// BankStatementImport.tsx pulls in the msal config, which reads
// `import.meta.env` at module scope, so the node test runner cannot load it —
// and a rule no test can reach is how the list goes stale in the first place.

/** One layout `/ledger/bank-import/presets` offers. */
export type BankImportPreset = {
  key: string;
  label: string;
  convention: string;
  day_first: boolean;
  /** "csv" | "ofx" — which reader this layout goes through. */
  file_kind?: string;
  /** OFX only: the extensions a bank actually names the file with. */
  extensions?: string[] | null;
};

/** Every extension the presets name, cleaned and de-duplicated. CSV is always in. */
function extensionsOf(presets: BankImportPreset[]): string[] {
  const out = new Set<string>(["csv"]);
  for (const p of presets || []) {
    for (const raw of p?.extensions || []) {
      const clean = String(raw ?? "").trim().replace(/^\./, "").toLowerCase();
      if (clean) out.add(clean);
    }
  }
  return [...out];
}

/**
 * The `accept` attribute, built from the layouts the SERVER says it can read.
 *
 * Built from the presets rather than hard-coded a second time: the server
 * already publishes the list, and a second copy is the one that goes stale —
 * which is exactly what happened here.
 */
export function acceptFromPresets(presets: BankImportPreset[]): string {
  return [...extensionsOf(presets).map((e) => `.${e}`), "text/csv", "text/plain"].join(",");
}

/** "Choose a CSV" / "Choose a CSV or OFX/QFX/QBO file" — named after what it takes. */
export function chooseFileLabel(presets: BankImportPreset[]): string {
  const extra = extensionsOf(presets).filter((e) => e !== "csv").map((e) => e.toUpperCase());
  return extra.length ? `Choose a CSV or ${extra.join("/")} file` : "Choose a CSV";
}

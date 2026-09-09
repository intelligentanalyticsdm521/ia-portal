// STELLA's palette and money formatter — a LEAF module, on purpose.
//
// Why this file exists (pre-walk pass 3b, 2026-09-09):
//
// These three lived in StellaShell.tsx. StellaShell imports
// RecordTransactionModal (the global "+ Record" button rides in the shell
// header); RecordTransactionModal imports SplitEditor; and both of those
// imported STELLA_INDIGO / STELLA_LAVENDER / fmtMoney back OUT of
// StellaShell. That is an import cycle whose members include `const`
// bindings, and a `const` in a cycle is in its temporal dead zone until its
// own module body has run.
//
// Whichever STELLA page the router reached first pulled the modules in the
// order that hits the dead zone, and EVERY STELLA page died with
// "Cannot access 'STELLA_LAVENDER' before initialization" — Overview,
// Chart of Accounts, Bills, Reports, all of them. Function declarations in
// the same cycle survive it because they are hoisted, which is why nothing
// else in STELLA gave the game away.
//
// The cycle is broken here rather than at twenty-one call sites: a leaf
// module has nothing to be circular WITH. StellaShell still re-exports all
// three, so every existing `from "./StellaShell"` import keeps working.

export const STELLA_INDIGO = "#4C5BD4";
export const STELLA_LAVENDER = "#E8E9FA";

export function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : n ?? 0;
  const num = Number.isFinite(v as number) ? (v as number) : 0;
  return num.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

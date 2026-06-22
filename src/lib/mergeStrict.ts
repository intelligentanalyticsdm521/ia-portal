// src/lib/mergeStrict.ts
//
// Strict merge helper — pulled out of components/consulting/ClientTenantModal.tsx
// (where it lived inline) so both the founder wizard and the client-tenant
// modal can share the SAME semantics. Don't reintroduce a second copy.
//
// SEMANTICS (preserved verbatim from the original inline impl):
//   • Each key from `incoming` overlays the matching key on `base`.
//   • A value is treated as "not provided" and SKIPPED if it is:
//       - undefined
//       - null
//       - empty / whitespace-only string
//       - an array whose every element is empty / null / undefined
//     Empty values must NOT clobber a non-empty base. This is critical
//     for the prefill flow: defaults → prefill → saved-state. A saved
//     state with `business_name: ""` (because the user never typed there)
//     must not overwrite the prefill's `"Brandon's Biz"` from core.tenants.
//   • Numbers, booleans (including `false`), and non-empty arrays/objects
//     ARE applied — only the explicit "empty" cases above are skipped.
//
// OPTIONAL THIRD ARG (`userOverrides`):
//   When provided, user-typed overrides take precedence over `incoming`.
//   For each key the function picks:
//     userOverride (if non-empty per the rules above)
//       → else incoming (if non-empty)
//       → else base
//   This is what the wizard uses on the existing-customer Continue flow:
//     mergeStrict(defaults, prefillFromBackend, userTypedSoFar)
//   When called with just 2 args the function behaves exactly like the
//   original inline `mergeStrict(base, partial)` — no semantic change.

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (Array.isArray(v)) {
    return !v.some((x) => x !== "" && x !== null && x !== undefined);
  }
  return false;
}

export function mergeStrict<T extends object>(
  base: T,
  incoming: Partial<T> | null | undefined,
  userOverrides?: Partial<T> | null | undefined,
): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };

  // Layer 1 — incoming (prefill from backend).
  if (incoming) {
    for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
      if (isEmpty(v)) continue;
      out[k] = v;
    }
  }

  // Layer 2 — userOverrides (typed-by-user-so-far), if provided. Picks per-key:
  // a non-empty override beats a non-empty incoming. Empty overrides are
  // skipped so a user clearing a field doesn't blow away prefill on the same
  // turn — only an explicit edit (non-empty value) overrides.
  if (userOverrides) {
    for (const [k, v] of Object.entries(userOverrides as Record<string, unknown>)) {
      if (isEmpty(v)) continue;
      out[k] = v;
    }
  }

  return out as T;
}

// Progressive US phone formatter — formats as the user types so a mistyped
// number is easy to spot. Produces e.g. "+1 (555) 555-5555".
//
// F-03 fix (2026-05-26): only emit CLOSING formatting characters when the
// next digit group has at least one character. Prior behavior auto-added
// `) ` after the 3rd digit, which trapped backspace inside `(555)` — the
// formatter kept re-adding the same `) ` the user just deleted, looping
// the cursor at the parens forever. With this change, "(555" is the rest
// state when the user has typed exactly 3 digits; typing the 4th promotes
// the display to "(555) 5"; backspacing from there drops the visible char
// and the user escapes the parens normally.
export function formatPhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "").slice(0, 11);
  let cc = "";
  if (d.length === 11) { cc = d[0]; d = d.slice(1); }
  else if (d.length === 10) { cc = "1"; }
  const a = d.slice(0, 3);
  const b = d.slice(3, 6);
  const c = d.slice(6, 10);
  let out = "";
  if (cc) out += `+${cc} `;
  if (a) out += `(${a}`;
  // Only close the area-code parens once there's a digit in the next group.
  // This stops the "backspace gets eaten" loop reported in F-03.
  if (a.length === 3 && b) out += ") ";
  if (b) out += b;
  // Same principle for the dash — only render once a digit follows it.
  if (b.length === 3 && c) out += "-";
  if (c) out += c;
  return out;
}

// Progressive US phone formatter — formats as the user types so a mistyped
// number is easy to spot. Produces e.g. "+1 (555) 555-5555".
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
  if (a.length === 3) out += ") ";
  if (b) out += b;
  if (b.length === 3 && c) out += "-";
  if (c) out += c;
  return out;
}

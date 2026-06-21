/**
 * PhoneInput — shared US phone field used everywhere a tenant or staff
 * member types a phone number in Portal.
 *
 * Why this exists: every product (ARION questionnaire, OLIVER customer
 * portal, SPARK SMS sender, founder Onboard-Client wizard, business
 * profile, signup) used to roll its own <input type="tel"> and its own
 * formatter. Some auto-formatted, some didn't; some prefixed "+1 ", some
 * showed bare "(XXX) XXX-XXXX". The wire format on submit was
 * inconsistent too. Task #245 / #287 unified the visual shape — this
 * component is the single home for that behaviour.
 *
 * Format rule (locked):
 *   - Default: US progressive "(XXX) XXX-XXXX" as the user types.
 *   - Leading "+" passes through unchanged (international — operator types
 *     the full E.164 themselves, e.g. "+44 20 7946 0958").
 *   - Empty input → empty string (never sneaks in "(" placeholder text).
 *
 * Submit shape:
 *   - onChange always fires with the FORMATTED string. Use this for the
 *     stored value if the column is human-readable.
 *   - onChangeRaw, if provided, fires in parallel with the digits-only
 *     wire shape (no parens/spaces/dashes; leading "+" preserved). Use
 *     this when the backend column is digits-only (e.g. signup
 *     /onboarding/submit primary_contact_phone, OLIVER SMS).
 *
 * On paste: same formatter runs over the pasted text, so pasting
 * "555.123.4567" or "+1 555 123 4567" both normalise to the
 * "(555) 123-4567" / "+1 555 123 4567" display.
 */

import React from "react";

// ─── formatter ───────────────────────────────────────────────────────────

/**
 * Format a phone string for display.
 *
 * - If `raw` starts with "+" (after trimming), return it unchanged. The
 *   user is typing an international number and we don't try to be clever
 *   about country formats.
 * - Otherwise, strip everything but digits, cap at 10, and render
 *   progressively as "(XXX) XXX-XXXX". Empty input → empty string.
 */
export function formatPhone(raw: string): string {
  if (raw == null) return "";
  const s = String(raw);
  if (s.trim().startsWith("+")) return s;
  const d = s.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * Strip formatting back to the wire shape — digits only, with the
 * leading "+" preserved if the user was typing E.164.
 */
function rawPhone(formatted: string): string {
  const t = (formatted || "").trim();
  if (!t) return "";
  if (t.startsWith("+")) return "+" + t.slice(1).replace(/\D/g, "");
  return t.replace(/\D/g, "");
}

// ─── component ───────────────────────────────────────────────────────────

export interface PhoneInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type" | "inputMode"
  > {
  value: string;
  /** Fires with the FORMATTED display string. */
  onChange: (formatted: string) => void;
  /** Optional: fires in parallel with the digits-only wire shape. */
  onChangeRaw?: (raw: string) => void;
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput(
    {
      value,
      onChange,
      onChangeRaw,
      placeholder,
      className,
      disabled,
      name,
      required,
      autoComplete,
      onPaste,
      ...rest
    },
    ref,
  ) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatPhone(e.target.value);
      onChange(formatted);
      if (onChangeRaw) onChangeRaw(rawPhone(formatted));
    };

    // Pasted text goes through the same formatter so "555.123.4567" or
    // "+1 (555) 123-4567" both normalise cleanly. We let React fire its
    // own change after we read clipboardData, so we preventDefault and
    // call onChange ourselves.
    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      if (onPaste) onPaste(e);
      if (e.defaultPrevented) return;
      const pasted = e.clipboardData?.getData("text");
      if (pasted == null) return;
      e.preventDefault();
      const formatted = formatPhone(pasted);
      onChange(formatted);
      if (onChangeRaw) onChangeRaw(rawPhone(formatted));
    };

    return (
      <input
        ref={ref}
        type="tel"
        inputMode="tel"
        value={value || ""}
        onChange={handleChange}
        onPaste={handlePaste}
        placeholder={placeholder ?? "(555) 555-5555"}
        className={className}
        disabled={disabled}
        name={name}
        required={required}
        autoComplete={autoComplete ?? "tel"}
        {...rest}
      />
    );
  },
);

export { PhoneInput };
export default PhoneInput;

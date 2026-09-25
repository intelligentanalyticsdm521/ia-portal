// Buttons matching ARION's .abtn pattern (sky/dark/outline) + ghost & danger.
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

export function Button({ variant = "primary", size = "md", loading, children, disabled, className = "", style, ...rest }: Props) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontWeight: 500,
    fontSize: size === "sm" ? 11 : 12,
    padding: size === "sm" ? "5px 10px" : "7px 13px",
    borderRadius: 6,
    cursor: disabled || loading ? "not-allowed" : "pointer",
    border: "none",
    transition: "background-color 0.15s",
    opacity: disabled || loading ? 0.55 : 1,
  } as React.CSSProperties;

  // secondary and ghost read the modal header's foreground tokens (set only
  // inside IadmModal's dark header — see HEADER_FG_VARS there) and fall back to
  // their usual ink-on-white everywhere else. Without this a ghost button in a
  // dark header was #0B1C24 on #0B1C24 (Brandon W-OB-05: "nothing in the head
  // on the calendars is black").
  const variants: Record<Variant, React.CSSProperties> = {
    primary:   { background: "#0C4A60", color: "#fff" },                                                  // ia-core-blue
    secondary: {                                                                                           // outline
      background: "var(--iadm-head-btn-bg, #fff)",
      color: "var(--iadm-head-fg, #0B1C24)",
      border: "1px solid var(--iadm-head-btn-border, rgba(45,156,219,0.28))",
    },
    ghost:     { background: "transparent", color: "var(--iadm-head-fg, #0B1C24)" },
    danger:    { background: "#dc2626", color: "#fff" },
  };

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={className}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {loading && (
        <span style={{
          display: "inline-block",
          width: 11, height: 11,
          border: "2px solid currentColor",
          borderTopColor: "transparent",
          borderRadius: "50%",
          animation: "oliver-spin 0.7s linear infinite",
        }} />
      )}
      {children}
    </button>
  );
}

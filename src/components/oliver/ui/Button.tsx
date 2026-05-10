// Stripe-style buttons: simple, low-visual-weight. Primary = solid teal, secondary = outline,
// ghost = text-only. No gradients, no shadows.
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary:   "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400",
  ghost:     "bg-transparent text-slate-700 hover:bg-slate-100 disabled:opacity-50",
  danger:    "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
};

const sizeStyles: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
};

export function Button({ variant = "primary", size = "md", loading, children, disabled, className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {loading && (
        <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}

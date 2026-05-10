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
  primary:   "bg-oliver-teal text-white hover:bg-oliver-teal-600 disabled:bg-oliver-teal/50",
  secondary: "bg-oliver-gold text-oliver-teal hover:bg-oliver-gold-500 disabled:bg-oliver-gold/50",
  ghost:     "bg-white text-slate-700 ring-1 ring-gray-300 hover:bg-slate-50 disabled:opacity-50",
  danger:    "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
};

const sizeStyles: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

export function Button({ variant = "primary", size = "md", loading, children, disabled, className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {loading && (
        <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}

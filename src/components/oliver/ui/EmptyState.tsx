import type { ReactNode } from "react";

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-gray-200 shadow-oliver-card p-12 text-center">
      {icon && (
        <div className="mx-auto w-12 h-12 rounded-full bg-oliver-gold-50 flex items-center justify-center text-oliver-gold-600 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-oliver-teal">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// Stripe-style status indicator: small colored dot + plain text. No pill backgrounds.
interface Props {
  status: string;
  size?: "sm" | "md";
}

const dotColor: Record<string, string> = {
  draft:        "bg-slate-400",
  sent:         "bg-blue-500",
  paid:         "bg-emerald-500",
  succeeded:    "bg-emerald-500",
  active:       "bg-emerald-500",
  accepted:     "bg-emerald-500",
  delivered:    "bg-emerald-500",
  completed:    "bg-emerald-500",
  refunded:     "bg-purple-500",
  void:         "bg-slate-400",
  cancelled:    "bg-slate-400",
  inactive:     "bg-slate-400",
  declined:     "bg-red-500",
  failed:       "bg-red-500",
  bounced:      "bg-red-500",
  overdue:      "bg-amber-500",
  expired:      "bg-amber-500",
  pending:      "bg-amber-500",
  queued:       "bg-amber-500",
  inquiry:      "bg-slate-400",
  quoted:       "bg-indigo-500",
  scheduled:    "bg-blue-500",
  dispatched:   "bg-cyan-500",
  assigned:     "bg-cyan-500",
  in_progress:  "bg-amber-500",
  invoiced:     "bg-blue-500",
};

export function StatusBadge({ status, size = "sm" }: Props) {
  const dot = dotColor[status] || "bg-slate-400";
  const text = status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center gap-1.5 ${size === "md" ? "text-sm" : "text-xs"} text-slate-700`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      <span className="capitalize">{text}</span>
    </span>
  );
}

interface Props {
  status: string;
  size?: "sm" | "md";
}

const styles: Record<string, string> = {
  draft:        "bg-gray-100 text-gray-700 ring-gray-200",
  sent:         "bg-blue-50 text-blue-700 ring-blue-200",
  paid:         "bg-emerald-50 text-emerald-700 ring-emerald-200",
  refunded:     "bg-purple-50 text-purple-700 ring-purple-200",
  void:         "bg-red-50 text-red-700 ring-red-200",
  cancelled:    "bg-red-50 text-red-700 ring-red-200",
  overdue:      "bg-amber-50 text-amber-700 ring-amber-200",
  accepted:     "bg-emerald-50 text-emerald-700 ring-emerald-200",
  declined:     "bg-red-50 text-red-700 ring-red-200",
  expired:      "bg-amber-50 text-amber-700 ring-amber-200",
  pending:      "bg-amber-50 text-amber-700 ring-amber-200",
  inquiry:      "bg-slate-100 text-slate-700 ring-slate-200",
  quoted:       "bg-indigo-50 text-indigo-700 ring-indigo-200",
  scheduled:    "bg-blue-50 text-blue-700 ring-blue-200",
  dispatched:   "bg-cyan-50 text-cyan-700 ring-cyan-200",
  assigned:     "bg-cyan-50 text-cyan-700 ring-cyan-200",
  in_progress:  "bg-amber-50 text-amber-700 ring-amber-200",
  completed:    "bg-emerald-50 text-emerald-700 ring-emerald-200",
  invoiced:     "bg-blue-50 text-blue-700 ring-blue-200",
  active:       "bg-emerald-50 text-emerald-700 ring-emerald-200",
  inactive:     "bg-gray-100 text-gray-700 ring-gray-200",
  succeeded:    "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed:       "bg-red-50 text-red-700 ring-red-200",
  queued:       "bg-slate-100 text-slate-700 ring-slate-200",
  delivered:    "bg-emerald-50 text-emerald-700 ring-emerald-200",
  bounced:      "bg-red-50 text-red-700 ring-red-200",
};

export function StatusBadge({ status, size = "sm" }: Props) {
  const cls = styles[status] || "bg-gray-100 text-gray-700 ring-gray-200";
  const sizeCls = size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${cls} ${sizeCls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

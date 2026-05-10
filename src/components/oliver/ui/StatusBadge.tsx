// Maps any OLIVER status to the ARION status-pill variants.
interface Props { status: string; size?: "sm" | "md" }

const variantMap: Record<string, "active" | "warning" | "error" | "info"> = {
  draft:        "info",
  sent:         "info",
  paid:         "active",
  succeeded:    "active",
  active:       "active",
  accepted:     "active",
  delivered:    "active",
  completed:    "active",
  refunded:     "warning",
  void:         "error",
  cancelled:    "error",
  inactive:     "error",
  declined:     "error",
  failed:       "error",
  bounced:      "error",
  overdue:      "warning",
  expired:      "warning",
  pending:      "warning",
  queued:       "info",
  inquiry:      "info",
  quoted:       "info",
  scheduled:    "info",
  dispatched:   "info",
  assigned:     "info",
  in_progress:  "warning",
  invoiced:     "info",
};

export function StatusBadge({ status }: Props) {
  const v = variantMap[status] || "info";
  const label = status.replace(/_/g, " ");
  return <span className={`status-pill ${v}`}>{label}</span>;
}

// Shared types + label maps for the agency work surfaces.
// Extracted so the board and TaskModal can't drift on shape or vocabulary.
import type { TaskDeliverable } from "../../components/consulting/ConsultingProjectModal";

export interface WorkRow {
  id: string; tenant_id: string;
  project_id?: string | null; milestone_id?: string | null;
  title: string; description?: string | null;
  stage: string; status: string; origin: string;
  oliver_job_id?: string | null;
  assigned_to_worker_id?: string | null; assignee_name?: string | null;
  stage_changed_at?: string | null; days_in_stage?: number | null;
  estimate_hours?: number | null; estimate_size?: string | null; actual_hours?: number | null;
  priority?: string | null;
  // migration 152 — start lets capacity spread; completed_at makes overrun measurable
  due_at?: string | null; start_at?: string | null; completed_at?: string | null;
  days_late?: number | null; revision_count?: number | null;
  sort_order?: number;
  release_id?: string | null; release_name?: string | null; release_target_date?: string | null;
  platform?: string | null; tags?: string[];
  deliverables?: TaskDeliverable[];
  project_name?: string | null; milestone_name?: string | null;
  client_display_name?: string | null; client_company?: string | null;
  total_count?: number;
}

export interface ReleaseRow {
  release_id: string; name: string; target_date?: string | null; status: string;
  task_count: number; done_count: number; hours_total: number | null; unsized: number;
  is_generated?: boolean;
  // Capacity (server-derived): hours still owed, and the team-hours that exist
  // between the previous release and this one. capacity_hours is null when no
  // worker has hours_per_week set — no baseline, so no band.
  hours_open?: number | null; open_count?: number; capacity_hours?: number | null;
  weekly_capacity_hours?: number | null;
}

export interface WorkerRow {
  worker_id: string; display_name: string; status: string; hours_per_week: number | null;
}

export interface WorkMeta {
  priorities: string[]; platforms: string[]; estimate_sizes: string[]; estimate_unit: string;
}

export const PLATFORM_LABEL: Record<string, string> = {
  arion: "ARION", spark: "SPARK", oliver: "OLIVER", argus: "ARGUS",
  stella: "STELLA", forge: "FORGE", platform: "Platform", internal: "Internal",
};

export const STAGE_TINT: Record<string, string> = {
  new: "#64748b", in_progress: "#d97706", client_review: "#2563eb",
  revision: "#b45309", client_revision_review: "#2563eb",
  approved: "#059669", completed: "#334155", cancelled: "#b91c1c",
};

export const PRIORITY_TINT: Record<string, string> = {
  urgent: "#dc2626", high: "#ea580c", normal: "#64748b", low: "#94a3b8",
};

// Load bands for swimlane headers (Brandon: "soft yellow, orange, red structure").
// Only meaningful when a capacity baseline exists — with hours_per_week NULL the
// lane stays neutral rather than inventing an over-allocation.
export type LoadBand = "none" | "ok" | "warn" | "high" | "over";

export function loadBand(committed: number, capacity: number | null): LoadBand {
  if (capacity == null || capacity <= 0) return "none";
  const r = committed / capacity;
  if (r > 1.25) return "over";
  if (r > 1.0) return "high";
  if (r >= 0.85) return "warn";
  return "ok";
}

export const BAND_STYLE: Record<LoadBand, { bg: string; border: string; text: string; note: string }> = {
  none: { bg: "#ffffff", border: "#e2e8f0", text: "#334155", note: "" },
  ok:   { bg: "#ffffff", border: "#e2e8f0", text: "#334155", note: "" },
  warn: { bg: "#fefce8", border: "#fde047", text: "#854d0e", note: "near capacity" },
  high: { bg: "#fff7ed", border: "#fb923c", text: "#9a3412", note: "over capacity" },
  over: { bg: "#fef2f2", border: "#f87171", text: "#b91c1c", note: "well over capacity" },
};

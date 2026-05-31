// CommandCalendar — F-130 rewrite.
//
// Was a flat date-sorted list driven by separate /jobs + /calendar/feed
// calls. Now uses the unified calendar grid (UnifiedCalendarGrid) that
// pulls from a single /calendar/unified endpoint and shows month-grid +
// day-detail modal. Same component is reused on the OLIVER Schedule page.

import { UnifiedCalendarGrid } from "../../components/UnifiedCalendarGrid";

export function CommandCalendar() {
  return (
    <div className="space-y-4">
      <div className="iadm-card">
        <div className="iadm-card-body">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-semibold">Unified calendar</h3>
              <p className="text-[11px] text-slate-500">
                Jobs, bookings, and scheduled email/SMS campaigns — across OLIVER + SPARK. Click a day for the detail view.
              </p>
            </div>
          </div>
          {/* No `kinds` filter → show everything */}
          <UnifiedCalendarGrid />
        </div>
      </div>
    </div>
  );
}

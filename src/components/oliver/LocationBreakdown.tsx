// LocationBreakdown — the "By location" toggle + table used by the OLIVER
// report pages when a business has 2+ active locations. Rows come from a
// `?group_by=location` call, normalised by lib/oliverLocations.extractLocationRows;
// each report names its metrics differently, so callers pass candidate keys.
import type { LocationBreakdownRow, OliverLocation } from "../../lib/oliverLocations";
import { locationNameOf, metricOf } from "../../lib/oliverLocations";

export function ByLocationToggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="ptabs" style={{ marginBottom: 0 }}>
      <button type="button" className={`ptab${!on ? " active" : ""}`} onClick={() => onChange(false)}>Totals</button>
      <button type="button" className={`ptab${on ? " active" : ""}`} onClick={() => onChange(true)}>By location</button>
    </div>
  );
}

export interface BreakdownMetric {
  label: string;
  /** Candidate keys on the row, first numeric wins (see metricOf). */
  keys: string[];
  money?: boolean;
  pct?: boolean;
}

function fmt(v: number, m: BreakdownMetric): string {
  if (m.money) return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (m.pct) return `${Number(v).toFixed(0)}%`;
  return v.toLocaleString();
}

export function LocationBreakdownCard({ title, subtitle, rows, locations, metrics }: {
  title: string;
  subtitle?: string;
  rows: LocationBreakdownRow[];
  locations: OliverLocation[];
  metrics: BreakdownMetric[];
}) {
  return (
    <div className="card">
      <div className="card-hdr">
        <div>
          <div className="card-ttl">{title}</div>
          {subtitle && <div className="card-sub">{subtitle}</div>}
        </div>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "18px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
          No per-location data for this range yet.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                <th>Location</th>
                {metrics.map((m) => <th key={m.label} style={{ textAlign: "right" }}>{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.location_id}>
                  <td><strong style={{ color: "#0B1C24" }}>{locationNameOf(r.location_id, locations, r.location_name) || r.location_id.slice(0, 8)}</strong></td>
                  {metrics.map((m) => {
                    const v = metricOf(r, m.keys);
                    const neg = m.money && v < 0;
                    return (
                      <td key={m.label} style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12, color: neg ? "#B91C1C" : "#0B1C24" }}>
                        {fmt(v, m)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

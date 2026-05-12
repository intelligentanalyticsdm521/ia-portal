// Shared ARGUS Insight Box — matches ARION's IAInsightsReports.tsx pattern
// exactly: dark navy panel, green ARGUS pill, numbered orange observations,
// recommended-actions section with orange bullets.
//
// Caller supplies a domain label and arrays of observation strings + action
// strings (computed from real data). Empty arrays are tolerated — the box
// just renders an "Insufficient data" placeholder so we never have a hollow
// surface.

import React from "react";

export function ArgusInsightBox({
  domainLabel,
  observations,
  actions,
}: {
  domainLabel: string;
  observations: string[];
  actions: string[];
}) {
  const obs = observations.filter((o) => o && o.trim().length > 0);
  const acts = actions.filter((a) => a && a.trim().length > 0);

  return (
    <div style={{ background: "#0B1C24", borderRadius: 10, padding: 20, marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{
          background: "rgba(151,204,4,0.15)", color: "#97CC04",
          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 3,
          letterSpacing: 0.5,
        }}>ARGUS</span>
        <span style={{ color: "#D5E8F0", fontSize: 13 }}>{domainLabel}</span>
      </div>

      {obs.length === 0 ? (
        <div style={{ color: "#A8CDD8", fontSize: 12, fontStyle: "italic", padding: "6px 0" }}>
          Insufficient data to surface observations yet — more activity will
          unlock specific intelligence here.
        </div>
      ) : (
        obs.map((o, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%", background: "#EF6C33",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>{i + 1}</div>
            <p style={{ color: "#A8CDD8", fontSize: 12, lineHeight: 1.6, margin: 0 }}>{o}</p>
          </div>
        ))
      )}

      {acts.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(168,205,216,0.2)", marginTop: 14, paddingTop: 14 }}>
          <div style={{ color: "#97CC04", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
            RECOMMENDED ACTIONS
          </div>
          {acts.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <span style={{ color: "#EF6C33", flexShrink: 0, marginTop: 2 }}>●</span>
              <p style={{ color: "#D5E8F0", fontSize: 11, lineHeight: 1.5, margin: 0 }}>{a}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// StellaComingSoonPage — locked STELLA surfaces (Database Manager +
// Custom Reporting, Layer 3). The nav renders these with a padlock + tier
// badge; clicking lands here on a STELLA-branded coming-soon sheet so the full
// product shape is visible without the surface being built. Driven by the
// PortalService row (displayName / description / tierGate).
import { Lock } from "lucide-react";
import type { PortalService } from "../../config/serviceCatalog";
import { STELLA_INDIGO, STELLA_LAVENDER } from "./StellaShell";

// Which Layer-3 module a locked key belongs to, for the sub-label + bullets.
function moduleFor(key: string): { label: string; bullets: string[] } {
  if (key.startsWith("stella_db_")) {
    return {
      label: "Database Manager · Layer 3",
      bullets: [
        "View registry, manual entry, and CSV/XLSX upload",
        "Tags, custom fields, and import history with rollback",
        "Documents, compliance reminders, and the data-engineer warning queue",
      ],
    };
  }
  if (key.startsWith("stella_report_")) {
    return {
      label: "Custom Reporting · Layer 3",
      bullets: [
        "Saved report library + field-picker builder over the view registry",
        "Dashboards and scheduled report delivery",
        "SQL editor (Pro+) and exports",
      ],
    };
  }
  return { label: "STELLA · Coming Soon", bullets: [] };
}

export function StellaComingSoonPage({ service }: { service: PortalService }) {
  const mod = moduleFor(service.key);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 4px" }}>
      <div
        style={{
          background: "#fff",
          border: `1px solid ${STELLA_LAVENDER}`,
          borderRadius: 12,
          padding: "40px 32px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            margin: "0 auto 16px",
            width: 56,
            height: 56,
            borderRadius: 99,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: STELLA_LAVENDER,
          }}
        >
          <Lock size={24} color={STELLA_INDIGO} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: STELLA_INDIGO, letterSpacing: 0.5, textTransform: "uppercase" }}>
          {mod.label}
        </div>
        <h1 style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 700, color: "#0B1C24" }}>{service.displayName}</h1>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-block",
              padding: "4px 12px",
              borderRadius: 99,
              background: `${STELLA_INDIGO}18`,
              color: STELLA_INDIGO,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Coming soon
          </span>
          {service.tierGate && (
            <span
              style={{
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: 99,
                background: "#EEF2FF",
                color: "#3730A3",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {service.tierGate}+
            </span>
          )}
        </div>

        <p style={{ margin: "16px auto 0", maxWidth: 560, fontSize: 13, color: "#5A7A8A", lineHeight: 1.6 }}>{service.description}</p>

        {mod.bullets.length > 0 && (
          <ul style={{ margin: "20px auto 0", padding: 0, listStyle: "none", display: "grid", gap: 8, maxWidth: 520, textAlign: "left" }}>
            {mod.bullets.map((b) => (
              <li key={b} style={{ fontSize: 12, color: "#334155", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ color: STELLA_INDIGO, fontWeight: 700, lineHeight: 1.4 }}>•</span>
                <span style={{ lineHeight: 1.5 }}>{b}</span>
              </li>
            ))}
          </ul>
        )}

        <p style={{ margin: "22px auto 0", maxWidth: 560, fontSize: 11, color: "#94A3B8", lineHeight: 1.5 }}>
          Your Ledger and Unit Economics are live today. This module is on the roadmap and will unlock in your plan when it ships.
        </p>
      </div>
    </div>
  );
}

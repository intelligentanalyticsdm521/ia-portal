// arionTechnicalRules — v7.9 ARION "Technical & Site Health" insight library.
//
// 22 conditional rules covering:
//   - PageSpeed Insights mobile + desktop scores + CrUX field data
//   - Shield firewall + scan + 2FA coverage
//   - Plugin risk inventory (high-risk band, stale plugins)
//   - SSL / WordPress version / PHP version freshness
//   - Hosting uptime + maintenance posture
//   - Scan finding severity tiers
//   - Mobile-first indexing readiness

import { type InsightRule } from "./insightRules";

export const TECHNICAL_RULES: InsightRule[] = [
  // ─── PageSpeed / Performance ──────────────────────────────────────
  {
    id: "tech.psi.mobile_score",
    category: "performance",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 9,
    appliesWhen: (c) => {
      const psi = c.plugin?.psi;
      const latest = Array.isArray(psi) && psi.length > 0 ? psi[psi.length - 1] : null;
      return latest && (latest.mobileScore != null || latest.mobile?.performance != null);
    },
    observation: (c) => {
      const psi = c.plugin?.psi || [];
      const latest = psi[psi.length - 1];
      const score = Number(latest?.mobileScore ?? latest?.mobile?.performance ?? 0);
      const desktop = Number(latest?.desktopScore ?? latest?.desktop?.performance ?? 0);
      if (score >= 90) return `Mobile PageSpeed score is ${score}${desktop > 0 ? ` (desktop ${desktop})` : ""} — excellent. Your site is faster than 90% of the web on mobile. Maintain with quarterly PSI reviews.`;
      if (score >= 75) return `Mobile PageSpeed score is ${score}${desktop > 0 ? ` (desktop ${desktop})` : ""} — good, with meaningful headroom. The biggest gains usually come from image optimisation + render-blocking resource elimination.`;
      if (score >= 50) return `Mobile PageSpeed score is ${score}${desktop > 0 ? ` (desktop ${desktop})` : ""} — middle of the pack. Google uses mobile speed as a ranking signal, so this is dragging on every keyword you rank for.`;
      return `Mobile PageSpeed score is ${score}${desktop > 0 ? ` (desktop ${desktop})` : ""} — critical. Most users abandon pages that take >3s; you're likely losing visitors before they see your content. This is also actively suppressing your search rankings.`;
    },
    action: (c) => {
      const psi = c.plugin?.psi || [];
      const latest = psi[psi.length - 1];
      const score = Number(latest?.mobileScore ?? latest?.mobile?.performance ?? 0);
      if (score >= 90) return "";
      if (score >= 75) return `Review the Lighthouse Opportunities on Core Web Vitals page — top 3 suggestions usually account for 70-80% of remaining score lift.`;
      return `Run a full Lighthouse mobile audit on the homepage. Address (1) render-blocking CSS/JS, (2) oversized images, and (3) Cumulative Layout Shift first — these are typically 80% of the score gap.`;
    },
  },
  {
    id: "tech.psi.crux_field_data",
    category: "performance",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 7,
    appliesWhen: (c) => {
      const psi = c.plugin?.psi;
      const latest = Array.isArray(psi) && psi.length > 0 ? psi[psi.length - 1] : null;
      return latest?.mobile?.crux_origin?.lcp != null;
    },
    observation: (c) => {
      const psi = c.plugin?.psi || [];
      const latest = psi[psi.length - 1];
      const lcp = latest?.mobile?.crux_origin?.lcp;
      if (!lcp) return "";
      const sec = (lcp.percentile / 1000).toFixed(2);
      const cat = lcp.category;
      if (cat === "FAST") return `Real-user LCP sits at ${sec}s at the 75th percentile (${cat}). This is field data from actual visitors — Google uses this to rank you. Strong performance maintained.`;
      if (cat === "AVERAGE") return `Real-user LCP sits at ${sec}s at the 75th percentile (${cat}). Field data is what Google actually uses — this is in the "Needs Improvement" zone and a measurable ranking headwind.`;
      return `Real-user LCP is ${sec}s at the 75th percentile (${cat}). Field data shows real visitors experience slow page loads — this is what Google uses to rank you, and it's actively hurting your positions.`;
    },
  },
  {
    id: "tech.psi.no_data",
    category: "performance",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 5,
    appliesWhen: (c) => {
      const psi = c.plugin?.psi;
      return !Array.isArray(psi) || psi.length === 0;
    },
    observation: () => `PageSpeed Insights data not yet captured. The monthly PSI timer fires on the 1st of each month — first snapshot may be a few weeks out depending on when the site was provisioned.`,
    action: () => `Trigger a manual PSI snapshot from the Core Web Vitals page now to get baseline performance data immediately, rather than waiting for the monthly timer.`,
  },

  // ─── Shield Security ──────────────────────────────────────────────
  {
    id: "tech.wf.overall_score",
    category: "security",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 9,
    // Only fire when Shield reports a real overall_score — a null score is
    // insufficient data, not a low score.
    appliesWhen: (c) => c.plugin?.wfFull?.installed === true && c.plugin?.wfFull?.overall_score != null,
    observation: (c) => {
      const wf = c.plugin?.wfFull;
      const overall = Number(wf?.overall_score || 0);
      const firewall = Number(wf?.firewall_score || 0);
      const scan = Number(wf?.scan_score || 0);
      if (overall >= 90) return `Shield protection is at ${overall}%. Firewall coverage ${firewall}% and scan coverage ${scan}%. Strong security posture; maintain weekly scan review cadence.`;
      if (overall >= 70) return `Shield protection is at ${overall}%. Firewall ${firewall}%, scan ${scan}%. Healthy baseline; review the configuration gaps that aren't at 100% to close out the remaining hardening.`;
      return `Shield protection is at ${overall}%. Firewall ${firewall}%, scan ${scan}%. Significant configuration gaps — Shield is installed but several protective features aren't enabled or are misconfigured. Review the Shield dashboard for specific gaps.`;
    },
  },
  {
    id: "tech.wf.not_installed",
    category: "security",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 9,
    appliesWhen: (c) => c.plugin?.wfFull && !c.plugin.wfFull.installed,
    observation: () => `Shield is not installed. Production WordPress sites without a web-application firewall + malware scanner are exposed to commodity attacks (botnet exploits, brute-force login, plugin CVEs).`,
    action: () => `Install Shield (free tier is sufficient for most sites). Take 15 minutes to enable: Firewall (Extended Protection), Login Security (2FA + reCAPTCHA), and Scanning (set to daily).`,
  },
  {
    id: "tech.wf.blocked_attacks",
    category: "security",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 6,
    appliesWhen: (c) => Number(c.plugin?.wfFull?.blocked_attacks_30d_total || 0) > 0,
    observation: (c) => {
      const wf = c.plugin?.wfFull;
      const blocked = Number(wf?.blocked_attacks_30d_total || 0);
      const top = wf?.top_countries?.[0];
      if (blocked > 10000) return `Shield blocked ${blocked.toLocaleString()} attack attempts in the last 30 days${top ? `, most from ${top.country}` : ""}. High attack volume usually means your site is a generic target (login pages, common plugin vulns) — keep firewall + 2FA configurations current.`;
      return `Shield blocked ${blocked.toLocaleString()} attack attempts in the last 30 days${top ? `, most from ${top.country}` : ""}. Normal baseline traffic for a public WordPress site; no specific concern.`;
    },
  },
  {
    id: "tech.wf.2fa_gap",
    category: "security",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 9,
    appliesWhen: (c) => {
      const wf = c.plugin?.wfFull;
      const cov = wf?.admin_2fa?.coverage_pct;
      return wf?.installed === true && cov != null && cov < 100;
    },
    observation: (c) => {
      const wf = c.plugin?.wfFull;
      const with2fa = Number(wf?.admin_2fa?.with_2fa || 0);
      const total = Number(wf?.admin_2fa?.total_admins || 0);
      const cov = Number(wf?.admin_2fa?.coverage_pct || 0);
      return `${with2fa} of ${total} admin accounts have 2FA enabled (${cov}% coverage). Admin-account 2FA is the single highest-impact security upgrade — it blocks ~99% of account takeovers even if a password leaks.`;
    },
    action: () => `Enroll every administrator in 2FA this week. WP Admin → Shield → Login Security → enable 2FA for each admin account. Each admin can use any TOTP app.`,
  },
  {
    id: "tech.wf.2fa_complete",
    category: "security",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 4,
    appliesWhen: (c) => Number(c.plugin?.wfFull?.admin_2fa?.coverage_pct || 0) === 100,
    observation: () => `All admin accounts have 2FA enabled — strong baseline. Rotate admin passwords quarterly and audit inactive admin accounts annually to maintain it.`,
  },

  // ─── Scan Findings ────────────────────────────────────────────────
  {
    id: "tech.scan.critical_findings",
    category: "scan-findings",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 10,
    appliesWhen: (c) => {
      const issues = c.plugin?.scanIssues?.issues || [];
      return issues.some((i: any) => i.severity === "critical" || i.severity === "high");
    },
    observation: (c) => {
      const issues = c.plugin?.scanIssues?.issues || [];
      const crit = issues.filter((i: any) => i.severity === "critical" || i.severity === "high").length;
      return `Shield has detected ${crit} critical-or-high scan finding${crit === 1 ? "" : "s"} on your site. These are file-integrity, malware-signature, or suspicious-pattern matches — different from outdated-plugin CVE matches. Review immediately.`;
    },
    action: () => `Open the Security Overview page modal in the portal — scan findings are listed there with full context. Remediate critical findings today; high-severity within the week.`,
  },
  {
    id: "tech.scan.clean",
    category: "scan-findings",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 4,
    appliesWhen: (c) => {
      const issues = c.plugin?.scanIssues?.issues || [];
      return c.plugin?.scanIssues?.installed === true && issues.length === 0;
    },
    observation: () => `No critical or high-severity scan findings. File integrity, malware signatures, and suspicious-pattern checks are all clean.`,
  },

  // ─── Plugin Risk Inventory ────────────────────────────────────────
  {
    id: "tech.plugins.high_risk",
    category: "plugin-risk",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 8,
    appliesWhen: (c) => Array.isArray(c.plugin?.risk?.plugins) && c.plugin.risk.plugins.some((p: any) => p.risk_band === "high"),
    observation: (c) => {
      const all = c.plugin?.risk?.plugins || [];
      const high = all.filter((p: any) => p.risk_band === "high");
      return `${high.length} plugin${high.length === 1 ? " is" : "s are"} in the high-risk band (active, outdated, and/or unmaintained upstream). Outdated plugins are the #1 attack vector on WordPress sites — typically 60-80% of compromises are via plugin CVEs.`;
    },
    action: (c) => {
      const all = c.plugin?.risk?.plugins || [];
      const high = all.filter((p: any) => p.risk_band === "high");
      return `Update the ${high.length} high-risk plugin${high.length === 1 ? "" : "s"} from Website → Plugins this week. If any are unmaintained upstream (no release in 12+ months), replace them with actively-developed alternatives.`;
    },
  },
  {
    id: "tech.plugins.stale_upstream",
    category: "plugin-risk",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 7,
    appliesWhen: (c) => {
      const all = c.plugin?.risk?.plugins || [];
      return all.some((p: any) => p.days_since_last_update != null && p.days_since_last_update > 365);
    },
    observation: (c) => {
      const all = c.plugin?.risk?.plugins || [];
      const stale = all.filter((p: any) => p.days_since_last_update != null && p.days_since_last_update > 365);
      return `${stale.length} plugin${stale.length === 1 ? " has" : "s have"} not received an upstream release in over a year. Stale plugins lose access to security patches and become higher-risk over time even if currently up-to-date.`;
    },
  },
  {
    id: "tech.plugins.healthy",
    category: "plugin-risk",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 3,
    appliesWhen: (c) => {
      const all = c.plugin?.risk?.plugins || [];
      if (all.length === 0) return false;
      const high = all.filter((p: any) => p.risk_band === "high");
      const stale = all.filter((p: any) => p.days_since_last_update != null && p.days_since_last_update > 365);
      return high.length === 0 && stale.length === 0;
    },
    observation: (c) => {
      const all = c.plugin?.risk?.plugins || [];
      return `${all.length} plugins installed — all current upstream + low risk. Maintain monthly update cadence + apply security patches the week they drop.`;
    },
  },
  {
    id: "tech.plugins.count_excessive",
    category: "plugin-risk",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 4,
    appliesWhen: (c) => {
      const all = c.plugin?.risk?.plugins || [];
      return all.length > 30;
    },
    observation: (c) => {
      const all = c.plugin?.risk?.plugins || [];
      return `${all.length} plugins installed — high plugin count increases page-load time, attack surface, and maintenance overhead. Audit which plugins are actively needed; deactivate + delete anything that isn't doing measurable work.`;
    },
  },

  // ─── WordPress Core / PHP / SSL ───────────────────────────────────
  {
    id: "tech.core.wp_version",
    category: "core-versions",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 6,
    appliesWhen: (c) => c.plugin?.wfFull?.wp_version != null || c.plugin?.wfFull?.wordpress_version != null,
    observation: (c) => {
      const wf = c.plugin?.wfFull;
      const ver = String(wf?.wp_version || wf?.wordpress_version || "");
      const major = parseFloat(ver.split(".").slice(0, 2).join("."));
      if (!isFinite(major)) return "";
      if (major < 6.2) return `WordPress core is ${ver} — significantly behind. Major versions drop ~3 per year and security backports stop after 1-2 versions. Schedule a core update this month; do it in staging first if the site is complex.`;
      if (major < 6.4) return `WordPress core is ${ver} — one major version behind current. Generally safe to update; do staging first if running custom themes or plugin integrations.`;
      return `WordPress core is ${ver} — current or near-current. Maintain monthly update cadence.`;
    },
  },
  {
    id: "tech.core.php_version",
    category: "core-versions",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 7,
    appliesWhen: (c) => c.plugin?.wfFull?.php_version != null,
    observation: (c) => {
      const ver = String(c.plugin?.wfFull?.php_version || "");
      const major = parseFloat(ver);
      if (major < 8.0) return `PHP version is ${ver} — outdated. PHP 7.x reached end-of-life and no longer receives security patches. Upgrading to PHP 8.x improves performance by 15-30% and closes security gaps; coordinate with your host.`;
      if (major < 8.2) return `PHP version is ${ver} — usable but a major version behind current. PHP 8.2+ offers meaningful performance gains; plan an upgrade in staging within the next quarter.`;
      return `PHP version is ${ver} — current. Maintain.`;
    },
    action: (c) => {
      const ver = String(c.plugin?.wfFull?.php_version || "");
      const major = parseFloat(ver);
      if (major < 8.0) return `Schedule a PHP upgrade to 8.1+ with your host this month. Test on staging first; most plugins are PHP 8.x-compatible but a few legacy themes can break.`;
      return "";
    },
  },

  // ─── Uptime / SSL ─────────────────────────────────────────────────
  {
    id: "tech.ssl.expiry",
    category: "ssl",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 5,
    appliesWhen: (c) => c.plugin?.ssl?.expiresIn != null,
    observation: (c) => {
      const days = Number(c.plugin?.ssl?.expiresIn || 0);
      if (days < 14) return `SSL certificate expires in ${days} day${days === 1 ? "" : "s"} — renew immediately. An expired certificate breaks browser trust and Google deindexes uncertified sites within hours.`;
      if (days < 30) return `SSL certificate expires in ${days} days. Renewal is automatic on most hosts but verify the renewal is configured; manual renewal needs to happen this week.`;
      return `SSL certificate valid for another ${days} days. Confirm auto-renewal is active so future expiries don't require manual attention.`;
    },
  },

  // ─── Data Gaps ────────────────────────────────────────────────────
  {
    id: "tech.gap.plugin_not_connected",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 10,
    appliesWhen: (c) => c.plugin == null || (!c.plugin.wfFull && !c.plugin.psi),
    observation: () => `IA Plugin is not connected. Without it there's no visibility into PageSpeed scores, Shield security posture, plugin risk inventory, scan findings, SSL status, or WordPress/PHP version freshness — these are the inputs to every Technical & Site Health observation.`,
    action: () => `Install + activate the IA Plugin on the WordPress site. Once connected, ARION pulls the full technical telemetry bundle within 24 hours.`,
  },

  // ─── Composite Health Summary ─────────────────────────────────────
  {
    id: "tech.summary.green_baseline",
    category: "summary",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 4,
    appliesWhen: (c) => {
      const wf = c.plugin?.wfFull;
      const psi = c.plugin?.psi;
      const latest = Array.isArray(psi) && psi.length > 0 ? psi[psi.length - 1] : null;
      const mobile = Number(latest?.mobileScore ?? latest?.mobile?.performance ?? 0);
      const wfOverall = Number(wf?.overall_score || 0);
      const issues = c.plugin?.scanIssues?.issues || [];
      const crit = issues.filter((i: any) => i.severity === "critical" || i.severity === "high").length;
      return wf?.installed === true && mobile >= 75 && wfOverall >= 80 && crit === 0;
    },
    observation: () => `Technical baseline is healthy: PageSpeed > 75, Shield > 80%, no critical scan findings. Maintain monthly updates + quarterly PSI reviews to keep this position.`,
  },
];

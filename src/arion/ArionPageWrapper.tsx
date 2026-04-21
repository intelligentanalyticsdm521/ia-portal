import { useLocation } from 'react-router-dom';
import { ArionPageHeader } from './components/ArionPageHeader';

const SECTION_MAP: Record<string, string> = {
  website: 'Website', hosting: 'Hosting', analytics: 'Analytics',
  seo: 'SEO', search: 'Search', business: 'Business Profile',
  brand: 'Brand', dashboard: 'Dashboard',
};

const PAGE_MAP: Record<string, string> = {
  overview: 'Overview', content: 'Content', staging: 'Staging',
  content_seo_overview: 'Content SEO', security_overview: 'Security',
  security_vulnerabilities: 'Vulnerabilities', security_firewall: 'Firewall',
  performance_cache: 'Core Web Vitals', performance_images: 'Media',
  updates: 'Plugins', domain_dns: 'Domain & DNS', backups: 'Backups',
  traffic: 'Traffic', conversions: 'Conversions',
  ia_cross_channel: 'IA Cross-Channel', ia_reports: 'IA Insights',
  rankings: 'Rankings', site_audit: 'Site Audit', competitors: 'Competitors',
  opportunities: 'Opportunities', performance: 'Performance',
  indexing: 'Search & Indexing', sitemaps: 'Sitemaps',
  core_web_vitals: 'Core Web Vitals', bing_copilot: 'Bing Copilot AI',
  bing_indexnow: 'Bing IndexNow', reviews: 'Reviews', insights: 'Insights',
  posts: 'Posts', services: 'Services', bing_overview: 'Bing Places',
  apple_overview: 'Apple Maps', settings: 'Settings', support: 'Support',
};

function deriveNames(pathname: string): { section: string; page: string } {
  // /app/services/arion_website_content → section=Website, page=Content
  const key = pathname.split('/').pop() || '';
  const parts = key.replace('arion_', '').split('_');

  if (parts[0] === 'dashboard') return { section: 'Dashboard', page: 'Overview' };

  const sectionKey = parts[0];
  const pageKey = parts.slice(1).join('_');

  return {
    section: SECTION_MAP[sectionKey] || sectionKey,
    page: PAGE_MAP[pageKey] || pageKey.replace(/_/g, ' '),
  };
}

export function ArionPageWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { section, page } = deriveNames(location.pathname);

  return (
    <div className="arion-page">
      <ArionPageHeader section={section} page={page} />
      {children}
    </div>
  );
}

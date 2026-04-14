import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, Loading, ErrorBanner, ConsultingUpsell } from '../../components/Ui';

export function ContentSeoSchema() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  const { data: seoData, loading: seoLoading, error } = useArionData(
    () => activeSiteId ? arionApi.getContentSeo(activeSiteId) : Promise.resolve(null),
    [activeSiteId],
  );

  if (loading || seoLoading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const d = (seoData as Record<string, any>)?.data ?? {};
  const allItems: any[] = [
    ...(Array.isArray(d.pages) ? d.pages : []),
    ...(Array.isArray(d.posts) ? d.posts : []),
  ];

  const activeCount = allItems.filter((item: any) => item.schema_type).length;
  const missingCount = allItems.length - activeCount;

  return (
    <div>
      <Card
        title="Schema Markup"
        subtitle={`${allItems.length} page${allItems.length !== 1 ? 's' : ''} analyzed \u2014 ${activeCount} with schema, ${missingCount} missing`}
      >
        {allItems.length > 0 ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Page</th>
                <th>Schema Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {allItems.map((item: any) => {
                const id = item.post_id ?? item.id;
                const title = item.title || '--';
                const schemaType = item.schema_type || null;
                const hasSchema = !!schemaType;

                return (
                  <tr key={id}>
                    <td>{title}</td>
                    <td style={{ color: hasSchema ? 'inherit' : 'var(--text-muted)' }}>
                      {schemaType || 'None'}
                    </td>
                    <td>
                      {hasSchema
                        ? <span className="badge-ia">Active</span>
                        : <span style={{ color: '#EB5757', fontSize: 12, fontWeight: 500 }}>Missing</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 12 }}>No content data available.</div>
        )}
      </Card>

      <ConsultingUpsell
        headline="Schema markup drives rich results in Google"
        subtext="IA's technical SEO team implements structured data."
        serviceType="SEO Strategy"
        triggerPage="content-seo-schema"
      />
    </div>
  );
}

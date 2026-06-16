/**
 * OliverCustomerImportPage — CSV customer import for OLIVER.
 *
 * Per F-31 ARCH cleanup, lumen.contact is the unified canonical contacts
 * table. OLIVER references contacts via contact_id on jobs/customers. So
 * importing "customers" here is the same backend call as importing SPARK
 * "contacts" — only the framing changes.
 */

import { useNavigate } from 'react-router-dom';
import { OliverPageWrapper } from '../../components/OliverPageWrapper';
import { PageHeader } from '../../components/oliver/ui';
import { CsvImportWidget } from '../../components/shared/CsvImportWidget';

export function OliverCustomerImportPage() {
  const navigate = useNavigate();

  return (
    <OliverPageWrapper title="Import customers" loading={false} error={null}>
      <PageHeader title="Import customers" subtitle="Upload a CSV of your existing customer list and we'll add them now." />
      <div className="max-w-3xl mx-auto">
        <CsvImportWidget
          product="oliver"
          source="oliver_onboarding"
          onDone={() => navigate('/app/services/oliver_contacts')}
          onSkip={() => navigate('/app/services/oliver_dashboard')}
        />
      </div>
    </OliverPageWrapper>
  );
}

export default OliverCustomerImportPage;

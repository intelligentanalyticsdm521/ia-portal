import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import { getProfile, type ProfileResponse, PlatformApiError } from '../lib/platformApi';
import { useAccessToken } from '../auth/useAccessToken';

function displayOrNotSet(v: string | null | undefined) {
  const s = (v ?? '').trim();
  return s ? s : 'Not set';
}

function formatApiError(err: unknown): string {
  if (err instanceof PlatformApiError) {
    const details =
      typeof err.body === 'object' && err.body && 'details' in err.body ? String((err.body as any).details) : '';
    return details ? `${err.message}: ${details}` : `${err.message} (HTTP ${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

export function ProfileViewPage() {
  const navigate = useNavigate();
  const { activeTenantId, active } = useAppState();
  const { getToken } = useAccessToken();
  const baseUrl = import.meta.env.VITE_PLATFORM_API_BASE_URL;

  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const welcomeName = useMemo(() => {
    return active?.tenant?.tenantFullName || active?.tenant?.tenantName || 'Welcome';
  }, [active?.tenant?.tenantFullName, active?.tenant?.tenantName]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const token = await getToken();
        const p = await getProfile({
          baseUrl,
          bearerToken: token.accessToken,
          tenantId: activeTenantId!
        });

        if (cancelled) return;
        setProfile(p);
      } catch (e) {
        if (cancelled) return;
        setError(formatApiError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, activeTenantId, getToken]);

  const fullAddress = useMemo(() => {
    if (!profile) return 'Not set';

    const parts = [
      profile.tenant.addressLine1,
      profile.tenant.addressLine2,
      profile.tenant.city,
      profile.tenant.stateProvince,
      profile.tenant.postalCode,
      profile.tenant.countryRegion
    ]
      .map((x) => (x ?? '').trim())
      .filter(Boolean);

    return parts.length ? parts.join(', ') : 'Not set';
  }, [profile]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-2 text-sm text-gray-600">View your user name and business contact information.</p>
        <p className="mt-1 text-sm text-gray-600">
          <span className="text-gray-500">Welcome:</span> <span className="font-medium">{welcomeName}</span>
        </p>
      </section>

      {error ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5">
          <div className="text-sm font-semibold text-red-800">Profile load error</div>
          <div className="mt-2 text-sm text-red-800">{error}</div>
        </section>
      ) : null}

      <section className="rounded-lg border bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Current information</h2>
            <p className="mt-1 text-sm text-gray-600">This is what is currently stored in the system.</p>
          </div>

          <button type="button" onClick={() => navigate('/app/profile/edit')} className="iadm-btn-primary">
            Edit
          </button>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-gray-600">Loading…</div>
        ) : !profile ? (
          <div className="mt-4 text-sm text-gray-600">No profile data available.</div>
        ) : (
          <div className="mt-4 grid gap-4 text-sm">
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <div className="text-gray-500">First name</div>
                <div className="font-medium">{displayOrNotSet(profile.user.firstName)}</div>
              </div>
              <div>
                <div className="text-gray-500">Last name</div>
                <div className="font-medium">{displayOrNotSet(profile.user.lastName)}</div>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <div className="text-gray-500">Business name</div>
                <div className="font-medium">{displayOrNotSet(profile.tenant.businessName)}</div>
              </div>
              <div>
                <div className="text-gray-500">Business type</div>
                <div className="font-medium">{displayOrNotSet(profile.tenant.businessType)}</div>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <div className="text-gray-500">Title</div>
                <div className="font-medium">{displayOrNotSet(profile.tenant.jobTitle)}</div>
              </div>
              <div>
                <div className="text-gray-500">Phone number</div>
                <div className="font-medium">{displayOrNotSet(profile.tenant.primaryContactPhone)}</div>
              </div>
            </div>

            <div>
              <div className="text-gray-500">Full address</div>
              <div className="font-medium">{fullAddress}</div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

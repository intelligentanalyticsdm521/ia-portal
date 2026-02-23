import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../app/AppState';
import { getProfile, updateProfile, type ProfileResponse, type UpdateProfileRequest, PlatformApiError } from '../lib/platformApi';
import { useAccessToken } from '../auth/useAccessToken';

type FormState = {
  firstName: string;
  lastName: string;

  businessName: string;
  businessType: string;
  jobTitle: string;
  primaryContactPhone: string;

  addressLine1: string;
  addressLine2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  countryRegion: string;
};

function toInput(v: string | null | undefined): string {
  return v ?? '';
}

function fromInput(v: string): string | null {
  const s = v.trim();
  return s ? s : null;
}

function mapProfileToForm(p: ProfileResponse): FormState {
  return {
    firstName: toInput(p.user.firstName),
    lastName: toInput(p.user.lastName),

    businessName: toInput(p.tenant.businessName),
    businessType: toInput(p.tenant.businessType),
    jobTitle: toInput(p.tenant.jobTitle),
    primaryContactPhone: toInput(p.tenant.primaryContactPhone),

    addressLine1: toInput(p.tenant.addressLine1),
    addressLine2: toInput(p.tenant.addressLine2),
    city: toInput(p.tenant.city),
    stateProvince: toInput(p.tenant.stateProvince),
    postalCode: toInput(p.tenant.postalCode),
    countryRegion: toInput(p.tenant.countryRegion)
  };
}

function buildUpdatePayload(form: FormState): UpdateProfileRequest {
  return {
    user: {
      firstName: fromInput(form.firstName),
      lastName: fromInput(form.lastName)
    },
    tenant: {
      businessName: fromInput(form.businessName),
      businessType: fromInput(form.businessType),
      jobTitle: fromInput(form.jobTitle),
      primaryContactPhone: fromInput(form.primaryContactPhone),

      addressLine1: fromInput(form.addressLine1),
      addressLine2: fromInput(form.addressLine2),
      city: fromInput(form.city),
      stateProvince: fromInput(form.stateProvince),
      postalCode: fromInput(form.postalCode),
      countryRegion: fromInput(form.countryRegion)
    }
  };
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

export function ProfilePage() {
  const { activeTenantId, active } = useAppState();
  const { getToken } = useAccessToken();

  const baseUrl = import.meta.env.VITE_PLATFORM_API_BASE_URL;

  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
        setForm(mapProfileToForm(p));
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

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage your user name and your business contact information.
        </p>
        <p className="mt-1 text-sm text-gray-600">
          <span className="text-gray-500">Welcome:</span> <span className="font-medium">{welcomeName}</span>
        </p>
      </section>

      {error ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5">
          <div className="text-sm font-semibold text-red-800">Profile load/save error</div>
          <div className="mt-2 text-sm text-red-800">{error}</div>

          {/* Helpful hint specifically for your current 404 situation */}
          {error.includes('404') ? (
            <div className="mt-3 text-xs text-red-800">
              This usually means the platform-api endpoint <span className="font-mono">/me/profile</span> has not been
              deployed yet.
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold">Edit profile</h2>

        {loading ? (
          <div className="mt-4 text-sm text-gray-600">Loading profile…</div>
        ) : !form ? (
          <div className="mt-4 text-sm text-gray-600">No profile data available.</div>
        ) : (
          <form
            className="mt-4 grid gap-6"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              setError(null);
              setSaved(false);

              try {
                const token = await getToken();
                const next = await updateProfile({
                  baseUrl,
                  bearerToken: token.accessToken,
          tenantId: activeTenantId!,
                  payload: buildUpdatePayload(form)
                });

                setProfile(next);
                setForm(mapProfileToForm(next));
                setSaved(true);
                setTimeout(() => setSaved(false), 1500);
              } catch (err) {
                setError(formatApiError(err));
              } finally {
                setSaving(false);
              }
            }}
          >
            {/* User info */}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-gray-600">First name</span>
                <input
                  className="iadm-input"
                  value={form.firstName}
                  onChange={(e) => setForm((p) => (p ? { ...p, firstName: e.target.value } : p))}
                  autoComplete="given-name"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-gray-600">Last name</span>
                <input
                  className="iadm-input"
                  value={form.lastName}
                  onChange={(e) => setForm((p) => (p ? { ...p, lastName: e.target.value } : p))}
                  autoComplete="family-name"
                />
              </label>
            </div>

            {/* Business info */}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-gray-600">Business name</span>
                <input
                  className="iadm-input"
                  value={form.businessName}
                  onChange={(e) => setForm((p) => (p ? { ...p, businessName: e.target.value } : p))}
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-gray-600">Business type</span>
                <input
                  className="iadm-input"
                  value={form.businessType}
                  onChange={(e) => setForm((p) => (p ? { ...p, businessType: e.target.value } : p))}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-gray-600">Title</span>
                <input
                  className="iadm-input"
                  value={form.jobTitle}
                  onChange={(e) => setForm((p) => (p ? { ...p, jobTitle: e.target.value } : p))}
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-gray-600">Phone number</span>
                <input
                  className="iadm-input"
                  value={form.primaryContactPhone}
                  onChange={(e) => setForm((p) => (p ? { ...p, primaryContactPhone: e.target.value } : p))}
                  autoComplete="tel"
                />
              </label>
            </div>

            {/* Address */}
            <div className="grid gap-4">
              <label className="grid gap-1 text-sm">
                <span className="text-gray-600">Address line 1</span>
                <input
                  className="iadm-input"
                  value={form.addressLine1}
                  onChange={(e) => setForm((p) => (p ? { ...p, addressLine1: e.target.value } : p))}
                  autoComplete="address-line1"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-gray-600">Address line 2</span>
                <input
                  className="iadm-input"
                  value={form.addressLine2}
                  onChange={(e) => setForm((p) => (p ? { ...p, addressLine2: e.target.value } : p))}
                  autoComplete="address-line2"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <label className="grid gap-1 text-sm md:col-span-2">
                <span className="text-gray-600">City</span>
                <input
                  className="iadm-input"
                  value={form.city}
                  onChange={(e) => setForm((p) => (p ? { ...p, city: e.target.value } : p))}
                  autoComplete="address-level2"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-gray-600">State / Province</span>
                <input
                  className="iadm-input"
                  value={form.stateProvince}
                  onChange={(e) => setForm((p) => (p ? { ...p, stateProvince: e.target.value } : p))}
                  autoComplete="address-level1"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-gray-600">Postal code</span>
                <input
                  className="iadm-input"
                  value={form.postalCode}
                  onChange={(e) => setForm((p) => (p ? { ...p, postalCode: e.target.value } : p))}
                  autoComplete="postal-code"
                />
              </label>
            </div>

            <label className="grid gap-1 text-sm">
              <span className="text-gray-600">Country / Region</span>
              <input
                className="iadm-input"
                value={form.countryRegion}
                onChange={(e) => setForm((p) => (p ? { ...p, countryRegion: e.target.value } : p))}
                autoComplete="country-name"
              />
            </label>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="iadm-btn-primary disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {saved ? <span className="text-sm text-green-700">Saved</span> : null}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

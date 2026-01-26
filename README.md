# IADM Portal v1 (React + Vite + TypeScript)

This repository is the production-grade SPA for **iadm-portal v1** and is designed for deployment to **Azure Static Web Apps**.

## What this portal does (v1)

- Public landing route (`/`) with sign-in entry point
- CIAM sign-up / sign-in via **MSAL redirect flow**
- On successful sign-in, the portal calls **platform-api**:
  - `POST /auth/verify` (Bearer token + `x-tenant-key` + `x-portal-context`)
  - Uses the response to establish an authenticated portal session
- Navigation shows:
  - Enabled services (based on `VITE_ENABLED_SERVICES`)
  - “Coming soon” placeholders
  - “Not subscribed” placeholders (if/when you mark services as such in the catalog)
- Service requests are manual: `info@intelligentanalyticsdm.com`

## Local development

1. Copy `.env.example` to `.env.local` and fill required values.

2. Install dependencies:

```bash
npm install
```

3. Run:

```bash
npm run dev
```

The dev server runs on `http://localhost:5173`.

## Build

```bash
npm run build
```

Build output is generated in `dist/`.

## Azure Static Web Apps

- SPA fallback routing is configured via `staticwebapp.config.json`.
- Ensure the portal **App Registration** has the deployed URL and the local dev URL registered as redirect URIs.
- The Azure DevOps pipeline should run `npm ci` and `npm run build`, then deploy the `dist` folder.

## Runtime requirements

The portal requires the following to be correct for authentication to work end-to-end:

- CIAM app registration values in `.env.*` (clientId, authority, scopes)
- `core.tenant_auth_providers` configured for the tenant:
  - `metadata_address` points to the OpenID configuration
  - `audience` matches the `aud` claim of the token produced by the configured `VITE_AUTH_SCOPES`


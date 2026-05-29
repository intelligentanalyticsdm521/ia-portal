# DNS for customer / crew / book portals (F-121)

This is the canonical mapping for both the platform default-subdomain root
(`ia-dm.com`) and IA's own-brand tenant root (`intelligentanalyticsdm.com`).
Use it whenever you onboard a new tenant or wire up a new portal SWA.

## Conceptual model

- **Platform default root: `ia-dm.com`** — every tenant gets free
  `<slug>.customer.ia-dm.com`, `<slug>.crew.ia-dm.com`, `<slug>.book.ia-dm.com`.
  These are served by **wildcard CNAMEs** that point at the SWAs, plus
  **wildcard hostname bindings** on each SWA. One DNS edit + one binding
  serves every tenant.

- **Own-brand tenant root: `intelligentanalyticsdm.com`** (also valid for
  any Pro+ tenant bringing their own domain) — explicit CNAMEs per portal
  (`customer.<root>`, `crew.<root>`, `book.<root>`).

## DNS records — `ia-dm.com`

| Type   | Name        | Value                                                | Notes |
| ------ | ----------- | ---------------------------------------------------- | ----- |
| CNAME  | `*.customer`| `<customer-portal-swa>.azurestaticapps.net`           | Wildcard. Covers every `<slug>.customer.ia-dm.com`. |
| CNAME  | `*.crew`    | `<crew-portal-swa>.azurestaticapps.net`               | Wildcard. Covers every `<slug>.crew.ia-dm.com`. |
| CNAME  | `*.book`    | `<oliver-ops-swa>.azurestaticapps.net`                | Wildcard. Covers every `<slug>.book.ia-dm.com`. |

**Pitfall:** if there's an explicit CNAME or TXT at e.g.
`intelligent-analytics.customer`, the wildcard no longer applies for that
name (DNS RFC). Delete leftover validation records once the SWA wildcard
binding is verified.

## DNS records — `intelligentanalyticsdm.com`

| Type   | Name        | Value                                                | Notes |
| ------ | ----------- | ---------------------------------------------------- | ----- |
| CNAME  | `customer`  | `<customer-portal-swa>.azurestaticapps.net`           | Maps `customer.intelligentanalyticsdm.com` to the customer portal SWA. |
| CNAME  | `crew`      | `<crew-portal-swa>.azurestaticapps.net`               | Maps `crew.intelligentanalyticsdm.com` to the crew portal SWA. |
| CNAME  | `book`      | `<oliver-ops-swa>.azurestaticapps.net`                | Maps `book.intelligentanalyticsdm.com` to the booking SWA. |

(The marketing site at `intelligentanalyticsdm.com` apex stays whatever
it currently is.)

## SWA hostname bindings

Each SWA needs the hostname bound (otherwise it 404s even with DNS):

```
az staticwebapp hostname set --name <customer-portal-swa> --resource-group <rg> --hostname '*.customer.ia-dm.com'
az staticwebapp hostname set --name <customer-portal-swa> --resource-group <rg> --hostname 'customer.intelligentanalyticsdm.com'
az staticwebapp hostname set --name <crew-portal-swa>     --resource-group <rg> --hostname '*.crew.ia-dm.com'
az staticwebapp hostname set --name <crew-portal-swa>     --resource-group <rg> --hostname 'crew.intelligentanalyticsdm.com'
az staticwebapp hostname set --name <oliver-ops-swa>      --resource-group <rg> --hostname '*.book.ia-dm.com'
az staticwebapp hostname set --name <oliver-ops-swa>      --resource-group <rg> --hostname 'book.intelligentanalyticsdm.com'
```

Each binding triggers a validation step (usually a TXT challenge). Once
green, **delete the TXT** if it's pointing at a tenant-specific subdomain
of the wildcard root — otherwise the explicit TXT overrides the wildcard.

## Per-tenant custom-domain bindings (Pro+ tier)

When a tenant brings their own domain (e.g. `acme.com`):

1. Tenant adds CNAME: `customer.acme.com → <customer-portal-swa>.azurestaticapps.net`
2. Admin POSTs to oliver-api `/portals/domain` to register intent
3. oliver-api calls `az staticwebapp hostname set` (automated by F-67)
4. SWA emits the TXT challenge; admin posts it back to the tenant
5. Once validated, `oliver.tenant_portal_domain.status` flips to `ready`

The wildcard pattern still applies for tenants on default subdomains; the
explicit-binding path is only for custom domains.

## CIAM authority + sign-in

Per F-115, each tenant's CIAM authority + client_id is stored in
`core.tenant_ciam_app`. On portal page load, MSAL bootstraps by:
1. Reading the host (customer.acme.com or <slug>.customer.ia-dm.com)
2. Resolving the tenant via `/public/portal/by-host`
3. Fetching the CIAM mapping via `/api/ciam/tenant/{id}/status`
4. Initializing MSAL with `(authority, clientId)`

This is why F-115 ships before F-67's wildcard binding is the only
remaining DNS gap — sign-in won't work for unsynced tenants without CIAM.

## Troubleshooting

| Symptom | Likely cause |
| ------- | ------------ |
| Browser can't resolve the subdomain | DNS not propagated yet (try `nslookup`) or wildcard overridden by stale explicit record |
| Site can't be reached, SSL warning | SWA hostname binding pending validation, or TLS cert hasn't issued |
| 404 from SWA on a valid host | Hostname bound to a different SWA, or `staticwebapp.config.json` doesn't include the route |
| Tenant resolves but login fails | CIAM not provisioned for that tenant (`/api/ciam/tenant/{id}/status` returns 404) |

See also: `iadm-ciam/README.md` for the CIAM-side checklist.

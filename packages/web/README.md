# AURA Web

Next.js dashboard for the AURA stack.

## Purpose

This package is the browser-facing operator UI. It handles:

- wallet connection
- treasury discovery and detail pages
- owner-signed treasury and governance actions
- backend-assisted confidential execution controls
- backend-assisted agent controls

## Deployed

- **Dashboard:** https://auraa-protocol.vercel.app
- **Docs:** https://docs-auraprotocol.vercel.app
- **Backend:** https://aura-backend-production-eb86.up.railway.app

## Runtime Dependency

The confidential lifecycle and agent pages depend on `packages/backend`.

Default backend URL:

```bash
http://127.0.0.1:8787
```

That value can be changed from the Settings page or preconfigured with
`NEXT_PUBLIC_AURA_BACKEND_URL`. The landing-page docs links can also be
pointed at a deployed docs site with `NEXT_PUBLIC_DOCS_URL`.

## Run

```bash
npm install
npm run dev
```

## Validation

```bash
npm run build
```

## Key Files

- `app/providers.tsx`: wallet, React Query, and app settings providers
- `lib/settings.ts`: persisted local settings
- `lib/aura-app.ts`: SDK and account helpers
- `lib/backend-client.ts`: backend request helpers
- `app/dashboard/treasuries/[pda]/propose/page.tsx`: proposal creation and confidential lifecycle controls
- `app/dashboard/agent/page.tsx`: backend agent runtime UI
- `app/dashboard/settings/page.tsx`: local RPC, backend, and auth configuration

## Related Docs

The package-level docs are now surfaced through `packages/docs`.

# AURA Web

Next.js dashboard for the AURA stack.

## Purpose

This package is the browser-facing operator UI. It handles:

- wallet connection
- treasury discovery and detail pages
- owner-signed treasury and governance actions
- backend-assisted confidential execution controls
- backend-assisted agent controls

## Runtime Dependency

The confidential lifecycle and agent pages depend on `packages/backend`.

Default backend URL:

```bash
http://127.0.0.1:8787
```

That value can be changed from the Settings page.

## Run

```bash
bun run dev
```

## Validation

```bash
bun run lint
bunx next typegen
bunx tsc --noEmit
bunx next build --webpack
```

## Key Files

- `app/providers.tsx`: wallet, React Query, and app settings providers
- `lib/settings.ts`: persisted local settings
- `lib/aura-app.ts`: SDK and account helpers
- `lib/backend-client.ts`: backend request helpers
- `app/app/treasuries/[pda]/confidential/page.tsx`: confidential lifecycle UI
- `app/app/agent/page.tsx`: backend agent runtime UI

## Related Docs

- [`../../docs/WEB.md`](../../docs/WEB.md)
- [`../../docs/Operations.md`](../../docs/Operations.md)

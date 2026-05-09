# AURA Documentation

Production documentation for AURA packages, built with Next.js and Fumadocs.

**Live:** https://docs-auraprotocol.vercel.app

The docs cover:

- TypeScript SDK (`@aura-protocol/sdk-ts`)
- Rust SDK (`aura-sdk`)
- CLI (`@aura-protocol/cli`)
- confidential scalar and vector FHE flows
- dWallet execution and finalization
- generic program-instruction builders

```bash
bun install
bun run dev
```

Open `http://localhost:3001`.

## Scripts

```bash
bun run types:check
bun run build
bun run lint
```

## Content Layout

```text
content/docs/
  sdk-ts/
  sdk-rs/
  cli/
```

Keep package docs synchronized with the published SDK and CLI surfaces before
tagging releases.

# Getting Started

## Installation

```bash
# From the monorepo root — build the SDK first, then the CLI
cd packages/sdk-ts && npm run build
cd ../cli && npm install && npm run build

# Link globally so `aura` is available anywhere
npm link
```

## Initial Setup

Run the interactive setup wizard to create `~/.aura/config.json`:

```bash
aura config init
```

Expected output:

```
  ? RPC URL  https://api.devnet.solana.com
  ? Wallet path  ~/.config/solana/id.json

  ✓ Config written to ~/.aura/config.json
```

Use a custom RPC to avoid public rate limits:

```bash
aura config init
# When prompted for RPC URL, enter:
# https://devnet.helius-rpc.com/?api-key=YOUR_KEY
```

Or set it via environment variable:

```bash
export AURA_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
```

## Verify Setup

```bash
aura config show
```

Expected output:

```
  Config
  ──────────────────────────────────────────────────────
  RPC URL      https://api.devnet.solana.com   (default)
  Wallet       ~/.config/solana/id.json        (config)
  Cluster      devnet                          (default)
  Program ID   G4XjdmH...zgVW                  (default)
  Agent ID     —                               (default)
```

## Fund Your Wallet

```bash
solana airdrop 2 --url devnet
```

## Global Flags

Every command accepts these flags:

| Flag | Description |
|---|---|
| `--rpc-url <url>` | Override RPC endpoint for this command |
| `--wallet <path>` | Override keypair file path |
| `--program-id <id>` | Override program ID |
| `--json` | Output raw JSON (for piping / scripting) |
| `--quiet` | Suppress all output except errors |
| `--dry-run` | Build and display the transaction without sending |
| `--help` | Show help for any command |

## Non-Interactive Mode

Every command works without prompts when all required flags are provided:

```bash
# Interactive — prompts for missing values
aura treasury create

# Non-interactive — no prompts
aura treasury create --agent-id my-agent --daily-limit 10000 --per-tx-limit 1000
```

## JSON Output

Use `--json` to get machine-readable output for scripting:

```bash
aura treasury show --agent-id my-agent --json
```

```json
{
  "treasury": "5kwYXCMMo8M37ZVNcPo8nsMXo8bQLeufSNwKaztxCuc8",
  "agentId": "my-agent",
  "owner": "6rqcaPU...",
  "executionPaused": false,
  "totalTransactions": 42
}
```

## Dry Run

Preview any transaction without sending it:

```bash
aura treasury propose --agent-id my-agent --amount 500 --chain ethereum \
  --recipient 0xdeadbeef... --dry-run
```

```json
{
  "action": "treasury.propose",
  "treasury": "5kwYXC...",
  "instruction": {
    "programId": "G4XjdmH...",
    "keys": [...],
    "data": "..."
  }
}
```

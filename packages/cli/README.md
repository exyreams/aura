![AURA banner](https://raw.githubusercontent.com/exyreams/aura/refs/heads/main/packages/web/public/banner.png)

# @aura-protocol/cli

**Docs:** https://docs-auraprotocol.vercel.app/docs/cli

> [!WARNING]
> AURA is under active development. Program instructions, account layouts, policy semantics, SDK APIs, and deployment behavior may still change. Do not use this code to secure production funds until a stable release and audit are published.

Terminal interface for the AURA autonomous treasury program on Solana.

Built on top of `@aura-protocol/sdk-ts` with full integration of the Ika Encrypt and dWallet
gRPC networks — the CLI drives the complete confidential proposal lifecycle end-to-end,
including automatic FHE ciphertext creation, policy decryption, and dWallet co-signing.

---

## Features

- Config-driven wallet and RPC resolution via `~/.aura/config.json`
- Complete coverage of every `aura-core` instruction through generated, IDL-backed
  per-domain commands (`aura <domain> <instruction>`) — always in sync with the program
- Ergonomic verb commands for the common treasury, dWallet, confidential, execution,
  and governance flows
- A secure send pipeline on every write: a transaction preview, preflight simulation,
  a mainnet guard, and confirmations for sensitive (authority/governance/closure) actions
- Interactive prompts when flags are omitted; fully scriptable with flags and `--yes`
- Auto-encryption of guardrail and transaction amounts via `@encrypt.xyz/pre-alpha-solana-client`
- Readable color-blocked output, spinners, and actionable error messages with tips
- `--json` output for piping and scripting; `--dry-run` to preview without sending
- PDA derivation for treasury, CPI, dWallet message approval, and policy-control records
- Full-screen `ink` dashboard for live treasury monitoring

---

## Prerequisites

- Node.js >= 22
- A funded Solana devnet wallet
  - Linux/macOS: `~/.config/solana/id.json`
  - Windows: `%USERPROFILE%\.config\solana\id.json`
  - Fund it: `solana airdrop 2 --url devnet`
- Network access to Ika devnet gRPC services:
  - Encrypt: `pre-alpha-dev-1.encrypt.ika-network.net:443`
  - dWallet: `pre-alpha-dev-1.ika.ika-network.net:443`

---

## Installation

```bash
npm install -g @aura-protocol/cli
```

Or run without installing:

```bash
npx @aura-protocol/cli --help
```

---

## Configuration

```bash
# Interactive setup — writes ~/.aura/config.json
aura config init

# Show resolved config (all sources merged)
aura config show

# Set individual values
aura config set --rpc-url https://devnet.helius-rpc.com/?api-key=YOUR_KEY
aura config set --wallet ~/.config/solana/id.json
```

Config resolution order (highest wins):

1. CLI flags (`--rpc-url`, `--wallet`, `--program-id`)
2. Environment variables (`AURA_RPC_URL`, `AURA_WALLET_PATH`, `AURA_PROGRAM_ID`)
3. Config file (`~/.aura/config.json`)
4. Built-in defaults (devnet RPC, `~/.config/solana/id.json`)

---

## Commands

### Instruction Surface (full coverage)

Every program instruction is reachable two ways: a generated per-domain command
(`aura <domain> <instruction>`) and the raw `aura ix` surface (alias of
`aura instruction`). Both are driven directly by the program IDL, so coverage
never drifts from the deployed program.

```bash
# Discover the surface
aura features                              # domains + maturity summary
aura features --domain policy              # filter to one domain
aura ix list                               # every instruction grouped by domain

# Inspect an instruction's accounts and arguments
aura ix schema configure_budget_envelope
aura budget configure-budget-envelope --schema   # same, via the generated command

# Build a serialized instruction without sending (offline)
aura ix build configure_budget_envelope --accounts @accounts.json --args @args.json

# Send any instruction — through the secure pipeline (preview + simulate + confirm)
aura policy create-policy-template \
  --account owner='$wallet' \
  --account policy_template=<pda> \
  --arg name=conservative --arg shared=false

# Equivalent via the raw surface
aura ix send transition_agent_state \
  --account treasury=<treasury-pda> \
  --account authority='$wallet' \
  --arg newState=active
```

Signer accounts accept the literal `$wallet` (the configured keypair). When an
instruction needs additional signers, pass one or more `--extra-signer <keypair>`
paths; the CLI verifies all required signers are present before broadcasting.
Use `--account key=value` / `--arg key=value` for individual fields, or
`--accounts @file.json` / `--args @file.json` for whole objects.

### Treasury

```bash
# Create a treasury with policy limits
aura treasury create --agent-id my-agent --daily-limit 10000 --per-tx-limit 1000

# Show full treasury state
aura treasury show --agent-id my-agent
aura treasury show --agent-id my-agent --watch   # live-refresh every 5s

# List all treasuries owned by your wallet
aura treasury list

# Propose a public (non-encrypted) transaction
aura treasury propose --agent-id my-agent --amount 500 --chain ethereum --recipient 0xdeadbeef...

# Pause / unpause execution
aura treasury pause --agent-id my-agent
aura treasury pause --agent-id my-agent --unpause

# Cancel the current pending transaction
aura treasury cancel --agent-id my-agent
```

### dWallet

```bash
# Register a dWallet reference (basic — no live signing)
aura dwallet register --agent-id my-agent \
  --chain ethereum \
  --dwallet-id dwallet-abc123 \
  --address 0xdeadbeef... \
  --balance 5000

# Register with live Ika signing metadata (required for execute/finalize)
aura dwallet register --agent-id my-agent \
  --chain ethereum \
  --dwallet-id dwallet-abc123 \
  --address 0xdeadbeef... \
  --balance 5000 \
  --dwallet-account <pda> \
  --authorized-user <pubkey> \
  --message-metadata-digest <32-byte-hex> \
  --public-key-hex <pubkey-hex>

# List registered dWallets
aura dwallet list --agent-id my-agent
```

### Confidential (FHE)

The confidential flow uses the Ika Encrypt gRPC network to create and decrypt FHE
ciphertexts. All encryption happens automatically — no manual ciphertext management needed.

```bash
# Ensure the Encrypt deposit account exists (required before any confidential operation)
aura confidential deposit ensure

# Configure scalar guardrails — auto-encrypts the three limit values via Ika Encrypt
aura confidential guardrails scalar \
  --agent-id my-agent \
  --daily-limit 10000 \
  --per-tx-limit 1000 \
  --spent-today 0

# Or attach pre-created ciphertext accounts directly
aura confidential guardrails scalar \
  --agent-id my-agent \
  --daily-limit-ciphertext <pk> \
  --per-tx-ciphertext <pk> \
  --spent-today-ciphertext <pk>

# Show confidential guardrails and pending state
aura confidential status --agent-id my-agent

# Propose a confidential transaction — auto-encrypts the amount via Ika Encrypt
aura confidential propose \
  --agent-id my-agent \
  --amount 250 \
  --chain ethereum \
  --recipient 0xdeadbeef... \
  --wait   # waits for the output ciphertext to be verified on-chain

# Or pass a pre-created amount ciphertext
aura confidential propose \
  --agent-id my-agent \
  --amount 250 \
  --chain ethereum \
  --recipient 0xdeadbeef... \
  --amount-ciphertext <pk>

# Request decryption of the policy output
aura confidential request-decryption --agent-id my-agent --wait

# Confirm the decryption result on-chain (shows approved/denied + violation code)
aura confidential confirm-decryption --agent-id my-agent
```

### Execution

```bash
# Execute the pending proposal.
# Approved proposals submit execute_pending, which requests dWallet co-signing
# through the message-approval account; the dWallet signature itself is produced
# by the backend / Ika dWallet network.
aura execution execute --agent-id my-agent

# --wait: waits for the message approval account to be created
# --wait-signed: waits until the message approval reaches signed status
aura execution execute --agent-id my-agent --wait
aura execution execute --agent-id my-agent --wait-signed

# Finalize after dWallet signing is complete
aura execution finalize --agent-id my-agent

# Watch execution state live
aura execution watch --agent-id my-agent
aura execution watch --agent-id my-agent --interval 3
```

### Governance

```bash
# Configure emergency guardian multisig
aura governance multisig \
  --agent-id my-agent \
  --required 2 \
  --guardians pk1,pk2,pk3

# Configure agent swarm with shared spending pool
aura governance swarm \
  --agent-id my-agent \
  --swarm-id alpha \
  --members agent-1,agent-2,agent-3 \
  --pool-limit 50000

# Guardian proposes a daily limit increase
aura governance override propose \
  --agent-id my-agent \
  --new-daily-limit 25000

# Guardian co-signs the override proposal
aura governance override collect --agent-id my-agent
```

### PDA Utilities

```bash
# Derive core program PDAs without loading a wallet
aura pda treasury --owner <owner> --agent-id my-agent
aura pda dwallet-cpi-authority
aura pda encrypt-cpi-authority

# Derive policy-control PDAs
aura pda policy-receipt --treasury <treasury> --proposal-id 42
aura pda budget-envelope --treasury <treasury> --envelope-id 7
aura pda operator-role --treasury <treasury> --operator <operator>
aura pda external-liveness --treasury <treasury>
aura pda policy-attestation --treasury <treasury> --attester <attester> --policy-version 3
aura pda batch-proposal --treasury <treasury> --batch-id 9
aura pda invariant-report --treasury <treasury> --report-id 10

# Derive the current dWallet MessageApproval PDA
aura pda message-approval \
  --curve 0 \
  --signature-scheme 5 \
  --public-key-hex <dwallet-public-key-hex> \
  --message-digest <32-byte-hex>
```

### Dashboard

```bash
# Full-screen live treasury dashboard
aura dashboard --agent-id my-agent

# Controls: r = refresh  q / Esc = quit
```

---

## Full Confidential Flow (end-to-end)

```bash
# 1. Create treasury
aura treasury create --agent-id my-agent --daily-limit 10000 --per-tx-limit 1000

# 2. Register dWallet with live signing metadata
aura dwallet register --agent-id my-agent --chain ethereum \
  --dwallet-id <id> --address <addr> --balance 5000 \
  --dwallet-account <pda> --authorized-user <pubkey> \
  --message-metadata-digest <hex> --public-key-hex <hex>

# 3. Ensure Encrypt deposit
aura confidential deposit ensure

# 4. Configure guardrails (auto-encrypts via Ika Encrypt gRPC)
aura confidential guardrails scalar \
  --agent-id my-agent --daily-limit 10000 --per-tx-limit 1000

# 5. Propose confidential transaction (auto-encrypts amount)
aura confidential propose \
  --agent-id my-agent --amount 250 --chain ethereum \
  --recipient 0xdeadbeef... --wait

# 6. Request decryption
aura confidential request-decryption --agent-id my-agent --wait

# 7. Confirm decryption (shows approved/denied)
aura confidential confirm-decryption --agent-id my-agent

# 8. Execute (requests dWallet co-signing via the message-approval account)
aura execution execute --agent-id my-agent --wait-signed

# 9. Finalize
aura execution finalize --agent-id my-agent
```

---

## Safety and security

Every command that sends a transaction runs through one pipeline with guard rails:

- **Preview** — before anything is sent, the CLI prints exactly what will be
  signed: network, program, fee payer, and each instruction's account/signer counts.
- **Preflight simulation** — the transaction is simulated and its compute units
  and any program error/logs are surfaced. Skip with `--no-simulate`.
- **Mainnet guard** — writes against a mainnet RPC require an explicit confirmation.
- **Sensitive-action confirmation** — authority changes, governance updates, and
  account closures prompt before sending. Bypass non-interactively with `--yes`.
- **Keypair hygiene** — warns when a keypair file is readable by group/others (POSIX).
- **`--dry-run`** — build and preview without sending or simulating.

Secrets are never printed: keypairs are referenced by public key only.

---

## Global Flags

```
--rpc-url <url>      Override the RPC endpoint
--wallet <path>      Override the keypair file path
--program-id <id>    Override the program ID
--cluster <name>     Cluster label for display
--json               Output machine-readable JSON (implies --no-color)
--quiet              Suppress non-error terminal output
--dry-run            Build and preview the transaction without sending
-y, --yes            Skip confirmation prompts (non-interactive / CI)
--no-simulate        Skip the preflight simulation before sending
--no-color           Disable colored output
--compute-units <n>  Override the compute-unit limit
-v, --version        Print the CLI version
--help               Show help
```

---

## Environment Variables

```bash
AURA_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
AURA_DEVNET_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
AURA_WALLET_PATH="/path/to/keypair.json"
PAYER_KEYPAIR="/path/to/keypair.json"
AURA_PROGRAM_ID="auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce"
AURA_DEFAULT_AGENT_ID="my-agent"
```

---

## Build from Source

```bash
git clone https://github.com/exyreams/aura.git
cd aura/packages/cli
npm install
npm run build
```

Run tests:

```bash
npm test
npm run test:devnet
```

The devnet test uses `AURA_DEVNET_RPC_URL` or `AURA_RPC_URL` when present and
falls back to the default Solana keypair at `~/.config/solana/id.json`.

Link locally for development:

```bash
npm link
aura --help
```

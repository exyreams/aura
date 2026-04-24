# @aura-protocol/cli

Terminal interface for the AURA autonomous treasury program on Solana.

Built on top of `@aura-protocol/sdk-ts` with full integration of the Ika Encrypt and dWallet
gRPC networks — the CLI drives the complete confidential proposal lifecycle end-to-end,
including automatic FHE ciphertext creation, policy decryption, and dWallet co-signing.

---

## Features

- Config-driven wallet and RPC resolution via `~/.aura/config.json`
- Interactive prompts when flags are omitted; fully scriptable with flags
- Auto-encryption of guardrail and transaction amounts via `@encrypt.xyz/pre-alpha-solana-client`
- Automatic dWallet presign + sign via `@ika.xyz/pre-alpha-solana-client`
- Readable tables, spinners, and actionable error messages
- `--json` output for piping and scripting
- `--dry-run` to preview instructions without sending
- Full-screen `ink` dashboard for live treasury monitoring

---

## Prerequisites

- Node.js >= 20
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

# Configure vector guardrails (single EUint64Vector ciphertext)
aura confidential guardrails vector \
  --agent-id my-agent \
  --guardrail-ciphertext <pk>

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
# Execute the pending proposal
# For approved proposals: submits execute_pending, then automatically drives
# the dWallet presign + sign flow via the Ika dWallet gRPC network
aura execution execute --agent-id my-agent

# --wait: waits for the message approval account to be created
# --wait-signed: waits for the full dWallet signature
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

# 8. Execute (drives dWallet presign + sign automatically)
aura execution execute --agent-id my-agent --wait-signed

# 9. Finalize
aura execution finalize --agent-id my-agent
```

---

## Global Flags

```
--rpc-url <url>     Override RPC endpoint
--wallet <path>     Override keypair file path
--program-id <id>   Override program ID
--json              Output raw JSON (for piping)
--quiet             Suppress all output except errors
--dry-run           Build and display the transaction without sending
--help              Show help
```

---

## Environment Variables

```bash
AURA_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
AURA_DEVNET_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
AURA_WALLET_PATH="/path/to/keypair.json"
PAYER_KEYPAIR="/path/to/keypair.json"
AURA_PROGRAM_ID="G4XjdmHtwwuTdw7VxWqTuTaL8WkZTKnCEnyaV5V6zgVW"
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
```

Link locally for development:

```bash
npm link
aura --help
```

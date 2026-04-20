# dWallet Commands

dWallets are Ika network accounts that hold native assets on their respective chains
(BTC on Bitcoin, ETH on Ethereum, etc.). Registering a dWallet on a treasury links it
so the AURA program can co-sign transactions via the Ika dWallet network.

## `aura dwallet register`

Registers a dWallet reference on a treasury.

### Basic Registration (no live signing)

Use this when you want to record the dWallet address without enabling live Ika signing:

```bash
aura dwallet register \
  --agent-id my-agent \
  --chain ethereum \
  --dwallet-id dwallet-abc123 \
  --address 0xdeadbeef... \
  --balance 5000
```

```
  ✓ dWallet registered

  ┌──────────────────┬──────────────────────────────────────────────┐
  │  Chain           │  Ethereum                                    │
  │  dWallet ID      │  dwallet-abc123                              │
  │  Address         │  0xdeadbeef...                               │
  │  Balance         │  $5,000.00                                   │
  └──────────────────┴──────────────────────────────────────────────┘
```

### Full Registration (with live Ika signing)

Required for `aura execution execute` and `aura execution finalize` to work.
The runtime fields come from the Ika dWallet provisioning flow (DKG output):

```bash
aura dwallet register \
  --agent-id my-agent \
  --chain ethereum \
  --dwallet-id dwallet-abc123 \
  --address 0xdeadbeef... \
  --balance 5000 \
  --dwallet-account <on-chain-pda> \
  --authorized-user <authorized-pubkey> \
  --message-metadata-digest <32-byte-hex-digest> \
  --public-key-hex <raw-pubkey-bytes-hex>
```

```
  ✓ dWallet registered with live signing metadata
```

### All Flags

```
--agent-id <id>                    Treasury agent ID (required)
--treasury <pda>                   Treasury PDA (alternative to --agent-id)
--chain <name|number>              Target chain (required)
--dwallet-id <id>                  Ika dWallet identifier (required)
--address <addr>                   Native chain address (required)
--balance <usd>                    Current balance in USD (required)
--dwallet-account <pubkey>         On-chain dWallet PDA (for live signing)
--authorized-user <pubkey>         Authorized user pubkey (for live signing)
--message-metadata-digest <hex>    32-byte metadata digest for MetadataV2 signing
--public-key-hex <hex>             Raw dWallet public key bytes in hex
```

### Supported Chains

| Name | Number |
|---|---|
| `solana` | 0 |
| `bitcoin` | 1 |
| `ethereum` | 2 |
| `polygon` | 3 |
| `arbitrum` | 4 |
| `optimism` | 5 |

---

## `aura dwallet list`

Lists all registered dWallets on a treasury.

```bash
aura dwallet list --agent-id my-agent
```

```
  dWallets (2)
  ┌──────────────┬──────────────────────────┬──────────────────────┬──────────┬──────────┐
  │ Chain        │ dWallet ID               │ Address              │ Balance  │ Live     │
  ├──────────────┼──────────────────────────┼──────────────────────┼──────────┼──────────┤
  │ Ethereum     │ dwallet-eth-abc123       │ 0xdeadbeef...        │ $5,000   │ ✓        │
  │ Bitcoin      │ dwallet-btc-xyz789       │ bc1qdeadbeef...      │ $20,000  │ ✗        │
  └──────────────┴──────────────────────────┴──────────────────────┴──────────┴──────────┘
```

"Live" indicates whether the dWallet has the runtime fields needed for `execute_pending`.

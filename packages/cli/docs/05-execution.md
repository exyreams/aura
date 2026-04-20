# Execution Commands

The execution lifecycle drives an approved proposal through dWallet co-signing
and on-chain finalization. The CLI integrates with the Ika dWallet gRPC network
to automate the presign + sign flow.

---

## `aura execution execute`

Runs `execute_pending` for the current proposal.

**For approved proposals:** submits the instruction, then automatically drives the
dWallet presign + sign flow via the Ika dWallet gRPC network.

**For denied proposals:** clears the pending proposal from the treasury.

### Basic (fire and forget)

```bash
aura execution execute --agent-id my-agent
```

```
  ⠸ Submitting execute_pending for live dWallet signing...
  ✓ Execution request submitted: 51W6DKHy...
```

### Wait for message approval account

```bash
aura execution execute --agent-id my-agent --wait
```

```
  ⠸ Submitting execute_pending for live dWallet signing...
  ⠸ Waiting for message approval account...
  ⠸ Requesting dWallet presign + sign via Ika network...
  ⠸ Waiting for message approval to be signed...
  ✓ Execution request submitted: 51W6DKHy...
```

### Wait for full dWallet signature (recommended before finalize)

```bash
aura execution execute --agent-id my-agent --wait-signed
```

```
  ⠸ Submitting execute_pending for live dWallet signing...
  ⠸ Waiting for message approval signature...
  ✓ Execution request submitted: 51W6DKHy...
```

### Denied proposal

```bash
aura execution execute --agent-id my-agent
```

```
  ⠸ Submitting denial execution...
  ✓ Denied proposal cleared: 3nq7n8zu...
```

### All Flags

```
--agent-id <id>      Treasury agent ID
--treasury <pda>     Treasury PDA (alternative to --agent-id)
--wait               Wait for message approval account to be created, then drive dWallet signing
--wait-signed        Wait for the full dWallet signature before returning
```

---

## `aura execution finalize`

Finalizes an approved proposal after the dWallet signature is on-chain.
Verifies the signature and closes the proposal, incrementing the treasury's
total transaction counter.

```bash
aura execution finalize --agent-id my-agent
```

```
  ⠸ Finalizing execution...
  ✓ Execution finalized: 34mSECfy... (total tx 43)
```

### All Flags

```
--agent-id <id>                Treasury agent ID
--treasury <pda>               Treasury PDA
--message-approval <pubkey>    Override the pending message approval account
```

---

## `aura execution watch`

Continuously monitors the execution state of a treasury, showing live checks
for ciphertext verification, decryption readiness, and message approval status.

```bash
aura execution watch --agent-id my-agent
```

```
  ╔══════════════════════════════════════════════════════════════════╗
  ║  Execution Watch: my-agent                                       ║
  ╚══════════════════════════════════════════════════════════════════╝

  Pending Proposal
  ─────────────────────────────────────────────────────────────────
  Proposal ID     42
  Amount          $250.00
  Chain           Ethereum
  Status          ◌ Awaiting signature

  Live Checks
  ─────────────────────────────────────────────────────────────────
  Policy output verified    Yes
  Decryption ready          Yes
  Message approval          pending
```

Refreshes every 5 seconds by default:

```bash
aura execution watch --agent-id my-agent --interval 3
```

---

## Full Execution Flow

```bash
# After a confidential proposal has been confirmed (approved):

# 1. Execute — drives dWallet signing automatically
aura execution execute --agent-id my-agent --wait-signed

# 2. Finalize
aura execution finalize --agent-id my-agent
```

For public (non-confidential) proposals:

```bash
# After propose_transaction (approved synchronously):

# 1. Execute
aura execution execute --agent-id my-agent --wait-signed

# 2. Finalize
aura execution finalize --agent-id my-agent
```

![AURA banner](https://raw.githubusercontent.com/exyreams/aura/refs/heads/main/packages/web/public/banner.png)

# aura-sdk

**Docs:** https://docs-auraprotocol.vercel.app/docs/sdk-rs

> [!WARNING]
> AURA is under active development. Program instructions, account layouts, policy semantics, SDK APIs, and deployment behavior may still change. Do not use this code to secure production funds until a stable release and audit are published.

Rust SDK for the AURA autonomous treasury program on Solana.

Wraps the deployed `aura-core` instruction and account types with a typed
client, automatic PDA derivation, and account deserialization — built directly
from the real Anchor-generated types so it stays in sync with the deployed
program.

---

## Installation

```toml
[dependencies]
aura-sdk = { path = "packages/sdk-rs" }
```

---

## Quick Start

```rust,no_run
use aura_sdk::{
    types::{CreateTreasuryArgs, PolicyConfig, PolicyConfigRecord, ProtocolFees, ProtocolFeesRecord},
    AuraClient, AURA_DEVNET_PROGRAM_ID,
};
use solana_commitment_config::CommitmentConfig;
use solana_sdk::signature::{Keypair, Signer};

let client = AuraClient::with_options(
    "https://api.devnet.solana.com",
    AURA_DEVNET_PROGRAM_ID,
    CommitmentConfig::confirmed(),
);

let owner = Keypair::new();
let args = CreateTreasuryArgs {
    agent_id: "my-agent".to_string(),
    ai_authority: owner.pubkey(),
    created_at: 0,
    pending_transaction_ttl_secs: 900,
    policy_config: PolicyConfigRecord::from_domain(&PolicyConfig::default()),
    protocol_fees: ProtocolFeesRecord::from_domain(&ProtocolFees::default()),
};

// Build the instruction (no RPC call)
let (treasury, instruction) = client.create_treasury_instruction(owner.pubkey(), args.clone());
assert_eq!(instruction.program_id, AURA_DEVNET_PROGRAM_ID);

// Or build + send in one call
let (treasury, signature) = client.create_treasury(&owner, args)?;
println!("treasury: {treasury}  sig: {signature}");
# Ok::<(), aura_sdk::SdkError>(())
```

---

## AuraClient

```rust,no_run
use aura_sdk::AuraClient;
use solana_commitment_config::CommitmentConfig;
use solana_sdk::pubkey::Pubkey;

// Devnet with default RPC
let client = AuraClient::devnet();

// Custom RPC + program ID
let client = AuraClient::with_options(
    "https://devnet.helius-rpc.com/?api-key=YOUR_KEY",
    aura_sdk::AURA_DEVNET_PROGRAM_ID,
    CommitmentConfig::confirmed(),
);

// With a default payer for send helpers
let client = AuraClient::with_payer(
    "https://api.devnet.solana.com",
    aura_sdk::AURA_DEVNET_PROGRAM_ID,
    CommitmentConfig::confirmed(),
    payer_keypair,
);
```

### Account fetching

```rust,no_run
// Fetch raw Anchor TreasuryAccount record
let record = client.get_treasury_account(&treasury_pda)?;

// Fetch and convert to rich AgentTreasury domain model
let treasury = client.get_treasury(&treasury_pda)?;

// Derive PDA and fetch in one call
let (pda, treasury) = client.get_treasury_for_owner(&owner_pubkey, "my-agent")?;
```

### PDA derivation

```rust,no_run
let (treasury_pda, bump) = client.derive_treasury_address(&owner, "my-agent");
let (dwallet_cpi_authority, _) = client.derive_dwallet_cpi_authority();
let (encrypt_cpi_authority, _) = client.derive_encrypt_cpi_authority();
let (event_authority, _) = client.derive_encrypt_event_authority(&encrypt_program_id);
```

### Sending transactions

```rust,no_run
// Build an instruction, then send it manually
let instruction = client.cancel_pending_instruction(owner.pubkey(), treasury, now);
let signature = client.send_instructions(&owner, vec![instruction], &[])?;

// Or use the convenience method that builds + sends
let signature = client.cancel_pending(&owner, treasury, now)?;

// With a default payer configured
let signature = client.send_with_default_payer(vec![instruction], &[])?;
```

---

## Instructions

Every instruction has two forms:

- `*_instruction(...)` — returns a `solana_sdk::instruction::Instruction` for composing into your own transaction
- the method without the suffix — builds, signs, and sends in one call

The low-level instruction builders are also organized by protocol domain under
`aura_sdk::instructions`:

```rust,no_run
use aura_sdk::instructions::{address_lists, governance, lifecycle, policy};

let ix = governance::propose_ai_rotation(accounts, new_ai_authority, now);
let check = policy::check_policy_cpi(check_accounts, check_args);
```

The SDK now covers the full 69-instruction `aura-core` surface: treasury
lifecycle, confidential execution, dWallet execution, policy controls, budget
controls, governance timelocks, AI and guardian rotation, session keys,
migration, health scores, snapshots, activity logs, swarm pools, fee vaults,
address lists, policy history, policy CPI checks, and dWallet balance refreshes.

### Treasury lifecycle

```rust,no_run
// Create a new treasury PDA
let (treasury, instruction) = client.create_treasury_instruction(owner.pubkey(), args);
let (treasury, signature)   = client.create_treasury(&owner, args)?;

// Pause or unpause execution
client.pause_execution(&owner, treasury, true,  now)?;  // pause
client.pause_execution(&owner, treasury, false, now)?;  // unpause

// Cancel the current pending transaction
client.cancel_pending(&owner, treasury, now)?;
```

### dWallet registration

```rust,no_run
use aura_sdk::types::RegisterDwalletArgs;

client.register_dwallet(&owner, treasury, RegisterDwalletArgs {
    chain: 2,  // 0=Solana 1=Bitcoin 2=Ethereum 3=Polygon 4=Arbitrum 5=Optimism
    dwallet_id: "dwallet-abc".to_string(),
    address: "0xdeadbeef...".to_string(),
    balance_usd: 5_000,
    dwallet_account: None,       // set for live Ika signing
    authorized_user_pubkey: None,
    message_metadata_digest: None,
    public_key_hex: None,
    timestamp: now,
})?;
```

### Proposing transactions

```rust,no_run
use aura_sdk::types::ProposeTransactionArgs;

// Public (non-encrypted) proposal
client.propose_transaction(&ai_authority, treasury, ProposeTransactionArgs {
    amount_usd: 250,
    target_chain: 2,
    tx_type: 0,
    protocol_id: None,
    current_timestamp: now,
    expected_output_usd: None,
    actual_output_usd: None,
    quote_age_secs: None,
    counterparty_risk_score: None,
    recipient_or_contract: "0xdeadbeef...".to_string(),
})?;

// Confidential proposal (scalar FHE — requires Ika Encrypt network)
client.propose_confidential_transaction(&ai_authority, accounts, args, &[])?;
```

### Confidential guardrails (FHE)

```rust,no_run
// Scalar ciphertexts — daily limit, per-tx limit, spent-today as separate accounts.
// The policy decrypts only the small violation code; spend state stays encrypted.
client.configure_confidential_guardrails(
    &owner, treasury,
    daily_limit_ciphertext,
    per_tx_limit_ciphertext,
    spent_today_ciphertext,
    now,
)?;
```

### Execution lifecycle (operator)

```rust,no_run
// Request the Encrypt network to decrypt the policy output
client.request_policy_decryption(&operator, accounts, now, &[])?;

// Confirm the decrypted result and apply the decision
client.confirm_policy_decryption(&operator, treasury, request_account, now)?;

// Submit approve_message CPI to dWallet once approved
client.execute_pending(&operator, accounts, now)?;

// Verify the dWallet signature and close the proposal
client.finalize_execution(&operator, accounts, now)?;
```

### Governance

```rust,no_run
use aura_sdk::types::ConfigureMultisigArgs;

// Attach an emergency guardian multisig
client.configure_multisig(&owner, treasury, ConfigureMultisigArgs {
    required_signatures: 2,
    guardians: vec![guardian1, guardian2, guardian3],
    timestamp: now,
})?;

// Guardian proposes a daily limit increase
client.propose_override(&guardian, treasury, new_daily_limit_usd, now)?;

// Guardian co-signs the override proposal
client.collect_override_signature(&guardian, treasury, now)?;
```

### Agent swarms

```rust,no_run
use aura_sdk::types::ConfigureSwarmArgs;

client.configure_swarm(&owner, treasury, ConfigureSwarmArgs {
    swarm_id: "swarm-alpha".to_string(),
    member_agents: vec!["agent-1".to_string(), "agent-2".to_string()],
    shared_pool_limit_usd: 50_000,
    timestamp: now,
})?;
```

### Policy controls

The Rust client exposes the latest policy-control entrypoints as both
instruction builders and send helpers:

```rust,no_run
use aura_sdk::types::{ConfigureApprovalLadderArgs, SetScopedPauseArgs};

client.configure_approval_ladder(
    &owner,
    aura_sdk::anchor_accounts::ConfigureApprovalLadder {
        owner: owner.pubkey(),
        treasury,
    },
    ConfigureApprovalLadderArgs {
        guardian_above_usd: 5_000,
        multisig_above_usd: 25_000,
        timelock_above_usd: 50_000,
        deny_above_usd: 100_000,
        risk_guardian_bps: 6_000,
        risk_multisig_bps: 8_000,
        risk_timelock_bps: 9_000,
        timelock_secs: 3_600,
        now,
    },
)?;

client.set_scoped_pause(
    &operator,
    aura_sdk::anchor_accounts::SetScopedPause {
        operator: operator.pubkey(),
        treasury,
        operator_role: None,
    },
    SetScopedPauseArgs {
        scope_kind: 5,
        chain: None,
        tx_type: None,
        recipient: None,
        protocol_id: None,
        paused: true,
        expires_at: None,
        now,
    },
)?;
```

Covered methods include simulations, policy receipts, presets, budget
envelopes, exposure groups, approval ladders, scoped pauses, operator roles,
external liveness, policy attestations, batch proposals, and invariant reports.

### Advanced controls

```rust,no_run
// Owner-controlled AI authority rotation.
client.propose_ai_rotation(&owner, treasury, new_ai_authority, now)?;
client.execute_ai_rotation(&owner, treasury, now)?;

// Guardian-managed rotation and config vetoes.
client.propose_guardian_rotation(&guardian, treasury, 0, new_guardian, now)?;
client.veto_config_change(&guardian, treasury, change_id, now)?;

// Session keys and operational accounts use the Anchor account structs directly.
let ix = client.issue_session_key_instruction(accounts, args);
let health = client.refresh_health_score_instruction(health_accounts, now);
let fees = client.collect_fees_instruction(fee_accounts, now);
```

For specialized flows, pass the generated Anchor account structs from
`aura_sdk::anchor_accounts` directly to the `*_instruction` methods. Send
helpers validate the signer role locally before sending RPC wherever the
program instruction has an explicit signer account.

---

## PDA Helpers (standalone)

```rust,no_run
use aura_sdk::pda::{
    derive_treasury_pda,
    derive_dwallet_cpi_authority_pda,
    derive_encrypt_cpi_authority_pda,
    derive_encrypt_event_authority_pda,
    derive_message_approval_pda,
    derive_policy_receipt_pda,
    derive_budget_envelope_pda,
    derive_operator_role_pda,
};
use aura_sdk::AURA_DEVNET_PROGRAM_ID;

let (treasury, bump) = derive_treasury_pda(&owner, "my-agent", &AURA_DEVNET_PROGRAM_ID);

// Current dWallet MessageApproval PDA.
let digest: [u8; 32] = keccak_message_digest;
let metadata_digest: Option<&[u8; 32]> = None;
let (approval, _) = derive_message_approval_pda(
    &dwallet_program_id,
    0,              // curve code
    &public_key,
    5,              // signature scheme code
    &digest,
    metadata_digest,
);

// Policy-control PDAs.
let (receipt, _) = derive_policy_receipt_pda(&treasury, 42, &AURA_DEVNET_PROGRAM_ID);
let (envelope, _) = derive_budget_envelope_pda(&treasury, 7, &AURA_DEVNET_PROGRAM_ID);
let (role, _) = derive_operator_role_pda(&treasury, &operator, &AURA_DEVNET_PROGRAM_ID);
```

---

## Types

All on-chain types are re-exported from `aura_sdk::types`:

```rust,no_run
use aura_sdk::types::{
    // Instruction args
    CreateTreasuryArgs, RegisterDwalletArgs, ProposeTransactionArgs,
    ProposeConfidentialTransactionArgs, ConfigureMultisigArgs, ConfigureSwarmArgs,
    SimulatePolicyArgs, WritePolicyReceiptArgs, ConfigureBudgetEnvelopeArgs,
    ConfigureApprovalLadderArgs, SetScopedPauseArgs, GrantOperatorRoleArgs,
    InitExternalLivenessArgs, ProposeBatchArgs, CheckInvariantsArgs,

    // Account state
    TreasuryAccount, AgentTreasury, PendingTransaction, DWalletReference,
    EmergencyMultisig, AgentSwarm, ConfidentialGuardrails,

    // Policy types
    PolicyConfig, PolicyConfigRecord, PolicyState, PolicyDecision,
    ReputationPolicy, ViolationCode, RuleOutcome, TransactionContext,

    // Enums
    Chain, TransactionType, ProposalStatus, DWalletCurve, SignatureScheme,

    // Events
    TreasuryAuditEvent, ProposalLifecycleEvent, ExecutionLifecycleEvent,
};
```

---

## Error Handling

```rust,no_run
use aura_sdk::SdkError;

match client.get_treasury(&treasury_pda) {
    Ok(treasury) => println!("agent: {}", treasury.agent_id),
    Err(SdkError::AccountNotFound(addr)) => println!("not found: {addr}"),
    Err(SdkError::AccountDecode { account_name, message }) => {
        println!("decode failed for {account_name}: {message}")
    }
    Err(SdkError::Rpc(e)) => println!("RPC error: {e}"),
    Err(e) => println!("error: {e}"),
}
```

---

## Validation

Client-side validation helpers catch invalid inputs before submitting transactions:

```rust,no_run
use aura_sdk::utils::{
    validate_agent_id, validate_dwallet_id, validate_address,
    validate_amount_usd, validate_multisig_threshold,
    validate_guardians, validate_swarm_members,
};

validate_agent_id("my-agent")?;           // Err if empty or > 64 bytes
validate_amount_usd(100)?;                // Err if zero
validate_multisig_threshold(2, 3)?;       // Err if threshold > count
validate_guardians(&guardians)?;          // Err if empty or > 10
validate_swarm_members(&members)?;        // Err if empty or > 16
```

---

## Constants

```rust,no_run
use aura_sdk::constants::{
    DEVNET_RPC_URL,
    TREASURY_SEED, DWALLET_CPI_AUTHORITY_SEED, ENCRYPT_CPI_AUTHORITY_SEED,
    MESSAGE_APPROVAL_SEED, ENCRYPT_EVENT_AUTHORITY_SEED,
    MAX_AGENT_ID_LEN, MAX_DWALLET_ID_LEN, MAX_ADDRESS_LEN,
    MAX_GUARDIANS, MAX_SWARM_MEMBERS, DEFAULT_PENDING_TTL_SECS,
};

use aura_sdk::{AURA_DEVNET_PROGRAM_ID, DWALLET_DEVNET_PROGRAM_ID, ENCRYPT_DEVNET_PROGRAM_ID};
```

---

## Deployed Program

```
aura-core (devnet)
  Program ID:   auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce

Ika Encrypt (pre-alpha devnet)
  Program ID:   4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8
  gRPC:         pre-alpha-dev-1.encrypt.ika-network.net:443

Ika dWallet (pre-alpha devnet)
  Program ID:   87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY
  gRPC:         pre-alpha-dev-1.ika.ika-network.net:443
```

---

## Testing

```bash
# Unit tests (no network required)
cargo test -p aura-sdk

# Full workspace
cargo test --workspace
```

# aura-sdk

Rust SDK for the AURA autonomous treasury program on Solana.

Wraps all 18 `aura-core` instructions with a typed client, automatic PDA
derivation, and account deserialization — built directly from the real
Anchor-generated types so it stays in sync with the deployed program.

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

// Confidential scalar proposal (FHE — requires Ika Encrypt network)
client.propose_confidential_transaction(&ai_authority, accounts, args, &[])?;

// Confidential vector proposal (FHE — requires Ika Encrypt network)
client.propose_confidential_vector_transaction(&ai_authority, accounts, args, &[])?;
```

### Confidential guardrails (FHE)

```rust,no_run
// Scalar ciphertexts — daily limit, per-tx limit, spent-today as separate accounts
client.configure_confidential_guardrails(
    &owner, treasury,
    daily_limit_ciphertext,
    per_tx_limit_ciphertext,
    spent_today_ciphertext,
    now,
)?;

// Vector ciphertext — all three encoded in a single EUint64Vector account
client.configure_confidential_vector_guardrails(
    &owner, treasury, guardrail_vector_ciphertext, now,
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

---

## PDA Helpers (standalone)

```rust,no_run
use aura_sdk::pda::{
    derive_treasury_pda,
    derive_dwallet_cpi_authority_pda,
    derive_encrypt_cpi_authority_pda,
    derive_encrypt_event_authority_pda,
    derive_message_approval_pda,
};
use aura_sdk::AURA_DEVNET_PROGRAM_ID;

let (treasury, bump) = derive_treasury_pda(&owner, "my-agent", &AURA_DEVNET_PROGRAM_ID);

// Message approval PDA — requires a 32-byte digest
let digest: [u8; 32] = sha256_of_message;
let (approval, _) = derive_message_approval_pda(&dwallet_program_id, &dwallet_account, &digest);
```

---

## Types

All on-chain types are re-exported from `aura_sdk::types`:

```rust,no_run
use aura_sdk::types::{
    // Instruction args
    CreateTreasuryArgs, RegisterDwalletArgs, ProposeTransactionArgs,
    ProposeConfidentialTransactionArgs, ConfigureMultisigArgs, ConfigureSwarmArgs,

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
  Program ID:   G4XjdmHtwwuTdw7VxWqTuTaL8WkZTKnCEnyaV5V6zgVW

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

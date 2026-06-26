//! Live devnet integration tests.
//!
//! These talk to a real Solana cluster and are `#[ignore]`d so the default
//! `cargo test` stays offline and deterministic. Run them explicitly:
//!
//! ```bash
//! # Uses ~/.config/solana/id.json and the public devnet RPC by default.
//! cargo test -p aura-sdk --test devnet -- --ignored --nocapture
//!
//! # Override the wallet / RPC:
//! AURA_WALLET_PATH=/path/to/id.json \
//! AURA_DEVNET_RPC_URL=https://devnet.helius-rpc.com/?api-key=... \
//!   cargo test -p aura-sdk --test devnet -- --ignored --nocapture
//! ```
//!
//! The treasury-creation test needs a funded devnet wallet (a small amount of
//! SOL for rent). The connectivity and missing-account tests do not.

use std::time::{SystemTime, UNIX_EPOCH};

use aura_sdk::{
    types::{
        CreateTreasuryArgs, PolicyConfig, PolicyConfigRecord, ProtocolFees, ProtocolFeesRecord,
    },
    AuraClient, SdkError, AURA_DEVNET_PROGRAM_ID,
};
use solana_commitment_config::CommitmentConfig;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{read_keypair_file, Keypair, Signer},
};

/// Resolves the devnet RPC endpoint from `AURA_DEVNET_RPC_URL`, falling back to
/// the public devnet RPC.
fn rpc_url() -> String {
    std::env::var("AURA_DEVNET_RPC_URL")
        .unwrap_or_else(|_| "https://api.devnet.solana.com".to_string())
}

/// Builds a devnet client pointed at the canonical program ID.
fn client() -> AuraClient {
    AuraClient::with_options(
        rpc_url(),
        AURA_DEVNET_PROGRAM_ID,
        CommitmentConfig::confirmed(),
    )
}

/// Loads the signing wallet from `AURA_WALLET_PATH` or the standard Solana CLI
/// keypair location.
fn load_wallet() -> Keypair {
    let path = std::env::var("AURA_WALLET_PATH").unwrap_or_else(|_| {
        let home = std::env::var("HOME").expect("HOME is set");
        format!("{home}/.config/solana/id.json")
    });
    read_keypair_file(&path).unwrap_or_else(|err| panic!("failed to read wallet {path}: {err}"))
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock after epoch")
        .as_secs() as i64
}

#[test]
#[ignore = "requires devnet network access"]
fn devnet_connectivity() {
    let client = client();
    let blockhash = client
        .rpc_client()
        .get_latest_blockhash()
        .expect("fetch latest blockhash from devnet");
    assert_ne!(
        blockhash,
        Default::default(),
        "blockhash should be non-zero"
    );
    println!("devnet latest blockhash: {blockhash}");
}

#[test]
#[ignore = "requires devnet network access"]
fn devnet_missing_treasury_reports_not_found() {
    let client = client();
    let (treasury, _) = client.derive_treasury_address(&Pubkey::new_unique(), "does-not-exist");
    match client.get_treasury(&treasury) {
        Err(SdkError::AccountNotFound(addr)) => assert_eq!(addr, treasury),
        other => panic!("expected AccountNotFound, got {other:?}"),
    }
}

#[test]
#[ignore = "requires a funded devnet wallet"]
fn devnet_create_and_fetch_treasury() {
    let client = client();
    let owner = load_wallet();
    let now = unix_now();
    let agent_id = format!("sdk-devnet-{now}");

    let args = CreateTreasuryArgs {
        agent_id: agent_id.clone(),
        ai_authority: owner.pubkey(),
        created_at: now,
        pending_transaction_ttl_secs: 900,
        policy_config: PolicyConfigRecord::from_domain(&PolicyConfig::default()),
        protocol_fees: ProtocolFeesRecord::from_domain(&ProtocolFees::default()),
    };

    let (treasury, signature) = client
        .create_treasury(&owner, args)
        .expect("create_treasury on devnet");
    println!("created treasury {treasury} in {signature}");

    let fetched = client
        .get_treasury(&treasury)
        .expect("fetch created treasury");
    assert_eq!(fetched.agent_id, agent_id);
    assert_eq!(fetched.owner, owner.pubkey().to_string());
    assert_eq!(fetched.ai_authority, owner.pubkey().to_string());

    // PDA-derive + fetch convenience path should resolve the same account.
    let (derived, also_fetched) = client
        .get_treasury_for_owner(&owner.pubkey(), &agent_id)
        .expect("derive + fetch treasury");
    assert_eq!(derived, treasury);
    assert_eq!(also_fetched.agent_id, agent_id);
}

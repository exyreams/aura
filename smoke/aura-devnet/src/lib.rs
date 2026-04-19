//! Shared infrastructure used by all three devnet smoke-test binaries.
//!
//! Every binary imports this crate with `use aura_devnet::*;`.  The code here
//! covers the full Solana + Ika plumbing: RPC helpers, Encrypt gRPC, dWallet
//! gRPC, account polling, PDA derivation, and the shared on-chain instruction
//! builders that are identical across scenarios.

use std::{
    env,
    str::FromStr,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use anchor_lang::{
    prelude::Pubkey, system_program::ID as SYSTEM_PROGRAM_ID, AccountDeserialize,
    InstructionData, ToAccountMetas,
};
use anyhow::{anyhow, ensure, Context};
use aura_core::{
    accounts, instruction, build_message_approval_request, parse_message_approval_account,
    CreateTreasuryArgs, PolicyConfigRecord, ProtocolFees, ProtocolFeesRecord,
    RegisterDwalletArgs, TreasuryAccount, DWALLET_CPI_AUTHORITY_SEED,
    DWALLET_DEVNET_GRPC_ENDPOINT, ENCRYPT_FHE_UINT64, ID,
};
use encrypt_compute::mock_crypto::MockEncryptor;
use encrypt_grpc::{
    encrypt_service_client::EncryptServiceClient, Chain as EncryptChain, CreateInputRequest,
    EncryptedInput,
};
use encrypt_types::{
    encryptor::{Chain as EncryptProofChain, Encryptor, PlaintextInput},
    types::FheType,
};
use ika_dwallet_types::{
    ApprovalProof, ChainId, DWalletCurve as IkaDWalletCurve, DWalletRequest as IkaDWalletRequest,
    DWalletSignatureAlgorithm, NetworkSignedAttestation, SignedRequestData,
    TransactionResponseData, UserSecretKeyShare, UserSignature, VersionedDWalletDataAttestation,
    VersionedPresignDataAttestation,
};
use ika_grpc::{d_wallet_service_client::DWalletServiceClient, UserSignedRequest};
use solana_commitment_config::CommitmentConfig;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    signature::{read_keypair_file, Keypair, Signature, Signer},
    transaction::Transaction,
};

// ─── constants ───────────────────────────────────────────────────────────────

/// 32-byte network encryption key used by the pre-alpha Encrypt service.
/// Replace with the real key once the network publishes it.
pub const ENCRYPT_NETWORK_KEY: [u8; 32] = [0x55u8; 32];

// Raw discriminator / layout bytes for polling account readiness.
pub const ENCRYPT_DEPOSIT_DISC: u8 = 14;
pub const DWALLET_COORDINATOR_DISC: u8 = 1;
pub const DWALLET_ACCOUNT_DISC: u8 = 2;
pub const DWALLET_COORDINATOR_LEN: usize = 116;
pub const MESSAGE_APPROVAL_DISC: u8 = 14;

/// Slot used in `ApprovalProof::Solana` — not validated on pre-alpha devnet.
pub const APPROVAL_PROOF_SLOT: u64 = 0;

pub const DEFAULT_COMPUTE_UNIT_LIMIT: u32 = 1_400_000;
pub const DEFAULT_HEAP_FRAME_BYTES: u32 = 256 * 1024;
pub const COMPUTE_BUDGET_PROGRAM_ID: &str = "ComputeBudget111111111111111111111111111111";

pub const DEVNET_RPC: &str = "https://api.devnet.solana.com";

// ─── basic helpers ────────────────────────────────────────────────────────────

/// Derives a PDA and returns `(address, bump)`.
pub fn pda(seeds: &[&[u8]], program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(seeds, program_id)
}

/// Current Unix timestamp in seconds.
pub fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before Unix epoch")
        .as_secs() as i64
}

/// Random 32-byte value generated from a throwaway keypair.
/// Used as `session_identifier_preimage` for dWallet gRPC requests.
pub fn random_preimage() -> [u8; 32] {
    Keypair::new().pubkey().to_bytes()
}

/// Load the payer keypair from `PAYER_KEYPAIR` env var or the default Solana
/// CLI path (`~/.config/solana/id.json`).
pub fn load_payer() -> anyhow::Result<Keypair> {
    let path = env::var("PAYER_KEYPAIR").unwrap_or_else(|_| {
        dirs_next::home_dir()
            .map(|h| h.join(".config/solana/id.json").to_string_lossy().into_owned())
            .unwrap_or_else(|| "~/.config/solana/id.json".to_string())
    });
    read_keypair_file(&path)
        .map_err(|e| anyhow!("failed to load payer keypair from {path}: {e}"))
}

/// Build a confirmed devnet RPC client.
pub fn devnet_rpc() -> RpcClient {
    RpcClient::new_with_commitment(DEVNET_RPC.to_string(), CommitmentConfig::confirmed())
}

fn compute_budget_instruction(discriminator: u8, value: u32) -> Instruction {
    let mut data = Vec::with_capacity(5);
    data.push(discriminator);
    data.extend_from_slice(&value.to_le_bytes());
    Instruction {
        program_id: Pubkey::from_str(COMPUTE_BUDGET_PROGRAM_ID).expect("valid compute budget id"),
        accounts: Vec::new(),
        data,
    }
}

fn request_heap_frame_instruction(bytes: u32) -> Instruction {
    compute_budget_instruction(1, bytes)
}

fn set_compute_unit_limit_instruction(units: u32) -> Instruction {
    compute_budget_instruction(2, units)
}

// ─── Solana transaction helpers ───────────────────────────────────────────────

/// Build, sign, and confirm a Solana transaction.
/// Prepends a 1.4 M CU budget and 256 KB heap frame to every transaction.
pub fn send_tx(
    client: &RpcClient,
    payer: &Keypair,
    ixs: Vec<Instruction>,
    extra_signers: &[&Keypair],
) -> anyhow::Result<Signature> {
    let blockhash = client.get_latest_blockhash()?;
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra_signers);
    let mut instructions = Vec::with_capacity(ixs.len() + 2);
    instructions.push(request_heap_frame_instruction(DEFAULT_HEAP_FRAME_BYTES));
    instructions.push(set_compute_unit_limit_instruction(DEFAULT_COMPUTE_UNIT_LIMIT));
    instructions.extend(ixs);
    let tx = Transaction::new_signed_with_payer(
        &instructions,
        Some(&payer.pubkey()),
        &signers,
        blockhash,
    );
    Ok(client.send_and_confirm_transaction(&tx)?)
}

/// Mark a specific account meta as signer before sending a transaction.
///
/// Anchor leaves these Encrypt output/request accounts as `UncheckedAccount`,
/// so the smoke harness updates the outer metas manually when the Encrypt
/// program expects a freshly created account to sign.
pub fn mark_account_meta_signer(
    metas: &mut [AccountMeta],
    pubkey: Pubkey,
) -> anyhow::Result<()> {
    let meta = metas
        .iter_mut()
        .find(|meta| meta.pubkey == pubkey)
        .ok_or_else(|| anyhow!("missing account meta for signer {pubkey}"))?;
    meta.is_signer = true;
    Ok(())
}

// ─── account polling ─────────────────────────────────────────────────────────

/// Poll `account` every second until `predicate(&data)` is true or `timeout`
/// elapses. Returns the raw account data on success.
pub fn wait_for_account(
    client: &RpcClient,
    account: &Pubkey,
    timeout: Duration,
    predicate: impl Fn(&[u8]) -> bool,
) -> anyhow::Result<Vec<u8>> {
    let start = Instant::now();
    loop {
        if start.elapsed() > timeout {
            anyhow::bail!("timed out waiting for account {account}");
        }
        if let Ok(info) = client.get_account(account) {
            if predicate(&info.data) {
                return Ok(info.data);
            }
        }
        thread::sleep(Duration::from_secs(1));
    }
}

/// Wait up to 120 s for an Encrypt `Ciphertext` account to reach
/// "verified" status (byte `[99] == 1`).
pub fn wait_for_ciphertext_verified(
    client: &RpcClient,
    ciphertext: &Pubkey,
) -> anyhow::Result<Vec<u8>> {
    wait_for_account(client, ciphertext, Duration::from_secs(120), |d| {
        d.len() >= 100 && d[99] == 1
    })
}

/// Wait up to 120 s for an Encrypt `DecryptionRequest` account to have all
/// plaintext bytes written (`bytes_written == total_len > 0`).
pub fn wait_for_decryption_ready(
    client: &RpcClient,
    request: &Pubkey,
) -> anyhow::Result<Vec<u8>> {
    wait_for_account(client, request, Duration::from_secs(120), |d| {
        if d.len() < 107 {
            return false;
        }
        let total = u32::from_le_bytes(d[99..103].try_into().unwrap_or_default());
        let written = u32::from_le_bytes(d[103..107].try_into().unwrap_or_default());
        total > 0 && written == total
    })
}

/// Wait up to 120 s for a `MessageApproval` account to appear on-chain
/// (the account is created by the dWallet program when it processes the CPI).
pub fn wait_for_message_approval_pending(
    client: &RpcClient,
    approval: &Pubkey,
) -> anyhow::Result<Vec<u8>> {
    wait_for_account(client, approval, Duration::from_secs(120), |d| {
        d.len() >= 2 && d[0] == MESSAGE_APPROVAL_DISC
    })
}

/// Wait up to 180 s for a `MessageApproval` account to reach `Signed` status
/// (the dWallet network has co-signed the message).
pub fn wait_for_message_approval_signed(
    client: &RpcClient,
    approval: &Pubkey,
) -> anyhow::Result<Vec<u8>> {
    wait_for_account(client, approval, Duration::from_secs(180), |d| {
        parse_message_approval_account(d)
            .map(|p| p.status == aura_core::MessageApprovalStatus::Signed)
            .unwrap_or(false)
    })
}

// ─── treasury account helpers ────────────────────────────────────────────────

/// Deserialize the raw on-chain `TreasuryAccount`.
pub fn fetch_treasury(client: &RpcClient, treasury: &Pubkey) -> anyhow::Result<TreasuryAccount> {
    let info = client.get_account(treasury)?;
    let mut data = info.data.as_slice();
    Ok(TreasuryAccount::try_deserialize(&mut data)?)
}

/// Deserialize and convert to the rich domain object `AgentTreasury`.
pub fn fetch_treasury_domain(
    client: &RpcClient,
    treasury: &Pubkey,
) -> anyhow::Result<aura_core::AgentTreasury> {
    Ok(fetch_treasury(client, treasury)?.to_domain()?)
}

// ─── dWallet PDA / epoch helpers ─────────────────────────────────────────────

/// Derive the dWallet PDA from curve code and raw public key bytes.
/// Mirrors `find_message_approval_pda_v2` in `cpi/dwallet.rs`.
pub fn derive_dwallet_pda(curve: u16, public_key: &[u8], program_id: &Pubkey) -> Pubkey {
    let mut payload = Vec::with_capacity(2 + public_key.len());
    payload.extend_from_slice(&curve.to_le_bytes());
    payload.extend_from_slice(public_key);

    let mut seeds: Vec<&[u8]> = Vec::with_capacity(4);
    seeds.push(b"dwallet");
    for chunk in payload.chunks(32) {
        seeds.push(chunk);
    }
    Pubkey::find_program_address(&seeds, program_id).0
}

/// Read the current Ika network epoch from the dWallet coordinator account.
/// The epoch is encoded as a `u64 LE` at bytes `[34..42]`.
pub fn read_ika_epoch(data: &[u8]) -> anyhow::Result<u64> {
    ensure!(
        data.len() >= DWALLET_COORDINATOR_LEN && data[0] == DWALLET_COORDINATOR_DISC,
        "invalid dWallet coordinator account (len={}, disc={})",
        data.len(),
        data.first().copied().unwrap_or(0)
    );
    Ok(u64::from_le_bytes(data[34..42].try_into()?))
}

// ─── gRPC connections ────────────────────────────────────────────────────────

/// Open a TLS gRPC channel to the Ika dWallet devnet endpoint.
pub async fn connect_dwallet_client(
) -> anyhow::Result<DWalletServiceClient<tonic::transport::Channel>> {
    let channel = tonic::transport::Channel::from_shared(DWALLET_DEVNET_GRPC_ENDPOINT.to_string())
        .context("invalid dWallet gRPC endpoint")?
        .tls_config(tonic::transport::ClientTlsConfig::new().with_native_roots())
        .context("TLS config failed")?
        .connect()
        .await
        .context("failed to connect to dWallet gRPC")?;
    Ok(DWalletServiceClient::new(channel))
}

/// Open a TLS gRPC channel to the Ika Encrypt devnet endpoint.
pub async fn connect_encrypt_client(
) -> anyhow::Result<EncryptServiceClient<tonic::transport::Channel>> {
    let channel = tonic::transport::Channel::from_static(
        "https://pre-alpha-dev-1.encrypt.ika-network.net:443",
    )
    .tls_config(tonic::transport::ClientTlsConfig::new().with_native_roots())
    .context("TLS config failed")?
    .connect()
    .await
    .context("failed to connect to Encrypt gRPC")?;
    Ok(EncryptServiceClient::new(channel))
}

// ─── dWallet request helpers ─────────────────────────────────────────────────

/// Sign `SignedRequestData` with the payer's Ed25519 key and wrap it in the
/// `UserSignedRequest` wire format expected by the dWallet gRPC service.
pub fn build_dwallet_request(
    payer: &Keypair,
    request: SignedRequestData,
) -> anyhow::Result<UserSignedRequest> {
    let data = bcs::to_bytes(&request)?;
    let sig = payer.sign_message(&data);
    let user_sig = UserSignature::Ed25519 {
        signature: sig.as_ref().to_vec(),
        public_key: payer.pubkey().to_bytes().to_vec(),
    };
    Ok(UserSignedRequest {
        user_signature: bcs::to_bytes(&user_sig)?,
        signed_request_data: data,
    })
}

/// Submit a request to the dWallet gRPC service with up to 5 retries on
/// transient errors.
pub async fn submit_dwallet_request(
    client: &mut DWalletServiceClient<tonic::transport::Channel>,
    payer: &Keypair,
    request: SignedRequestData,
) -> anyhow::Result<TransactionResponseData> {
    let wire = build_dwallet_request(payer, request)?;
    for attempt in 1u64..=5 {
        match client.submit_transaction(wire.clone()).await {
            Ok(r) => return Ok(bcs::from_bytes(&r.into_inner().response_data)?),
            Err(e) if attempt < 5 => {
                eprintln!("  retrying dWallet submit (attempt {attempt}/5): {e}");
                tokio::time::sleep(Duration::from_secs(attempt)).await;
            }
            Err(e) => return Err(anyhow!("dWallet submit failed after 5 attempts: {e}")),
        }
    }
    unreachable!()
}

// ─── Encrypt helpers ─────────────────────────────────────────────────────────

/// Encrypt a single `u64` value and return the on-chain ciphertext account
/// pubkey. Retries up to 8 times with exponential back-off.
///
/// `authorized` is the Solana program ID that is allowed to use the ciphertext
/// — for AURA this is always `aura_core::ID`.
pub async fn encrypt_u64(value: u64, authorized: &Pubkey) -> anyhow::Result<Pubkey> {
    let value_bytes = value.to_le_bytes();
    let inputs = [PlaintextInput {
        plaintext_bytes: &value_bytes,
        fhe_type: FheType::EUint64,
    }];
    let enc = MockEncryptor.encrypt_and_prove(&inputs, &ENCRYPT_NETWORK_KEY, EncryptProofChain::Solana);

    let req = CreateInputRequest {
        chain: EncryptChain::Solana.into(),
        inputs: enc
            .ciphertexts
            .iter()
            .map(|ct| EncryptedInput {
                ciphertext_bytes: ct.clone(),
                fhe_type: ENCRYPT_FHE_UINT64 as u32,
            })
            .collect(),
        proof: enc.proof,
        authorized: authorized.to_bytes().to_vec(),
        network_encryption_public_key: ENCRYPT_NETWORK_KEY.to_vec(),
    };

    for attempt in 1u64..=8 {
        let mut client = connect_encrypt_client()
            .await
            .context("connect to Encrypt gRPC")?;
        match client.create_input(req.clone()).await {
            Ok(resp) => {
                let id = resp
                    .into_inner()
                    .ciphertext_identifiers
                    .into_iter()
                    .next()
                    .ok_or_else(|| anyhow!("Encrypt returned no identifier for value={value}"))?;
                return Ok(Pubkey::from(<[u8; 32]>::try_from(id.as_slice())?));
            }
            Err(e) if attempt < 8 => {
                eprintln!("  retrying encrypt_u64 value={value} (attempt {attempt}/8): {e}");
                tokio::time::sleep(Duration::from_secs(attempt * 2)).await;
            }
            Err(e) => return Err(anyhow!("Encrypt create_input failed after 8 attempts: {e}")),
        }
    }
    unreachable!()
}

// ─── Encrypt PDA bundle ──────────────────────────────────────────────────────

/// All Encrypt program PDAs required by every confidential instruction.
pub struct EncryptPdas {
    pub config_pda: Pubkey,
    pub deposit_pda: Pubkey,
    pub network_key_pda: Pubkey,
    pub event_authority: Pubkey,
    /// `__encrypt_cpi_authority` PDA derived from the AURA program.
    pub cpi_authority: Pubkey,
}

/// Ensure the payer has an Encrypt deposit account, creating it if missing.
/// Returns all Encrypt PDAs needed by confidential instructions.
///
/// The deposit account layout is reverse-engineered from the pre-alpha Encrypt
/// program; replace with the official SDK helper once it is published.
pub fn ensure_encrypt_deposit(
    client: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
) -> anyhow::Result<EncryptPdas> {
    let (config_pda, _) = pda(&[b"encrypt_config"], encrypt_program);
    let (event_authority, _) = pda(&[b"__event_authority"], encrypt_program);
    let (deposit_pda, deposit_bump) =
        pda(&[b"encrypt_deposit", payer.pubkey().as_ref()], encrypt_program);
    let (network_key_pda, _) =
        pda(&[b"network_encryption_key", &ENCRYPT_NETWORK_KEY], encrypt_program);
    let (cpi_authority, _) = pda(&[b"__encrypt_cpi_authority"], &ID);

    if client.get_account(&deposit_pda).is_err() {
        let config_info = client
            .get_account(&config_pda)
            .context("Encrypt config account not found — is the program deployed?")?;

        // Bytes [100..132] of the config account hold the fee-vault pubkey.
        let enc_vault =
            Pubkey::try_from(&config_info.data[100..132]).unwrap_or(Pubkey::default());
        let vault_is_payer = enc_vault == Pubkey::default();
        let vault_account = if vault_is_payer { payer.pubkey() } else { enc_vault };

        let mut data = vec![0u8; 18];
        data[0] = ENCRYPT_DEPOSIT_DISC;
        data[1] = deposit_bump;

        send_tx(
            client,
            payer,
            vec![Instruction {
                program_id: *encrypt_program,
                data,
                accounts: vec![
                    AccountMeta::new(deposit_pda, false),
                    AccountMeta::new_readonly(config_pda, false),
                    AccountMeta::new_readonly(payer.pubkey(), true),
                    AccountMeta::new(payer.pubkey(), true),
                    AccountMeta::new(payer.pubkey(), true),
                    AccountMeta::new(vault_account, vault_is_payer),
                    AccountMeta::new_readonly(Pubkey::default(), false),
                    AccountMeta::new_readonly(Pubkey::default(), false),
                ],
            }],
            &[],
        )
        .context("failed to create Encrypt deposit account")?;
        println!("  Created Encrypt deposit account {deposit_pda}");
    }

    Ok(EncryptPdas { config_pda, deposit_pda, network_key_pda, event_authority, cpi_authority })
}

// ─── live dWallet ─────────────────────────────────────────────────────────────

/// Result of a successful DKG provisioning call.
#[derive(Clone)]
pub struct LiveDWallet {
    pub attestation: NetworkSignedAttestation,
    pub public_key: Vec<u8>,
    pub dwallet_pda: Pubkey,
    pub ika_epoch: u64,
    /// 32-byte session identifier from the DKG attestation, reused as
    /// `session_identifier_preimage` for presign and sign requests.
    pub session_identifier: [u8; 32],
}

/// Run DKG via the Ika gRPC service to provision a new Ed25519 dWallet on
/// the Solana devnet, wait for the PDA to appear on-chain, and return the
/// live dWallet data.
///
/// All cryptographic fields (key shares, proofs) are zeroed because the
/// pre-alpha network uses mock cryptography. Replace with real DKG logic
/// when using the production Ika SDK.
pub async fn provision_dwallet(
    rpc: &RpcClient,
    payer: &Keypair,
    client: &mut DWalletServiceClient<tonic::transport::Channel>,
    dwallet_program: &Pubkey,
) -> anyhow::Result<LiveDWallet> {
    let (coordinator_pda, _) =
        Pubkey::find_program_address(&[b"dwallet_coordinator"], dwallet_program);
    let coordinator_data = wait_for_account(
        rpc,
        &coordinator_pda,
        Duration::from_secs(60),
        |d| d.len() >= DWALLET_COORDINATOR_LEN && d[0] == DWALLET_COORDINATOR_DISC,
    )
    .context("dWallet coordinator account not ready")?;
    let ika_epoch = read_ika_epoch(&coordinator_data)?;

    println!("  DKG — epoch={ika_epoch}");
    let response = submit_dwallet_request(
        client,
        payer,
        SignedRequestData {
            session_identifier_preimage: random_preimage(),
            epoch: ika_epoch,
            chain_id: ChainId::Solana,
            intended_chain_sender: payer.pubkey().to_bytes().to_vec(),
            request: IkaDWalletRequest::DKG {
                dwallet_network_encryption_public_key: vec![0u8; 32],
                curve: IkaDWalletCurve::Curve25519,
                centralized_public_key_share_and_proof: vec![0u8; 32],
                user_secret_key_share: UserSecretKeyShare::Encrypted {
                    encrypted_centralized_secret_share_and_proof: vec![0u8; 32],
                    encryption_key: vec![0u8; 32],
                    signer_public_key: payer.pubkey().to_bytes().to_vec(),
                },
                user_public_output: vec![0u8; 32],
                sign_during_dkg_request: None,
            },
        },
    )
    .await
    .context("DKG request failed")?;

    let attestation = match response {
        TransactionResponseData::Attestation(a) => a,
        TransactionResponseData::Error { message } => {
            return Err(anyhow!("DKG returned error: {message}"))
        }
        other => return Err(anyhow!("unexpected DKG response: {other:?}")),
    };

    let versioned: VersionedDWalletDataAttestation =
        bcs::from_bytes(&attestation.attestation_data)?;
    let VersionedDWalletDataAttestation::V1(data) = versioned;

    let dwallet_pda = derive_dwallet_pda(2, &data.public_key, dwallet_program);
    println!("  DKG complete — waiting for dWallet PDA {dwallet_pda}");

    wait_for_account(rpc, &dwallet_pda, Duration::from_secs(120), |b| {
        b.len() > 2 && b[0] == DWALLET_ACCOUNT_DISC
    })
    .context("dWallet PDA did not appear on-chain")?;

    let session_identifier: [u8; 32] = data
        .session_identifier
        .try_into()
        .map_err(|_| anyhow!("session_identifier must be 32 bytes"))?;

    Ok(LiveDWallet {
        attestation,
        public_key: data.public_key,
        dwallet_pda,
        ika_epoch,
        session_identifier,
    })
}

/// Transfer dWallet ownership to the AURA `__ika_cpi_authority` PDA so that
/// `aura-core` can sign `approve_message` CPIs on its behalf.
pub fn transfer_dwallet_authority(
    rpc: &RpcClient,
    payer: &Keypair,
    dwallet_program: &Pubkey,
    dwallet_pda: &Pubkey,
) -> anyhow::Result<()> {
    let (aura_cpi_authority, _) = Pubkey::find_program_address(&[DWALLET_CPI_AUTHORITY_SEED], &ID);
    let mut data = Vec::with_capacity(33);
    data.push(24u8); // transfer_ownership discriminator
    data.extend_from_slice(aura_cpi_authority.as_ref());

    send_tx(
        rpc,
        payer,
        vec![Instruction::new_with_bytes(
            *dwallet_program,
            &data,
            vec![
                AccountMeta::new_readonly(payer.pubkey(), true),
                AccountMeta::new(*dwallet_pda, false),
            ],
        )],
        &[],
    )
    .context("transfer_dwallet_authority failed")?;

    println!("  dWallet ownership transferred to AURA CPI authority {aura_cpi_authority}");
    Ok(())
}

// ─── shared on-chain instruction builders ────────────────────────────────────

/// Build `create_treasury` instruction with the given policy configuration.
pub fn create_treasury_ix(
    payer: &Keypair,
    treasury: Pubkey,
    agent_id: &str,
    created_at: i64,
    policy: aura_policy::PolicyConfig,
) -> Instruction {
    let args = CreateTreasuryArgs {
        agent_id: agent_id.to_string(),
        ai_authority: payer.pubkey(),
        created_at,
        pending_transaction_ttl_secs: 900,
        policy_config: PolicyConfigRecord::from_domain(&policy),
        protocol_fees: ProtocolFeesRecord::from_domain(&ProtocolFees::default()),
    };
    Instruction {
        program_id: ID,
        accounts: accounts::CreateTreasury {
            owner: payer.pubkey(),
            treasury,
            system_program: SYSTEM_PROGRAM_ID,
        }
        .to_account_metas(None),
        data: instruction::CreateTreasury { args }.data(),
    }
}

/// Build `register_dwallet` instruction for the Solana chain (chain code 2).
pub fn register_dwallet_ix(
    payer: &Keypair,
    treasury: Pubkey,
    live: &LiveDWallet,
    now: i64,
) -> Instruction {
    let args = RegisterDwalletArgs {
        chain: 2, // Solana
        dwallet_id: live.dwallet_pda.to_string(),
        address: bs58::encode(&live.public_key).into_string(),
        balance_usd: 0,
        dwallet_account: Some(live.dwallet_pda),
        authorized_user_pubkey: Some(payer.pubkey()),
        message_metadata_digest: None,
        public_key_hex: Some(hex::encode(&live.public_key)),
        timestamp: now,
    };
    Instruction {
        program_id: ID,
        accounts: accounts::RegisterDwallet {
            owner: payer.pubkey(),
            treasury,
        }
        .to_account_metas(None),
        data: instruction::RegisterDwallet { args }.data(),
    }
}

/// Call `execute_pending` for a **denied** proposal (no dWallet accounts
/// required) and assert the pending slot is cleared afterwards.
pub fn execute_denied(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![Instruction {
            program_id: ID,
            accounts: accounts::ExecutePending {
                operator: payer.pubkey(),
                treasury,
                message_approval: None,
                dwallet_coordinator: None,
                dwallet: None,
                caller_program: ID,
                cpi_authority: None,
                dwallet_program: None,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            data: instruction::ExecutePending { now }.data(),
        }],
        &[],
    )
    .context("execute_pending (denial) failed")?;

    let domain = fetch_treasury_domain(rpc, &treasury)?;
    ensure!(domain.pending.is_none(), "denied proposal should be cleared after execute_pending");
    Ok(())
}

// ─── finalize via live dWallet ────────────────────────────────────────────────

/// Drive the `execute_pending` → presign → sign → `finalize_execution`
/// pipeline for an **approved** proposal.
///
/// Steps:
/// 1. `execute_pending` — submits `approve_message` CPI to the dWallet program.
/// 2. Wait for `MessageApproval` account to appear.
/// 3. Presign request to the Ika dWallet gRPC service.
/// 4. Sign request (with `ApprovalProof::Solana`) to the gRPC service.
/// 5. Wait for `MessageApproval` account to reach `Signed` status.
/// 6. `finalize_execution` — advances policy state and clears pending slot.
pub async fn finalize_via_dwallet(
    rpc: &RpcClient,
    payer: &Keypair,
    dwallet_client: &mut DWalletServiceClient<tonic::transport::Channel>,
    treasury: Pubkey,
    dwallet_program: &Pubkey,
    live: &LiveDWallet,
    now: i64,
) -> anyhow::Result<()> {
    let domain = fetch_treasury_domain(rpc, &treasury)?;
    let pending = domain
        .pending
        .clone()
        .ok_or_else(|| anyhow!("no pending proposal to finalize on treasury {treasury}"))?;
    ensure!(pending.decision.approved, "proposal must be approved before finalize");

    let dwallet_ref = domain
        .dwallets
        .get(&aura_policy::Chain::Solana)
        .cloned()
        .ok_or_else(|| anyhow!("Solana dWallet not registered on treasury {treasury}"))?;

    let approval_req = build_message_approval_request(
        &pending,
        &dwallet_ref,
        dwallet_program,
        domain.deployment.dwallet_message_approval_layout,
    )
    .context("build_message_approval_request failed")?;

    let (cpi_authority, _) = Pubkey::find_program_address(&[DWALLET_CPI_AUTHORITY_SEED], &ID);

    // 1 — submit approve_message CPI to the dWallet program
    let execute_sig = send_tx(
        rpc,
        payer,
        vec![Instruction {
            program_id: ID,
            accounts: accounts::ExecutePending {
                operator: payer.pubkey(),
                treasury,
                message_approval: Some(approval_req.message_approval_account),
                dwallet_coordinator: approval_req.coordinator_account,
                dwallet: Some(live.dwallet_pda),
                caller_program: ID,
                cpi_authority: Some(cpi_authority),
                dwallet_program: Some(*dwallet_program),
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            data: instruction::ExecutePending { now }.data(),
        }],
        &[],
    )
    .context("execute_pending failed")?;
    println!("  execute_pending tx: {execute_sig}");

    // 2 — wait for MessageApproval account
    wait_for_message_approval_pending(rpc, &approval_req.message_approval_account)
        .context("MessageApproval account did not appear")?;

    // 3 — presign
    let presign_resp = submit_dwallet_request(
        dwallet_client,
        payer,
        SignedRequestData {
            session_identifier_preimage: live.session_identifier,
            epoch: live.ika_epoch,
            chain_id: ChainId::Solana,
            intended_chain_sender: payer.pubkey().to_bytes().to_vec(),
            request: IkaDWalletRequest::Presign {
                dwallet_network_encryption_public_key: vec![0u8; 32],
                curve: IkaDWalletCurve::Curve25519,
                signature_algorithm: DWalletSignatureAlgorithm::EdDSA,
            },
        },
    )
    .await
    .context("presign request failed")?;

    let presign_attestation = match presign_resp {
        TransactionResponseData::Attestation(a) => a,
        TransactionResponseData::Error { message } => {
            return Err(anyhow!("presign returned error: {message}"))
        }
        other => return Err(anyhow!("unexpected presign response: {other:?}")),
    };
    let VersionedPresignDataAttestation::V1(presign_data) =
        bcs::from_bytes(&presign_attestation.attestation_data)?;

    // 4 — sign
    let sign_resp = submit_dwallet_request(
        dwallet_client,
        payer,
        SignedRequestData {
            session_identifier_preimage: live.session_identifier,
            epoch: live.ika_epoch,
            chain_id: ChainId::Solana,
            intended_chain_sender: payer.pubkey().to_bytes().to_vec(),
            request: IkaDWalletRequest::Sign {
                message: approval_req.message.as_bytes().to_vec(),
                message_metadata: vec![],
                presign_session_identifier: presign_data.presign_session_identifier,
                message_centralized_signature: vec![0u8; 64],
                dwallet_attestation: live.attestation.clone(),
                approval_proof: ApprovalProof::Solana {
                    transaction_signature: execute_sig.as_ref().to_vec(),
                    slot: APPROVAL_PROOF_SLOT,
                },
            },
        },
    )
    .await
    .context("sign request failed")?;

    let signature_bytes = match sign_resp {
        TransactionResponseData::Signature { signature } => signature,
        TransactionResponseData::Error { message } => {
            return Err(anyhow!("sign returned error: {message}"))
        }
        other => return Err(anyhow!("unexpected sign response: {other:?}")),
    };

    // 5 — wait for Signed status
    let signed_data =
        wait_for_message_approval_signed(rpc, &approval_req.message_approval_account)
            .context("MessageApproval never reached Signed status")?;
    let parsed = parse_message_approval_account(&signed_data)?;
    ensure!(
        parsed.signature == signature_bytes,
        "on-chain signature does not match gRPC response"
    );
    println!("  dWallet signature verified on-chain");

    // 6 — finalize
    send_tx(
        rpc,
        payer,
        vec![Instruction {
            program_id: ID,
            accounts: accounts::FinalizeExecution {
                operator: payer.pubkey(),
                treasury,
                message_approval: approval_req.message_approval_account,
            }
            .to_account_metas(None),
            data: instruction::FinalizeExecution { now: now + 1 }.data(),
        }],
        &[],
    )
    .context("finalize_execution failed")?;

    let finalized = fetch_treasury_domain(rpc, &treasury)?;
    ensure!(finalized.pending.is_none(), "pending not cleared after finalize");
    ensure!(finalized.total_transactions >= 1, "total_transactions not incremented");
    println!(
        "  ✓ finalized — total_transactions={}",
        finalized.total_transactions
    );
    Ok(())
}

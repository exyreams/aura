//! Shared helpers for live policy smoke scenarios.

use super::prelude::*;

pub(super) const GUARDIAN_FUNDING_LAMPORTS: u64 = 10_000_000;

pub(super) fn fund_ephemeral_signers(
    rpc: &RpcClient,
    payer: &Keypair,
    signers: &[&Keypair],
) -> anyhow::Result<()> {
    let transfers = signers
        .iter()
        .map(|signer| {
            system_instruction::transfer(
                &payer.pubkey(),
                &signer.pubkey(),
                GUARDIAN_FUNDING_LAMPORTS,
            )
        })
        .collect();
    send_tx(rpc, payer, transfers, &[]).context("fund ephemeral signer accounts")?;
    Ok(())
}

/// Derive a treasury PDA for `agent_id` owned by `payer`.
pub(super) fn treasury_pda(payer: &Keypair, agent_id: &str) -> Pubkey {
    pda(
        &[b"treasury", payer.pubkey().as_ref(), agent_id.as_bytes()],
        &ID,
    )
    .0
}

/// Create a treasury for `agent_id` with the given `policy` and return the
/// `(treasury_pubkey, created_at)` pair.
pub(super) fn setup_treasury(
    rpc: &RpcClient,
    payer: &Keypair,
    agent_id: &str,
    policy: aura_policy::PolicyConfig,
) -> anyhow::Result<(Pubkey, i64)> {
    let created_at = now_unix();
    let treasury = treasury_pda(payer, agent_id);
    send_tx(
        rpc,
        payer,
        vec![create_treasury_ix(
            payer, treasury, agent_id, created_at, policy,
        )],
        &[],
    )
    .with_context(|| format!("create_treasury '{agent_id}'"))?;
    activate_treasury(rpc, payer, treasury, created_at + 1)
        .with_context(|| format!("activate_treasury '{agent_id}'"))?;
    Ok((treasury, created_at))
}

/// Run the confidential proposal cycle.
///
/// If the proposal survives the public precheck, this waits for the FHE output
/// ciphertext, requests decryption, waits for the plaintext, and confirms the
/// result. If the public precheck denies immediately, there is no policy output
/// ciphertext, so the pending decision is returned as-is without decryption.
pub(super) async fn run_confidential_cycle(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    daily_limit: u64,
    per_tx_limit: u64,
    spent_today: u64,
    amount: u64,
    created_at: i64,
    // Added to `created_at` to avoid nonce collisions between consecutive
    // calls on the same treasury.
    time_offset: i64,
) -> anyhow::Result<aura_core::AgentTreasury> {
    // 1 — encrypt inputs
    let daily_ct = encrypt_u64(daily_limit, &ID)
        .await
        .context("encrypt daily_limit")?;
    let per_tx_ct = encrypt_u64(per_tx_limit, &ID)
        .await
        .context("encrypt per_tx_limit")?;
    let spent_ct = encrypt_u64(spent_today, &ID)
        .await
        .context("encrypt spent_today")?;
    let amount_ct = encrypt_u64(amount, &ID).await.context("encrypt amount")?;

    // 2 — wait for all four to be verified
    wait_for_ciphertext_verified(rpc, &daily_ct)?;
    wait_for_ciphertext_verified(rpc, &per_tx_ct)?;
    wait_for_ciphertext_verified(rpc, &spent_ct)?;
    wait_for_ciphertext_verified(rpc, &amount_ct)?;

    // 3 — configure guardrails
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ConfigureConfidentialGuardrails {
                owner: payer.pubkey(),
                treasury,
                daily_limit_ciphertext: daily_ct,
                per_tx_limit_ciphertext: per_tx_ct,
                spent_today_ciphertext: spent_ct,
            }
            .to_account_metas(None),
            data: instruction::ConfigureConfidentialGuardrails {
                now: created_at + time_offset,
            }
            .data(),
        }],
        &[],
    )
    .context("configure_confidential_guardrails")?;

    // 4 — propose
    let policy_output = Keypair::new();
    let mut propose_metas = accounts::ProposeConfidentialTransaction {
        ai_authority: payer.pubkey(),
        treasury,
        daily_limit_ciphertext: daily_ct,
        per_tx_limit_ciphertext: per_tx_ct,
        spent_today_ciphertext: spent_ct,
        amount_ciphertext: amount_ct,
        policy_output_ciphertext: policy_output.pubkey(),
        encrypt_program: *encrypt_program,
        config: ep.config_pda,
        deposit: ep.deposit_pda,
        caller_program: ID,
        cpi_authority: ep.cpi_authority,
        network_encryption_key: ep.network_key_pda,
        event_authority: ep.event_authority,
        external_liveness: None,
        weekly_limit_ciphertext: None,
        weekly_spent_ciphertext: None,
        confidential_guardrails: None,
        system_program: SYSTEM_PROGRAM_ID,
    }
    .to_account_metas(None);
    mark_account_meta_signer(&mut propose_metas, policy_output.pubkey())?;
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: propose_metas,
            data: instruction::ProposeConfidentialTransaction {
                args: ProposeConfidentialTransactionArgs {
                    amount_usd: amount,
                    target_chain: 2,
                    tx_type: 0,
                    protocol_id: None,
                    current_timestamp: created_at + time_offset + 1,
                    expected_output_usd: None,
                    actual_output_usd: None,
                    quote_age_secs: None,
                    counterparty_risk_score: None,
                    recipient_or_contract: payer.pubkey().to_string(),
                },
            }
            .data(),
        }],
        &[&policy_output],
    )
    .context("propose_confidential_transaction")?;

    let proposed = fetch_treasury_domain(rpc, &treasury)?;
    let needs_policy_decryption = proposed
        .pending
        .as_ref()
        .map(|pending| pending.policy_output_ciphertext_account.is_some())
        .unwrap_or(false);
    if !needs_policy_decryption {
        return Ok(proposed);
    }

    // 5 — wait for output ciphertext
    wait_for_ciphertext_verified(rpc, &policy_output.pubkey())?;

    // 6 — request decryption
    let request_account = Keypair::new();
    let mut req_metas = accounts::RequestPolicyDecryption {
        operator: payer.pubkey(),
        treasury,
        request_account: request_account.pubkey(),
        ciphertext: policy_output.pubkey(),
        encrypt_program: *encrypt_program,
        config: ep.config_pda,
        deposit: ep.deposit_pda,
        caller_program: ID,
        cpi_authority: ep.cpi_authority,
        network_encryption_key: ep.network_key_pda,
        event_authority: ep.event_authority,
        system_program: SYSTEM_PROGRAM_ID,
    }
    .to_account_metas(None);
    mark_account_meta_signer(&mut req_metas, request_account.pubkey())?;
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: req_metas,
            data: instruction::RequestPolicyDecryption {
                now: created_at + time_offset + 2,
            }
            .data(),
        }],
        &[&request_account],
    )
    .context("request_policy_decryption")?;

    // 7 — wait for plaintext
    wait_for_decryption_ready(rpc, &request_account.pubkey())
        .context("decryption did not complete")?;

    // 8 — confirm
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ConfirmPolicyDecryption {
                operator: payer.pubkey(),
                treasury,
                request_account: request_account.pubkey(),
            }
            .to_account_metas(None),
            data: instruction::ConfirmPolicyDecryption {
                now: created_at + time_offset + 3,
            }
            .data(),
        }],
        &[],
    )
    .context("confirm_policy_decryption")?;

    fetch_treasury_domain(rpc, &treasury)
}

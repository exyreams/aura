//! Treasury administration smoke scenarios (doc 01 — CRUD completion).
//!
//! Exercises the in-treasury update/delete instructions against devnet and
//! asserts the resulting domain state. Standalone-PDA edits (operator role, fee
//! recipient, session key, address list, exposure group, swarm pool) are
//! covered by the program tests + account constraints; here we cover the
//! treasury-domain-observable operations end-to-end.

use super::{harness::*, prelude::*};

/// [13] Treasury administration — `update_treasury_metadata` + recipient limit
/// set/remove.
pub(super) async fn scenario_treasury_administration(
    rpc: &RpcClient,
    payer: &Keypair,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[13] Treasury administration (metadata + recipient limits)");
    let agent_id = format!("pol-admin-{seed}");
    let (treasury, created_at) =
        setup_treasury(rpc, payer, &agent_id, aura_policy::PolicyConfig::default())?;

    // update_treasury_metadata — change ttl + high-risk settings in place.
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::OwnerTreasury {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::UpdateTreasuryMetadata {
                args: UpdateTreasuryMetadataArgs {
                    pending_transaction_ttl_secs: Some(1_800),
                    high_risk_threshold: Some(90),
                    high_risk_require_guardian: Some(true),
                    sanctions_check_enabled: None,
                    now: created_at + 1,
                },
            }
            .data(),
        }],
        &[],
    )?;
    let domain = fetch_treasury_domain(rpc, &treasury)?;
    ensure!(
        domain.pending_transaction_ttl_secs == 1_800,
        "[13] ttl not updated"
    );
    ensure!(domain.high_risk_threshold == 90, "[13] threshold not updated");
    ensure!(
        domain.high_risk_require_guardian,
        "[13] guardian flag not set"
    );
    println!("  ✓ metadata updated in place");

    // set_recipient_limit — add a per-recipient cap.
    let recipient = "0xc0ffee00000000000000000000000000000c0ffee".to_string();
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::OwnerTreasury {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::SetRecipientLimit {
                args: SetRecipientLimitArgs {
                    chain: 1,
                    address: recipient.clone(),
                    daily_limit_usd: 500,
                    per_tx_limit_usd: Some(100),
                    now: created_at + 2,
                },
            }
            .data(),
        }],
        &[],
    )?;
    ensure!(
        fetch_treasury_domain(rpc, &treasury)?
            .policy_config
            .recipient_limits
            .iter()
            .any(|limit| limit.address == recipient),
        "[13] recipient limit missing after set"
    );
    println!("  ✓ recipient limit set");

    // remove_recipient_limit — drop it again.
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::OwnerTreasury {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::RemoveRecipientLimit {
                chain: 1,
                address: recipient.clone(),
                now: created_at + 3,
            }
            .data(),
        }],
        &[],
    )?;
    ensure!(
        !fetch_treasury_domain(rpc, &treasury)?
            .policy_config
            .recipient_limits
            .iter()
            .any(|limit| limit.address == recipient),
        "[13] recipient limit still present after remove"
    );
    println!("  ✓ recipient limit removed");

    Ok(())
}

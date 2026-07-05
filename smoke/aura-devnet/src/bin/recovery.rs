//! Devnet smoke checks for custody recovery & break-glass.
//!
//! Tests:
//!   1. `register_recovery_destination` — stores a per-chain cold-wallet address.
//!   2. Timelock: a second registration within the lock window fails on-chain
//!      (`RecoveryTimelockActive`).
//!   3. `emergency_shutdown` transitions the treasury to Decommissioning.
//!   4. Shutdown immutability: `register_recovery_destination` is rejected during
//!      active shutdown (`RecoveryDestinationImmutable`).
//!   5. `break_glass_recover` — creates a pending proposal forced to the registered
//!      address, bypassing AI authority and spend limits.
//!   6. `break_glass_transfer_authority` — transfers a fresh live dWallet away
//!      from Aura CPI authority after shutdown activation.

use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{
    accounts, constants::RECOVERY_ACTIVATION_SECS, instruction, BreakGlassRecoverArgs,
    BreakGlassTransferAuthorityArgs, RegisterRecoveryDestinationArgs, TreasuryAccount,
    DWALLET_CPI_AUTHORITY_SEED, ID,
};
use aura_devnet::{
    activate_treasury, connect_dwallet_client, create_treasury_ix, devnet_rpc,
    fetch_treasury_domain, load_payer, now_unix, pda, provision_dwallet, send_tx,
    transfer_dwallet_authority,
};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: ID,
        accounts,
        data,
    }
}

fn unique_agent_id(prefix: &str, now: i64) -> String {
    let suffix = Keypair::new().pubkey().to_string();
    format!("{prefix}-{now}-{}", &suffix[..8])
}

fn create_active_treasury(
    rpc: &RpcClient,
    payer: &Keypair,
    prefix: &str,
    now: i64,
) -> anyhow::Result<Pubkey> {
    let agent_id = unique_agent_id(prefix, now);
    let treasury = pda(
        &[b"treasury", payer.pubkey().as_ref(), agent_id.as_bytes()],
        &ID,
    )
    .0;
    send_tx(
        rpc,
        payer,
        vec![create_treasury_ix(
            payer,
            treasury,
            &agent_id,
            now,
            aura_policy::PolicyConfig::default(),
        )],
        &[],
    )?;
    activate_treasury(rpc, payer, treasury, now + 1)?;
    Ok(treasury)
}

fn fetch_treasury_account(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<TreasuryAccount> {
    let info = rpc.get_account(addr)?;
    Ok(TreasuryAccount::try_deserialize(&mut info.data.as_slice())?)
}

fn register_recovery_destination(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    chain: u8,
    address: &str,
    now: i64,
) -> anyhow::Result<()> {
    let sig = send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::RecoveryConfig {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            instruction::RegisterRecoveryDestination {
                args: RegisterRecoveryDestinationArgs {
                    chain,
                    address: address.to_string(),
                    now,
                },
            }
            .data(),
        )],
        &[],
    )?;
    println!("  tx: {sig}");
    Ok(())
}

fn emergency_shutdown(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    let sig = send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::OwnerTreasury {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            instruction::EmergencyShutdown {
                recovery_pubkey: payer.pubkey(),
                now,
            }
            .data(),
        )],
        &[],
    )?;
    println!("  tx: {sig}");
    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    const ETH: u8 = 1;
    const RECOVERY_ADDR: &str = "0xCO1D000000000000000000000000000000000001";
    const REDIRECT_ADDR: &str = "0xEEEE000000000000000000000000000000000002";

    // [1] register_recovery_destination

    println!("\n[1] register_recovery_destination — first registration is immediate");
    let treasury = create_active_treasury(&rpc, &payer, "rec", seed)?;

    register_recovery_destination(&rpc, &payer, treasury, ETH, RECOVERY_ADDR, seed + 5)?;

    let acct = fetch_treasury_account(&rpc, &treasury)?;
    let dest = acct
        .recovery_destinations
        .iter()
        .find(|d| d.chain == ETH)
        .ok_or_else(|| anyhow::anyhow!("recovery destination not stored for ETH"))?;
    anyhow::ensure!(
        dest.address == RECOVERY_ADDR,
        "recovery address mismatch: got {}",
        dest.address
    );
    println!("  ok recovery destination stored: {RECOVERY_ADDR}");

    // [2] timelock rejects change within lock window

    println!("\n[2] RecoveryTimelockActive — change within lock window is rejected on-chain");
    let redirect_result = register_recovery_destination(
        &rpc,
        &payer,
        treasury,
        ETH,
        REDIRECT_ADDR,
        seed + 6, // well within the 48-hour lock
    );
    anyhow::ensure!(
        redirect_result.is_err(),
        "changing recovery destination within lock window should have failed"
    );
    // Verify address is unchanged
    let acct = fetch_treasury_account(&rpc, &treasury)?;
    anyhow::ensure!(
        acct.recovery_destinations
            .iter()
            .find(|d| d.chain == ETH)
            .map(|d| d.address.as_str())
            == Some(RECOVERY_ADDR),
        "recovery address was changed despite timelock"
    );
    println!("  ok RecoveryTimelockActive returned; original address preserved");

    // [3] emergency_shutdown

    println!("\n[3] emergency_shutdown — treasury enters Decommissioning");
    let shutdown_now = seed + 10;
    emergency_shutdown(&rpc, &payer, treasury, shutdown_now)?;

    let domain = fetch_treasury_domain(&rpc, &treasury)?;
    anyhow::ensure!(
        domain.shutdown_initiated_at == Some(shutdown_now),
        "shutdown_initiated_at not set"
    );
    anyhow::ensure!(
        domain.execution_paused,
        "execution not paused after shutdown"
    );
    println!("  ok treasury in Decommissioning, execution_paused=true, shutdown_at={shutdown_now}");

    // [4] registration blocked during shutdown

    println!("\n[4] RecoveryDestinationImmutable — registration blocked during active shutdown");
    let immutable_result =
        register_recovery_destination(&rpc, &payer, treasury, ETH, REDIRECT_ADDR, shutdown_now + 1);
    anyhow::ensure!(
        immutable_result.is_err(),
        "registration during shutdown should have failed"
    );
    println!("  ok RecoveryDestinationImmutable returned during shutdown");

    // [5] break_glass_recover

    println!(
        "\n[5] break_glass_recover — creates pending sweep after shutdown + activation window"
    );

    // Supply now = shutdown_at + RECOVERY_ACTIVATION_SECS + 1 to satisfy the
    // activation check without waiting a real hour on devnet.
    let break_glass_now = shutdown_now.saturating_add(RECOVERY_ACTIVATION_SECS) + 1;

    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::BreakGlassRecover { owner, treasury }.to_account_metas(None),
            instruction::BreakGlassRecover {
                args: BreakGlassRecoverArgs {
                    chain: ETH,
                    amount_usd: 500,
                    now: break_glass_now,
                },
            }
            .data(),
        )],
        &[],
    )?;
    println!("  tx: {sig}");

    let domain = fetch_treasury_domain(&rpc, &treasury)?;
    let pending = domain
        .pending
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("no pending proposal after break_glass_recover"))?;
    anyhow::ensure!(
        pending.recipient_or_contract == RECOVERY_ADDR,
        "pending recipient is not the registered recovery address: {}",
        pending.recipient_or_contract
    );
    anyhow::ensure!(
        pending.amount_usd == 500,
        "pending amount_usd mismatch: {}",
        pending.amount_usd
    );
    anyhow::ensure!(
        pending.decision.approved,
        "break-glass pending proposal should be pre-approved"
    );
    println!(
        "  ok break_glass_recover pending proposal #{} → {} (500 usd, pre-approved)",
        pending.proposal_id, pending.recipient_or_contract
    );

    // [6] break_glass_transfer_authority

    println!("\n[6] break_glass_transfer_authority — live dWallet CPI transfer");
    let treasury2 = create_active_treasury(&rpc, &payer, "rec-transfer", seed + 100)?;
    let shutdown2_now = seed + 110;
    emergency_shutdown(&rpc, &payer, treasury2, shutdown2_now)?;

    let dwallet_program: Pubkey = aura_core::DWALLET_DEVNET_PROGRAM_ID.parse()?;
    let mut dwallet_client = connect_dwallet_client().await?;
    let live = provision_dwallet(&rpc, &payer, &mut dwallet_client, &dwallet_program).await?;
    transfer_dwallet_authority(&rpc, &payer, &dwallet_program, &live.dwallet_pda)?;

    let new_authority = Keypair::new().pubkey();
    let (cpi_authority, _) = pda(&[DWALLET_CPI_AUTHORITY_SEED], &ID);
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::BreakGlassTransferAuthority {
                owner,
                treasury: treasury2,
                dwallet: live.dwallet_pda,
                caller_program: ID,
                cpi_authority,
                dwallet_program,
            }
            .to_account_metas(None),
            instruction::BreakGlassTransferAuthority {
                args: BreakGlassTransferAuthorityArgs {
                    chain: ETH,
                    new_authority,
                    now: shutdown2_now.saturating_add(RECOVERY_ACTIVATION_SECS) + 1,
                },
            }
            .data(),
        )],
        &[],
    )?;
    println!("  tx: {sig}");
    println!("  ok live dWallet authority transferred to {new_authority}");

    println!("\ncustody recovery smoke checks passed on devnet.");
    Ok(())
}

//! Devnet smoke checks for successful protocol-config commit boundary.

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{accounts, constants, instruction, ProtocolConfigAccount, ProtocolConfigArgs, ID};
use aura_devnet::{devnet_rpc, load_payer, now_unix, pda, send_tx};
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

fn fetch_config(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<ProtocolConfigAccount> {
    let info = rpc.get_account(addr)?;
    Ok(ProtocolConfigAccount::try_deserialize(
        &mut info.data.as_slice(),
    )?)
}

fn config_args(authority: Pubkey, recipient: Pubkey, fee_bps: u64) -> ProtocolConfigArgs {
    ProtocolConfigArgs {
        protocol_authority: authority,
        protocol_recipient: recipient,
        protocol_fee_bps: fee_bps,
        creation_fee_usd: 175,
        min_integrator_bps: 0,
        max_integrator_bps: 80,
        settlement_asset: 0,
        enabled: true,
    }
}

fn init_if_missing(
    rpc: &RpcClient,
    payer: &Keypair,
    protocol_config: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    if rpc.get_account(&protocol_config).is_ok() {
        return Ok(());
    }
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::InitProtocolConfig {
                payer: payer.pubkey(),
                protocol_config,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitProtocolConfig {
                args: config_args(payer.pubkey(), payer.pubkey(), 10),
                now,
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    let protocol_config = pda(&[constants::PROTOCOL_CONFIG_SEED], &ID).0;
    println!("\n[protocol config] init or reuse singleton");
    init_if_missing(&rpc, &payer, protocol_config, seed + 1)?;
    let config = fetch_config(&rpc, &protocol_config)?;
    anyhow::ensure!(
        config.protocol_authority == owner,
        "protocol config authority is {}; this smoke requires payer authority {owner}",
        config.protocol_authority
    );
    println!("  ok protocol config authority matches payer");

    println!("\n[protocol config] stage update and reject early commit");
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ProtocolConfigAuthority {
                authority: owner,
                protocol_config,
            }
            .to_account_metas(None),
            instruction::UpdateProtocolConfig {
                args: config_args(owner, owner, 30),
                now: seed + 2,
            }
            .data(),
        )],
        &[],
    )?;
    let config = fetch_config(&rpc, &protocol_config)?;
    let pending = config
        .pending
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("protocol update was not staged"))?;
    anyhow::ensure!(
        pending.executable_after == seed + 2 + constants::PROTOCOL_CONFIG_UPDATE_TIMELOCK_SECS,
        "protocol update timelock mismatch"
    );
    let early = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ProtocolConfigAuthority {
                authority: owner,
                protocol_config,
            }
            .to_account_metas(None),
            instruction::CommitProtocolConfig { now: seed + 3 }.data(),
        )],
        &[],
    );
    anyhow::ensure!(early.is_err(), "early protocol commit should reject");
    println!("  ok early commit rejected");

    println!("\n[protocol config] commit exactly at timelock boundary");
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ProtocolConfigAuthority {
                authority: owner,
                protocol_config,
            }
            .to_account_metas(None),
            instruction::CommitProtocolConfig {
                now: pending.executable_after,
            }
            .data(),
        )],
        &[],
    )?;
    let config = fetch_config(&rpc, &protocol_config)?;
    anyhow::ensure!(
        config.protocol_fee_bps == 30
            && config.creation_fee_usd == 175
            && config.max_integrator_bps == 80
            && config.pending.is_none()
            && config.updated_at == pending.executable_after,
        "protocol config commit did not apply staged values"
    );
    println!("  ok protocol config committed and pending cleared");

    println!("\nprotocol-config commit smoke checks passed on devnet.");
    Ok(())
}

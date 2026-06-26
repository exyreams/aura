//! Client send-helpers for dWallet registration, controls, balances, spend
//! reservations, and per-chain execution profiles.

use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signature, Signer},
};

use super::{ensure_signer_matches, AuraClient};
use crate::{
    instructions,
    types::{
        ChainProfileArgs, RefreshVerifiedAssetBalanceArgs, RegisterDwalletArgs,
        SetAssetOracleFeedArgs,
    },
    SdkError,
};

impl AuraClient {
    /// Builds `register_dwallet`.
    pub fn register_dwallet_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        args: RegisterDwalletArgs,
    ) -> Instruction {
        let accounts = aura_core::accounts::RegisterDwallet { owner, treasury };
        self.with_program_id(instructions::dwallet::register_dwallet(accounts, args))
    }

    /// Submits `register_dwallet`.
    pub fn register_dwallet(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        args: RegisterDwalletArgs,
    ) -> Result<Signature, SdkError> {
        let instruction = self.register_dwallet_instruction(owner.pubkey(), treasury, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `refresh_dwallet_balance`.
    pub fn refresh_dwallet_balance_instruction(
        &self,
        accounts: aura_core::accounts::RefreshDwalletBalance,
        chain_code: u8,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::refresh_dwallet_balance(
            accounts, chain_code, now,
        ))
    }

    /// Submits `refresh_dwallet_balance`.
    pub fn refresh_dwallet_balance(
        &self,
        payer: &Keypair,
        accounts: aura_core::accounts::RefreshDwalletBalance,
        chain_code: u8,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction = self.refresh_dwallet_balance_instruction(accounts, chain_code, now);
        self.send_instructions(payer, vec![instruction], &[])
    }

    /// Builds `init_dwallet_state`.
    pub fn init_dwallet_state_instruction(
        &self,
        accounts: aura_core::accounts::InitDwalletState,
        chain: u8,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::init_dwallet_state(
            accounts, chain, now,
        ))
    }

    /// Submits `init_dwallet_state`.
    pub fn init_dwallet_state(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::InitDwalletState,
        chain: u8,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.init_dwallet_state_instruction(accounts, chain, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `set_dwallet_status`.
    pub fn set_dwallet_status_instruction(
        &self,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        status_code: u8,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::set_dwallet_status(
            accounts,
            chain,
            status_code,
            now,
        ))
    }

    /// Submits `set_dwallet_status`.
    pub fn set_dwallet_status(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        status_code: u8,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.set_dwallet_status_instruction(accounts, chain, status_code, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `set_dwallet_limits`.
    pub fn set_dwallet_limits_instruction(
        &self,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        daily_limit_usd: Option<u64>,
        per_tx_limit_usd: Option<u64>,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::set_dwallet_limits(
            accounts,
            chain,
            daily_limit_usd,
            per_tx_limit_usd,
            now,
        ))
    }

    /// Submits `set_dwallet_limits`.
    pub fn set_dwallet_limits(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        daily_limit_usd: Option<u64>,
        per_tx_limit_usd: Option<u64>,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.set_dwallet_limits_instruction(
            accounts,
            chain,
            daily_limit_usd,
            per_tx_limit_usd,
            now,
        );
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `set_dwallet_label`.
    pub fn set_dwallet_label_instruction(
        &self,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        label: Option<String>,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::set_dwallet_label(
            accounts, chain, label, now,
        ))
    }

    /// Submits `set_dwallet_label`.
    pub fn set_dwallet_label(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        label: Option<String>,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.set_dwallet_label_instruction(accounts, chain, label, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `rotate_dwallet_authority`.
    pub fn rotate_dwallet_authority_instruction(
        &self,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        new_authority: Pubkey,
        new_cpi_authority_seed: String,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::rotate_dwallet_authority(
            accounts,
            chain,
            new_authority,
            new_cpi_authority_seed,
            now,
        ))
    }

    /// Submits `rotate_dwallet_authority`.
    pub fn rotate_dwallet_authority(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        new_authority: Pubkey,
        new_cpi_authority_seed: String,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.rotate_dwallet_authority_instruction(
            accounts,
            chain,
            new_authority,
            new_cpi_authority_seed,
            now,
        );
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `set_default_chain`.
    pub fn set_default_chain_instruction(
        &self,
        accounts: aura_core::accounts::SetDefaultChain,
        chain: Option<u8>,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::set_default_chain(
            accounts, chain, now,
        ))
    }

    /// Submits `set_default_chain`.
    pub fn set_default_chain(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::SetDefaultChain,
        chain: Option<u8>,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.set_default_chain_instruction(accounts, chain, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `remove_dwallet`.
    pub fn remove_dwallet_instruction(
        &self,
        accounts: aura_core::accounts::RemoveDwallet,
        chain: u8,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::remove_dwallet(accounts, chain, now))
    }

    /// Submits `remove_dwallet`.
    pub fn remove_dwallet(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::RemoveDwallet,
        chain: u8,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.remove_dwallet_instruction(accounts, chain, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `refresh_asset_balance`.
    #[allow(clippy::too_many_arguments)]
    pub fn refresh_asset_balance_instruction(
        &self,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        asset_id: String,
        symbol: String,
        decimals: u8,
        native_amount: u128,
        usd_value: u64,
        feed: Option<Pubkey>,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::refresh_asset_balance(
            accounts,
            chain,
            asset_id,
            symbol,
            decimals,
            native_amount,
            usd_value,
            feed,
            now,
        ))
    }

    /// Submits `refresh_asset_balance`.
    #[allow(clippy::too_many_arguments)]
    pub fn refresh_asset_balance(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        asset_id: String,
        symbol: String,
        decimals: u8,
        native_amount: u128,
        usd_value: u64,
        feed: Option<Pubkey>,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.refresh_asset_balance_instruction(
            accounts,
            chain,
            asset_id,
            symbol,
            decimals,
            native_amount,
            usd_value,
            feed,
            now,
        );
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `record_deposit`.
    #[allow(clippy::too_many_arguments)]
    pub fn record_deposit_instruction(
        &self,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        asset_id: String,
        symbol: String,
        decimals: u8,
        native_amount: u128,
        usd_value: u64,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::record_deposit(
            accounts,
            chain,
            asset_id,
            symbol,
            decimals,
            native_amount,
            usd_value,
            now,
        ))
    }

    /// Submits `record_deposit`.
    #[allow(clippy::too_many_arguments)]
    pub fn record_deposit(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        asset_id: String,
        symbol: String,
        decimals: u8,
        native_amount: u128,
        usd_value: u64,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.record_deposit_instruction(
            accounts,
            chain,
            asset_id,
            symbol,
            decimals,
            native_amount,
            usd_value,
            now,
        );
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `set_asset_feed`.
    pub fn set_asset_feed_instruction(
        &self,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        asset_id: String,
        feed: Option<Pubkey>,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::set_asset_feed(
            accounts, chain, asset_id, feed, now,
        ))
    }

    /// Submits `set_asset_feed`.
    pub fn set_asset_feed(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        asset_id: String,
        feed: Option<Pubkey>,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.set_asset_feed_instruction(accounts, chain, asset_id, feed, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `set_asset_oracle_feed`.
    pub fn set_asset_oracle_feed_instruction(
        &self,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        args: SetAssetOracleFeedArgs,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::set_asset_oracle_feed(
            accounts, chain, args,
        ))
    }

    /// Submits `set_asset_oracle_feed`.
    pub fn set_asset_oracle_feed(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        args: SetAssetOracleFeedArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.set_asset_oracle_feed_instruction(accounts, chain, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `refresh_verified_asset_balance`.
    pub fn refresh_verified_asset_balance_instruction(
        &self,
        accounts: aura_core::accounts::RefreshVerifiedAssetBalance,
        args: RefreshVerifiedAssetBalanceArgs,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::refresh_verified_asset_balance(
            accounts, args,
        ))
    }

    /// Submits `refresh_verified_asset_balance`.
    pub fn refresh_verified_asset_balance(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::RefreshVerifiedAssetBalance,
        args: RefreshVerifiedAssetBalanceArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.refresh_verified_asset_balance_instruction(accounts, args);
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `reconcile_dwallet_balance`.
    pub fn reconcile_dwallet_balance_instruction(
        &self,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::reconcile_dwallet_balance(
            accounts, chain, now,
        ))
    }

    /// Submits `reconcile_dwallet_balance`.
    pub fn reconcile_dwallet_balance(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::DwalletControl,
        chain: u8,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.reconcile_dwallet_balance_instruction(accounts, chain, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `reserve_dwallet_spend`.
    pub fn reserve_dwallet_spend_instruction(
        &self,
        accounts: aura_core::accounts::DwalletSpend,
        chain: u8,
        amount_usd: u64,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::reserve_dwallet_spend(
            accounts, chain, amount_usd, now,
        ))
    }

    /// Submits `reserve_dwallet_spend`.
    pub fn reserve_dwallet_spend(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::DwalletSpend,
        chain: u8,
        amount_usd: u64,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.reserve_dwallet_spend_instruction(accounts, chain, amount_usd, now);
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `settle_dwallet_spend`.
    pub fn settle_dwallet_spend_instruction(
        &self,
        accounts: aura_core::accounts::DwalletSpend,
        chain: u8,
        amount_usd: u64,
        asset_id: String,
        native_amount: u128,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::settle_dwallet_spend(
            accounts,
            chain,
            amount_usd,
            asset_id,
            native_amount,
            now,
        ))
    }

    /// Submits `settle_dwallet_spend`.
    #[allow(clippy::too_many_arguments)]
    pub fn settle_dwallet_spend(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::DwalletSpend,
        chain: u8,
        amount_usd: u64,
        asset_id: String,
        native_amount: u128,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.settle_dwallet_spend_instruction(
            accounts,
            chain,
            amount_usd,
            asset_id,
            native_amount,
            now,
        );
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `release_dwallet_spend`.
    pub fn release_dwallet_spend_instruction(
        &self,
        accounts: aura_core::accounts::DwalletSpend,
        chain: u8,
        amount_usd: u64,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::release_dwallet_spend(
            accounts, chain, amount_usd, now,
        ))
    }

    /// Submits `release_dwallet_spend`.
    pub fn release_dwallet_spend(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::DwalletSpend,
        chain: u8,
        amount_usd: u64,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.release_dwallet_spend_instruction(accounts, chain, amount_usd, now);
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `register_chain_profile`.
    pub fn register_chain_profile_instruction(
        &self,
        accounts: aura_core::accounts::RegisterChainProfile,
        args: ChainProfileArgs,
    ) -> Instruction {
        self.with_program_id(instructions::chain_profiles::register_chain_profile(
            accounts, args,
        ))
    }

    /// Submits `register_chain_profile`.
    pub fn register_chain_profile(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::RegisterChainProfile,
        args: ChainProfileArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.register_chain_profile_instruction(accounts, args);
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `update_chain_profile`.
    pub fn update_chain_profile_instruction(
        &self,
        accounts: aura_core::accounts::UpdateChainProfile,
        args: ChainProfileArgs,
    ) -> Instruction {
        self.with_program_id(instructions::chain_profiles::update_chain_profile(
            accounts, args,
        ))
    }

    /// Submits `update_chain_profile`.
    pub fn update_chain_profile(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::UpdateChainProfile,
        args: ChainProfileArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.update_chain_profile_instruction(accounts, args);
        self.send_instructions(authority, vec![instruction], &[])
    }
}

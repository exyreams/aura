//! PDA derivation helpers for AURA and its CPI integrations.

use solana_sdk::pubkey::Pubkey;

use crate::constants::{
    DWALLET_CPI_AUTHORITY_SEED, ENCRYPT_CPI_AUTHORITY_SEED, ENCRYPT_EVENT_AUTHORITY_SEED,
    MESSAGE_APPROVAL_SEED, TREASURY_SEED,
};

/// Derives the treasury PDA for the given owner and agent ID.
pub fn derive_treasury_pda(owner: &Pubkey, agent_id: &str, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[TREASURY_SEED, owner.as_ref(), agent_id.as_bytes()],
        program_id,
    )
}

/// Derives the global dWallet CPI authority PDA used by live-signing instructions.
pub fn derive_dwallet_cpi_authority_pda(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[DWALLET_CPI_AUTHORITY_SEED], program_id)
}

/// Derives the global Encrypt CPI authority PDA used by confidential instructions.
pub fn derive_encrypt_cpi_authority_pda(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[ENCRYPT_CPI_AUTHORITY_SEED], program_id)
}

/// Derives the Encrypt event authority PDA for a specific Encrypt program.
pub fn derive_encrypt_event_authority_pda(encrypt_program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[ENCRYPT_EVENT_AUTHORITY_SEED], encrypt_program_id)
}

/// Derives the legacy dWallet message approval PDA.
pub fn derive_message_approval_pda(
    dwallet_program_id: &Pubkey,
    dwallet_account: &Pubkey,
    message_digest: &[u8; 32],
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            MESSAGE_APPROVAL_SEED,
            dwallet_account.as_ref(),
            message_digest,
        ],
        dwallet_program_id,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn treasury_pda_is_deterministic() {
        let program_id = crate::AURA_DEVNET_PROGRAM_ID;
        let owner = Pubkey::new_unique();
        let (a, bump_a) = derive_treasury_pda(&owner, "agent", &program_id);
        let (b, bump_b) = derive_treasury_pda(&owner, "agent", &program_id);
        assert_eq!(a, b);
        assert_eq!(bump_a, bump_b);
    }

    #[test]
    fn authority_pdas_are_deterministic() {
        let program_id = crate::AURA_DEVNET_PROGRAM_ID;
        let (dwallet_a, dwallet_bump_a) = derive_dwallet_cpi_authority_pda(&program_id);
        let (dwallet_b, dwallet_bump_b) = derive_dwallet_cpi_authority_pda(&program_id);
        let (encrypt_a, encrypt_bump_a) = derive_encrypt_cpi_authority_pda(&program_id);
        let (encrypt_b, encrypt_bump_b) = derive_encrypt_cpi_authority_pda(&program_id);
        assert_eq!(dwallet_a, dwallet_b);
        assert_eq!(dwallet_bump_a, dwallet_bump_b);
        assert_eq!(encrypt_a, encrypt_b);
        assert_eq!(encrypt_bump_a, encrypt_bump_b);
    }
}

//! PDA derivation helpers for AURA and its CPI integrations.

use solana_sdk::pubkey::Pubkey;

use crate::constants::{
    BATCH_PROPOSAL_SEED, BUDGET_ENVELOPE_SEED, DWALLET_CPI_AUTHORITY_SEED, DWALLET_SEED,
    ENCRYPT_CPI_AUTHORITY_SEED, ENCRYPT_EVENT_AUTHORITY_SEED, EXPOSURE_GROUP_SEED,
    EXTERNAL_LIVENESS_SEED, INVARIANT_REPORT_SEED, MESSAGE_APPROVAL_SEED, OPERATOR_ROLE_SEED,
    POLICY_ATTESTATION_SEED, POLICY_RECEIPT_SEED, POLICY_SIMULATION_SEED, TREASURY_SEED,
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

fn u64_le(value: u64) -> [u8; 8] {
    value.to_le_bytes()
}

fn u16_le(value: u16) -> [u8; 2] {
    value.to_le_bytes()
}

/// Derives the current dWallet message approval PDA.
///
/// Seeds:
/// `[b"dwallet", <curve_code_le + public_key chunks...>, b"message_approval",
///   <signature_scheme_code_le>, message_digest, optional message_metadata_digest]`.
pub fn derive_message_approval_pda(
    dwallet_program_id: &Pubkey,
    curve_code: u16,
    public_key: &[u8],
    signature_scheme_code: u16,
    message_digest: &[u8; 32],
    message_metadata_digest: Option<&[u8; 32]>,
) -> (Pubkey, u8) {
    assert!(!public_key.is_empty(), "public_key must not be empty");

    let mut payload = Vec::with_capacity(2 + public_key.len());
    payload.extend_from_slice(&u16_le(curve_code));
    payload.extend_from_slice(public_key);

    let mut owned_seeds = Vec::with_capacity(8);
    owned_seeds.push(DWALLET_SEED.to_vec());
    for chunk in payload.chunks(32) {
        owned_seeds.push(chunk.to_vec());
    }
    owned_seeds.push(MESSAGE_APPROVAL_SEED.to_vec());
    owned_seeds.push(u16_le(signature_scheme_code).to_vec());
    owned_seeds.push(message_digest.to_vec());
    if message_metadata_digest.is_some_and(|digest| digest.iter().any(|byte| *byte != 0)) {
        owned_seeds.push(message_metadata_digest.expect("checked").to_vec());
    }

    let seed_refs = owned_seeds.iter().map(Vec::as_slice).collect::<Vec<_>>();
    Pubkey::find_program_address(&seed_refs, dwallet_program_id)
}

/// Derives a policy simulation result PDA.
pub fn derive_policy_simulation_pda(
    treasury: &Pubkey,
    simulation_id: u64,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            POLICY_SIMULATION_SEED,
            treasury.as_ref(),
            &u64_le(simulation_id),
        ],
        program_id,
    )
}

/// Derives a policy receipt PDA.
pub fn derive_policy_receipt_pda(
    treasury: &Pubkey,
    proposal_id: u64,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[POLICY_RECEIPT_SEED, treasury.as_ref(), &u64_le(proposal_id)],
        program_id,
    )
}

/// Derives a budget envelope PDA.
pub fn derive_budget_envelope_pda(
    treasury: &Pubkey,
    envelope_id: u64,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            BUDGET_ENVELOPE_SEED,
            treasury.as_ref(),
            &u64_le(envelope_id),
        ],
        program_id,
    )
}

/// Derives an exposure group PDA.
pub fn derive_exposure_group_pda(
    authority: &Pubkey,
    group_id: &[u8; 16],
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[EXPOSURE_GROUP_SEED, authority.as_ref(), group_id],
        program_id,
    )
}

/// Derives an operator role PDA.
pub fn derive_operator_role_pda(
    treasury: &Pubkey,
    operator: &Pubkey,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[OPERATOR_ROLE_SEED, treasury.as_ref(), operator.as_ref()],
        program_id,
    )
}

/// Derives an external liveness PDA.
pub fn derive_external_liveness_pda(treasury: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[EXTERNAL_LIVENESS_SEED, treasury.as_ref()], program_id)
}

/// Derives a policy attestation PDA.
pub fn derive_policy_attestation_pda(
    treasury: &Pubkey,
    attester: &Pubkey,
    policy_version: u64,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            POLICY_ATTESTATION_SEED,
            treasury.as_ref(),
            attester.as_ref(),
            &u64_le(policy_version),
        ],
        program_id,
    )
}

/// Derives a batch proposal PDA.
pub fn derive_batch_proposal_pda(
    treasury: &Pubkey,
    batch_id: u64,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[BATCH_PROPOSAL_SEED, treasury.as_ref(), &u64_le(batch_id)],
        program_id,
    )
}

/// Derives an invariant report PDA.
pub fn derive_invariant_report_pda(
    treasury: &Pubkey,
    report_id: u64,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[INVARIANT_REPORT_SEED, treasury.as_ref(), &u64_le(report_id)],
        program_id,
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

    #[test]
    fn message_approval_pda_uses_current_dwallet_seed_layout() {
        let dwallet_program_id = crate::DWALLET_DEVNET_PROGRAM_ID;
        let public_key = [7_u8; 65];
        let digest = [9_u8; 32];
        let metadata_digest = [3_u8; 32];

        let (derived, bump) = derive_message_approval_pda(
            &dwallet_program_id,
            0,
            &public_key,
            5,
            &digest,
            Some(&metadata_digest),
        );

        let mut payload = Vec::new();
        payload.extend_from_slice(&0_u16.to_le_bytes());
        payload.extend_from_slice(&public_key);
        let mut owned_seeds = vec![DWALLET_SEED.to_vec()];
        for chunk in payload.chunks(32) {
            owned_seeds.push(chunk.to_vec());
        }
        owned_seeds.push(MESSAGE_APPROVAL_SEED.to_vec());
        owned_seeds.push(5_u16.to_le_bytes().to_vec());
        owned_seeds.push(digest.to_vec());
        owned_seeds.push(metadata_digest.to_vec());
        let seed_refs = owned_seeds.iter().map(Vec::as_slice).collect::<Vec<_>>();
        let (expected, expected_bump) =
            Pubkey::find_program_address(&seed_refs, &dwallet_program_id);

        assert_eq!(derived, expected);
        assert_eq!(bump, expected_bump);
    }

    #[test]
    fn message_approval_pda_omits_zero_metadata_digest() {
        let dwallet_program_id = crate::DWALLET_DEVNET_PROGRAM_ID;
        let public_key = [7_u8; 32];
        let digest = [9_u8; 32];
        let zero_metadata_digest = [0_u8; 32];

        let omitted =
            derive_message_approval_pda(&dwallet_program_id, 2, &public_key, 5, &digest, None);
        let zero = derive_message_approval_pda(
            &dwallet_program_id,
            2,
            &public_key,
            5,
            &digest,
            Some(&zero_metadata_digest),
        );

        assert_eq!(omitted, zero);
    }

    #[test]
    fn policy_control_pdas_are_deterministic() {
        let program_id = crate::AURA_DEVNET_PROGRAM_ID;
        let treasury = Pubkey::new_unique();
        let operator = Pubkey::new_unique();
        let attester = Pubkey::new_unique();
        let authority = Pubkey::new_unique();
        let group_id = [4_u8; 16];

        assert_eq!(
            derive_policy_simulation_pda(&treasury, 7, &program_id),
            Pubkey::find_program_address(
                &[
                    POLICY_SIMULATION_SEED,
                    treasury.as_ref(),
                    &7_u64.to_le_bytes()
                ],
                &program_id,
            )
        );
        assert_eq!(
            derive_policy_receipt_pda(&treasury, 8, &program_id),
            Pubkey::find_program_address(
                &[POLICY_RECEIPT_SEED, treasury.as_ref(), &8_u64.to_le_bytes()],
                &program_id,
            )
        );
        assert_eq!(
            derive_budget_envelope_pda(&treasury, 9, &program_id),
            Pubkey::find_program_address(
                &[
                    BUDGET_ENVELOPE_SEED,
                    treasury.as_ref(),
                    &9_u64.to_le_bytes()
                ],
                &program_id,
            )
        );
        assert_eq!(
            derive_exposure_group_pda(&authority, &group_id, &program_id),
            Pubkey::find_program_address(
                &[EXPOSURE_GROUP_SEED, authority.as_ref(), &group_id],
                &program_id,
            )
        );
        assert_eq!(
            derive_operator_role_pda(&treasury, &operator, &program_id),
            Pubkey::find_program_address(
                &[OPERATOR_ROLE_SEED, treasury.as_ref(), operator.as_ref()],
                &program_id,
            )
        );
        assert_eq!(
            derive_external_liveness_pda(&treasury, &program_id),
            Pubkey::find_program_address(&[EXTERNAL_LIVENESS_SEED, treasury.as_ref()], &program_id)
        );
        assert_eq!(
            derive_policy_attestation_pda(&treasury, &attester, 10, &program_id),
            Pubkey::find_program_address(
                &[
                    POLICY_ATTESTATION_SEED,
                    treasury.as_ref(),
                    attester.as_ref(),
                    &10_u64.to_le_bytes(),
                ],
                &program_id,
            )
        );
        assert_eq!(
            derive_batch_proposal_pda(&treasury, 11, &program_id),
            Pubkey::find_program_address(
                &[
                    BATCH_PROPOSAL_SEED,
                    treasury.as_ref(),
                    &11_u64.to_le_bytes()
                ],
                &program_id,
            )
        );
        assert_eq!(
            derive_invariant_report_pda(&treasury, 12, &program_id),
            Pubkey::find_program_address(
                &[
                    INVARIANT_REPORT_SEED,
                    treasury.as_ref(),
                    &12_u64.to_le_bytes()
                ],
                &program_id,
            )
        );
    }
}

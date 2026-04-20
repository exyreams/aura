//! Helper utilities for the AURA SDK.
//!
//! This module provides input validation and other common helpers used across
//! the SDK. All limits mirror the constants in `programs/aura-core/src/constants.rs`.

use crate::constants::{
    MAX_ADDRESS_LEN, MAX_AGENT_ID_LEN, MAX_DWALLET_ID_LEN, MAX_GUARDIANS, MAX_SWARM_MEMBERS,
};
use crate::errors::SdkError;

/// Validates that an `agent_id` is non-empty and within the maximum length.
///
/// # Errors
/// Returns [`SdkError::InvalidParameter`] if the agent ID is empty or exceeds
/// [`MAX_AGENT_ID_LEN`] bytes.
pub fn validate_agent_id(agent_id: &str) -> Result<(), SdkError> {
    if agent_id.is_empty() {
        return Err(SdkError::InvalidParameter(
            "agent_id must not be empty".to_string(),
        ));
    }
    if agent_id.len() > MAX_AGENT_ID_LEN {
        return Err(SdkError::InvalidParameter(format!(
            "agent_id exceeds maximum length of {MAX_AGENT_ID_LEN} bytes"
        )));
    }
    Ok(())
}

/// Validates that a `dwallet_id` is non-empty and within the maximum length.
///
/// # Errors
/// Returns [`SdkError::InvalidParameter`] if the dWallet ID is empty or exceeds
/// [`MAX_DWALLET_ID_LEN`] bytes.
pub fn validate_dwallet_id(dwallet_id: &str) -> Result<(), SdkError> {
    if dwallet_id.is_empty() {
        return Err(SdkError::InvalidParameter(
            "dwallet_id must not be empty".to_string(),
        ));
    }
    if dwallet_id.len() > MAX_DWALLET_ID_LEN {
        return Err(SdkError::InvalidParameter(format!(
            "dwallet_id exceeds maximum length of {MAX_DWALLET_ID_LEN} bytes"
        )));
    }
    Ok(())
}

/// Validates that a blockchain address string is non-empty and within the maximum length.
///
/// # Errors
/// Returns [`SdkError::InvalidParameter`] if the address is empty or exceeds
/// [`MAX_ADDRESS_LEN`] bytes.
pub fn validate_address(address: &str) -> Result<(), SdkError> {
    if address.is_empty() {
        return Err(SdkError::InvalidParameter(
            "address must not be empty".to_string(),
        ));
    }
    if address.len() > MAX_ADDRESS_LEN {
        return Err(SdkError::InvalidParameter(format!(
            "address exceeds maximum length of {MAX_ADDRESS_LEN} bytes"
        )));
    }
    Ok(())
}

/// Validates that a transaction amount is greater than zero.
///
/// # Errors
/// Returns [`SdkError::InvalidParameter`] if `amount_usd` is zero.
pub fn validate_amount_usd(amount_usd: u64) -> Result<(), SdkError> {
    if amount_usd == 0 {
        return Err(SdkError::InvalidParameter(
            "amount_usd must be greater than zero".to_string(),
        ));
    }
    Ok(())
}

/// Validates that a multisig threshold is valid for the given guardian count.
///
/// # Errors
/// Returns [`SdkError::InvalidParameter`] if:
/// - `threshold` is zero
/// - `threshold` exceeds `guardian_count`
pub fn validate_multisig_threshold(threshold: u8, guardian_count: usize) -> Result<(), SdkError> {
    if threshold == 0 {
        return Err(SdkError::InvalidParameter(
            "multisig threshold must be greater than zero".to_string(),
        ));
    }
    if threshold as usize > guardian_count {
        return Err(SdkError::InvalidParameter(format!(
            "multisig threshold ({threshold}) must not exceed guardian count ({guardian_count})"
        )));
    }
    Ok(())
}

/// Validates that a guardian list is non-empty and within the maximum count.
///
/// # Errors
/// Returns [`SdkError::InvalidParameter`] if the list is empty or exceeds
/// [`MAX_GUARDIANS`].
pub fn validate_guardians<T>(guardians: &[T]) -> Result<(), SdkError> {
    if guardians.is_empty() {
        return Err(SdkError::InvalidParameter(
            "guardians list must not be empty".to_string(),
        ));
    }
    if guardians.len() > MAX_GUARDIANS {
        return Err(SdkError::InvalidParameter(format!(
            "guardians list exceeds maximum of {MAX_GUARDIANS} (got {})",
            guardians.len()
        )));
    }
    Ok(())
}

/// Validates that a swarm member list is non-empty and within the maximum count.
///
/// # Errors
/// Returns [`SdkError::InvalidParameter`] if the list is empty or exceeds
/// [`MAX_SWARM_MEMBERS`].
pub fn validate_swarm_members<T>(members: &[T]) -> Result<(), SdkError> {
    if members.is_empty() {
        return Err(SdkError::InvalidParameter(
            "swarm members list must not be empty".to_string(),
        ));
    }
    if members.len() > MAX_SWARM_MEMBERS {
        return Err(SdkError::InvalidParameter(format!(
            "swarm members list exceeds maximum of {MAX_SWARM_MEMBERS} (got {})",
            members.len()
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_agent_id_rejects_empty() {
        assert!(validate_agent_id("").is_err());
    }

    #[test]
    fn validate_agent_id_rejects_too_long() {
        let long_id = "a".repeat(MAX_AGENT_ID_LEN + 1);
        assert!(validate_agent_id(&long_id).is_err());
    }

    #[test]
    fn validate_agent_id_accepts_valid() {
        assert!(validate_agent_id("my-agent").is_ok());
        assert!(validate_agent_id(&"a".repeat(MAX_AGENT_ID_LEN)).is_ok());
    }

    #[test]
    fn validate_dwallet_id_rejects_empty() {
        assert!(validate_dwallet_id("").is_err());
    }

    #[test]
    fn validate_dwallet_id_rejects_too_long() {
        let long_id = "a".repeat(MAX_DWALLET_ID_LEN + 1);
        assert!(validate_dwallet_id(&long_id).is_err());
    }

    #[test]
    fn validate_dwallet_id_accepts_valid() {
        assert!(validate_dwallet_id("dwallet-1").is_ok());
        assert!(validate_dwallet_id(&"a".repeat(MAX_DWALLET_ID_LEN)).is_ok());
    }

    #[test]
    fn validate_address_rejects_empty() {
        assert!(validate_address("").is_err());
    }

    #[test]
    fn validate_address_rejects_too_long() {
        let long_addr = "a".repeat(MAX_ADDRESS_LEN + 1);
        assert!(validate_address(&long_addr).is_err());
    }

    #[test]
    fn validate_address_accepts_valid() {
        assert!(validate_address("0xdeadbeef").is_ok());
        assert!(validate_address(&"a".repeat(MAX_ADDRESS_LEN)).is_ok());
    }

    #[test]
    fn validate_amount_usd_rejects_zero() {
        assert!(validate_amount_usd(0).is_err());
    }

    #[test]
    fn validate_amount_usd_accepts_nonzero() {
        assert!(validate_amount_usd(1).is_ok());
        assert!(validate_amount_usd(u64::MAX).is_ok());
    }

    #[test]
    fn validate_multisig_threshold_rejects_zero() {
        assert!(validate_multisig_threshold(0, 3).is_err());
    }

    #[test]
    fn validate_multisig_threshold_rejects_exceeding_count() {
        assert!(validate_multisig_threshold(4, 3).is_err());
    }

    #[test]
    fn validate_multisig_threshold_accepts_valid() {
        assert!(validate_multisig_threshold(1, 3).is_ok());
        assert!(validate_multisig_threshold(3, 3).is_ok());
    }

    #[test]
    fn validate_guardians_rejects_empty() {
        let empty: Vec<String> = vec![];
        assert!(validate_guardians(&empty).is_err());
    }

    #[test]
    fn validate_guardians_rejects_too_many() {
        let too_many: Vec<String> = (0..=MAX_GUARDIANS).map(|i| i.to_string()).collect();
        assert!(validate_guardians(&too_many).is_err());
    }

    #[test]
    fn validate_guardians_accepts_valid() {
        let guardians: Vec<String> = (0..MAX_GUARDIANS).map(|i| i.to_string()).collect();
        assert!(validate_guardians(&guardians).is_ok());
        assert!(validate_guardians(&["g1".to_string()]).is_ok());
    }

    #[test]
    fn validate_swarm_members_rejects_empty() {
        let empty: Vec<String> = vec![];
        assert!(validate_swarm_members(&empty).is_err());
    }

    #[test]
    fn validate_swarm_members_rejects_too_many() {
        let too_many: Vec<String> = (0..=MAX_SWARM_MEMBERS).map(|i| i.to_string()).collect();
        assert!(validate_swarm_members(&too_many).is_err());
    }

    #[test]
    fn validate_swarm_members_accepts_valid() {
        let members: Vec<String> = (0..MAX_SWARM_MEMBERS).map(|i| i.to_string()).collect();
        assert!(validate_swarm_members(&members).is_ok());
        assert!(validate_swarm_members(&["agent-1".to_string()]).is_ok());
    }
}

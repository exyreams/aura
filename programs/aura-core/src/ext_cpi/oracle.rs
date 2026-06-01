use std::str::FromStr;

use anchor_lang::prelude::*;

use crate::state::{OracleFeed, OracleProvider};

/// Compact mock layout used by tests and by adapter-fed oracle accounts:
/// price i64, confidence u64, exponent i32, publish_time i64, status u8.
///
/// Real Pyth/Switchboard account parsing should stay isolated here; callers
/// only consume `VerifiedPrice`.
const COMPACT_PRICE_LEN: usize = 29;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VerifiedPrice {
    /// Price normalized to USD with 6 decimals.
    pub price_usd_e6: u64,
    pub publish_time: i64,
    pub confidence_bps: u16,
    pub provider: OracleProvider,
}

pub fn read_verified_price(
    feed: &OracleFeed,
    price_account: &AccountInfo<'_>,
    now: i64,
    trusted_required: bool,
) -> Result<VerifiedPrice> {
    let expected_account = Pubkey::from_str(&feed.account)
        .map_err(|_| error!(crate::AuraCoreError::OracleAccountInvalid))?;
    require!(
        price_account.key() == expected_account,
        crate::AuraCoreError::OracleAccountInvalid
    );

    if trusted_required && !feed.provider.is_trusted() {
        return err!(crate::AuraCoreError::TrustedOracleRequired);
    }

    match feed.provider {
        OracleProvider::RawLegacy => read_raw_legacy_price(price_account),
        OracleProvider::Pyth | OracleProvider::Switchboard => {
            let expected_owner = feed
                .program_id
                .as_deref()
                .ok_or_else(|| error!(crate::AuraCoreError::OracleAccountInvalid))
                .and_then(|value| {
                    Pubkey::from_str(value)
                        .map_err(|_| error!(crate::AuraCoreError::OracleAccountInvalid))
                })?;
            require!(
                *price_account.owner == expected_owner,
                crate::AuraCoreError::OracleAccountInvalid
            );
            read_compact_trusted_price(feed, price_account, now)
        }
    }
}

fn read_raw_legacy_price(price_account: &AccountInfo<'_>) -> Result<VerifiedPrice> {
    let data = price_account.try_borrow_data()?;
    require!(data.len() >= 8, crate::AuraCoreError::OracleAccountInvalid);
    let price_usd_e6 = u64::from_le_bytes(
        data[..8]
            .try_into()
            .map_err(|_| error!(crate::AuraCoreError::OracleAccountInvalid))?,
    )
    .saturating_mul(1_000_000);
    Ok(VerifiedPrice {
        price_usd_e6,
        publish_time: 0,
        confidence_bps: 0,
        provider: OracleProvider::RawLegacy,
    })
}

fn read_compact_trusted_price(
    feed: &OracleFeed,
    price_account: &AccountInfo<'_>,
    now: i64,
) -> Result<VerifiedPrice> {
    let data = price_account.try_borrow_data()?;
    require!(
        data.len() >= COMPACT_PRICE_LEN,
        crate::AuraCoreError::OracleAccountInvalid
    );
    let price = i64::from_le_bytes(
        data[0..8]
            .try_into()
            .map_err(|_| error!(crate::AuraCoreError::OracleAccountInvalid))?,
    );
    let conf = u64::from_le_bytes(
        data[8..16]
            .try_into()
            .map_err(|_| error!(crate::AuraCoreError::OracleAccountInvalid))?,
    );
    let expo = i32::from_le_bytes(
        data[16..20]
            .try_into()
            .map_err(|_| error!(crate::AuraCoreError::OracleAccountInvalid))?,
    );
    let publish_time = i64::from_le_bytes(
        data[20..28]
            .try_into()
            .map_err(|_| error!(crate::AuraCoreError::OracleAccountInvalid))?,
    );
    let status = data[28];

    require!(status == 1, crate::AuraCoreError::OracleAccountInvalid);
    require!(price > 0, crate::AuraCoreError::OracleAccountInvalid);
    if let Some(expected) = feed.expo_expected {
        require!(expo == expected, crate::AuraCoreError::OracleAccountInvalid);
    }
    require!(
        now.saturating_sub(publish_time) <= feed.max_staleness_secs,
        crate::AuraCoreError::OracleStale
    );

    let confidence_bps = confidence_bps(conf, price as u64)?;
    require!(
        confidence_bps <= feed.max_confidence_bps,
        crate::AuraCoreError::OracleConfidenceTooWide
    );

    Ok(VerifiedPrice {
        price_usd_e6: normalize_price_to_e6(price as u64, expo)?,
        publish_time,
        confidence_bps,
        provider: feed.provider,
    })
}

pub fn native_to_usd_value(native_amount: u128, decimals: u8, price_usd_e6: u64) -> Result<u64> {
    let divisor = pow10_u128(u32::from(decimals))?;
    let value = native_amount
        .saturating_mul(u128::from(price_usd_e6))
        .checked_div(divisor)
        .ok_or_else(|| error!(crate::AuraCoreError::OracleAccountInvalid))?
        .checked_div(1_000_000)
        .ok_or_else(|| error!(crate::AuraCoreError::OracleAccountInvalid))?;
    u64::try_from(value).map_err(|_| error!(crate::AuraCoreError::OracleAccountInvalid))
}

fn normalize_price_to_e6(price: u64, expo: i32) -> Result<u64> {
    let mut value = u128::from(price);
    if expo >= -6 {
        value = value.saturating_mul(pow10_u128((expo + 6) as u32)?);
    } else {
        value = value
            .checked_div(pow10_u128((-expo - 6) as u32)?)
            .ok_or_else(|| error!(crate::AuraCoreError::OracleAccountInvalid))?;
    }
    u64::try_from(value).map_err(|_| error!(crate::AuraCoreError::OracleAccountInvalid))
}

fn confidence_bps(conf: u64, price: u64) -> Result<u16> {
    let bps = u128::from(conf)
        .saturating_mul(10_000)
        .checked_div(u128::from(price))
        .ok_or_else(|| error!(crate::AuraCoreError::OracleAccountInvalid))?;
    u16::try_from(bps).map_err(|_| error!(crate::AuraCoreError::OracleConfidenceTooWide))
}

fn pow10_u128(exp: u32) -> Result<u128> {
    let mut value = 1u128;
    for _ in 0..exp {
        value = value
            .checked_mul(10)
            .ok_or_else(|| error!(crate::AuraCoreError::OracleAccountInvalid))?;
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compact_price(price: i64, conf: u64, expo: i32, publish_time: i64, status: u8) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(&price.to_le_bytes());
        data.extend_from_slice(&conf.to_le_bytes());
        data.extend_from_slice(&expo.to_le_bytes());
        data.extend_from_slice(&publish_time.to_le_bytes());
        data.push(status);
        data
    }

    #[test]
    fn trusted_feed_parses_and_enforces_bounds() {
        let key = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let mut lamports = 0;
        let mut data = compact_price(100_000_000, 50_000, -8, 1_000, 1);
        let account = AccountInfo::new(&key, false, false, &mut lamports, &mut data, &owner, false);
        let feed = OracleFeed {
            provider: OracleProvider::Pyth,
            account: key.to_string(),
            program_id: Some(owner.to_string()),
            max_staleness_secs: 60,
            max_confidence_bps: 10,
            expo_expected: Some(-8),
        };

        let price = read_verified_price(&feed, &account, 1_030, true).expect("valid price");
        assert_eq!(price.price_usd_e6, 1_000_000);
        assert_eq!(price.confidence_bps, 5);

        assert!(read_verified_price(&feed, &account, 1_061, true).is_err());
    }

    #[test]
    fn raw_legacy_is_rejected_when_trusted_provider_required() {
        let key = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let mut lamports = 0;
        let mut data = 7u64.to_le_bytes();
        let account = AccountInfo::new(&key, false, false, &mut lamports, &mut data, &owner, false);
        let feed = OracleFeed::raw_legacy(key.to_string());

        let price = read_verified_price(&feed, &account, 1, false).expect("legacy allowed");
        assert_eq!(price.price_usd_e6, 7_000_000);
        assert!(read_verified_price(&feed, &account, 1, true).is_err());
    }
}

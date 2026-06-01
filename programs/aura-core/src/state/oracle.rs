use std::fmt::{Display, Formatter};

/// Price-feed provider used by an AURA asset balance.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OracleProvider {
    Pyth,
    Switchboard,
    RawLegacy,
}

impl OracleProvider {
    pub fn code(self) -> u8 {
        match self {
            Self::Pyth => 0,
            Self::Switchboard => 1,
            Self::RawLegacy => 255,
        }
    }

    pub fn from_code(code: u8) -> Option<Self> {
        match code {
            0 => Some(Self::Pyth),
            1 => Some(Self::Switchboard),
            255 => Some(Self::RawLegacy),
            _ => None,
        }
    }

    pub fn is_trusted(self) -> bool {
        !matches!(self, Self::RawLegacy)
    }
}

impl Display for OracleProvider {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let label = match self {
            Self::Pyth => "pyth",
            Self::Switchboard => "switchboard",
            Self::RawLegacy => "raw_legacy",
        };
        write!(f, "{label}")
    }
}

/// Verified price-feed configuration stored on an asset balance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OracleFeed {
    pub provider: OracleProvider,
    pub account: String,
    pub program_id: Option<String>,
    pub max_staleness_secs: i64,
    pub max_confidence_bps: u16,
    pub expo_expected: Option<i32>,
}

impl OracleFeed {
    pub fn raw_legacy(account: String) -> Self {
        Self {
            provider: OracleProvider::RawLegacy,
            account,
            program_id: None,
            max_staleness_secs: 0,
            max_confidence_bps: 0,
            expo_expected: None,
        }
    }
}

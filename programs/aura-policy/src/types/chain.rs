use std::fmt::{Display, Formatter};

/// Target chain identifiers supported by AURA.
///
/// Used in `TransactionContext` to identify which chain a proposal targets,
/// and in `DWalletReference` to key the registered dWallet map.
/// Implements `Ord` so it can be used as a `BTreeMap` key in `AgentTreasury`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Chain {
    Bitcoin,
    Ethereum,
    Solana,
    Polygon,
    Arbitrum,
    Optimism,
}

impl Display for Chain {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let label = match self {
            Self::Bitcoin => "bitcoin",
            Self::Ethereum => "ethereum",
            Self::Solana => "solana",
            Self::Polygon => "polygon",
            Self::Arbitrum => "arbitrum",
            Self::Optimism => "optimism",
        };

        write!(f, "{label}")
    }
}

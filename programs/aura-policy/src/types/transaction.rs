use std::fmt::{Display, Formatter};

/// Category of a transaction proposal.
///
/// Used in `TransactionContext` and stored on `PendingTransaction`. The
/// `Display` implementation produces the snake_case label used in audit
/// events and the chain message string.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransactionType {
    Transfer,
    DeFiSwap,
    LendingDeposit,
    NFTPurchase,
    ContractInteraction,
}

impl Display for TransactionType {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let label = match self {
            Self::Transfer => "transfer",
            Self::DeFiSwap => "defi_swap",
            Self::LendingDeposit => "lending_deposit",
            Self::NFTPurchase => "nft_purchase",
            Self::ContractInteraction => "contract_interaction",
        };

        write!(f, "{label}")
    }
}

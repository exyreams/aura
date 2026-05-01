use crate::{context::TransactionContext, types::Chain};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PauseScope {
    All,
    Chain { chain: Chain },
    Category { tx_type_code: u8 },
    Recipient { recipient: String },
    Protocol { protocol_id: u8 },
    ConfidentialExecution,
    DWalletFinalization,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScopedPauseEntry {
    pub scope: PauseScope,
    pub paused_by: String,
    pub paused_at: i64,
    pub expires_at: Option<i64>,
}

impl ScopedPauseEntry {
    pub fn is_active(&self, now: i64) -> bool {
        self.expires_at.is_none_or(|expires_at| now < expires_at)
    }

    pub fn matches_transaction(&self, tx: &TransactionContext) -> bool {
        match &self.scope {
            PauseScope::All => true,
            PauseScope::Chain { chain } => tx.target_chain == *chain,
            PauseScope::Category { tx_type_code } => tx.tx_type as u8 == *tx_type_code,
            PauseScope::Recipient { recipient } => {
                tx.recipient_or_contract.as_ref() == Some(recipient)
            }
            PauseScope::Protocol { protocol_id } => tx.protocol_id == Some(*protocol_id),
            PauseScope::ConfidentialExecution | PauseScope::DWalletFinalization => false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ScopedPauseControls {
    pub entries: Vec<ScopedPauseEntry>,
}

impl ScopedPauseControls {
    pub fn transaction_paused(&self, tx: &TransactionContext) -> bool {
        self.entries
            .iter()
            .any(|entry| entry.is_active(tx.current_timestamp) && entry.matches_transaction(tx))
    }

    pub fn dependency_paused(&self, scope: PauseScope, now: i64) -> bool {
        self.entries
            .iter()
            .any(|entry| entry.is_active(now) && entry.scope == scope)
    }
}

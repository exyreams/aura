/// A single in-flight emergency override proposal.
///
/// Created by `EmergencyMultisig::propose` and stored as
/// `EmergencyMultisig::pending_override`. Only one proposal may be active at
/// a time; submitting a new one replaces any existing proposal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverrideProposal {
    /// Unique identifier for this proposal, set to the Unix timestamp at creation.
    pub proposal_id: u64,
    /// The new daily spending limit (in USD) that will be applied if quorum is reached.
    pub new_daily_limit_usd: u64,
    /// Public keys of guardians who have signed this proposal so far.
    pub signatures_collected: Vec<String>,
    /// Unix timestamp after which this proposal is no longer valid.
    pub expiration: i64,
}

/// Emergency governance for the treasury.
///
/// Provides a multisig override mechanism that allows a quorum of trusted
/// guardians to raise the daily spending limit without requiring the AI
/// authority or the treasury owner. This is the break-glass path for
/// situations where the encrypted guardrails need to be adjusted urgently.
///
/// The two types are:
/// - `EmergencyMultisig` — the guardian set, quorum threshold, and pending proposal
/// - `OverrideProposal`  — a single in-flight override with an expiry and collected signatures
mod multisig;
mod override_proposal;

pub use multisig::EmergencyMultisig;
pub use override_proposal::OverrideProposal;

/// Audit trail for treasury actions.
///
/// Every state-changing operation on an `AgentTreasury` appends an
/// `AuditEvent` to the treasury's `AuditTrail`. This provides an
/// immutable, ordered history of all decisions and lifecycle transitions
/// that can be read on-chain or off-chain.
///
/// The two public types are:
/// - `AuditKind` — enum classifying the action category
/// - `AuditEvent` — a single record (kind + detail + timestamp)
/// - `AuditTrail` — the append-only container
mod event;
mod trail;

pub use event::{AuditEvent, AuditKind};
pub use trail::AuditTrail;

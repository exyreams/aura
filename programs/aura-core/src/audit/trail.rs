use super::{AuditEvent, AuditKind};

/// Append-only log of treasury actions.
///
/// Every state-changing operation on an `AgentTreasury` records an
/// `AuditEvent` here. The trail is stored in-memory alongside the treasury
/// and serialized into the on-chain account via `TreasuryAccount`.
///
/// Events are never removed or modified after insertion.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct AuditTrail {
    events: Vec<AuditEvent>,
}

impl AuditTrail {
    /// Appends a pre-constructed event to the trail.
    pub fn push(&mut self, event: AuditEvent) {
        self.events.push(event);
    }

    /// Constructs an event from its parts and appends it to the trail.
    ///
    /// This is the primary method used by treasury operations. `kind`
    /// identifies the action category, `detail` carries a human-readable
    /// description, and `timestamp` is the Unix time in seconds.
    pub fn record(&mut self, kind: AuditKind, detail: impl Into<String>, timestamp: i64) {
        self.push(AuditEvent::new(kind, detail, timestamp));
    }

    /// Returns all recorded events in insertion order.
    pub fn events(&self) -> &[AuditEvent] {
        &self.events
    }

    /// Returns the number of recorded events.
    pub fn len(&self) -> usize {
        self.events.len()
    }

    /// Returns `true` if no events have been recorded yet.
    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }
}

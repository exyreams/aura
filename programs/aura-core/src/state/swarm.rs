/// Shared-pool configuration for a group of agents that collectively share a
/// spending limit.
///
/// Attached to a treasury via `attach_swarm`. The `total_swarm_spent_usd`
/// counter is incremented by each member's `finalize_signed_pending` call and
/// is checked by the policy engine's `SharedPoolLimit` rule.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentSwarm {
    /// Unique identifier for this swarm.
    pub swarm_id: String,
    /// Agent IDs of all members sharing the pool.
    pub member_agents: Vec<String>,
    /// Maximum total USD that all members may spend collectively.
    pub shared_pool_limit_usd: u64,
    /// Cumulative USD spent by all members so far.
    pub total_swarm_spent_usd: u64,
}

impl AgentSwarm {
    /// Creates a new swarm with zero cumulative spend.
    pub fn new(
        swarm_id: impl Into<String>,
        member_agents: Vec<String>,
        shared_pool_limit_usd: u64,
    ) -> Self {
        Self {
            swarm_id: swarm_id.into(),
            member_agents,
            shared_pool_limit_usd,
            total_swarm_spent_usd: 0,
        }
    }

    /// Adds `agent_id` to the member list if not already present.
    pub fn add_member(&mut self, agent_id: impl Into<String>) {
        let agent_id = agent_id.into();
        if !self.member_agents.iter().any(|known| known == &agent_id) {
            self.member_agents.push(agent_id);
        }
    }

    /// Adds `amount_usd` to the cumulative pool spend counter (saturating).
    pub fn record_spend(&mut self, amount_usd: u64) {
        self.total_swarm_spent_usd = self.total_swarm_spent_usd.saturating_add(amount_usd);
    }
}

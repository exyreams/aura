/// Integration tests for `aura-core`.
///
/// Each sub-module exercises a distinct slice of the treasury lifecycle:
/// - `proposal_flow`    — public (non-confidential) propose → execute → finalize
/// - `confidential_flow` — FHE scalar and vector confidential proposal flows
/// - `governance_flow`  — emergency multisig override and protocol fee logic
/// - `advanced_flow`    — reputation scaling, swarm limits, batch preview, edge cases
/// - `policy_controls_flow` — approval ladder, envelopes, exposure, roles, liveness
mod advanced_flow;
mod confidential_flow;
mod governance_flow;
mod policy_controls_flow;
mod proposal_flow;

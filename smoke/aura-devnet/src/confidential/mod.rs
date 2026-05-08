//! Live confidential execution smoke flows.

mod scalar_guardrails;

pub async fn run() -> anyhow::Result<()> {
    scalar_guardrails::run().await
}

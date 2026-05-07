//! Live confidential execution smoke flows.

mod scalar_guardrails;
mod vector_guardrails;

pub async fn run() -> anyhow::Result<()> {
    scalar_guardrails::run().await?;
    vector_guardrails::run().await
}

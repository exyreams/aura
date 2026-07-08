#[allow(dead_code)]
#[path = "../full/trust_identity.rs"]
mod trust_identity;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    trust_identity::run_ownership_handover_live().await
}

#[allow(dead_code)]
#[path = "../full/oracle_multichain.rs"]
mod oracle_multichain;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    oracle_multichain::run_settlement_live().await
}

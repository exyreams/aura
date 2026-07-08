#[allow(dead_code)]
#[path = "../full/monetization.rs"]
mod monetization;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    monetization::run_fee_accrual_live().await
}

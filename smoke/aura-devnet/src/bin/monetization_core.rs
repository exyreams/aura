#[allow(dead_code)]
#[path = "monetization.rs"]
mod monetization;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    monetization::run_core().await
}

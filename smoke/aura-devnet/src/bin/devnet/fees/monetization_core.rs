#[allow(dead_code)]
#[path = "../../live/full/monetization.rs"]
mod monetization;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    monetization::run_core().await
}

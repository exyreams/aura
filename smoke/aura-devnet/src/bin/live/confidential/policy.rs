#[tokio::main]
async fn main() -> anyhow::Result<()> {
    aura_devnet::policy::run().await
}

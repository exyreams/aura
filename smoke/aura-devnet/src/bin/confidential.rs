#[tokio::main]
async fn main() -> anyhow::Result<()> {
    aura_devnet::confidential::run().await
}

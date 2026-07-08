#[allow(dead_code)]
#[path = "../full/recovery.rs"]
mod recovery;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    recovery::run_breakglass_authority().await
}

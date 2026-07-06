#[allow(dead_code)]
#[path = "oracle_multichain.rs"]
mod oracle_multichain;

fn main() -> anyhow::Result<()> {
    oracle_multichain::run_core()
}

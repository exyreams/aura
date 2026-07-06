#[allow(dead_code)]
#[path = "recovery.rs"]
mod recovery;

fn main() -> anyhow::Result<()> {
    recovery::run_core()
}

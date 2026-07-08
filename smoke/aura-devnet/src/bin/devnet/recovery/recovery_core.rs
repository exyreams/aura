#[allow(dead_code)]
#[path = "../../live/full/recovery.rs"]
mod recovery;

fn main() -> anyhow::Result<()> {
    recovery::run_core()
}

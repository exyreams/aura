/// Error types for the treasury module.
///
/// Every public function in `aura-core` that can fail off the happy path
/// returns one of these variants (wrapped in `TreasuryResult`). Variants
/// that carry a `String` payload include a human-readable detail message
/// for diagnostics; variants without a payload have a fixed display string.
mod treasury;

pub use treasury::TreasuryError;

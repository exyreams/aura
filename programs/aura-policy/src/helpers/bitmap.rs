/// Returns `true` if `protocol_id` is set in `bitmap`.
///
/// Protocol IDs map directly to bit positions: bit `n` set means protocol `n`
/// is allowed. IDs ≥ 64 are always rejected since they exceed the `u64` range.
pub fn protocol_allowed(bitmap: u64, protocol_id: u8) -> bool {
    if protocol_id >= 64 {
        return false;
    }

    let mask = 1_u64 << protocol_id;
    bitmap & mask != 0
}

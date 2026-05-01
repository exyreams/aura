use sha2::{Digest, Sha256};

pub fn policy_config_hash(config_bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(config_bytes).into()
}

pub fn confidential_commitment(domain: &[u8], bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(domain);
    hasher.update(bytes);
    hasher.finalize().into()
}

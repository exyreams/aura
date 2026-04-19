#!/usr/bin/env bash
set -euo pipefail

# Sync vendor dependencies from upstream Ika repos
# This script clones the upstream repos and copies the proto files to vendor/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_DIR="$SCRIPT_DIR/vendor"
TMP_DIR=$(mktemp -d)

echo "🔄 Syncing vendor dependencies from upstream..."
echo "📁 Temp directory: $TMP_DIR"
echo ""

cleanup() {
    echo "🧹 Cleaning up temp directory..."
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

# Sync encrypt-grpc
echo "📦 Syncing encrypt-grpc..."
cd "$TMP_DIR"
git clone --depth 1 https://github.com/dwallet-labs/encrypt-pre-alpha.git
cd encrypt-pre-alpha

# Find the proto file (adjust path if needed based on upstream structure)
ENCRYPT_PROTO=$(find . -name "encrypt_service.proto" -o -name "*encrypt*.proto" | head -1)

if [ -n "$ENCRYPT_PROTO" ]; then
    echo "   Found: $ENCRYPT_PROTO"
    cp "$ENCRYPT_PROTO" "$VENDOR_DIR/encrypt-grpc/proto/encrypt_service.proto"
    echo "   ✅ Copied to vendor/encrypt-grpc/proto/"
else
    echo "   ⚠️  Warning: encrypt_service.proto not found in upstream repo"
    echo "   Keeping existing vendor version"
fi

# Sync ika-grpc
echo ""
echo "📦 Syncing ika-grpc..."
cd "$TMP_DIR"
git clone --depth 1 https://github.com/dwallet-labs/ika-pre-alpha.git
cd ika-pre-alpha

# Find the proto file (adjust path if needed based on upstream structure)
IKA_PROTO=$(find . -name "ika_dwallet.proto" -o -name "*dwallet*.proto" | head -1)

if [ -n "$IKA_PROTO" ]; then
    echo "   Found: $IKA_PROTO"
    cp "$IKA_PROTO" "$VENDOR_DIR/ika-grpc/proto/ika_dwallet.proto"
    echo "   ✅ Copied to vendor/ika-grpc/proto/"
else
    echo "   ⚠️  Warning: ika_dwallet.proto not found in upstream repo"
    echo "   Keeping existing vendor version"
fi

echo ""
echo "✨ Vendor sync complete!"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff smoke/vendor/"
echo "  2. Rebuild to regenerate Rust code: cd smoke/aura-devnet && cargo build"
echo "  3. Test the smoke tests: cargo run --bin dwallet"
echo "  4. Commit if everything works: git add smoke/vendor/ && git commit -m 'chore(vendor): sync proto files from upstream'"

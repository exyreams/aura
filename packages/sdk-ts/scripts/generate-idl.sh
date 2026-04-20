#!/usr/bin/env bash
# generate-idl.sh
#
# Copies the compiled Anchor IDL and TypeScript types from the workspace
# build output into packages/sdk-ts/src/generated/.
#
# Usage (from packages/sdk-ts/):
#   npm run generate-idl
#   # or directly:
#   bash scripts/generate-idl.sh
#
# Prerequisites: run `anchor build` from the workspace root first.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_ROOT="$(cd "$PKG_ROOT/../.." && pwd)"

SRC_IDL="$WORKSPACE_ROOT/target/idl/aura_core.json"
SRC_TYPES="$WORKSPACE_ROOT/target/types/aura_core.ts"
DEST_DIR="$PKG_ROOT/src/generated"

mkdir -p "$DEST_DIR"

ok=true

copy_file() {
  local label="$1"
  local src="$2"
  local dest="$3"

  if [[ ! -f "$src" ]]; then
    echo -e "\033[31m✗\033[0m $label source not found: $src"
    echo "  Run \033[33manchor build\033[0m from the workspace root first."
    ok=false
    return
  fi

  cp "$src" "$dest"
  echo -e "\033[32m✓\033[0m Copied $label: $src → $dest"
}

copy_file "IDL JSON" "$SRC_IDL"   "$DEST_DIR/aura_core.json"
copy_file "TS types" "$SRC_TYPES" "$DEST_DIR/aura_core.ts"

if [[ "$ok" == "false" ]]; then
  exit 1
fi

echo -e "\n\033[32mIDL generation complete.\033[0m"

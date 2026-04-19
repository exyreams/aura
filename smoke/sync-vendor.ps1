# Sync vendor dependencies from upstream Ika repos
# This script clones the upstream repos and copies the proto files to vendor/

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VendorDir = Join-Path $ScriptDir "vendor"
$TmpDir = Join-Path $env:TEMP "aura-vendor-sync-$(Get-Random)"

Write-Host "🔄 Syncing vendor dependencies from upstream..." -ForegroundColor Cyan
Write-Host "📁 Temp directory: $TmpDir" -ForegroundColor Gray
Write-Host ""

# Create temp directory
New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

try {
    # Sync encrypt-grpc
    Write-Host "📦 Syncing encrypt-grpc..." -ForegroundColor Yellow
    Set-Location $TmpDir
    git clone --depth 1 https://github.com/dwallet-labs/encrypt-pre-alpha.git 2>&1 | Out-Null
    Set-Location encrypt-pre-alpha

    # Find the proto file
    $EncryptProto = Get-ChildItem -Recurse -Filter "*encrypt*.proto" | Select-Object -First 1

    if ($EncryptProto) {
        Write-Host "   Found: $($EncryptProto.FullName)" -ForegroundColor Gray
        Copy-Item $EncryptProto.FullName -Destination "$VendorDir\encrypt-grpc\proto\encrypt_service.proto" -Force
        Write-Host "   ✅ Copied to vendor/encrypt-grpc/proto/" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Warning: encrypt_service.proto not found in upstream repo" -ForegroundColor Yellow
        Write-Host "   Keeping existing vendor version" -ForegroundColor Gray
    }

    # Sync ika-grpc
    Write-Host ""
    Write-Host "📦 Syncing ika-grpc..." -ForegroundColor Yellow
    Set-Location $TmpDir
    git clone --depth 1 https://github.com/dwallet-labs/ika-pre-alpha.git 2>&1 | Out-Null
    Set-Location ika-pre-alpha

    # Find the proto file
    $IkaProto = Get-ChildItem -Recurse -Filter "*dwallet*.proto" | Select-Object -First 1

    if ($IkaProto) {
        Write-Host "   Found: $($IkaProto.FullName)" -ForegroundColor Gray
        Copy-Item $IkaProto.FullName -Destination "$VendorDir\ika-grpc\proto\ika_dwallet.proto" -Force
        Write-Host "   ✅ Copied to vendor/ika-grpc/proto/" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Warning: ika_dwallet.proto not found in upstream repo" -ForegroundColor Yellow
        Write-Host "   Keeping existing vendor version" -ForegroundColor Gray
    }

    Write-Host ""
    Write-Host "✨ Vendor sync complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Review changes: git diff smoke/vendor/"
    Write-Host "  2. Rebuild to regenerate Rust code: cd smoke/aura-devnet && cargo build"
    Write-Host "  3. Test the smoke tests: cargo run --bin dwallet"
    Write-Host "  4. Commit if everything works: git add smoke/vendor/ && git commit -m 'chore(vendor): sync proto files from upstream'"

} finally {
    # Cleanup
    Write-Host ""
    Write-Host "🧹 Cleaning up temp directory..." -ForegroundColor Gray
    Set-Location $ScriptDir
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
}

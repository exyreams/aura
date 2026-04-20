# generate-idl.ps1
#
# Copies the compiled Anchor IDL and TypeScript types from the workspace
# build output into packages/sdk-ts/src/generated/.
#
# Usage (from packages/sdk-ts/):
#   npm run generate-idl:win
#   # or directly:
#   pwsh scripts/generate-idl.ps1
#
# Prerequisites: run `anchor build` from the workspace root first.

$ErrorActionPreference = 'Stop'

$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$PkgRoot      = Resolve-Path (Join-Path $ScriptDir '..')
$WorkspaceRoot = Resolve-Path (Join-Path $PkgRoot '../..')

$SrcIdl   = Join-Path $WorkspaceRoot 'target\idl\aura_core.json'
$SrcTypes = Join-Path $WorkspaceRoot 'target\types\aura_core.ts'
$DestDir  = Join-Path $PkgRoot 'src\generated'

if (-not (Test-Path $DestDir)) {
    New-Item -ItemType Directory -Path $DestDir | Out-Null
}

$ok = $true

function Copy-Generated {
    param(
        [string]$Label,
        [string]$Src,
        [string]$Dest
    )

    if (-not (Test-Path $Src)) {
        Write-Host "x $Label source not found: $Src" -ForegroundColor Red
        Write-Host "  Run 'anchor build' from the workspace root first." -ForegroundColor Yellow
        $script:ok = $false
        return
    }

    Copy-Item -Path $Src -Destination $Dest -Force
    Write-Host "v Copied $Label`: $Src -> $Dest" -ForegroundColor Green
}

Copy-Generated -Label 'IDL JSON' -Src $SrcIdl   -Dest (Join-Path $DestDir 'aura_core.json')
Copy-Generated -Label 'TS types' -Src $SrcTypes  -Dest (Join-Path $DestDir 'aura_core.ts')

if (-not $ok) {
    exit 1
}

Write-Host "`nIDL generation complete." -ForegroundColor Green

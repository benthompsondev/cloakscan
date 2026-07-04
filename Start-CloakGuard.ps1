<#
.SYNOPSIS
Start CloakGuard locally on Windows. No admin rights required.

.DESCRIPTION
Checks for a Node.js version supported by the build tooling (20.19+ or
22.12+), installs dependencies only when missing or out of sync with
package-lock.json, builds the production app, and serves it on 127.0.0.1
with its strict Content Security Policy. Your browser opens automatically.
Stop the app with Ctrl+C in this window.

For development with hot reload, use `npm run dev` instead.
#>

$ErrorActionPreference = 'Stop'

Set-Location -Path $PSScriptRoot

function Fail([string]$Message) {
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail 'Node.js was not found. Install Node 20.19+ or 22.12+ from https://nodejs.org (no admin needed with the .zip or nvm-windows). This script never installs Node for you.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail 'npm was not found. It normally ships with Node.js - reinstall Node from https://nodejs.org.'
}

$nodeVersion = (node --version).TrimStart('v')
$parts = $nodeVersion.Split('.')
$major = [int]$parts[0]
$minor = [int]$parts[1]
$supported = ($major -eq 20 -and $minor -ge 19) -or ($major -eq 22 -and $minor -ge 12) -or ($major -gt 22)
if (-not $supported) {
    Fail "Node $nodeVersion is not supported. CloakGuard (Vite 8) needs Node 20.19+ or 22.12+."
}
Write-Host "Node $nodeVersion / npm $(npm --version) found." -ForegroundColor Green

node scripts\ensure-deps.mjs
if ($LASTEXITCODE -ne 0) { Fail 'Dependency setup failed. Check the output above.' }

Write-Host ''
Write-Host 'Building the production app (one moment)...' -ForegroundColor Green
Write-Host 'CloakGuard will open at http://127.0.0.1:4173 (this machine only).' -ForegroundColor Green
Write-Host 'To stop the app, press Ctrl+C in this window.' -ForegroundColor Green
Write-Host ''

npm run start:local

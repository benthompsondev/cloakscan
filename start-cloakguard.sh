#!/usr/bin/env bash
# Start CloakGuard locally on macOS or Linux. No root required.
#
# Checks for a Node.js version supported by the build tooling (20.19+ or
# 22.12+), installs dependencies only when missing or out of sync with
# package-lock.json, builds the production app, and serves it on 127.0.0.1
# with its strict Content Security Policy. Stop with Ctrl+C.
#
# For development with hot reload, use `npm run dev` instead.

set -euo pipefail

cd "$(dirname "$0")"

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "Node.js was not found. Install Node 20.19+ or 22.12+ from https://nodejs.org or via nvm. This script never installs Node for you."
command -v npm >/dev/null 2>&1 || fail "npm was not found. It ships with Node.js - reinstall Node from https://nodejs.org."

node_version="$(node --version)"
version="${node_version#v}"
major="${version%%.*}"
rest="${version#*.}"
minor="${rest%%.*}"
supported=false
if [ "$major" -eq 20 ] && [ "$minor" -ge 19 ]; then supported=true; fi
if [ "$major" -eq 22 ] && [ "$minor" -ge 12 ]; then supported=true; fi
if [ "$major" -gt 22 ]; then supported=true; fi
if [ "$supported" != true ]; then
  fail "Node ${node_version} is not supported. CloakGuard (Vite 8) needs Node 20.19+ or 22.12+."
fi
echo "Node ${node_version} / npm $(npm --version) found."

node scripts/ensure-deps.mjs

echo
echo "Building the production app (one moment)..."
echo "CloakGuard will open at http://127.0.0.1:4173 (this machine only)."
echo "To stop the app, press Ctrl+C here."
echo

npm run start:local

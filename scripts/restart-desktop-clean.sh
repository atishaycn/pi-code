#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_ENTRY="$REPO_ROOT/apps/server/dist/bin.mjs"
DESKTOP_ENTRY="$REPO_ROOT/apps/desktop/dist-electron/main.cjs"

print_step() {
  printf '\n==> %s\n' "$1"
}

print_step "repo root: $REPO_ROOT"
cd "$REPO_ROOT"

print_step "killing packaged desktop/backend children"
pkill -f "$SERVER_ENTRY" || true
pkill -f "$DESKTOP_ENTRY" || true

print_step "checking common desktop ports before restart"
lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | rg ':(3773|3774|3775|5733)' || true

print_step "building desktop"
bun run build:desktop

print_step "starting desktop"
bun run start:desktop

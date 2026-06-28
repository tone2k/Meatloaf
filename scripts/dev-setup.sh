#!/usr/bin/env bash
# Best-effort project setup for fresh environments (e.g. Claude Code on the web).
# Safe to run repeatedly. Never hard-fails the session — it logs and moves on.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 0

log() { printf '\033[36m[setup]\033[0m %s\n' "$*"; }

# 1. Dependencies. Skip postinstall scripts — Prisma's native engine download is
#    flaky behind restricted networks and would otherwise wipe node_modules.
if [ ! -x node_modules/.bin/next ]; then
  log "Installing dependencies (npm install --ignore-scripts)…"
  npm install --ignore-scripts --no-audit --no-fund || log "npm install had issues; continuing."
fi

# 2. Prisma client. Generate; retry a couple of times in case engines need fetching.
if [ ! -f node_modules/.prisma/client/index.js ]; then
  for i in 1 2 3; do
    log "Generating Prisma client (attempt $i)…"
    if npx prisma generate >/dev/null 2>&1; then break; fi
    sleep 2
  done
fi

# 3. Database + seed (only if the dev DB doesn't exist yet).
if [ ! -f prisma/dev.db ]; then
  log "Creating and seeding the database…"
  npx prisma db push --skip-generate >/dev/null 2>&1 && npx tsx prisma/seed.ts || log "DB setup incomplete; run 'npm run setup' manually."
fi

log "Ready. Start the app with: npm run dev"

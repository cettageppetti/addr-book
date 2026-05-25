#!/bin/bash
# One-time setup for local D1 database.
set -e

# Resolve paths relative to this script so it works for any clone
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$PROJECT_DIR/worker"

# Seed local-only secrets for `wrangler dev` (e.g. JWT_SECRET) if not present.
if [ ! -f "$WORKER_DIR/.dev.vars" ] && [ -f "$WORKER_DIR/.dev.vars.example" ]; then
  cp "$WORKER_DIR/.dev.vars.example" "$WORKER_DIR/.dev.vars"
  echo "Created worker/.dev.vars from .dev.vars.example"
fi

echo "Starting wrangler dev (local D1) in background..."
cd "$WORKER_DIR"
wrangler dev --local --port 8787 > /tmp/wrangler-dev.log 2>&1 &
WRANGLER_PID=$!

echo "Waiting for wrangler dev to be ready..."
for i in $(seq 1 30); do
  if grep -q "Ready on\|Now watching" /tmp/wrangler-dev.log 2>/dev/null; then
    echo "Wrangler dev is up."
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Timeout. Check /tmp/wrangler-dev.log:"
    tail -10 /tmp/wrangler-dev.log
    kill $WRANGLER_PID 2>/dev/null
    exit 1
  fi
  sleep 1
done

sleep 3

echo ""
echo "Applying schema..."
wrangler d1 execute addr-book-local --local --file="$PROJECT_DIR/d1/schema.sql" 2>&1 || {
  echo "Schema failed. Check /tmp/wrangler-dev.log:"
  tail -20 /tmp/wrangler-dev.log
  kill $WRANGLER_PID 2>/dev/null; exit 1
}

echo ""
echo "Seeding data (this takes ~30s)..."
wrangler d1 execute addr-book-local --local \
  --file="$PROJECT_DIR/d1/seed.sql" 2>&1

echo ""
COUNT=$(wrangler d1 execute addr-book-local --local --json \
  --command="SELECT COUNT(*) AS n FROM homesites" 2>/dev/null \
  | grep -Eo '"n":[[:space:]]*[0-9]+' | grep -Eo '[0-9]+')
echo "✓ Done: $COUNT homesites seeded in local D1"

kill $WRANGLER_PID 2>/dev/null
echo "wrangler dev stopped."
echo ""
echo "To start developing:"
echo "  npm run dev    # Worker on :8787 + Vite on :5173"
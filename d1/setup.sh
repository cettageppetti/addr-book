#!/bin/bash
# One-time setup for local D1 database.
set -e

PROJECT_DIR="/Users/cettageppetti/Code/addr-book"
WORKER_DIR="$PROJECT_DIR/worker"

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
echo "Applying schema migration..."
wrangler d1 execute addr-book-local --local \
  --file="$PROJECT_DIR/d1/migrations/00001_initial.sql" 2>&1 || {
  echo "Migration failed. Check /tmp/wrangler-dev.log:"
  tail -20 /tmp/wrangler-dev.log
  kill $WRANGLER_PID 2>/dev/null; exit 1
}

echo ""
echo "Seeding data (this takes ~30s)..."
wrangler d1 execute addr-book-local --local \
  --file="$PROJECT_DIR/d1/seed.sql" 2>&1

echo ""
COUNT=$(wrangler d1 execute addr-book-local --local \
  --query="SELECT COUNT(*) FROM homesites" 2>&1 | grep -Eo '[0-9]+' | tail -1)
echo "✓ Done: $COUNT homesites seeded in local D1"

kill $WRANGLER_PID 2>/dev/null
echo "wrangler dev stopped."
echo ""
echo "To start developing:"
echo "  Terminal 1: cd ~/Code/addr-book/worker && npm run dev"
echo "  Terminal 2: cd ~/Code/addr-book && npx vite"
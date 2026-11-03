#!/bin/bash
set -e

echo "[RENDER] Booting SynapseDOT Relayer Daemon..."
node packages/relayer/dist/index.js &
RELAYER_PID=$!

PORT_NUM="${PORT:-3000}"
echo "[RENDER] Booting SynapseDOT Next.js on port ${PORT_NUM}..."
cd packages/web
npx next start -H 0.0.0.0 -p "${PORT_NUM}" &
WEB_PID=$!

# Gracefully terminate both background jobs on container shutdown
trap "kill -TERM $RELAYER_PID $WEB_PID 2>/dev/null || true" SIGINT SIGTERM

wait "$WEB_PID"
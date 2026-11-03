#!/bin/bash
set -e

echo "[SYSTEM] Booting SynapseDOT Relayer Daemon..."
node packages/relayer/dist/index.js &
RELAYER_PID=$!

PORT_NUM="${PORT:-4000}"
echo "[SYSTEM] Booting SynapseDOT Web Dashboard on port ${PORT_NUM}..."
cd packages/web
npx next start -H 0.0.0.0 -p "${PORT_NUM}" &
WEB_PID=$!

# Graceful termination handler
trap "kill -TERM $RELAYER_PID $WEB_PID 2>/dev/null || true" SIGINT SIGTERM

wait "$WEB_PID"
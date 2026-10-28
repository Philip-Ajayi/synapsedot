FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++ git

COPY package*.json ./
COPY packages/transcoder/package*.json ./packages/transcoder/
COPY packages/contracts-evm/package*.json ./packages/contracts-evm/
COPY packages/relayer/package*.json ./packages/relayer/
COPY packages/web/package*.json ./packages/web/

RUN npm ci

COPY . .

RUN npm run build:transcoder
RUN npm run build:relayer
RUN npm run build:web

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apk add --no-cache bash

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/transcoder/package*.json ./packages/transcoder/
COPY --from=builder /app/packages/transcoder/dist ./packages/transcoder/dist
COPY --from=builder /app/packages/relayer ./packages/relayer
COPY --from=builder /app/packages/web/.next ./packages/web/.next
COPY --from=builder /app/packages/web/public ./packages/web/public
COPY --from=builder /app/packages/web/package*.json ./packages/web/
COPY --from=builder /app/packages/web/next.config.mjs ./packages/web/

# Runner entrypoint script
RUN printf '#!/bin/bash\n\
set -e\n\
echo "[RENDER] Booting SynapseDOT Relayer Daemon..."\n\
node packages/relayer/dist/index.js &\n\
RELAYER_PID=$!\n\
echo "[RENDER] Booting SynapseDOT Next.js on port ${PORT}..."\n\
cd packages/web && npx next start -p ${PORT} &\n\
WEB_PID=$!\n\
trap "kill -TERM $RELAYER_PID $WEB_PID" SIGINT SIGTERM\n\
wait -n\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 3000
CMD ["/app/entrypoint.sh"]

# -------------------------------------------------------------
# Stage 1: Builder
# -------------------------------------------------------------
    FROM node:20-alpine AS builder
    WORKDIR /app
    
    # Install native compilation dependencies for better-sqlite3
    RUN apk add --no-cache python3 make g++ git
    
    # Copy root and workspace package files
    COPY package.json ./
    COPY packages/transcoder/package.json ./packages/transcoder/
    COPY packages/contracts-evm/package.json ./packages/contracts-evm/
    COPY packages/relayer/package.json ./packages/relayer/
    COPY packages/web/package.json ./packages/web/
    
    # Install monorepo dependencies
    RUN npm install
    
    # Copy complete monorepo source
    COPY . .
    
    # Ensure packages/web/public exists so downstream COPY does not fail
    RUN mkdir -p packages/web/public
    
    # Build all packages in correct dependency order
    RUN npm run build:transcoder
    RUN npm run build:relayer
    RUN npm run build:web
    
    # -------------------------------------------------------------
    # Stage 2: Production Runner
    # -------------------------------------------------------------
    FROM node:20-alpine AS runner
    WORKDIR /app
    
    ENV NODE_ENV=production
    ENV PORT=3000
    
    # bash for entrypoint script, libstdc++ for better-sqlite3 native bindings
    RUN apk add --no-cache bash libstdc++
    
    # Copy built dependencies and binaries
    COPY --from=builder /app/package.json ./
    COPY --from=builder /app/node_modules ./node_modules
    COPY --from=builder /app/packages/transcoder/package.json ./packages/transcoder/
    COPY --from=builder /app/packages/transcoder/dist ./packages/transcoder/dist
    COPY --from=builder /app/packages/relayer ./packages/relayer
    COPY --from=builder /app/packages/web/.next ./packages/web/.next
    COPY --from=builder /app/packages/web/public ./packages/web/public
    COPY --from=builder /app/packages/web/package.json ./packages/web/
    COPY --from=builder /app/packages/web/next.config.mjs ./packages/web/
    
    # Runner entrypoint: Keep web dashboard alive even if relayer retries
    RUN printf '#!/bin/bash\n\
    set -e\n\
    echo "[RENDER] Booting SynapseDOT Relayer Daemon..."\n\
    node packages/relayer/dist/index.js &\n\
    RELAYER_PID=$!\n\
    echo "[RENDER] Booting SynapseDOT Next.js on port \${PORT:-3000}..."\n\
    cd packages/web && npx next start -p \${PORT:-3000} &\n\
    WEB_PID=$!\n\
    trap "kill -TERM \$RELAYER_PID \$WEB_PID" SIGINT SIGTERM\n\
    wait \$WEB_PID\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh
    
    EXPOSE 3000
    CMD ["/app/entrypoint.sh"]
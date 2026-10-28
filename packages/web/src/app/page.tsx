import { SplitScreenDashboard } from '../components/SplitScreenDashboard';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#08090e]">
      <SplitScreenDashboard />
    </main>
  );
}
```

---

#### 1. `packages/web/src/lib/contracts.ts` (NEW FILE)
*Provides contract ABIs, testnet RPC configs, and the network-switching helper for MetaMask.*

```typescript
import { ethers } from 'ethers';

export const PORTALDOT_EVM_NETWORK = {
  chainId: '0x539', // 1337 in hex (or your testnet chainId e.g. '0x...')
  chainName: 'Portaldot EVM Testnet',
  nativeCurrency: {
    name: 'Portaldot POT',
    symbol: 'POT',
    decimals: 18,
  },
  rpcUrls: [process.env.NEXT_PUBLIC_EVM_RPC || 'https://rpc-testnet.portaldot.io'],
  blockExplorerUrls: ['https://explorer.portaldot.io'],
};

export const DISPATCHER_ABI = [
  "event CrossRuntimeDispatch(bytes32 indexed dispatchId, address indexed sender, bytes32 indexed targetWasmContract, bytes4 selector, bytes payload, uint256 fee, address refundAddress, uint256 timestamp)",
  "function dispatch(bytes32 targetWasmContract, bytes4 selector, bytes calldata payload, address refundAddress) external payable returns (bytes32 dispatchId)",
  "function getDispatch(bytes32 dispatchId) external view returns (tuple(bytes32 dispatchId, address sender, bytes32 targetWasmContract, bytes4 selector, uint256 fee, address refundAddress, uint8 status, uint256 timestamp, bytes32 wasmTxHash))",
  "function baseRelayFee() external view returns (uint256)"
];

export const MOCK_VAULT_ABI = [
  "function lockAndMint(bytes32 wasmRecipient) external payable returns (bytes32 dispatchId)",
  "function dispatcher() external view returns (address)",
  "function wasmReceiverContract() external view returns (bytes32)"
];

export async function switchToPortaldotNetwork(): Promise<void> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('MetaMask is not installed');
  }
  const ethereum = (window as any).ethereum;
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: PORTALDOT_EVM_NETWORK.chainId }],
    });
  } catch (switchError: any) {
    // Error code 4902 indicates that the chain has not been added to MetaMask yet
    if (switchError.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [PORTALDOT_EVM_NETWORK],
      });
    } else {
      throw switchError;
    }
  }
}
```

---

#### 2. `packages/web/src/app/api/relayer-status/route.ts` (NEW FILE)
*Allows the frontend to query the real backend SQLite database on Render so the judge can see the actual live status of their on-chain dispatch.*

```typescript
import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dispatchId = searchParams.get('dispatchId');

  const dbPath = process.env.RELAYER_SQLITE_PATH || '/tmp/synapse_relayer.db';

  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ status: 'WAITING_FOR_DAEMON', logs: [] });
  }

  try {
    const db = new Database(dbPath, { readonly: true });

    if (dispatchId) {
      const record = db.prepare('SELECT * FROM dispatches WHERE dispatch_id = ?').get(dispatchId);
      return NextResponse.json({ record });
    }

    const latest = db.prepare('SELECT * FROM dispatches ORDER BY id DESC LIMIT 5').all();
    return NextResponse.json({ latest });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

#### 4. `Dockerfile` (ROOT OF REPO)
*Runs both the Next.js app and the real Relayer Daemon in a single Render container.*

```dockerfile
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
```

---

---

## 8. End-to-End Deployment & Verification Guide

### Step 1: Install Dependencies & Build All Workspaces
```bash
# Clone the repository
git clone https://github.com/your-org/synapsedot.git
cd synapsedot

# Install monorepo dependencies
npm install

# Build the Zero-Dependency Transcoder package
npm run build:transcoder

# Run Transcoder unit tests (100% assertions)
npm run test:transcoder
```

### Step 2: Compile & Test EVM Contracts
```bash
# Compile Solidity contracts
npm run build:evm

# Run Hardhat integration test
npm run test:evm
```

### Step 3: Compile ink! 5.0 WASM Receiver Contract
```bash
cd packages/contracts-wasm
cargo contract build --release
```
*Output artifact generated: `target/ink/synapse_receiver.wasm` and `metadata.json`.*

### Step 4: Run the Complete Dockerized Stack
```bash
# Return to root
cd ../..

# Copy environment variables
cp .env.example .env

# Start Relay Daemon + Next.js Web Explorer
docker compose up --build

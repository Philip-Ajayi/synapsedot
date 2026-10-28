import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const CONFIG = {
  evmRpcHttp: process.env.PORTALDOT_EVM_RPC_HTTP || 'http://127.0.0.1:8545',
  evmRpcWs: process.env.PORTALDOT_EVM_RPC_WS || 'ws://127.0.0.1:8546',
  evmPrivateKey: process.env.EVM_RELAYER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  dispatcherAddress: process.env.DISPATCHER_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  substrateWs: process.env.PORTALDOT_SUBSTRATE_WS || 'ws://127.0.0.1:9944',
  substrateSeed: process.env.SUBSTRATE_RELAYER_SEED || '//Alice',
  sqlitePath: process.env.RELAYER_SQLITE_PATH || './synapse_relayer.db',
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 1500),
  maxRetries: Number(process.env.MAX_RETRIES || 5),
};

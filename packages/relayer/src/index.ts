import { CONFIG } from './config';
import { RelayDatabase } from './db';
import { EvmListener } from './evmListener';
import { WasmExecutor } from './wasmExecutor';
import { DynamicTranscoder, TranscodeDefinition } from '@synapsedot/transcoder';

const MINT_TRANSCODE_DEF: TranscodeDefinition = {
  inkSelector: '0x3a5b6c7d',
  params: [
    { name: 'origin_evm', fromAbi: 'address', toScale: 'H160' },
    { name: 'recipient', fromAbi: 'bytes32', toScale: 'AccountId32' },
    { name: 'amount', fromAbi: 'uint256', toScale: 'u128' }
  ]
};

async function main() {
  console.log("=================================================");
  console.log("     SYNAPSEDOT: Dual-Runtime Interop Relayer    ");
  console.log("=================================================");

  const db = new RelayDatabase(CONFIG.sqlitePath);
  db.log('INFO', 'Relayer daemon booted successfully.');

  const evmListener = new EvmListener(db);
  const wasmExecutor = new WasmExecutor();

  await wasmExecutor.init();
  await evmListener.start();

  let isLoopRunning = false;

  setInterval(async () => {
    if (isLoopRunning) return;
    isLoopRunning = true;

    try {
      const pendingJobs = db.getPendingDispatches();
      for (const job of pendingJobs) {
        try {
          db.log('EXEC', `Ingesting dispatch [${job.dispatch_id.slice(0, 10)}...] from ${job.sender_address}`);

          // Step 1: Dynamic Transcoding
          const scaleBytes = DynamicTranscoder.transcodeAbiToScale(
            job.abi_payload,
            MINT_TRANSCODE_DEF
          );
          const scaleHex = '0x' + Buffer.from(scaleBytes).toString('hex');
          db.updateStatus(job.dispatch_id, 'TRANSCODED', scaleHex);
          db.log('EXEC', `Transcoded ABI to SCALE (${scaleBytes.length} bytes LE).`);

          // Step 2: WASM Substrate Execution
          db.updateStatus(job.dispatch_id, 'SUBMITTING');
          const targetWasm = job.target_wasm_contract || CONFIG.wasmReceiverContract;
          const wasmTxHash = await wasmExecutor.submitContractCall(targetWasm, scaleBytes);

          db.updateStatus(job.dispatch_id, 'CONFIRMED', undefined, wasmTxHash);
          db.log('SUCCESS', `Substrate extrinsic finalized! Block/Tx: ${wasmTxHash.slice(0, 18)}...`);

          // Step 3: EVM Dispatch Settlement
          const evmSettleTx = await evmListener.markSettledOnChain(job.dispatch_id, wasmTxHash);
          db.updateStatus(job.dispatch_id, 'SETTLED');
          db.log('SUCCESS', `EVM Dispatch settled on-chain! Tx: ${evmSettleTx.slice(0, 18)}...`);
        } catch (err: any) {
          const errMsg = err?.message || 'Execution error';
          db.incrementRetry(job.dispatch_id, errMsg);
          db.log('WARN', `Job ${job.dispatch_id.slice(0, 10)} error: ${errMsg}`);

          if (job.retry_count >= CONFIG.maxRetries) {
            db.log('WARN', `Max retries exceeded for ${job.dispatch_id.slice(0, 10)}. Issuing EVM refund...`);
            try {
              await evmListener.markRefundOnChain(job.dispatch_id, errMsg);
              db.updateStatus(job.dispatch_id, 'REFUNDED');
              db.log('SUCCESS', `Refunded dispatch fee back to ${job.refund_address}`);
            } catch (refundErr: any) {
              db.log('ERROR', `Refund failed: ${refundErr.message}`);
            }
          }
        }
      }
    } finally {
      isLoopRunning = false;
    }
  }, CONFIG.pollIntervalMs);
}

main().catch((err) => {
  console.error('[CRITICAL] Daemon fatal crash:', err);
  process.exit(1);
});
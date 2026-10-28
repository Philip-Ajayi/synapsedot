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
  const evmListener = new EvmListener(db);
  const wasmExecutor = new WasmExecutor();

  await wasmExecutor.init();
  await evmListener.start();

  // Execution & Processing Loop
  setInterval(async () => {
    const pendingJobs = db.getPendingDispatches();
    for (const job of pendingJobs) {
      try {
        console.log(`[PROCESSOR] Processing job dispatch_id: ${job.dispatch_id}`);

        // Step 1: Transcode ABI to SCALE
        const scaleBytes = DynamicTranscoder.transcodeAbiToScale(
          job.abi_payload,
          MINT_TRANSCODE_DEF
        );
        const scaleHex = '0x' + Buffer.from(scaleBytes).toString('hex');
        db.updateStatus(job.dispatch_id, 'TRANSCODED', scaleHex);

        // Step 2: Sign and submit extrinsic to ink! WASM Runtime
        db.updateStatus(job.dispatch_id, 'SUBMITTING');
        const wasmTxHash = await wasmExecutor.submitContractCall(
          job.target_wasm_contract,
          scaleBytes
        );
        console.log(`[PROCESSOR] Substrate Execution Succeeded: TxHash ${wasmTxHash}`);
        db.updateStatus(job.dispatch_id, 'CONFIRMED', undefined, wasmTxHash);

        // Step 3: Settle on EVM Dispatcher
        const evmSettleTx = await evmListener.markSettledOnChain(job.dispatch_id, wasmTxHash);
        console.log(`[PROCESSOR] Dispatch settled on EVM. TxHash: ${evmSettleTx}`);
        db.updateStatus(job.dispatch_id, 'SETTLED');
      } catch (err: any) {
        console.error(`[PROCESSOR-ERROR] Job ${job.dispatch_id} failed:`, err.message);
        db.incrementRetry(job.dispatch_id, err.message);

        if (job.retry_count >= CONFIG.maxRetries) {
          console.warn(`[PROCESSOR] Max retries reached for ${job.dispatch_id}. Triggering refund...`);
          try {
            await evmListener.markRefundOnChain(job.dispatch_id, err.message || "Max retries exceeded");
            db.updateStatus(job.dispatch_id, 'REFUNDED');
          } catch (refundErr: any) {
            console.error(`[CRITICAL] Refund call failed:`, refundErr.message);
          }
        }
      }
    }
  }, CONFIG.pollIntervalMs);
}

main().catch(console.error);

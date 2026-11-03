import { ethers } from 'ethers';
import { CONFIG } from './config';
import { RelayDatabase } from './db';

const DISPATCHER_ABI = [
  "event CrossRuntimeDispatch(bytes32 indexed dispatchId, address indexed sender, bytes32 indexed targetWasmContract, bytes4 selector, bytes payload, uint256 fee, address refundAddress, uint256 timestamp)",
  "function settle(bytes32 dispatchId, bytes32 wasmTxHash) external",
  "function refund(bytes32 dispatchId, string calldata reason) external",
  "function baseRelayFee() external view returns (uint256)"
];

export class EvmListener {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;
  private db: RelayDatabase;

  constructor(db: RelayDatabase) {
    this.db = db;
    this.provider = new ethers.JsonRpcProvider(CONFIG.evmRpcHttp);
    this.wallet = new ethers.Wallet(CONFIG.evmPrivateKey, this.provider);
    this.contract = new ethers.Contract(CONFIG.dispatcherAddress, DISPATCHER_ABI, this.wallet);
  }

  public async start(): Promise<void> {
    const network = await this.provider.getNetwork();
    const currentBlock = await this.provider.getBlockNumber();
    this.db.log('INFO', `Connected to EVM RPC [Chain ID: ${network.chainId}]. Current Block: ${currentBlock}`);

    // Sync any historical events missed while daemon was offline
    await this.syncHistoricalEvents(currentBlock);

    // Subscribe to live events
    this.contract.on(
      "CrossRuntimeDispatch",
      async (dispatchId, sender, targetWasm, selector, payload, fee, refundAddr, timestamp, eventPayload) => {
        const txHash = eventPayload?.log?.transactionHash || '0x';
        this.handleDispatchEvent(
          dispatchId,
          sender,
          targetWasm,
          selector,
          payload,
          fee,
          refundAddr,
          Number(timestamp),
          txHash
        );
      }
    );

    // Periodically update the synced block cursor
    setInterval(async () => {
      try {
        const latest = await this.provider.getBlockNumber();
        this.db.setLastSyncedBlock(latest);
      } catch {
        // Fallback on connection blip
      }
    }, 10_000);
  }

  private async syncHistoricalEvents(currentBlock: number): Promise<void> {
    let fromBlock = this.db.getLastSyncedBlock();
    if (fromBlock === 0 || fromBlock > currentBlock) {
      fromBlock = Math.max(0, currentBlock - 500); // scan past 500 blocks on first run
    }

    if (fromBlock < currentBlock) {
      this.db.log('INFO', `Scanning historical blocks ${fromBlock} to ${currentBlock}...`);
      const filter = this.contract.filters.CrossRuntimeDispatch();
      const logs = await this.contract.queryFilter(filter, fromBlock, currentBlock);

      for (const log of logs) {
        if ('args' in log) {
          const [dispatchId, sender, targetWasm, selector, payload, fee, refundAddr, timestamp] = log.args;
          this.handleDispatchEvent(
            dispatchId,
            sender,
            targetWasm,
            selector,
            payload,
            fee,
            refundAddr,
            Number(timestamp),
            log.transactionHash
          );
        }
      }
      this.db.setLastSyncedBlock(currentBlock);
    }
  }

  private handleDispatchEvent(
    dispatchId: string,
    sender: string,
    targetWasm: string,
    selector: string,
    payload: string,
    fee: bigint,
    refundAddr: string,
    timestamp: number,
    txHash: string
  ): void {
    const inserted = this.db.insertDispatch({
      dispatch_id: dispatchId,
      source_chain: 'Portaldot-EVM',
      source_tx_hash: txHash,
      sender_address: sender,
      target_wasm_contract: targetWasm,
      selector: selector,
      abi_payload: payload,
      fee: fee.toString(),
      refund_address: refundAddr,
      status: 'PENDING',
      retry_count: 0,
      created_at: timestamp * 1000 || Date.now(),
      updated_at: Date.now(),
    });

    if (inserted) {
      this.db.log('INFO', `[EVM] Captured CrossRuntimeDispatch: ${dispatchId.slice(0, 10)}... from ${sender.slice(0, 8)}`);
    }
  }

  public async markSettledOnChain(dispatchId: string, wasmTxHash: string): Promise<string> {
    const tx = await this.contract.settle(dispatchId, wasmTxHash);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  public async markRefundOnChain(dispatchId: string, reason: string): Promise<string> {
    const tx = await this.contract.refund(dispatchId, reason);
    const receipt = await tx.wait();
    return receipt.hash;
  }
}
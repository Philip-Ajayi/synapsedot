import { ethers } from 'ethers';
import { CONFIG } from './config';
import { RelayDatabase } from './db';

const DISPATCHER_ABI = [
  "event CrossRuntimeDispatch(bytes32 indexed dispatchId, address indexed sender, bytes32 indexed targetWasmContract, bytes4 selector, bytes payload, uint256 fee, address refundAddress, uint256 timestamp)",
  "function settle(bytes32 dispatchId, bytes32 wasmTxHash) external",
  "function refund(bytes32 dispatchId, string calldata reason) external"
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
    console.log(`[EVM-LISTENER] Subscribing to CrossRuntimeDispatch events at ${CONFIG.dispatcherAddress}...`);

    // Query historical and listen to current logs
    this.contract.on("CrossRuntimeDispatch", async (dispatchId, sender, targetWasm, selector, payload, fee, refundAddr, timestamp, event) => {
      console.log(`[EVM-LISTENER] Log detected! Dispatch ID: ${dispatchId}`);
      this.db.insertDispatch({
        dispatch_id: dispatchId,
        source_chain: 'Portaldot-EVM',
        source_tx_hash: event.log.transactionHash,
        sender_address: sender,
        target_wasm_contract: targetWasm,
        selector: selector,
        abi_payload: payload,
        fee: fee.toString(),
        refund_address: refundAddr,
        status: 'PENDING',
        retry_count: 0,
        created_at: Number(timestamp) * 1000,
        updated_at: Date.now()
      });
    });
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

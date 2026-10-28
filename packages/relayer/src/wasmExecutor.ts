import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { KeyringPair } from '@polkadot/keyring/types';
import { CONFIG } from './config';

export class WasmExecutor {
  private api: ApiPromise | null = null;
  private signer: KeyringPair | null = null;

  public async init(): Promise<void> {
    const provider = new WsProvider(CONFIG.substrateWs);
    this.api = await ApiPromise.create({ provider });

    const keyring = new Keyring({ type: 'sr25519' });
    this.signer = keyring.addFromUri(CONFIG.substrateSeed);
    console.log(`[WASM-EXECUTOR] Connected to Substrate WS. Signer Address: ${this.signer.address}`);
  }

  /**
   * Executes Substrate extrinsic calling pallet_contracts::call with raw SCALE data
   */
  public async submitContractCall(
    destContractAddress32: string,
    scaleData: Uint8Array
  ): Promise<string> {
    if (!this.api || !this.signer) {
      throw new Error('WasmExecutor is not initialized');
    }

    const gasLimit = this.api.registry.createType('WeightV2', {
      refTime: 300_000_000_000n,
      proofSize: 1_000_000n,
    });

    const tx = this.api.tx.contracts.call(
      destContractAddress32,
      0, // value: 0 native tokens transferred with call
      gasLimit,
      null, // storageDepositLimit
      scaleData
    );

    return new Promise<string>((resolve, reject) => {
      tx.signAndSend(this.signer!, ({ status, dispatchError, events }) => {
        if (dispatchError) {
          if (dispatchError.isModule) {
            const decoded = this.api!.registry.findMetaError(dispatchError.asModule);
            reject(new Error(`Pallet contracts module error: ${decoded.section}.${decoded.name}`));
          } else {
            reject(new Error(`Extrinsic dispatch error: ${dispatchError.toString()}`));
          }
          return;
        }

        if (status.isInBlock || status.isFinalized) {
          const blockHash = status.isInBlock ? status.asInBlock.toHex() : status.asFinalized.toHex();
          resolve(blockHash);
        }
      }).catch(reject);
    });
  }
}

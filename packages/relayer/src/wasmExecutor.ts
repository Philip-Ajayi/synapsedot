import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { KeyringPair } from '@polkadot/keyring/types';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { u8aToHex, isHex } from '@polkadot/util';
import { CONFIG } from './config';

export class WasmExecutor {
  private api: ApiPromise | null = null;
  private signer: KeyringPair | null = null;

  public async init(): Promise<void> {
    const provider = new WsProvider(CONFIG.substrateWs);
    this.api = await ApiPromise.create({ provider });

    const keyring = new Keyring({ type: 'sr25519' });
    this.signer = keyring.addFromUri(CONFIG.substrateSeed);
    console.log(`[WASM-EXECUTOR] Substrate Connected. Relayer Signer: ${this.signer.address}`);
  }

  /**
   * Normalizes any input (SS58 or 32-byte hex) into standard SS58 formatted address
   */
  private formatDestination(target: string): string {
    try {
      if (isHex(target)) {
        return encodeAddress(target, 42);
      }
      const raw = decodeAddress(target);
      return encodeAddress(raw, 42);
    } catch {
      return target;
    }
  }

  /**
   * Executes pallet_contracts::call with raw SCALE payload
   */
  public async submitContractCall(
    destContract: string,
    scaleData: Uint8Array
  ): Promise<string> {
    if (!this.api || !this.signer) {
      throw new Error('WasmExecutor is not initialized');
    }

    const formattedTarget = this.formatDestination(destContract);

    const gasLimit = this.api.registry.createType('WeightV2', {
      refTime: 300_000_000_000n,
      proofSize: 2_000_000n,
    });

    const tx = this.api.tx.contracts.call(
      formattedTarget,
      0, // value: 0 native tokens transferred with call
      gasLimit,
      null, // storageDepositLimit
      scaleData
    );

    return new Promise<string>((resolve, reject) => {
      let unsub: (() => void) | null = null;

      tx.signAndSend(this.signer!, (result) => {
        const { status, dispatchError } = result;

        if (dispatchError) {
          if (unsub) unsub();
          if (dispatchError.isModule) {
            const decoded = this.api!.registry.findMetaError(dispatchError.asModule);
            reject(new Error(`ink! module error: ${decoded.section}.${decoded.name}`));
          } else {
            reject(new Error(`Extrinsic dispatch failed: ${dispatchError.toString()}`));
          }
          return;
        }

        if (status.isInBlock || status.isFinalized) {
          if (unsub) unsub();
          const hash = status.isInBlock ? status.asInBlock.toHex() : status.asFinalized.toHex();
          resolve(hash);
        }
      })
      .then((unsubscriber) => {
        unsub = unsubscriber;
      })
      .catch((err) => {
        if (unsub) (unsub as any)();
        reject(err);
      });
    });
  }
}
import { AbiDecoder } from './abi';
import { ScaleEncoder } from './scale';
import { TranscodeDefinition } from './types';

export * from './types';
export * from './scale';
export * from './abi';

export class DynamicTranscoder {
  /**
   * Transcodes an EVM ABI-encoded buffer into Substrate ink! 5.0 compatible SCALE bytes.
   * Prepends the 4-byte ink! message selector.
   */
  public static transcodeAbiToScale(
    abiPayloadHex: string,
    definition: TranscodeDefinition
  ): Uint8Array {
    const decoder = new AbiDecoder(abiPayloadHex);
    const encoder = new ScaleEncoder();

    // 1. Write the 4-byte ink! message selector
    const cleanSelector = definition.inkSelector.startsWith('0x')
      ? definition.inkSelector.slice(2)
      : definition.inkSelector;
    if (cleanSelector.length !== 8) {
      throw new Error(`ink! selector must be 4 bytes (8 hex characters), got ${cleanSelector.length}`);
    }
    encoder.writeRawBytes(Buffer.from(cleanSelector, 'hex'));

    // 2. Transcode each parameter strictly according to definition
    for (let i = 0; i < definition.params.length; i++) {
      const p = definition.params[i];

      switch (p.toScale) {
        case 'H160': {
          const addr = decoder.readAddress(i);
          encoder.writeH160(addr);
          break;
        }

        case 'AccountId32': {
          const b32 = decoder.readBytes32(i);
          encoder.writeAccountId32(b32);
          break;
        }

        case 'u8': {
          const val = Number(decoder.readUint256(i));
          encoder.writeU8(val);
          break;
        }

        case 'u32': {
          const val = Number(decoder.readUint256(i));
          encoder.writeU32LE(val);
          break;
        }

        case 'u64': {
          const val = decoder.readUint256(i);
          encoder.writeU64LE(val);
          break;
        }

        case 'u128': {
          const val = decoder.readUint256(i);
          // Check range fits within u128
          if (val > 0xffffffffffffffffffffffffffffffffn) {
            throw new Error(`Value ${val} exceeds u128 boundary`);
          }
          encoder.writeU128LE(val);
          break;
        }

        case 'u256': {
          const val = decoder.readUint256(i);
          encoder.writeU256LE(val);
          break;
        }

        case 'Compact<u128>': {
          const val = decoder.readUint256(i);
          encoder.writeCompact(val);
          break;
        }

        case 'bool': {
          const val = decoder.readUint256(i) !== 0n;
          encoder.writeBool(val);
          break;
        }

        case 'Bytes': {
          const bytes = decoder.readDynamicBytes(i);
          encoder.writeBytes(bytes);
          break;
        }

        case 'String': {
          const bytes = decoder.readDynamicBytes(i);
          const str = Buffer.from(bytes).toString('utf8');
          encoder.writeString(str);
          break;
        }

        default:
          throw new Error(`Unsupported destination SCALE type: ${p.toScale}`);
      }
    }

    return encoder.getBytes();
  }
}

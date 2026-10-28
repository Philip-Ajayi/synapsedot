/**
 * Lightweight EVM ABI Decoder.
 * Decodes standard Solidity ABI words (32-byte chunks) without heavy external packages.
 */
export class AbiDecoder {
  private readonly data: Uint8Array;

  constructor(hexPayload: string) {
    const clean = hexPayload.startsWith('0x') ? hexPayload.slice(2) : hexPayload;
    if (clean.length % 2 !== 0) {
      throw new Error('Invalid hexadecimal payload string');
    }
    this.data = Buffer.from(clean, 'hex');
  }

  public get length(): number {
    return this.data.length;
  }

  public getWord(index: number): Uint8Array {
    const start = index * 32;
    const end = start + 32;
    if (end > this.data.length) {
      throw new Error(`ABI decode index ${index} out of bounds: requires byte offset ${end}, buffer length is ${this.data.length}`);
    }
    return this.data.subarray(start, end);
  }

  public readAddress(wordIndex: number): string {
    const word = this.getWord(wordIndex);
    // Address occupies the right-most 20 bytes of the 32-byte word
    const addressBytes = word.subarray(12, 32);
    return '0x' + Buffer.from(addressBytes).toString('hex');
  }

  public readUint256(wordIndex: number): bigint {
    const word = this.getWord(wordIndex);
    return BigInt('0x' + Buffer.from(word).toString('hex'));
  }

  public readBytes32(wordIndex: number): string {
    const word = this.getWord(wordIndex);
    return '0x' + Buffer.from(word).toString('hex');
  }

  public readDynamicBytes(offsetWordIndex: number): Uint8Array {
    const offset = Number(this.readUint256(offsetWordIndex));
    if (offset >= this.data.length) {
      throw new Error(`Invalid dynamic data offset: ${offset}`);
    }
    const lengthBytes = this.data.subarray(offset, offset + 32);
    const length = Number(BigInt('0x' + Buffer.from(lengthBytes).toString('hex')));
    const dataStart = offset + 32;
    const dataEnd = dataStart + length;
    if (dataEnd > this.data.length) {
      throw new Error(`Dynamic bytes bounds exceeded: offset ${dataEnd} > total ${this.data.length}`);
    }
    return this.data.subarray(dataStart, dataEnd);
  }
}

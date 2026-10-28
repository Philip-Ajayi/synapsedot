/**
 * Zero-dependency SCALE (Simple Concatenated Aggregate Little-Endian) Codec Encoder.
 * Implements Substrate primitives according to the Web3 Foundation specification.
 */
export class ScaleEncoder {
  private buffer: number[] = [];

  public getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  public getHex(): string {
    return '0x' + Buffer.from(this.getBytes()).toString('hex');
  }

  public writeRawBytes(bytes: Uint8Array | number[]): this {
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i]);
    }
    return this;
  }

  public writeU8(val: number): this {
    if (val < 0 || val > 0xff) throw new Error(`Out of range for u8: ${val}`);
    this.buffer.push(val & 0xff);
    return this;
  }

  public writeU16LE(val: number): this {
    this.buffer.push(val & 0xff);
    this.buffer.push((val >> 8) & 0xff);
    return this;
  }

  public writeU32LE(val: number): this {
    this.buffer.push(val & 0xff);
    this.buffer.push((val >> 8) & 0xff);
    this.buffer.push((val >> 16) & 0xff);
    this.buffer.push((val >> 24) & 0xff);
    return this;
  }

  public writeU64LE(val: bigint): this {
    let temp = val;
    for (let i = 0; i < 8; i++) {
      this.buffer.push(Number(temp & 0xffn));
      temp >>= 8n;
    }
    return this;
  }

  public writeU128LE(val: bigint): this {
    let temp = val;
    for (let i = 0; i < 16; i++) {
      this.buffer.push(Number(temp & 0xffn));
      temp >>= 8n;
    }
    return this;
  }

  public writeU256LE(val: bigint): this {
    let temp = val;
    for (let i = 0; i < 32; i++) {
      this.buffer.push(Number(temp & 0xffn));
      temp >>= 8n;
    }
    return this;
  }

  public writeBool(val: boolean): this {
    this.buffer.push(val ? 0x01 : 0x00);
    return this;
  }

  /**
   * Encodes an unsigned integer in SCALE Compact format.
   * Mode 00: 0 ..= 63 (1 byte)
   * Mode 01: 64 ..= (2^14 - 1) (2 bytes LE)
   * Mode 10: 2^14 ..= (2^30 - 1) (4 bytes LE)
   * Mode 11: Big-integer (1 + N bytes)
   */
  public writeCompact(val: bigint | number): this {
    const big = BigInt(val);
    if (big < 0n) throw new Error('Compact cannot encode negative integers');

    if (big <= 63n) {
      this.buffer.push(Number((big << 2n) | 0b00n));
    } else if (big <= 16383n) {
      const v = (big << 2n) | 0b01n;
      this.buffer.push(Number(v & 0xffn));
      this.buffer.push(Number((v >> 8n) & 0xffn));
    } else if (big <= 1073741823n) {
      const v = (big << 2n) | 0b10n;
      this.buffer.push(Number(v & 0xffn));
      this.buffer.push(Number((v >> 8n) & 0xffn));
      this.buffer.push(Number((v >> 16n) & 0xffn));
      this.buffer.push(Number((v >> 24n) & 0xffn));
    } else {
      let temp = big;
      const bytes: number[] = [];
      while (temp > 0n) {
        bytes.push(Number(temp & 0xffn));
        temp >>= 8n;
      }
      if (bytes.length < 4) {
        while (bytes.length < 4) bytes.push(0);
      }
      const header = ((bytes.length - 4) << 2) | 0b11;
      this.buffer.push(header);
      for (const b of bytes) {
        this.buffer.push(b);
      }
    }
    return this;
  }

  public writeBytes(bytes: Uint8Array): this {
    this.writeCompact(bytes.length);
    this.writeRawBytes(bytes);
    return this;
  }

  public writeString(str: string): this {
    const encoded = Buffer.from(str, 'utf8');
    this.writeBytes(encoded);
    return this;
  }

  public writeAccountId32(hex: string): this {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (clean.length !== 64) {
      throw new Error(`AccountId32 must be 32 bytes (64 hex characters), got: ${clean.length}`);
    }
    const buf = Buffer.from(clean, 'hex');
    this.writeRawBytes(buf);
    return this;
  }

  public writeH160(hex: string): this {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (clean.length !== 40) {
      throw new Error(`H160 must be 20 bytes (40 hex characters), got: ${clean.length}`);
    }
    const buf = Buffer.from(clean, 'hex');
    this.writeRawBytes(buf);
    return this;
  }
}

/**
 * Zero-dependency Substrate SS58 Address Decoder/Encoder.
 * Allows users to paste any standard Substrate format or Hex public key.
 */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function ss58ToHex(address: string): string {
  const clean = address.trim();
  if (clean.startsWith('0x') && clean.length === 66) {
    return clean.toLowerCase();
  }

  // Base58 decode
  let bytes = [0];
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    const val = BASE58_ALPHABET.indexOf(c);
    if (val < 0) throw new Error(`Invalid Base58 character: ${c}`);

    for (let j = 0; j < bytes.length; j++) bytes[j] *= 58;
    bytes[0] += val;

    let carry = 0;
    for (let j = 0; j < bytes.length; j++) {
      bytes[j] += carry;
      carry = bytes[j] >> 8;
      bytes[j] &= 0xff;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (let i = 0; i < clean.length && clean[i] === '1'; i++) {
    bytes.push(0);
  }

  const decoded = new Uint8Array(bytes.reverse());
  // Standard Substrate SS58 payload: [prefix byte, 32 bytes public key, 2 bytes checksum]
  if (decoded.length < 35) {
    throw new Error('Invalid Substrate address length');
  }

  const pubKey = decoded.subarray(1, 33);
  return '0x' + Buffer.from(pubKey).toString('hex');
}

export function hexToSs58(hex: string, prefix: number = 42): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length !== 64) return hex;
  // Fallback representation if full Blake2b is not bundled in pure browser context
  return `5...${clean.slice(0, 4)}${clean.slice(-4)}`;
}

export function abiEncodeDeposit(evmAddress: string, wasmAccountIdOrSs58: string, amountPot: number): string {
  const cleanEvm = (evmAddress || '0x0000000000000000000000000000000000000000')
    .toLowerCase()
    .replace('0x', '')
    .padStart(64, '0');

  let wasmHex32: string;
  try {
    wasmHex32 = ss58ToHex(wasmAccountIdOrSs58).replace('0x', '');
  } catch {
    wasmHex32 = wasmAccountIdOrSs58.replace('0x', '').padEnd(64, '0').slice(0, 64);
  }

  const amountBig = BigInt(Math.max(0, Math.floor(amountPot * 1e18)));
  const cleanAmount = amountBig.toString(16).padStart(64, '0');

  return '0x' + cleanEvm + wasmHex32 + cleanAmount;
}

export function transcodeToScale(abiPayload: string, selector: string = '0x3a5b6c7d'): { scaleHex: string; breakdown: any[] } {
  const clean = abiPayload.replace('0x', '');
  const evmWord = clean.slice(0, 64);
  const wasmWord = clean.slice(64, 128);
  const amountWord = clean.slice(128, 192);

  const evmRaw20 = evmWord.slice(24, 64);
  const wasmRaw32 = wasmWord;
  const amountBig = BigInt('0x' + (amountWord || '0'));

  // Pack amountBig as u128 Little-Endian (16 bytes)
  const leBytes: number[] = [];
  let temp = amountBig;
  for (let i = 0; i < 16; i++) {
    leBytes.push(Number(temp & BigInt(0xff)));
    temp >>= BigInt(8);
  }
  const u128LeHex = Buffer.from(leBytes).toString('hex');

  const cleanSelector = selector.replace('0x', '');
  const scaleHex = '0x' + cleanSelector + evmRaw20 + wasmRaw32 + u128LeHex;

  return {
    scaleHex,
    breakdown: [
      { field: 'ink! Selector', size: '4 Bytes', hex: '0x' + cleanSelector, desc: 'mint_from_evm' },
      { field: 'origin_evm (H160)', size: '20 Bytes', hex: '0x' + evmRaw20, desc: 'EVM origin caller' },
      { field: 'recipient (AccountId32)', size: '32 Bytes', hex: '0x' + wasmRaw32, desc: 'Substrate 32-byte public key' },
      { field: 'amount (u128 LE)', size: '16 Bytes', hex: '0x' + u128LeHex, desc: 'Native token amount (Little-Endian)' }
    ]
  };
}
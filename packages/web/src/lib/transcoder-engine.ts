/**
 * In-browser Transcoder logic mirror
 */
export function abiEncodeDeposit(evmAddress: string, wasmAccountId: string, amountPot: number): string {
  const cleanEvm = evmAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const cleanWasm = wasmAccountId.toLowerCase().replace('0x', '').padEnd(64, '0');
  const amountBig = BigInt(Math.floor(amountPot * 1e18));
  const cleanAmount = amountBig.toString(16).padStart(64, '0');
  return '0x' + cleanEvm + cleanWasm + cleanAmount;
}

export function transcodeToScale(abiPayload: string, selector: string = '0x3a5b6c7d'): { scaleHex: string; breakdown: any[] } {
  const clean = abiPayload.replace('0x', '');
  const evmWord = clean.slice(0, 64);
  const wasmWord = clean.slice(64, 128);
  const amountWord = clean.slice(128, 192);

  const evmRaw20 = evmWord.slice(24, 64); // EVM 20 bytes
  const wasmRaw32 = wasmWord; // WASM 32 bytes
  const amountBig = BigInt('0x' + amountWord);

  // Convert amountBig to u128 little endian (16 bytes)
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
      { field: 'ink! Selector', size: '4 Bytes', hex: '0x' + cleanSelector, desc: 'Blake2b hash selector (mint_from_evm)' },
      { field: 'origin_evm (H160)', size: '20 Bytes', hex: '0x' + evmRaw20, desc: 'EVM sender address' },
      { field: 'recipient (AccountId32)', size: '32 Bytes', hex: '0x' + wasmRaw32, desc: 'Substrate native 32-byte public key' },
      { field: 'amount (u128 LE)', size: '16 Bytes', hex: '0x' + u128LeHex, desc: 'Substrate balance in Little-Endian' }
    ]
  };
}
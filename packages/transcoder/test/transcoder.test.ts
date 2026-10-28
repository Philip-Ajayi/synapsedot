import { DynamicTranscoder, TranscodeDefinition } from '../src';

function runTests() {
  console.log('[TEST] Initializing @synapsedot/transcoder test suite...');

  // Target ink! selector: 0x3a5b6c7d (mint_from_evm)
  // Solidity ABI payload:
  // Param 0: address origin_evm (20 bytes padded to 32 bytes)
  // Param 1: bytes32 recipient_account_id (32 bytes raw)
  // Param 2: uint256 amount (10 POT = 10 * 10^18)
  const testOriginEvm = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
  const testRecipientWasm = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d'; // Alice in Substrate
  const testAmount = 10_000_000_000_000_000_000n; // 10 POT

  // Construct ABI-encoded hex representation (3 words of 32 bytes)
  const word0 = testOriginEvm.replace('0x', '').padStart(64, '0');
  const word1 = testRecipientWasm.replace('0x', '');
  const word2 = testAmount.toString(16).padStart(64, '0');
  const mockAbiPayload = '0x' + word0 + word1 + word2;

  const definition: TranscodeDefinition = {
    inkSelector: '0x3a5b6c7d',
    params: [
      { name: 'origin_evm', fromAbi: 'address', toScale: 'H160' },
      { name: 'recipient', fromAbi: 'bytes32', toScale: 'AccountId32' },
      { name: 'amount', fromAbi: 'uint256', toScale: 'u128' }
    ]
  };

  const scaleBytes = DynamicTranscoder.transcodeAbiToScale(mockAbiPayload, definition);
  const scaleHex = '0x' + Buffer.from(scaleBytes).toString('hex');

  console.log('Transcoded Scale Hex:', scaleHex);

  // Assertions
  // 1. Check 4-byte selector: 0x3a5b6c7d
  if (!scaleHex.startsWith('0x3a5b6c7d')) {
    throw new Error('Selector assertion failed');
  }

  // 2. Check total byte length:
  // 4 (selector) + 20 (H160) + 32 (AccountId32) + 16 (u128) = 72 bytes
  if (scaleBytes.length !== 72) {
    throw new Error(`Expected exactly 72 bytes, got ${scaleBytes.length}`);
  }

  // 3. Verify origin address inside scale bytes: starts at index 4, length 20
  const extractedEvm = Buffer.from(scaleBytes.subarray(4, 24)).toString('hex');
  if (extractedEvm.toLowerCase() !== testOriginEvm.replace('0x', '').toLowerCase()) {
    throw new Error('EVM address extraction mismatch');
  }

  // 4. Verify WASM AccountId: starts at index 24, length 32
  const extractedAccountId = Buffer.from(scaleBytes.subarray(24, 56)).toString('hex');
  if (extractedAccountId.toLowerCase() !== testRecipientWasm.replace('0x', '').toLowerCase()) {
    throw new Error('AccountId32 extraction mismatch');
  }

  console.log('[TEST] Transcoder suite passed successfully (100% assertions satisfied)!');
}

runTests();

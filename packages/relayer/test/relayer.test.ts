import { RelayDatabase } from '../src/db';
import fs from 'fs';

function runRelayerDatabaseTest() {
  const testDbFile = './test_synapse.db';
  if (fs.existsSync(testDbFile)) {
    fs.unlinkSync(testDbFile);
  }

  const db = new RelayDatabase(testDbFile);

  const mockDispatchId = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  db.insertDispatch({
    dispatch_id: mockDispatchId,
    source_chain: 'Portaldot-EVM',
    source_tx_hash: '0xaaa',
    sender_address: '0x1111111111111111111111111111111111111111',
    target_wasm_contract: '0x2222222222222222222222222222222222222222222222222222222222222222',
    selector: '0x3a5b6c7d',
    abi_payload: '0x000',
    fee: '1000000000000000',
    refund_address: '0x1111111111111111111111111111111111111111',
    status: 'PENDING',
    retry_count: 0,
    created_at: Date.now(),
    updated_at: Date.now()
  });

  const pending = db.getPendingDispatches();
  if (pending.length !== 1 || pending[0].dispatch_id !== mockDispatchId) {
    throw new Error('Database insertion or retrieval failed');
  }

  db.updateStatus(mockDispatchId, 'SETTLED', '0x999', '0xbbb');
  const pendingAfter = db.getPendingDispatches();
  if (pendingAfter.length !== 0) {
    throw new Error('Settled job should not appear in pending list');
  }

  console.log('[TEST] Relayer SQLite persistence test passed successfully.');
  if (fs.existsSync(testDbFile)) {
    fs.unlinkSync(testDbFile);
  }
}

runRelayerDatabaseTest();

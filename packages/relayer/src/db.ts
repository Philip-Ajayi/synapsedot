import Database from 'better-sqlite3';
import { RelayRecord, RelayJobStatus } from './types';

export class RelayDatabase {
  private db: Database.Database;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dispatches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dispatch_id TEXT UNIQUE NOT NULL,
        source_chain TEXT NOT NULL,
        source_tx_hash TEXT NOT NULL,
        sender_address TEXT NOT NULL,
        target_wasm_contract TEXT NOT NULL,
        selector TEXT NOT NULL,
        abi_payload TEXT NOT NULL,
        scale_payload TEXT,
        dest_tx_hash TEXT,
        fee TEXT NOT NULL,
        refund_address TEXT NOT NULL,
        status TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_status ON dispatches(status);

      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS relayer_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL
      );
    `);
  }

  public insertDispatch(record: Omit<RelayRecord, 'id'>): boolean {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO dispatches (
        dispatch_id, source_chain, source_tx_hash, sender_address,
        target_wasm_contract, selector, abi_payload, scale_payload,
        dest_tx_hash, fee, refund_address, status, retry_count,
        error_message, created_at, updated_at
      ) VALUES (
        @dispatch_id, @source_chain, @source_tx_hash, @sender_address,
        @target_wasm_contract, @selector, @abi_payload, @scale_payload,
        @dest_tx_hash, @fee, @refund_address, @status, @retry_count,
        @error_message, @created_at, @updated_at
      )
    `);
    const info = stmt.run(record);
    return info.changes > 0;
  }

  public getPendingDispatches(): RelayRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM dispatches
      WHERE status IN ('PENDING', 'TRANSCODED', 'SUBMITTING')
      ORDER BY id ASC LIMIT 20
    `);
    return stmt.all() as RelayRecord[];
  }

  public getRecentDispatches(limit: number = 20): RelayRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM dispatches ORDER BY id DESC LIMIT ?
    `);
    return stmt.all(limit) as RelayRecord[];
  }

  public getDispatchById(dispatchId: string): RelayRecord | undefined {
    const stmt = this.db.prepare(`SELECT * FROM dispatches WHERE dispatch_id = ?`);
    return stmt.get(dispatchId) as RelayRecord | undefined;
  }

  public updateStatus(
    dispatchId: string,
    status: RelayJobStatus,
    scalePayload?: string,
    destTxHash?: string,
    error?: string
  ): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE dispatches SET
        status = @status,
        scale_payload = COALESCE(@scalePayload, scale_payload),
        dest_tx_hash = COALESCE(@destTxHash, dest_tx_hash),
        error_message = @error,
        updated_at = @now
      WHERE dispatch_id = @dispatchId
    `);
    stmt.run({
      dispatchId,
      status,
      scalePayload: scalePayload || null,
      destTxHash: destTxHash || null,
      error: error || null,
      now,
    });
  }

  public incrementRetry(dispatchId: string, error: string): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE dispatches SET
        retry_count = retry_count + 1,
        error_message = @error,
        updated_at = @now
      WHERE dispatch_id = @dispatchId
    `);
    stmt.run({ dispatchId, error, now });
  }

  public getLastSyncedBlock(): number {
    const stmt = this.db.prepare(`SELECT value FROM sync_state WHERE key = 'last_evm_block'`);
    const row = stmt.get() as { value: string } | undefined;
    return row ? Number(row.value) : 0;
  }

  public setLastSyncedBlock(blockNumber: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO sync_state (key, value) VALUES ('last_evm_block', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(blockNumber.toString());
  }

  public log(level: 'INFO' | 'SUCCESS' | 'WARN' | 'EXEC' | 'ERROR', message: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO relayer_logs (timestamp, level, message) VALUES (?, ?, ?)
    `);
    stmt.run(Date.now(), level, message);
  }

  public getRecentLogs(limit: number = 50): Array<{ id: number; timestamp: number; level: string; message: string }> {
    const stmt = this.db.prepare(`SELECT * FROM relayer_logs ORDER BY id DESC LIMIT ?`);
    return (stmt.all(limit) as any[]).reverse();
  }
}
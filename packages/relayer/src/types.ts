export type RelayJobStatus =
  | 'PENDING'
  | 'TRANSCODED'
  | 'SUBMITTING'
  | 'CONFIRMED'
  | 'SETTLED'
  | 'FAILED'
  | 'REFUNDED';

export interface RelayRecord {
  id?: number;
  dispatch_id: string;
  source_chain: string;
  source_tx_hash: string;
  sender_address: string;
  target_wasm_contract: string;
  selector: string;
  abi_payload: string;
  scale_payload?: string;
  dest_tx_hash?: string;
  fee: string;
  refund_address: string;
  status: RelayJobStatus;
  retry_count: number;
  error_message?: string;
  created_at: number;
  updated_at: number;
}

export type AbiType =
  | 'address'
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'uint64'
  | 'uint128'
  | 'uint256'
  | 'bytes32'
  | 'bytes'
  | 'bool'
  | 'string';

export type ScaleType =
  | 'H160'
  | 'AccountId32'
  | 'u8'
  | 'u16'
  | 'u32'
  | 'u64'
  | 'u128'
  | 'u256'
  | 'Compact<u128>'
  | 'bool'
  | 'Bytes'
  | 'String';

export interface ParamMapping {
  readonly name: string;
  readonly fromAbi: AbiType;
  readonly toScale: ScaleType;
}

export interface TranscodeDefinition {
  readonly inkSelector: string; // 4-byte hex: e.g. "0x3a5b6c7d"
  readonly params: readonly ParamMapping[];
}

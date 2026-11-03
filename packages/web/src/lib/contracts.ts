export const PORTALDOT_EVM_NETWORK = {
  chainId: '0x' + Number(process.env.NEXT_PUBLIC_EVM_CHAIN_ID || 1337).toString(16),
  chainName: 'Portaldot EVM Local/Testnet',
  nativeCurrency: {
    name: 'Portaldot POT',
    symbol: 'POT',
    decimals: 18,
  },
  rpcUrls: [process.env.NEXT_PUBLIC_EVM_RPC || 'http://127.0.0.1:8545'],
  blockExplorerUrls: ['https://explorer.portaldot.io'],
};

export const DISPATCHER_ABI = [
  "event CrossRuntimeDispatch(bytes32 indexed dispatchId, address indexed sender, bytes32 indexed targetWasmContract, bytes4 selector, bytes payload, uint256 fee, address refundAddress, uint256 timestamp)",
  "function dispatch(bytes32 targetWasmContract, bytes4 selector, bytes calldata payload, address refundAddress) external payable returns (bytes32 dispatchId)",
  "function settle(bytes32 dispatchId, bytes32 wasmTxHash) external",
  "function refund(bytes32 dispatchId, string calldata reason) external",
  "function getDispatch(bytes32 dispatchId) external view returns (tuple(bytes32 dispatchId, address sender, bytes32 targetWasmContract, bytes4 selector, uint256 fee, address refundAddress, uint8 status, uint256 timestamp, bytes32 wasmTxHash))",
  "function baseRelayFee() external view returns (uint256)"
];

export const MOCK_VAULT_ABI = [
  "function lockAndMint(bytes32 wasmRecipient) external payable returns (bytes32 dispatchId)",
  "function dispatcher() external view returns (address)",
  "function wasmReceiverContract() external view returns (bytes32)",
  "function setWasmReceiverContract(bytes32 _receiver) external"
];

export async function switchToPortaldotNetwork(): Promise<void> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('MetaMask is not installed');
  }
  const ethereum = (window as any).ethereum;
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: PORTALDOT_EVM_NETWORK.chainId }],
    });
  } catch (switchError: any) {
    if (switchError.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [PORTALDOT_EVM_NETWORK],
      });
    } else {
      throw switchError;
    }
  }
}
import { ethers } from 'ethers';

export const PORTALDOT_EVM_NETWORK = {
  chainId: '0x539', // 1337 in hex (or your testnet chainId e.g. '0x...')
  chainName: 'Portaldot EVM Testnet',
  nativeCurrency: {
    name: 'Portaldot POT',
    symbol: 'POT',
    decimals: 18,
  },
  rpcUrls: [process.env.NEXT_PUBLIC_EVM_RPC || 'https://rpc-testnet.portaldot.io'],
  blockExplorerUrls: ['https://explorer.portaldot.io'],
};

export const DISPATCHER_ABI = [
  "event CrossRuntimeDispatch(bytes32 indexed dispatchId, address indexed sender, bytes32 indexed targetWasmContract, bytes4 selector, bytes payload, uint256 fee, address refundAddress, uint256 timestamp)",
  "function dispatch(bytes32 targetWasmContract, bytes4 selector, bytes calldata payload, address refundAddress) external payable returns (bytes32 dispatchId)",
  "function getDispatch(bytes32 dispatchId) external view returns (tuple(bytes32 dispatchId, address sender, bytes32 targetWasmContract, bytes4 selector, uint256 fee, address refundAddress, uint8 status, uint256 timestamp, bytes32 wasmTxHash))",
  "function baseRelayFee() external view returns (uint256)"
];

export const MOCK_VAULT_ABI = [
  "function lockAndMint(bytes32 wasmRecipient) external payable returns (bytes32 dispatchId)",
  "function dispatcher() external view returns (address)",
  "function wasmReceiverContract() external view returns (bytes32)"
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
    // Error code 4902 indicates that the chain has not been added to MetaMask yet
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

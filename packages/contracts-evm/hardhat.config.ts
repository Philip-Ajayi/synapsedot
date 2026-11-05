import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337, // Fixes MetaMask chain ID mismatch
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
    },
    portaldotTestnet: {
      url: process.env.PORTALDOT_EVM_RPC_HTTP || "https://test-evm-rpc-v3.portaldot.dev",
      chainId: 420420777,
      accounts: process.env.EVM_RELAYER_PRIVATE_KEY ? [process.env.EVM_RELAYER_PRIVATE_KEY] : [],
    },
  },
};

export default config;
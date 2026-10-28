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
    portaldotEvm: {
      url: process.env.PORTALDOT_EVM_RPC_HTTP || "http://127.0.0.1:8545",
      accounts: process.env.EVM_RELAYER_PRIVATE_KEY ? [process.env.EVM_RELAYER_PRIVATE_KEY] : [],
    },
  },
};

export default config;

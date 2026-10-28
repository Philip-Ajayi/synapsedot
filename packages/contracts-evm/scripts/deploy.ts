import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`[DEPLOY] Deploying EVM contracts with account: ${deployer.address}`);

  const SynapseDispatcher = await ethers.getContractFactory("SynapseDispatcher");
  const dispatcher = await SynapseDispatcher.deploy();
  await dispatcher.waitForDeployment();
  const dispatcherAddress = await dispatcher.getAddress();
  console.log(`[DEPLOY] SynapseDispatcher deployed to: ${dispatcherAddress}`);

  const MockVaultEVM = await ethers.getContractFactory("MockVaultEVM");
  const vault = await MockVaultEVM.deploy(dispatcherAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`[DEPLOY] MockVaultEVM deployed to: ${vaultAddress}`);

  // Set sample ink! target WASM contract (e.g. Alice's 32-byte AccountId)
  const sampleWasmReceiver = "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";
  const tx = await vault.setWasmReceiverContract(sampleWasmReceiver);
  await tx.wait();
  console.log(`[DEPLOY] Configured default WASM receiver on Vault: ${sampleWasmReceiver}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

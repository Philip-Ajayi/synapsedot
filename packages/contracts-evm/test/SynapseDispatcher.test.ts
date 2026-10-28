import { expect } from "chai";
import { ethers } from "hardhat";

describe("SynapseDispatcher & MockVaultEVM", function () {
  it("Should record and dispatch cross-runtime intent correctly", async function () {
    const [owner, user, relayer] = await ethers.getSigners();

    const SynapseDispatcher = await ethers.getContractFactory("SynapseDispatcher");
    const dispatcher = await SynapseDispatcher.deploy();
    await dispatcher.waitForDeployment();

    await dispatcher.setRelayer(relayer.address, true);

    const MockVaultEVM = await ethers.getContractFactory("MockVaultEVM");
    const vault = await MockVaultEVM.deploy(await dispatcher.getAddress());
    await vault.waitForDeployment();

    const sampleWasmReceiver = "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";
    await vault.setWasmReceiverContract(sampleWasmReceiver);

    const depositAmount = ethers.parseEther("10.001"); // 10 POT + 0.001 fee
    const tx = await vault.connect(user).lockAndMint(sampleWasmReceiver, { value: depositAmount });
    const receipt = await tx.wait();

    expect(receipt?.status).to.equal(1);

    // Verify dispatch event emitted
    const events = await dispatcher.queryFilter(dispatcher.filters.CrossRuntimeDispatch());
    expect(events.length).to.equal(1);
    const dispatchId = events[0].args.dispatchId;

    // Relayer settles with simulated Substrate tx hash
    const fakeWasmTxHash = ethers.keccak256(ethers.toUtf8Bytes("substrate-block-extrinsic-99"));
    await dispatcher.connect(relayer).settle(dispatchId, fakeWasmTxHash);

    const dispatchRecord = await dispatcher.getDispatch(dispatchId);
    expect(dispatchRecord.status).to.equal(3); // Settled enum index
    expect(dispatchRecord.wasmTxHash).to.equal(fakeWasmTxHash);
  });
});

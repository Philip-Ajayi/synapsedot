// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./SynapseDispatcher.sol";

/**
 * @title MockVaultEVM
 * @notice Example DeFi Vault demonstrating cross-runtime locking and minting.
 * Locks native POT on EVM and invokes ink! WASM mint message.
 */
contract MockVaultEVM is Ownable {
    SynapseDispatcher public immutable dispatcher;
    bytes32 public wasmReceiverContract;
    bytes4 public constant INK_MINT_SELECTOR = 0x3a5b6c7d; // mint_from_evm(origin_evm, recipient, amount)

    event LockedForCrossMint(
        address indexed sender,
        bytes32 indexed wasmRecipient,
        uint256 potAmount,
        bytes32 dispatchId
    );

    constructor(address _dispatcher) Ownable(msg.sender) {
        require(_dispatcher != address(0), "Invalid dispatcher");
        dispatcher = SynapseDispatcher(_dispatcher);
    }

    function setWasmReceiverContract(bytes32 _receiver) external onlyOwner {
        wasmReceiverContract = _receiver;
    }

    /**
     * @notice Locks POT on Portaldot EVM and dispatches cross-call to ink! receiver
     * @param wasmRecipient 32-byte Substrate AccountId of the recipient on WASM runtime
     */
    function lockAndMint(bytes32 wasmRecipient) external payable returns (bytes32 dispatchId) {
        require(msg.value > dispatcher.baseRelayFee(), "Must deposit more than relay fee");
        require(wasmReceiverContract != bytes32(0), "WASM receiver not set");

        uint256 relayFee = dispatcher.baseRelayFee();
        uint256 potToLock = msg.value - relayFee;

        // Encode parameters matching transcoder definition:
        // (address origin_evm, bytes32 recipient, uint256 amount)
        bytes memory payload = abi.encode(msg.sender, wasmRecipient, potToLock);

        dispatchId = dispatcher.dispatch{value: relayFee}(
            wasmReceiverContract,
            INK_MINT_SELECTOR,
            payload,
            msg.sender
        );

        emit LockedForCrossMint(msg.sender, wasmRecipient, potToLock, dispatchId);
    }
}

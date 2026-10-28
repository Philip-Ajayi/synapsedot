// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @dev OpenZeppelin ReentrancyGuard and Ownable abstractions
 */
abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

abstract contract Ownable {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        require(initialOwner != address(0), "Ownable: zero address owner");
        _owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    modifier onlyOwner() {
        require(owner() == msg.sender, "Ownable: caller is not the owner");
        _;
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
}

/**
 * @title SynapseDispatcher
 * @notice Central entrypoint on Portaldot EVM to dispatch atomic calls to ink! contracts on Portaldot WASM.
 */
contract SynapseDispatcher is Ownable, ReentrancyGuard {
    enum DispatchStatus { None, Pending, Relayed, Settled, Failed, Refunded }

    struct DispatchRecord {
        bytes32 dispatchId;
        address sender;
        bytes32 targetWasmContract;
        bytes4 selector;
        uint256 fee;
        address refundAddress;
        DispatchStatus status;
        uint256 timestamp;
        bytes32 wasmTxHash;
    }

    uint256 public dispatchNonce;
    uint256 public baseRelayFee = 0.001 ether;
    mapping(address => bool) public authorizedRelayers;
    mapping(bytes32 => DispatchRecord) public dispatches;

    event CrossRuntimeDispatch(
        bytes32 indexed dispatchId,
        address indexed sender,
        bytes32 indexed targetWasmContract,
        bytes4 selector,
        bytes payload,
        uint256 fee,
        address refundAddress,
        uint256 timestamp
    );

    event DispatchSettled(
        bytes32 indexed dispatchId,
        bytes32 wasmTxHash,
        address relayer
    );

    event DispatchRefunded(
        bytes32 indexed dispatchId,
        address indexed refundAddress,
        uint256 amountRefunded,
        string reason
    );

    event RelayerStatusUpdated(address indexed relayer, bool isAuthorized);
    event BaseRelayFeeUpdated(uint256 newFee);

    modifier onlyRelayer() {
        require(authorizedRelayers[msg.sender] || msg.sender == owner(), "SynapseDispatcher: unauthorized relayer");
        _;
    }

    constructor() Ownable(msg.sender) {
        authorizedRelayers[msg.sender] = true;
    }

    function setRelayer(address relayer, bool status) external onlyOwner {
        require(relayer != address(0), "Invalid relayer address");
        authorizedRelayers[relayer] = status;
        emit RelayerStatusUpdated(relayer, status);
    }

    function setBaseRelayFee(uint256 newFee) external onlyOwner {
        baseRelayFee = newFee;
        emit BaseRelayFeeUpdated(newFee);
    }

    /**
     * @notice Initiates cross-runtime dispatch from EVM to Portaldot ink! WASM.
     * @param targetWasmContract 32-byte AccountId of the destination ink! contract.
     * @param selector 4-byte ink! message selector.
     * @param payload ABI-encoded parameters expected by target transcoder.
     * @param refundAddress Address to receive funds in case of execution failure.
     */
    function dispatch(
        bytes32 targetWasmContract,
        bytes4 selector,
        bytes calldata payload,
        address refundAddress
    ) external payable nonReentrant returns (bytes32 dispatchId) {
        require(msg.value >= baseRelayFee, "Insufficient fee provided");
        require(targetWasmContract != bytes32(0), "Invalid target WASM contract");
        require(refundAddress != address(0), "Invalid refund address");

        dispatchNonce++;
        dispatchId = keccak256(
            abi.encodePacked(
                block.chainid,
                address(this),
                dispatchNonce,
                msg.sender,
                targetWasmContract,
                selector,
                payload
            )
        );

        dispatches[dispatchId] = DispatchRecord({
            dispatchId: dispatchId,
            sender: msg.sender,
            targetWasmContract: targetWasmContract,
            selector: selector,
            fee: msg.value,
            refundAddress: refundAddress,
            status: DispatchStatus.Pending,
            timestamp: block.timestamp,
            wasmTxHash: bytes32(0)
        });

        emit CrossRuntimeDispatch(
            dispatchId,
            msg.sender,
            targetWasmContract,
            selector,
            payload,
            msg.value,
            refundAddress,
            block.timestamp
        );
    }

    /**
     * @notice Called by authorized relayer upon successful execution on Substrate WASM.
     */
    function settle(bytes32 dispatchId, bytes32 wasmTxHash) external onlyRelayer nonReentrant {
        DispatchRecord storage record = dispatches[dispatchId];
        require(record.status == DispatchStatus.Pending, "Dispatch not pending");

        record.status = DispatchStatus.Settled;
        record.wasmTxHash = wasmTxHash;

        // Compensate the relayer with the attached fee
        (bool success, ) = payable(msg.sender).call{value: record.fee}("");
        require(success, "Fee payout failed");

        emit DispatchSettled(dispatchId, wasmTxHash, msg.sender);
    }

    /**
     * @notice Refunds caller if destination execution failed or timed out.
     */
    function refund(bytes32 dispatchId, string calldata reason) external onlyRelayer nonReentrant {
        DispatchRecord storage record = dispatches[dispatchId];
        require(record.status == DispatchStatus.Pending, "Dispatch not pending");

        record.status = DispatchStatus.Refunded;
        uint256 refundAmount = record.fee;

        (bool success, ) = payable(record.refundAddress).call{value: refundAmount}("");
        require(success, "Refund transfer failed");

        emit DispatchRefunded(dispatchId, record.refundAddress, refundAmount, reason);
    }

    function getDispatch(bytes32 dispatchId) external view returns (DispatchRecord memory) {
        return dispatches[dispatchId];
    }
}

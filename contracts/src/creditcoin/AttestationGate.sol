// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    INativeQueryVerifier,
    NativeQueryVerifierLib
} from "@gluwa/usc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";
import {PrecedenceTypes as T} from "./PrecedenceTypes.sol";
import {PriorityProofLib as P} from "./PriorityProofLib.sol";
import {CollateralRegistry} from "./CollateralRegistry.sol";
import {PriorityEngine} from "./PriorityEngine.sol";

/// @title AttestationGate — the Attestcoin integration (Creditcoin CC3)
///
/// @notice Turns Attestcoin proofs of Sepolia transactions into priority on Creditcoin. This is
/// where the protocol's trust root actually lives.
///
/// @dev How the integration is used, and why each piece is load-bearing:
///
/// **One batch call, not a loop.** `INativeQueryVerifier.verifyAndEmit` has a batch overload taking
/// `uint64[] heights` and one shared `ContinuityProof`. Verified live against the deployed
/// precompile at `0x0FD2` on CC3 testnet. So an entire priority race settles in a single call —
/// atomic by construction rather than atomic because we wrapped N calls in a transaction. There is
/// no window in which half a race is settled.
///
/// **`calculateTxIndex` is what makes priority possible at all.** Sepolia's ~12s blocks make
/// same-block locks likely, and a block height cannot order two transactions inside one block. The
/// precompile derives the intra-block index from the Merkle proof path, so the ordering comes out
/// of the proof itself. An oracle can assert an order; it cannot commit to one. Without this
/// function the protocol has no mechanism.
///
/// **The free view-only `verify`.** The same interface exposes non-mutating `verify`, so a caller
/// can check a proof for zero gas before paying to submit it. The off-chain worker preflights every
/// batch through it.
///
/// **Three checks the precompile deliberately does NOT do.** It proves inclusion at a canonical
/// position, and nothing else. It does not check that the transaction succeeded, which contract
/// emitted it, or that you were handed the whole set. Those are enforced here and in
/// `PriorityProofLib`, and skipping any of them loses money while holding a valid proof.
contract AttestationGate {
    using EvmV1Decoder for bytes;

    /// @notice Sepolia. Read from `0x0FD3.get_supported_chains()` itself, not from a doc.
    uint64 public constant SEPOLIA_CHAIN_KEY = 1;

    /// @dev Must match `PriorityVault.lockEventSignature()`. Pinned by a test on both sides.
    bytes32 public constant LOCK_EVENT_SIG =
        keccak256("Lock_(bytes32,address,uint8,uint256,address,uint64,uint64,uint64,bool)");
    bytes32 public constant REPAYMENT_EVENT_SIG = keccak256("Repayment(bytes32,address,uint256,address)");
    bytes32 public constant DRAW_EVENT_SIG = keccak256("Draw(bytes32,address,uint256)");

    CollateralRegistry public immutable registry;
    PriorityEngine public immutable engine;
    /// @notice The pUSD settlement token on the source chain.
    address public immutable settlementToken;

    /// @dev Replay guard, reusing the reference `ASCBase` scheme:
    /// `queryId = keccak256(chainKey, height, txIndex)`. Note what it does not include — the
    /// emitting contract — which is exactly why the vault-binding check exists separately.
    mapping(bytes32 => bool) public processedQueries;

    /// @notice Everything needed to verify one race in a single batch call.
    /// @dev Packed into a struct because the precompile's signature already requires four parallel
    /// arrays; passing them loose exhausts the EVM stack. It also gives the off-chain worker one
    /// object to construct from `getBatchProof`.
    struct RaceProof {
        uint64[] heights;
        bytes[] encodedTxs;
        INativeQueryVerifier.MerkleProof[] merkleProofs;
        INativeQueryVerifier.ContinuityProof sharedProof;
    }

    event RaceSettled(
        bytes32 indexed collateralId, uint256 lockCount, uint64 lowestHeight, uint64 highestHeight
    );
    event LockVerified(
        bytes32 indexed collateralId,
        address indexed financier,
        uint64 height,
        uint64 txIndex,
        uint64 seq,
        uint256 amount
    );
    event RepaymentVerified(
        bytes32 indexed collateralId, uint64 height, uint64 txIndex, uint256 provenAmount
    );
    event DrawVerified(bytes32 indexed collateralId, uint64 height, uint64 txIndex, uint256 amount);
    event BreachVerified(bytes32 indexed collateralId, string detail);

    error VerificationFailed();
    error AlreadyProcessed(bytes32 queryId);
    error NoLockEvent(uint256 index);
    error MultipleLockEvents(uint256 index);
    error CollateralMismatch(uint256 index);
    error NoRepaymentEvent();
    error LengthMismatch();
    error ContinuityWindowExceeded();
    error PrecompileUnavailable();

    constructor(CollateralRegistry registry_, PriorityEngine engine_, address settlementToken_) {
        registry = registry_;
        engine = engine_;
        settlementToken = settlementToken_;
    }

    function verifier() internal pure returns (INativeQueryVerifier) {
        return NativeQueryVerifierLib.getVerifier();
    }

    /// @notice Is the Attestcoin precompile reachable on this chain?
    /// @dev Native precompiles have no bytecode, so `extcodesize` is 0 — the library's helper
    /// special-cases the Creditcoin chain ids rather than relying on it.
    function precompileAvailable() external view returns (bool) {
        return NativeQueryVerifierLib.hasPrecompile();
    }

    // ═══════════════════════════ the core: settle a race ═══════════════════════════

    /// @notice Verify an entire priority race and settle it, in ONE Creditcoin transaction.
    ///
    /// @param collateralId  the collateral being financed
    /// @param proof         heights, encoded transactions, Merkle proofs, and ONE shared
    ///                      continuity proof covering the whole batch
    ///
    /// @dev Ordering is VERIFIED here, not trusted from the caller. Each `txIndex` is re-derived
    /// from its Merkle proof and the sequence is required to strictly increase, so a prover cannot
    /// present the race in a self-serving order.
    ///
    /// @dev Demotion consent is NOT a parameter. It used to be a `bool[]` the prover supplied,
    /// which meant whoever chose to prove a race also chose whether each financier had agreed to
    /// hold riskier paper than they bid for. It now comes out of the Lock event each financier's
    /// own transaction emitted, so the only person who can give that consent is the one whose
    /// capital it is.
    function settleRace(bytes32 collateralId, RaceProof calldata proof) external {
        uint256 n = proof.encodedTxs.length;
        if (n != proof.heights.length || n != proof.merkleProofs.length) {
            revert LengthMismatch();
        }

        // ── ONE batch call. Atomic by construction: either the whole race verifies or none of it.
        if (
            !verifier().verifyAndEmit(
                SEPOLIA_CHAIN_KEY, proof.heights, proof.encodedTxs, proof.merkleProofs, proof.sharedProof
            )
        ) revert VerificationFailed();

        T.VerifiedLock[] memory locks = _extractAndGuard(collateralId, proof);

        // Status, vault binding, token, strict ordering, and completeness.
        P.validateSet(locks, registry.vaultOf(collateralId), settlementToken);
        if (!P.fitsOneContinuityProof(locks)) revert ContinuityWindowExceeded();

        engine.settlePriority(collateralId, locks);

        emit RaceSettled(collateralId, n, locks[0].height, locks[n - 1].height);
    }

    /// @dev Extract every lock and consume its replay key. Split out of `settleRace` to keep that
    /// function's stack shallow.
    function _extractAndGuard(bytes32 collateralId, RaceProof calldata proof)
        private
        returns (T.VerifiedLock[] memory locks)
    {
        uint256 n = proof.encodedTxs.length;
        locks = new T.VerifiedLock[](n);

        for (uint256 i = 0; i < n; ++i) {
            T.VerifiedLock memory l =
                _extractLock(collateralId, proof.encodedTxs[i], proof.merkleProofs[i], proof.heights[i], i);
            locks[i] = l;

            // Replay guard. One proven position, one effect, forever.
            bytes32 qid = P.queryId(SEPOLIA_CHAIN_KEY, l.height, l.txIndex);
            if (processedQueries[qid]) revert AlreadyProcessed(qid);
            processedQueries[qid] = true;

            emit LockVerified(collateralId, l.financier, l.height, l.txIndex, l.seq, l.amount);
        }
    }

    /// @dev Pull one lock out of a verified transaction.
    ///
    /// Decoding follows the sanctioned pattern — event logs via `getLogsByEventSignature`, not a
    /// hand-rolled RLP calldata parser. Decoding is also the dominant gas cost, so exactly one
    /// event is fetched by signature rather than every log being walked.
    function _extractLock(
        bytes32 collateralId,
        bytes calldata encodedTx,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        uint64 height,
        uint256 index
    ) private view returns (T.VerifiedLock memory lock) {
        // The canonical intra-block position, straight out of the proof path.
        uint64 txIndex = verifier().calculateTxIndex(merkleProof);

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTx);
        EvmV1Decoder.LogEntry[] memory logs = EvmV1Decoder.getLogsByEventSignature(receipt, LOCK_EVENT_SIG);

        if (logs.length == 0) revert NoLockEvent(index);
        // More than one Lock event in a single transaction would make "which lock is this?"
        // ambiguous, and ambiguity in the priority root is not acceptable.
        if (logs.length > 1) revert MultipleLockEvents(index);

        EvmV1Decoder.LogEntry memory lg = logs[0];

        // topics: [sig, collateralId, financier] — both indexed.
        if (bytes32(lg.topics[1]) != collateralId) revert CollateralMismatch(index);
        address financier = address(uint160(uint256(lg.topics[2])));

        // data: (uint8 tranche, uint256 amount, address token, uint64 raceNonce, uint64 seq,
        //        uint64 blockNumber, bool allowDemotion)
        (uint8 tranche, uint256 amount, address token, uint64 raceNonce, uint64 seq,, bool allowDemotion) =
            abi.decode(lg.data, (uint8, uint256, address, uint64, uint64, uint64, bool));

        lock = T.VerifiedLock({
            financier: financier,
            tranche: T.Tranche(tranche),
            amount: amount,
            token: token,
            // THE trust anchor. `PriorityProofLib` checks it against the registered vault.
            emittedBy: lg.address_,
            height: height,
            txIndex: txIndex,
            seq: seq,
            raceNonce: raceNonce,
            receiptStatus: receipt.receiptStatus,
            // Straight from the event the financier's own transaction emitted.
            allowDemotion: allowDemotion
        });
    }

    // ═══════════════════════════ servicing ═══════════════════════════

    /// @notice Verify a repayment and release the lien against the PROVEN amount.
    /// @dev The figure that drives the waterfall is decoded from the verified transaction's own
    /// logs. No adjuster to trust, no oracle to compromise, and the obligor cannot overstate it.
    function verifyRepayment(
        bytes32 collateralId,
        uint64 height,
        bytes calldata encodedTx,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external {
        if (!verifier().verifyAndEmit(SEPOLIA_CHAIN_KEY, height, encodedTx, merkleProof, continuityProof)) {
            revert VerificationFailed();
        }

        uint64 txIndex = verifier().calculateTxIndex(merkleProof);
        bytes32 qid = P.queryId(SEPOLIA_CHAIN_KEY, height, txIndex);
        if (processedQueries[qid]) revert AlreadyProcessed(qid);
        processedQueries[qid] = true;

        (uint256 provenAmount, address token) = _extractRepayment(collateralId, encodedTx);
        if (token != settlementToken) revert P.WrongToken(0, token, settlementToken);

        emit RepaymentVerified(collateralId, height, txIndex, provenAmount);
        engine.releaseLien(collateralId, provenAmount);
    }

    function _extractRepayment(bytes32 collateralId, bytes calldata encodedTx)
        private
        view
        returns (uint256 amount, address token)
    {
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTx);
        if (receipt.receiptStatus != 1) revert P.RevertedSourceTx(0);

        EvmV1Decoder.LogEntry[] memory logs =
            EvmV1Decoder.getLogsByEventSignature(receipt, REPAYMENT_EVENT_SIG);
        if (logs.length == 0) revert NoRepaymentEvent();

        EvmV1Decoder.LogEntry memory lg = logs[0];
        if (lg.address_ != registry.vaultOf(collateralId)) {
            revert P.WrongVault(0, lg.address_, registry.vaultOf(collateralId));
        }
        if (bytes32(lg.topics[1]) != collateralId) revert CollateralMismatch(0);

        // data: (uint256 amount, address token)
        (amount, token) = abi.decode(lg.data, (uint256, address));
    }

    /// @notice Verify a draw and mark the facility encumbered.
    function verifyDraw(
        bytes32 collateralId,
        uint64 height,
        bytes calldata encodedTx,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external {
        if (!verifier().verifyAndEmit(SEPOLIA_CHAIN_KEY, height, encodedTx, merkleProof, continuityProof)) {
            revert VerificationFailed();
        }

        uint64 txIndex = verifier().calculateTxIndex(merkleProof);
        bytes32 qid = P.queryId(SEPOLIA_CHAIN_KEY, height, txIndex);
        if (processedQueries[qid]) revert AlreadyProcessed(qid);
        processedQueries[qid] = true;

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTx);
        if (receipt.receiptStatus != 1) revert P.RevertedSourceTx(0);

        EvmV1Decoder.LogEntry[] memory logs = EvmV1Decoder.getLogsByEventSignature(receipt, DRAW_EVENT_SIG);
        if (logs.length == 0) revert NoLockEvent(0);

        address vault = registry.vaultOf(collateralId);
        if (logs[0].address_ != vault) revert P.WrongVault(0, logs[0].address_, vault);
        if (bytes32(logs[0].topics[1]) != collateralId) revert CollateralMismatch(0);

        uint256 amount = abi.decode(logs[0].data, (uint256));
        emit DrawVerified(collateralId, height, txIndex, amount);
        engine.markDrawn(collateralId, amount);
    }

    // ═══════════════════════════ views for the worker ═══════════════════════════

    /// @notice Free, view-only preflight. Same proof material, zero gas, no state change.
    /// @dev The worker calls this before submitting so a malformed batch costs nothing.
    function preflightBatch(RaceProof calldata proof) external view returns (bool) {
        return verifier().verify(
            SEPOLIA_CHAIN_KEY, proof.heights, proof.encodedTxs, proof.merkleProofs, proof.sharedProof
        );
    }

    /// @notice Positions the precompile itself derives, for cross-checking against the source chain.
    /// @dev This is the judge-verifiable artifact: these indices must match what an independent
    /// block explorer reports for the same transactions.
    function derivePositions(INativeQueryVerifier.MerkleProof[] calldata merkleProofs)
        external
        view
        returns (uint64[] memory txIndices)
    {
        txIndices = new uint64[](merkleProofs.length);
        for (uint256 i = 0; i < merkleProofs.length; ++i) {
            txIndices[i] = verifier().calculateTxIndex(merkleProofs[i]);
        }
    }

    function isProcessed(uint64 height, uint64 txIndex) external view returns (bool) {
        return processedQueries[P.queryId(SEPOLIA_CHAIN_KEY, height, txIndex)];
    }
}

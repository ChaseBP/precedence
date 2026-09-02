// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PrecedenceTypes as T} from "./PrecedenceTypes.sol";

/// @title PriorityProofLib — the rules that turn verified locks into a priority stack
///
/// @notice Every check here exists because the Attestcoin precompile deliberately does NOT do it.
/// The precompile proves that a transaction was included at a canonical position. It does not care
/// whether the transaction succeeded, which contract produced it, or whether you were handed the
/// whole set. Those are the dApp's job, and getting any of them wrong is a way to lose money while
/// holding a perfectly valid proof.
///
/// @dev Deliberately a pure library over plain structs. `AttestationGate` decodes proofs into
/// `VerifiedLock`s; this decides what they mean. That separation is what lets the rules be
/// exhaustively unit-tested — including the attacks — without synthesising USC-encoded transaction
/// bytes, which would otherwise force all of this behind a fork test.
library PriorityProofLib {
    /// @dev MAX_BATCH_SIZE for one shared continuity proof.
    uint256 internal constant MAX_BATCH = 10;

    error EmptyBatch();
    error BatchTooLarge(uint256 given);
    /// @dev The precompile verifies inclusion, not success. A reverted lock is genuinely included.
    error RevertedSourceTx(uint256 index);
    /// @dev The reference ASCBase never records WHO emitted the verified transaction. This is the
    /// look-alike-contract attack: a real proof of a fake vault's Lock event.
    error WrongVault(uint256 index, address emittedBy, address expected);
    error WrongToken(uint256 index, address token, address expected);
    /// @dev A prover must not be able to reorder the race in its own favour.
    error NotStrictlyOrdered(uint256 index);
    /// @dev A prover must not be able to omit a lock in order to promote a friend.
    error SeqGap(uint256 index, uint64 got, uint64 expected);
    error MixedRaceNonce(uint256 index);
    /// @dev The vault's self-reported order contradicting the proven order means the vault is lying.
    error SeqContradictsProof(uint256 index);

    /// @notice Validate a submitted lock set against everything that is not the precompile's job.
    ///
    /// @param locks   verified locks, in the order the caller submitted them
    /// @param vault   the vault registered for this collateral — every proof must bind to it
    /// @param token   the expected settlement token
    ///
    /// @dev The four rules, and why each one is load-bearing:
    ///
    ///  1. **status == 1.** Inclusion is not success. Without this a financier could deliberately
    ///     revert a lock, escrow nothing, and still hold a valid inclusion proof for senior priority.
    ///
    ///  2. **emittedBy == vault.** Without this, an attacker deploys a look-alike contract on the
    ///     source chain, emits an identical Lock event for free, gets a genuine proof, and takes
    ///     senior priority against collateral they never funded. The proof is real; the event is
    ///     worthless. This is the single easiest way to ship a hole here.
    ///
    ///  3. **strictly increasing (height, txIndex).** The ordering is re-derived on-chain and
    ///     required to increase, so the prover cannot present the race in a self-serving sequence.
    ///     This is the difference between sorting an array someone handed us and priority being a
    ///     proven fact.
    ///
    ///  4. **seq contiguous from 1, one raceNonce.** Omitting a middle lock leaves a gap; omitting
    ///     the first breaks the start-at-1 rule. Only tail truncation survives — and a truncated
    ///     tail omits later, more junior locks, whose holders can submit their own proof. So the
    ///     set is either complete or the omission is self-defeating.
    function validateSet(T.VerifiedLock[] memory locks, address vault, address token) internal pure {
        uint256 n = locks.length;
        if (n == 0) revert EmptyBatch();
        if (n > MAX_BATCH) revert BatchTooLarge(n);

        uint64 nonce = locks[0].raceNonce;

        for (uint256 i = 0; i < n; ++i) {
            T.VerifiedLock memory l = locks[i];

            if (l.receiptStatus != 1) revert RevertedSourceTx(i);
            if (l.emittedBy != vault) revert WrongVault(i, l.emittedBy, vault);
            if (l.token != token) revert WrongToken(i, l.token, token);
            if (l.raceNonce != nonce) revert MixedRaceNonce(i);
            if (l.seq != uint64(i + 1)) revert SeqGap(i, l.seq, uint64(i + 1));

            if (i > 0) {
                T.VerifiedLock memory p = locks[i - 1];
                bool ordered = l.height > p.height || (l.height == p.height && l.txIndex > p.txIndex);
                if (!ordered) revert NotStrictlyOrdered(i);
                // seq and proven order must agree. They are produced independently — one by the
                // vault, one by the precompile — so disagreement means the vault misreported.
                if (l.seq <= p.seq) revert SeqContradictsProof(i);
            }
        }
    }

    /// @notice Replay key, matching the reference `ASCBase` pattern.
    /// @dev Reuses the established scheme rather than inventing a nullifier. Note it does NOT
    /// include the emitting contract — which is exactly why rule 2 above has to exist separately.
    function queryId(uint64 chainKey, uint64 height, uint64 txIndex) internal pure returns (bytes32) {
        return keccak256(abi.encode(chainKey, height, txIndex));
    }

    /// @notice Does this set fit one shared continuity proof?
    /// @dev MAX_BATCH_RANGE is 1000 blocks. A race window is minutes, so locks naturally fall well
    /// inside it — but a stale submission would not, and should fail loudly rather than at the
    /// precompile.
    function fitsOneContinuityProof(T.VerifiedLock[] memory locks) internal pure returns (bool) {
        if (locks.length == 0 || locks.length > MAX_BATCH) return false;
        uint64 lo = locks[0].height;
        uint64 hi = locks[0].height;
        for (uint256 i = 1; i < locks.length; ++i) {
            if (locks[i].height < lo) lo = locks[i].height;
            if (locks[i].height > hi) hi = locks[i].height;
        }
        return hi - lo <= 1000;
    }
}

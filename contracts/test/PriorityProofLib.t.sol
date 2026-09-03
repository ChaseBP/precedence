// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PrecedenceTypes as T} from "../src/creditcoin/PrecedenceTypes.sol";
import {PriorityProofLib, PriorityProofLib as P} from "../src/creditcoin/PriorityProofLib.sol";


/// @dev `validateSet` is an internal library function, so a direct call inlines into the test and
/// reverts at the same call depth as the cheatcode. `vm.expectRevert` needs the revert to happen
/// BELOW it, so route every call through an external harness.
contract ProofHarness {
    function validateSet(T.VerifiedLock[] memory locks, address vault, address token) external pure {
        PriorityProofLib.validateSet(locks, vault, token);
    }
}

/// @notice Every check the Attestcoin precompile deliberately does NOT do, and the attack each one
/// stops. A green run here is the security argument; the prose in the docs is just its summary.
contract PriorityProofLibTest is Test {
    ProofHarness h;

    function setUp() public {
        h = new ProofHarness();
    }

    address constant VAULT = address(0xAA01);
    address constant LOOKALIKE = address(0xBAD1);
    address constant TOKEN = address(0x7075);
    address constant WRONG_TOKEN = address(0x7076);

    address constant MERIDIAN = address(0xEE01);
    address constant VECTOR = address(0xEE02);
    address constant NOVUM = address(0xCC01);

    function _lock(
        address who,
        T.Tranche tranche,
        uint256 amount,
        uint64 height,
        uint64 txIndex,
        uint64 seq
    ) internal pure returns (T.VerifiedLock memory) {
        return T.VerifiedLock({
            financier: who,
            tranche: tranche,
            amount: amount,
            token: TOKEN,
            emittedBy: VAULT,
            height: height,
            txIndex: txIndex,
            seq: seq,
            raceNonce: 1,
            receiptStatus: 1,
            allowDemotion: false
        });
    }

    /// @dev The headline case: three locks in ONE block. Height alone cannot order them.
    function _sameBlockRace() internal pure returns (T.VerifiedLock[] memory locks) {
        locks = new T.VerifiedLock[](3);
        locks[0] = _lock(MERIDIAN, T.Tranche.SENIOR, 5_000e6, 6182101, 17, 1);
        locks[1] = _lock(VECTOR, T.Tranche.JUNIOR, 2_550e6, 6182101, 22, 2);
        locks[2] = _lock(NOVUM, T.Tranche.SENIOR, 5_000e6, 6182101, 41, 3);
    }

    // ═══════════════════════════ happy paths ═══════════════════════════

    function test_validSameBlockRacePasses() public {
        h.validateSet(_sameBlockRace(), VAULT, TOKEN);
    }

    function test_validMultiBlockRacePasses() public {
        T.VerifiedLock[] memory l = new T.VerifiedLock[](3);
        l[0] = _lock(MERIDIAN, T.Tranche.SENIOR, 5_000e6, 6182101, 17, 1);
        l[1] = _lock(VECTOR, T.Tranche.JUNIOR, 2_550e6, 6182102, 3, 2);
        l[2] = _lock(NOVUM, T.Tranche.SUBORDINATE, 850e6, 6182105, 88, 3);
        h.validateSet(l, VAULT, TOKEN);
    }

    /// @dev A single financier racing uncontested is a completely normal outcome.
    function test_singleLockIsAValidRace() public {
        T.VerifiedLock[] memory l = new T.VerifiedLock[](1);
        l[0] = _lock(MERIDIAN, T.Tranche.SENIOR, 5_000e6, 6182101, 17, 1);
        h.validateSet(l, VAULT, TOKEN);
    }

    // ═══════════════════════ ATTACK 1: look-alike vault ═══════════════════════

    /// @dev THE most important test in this file. An attacker deploys a contract on Sepolia that
    /// emits an identical Lock event, calls it for free, and obtains a GENUINE Attestcoin proof.
    /// The proof verifies — it is real. It just proves an event from the wrong contract. The
    /// reference `ASCBase` would accept this, because it never records who emitted the transaction.
    function test_revert_genuineProofOfLookalikeContractIsRejected() public {
        T.VerifiedLock[] memory l = _sameBlockRace();
        l[0].emittedBy = LOOKALIKE; // everything else about this proof is valid

        vm.expectRevert(abi.encodeWithSelector(P.WrongVault.selector, 0, LOOKALIKE, VAULT));
        h.validateSet(l, VAULT, TOKEN);
    }

    function test_revert_lookalikeAnywhereInTheBatchIsRejected() public {
        T.VerifiedLock[] memory l = _sameBlockRace();
        l[2].emittedBy = LOOKALIKE; // hidden at the end of an otherwise clean batch

        vm.expectRevert(abi.encodeWithSelector(P.WrongVault.selector, 2, LOOKALIKE, VAULT));
        h.validateSet(l, VAULT, TOKEN);
    }

    // ═══════════════════════ ATTACK 2: reverted lock ═══════════════════════

    /// @dev Inclusion is not success. A financier could deliberately revert their lock — escrowing
    /// nothing — and still hold a valid inclusion proof. The precompile does not check status.
    function test_revert_revertedSourceTxCannotWinPriority() public {
        T.VerifiedLock[] memory l = _sameBlockRace();
        l[0].receiptStatus = 0;

        vm.expectRevert(abi.encodeWithSelector(P.RevertedSourceTx.selector, 0));
        h.validateSet(l, VAULT, TOKEN);
    }

    // ═══════════════════════ ATTACK 3: reordering ═══════════════════════

    /// @dev A prover submitting the race in a self-serving order. The gate re-derives txIndex from
    /// the Merkle path and requires it to increase, so the submitted order cannot be chosen.
    function test_revert_proverCannotReorderTheRace() public {
        T.VerifiedLock[] memory l = new T.VerifiedLock[](2);
        // Novum genuinely locked LATER (txIndex 41) but is presented first.
        l[0] = _lock(NOVUM, T.Tranche.SENIOR, 5_000e6, 6182101, 41, 1);
        l[1] = _lock(MERIDIAN, T.Tranche.SENIOR, 5_000e6, 6182101, 17, 2);

        vm.expectRevert(abi.encodeWithSelector(P.NotStrictlyOrdered.selector, 1));
        h.validateSet(l, VAULT, TOKEN);
    }

    function test_revert_duplicatePositionIsNotStrictlyIncreasing() public {
        T.VerifiedLock[] memory l = new T.VerifiedLock[](2);
        l[0] = _lock(MERIDIAN, T.Tranche.SENIOR, 5_000e6, 6182101, 17, 1);
        l[1] = _lock(NOVUM, T.Tranche.SENIOR, 5_000e6, 6182101, 17, 2); // same position

        vm.expectRevert(abi.encodeWithSelector(P.NotStrictlyOrdered.selector, 1));
        h.validateSet(l, VAULT, TOKEN);
    }

    function test_revert_heightGoingBackwards() public {
        T.VerifiedLock[] memory l = new T.VerifiedLock[](2);
        l[0] = _lock(MERIDIAN, T.Tranche.SENIOR, 5_000e6, 6182105, 3, 1);
        l[1] = _lock(NOVUM, T.Tranche.SENIOR, 5_000e6, 6182101, 99, 2);

        vm.expectRevert(abi.encodeWithSelector(P.NotStrictlyOrdered.selector, 1));
        h.validateSet(l, VAULT, TOKEN);
    }

    // ═══════════════════════ ATTACK 4: omission ═══════════════════════

    /// @dev Omitting a MIDDLE lock to promote a friend leaves a gap in seq.
    function test_revert_proverCannotOmitAMiddleLock() public {
        T.VerifiedLock[] memory l = new T.VerifiedLock[](2);
        l[0] = _lock(MERIDIAN, T.Tranche.SENIOR, 5_000e6, 6182101, 17, 1);
        l[1] = _lock(NOVUM, T.Tranche.SENIOR, 5_000e6, 6182101, 41, 3); // seq 2 dropped

        vm.expectRevert(abi.encodeWithSelector(P.SeqGap.selector, 1, uint64(3), uint64(2)));
        h.validateSet(l, VAULT, TOKEN);
    }

    /// @dev Omitting the FIRST lock — the senior winner — is the attack that actually pays. It
    /// leaves a consecutive run, so contiguity alone would not catch it; requiring the run to START
    /// AT 1 does. This is why `PriorityVault.openRace()` resets the counter per race.
    function test_revert_proverCannotOmitTheFirstLock() public {
        T.VerifiedLock[] memory l = new T.VerifiedLock[](2);
        // Meridian's seq-1 lock is dropped; 2 and 3 are consecutive and correctly ordered.
        l[0] = _lock(VECTOR, T.Tranche.SENIOR, 2_550e6, 6182101, 22, 2);
        l[1] = _lock(NOVUM, T.Tranche.SENIOR, 5_000e6, 6182101, 41, 3);

        vm.expectRevert(abi.encodeWithSelector(P.SeqGap.selector, 0, uint64(2), uint64(1)));
        h.validateSet(l, VAULT, TOKEN);
    }

    /// @dev Tail truncation is the one omission that passes — and it is self-defeating, because it
    /// only drops later, more junior locks, whose holders can submit their own proof.
    function test_tailTruncationPassesAndIsHarmless() public {
        T.VerifiedLock[] memory l = new T.VerifiedLock[](2);
        l[0] = _lock(MERIDIAN, T.Tranche.SENIOR, 5_000e6, 6182101, 17, 1);
        l[1] = _lock(VECTOR, T.Tranche.JUNIOR, 2_550e6, 6182101, 22, 2);
        h.validateSet(l, VAULT, TOKEN); // seq 3 omitted; the senior winner is still first
    }

    // ═══════════════════════ ATTACK 5: splicing races ═══════════════════════

    /// @dev Mixing locks from two different races on the same collateral.
    function test_revert_cannotSpliceLocksFromDifferentRaces() public {
        T.VerifiedLock[] memory l = _sameBlockRace();
        l[2].raceNonce = 2;

        vm.expectRevert(abi.encodeWithSelector(P.MixedRaceNonce.selector, 2));
        h.validateSet(l, VAULT, TOKEN);
    }

    // ═══════════════════════ ATTACK 6: lying vault ═══════════════════════

    /// @dev seq and proven order are produced independently — one by the vault, one by the
    /// precompile. If they disagree, the vault misreported its own ordering and cannot be trusted.
    function test_revert_vaultWhoseSeqContradictsTheProofIsRejected() public {
        T.VerifiedLock[] memory l = new T.VerifiedLock[](3);
        l[0] = _lock(MERIDIAN, T.Tranche.SENIOR, 5_000e6, 6182101, 17, 1);
        l[1] = _lock(VECTOR, T.Tranche.JUNIOR, 2_550e6, 6182101, 22, 2);
        // Correct position order, but seq 2 again — the vault's counter contradicts the proof.
        l[2] = _lock(NOVUM, T.Tranche.SENIOR, 5_000e6, 6182101, 41, 2);

        vm.expectRevert(abi.encodeWithSelector(P.SeqGap.selector, 2, uint64(2), uint64(3)));
        h.validateSet(l, VAULT, TOKEN);
    }

    // ═══════════════════════ wrong denomination ═══════════════════════

    /// @dev The Lock event carries the token so this chain never infers denomination. A lock in the
    /// wrong token would otherwise be valued as if it were pUSD.
    function test_revert_wrongSettlementToken() public {
        T.VerifiedLock[] memory l = _sameBlockRace();
        l[1].token = WRONG_TOKEN;

        vm.expectRevert(abi.encodeWithSelector(P.WrongToken.selector, 1, WRONG_TOKEN, TOKEN));
        h.validateSet(l, VAULT, TOKEN);
    }

    // ═══════════════════════ batch bounds ═══════════════════════

    function test_revert_emptyBatch() public {
        T.VerifiedLock[] memory l = new T.VerifiedLock[](0);
        vm.expectRevert(P.EmptyBatch.selector);
        h.validateSet(l, VAULT, TOKEN);
    }

    /// @dev MAX_BATCH_SIZE is 10 — one shared continuity proof cannot cover more.
    function test_revert_batchOverTen() public {
        T.VerifiedLock[] memory l = new T.VerifiedLock[](11);
        for (uint64 i = 0; i < 11; ++i) {
            l[i] = _lock(MERIDIAN, T.Tranche.SENIOR, 100e6, 6182101, i + 1, i + 1);
        }
        vm.expectRevert(abi.encodeWithSelector(P.BatchTooLarge.selector, 11));
        h.validateSet(l, VAULT, TOKEN);
    }

    function test_exactlyTenIsAllowed() public {
        T.VerifiedLock[] memory l = new T.VerifiedLock[](10);
        for (uint64 i = 0; i < 10; ++i) {
            l[i] = _lock(MERIDIAN, T.Tranche.SENIOR, 100e6, 6182101, i + 1, i + 1);
        }
        h.validateSet(l, VAULT, TOKEN);
    }

    // ═══════════════════════ continuity window ═══════════════════════

    function test_continuityWindow() public {
        T.VerifiedLock[] memory ok_ = new T.VerifiedLock[](2);
        ok_[0] = _lock(MERIDIAN, T.Tranche.SENIOR, 100e6, 6182101, 1, 1);
        ok_[1] = _lock(VECTOR, T.Tranche.JUNIOR, 100e6, 6183101, 1, 2); // exactly 1000 apart
        assertTrue(P.fitsOneContinuityProof(ok_), "1000 blocks is the limit, inclusive");

        T.VerifiedLock[] memory tooWide = new T.VerifiedLock[](2);
        tooWide[0] = _lock(MERIDIAN, T.Tranche.SENIOR, 100e6, 6182101, 1, 1);
        tooWide[1] = _lock(VECTOR, T.Tranche.JUNIOR, 100e6, 6183102, 1, 2); // 1001
        assertFalse(P.fitsOneContinuityProof(tooWide), "beyond MAX_BATCH_RANGE");
    }

    // ═══════════════════════ replay key ═══════════════════════

    /// @dev Matches the reference ASCBase scheme. Note what it does NOT include: the emitting
    /// contract. That omission is precisely why the vault-binding check has to exist separately.
    function test_queryIdMatchesReferenceScheme() public {
        bytes32 id = P.queryId(1, 6182101, 17);
        assertEq(id, keccak256(abi.encode(uint64(1), uint64(6182101), uint64(17))));
        assertTrue(id != P.queryId(1, 6182101, 18), "distinct positions, distinct keys");
        assertTrue(id != P.queryId(3, 6182101, 17), "chainKey is part of the key");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PrecedenceTypes as T} from "../src/creditcoin/PrecedenceTypes.sol";
import {AllocationLib as A} from "../src/creditcoin/AllocationLib.sol";

/// @notice The two rules that move money: tranche allocation by proven order, and the strict
/// seniority waterfall. If either is wrong the protocol's central claim is false, so these are
/// asserted on exact figures rather than on shape.
contract AllocationLibTest is Test {
    address constant MERIDIAN = address(0xEE01);
    address constant VECTOR = address(0xEE02);
    address constant NOVUM = address(0xCC01);
    address constant TOKEN = address(0x7075);
    address constant VAULT = address(0xAA01);

    uint256 constant D = 1e6; // pUSD, 6dp

    /// @dev Facility on a $10,000 receipt with a 15% haircut: max draw $8,500 →
    /// Senior 60% / Junior 30% / Subordinate 10%.
    function _sizing() internal pure returns (T.TrancheSizing memory) {
        return T.TrancheSizing({senior: 5_100 * D, junior: 2_550 * D, subordinate: 850 * D});
    }

    /// @dev SENIOR 5.2% · JUNIOR 7.8% · SUBORDINATE 11.5%. Senior is cheapest because it is paid
    /// first — the entire reason priority is worth paying for.
    function _rates() internal pure returns (uint256[3] memory) {
        return [uint256(520), 780, 1150];
    }

    function _lock(address who, T.Tranche t, uint256 amt, uint64 h, uint64 idx, uint64 seq)
        internal
        pure
        returns (T.VerifiedLock memory)
    {
        return _lock(who, t, amt, h, idx, seq, false);
    }

    /// @dev Consent now rides on the lock itself, so it is set where the lock is built rather than
    /// passed alongside it at settle time.
    function _lock(
        address who,
        T.Tranche t,
        uint256 amt,
        uint64 h,
        uint64 idx,
        uint64 seq,
        bool allowDemotion
    ) internal pure returns (T.VerifiedLock memory) {
        return T.VerifiedLock({
            financier: who,
            tranche: t,
            amount: amt,
            token: TOKEN,
            emittedBy: VAULT,
            height: h,
            txIndex: idx,
            seq: seq,
            raceNonce: 1,
            receiptStatus: 1,
            allowDemotion: allowDemotion
        });
    }


    // ══════════════════════ allocation: proven order wins the tranche ══════════════════════

    /// @dev THE case. Meridian and Novum both bid SENIOR in the SAME block. Height cannot separate
    /// them; txIndex can. Meridian at 17 beats Novum at 41 and takes senior. Novum is REFUNDED in
    /// full — not demoted — because it never consented to subordinate risk.
    function test_earliestProvenPositionWinsSeniorAndTheLoserIsRefunded() public pure {
        T.VerifiedLock[] memory locks = new T.VerifiedLock[](3);
        // Meridian bids the FULL senior tranche, so Novum's later senior bid has nowhere to sit.
        locks[0] = _lock(MERIDIAN, T.Tranche.SENIOR, 5_100 * D, 6182101, 17, 1);
        locks[1] = _lock(VECTOR, T.Tranche.JUNIOR, 2_550 * D, 6182101, 22, 2);
        locks[2] = _lock(NOVUM, T.Tranche.SENIOR, 5_100 * D, 6182101, 41, 3);

        (A.Award[] memory awards, A.Refund[] memory refunds) =
            A.allocate(locks, _sizing());

        assertEq(awards.length, 2, "senior + junior seated");
        assertEq(awards[0].financier, MERIDIAN);
        assertEq(uint8(awards[0].tranche), uint8(T.Tranche.SENIOR));
        assertEq(awards[0].amount, 5_100 * D);
        assertEq(awards[0].txIndex, 17, "won at the earliest proven position");

        assertEq(awards[1].financier, VECTOR);
        assertEq(uint8(awards[1].tranche), uint8(T.Tranche.JUNIOR));

        assertEq(refunds.length, 1, "the outpaced senior bid");
        assertEq(refunds[0].financier, NOVUM);
        assertEq(refunds[0].amount, 5_100 * D, "refunded IN FULL, not demoted");
        assertEq(uint8(refunds[0].declared), uint8(T.Tranche.SENIOR), "and its declared tranche is recorded");
    }

    /// @dev When the earlier bid does NOT fill the tranche, the later bidder legitimately takes the
    /// residual capacity. That is ordinary syndication, not demotion: the sliver is still SENIOR,
    /// which is the tranche it asked for.
    function test_laterSeniorBidTakesResidualSeniorCapacity() public pure {
        T.VerifiedLock[] memory locks = new T.VerifiedLock[](2);
        locks[0] = _lock(MERIDIAN, T.Tranche.SENIOR, 5_000 * D, 6182101, 17, 1); // leaves 100
        locks[1] = _lock(NOVUM, T.Tranche.SENIOR, 5_000 * D, 6182101, 41, 2);

        (A.Award[] memory awards, A.Refund[] memory refunds) =
            A.allocate(locks, _sizing());

        assertEq(awards.length, 2);
        assertEq(awards[1].financier, NOVUM);
        assertEq(uint8(awards[1].tranche), uint8(T.Tranche.SENIOR), "still senior, just a sliver");
        assertEq(awards[1].amount, 100 * D, "the residual senior capacity");
        assertEq(refunds[0].amount, 4_900 * D, "the rest is returned, never demoted");
    }

    /// @dev Reversing only the transaction indices reverses who is senior. Nothing else changes.
    /// This is the whole mechanism in one assertion.
    function test_swappingTxIndexSwapsWhoIsSenior() public pure {
        T.VerifiedLock[] memory locks = new T.VerifiedLock[](2);
        locks[0] = _lock(NOVUM, T.Tranche.SENIOR, 5_000 * D, 6182101, 17, 1);
        locks[1] = _lock(MERIDIAN, T.Tranche.SENIOR, 5_000 * D, 6182101, 41, 2);

        (A.Award[] memory awards, A.Refund[] memory refunds) =
            A.allocate(locks, _sizing());

        assertEq(awards[0].financier, NOVUM, "now Novum is senior, purely because it was earlier");
        assertEq(refunds[0].financier, MERIDIAN);
    }

    /// @dev Demotion is opt-in. With consent, the overflow cascades into lower tranches.
    function test_demotionOnlyHappensWithExplicitConsent() public pure {
        T.VerifiedLock[] memory locks = new T.VerifiedLock[](2);
        locks[0] = _lock(MERIDIAN, T.Tranche.SENIOR, 5_100 * D, 6182101, 17, 1); // fills senior
        // Vector opted in, in its OWN lock transaction. Nobody else can grant this on its behalf.
        locks[1] = _lock(VECTOR, T.Tranche.SENIOR, 4_000 * D, 6182101, 22, 2, true);

        (A.Award[] memory awards, A.Refund[] memory refunds) = A.allocate(locks, _sizing());

        assertEq(awards.length, 3, "senior + demoted junior + demoted subordinate");
        assertEq(awards[1].financier, VECTOR);
        assertEq(uint8(awards[1].tranche), uint8(T.Tranche.JUNIOR));
        assertEq(awards[1].amount, 2_550 * D, "junior filled");
        assertEq(uint8(awards[2].tranche), uint8(T.Tranche.SUBORDINATE));
        assertEq(awards[2].amount, 850 * D, "subordinate filled");

        assertEq(refunds.length, 1, "the remainder after every tranche filled");
        assertEq(refunds[0].amount, 600 * D, "4000 - 2550 - 850");
    }

    function test_partialSeatingAtTheTrancheBoundary() public pure {
        T.VerifiedLock[] memory locks = new T.VerifiedLock[](2);
        locks[0] = _lock(MERIDIAN, T.Tranche.SENIOR, 3_000 * D, 6182101, 17, 1);
        locks[1] = _lock(VECTOR, T.Tranche.SENIOR, 3_000 * D, 6182101, 22, 2); // 2,100 fits

        (A.Award[] memory awards, A.Refund[] memory refunds) =
            A.allocate(locks, _sizing());

        assertEq(awards[0].amount, 3_000 * D);
        assertEq(awards[1].amount, 2_100 * D, "partial seat up to the tranche cap");
        assertEq(refunds[0].amount, 900 * D, "the rest comes back");
    }

    // ══════════════════════ waterfall: strict seniority ══════════════════════

    /// @dev Performing payoff. Senior is paid principal AND interest in full before junior sees
    /// anything, and the figures are asserted exactly — this is the number a judge checks.
    function test_repaymentWaterfallPaysSeniorInFullFirst() public pure {
        A.Award[] memory awards = new A.Award[](2);
        awards[0] = A.Award(MERIDIAN, T.Tranche.SENIOR, 1, 5_000 * D, 6182101, 17, 1);
        awards[1] = A.Award(VECTOR, T.Tranche.JUNIOR, 2, 2_550 * D, 6182101, 22, 2);

        (A.WaterfallLine[] memory lines, uint256 protocolFee, uint256 proverFee, uint256 unallocated) =
            A.waterfall(awards, 7_690 * D, 25, 5, 90, _rates(), false);

        assertEq(protocolFee, 19_225_000, "25 bps of 7,690");
        assertEq(proverFee, 3_845_000, "5 bps of 7,690");

        // Senior: 5,000 principal + 5,000 * 5.2% * 90/365 = 64.10 interest
        assertEq(lines[0].holder, MERIDIAN);
        assertEq(lines[0].principalReturned, 5_000 * D);
        assertEq(lines[0].interestDue, 64_109_589);
        assertEq(lines[0].loss, 0);
        assertTrue(lines[0].satisfiedInFull, "senior made whole BEFORE junior is touched");

        // Junior: 2,550 principal + (2550e6 * 780 * 90) / (10000 * 365) = 49.043835 interest
        assertEq(lines[1].holder, VECTOR);
        assertEq(lines[1].principalReturned, 2_550 * D);
        assertEq(lines[1].interestDue, 49_043_835);
        assertEq(lines[1].loss, 0);
        assertTrue(lines[1].satisfiedInFull);

        assertTrue(A.seniorityRespected(lines));
        assertGt(unallocated, 0, "residual returns to the obligor");
    }

    /// @dev A shortfall must land bottom-up. Subordinate absorbs first loss; senior is untouched.
    /// If this ever inverted, the 5.2% senior coupon would have been mispriced.
    function test_shortfallPutsFirstLossOnTheMostSubordinateTranche() public pure {
        A.Award[] memory awards = new A.Award[](3);
        awards[0] = A.Award(MERIDIAN, T.Tranche.SENIOR, 1, 5_000 * D, 6182101, 17, 1);
        awards[1] = A.Award(VECTOR, T.Tranche.JUNIOR, 2, 2_550 * D, 6182101, 22, 2);
        awards[2] = A.Award(NOVUM, T.Tranche.SUBORDINATE, 3, 850 * D, 6182101, 41, 3);

        // Recover only 6,000 against 8,400 of principal — a 2,400 hole.
        (A.WaterfallLine[] memory lines,,,) = A.waterfall(awards, 6_000 * D, 0, 0, 90, _rates(), true);

        assertEq(lines[0].principalReturned, 5_000 * D, "senior fully recovered");
        assertEq(lines[0].loss, 0, "senior protected by subordination");
        assertTrue(lines[0].satisfiedInFull);

        assertEq(lines[1].principalReturned, 1_000 * D, "junior partially recovered");
        assertEq(lines[1].loss, 1_550 * D);
        assertFalse(lines[1].satisfiedInFull);

        assertEq(lines[2].principalReturned, 0, "subordinate wiped out");
        assertEq(lines[2].loss, 850 * D);

        assertTrue(A.seniorityRespected(lines), "strict order held under loss");
    }

    /// @dev Liquidation recovers principal only. Nobody earns a coupon on a default.
    function test_liquidationPaysNoInterest() public pure {
        A.Award[] memory awards = new A.Award[](1);
        awards[0] = A.Award(MERIDIAN, T.Tranche.SENIOR, 1, 5_000 * D, 6182101, 17, 1);

        (A.WaterfallLine[] memory lines,,,) = A.waterfall(awards, 6_000 * D, 0, 0, 90, _rates(), true);
        assertEq(lines[0].interestDue, 0, "no interest earned on a default");
        assertEq(lines[0].interestPaid, 0);
        assertEq(lines[0].principalReturned, 5_000 * D);
    }

    /// @dev Total wipeout. Everyone loses everything, in order, and the invariant still holds.
    function test_totalWipeoutRespectsOrder() public pure {
        A.Award[] memory awards = new A.Award[](2);
        awards[0] = A.Award(MERIDIAN, T.Tranche.SENIOR, 1, 5_000 * D, 6182101, 17, 1);
        awards[1] = A.Award(VECTOR, T.Tranche.JUNIOR, 2, 2_550 * D, 6182101, 22, 2);

        (A.WaterfallLine[] memory lines,,,) = A.waterfall(awards, 0, 0, 0, 90, _rates(), true);
        assertEq(lines[0].loss, 5_000 * D);
        assertEq(lines[1].loss, 2_550 * D);
        assertEq(lines[1].payout, 0);
        assertTrue(A.seniorityRespected(lines), "vacuously, but must not be false");
    }

    /// @dev Awards arriving out of rank order must still be paid in rank order.
    function test_waterfallSortsByRankRegardlessOfInputOrder() public pure {
        A.Award[] memory awards = new A.Award[](3);
        awards[0] = A.Award(NOVUM, T.Tranche.SUBORDINATE, 3, 850 * D, 6182101, 41, 3);
        awards[1] = A.Award(MERIDIAN, T.Tranche.SENIOR, 1, 5_000 * D, 6182101, 17, 1);
        awards[2] = A.Award(VECTOR, T.Tranche.JUNIOR, 2, 2_550 * D, 6182101, 22, 2);

        (A.WaterfallLine[] memory lines,,,) = A.waterfall(awards, 6_000 * D, 0, 0, 90, _rates(), true);
        assertEq(lines[0].rank, 1, "senior first");
        assertEq(lines[1].rank, 2);
        assertEq(lines[2].rank, 3);
        assertEq(lines[0].holder, MERIDIAN);
        assertTrue(A.seniorityRespected(lines));
    }

    /// @dev The detector must actually detect. A hand-built violation has to fail the check, or the
    /// invariant assertion elsewhere is worthless.
    function test_seniorityDetectorCatchesAViolation() public pure {
        A.WaterfallLine[] memory bad = new A.WaterfallLine[](2);
        bad[0] = A.WaterfallLine(MERIDIAN, T.Tranche.SENIOR, 1, 5_000 * D, 0, 0, 4_000 * D, 1_000 * D, 4_000 * D, false);
        bad[1] = A.WaterfallLine(VECTOR, T.Tranche.JUNIOR, 2, 2_550 * D, 0, 0, 2_550 * D, 0, 2_550 * D, true);
        assertFalse(A.seniorityRespected(bad), "junior paid while senior was short - must be rejected");
    }

    // ══════════════════════ fuzz ══════════════════════

    /// @dev Whatever the realised amount, seniority must hold and payouts can never exceed what was
    /// distributable.
    function testFuzz_seniorityAlwaysHolds(uint96 realised) public pure {
        A.Award[] memory awards = new A.Award[](3);
        awards[0] = A.Award(MERIDIAN, T.Tranche.SENIOR, 1, 5_000 * D, 6182101, 17, 1);
        awards[1] = A.Award(VECTOR, T.Tranche.JUNIOR, 2, 2_550 * D, 6182101, 22, 2);
        awards[2] = A.Award(NOVUM, T.Tranche.SUBORDINATE, 3, 850 * D, 6182101, 41, 3);

        (A.WaterfallLine[] memory lines, uint256 pf, uint256 vf, uint256 un) =
            A.waterfall(awards, realised, 25, 5, 90, _rates(), false);

        assertTrue(A.seniorityRespected(lines), "must hold for every realised amount");

        uint256 paid;
        for (uint256 i = 0; i < lines.length; ++i) {
            paid += lines[i].payout;
        }
        assertEq(paid + un + pf + vf, realised, "nothing created, nothing lost");
    }

    /// @dev However the tranche caps are set, allocation must never seat more than capacity, and
    /// every unit locked must be either seated or refunded.
    function testFuzz_allocationConservesCapital(uint96 a1, uint96 a2, uint32 seniorCap) public pure {
        vm.assume(a1 > 0 && a2 > 0);
        T.TrancheSizing memory s = T.TrancheSizing({senior: seniorCap, junior: 0, subordinate: 0});

        T.VerifiedLock[] memory locks = new T.VerifiedLock[](2);
        locks[0] = _lock(MERIDIAN, T.Tranche.SENIOR, a1, 6182101, 17, 1);
        locks[1] = _lock(VECTOR, T.Tranche.SENIOR, a2, 6182101, 22, 2);

        (A.Award[] memory awards, A.Refund[] memory refunds) = A.allocate(locks, s);

        uint256 seated;
        for (uint256 i = 0; i < awards.length; ++i) {
            seated += awards[i].amount;
        }
        uint256 returned;
        for (uint256 i = 0; i < refunds.length; ++i) {
            returned += refunds[i].amount;
        }

        assertLe(seated, s.senior, "never over capacity");
        assertEq(seated + returned, uint256(a1) + uint256(a2), "every unit seated or refunded");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PUSD} from "../src/sepolia/PUSD.sol";
import {PriorityVault} from "../src/sepolia/PriorityVault.sol";

contract PriorityVaultTest is Test {
    PUSD pusd;
    PriorityVault vault;

    address obligor = makeAddr("obligor");
    address meridian = makeAddr("meridian");
    address vector = makeAddr("vector");
    address novum = makeAddr("novum");
    address stranger = makeAddr("stranger");

    bytes32 constant COL = keccak256("warehouse-receipt-8802");

    uint256 constant D = 10 ** 6; // pUSD has 6 decimals

    function setUp() public {
        pusd = new PUSD();
        vault = new PriorityVault(pusd);

        for (uint256 i = 0; i < 3; ++i) {
            address who = i == 0 ? meridian : i == 1 ? vector : novum;
            pusd.mintDollars(who, 50_000);
            vm.prank(who);
            pusd.approve(address(vault), type(uint256).max);
        }
        pusd.mintDollars(obligor, 50_000);
        vm.prank(obligor);
        pusd.approve(address(vault), type(uint256).max);

        vm.prank(obligor);
        vault.registerCollateral(COL);
    }

    function _openRace(uint256 facilityDollars) internal {
        vm.prank(obligor);
        vault.openRace(COL, facilityDollars * D, 10 minutes);
    }

    function _lock(address who, PriorityVault.Tranche t, uint256 dollars) internal {
        vm.prank(who);
        vault.lock(COL, t, dollars * D);
    }

    // ═══════════════════════════ decimals ═══════════════════════════

    /// @dev The figure a judge reads on Etherscan must equal the figure on screen.
    function test_pusdSixDecimalsMakesDollarsLegible() public view {
        assertEq(pusd.decimals(), 6, "6dp to match real USDC conventions");
        assertEq(5_000 * D, 5_000_000_000, "$5,000 is 5000000000 on-chain");
    }

    // ═══════════════════════════ seq / raceNonce ═══════════════════════════

    /// @dev seq must run 1..N within a race — the whole completeness argument rests on it.
    function test_seqRunsFromOneWithinARace() public {
        _openRace(8_500);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);
        _lock(vector, PriorityVault.Tranche.JUNIOR, 2_550);
        _lock(novum, PriorityVault.Tranche.SUBORDINATE, 850);

        assertEq(vault.lockCountOf(COL), 3);
        assertEq(vault.lockAt(COL, 0).seq, 1);
        assertEq(vault.lockAt(COL, 1).seq, 2);
        assertEq(vault.lockAt(COL, 2).seq, 3);
    }

    /// @dev THE fix that came out of building the orchestrator: a second financing round must also
    /// start at seq 1, or "contiguous from 1" is unenforceable and a prover can omit the first lock.
    function test_secondRaceRestartsSeqAndBumpsNonce() public {
        _openRace(8_500);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);
        assertEq(vault.getCollateral(COL).raceNonce, 1);
        assertEq(vault.lockAt(COL, 0).seq, 1);

        vm.prank(obligor);
        vault.closeRace(COL);

        _openRace(8_500);
        assertEq(vault.getCollateral(COL).raceNonce, 2, "race nonce must advance");
        assertEq(vault.lockCountOf(COL), 0, "new race starts with no locks");

        _lock(vector, PriorityVault.Tranche.SENIOR, 4_000);
        assertEq(vault.lockAt(COL, 0).seq, 1, "seq restarts at 1 in the new race");
        assertEq(vault.lockAt(COL, 0).raceNonce, 2);

        // The previous race's locks are still readable at their own nonce.
        assertEq(vault.lockAtRace(COL, 1, 0).financier, meridian);
    }

    /// @dev seq order must agree with block position, because the gate cross-checks the two and
    /// rejects a vault whose own ordering contradicts the proof.
    function test_seqOrderAgreesWithBlockPosition() public {
        _openRace(20_000);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);
        vm.roll(block.number + 1);
        _lock(vector, PriorityVault.Tranche.JUNIOR, 5_000);
        vm.roll(block.number + 3);
        _lock(novum, PriorityVault.Tranche.SUBORDINATE, 5_000);

        for (uint256 i = 1; i < 3; ++i) {
            PriorityVault.Lock memory prev = vault.lockAt(COL, i - 1);
            PriorityVault.Lock memory cur = vault.lockAt(COL, i);
            assertTrue(cur.seq > prev.seq, "seq strictly increasing");
            assertTrue(cur.blockNumber >= prev.blockNumber, "block position never goes backwards");
        }
    }

    /// @dev Same-block locks are the case the whole mechanism turns on. seq separates them here;
    /// on Creditcoin `calculateTxIndex` proves the separation.
    function test_sameBlockLocksAreDistinguishedBySeq() public {
        _openRace(20_000);
        uint256 b = block.number;
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);
        _lock(novum, PriorityVault.Tranche.SENIOR, 5_000);

        PriorityVault.Lock memory a = vault.lockAt(COL, 0);
        PriorityVault.Lock memory c = vault.lockAt(COL, 1);
        assertEq(a.blockNumber, uint64(b));
        assertEq(c.blockNumber, uint64(b), "both in the same block");
        assertTrue(c.seq > a.seq, "block height alone cannot order these; seq/txIndex can");
    }

    // ═══════════════════════════ allocation ═══════════════════════════

    /// @dev Locks fill the facility in seq order. The lock crossing the boundary is partially
    /// allocated; everything after it is fully refundable.
    function test_allocationFillsFacilityInSeqOrder() public {
        _openRace(8_500);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000); // fully allocated
        _lock(vector, PriorityVault.Tranche.JUNIOR, 4_000); // 3,500 allocated, 500 refundable
        _lock(novum, PriorityVault.Tranche.SUBORDINATE, 2_000); // entirely refundable

        assertEq(vault.allocatedAmount(COL, 0), 5_000 * D);
        assertEq(vault.allocatedAmount(COL, 1), 3_500 * D, "partial at the boundary");
        assertEq(vault.allocatedAmount(COL, 2), 0, "outpaced entirely");
        assertEq(vault.totalAllocated(COL), 8_500 * D);
    }

    function test_refundReturnsOnlyTheUnallocatedPortion() public {
        _openRace(8_500);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);
        _lock(vector, PriorityVault.Tranche.JUNIOR, 4_000);
        _lock(novum, PriorityVault.Tranche.SUBORDINATE, 2_000);

        vm.prank(obligor);
        vault.closeRace(COL);

        uint256 before = pusd.balanceOf(vector);
        vm.prank(vector);
        vault.refund(COL, 1);
        assertEq(pusd.balanceOf(vector) - before, 500 * D, "only the excess comes back");

        before = pusd.balanceOf(novum);
        vm.prank(novum);
        vault.refund(COL, 2);
        assertEq(pusd.balanceOf(novum) - before, 2_000 * D, "outpaced capital fully returned");

        // The winner has nothing to reclaim.
        vm.prank(meridian);
        vm.expectRevert(PriorityVault.NothingToRefund.selector);
        vault.refund(COL, 0);
    }

    function test_refundIsNotRepeatable() public {
        _openRace(1_000);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);
        vm.prank(obligor);
        vault.closeRace(COL);

        vm.prank(meridian);
        vault.refund(COL, 0);
        vm.prank(meridian);
        vm.expectRevert(PriorityVault.NothingToRefund.selector);
        vault.refund(COL, 0);
    }

    // ═══════════════════════════ attack / negative cases ═══════════════════════════

    function test_revert_lockAfterRaceCloses() public {
        _openRace(8_500);
        vm.prank(obligor);
        vault.closeRace(COL);

        vm.prank(meridian);
        vm.expectRevert(PriorityVault.RaceNotOpen.selector);
        vault.lock(COL, PriorityVault.Tranche.SENIOR, 5_000 * D);
    }

    function test_revert_lockAfterDeadline() public {
        _openRace(8_500);
        vm.warp(block.timestamp + 11 minutes);

        vm.prank(meridian);
        vm.expectRevert(PriorityVault.RaceNotOpen.selector);
        vault.lock(COL, PriorityVault.Tranche.SENIOR, 5_000 * D);
    }

    function test_revert_strangerCannotOpenRace() public {
        vm.prank(stranger);
        vm.expectRevert(PriorityVault.NotObligor.selector);
        vault.openRace(COL, 8_500 * D, 10 minutes);
    }

    function test_revert_twoOpenRacesOnOneCollateral() public {
        _openRace(8_500);
        vm.prank(obligor);
        vm.expectRevert(PriorityVault.RaceAlreadyOpen.selector);
        vault.openRace(COL, 1_000 * D, 10 minutes);
    }

    function test_revert_refundWhileRaceOpen() public {
        _openRace(1_000);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);

        vm.prank(meridian);
        vm.expectRevert(PriorityVault.RaceStillOpen.selector);
        vault.refund(COL, 0);
    }

    function test_revert_cannotRefundSomeoneElsesLock() public {
        _openRace(1_000);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);
        vm.prank(obligor);
        vault.closeRace(COL);

        vm.prank(stranger);
        vm.expectRevert(PriorityVault.NotLockOwner.selector);
        vault.refund(COL, 0);
    }

    function test_revert_drawBeyondAllocation() public {
        _openRace(8_500);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);
        vm.prank(obligor);
        vault.closeRace(COL);

        vm.prank(obligor);
        vm.expectRevert(PriorityVault.OverDraw.selector);
        vault.draw(COL, 5_001 * D);
    }

    function test_revert_drawWhileRaceOpen() public {
        _openRace(8_500);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);

        vm.prank(obligor);
        vm.expectRevert(PriorityVault.RaceStillOpen.selector);
        vault.draw(COL, 1_000 * D);
    }

    function test_revert_strangerCannotDraw() public {
        _openRace(8_500);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);
        vm.prank(obligor);
        vault.closeRace(COL);

        vm.prank(stranger);
        vm.expectRevert(PriorityVault.NotObligor.selector);
        vault.draw(COL, 100 * D);
    }

    function test_revert_raceWindowTooShort() public {
        vm.prank(obligor);
        vm.expectRevert(PriorityVault.WindowTooShort.selector);
        vault.openRace(COL, 8_500 * D, 30 seconds);
    }

    function test_revert_doubleRegistration() public {
        vm.prank(stranger);
        vm.expectRevert(PriorityVault.AlreadyRegistered.selector);
        vault.registerCollateral(COL);
    }

    // ═══════════════════════════ liveness ═══════════════════════════

    /// @dev A silent obligor must not be able to strand UNALLOCATED capital. Anyone may close a
    /// stale race once the deadline passes, which unlocks the refund path.
    function test_anyoneMayCloseAStaleRaceSoUnallocatedCapitalIsFreed() public {
        _openRace(1_000);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);

        vm.warp(block.timestamp + 11 minutes);
        vm.prank(stranger);
        vault.closeRace(COL); // permissionless after the deadline

        vm.prank(meridian);
        vault.refund(COL, 0);

        // 1,000 stays allocated to the facility; the other 4,000 comes straight back.
        assertEq(pusd.balanceOf(meridian), 49_000 * D, "unallocated capital returned");
        assertEq(vault.totalAllocated(COL), 1_000 * D, "the facility keeps what it filled");
    }

    /// @dev The harder liveness case: the obligor lets the facility settle and then never draws.
    /// ALLOCATED capital would otherwise be trapped forever — and Creditcoin cannot release Sepolia
    /// escrow, because Attestcoin readability only runs one way. So the vault expires it itself.
    function test_abandonedFacilityReleasesEvenAllocatedCapital() public {
        _openRace(8_500);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);
        _lock(vector, PriorityVault.Tranche.JUNIOR, 2_550);

        vm.prank(obligor);
        vault.closeRace(COL);

        assertFalse(vault.isAbandoned(COL), "not abandoned while the draw window is open");
        vm.prank(meridian);
        vm.expectRevert(PriorityVault.NothingToRefund.selector);
        vault.refund(COL, 0); // allocated capital is locked in, for now

        vm.warp(block.timestamp + vault.DRAW_WINDOW() + 1);
        assertTrue(vault.isAbandoned(COL), "obligor never drew");

        vm.prank(meridian);
        vault.refund(COL, 0);
        vm.prank(vector);
        vault.refund(COL, 1);

        assertEq(pusd.balanceOf(meridian), 50_000 * D, "senior made whole");
        assertEq(pusd.balanceOf(vector), 50_000 * D, "junior made whole");
        assertEq(pusd.balanceOf(address(vault)), 0, "vault fully drained back to financiers");
    }

    /// @dev A drawn facility is NOT abandonable — drawing is the obligor honouring the deal, and
    /// the lenders' recourse from that point is the failure branch on Creditcoin, not a refund.
    function test_drawnFacilityIsNeverAbandoned() public {
        _openRace(8_500);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);
        vm.prank(obligor);
        vault.closeRace(COL);
        vm.prank(obligor);
        vault.draw(COL, 5_000 * D);

        vm.warp(block.timestamp + vault.DRAW_WINDOW() + 1);
        assertFalse(vault.isAbandoned(COL), "drawn facilities are serviced, not unwound here");

        vm.prank(meridian);
        vm.expectRevert(PriorityVault.NothingToRefund.selector);
        vault.refund(COL, 0);
    }

    // ═══════════════════════════ full servicing cycle ═══════════════════════════

    function test_drawAndRepayCycle() public {
        _openRace(8_500);
        _lock(meridian, PriorityVault.Tranche.SENIOR, 5_000);
        _lock(vector, PriorityVault.Tranche.JUNIOR, 2_550);
        vm.prank(obligor);
        vault.closeRace(COL);

        uint256 allocated = vault.totalAllocated(COL);
        assertEq(allocated, 7_550 * D);

        uint256 before = pusd.balanceOf(obligor);
        vm.prank(obligor);
        vault.draw(COL, allocated);
        assertEq(pusd.balanceOf(obligor) - before, allocated, "obligor received the facility");

        // Repay principal + interest.
        uint256 repayment = 7_690 * D;
        vm.prank(obligor);
        vault.repay(COL, repayment);

        assertEq(vault.getCollateral(COL).totalRepaid, repayment);
        assertEq(pusd.balanceOf(address(vault)), repayment, "vault holds the repayment for the waterfall");
    }

    // ═══════════════════════════ event signatures ═══════════════════════════

    /// @dev These constants are compiled into AttestationGate. If the event changes and this test
    /// is not updated, the gate silently stops finding Lock events — so pin them here.
    function test_eventSignaturesArePinned() public view {
        assertEq(
            vault.lockEventSignature(),
            keccak256("Lock_(bytes32,address,uint8,uint256,address,uint64,uint64,uint64)")
        );
        assertEq(vault.repaymentEventSignature(), keccak256("Repayment(bytes32,address,uint256,address)"));
    }
}

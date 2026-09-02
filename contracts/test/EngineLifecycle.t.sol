// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PrecedenceTypes as T} from "../src/creditcoin/PrecedenceTypes.sol";
import {AllocationLib as A} from "../src/creditcoin/AllocationLib.sol";
import {CollateralRegistry} from "../src/creditcoin/CollateralRegistry.sol";
import {ClaimToken} from "../src/creditcoin/ClaimToken.sol";
import {PriorityEngine} from "../src/creditcoin/PriorityEngine.sol";
import {RefinanceEngine} from "../src/creditcoin/RefinanceEngine.sol";

/// @notice Full-lifecycle integration across the Creditcoin contracts: settlement, servicing, the
/// atomic refinance, and the deterministic unwind.
///
/// @dev The `AttestationGate` decode path needs real USC-encoded transaction bytes, so it is
/// exercised by a fork test against live Sepolia data instead. Here the gate address is an EOA, so
/// the settlement RULES and the state machine can be driven exhaustively — including the failure
/// branch, which is half the demo and cannot be left untested.
contract EngineLifecycleTest is Test {
    CollateralRegistry registry;
    ClaimToken claims;
    PriorityEngine engine;
    RefinanceEngine refi;

    address owner = makeAddr("owner");
    address gate = makeAddr("gate"); // stands in for AttestationGate
    address obligor = makeAddr("obligor");
    address vault = makeAddr("sepoliaVault");
    address token = makeAddr("pUSD");
    address custodian = makeAddr("custodian");

    address meridian = makeAddr("meridian");
    address vector = makeAddr("vector");
    address novum = makeAddr("novum");
    address refinancer = makeAddr("refinancer");
    address keeper = makeAddr("keeper"); // holds NO privileges, by design
    address bidder = makeAddr("bidder");

    bytes32 collateralId;
    uint256 constant D = 1e6; // pUSD, 6dp

    function setUp() public {
        vm.startPrank(owner);
        registry = new CollateralRegistry(owner);
        claims = new ClaimToken(owner, "ipfs://precedence/{id}");
        engine = new PriorityEngine(owner, registry, claims);
        refi = new RefinanceEngine(registry, claims, engine, gate);

        registry.setStateWriter(address(engine), true);
        claims.setMinter(address(engine), true);
        claims.setMinter(address(refi), true);
        engine.setAttestationGate(gate);
        engine.setRefinanceEngine(address(refi));
        vm.stopPrank();

        // $10,000 warehouse receipt, 15% haircut, 90-day term.
        collateralId = keccak256("warehouse-receipt-8802");
        vm.prank(obligor);
        registry.registerCollateral(
            collateralId,
            CollateralRegistry.AssetType.WAREHOUSE_RECEIPT,
            10_000 * D,
            1_500,
            90,
            custodian,
            vault,
            "ipfs://atlas-coffee-8802"
        );

        // The OBLIGOR posts the facility terms: caps and coupons. Lenders read these before
        // deciding whether to lock, and the rate being fixed by the borrower is what keeps proven
        // ordering — not price — the thing that decides who gets a tranche.
        vm.prank(obligor);
        registry.postFacilityTerms(
            collateralId,
            5_100 * D, // SENIOR cap
            2_550 * D, // JUNIOR cap
            850 * D, // SUBORDINATE cap
            520, // 5.2% senior
            780, // 7.8% junior
            1_150 // 11.5% subordinate
        );

        // Fund the bounty pool so keepers can be paid. The unwind must work without it too — see
        // test_unwindWorksWithAnEmptyBountyPool.
        vm.deal(owner, 100 ether);
        vm.prank(owner);
        engine.fundBountyPool{value: 50 ether}();
    }

    // ─────────────────────────── helpers ───────────────────────────

    function _lock(address who, T.Tranche tr, uint256 amt, uint64 h, uint64 idx, uint64 seq)
        internal
        view
        returns (T.VerifiedLock memory)
    {
        return T.VerifiedLock({
            financier: who,
            tranche: tr,
            amount: amt,
            token: token,
            emittedBy: vault,
            height: h,
            txIndex: idx,
            seq: seq,
            raceNonce: 1,
            receiptStatus: 1
        });
    }

    /// @dev The headline race: all three locks in ONE block, and Novum contests SENIOR from a later
    /// transaction index. Only txIndex can separate them.
    function _settleHeadlineRace() internal {
        T.VerifiedLock[] memory locks = new T.VerifiedLock[](3);
        locks[0] = _lock(meridian, T.Tranche.SENIOR, 5_100 * D, 6182101, 17, 1);
        locks[1] = _lock(vector, T.Tranche.JUNIOR, 2_550 * D, 6182101, 22, 2);
        locks[2] = _lock(novum, T.Tranche.SENIOR, 5_100 * D, 6182101, 41, 3);

        bool[] memory demote = new bool[](3);
        vm.prank(gate);
        engine.settlePriority(collateralId, locks, demote);
    }

    function _draw() internal {
        vm.prank(gate);
        engine.markDrawn(collateralId, 7_650 * D);
    }

    // ═══════════════════════════ settlement ═══════════════════════════

    function test_settlementMintsClaimsAndRecordsProvenOrder() public {
        _settleHeadlineRace();

        A.Award[] memory stack = engine.priorityStack(collateralId);
        assertEq(stack.length, 2, "senior + junior seated; the second senior bid had nowhere to go");

        assertEq(stack[0].financier, meridian);
        assertEq(stack[0].rank, 1);
        assertEq(stack[0].txIndex, 17, "won on transaction index, in a shared block");

        // Claims are real ERC-1155 balances denominated in pUSD units.
        uint256 seniorId = claims.claimId(collateralId, T.Tranche.SENIOR);
        assertEq(claims.balanceOf(meridian, seniorId), 5_100 * D, "balance IS the principal");
        assertEq(claims.balanceOf(novum, seniorId), 0, "outpaced bidder holds nothing");

        // And each claim can show WHY it is senior.
        (bytes32 cid,, uint8 rank, uint64 height, uint64 txIndex,,) = claims.provenanceOf(seniorId);
        assertEq(cid, collateralId);
        assertEq(rank, 1);
        assertEq(height, 6182101);
        assertEq(txIndex, 17);

        (T.EncumbranceState state, uint32 liens) = registry.getEncumbrance(collateralId);
        assertEq(uint8(state), uint8(T.EncumbranceState.PRIORITY_SETTLED));
        assertEq(liens, 2);
        assertFalse(registry.isClearTitle(collateralId), "collateral is no longer clear");
    }

    /// @dev The registry populates as exhaust of financing. Nobody joined it.
    function test_registryRecordsTheLienWithoutAnyoneOptingIn() public {
        assertTrue(registry.isClearTitle(collateralId), "clear before financing");
        _settleHeadlineRace();
        _draw();

        (T.EncumbranceState state, uint32 liens) = registry.getEncumbrance(collateralId);
        assertEq(uint8(state), uint8(T.EncumbranceState.ENCUMBERED));
        assertEq(liens, 2);
    }

    function test_outpacedCapitalIsRecordedAsPreventedDoublePledge() public {
        _settleHeadlineRace();
        A.Refund[] memory refunds = engine.refundsOf(collateralId);
        assertEq(refunds.length, 1);
        assertEq(refunds[0].financier, novum);
        assertEq(refunds[0].amount, 5_100 * D, "returned in full, never demoted");
        assertEq(uint8(refunds[0].declared), uint8(T.Tranche.SENIOR));
    }

    function test_revert_onlyGateCanSettle() public {
        T.VerifiedLock[] memory locks = new T.VerifiedLock[](1);
        locks[0] = _lock(meridian, T.Tranche.SENIOR, 5_100 * D, 6182101, 17, 1);
        bool[] memory demote = new bool[](1);

        vm.prank(meridian);
        vm.expectRevert(PriorityEngine.NotGate.selector);
        engine.settlePriority(collateralId, locks, demote);
    }

    // ═══════════════════════════ performing payoff ═══════════════════════════

    function test_repaymentRunsStrictSeniorityAndBurnsClaims() public {
        _settleHeadlineRace();
        _draw();

        vm.prank(gate);
        engine.releaseLien(collateralId, 7_790 * D);

        A.WaterfallLine[] memory lines = engine.waterfallOf(collateralId);
        assertEq(lines.length, 2);
        assertEq(lines[0].rank, 1);
        assertTrue(lines[0].satisfiedInFull, "senior in full BEFORE junior");
        assertEq(lines[0].principalReturned, 5_100 * D);
        assertEq(lines[0].loss, 0);
        assertTrue(lines[1].satisfiedInFull);
        assertEq(lines[1].loss, 0);

        // Claims burn; collateral returns to a clean state.
        assertEq(claims.balanceOf(meridian, claims.claimId(collateralId, T.Tranche.SENIOR)), 0);
        assertEq(claims.balanceOf(vector, claims.claimId(collateralId, T.Tranche.JUNIOR)), 0);
        (T.EncumbranceState state, uint32 liens) = registry.getEncumbrance(collateralId);
        assertEq(uint8(state), uint8(T.EncumbranceState.REPAID));
        assertEq(liens, 0);
    }

    /// @dev The waterfall runs on the PROVEN amount. Under-repaying cannot make everyone whole.
    function test_underRepaymentPutsLossOnTheJuniorTranche() public {
        _settleHeadlineRace();
        _draw();

        vm.prank(gate);
        engine.releaseLien(collateralId, 6_000 * D); // short of the 7,650 principal

        A.WaterfallLine[] memory lines = engine.waterfallOf(collateralId);
        assertEq(lines[0].loss, 0, "senior protected");
        assertGt(lines[1].loss, 0, "junior absorbs the shortfall");
        assertFalse(lines[1].satisfiedInFull);
    }

    // ═══════════════════════════ atomic refinance ═══════════════════════════

    /// @dev The invariant: the old claim burns and the new claim mints in ONE call, so there is no
    /// state in which the collateral is unencumbered and re-encumberable.
    function test_atomicRefinanceTransfersPriorityWithNoGap() public {
        _settleHeadlineRace();
        _draw();

        uint256 seniorId = claims.claimId(collateralId, T.Tranche.SENIOR);
        assertEq(claims.balanceOf(meridian, seniorId), 5_100 * D);

        vm.prank(gate);
        refi.executeAtomic(
            collateralId, T.Tranche.SENIOR, meridian, refinancer, 5_100 * D, 800, 520, 6182400, 9
        );

        assertEq(claims.balanceOf(meridian, seniorId), 0, "old lien released");
        assertEq(claims.balanceOf(refinancer, seniorId), 5_100 * D, "new lien created, same position");

        // Total supply of the senior position never changed — nothing was ever unbacked.
        RefinanceEngine.Refinance[] memory h = refi.historyOf(collateralId);
        assertEq(h.length, 1);
        assertEq(h[0].newFinancier, refinancer);
        assertEq(h[0].oldRateBps, 800);
        assertEq(h[0].newRateBps, 520);
    }

    /// @dev Churning a position at a worse rate is not a refinance, and must not be possible just
    /// because someone would earn the fee.
    function test_revert_refinanceAtAWorseRateIsRejected() public {
        _settleHeadlineRace();
        vm.prank(gate);
        vm.expectRevert(abi.encodeWithSelector(RefinanceEngine.NotAnImprovement.selector, 520, 800));
        refi.executeAtomic(
            collateralId, T.Tranche.SENIOR, meridian, refinancer, 5_100 * D, 520, 800, 6182400, 9
        );
    }

    function test_revert_refinanceOfAPositionThatDoesNotExist() public {
        vm.prank(gate);
        vm.expectRevert(
            abi.encodeWithSelector(RefinanceEngine.NoSuchPosition.selector, collateralId, T.Tranche.SENIOR)
        );
        refi.executeAtomic(
            collateralId, T.Tranche.SENIOR, meridian, refinancer, 5_100 * D, 800, 520, 6182400, 9
        );
    }

    function test_revert_onlyGateCanRefinance() public {
        _settleHeadlineRace();
        vm.prank(refinancer);
        vm.expectRevert(RefinanceEngine.NotGate.selector);
        refi.executeAtomic(
            collateralId, T.Tranche.SENIOR, meridian, refinancer, 5_100 * D, 800, 520, 6182400, 9
        );
    }

    // ═══════════════════════════ the failure branch ═══════════════════════════

    /// @dev The full unwind, poked entirely by an address holding NO privileges. That is the answer
    /// to "what happens when your monitor is down?" — nothing needs to be up.
    function test_fullUnwindIsDrivenByAnUnprivilegedKeeper() public {
        _settleHeadlineRace();
        _draw();

        assertFalse(registry.isStateWriter(keeper), "keeper has no role");
        assertEq(claims.isMinter(keeper), false);

        // Maturity passes with no repayment proof.
        vm.warp(block.timestamp + 91 days);

        uint256 before = keeper.balance;

        vm.prank(keeper);
        engine.pokeFreezeDraw(collateralId);
        (T.EncumbranceState s1,) = registry.getEncumbrance(collateralId);
        assertEq(uint8(s1), uint8(T.EncumbranceState.FROZEN));

        vm.prank(keeper);
        engine.pokePcrStabilization(collateralId);

        // Top-up window lapses with nothing posted.
        vm.warp(block.timestamp + engine.PCR_WINDOW() + 1);
        vm.prank(keeper);
        engine.pokeGracePeriod(collateralId);
        (T.EncumbranceState s2,) = registry.getEncumbrance(collateralId);
        assertEq(uint8(s2), uint8(T.EncumbranceState.GRACE));

        // Cure window lapses.
        vm.warp(block.timestamp + engine.GRACE_PERIOD() + 1);
        vm.prank(keeper);
        engine.pokeDutchLiquidation(collateralId);
        (T.EncumbranceState s3,) = registry.getEncumbrance(collateralId);
        assertEq(uint8(s3), uint8(T.EncumbranceState.DUTCH_LIQUIDATION));

        // Price decays deterministically; a bidder clears it partway down.
        uint256 start = engine.auctionStartPrice(collateralId);
        vm.roll(block.number + 140);
        uint256 price = engine.auctionPrice(collateralId);
        assertLt(price, start, "price decayed with elapsed blocks");
        assertGe(price, engine.auctionFloorPrice(collateralId), "never below the floor");

        vm.deal(bidder, price + 1 ether);
        vm.prank(bidder);
        engine.bidLiquidation{value: price}(collateralId);

        vm.prank(keeper);
        engine.pokeTerminateDefault(collateralId);

        (T.EncumbranceState s4, uint32 liens) = registry.getEncumbrance(collateralId);
        assertEq(uint8(s4), uint8(T.EncumbranceState.DEFAULTED));
        assertEq(liens, 0);
        assertTrue(engine.hasDefaulted(obligor), "permanent, cross-round credit flag");
        assertGt(keeper.balance, before, "keeper earned bounties for doing the protocol's work");
    }

    /// @dev Loss must land bottom-up or subordination was priced for nothing.
    function test_liquidationPutsFirstLossOnTheSubordinateTranche() public {
        // A race that fills all three tranches, so there is a subordinate holder to absorb loss.
        T.VerifiedLock[] memory locks = new T.VerifiedLock[](3);
        locks[0] = _lock(meridian, T.Tranche.SENIOR, 5_100 * D, 6182101, 17, 1);
        locks[1] = _lock(vector, T.Tranche.JUNIOR, 2_550 * D, 6182101, 22, 2);
        locks[2] = _lock(novum, T.Tranche.SUBORDINATE, 850 * D, 6182101, 41, 3);
        bool[] memory demote = new bool[](3);
        vm.prank(gate);
        engine.settlePriority(collateralId, locks, demote);
        _draw();

        vm.warp(block.timestamp + 91 days);
        vm.prank(keeper);
        engine.pokeFreezeDraw(collateralId);
        vm.prank(keeper);
        engine.pokePcrStabilization(collateralId);
        vm.warp(block.timestamp + engine.PCR_WINDOW() + 1);
        vm.prank(keeper);
        engine.pokeGracePeriod(collateralId);
        vm.warp(block.timestamp + engine.GRACE_PERIOD() + 1);
        vm.prank(keeper);
        engine.pokeDutchLiquidation(collateralId);

        // Decay to roughly $6,020 of recovery against $8,500 of principal. The junior +
        // subordinate buffer is $3,400, and the hole is ~$2,480 — so the buffer absorbs it all and
        // senior comes out whole. That is precisely what a 5.2% senior coupon was pricing.
        vm.roll(block.number + 320);
        uint256 price = engine.auctionPrice(collateralId);
        vm.deal(bidder, price + 1 ether);
        vm.prank(bidder);
        engine.bidLiquidation{value: price}(collateralId);

        vm.prank(keeper);
        engine.pokeTerminateDefault(collateralId);

        A.WaterfallLine[] memory lines = engine.waterfallOf(collateralId);
        assertEq(lines.length, 3);
        assertEq(lines[0].rank, 1);
        assertEq(lines[2].rank, 3);

        assertEq(lines[0].loss, 0, "senior protected by subordination, exactly as its coupon implied");
        assertEq(lines[2].loss, 850 * D, "subordinate wiped out first");
        assertGt(lines[1].loss, 0, "junior absorbs the rest");
        assertLt(lines[1].loss, lines[1].principal, "junior only partially impaired");

        _assertLossAbsorbedBottomUp(lines);
    }

    /// @dev The general invariant, independent of how bad the recovery happens to be: a tranche can
    /// only take a loss once EVERY tranche below it has been wiped out completely. Asserting this
    /// rather than "senior never loses" is what actually distinguishes a priority waterfall from a
    /// pro-rata split — senior can lose, but only last.
    function _assertLossAbsorbedBottomUp(A.WaterfallLine[] memory lines) internal pure {
        for (uint256 i = 0; i + 1 < lines.length; ++i) {
            if (lines[i].loss > 0) {
                // Everything junior to a loss-taking tranche must be a total loss.
                for (uint256 j = i + 1; j < lines.length; ++j) {
                    require(
                        lines[j].loss == lines[j].principal,
                        "a senior tranche took a loss while a junior one was not yet wiped out"
                    );
                }
            }
        }
    }

    /// @dev And it must hold at every recovery level, not just the one that made a nice demo.
    function testFuzz_lossIsAlwaysAbsorbedBottomUp(uint96 recovery) public {
        T.VerifiedLock[] memory locks = new T.VerifiedLock[](3);
        locks[0] = _lock(meridian, T.Tranche.SENIOR, 5_100 * D, 6182101, 17, 1);
        locks[1] = _lock(vector, T.Tranche.JUNIOR, 2_550 * D, 6182101, 22, 2);
        locks[2] = _lock(novum, T.Tranche.SUBORDINATE, 850 * D, 6182101, 41, 3);
        bool[] memory demote = new bool[](3);
        vm.prank(gate);
        engine.settlePriority(collateralId, locks, demote);
        _draw();

        vm.prank(gate);
        engine.releaseLien(collateralId, recovery);

        _assertLossAbsorbedBottomUp(engine.waterfallOf(collateralId));
    }

    /// @dev Lender protection must not depend on treasury solvency. With an empty bounty pool the
    /// pokes still succeed — they just pay nothing.
    function test_unwindWorksWithAnEmptyBountyPool() public {
        // Drain the pool by deploying a fresh engine with no funding.
        vm.startPrank(owner);
        PriorityEngine bare = new PriorityEngine(owner, registry, claims);
        registry.setStateWriter(address(bare), true);
        claims.setMinter(address(bare), true);
        bare.setAttestationGate(gate);
        vm.stopPrank();
        assertEq(bare.bountyPool(), 0);

        T.VerifiedLock[] memory locks = new T.VerifiedLock[](1);
        locks[0] = _lock(meridian, T.Tranche.SENIOR, 5_100 * D, 6182101, 17, 1);
        bool[] memory demote = new bool[](1);
        vm.prank(gate);
        bare.settlePriority(collateralId, locks, demote);
        vm.prank(gate);
        bare.markDrawn(collateralId, 5_100 * D);

        vm.warp(block.timestamp + 91 days);
        uint256 before = keeper.balance;
        vm.prank(keeper);
        bare.pokeFreezeDraw(collateralId); // must NOT revert

        (T.EncumbranceState s,) = registry.getEncumbrance(collateralId);
        assertEq(uint8(s), uint8(T.EncumbranceState.FROZEN), "protection worked");
        assertEq(keeper.balance, before, "no bounty available, and that is fine");
    }

    /// @dev Curing coverage returns the facility to the performing track.
    function test_postingATopUpCuresCoverageAndResumesTheFacility() public {
        _settleHeadlineRace();
        _draw();

        vm.warp(block.timestamp + 91 days);
        vm.prank(keeper);
        engine.pokeFreezeDraw(collateralId);
        vm.prank(keeper);
        engine.pokePcrStabilization(collateralId);

        // Post enough to restore coverage above the threshold.
        vm.deal(obligor, 100_000 * D);
        vm.prank(obligor);
        engine.postTopUp{value: 10_000 * D}(collateralId);

        (T.EncumbranceState s,) = registry.getEncumbrance(collateralId);
        assertEq(uint8(s), uint8(T.EncumbranceState.ENCUMBERED), "back on the performing track");
    }

    // ─────────────────── gates must actually gate ───────────────────

    function test_revert_cannotSkipTheGracePeriod() public {
        _settleHeadlineRace();
        _draw();
        vm.warp(block.timestamp + 91 days);
        vm.prank(keeper);
        engine.pokeFreezeDraw(collateralId);
        vm.prank(keeper);
        engine.pokePcrStabilization(collateralId);
        vm.warp(block.timestamp + engine.PCR_WINDOW() + 1);
        vm.prank(keeper);
        engine.pokeGracePeriod(collateralId);

        // Grace has NOT expired.
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(PriorityEngine.GateNotOpen.selector, "grace period still open"));
        engine.pokeDutchLiquidation(collateralId);
    }

    function test_revert_cannotFreezeAHealthyFacility() public {
        _settleHeadlineRace();
        _draw();
        // Coverage is fine ($8,500 adjusted vs $7,650 principal is 111%) and maturity is far off.
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(PriorityEngine.GateNotOpen.selector, "pcr >= threshold and not matured")
        );
        engine.pokeFreezeDraw(collateralId);
    }

    function test_revert_cannotTerminateBeforeTheAuctionClears() public {
        _settleHeadlineRace();
        _draw();
        vm.warp(block.timestamp + 91 days);
        vm.prank(keeper);
        engine.pokeFreezeDraw(collateralId);
        vm.prank(keeper);
        engine.pokePcrStabilization(collateralId);
        vm.warp(block.timestamp + engine.PCR_WINDOW() + 1);
        vm.prank(keeper);
        engine.pokeGracePeriod(collateralId);
        vm.warp(block.timestamp + engine.GRACE_PERIOD() + 1);
        vm.prank(keeper);
        engine.pokeDutchLiquidation(collateralId);

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(PriorityEngine.GateNotOpen.selector, "auction has not cleared"));
        engine.pokeTerminateDefault(collateralId);
    }

    function test_revert_bidBelowTheCurrentAuctionPrice() public {
        _settleHeadlineRace();
        _draw();
        vm.warp(block.timestamp + 91 days);
        vm.prank(keeper);
        engine.pokeFreezeDraw(collateralId);
        vm.prank(keeper);
        engine.pokePcrStabilization(collateralId);
        vm.warp(block.timestamp + engine.PCR_WINDOW() + 1);
        vm.prank(keeper);
        engine.pokeGracePeriod(collateralId);
        vm.warp(block.timestamp + engine.GRACE_PERIOD() + 1);
        vm.prank(keeper);
        engine.pokeDutchLiquidation(collateralId);

        uint256 price = engine.auctionPrice(collateralId);
        vm.deal(bidder, price);
        vm.prank(bidder);
        vm.expectRevert(abi.encodeWithSelector(PriorityEngine.InsufficientBid.selector, price - 1, price));
        engine.bidLiquidation{value: price - 1}(collateralId);
    }

    // ═══════════════════════════ registry invariants ═══════════════════════════

    /// @dev Hash-uniqueness: one document, one registration. This is what makes double-FINANCING of
    /// a registered claim impossible — and it is NOT a claim about physical authenticity.
    function test_revert_sameDocumentCannotBeRegisteredTwice() public {
        vm.prank(meridian);
        vm.expectRevert(abi.encodeWithSelector(CollateralRegistry.AlreadyRegistered.selector, collateralId));
        registry.registerCollateral(
            collateralId,
            CollateralRegistry.AssetType.WAREHOUSE_RECEIPT,
            10_000 * D,
            1_500,
            90,
            custodian,
            vault,
            "ipfs://forged"
        );
    }

    /// @dev The vault binding cannot be moved under a live facility — existing claims were settled
    /// against it, and repointing it would invalidate the anchor they were verified with.
    function test_revert_vaultCannotBeRepointedWhileEncumbered() public {
        _settleHeadlineRace();
        _draw();
        vm.prank(obligor);
        vm.expectRevert(CollateralRegistry.VaultLockedWhileEncumbered.selector);
        registry.updateVault(collateralId, makeAddr("attackerVault"));
    }

    function test_vaultCanBeRepointedWhileClear() public {
        address newVault = makeAddr("newVault");
        vm.prank(obligor);
        registry.updateVault(collateralId, newVault);
        assertEq(registry.vaultOf(collateralId), newVault);
    }

    /// @dev Sizing now comes from what the OBLIGOR posted, not a hardcoded 60/30/10 split.
    function test_facilitySizingComesFromPostedTerms() public view {
        (T.TrancheSizing memory s, uint256 maxAdvance) = registry.facilitySizing(collateralId);
        assertEq(maxAdvance, 8_500 * D, "10,000 face less a 15% haircut");
        assertEq(s.senior, 5_100 * D);
        assertEq(s.junior, 2_550 * D);
        assertEq(s.subordinate, 850 * D);
    }

    /// @dev Senior is protected by everything beneath it, so it must be the cheapest capital.
    /// A facility where senior out-yields subordinate is incoherent and must be impossible to post.
    function test_revert_ratesMustBeOrdinal() public {
        bytes32 other = keccak256("ordinality-check");
        vm.prank(obligor);
        registry.registerCollateral(
            other, CollateralRegistry.AssetType.TRADE_RECEIVABLE, 10_000 * D, 1_500, 90, custodian, vault, ""
        );
        vm.prank(obligor);
        vm.expectRevert(
            abi.encodeWithSelector(CollateralRegistry.RatesNotOrdinal.selector, uint16(1_800), uint16(1_000), uint16(500))
        );
        registry.postFacilityTerms(other, 2_000 * D, 3_000 * D, 3_000 * D, 1_800, 1_000, 500);
    }

    /// @dev The haircut is the lenders' protection; sizing the facility past it would remove it.
    function test_revert_capsCannotExceedTheHaircutAdjustedAdvance() public {
        bytes32 other = keccak256("cap-check");
        vm.prank(obligor);
        registry.registerCollateral(
            other, CollateralRegistry.AssetType.TRADE_RECEIVABLE, 10_000 * D, 1_500, 90, custodian, vault, ""
        );
        vm.prank(obligor);
        vm.expectRevert(
            abi.encodeWithSelector(CollateralRegistry.CapsExceedAdvance.selector, 9_000 * D, 8_500 * D)
        );
        registry.postFacilityTerms(other, 5_000 * D, 3_000 * D, 1_000 * D, 500, 1_000, 1_800);
    }

    /// @dev Terms are frozen once capital is committed against them.
    function test_revert_termsCannotChangeWhileEncumbered() public {
        _settleHeadlineRace();
        vm.prank(obligor);
        vm.expectRevert(CollateralRegistry.TermsLockedWhileEncumbered.selector);
        registry.postFacilityTerms(collateralId, 1 * D, 1 * D, 1 * D, 100, 200, 300);
    }

    /// @dev The obligor's posted coupons are what the waterfall actually pays.
    function test_waterfallUsesThePostedCoupons() public {
        _settleHeadlineRace();
        _draw();
        vm.prank(gate);
        engine.releaseLien(collateralId, 7_790 * D);

        A.WaterfallLine[] memory lines = engine.waterfallOf(collateralId);
        // 5,100 at 5.2% over 90 days, using the same integer order as the library.
        assertEq(lines[0].interestDue, (5_100 * D * 520 * 90) / (10_000 * 365));
        // 2,550 at 7.8% over 90 days.
        assertEq(lines[1].interestDue, (2_550 * D * 780 * 90) / (10_000 * 365));
    }

    function test_claimIdIsDerivableOffChain() public view {
        uint256 expected = uint256(keccak256(abi.encode(collateralId, uint8(T.Tranche.SENIOR))));
        assertEq(claims.claimId(collateralId, T.Tranche.SENIOR), expected);
    }
}

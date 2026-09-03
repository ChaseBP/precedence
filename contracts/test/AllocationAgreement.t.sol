// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PriorityVault} from "../src/sepolia/PriorityVault.sol";
import {PUSD} from "../src/sepolia/PUSD.sol";
import {AllocationLib} from "../src/creditcoin/AllocationLib.sol";
import {PrecedenceTypes as T} from "../src/creditcoin/PrecedenceTypes.sol";

/// @notice The two chains must agree about who is owed what.
///
/// @dev This suite exists because its absence let a real bug ship. `PriorityVault` decides what is
/// drawable and refundable in pUSD on Sepolia; `PriorityEngine` decides who holds which lien on
/// Creditcoin. Both were individually correct against their own specification and their own tests,
/// and they disagreed on three of four locks in a live race: two financiers could have withdrawn
/// their principal from the vault while still holding active claims, and the one the engine
/// refunded in full could reclaim only a third of its capital.
///
/// Two implementations of one decision need a test that they match. That is this file.
/// See `analysis/allocation-divergence.md`.
contract AllocationAgreementTest is Test {
    PUSD pusd;
    PriorityVault vault;

    address obligor = makeAddr("obligor");
    bytes32 constant COL = keccak256("agreement-collateral");
    uint256 constant D = 1e6;

    address[4] financiers = [
        makeAddr("senior-winner"),
        makeAddr("senior-loser"),
        makeAddr("junior"),
        makeAddr("subordinate")
    ];

    function setUp() public {
        pusd = new PUSD();
        vault = new PriorityVault(pusd);
        for (uint256 i = 0; i < financiers.length; ++i) {
            pusd.mintDollars(financiers[i], 100_000);
            vm.prank(financiers[i]);
            pusd.approve(address(vault), type(uint256).max);
        }
        vm.prank(obligor);
        vault.registerCollateral(COL);
    }

    function _lock(address who, PriorityVault.Tranche t, uint256 dollars) internal {
        _lock(who, t, dollars, false);
    }

    function _lock(address who, PriorityVault.Tranche t, uint256 dollars, bool allowDemotion) internal {
        vm.prank(who);
        vault.lock(COL, t, dollars * D, allowDemotion);
    }

    /// @dev The exact shape of the live race that exposed the divergence: two rivals for SENIOR,
    /// then one bid each for JUNIOR and SUBORDINATE, against caps 5,100 / 2,550 / 850.
    function test_vaultAllocationMatchesTheEngineOnTheRaceThatBrokeIt() public {
        uint256[3] memory caps = [5_100 * D, 2_550 * D, 850 * D];
        vm.prank(obligor);
        vault.openRace(COL, 8_500 * D, caps, 10 minutes);

        _lock(financiers[0], PriorityVault.Tranche.SENIOR, 5_100);
        _lock(financiers[1], PriorityVault.Tranche.SENIOR, 5_100); // outpaced in its own tranche
        _lock(financiers[2], PriorityVault.Tranche.JUNIOR, 2_550);
        _lock(financiers[3], PriorityVault.Tranche.SUBORDINATE, 850);

        // ── the engine's answer, from the same locks in the same order ──
        T.VerifiedLock[] memory locks = new T.VerifiedLock[](4);
        T.Tranche[4] memory declared = [T.Tranche.SENIOR, T.Tranche.SENIOR, T.Tranche.JUNIOR, T.Tranche.SUBORDINATE];
        uint256[4] memory amounts = [5_100 * D, 5_100 * D, 2_550 * D, 850 * D];
        for (uint64 i = 0; i < 4; ++i) {
            locks[i] = T.VerifiedLock({
                financier: financiers[i],
                tranche: declared[i],
                amount: amounts[i],
                token: address(pusd),
                emittedBy: address(vault),
                height: 100 + i,
                txIndex: i,
                seq: i + 1,
                raceNonce: 1,
                receiptStatus: 1,
                allowDemotion: false
            });
        }
        (AllocationLib.Award[] memory awards,) = AllocationLib.allocate(locks,
            T.TrancheSizing({senior: caps[0], junior: caps[1], subordinate: caps[2]}));

        // ── compare, lock by lock ──
        for (uint256 i = 0; i < 4; ++i) {
            uint256 fromEngine;
            for (uint256 a = 0; a < awards.length; ++a) {
                if (awards[a].financier == financiers[i]) fromEngine += awards[a].amount;
            }
            assertEq(
                vault.allocatedAmount(COL, i),
                fromEngine,
                "vault and engine must allocate the same amount to the same lock"
            );
        }

        // And the concrete outcome, so a regression names itself rather than only failing a loop.
        assertEq(vault.allocatedAmount(COL, 0), 5_100 * D, "first SENIOR takes the cap");
        assertEq(vault.allocatedAmount(COL, 1), 0, "second SENIOR is refunded, never demoted");
        assertEq(vault.allocatedAmount(COL, 2), 2_550 * D, "JUNIOR is unaffected by SENIOR contention");
        assertEq(vault.allocatedAmount(COL, 3), 850 * D, "SUBORDINATE likewise");
    }

    /// @dev A partially-filled tranche is where an off-by-one between the two rules would hide.
    function test_vaultAndEngineAgreeOnAPartialFill() public {
        uint256[3] memory caps = [5_000 * D, 3_000 * D, 2_000 * D];
        vm.prank(obligor);
        vault.openRace(COL, 10_000 * D, caps, 10 minutes);

        _lock(financiers[0], PriorityVault.Tranche.JUNIOR, 1_000); // partial fill of JUNIOR
        _lock(financiers[1], PriorityVault.Tranche.JUNIOR, 4_000); // 2,000 fits, 2,000 refundable
        _lock(financiers[2], PriorityVault.Tranche.SENIOR, 6_000); // 5,000 fits, 1,000 refundable

        T.VerifiedLock[] memory locks = new T.VerifiedLock[](3);
        T.Tranche[3] memory declared = [T.Tranche.JUNIOR, T.Tranche.JUNIOR, T.Tranche.SENIOR];
        uint256[3] memory amounts = [1_000 * D, 4_000 * D, 6_000 * D];
        for (uint64 i = 0; i < 3; ++i) {
            locks[i] = T.VerifiedLock({
                financier: financiers[i],
                tranche: declared[i],
                amount: amounts[i],
                token: address(pusd),
                emittedBy: address(vault),
                height: 200 + i,
                txIndex: i,
                seq: i + 1,
                raceNonce: 1,
                receiptStatus: 1,
                allowDemotion: false
            });
        }
        (AllocationLib.Award[] memory awards,) = AllocationLib.allocate(locks,
            T.TrancheSizing({senior: caps[0], junior: caps[1], subordinate: caps[2]}));

        for (uint256 i = 0; i < 3; ++i) {
            uint256 fromEngine;
            for (uint256 a = 0; a < awards.length; ++a) {
                if (awards[a].financier == financiers[i]) fromEngine += awards[a].amount;
            }
            assertEq(vault.allocatedAmount(COL, i), fromEngine, "partial fills must agree too");
        }
        assertEq(vault.allocatedAmount(COL, 1), 2_000 * D, "second JUNIOR takes only the remaining cap");
        assertEq(vault.allocatedAmount(COL, 2), 5_000 * D, "SENIOR fills to its own cap");
    }

    /// @dev Total drawable must equal what the engine actually awarded. If the vault let the
    /// obligor draw more than the engine allocated, the surplus would come out of capital that
    /// belongs to a refunded financier.
    function test_drawableNeverExceedsWhatTheEngineAwarded() public {
        uint256[3] memory caps = [5_100 * D, 2_550 * D, 850 * D];
        vm.prank(obligor);
        vault.openRace(COL, 8_500 * D, caps, 10 minutes);

        // Under-subscribed on purpose: SENIOR short, nothing SUBORDINATE.
        _lock(financiers[0], PriorityVault.Tranche.SENIOR, 3_000);
        _lock(financiers[2], PriorityVault.Tranche.JUNIOR, 2_550);

        vm.prank(obligor);
        vault.closeRace(COL);

        assertEq(vault.totalAllocated(COL), 5_550 * D, "only what arrived, not the facility size");

        vm.prank(obligor);
        vm.expectRevert(PriorityVault.OverDraw.selector);
        vault.draw(COL, 5_551 * D);

        vm.prank(obligor);
        vault.draw(COL, 5_550 * D); // exactly the allocation is fine
        assertEq(pusd.balanceOf(obligor), 5_550 * D);
    }

    /// @dev Consent travels with the lock, so the vault and the engine honour the SAME opt-in.
    /// Before consent moved onto the lock, the vault could not honour it at all — it had no idea
    /// who had agreed to what — so a demoted financier's refundable balance was wrong by
    /// construction.
    function test_vaultAndEngineAgreeWhenAFinancierOptedIntoDemotion() public {
        uint256[3] memory caps = [5_100 * D, 2_550 * D, 850 * D];
        vm.prank(obligor);
        vault.openRace(COL, 8_500 * D, caps, 10 minutes);

        _lock(financiers[0], PriorityVault.Tranche.SENIOR, 5_100); // fills SENIOR
        _lock(financiers[1], PriorityVault.Tranche.SENIOR, 4_000, true); // opted in: cascades down

        T.VerifiedLock[] memory locks = new T.VerifiedLock[](2);
        uint256[2] memory amounts = [5_100 * D, 4_000 * D];
        bool[2] memory consent = [false, true];
        for (uint64 i = 0; i < 2; ++i) {
            locks[i] = T.VerifiedLock({
                financier: financiers[i],
                tranche: T.Tranche.SENIOR,
                amount: amounts[i],
                token: address(pusd),
                emittedBy: address(vault),
                height: 300 + i,
                txIndex: i,
                seq: i + 1,
                raceNonce: 1,
                receiptStatus: 1,
                allowDemotion: consent[i]
            });
        }
        (AllocationLib.Award[] memory awards,) = AllocationLib.allocate(
            locks, T.TrancheSizing({senior: caps[0], junior: caps[1], subordinate: caps[2]})
        );

        for (uint256 i = 0; i < 2; ++i) {
            uint256 fromEngine;
            for (uint256 a = 0; a < awards.length; ++a) {
                if (awards[a].financier == financiers[i]) fromEngine += awards[a].amount;
            }
            assertEq(vault.allocatedAmount(COL, i), fromEngine, "demotion must be honoured identically");
        }
        // 2,550 junior + 850 subordinate = 3,400 seated; 600 of the 4,000 comes back.
        assertEq(vault.allocatedAmount(COL, 1), 3_400 * D, "cascaded into both lower tranches");
    }

    /// @dev The point of moving consent onto the lock: a financier who did NOT opt in is refunded
    /// rather than demoted, and no third party can change that after the fact.
    function test_withoutConsentTheOverflowIsRefundedNotDemoted() public {
        uint256[3] memory caps = [5_100 * D, 2_550 * D, 850 * D];
        vm.prank(obligor);
        vault.openRace(COL, 8_500 * D, caps, 10 minutes);

        _lock(financiers[0], PriorityVault.Tranche.SENIOR, 5_100);
        _lock(financiers[1], PriorityVault.Tranche.SENIOR, 4_000); // no consent

        assertEq(vault.allocatedAmount(COL, 1), 0, "not seated anywhere it did not agree to");

        vm.prank(obligor);
        vault.closeRace(COL);

        uint256 before = pusd.balanceOf(financiers[1]);
        vm.prank(financiers[1]);
        vault.refund(COL, 1);
        assertEq(pusd.balanceOf(financiers[1]) - before, 4_000 * D, "the whole bid comes back");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PrecedenceTypes as T} from "./PrecedenceTypes.sol";
import {AllocationLib as A} from "./AllocationLib.sol";
import {CollateralRegistry} from "./CollateralRegistry.sol";
import {ClaimToken} from "./ClaimToken.sol";
import {PriorityEngine} from "./PriorityEngine.sol";

/// @title RefinanceEngine — atomic priority transfer (Creditcoin CC3)
///
/// @notice Replacing expensive financing with cheaper financing normally means discharging the old
/// lien, filing a new one, and negotiating an inter-creditor transfer — days to weeks, during which
/// the collateral is briefly unencumbered and the double-pledge risk this protocol exists to
/// eliminate comes straight back.
///
/// Here it is one state transition.
///
/// @dev **The invariant is the whole point:** the collateral is never simultaneously unencumbered
/// and re-encumberable. The old claim burns and the new claim mints inside a single call, so there
/// is no block, and no intermediate state, in which a third party could file against clear title.
/// That is not a performance optimisation — it closes the exact window the legal process leaves
/// open.
///
/// Both sides are proof-gated. `AttestationGate` verifies the old loan's repayability AND the new
/// lock's validity before calling in, so a refinance cannot be executed against an asserted
/// repayment or an unproven replacement lock.
contract RefinanceEngine {
    CollateralRegistry public immutable registry;
    ClaimToken public immutable claims;
    PriorityEngine public immutable engine;
    address public immutable attestationGate;

    uint256 public constant REFINANCE_FEE_BPS = 15;

    struct Refinance {
        bytes32 collateralId;
        address oldFinancier;
        address newFinancier;
        T.Tranche tranche;
        uint256 amount;
        uint16 oldRateBps;
        uint16 newRateBps;
        uint64 executedAt;
        /// @dev The proven position of the replacement lock. The new claim inherits priority from
        /// the tranche it takes over, but records where its own capital actually landed.
        uint64 newHeight;
        uint64 newTxIndex;
    }

    mapping(bytes32 => Refinance[]) private _history;

    event RefinanceExecuted(
        bytes32 indexed collateralId,
        address indexed oldFinancier,
        address indexed newFinancier,
        T.Tranche tranche,
        uint256 amount,
        uint16 oldRateBps,
        uint16 newRateBps,
        uint256 annualSavings
    );

    error NotGate();
    error NoSuchPosition(bytes32 collateralId, T.Tranche tranche);
    error NotAnImprovement(uint16 oldRateBps, uint16 newRateBps);
    error AmountMismatch(uint256 held, uint256 offered);

    constructor(CollateralRegistry registry_, ClaimToken claims_, PriorityEngine engine_, address gate) {
        registry = registry_;
        claims = claims_;
        engine = engine_;
        attestationGate = gate;
    }

    modifier onlyGate() {
        if (msg.sender != attestationGate) revert NotGate();
        _;
    }

    /// @notice Execute a refinance atomically: release the old lien and create the new one.
    ///
    /// @dev Called only by `AttestationGate`, and only after BOTH proofs verify. The ordering of
    /// operations inside this function is deliberate — burn then mint, with no external call
    /// between them — so no reentrancy could observe the collateral as unencumbered.
    function executeAtomic(
        bytes32 collateralId,
        T.Tranche tranche,
        address oldFinancier,
        address newFinancier,
        uint256 amount,
        uint16 oldRateBps,
        uint16 newRateBps,
        uint64 newHeight,
        uint64 newTxIndex
    ) external onlyGate {
        // Refinancing into a WORSE rate is not a refinance. Without this check the mechanism could
        // be used to churn a position for the fee rather than to improve the obligor's terms.
        if (newRateBps >= oldRateBps) revert NotAnImprovement(oldRateBps, newRateBps);

        uint256 id = claims.claimId(collateralId, tranche);
        uint256 held = claims.balanceOf(oldFinancier, id);
        if (held == 0) revert NoSuchPosition(collateralId, tranche);
        if (held != amount) revert AmountMismatch(held, amount);

        // ── the atomic pair ──
        claims.burnClaim(oldFinancier, collateralId, tranche, amount);
        claims.mintClaim(newFinancier, collateralId, tranche, amount, newHeight, newTxIndex, 0);
        // No gap. At no point between these two lines is the collateral re-encumberable.

        uint256 annualSavings = (amount * (oldRateBps - newRateBps)) / 10_000;

        _history[collateralId].push(
            Refinance({
                collateralId: collateralId,
                oldFinancier: oldFinancier,
                newFinancier: newFinancier,
                tranche: tranche,
                amount: amount,
                oldRateBps: oldRateBps,
                newRateBps: newRateBps,
                executedAt: uint64(block.timestamp),
                newHeight: newHeight,
                newTxIndex: newTxIndex
            })
        );

        emit RefinanceExecuted(
            collateralId, oldFinancier, newFinancier, tranche, amount, oldRateBps, newRateBps, annualSavings
        );
    }

    function historyOf(bytes32 collateralId) external view returns (Refinance[] memory) {
        return _history[collateralId];
    }

    function refinanceCount(bytes32 collateralId) external view returns (uint256) {
        return _history[collateralId].length;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PrecedenceTypes as T} from "./PrecedenceTypes.sol";
import {AllocationLib as A} from "./AllocationLib.sol";
import {CollateralRegistry} from "./CollateralRegistry.sol";
import {ClaimToken} from "./ClaimToken.sol";

/// @title PriorityEngine — settlement, servicing, and the deterministic unwind (Creditcoin CC3)
///
/// @notice Priority settles here from proven ordering, claims mint, and — when a facility fails —
/// the unwind runs as a sequence of PERMISSIONLESS keeper pokes.
///
/// @dev The keeper design is the part worth defending. If a monitoring agent had to be alive for
/// lenders to be protected, the honest answer to "what happens when it is not?" would be "capital
/// stays stuck", and that is a worse answer than having no monitor at all. So every distressed
/// transition is:
///
///   * callable by ANYONE — no role, no allowlist, no privileged keeper,
///   * gated only on a block timestamp or an absent proof, so the condition is objective,
///   * and paid a bounty from the fee pool — but it still SUCCEEDS when the pool is empty.
///
/// That last point matters more than it looks. If the poke reverted on an empty pool, lender
/// protection would silently depend on treasury solvency. It does not.
contract PriorityEngine is Ownable, ReentrancyGuard {
    // ─────────────────────────────── parameters ───────────────────────────────

    uint256 public constant PCR_THRESHOLD_BPS = 11_000; // 110% coverage required
    uint256 public constant PCR_WINDOW = 48 hours;
    uint256 public constant GRACE_PERIOD = 7 days;
    uint256 public constant AUCTION_START_BPS = 11_500; // opens at 115% of principal
    uint256 public constant AUCTION_FLOOR_BPS = 5_500; // decays to 55%
    uint256 public constant AUCTION_DECAY_BPS_PER_BLOCK = 12;
    uint256 public constant KEEPER_BOUNTY = 0.5 ether; // CTC; CC3 gas is ~0.5 gwei

    uint256 public protocolFeeBps = 25;
    uint256 public proverFeeBps = 5;
    /// @dev Coupons by rank: SENIOR 5.2% · JUNIOR 7.8% · SUBORDINATE 11.5%. Senior is cheapest
    /// precisely because it is paid first.
    uint256[3] public rateBps = [520, 780, 1150];

    // ─────────────────────────────── state ───────────────────────────────

    struct Facility {
        bool exists;
        uint64 settledAt;
        uint64 maturity;
        uint64 graceExpiry;
        uint64 pcrWindowExpiry;
        uint64 auctionStartBlock;
        uint256 principal;
        uint256 provenRepaid;
        uint256 auctionProceeds;
        uint256 topUpPosted;
        T.EncumbranceState state;
        bool drawn;
    }

    CollateralRegistry public immutable registry;
    ClaimToken public immutable claims;
    address public attestationGate;
    address public refinanceEngine;

    mapping(bytes32 => Facility) public facility;
    mapping(bytes32 => A.Award[]) private _stack;
    mapping(bytes32 => A.Refund[]) private _refunds;
    mapping(bytes32 => A.WaterfallLine[]) private _waterfall;
    /// @dev Permanent, cross-round. An obligor's default follows them.
    mapping(address => bool) public hasDefaulted;

    uint256 public bountyPool;

    // ─────────────────────────────── events ───────────────────────────────

    /// @dev One event per awarded position, carrying the PROVEN source position that won it.
    /// This is the judge-verifiable record: `(height, txIndex)` here must match what the
    /// precompile's own `TransactionVerified` event reported for the same transaction.
    event ClaimAwarded(
        bytes32 indexed collateralId,
        address indexed financier,
        uint8 rank,
        T.Tranche tranche,
        uint256 amount,
        uint64 height,
        uint64 txIndex,
        uint64 seq
    );
    event PrioritySettled(
        bytes32 indexed collateralId, uint256 awardCount, uint256 principal, uint256 refundCount
    );
    event DoublePledgePrevented(bytes32 indexed collateralId, address blockedFinancier, uint256 refundedAmount);
    event CapitalDrawn(bytes32 indexed collateralId, uint256 amount);
    event LienReleased(bytes32 indexed collateralId, uint256 provenRepaid, uint256 distributed);
    event WaterfallPaid(
        bytes32 indexed collateralId, address indexed holder, uint8 rank, uint256 payout, uint256 loss
    );

    event DrawFrozen(bytes32 indexed collateralId, string reason, address keeper, uint256 bounty);
    event PcrStabilizationOpened(
        bytes32 indexed collateralId, uint256 pcrBps, uint256 shortfall, uint64 windowExpiry, address keeper
    );
    event PcrCured(bytes32 indexed collateralId, uint256 topUpPosted);
    event GracePeriodOpened(bytes32 indexed collateralId, uint256 cureAmount, uint64 expiry, address keeper);
    event DutchAuctionOpened(
        bytes32 indexed collateralId, uint256 startPrice, uint256 floorPrice, uint64 startBlock, address keeper
    );
    event DutchAuctionCleared(bytes32 indexed collateralId, address winner, uint256 clearingPrice);
    event TerminatedDefault(
        bytes32 indexed collateralId, address indexed obligor, uint256 proceeds, uint256 totalLoss
    );
    event Breached(bytes32 indexed collateralId, string detail, uint32 claimsFrozen, address reporter);
    event BountyPaid(address indexed keeper, uint256 amount, string fn);
    event BountyPoolFunded(address indexed from, uint256 amount);

    error NotGate();
    error NotAuthorized();
    error UnknownFacility();
    error WrongState(T.EncumbranceState actual);
    error GateNotOpen(string gate);
    error AuctionNotOpen();
    error InsufficientBid(uint256 sent, uint256 required);
    error SeniorityViolated();

    constructor(address initialOwner, CollateralRegistry registry_, ClaimToken claims_) Ownable(initialOwner) {
        registry = registry_;
        claims = claims_;
    }

    modifier onlyGate() {
        if (msg.sender != attestationGate) revert NotGate();
        _;
    }

    function setAttestationGate(address gate) external onlyOwner {
        attestationGate = gate;
    }

    function setRefinanceEngine(address engine) external onlyOwner {
        refinanceEngine = engine;
    }

    function fundBountyPool() external payable {
        bountyPool += msg.value;
        emit BountyPoolFunded(msg.sender, msg.value);
    }

    /// @dev Pays a bounty if the pool can afford it, and is a no-op if it cannot. Never reverts —
    /// see the contract-level note on why protection must not depend on treasury solvency.
    function _payBounty(string memory fn) private returns (uint256 paid) {
        if (bountyPool >= KEEPER_BOUNTY) {
            bountyPool -= KEEPER_BOUNTY;
            paid = KEEPER_BOUNTY;
            (bool ok,) = payable(msg.sender).call{value: paid}("");
            if (!ok) {
                // Refusing the bounty must not block the unwind.
                bountyPool += paid;
                paid = 0;
            } else {
                emit BountyPaid(msg.sender, paid, fn);
            }
        }
    }

    // ═══════════════════════════ settlement ═══════════════════════════

    /// @notice Settle priority from a validated, proven-ordered lock set.
    /// @dev Only `AttestationGate` may call this: the locks must have come from verified proofs
    /// bound to the registered vault, in proven order, with completeness checked.
    function settlePriority(
        bytes32 collateralId,
        T.VerifiedLock[] calldata locks,
        bool[] calldata allowDemotion,
        uint256 requested
    ) external onlyGate {
        (T.TrancheSizing memory sizing,) = registry.facilitySizing(collateralId, requested);
        (A.Award[] memory awards, A.Refund[] memory refunds) = A.allocate(locks, sizing, allowDemotion);

        delete _stack[collateralId];
        delete _refunds[collateralId];

        uint256 principal;
        for (uint256 i = 0; i < awards.length; ++i) {
            A.Award memory a = awards[i];
            _stack[collateralId].push(a);
            principal += a.amount;

            claims.mintClaim(a.financier, collateralId, a.tranche, a.amount, a.height, a.txIndex, a.seq);

            emit ClaimAwarded(
                collateralId, a.financier, a.rank, a.tranche, a.amount, a.height, a.txIndex, a.seq
            );
        }

        for (uint256 i = 0; i < refunds.length; ++i) {
            _refunds[collateralId].push(refunds[i]);
            // The Tricolor case, inverted: the second claim on this collateral cannot be created.
            emit DoublePledgePrevented(collateralId, refunds[i].financier, refunds[i].amount);
        }

        _openFacility(collateralId, principal);

        registry.setState(collateralId, T.EncumbranceState.PRIORITY_SETTLED);
        registry.setActiveLiens(collateralId, uint32(awards.length));

        emit PrioritySettled(collateralId, awards.length, principal, refunds.length);
    }

    /// @dev Split out of `settlePriority` to keep that function's stack shallow.
    function _openFacility(bytes32 collateralId, uint256 principal) private {
        CollateralRegistry.Collateral memory c = registry.getCollateral(collateralId);
        facility[collateralId] = Facility({
            exists: true,
            settledAt: uint64(block.timestamp),
            maturity: uint64(block.timestamp + uint256(c.termDays) * 1 days),
            graceExpiry: 0,
            pcrWindowExpiry: 0,
            auctionStartBlock: 0,
            principal: principal,
            provenRepaid: 0,
            auctionProceeds: 0,
            topUpPosted: 0,
            state: T.EncumbranceState.PRIORITY_SETTLED,
            drawn: false
        });
    }

    /// @notice Mark the facility drawn and encumbered.
    /// @dev Proof-gated: the draw happened on the source chain and was verified.
    function markDrawn(bytes32 collateralId, uint256 amount) external onlyGate {
        Facility storage f = facility[collateralId];
        if (!f.exists) revert UnknownFacility();
        f.drawn = true;
        f.state = T.EncumbranceState.ENCUMBERED;
        registry.setState(collateralId, T.EncumbranceState.ENCUMBERED);
        emit CapitalDrawn(collateralId, amount);
    }

    // ═══════════════════════════ performing settlement ═══════════════════════════

    /// @notice Release the lien against a PROVEN repayment amount and pay the waterfall.
    /// @dev `provenRepaid` is decoded from the verified source transaction — not asserted by an
    /// oracle, and not supplied by the obligor.
    function releaseLien(bytes32 collateralId, uint256 provenRepaid) external onlyGate {
        Facility storage f = facility[collateralId];
        if (!f.exists) revert UnknownFacility();

        f.provenRepaid = provenRepaid;
        CollateralRegistry.Collateral memory c = registry.getCollateral(collateralId);

        uint256 distributed = _runWaterfall(collateralId, provenRepaid, c.termDays, false);

        _burnAllClaims(collateralId);
        f.state = T.EncumbranceState.REPAID;
        registry.setState(collateralId, T.EncumbranceState.REPAID);
        registry.setActiveLiens(collateralId, 0);

        emit LienReleased(collateralId, provenRepaid, distributed);
    }

    function _runWaterfall(bytes32 collateralId, uint256 realised, uint32 termDays, bool liquidation)
        private
        returns (uint256 distributed)
    {
        A.Award[] memory awards = _stack[collateralId];
        (A.WaterfallLine[] memory lines,,, ) =
            A.waterfall(awards, realised, protocolFeeBps, proverFeeBps, termDays, rateBps, liquidation);

        // If seniority was violated the protocol's central claim is false for this settlement.
        // Cheap to check, so check it rather than trust the library.
        if (!A.seniorityRespected(lines)) revert SeniorityViolated();

        delete _waterfall[collateralId];
        for (uint256 i = 0; i < lines.length; ++i) {
            _waterfall[collateralId].push(lines[i]);
            distributed += lines[i].payout;
            emit WaterfallPaid(collateralId, lines[i].holder, lines[i].rank, lines[i].payout, lines[i].loss);
        }
    }

    function _burnAllClaims(bytes32 collateralId) private {
        A.Award[] memory awards = _stack[collateralId];
        for (uint256 i = 0; i < awards.length; ++i) {
            claims.burnAll(awards[i].financier, collateralId, awards[i].tranche);
        }
    }

    // ═══════════════════════════ the failure branch ═══════════════════════════
    // Every function below is permissionless and gated only on objective conditions.

    /// @notice Principal Coverage Ratio in bps: haircut-adjusted collateral value / principal.
    function pcrBps(bytes32 collateralId) public view returns (uint256) {
        Facility storage f = facility[collateralId];
        if (f.principal == 0) return type(uint256).max;
        CollateralRegistry.Collateral memory c = registry.getCollateral(collateralId);
        uint256 adjusted = (c.faceValue * (10_000 - c.haircutBps)) / 10_000 + f.topUpPosted;
        return (adjusted * 10_000) / f.principal;
    }

    /// @notice FROZEN_DRAW — anyone may freeze draws once coverage breaks or maturity passes.
    function pokeFreezeDraw(bytes32 collateralId) external nonReentrant {
        Facility storage f = facility[collateralId];
        if (!f.exists) revert UnknownFacility();
        if (f.state != T.EncumbranceState.ENCUMBERED && f.state != T.EncumbranceState.PRIORITY_SETTLED) {
            revert WrongState(f.state);
        }

        bool underCovered = pcrBps(collateralId) < PCR_THRESHOLD_BPS;
        bool matured = block.timestamp >= f.maturity && f.provenRepaid == 0;
        if (!underCovered && !matured) revert GateNotOpen("pcr >= threshold and not matured");

        f.state = T.EncumbranceState.FROZEN;
        registry.setState(collateralId, T.EncumbranceState.FROZEN);

        uint256 paid = _payBounty("pokeFreezeDraw");
        emit DrawFrozen(collateralId, underCovered ? "coverage below threshold" : "matured unpaid", msg.sender, paid);
    }

    /// @notice PCR_STABILIZATION — open the top-up window.
    function pokePcrStabilization(bytes32 collateralId) external nonReentrant {
        Facility storage f = facility[collateralId];
        if (!f.exists) revert UnknownFacility();
        if (f.state != T.EncumbranceState.FROZEN) revert WrongState(f.state);

        uint256 pcr = pcrBps(collateralId);
        CollateralRegistry.Collateral memory c = registry.getCollateral(collateralId);
        uint256 required = (f.principal * PCR_THRESHOLD_BPS) / 10_000;
        uint256 adjusted = (c.faceValue * (10_000 - c.haircutBps)) / 10_000 + f.topUpPosted;
        uint256 shortfall = required > adjusted ? required - adjusted : 0;

        f.pcrWindowExpiry = uint64(block.timestamp + PCR_WINDOW);
        _payBounty("pokePcrStabilization");
        emit PcrStabilizationOpened(collateralId, pcr, shortfall, f.pcrWindowExpiry, msg.sender);
    }

    /// @notice The obligor cures coverage by posting additional value.
    function postTopUp(bytes32 collateralId) external payable nonReentrant {
        Facility storage f = facility[collateralId];
        if (!f.exists) revert UnknownFacility();
        f.topUpPosted += msg.value;

        if (pcrBps(collateralId) >= PCR_THRESHOLD_BPS) {
            f.state = T.EncumbranceState.ENCUMBERED;
            registry.setState(collateralId, T.EncumbranceState.ENCUMBERED);
            emit PcrCured(collateralId, f.topUpPosted);
        }
    }

    /// @notice GRACE_PERIOD — open the cure window. Gated on the ABSENCE of a repayment proof,
    /// which is an objective fact rather than anyone's judgement.
    function pokeGracePeriod(bytes32 collateralId) external nonReentrant {
        Facility storage f = facility[collateralId];
        if (!f.exists) revert UnknownFacility();
        if (f.state != T.EncumbranceState.FROZEN) revert WrongState(f.state);
        if (f.pcrWindowExpiry != 0 && block.timestamp < f.pcrWindowExpiry) {
            revert GateNotOpen("pcr window still open");
        }
        if (f.provenRepaid >= f.principal) revert GateNotOpen("already repaid");

        f.graceExpiry = uint64(block.timestamp + GRACE_PERIOD);
        f.state = T.EncumbranceState.GRACE;
        registry.setState(collateralId, T.EncumbranceState.GRACE);

        _payBounty("pokeGracePeriod");
        emit GracePeriodOpened(collateralId, f.principal, f.graceExpiry, msg.sender);
    }

    /// @notice DUTCH_LIQUIDATION — open the descending auction after the cure window lapses.
    function pokeDutchLiquidation(bytes32 collateralId) external nonReentrant {
        Facility storage f = facility[collateralId];
        if (!f.exists) revert UnknownFacility();
        if (f.state != T.EncumbranceState.GRACE && f.state != T.EncumbranceState.BREACHED) {
            revert WrongState(f.state);
        }
        // A proven breach skips the cure window: the collateral has already moved.
        if (f.state == T.EncumbranceState.GRACE && block.timestamp < f.graceExpiry) {
            revert GateNotOpen("grace period still open");
        }

        f.auctionStartBlock = uint64(block.number);
        f.state = T.EncumbranceState.DUTCH_LIQUIDATION;
        registry.setState(collateralId, T.EncumbranceState.DUTCH_LIQUIDATION);

        _payBounty("pokeDutchLiquidation");
        emit DutchAuctionOpened(
            collateralId, auctionStartPrice(collateralId), auctionFloorPrice(collateralId), f.auctionStartBlock, msg.sender
        );
    }

    function auctionStartPrice(bytes32 collateralId) public view returns (uint256) {
        return (facility[collateralId].principal * AUCTION_START_BPS) / 10_000;
    }

    function auctionFloorPrice(bytes32 collateralId) public view returns (uint256) {
        return (facility[collateralId].principal * AUCTION_FLOOR_BPS) / 10_000;
    }

    /// @notice Current auction price — a deterministic function of elapsed blocks. Nobody sets it.
    function auctionPrice(bytes32 collateralId) public view returns (uint256) {
        Facility storage f = facility[collateralId];
        if (f.auctionStartBlock == 0) return 0;

        uint256 start = auctionStartPrice(collateralId);
        uint256 floor = auctionFloorPrice(collateralId);
        uint256 elapsed = block.number - f.auctionStartBlock;
        uint256 decayBps = elapsed * AUCTION_DECAY_BPS_PER_BLOCK;
        if (decayBps >= 10_000) return floor;

        uint256 price = (start * (10_000 - decayBps)) / 10_000;
        return price < floor ? floor : price;
    }

    /// @notice Buy the collateral at the current decayed price.
    function bidLiquidation(bytes32 collateralId) external payable nonReentrant {
        Facility storage f = facility[collateralId];
        if (f.state != T.EncumbranceState.DUTCH_LIQUIDATION) revert AuctionNotOpen();

        uint256 price = auctionPrice(collateralId);
        if (msg.value < price) revert InsufficientBid(msg.value, price);

        f.auctionProceeds = msg.value;
        emit DutchAuctionCleared(collateralId, msg.sender, price);
    }

    /// @notice TERMINATED_DEFAULT — distribute recovery by strict seniority and flag the obligor.
    function pokeTerminateDefault(bytes32 collateralId) external nonReentrant {
        Facility storage f = facility[collateralId];
        if (!f.exists) revert UnknownFacility();
        if (f.state != T.EncumbranceState.DUTCH_LIQUIDATION) revert WrongState(f.state);
        if (f.auctionProceeds == 0) revert GateNotOpen("auction has not cleared");

        CollateralRegistry.Collateral memory c = registry.getCollateral(collateralId);
        // Liquidation recovers principal only — nobody earns a coupon on a default.
        _runWaterfall(collateralId, f.auctionProceeds + f.topUpPosted, c.termDays, true);

        uint256 totalLoss;
        A.WaterfallLine[] memory lines = _waterfall[collateralId];
        for (uint256 i = 0; i < lines.length; ++i) {
            totalLoss += lines[i].loss;
        }

        _burnAllClaims(collateralId);
        f.state = T.EncumbranceState.DEFAULTED;
        registry.setState(collateralId, T.EncumbranceState.DEFAULTED);
        registry.setActiveLiens(collateralId, 0);

        // Permanent and cross-round. Defaulting must cost more than repaying, forever.
        hasDefaulted[c.obligor] = true;

        _payBounty("pokeTerminateDefault");
        emit TerminatedDefault(collateralId, c.obligor, f.auctionProceeds, totalLoss);
    }

    /// @notice BREACHED — proven collateral movement. Freezes claims and skips to liquidation.
    /// @dev Deliberately gate-only: a breach is an assertion about the physical world, which no
    /// proof of source-chain ordering can establish. We prevent double-FINANCING of a registered
    /// claim; we cannot detect a custodian issuing two receipts for one lot.
    function reportBreach(bytes32 collateralId, string calldata detail) external onlyGate {
        Facility storage f = facility[collateralId];
        if (!f.exists) revert UnknownFacility();

        f.state = T.EncumbranceState.BREACHED;
        registry.setState(collateralId, T.EncumbranceState.BREACHED);

        emit Breached(collateralId, detail, uint32(_stack[collateralId].length), msg.sender);
    }

    // ═══════════════════════════ views ═══════════════════════════

    function priorityStack(bytes32 collateralId) external view returns (A.Award[] memory) {
        return _stack[collateralId];
    }

    function refundsOf(bytes32 collateralId) external view returns (A.Refund[] memory) {
        return _refunds[collateralId];
    }

    function waterfallOf(bytes32 collateralId) external view returns (A.WaterfallLine[] memory) {
        return _waterfall[collateralId];
    }

    function getPriorityState(bytes32 collateralId)
        external
        view
        returns (T.EncumbranceState state, address senior, address junior, uint256 principal)
    {
        Facility storage f = facility[collateralId];
        A.Award[] memory s = _stack[collateralId];
        for (uint256 i = 0; i < s.length; ++i) {
            if (s[i].rank == 1 && senior == address(0)) senior = s[i].financier;
            if (s[i].rank == 2 && junior == address(0)) junior = s[i].financier;
        }
        return (f.state, senior, junior, f.principal);
    }

    receive() external payable {
        bountyPool += msg.value;
        emit BountyPoolFunded(msg.sender, msg.value);
    }
}

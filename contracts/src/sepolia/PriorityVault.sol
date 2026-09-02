// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PriorityVault — the PRECEDENCE source-chain contract (Ethereum Sepolia, chainKey 1)
///
/// @notice Competing financiers escrow pUSD against registered collateral. Each `lock()` is a real
/// transaction at a real position in a real block, and that position — proven later by the
/// Attestcoin precompile on Creditcoin — is what settles priority.
///
/// @dev Three design decisions here are load-bearing and worth stating plainly.
///
/// 1. **`raceNonce` + per-race `seq`.** Every race gets a nonce, and locks within it are numbered
///    from 1. `AttestationGate` on Creditcoin requires the proofs it is handed to share one
///    `raceNonce` and to run contiguously from `seq == 1`. That makes it impossible for a prover to
///    omit a lock in order to promote a friend: omitting a middle lock leaves a gap, and omitting
///    the first lock breaks the "starts at 1" requirement. Only tail truncation survives, and a
///    truncated tail omits later — more junior — locks, whose holders can submit their own proof.
///
/// 2. **`seq` is a claim; `(height, txIndex)` is a proof.** `seq` is assigned in execution order, so
///    it *should* agree with the canonical block position. But it is this contract's own assertion,
///    whereas `txIndex` is derived by the precompile from the transaction trie and cannot be forged.
///    Priority therefore derives from the proven pair; `seq` exists so the gate can check the two
///    agree and reject a vault that is lying about its own ordering.
///
/// 3. **No cross-chain writes.** Attestcoin readability is one-directional: Creditcoin can prove
///    facts about Sepolia, not the reverse. So this contract never waits to be told who won. It
///    applies the same deterministic rule Creditcoin applies — locks fill the facility in `seq`
///    order — which means both chains agree on the allocated SET without a message, and Creditcoin
///    additionally assigns tranches within that set using the proven ordering. Anything else would
///    need an oracle, which is precisely what this protocol exists to avoid.
contract PriorityVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Tranche {
        SENIOR,
        JUNIOR,
        SUBORDINATE
    }

    struct Lock {
        address financier;
        Tranche tranche;
        uint256 amount;
        uint256 refunded;
        uint64 raceNonce;
        uint64 seq;
        uint64 blockNumber;
    }

    struct Collateral {
        address obligor;
        bool registered;
        // race state
        bool raceOpen;
        uint64 raceNonce;
        uint64 lockCount; // locks in the CURRENT race; also the seq high-water mark
        uint256 facilitySize; // how much the obligor asked for
        uint256 raceDeadline; // after this anyone may close the race
        uint256 drawDeadline; // set on close; after this an undrawn facility is abandoned
        // accounting
        uint256 totalLocked; // sum of unrefunded lock amounts in the current race
        uint256 totalDrawn;
        uint256 totalRepaid;
    }

    /// @notice The settlement token. Fixed at deploy so it cannot be swapped under a live facility.
    IERC20 public immutable settlementToken;

    /// @notice Minimum race window. A race that could close instantly is not a race.
    uint256 public constant MIN_RACE_WINDOW = 2 minutes;

    /// @notice How long the obligor has to draw after the race closes.
    ///
    /// @dev Without this, winning capital is stranded forever if the obligor simply walks away:
    /// it is allocated, so it cannot be refunded, and it is never drawn, so it does nothing. An
    /// obligor who never draws must not be able to hold a financier's capital hostage, and no
    /// keeper on the Creditcoin side can release Sepolia escrow (readability is one-directional).
    /// So the vault expires the facility itself.
    uint256 public constant DRAW_WINDOW = 7 days;

    mapping(bytes32 => Collateral) public collateral;
    /// @dev collateralId => raceNonce => locks
    mapping(bytes32 => mapping(uint64 => Lock[])) private _locks;

    event CollateralRegistered(bytes32 indexed collateralId, address indexed obligor);
    event RaceOpened(
        bytes32 indexed collateralId, uint64 indexed raceNonce, uint256 facilitySize, uint256 deadline
    );
    event RaceClosed(bytes32 indexed collateralId, uint64 indexed raceNonce, uint64 lockCount, uint256 totalLocked);

    /// @notice The event `AttestationGate` decodes on Creditcoin.
    /// @dev Carries `token` so the Creditcoin side never infers denomination or decimals, and
    /// `raceNonce`/`seq` so the gate can prove the submitted lock set is complete. `blockNumber` is
    /// included for human cross-checking; the gate trusts the precompile's height, not this field.
    event Lock_(
        bytes32 indexed collateralId,
        address indexed financier,
        uint8 tranche,
        uint256 amount,
        address token,
        uint64 raceNonce,
        uint64 seq,
        uint64 blockNumber
    );

    event Draw(bytes32 indexed collateralId, address indexed obligor, uint256 amount);
    event Repayment(bytes32 indexed collateralId, address indexed obligor, uint256 amount, address token);
    event Refund(bytes32 indexed collateralId, address indexed financier, uint64 seq, uint256 amount);

    error NotObligor();
    error NotRegistered();
    error AlreadyRegistered();
    error RaceNotOpen();
    error RaceStillOpen();
    error RaceAlreadyOpen();
    error ZeroAmount();
    error WindowTooShort();
    error NothingToRefund();
    error OverDraw();
    error NotLockOwner();

    constructor(IERC20 token) {
        require(address(token) != address(0), "vault: zero token");
        settlementToken = token;
    }

    modifier onlyObligor(bytes32 collateralId) {
        if (collateral[collateralId].obligor != msg.sender) revert NotObligor();
        _;
    }

    // ─────────────────────────────── registration ───────────────────────────────

    /// @notice Claim a collateral id on this vault. Permissionless first-come: the binding gate is
    /// document-hash uniqueness in `CollateralRegistry` on Creditcoin, not this call.
    function registerCollateral(bytes32 collateralId) external {
        Collateral storage c = collateral[collateralId];
        if (c.registered) revert AlreadyRegistered();
        c.registered = true;
        c.obligor = msg.sender;
        emit CollateralRegistered(collateralId, msg.sender);
    }

    // ─────────────────────────────── the race ───────────────────────────────

    /// @notice Open a financing race and reset the per-race lock counter.
    /// @dev A collateral is either clear or encumbered, so only one race may be open at a time.
    /// Bumping `raceNonce` here is what lets the gate require `seq` to start at 1 without that
    /// requirement breaking on a second financing round.
    function openRace(bytes32 collateralId, uint256 facilitySize, uint256 window)
        external
        onlyObligor(collateralId)
    {
        Collateral storage c = collateral[collateralId];
        if (!c.registered) revert NotRegistered();
        if (c.raceOpen) revert RaceAlreadyOpen();
        if (facilitySize == 0) revert ZeroAmount();
        if (window < MIN_RACE_WINDOW) revert WindowTooShort();

        c.raceNonce += 1;
        c.raceOpen = true;
        c.lockCount = 0;
        c.facilitySize = facilitySize;
        c.raceDeadline = block.timestamp + window;
        c.totalLocked = 0;
        c.totalDrawn = 0;

        emit RaceOpened(collateralId, c.raceNonce, facilitySize, c.raceDeadline);
    }

    /// @notice Escrow capital against collateral, declaring a tranche preference.
    /// @dev The tranche is a PREFERENCE. Proven `(blockHeight, txIndex)` ordering decides who
    /// actually gets it, and a bid that loses its declared tranche is refunded rather than demoted.
    function lock(bytes32 collateralId, Tranche tranche, uint256 amount) external nonReentrant {
        Collateral storage c = collateral[collateralId];
        if (!c.registered) revert NotRegistered();
        if (!c.raceOpen || block.timestamp > c.raceDeadline) revert RaceNotOpen();
        if (amount == 0) revert ZeroAmount();

        settlementToken.safeTransferFrom(msg.sender, address(this), amount);

        c.lockCount += 1;
        c.totalLocked += amount;
        uint64 seq = c.lockCount;

        _locks[collateralId][c.raceNonce].push(
            Lock({
                financier: msg.sender,
                tranche: tranche,
                amount: amount,
                refunded: 0,
                raceNonce: c.raceNonce,
                seq: seq,
                blockNumber: uint64(block.number)
            })
        );

        emit Lock_(
            collateralId,
            msg.sender,
            uint8(tranche),
            amount,
            address(settlementToken),
            c.raceNonce,
            seq,
            uint64(block.number)
        );
    }

    /// @notice Close the race. The obligor may close early; anyone may close after the deadline, so
    /// a silent obligor cannot strand locked capital.
    function closeRace(bytes32 collateralId) external {
        Collateral storage c = collateral[collateralId];
        if (!c.raceOpen) revert RaceNotOpen();
        if (msg.sender != c.obligor && block.timestamp <= c.raceDeadline) revert RaceStillOpen();

        c.raceOpen = false;
        c.drawDeadline = block.timestamp + DRAW_WINDOW;
        emit RaceClosed(collateralId, c.raceNonce, c.lockCount, c.totalLocked);
    }

    // ─────────────────────────────── allocation ───────────────────────────────

    /// @notice How much of lock `index` is allocated to the facility.
    ///
    /// @dev Locks fill the facility in `seq` order until `facilitySize` is reached; the lock that
    /// crosses the boundary is partially allocated, and everything after it is fully refundable.
    /// Creditcoin applies this same rule to the same data, which is how both chains agree on the
    /// allocated set with no message passing between them.
    function allocatedAmount(bytes32 collateralId, uint256 index) public view returns (uint256) {
        Collateral storage c = collateral[collateralId];
        Lock[] storage ls = _locks[collateralId][c.raceNonce];
        if (index >= ls.length) return 0;

        uint256 cumulative;
        for (uint256 i = 0; i < index; ++i) {
            cumulative += ls[i].amount;
        }
        if (cumulative >= c.facilitySize) return 0;

        uint256 headroom = c.facilitySize - cumulative;
        return headroom >= ls[index].amount ? ls[index].amount : headroom;
    }

    /// @notice Total capital actually allocated to the facility, i.e. the obligor's draw ceiling.
    function totalAllocated(bytes32 collateralId) public view returns (uint256) {
        Collateral storage c = collateral[collateralId];
        uint256 n = _locks[collateralId][c.raceNonce].length;
        uint256 sum;
        for (uint256 i = 0; i < n; ++i) {
            sum += allocatedAmount(collateralId, i);
        }
        return sum;
    }

    /// @notice True when the obligor let the draw window lapse without drawing anything.
    /// @dev An abandoned facility releases ALL locked capital, allocated or not. Without this an
    /// obligor could open a race, let it settle, and then simply never draw — trapping the winners'
    /// capital indefinitely, which is a worse outcome for a lender than losing the race.
    function isAbandoned(bytes32 collateralId) public view returns (bool) {
        Collateral storage c = collateral[collateralId];
        return !c.raceOpen && c.drawDeadline != 0 && c.totalDrawn == 0 && block.timestamp > c.drawDeadline;
    }

    /// @notice Reclaim capital once the race has closed.
    ///
    /// @dev Normally returns only the UNALLOCATED portion: outpaced capital comes back, and it is
    /// returned rather than demoted, because a financier who bid SENIOR never consented to
    /// subordinate risk. If the facility was abandoned, the full remaining balance is returned.
    function refund(bytes32 collateralId, uint256 index) external nonReentrant {
        Collateral storage c = collateral[collateralId];
        if (c.raceOpen) revert RaceStillOpen();

        Lock storage l = _locks[collateralId][c.raceNonce][index];
        if (l.financier != msg.sender) revert NotLockOwner();

        uint256 allocated = isAbandoned(collateralId) ? 0 : allocatedAmount(collateralId, index);
        uint256 owed = l.amount - allocated - l.refunded;
        if (owed == 0) revert NothingToRefund();

        l.refunded += owed;
        c.totalLocked -= owed;
        settlementToken.safeTransfer(msg.sender, owed);

        emit Refund(collateralId, msg.sender, l.seq, owed);
    }

    // ─────────────────────────────── servicing ───────────────────────────────

    /// @notice Draw allocated capital. Only after the race closes, and never beyond the allocation.
    function draw(bytes32 collateralId, uint256 amount) external nonReentrant onlyObligor(collateralId) {
        Collateral storage c = collateral[collateralId];
        if (c.raceOpen) revert RaceStillOpen();
        if (amount == 0) revert ZeroAmount();
        if (c.totalDrawn + amount > totalAllocated(collateralId)) revert OverDraw();

        c.totalDrawn += amount;
        settlementToken.safeTransfer(msg.sender, amount);
        emit Draw(collateralId, msg.sender, amount);
    }

    /// @notice Repay. The amount is decoded from THIS transaction on Creditcoin, so the waterfall
    /// runs on a proven figure rather than an asserted one.
    function repay(bytes32 collateralId, uint256 amount) external nonReentrant {
        Collateral storage c = collateral[collateralId];
        if (!c.registered) revert NotRegistered();
        if (amount == 0) revert ZeroAmount();

        settlementToken.safeTransferFrom(msg.sender, address(this), amount);
        c.totalRepaid += amount;

        emit Repayment(collateralId, msg.sender, amount, address(settlementToken));
    }

    // ─────────────────────────────── views ───────────────────────────────

    /// @notice Whole-struct getter. Preferred over the auto-generated positional accessor: callers
    /// that destructure by position break silently when a field is added.
    function getCollateral(bytes32 collateralId) external view returns (Collateral memory) {
        return collateral[collateralId];
    }

    function lockCountOf(bytes32 collateralId) external view returns (uint256) {
        return _locks[collateralId][collateral[collateralId].raceNonce].length;
    }

    function lockAt(bytes32 collateralId, uint256 index) external view returns (Lock memory) {
        return _locks[collateralId][collateral[collateralId].raceNonce][index];
    }

    function lockAtRace(bytes32 collateralId, uint64 raceNonce, uint256 index)
        external
        view
        returns (Lock memory)
    {
        return _locks[collateralId][raceNonce][index];
    }

    /// @notice The event signature `AttestationGate` filters on. Exposed so deployment scripts and
    /// tests cannot drift from the actual event.
    function lockEventSignature() external pure returns (bytes32) {
        return keccak256("Lock_(bytes32,address,uint8,uint256,address,uint64,uint64,uint64)");
    }

    function repaymentEventSignature() external pure returns (bytes32) {
        return keccak256("Repayment(bytes32,address,uint256,address)");
    }
}

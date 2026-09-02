// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PrecedenceTypes as T} from "./PrecedenceTypes.sol";

/// @title CollateralRegistry — the self-populating encumbrance registry (Creditcoin CC3)
///
/// @notice Real-world collateral registered as a hash-unique NFT, with its live encumbrance state.
/// The registry is not a product anyone joins: it fills up as a by-product of financing, which is
/// what removes the cold-start problem that killed every trade-finance consortium.
///
/// @dev Two things here carry weight beyond bookkeeping.
///
/// **`vaultOf` is the trust anchor for the whole security model.** `AttestationGate` binds every
/// proof to the vault registered here. Without that binding, a genuine Attestcoin proof of a
/// look-alike contract's Lock event would win priority — the reference `ASCBase` never records
/// which contract emitted a verified transaction.
///
/// **What hash-uniqueness does and does not do.** It makes it impossible to register the same
/// document identifier twice, so a registered claim cannot be double-financed. It cannot detect a
/// custodian issuing two receipts for one physical lot. Ordering is not authenticity, and that
/// limit is stated here rather than left for someone to discover.
contract CollateralRegistry is ERC721, Ownable {
    enum AssetType {
        WAREHOUSE_RECEIPT,
        TRADE_RECEIVABLE,
        COMMODITY_PLEDGE
    }

    struct Collateral {
        bool exists;
        address obligor;
        AssetType assetType;
        uint256 faceValue;
        uint16 haircutBps;
        uint32 termDays;
        address custodian;
        /// @dev The source-chain vault every proof for this collateral must bind to.
        address vault;
        T.EncumbranceState state;
        uint32 activeLiens;
        uint256 tokenId;
        string metadataURI;
    }

    /**
     * @notice Facility terms, posted by the OBLIGOR when they open a facility.
     *
     * @dev The borrower publishes what they will pay for each tranche and how large each tranche
     * is; lenders read these before deciding whether to lock. This is what keeps the Attestcoin
     * ordering load-bearing: because the rate is fixed by the borrower rather than bid by lenders,
     * price competition cannot decide who gets a tranche — proven `(blockHeight, txIndex)` ordering
     * does. If lenders bid rates instead, ordering would degrade to a tiebreak for rate ties.
     */
    struct FacilityTerms {
        bool set;
        uint256 seniorCap;
        uint256 juniorCap;
        uint256 subordinateCap;
        uint16 seniorRateBps;
        uint16 juniorRateBps;
        uint16 subordinateRateBps;
        uint32 termDays;
    }

    /// @notice collateralId == the document hash. One document, one id, one registration.
    mapping(bytes32 => Collateral) private _collateral;
    mapping(bytes32 => FacilityTerms) private _terms;
    mapping(uint256 => bytes32) public collateralIdOfToken;

    /// @notice Contracts allowed to move encumbrance state (PriorityEngine, RefinanceEngine).
    mapping(address => bool) public isStateWriter;

    uint256 private _nextTokenId = 1;

    event CollateralRegistered(
        bytes32 indexed collateralId,
        uint256 indexed tokenId,
        address indexed obligor,
        AssetType assetType,
        uint256 faceValue,
        address vault
    );
    event EncumbranceChanged(bytes32 indexed collateralId, T.EncumbranceState from, T.EncumbranceState to);
    event StateWriterSet(address indexed writer, bool allowed);
    event VaultUpdated(bytes32 indexed collateralId, address oldVault, address newVault);
    event FacilityTermsPosted(
        bytes32 indexed collateralId,
        uint256 seniorCap,
        uint256 juniorCap,
        uint256 subordinateCap,
        uint16 seniorRateBps,
        uint16 juniorRateBps,
        uint16 subordinateRateBps,
        uint32 termDays
    );

    error AlreadyRegistered(bytes32 collateralId);
    error UnknownCollateral(bytes32 collateralId);
    error NotStateWriter();
    error NotObligor();
    error ZeroVault();
    error VaultLockedWhileEncumbered();
    error InvalidHaircut();
    error TermsNotSet(bytes32 collateralId);
    error TermsLockedWhileEncumbered();
    error CapsExceedAdvance(uint256 total, uint256 maxAdvance);
    error RatesNotOrdinal(uint16 senior, uint16 junior, uint16 subordinate);
    error RateTooHigh(uint16 bps);
    error ZeroFacility();

    constructor(address initialOwner) ERC721("PRECEDENCE Collateral", "PCOL") Ownable(initialOwner) {}

    modifier onlyStateWriter() {
        if (!isStateWriter[msg.sender]) revert NotStateWriter();
        _;
    }

    function setStateWriter(address writer, bool allowed) external onlyOwner {
        isStateWriter[writer] = allowed;
        emit StateWriterSet(writer, allowed);
    }

    // ─────────────────────────────── registration ───────────────────────────────

    /// @notice Register collateral. `docHash` IS the collateral id, so uniqueness is structural
    /// rather than checked in a second place that could drift.
    function registerCollateral(
        bytes32 docHash,
        AssetType assetType,
        uint256 faceValue,
        uint16 haircutBps,
        uint32 termDays,
        address custodian,
        address vault,
        string calldata metadataURI
    ) external returns (uint256 tokenId) {
        if (_collateral[docHash].exists) revert AlreadyRegistered(docHash);
        if (vault == address(0)) revert ZeroVault();
        if (haircutBps > 10_000) revert InvalidHaircut();

        tokenId = _nextTokenId++;

        _collateral[docHash] = Collateral({
            exists: true,
            obligor: msg.sender,
            assetType: assetType,
            faceValue: faceValue,
            haircutBps: haircutBps,
            termDays: termDays,
            custodian: custodian,
            vault: vault,
            state: T.EncumbranceState.CLEAR,
            activeLiens: 0,
            tokenId: tokenId,
            metadataURI: metadataURI
        });
        collateralIdOfToken[tokenId] = docHash;

        _safeMint(msg.sender, tokenId);

        emit CollateralRegistered(docHash, tokenId, msg.sender, assetType, faceValue, vault);
        emit EncumbranceChanged(docHash, T.EncumbranceState.CLEAR, T.EncumbranceState.CLEAR);
    }

    // ─────────────────────────────── the trust anchor ───────────────────────────────

    /// @notice The source-chain vault every proof for this collateral MUST have been emitted by.
    /// @dev `AttestationGate` calls this on every settlement. See the contract-level note.
    function vaultOf(bytes32 collateralId) external view returns (address) {
        Collateral storage c = _collateral[collateralId];
        if (!c.exists) revert UnknownCollateral(collateralId);
        return c.vault;
    }

    /// @notice Repoint the vault — only while nothing is encumbered.
    /// @dev Deliberately impossible mid-facility. Swapping the vault under a live lien would
    /// invalidate the binding that existing claims were settled against.
    function updateVault(bytes32 collateralId, address newVault) external {
        Collateral storage c = _collateral[collateralId];
        if (!c.exists) revert UnknownCollateral(collateralId);
        if (c.obligor != msg.sender) revert NotObligor();
        if (newVault == address(0)) revert ZeroVault();
        if (c.state != T.EncumbranceState.CLEAR) revert VaultLockedWhileEncumbered();

        address old = c.vault;
        c.vault = newVault;
        emit VaultUpdated(collateralId, old, newVault);
    }

    // ─────────────────────────────── encumbrance state ───────────────────────────────

    function setState(bytes32 collateralId, T.EncumbranceState next) external onlyStateWriter {
        Collateral storage c = _collateral[collateralId];
        if (!c.exists) revert UnknownCollateral(collateralId);
        T.EncumbranceState prev = c.state;
        c.state = next;
        emit EncumbranceChanged(collateralId, prev, next);
    }

    function setActiveLiens(bytes32 collateralId, uint32 count) external onlyStateWriter {
        Collateral storage c = _collateral[collateralId];
        if (!c.exists) revert UnknownCollateral(collateralId);
        c.activeLiens = count;
    }

    // ─────────────────────────────── views ───────────────────────────────

    function getCollateral(bytes32 collateralId) external view returns (Collateral memory) {
        Collateral storage c = _collateral[collateralId];
        if (!c.exists) revert UnknownCollateral(collateralId);
        return c;
    }

    function getEncumbrance(bytes32 collateralId)
        external
        view
        returns (T.EncumbranceState state, uint32 activeLiens)
    {
        Collateral storage c = _collateral[collateralId];
        if (!c.exists) revert UnknownCollateral(collateralId);
        return (c.state, c.activeLiens);
    }

    /// @notice Zero liens recorded — the clear-title check a financier runs before racing.
    function isClearTitle(bytes32 collateralId) external view returns (bool) {
        Collateral storage c = _collateral[collateralId];
        return c.exists && c.state == T.EncumbranceState.CLEAR && c.activeLiens == 0;
    }

    // ─────────────────────────────── facility terms ───────────────────────────────

    /// @notice Maximum the obligor may borrow: face value less the haircut.
    function maxAdvanceOf(bytes32 collateralId) public view returns (uint256) {
        Collateral storage c = _collateral[collateralId];
        if (!c.exists) revert UnknownCollateral(collateralId);
        return (c.faceValue * (10_000 - c.haircutBps)) / 10_000;
    }

    /**
     * @notice Post the facility terms. Only the obligor, and only while nothing is encumbered.
     *
     * @dev Two invariants worth stating, because both encode something real:
     *
     *  1. **Rates must be ordinal**: senior <= junior <= subordinate. A senior tranche paying MORE
     *     than a subordinate one is incoherent — senior is paid first and is protected by the
     *     tranches beneath it, so it must be the cheapest capital. Enforcing it structurally means
     *     the risk/return relationship cannot be misconfigured into nonsense.
     *
     *  2. **Caps cannot exceed the haircut-adjusted advance.** The haircut is the lenders'
     *     protection; letting the obligor size the facility past it would quietly remove it.
     *
     * Terms are frozen once anything is encumbered: lenders locked capital against these numbers,
     * and changing the coupon under a live lien would rewrite the deal they agreed to.
     */
    function postFacilityTerms(
        bytes32 collateralId,
        uint256 seniorCap,
        uint256 juniorCap,
        uint256 subordinateCap,
        uint16 seniorRateBps,
        uint16 juniorRateBps,
        uint16 subordinateRateBps
    ) external {
        Collateral storage c = _collateral[collateralId];
        if (!c.exists) revert UnknownCollateral(collateralId);
        if (c.obligor != msg.sender) revert NotObligor();
        if (c.state != T.EncumbranceState.CLEAR) revert TermsLockedWhileEncumbered();

        uint256 total = seniorCap + juniorCap + subordinateCap;
        if (total == 0) revert ZeroFacility();

        uint256 advance = maxAdvanceOf(collateralId);
        if (total > advance) revert CapsExceedAdvance(total, advance);

        // Senior is protected by everything below it, so it must be the cheapest capital.
        if (!(seniorRateBps <= juniorRateBps && juniorRateBps <= subordinateRateBps)) {
            revert RatesNotOrdinal(seniorRateBps, juniorRateBps, subordinateRateBps);
        }
        if (subordinateRateBps > 10_000) revert RateTooHigh(subordinateRateBps);

        _terms[collateralId] = FacilityTerms({
            set: true,
            seniorCap: seniorCap,
            juniorCap: juniorCap,
            subordinateCap: subordinateCap,
            seniorRateBps: seniorRateBps,
            juniorRateBps: juniorRateBps,
            subordinateRateBps: subordinateRateBps,
            termDays: c.termDays
        });

        emit FacilityTermsPosted(
            collateralId,
            seniorCap,
            juniorCap,
            subordinateCap,
            seniorRateBps,
            juniorRateBps,
            subordinateRateBps,
            c.termDays
        );
    }

    function facilityTerms(bytes32 collateralId) external view returns (FacilityTerms memory) {
        FacilityTerms memory t = _terms[collateralId];
        if (!t.set) revert TermsNotSet(collateralId);
        return t;
    }

    function hasFacilityTerms(bytes32 collateralId) external view returns (bool) {
        return _terms[collateralId].set;
    }

    /// @notice Per-tranche capacity, as the obligor posted it.
    /// @dev The Sepolia vault fills the facility in `seq` order against the same total, which is
    /// how both chains agree on the allocated set without any message between them.
    function facilitySizing(bytes32 collateralId)
        external
        view
        returns (T.TrancheSizing memory sizing, uint256 maxAdvance)
    {
        FacilityTerms memory t = _terms[collateralId];
        if (!t.set) revert TermsNotSet(collateralId);
        sizing.senior = t.seniorCap;
        sizing.junior = t.juniorCap;
        sizing.subordinate = t.subordinateCap;
        maxAdvance = maxAdvanceOf(collateralId);
    }

    /// @notice The coupons the obligor posted, indexed by rank - 1 (0 = SENIOR).
    function rateBpsOf(bytes32 collateralId) external view returns (uint256[3] memory rates) {
        FacilityTerms memory t = _terms[collateralId];
        if (!t.set) revert TermsNotSet(collateralId);
        rates[0] = t.seniorRateBps;
        rates[1] = t.juniorRateBps;
        rates[2] = t.subordinateRateBps;
    }

    function exists(bytes32 collateralId) external view returns (bool) {
        return _collateral[collateralId].exists;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _collateral[collateralIdOfToken[tokenId]].metadataURI;
    }
}

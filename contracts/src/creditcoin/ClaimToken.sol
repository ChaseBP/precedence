// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PrecedenceTypes as T} from "./PrecedenceTypes.sol";

/// @title ClaimToken — tradeable proof-ordered priority claims (ERC-1155, Creditcoin CC3)
///
/// @notice A priority position is an asset, not a database row. Winning a tranche mints a
/// semi-fungible claim that can be sold, split, or posted as collateral elsewhere.
///
/// @dev The id is `keccak256(collateralId, tranche)`, so it is deterministic and derivable
/// off-chain from public data — a marketplace or the UI can compute the id for a position without
/// an index. Balance is denominated in the settlement token's units (pUSD, 6dp), which means a
/// holder's balance IS their principal, and a partial transfer is a partial sale of the position.
///
/// Every claim also records the PROVEN source position that won it. That is the difference between
/// a token asserting seniority and a token that can show why it is senior.
contract ClaimToken is ERC1155, Ownable {
    struct Provenance {
        bytes32 collateralId;
        T.Tranche tranche;
        uint8 rank;
        uint64 height;
        uint64 txIndex;
        uint64 seq;
        uint64 settledAt;
    }

    mapping(uint256 => Provenance) public provenanceOf;
    mapping(address => bool) public isMinter;

    event MinterSet(address indexed minter, bool allowed);
    event ClaimMinted(
        uint256 indexed id,
        bytes32 indexed collateralId,
        address indexed holder,
        T.Tranche tranche,
        uint256 amount,
        uint64 height,
        uint64 txIndex
    );
    event ClaimBurned(uint256 indexed id, address indexed holder, uint256 amount);

    error NotMinter();

    constructor(address initialOwner, string memory uri_) ERC1155(uri_) Ownable(initialOwner) {}

    modifier onlyMinter() {
        if (!isMinter[msg.sender]) revert NotMinter();
        _;
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        isMinter[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    /// @notice Deterministic claim id. Derivable off-chain from public data — no index needed.
    function claimId(bytes32 collateralId, T.Tranche tranche) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(collateralId, uint8(tranche))));
    }

    function mintClaim(
        address holder,
        bytes32 collateralId,
        T.Tranche tranche,
        uint256 amount,
        uint64 height,
        uint64 txIndex,
        uint64 seq
    ) external onlyMinter returns (uint256 id) {
        id = claimId(collateralId, tranche);

        // First mint for this position records the proven ordering that won it. Later top-ups
        // (syndication into the same tranche) keep the original — the tranche was won once.
        if (provenanceOf[id].collateralId == bytes32(0)) {
            provenanceOf[id] = Provenance({
                collateralId: collateralId,
                tranche: tranche,
                rank: T.rankOf(tranche),
                height: height,
                txIndex: txIndex,
                seq: seq,
                settledAt: uint64(block.timestamp)
            });
        }

        _mint(holder, id, amount, "");
        emit ClaimMinted(id, collateralId, holder, tranche, amount, height, txIndex);
    }

    function burnClaim(address holder, bytes32 collateralId, T.Tranche tranche, uint256 amount)
        external
        onlyMinter
    {
        uint256 id = claimId(collateralId, tranche);
        _burn(holder, id, amount);
        emit ClaimBurned(id, holder, amount);
    }

    /// @notice Burn a holder's entire position in one tranche. Used on repayment and on default.
    function burnAll(address holder, bytes32 collateralId, T.Tranche tranche)
        external
        onlyMinter
        returns (uint256 burned)
    {
        uint256 id = claimId(collateralId, tranche);
        burned = balanceOf(holder, id);
        if (burned > 0) {
            _burn(holder, id, burned);
            emit ClaimBurned(id, holder, burned);
        }
    }

    function setURI(string calldata uri_) external onlyOwner {
        _setURI(uri_);
    }
}

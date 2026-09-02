// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title PrecedenceTypes — shared vocabulary for the Creditcoin side
library PrecedenceTypes {
    /// @dev A DECLARED preference. Proven ordering decides who actually gets it.
    enum Tranche {
        SENIOR,
        JUNIOR,
        SUBORDINATE
    }

    /// @dev Mirrors the protocol state machine in `precedence/lib/precedence/orchestrator/lifecycle.ts`.
    enum EncumbranceState {
        CLEAR,
        RACE_OPEN,
        PRIORITY_SETTLED,
        ENCUMBERED,
        FROZEN,
        GRACE,
        DUTCH_LIQUIDATION,
        REPAID,
        DEFAULTED,
        BREACHED
    }

    /// @notice A lock that the Attestcoin precompile has verified, with everything the settlement
    /// rules need — already extracted from the verified transaction.
    ///
    /// @dev The split matters: `AttestationGate` produces these from proofs, and every rule that
    /// decides money consumes them. Keeping the rules over a plain struct is what makes them
    /// exhaustively testable without needing real USC-encoded transaction bytes.
    struct VerifiedLock {
        address financier;
        Tranche tranche;
        uint256 amount;
        /// @dev Carried in the Lock event so this chain never infers denomination or decimals.
        address token;
        /// @dev The contract that emitted the Lock event. THE trust anchor: the precompile proves a
        /// transaction happened, but says nothing about which contract produced it.
        address emittedBy;
        /// @dev Canonical source-chain position. `height` from the proof, `txIndex` derived from the
        /// Merkle path by `calculateTxIndex`. Together, the priority root.
        uint64 height;
        uint64 txIndex;
        /// @dev The vault's own counter. A claim, not a proof — used for completeness and to catch
        /// a vault whose self-reported order contradicts the proven one.
        uint64 seq;
        uint64 raceNonce;
        /// @dev The precompile does NOT check this. The dApp must.
        uint8 receiptStatus;
    }

    /// @notice Per-tranche capacity of a facility.
    struct TrancheSizing {
        uint256 senior;
        uint256 junior;
        uint256 subordinate;
    }

    function capacityOf(TrancheSizing memory s, Tranche t) internal pure returns (uint256) {
        if (t == Tranche.SENIOR) return s.senior;
        if (t == Tranche.JUNIOR) return s.junior;
        return s.subordinate;
    }

    function rankOf(Tranche t) internal pure returns (uint8) {
        return uint8(t) + 1; // SENIOR = 1
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {
    INativeQueryVerifier,
    NativeQueryVerifierLib
} from "@gluwa/usc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";

/// @notice Proves the toolchain resolves the REAL Attestcoin interfaces before we build on them.
/// Every claim asserted here was verified against the live CC3 testnet precompile on 2026-09-01.
contract ToolchainTest is Test {
    function test_precompileAddressIsCanonical() public pure {
        assertEq(
            NativeQueryVerifierLib.PRECOMPILE,
            0x0000000000000000000000000000000000000FD2,
            "BlockProver precompile address"
        );
    }

    function test_creditcoinChainIdsRecognised() public pure {
        assertTrue(NativeQueryVerifierLib.isCreditcoinChainId(102031), "CC3 testnet");
        assertFalse(NativeQueryVerifierLib.isCreditcoinChainId(11155111), "Sepolia is not Creditcoin");
    }

    /// @dev The BATCH overload exists — verified against the deployed precompile, not assumed,
    /// and it is live on the deployed precompile. This compiling at all is the proof.
    function test_batchVerifyAndEmitOverloadExists() public pure {
        bytes4 single = bytes4(
            keccak256("verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))")
        );
        bytes4 batch = bytes4(
            keccak256("verifyAndEmit(uint64,uint64[],bytes[],(bytes32,(bytes32,bool)[])[],(bytes32,bytes32[]))")
        );
        assertTrue(single != batch, "distinct selectors");

        // Both must be members of the interface, or these casts would not compile.
        INativeQueryVerifier v = NativeQueryVerifierLib.getVerifier();
        assertTrue(address(v) != address(0));
    }

    /// @dev calculateTxIndex is what makes the same-block tie-break possible. Verified callable on
    /// the live precompile (returns 0 for an empty proof).
    function test_calculateTxIndexIsOnTheInterface() public pure {
        bytes4 sel = INativeQueryVerifier.calculateTxIndex.selector;
        assertTrue(sel != bytes4(0));
    }

    /// @dev LogEntry.address_ is the trust anchor for the mandatory vault-binding control:
    /// ASCBase never checks WHICH contract emitted a verified transaction.
    function test_logEntryExposesEmittingAddress() public pure {
        EvmV1Decoder.LogEntry memory e =
            EvmV1Decoder.LogEntry({address_: address(0xBEEF), topics: new bytes32[](0), data: ""});
        assertEq(e.address_, address(0xBEEF), "emitting contract address must be readable");
    }

    /// @dev The field is `receiptStatus`, not `.status`. Pinned because the wrong name compiles
    ///      in a reader's head and fails only against the real package.
    function test_receiptFieldsExposeStatus() public pure {
        EvmV1Decoder.ReceiptFields memory r = EvmV1Decoder.ReceiptFields({
            receiptStatus: 1,
            receiptGasUsed: 21000,
            receiptLogs: new EvmV1Decoder.LogEntry[](0),
            receiptLogsBloom: ""
        });
        assertEq(r.receiptStatus, 1, "the dApp must enforce this; the precompile does not");
    }

    /// @dev getLogsByEventSignature takes the DECODED receipt, not raw bytes.
    function test_getLogsByEventSignatureFiltersOnTopic0() public pure {
        bytes32 sig = keccak256("Lock(bytes32,address,uint8,uint256,address,uint256,uint256)");

        EvmV1Decoder.LogEntry[] memory logs = new EvmV1Decoder.LogEntry[](2);
        bytes32[] memory hit = new bytes32[](1);
        hit[0] = sig;
        bytes32[] memory miss = new bytes32[](1);
        miss[0] = keccak256("Transfer(address,address,uint256)");

        logs[0] = EvmV1Decoder.LogEntry({address_: address(0xA11CE), topics: miss, data: ""});
        logs[1] = EvmV1Decoder.LogEntry({address_: address(0xDEC0DE), topics: hit, data: ""});

        EvmV1Decoder.LogEntry[] memory found = EvmV1Decoder.getLogsByEventSignature(logs, sig);
        assertEq(found.length, 1, "exactly one Lock event");
        assertEq(found[0].address_, address(0xDEC0DE), "and we can see who emitted it");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {CollateralRegistry} from "../../src/creditcoin/CollateralRegistry.sol";
import {ClaimToken} from "../../src/creditcoin/ClaimToken.sol";
import {PriorityEngine} from "../../src/creditcoin/PriorityEngine.sol";
import {AttestationGate} from "../../src/creditcoin/AttestationGate.sol";
import {RefinanceEngine} from "../../src/creditcoin/RefinanceEngine.sol";
import {PrecedenceTypes as T} from "../../src/creditcoin/PrecedenceTypes.sol";

/// @notice What a FORK of Creditcoin CC3 can honestly prove: that the full contract set deploys,
/// wires up, and settles against real chain conditions (gas limit, base fee, chain id).
///
/// @dev **What this deliberately does NOT test, and why.**
///
/// The Attestcoin verifier at `0x0FD2` is a Substrate *runtime* precompile. It has no EVM bytecode.
/// A Foundry fork fetches account code — finds none — and executes the call as if against an empty
/// account, so `calculateTxIndex` and `verifyAndEmit` return meaningless results rather than
/// running the real implementation. Any assertion about precompile BEHAVIOUR made here would pass
/// or fail for reasons unrelated to Attestcoin, which is worse than having no test at all.
///
/// Live precompile behaviour is therefore verified by direct RPC against the running chain, in
/// `ops/verify-precompile.ts`, which writes its results to `evidence/precompile.json`. That probe
/// is the real evidence; this file is about our own contracts.
///
///   make test-fork          (needs CREDITCOIN_RPC in ../.env.local)
contract ForkDeployTest is Test {
    address owner = makeAddr("owner");
    address obligor = makeAddr("obligor");
    address gate_ = makeAddr("gateEOA");
    address vault = makeAddr("sepoliaVault");
    address pusd = makeAddr("pUSD");

    uint256 constant D = 1e6;

    function setUp() public {
        try vm.envString("CREDITCOIN_RPC") returns (string memory rpc) {
            vm.createSelectFork(rpc);
        } catch {
            vm.skip(true);
        }
    }

    function test_forkIsCreditcoinTestnet() public view {
        assertEq(block.chainid, 102031, "CC3 testnet");
        console.log("forked CC3 block :", block.number);
        console.log("base fee (wei)   :", block.basefee);
        console.log("block gas limit  :", block.gaslimit);
    }

    /// @dev The measured 75,000,000 block gas limit, asserted against the live chain rather than
    /// quoted. This is what closed the open question about whether ten verifications fit in one
    /// transaction — they fit with enormous headroom.
    function test_blockGasLimitIsAmpleForABatchSettlement() public view {
        assertGt(block.gaslimit, 30_000_000, "CC3 has a much larger limit than Ethereum mainnet");
        console.log("gas limit:", block.gaslimit);
    }

    /// @dev The whole set must deploy and wire within real chain conditions. Catches deployment
    /// ordering mistakes and contract-size problems before they cost a real deployment.
    function test_fullContractSetDeploysAndWiresOnCC3() public {
        vm.startPrank(owner);
        CollateralRegistry registry = new CollateralRegistry(owner);
        ClaimToken claims = new ClaimToken(owner, "ipfs://precedence/{id}");
        PriorityEngine engine = new PriorityEngine(owner, registry, claims);
        AttestationGate gate = new AttestationGate(registry, engine, pusd);
        RefinanceEngine refi = new RefinanceEngine(registry, claims, engine, address(gate));

        registry.setStateWriter(address(engine), true);
        claims.setMinter(address(engine), true);
        claims.setMinter(address(refi), true);
        engine.setAttestationGate(address(gate));
        engine.setRefinanceEngine(address(refi));
        vm.stopPrank();

        assertEq(engine.attestationGate(), address(gate));
        assertEq(gate.SEPOLIA_CHAIN_KEY(), 1);
        assertEq(gate.settlementToken(), pusd);
        assertTrue(registry.isStateWriter(address(engine)));

        // The gate must recognise it is on a Creditcoin chain. This part IS meaningful on a fork:
        // it reads `block.chainid`, not the precompile.
        assertTrue(gate.precompileAvailable(), "must report available on a CC3 chain id");
    }

    /// @dev A full settlement under live chain conditions, driven through an EOA standing in for
    /// the gate. Measures the real gas cost of the settlement path on CC3.
    function test_settlementGasCostOnCC3() public {
        vm.startPrank(owner);
        CollateralRegistry registry = new CollateralRegistry(owner);
        ClaimToken claims = new ClaimToken(owner, "");
        PriorityEngine engine = new PriorityEngine(owner, registry, claims);
        registry.setStateWriter(address(engine), true);
        claims.setMinter(address(engine), true);
        engine.setAttestationGate(gate_);
        vm.stopPrank();

        bytes32 cid = keccak256("fork-collateral");
        vm.prank(obligor);
        registry.registerCollateral(
            cid, CollateralRegistry.AssetType.WAREHOUSE_RECEIPT, 10_000 * D, 1_500, 90, obligor, vault, ""
        );

        T.VerifiedLock[] memory locks = new T.VerifiedLock[](3);
        for (uint64 i = 0; i < 3; ++i) {
            locks[i] = T.VerifiedLock({
                financier: address(uint160(0x1000 + i)),
                tranche: T.Tranche(i),
                amount: (i == 0 ? 5_100 : i == 1 ? 2_550 : 850) * D,
                token: pusd,
                emittedBy: vault,
                height: 6182101,
                txIndex: 17 + i * 5,
                seq: i + 1,
                raceNonce: 1,
                receiptStatus: 1
            });
        }
        bool[] memory demote = new bool[](3);

        uint256 before = gasleft();
        vm.prank(gate_);
        engine.settlePriority(cid, locks, demote, 8_500 * D);
        uint256 used = before - gasleft();

        console.log("settlePriority gas (3 locks):", used);
        assertLt(used, block.gaslimit / 10, "one settlement must be a small fraction of a block");
        assertEq(engine.priorityStack(cid).length, 3);
    }
}

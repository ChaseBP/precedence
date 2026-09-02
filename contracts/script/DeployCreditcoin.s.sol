// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {CollateralRegistry} from "../src/creditcoin/CollateralRegistry.sol";
import {ClaimToken} from "../src/creditcoin/ClaimToken.sol";
import {PriorityEngine} from "../src/creditcoin/PriorityEngine.sol";
import {AttestationGate} from "../src/creditcoin/AttestationGate.sol";
import {RefinanceEngine} from "../src/creditcoin/RefinanceEngine.sol";

/// @notice Deploy the Creditcoin CC3 side and wire the permissions.
///
/// @dev Ordering matters: the gate needs the engine, and the engine needs to know the gate, so the
/// gate is deployed after the engine and then registered. The script asserts the precompile is
/// reachable before writing any addresses — deploying a gate onto a chain without `0x0FD2` would
/// produce a contract that compiles, deploys, and can never verify anything.
///
///   make deploy-creditcoin
contract DeployCreditcoin is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_CC3_PK");
        address deployer = vm.addr(pk);
        // The pUSD address on Sepolia, from deployments/sepolia.json.
        address settlementToken = vm.envAddress("SEPOLIA_PUSD_ADDRESS");

        console.log("== PRECEDENCE: Creditcoin CC3 ==");
        console.log("deployer        :", deployer);
        console.log("balance         :", deployer.balance);
        console.log("settlementToken :", settlementToken);
        require(settlementToken != address(0), "SEPOLIA_PUSD_ADDRESS not set - deploy Sepolia first");

        vm.startBroadcast(pk);

        CollateralRegistry registry = new CollateralRegistry(deployer);
        ClaimToken claims = new ClaimToken(deployer, vm.envOr("CLAIM_TOKEN_URI", string("ipfs://precedence/{id}")));
        PriorityEngine engine = new PriorityEngine(deployer, registry, claims);
        AttestationGate gate = new AttestationGate(registry, engine, settlementToken);
        RefinanceEngine refinance = new RefinanceEngine(registry, claims, engine, address(gate));

        // ── wiring ──
        registry.setStateWriter(address(engine), true);
        claims.setMinter(address(engine), true);
        claims.setMinter(address(refinance), true);
        engine.setAttestationGate(address(gate));
        engine.setRefinanceEngine(address(refinance));

        // Seed the keeper bounty pool so the failure branch pays whoever pokes it. The unwind works
        // with an empty pool too — lender protection must never depend on treasury solvency — but a
        // funded pool is what makes the incentive real rather than theoretical.
        engine.fundBountyPool{value: vm.envOr("BOUNTY_POOL_WEI", uint256(50 ether))}();

        vm.stopBroadcast();

        // Fail loudly rather than leaving a gate that can never verify.
        require(gate.precompileAvailable(), "Attestcoin precompile 0x0FD2 not reachable on this chain");

        console.log("CollateralRegistry :", address(registry));
        console.log("ClaimToken         :", address(claims));
        console.log("PriorityEngine     :", address(engine));
        console.log("AttestationGate    :", address(gate));
        console.log("RefinanceEngine    :", address(refinance));
        console.log("bountyPool         :", engine.bountyPool());

        string memory json = string.concat(
            "{\n",
            '  "chainId": 102031,\n',
            '  "deployer": "', vm.toString(deployer), '",\n',
            '  "CollateralRegistry": "', vm.toString(address(registry)), '",\n',
            '  "ClaimToken": "', vm.toString(address(claims)), '",\n',
            '  "PriorityEngine": "', vm.toString(address(engine)), '",\n',
            '  "AttestationGate": "', vm.toString(address(gate)), '",\n',
            '  "RefinanceEngine": "', vm.toString(address(refinance)), '",\n',
            '  "settlementToken": "', vm.toString(settlementToken), '",\n',
            '  "blockProverPrecompile": "0x0000000000000000000000000000000000000FD2",\n',
            '  "chainInfoPrecompile": "0x0000000000000000000000000000000000000fD3",\n',
            '  "sepoliaChainKey": 1,\n',
            '  "deployedAt": ', vm.toString(block.timestamp), "\n",
            "}\n"
        );
        vm.writeFile("deployments/creditcoin.json", json);
        console.log("wrote deployments/creditcoin.json");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {PUSD} from "../src/sepolia/PUSD.sol";
import {PriorityVault} from "../src/sepolia/PriorityVault.sol";

/// @notice Deploy the source-chain side to Ethereum Sepolia.
///
/// @dev Addresses are written to `deployments/sepolia.json` and read from there by the app and the
/// worker. Nothing hand-types an address — a mistyped vault address would silently break the
/// binding that the whole security model rests on, and it would look like a verification failure.
///
///   make deploy-sepolia
contract DeploySepolia is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_SEPOLIA_PK");
        address deployer = vm.addr(pk);

        console.log("== PRECEDENCE: Sepolia ==");
        console.log("deployer:", deployer);
        console.log("balance :", deployer.balance);

        vm.startBroadcast(pk);

        PUSD pusd = new PUSD();
        PriorityVault vault = new PriorityVault(pusd);

        // Seed the demo accounts so a race can be run immediately after deploy. The faucet is
        // permissionless, so this is convenience rather than a privilege.
        address[5] memory roles = [
            vm.envAddress("OBLIGOR_ADDRESS"),
            vm.envAddress("FIN_MERIDIAN_ADDRESS"),
            vm.envAddress("FIN_VECTOR_ADDRESS"),
            vm.envAddress("FIN_NOVUM_ADDRESS"),
            vm.envAddress("FIN_REFINANCER_ADDRESS")
        ];
        for (uint256 i = 0; i < roles.length; ++i) {
            pusd.mintDollars(roles[i], 50_000);
        }

        vm.stopBroadcast();

        console.log("PUSD          :", address(pusd));
        console.log("PriorityVault :", address(vault));

        string memory json = string.concat(
            "{\n",
            '  "chainId": 11155111,\n',
            '  "chainKey": 1,\n',
            '  "deployer": "', vm.toString(deployer), '",\n',
            '  "PUSD": "', vm.toString(address(pusd)), '",\n',
            '  "PriorityVault": "', vm.toString(address(vault)), '",\n',
            '  "lockEventSignature": "', vm.toString(vault.lockEventSignature()), '",\n',
            '  "repaymentEventSignature": "', vm.toString(vault.repaymentEventSignature()), '",\n',
            '  "deployedAt": ', vm.toString(block.timestamp), "\n",
            "}\n"
        );
        vm.writeFile("deployments/sepolia.json", json);
        console.log("wrote deployments/sepolia.json");
    }
}

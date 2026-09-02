/**
 * Creditcoin CC3 & Attestcoin Contract ABIs for PRECEDENCE.
 */
import { parseAbi } from "viem";

export const ATTESTATION_GATE_ABI = parseAbi([
  "function verifyPriorityRace(bytes32 collateralId, uint256 blockHeight, bytes[] calldata encodedTxs, bytes[] calldata merkleProofs, bytes calldata continuityProof) external",
  "function verifyRepayment(bytes32 collateralId, uint256 blockHeight, bytes calldata encodedTx, bytes calldata merkleProof, bytes calldata continuityProof) external",
  "function verifyRefinance(bytes32 collateralId, uint256 oldBlock, bytes calldata oldTx, bytes calldata oldMerkle, uint256 newBlock, bytes calldata newTx, bytes calldata newMerkle, bytes calldata continuityProof) external",
  "event Verified(uint256 indexed chainKey, bytes32 indexed proofHash, bytes32 kind, address submitter)",
]);

export const PRIORITY_ENGINE_ABI = parseAbi([
  "function settlePriority(bytes32 collateralId, tuple(address financier, uint8 tranche, uint256 amount, uint256 lockBlockNumber)[] calldata locks) external",
  "function releaseLien(bytes32 collateralId, uint256 actualRepaid) external",
  "function getPriorityState(bytes32 collateralId) external view returns (uint8 state, address seniorFinancier, address juniorFinancier, uint256 totalLocked)",
  "event PrioritySettled(bytes32 indexed collateralId, address[] winners, uint8[] positions, uint256[] amounts)",
  "event DoublePledgePrevented(bytes32 indexed collateralId, address blockedFinancier, uint256 refundedAmount)",
  "event LienReleased(bytes32 indexed collateralId, uint256 actualRepaid)",
]);

export const COLLATERAL_REGISTRY_ABI = parseAbi([
  "function registerCollateral(bytes32 docHash, uint8 assetType, uint256 faceValue, address custodian, string calldata metadataURI) external returns (uint256 tokenId)",
  "function getEncumbrance(bytes32 collateralId) external view returns (uint8 state, uint256 activeLiensCount)",
  "event CollateralRegistered(uint256 indexed tokenId, bytes32 indexed docHash, address obligor)",
]);

export const REFINANCE_ENGINE_ABI = parseAbi([
  "function executeAtomic(bytes32 collateralId, tuple(uint256 oldBlock, bytes oldTx, bytes oldMerkle, uint256 newBlock, bytes newTx, bytes newMerkle, bytes continuityProof, address oldFinancier, address newFinancier, uint8 newTranche, uint256 newAmount) calldata proof) external",
  "event RefinanceExecuted(bytes32 indexed collateralId, address indexed oldFinancier, address indexed newFinancier, uint256 newAmount)",
]);

export const BLOCK_PROVER_ABI = parseAbi([
  "function verifySingle(uint256 chainKey, uint256 blockHeight, bytes calldata encodedTx, bytes calldata merkleProof, bytes calldata continuityProof) external view returns (bool)",
  "function verifyBatch(uint256 chainKey, uint256 blockHeight, bytes[] calldata encodedTxs, bytes[] calldata merkleProofs, bytes calldata continuityProof) external view returns (bool)",
]);

export const DECODER_ABI = parseAbi([
  "function decode(bytes calldata encodedTx) external view returns (uint8 status, address from, address to, uint256 value, bytes[] memory logs)",
]);

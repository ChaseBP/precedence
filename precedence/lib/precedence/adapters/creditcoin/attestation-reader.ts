/**
 * Read Attestcoin's attestation frontier from the ChainInfo precompile at `0x0FD3`.
 *
 * @remarks This is the number that explains the wait, and the app had no way to show it. A viewer
 * watching PENDING_EVIDENCE for eight minutes was given a measured range and nothing else — no way
 * to tell a settlement that is progressing normally from one that is stuck, which is the single
 * question they actually have. The frontier answers it: attestation is at height H, the source
 * block is at height B, and the distance between them is the whole of the remaining wait.
 *
 * `0x0FD3` is a Substrate runtime precompile, so its method names are snake_case rather than the
 * Solidity convention — `get_latest_attestation_height_and_hash`, not `getLatest…`. Getting that
 * wrong produces an empty return that decodes as zero rather than an error, which reads as "never
 * attested" and is the most misleading possible failure.
 *
 * Read-only, no keys, and deliberately not part of `ChainCreditcoinClient`: this must work when
 * the Creditcoin adapter is in mock mode, because the frontier is a property of the network and
 * not of our configuration.
 */
import { createPublicClient, http, type PublicClient } from "viem";
import { CREDITCOIN_RPC_DEFAULT, getConfig } from "../../config";

/** Attestcoin's chainKey for Ethereum Sepolia. Docs-confirmed; mainnet is 3. */
export const SEPOLIA_CHAIN_KEY = 1n;

const CHAIN_INFO = "0x0000000000000000000000000000000000000fd3" as const;

const CHAIN_INFO_ABI = [
  {
    type: "function",
    name: "get_latest_attestation_height_and_hash",
    stateMutability: "view",
    inputs: [{ name: "chainKey", type: "uint64" }],
    outputs: [
      {
        name: "result",
        type: "tuple",
        components: [
          { name: "height", type: "uint64" },
          { name: "hash", type: "bytes32" },
          { name: "isAttestation", type: "bool" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "get_latest_checkpoint_height_and_hash",
    stateMutability: "view",
    inputs: [{ name: "chainKey", type: "uint64" }],
    outputs: [
      {
        name: "result",
        type: "tuple",
        components: [
          { name: "height", type: "uint64" },
          { name: "hash", type: "bytes32" },
          { name: "isAttestation", type: "bool" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "is_height_attested",
    stateMutability: "view",
    inputs: [
      { name: "chainKey", type: "uint64" },
      { name: "targetHeight", type: "uint64" },
    ],
    outputs: [{ name: "isAttested", type: "bool" }],
  },
] as const;

export interface AttestationFrontier {
  chainKey: number;
  /** The highest source-chain height Attestcoin has attested. */
  attestedHeight: number;
  /** The checkpoint frontier, which trails attestation. Shown because the two are confused. */
  checkpointHeight: number;
}

/**
 * How far attestation has reached, and whether one specific block is inside it.
 *
 * @remarks `is_height_attested` is asked separately rather than inferred from
 * `attestedHeight >= target`. Attestation advances in ten-block batches and the precompile is the
 * authority on what is actually inside one; deriving it from a comparison would be our arithmetic
 * standing in for the chain's answer, and the two are not guaranteed to agree at a boundary.
 */
export class AttestationReader {
  private readonly client: PublicClient;

  constructor(rpcUrl?: string) {
    this.client = createPublicClient({
      transport: http(rpcUrl || getConfig().creditcoinRpc || CREDITCOIN_RPC_DEFAULT),
    });
  }

  async frontier(chainKey: bigint = SEPOLIA_CHAIN_KEY): Promise<AttestationFrontier> {
    const [att, cp] = await Promise.all([
      this.client.readContract({
        address: CHAIN_INFO,
        abi: CHAIN_INFO_ABI,
        functionName: "get_latest_attestation_height_and_hash",
        args: [chainKey],
      }),
      this.client.readContract({
        address: CHAIN_INFO,
        abi: CHAIN_INFO_ABI,
        functionName: "get_latest_checkpoint_height_and_hash",
        args: [chainKey],
      }),
    ]);
    return {
      chainKey: Number(chainKey),
      attestedHeight: Number(att.height),
      checkpointHeight: Number(cp.height),
    };
  }

  async isAttested(height: number, chainKey: bigint = SEPOLIA_CHAIN_KEY): Promise<boolean> {
    return this.client.readContract({
      address: CHAIN_INFO,
      abi: CHAIN_INFO_ABI,
      functionName: "is_height_attested",
      args: [chainKey, BigInt(height)],
    });
  }
}

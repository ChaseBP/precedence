/**
 * Attestcoin's attestation frontier, read from the ChainInfo precompile at `0x0FD3`.
 *
 * @remarks This is the number that explains the wait. A viewer watching a settlement for eight
 * minutes with only a measured range on screen has no way to tell one that is progressing normally
 * from one that is stuck, which is the single question they actually have. The frontier answers it:
 * attestation is at height H, the source block is at height B, and the distance between them is
 * the whole of the remaining wait.
 *
 * `0x0FD3` is a Substrate **runtime** precompile, so its method names are snake_case rather than
 * the Solidity convention — `get_latest_attestation_height_and_hash`, not `getLatest…`. Getting
 * that wrong produces an empty return that decodes as zero rather than an error, which reads as
 * "never attested" and is the most misleading failure available.
 *
 * Read-only and key-free. The frontier is a property of the network rather than of any deployment,
 * so this needs nothing but an RPC URL. The addresses and the chainKey come from
 * {@link ./domain/proof}, which is where every protocol constant lives.
 */
import { createPublicClient, http, type PublicClient } from "viem";
import { ATTESTCOIN_CHAININFO, SEPOLIA_CHAIN_KEY } from "./domain/proof";

/** Creditcoin CC3 testnet — chainId 102031, 15.0s blocks. */
export const CREDITCOIN_CC3_RPC = "https://rpc.cc3-testnet.creditcoin.network";

/** The chainKey as the precompile wants it: a `uint64` argument, so a bigint. */
export const SEPOLIA_CHAIN_KEY_ARG = BigInt(SEPOLIA_CHAIN_KEY);

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
  /** The checkpoint frontier, which trails attestation. Reported because the two get confused. */
  checkpointHeight: number;
}

/**
 * How far attestation has reached, and whether one specific block is inside it.
 *
 * @remarks `is_height_attested` is asked separately rather than inferred from
 * `attestedHeight >= target`. Attestation advances in ten-block batches and the precompile is the
 * authority on what is actually inside one; deriving it from a comparison would put our arithmetic
 * where the chain's answer belongs, and the two are not guaranteed to agree at a boundary.
 */
export class AttestcoinChainInfo {
  private readonly client: PublicClient;

  constructor(rpcUrl: string = CREDITCOIN_CC3_RPC) {
    this.client = createPublicClient({ transport: http(rpcUrl) });
  }

  async frontier(chainKey: bigint = SEPOLIA_CHAIN_KEY_ARG): Promise<AttestationFrontier> {
    const [att, cp] = await Promise.all([
      this.client.readContract({
        address: ATTESTCOIN_CHAININFO,
        abi: CHAIN_INFO_ABI,
        functionName: "get_latest_attestation_height_and_hash",
        args: [chainKey],
      }),
      this.client.readContract({
        address: ATTESTCOIN_CHAININFO,
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

  async isAttested(height: number, chainKey: bigint = SEPOLIA_CHAIN_KEY_ARG): Promise<boolean> {
    return this.client.readContract({
      address: ATTESTCOIN_CHAININFO,
      abi: CHAIN_INFO_ABI,
      functionName: "is_height_attested",
      args: [chainKey, BigInt(height)],
    });
  }
}

/**
 * How many source blocks a target is still waiting for. Never negative.
 *
 * @remarks Provided rather than left to the caller because the obvious subtraction is the one that
 * went wrong in the interface: `targetHeight - attestedHeight` *is* the remaining distance, and
 * clamping it is what stops a progress indicator running backwards once the frontier passes the
 * target.
 */
export function blocksToAttestation(targetHeight: number, frontier: AttestationFrontier): number {
  return Math.max(0, targetHeight - frontier.attestedHeight);
}

/** How far attestation trails the source chain's head. The sawtooth everyone asks about. */
export function attestationLagBlocks(sourceHead: number, frontier: AttestationFrontier): number {
  return sourceHead - frontier.attestedHeight;
}

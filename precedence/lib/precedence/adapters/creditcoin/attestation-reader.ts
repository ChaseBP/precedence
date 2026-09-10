/**
 * Creditcoin reads the app needs before it will start a prover.
 *
 * @remarks The attestation frontier itself moved to `@precedence/sdk`: it is a property of the
 * network rather than of this deployment, and a package that can answer "is this block attested
 * yet" without any of our configuration is more useful than a method on a client.
 *
 * What stays here is what genuinely depends on this deployment — the two readiness checks read
 * OUR deployed registry and engine, so they need `contracts/deployments/creditcoin.json` and
 * cannot be answered by a library.
 *
 * `AttestationReader` remains as the app's entry point so the routes keep one import, and it does
 * nothing but supply the configured RPC to the SDK client. Deliberately not folded into
 * `ChainCreditcoinClient`: the frontier must be readable while the Creditcoin adapter is in mock
 * mode.
 */
import { createPublicClient, http } from "viem";
import {
  AttestcoinChainInfo,
  SEPOLIA_CHAIN_KEY_ARG,
  type AttestationFrontier,
} from "@precedence/sdk";
import type { Hex } from "@precedence/sdk/types";
import { CREDITCOIN_RPC_DEFAULT, getConfig, loadDeployedAddresses } from "../../config";
import { CollateralRegistry_ABI, PriorityEngine_ABI } from "../generated/abis";

/**
 * Attestcoin's chainKey for Ethereum Sepolia, as a `uint64` argument.
 *
 * @remarks Re-exported under the name the routes already use. `domain/proof.ts` holds the same
 * value as a number, for display; this is the one you pass to the precompile.
 */
export const SEPOLIA_CHAIN_KEY = SEPOLIA_CHAIN_KEY_ARG;

export type { AttestationFrontier };

/** The SDK's ChainInfo client, pointed at whichever Creditcoin RPC this deployment is using. */
export class AttestationReader extends AttestcoinChainInfo {
  constructor(rpcUrl?: string) {
    super(rpcUrl || getConfig().creditcoinRpc || CREDITCOIN_RPC_DEFAULT);
  }
}

/**
 * Whether Creditcoin knows this collateral well enough for a proof to settle against it.
 *
 * @remarks A settlement can reach `PROOF_READY` on the strength of Sepolia alone — the locks are
 * real, the block is attested, everything the *proof* needs exists — and then revert with
 * `UnknownCollateral` because the asset was never registered on the Creditcoin registry. The two
 * registrations are separate transactions on separate chains, and only the second one is what the
 * engine settles against.
 *
 * Asked before the prover starts, so a missing registration is a sentence on screen rather than a
 * reverted transaction and a spent fee. Returns the reason, not just a boolean, because "not
 * registered" and "no terms posted" need different actions from different people.
 */
export async function creditcoinReadiness(
  collateralId: Hex,
): Promise<{ ok: true } | { ok: false; why: string }> {
  const registry = loadDeployedAddresses().creditcoin?.CollateralRegistry;
  if (!registry) {
    return {
      ok: false,
      why:
        "No Creditcoin registry is deployed (contracts/deployments/creditcoin.json is missing), " +
        "so there is nothing for a proof to settle against.",
    };
  }
  const client = createPublicClient({
    transport: http(getConfig().creditcoinRpc || CREDITCOIN_RPC_DEFAULT),
  });
  const read = (functionName: "exists" | "hasFacilityTerms") =>
    client.readContract({
      address: registry,
      abi: CollateralRegistry_ABI,
      functionName,
      args: [collateralId],
    }) as Promise<boolean>;

  const [exists, hasTerms] = await Promise.all([read("exists"), read("hasFacilityTerms")]);
  if (!exists) {
    return {
      ok: false,
      why:
        "This asset is not registered on the Creditcoin registry, only on the Sepolia vault. " +
        "Priority settles on Creditcoin, so the obligor has to register it there first — the " +
        "registration wizard signs both.",
    };
  }
  if (!hasTerms) {
    return {
      ok: false,
      why:
        "No facility terms are posted on Creditcoin for this asset, so there are no tranche caps " +
        "to allocate the proven locks into.",
    };
  }
  return { ok: true };
}

/**
 * Whether Creditcoin has already settled this race.
 *
 * @remarks Asked because the app's own record is not the authority. A store reset, a fresh clone
 * or a memory-only run leaves no local settlement while the chain still holds one, and the prover
 * then builds a perfectly valid proof — its own view-only `verify()` returns true — and dies at
 * `estimateGas` with `execution reverted (unknown custom error)`, having spent nothing but
 * explaining nothing either.
 *
 * A non-empty priority stack is the engine's own answer to "is this settled", so it is the thing
 * to ask.
 */
export async function alreadySettledOnCreditcoin(collateralId: Hex): Promise<boolean> {
  const engine = loadDeployedAddresses().creditcoin?.PriorityEngine;
  if (!engine) return false;
  const client = createPublicClient({
    transport: http(getConfig().creditcoinRpc || CREDITCOIN_RPC_DEFAULT),
  });
  try {
    const stack = (await client.readContract({
      address: engine,
      abi: PriorityEngine_ABI,
      functionName: "priorityStack",
      args: [collateralId],
    })) as unknown[];
    return stack.length > 0;
  } catch {
    // A read failure is not evidence of a settlement, and refusing to prove on one would be worse
    // than letting the prover try.
    return false;
  }
}
